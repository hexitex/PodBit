/**
 * Graph query handler — semantic and keyword search over the node graph.
 * @module handlers/graph/query
 */

import { query, queryOne } from '../../core.js';
import { cosineSimilarity } from '../knowledge.js';
import { getEmbedding } from '../../models.js';

/**
 * Parse an embedding from its stored form into a number array.
 *
 * Supports binary BLOB (Float32Array), JSON string, and raw array formats.
 *
 * @param emb - Raw embedding value from the database (Buffer, string, array, or null).
 * @returns Parsed number array, or null if the input is missing/malformed.
 */
function parseEmbeddingField(emb: any): number[] | null {
    if (!emb) return null;
    if (Buffer.isBuffer(emb)) {
        const f32 = new Float32Array(emb.buffer, emb.byteOffset, emb.byteLength / 4);
        return Array.from(f32);
    }
    if (Array.isArray(emb)) return emb;
    if (typeof emb === 'string') {
        try { return JSON.parse(emb); } catch { return null; }
    }
    return null;
}

/**
 * Search nodes using semantic embedding similarity and/or keyword matching.
 *
 * When `text` is provided, embeds it and reranks results by cosine similarity
 * blended with node weight (70/30 split). Falls back to LIKE search if embedding
 * fails. Supports domain, nodeType, trajectory, weight, salience, composite, and
 * partition filters with pagination and multiple sort orders.
 *
 * @param params - Search parameters: text, search, domain, domains, nodeType, trajectory,
 *   minWeight, minSalience, minComposite, partition, partitions, keywords, limit, offset, orderBy.
 * @returns Object with total count, pagination info, and matched nodes with provenance.
 */
