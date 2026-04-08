/**
 * Seed node CRUD utilities.
 *
 * Seeds are the raw input nodes of the knowledge graph, created through chat
 * interactions or MCP `podbit.propose`. This module provides functions for
 * creating individual or batch seeds, querying active seeds by domain, listing
 * distinct domains, and archiving entire domains.
 *
 * @module seeds
 */

import { createNode, query } from './core.js';

/**
 * Create a single seed node from user input. Validates minimum content
 * length and delegates to `createNode` with 'seed' type and 'human' source.
 * @param content - The seed content (must be at least 10 characters)
 * @param options - Optional metadata including `domain` and `contributor`
 * @returns The created node object
 * @throws {Error} If content is shorter than 10 characters
 */
async function createSeed(content: string, options: Record<string, any> = {}) {
    const { domain, contributor = 'user' } = options;

    if (!content || content.trim().length < 10) {
        throw new Error('Seed content must be at least 10 characters');
    }

    const node = await createNode(content.trim(), 'seed', 'human', {
        domain,
        contributor,
    });

    return node;
}

/**
 * Create multiple seeds from an array of content objects. Each seed is
 * created independently; failures for individual seeds do not block others.
 * @param seeds - Array of objects with `content`, `domain`, and optionally `contributor`
 * @returns Array of result objects with `success`, `id`/`error`, and truncated content
 */
async function createSeeds(seeds: any[]) {
    const results = [];

    for (const seed of seeds) {
        try {
            const node = await createSeed(seed.content, {
                domain: seed.domain,
                contributor: seed.contributor,
            });
            results.push({ success: true, id: node.id, content: seed.content.slice(0, 50) });
        } catch (err: any) {
            results.push({ success: false, error: err.message, content: seed.content?.slice(0, 50) });
        }
    }

    return results;
}

/**
 * Get all active (non-archived) seeds, optionally filtered by domain.
 * Results are ordered by creation time (newest first).
 * @param options - Filter options: `domain` (string) and `limit` (number, default 100)
 * @returns Array of seed node rows
 */
async function getSeeds(options: Record<string, any> = {}) {
    const { domain, limit = 100 } = options;

    let sql = `
        SELECT id, content, domain, weight, salience, created_at
        FROM nodes
        WHERE node_type = 'seed' AND archived = FALSE
    `;
    const params = [];

    if (domain) {
        params.push(domain);
        sql += ` AND domain = $${params.length}`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    return query(sql, params);
}

/**
 * Get all distinct domain names from active seed nodes.
 * @returns Array of domain name strings
 */
async function getDomains() {
    const result = await query(`
        SELECT DISTINCT domain
        FROM nodes
        WHERE node_type = 'seed' AND domain IS NOT NULL AND archived = FALSE
        ORDER BY domain
    `);
    return result.map(r => r.domain);
}

/**
 * Archive all seeds in a domain (soft delete via `archived = TRUE`).
 * @param domain - Domain whose seeds should be archived
 * @returns Object with the count of archived seeds
 */
async function archiveSeeds(domain: string) {
    const result = await query(
        `UPDATE nodes SET archived = TRUE WHERE node_type = 'seed' AND domain = $1 RETURNING id`,
        [domain]
    );
    return { archived: result.length };
}

export {
    createSeed,
    createSeeds,
    getSeeds,
    getDomains,
    archiveSeeds,
};
