/**
 * Scoring, embedding math, and content quality detection.
 *
 * This is the **canonical source** for all embedding operations -- every other
 * module imports cosine similarity, parsing, normalization, and binary
 * conversion from here (or via the `core/` barrel).
 *
 * **Embedding math:** `parseEmbedding` handles JSON string, Buffer, and raw
 * array inputs. `l2Normalize` converts to unit vectors so cosine similarity
 * reduces to a dot product. `embeddingToBuffer`/`bufferToEmbedding` provide
 * ~4x storage savings via Float32 binary encoding.
 *
 * **Node scoring:** `scoreResonance` computes pairwise similarity (cosine when
 * embeddings exist, Jaccard word-overlap fallback otherwise). This score
 * determines whether two nodes are paired for synthesis.
 *
 * **Hallucination detection:** `detectHallucination` runs 7 heuristic checks
 * (fabricated numbers, future predictions, extreme multipliers, ungrounded
 * financial claims, novel word ratio, verbosity, cross-domain number
 * transplantation) and flags content when red flags exceed a configurable
 * threshold. Supports per-model-tier overrides.
 *
 * **Domain concentration:** `checkDomainConcentration` detects when a single
 * domain dominates recent proposals within a time window, throttling further
 * intake to prevent flooding. KB-ingested and api-enrichment nodes are exempt.
 *
 * **Injection detection:** `detectInjection` pattern-matches against known
 * prompt injection strategies (instruction overrides, role overrides, template
 * injection, etc.) using weighted scoring with a configurable threshold.
 */

import { config as appConfig } from '../config.js';
import { query as dbQuery, queryOne as dbQueryOne } from '../db.js';
import { resolveContent } from './number-variables.js';
import type { ResonanceNode } from './types.js';

// =============================================================================
// EMBEDDING UTILITIES
// =============================================================================

/**
 * Parse an embedding from its stored form (JSON string, Buffer, or number array).
 *
 * @param emb - The embedding in any supported storage format.
 * @returns A plain number array, or null if the input is falsy or unparseable.
 */
function parseEmbedding(emb: string | number[] | Buffer | null | undefined): number[] | null {
    if (!emb) return null;
    if (Array.isArray(emb)) return emb;
    if (Buffer.isBuffer(emb)) return bufferToEmbedding(emb);
    if (typeof emb === 'string') {
        try { return JSON.parse(emb); }
        catch { return null; }
    }
    return null;
}

/**
 * L2-normalize an embedding vector to unit length.
 * After normalization, cosine similarity = dot product (much faster).
 *
 * @param vec - The raw embedding vector.
 * @returns A new array with unit length, or the original if the norm is zero.
 */
function l2Normalize(vec: number[]): number[] {
    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return vec;
    const result = new Array(vec.length);
    for (let i = 0; i < vec.length; i++) result[i] = vec[i] / norm;
    return result;
}

/**
 * Convert a number[] embedding to a compact binary Buffer (Float32Array).
 * ~4x smaller than JSON string and ~10-50x faster to parse.
 *
 * @param emb - The embedding as a number array.
 * @returns A Buffer containing the Float32 binary representation.
 */
function embeddingToBuffer(emb: number[]): Buffer {
    const f32 = new Float32Array(emb);
    return Buffer.from(f32.buffer);
}

/**
 * Convert a binary Buffer back to a number[] embedding.
 *
 * @param buf - A Buffer produced by {@link embeddingToBuffer}.
 * @returns The embedding as a plain number array.
 */
function bufferToEmbedding(buf: Buffer): number[] {
    const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
    return Array.from(f32);
}

// =============================================================================
// SIMILARITY FUNCTIONS
// =============================================================================

/**
 * Dot product of two vectors. For pre-normalized (unit) vectors, this equals cosine similarity.
 *
 * @param a - First vector.
 * @param b - Second vector.
 * @returns The dot product, or 0 if lengths differ.
 */
