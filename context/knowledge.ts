/**
 * @module context/knowledge
 *
 * Context engine knowledge selection, intent detection, and prompt building.
 *
 * Detects user intent (retrieval, action, diagnosis, exploration) via regex
 * heuristics and adjusts relevance signal weights accordingly. Selects the most
 * relevant graph nodes using a 5-signal scoring model (embedding similarity,
 * topic match, node weight, recency, concept cluster match). Builds a structured
 * system prompt from the selected knowledge, with compact formatting for
 * smaller model profiles.
 */
import { query } from '../db.js';
import { getEmbedding } from '../models.js';
import {
    cosineSimilarity,
    getAccessibleDomains,
} from '../core.js';
import { resolveContent } from '../core/number-variables.js';
import { buildProvenanceTag, PROVENANCE_GUIDE_USER } from '../core/provenance.js';
import { getConfig, getModelProfiles, estimateTokens, getDynamicBudgets } from './types.js';
import type { QueryIntent } from './types.js';

// =============================================================================
// INTENT DETECTION
// =============================================================================

// Compiled regex cache — invalidated when config pattern strings change
let _compiledPatterns: Record<QueryIntent, RegExp[]> | null = null;
let _lastPatternSource: string | null = null;

/**
 * Get compiled regex patterns from config, with caching.
 * Recompiles only when the source strings change.
 */
function getCompiledIntentPatterns(): Record<QueryIntent, RegExp[]> {
    const patterns = getConfig().intentPatterns;
    const sourceKey = JSON.stringify(patterns);

    if (_compiledPatterns && _lastPatternSource === sourceKey) {
        return _compiledPatterns;
    }

    const compiled: Record<string, RegExp[]> = {};
    for (const [intent, strings] of Object.entries(patterns)) {
        compiled[intent] = (strings as string[]).map((s: string) => {
            try {
                return new RegExp(s, 'i');
            } catch {
                console.warn(`[context-engine] Invalid intent pattern for ${intent}: ${s}`);
                return null;
            }
        }).filter(Boolean) as RegExp[];
    }

    _compiledPatterns = compiled as Record<QueryIntent, RegExp[]>;
    _lastPatternSource = sourceKey;
    return _compiledPatterns;
}

/**
 * Detect query intent from message text using keyword heuristics.
 *
 * Zero-cost classification: no LLM or embedding calls, just regex pattern
 * matching against configurable intent patterns. Each match adds a fixed score;
 * the highest-scoring intent wins. Falls back to 'retrieval' if no patterns match.
 *
 * @param message - The user's message text
 * @returns Object with detected `intent`, `confidence` (0-1), and `signals`
 *          (list of matched pattern descriptions for debugging)
 */
export function detectIntent(message: string): { intent: QueryIntent; confidence: number; signals: string[] } {
    const lower = message.toLowerCase();
    const signals: string[] = [];
    const scores: Record<QueryIntent, number> = { retrieval: 0, action: 0, diagnosis: 0, exploration: 0 };
    const cfg = getConfig();
    const compiledPatterns = getCompiledIntentPatterns();
    const scorePerMatch = cfg.intentScoring.scorePerMatch;

    for (const [intent, patterns] of Object.entries(compiledPatterns) as [QueryIntent, RegExp[]][]) {
        for (const p of patterns) {
            if (p.test(lower)) {
                scores[intent] += scorePerMatch;
                signals.push(`${intent}:${p.source.slice(0, 25)}`);
            }
        }
    }

    const entries = Object.entries(scores) as [QueryIntent, number][];
    entries.sort((a, b) => b[1] - a[1]);
    const [intent, score] = entries[0];
    const minConfidence = cfg.intentMinConfidence;
    const maxConfScore = cfg.intentScoring.maxConfidenceScore;
    const confidence = score > 0 ? Math.min(score / maxConfScore, 1.0) : minConfidence;

    return { intent: score > 0 ? intent : 'retrieval', confidence, signals };
}

