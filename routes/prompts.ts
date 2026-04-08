/**
 * Prompt management REST API routes.
 *
 * CRUD for prompt overrides (merged with defaults), backup/restore,
 * preview with variable interpolation, and gold standard management
 * for auto-tuning (list, generate, edit, delete).
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/prompts
 */

import { Router } from 'express';
import { listPrompts, savePrompt, deletePromptOverride, previewPrompt, backupPrompts, restorePrompts, getBackupInfo, DEFAULT_GOLD_STANDARDS } from '../prompts.js';
import { asyncHandler } from '../utils/async-handler.js';
import { generateGoldStandards, getGoldStandards, deleteGoldStandards, listGoldStandardPrompts, updateGoldStandard } from '../core/autotune.js';

const router = Router();

/**
 * GET /prompts — List all prompts (merged defaults + DB overrides)
 * Query params: ?locale=en&category=docs
 */
router.get('/prompts', asyncHandler(async (req, res) => {
    const locale = (req.query.locale as string) || 'en';
    const category = req.query.category as string | undefined;

    let prompts = await listPrompts(locale);

    if (category) {
        prompts = prompts.filter(p => p.category === category);
    }

    res.json(prompts);
}));

// =============================================================================
// BACKUP ENDPOINTS — must be before /:id wildcard
// =============================================================================

/**
 * GET /prompts/backup — Get backup file info
 */
router.get('/prompts/backup', asyncHandler(async (_req, res) => {
    const info = getBackupInfo();
    res.json(info);
}));

/**
 * POST /prompts/backup — Export all DB overrides to data/prompts.bak
 */
router.post('/prompts/backup', asyncHandler(async (_req, res) => {
    const result = await backupPrompts();
    res.json({ success: true, ...result });
}));

/**
 * POST /prompts/restore — Restore overrides from data/prompts.bak
 */
router.post('/prompts/restore', asyncHandler(async (_req, res) => {
    const result = await restorePrompts();
    res.json({ success: true, ...result });
}));

/**
 * GET /prompts/gold-standards — List all prompts with gold standards
 * Must be defined BEFORE /prompts/:id to avoid :id matching 'gold-standards'
 */
router.get('/prompts/gold-standards', asyncHandler(async (_req, res) => {
    const dbPrompts = await listGoldStandardPrompts();

    // Build set of prompt IDs that have defaults
    const defaultIds = new Set(DEFAULT_GOLD_STANDARDS.map(gs => gs.promptId));
    const dbIds = new Set(dbPrompts.map(p => p.prompt_id));

    // Add entries for prompts that have defaults but no DB standards
    const merged: { prompt_id: string; count: number; generated_at: string | null; source?: string }[] = [...dbPrompts];
    for (const pid of defaultIds) {
        if (!dbIds.has(pid)) {
            const count = DEFAULT_GOLD_STANDARDS.filter(gs => gs.promptId === pid).length;
            merged.push({ prompt_id: pid, count, generated_at: null, source: 'default' });
        }
    }

    res.json(merged);
}));

/**
 * GET /prompts/:id — Get a single prompt
 * Query params: ?locale=en
 */
router.get('/prompts/:id', asyncHandler(async (req, res) => {
    const locale = (req.query.locale as string) || 'en';
    const all = await listPrompts(locale);
    const prompt = all.find(p => p.id === req.params.id);

    if (!prompt) {
        return res.status(404).json({ error: `Prompt not found: ${req.params.id}` });
    }

    res.json(prompt);
}));

/**
 * PUT /prompts/:id — Save a prompt override
 * Body: { locale, content, description? }
 */
router.put('/prompts/:id', asyncHandler(async (req, res) => {
    const { locale = 'en', content, description } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'content is required' });
    }

    await savePrompt(req.params.id, locale, content, description);
    res.json({ success: true, id: req.params.id, locale });

    // Fire-and-forget auto-backup
    backupPrompts().catch(err => console.warn(`[prompts] Auto-backup failed: ${err.message}`));

    // Fire-and-forget gold standard generation for tunable prompts
    generateGoldStandards(req.params.id).then(result => {
        if (result.generated > 0) {
            console.log(`[tuning-judge] Generated ${result.generated} gold standards for ${req.params.id}`);
        } else if (result.error) {
            console.warn(`[tuning-judge] ${req.params.id}: ${result.error}`);
        }
    }).catch(err => {
        console.error(`[tuning-judge] Failed to generate gold standards for ${req.params.id}: ${err.message}`);
    });
}));