function dotProduct(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let sum = 0;
    for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
    return sum;
}

/**
 * Cosine similarity between two embedding vectors.
 * Handles null, string (JSON), Buffer, and number[] inputs.
 *
 * @param a - First embedding in any supported format.
 * @param b - Second embedding in any supported format.
 * @returns Cosine similarity in [-1, 1], or 0 if either input is null/unparseable or dimensions differ.
 */
function cosineSimilarity(a: number[] | string | Buffer | null, b: number[] | string | Buffer | null): number {
    const vecA = Array.isArray(a) ? a : parseEmbedding(a as any);
    const vecB = Array.isArray(b) ? b : parseEmbedding(b as any);
    if (!vecA || !vecB) return 0;
    if (vecA.length !== vecB.length) {
        console.warn(`[scoring] Dimension mismatch: ${vecA.length} vs ${vecB.length}. Embeddings may need re-embedding after model change.`);
        return 0;
    }

    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dot += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude > 0 ? dot / magnitude : 0;
}

// =============================================================================
// RESONANCE SCORING
// =============================================================================

/**
 * Computes similarity between two nodes from embeddings (cosine) or, if missing, from word overlap (Jaccard).
 *
 * @param nodeA - First node (must have `content`; optionally `embedding`).
 * @param nodeB - Second node (must have `content`; optionally `embedding`).
 * @returns Similarity score in [0, 1].
 */
async function scoreResonance(nodeA: ResonanceNode, nodeB: ResonanceNode): Promise<number> {
    // If both have embeddings, use cosine similarity
    if (nodeA.embedding && nodeB.embedding) {
        const embA = parseEmbedding(nodeA.embedding);
        const embB = parseEmbedding(nodeB.embedding);
        if (embA && embB) return cosineSimilarity(embA, embB);
    }

    // Fallback: simple text overlap (crude but works for testing)
    const wordsA = new Set(nodeA.content.toLowerCase().split(/\s+/));
    const wordsB = new Set(nodeB.content.toLowerCase().split(/\s+/));
    const intersection = [...wordsA].filter((w: string) => wordsB.has(w));
    const union = new Set([...wordsA, ...wordsB]);
    return intersection.length / union.size;  // Jaccard similarity
}

/**
 * Build a Set of synthesis vocabulary words from config.
 * Used so novelty checks exclude analytical/connective synthesis words from hallucination detection.
 * Rebuilt on each call (~60 words, negligible cost) to avoid caching/invalidation complexity.
 *
 * @returns A Set of lowercase synthesis vocabulary words.
 */
function getSynthesisVocabulary(): Set<string> {
    return new Set(appConfig.hallucination.synthesisVocabulary);
}

/**
 * Resolve hallucination config with per-tier overrides merged over global defaults.
 * Tier-specific values win over global values for the overridable subset.
 *
 * @param tier - Optional model tier (e.g. 'tier1', 'tier2'). If absent or no overrides exist, returns global config.
 * @returns The merged hallucination configuration object.
 */
function resolveHallucinationConfig(tier?: string | null) {
    const global = appConfig.hallucination;
    if (!tier || !global.tierOverrides?.[tier]) return global;
    const override = global.tierOverrides[tier];
    return {
        ...global,
        ...(override.fabricatedNumberCheck !== undefined && { fabricatedNumberCheck: override.fabricatedNumberCheck }),
        ...(override.largeNumberThreshold !== undefined && { largeNumberThreshold: override.largeNumberThreshold }),
        ...(override.maxVerboseWords !== undefined && { maxVerboseWords: override.maxVerboseWords }),
        ...(override.minRedFlags !== undefined && { minRedFlags: override.minRedFlags }),
        ...(override.novelRatioThreshold !== undefined && { novelRatioThreshold: override.novelRatioThreshold }),
    };
}

