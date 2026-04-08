/**
 * PODBIT v0.5 - CONFIG TUNE API
 *
 * LLM-powered parameter tuning suggestions.
 * POST /config/tune  — get AI suggestions for a config section
 * GET  /config/sections — expose section metadata for the frontend
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { callSubsystemModel, getSubsystemAssignments } from '../models.js';
import { getPrompt } from '../prompts.js';
import { getSafeConfig } from '../config.js';
import { SECTION_METADATA } from '../config-sections.js';
import { config as defaultConfig } from '../config/defaults.js';

const router = Router();

/**
 * Call the config_tune subsystem model if assigned, otherwise fall back to compress.
 *
 * @param prompt - The prompt text to send to the LLM
 * @param options - Optional parameters passed to callSubsystemModel (jsonSchema, temperature, etc.)
 * @returns The LLM response text
 */
async function callTuneModel(prompt: string, options: Parameters<typeof callSubsystemModel>[2] = {}): Promise<string> {
    const assignments = await getSubsystemAssignments();
    const subsystem = assignments.config_tune ? 'config_tune' : 'compress';
    return callSubsystemModel(subsystem, prompt, options);
}

/**
 * Get AI-powered tuning suggestions for a config section. Reads current param
 * values, builds a structured LLM prompt with parameter metadata/ranges, parses
 * JSON response, then validates keys (with fuzzy matching) and clamps suggested
 * values to each parameter's min/max/step before returning.
 */
router.post('/config/tune', asyncHandler(async (req, res) => {
    const { sectionId, request } = req.body;

        if (!sectionId || !request) {
            return res.status(400).json({ error: 'sectionId and request are required' });
        }

        const section = SECTION_METADATA[sectionId];
        if (!section) {
            return res.status(400).json({ error: `Unknown section: ${sectionId}` });
        }

        // Read current config values for this section's parameters
        const currentConfig = getSafeConfig() as any;
        const currentValues: Record<string, any> = {};
        for (const param of section.parameters) {
            let val: any = currentConfig;
            for (const part of param.configPath) {
                val = val?.[part];
            }
            currentValues[param.key] = val ?? param.default;
        }

        // Build parameter description for the LLM
        const parametersJson = JSON.stringify(
            section.parameters.map(p => ({
                key: p.key,
                label: p.label,
                description: p.description,
                min: p.min,
                max: p.max,
                step: p.step,
                default: p.default,
            })),
            null,
            2,
        );

        // Build the prompt
        const prompt = await getPrompt('config.tune', {
            sectionTitle: section.title,
            sectionDescription: section.description,
            sectionBehavior: section.behavior,
            parametersJson,
            currentValuesJson: JSON.stringify(currentValues, null, 2),
            userRequest: request,
        });

        // JSON schema for structured output
        const jsonSchema = {
            name: 'config_tune_suggestions',
            schema: {
                type: 'object',
                properties: {
                    suggestions: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                key: { type: 'string' },
                                currentValue: { type: 'number' },
                                suggestedValue: { type: 'number' },
                                explanation: { type: 'string' },
                            },
                            required: ['key', 'currentValue', 'suggestedValue', 'explanation'],
                            additionalProperties: false,
                        },
                    },
                    summary: { type: 'string' },
                },
                required: ['suggestions', 'summary'],
                additionalProperties: false,
            },
        };

        const response = await callTuneModel(prompt, {
            jsonSchema,
            temperature: 0.3,
        });

        // Parse the LLM response
        let parsed: any;
        try {
            parsed = JSON.parse(response);
        } catch {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                return res.status(502).json({ error: 'Failed to parse LLM response' });
            }
        }

        // Validate & enrich: clamp values, resolve keys, attach metadata
        const validKeys = new Set(section.parameters.map(p => p.key));
        const paramMap = Object.fromEntries(section.parameters.map(p => [p.key, p]));

        // Build fuzzy lookup: label→key, configPath leaf→key, lowercase key→key
        const fuzzyKeyMap = new Map<string, string>();
        for (const p of section.parameters) {
            fuzzyKeyMap.set(p.key.toLowerCase(), p.key);
            fuzzyKeyMap.set(p.label.toLowerCase(), p.key);
            const leaf = p.configPath[p.configPath.length - 1];
            if (leaf) fuzzyKeyMap.set(leaf.toLowerCase(), p.key);
        }

        parsed.suggestions = (parsed.suggestions || [])
            .map((s: any) => {
                // Try exact key first, then fuzzy match
                if (!validKeys.has(s.key)) {
                    const resolved = fuzzyKeyMap.get((s.key || '').toLowerCase());
                    if (resolved) s.key = resolved;
                }
                return s;
            })
            .filter((s: any) => validKeys.has(s.key))
            .map((s: any) => {
                const meta = paramMap[s.key];
                // Round to step precision
                const clamped = Math.min(meta.max, Math.max(meta.min, s.suggestedValue));
                const stepPrecision = meta.step.toString().split('.')[1]?.length || 0;
                const rounded = parseFloat(clamped.toFixed(stepPrecision));
                return {
                    ...s,
                    suggestedValue: rounded,
                    label: meta.label,
                    min: meta.min,
                    max: meta.max,
                    step: meta.step,
                    configPath: meta.configPath,
                };
            });

        res.json({
            sectionId,
            sectionTitle: section.title,
            ...parsed,
        });
}));

