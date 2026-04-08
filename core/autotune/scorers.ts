/**
 * @module core/autotune/scorers
 *
 * Heuristic quality scorers for each auto-tune subsystem category.
 *
 * Each scorer analyzes the raw LLM output string and returns a QualityScore
 * with an overall 0-1 composite and per-dimension breakdowns. These are
 * fallbacks when gold standard reference responses are not available.
 */

import type { QualityScore, SubsystemCategory } from './types.js';

// =============================================================================
// SHARED UTILITIES
// =============================================================================

/**
 * Detect repeated multi-word sequences (stutter) in LLM output.
 *
 * Scans for any 3- to 8-word phrase that appears more than once in the text.
 * Stutter is a common failure mode in small/local models with high temperature
 * or repeat-penalty misconfiguration -- it signals the output is degenerate
 * and should score zero on the `noRepetition` dimension regardless of other
 * quality signals.
 *
 * @param text - The LLM output string to check.
 * @returns `true` if any repeated phrase of 3-8 words is found; `false` otherwise.
 */
export function detectStutter(text: string): boolean {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    if (words.length < 6) return false;
    for (let windowSize = 3; windowSize <= Math.min(8, Math.floor(words.length / 2)); windowSize++) {
        for (let i = 0; i <= words.length - windowSize * 2; i++) {
            const phrase = words.slice(i, i + windowSize).join(' ');
            const rest = words.slice(i + windowSize).join(' ');
            if (rest.includes(phrase)) return true;
        }
    }
    return false;
}

/**
 * Compute weighted sum of dimension scores.
 *
 * @param dims - Per-dimension scores (0-1 each)
 * @param weights - Per-dimension weights (should sum to ~1.0)
 * @returns Weighted composite score (0-1)
 */
function composite(dims: Record<string, number>, weights: Record<string, number>): number {
    let overall = 0;
    for (const [k, w] of Object.entries(weights)) overall += (dims[k] || 0) * w;
    return overall;
}

// =============================================================================
// PER-CATEGORY SCORERS
// =============================================================================

