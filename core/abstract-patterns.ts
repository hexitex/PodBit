/**
 * @module abstract-patterns
 *
 * Abstract pattern indexing for cross-domain discovery.
 *
 * Patterns are domain-agnostic conceptual structures (e.g., "structure-vs-process-gap",
 * "feedback-loop") that can be tagged onto nodes from any domain. When two nodes in
 * different domains share the same pattern, they become "pattern siblings" — enabling
 * cross-domain insight discovery without requiring a partition bridge.
 *
 * Patterns are stored in the `abstract_patterns` table with optional embeddings
 * for semantic search. Node-to-pattern associations are stored in
 * `node_abstract_patterns` with a strength score.
 */

import { query, queryOne } from '../db.js';
import { getPatternSiblingsQuery } from '../db/sql.js';
import { getEmbedding } from '../models.js';
import { RC } from '../config/constants.js';

/**
 * Create or get an abstract pattern.
 * Patterns are domain-agnostic conceptual structures like "structure-vs-process-gap".
 * If a pattern with the normalized name already exists, returns it without modification.
 * Otherwise, creates a new one with an embedding for future semantic search.
 *
 * @param name - Kebab-case pattern name (auto-normalized: lowercased, spaces to hyphens,
 *               non-alphanumeric characters stripped).
 * @param description - Human-readable explanation of the pattern.
 * @param createdBy - Contributor identifier (default `'claude'`).
 * @returns The pattern record from the `abstract_patterns` table (existing or newly created).
 */
async function createOrGetPattern(name: string, description: string, createdBy: string = 'claude') {
    // Normalize to kebab-case
    const normalizedName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Try to get existing pattern first
    const existing = await queryOne(
        'SELECT * FROM abstract_patterns WHERE name = $1',
        [normalizedName]
    );

    if (existing) {
        return existing;
    }

    // Create new pattern with embedding for similarity search
    const embedding = await getEmbedding(`${normalizedName}: ${description}`);

    const pattern = await queryOne(`
        INSERT INTO abstract_patterns (name, description, embedding, created_by)
        VALUES ($1, $2, $3, $4)
        RETURNING *
    `, [normalizedName, description, embedding ? JSON.stringify(embedding) : null, createdBy]);

    console.error(`Created new abstract pattern: ${normalizedName}`);
    return pattern;
}

/**
 * Link a node to an abstract pattern.
 * If the association already exists, the strength is updated to the maximum of
 * the existing and new values (never decreases).
 *
 * @param nodeId - UUID of the node to link.
 * @param patternId - UUID of the abstract pattern.
 * @param strength - How strongly this node exemplifies the pattern (0-1, default `1.0`).
 * @param contributor - Who made this association (default `'claude'`).
 * @returns The upserted `node_abstract_patterns` row.
 */
async function linkNodeToPattern(nodeId: string, patternId: string, strength: number = 1.0, contributor: string = 'claude') {
    return queryOne(`
        INSERT INTO node_abstract_patterns (node_id, pattern_id, strength, contributor)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (node_id, pattern_id)
        DO UPDATE SET strength = GREATEST(node_abstract_patterns.strength, $3)
        RETURNING *
    `, [nodeId, patternId, strength, contributor]);
}

/**
 * Fetches all abstract patterns linked to a node, ordered by association strength (descending).
 *
 * @param nodeId - UUID of the node to look up.
 * @returns Array of pattern records with an additional `strength` field from the association.
 */
async function getNodePatterns(nodeId: string) {
    return query(`
        SELECT p.*, np.strength
        FROM abstract_patterns p
        JOIN node_abstract_patterns np ON np.pattern_id = p.id
        WHERE np.node_id = $1
        ORDER BY np.strength DESC
    `, [nodeId]);
}

/**
 * Find nodes that share abstract patterns with a target node.
 * This is the key function for cross-domain discovery — it surfaces nodes
 * from other domains that exhibit the same conceptual structures.
 *
 * @param nodeId - UUID of the source node.
 * @param excludeSameDomain - If `true` (default), only return nodes from different domains
 *                            than the source, maximizing cross-domain insight.
 * @param limit - Maximum number of sibling nodes to return (default `20`).
 * @returns Array of sibling node records with shared pattern information.
 */
async function findPatternSiblings(nodeId: string, excludeSameDomain: boolean = true, limit: number = RC.queryLimits.patternSiblingLimit) {
    // Direct query replaces find_pattern_siblings stored function
    return query(getPatternSiblingsQuery(), [nodeId, excludeSameDomain, limit]);
}

/**
 * Search abstract patterns by text similarity (ILIKE on name and description).
 *
 * Note: This is a text-based search only. Embeddings are stored as JSON blobs
 * and cannot be used for vector similarity operations in SQLite.
 *
 * @param text - Search query string (matched as a substring against name and description).
 * @param limit - Maximum number of results to return (default `10`).
 * @returns Array of matching pattern records (id, name, description, created_by, created_at).
 */
async function searchPatterns(text: string, limit: number = RC.queryLimits.patternSearchLimit) {
    // Text search only (embeddings stored as JSONB, can't use vector ops)
    return query(`
        SELECT id, name, description, created_by, created_at
        FROM abstract_patterns
        WHERE name ILIKE $1 OR description ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2
    `, [`%${text}%`, limit]);
}

/**
 * Get pattern usage statistics from the `v_pattern_stats` view.
 *
 * @returns Array of rows with pattern names, node counts, and other aggregate metrics.
 */
async function getPatternStats() {
    return query(`SELECT * FROM v_pattern_stats`);
}


export {
    createOrGetPattern,
    linkNodeToPattern,
    getNodePatterns,
    findPatternSiblings,
    searchPatterns,
    getPatternStats,
};