/**
 * LLM-generate tension pattern pairs. Deduplicates against existing pairs
 * and validates that each result is a [string, string] tuple.
 */
router.post('/config/tune/generate-patterns', asyncHandler(async (req, res) => {
    const { request, count = 10 } = req.body;

        if (!request) {
            return res.status(400).json({ error: 'request is required' });
        }

        // Get existing patterns to avoid duplicates
        const currentConfig = getSafeConfig() as any;
        const existingPairs: [string, string][] = currentConfig.tensions?.patterns || [];
        const existingPairsStr = existingPairs
            .map(([a, b]: [string, string]) => `${a} / ${b}`)
            .join('\n');

        const prompt = await getPrompt('config.generate_patterns', {
            existingPairs: existingPairsStr || '(none)',
            userRequest: request,
            count: String(Math.min(count, 30)),
        });

        const jsonSchema = {
            name: 'tension_patterns',
            schema: {
                type: 'object',
                properties: {
                    pairs: {
                        type: 'array',
                        items: {
                            type: 'array',
                            items: { type: 'string' },
                            minItems: 2,
                            maxItems: 2,
                        },
                    },
                    summary: { type: 'string' },
                },
                required: ['pairs', 'summary'],
                additionalProperties: false,
            },
        };

        const response = await callTuneModel(prompt, {
            jsonSchema,
            temperature: 0.7,
        });

        let parsed: any;
        try {
            parsed = JSON.parse(response);
        } catch {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                return res.status(502).json({ error: 'Failed to parse LLM response' });
            }
        }

        // Validate: ensure pairs are [string, string][], deduplicate against existing
        const existingSet = new Set(
            existingPairs.map(([a, b]: [string, string]) => `${a.toLowerCase()}|${b.toLowerCase()}`)
        );

        const validPairs = (parsed.pairs || [])
            .filter((p: any) =>
                Array.isArray(p) &&
                p.length === 2 &&
                typeof p[0] === 'string' &&
                typeof p[1] === 'string' &&
                p[0].trim() &&
                p[1].trim()
            )
            .map((p: [string, string]) => [p[0].toLowerCase().trim(), p[1].toLowerCase().trim()])
            .filter((p: [string, string]) => !existingSet.has(`${p[0]}|${p[1]}`));

        res.json({
            pairs: validPairs,
            summary: parsed.summary || '',
            existingCount: existingPairs.length,
        });
}));

/**
 * LLM-generate intent detection regex patterns. Deduplicates against existing
 * patterns per intent type and validates each generated pattern compiles as regex.
 */
