/**
 * @module core/autotune/execution
 *
 * Auto-tune test execution and per-subsystem tuning loop.
 *
 * Contains the test runner (sends a prompt to the model with a parameter combo
 * and scores the output), the test image loader (for vision model tuning), and
 * the core tuning loop that evaluates all combos for a subsystem and selects
 * the best via variance-weighted selection.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callSingleModel, acquireModelSlot } from '../../models.js';
import { getPrompt } from '../../prompts.js';
import { emitActivity } from '../../services/event-bus.js';
import { systemQuery as query } from '../../db/index.js';
import { config as appConfig } from '../../config.js';
import { RC } from '../../config/constants.js';
import type { ImageInput } from '../../models.js';
import type { ParamCombo, QualityScore, AutoTuneConfig, SubsystemTuneResult, ComboResult, GoldStandardTest } from './types.js';
import { getSubsystemCategory, SCORERS, PROMPT_MAP, getPromptIdsForCategory } from './scoring.js';
import { generateCombos, generateRefinementCombos, constrainGrid } from './combinatorics.js';
import { DEFAULT_GRID } from './scoring.js';
import { scoreAgainstGoldStandards, composeTestPrompt } from './gold-standards.js';
import { tuneState, cancelFlag } from './state.js';

// =============================================================================
// TEST IMAGE LOADING
// =============================================================================

/**
 * Load the test image from autotune/auto.jpg.
 * This is a real photograph (produce arranged as a creature) — far more
 * realistic than a synthetic test pattern for tuning vision model params.
 *
 * Runs through the SAME normalization pipeline as real KB image ingestion:
 * reads reader_image.config from the settings table (maxDimension, quality,
 * format) and applies sharp resize + compression with those values.
 */
/** Cached test image (undefined = not loaded yet, null = not found/failed) */
let _cachedTestImage: { data: string; media_type: string } | null | undefined;

/**
 * Resolve the project root directory from the current module's location.
 * Falls back to `process.cwd()` if `import.meta.url` resolution fails.
 *
 * @returns Absolute path to the project root
 */
function resolveProjectRoot(): string {
    try {
        const __filename = fileURLToPath(import.meta.url);
        return path.resolve(path.dirname(__filename), '..', '..');
    } catch {
        return process.cwd();
    }
}

/** MIME types for normalized output formats */
const FORMAT_MIME: Record<string, string> = {
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    png: 'image/png',
};

/**
 * Load and normalize the test image from `autotune/auto.jpg`.
 *
 * Uses the same sharp resize + compression pipeline as real KB image ingestion,
 * reading normalization settings (maxDimension, quality, format) from the
 * `reader_image.config` setting. Results are cached after first load.
 *
 * @returns Base64-encoded image data with MIME type, or `null` if not found
 */
