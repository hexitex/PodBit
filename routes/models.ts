/**
 * Model management REST API routes.
 *
 * Handles model registry CRUD, subsystem assignments, provider discovery,
 * health checks, cost tracking, proxy/chat/image settings, API keys,
 * and conversational logging configuration.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/models
 */

import { Router } from 'express';
import { RC } from '../config/constants.js';
import { getApiKeyStatus, setApiKeys } from '../models.js';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// =============================================================================
// MODEL HEALTH / COST
// =============================================================================

router.get('/models/health', asyncHandler(async (req, res) => {
    const { healthCheck } = await import('../models.js');
    const force = req.query.force === 'true';
    const result = await healthCheck(force);
    res.json(result);
}));

router.get('/models/cost', asyncHandler(async (req, res) => {
    const { getCostSummary } = await import('../models.js');
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const subsystem = req.query.subsystem as string | undefined;
    const modelId = req.query.model as string | undefined;
    res.json(await getCostSummary({ days, subsystem, modelId }));
}));

router.get('/models/cost/timeseries', asyncHandler(async (req, res) => {
    const { getCostTimeSeries } = await import('../models.js');
    const granularity = (req.query.granularity as string) || 'day';
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const subsystem = req.query.subsystem as string | undefined;
    const modelId = req.query.model as string | undefined;
    res.json(await getCostTimeSeries({ granularity: granularity as any, days, subsystem, modelId }));
}));

router.get('/models/cost/details', asyncHandler(async (req, res) => {
    const { getCostDetails } = await import('../models.js');
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const subsystem = req.query.subsystem as string | undefined;
    const modelId = req.query.model as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const offset = req.query.offset ? parseInt(req.query.offset as string, 10) : undefined;
    res.json(await getCostDetails({ days, subsystem, modelId, limit, offset }));
}));

