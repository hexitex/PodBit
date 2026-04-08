/**
 * Abstract pattern handler — cross-domain pattern discovery via search, siblings, tagging, and stats.
 * @module handlers/abstract-patterns
 */

import {
    queryOne,
    createOrGetPattern,
    linkNodeToPattern,
    getNodePatterns,
    findPatternSiblings,
    searchPatterns,
    getPatternStats,
} from '../core.js';

/**
 * Dispatch abstract-pattern actions for cross-domain pattern discovery.
 *
 * Actions:
 *   search   — find patterns by text query (embedding similarity)
 *   siblings — find nodes sharing patterns with a given node
 *   tag      — link a node to a named pattern (creates pattern if new)
 *   stats    — pattern usage statistics (node/domain counts)
 *
 * @param params - Object with `action` (required) plus action-specific fields:
 *   `query` for search, `nodeId` for siblings/tag, `patternName` for tag,
 *   optional `patternDescription`, `strength`, `excludeSameDomain`, `limit`, `contributor`.
 * @returns Action-specific result with pattern/sibling data, or `{ error }`.
 */
export async function handleAbstractPatterns(params: Record<string, any>) {
    const { action, query: searchQuery, nodeId, patternName, patternDescription,
            strength = 1.0, excludeSameDomain = true, limit = 10, contributor = 'claude' } = params;

    switch (action) {
        case 'search': {
            if (!searchQuery) {
                return { error: 'search action requires query parameter' };
            }
            const patterns = await searchPatterns(searchQuery, limit);
            return {
                action: 'search',
                query: searchQuery,
                count: patterns.length,
                patterns: patterns.map(p => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    similarity: p.similarity ? Math.round(p.similarity * 100) / 100 : null,
                })),
            };
        }

        case 'siblings': {
            if (!nodeId) {
                return { error: 'siblings action requires nodeId parameter' };
            }
            // First get the node's patterns
            const nodePatterns = await getNodePatterns(nodeId);
            if (nodePatterns.length === 0) {
                return {
                    action: 'siblings',
                    nodeId,
                    message: 'Node has no patterns tagged. Use action="tag" to add patterns first.',
                    patterns: [],
                    siblings: [],
                };
            }
            // Find siblings via patterns
            const siblings = await findPatternSiblings(nodeId, excludeSameDomain, limit);
            return {
                action: 'siblings',
                nodeId,
                nodePatterns: nodePatterns.map(p => ({
                    name: p.name,
                    description: p.description,
                    strength: p.strength,
                })),
                excludeSameDomain,
                count: siblings.length,
                siblings: siblings.map(s => ({
                    nodeId: s.node_id,
                    content: s.content,
                    domain: s.domain,
                    sharedPattern: s.pattern_name,
                    patternStrength: s.pattern_strength,
                })),
            };
        }

        case 'tag': {
            if (!nodeId || !patternName) {
                return { error: 'tag action requires nodeId and patternName parameters' };
            }
            // Create or get the pattern
            const pattern = await createOrGetPattern(
                patternName,
                patternDescription || `Abstract pattern: ${patternName}`,
                contributor
            );
            // Link node to pattern
            await linkNodeToPattern(nodeId, pattern.id, strength, contributor);

            // Get the node content for context
            const node = await queryOne('SELECT content, domain FROM nodes WHERE id = $1', [nodeId]);

            return {
                action: 'tag',
                success: true,
                node: {
                    id: nodeId,
                    content: node?.content?.slice(0, 100) + '...',
                    domain: node?.domain,
                },
                pattern: {
                    id: pattern.id,
                    name: pattern.name,
                    description: pattern.description,
                    isNew: !params.patternDescription && pattern.description === `Abstract pattern: ${patternName}`,
                },
                strength,
                note: 'Node tagged with pattern. Use action="siblings" to find cross-domain connections.',
            };
        }

        case 'stats': {
            const stats = await getPatternStats();
            return {
                action: 'stats',
                count: stats.length,
                patterns: stats.map(p => ({
                    id: p.id,
                    name: p.name,
                    description: p.description,
                    nodeCount: parseInt(p.node_count, 10),
                    domainCount: parseInt(p.domain_count, 10),
                    domains: p.domains,
                })),
            };
        }

        default:
            return { error: `Unknown action: ${action}. Use search, siblings, tag, or stats.` };
    }
}