router.post('/config/tune/generate-intent-patterns', asyncHandler(async (req, res) => {
    const { intentType, request, count = 5 } = req.body;

        if (!request) {
            return res.status(400).json({ error: 'request is required' });
        }

        const validIntents = ['retrieval', 'action', 'diagnosis', 'exploration'];
        if (intentType && !validIntents.includes(intentType)) {
            return res.status(400).json({ error: `Invalid intentType. Must be one of: ${validIntents.join(', ')}` });
        }

        // Get existing patterns to avoid duplicates
        const currentConfig = getSafeConfig() as any;
        const intentPatterns = currentConfig.contextEngine?.intentPatterns || {};

        // Build existing patterns string for the prompt
        const existingPatternsStr = intentType
            ? `${intentType}:\n${(intentPatterns[intentType] || []).map((p: string) => `  - ${p}`).join('\n')}`
            : Object.entries(intentPatterns)
                .map(([type, patterns]) => `${type}:\n${(patterns as string[]).map((p: string) => `  - ${p}`).join('\n')}`)
                .join('\n\n');

        const prompt = await getPrompt('config.generate_intent_patterns', {
            existingPatterns: existingPatternsStr || '(none)',
            intentType: intentType || 'all types',
            userRequest: request,
            count: String(Math.min(count, 20)),
        });

        const jsonSchema = {
            name: 'intent_patterns',
            schema: {
                type: 'object' as const,
                properties: {
                    patterns: {
                        type: 'object' as const,
                        properties: Object.fromEntries(
                            validIntents.map(t => [t, {
                                type: 'array' as const,
                                items: { type: 'string' as const },
                            }])
                        ),
                        additionalProperties: false,
                    },
                    summary: { type: 'string' as const },
                },
                required: ['patterns', 'summary'],
                additionalProperties: false,
            },
        };

        const response = await callTuneModel(prompt, {
            jsonSchema,
            temperature: 0.7,
        });

        let parsed: any;
        try {
            parsed = JSON.parse(response);
        } catch {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                return res.status(502).json({ error: 'Failed to parse LLM response' });
            }
        }

        // Validate: ensure patterns are valid regex, deduplicate against existing
        const validatedPatterns: Record<string, string[]> = {};
        for (const intent of validIntents) {
            if (!parsed.patterns?.[intent] || !Array.isArray(parsed.patterns[intent])) continue;

            const existing = new Set((intentPatterns[intent] || []).map((p: string) => p.toLowerCase()));
            validatedPatterns[intent] = (parsed.patterns[intent] as string[])
                .filter((p: string) => {
                    if (!p || typeof p !== 'string') return false;
                    // Validate regex compiles
                    try { new RegExp(p, 'i'); } catch { return false; }
                    // Deduplicate against existing
                    return !existing.has(p.toLowerCase());
                });
        }

        res.json({
            patterns: validatedPatterns,
            summary: parsed.summary || '',
            existingCounts: Object.fromEntries(
                validIntents.map(t => [t, (intentPatterns[t] || []).length])
            ),
        });
}));

/**
 * Generic LLM generation for configurable text lists (words, mappings, phrases,
 * or patterns). Deduplicates against existing items; validates regex for pattern type.
 */