/**
 * Score voice/synthesis output. Expects JSON with an `insight` field.
 * Dimensions: jsonValid, completeness (ends with punctuation), length (10-25 words ideal),
 * noRepetition, substance (>20 chars).
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreVoice(output: string): QualityScore {
    const dims: Record<string, number> = {};

    let insight = '';
    try {
        const parsed = JSON.parse(output);
        insight = parsed?.insight || '';
        dims.jsonValid = insight ? 1.0 : 0.5;
    } catch {
        const match = output.match(/"insight"\s*:\s*"([^"]+)"/);
        if (match) { insight = match[1]; dims.jsonValid = 0.7; }
        else { insight = output; dims.jsonValid = 0.0; }
    }

    dims.completeness = /[.!?]["']?$/.test(insight.trim()) ? 1.0 : 0.0;

    const wc = insight.split(/\s+/).filter(Boolean).length;
    if (wc >= 10 && wc <= 25) dims.length = 1.0;
    else if (wc >= 5 && wc <= 35) dims.length = 0.5;
    else dims.length = 0.0;

    const words = insight.toLowerCase().split(/\s+/).filter(Boolean);
    const uniq = new Set(words);
    dims.noRepetition = words.length > 0 ? Math.min(1.0, uniq.size / words.length) : 0;
    if (detectStutter(insight)) dims.noRepetition = 0.0;

    dims.substance = insight.trim().length > 20 ? 1.0 : 0.0;

    return { overall: composite(dims, { jsonValid: 0.30, completeness: 0.25, length: 0.20, noRepetition: 0.15, substance: 0.10 }), dimensions: dims, rawOutput: output };
}

/**
 * Score compress/summarize output. Measures compression ratio, domain term retention,
 * coherence (ends with punctuation), and repetition avoidance.
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreCompress(output: string): QualityScore {
    const dims: Record<string, number> = {};
    const inputLength = 950; // approximate length of compress test prompt content

    const ratio = output.length / inputLength;
    if (ratio < 0.3) dims.compression = 0.5;
    else if (ratio < 0.6) dims.compression = 1.0;
    else if (ratio < 0.8) dims.compression = 0.5;
    else dims.compression = 0.0;

    const expectedTerms = ['embedding', 'similarity', 'nodes', 'weight', 'threshold', 'synthesis', 'cosine', 'decay', 'voicing', 'quality'];
    dims.termRetention = expectedTerms.filter(t => output.toLowerCase().includes(t)).length / expectedTerms.length;

    dims.coherence = /[.!?]$/.test(output.trim()) ? 1.0 : 0.3;
    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;

    return { overall: composite(dims, { compression: 0.30, termRetention: 0.35, coherence: 0.20, noRepetition: 0.15 }), dimensions: dims, rawOutput: output };
}

/**
 * Score chat/research output. Measures substance, completeness, repetition, and length.
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreChat(output: string): QualityScore {
    const dims: Record<string, number> = {};

    dims.substance = output.trim().length > 100 ? 1.0 : output.trim().length > 50 ? 0.5 : 0.0;
    dims.completeness = /[.!?]$/.test(output.trim()) ? 1.0 : 0.0;
    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;

    const wc = output.split(/\s+/).filter(Boolean).length;
    if (wc >= 50 && wc <= 500) dims.length = 1.0;
    else if (wc >= 20 && wc <= 1000) dims.length = 0.5;
    else dims.length = 0.0;

    return { overall: composite(dims, { substance: 0.25, completeness: 0.30, noRepetition: 0.25, length: 0.20 }), dimensions: dims, rawOutput: output };
}

/**
 * Score keyword extraction output. Expects JSON with a `keywords` array.
 * Measures JSON validity, keyword count (5-15 ideal), and keyword quality.
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreKeyword(output: string): QualityScore {
    const dims: Record<string, number> = {};
    let keywords: any[] = [];

    try {
        const parsed = JSON.parse(output);
        keywords = parsed?.keywords || [];
        dims.jsonValid = Array.isArray(keywords) ? 1.0 : 0.5;
    } catch {
        const match = output.match(/\{[\s\S]*\}/);
        if (match) {
            try { const p = JSON.parse(match[0]); keywords = p?.keywords || []; dims.jsonValid = 0.7; }
            catch { dims.jsonValid = 0.0; }
        } else {
            dims.jsonValid = 0.0;
        }
    }

    dims.count = keywords.length >= 5 && keywords.length <= 15 ? 1.0 : keywords.length >= 3 ? 0.5 : 0.0;
    dims.quality = keywords.every((k: any) => typeof k === 'string' && k.length > 1 && k.length < 50) ? 1.0 : 0.5;

    return { overall: composite(dims, { jsonValid: 0.40, count: 0.35, quality: 0.25 }), dimensions: dims, rawOutput: output };
}

/**
 * Score text/PDF/doc reader output. Measures substance, repetition avoidance,
 * completeness, and plain prose (penalizes markdown/table formatting).
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreReader(output: string): QualityScore {
    const dims: Record<string, number> = {};

    dims.substance = output.trim().length > 30 ? 1.0 : 0.0;
    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;
    dims.completeness = /[.!?]$/.test(output.trim()) ? 1.0 : 0.3;
    dims.plainProse = /^[#\-*>]|^\|/m.test(output) ? 0.3 : 1.0;

    return { overall: composite(dims, { substance: 0.25, noRepetition: 0.30, completeness: 0.25, plainProse: 0.20 }), dimensions: dims, rawOutput: output };
}

/**
 * Score image reader output against the test image (produce arranged as a creature).
 * Measures substance, object identification (with regional synonyms), color accuracy,
 * spatial composition recognition, repetition, and specificity.
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreImage(output: string): QualityScore {
    const dims: Record<string, number> = {};
    const text = output.toLowerCase();

    dims.substance = output.trim().length > 50 ? 1.0 : output.trim().length > 20 ? 0.5 : 0.0;

    // Test image contains produce items — LLMs may use regional synonyms
    const objectGroups = [
        ['eggplant', 'aubergine', 'brinjal', 'dark purple vegetable'],
        ['banana', 'bananas', 'yellow fruit', 'curved fruit'],
        ['pepper', 'peppers', 'capsicum', 'bell pepper', 'red pepper', 'orange pepper'],
        ['vegetable', 'fruit', 'produce', 'food', 'grocery'],
    ];
    let objectsFound = 0;
    for (const group of objectGroups) {
        if (group.some(term => text.includes(term))) objectsFound++;
    }
    dims.objectId = Math.min(1.0, objectsFound / 3); // 3 of 4 = full score

    const correctColors = ['purple', 'dark', 'yellow', 'orange', 'red', 'green', 'white'];
    dims.colorAccuracy = Math.min(1.0, correctColors.filter(c => text.includes(c)).length / 3);

    const spatialTerms = ['arrange', 'placed', 'position', 'left', 'right', 'top', 'bottom', 'center',
        'between', 'beside', 'behind', 'front', 'creature', 'figure', 'character', 'animal',
        'horns', 'body', 'feet', 'arms', 'face', 'bull', 'resembl', 'look like', 'shaped',
        'compos', 'creative', 'whimsical', 'playful', 'sculpture', 'art', 'formation'];
    dims.composition = Math.min(1.0, spatialTerms.filter(t => text.includes(t)).length / 3);

    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;

    const wordCount = output.split(/\s+/).filter(Boolean).length;
    dims.specificity = wordCount >= 25 && wordCount <= 250 ? 1.0 : wordCount >= 15 ? 0.5 : 0.0;

    return { overall: composite(dims, { substance: 0.10, objectId: 0.30, colorAccuracy: 0.15, composition: 0.20, noRepetition: 0.15, specificity: 0.10 }), dimensions: dims, rawOutput: output };
}

/**
 * Score spreadsheet reader output. Measures substance, data term retention,
 * numerical content presence, repetition, and interpretation vs echo.
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreSheet(output: string): QualityScore {
    const dims: Record<string, number> = {};
    const text = output.toLowerCase();

    dims.substance = output.trim().length > 30 ? 1.0 : 0.0;

    const dataTerms = ['revenue', 'growth', 'q1', 'q2', 'q3', 'q4', 'total', 'year', 'region', 'north', 'south',
        'table', 'column', 'row', 'data', 'percent', 'average', 'trend', 'increase', 'decrease'];
    dims.dataRetention = Math.min(1.0, dataTerms.filter(t => text.includes(t)).length / 5);

    const numberMatches = output.match(/\d+[.,]?\d*/g) || [];
    dims.numericalContent = Math.min(1.0, numberMatches.length / 3);

    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;
    // Penalize if the model just echoed the table back instead of interpreting it
    dims.interpretation = /\|.*\|/.test(output) ? 0.3 : 1.0;

    return { overall: composite(dims, { substance: 0.15, dataRetention: 0.30, numericalContent: 0.20, noRepetition: 0.20, interpretation: 0.15 }), dimensions: dims, rawOutput: output };
}

