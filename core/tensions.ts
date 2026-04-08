/**
 * @module core/tensions
 *
 * Tension detection — finds contradictions and generates research questions.
 *
 * Identifies node pairs within partition-accessible domains that are
 * semantically similar (high embedding cosine similarity) yet contain
 * contradictory signals (opposing keyword patterns, negation asymmetry).
 * High-tension pairs can be used to generate research questions via the
 * `voice` subsystem, which are stored as `question`-type nodes linked
 * to both source nodes.
 */

import { query } from '../db.js';
import { callSubsystemModel, getAssignedModel } from '../models.js';
import { getPrompt } from '../prompts.js';
import { getProjectContextBlock } from './project-context.js';
import { config, } from './engine-config.js';
import { parseEmbedding, cosineSimilarity } from './scoring.js';
import { getAccessibleDomains } from './governance.js';
import { createNode, createEdge } from './node-ops.js';
import type { ResonanceNode, TensionResult } from './types.js';

/**
 * Score how much two texts contradict each other using config-defined
 * keyword patterns and negation asymmetry.
 *
 * Checks each `[positive, negative]` pair in `config.tensions.patterns` for
 * cross-presence (A has positive and B has negative, or vice versa). Also
 * detects negation asymmetry (`not` / `n't` present in one text but not both).
 *
 * @param contentA - First node's content text
 * @param contentB - Second node's content text
 * @returns Object with `score` (number of matched signals + negation boost)
 *          and `signals` (human-readable labels for each matched pattern)
 */
function detectTensionSignals(contentA: string, contentB: string) {
    const textA = contentA.toLowerCase();
    const textB = contentB.toLowerCase();

    let tensionScore = 0;
    const signals: string[] = [];

    for (const [pos, neg] of config.tensions.patterns) {
        if ((textA.includes(pos) && textB.includes(neg)) ||
            (textA.includes(neg) && textB.includes(pos))) {
            tensionScore++;
            signals.push(`${pos}/${neg}`);
        }
    }

    // Check for explicit negation
    if ((textA.includes('not ') || textA.includes("n't ")) !==
        (textB.includes('not ') || textB.includes("n't "))) {
        tensionScore += config.tensions.negationBoost;
        signals.push('negation');
    }

    return { score: tensionScore, signals };
}

/**
 * Find node pairs that contradict each other within partition-accessible domains.
 *
 * Queries up to `config.tensions.candidateLimit` nodes (ordered by weight),
 * filters by partition-accessible domains, pre-parses all embeddings, then
 * performs pairwise comparisons looking for high semantic similarity combined
 * with tension signals. Yields to the event loop every 500 comparisons.
 *
 * Results are sorted by `combinedScore` (similarity * tensionScore) descending.
 *
 * @param limit - Maximum number of tension results to return (default 10)
 * @param domain - Optional domain filter; when provided, only nodes in
 *                 partition-accessible domains are considered
 * @returns Array of tension results, each containing the two nodes, similarity,
 *          tension score, signal labels, and combined score
 */
async function findTensions(limit: number = 10, domain: string | null = null): Promise<TensionResult[]> {
    // Get nodes with embeddings, filtered by partition-aware accessible domains
    let domainClause = '';
    let params: string[] = [];

    if (domain) {
        // Use partition-aware accessible domains
        const accessible = await getAccessibleDomains(domain);
        if (accessible.length > 0) {
            const placeholders = accessible.map((_: string, i: number) => `$${i + 1}`).join(', ');
            domainClause = `AND domain IN (${placeholders})`;
            params = accessible;
        }
    }

    const nodes = await query(`
        SELECT id, content, embedding, domain, weight
        FROM nodes
        WHERE archived = FALSE
          AND embedding IS NOT NULL
          AND node_type NOT IN ('question', 'raw', 'elite_verification')
          AND origin NOT IN ('reader_code', 'reader_text', 'reader_pdf', 'reader_doc', 'reader_sheet', 'reader_image')
          ${domainClause}
        ORDER BY weight DESC
        LIMIT ${Math.floor(config.tensions.candidateLimit)}
    `, params);

    // Build partition accessibility cache for cross-partition isolation
    // When no domain filter, we still must not compare nodes across partition boundaries
    const accessCache = new Map<string, Set<string>>(); // domain -> Set of accessible domains
    async function areAccessible(domainA: string | null | undefined, domainB: string | null | undefined) {
        if (domainA === domainB) return true;
        if (!domainA || !domainB) return true; // null-domain nodes are unrestricted

        if (!accessCache.has(domainA!)) {
            accessCache.set(domainA!, new Set(await getAccessibleDomains(domainA!)));
        }
        return accessCache.get(domainA!)!.has(domainB!);
    }

    const tensions: TensionResult[] = [];

    // Pre-parse all embeddings once (avoids re-parsing JSON on every pair comparison)
    const parsedEmbeddings = new Map<string, number[]>();
    for (const node of nodes) {
        if (node.embedding) {
            const emb = parseEmbedding(node.embedding);
            if (emb) parsedEmbeddings.set(node.id, emb);
        }
    }

    // Compare pairs looking for high similarity + tension signals
    // Yields to event loop every 500 comparisons to avoid blocking
    let comparisonCount = 0;
    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const nodeA = nodes[i];
            const nodeB = nodes[j];

            // Enforce partition isolation -- skip pairs from different partitions
            if (!await areAccessible(nodeA.domain, nodeB.domain)) continue;

            // Calculate semantic similarity using pre-parsed embeddings
            const embA = parsedEmbeddings.get(nodeA.id);
            const embB = parsedEmbeddings.get(nodeB.id);
            const similarity = (embA && embB)
                ? cosineSimilarity(embA, embB)
                : 0;

            // Only consider pairs that are semantically related
            if (similarity < config.tensions.minSimilarity) continue;

            // Check for tension signals
            const tension = detectTensionSignals(nodeA.content, nodeB.content);

            // High similarity + tension signals = potential contradiction
            if (tension.score > 0) {
                tensions.push({
                    nodeA: { id: nodeA.id, content: nodeA.content, domain: nodeA.domain },
                    nodeB: { id: nodeB.id, content: nodeB.content, domain: nodeB.domain },
                    similarity,
                    tensionScore: tension.score,
                    signals: tension.signals,
                    combinedScore: similarity * tension.score,
                });
            }

            // Yield to event loop periodically
            if (++comparisonCount % 500 === 0) {
                await new Promise(resolve => setImmediate(resolve));
            }
        }
    }

    // Sort by combined score (high similarity + high tension)
    tensions.sort((a, b) => b.combinedScore - a.combinedScore);

    return tensions.slice(0, limit);
}