router.post('/config/tune/generate-words', asyncHandler(async (req, res) => {
    const { listType = 'words', listDescription = '', existing = [], request, count = 15 } = req.body;

        if (!request) {
            return res.status(400).json({ error: 'request is required' });
        }

        const validTypes = ['words', 'mappings', 'phrases', 'patterns'];
        if (!validTypes.includes(listType)) {
            return res.status(400).json({ error: `Invalid listType. Must be one of: ${validTypes.join(', ')}` });
        }

        // Format existing items for the prompt
        let existingStr: string;
        if (listType === 'mappings') {
            // existing may be an object { k: v } or array of [k, v] pairs (from Object.entries in frontend)
            const pairs = Array.isArray(existing)
                ? existing.map((e: any) => Array.isArray(e) ? `${e[0]} → ${e[1]}` : String(e))
                : Object.entries(existing).map(([k, v]) => `${k} → ${v}`);
            existingStr = pairs.join('\n') || '(none)';
        } else if (listType === 'phrases' && Array.isArray(existing)) {
            existingStr = existing.map((p: any) => `"${p[0]}" → ${p[1]}`).join('\n') || '(none)';
        } else if (Array.isArray(existing)) {
            existingStr = existing.join(', ') || '(none)';
        } else {
            existingStr = '(none)';
        }

        const prompt = await getPrompt('config.generate_words', {
            listType,
            listDescription,
            existingWords: existingStr,
            userRequest: request,
            count: String(Math.min(count, 50)),
        });

        const response = await callTuneModel(prompt, {
            temperature: 0.7,
        });

        let parsed: any;
        try {
            parsed = JSON.parse(response);
        } catch {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[0]);
            } else {
                return res.status(502).json({ error: 'Failed to parse LLM response' });
            }
        }

        // Validate and deduplicate based on listType
        const existingSet = new Set(
            Array.isArray(existing) ? existing.map((e: any) => (typeof e === 'string' ? e : JSON.stringify(e)).toLowerCase()) : Object.keys(existing).map(k => k.toLowerCase())
        );

        if (listType === 'words' && Array.isArray(parsed.words)) {
            parsed.words = parsed.words.filter((w: string) => typeof w === 'string' && w.trim() && !existingSet.has(w.toLowerCase().trim()));
        } else if (listType === 'mappings' && parsed.mappings && typeof parsed.mappings === 'object') {
            const filtered: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed.mappings)) {
                if (typeof k === 'string' && typeof v === 'string' && !existingSet.has(k.toLowerCase())) {
                    filtered[k] = v as string;
                }
            }
            parsed.mappings = filtered;
        } else if (listType === 'phrases' && Array.isArray(parsed.phrases)) {
            parsed.phrases = parsed.phrases.filter((p: any) =>
                Array.isArray(p) && p.length === 2 && typeof p[0] === 'string' && typeof p[1] === 'string'
                && !existingSet.has(JSON.stringify(p).toLowerCase())
            );
        } else if (listType === 'patterns' && Array.isArray(parsed.patterns)) {
            parsed.patterns = parsed.patterns.filter((p: string) => {
                if (typeof p !== 'string') return false;
                try { new RegExp(p, 'i'); return !existingSet.has(p.toLowerCase()); } catch { return false; }
            });
        }

        res.json(parsed);
}));

// ─── POST /config/critical-analysis ──────────────────────────────────────────
/**
 * Run a comprehensive config health analysis using the config_tune LLM.
 * Returns issues, waste estimates, and fix recommendations.
 */
