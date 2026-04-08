/**
 * PODBIT v0.5 - AUTO-TUNE API
 *
 * Endpoints for subsystem parameter auto-tuning.
 * POST /models/autotune/start    — begin auto-tuning
 * POST /models/autotune/cancel   — cancel running auto-tune
 * GET  /models/autotune/progress — poll current state
 * POST /models/autotune/apply    — apply results to config
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { query } from '../db.js';

const router = Router();

// POST /models/autotune/start
router.post('/models/autotune/start', asyncHandler(async (req, res) => {
    const { startAutoTune, getAutoTuneProgress } = await import('../core/autotune.js');

    const progress = getAutoTuneProgress();
    if (progress.status === 'running') {
        return res.status(409).json({ error: 'Auto-tune already running' });
    }

    const { subsystems, runsPerCombo, maxCombos, convergenceThreshold } = req.body;

    // Start async — don't await completion
    startAutoTune({
        subsystems: subsystems || [],
        runsPerCombo: runsPerCombo || 3,
        maxCombos: maxCombos || 25,
        convergenceThreshold: convergenceThreshold || 0.05,
    }).catch(err => console.error('[autotune] Unhandled error:', err));

    res.json({ ok: true, message: 'Auto-tune started' });
}));

// POST /models/autotune/cancel
router.post('/models/autotune/cancel', asyncHandler(async (_req, res) => {
    const { cancelAutoTune } = await import('../core/autotune.js');
    cancelAutoTune();
    res.json({ ok: true, message: 'Cancel requested' });
}));

// POST /models/autotune/reset — clear completed results so a new job can start
router.post('/models/autotune/reset', asyncHandler(async (_req, res) => {
    const { resetAutoTune } = await import('../core/autotune.js');
    resetAutoTune();
    res.json({ ok: true });
}));

// GET /models/autotune/progress
router.get('/models/autotune/progress', asyncHandler(async (_req, res) => {
    const { getAutoTuneProgress } = await import('../core/autotune.js');
    res.json(getAutoTuneProgress());
}));

// POST /models/autotune/apply
router.post('/models/autotune/apply', asyncHandler(async (req, res) => {
    const { updateConfig } = await import('../config.js');
    const { emitActivity } = await import('../services/event-bus.js');
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes)) {
        return res.status(400).json({ error: 'changes array required' });
    }

    const updates: any = {
        subsystemTemperatures: {} as Record<string, number>,
        subsystemRepeatPenalties: {} as Record<string, number>,
        subsystemTopP: {} as Record<string, number>,
        subsystemMinP: {} as Record<string, number>,
        subsystemTopK: {} as Record<string, number>,
        consultantTemperatures: {} as Record<string, number>,
        consultantRepeatPenalties: {} as Record<string, number>,
        consultantTopP: {} as Record<string, number>,
        consultantMinP: {} as Record<string, number>,
        consultantTopK: {} as Record<string, number>,
    };

    for (const { subsystem, params } of changes) {
        // Consultant results use c: prefix (e.g. "c:voice")
        const isConsultant = subsystem.startsWith('c:');
        const sub = isConsultant ? subsystem.slice(2) : subsystem;
        const tempKey = isConsultant ? 'consultantTemperatures' : 'subsystemTemperatures';
        const rpKey = isConsultant ? 'consultantRepeatPenalties' : 'subsystemRepeatPenalties';
        const topPKey = isConsultant ? 'consultantTopP' : 'subsystemTopP';
        const minPKey = isConsultant ? 'consultantMinP' : 'subsystemMinP';
        const topKKey = isConsultant ? 'consultantTopK' : 'subsystemTopK';

        if (params.temperature != null) updates[tempKey][sub] = params.temperature;
        if (params.repeatPenalty != null) updates[rpKey][sub] = params.repeatPenalty;
        if (params.topP != null) updates[topPKey][sub] = params.topP;
        if (params.minP != null) updates[minPKey][sub] = params.minP;
        if (params.topK != null) updates[topKKey][sub] = params.topK;
    }

    await updateConfig(updates);

    emitActivity('config', 'autotune_applied',
        `Applied auto-tune results for ${changes.length} subsystem(s)`,
        { subsystems: changes.map((c: any) => c.subsystem) },
    );

    // Seed know-thyself + log decisions (fire-and-forget)
    (async () => {
        try {
            const { getAutoTuneProgress } = await import('../core/autotune.js');
            const { seedTuningKnowledge } = await import('../handlers/config-tune/know-thyself.js');
            const progress = getAutoTuneProgress();
            const results = progress.results || [];

            for (const { subsystem, params } of changes) {
                const result = results.find((r: any) => r.subsystem === subsystem);
                if (!result) continue;

                // Format readable param string
                const fmt = (p: any) => `temp=${p.temperature}, topP=${p.topP}, minP=${p.minP}, topK=${p.topK}, repeat=${p.repeatPenalty}`;
                const reason = `[${subsystem}] Score ${(result.currentScore * 100).toFixed(0)}% → ${(result.bestScore * 100).toFixed(0)}% (+${(result.improvement * 100).toFixed(1)}%) testing ${result.testedCombos} combos with ${result.modelName}`;

                // Seed to know-thyself graph
                const seedContent = `Auto-tune result for ${subsystem} using ${result.modelName}: best parameters ${fmt(params)}. ${reason}. Phase: ${result.phase}. Previous params: ${fmt(result.currentParams)}.`;
                await seedTuningKnowledge({
                    content: seedContent,
                    nodeType: 'seed',
                    salience: 0.7,
                    contributor: 'autotune',
                });

                // Log decisions for each changed parameter
                const paramNames = ['temperature', 'topP', 'minP', 'topK', 'repeatPenalty'] as const;
                for (const pName of paramNames) {
                    const oldVal = result.currentParams[pName];
                    const newVal = params[pName];
                    if (newVal == null || oldVal === newVal) continue;
                    await query(
                        `INSERT INTO decisions (entity_type, entity_id, field, old_value, new_value, decided_by_tier, contributor, reason)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        ['autotune', subsystem, pName, String(oldVal), String(newVal), 'system', 'autotune', reason],
                    );
                }
            }
        } catch (e: any) {
            console.error('[autotune] Know-thyself/decision seeding failed:', e.message);
        }
    })();

    res.json({ ok: true, applied: changes.length });
}));

export default router;