/**
 * Detect likely hallucinated content using generic heuristics.
 *
 * IMPORTANT: Check #5 (novel word ratio) excludes common synthesis vocabulary
 * to avoid penalizing valid novel inference. Synthesis naturally introduces
 * analytical/connective words absent from parents — these are tools of
 * inference, not hallucination signals. See breakthrough 649b7cb2.
 *
 * @param content - The synthesized output text to check.
 * @param sourceNodes - The parent/source nodes the output was generated from.
 * @param tier - Optional model tier (e.g. 'tier1', 'tier2'). When provided, per-tier
 *   overrides from config.hallucination.tierOverrides are merged over globals.
 * @returns An object with `isHallucination` (true if red flags >= threshold) and `reasons` (list of flagged issues).
 */
async function detectHallucination(content: string, sourceNodes: ResonanceNode[], tier?: string | null) {
    const hCfg = resolveHallucinationConfig(tier);
    const reasons: string[] = [];
    // Resolve number variable placeholders ([[[NXnnn]]]) to actual values before comparison.
    // Without this, source content has placeholders but LLM output has raw numbers,
    // causing every legitimately-used number to be flagged as "fabricated".
    const resolvedSources = await Promise.all(sourceNodes.map(n => resolveContent(n.content)));
    const sourceText = resolvedSources.join(' ').toLowerCase();
    const outputText = content.toLowerCase();

    // 1. Suspiciously precise numbers not in sources (81.3%, 0.0195, 8000)
    const numberRe = new RegExp(hCfg.numberPattern, 'g');
    const outputNumbers = content.match(numberRe) || [];
    const sourceNumbers = sourceText.match(numberRe) || [];
    const sourceNumSet = new Set(sourceNumbers);

    if (hCfg.fabricatedNumberCheck) {
        const roundNumRe = new RegExp(hCfg.roundNumberPattern);
        const fabricatedNumbers = outputNumbers.filter((n: string) => {
            // Ignore small round numbers (likely valid)
            if (roundNumRe.test(n)) return false;
            // Precise decimals not in source are suspicious
            if (n.includes('.') && !sourceNumSet.has(n)) return true;
            // Large specific numbers not in source are suspicious
            if (parseInt(n, 10) > hCfg.largeNumberThreshold && !sourceNumSet.has(n)) return true;
            return false;
        });

        if (fabricatedNumbers.length > 0) {
            reasons.push(`fabricated numbers: ${fabricatedNumbers.slice(0, 3).join(', ')}`);
        }
    }

    // 2. Future predictions with specific years
    const futureYearRe = new RegExp(hCfg.futureYearPattern, 'i');
    if (futureYearRe.test(content)) {
        reasons.push('fabricated future prediction');
    }

    // 3. Extreme multipliers not in sources (1000x, 50x)
    const multiplierRe = new RegExp(hCfg.multiplierPattern, 'gi');
    const outputMultipliers = content.match(multiplierRe) || [];
    const sourceMultipliers = sourceText.match(multiplierRe) || [];
    if (outputMultipliers.length > 0 && sourceMultipliers.length === 0) {
        reasons.push('fabricated multiplier');
    }

    // 4. Financial/quantitative claims not grounded in sources
    const financialClaimRe = new RegExp(hCfg.financialClaimPattern, 'i');
    const financialTermsRe = new RegExp(hCfg.financialTerms, 'i');
    if (financialClaimRe.test(content) && !financialTermsRe.test(sourceText)) {
        reasons.push('ungrounded financial claim');
    }

    // 5. Output contains many novel words not from either source (possible hallucination)
    // Excludes synthesis vocabulary — analytical/connective words that naturally appear
    // when generating inferences, even when absent from parent nodes.
    const minLen = hCfg.novelWordMinLength;
    const synthVocab = getSynthesisVocabulary();
    const sourceWords = new Set(sourceText.split(/\s+/).filter(w => w.length > minLen));
    const outputWords = outputText.split(/\s+/).filter(w => w.length > minLen);
    const novelWords = outputWords.filter(w => !sourceWords.has(w) && !synthVocab.has(w));
    const novelRatio = outputWords.length > 0 ? novelWords.length / outputWords.length : 0;

    if (novelRatio > hCfg.novelRatioThreshold && outputWords.length > hCfg.minOutputWordsForNoveltyCheck) {
        reasons.push(`mostly novel content (not grounded in sources, ${novelWords.length}/${outputWords.length} after synthesis vocab exclusion)`);
    }

    // 6. Very long output (likely reasoning leaked through)
    if (content.split(/\s+/).length > hCfg.maxVerboseWords) {
        reasons.push('suspiciously verbose');
    }

    // 7. Cross-domain number transplantation
    // When sources are from different domains, specific numbers from one source
    // should not be universalized into the synthesis output. A number like "1-5%"
    // from biology should not become a universal constant applied to engineering.
    if (hCfg.crossDomainNumberCheck && sourceNodes.length >= 2) {
        const domains = sourceNodes.map(n => n.domain).filter(Boolean);
        const uniqueDomains = new Set(domains);
        if (uniqueDomains.size > 1) {
            const trivialRe = new RegExp(hCfg.crossDomainTrivialPattern);
            // Extract numbers per source
            const perSourceNumbers = sourceNodes.map(n => {
                const nums = n.content.match(numberRe) || [];
                return new Set(nums.filter((num: string) => !trivialRe.test(num)));
            });
            for (let i = 0; i < sourceNodes.length; i++) {
                for (const num of perSourceNumbers[i]) {
                    // Check if this number is exclusive to source i (not in any other source)
                    const exclusiveToI = sourceNodes.every((_, j) => j === i || !perSourceNumbers[j].has(num));
                    if (exclusiveToI && outputNumbers.some((on: string) => on === num)) {
                        reasons.push(`number scope violation: "${num}" from ${sourceNodes[i].domain} transplanted into cross-domain synthesis`);
                        break; // One violation is enough
                    }
                }
                if (reasons.some(r => r.startsWith('number scope'))) break;
            }
        }
    }

    return {
        isHallucination: reasons.length >= hCfg.minRedFlags,
        reasons
    };
}