/**
 * Score code reader output. Measures substance, code term recognition,
 * specificity (fibonacci/memoize terms), repetition, and plain prose vs code echo.
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreCode(output: string): QualityScore {
    const dims: Record<string, number> = {};
    const text = output.toLowerCase();

    dims.substance = output.trim().length > 30 ? 1.0 : 0.0;

    const codeTerms = ['function', 'class', 'parameter', 'return', 'method', 'variable', 'type', 'argument',
        'array', 'object', 'string', 'number', 'boolean', 'loop', 'condition', 'import', 'export',
        'calculates', 'computes', 'processes', 'validates', 'filters', 'sorts', 'maps', 'reduces',
        'typescript', 'javascript', 'python', 'async'];
    dims.codeRecognition = Math.min(1.0, codeTerms.filter(t => text.includes(t)).length / 4);

    const specifics = ['fibonacci', 'memoize', 'cache', 'recursive', 'sequence', 'memo', 'fib'];
    dims.specificity = Math.min(1.0, specifics.filter(t => text.includes(t)).length / 2);

    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;
    // Penalize if model echoed code blocks instead of summarising
    dims.plainProse = /```|^\s{4}\w/m.test(output) ? 0.3 : 1.0;

    return { overall: composite(dims, { substance: 0.15, codeRecognition: 0.30, specificity: 0.20, noRepetition: 0.20, plainProse: 0.15 }), dimensions: dims, rawOutput: output };
}

/**
 * Score autorating output — composite test with two nodes:
 *
 * Node A: NOT USEFUL lone seed (KB-ingested code description with zero
 *   information density). Expected rating: 0.
 * Node B: USEFUL voiced node with parent context (junk filter self-poisoning
 *   insight — genuine emergence from two parents). Expected rating: 1.
 *
 * Expected format:
 *   [{"node":"A","rating":0,"reason":"..."},{"node":"B","rating":1,"reason":"..."}]
 */