router.post('/config/critical-analysis', asyncHandler(async (_req, res) => {
    const currentConfig = getSafeConfig() as any;

    // Gather recent stats
    let statsJson = '{}';
    try {
        const { handleConfig } = await import('../handlers/config-tune-handler.js');
        const metrics = await handleConfig({ action: 'metrics', days: 7 });
        statsJson = JSON.stringify(metrics, null, 2);
    } catch { /* stats unavailable — proceed without */ }

    // Build a summary of all sections with their current values
    const sectionsSummary = Object.values(SECTION_METADATA).map((s: any) => {
        const vals: Record<string, any> = {};
        for (const p of s.parameters) {
            let val: any = currentConfig;
            for (const part of p.configPath) val = val?.[part];
            vals[p.key] = { current: val ?? p.default, default: p.default, min: p.min, max: p.max };
        }
        return `### ${s.title} (${s.id})\n${s.description}\n${JSON.stringify(vals, null, 2)}`;
    }).join('\n\n');

    // Build a compact config JSON with only tunable sections
    const compactConfig: Record<string, any> = {};
    for (const key of ['engine', 'nodes', 'feedback', 'voicing', 'dedup', 'synthesisEngine',
                        'hallucination', 'consultantPipeline', 'clusterSelection', 'lifecycle', 'validation', 'evm']) {
        if (currentConfig[key]) compactConfig[key] = currentConfig[key];
    }

    const prompt = await getPrompt('config.critical_analysis', {
        configJson: JSON.stringify(compactConfig, null, 2),
        statsJson,
        sectionsSummary,
    });

    const jsonSchema = {
        name: 'config_critical_analysis',
        schema: {
            type: 'object' as const,
            properties: {
                overallHealth: { type: 'string' as const, enum: ['critical', 'warning', 'good'] },
                estimatedWastePercent: { type: 'number' as const },
                issues: {
                    type: 'array' as const,
                    items: {
                        type: 'object' as const,
                        properties: {
                            severity: { type: 'string' as const, enum: ['critical', 'warning', 'info'] },
                            title: { type: 'string' as const },
                            detail: { type: 'string' as const },
                            currentSettings: { type: 'object' as const },
                            recommendedSettings: { type: 'object' as const },
                            estimatedImpact: { type: 'string' as const },
                            configPaths: { type: 'array' as const, items: { type: 'array' as const, items: { type: 'string' as const } } },
                        },
                        required: ['severity', 'title', 'detail', 'estimatedImpact'],
                        additionalProperties: false,
                    },
                },
                summary: { type: 'string' as const },
            },
            required: ['overallHealth', 'estimatedWastePercent', 'issues', 'summary'],
            additionalProperties: false,
        },
    };

    const response = await callTuneModel(prompt, {
        jsonSchema,
        temperature: 0.3,
    });

    let parsed: any;
    try {
        parsed = JSON.parse(response);
    } catch {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            parsed = JSON.parse(jsonMatch[0]);
        } else {
            return res.status(502).json({ error: 'Failed to parse LLM response' });
        }
    }

    // Build a lookup from parameter key → configPath using section metadata
    // so we can resolve configPaths the LLM omitted or got wrong
    const paramKeyToPath: Record<string, string[]> = {};
    for (const section of Object.values(SECTION_METADATA) as any[]) {
        for (const p of section.parameters) {
            // Map by bare key name (e.g., "resonanceThreshold")
            paramKeyToPath[p.key] = p.configPath;
            // Also map by dot-path (e.g., "engine.resonanceThreshold")
            paramKeyToPath[p.configPath.join('.')] = p.configPath;
        }
    }

    // Ensure every issue with recommendedSettings has valid configPaths
    if (parsed.issues) {
        for (const issue of parsed.issues) {
            if (!issue.recommendedSettings) continue;
            const resolvedPaths: string[][] = [];
            for (const key of Object.keys(issue.recommendedSettings)) {
                const resolved = paramKeyToPath[key];
                if (resolved) {
                    resolvedPaths.push(resolved);
                } else {
                    // Try dot-path form
                    const parts = key.split('.');
                    if (parts.length >= 2 && paramKeyToPath[key]) {
                        resolvedPaths.push(paramKeyToPath[key]);
                    } else if (parts.length >= 2) {
                        // Use dot-path parts directly as a fallback
                        resolvedPaths.push(parts);
                    }
                }
            }
            if (resolvedPaths.length > 0) {
                issue.configPaths = resolvedPaths;
            }
        }
    }

    // Sort issues by severity: critical first, then warning, then info
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    if (parsed.issues) {
        parsed.issues.sort((a: any, b: any) =>
            (severityOrder[a.severity as keyof typeof severityOrder] ?? 3) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 3)
        );
    }

    res.json(parsed);
}));

// ─── GET /config/sections ────────────────────────────────────────────────────
router.get('/config/sections', (_req, res) => {
    res.json(SECTION_METADATA);
});

// ─── GET /config/defaults/:sectionId ─────────────────────────────────────────
router.get('/config/defaults/:sectionId', (req, res) => {
    const section = SECTION_METADATA[req.params.sectionId];
    if (!section) {
        return res.status(404).json({ error: `Unknown section: ${req.params.sectionId}` });
    }
    const LIST_CONTROL_TYPES = new Set(['wordList', 'wordMap', 'phraseMap', 'patternList']);
    const defaults = section.parameters.map(p => {
        // For list/map controls, metadata has default:0 which is wrong — resolve from actual defaults
        if (LIST_CONTROL_TYPES.has((p as any).controlType)) {
            let val: any = defaultConfig;
            for (const key of p.configPath) {
                val = val?.[key as keyof typeof val];
            }
            return { configPath: p.configPath, value: val ?? [] };
        }
        return { configPath: p.configPath, value: p.default };
    });
    res.json({ sectionId: req.params.sectionId, defaults });
});