/**
 * Detect likely prompt injection attempts in proposed content.
 * Pattern-based only — no LLM calls. Follows the same architecture as
 * detectHallucination: accumulate weighted red flags, compare against threshold.
 *
 * Returns { isInjection: boolean, reasons: string[], score: number }
 */
function detectInjection(content: string): { isInjection: boolean; reasons: string[]; score: number } {
    const iCfg = appConfig.injection;
    const reasons: string[] = [];
    let score = 0;

    const patternGroups: Array<{ name: string; patterns: string[]; weight: number }> = [
        { name: 'instruction_override', patterns: iCfg.instructionOverridePatterns, weight: 2 },
        { name: 'role_override',        patterns: iCfg.roleOverridePatterns,        weight: 1 },
        { name: 'prompt_structure',     patterns: iCfg.promptStructurePatterns,     weight: 2 },
        { name: 'template_injection',   patterns: iCfg.templateInjectionPatterns,   weight: 2 },
        { name: 'structure_breaking',   patterns: iCfg.structureBreakingPatterns,   weight: 1 },
        { name: 'system_prompt',        patterns: iCfg.systemPromptPatterns,        weight: 1 },
    ];

    for (const group of patternGroups) {
        for (const patternStr of group.patterns) {
            try {
                const re = new RegExp(patternStr, 'i');
                if (re.test(content)) {
                    const match = content.match(re);
                    reasons.push(`${group.name}: "${match?.[0]?.slice(0, 40)}"`);
                    score += group.weight;
                    break; // One match per group is enough
                }
            } catch {
                // Invalid regex pattern in config, skip
            }
        }
    }

    return { isInjection: score >= iCfg.scoreThreshold, reasons, score };
}

/**
 * Result of a domain concentration check within a time window.
 */
interface ConcentrationResult {
    ratio: number;
    warning: boolean;
    throttled: boolean;
    domainCount: number;
    totalCount: number;
}