function scoreAutorating(output: string): QualityScore {
    const dims: Record<string, number> = {};
    let entryA: { rating: number | null; reason: string } = { rating: null, reason: '' };
    let entryB: { rating: number | null; reason: string } = { rating: null, reason: '' };

    try {
        const parsed = JSON.parse(output);
        if (Array.isArray(parsed) && parsed.length >= 2) {
            const a = parsed.find((e: any) => e?.node === 'A' || e?.node === 'a');
            const b = parsed.find((e: any) => e?.node === 'B' || e?.node === 'b');
            if (a) entryA = { rating: a.rating ?? null, reason: a.reason || '' };
            if (b) entryB = { rating: b.rating ?? null, reason: b.reason || '' };
            dims.jsonValid = (a && b && a.reason && b.reason) ? 1.0 : 0.5;
        } else if (parsed && !Array.isArray(parsed)) {
            dims.jsonValid = 0.3;
        } else {
            dims.jsonValid = 0.2;
        }
    } catch {
        const matches = [...output.matchAll(/"node"\s*:\s*"([AB])"\s*,\s*"rating"\s*:\s*(-?[01])\s*,\s*"reason"\s*:\s*"([^"]+)"/gi)];
        for (const m of matches) {
            const node = m[1].toUpperCase();
            const rating = parseInt(m[2], 10);
            const reason = m[3];
            if (node === 'A') entryA = { rating, reason };
            if (node === 'B') entryB = { rating, reason };
        }
        dims.jsonValid = matches.length === 2 ? 0.7 : matches.length === 1 ? 0.4 : 0.0;
    }

    // Rating correctness
    dims.ratingCorrectA = entryA.rating === 0 ? 1.0 : entryA.rating === -1 ? 0.3 : 0.0;
    dims.ratingCorrectB = entryB.rating === 1 ? 1.0 : entryB.rating === 0 ? 0.2 : 0.0;

    // Reason word-count quality
    for (const [key, entry] of [['reasonQualityA', entryA], ['reasonQualityB', entryB]] as const) {
        const words = (entry as typeof entryA).reason.split(/\s+/).filter(Boolean).length;
        if (words >= 5 && words <= 50) dims[key] = 1.0;
        else if (words >= 3) dims[key] = 0.5;
        else dims[key] = 0.0;
    }

    // Reason relevance — Node A: identifies absence/low-density
    const relevantTermsA = ['no information', 'no value', 'no substance', 'no useful', 'no specific',
        'zero', 'empty', 'absence', 'nothing', 'lacks', 'lack', 'minimal',
        'vague', 'generic', 'boilerplate', 'trivial', 'obvious',
        'doesn\'t describe', 'doesn\'t provide', 'doesn\'t capture',
        'merely', 'just', 'only', 'import', 'no detail', 'no insight',
        'not useful', 'not actionable', 'not specific', 'low value', 'low information',
        'low density', 'no content', 'describes absence'];
    dims.reasonRelevanceA = Math.min(1.0, relevantTermsA.filter(t => entryA.reason.toLowerCase().includes(t)).length / 2);

    // Reason relevance — Node B: identifies emergence/synthesis value
    const relevantTermsB = ['emergen', 'synthes', 'combin', 'connect', 'insight',
        'not obvious', 'non-obvious', 'couldn\'t know', 'could not know',
        'beyond', 'new understanding', 'novel', 'relationship', 'interaction',
        'consequence', 'implication', 'cross', 'bridge', 'poison', 'self-poison',
        'feedback loop', 'cascade', 'compound', 'amplif', 'chain',
        'specific', 'concrete', 'actionable', 'mechanism', 'causal'];
    dims.reasonRelevanceB = Math.min(1.0, relevantTermsB.filter(t => entryB.reason.toLowerCase().includes(t)).length / 2);

    return {
        overall: composite(dims, {
            jsonValid: 0.15,
            ratingCorrectA: 0.20, ratingCorrectB: 0.20,
            reasonQualityA: 0.08, reasonQualityB: 0.08,
            reasonRelevanceA: 0.15, reasonRelevanceB: 0.14,
        }),
        dimensions: dims,
        rawOutput: output,
    };
}