export async function getTestImage(): Promise<{ data: string; media_type: string } | null> {
    if (_cachedTestImage !== undefined) return _cachedTestImage;

    const root = resolveProjectRoot();
    const imgPath = path.join(root, 'autotune', 'auto.jpg');

    if (!fs.existsSync(imgPath)) {
        console.error(`[autotune] Test image not found: ${imgPath}`);
        _cachedTestImage = null;
        return null;
    }

    try {
        const rawBuffer = fs.readFileSync(imgPath);

        // Read normalization settings from DB — same as kb/readers/image-reader.ts
        const imgSettings = { maxDimension: RC.misc.imageMaxDimension, quality: RC.misc.imageQuality, format: RC.misc.imageFormat as 'jpeg' | 'webp' | 'png' };
        try {
            const { systemQueryOne: queryOne } = await import('../../db.js');
            const row: any = await queryOne(`SELECT value FROM settings WHERE key = 'reader_image.config'`);
            if (row?.value) {
                const saved = JSON.parse(row.value);
                if (saved.maxDimension) imgSettings.maxDimension = saved.maxDimension;
                if (saved.quality) imgSettings.quality = saved.quality;
                if (saved.format) imgSettings.format = saved.format;
            }
        } catch {
            // Settings table not available — use defaults (same as image-reader fallback)
        }

        let buffer: Buffer = rawBuffer;
        let mimeType = FORMAT_MIME[imgSettings.format] || 'image/jpeg';

        // Normalize via sharp — same resize + compress pipeline as real KB handling
        try {
            const sharp = (await import('sharp')).default;

            let image = sharp(rawBuffer);
            let metadata;
            try {
                metadata = await image.metadata();
            } catch (firstErr: any) {
                // Lenient decode fallback — same as image-reader.ts
                console.warn(`[autotune] Standard decode failed (${firstErr.message}), trying lenient mode...`);
                image = sharp(rawBuffer, { failOn: 'none' } as any);
                metadata = await image.metadata();
            }

            const width = metadata.width || 0;
            const height = metadata.height || 0;
            const maxDim = Math.max(width, height);

            // Only resize if exceeds max dimension
            if (maxDim > imgSettings.maxDimension) {
                image.resize({
                    width: width >= height ? imgSettings.maxDimension : undefined,
                    height: height > width ? imgSettings.maxDimension : undefined,
                    fit: 'inside',
                    withoutEnlargement: true,
                });
            }

            // Convert and compress using configured format
            let output: Buffer;
            if (imgSettings.format === 'jpeg') {
                output = await image.jpeg({ quality: imgSettings.quality }).toBuffer();
            } else if (imgSettings.format === 'webp') {
                output = await image.webp({ quality: imgSettings.quality }).toBuffer();
            } else {
                output = await image.png({ compressionLevel: 6 }).toBuffer();
            }

            const savings = ((1 - output.length / rawBuffer.length) * 100).toFixed(0);
            console.log(`[autotune] Test image normalized (KB pipeline): ${width}x${height} → ${imgSettings.maxDimension}px max, ${imgSettings.format} q${imgSettings.quality}, ${(rawBuffer.length / 1024).toFixed(0)}KB → ${(output.length / 1024).toFixed(0)}KB (${savings}% smaller)`);
            buffer = output;
        } catch (err: any) {
            // sharp not available — send original (larger but still works)
            console.warn(`[autotune] Normalization failed: ${err.message} — sending original test image`);
            mimeType = 'image/jpeg';
        }

        _cachedTestImage = { data: buffer.toString('base64'), media_type: mimeType };
        return _cachedTestImage;
    } catch (err: any) {
        console.error(`[autotune] Failed to load test image: ${err.message}`);
        _cachedTestImage = null;
        return null;
    }
}

// =============================================================================
// TEST RUNNER
// =============================================================================

/**
 * Run a single test: send a prompt to the model with the given parameter combo
 * and score the output.
 *
 * Scoring priority: gold standard similarity (if available) > heuristic scorer.
 * For `reader_image` category, attaches the test image to the request.
 *
 * @param subsystem - Subsystem name (used to determine category and scorer)
 * @param combo - Parameter combination to test (temperature, topP, etc.)
 * @param model - Model assignment object with provider, endpoint, API key, etc.
 * @param goldTest - Optional specific prompt + ID for targeted gold standard scoring
 * @returns Quality score with overall 0-1 composite, dimension breakdown, and raw output
 */