async function handleQuery(params: Record<string, any>) {
    const {
        text, search, domain, domains, nodeType, trajectory, feedbackRating,
        minWeight, minSalience,
        minComposite, partition, partitions: partitionArr, keywords: keywordsParam,
        limit = 20, offset = 0, orderBy = 'weight'
    } = params;

    // Semantic search via embedding similarity — if `text` is provided, we embed it,
    // fetch a wider candidate pool, score by cosine similarity, and return the top results.
    const useSemanticSearch = !!text;
    let queryEmbedding: number[] | null = null;
    if (useSemanticSearch) {
        try {
            queryEmbedding = await getEmbedding(text);
        } catch (err: any) {
            // Embedding unavailable — fall back to keyword LIKE search
            console.error(`[query] Embedding failed, falling back to LIKE search: ${err.message}`);
        }
    }

    // Build WHERE clause
    let whereClause = 'WHERE n.archived = FALSE';
    const sqlParams: any[] = [];
    let paramIndex = 1;

    // Text content search (LIKE filter) — also checks node_keywords table
    // Used when: explicit `search` param, OR `text` param but embedding failed
    const likeSearch = search || (text && !queryEmbedding);
    if (likeSearch) {
        const searchTerm = search || text;
        whereClause += ` AND (n.content LIKE $${paramIndex} OR n.id IN (SELECT node_id FROM node_keywords WHERE keyword LIKE $${paramIndex}))`;
        sqlParams.push(`%${searchTerm}%`);
        paramIndex++;
    }

    // Multi-keyword filter: nodes that have at least one of the selected keywords
    if (keywordsParam) {
        const kwArr = Array.isArray(keywordsParam) ? keywordsParam : [keywordsParam];
        if (kwArr.length > 0) {
            whereClause += ` AND n.id IN (SELECT node_id FROM node_keywords WHERE keyword IN (SELECT value FROM json_each($${paramIndex++})))`;
            sqlParams.push(JSON.stringify(kwArr));
        }
    }

    // domains[] takes precedence over domain (single); coerce string to array
    const domainsArr = domains ? (Array.isArray(domains) ? domains : [domains]) : [];
    const domainList = domainsArr.length > 0
        ? domainsArr
        : domain ? [domain] : null;
    if (domainList) {
        const placeholders = domainList.map((_: any) => `$${paramIndex++}`).join(', ');
        whereClause += ` AND n.domain IN (${placeholders})`;
        sqlParams.push(...domainList);
    }
    if (nodeType) {
        whereClause += ` AND n.node_type = $${paramIndex++}`;
        sqlParams.push(nodeType);
    } else {
        // Exclude raw KB nodes by default — they're storage/RAG-only and skew stats.
        // Users can still view them explicitly via nodeType='raw' filter.
        whereClause += ` AND n.node_type != 'raw'`;
    }
    if (trajectory) {
        whereClause += ` AND n.trajectory = $${paramIndex++}`;
        sqlParams.push(trajectory);
    }
    if (minWeight !== undefined) {
        whereClause += ` AND n.weight >= $${paramIndex++}`;
        sqlParams.push(parseFloat(minWeight));
    }
    if (minSalience !== undefined) {
        whereClause += ` AND n.salience >= $${paramIndex++}`;
        sqlParams.push(parseFloat(minSalience));
    }
    if (minComposite !== undefined) {
        whereClause += ` AND n.validation_composite >= $${paramIndex++}`;
        sqlParams.push(parseFloat(minComposite));
    }
    // Feedback rating filter: useful (1), not_useful (0), harmful (-1), unrated (NULL)
    if (feedbackRating) {
        const ratingMap: Record<string, number | null> = { useful: 1, not_useful: 0, harmful: -1 };
        if (feedbackRating === 'unrated') {
            whereClause += ` AND n.feedback_rating IS NULL`;
        } else if (ratingMap[feedbackRating] !== undefined) {
            whereClause += ` AND n.feedback_rating = $${paramIndex++}`;
            sqlParams.push(ratingMap[feedbackRating]);
        }
    }
    // partitions[] takes precedence over partition (single); coerce string to array
    const partsArr = partitionArr ? (Array.isArray(partitionArr) ? partitionArr : [partitionArr]) : [];
    const partList = partsArr.length > 0
        ? partsArr
        : partition ? [partition] : null;
    if (partList) {
        const placeholders = partList.map((_: any) => `$${paramIndex++}`).join(', ');
        whereClause += ` AND pd.partition_id IN (${placeholders})`;
        sqlParams.push(...partList);
    }

    // For semantic search: fetch wider candidate pool, then rerank by similarity
    const candidateLimit = queryEmbedding ? Math.max(parseInt(limit, 10) * 5, 100) : parseInt(limit, 10);

    // Determine order
    const orderMap = {
        weight: 'n.weight DESC',
        salience: 'n.salience DESC',
        specificity: 'n.specificity DESC',
        composite: 'n.validation_composite DESC NULLS LAST',
        recent: 'n.created_at DESC',
        oldest: 'n.created_at ASC',
    };
    const orderClause = orderMap[orderBy as keyof typeof orderMap] || 'n.weight DESC';

    // Separate count query — avoids COUNT(*) OVER() window function which forces
    // SQLite to materialize the entire filtered result set before returning any rows
    const selectCols = `n.id, n.name, n.content, n.node_type, n.trajectory, n.domain, n.weight, n.salience, n.specificity,
               n.origin, n.contributor, n.excluded, n.feedback_rating, n.metadata, n.created_at,
               n.validation_synthesis, n.validation_novelty, n.validation_testability,
               n.validation_tension_resolution, n.validation_composite, n.validation_reason,
               n.validated_at, n.validated_by,
               n.lifecycle_state, n.barren_cycles, n.total_children, n.generation,
               n.born_at, n.activated_at, n.declining_since, n.composted_at,
               n.avatar_url,
               pd.partition_id, dp.name AS partition_name`;

    const limitParamIdx = paramIndex++;
    const offsetParamIdx = paramIndex;
    sqlParams.push(candidateLimit, parseInt(offset, 10));

    // Use embedding_bin (BLOB, ~4x smaller than JSON) for semantic search
    const sql = `
        SELECT ${selectCols}${queryEmbedding ? ', n.embedding_bin' : ''}
        FROM nodes n
        LEFT JOIN partition_domains pd ON pd.domain = n.domain
        LEFT JOIN domain_partitions dp ON dp.id = pd.partition_id
        ${whereClause}
        ORDER BY ${orderClause}
        LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
    `;

    // Run data query and count query in parallel (count uses same WHERE, includes JOINs
    // only when needed for partition filter, but no ORDER/LIMIT/OFFSET)
    const countSql = `SELECT COUNT(*) as cnt FROM nodes n
        LEFT JOIN partition_domains pd ON pd.domain = n.domain
        LEFT JOIN domain_partitions dp ON dp.id = pd.partition_id
        ${whereClause}`;
    const countParams = sqlParams.slice(0, sqlParams.length - 2); // exclude LIMIT/OFFSET
    let [nodes, countResult] = await Promise.all([
        query(sql, sqlParams),
        queryOne(countSql, countParams),
    ]) as [any[], any];

    const total = parseInt(countResult?.cnt || 0, 10);

    // Semantic rerank: score by cosine similarity, blend with weight, return top N
    if (queryEmbedding && nodes.length > 0) {
        const scored = nodes.map((n: any) => {
            let similarity = 0;
            const emb = parseEmbeddingField(n.embedding_bin);
            if (emb) {
                try {
                    similarity = cosineSimilarity(queryEmbedding, emb);
                } catch { /* bad embedding */ }
            }
            const weightScore = Math.min((n.weight || 0.5) / 2.0, 1);
            const relevance = (similarity * 0.7) + (weightScore * 0.3);
            return { ...n, _relevance: relevance, _similarity: similarity };
        });
        scored.sort((a: any, b: any) => b._relevance - a._relevance);
        nodes = scored.slice(0, parseInt(limit, 10));
    }

    // Batch-fetch creation provenance for all returned nodes
    // Uses json_each() instead of N individual placeholders to avoid event-loop blocking
    const provenanceMap: Record<string, any> = {};
    if (nodes.length > 0) {
        const nodeIdsJson = JSON.stringify(nodes.map(n => n.id));
        const provRows = await query(`
            SELECT entity_id, decided_by_tier, contributor
            FROM decisions
            WHERE entity_type = 'node' AND field = 'created' AND entity_id IN (SELECT value FROM json_each($1))
        `, [nodeIdsJson]);
        for (const r of provRows) {
            provenanceMap[r.entity_id] = { tier: r.decided_by_tier, contributor: r.contributor };
        }
    }

    return {
        total,
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
        count: nodes.length,
        nodes: nodes.map((n: any) => ({
            id: n.id,
            content: n.content,
            type: n.node_type,
            trajectory: n.trajectory,
            domain: n.domain,
            weight: n.weight,
            salience: n.salience,
            specificity: n.specificity,
            origin: n.origin,
            contributor: n.contributor,
            excluded: !!n.excluded,
            feedback_rating: n.feedback_rating ?? null,
            metadata: n.metadata ? JSON.parse(n.metadata) : null,
            ...(n._relevance !== undefined && { relevance: parseFloat(n._relevance.toFixed(4)) }),
            createdAt: n.created_at,
            partition: n.partition_id ? {
                id: n.partition_id,
                name: n.partition_name,
            } : null,
            validation: n.validation_composite ? {
                synthesis: n.validation_synthesis,
                novelty: n.validation_novelty,
                testability: n.validation_testability,
                tension_resolution: n.validation_tension_resolution,
                composite: n.validation_composite,
                reason: n.validation_reason,
                validatedAt: n.validated_at,
                validatedBy: n.validated_by,
            } : null,
            provenance: provenanceMap[n.id] || null,
            avatarUrl: n.avatar_url || null,
            lifecycle: n.lifecycle_state ? {
                state: n.lifecycle_state,
                barrenCycles: n.barren_cycles || 0,
                totalChildren: n.total_children || 0,
                generation: n.generation || 0,
                bornAt: n.born_at,
                activatedAt: n.activated_at,
                decliningSince: n.declining_since,
                compostedAt: n.composted_at,
            } : null,
        })),
    };
}

export { parseEmbeddingField, handleQuery };