/**
 * Generate a single research question from two contradictory nodes.
 *
 * Uses the `voice` subsystem with the `core.question_generation` prompt,
 * prepending project context if available. Parses structured JSON output
 * with a `question` field, falling back to text cleanup if JSON parsing fails.
 * Ensures the result ends with `?`.
 *
 * @param nodeA - First tension source node
 * @param nodeB - Second tension source node
 * @param tensionSignals - Optional signal labels (e.g., `["increase/decrease", "negation"]`)
 *                         injected as a hint into the prompt
 * @returns Generated research question string ending with `?`
 */
async function generateQuestion(nodeA: ResonanceNode, nodeB: ResonanceNode, tensionSignals: string[] = []): Promise<string> {
    const signalHint = tensionSignals.length > 0
        ? `\nTension detected around: ${tensionSignals.join(', ')}`
        : '';

    const tensionProjectContext = await getProjectContextBlock();
    const baseQuestionPrompt = await getPrompt('core.question_generation', {
        contentA: nodeA.content,
        contentB: nodeB.content,
        signalHint,
    });
    const prompt = tensionProjectContext ? `${tensionProjectContext}\n\n${baseQuestionPrompt}` : baseQuestionPrompt;

    // Provider-agnostic structured output hint
    const questionJsonSchema = {
        name: "research_question",
        schema: {
            type: "object",
            properties: {
                question: { type: "string", description: "Research question under 30 words ending with ?" }
            },
            required: ["question"],
            additionalProperties: false
        }
    };

    const response = await callSubsystemModel('voice', prompt, { jsonSchema: questionJsonSchema });

    // Parse JSON response
    let cleaned;
    try {
        const parsed = JSON.parse(response);
        cleaned = parsed.question || response;
    } catch {
        // Fallback: clean up raw text
        cleaned = response
            .replace(/^(The question is|Question:|Here's|One question)[:\s]*/i, '')
            .replace(/^["']|["']$/g, '')
            .trim();
    }

    // Ensure it ends with ?
    if (!cleaned.endsWith('?')) {
        cleaned += '?';
    }

    return cleaned;
}

/**
 * Create a question node linked to two tension-source nodes and store it in the graph.
 *
 * The node is created with `node_type='question'` and `origin='tension'`, linked
 * to both source nodes via `tension_source` edges. If the dedup gate rejects the
 * question (returns `null` from `createNode`), no edges are created.
 *
 * The domain is taken from `nodeA`, falling back to `nodeB`, falling back to `'unknown'`.
 *
 * @param nodeA - First tension source node (preferred domain source)
 * @param nodeB - Second tension source node
 * @param question - The generated research question text
 * @param options - Additional options passed through to `createNode` (e.g., `contributor`)
 * @returns The created node object, or `null` if deduplicated
 */
async function createQuestionNode(nodeA: ResonanceNode, nodeB: ResonanceNode, question: string, options: Record<string, any> = {}) {
    const voiceModel = getAssignedModel('voice' as any);
    const node = await createNode(question, 'question', 'tension', {
        domain: nodeA.domain || nodeB.domain || 'unknown',
        contributor: options.contributor || 'system',
        weight: 1.2, // Questions are valuable
        modelId: voiceModel?.id ?? null,
        modelName: voiceModel?.name ?? null,
        ...options,
    });

    // Dedup gate may return null
    if (!node) {
        console.error(`[tensions] Question deduplicated, skipping`);
        return null;
    }

    // Link to parent nodes
    await createEdge(nodeA.id, node.id, 'tension_source', 1.0);
    await createEdge(nodeB.id, node.id, 'tension_source', 1.0);

    return node;
}

export { detectTensionSignals, findTensions, generateQuestion, createQuestionNode };