/**
 * Score EVM codegen output. Expects JSON with hypothesis, code, and evaluationMode.
 * Measures JSON validity, code substance, result variable, valid evaluation mode,
 * hypothesis quality, safety (no dangerous imports), and repetition.
 *
 * @param output - Raw LLM output string
 * @returns Quality score with dimension breakdown
 */
function scoreEvmCodegen(output: string): QualityScore {
    const dims: Record<string, number> = {};
    let hypothesis = '', code = '', evaluationMode = '';

    try {
        const parsed = JSON.parse(output);
        hypothesis = parsed?.hypothesis || '';
        code = parsed?.code || '';
        evaluationMode = parsed?.evaluationMode || '';
        dims.jsonValid = (hypothesis && code && evaluationMode) ? 1.0 : 0.5;
    } catch {
        const codeMatch = output.match(/"code"\s*:\s*"([\s\S]*?)(?:"\s*[,}])/);
        const hypoMatch = output.match(/"hypothesis"\s*:\s*"([^"]+)"/);
        const modeMatch = output.match(/"evaluationMode"\s*:\s*"([^"]+)"/);
        if (codeMatch) code = codeMatch[1];
        if (hypoMatch) hypothesis = hypoMatch[1];
        if (modeMatch) evaluationMode = modeMatch[1];
        dims.jsonValid = code ? 0.5 : 0.0;
    }

    const codeLines = code.split('\n').filter((l: string) => l.trim().length > 0);
    dims.codeSubstance = codeLines.length >= 3 ? 1.0 : codeLines.length >= 1 ? 0.5 : 0.0;
    dims.resultVar = /\bresult\s*=/.test(code) ? 1.0 : 0.0;
    dims.validMode = ['boolean', 'numerical', 'convergence', 'pattern'].includes(evaluationMode) ? 1.0 : 0.0;

    const hypoWords = hypothesis.split(/\s+/).filter(Boolean).length;
    dims.hypothesis = hypoWords >= 5 && hypoWords <= 50 ? 1.0 : hypoWords >= 3 ? 0.5 : 0.0;

    dims.safety = /\b(exec|eval|open|__import__|os\.|subprocess|sys\.)/i.test(code) ? 0.0 : 1.0;
    dims.noRepetition = detectStutter(code) ? 0.0 : 1.0;

    return { overall: composite(dims, { jsonValid: 0.25, codeSubstance: 0.20, resultVar: 0.15, validMode: 0.10, hypothesis: 0.10, safety: 0.10, noRepetition: 0.10 }), dimensions: dims, rawOutput: output };
}

/**
 * Score EVM triage output — gold standard has 4 claims, expects a JSON array
 * with correct testCategory for each:
 *   [0]=numerical  [1]=structural  [2]=domain_expert  [3]=not_testable
 */