export async function runTest(
    subsystem: string,
    combo: ParamCombo,
    model: any,
    goldTest?: GoldStandardTest,
): Promise<QualityScore> {
    const category = getSubsystemCategory(subsystem);
    const scorer = SCORERS[category];

    // Use the gold-standard-aligned prompt when available, otherwise the hardcoded test prompt
    const prompt = goldTest?.composedPrompt || await getPrompt(PROMPT_MAP[category]);

    const systemPrompt = await getPrompt('system.identity');

    // For image reader: attach a test image
    let images: ImageInput[] | undefined;
    if (category === 'reader_image') {
        const testImage = await getTestImage();
        if (!testImage) {
            return {
                overall: 0,
                dimensions: {},
                rawOutput: '',
                error: 'Test image not found (autotune/auto.jpg)',
            };
        }
        images = [{ type: 'base64', media_type: testImage.media_type, data: testImage.data }];
    }

    const modelId = model.id || model.modelId || model.name;
    const release = await acquireModelSlot(modelId, model.maxConcurrency || 1);
    try {
        const callResult = await callSingleModel(
            {
                name: model.modelId || model.name,
                provider: model.provider,
                model: model.modelId || model.name,
                endpoint: model.endpointUrl || undefined,
                apiKey: model.apiKey || undefined,
            },
            prompt,
            {
                temperature: combo.temperature,
                topP: combo.topP,
                minP: combo.minP,
                topK: combo.topK,
                repeatPenalty: combo.repeatPenalty,
                systemPrompt,
                images,
            },
        );
        const result = callResult.text;

        // Try gold standard scoring first (replaces heuristics when available)
        // When goldTest is provided, score against that specific prompt's gold standards
        try {
            const goldScore = await scoreAgainstGoldStandards(result, category, goldTest?.promptId);
            if (goldScore) return goldScore;
        } catch (goldErr: any) {
            console.warn(`[autotune] Gold standard scoring failed, falling back to heuristic: ${goldErr.message}`);
        }

        // Fallback to heuristic scorer
        return scorer(result);
    } catch (err: any) {
        return {
            overall: 0,
            dimensions: {},
            rawOutput: '',
            error: err.message,
        };
    } finally {
        release();
    }
}

// =============================================================================
// CORE TUNING LOOP (per-subsystem)
// =============================================================================

/**
 * Core tuning loop for a single subsystem.
 *
 * Generates parameter combos (full grid or seeded refinement), runs each combo
 * multiple times against all gold standard prompts (or the heuristic test prompt),
 * aggregates scores, and selects the best combo via variance-weighted selection
 * when top combos converge.
 *
 * Uses a concurrent worker pool bounded by the model's `maxConcurrency` setting.
 *
 * @param subsystem - Subsystem name to tune
 * @param model - Model assignment object with provider, endpoint, concurrency, etc.
 * @param config - Auto-tune configuration (runsPerCombo, maxCombos, convergenceThreshold)
 * @param seedParams - If provided, generates a narrow refinement grid around these params
 * @param options - Optional flags (e.g., `isConsultant` for consultant parameter paths)
 * @returns Object containing the tune result summary and the best parameter combo
 */