router.get('/models/cost/export', asyncHandler(async (req, res) => {
    const { getCostExportRows } = await import('../models.js');
    const days = req.query.days ? parseInt(req.query.days as string, 10) : undefined;
    const subsystem = req.query.subsystem as string | undefined;
    const modelId = req.query.model as string | undefined;
    const rows = await getCostExportRows({ days, subsystem, modelId });

    const headers = ['id', 'subsystem', 'model_id', 'model_name', 'provider',
        'input_tokens', 'output_tokens', 'tool_tokens', 'total_tokens',
        'input_cost', 'output_cost', 'tool_cost', 'total_cost',
        'latency_ms', 'finish_reason', 'created_at'];

    const escapeCsv = (val: any) => {
        if (val == null) return '';
        const s = String(val);
        return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const csv = [headers.join(','), ...rows.map((r: any) => headers.map(h => escapeCsv(r[h])).join(','))].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="podbit-costs-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
}));

router.post('/models/cost/reset', asyncHandler(async (_req, res) => {
    const { resetCostTracker } = await import('../models.js');
    await resetCostTracker();
    res.json({ success: true, message: 'Usage log cleared' });
}));

// =============================================================================
// MODEL DISCOVERY & CONFIGURATION
// =============================================================================

// Discover available models from all providers
router.get('/models/available', async (_req, res) => {
    const results: Record<string, any> = { lmstudio: [], ollama: [] };

    // Try LM Studio (check both LLM_ENDPOINT and LMSTUDIO_ENDPOINT)
    try {
        const lmEndpoint = process.env.LLM_ENDPOINT || process.env.LMSTUDIO_ENDPOINT || 'http://127.0.0.1:1234/v1';
        const response = await fetch(`${lmEndpoint}/models`);
        if (response.ok) {
            const data = await response.json();
            results.lmstudio = data.data?.map((m: any) => ({
                id: m.id,
                name: m.id,
                type: m.id.includes('embed') ? 'embedding' : 'llm'
            })) || [];
        }
    } catch (_err) {
        results.lmstudioError = 'Not running';
    }

    // Try Ollama
    try {
        const ollamaEndpoint = process.env.OLLAMA_ENDPOINT || 'http://127.0.0.1:11434';
        const response = await fetch(`${ollamaEndpoint}/api/tags`);
        if (response.ok) {
            const data = await response.json();
            results.ollama = data.models?.map((m: any) => ({
                id: m.name,
                name: m.name,
                type: m.name.includes('embed') ? 'embedding' : 'llm'
            })) || [];
        }
    } catch (_err) {
        results.ollamaError = 'Not running';
    }

    res.json(results);
});

// Get current model configuration
router.get('/models/config', async (_req, res) => {
    const { getEmbeddingModelName } = await import('../models.js');
    const { getAssignedModel } = await import('../models/assignments.js');
    const assigned = getAssignedModel('embedding');
    res.json({
        embedding: {
            model: getEmbeddingModelName(),
            endpoint: assigned?.endpointUrl || null,
            provider: assigned?.provider || null,
        },
    });
});

// =============================================================================
// MODEL REGISTRY CRUD
// =============================================================================

router.get('/models/registry', asyncHandler(async (_req, res) => {
    const { getRegisteredModels } = await import('../models.js');
    res.json(await getRegisteredModels());
}));

router.post('/models/registry', asyncHandler(async (req, res) => {
    const { registerModel } = await import('../models.js');
    const { name, provider, modelId, tier, endpointUrl, apiKey, enabled, maxTokens, contextSize, costPer1k, inputCostPerMtok, outputCostPerMtok, toolCostPerMtok, sortOrder, maxRetries, retryWindowMinutes, maxConcurrency, requestPauseMs, requestTimeout, rateLimitBackoffMs, noThink, supportsTools } = req.body;
    if (!name || !provider || !modelId) {
        return res.status(400).json({ error: 'name, provider, and modelId are required' });
    }
    const model = await registerModel({
        name,
        provider,
        modelId,
        tier: tier || 'medium',
        endpointUrl: endpointUrl || null,
        apiKey: apiKey || null,
        enabled: enabled !== false,
        maxTokens: maxTokens ?? null,
        contextSize: contextSize ?? null,
        costPer1k: costPer1k ?? 0,
        inputCostPerMtok: inputCostPerMtok ?? 0,
        outputCostPerMtok: outputCostPerMtok ?? 0,
        toolCostPerMtok: toolCostPerMtok ?? 0,
        sortOrder: sortOrder ?? 0,
        maxRetries: maxRetries ?? 3,
        retryWindowMinutes: retryWindowMinutes ?? 2,
        maxConcurrency: maxConcurrency ?? 1,
        requestPauseMs: requestPauseMs ?? 0,
        requestTimeout: requestTimeout ?? 180,
        rateLimitBackoffMs: rateLimitBackoffMs ?? 120000,
        supportsTools: supportsTools === undefined ? null : !!supportsTools,
        noThink: !!noThink,
        thinkingLevel: noThink ? 'off' : null,
    });
    res.status(201).json(model);
}));

router.put('/models/registry/:id', asyncHandler(async (req, res) => {
    const { updateRegisteredModel } = await import('../models.js');
    await updateRegisteredModel(req.params.id, req.body);
    res.json({ ok: true });
}));

router.delete('/models/registry/:id', asyncHandler(async (req, res) => {
    const { deleteRegisteredModel } = await import('../models.js');
    await deleteRegisteredModel(req.params.id);
    res.json({ ok: true });
}));

router.post('/models/registry/:id/health', asyncHandler(async (req, res) => {
    const { systemQuery: dbQuery } = await import('../db.js');
    const { checkModelHealth } = await import('../models.js');
    const rows = await dbQuery('SELECT * FROM model_registry WHERE id = $1', [req.params.id]);
    if (!rows || rows.length === 0) {
        return res.status(404).json({ error: 'Model not found' });
    }
    const m = rows[0];
    try {
        await checkModelHealth(
            { name: m.model_id, provider: m.provider, model: m.model_id, endpoint: m.endpoint_url || undefined, apiKey: m.api_key || undefined }
        );
        res.json({ status: 'ok', name: m.name });
    } catch (err: any) {
        res.json({ status: 'error', name: m.name, message: err.message });
    }
}));

router.post('/models/registry/:id/detect-context', asyncHandler(async (req, res) => {
    const { getRegisteredModels, detectContextSize } = await import('../models.js');
    const models = await getRegisteredModels();
    const model = models.find(m => m.id === req.params.id);
    if (!model) {
        return res.status(404).json({ error: 'Model not found' });
    }
    const detected = await detectContextSize(model);
    if (detected) {
        res.json({ ok: true, contextSize: detected, model: model.name });
    } else {
        res.json({ ok: false, contextSize: null, model: model.name, message: 'Could not detect context size from provider' });
    }
}));

// =============================================================================
// SUBSYSTEM ASSIGNMENTS
// =============================================================================

router.get('/models/assignments', asyncHandler(async (_req, res) => {
    const { getSubsystemAssignments, getNoThinkOverrides, getThinkingLevelOverrides, getConsultantAssignments, getProjectOverrides } = await import('../models.js');
    const assignments = await getSubsystemAssignments();
    const overrides = getNoThinkOverrides();
    const thinkingLevels = getThinkingLevelOverrides();
    const consultants = await getConsultantAssignments();
    const projectOverrides = getProjectOverrides();
    res.json({ assignments, noThinkOverrides: overrides, thinkingLevelOverrides: thinkingLevels, consultants, projectOverrides });
}));

/**
 * Assign a model to a subsystem. Supports noThink/thinkingLevel-only updates (no modelId),
 * full model swaps with optional resetParams (saves outgoing model's tuning to registry,
 * resets params to defaults, restores incoming model's tuning from registry).
 */
router.put('/models/assignments/:subsystem', asyncHandler(async (req, res) => {
    const { setSubsystemAssignment, setSubsystemNoThink, setSubsystemThinking } = await import('../models.js');
    const { isValidSubsystem } = await import('../models/types.js');
    if (!isValidSubsystem(req.params.subsystem)) {
        return res.status(400).json({ error: `Invalid subsystem: ${req.params.subsystem}` });
    }

    // If only updating thinking level (no modelId change)
    if (req.body.modelId === undefined && req.body.thinkingLevel !== undefined) {
        const level = req.body.thinkingLevel || null;
        await setSubsystemThinking(req.params.subsystem as any, level);
        return res.json({ ok: true });
    }

    // Legacy: if only updating noThink (no modelId change), use the dedicated setter
    if (req.body.modelId === undefined && req.body.noThink !== undefined) {
        const noThink = req.body.noThink === null ? null : !!req.body.noThink;
        await setSubsystemNoThink(req.params.subsystem as any, noThink);
        return res.json({ ok: true });
    }

    // Resolve noThink: undefined means "don't change", null means "inherit"
    const noThink = req.body.noThink === undefined ? undefined : (req.body.noThink === null ? null : !!req.body.noThink);

    // Tuning Registry: capture outgoing model BEFORE changing the assignment
    const { getSubsystemAssignments } = await import('../models.js');
    const currentAssignments = await getSubsystemAssignments();
    const outgoing = currentAssignments[req.params.subsystem as keyof typeof currentAssignments];
    const newModelId = req.body.modelId ?? null;

    await setSubsystemAssignment(req.params.subsystem as any, newModelId, noThink);

    let registryRestore: any = null;

    // Reset inference params to defaults when model changes (tuned values are model-specific)
    if (req.body.resetParams && outgoing && newModelId && outgoing.id !== newModelId) {
        // Save outgoing model's config — but only if this is the LAST subsystem using it
        const remainingAssignments = Object.entries(currentAssignments)
            .filter(([sub, m]) => sub !== req.params.subsystem && m?.id === outgoing.id);

        if (remainingAssignments.length === 0) {
            try {
                const { saveToRegistry } = await import('../models/tuning-registry.js');
                const subsystemsAtSave = Object.entries(currentAssignments)
                    .filter(([_, m]) => m?.id === outgoing.id)
                    .map(([sub]) => sub);
                await saveToRegistry(outgoing.id, outgoing.name, outgoing.provider, subsystemsAtSave);
            } catch (err: any) {
                console.warn('[models] Tuning registry save failed (non-fatal):', err.message);
            }
        }

        // Reset to defaults
        const { resetSubsystemParams } = await import('../config.js');
        await resetSubsystemParams(req.params.subsystem);

        // Restore incoming model's config from registry
        try {
            const { restoreFromRegistry } = await import('../models/tuning-registry.js');
            registryRestore = await restoreFromRegistry(newModelId, req.params.subsystem);
        } catch (err: any) {
            console.warn('[models] Tuning registry restore failed (non-fatal):', err.message);
        }
    } else if (req.body.resetParams) {
        const { resetSubsystemParams } = await import('../config.js');
        await resetSubsystemParams(req.params.subsystem);
    }

    res.json({ ok: true, registryRestore });
}));

router.put('/models/assignments/:subsystem/consultant', asyncHandler(async (req, res) => {
    const { setConsultantAssignment } = await import('../models.js');
    const { isValidSubsystem } = await import('../models/types.js');
    if (!isValidSubsystem(req.params.subsystem)) {
        return res.status(400).json({ error: `Invalid subsystem: ${req.params.subsystem}` });
    }
    await setConsultantAssignment(req.params.subsystem as any, req.body.modelId ?? null);
    res.json({ ok: true });
}));

/** Reset ALL project overrides to fall back to system baseline for everything. */
router.delete('/models/assignments/project-overrides', asyncHandler(async (_req, res) => {
    const { resetAllProjectAssignments } = await import('../models.js');
    await resetAllProjectAssignments();
    res.json({ ok: true });
}));

/** Reset a single subsystem's project override to fall back to the system baseline. */
router.delete('/models/assignments/:subsystem/project-override', asyncHandler(async (req, res) => {
    const { resetProjectAssignment } = await import('../models.js');
    const { isValidSubsystem } = await import('../models/types.js');
    if (!isValidSubsystem(req.params.subsystem)) {
        return res.status(400).json({ error: `Invalid subsystem: ${req.params.subsystem}` });
    }
    await resetProjectAssignment(req.params.subsystem as any);
    res.json({ ok: true });
}));

// =============================================================================
// PROXY SETTINGS (stored in settings table)
// =============================================================================

const PROXY_SETTINGS_KEY = 'proxy.config';

/** Default proxy settings. Merged with saved settings on GET; individual fields override on PUT. */
const PROXY_DEFAULTS = {
    knowledgeReserve: RC.validation.knowledgeReserveDefault,
    knowledgeMinReserve: RC.validation.knowledgeMinReserveDefault,
    telegraphicEnabled: false,
    telegraphicAggressiveness: 'medium' as string,
    compressClientPrompt: false,
    defaultModelProfile: 'medium' as string,
    maxKnowledgeNodes: 0, // 0 = use profile default
};

router.get('/models/proxy-settings', asyncHandler(async (_req, res) => {
    const { systemQueryOne: queryOne } = await import('../db.js');
    const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, [PROXY_SETTINGS_KEY]);
    const saved = row ? JSON.parse(row.value) : {};
    res.json({ ...PROXY_DEFAULTS, ...saved });
}));

