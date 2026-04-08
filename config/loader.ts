/**
 * @module config/loader
 *
 * Config loading, persistence, and runtime updates.
 *
 * Responsibilities:
 * - Persists tunable config overrides to the `settings` table (key: `config_overrides`).
 * - Loads saved overrides on startup via {@link loadSavedConfig}.
 * - Applies runtime config changes via {@link updateConfig} with deep merge semantics.
 * - Enforces cross-parameter invariants (e.g., maxVerboseWords >= maxOutputWords)
 *   via declarative {@link CONFIG_CONSTRAINTS}.
 * - Resets subsystem inference params when models change via {@link resetSubsystemParams}.
 *
 * The NON_TUNABLE denylist determines which config sections are infrastructure
 * (not persisted) vs tunable (persisted and editable via GUI/API).
 */
import type { PodbitConfig } from './types.js';
import { config, DEFAULT_TEMPERATURES, DEFAULT_REPEAT_PENALTIES } from './defaults.js';
import { emitActivity } from '../services/event-bus.js';

/**
 * Get a safe version of config with secrets masked.
 * API key status comes from the models module (DB-stored keys).
 */
export function getSafeConfig(): PodbitConfig {
  // API key status from models module (DB-stored keys only)
  let apiStatus: Record<string, string | null> = { openai: undefined as any, anthropic: undefined as any };
  try {
    const { getApiKeyStatus } = require('../models.js');
    if (typeof getApiKeyStatus === 'function') {
      const status = getApiKeyStatus();
      apiStatus = {
        openai: status.openai || undefined,
        anthropic: status.anthropic || undefined,
      };
    }
  } catch { /* models not loaded yet */ }

  return {
    ...config,
    api: apiStatus as any,
    // GUI reads engine params under the 'resonance' alias (radar configPaths use it)
    resonance: config.engine,
  };
}

/**
 * Deep merge: recursively merges source into target for nested objects.
 * Arrays and primitives are replaced, not merged.
 */