export async function tuneSubsystem(
    subsystem: string,
    model: any,
    config: AutoTuneConfig,
    seedParams: ParamCombo | null,
    options?: { isConsultant?: boolean },
): Promise<{ result: SubsystemTuneResult; bestCombo: ParamCombo }> {
    const phase: 'full' | 'refinement' = seedParams ? 'refinement' : 'full';
    const isConsultant = options?.isConsultant ?? false;

    // Current params as baseline — consultants read from consultantTemperatures etc.
    const currentParams: ParamCombo = isConsultant ? {
        temperature: (appConfig as any).consultantTemperatures?.[subsystem] ?? 0.15,
        topP: (appConfig as any).consultantTopP?.[subsystem] ?? 0.9,
        minP: (appConfig as any).consultantMinP?.[subsystem] ?? 0,
        topK: (appConfig as any).consultantTopK?.[subsystem] ?? 0,
        repeatPenalty: (appConfig as any).consultantRepeatPenalties?.[subsystem] ?? 1.0,
    } : {
        temperature: (appConfig as any).subsystemTemperatures?.[subsystem] ?? 0.7,
        topP: (appConfig as any).subsystemTopP?.[subsystem] ?? 0.9,
        minP: (appConfig as any).subsystemMinP?.[subsystem] ?? 0,
        topK: (appConfig as any).subsystemTopK?.[subsystem] ?? 0,
        repeatPenalty: (appConfig as any).subsystemRepeatPenalties?.[subsystem] ?? 1.0,
    };

    // Check which params this model's endpoint supports — skip unsupported axes
    const { getUnsupportedParams } = await import('../../models/providers.js');
    const endpointUrl = model.endpointUrl || model.endpoint || '';
    const unsupported = endpointUrl ? getUnsupportedParams(endpointUrl) : new Set<string>();
    if (unsupported.size > 0) {
        try {
            console.error(`[autotune] ${subsystem}: skipping unsupported params for ${new URL(endpointUrl).host}: ${[...unsupported].join(', ')}`);
        } catch {
            console.error(`[autotune] ${subsystem}: skipping unsupported params: ${[...unsupported].join(', ')}`);
        }
    }

    // Generate combos: full grid for first in model group, refinement for subsequent
    // Grid axes for unsupported params collapse to defaults (no search wasted)
    const effectiveGrid = constrainGrid(DEFAULT_GRID, unsupported);
    const combos = seedParams
        ? generateRefinementCombos(seedParams, config.maxCombos || 25, unsupported)
        : generateCombos(effectiveGrid, config.maxCombos || 25, currentParams);

    // Collect ALL gold standard prompts for this category.
    // Each combo is tested against every prompt that has gold standards,
    // so parameters must work well across all the subsystem's tasks.
    const category = getSubsystemCategory(subsystem);
    const goldTests: GoldStandardTest[] = [];
    const promptIds = getPromptIdsForCategory(category);
    for (const pid of promptIds) {
        const goldRows = await query(
            `SELECT COUNT(*) as cnt FROM prompt_gold_standards WHERE prompt_id = $1`,
            [pid],
        );
        if ((goldRows[0] as any)?.cnt > 0) {
            const composed = await composeTestPrompt(pid);
            if (composed) {
                goldTests.push({ promptId: pid, composedPrompt: composed });
            }
        }
    }

    if (goldTests.length > 0) {
        console.log(`[autotune] ${subsystem}: scoring against ${goldTests.length} gold standard prompt(s): ${goldTests.map(g => g.promptId).join(', ')}`);
    }

    tuneState.totalCombos = combos.length;
    tuneState.currentCombo = 0;

    const comboResults: ComboResult[] = [];
    const startTime = Date.now();
    const runsPerCombo = config.runsPerCombo || 3;

    // Build flat task list: each task is one LLM call (combo + run pair)
    interface TuneTask {
        comboIdx: number;
        combo: ParamCombo;
        goldTest?: GoldStandardTest;
    }
    const tasks: TuneTask[] = [];
    for (let i = 0; i < combos.length; i++) {
        const combo = combos[i];
        if (goldTests.length > 0) {
            const effectiveRuns = Math.max(runsPerCombo, goldTests.length);
            for (let run = 0; run < effectiveRuns; run++) {
                tasks.push({ comboIdx: i, combo, goldTest: goldTests[run % goldTests.length] });
            }
        } else {
            for (let run = 0; run < runsPerCombo; run++) {
                tasks.push({ comboIdx: i, combo });
            }
        }
    }

    // Concurrent worker pool — respects model's maxConcurrency setting.
    // The model semaphore in callSubsystemModel also gates, but dispatching
    // in parallel here avoids sequential await overhead between calls.
    const concurrency = model.maxConcurrency || 1;
    const taskScores = new Map<number, QualityScore[]>(); // comboIdx → scores
    const completedCombos = new Set<number>();
    let taskIdx = 0;

    async function worker() {
        while (taskIdx < tasks.length && !cancelFlag) {
            const idx = taskIdx++;
            if (idx >= tasks.length) break;
            const task = tasks[idx];

            const score = await runTest(subsystem, task.combo, model, task.goldTest);

            if (!taskScores.has(task.comboIdx)) taskScores.set(task.comboIdx, []);
            taskScores.get(task.comboIdx)!.push(score);

            // Check if this combo is now fully scored
            const runsForCombo = goldTests.length > 0
                ? Math.max(runsPerCombo, goldTests.length)
                : runsPerCombo;
            if (taskScores.get(task.comboIdx)!.length >= runsForCombo && !completedCombos.has(task.comboIdx)) {
                completedCombos.add(task.comboIdx);
                tuneState.currentCombo = completedCombos.size;
            }
        }
    }

    // Launch workers
    const workers = Array.from(
        { length: Math.min(concurrency, tasks.length) },
        () => worker(),
    );
    await Promise.all(workers);

    // Aggregate scores by combo
    for (let i = 0; i < combos.length; i++) {
        const scores = taskScores.get(i) || [];
        const validScores = scores.filter(s => !s.error);
        const avgScore = validScores.length > 0
            ? validScores.reduce((s, q) => s + q.overall, 0) / validScores.length
            : 0;

        comboResults.push({ combo: combos[i], scores, avgScore });

        emitActivity('config', 'autotune_combo',
            `${subsystem}: combo ${i + 1}/${combos.length} = ${(avgScore * 100).toFixed(1)}% [${phase}]`,
            { subsystem, combo: i + 1, total: combos.length, score: avgScore, phase },
        );
    }

    tuneState.currentCombo = combos.length;

    // Sort by score descending
    comboResults.sort((a, b) => b.avgScore - a.avgScore);

    // Variance-weighted selection: when top combos score similarly,
    // prefer the one with lowest variance (most consistent) rather than
    // blindly defaulting to conservative params.
    let selectedCombo = comboResults[0]?.combo || currentParams;
    let selectedScore = comboResults[0]?.avgScore || 0;

    if (comboResults.length >= 3) {
        const top3 = comboResults.slice(0, 3);
        const range = top3[0].avgScore - top3[2].avgScore;
        const threshold = config.convergenceThreshold || 0.05;

        if (range < threshold) {
            // Compute standard deviation of each combo's runs
            const withVariance = top3.map(cr => {
                const valid = cr.scores.filter(s => !s.error).map(s => s.overall);
                let stddev = 0;
                if (valid.length >= 2) {
                    const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
                    stddev = Math.sqrt(valid.reduce((sum, v) => sum + (v - mean) ** 2, 0) / valid.length);
                }
                return { ...cr, stddev };
            });

            // Sort by: lowest variance first, then highest score as tiebreaker
            withVariance.sort((a, b) => {
                const varDiff = a.stddev - b.stddev;
                // If variance differs meaningfully (>1%), prefer lower variance
                if (Math.abs(varDiff) > 0.01) return varDiff;
                // Same variance — prefer higher score
                return b.avgScore - a.avgScore;
            });

            selectedCombo = withVariance[0].combo;
            selectedScore = withVariance[0].avgScore;
        }
    }

    // Find current params score
    const currentResult = comboResults.find(cr =>
        cr.combo.temperature === currentParams.temperature &&
        cr.combo.topP === currentParams.topP &&
        cr.combo.minP === currentParams.minP &&
        cr.combo.topK === currentParams.topK &&
        cr.combo.repeatPenalty === currentParams.repeatPenalty,
    );
    const currentScore = currentResult?.avgScore ?? 0;

    const result: SubsystemTuneResult = {
        subsystem,
        modelName: model.name,
        bestCombo: selectedCombo,
        bestScore: selectedScore,
        allResults: comboResults.slice(0, 10),
        currentParams,
        currentScore,
        improvement: selectedScore - currentScore,
        testedCombos: comboResults.length,
        totalCombos: combos.length,
        elapsedMs: Date.now() - startTime,
        phase,
    };

    return { result, bestCombo: selectedCombo };
}