function scoreEvmTriage(output: string): QualityScore {
    const dims: Record<string, number> = {};
    const EXPECTED: string[] = ['numerical', 'structural', 'domain_expert', 'not_testable'];
    const VALID_CATEGORIES = new Set(EXPECTED);
    // Claim types are open-ended (labs define their own) — just check a non-empty string exists
    const KNOWN_CLAIM_TYPES = new Set(['numerical_identity', 'convergence_rate', 'symbolic_identity', 'curve_shape', 'threshold_behaviour', 'structural_mapping', 'training_performance', 'model_behavior', 'qualitative']);

    let items: any[] = [];
    try {
        const parsed = JSON.parse(output);
        if (Array.isArray(parsed) && parsed.length === 4) { items = parsed; dims.jsonValid = 1.0; }
        else if (Array.isArray(parsed)) { items = parsed; dims.jsonValid = 0.5; }
        else if (parsed?.testCategory) { items = [parsed]; dims.jsonValid = 0.3; }
        else { dims.jsonValid = 0.1; }
    } catch {
        const matches = output.match(/"testCategory"\s*:\s*"(\w+)"/g);
        dims.jsonValid = matches && matches.length > 0 ? 0.2 : 0.0;
    }

    // Category accuracy vs gold standard
    let correctCount = 0;
    for (let i = 0; i < EXPECTED.length; i++) {
        if (items[i]?.testCategory === EXPECTED[i]) correctCount++;
    }
    dims.categoryAccuracy = items.length > 0 ? correctCount / EXPECTED.length : 0.0;

    dims.validCategories = items.length > 0
        ? items.filter(item => item?.testCategory && VALID_CATEGORIES.has(item.testCategory)).length / items.length
        : 0.0;

    // Confidence calibration (0.7+ = full, 0.5+ = partial)
    let confScore = 0;
    for (const item of items) {
        const c = item?.confidence ?? 0;
        if (c >= 0.7) confScore += 1.0;
        else if (c >= 0.5) confScore += 0.7;
        else if (c >= 0.3) confScore += 0.3;
    }
    dims.confidenceCalibration = items.length > 0 ? confScore / items.length : 0.0;

    // Reason quality per item
    let reasonScore = 0;
    for (const item of items) {
        const words = (item?.reason || '').split(/\s+/).filter(Boolean).length;
        if (words >= 5) reasonScore += 1.0;
        else if (words >= 3) reasonScore += 0.5;
    }
    dims.reasonQuality = items.length > 0 ? reasonScore / items.length : 0.0;

    // Hypothesis quality — not_testable should have null/empty; others should be substantive
    let hypoScore = 0;
    for (let i = 0; i < items.length; i++) {
        const hypo = items[i]?.hypothesis || '';
        const hypoWords = hypo.split(/\s+/).filter(Boolean).length;
        if (EXPECTED[i] === 'not_testable') {
            hypoScore += (!hypo || hypo === 'null') ? 1.0 : 0.5;
        } else {
            hypoScore += hypoWords >= 5 ? 1.0 : hypoWords >= 3 ? 0.5 : 0.0;
        }
    }
    dims.hypothesis = items.length > 0 ? hypoScore / items.length : 0.0;

    dims.claimTypeValid = items.length > 0
        ? items.filter(item => item?.claimType && typeof item.claimType === 'string' && item.claimType.length > 0).length / items.length
        : 0.0;

    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;

    return {
        overall: composite(dims, {
            jsonValid: 0.15,
            categoryAccuracy: 0.30,
            validCategories: 0.10,
            confidenceCalibration: 0.10,
            reasonQuality: 0.10,
            hypothesis: 0.10,
            claimTypeValid: 0.10,
            noRepetition: 0.05,
        }),
        dimensions: dims,
        rawOutput: output,
    };
}

/** Score dedup_judge output — expects NOVEL/DUPLICATE verdict + reason. */
function scoreDedupJudge(output: string): QualityScore {
    const dims: Record<string, number> = {};
    const trimmed = output.trim();

    const hasNovel = /\bNOVEL\b/.test(trimmed);
    const hasDuplicate = /\bDUPLICATE\b/.test(trimmed);
    dims.verdict = (hasNovel || hasDuplicate) ? 1.0 : 0.0;
    dims.unambiguous = (hasNovel !== hasDuplicate) ? 1.0 : 0.0;

    const explanationWords = trimmed.split('\n').filter(l => l.trim().length > 0).join(' ').replace(/\b(NOVEL|DUPLICATE)\b/g, '').split(/\s+/).filter(Boolean).length;
    dims.explanation = explanationWords >= 5 ? 1.0 : explanationWords >= 2 ? 0.5 : 0.0;

    const totalWords = trimmed.split(/\s+/).filter(Boolean).length;
    dims.concise = totalWords <= 50 ? 1.0 : totalWords <= 100 ? 0.7 : 0.3;

    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;

    return { overall: composite(dims, { verdict: 0.35, unambiguous: 0.20, explanation: 0.20, concise: 0.15, noRepetition: 0.10 }), dimensions: dims, rawOutput: output };
}