function deepMerge(target: any, source: any): void {
  for (const key of Object.keys(source)) {
    if (
      source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}

// =============================================================================
// CONFIG PERSISTENCE (via settings table)
// =============================================================================

/**
 * Config keys that are NOT tunable — infrastructure, secrets, generated values.
 * Everything else on the config object is considered tunable and will be
 * persisted, accepted by updateConfig, etc. This denylist approach means new
 * config sections are automatically included without editing any list.
 */
const NON_TUNABLE = new Set([
    'database', 'api', 'services', 'server', 'gui', 'orchestrator',
    'managedServices', 'externalServices', 'partitionServer', 'avatars',
    'tokenLimits', // tokenLimits excluded — models generate dynamically
    'resonance', // alias for engine — would double-persist
]);

/**
 * Persist current tunable config overrides to the settings table.
 * Saves a flat map of all tunable parameters that differ from env-var defaults.
 * Called after every updateConfig() to ensure changes survive server restarts.
 */
async function persistConfigOverrides(): Promise<void> {
    try {
        const { systemQuery: dbQuery } = await import('../db.js');

        // Collect all tunable parameters as a flat map
        const overrides: Record<string, any> = {};

        // Helper to flatten nested config sections into dotted paths
        const flatten = (obj: any, prefix: string) => {
            for (const [key, value] of Object.entries(obj)) {
                const path = prefix ? `${prefix}.${key}` : key;
                if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                    flatten(value, path);
                } else {
                    overrides[path] = value;
                }
            }
        };

        // Derive tunable sections from config keys minus non-tunable denylist
        for (const key of Object.keys(config)) {
            if (!NON_TUNABLE.has(key) && (config as any)[key]) {
                flatten((config as any)[key], key);
            }
        }

        await dbQuery(
            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
            ['config_overrides', JSON.stringify(overrides)]
        );
    } catch (err: any) {
        console.error('[config] Failed to persist overrides:', err.message);
    }
}

/**
 * Reset inference parameters for a subsystem back to defaults.
 * Called when the assigned model changes — clears any tuned values so
 * parameters optimised for the old model don't carry over.
 */
export async function resetSubsystemParams(subsystem: string): Promise<void> {
    config.subsystemTemperatures[subsystem] = DEFAULT_TEMPERATURES[subsystem] ?? 0.7;
    config.subsystemRepeatPenalties[subsystem] = DEFAULT_REPEAT_PENALTIES[subsystem] ?? 1.0;
    delete config.subsystemTopP[subsystem];
    delete config.subsystemMinP[subsystem];
    delete config.subsystemTopK[subsystem];
    // Reset consultant params too
    config.consultantTemperatures[subsystem] = 0.15;
    delete config.consultantRepeatPenalties[subsystem];
    delete config.consultantTopP[subsystem];
    delete config.consultantMinP[subsystem];
    delete config.consultantTopK[subsystem];
    await persistConfigOverrides();
}

/**
 * Load saved config overrides from the settings table on startup.
 * Applies them on top of env-var defaults so tuning changes survive restarts.
 */
export async function loadSavedConfig(): Promise<void> {
    try {
        const { systemQueryOne: dbQueryOne } = await import('../db.js');
        const row = await dbQueryOne('SELECT value FROM settings WHERE key = $1', ['config_overrides']);
        if (!row) return;

        const overrides: Record<string, any> = typeof row.value === 'string'
            ? JSON.parse(row.value)
            : row.value;

        // Migrate old config paths to new names
        const pathMigrations: Record<string, string> = {
            'resonance.threshold': 'engine.threshold',
            'resonance.temperatureBoost': 'engine.salienceBoost',
            'resonance.temperatureDecay': 'engine.salienceDecay',
            'resonance.temperatureCeiling': 'engine.salienceCeiling',
            'resonance.temperatureFloor': 'engine.salienceFloor',
            'resonance.specificityRatio': 'engine.specificityRatio',
            'resonance.knowledgeWeight': 'engine.knowledgeWeight',
            'resonance.abstractionWeight': 'engine.abstractionWeight',
            'resonance.weightDecay': 'engine.weightDecay',
            'resonance.parentBoost': 'engine.parentBoost',
            'resonance.cycleDelayMs': 'engine.cycleDelayMs',
            'resonance.decayEveryNCycles': 'engine.decayEveryNCycles',
            'resonance.synthesisJunkThreshold': 'engine.junkThreshold',
            'resonance.synthesisMinSpecificity': 'engine.minSpecificity',
            'resonance.synthesisDecayEnabled': 'engine.synthesisDecayEnabled',
            'resonance.synthesisDecayMultiplier': 'engine.synthesisDecayMultiplier',
            'resonance.synthesisDecayGraceDays': 'engine.synthesisDecayGraceDays',
            // citizenValidation → minitruth rename
            'citizenValidation.enabled': 'minitruth.enabled',
            'citizenValidation.maxReworkAttempts': 'minitruth.maxReworkAttempts',
        };
        let migrated = false;
        for (const [oldPath, newPath] of Object.entries(pathMigrations)) {
            if (oldPath in overrides && !(newPath in overrides)) {
                overrides[newPath] = overrides[oldPath];
                delete overrides[oldPath];
                migrated = true;
            }
        }

        // One-time migration (v1): clear stale cycle interval overrides from DB
        // These were saved from incorrect values and override correct code defaults
        const { systemQueryOne: checkMigration } = await import('../db.js');
        const migV1 = await checkMigration('SELECT value FROM settings WHERE key = $1', ['_migration_v1_intervals']);
        if (!migV1) {
            const staleIntervalPaths = [
                'autonomousCycles.validation.intervalMs',
                'autonomousCycles.questions.intervalMs',
                'autonomousCycles.tensions.intervalMs',
                'autonomousCycles.research.intervalMs',
                'engine.cycleDelayMs',
            ];
            for (const path of staleIntervalPaths) {
                if (path in overrides) {
                    console.error(`[config] Migration v1: clearing stale override ${path}=${overrides[path]}`);
                    delete overrides[path];
                    migrated = true;
                }
            }
            const { systemQuery: dbExec } = await import('../db.js');
            await dbExec(
                `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, datetime('now'))
                 ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = datetime('now')`,
                ['_migration_v1_intervals', 'done']
            );
        }

        // Sections where keys are dynamically added (not present in defaults)
        const dynamicKeySections = new Set([
            'subsystemTopP', 'subsystemMinP', 'subsystemTopK',
            'subsystemTemperatures', 'subsystemRepeatPenalties',
            'consultantTopP', 'consultantMinP', 'consultantTopK',
            'consultantTemperatures', 'consultantRepeatPenalties',
        ]);

        // Apply each override by navigating the dotted path
        let appliedCount = 0;
        for (const [path, value] of Object.entries(overrides)) {
            const parts = path.split('.');
            let target: any = config;
            for (let i = 0; i < parts.length - 1; i++) {
                if (target[parts[i]] === undefined || target[parts[i]] === null) break;
                target = target[parts[i]];
            }
            const lastKey = parts[parts.length - 1];
            // Allow dynamic keys in subsystem param maps (topP/minP/topK default to {})
            if (target && (lastKey in target || dynamicKeySections.has(parts[0]))) {
                // Coerce booleans to numbers when the default type is number.
                // The config GUI uses numeric sliders (0/1) for toggles, but older
                // DB overrides may store true/false. Without coercion, the GUI
                // slider can't render the value and the setting becomes invisible.
                let coerced = value;
                if (typeof value === 'boolean' && typeof target[lastKey] === 'number') {
                    coerced = value ? 1 : 0;
                }
                // Guard: don't overwrite arrays with non-arrays (corrupted overrides)
                if (Array.isArray(target[lastKey]) && !Array.isArray(coerced)) {
                    continue;
                }
                target[lastKey] = coerced;
                appliedCount++;
            }
        }

        if (appliedCount > 0) {
            console.error(`[config] Loaded ${appliedCount} saved config overrides from database`);
        }

        // Re-persist if we migrated any old paths, so future loads use new paths
        if (migrated) {
            console.error('[config] Migrated old resonance.* config paths to engine.* — re-persisting');
            await persistConfigOverrides();
        }

        // Enforce cross-parameter relationships after loading saved config
        const warnings = validateConfigRelationships();
        if (warnings.length > 0) {
            await persistConfigOverrides();
        }
    } catch (err: any) {
        console.error('[config] Failed to load saved config (non-critical):', err.message);
    }
}

// =============================================================================
// CONFIG CROSS-VALIDATION
// =============================================================================

interface ConfigConstraint {
    description: string;
    // Dot-path into config (e.g., 'hallucination.maxVerboseWords')
    paramA: string;
    paramB: string;
    // paramA must be [relation] paramB
    relation: 'gte' | 'gt' | 'lte' | 'lt';
    // Which param to clamp on violation
    clampTarget: 'a' | 'b';
}

/**
 * Declarative cross-parameter constraints. When violated, the clampTarget
 * parameter is auto-adjusted to satisfy the relationship and a warning is logged.
 */
const CONFIG_CONSTRAINTS: ConfigConstraint[] = [
    {
        description: 'maxVerboseWords must be >= maxOutputWords (verbose gate should not reject output the voicing prompt asked for)',
        paramA: 'hallucination.maxVerboseWords',
        paramB: 'voicing.maxOutputWords',
        relation: 'gte',
        clampTarget: 'a',
    },
    {
        description: 'maxOutputWords must be >= maxInsightWords (hard limit must exceed prompt target)',
        paramA: 'voicing.maxOutputWords',
        paramB: 'voicing.maxInsightWords',
        relation: 'gte',
        clampTarget: 'a',
    },
    {
        description: 'maxOutputWords must be >= truncatedWords (truncation target within output limit)',
        paramA: 'voicing.maxOutputWords',
        paramB: 'voicing.truncatedWords',
        relation: 'gte',
        clampTarget: 'b',
    },
    {
        description: 'maxOutputWords must be > minNovelWords (cannot require more novel words than total allowed)',
        paramA: 'voicing.maxOutputWords',
        paramB: 'voicing.minNovelWords',
        relation: 'gt',
        clampTarget: 'b',
    },
    {
        description: 'minOutputWordsForNoveltyCheck must be <= maxOutputWords',
        paramA: 'hallucination.minOutputWordsForNoveltyCheck',
        paramB: 'voicing.maxOutputWords',
        relation: 'lte',
        clampTarget: 'a',
    },
    {
        description: 'salienceCeiling must be > salienceFloor (equal values make sampling random)',
        paramA: 'engine.salienceCeiling',
        paramB: 'engine.salienceFloor',
        relation: 'gt',
        clampTarget: 'b',
    },
    {
        description: 'weightCeiling must be >= breakthroughWeight',
        paramA: 'engine.weightCeiling',
        paramB: 'nodes.breakthroughWeight',
        relation: 'gte',
        clampTarget: 'b',
    },
    {
        description: 'breakthroughWeight must be >= defaultWeight',
        paramA: 'nodes.breakthroughWeight',
        paramB: 'nodes.defaultWeight',
        relation: 'gte',
        clampTarget: 'b',
    },
    {
        description: 'llmJudgeHardCeiling must be > llmJudgeDoubtFloor (judge must have non-zero operating range)',
        paramA: 'dedup.llmJudgeHardCeiling',
        paramB: 'dedup.llmJudgeDoubtFloor',
        relation: 'gt',
        clampTarget: 'b',
    },
    {
        description: 'llmJudgeDoubtFloor must be >= embeddingSimilarityThreshold (otherwise there is a dead zone where nodes are rejected without the LLM judge getting a say)',
        paramA: 'dedup.llmJudgeDoubtFloor',
        paramB: 'dedup.embeddingSimilarityThreshold',
        relation: 'gte',
        clampTarget: 'b',
    },
    // H1: Resonance band must be non-empty
    {
        description: 'Resonance threshold must be below similarity ceiling (synthesis band must be non-empty)',
        paramA: 'engine.threshold',
        paramB: 'synthesisEngine.similarityCeiling',
        relation: 'lt',
        clampTarget: 'a',
    },
    // H2: Threshold must be below dedup threshold
    {
        description: 'Resonance threshold must be below dedup threshold (otherwise every synthesis is in the dedup danger zone)',
        paramA: 'engine.threshold',
        paramB: 'dedup.embeddingSimilarityThreshold',
        relation: 'lt',
        clampTarget: 'a',
    },
    // H4: Fitness range must be non-inverted
    {
        description: 'Fitness range max must be >= min',
        paramA: 'engine.fitnessRange.max',
        paramB: 'engine.fitnessRange.min',
        relation: 'gte',
        clampTarget: 'a',
    },
    // H5: Insight target must not exceed verbosity gate
    {
        description: 'maxInsightWords must be <= maxVerboseWords (otherwise the insight target triggers the verbosity red flag)',
        paramA: 'voicing.maxInsightWords',
        paramB: 'hallucination.maxVerboseWords',
        relation: 'lte',
        clampTarget: 'a',
    },
    // Population control: pass threshold must be > archive threshold
    {
        description: 'Pass threshold must be > archive threshold (otherwise nodes are archived before they can be demoted)',
        paramA: 'populationControl.threshold',
        paramB: 'populationControl.archiveThreshold',
        relation: 'gt',
        clampTarget: 'b',
    },
    // Embedding eval: lexical bridge high must be > low (otherwise the asymmetry check is inverted)
    {
        description: 'Lexical bridge high threshold must be > low threshold (high = similarity to dominant parent, low = similarity to neglected parent)',
        paramA: 'embeddingEval.lexicalBridgeHighThreshold',
        paramB: 'embeddingEval.lexicalBridgeLowThreshold',
        relation: 'gt',
        clampTarget: 'b',
    },
    // Embedding eval: toxic parent min children must be >= min domains (can't span N domains with fewer children)
    {
        description: 'Toxic parent minChildren must be >= minDomains (cannot span N domains with fewer than N children)',
        paramA: 'embeddingEval.toxicParentMinChildren',
        paramB: 'embeddingEval.toxicParentMinDomains',
        relation: 'gte',
        clampTarget: 'b',
    },
];

/**
 * Sum constraints — params that must sum to a target value (±tolerance).
 * When violated, all params are scaled proportionally to meet the target.
 */
interface ConfigSumConstraint {
    description: string;
    params: string[];
    expectedSum: number;
    tolerance: number;
}

const CONFIG_SUM_CONSTRAINTS: ConfigSumConstraint[] = [
    {
        description: 'Context engine budget allocations must sum to ~1.0',
        params: [
            'contextEngine.allocation.knowledge',
            'contextEngine.allocation.history',
            'contextEngine.allocation.systemPrompt',
            'contextEngine.allocation.response',
        ],
        expectedSum: 1.0,
        tolerance: 0.05,
    },
    {
        description: 'Consultant pipeline dimension weights must sum to ~1.0',
        params: [
            'consultantPipeline.weights.coherence',
            'consultantPipeline.weights.grounding',
            'consultantPipeline.weights.novelty',
            'consultantPipeline.weights.derivation',
            'consultantPipeline.weights.forcedAnalogy',
            'consultantPipeline.weights.incrementalValue',
        ],
        expectedSum: 1.0,
        tolerance: 0.05,
    },
];

/** Resolve a dot-path like 'hallucination.maxVerboseWords' to its value in config. */
function getConfigValue(path: string): number | undefined {
    const parts = path.split('.');
    let obj: any = config;
    for (const p of parts) {
        if (obj == null || typeof obj !== 'object') return undefined;
        obj = obj[p];
    }
    return typeof obj === 'number' ? obj : undefined;
}

/** Set a dot-path like 'hallucination.maxVerboseWords' on config. */
function setConfigValue(path: string, value: number): void {
    const parts = path.split('.');
    let obj: any = config;
    for (let i = 0; i < parts.length - 1; i++) {
        if (obj == null || typeof obj !== 'object') return;
        obj = obj[parts[i]];
    }
    if (obj != null && typeof obj === 'object') {
        obj[parts[parts.length - 1]] = value;
    }
}

export interface ConfigWarning {
    param: string;
    oldValue: number;
    newValue: number;
    reason: string;
}

/**
 * Validate cross-parameter relationships and auto-clamp on violation.
 * Returns warnings describing every parameter that was changed and why.
 */
function validateConfigRelationships(): ConfigWarning[] {
    const warnings: ConfigWarning[] = [];
    for (const rule of CONFIG_CONSTRAINTS) {
        const valA = getConfigValue(rule.paramA);
        const valB = getConfigValue(rule.paramB);
        if (valA === undefined || valB === undefined) continue;

        let violated = false;
        switch (rule.relation) {
            case 'gte': violated = valA < valB; break;
            case 'gt':  violated = valA <= valB; break;
            case 'lte': violated = valA > valB; break;
            case 'lt':  violated = valA >= valB; break;
        }

        if (violated) {
            if (rule.clampTarget === 'a') {
                const newVal = rule.relation === 'gt' ? valB + 1 : rule.relation === 'lt' ? valB - 1 : valB;
                setConfigValue(rule.paramA, newVal);
                const warning: ConfigWarning = { param: rule.paramA, oldValue: valA, newValue: newVal, reason: rule.description };
                warnings.push(warning);
                console.error(`[config] Auto-corrected: ${rule.paramA} (${valA} → ${newVal}) — ${rule.description}`);
                emitActivity('config', 'cross_validation', `Auto-corrected ${rule.paramA}: ${valA} → ${newVal}`, { ...warning });
            } else {
                const newVal = rule.relation === 'lt' ? valA + 1 : rule.relation === 'gt' ? valA - 1 : valA;
                setConfigValue(rule.paramB, newVal);
                const warning: ConfigWarning = { param: rule.paramB, oldValue: valB, newValue: newVal, reason: rule.description };
                warnings.push(warning);
                console.error(`[config] Auto-corrected: ${rule.paramB} (${valB} → ${newVal}) — ${rule.description}`);
                emitActivity('config', 'cross_validation', `Auto-corrected ${rule.paramB}: ${valB} → ${newVal}`, { ...warning });
            }
        }
    }

    // Sum constraints — scale proportionally when sum is outside tolerance
    for (const sc of CONFIG_SUM_CONSTRAINTS) {
        const values = sc.params.map(p => getConfigValue(p));
        if (values.some(v => v === undefined)) continue;
        const sum = (values as number[]).reduce((a, b) => a + b, 0);
        if (Math.abs(sum - sc.expectedSum) > sc.tolerance) {
            const scale = sum > 0 ? sc.expectedSum / sum : 1;
            for (let i = 0; i < sc.params.length; i++) {
                const oldVal = values[i] as number;
                const newVal = Math.round(oldVal * scale * 1000) / 1000;
                setConfigValue(sc.params[i], newVal);
                if (oldVal !== newVal) {
                    const warning: ConfigWarning = { param: sc.params[i], oldValue: oldVal, newValue: newVal, reason: sc.description };
                    warnings.push(warning);
                }
            }
            console.error(`[config] Sum constraint: ${sc.description} (was ${sum.toFixed(3)}, normalized to ${sc.expectedSum})`);
            emitActivity('config', 'cross_validation', `Sum constraint: ${sc.description} (${sum.toFixed(3)} → ${sc.expectedSum})`, { constraint: sc.description });
        }
    }

    return warnings;
}

/**
 * Update runtime config and persist to database.
 * Uses deepMerge for all sections — this is strictly safer than Object.assign
 * because it only touches keys present in the update, preserving nested
 * sub-objects (e.g., evm.postRejection, elitePool.dedup) automatically.
 *
 * New config sections added to defaults.ts are automatically accepted here
 * as long as they aren't in the NON_TUNABLE denylist.
 */
export async function updateConfig(updates: Partial<PodbitConfig>): Promise<ConfigWarning[]> {
  // GUI sends engine params under the 'resonance' alias
  if ((updates as any).resonance) {
    deepMerge(config.engine, (updates as any).resonance);
  }

  for (const [key, value] of Object.entries(updates)) {
    if (NON_TUNABLE.has(key)) continue;
    if (value === null || value === undefined) continue;
    if (!(key in config)) continue;

    if (typeof value === 'object' && !Array.isArray(value)) {
      deepMerge((config as any)[key], value);
    } else {
      (config as any)[key] = value;
    }
  }

  // Enforce cross-parameter relationships after merging
  const warnings = validateConfigRelationships();

  // Persist to database — await to ensure changes survive restarts
  await persistConfigOverrides();

  return warnings;
}