/**
 * Compute effective relevance weights by blending default weights with
 * intent-specific weight profiles based on detection confidence.
 *
 * When confidence is at or below the minimum threshold, returns the defaults
 * unchanged. Above the threshold, linearly blends toward the intent-specific
 * profile proportional to `confidence * intentBlendMax`.
 *
 * @param intent - The detected query intent
 * @param confidence - Detection confidence (0-1)
 * @param defaults - Default relevance weight values (e.g., { embedding: 0.4, topicMatch: 0.3, ... })
 * @returns Blended weight values as a record of signal name to weight
 */
export function getIntentWeights(intent: QueryIntent, confidence: number, defaults: Record<string, number>) {
    const cfg = getConfig();
    const minConf = cfg.intentMinConfidence;
    if (confidence <= minConf) return { ...defaults };

    const profile = cfg.intentWeightProfiles[intent];
    const blend = confidence * cfg.intentBlendMax;
    const result: Record<string, number> = {};

    for (const key of Object.keys(defaults)) {
        const k = key as keyof typeof profile;
        result[key] = defaults[key] * (1 - blend) + (profile[k] ?? defaults[key]) * blend;
    }
    return result;
}

// =============================================================================
// KNOWLEDGE SELECTION
// =============================================================================

/**
 * Select the most relevant knowledge nodes from the graph for this conversation.
 *
 * Uses a 5-signal scoring model:
 * 1. **Embedding similarity** - cosine similarity between message and node embeddings
 * 2. **Topic match** - overlap of session topics with node content
 * 3. **Node weight** - the node's accumulated weight (0-2 range, normalized)
 * 4. **Recency** - time decay over configurable days
 * 5. **Concept cluster** - similarity to session topic clusters (when clustering enabled)
 *
 * Results are filtered by minimum relevance score, optionally deduped for compressed
 * profiles, and packed to fit the token budget. Number variable placeholders are
 * resolved before returning.
 *
 * @param message - The user's current message for embedding comparison
 * @param session - Session with accumulated topics, domains, and cluster data
 * @param options - Selection overrides
 * @param options.maxNodes - Maximum number of nodes to return
 * @param options.budget - Token budget for knowledge content
 * @param options.weights - Relevance signal weights (embedding, topicMatch, nodeWeight, recency)
 * @param options.profileKey - Model profile key for dedup-in-selection behavior
 * @returns Array of scored knowledge nodes with id, content, domain, nodeType, relevance, tokens
 */