// ─── GET /config/history ────────────────────────────────────────────────────
router.get('/config/history', asyncHandler(async (req, res) => {
    const { handleConfig } = await import('../handlers/config-tune-handler.js');
    const days = parseInt(req.query.days as string, 10) || 7;
    const limit = parseInt(req.query.limit as string, 10) || 30;
    const configPath = req.query.configPath as string;
    const project = req.query.project as string;
    const result = await handleConfig({
        action: 'history',
        days,
        limit,
        configPath,
        project,
    });
    res.json(result);
}));

// ─── GET /config/snapshots ──────────────────────────────────────────────────
router.get('/config/snapshots', asyncHandler(async (req, res) => {
    const { handleConfig } = await import('../handlers/config-tune-handler.js');
    const allProjects = req.query.allProjects === 'true';
    const project = req.query.project as string;
    const result = await handleConfig({
        action: 'snapshot',
        snapshotAction: 'list',
        allProjects,
        project,
    });
    res.json(result);
}));

// ─── POST /config/snapshots ─────────────────────────────────────────────────
router.post('/config/snapshots', asyncHandler(async (req, res) => {
    const { handleConfig } = await import('../handlers/config-tune-handler.js');
    const { label, contributor = 'human' } = req.body;
    const result = await handleConfig({
        action: 'snapshot',
        snapshotAction: 'save',
        snapshotLabel: label,
        contributor,
    });
    res.json(result);
}));

// ─── POST /config/snapshots/:id/restore ─────────────────────────────────────
router.post('/config/snapshots/:id/restore', asyncHandler(async (req, res) => {
    const { handleConfig } = await import('../handlers/config-tune-handler.js');
    const { contributor = 'human' } = req.body;
    const result = await handleConfig({
        action: 'snapshot',
        snapshotAction: 'restore',
        snapshotId: req.params.id,
        contributor,
    });
    res.json(result);
}));

// ─── GET /config/metrics ────────────────────────────────────────────────────
router.get('/config/metrics', asyncHandler(async (req, res) => {
    const { handleConfig } = await import('../handlers/config-tune-handler.js');
    const days = parseInt(req.query.days as string, 10) || 7;
    const result = await handleConfig({
        action: 'metrics',
        days,
    });
    res.json(result);
}));

// =============================================================================
// DEDUP GATE OVERRIDES — per-source dedup threshold configuration
// =============================================================================

import { query as dbQuery } from '../db/index.js';
import { invalidateGateOverrideCache } from '../handlers/dedup.js';

// ─── GET /config/dedup-gates ────────────────────────────────────────────────
router.get('/config/dedup-gates', asyncHandler(async (_req, res) => {
    const rows = await dbQuery('SELECT * FROM dedup_gate_overrides ORDER BY source', []);
    res.json({ gates: rows });
}));

// ─── PUT /config/dedup-gates/:source ────────────────────────────────────────
router.put('/config/dedup-gates/:source', asyncHandler(async (req, res) => {
    const { source } = req.params;
    const {
        embedding_threshold = null,
        word_overlap_threshold = null,
        llm_judge_enabled = null,
        llm_judge_doubt_floor = null,
        llm_judge_hard_ceiling = null,
    } = req.body;

    await dbQuery(
        `INSERT INTO dedup_gate_overrides (source, embedding_threshold, word_overlap_threshold, llm_judge_enabled, llm_judge_doubt_floor, llm_judge_hard_ceiling, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))
         ON CONFLICT(source) DO UPDATE SET
            embedding_threshold = $2,
            word_overlap_threshold = $3,
            llm_judge_enabled = $4,
            llm_judge_doubt_floor = $5,
            llm_judge_hard_ceiling = $6,
            updated_at = datetime('now')`,
        [source, embedding_threshold, word_overlap_threshold, llm_judge_enabled, llm_judge_doubt_floor, llm_judge_hard_ceiling]
    );

    invalidateGateOverrideCache();
    res.json({ success: true, source });
}));

// ─── DELETE /config/dedup-gates/:source ─────────────────────────────────────
router.delete('/config/dedup-gates/:source', asyncHandler(async (req, res) => {
    const { source } = req.params;
    await dbQuery('DELETE FROM dedup_gate_overrides WHERE source = $1', [source]);
    invalidateGateOverrideCache();
    res.json({ success: true, source });
}));

export default router;