/**
 * Update proxy settings. Merges provided fields into existing saved settings (does not
 * replace the whole object). Validates ranges for numeric fields and enum membership
 * for string fields before persisting.
 */
router.put('/models/proxy-settings', asyncHandler(async (req, res) => {
    const { systemQuery: query, systemQueryOne: queryOne } = await import('../db.js');
    const {
        knowledgeReserve, knowledgeMinReserve, telegraphicEnabled, telegraphicAggressiveness, compressClientPrompt,
        defaultModelProfile, toolCallingEnabled, toolCallingMode, toolCallingMaxIterations, toolCallingStrategy,
        maxKnowledgeNodes,
    } = req.body;

    // Validate ranges
    const settings: any = {};
    if (knowledgeReserve !== undefined) {
        const v = Number(knowledgeReserve);
        if (v < RC.validation.knowledgeReserveMin || v > RC.validation.knowledgeReserveMax) return res.status(400).json({ error: `knowledgeReserve must be between ${RC.validation.knowledgeReserveMin} and ${RC.validation.knowledgeReserveMax}` });
        settings.knowledgeReserve = v;
    }
    if (knowledgeMinReserve !== undefined) {
        const v = Number(knowledgeMinReserve);
        if (v < RC.validation.knowledgeMinReserveMin || v > RC.validation.knowledgeMinReserveMax) return res.status(400).json({ error: `knowledgeMinReserve must be between ${RC.validation.knowledgeMinReserveMin} and ${RC.validation.knowledgeMinReserveMax}` });
        settings.knowledgeMinReserve = v;
    }
    if (telegraphicEnabled !== undefined) {
        settings.telegraphicEnabled = !!telegraphicEnabled;
    }
    if (compressClientPrompt !== undefined) {
        settings.compressClientPrompt = !!compressClientPrompt;
    }
    if (telegraphicAggressiveness !== undefined) {
        const valid = ['light', 'medium', 'aggressive'];
        if (!valid.includes(telegraphicAggressiveness)) {
            return res.status(400).json({ error: `telegraphicAggressiveness must be one of: ${valid.join(', ')}` });
        }
        settings.telegraphicAggressiveness = telegraphicAggressiveness;
    }
    if (defaultModelProfile !== undefined) {
        const valid = ['micro', 'small', 'medium', 'large', 'xl'];
        if (!valid.includes(defaultModelProfile)) {
            return res.status(400).json({ error: `defaultModelProfile must be one of: ${valid.join(', ')}` });
        }
        settings.defaultModelProfile = defaultModelProfile;
    }
    if (toolCallingEnabled !== undefined) {
        settings.toolCallingEnabled = !!toolCallingEnabled;
    }
    if (toolCallingMode !== undefined) {
        const valid = ['read-only', 'read-write'];
        if (!valid.includes(toolCallingMode)) {
            return res.status(400).json({ error: `toolCallingMode must be one of: ${valid.join(', ')}` });
        }
        settings.toolCallingMode = toolCallingMode;
    }
    if (toolCallingMaxIterations !== undefined) {
        const v = Number(toolCallingMaxIterations);
        if (v < 1 || v > 10) return res.status(400).json({ error: 'toolCallingMaxIterations must be between 1 and 10' });
        settings.toolCallingMaxIterations = v;
    }
    if (toolCallingStrategy !== undefined) {
        const valid = ['complement', 'replace'];
        if (!valid.includes(toolCallingStrategy)) {
            return res.status(400).json({ error: `toolCallingStrategy must be one of: ${valid.join(', ')}` });
        }
        settings.toolCallingStrategy = toolCallingStrategy;
    }
    if (maxKnowledgeNodes !== undefined) {
        const v = Number(maxKnowledgeNodes);
        if (v < 0 || v > 100) return res.status(400).json({ error: 'maxKnowledgeNodes must be between 0 and 100 (0 = use default)' });
        settings.maxKnowledgeNodes = v;
    }

    // Merge with existing
    const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, [PROXY_SETTINGS_KEY]);
    const existing = row ? JSON.parse(row.value) : {};
    const merged = { ...existing, ...settings };

    await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
        [PROXY_SETTINGS_KEY, JSON.stringify(merged)]
    );

    res.json({ ...PROXY_DEFAULTS, ...merged });
}));