export async function selectKnowledge(message: string, session: any, options: Record<string, any> = {}) {
    const cfg = getConfig();
    const maxNodes = options.maxNodes || cfg.maxKnowledgeNodes;
    const tokenBudget = options.budget || getDynamicBudgets(session).knowledge;
    const weights = options.weights || cfg.relevanceWeights;

    // 1. Get message embedding for similarity scoring
    const messageEmbedding = await getEmbedding(message);

    // 2. Determine which domains to search (partition-aware)
    let searchDomains: string[] = [];
    if (session.domains.length > 0) {
        const accessibleSets = await Promise.all(
            session.domains.map((d: string) => getAccessibleDomains(d))
        );
        const allAccessible = new Set(accessibleSets.flat());
        searchDomains = [...allAccessible];
    }

    // 3. Query candidate nodes from the graph
    let candidates;
    if (searchDomains.length > 0) {
        const placeholders = searchDomains.map((_, i) => `$${i + 1}`).join(', ');
        candidates = await query(`
            SELECT id, content, embedding, weight, salience, domain,
                   node_type, created_at, specificity,
                   generation, contributor, origin, verification_status, verification_score
            FROM nodes
            WHERE archived = FALSE
              AND domain IN (${placeholders})
            ORDER BY weight DESC
            LIMIT 100
        `, searchDomains);
    } else {
        candidates = await query(`
            SELECT id, content, embedding, weight, salience, domain,
                   node_type, created_at, specificity,
                   generation, contributor, origin, verification_status, verification_score
            FROM nodes
            WHERE archived = FALSE
            ORDER BY weight DESC
            LIMIT 100
        `);
    }

    if (candidates.length === 0) return [];

    // 4. Score each candidate
    const topicTerms = session.topics.map((t: any) => t.term);
    const topicWeightMap = new Map(session.topics.map((t: any) => [t.term, t.weight]));
    const now = Date.now();

    const scored: any[] = [];
    for (const node of candidates) {
        let score = 0;

        // Signal 1: Embedding similarity (0-1)
        if (messageEmbedding && node.embedding) {
            const emb = typeof node.embedding === 'string'
                ? JSON.parse(node.embedding) : node.embedding;
            const similarity = cosineSimilarity(messageEmbedding, emb);
            score += similarity * weights.embedding;
        }

        // Signal 2: Topic match (0-1)
        const contentLower = node.content.toLowerCase();
        let topicScore = 0;
        let topicMatches = 0;
        for (const term of topicTerms) {
            if (contentLower.includes(term)) {
                topicScore += (topicWeightMap.get(term) as number || 1);
                topicMatches++;
            }
        }
        const maxTopicWeight = session.topics.length > 0
            ? session.topics[0].weight * Math.min(topicTerms.length, 5)
            : 1;
        const normalizedTopicScore = maxTopicWeight > 0
            ? Math.min(topicScore / maxTopicWeight, 1)
            : 0;
        score += normalizedTopicScore * weights.topicMatch;

        // Signal 3: Node weight (normalized 0-1, typical range 0.5-2.0)
        const weightScore = Math.min(node.weight / 2.0, 1);
        score += weightScore * weights.nodeWeight;

        // Signal 4: Recency (newer nodes score higher, decays over configured days)
        const ageMs = now - new Date(node.created_at).getTime();
        const ageDays = ageMs / (1000 * 60 * 60 * 24);
        const recencyScore = Math.max(0, 1 - (ageDays / cfg.recencyDays));
        score += recencyScore * weights.recency;

        // Signal 5: Concept cluster matching (if clusters exist)
        const clusters = session.conceptClusters;
        if (clusters && clusters.length > 0 && node.embedding) {
            const clusterWeight = cfg.topicClustering?.clusterWeight || 0;
            if (clusterWeight > 0) {
                const emb = typeof node.embedding === 'string'
                    ? JSON.parse(node.embedding) : node.embedding;
                let maxClusterSim = 0;
                for (const cluster of clusters) {
                    const sim = cosineSimilarity(cluster.centroid, emb);
                    const weighted = sim * (cluster.weight / clusters[0].weight);
                    maxClusterSim = Math.max(maxClusterSim, weighted);
                }
                score += Math.min(maxClusterSim, 1) * clusterWeight;
            }
        }

        if (score >= cfg.minRelevanceScore) {
            scored.push({
                id: node.id,
                content: node.content,
                domain: node.domain,
                nodeType: node.node_type,
                weight: node.weight,
                relevance: Math.round(score * 1000) / 1000,
                topicMatches,
                tokens: estimateTokens(node.content),
                generation: node.generation,
                contributor: node.contributor,
                origin: node.origin,
                verificationStatus: node.verification_status,
                verificationScore: node.verification_score,
            });
        }
    }

    // 5. Sort by relevance score
    scored.sort((a, b) => b.relevance - a.relevance);

    // 5b. Dedup-in-selection: for compressed profiles, drop redundant nodes
    const profileKey = options.profileKey as string || null;
    const currentProfile = profileKey ? getModelProfiles()[profileKey] : null;
    if (currentProfile?.preferCompressed && scored.length > 1 && messageEmbedding) {
        const dedupThreshold = cfg.dedupInSelectionThreshold;
        const dedupCandidates = scored.slice(0, Math.min(scored.length, maxNodes * 3));
        const kept: typeof scored = [];

        for (const candidate of dedupCandidates) {
            let isDuplicate = false;
            for (const existing of kept) {
                const wordsA: Set<string> = new Set(candidate.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
                const wordsB: Set<string> = new Set(existing.content.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
                const overlap = [...wordsA].filter((w: string) => wordsB.has(w)).length;
                const unionSize = new Set<string>([...wordsA, ...wordsB]).size;
                const jaccard = unionSize > 0 ? overlap / unionSize : 0;

                if (jaccard >= dedupThreshold) {
                    isDuplicate = true;
                    break;
                }
            }
            if (!isDuplicate) {
                kept.push(candidate);
            }
        }

        scored.length = 0;
        scored.push(...kept);
    }

    // 6. Fill to token budget
    const selected = [];
    let usedTokens = 0;
    for (const node of scored) {
        if (selected.length >= maxNodes) break;
        if (usedTokens + node.tokens > tokenBudget) continue;
        selected.push(node);
        usedTokens += node.tokens;
    }

    // Resolve number variable placeholders — safe for output (display only)
    for (const node of selected) {
        if (node.content) node.content = await resolveContent(node.content);
    }

    return selected;
}

// =============================================================================
// SYSTEM PROMPT BUILDING
// =============================================================================

/**
 * Build a structured system prompt from selected knowledge nodes.
 *
 * For compressed profiles (small/micro models), produces a dense single-line format
 * with domain tags. For larger profiles, produces a full markdown format with
 * provenance tags, domain sections, active topics, and domain listings.
 *
 * If the generated prompt exceeds the token budget, recursively reduces the
 * knowledge set proportionally until it fits.
 *
 * @param knowledge - Array of selected knowledge nodes (id, content, domain, nodeType)
 * @param session - Session with topics and domains for context annotations
 * @param options - Build options
 * @param options.preferCompressed - Use compressed single-line format (for small models)
 * @param options.budget - Override token budget for the prompt
 * @returns Object with `prompt` (string or null if no knowledge) and `tokens` count
 */
export function buildSystemPrompt(knowledge: any[], session: any, options: Record<string, any> = {}) {
    const budgets = getDynamicBudgets(session);
    const tokenBudget = options.budget || budgets.systemPrompt + budgets.knowledge;

    if (knowledge.length === 0) {
        return {
            prompt: null,
            tokens: 0,
        };
    }

    const sections = [];

    // Compressed format for small/micro models: structured-dense with domain tags
    if (options.preferCompressed) {
        const byDomain = new Map<string, string[]>();
        for (const node of knowledge) {
            const d = node.domain || 'general';
            if (!byDomain.has(d)) byDomain.set(d, []);
            byDomain.get(d)!.push(node.content.replace(/\.\s*$/, '') + '.');
        }
        const parts: string[] = [];
        for (const [domain, contents] of byDomain) {
            parts.push(`[${domain}] ${contents.join(' ')}`);
        }
        sections.push(parts.join(' '));
    } else {
        const byDomain = new Map();
        for (const node of knowledge) {
            const domain = node.domain || 'general';
            if (!byDomain.has(domain)) byDomain.set(domain, []);
            byDomain.get(domain).push(node);
        }

        sections.push('The following knowledge has been selected from the Podbit graph for relevance to this conversation. Cite specific nodes, build on these insights, and surface connections that might not be obvious.\n');
        sections.push(PROVENANCE_GUIDE_USER + '\n');

        for (const [domain, nodes] of byDomain) {
            sections.push(`## ${domain}`);
            for (const node of nodes) {
                sections.push(`- ${buildProvenanceTag(node)} ${node.content}`);
            }
            sections.push('');
        }

        if (session.topics.length > 0) {
            const topTerms = session.topics.slice(0, 8).map((t: any) => t.term);
            sections.push(`Active topics: ${topTerms.join(', ')}`);
        }

        if (session.domains.length > 0) {
            sections.push(`Active domains: ${session.domains.join(', ')}`);
        }
    }

    const prompt = sections.join('\n');
    const tokens = estimateTokens(prompt);

    if (tokens > tokenBudget) {
        const ratio = tokenBudget / tokens;
        const reducedCount = Math.floor(knowledge.length * ratio);
        return buildSystemPrompt(knowledge.slice(0, Math.max(1, reducedCount)), session, options);
    }

    return { prompt, tokens };
}