/**
 * DELETE /prompts/:id — Revert to default
 * Query params: ?locale=en
 */
router.delete('/prompts/:id', asyncHandler(async (req, res) => {
    const locale = (req.query.locale as string) || 'en';
    await deletePromptOverride(req.params.id, locale);
    res.json({ success: true, reverted: true, id: req.params.id, locale });

    // Fire-and-forget auto-backup
    backupPrompts().catch(err => console.warn(`[prompts] Auto-backup failed: ${err.message}`));

    // Regenerate gold standards with the default prompt
    generateGoldStandards(req.params.id).then(result => {
        if (result.generated > 0) {
            console.log(`[tuning-judge] Regenerated ${result.generated} gold standards for ${req.params.id} (reverted to default)`);
        }
    }).catch(err => {
        console.error(`[tuning-judge] Failed to regenerate gold standards for ${req.params.id}: ${err.message}`);
    });
}));

/**
 * POST /prompts/preview — Test interpolation
 * Body: { id, locale?, variables }
 */
router.post('/prompts/preview', asyncHandler(async (req, res) => {
    const { id, locale = 'en', variables = {} } = req.body;

    if (!id) {
        return res.status(400).json({ error: 'id is required' });
    }

    const result = await previewPrompt(id, locale, variables);
    res.json({ id, locale, rendered: result });
}));

// =============================================================================
// GOLD STANDARD ENDPOINTS
// =============================================================================

/**
 * GET /prompts/:id/gold-standards — Get gold standards for a prompt
 */
router.get('/prompts/:id/gold-standards', asyncHandler(async (req, res) => {
    const standards = await getGoldStandards(req.params.id);

    if (standards.length > 0) {
        // Strip embedding blob from response (too large for JSON)
        const cleaned = standards.map(s => ({
            id: s.id,
            prompt_id: s.prompt_id,
            tier: s.tier,
            content: s.content,
            test_input: s.test_input,
            model_used: s.model_used,
            locked: !!s.locked,
            generated_at: s.generated_at,
            has_embedding: !!s.embedding,
            source: 'generated',
        }));
        return res.json(cleaned);
    }

    // No DB standards — return hardcoded defaults if available
    const defaults = DEFAULT_GOLD_STANDARDS.filter(gs => gs.promptId === req.params.id);
    if (defaults.length > 0) {
        const cleaned = defaults.map(gs => ({
            id: `default-${gs.promptId}-t${gs.tier}`,
            prompt_id: gs.promptId,
            tier: gs.tier,
            content: gs.content,
            test_input: null,
            model_used: 'claude-opus-4-6 (default)',
            locked: false,
            generated_at: null,
            has_embedding: false,
            source: 'default',
        }));
        return res.json(cleaned);
    }

    res.json([]);
}));

/**
 * PUT /prompts/:id/gold-standards/:gsId — Edit a gold standard
 * Body: { content?, locked? }
 */
router.put('/prompts/:id/gold-standards/:gsId', asyncHandler(async (req, res) => {
    const { content, locked } = req.body;

    if (content === undefined && locked === undefined) {
        return res.status(400).json({ error: 'content or locked is required' });
    }

    await updateGoldStandard(req.params.gsId, { content, locked });
    res.json({ success: true, id: req.params.gsId });
}));

/**
 * POST /prompts/:id/gold-standards/generate — Manually trigger gold standard generation
 * Returns immediately — generation runs in background. Frontend polls for results.
 */
router.post('/prompts/:id/gold-standards/generate', asyncHandler(async (req, res) => {
    res.json({ success: true, status: 'generating', prompt_id: req.params.id });

    // Fire-and-forget — generation happens in background
    generateGoldStandards(req.params.id).then(result => {
        if (result.generated > 0) {
            console.log(`[tuning-judge] Generated ${result.generated} gold standards for ${req.params.id}`);
        } else {
            console.warn(`[tuning-judge] ${req.params.id}: generated 0 — ${result.error || 'no error returned (check PROMPT_CATEGORY_MAP and TEST_VAR_CONFIGS)'}`);
        }
    }).catch(err => {
        console.error(`[tuning-judge] Failed to generate gold standards for ${req.params.id}: ${err.message}`);
    });
}));

/**
 * DELETE /prompts/:id/gold-standards — Delete gold standards for a prompt
 */
router.delete('/prompts/:id/gold-standards', asyncHandler(async (req, res) => {
    await deleteGoldStandards(req.params.id);
    res.json({ success: true, prompt_id: req.params.id });
}));

export default router;