// =============================================================================
// CHAT SETTINGS (stored in settings table)
// =============================================================================

const CHAT_SETTINGS_KEY = 'chat.config';

/** Default chat settings for context-engine-integrated GUI chat. 0/empty = use profile defaults. */
const CHAT_DEFAULTS = {
    toolCallingEnabled: false,
    toolCallingMaxIterations: 3,
    toolCallingMode: 'read-write' as string,
    maxKnowledgeNodes: 0, // 0 = use context engine profile default
    modelProfile: '', // '' = use context engine default (medium)
};

router.get('/models/chat-settings', asyncHandler(async (_req, res) => {
    const { queryOne } = await import('../db.js');
    const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, [CHAT_SETTINGS_KEY]);
    res.json(row ? { ...CHAT_DEFAULTS, ...JSON.parse(row.value) } : CHAT_DEFAULTS);
}));

router.put('/models/chat-settings', asyncHandler(async (req, res) => {
    const { query, queryOne } = await import('../db.js');
    const { toolCallingEnabled, toolCallingMaxIterations, toolCallingMode, maxKnowledgeNodes, modelProfile } = req.body;

    const settings: any = {};
    if (toolCallingEnabled !== undefined) settings.toolCallingEnabled = !!toolCallingEnabled;
    if (toolCallingMaxIterations !== undefined) {
        const v = Number(toolCallingMaxIterations);
        if (v < 1 || v > 10) return res.status(400).json({ error: 'toolCallingMaxIterations must be between 1 and 10' });
        settings.toolCallingMaxIterations = v;
    }
    if (toolCallingMode !== undefined) {
        const valid = ['read-only', 'read-write'];
        if (!valid.includes(toolCallingMode)) {
            return res.status(400).json({ error: `toolCallingMode must be one of: ${valid.join(', ')}` });
        }
        settings.toolCallingMode = toolCallingMode;
    }
    if (maxKnowledgeNodes !== undefined) {
        const v = Number(maxKnowledgeNodes);
        if (v < 0 || v > 100) return res.status(400).json({ error: 'maxKnowledgeNodes must be between 0 and 100 (0 = use default)' });
        settings.maxKnowledgeNodes = v;
    }
    if (modelProfile !== undefined) {
        const valid = ['', 'micro', 'small', 'medium', 'large', 'xl'];
        if (!valid.includes(modelProfile)) {
            return res.status(400).json({ error: `modelProfile must be one of: ${valid.join(', ')} (empty = auto)` });
        }
        settings.modelProfile = modelProfile;
    }

    const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, [CHAT_SETTINGS_KEY]);
    const existing = row ? JSON.parse(row.value) : {};
    const merged = { ...existing, ...settings };

    await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
        [CHAT_SETTINGS_KEY, JSON.stringify(merged)]
    );

    res.json({ ...CHAT_DEFAULTS, ...merged });
}));

