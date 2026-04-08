/**
 * Discovery handlers — tensions, research questions, and validation context.
 *
 * These handlers return context for the caller to act on (no LLM calls).
 * The caller reads the returned context, generates output, then uses
 * podbit.propose to save results.
 * @module handlers/discovery
 */

import {
    queryOne,
    findTensions,
    getSourceNodes,
} from '../core.js';

/**
 * Find contradictory or high-tension node pairs.
 *
 * @param params - Object with optional `limit` (default 10) and `domain` (null for cross-domain).
 * @returns Array of tension pairs with similarity scores and signal breakdowns.
 */
async function handleTensions(params: Record<string, any>) {
    const { limit = 10, domain = null } = params;

    const tensions = await findTensions(limit, domain);

    return {
        count: tensions.length,
        domain: domain || 'all',
        tensions: tensions.map(t => ({
            nodeA: t.nodeA,
            nodeB: t.nodeB,
            similarity: Math.round(t.similarity * 100) / 100,
            tensionScore: t.tensionScore,
            signals: t.signals,
        })),
        note: domain
            ? `Tensions within "${domain}" domain. For cross-domain insights, omit the domain filter.`
            : 'Cross-domain tensions included. Filter by domain to focus on a specific area.',
    };
}

/**
 * Return context for generating a research question from two nodes.
 *
 * No LLM call is made — the caller reads the returned node pair and
 * instruction, generates a question, then saves it via podbit.propose.
 *
 * @param params - Object with `nodeIdA` and `nodeIdB` (both required).
 * @returns Node pair with content/domain and instruction, or `{ error }`.
 */
async function handleQuestion(params: Record<string, any>) {
    const { nodeIdA, nodeIdB } = params;

    // Fetch both nodes - returns context for Claude to generate the question
    const nodeA = await queryOne('SELECT * FROM nodes WHERE id = $1 AND archived = FALSE', [nodeIdA]);
    const nodeB = await queryOne('SELECT * FROM nodes WHERE id = $1 AND archived = FALSE', [nodeIdB]);

    if (!nodeA || !nodeB) {
        return { error: 'One or both nodes not found' };
    }

    // Return context for Claude to generate a question - NO API CALL
    return {
        nodeA: {
            id: nodeA.id,
            content: nodeA.content,
            domain: nodeA.domain,
        },
        nodeB: {
            id: nodeB.id,
            content: nodeB.content,
            domain: nodeB.domain,
        },
        instruction: 'Generate a research question that explores the tension or connection between these nodes. Then use podbit.propose with nodeType="question" to save it.',
    };
}

/**
 * Return validation context for breakthrough assessment of a node.
 *
 * Returns the node, its source/parent nodes, scoring criteria with calibration
 * questions, and detailed instructions for evaluating novelty. No LLM call.
 *
 * @param params - Object with `nodeId` (required).
 * @returns Validation context with criteria, threshold info, and instructions.
 */
async function handleValidate(params: Record<string, any>) {
    const { nodeId } = params;

    // Fetch the node
    const node = await queryOne('SELECT * FROM nodes WHERE id = $1 AND archived = FALSE', [nodeId]);
    if (!node) {
        return { error: 'Node not found' };
    }

    // Get source/parent nodes for context
    const sourceNodes = await getSourceNodes(nodeId);

    // Return context for Claude to evaluate - NO API CALL
    return {
        node: {
            id: node.id,
            content: node.content,
            type: node.node_type,
            domain: node.domain,
        },
        sources: sourceNodes.map(s => ({
            id: s.id,
            content: s.content,
        })),
        criteria: {
            synthesis: 'Does this combine multiple concepts in a non-obvious way? (0-10)',
            novelty: 'Is this insight genuinely NEW to the field, or is it textbook/well-known? (0-10). Ask: Would an expert be surprised? Is this publishable? Could you find this in Wikipedia or a standard textbook? If yes to the last, score 0-4 max.',
            testability: 'Does this make concrete predictions or have verifiable implications? (0-10)',
            tension_resolution: 'Does this resolve a paradox, tension, or apparent contradiction? (0-10)',
        },
        calibration_questions: [
            'Could I find this idea in a textbook, Wikipedia, or well-known paper? If yes, novelty <= 4',
            'Would a domain expert say "I never thought of it that way"? If no, novelty <= 5',
            'Does this CREATE new knowledge or just EXPLAIN existing knowledge clearly? Explanation = synthesis (useful), not breakthrough',
            'Is this a reframing/pedagogy (score as synthesis 7+, novelty 3-5) or genuine discovery (novelty 7+)?',
        ],
        node_type_guide: {
            seed: 'Foundational fact or claim',
            synthesis: 'Good explanation or combination of known ideas (novelty < 6)',
            breakthrough: 'Genuinely novel insight that experts would find surprising (novelty >= 7)',
        },
        breakthrough_threshold: 'synthesis >= 6 AND novelty >= 7 AND (testability >= 5 OR tension_resolution >= 7). NOTE: novelty >= 7 means "not findable in textbooks"',
        instruction: 'Evaluate this node against the criteria. BE SKEPTICAL about novelty - most insights are reframings of known ideas, which is valuable but not breakthrough-level. If novelty < 7, consider proposing as nodeType="voiced" (synthesis) instead of promoting to breakthrough.',
    };
}

export { handleTensions, handleQuestion, handleValidate };