/**
 * Check domain concentration within a time window.
 * Detects when a single domain dominates recent proposals — a sign of
 * either accidental flooding or adversarial fitness landscape manipulation.
 *
 * KB-ingested nodes and api-enrichment nodes are excluded from concentration counts
 * because bulk ingestion naturally floods a single domain.
 *
 * @param domain - The domain to check concentration for.
 * @param cfg - Intake defense configuration (windowHours, thresholds, minProposals).
 * @returns Concentration ratio, warning/throttle flags, and raw counts.
 */
async function checkDomainConcentration(
    domain: string,
    cfg: typeof appConfig.intakeDefense
): Promise<ConcentrationResult> {
    const cutoff = new Date(Date.now() - cfg.windowHours * 3600_000).toISOString();

    // Exclude KB-ingested nodes (contributor starts with 'kb:') from concentration counts.
    // KB ingestion naturally floods a single domain — this is expected behavior, not abuse.
    // The concentration check protects against runaway autonomous cycles, not legitimate bulk seeding.
    const totalRow = await dbQueryOne(
        `SELECT COUNT(*) as cnt FROM nodes WHERE archived = FALSE AND node_type != 'raw' AND contributor NOT LIKE 'kb:%' AND contributor NOT LIKE 'api-enrichment:%' AND created_at >= $1`,
        [cutoff]
    );
    const totalCount = parseInt(totalRow?.cnt, 10) || 0;

    if (totalCount < cfg.minProposalsForCheck) {
        return { ratio: 0, warning: false, throttled: false, domainCount: 0, totalCount };
    }

    // Count distinct active domains. In projects with few domains, high concentration
    // is natural — the throttle should only fire when one domain drowns out many others.
    const distinctRow = await dbQueryOne(
        `SELECT COUNT(DISTINCT domain) as cnt FROM nodes WHERE archived = FALSE AND node_type != 'raw' AND contributor NOT LIKE 'kb:%' AND contributor NOT LIKE 'api-enrichment:%' AND created_at >= $1`,
        [cutoff]
    );
    const distinctDomains = parseInt(distinctRow?.cnt, 10) || 1;

    const domainRow = await dbQueryOne(
        `SELECT COUNT(*) as cnt FROM nodes WHERE archived = FALSE AND node_type != 'raw' AND contributor NOT LIKE 'kb:%' AND contributor NOT LIKE 'api-enrichment:%' AND domain = $1 AND created_at >= $2`,
        [domain, cutoff]
    );
    const domainCount = parseInt(domainRow?.cnt, 10) || 0;
    const ratio = domainCount / totalCount;

    // Skip throttle for projects with fewer than 3 active domains —
    // concentration is naturally high and doesn't indicate abuse
    const skipThrottle = distinctDomains < 3;

    return {
        ratio,
        warning: !skipThrottle && ratio >= cfg.concentrationThreshold,
        throttled: !skipThrottle && ratio >= cfg.throttleThreshold,
        domainCount,
        totalCount,
    };
}

// =============================================================================
// DOMAIN DRIFT DETECTION
// =============================================================================

/**
 * Result of a domain drift check.
 */
interface DomainDriftResult {
    /** Whether the content drifted from the domain's seed centroid. */
    drifted: boolean;
    /** Cosine similarity to domain seed centroid (0 = no seeds available). */
    similarity: number;
    /** Threshold used for rejection. */
    threshold: number;
}