// =============================================================================
// IMAGE READER SETTINGS (stored in settings table)
// =============================================================================

const IMAGE_SETTINGS_KEY = 'reader_image.config';

/** Default image reader preprocessing settings (resize/quality/format before vision LLM). */
const IMAGE_DEFAULTS = {
    maxDimension: 1024,
    quality: 80,
    format: 'jpeg' as string,
};

router.get('/models/image-settings', asyncHandler(async (_req, res) => {
    const { systemQueryOne: queryOne } = await import('../db.js');
    const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, [IMAGE_SETTINGS_KEY]);
    const saved = row ? JSON.parse(row.value) : {};
    res.json({ ...IMAGE_DEFAULTS, ...saved });
}));

router.put('/models/image-settings', asyncHandler(async (req, res) => {
    const { systemQuery: query, systemQueryOne: queryOne } = await import('../db.js');
    const { maxDimension, quality, format } = req.body;

    const settings: any = {};
    if (maxDimension !== undefined) {
        const v = Number(maxDimension);
        if (v < 256 || v > 4096) return res.status(400).json({ error: 'maxDimension must be between 256 and 4096' });
        settings.maxDimension = v;
    }
    if (quality !== undefined) {
        const v = Number(quality);
        if (v < 10 || v > 100) return res.status(400).json({ error: 'quality must be between 10 and 100' });
        settings.quality = v;
    }
    if (format !== undefined) {
        const valid = ['jpeg', 'webp', 'png'];
        if (!valid.includes(format)) {
            return res.status(400).json({ error: `format must be one of: ${valid.join(', ')}` });
        }
        settings.format = format;
    }

    // Merge with existing
    const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, [IMAGE_SETTINGS_KEY]);
    const existing = row ? JSON.parse(row.value) : {};
    const merged = { ...existing, ...settings };

    await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
        [IMAGE_SETTINGS_KEY, JSON.stringify(merged)]
    );

    res.json({ ...IMAGE_DEFAULTS, ...merged });
}));