/** Score evm_analysis output — expects JSON with analysisCode + expectedFindings. */
function scoreEvmAnalysis(output: string): QualityScore {
    const dims: Record<string, number> = {};
    let parsed: any = null;

    try {
        parsed = JSON.parse(output);
        dims.jsonValid = 1.0;
    } catch {
        const match = output.match(/\{[\s\S]*\}/);
        if (match) {
            try { parsed = JSON.parse(match[0]); dims.jsonValid = 0.5; }
            catch { dims.jsonValid = 0.0; }
        } else {
            dims.jsonValid = 0.0;
        }
    }

    const code = parsed?.analysisCode || '';
    const codeLines = code.split('\n').filter((l: string) => l.trim().length > 0).length;
    dims.hasCode = codeLines >= 10 ? 1.0 : codeLines >= 5 ? 0.7 : codeLines > 0 ? 0.3 : 0.0;
    dims.setsResult = /\bresult\s*=/.test(code) ? 1.0 : 0.0;
    dims.usesAnalysis = /\b(mpmath|sympy|numpy|scipy|identify|simplify|solve|nsum)\b/.test(code) ? 1.0 : 0.0;

    const findings = parsed?.expectedFindings || '';
    dims.hasFindings = findings.length > 20 ? 1.0 : findings.length > 0 ? 0.5 : 0.0;
    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;

    return { overall: composite(dims, { jsonValid: 0.20, hasCode: 0.25, setsResult: 0.20, usesAnalysis: 0.15, hasFindings: 0.10, noRepetition: 0.10 }), dimensions: dims, rawOutput: output };
}

/** Score evm_structural / evm_expert output — expects JSON verdict with reasoning. */
function scoreEvmEval(output: string): QualityScore {
    const dims: Record<string, number> = {};
    const VALID_VERDICTS = new Set(['supported', 'unsupported', 'uncertain']);
    let parsed: any = null;

    try {
        parsed = JSON.parse(output);
        dims.jsonValid = 1.0;
    } catch {
        const match = output.match(/\{[\s\S]*\}/);
        if (match) {
            try { parsed = JSON.parse(match[0]); dims.jsonValid = 0.5; }
            catch { dims.jsonValid = 0.0; }
        } else {
            dims.jsonValid = 0.0;
        }
    }

    dims.validVerdict = (parsed?.verdict && VALID_VERDICTS.has(parsed.verdict)) ? 1.0 : 0.0;

    const conf = parsed?.confidence;
    dims.validConfidence = (typeof conf === 'number' && conf >= 0 && conf <= 1) ? 1.0 : 0.0;

    const reasonWords = (parsed?.reasoning || '').split(/\s+/).filter(Boolean).length;
    dims.reasoningQuality = reasonWords >= 30 ? 1.0 : reasonWords >= 15 ? 0.7 : reasonWords >= 5 ? 0.3 : 0.0;

    const factors = parsed?.keyFactors;
    dims.hasKeyFactors = (Array.isArray(factors) && factors.length >= 2) ? 1.0 : (Array.isArray(factors) && factors.length > 0) ? 0.5 : 0.0;

    const delta = parsed?.suggestedWeightDelta;
    dims.validDelta = (typeof delta === 'number' && delta >= -0.3 && delta <= 0.3) ? 1.0 : 0.0;

    dims.noRepetition = detectStutter(output) ? 0.0 : 1.0;

    return { overall: composite(dims, { jsonValid: 0.20, validVerdict: 0.20, validConfidence: 0.10, reasoningQuality: 0.20, hasKeyFactors: 0.10, validDelta: 0.10, noRepetition: 0.10 }), dimensions: dims, rawOutput: output };
}

// =============================================================================
// SCORER REGISTRY
// =============================================================================

export const SCORERS: Record<SubsystemCategory, (output: string) => QualityScore> = {
    voice: scoreVoice,
    compress: scoreCompress,
    chat: scoreChat,
    keyword: scoreKeyword,
    autorating: scoreAutorating,
    reader: scoreReader,
    reader_image: scoreImage,
    reader_sheet: scoreSheet,
    reader_code: scoreCode,
    spec_extraction: scoreChat,
    dedup_judge: scoreDedupJudge,
    evm_analysis: scoreEvmAnalysis,
};