/**
 * Check whether voiced/synthesized content has drifted from its target domain.
 *
 * Uses the instruct embedding system (Qwen3-Embedding via `embedding-eval`)
 * to embed the new content with `instructDomainContribution` (query mode),
 * making the comparison domain-vocabulary-sensitive. The seed centroid uses
 * the pre-cached `embedding_bin` from the nodes table (no API call needed).
 *
 * Falls back to regular embedding comparison if the instruct embedding
 * service is unavailable or embedding-eval is disabled.
 *
 * Returns `{ drifted: false }` (allowing the content) when:
 * - No target domain is specified
 * - Fewer than 3 seed/breakthrough nodes exist (insufficient anchoring)
 * - Both instruct and fallback embedding calls fail
 *
 * @param content - The voiced/synthesized text to check
 * @param targetDomain - Domain the content is being assigned to
 * @param existingEmbedding - Pre-computed regular embedding, used as fallback
 * @returns DomainDriftResult with similarity score and drift verdict
 */
async function checkDomainDrift(
    content: string,
    targetDomain: string | null | undefined,
    existingEmbedding?: number[] | null,
): Promise<DomainDriftResult> {
    const threshold = appConfig.autonomousCycles?.research?.relevanceThreshold ?? 0.5;

    if (!targetDomain) return { drifted: false, similarity: 0, threshold };

    try {
        // Fetch seed/breakthrough embeddings from nodes table (already cached, no API calls)
        const seedRows = await dbQuery(`
            SELECT id, embedding_bin, embedding FROM nodes
            WHERE archived = FALSE AND domain = $1
              AND node_type IN ('seed', 'breakthrough')
            ORDER BY weight DESC LIMIT 10
        `, [targetDomain]);

        const vectors = seedRows
            .map((row: any) => parseEmbedding(row.embedding_bin ?? row.embedding))
            .filter((v: number[] | null): v is number[] => v !== null);

        if (vectors.length < 3) return { drifted: false, similarity: 0, threshold };

        // Compute seed centroid (from pre-cached node embeddings — zero API calls)
        const dim = vectors[0].length;
        const centroid = new Array(dim).fill(0);
        for (const vec of vectors) {
            for (let i = 0; i < dim; i++) centroid[i] += vec[i] / vectors.length;
        }

        // Try instruct embedding for content (Qwen3 domain-contribution instruction)
        // This makes the comparison domain-vocabulary-sensitive: ML content dressed
        // in domain clothing will score lower than genuinely domain-native content.
        const evalEnabled = appConfig.embeddingEval?.enabled;
        if (evalEnabled) {
            try {
                const { getInstructionEmbedding, cosineSim } = await import('./embedding-eval.js');
                const instruction = appConfig.embeddingEval.instructDomainContribution
                    || 'Represent the domain-specific technical content contributed by this text';

                // Synthetic node ID for cache — keyed by domain so different domains don't collide
                const contentVec = await getInstructionEmbedding(
                    `drift-check-${targetDomain}`, content, instruction
                );

                if (contentVec) {
                    // Note: instruct model dimensions may differ from main embedding model.
                    // If dimensions match the centroid, use instruct comparison; otherwise fall through.
                    if (contentVec.length === dim) {
                        const similarity = cosineSim(contentVec, centroid);
                        return { drifted: similarity < threshold, similarity, threshold };
                    }
                }
            } catch (err: any) {
                // Instruct embedding unavailable — fall through to regular comparison
                console.error(`[domain-drift] Instruct embedding failed, using fallback: ${err.message}`);
            }
        }

        // Fallback: use pre-computed regular embedding
        const contentEmbedding = existingEmbedding ?? null;
        if (!contentEmbedding) return { drifted: false, similarity: 0, threshold };

        const similarity = cosineSimilarity(contentEmbedding, centroid);
        return { drifted: similarity < threshold, similarity, threshold };
    } catch (err: any) {
        console.error(`[domain-drift] Check failed for "${targetDomain}", allowing: ${err.message}`);
        return { drifted: false, similarity: 0, threshold };
    }
}

export {
    // Similarity
    cosineSimilarity,
    dotProduct,
    scoreResonance,
    // Embedding utilities
    parseEmbedding,
    l2Normalize,
    embeddingToBuffer,
    bufferToEmbedding,
    // Quality
    detectHallucination,
    detectInjection,
    checkDomainConcentration,
    // Domain drift
    checkDomainDrift,
};