// =============================================================================
// API KEYS
// =============================================================================

router.get('/models/api-keys', (_req, res) => {
    res.json(getApiKeyStatus());
});

router.put('/models/api-keys', asyncHandler(async (req, res) => {
    const keys = req.body;
    if (!keys || typeof keys !== 'object') {
        return res.status(400).json({ error: 'Expected an object with provider keys' });
    }
    await setApiKeys(keys);
    res.json({ success: true, status: getApiKeyStatus() });
}));

// =============================================================================
// CONVERSATIONAL LOGGING
// =============================================================================

const CONV_LOGGING_KEY = 'llm.conversational_logging';

router.get('/models/conv-logging', asyncHandler(async (_req, res) => {
    const { isConversationalLogging } = await import('../models.js');
    res.json({ enabled: isConversationalLogging() });
}));

router.put('/models/conv-logging', asyncHandler(async (req, res) => {
    const { systemQuery: query } = await import('../db.js');
    const { setConversationalLogging } = await import('../models.js');
    const enabled = !!req.body.enabled;

    setConversationalLogging(enabled);

    await query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
        [CONV_LOGGING_KEY, JSON.stringify(enabled)]
    );

    res.json({ enabled });
}));

// =============================================================================
// LAB LLM PROXY — local labs call this instead of external LLM APIs directly
// =============================================================================

router.post('/llm/call', asyncHandler(async (req, res) => {
    const { subsystem, messages, prompt, role, options } = req.body;

    if (!subsystem) { res.status(400).json({ error: 'subsystem is required (e.g. "lab:math-lab")' }); return; }

    const { isValidSubsystem } = await import('../models/types.js');
    if (!isValidSubsystem(subsystem)) { res.status(400).json({ error: `Invalid subsystem: ${subsystem}` }); return; }

    const { getAssignedModel, ensureAssignmentsLoaded } = await import('../models/assignments.js');
    await ensureAssignmentsLoaded();
    const isConsultant = role === 'evaluation' || role === 'consultant';
    const assigned = getAssignedModel(subsystem as any);
    if (!assigned) { res.status(503).json({ error: `Subsystem "${subsystem}" has no model assigned` }); return; }

    // Cooldown check — only fast-fail when the model is in a real provider rate-limit
    // backoff. Capacity contention (active >= max) is NOT fast-failed any more: that
    // caused lab callers to starve, because their bounded retry budget (10 × 5s = 50s)
    // is shorter than typical reasoning-model call durations. Instead we let
    // callSubsystemModel acquire a slot via the same FIFO semaphore queue that all
    // in-process callers use — external lab requests now wait their turn instead of
    // being bounced back. The HTTP request's natural lifetime (client abort on timeout
    // or disconnect) bounds the wait, propagated below via abortCtrl.
    const { getModelConcurrencyInfo } = await import('../models/semaphore.js');
    const info = getModelConcurrencyInfo(assigned.id);
    if (info && info.cooldownMs > 0) {
        res.status(429).json({
            error: 'Model is rate-limited',
            retryAfterMs: info.cooldownMs,
            model: assigned.name,
        });
        return;
    }

    // Tie an AbortController to the request lifecycle so that if the lab client
    // disconnects (its own outer timeout fires, or it cancels), we abort the in-flight
    // LLM fetch and release the semaphore slot promptly instead of running to completion
    // for a caller that's no longer listening.
    const abortCtrl = new AbortController();
    const onClose = () => abortCtrl.abort();
    req.on('close', onClose);

    const { callSubsystemModel } = await import('../models/assignments.js');

    try {
        // Build the prompt from either a messages array or a plain prompt string
        let finalPrompt: string;
        if (prompt) {
            finalPrompt = prompt;
        } else if (messages && Array.isArray(messages)) {
            const systemMsgs = messages.filter((m: any) => m.role === 'system').map((m: any) => m.content);
            const userMsgs = messages.filter((m: any) => m.role !== 'system').map((m: any) => m.content);
            finalPrompt = [...systemMsgs, ...userMsgs].join('\n\n');
        } else {
            res.status(400).json({ error: 'Either "prompt" (string) or "messages" (array) is required' }); return;
        }

        let content: string;
        if (isConsultant) {
            const { callConsultantModel } = await import('../models/assignments.js');
            content = await callConsultantModel(subsystem, finalPrompt, {
                temperature: options?.temperature,
                maxTokens: options?.maxTokens,
                jsonSchema: options?.jsonSchema,
                signal: abortCtrl.signal,
            });
        } else {
            content = await callSubsystemModel(subsystem, finalPrompt, {
                temperature: options?.temperature,
                maxTokens: options?.maxTokens,
                jsonSchema: options?.jsonSchema,
                signal: abortCtrl.signal,
            });
        }

        res.json({ content, subsystem, role: isConsultant ? 'consultant' : 'primary' });
    } catch (err: any) {
        // If the client gave up while we were waiting for a slot or while the LLM was
        // running, the abort surfaces here — there's nothing to send back. Log nothing
        // noisy: the slot has already been released by the provider's finally block.
        if (abortCtrl.signal.aborted && !res.headersSent) {
            return; // Express will close the connection
        }
        const status = err.message?.includes('not assigned') || err.message?.includes('Budget exceeded') ? 503 : 500;
        if (!res.headersSent) {
            res.status(status).json({ error: err.message });
        }
    } finally {
        req.off('close', onClose);
    }
}));

export default router;
