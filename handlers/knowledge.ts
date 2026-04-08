/**
 * Knowledge handlers — compress, summarize, and domain digest operations.
 *
 * Provides cached, LLM-generated knowledge summaries and dense system prompts
 * from the node graph. Supports topic-based and task-aware retrieval with
 * domain partition awareness and background cache warming.
 * @module handlers/knowledge
 */

import { RC } from '../config/constants.js';
import { query, queryOne, cosineSimilarity } from '../core.js';
import { getPrompt } from '../prompts.js';
import { resolveContent } from '../core/number-variables.js';
import { formatNodeWithProvenance, PROVENANCE_GUIDE_USER } from '../core/provenance.js';

/**
 * Fetch nodes relevant to a topic, optionally reranked by task embedding similarity.
 *
 * Resolves domains via synonym matching and partition awareness. When a task
 * string is provided, embeds it and scores each node by a 70/30 blend of
 * task similarity and weight. Falls back to content LIKE search when domain
 * matching yields sparse results.
 *
 * @param topic - The topic string to search for (used for domain inference and content fallback).
 * @param task - Optional task description for relevance reranking (skips cache when provided).
 * @param limit - Maximum nodes to return (default 25).
 * @param explicitDomains - Optional explicit domain list (bypasses synonym inference).
 * @returns Array of nodes sorted by relevance (task-aware) or weight (default), with resolved content.
 */
async function fetchTopicNodes(topic: string, task: string | null = null, limit: number = 25, explicitDomains?: string[]) {
    let domainFilter: string[];

    if (explicitDomains && explicitDomains.length > 0) {
        // Explicit domains: expand via partition awareness
        const { getAccessibleDomains } = await import('../core.js');
        const expanded = await Promise.all(explicitDomains.map(d => getAccessibleDomains(d)));
        domainFilter = [...new Set(expanded.flat())];
    } else {
        // Infer from topic string (existing behavior)
        const { findDomainsBySynonym } = await import('../core.js');
        const matchedDomains = await findDomainsBySynonym(topic);
        if (matchedDomains.length > 0) {
            domainFilter = matchedDomains;
        } else {
            // Check if kebab-cased topic matches a partition ID
            const candidateId = topic.toLowerCase().replace(/\s+/g, '-');
            const partitionDomains = await query(
                `SELECT domain FROM partition_domains WHERE partition_id = $1`,
                [candidateId]
            );
            domainFilter = partitionDomains.length > 0
                ? partitionDomains.map((r: any) => r.domain)
                : [candidateId];
        }
    }

    // Include embedding column when task-aware reranking is needed
    // Include provenance columns (generation, contributor, origin, verification_status, verification_score) for tagging
    const provCols = ', generation, contributor, origin, verification_status, verification_score';
    const selectCols = task
        ? 'content, domain, node_type, weight, salience, embedding' + provCols
        : 'content, domain, node_type, weight, salience' + provCols;

    const placeholders = domainFilter.map((_, i) => `$${i + 1}`).join(', ');
    let nodes = await query(
        `SELECT ${selectCols}
         FROM nodes WHERE archived = FALSE AND lab_status IS NULL AND (excluded IS NULL OR excluded = 0) AND node_type != 'raw' AND domain IN (${placeholders})
         ORDER BY weight DESC, salience DESC LIMIT ${RC.queryLimits.knowledgeQueryLimit}`,
        domainFilter
    );

    // Fallback to content search if domain match is sparse (skip when domains are explicit)
    if (!explicitDomains && nodes.length < 10) {
        const contentNodes = await query(
            `SELECT ${selectCols}
             FROM nodes WHERE archived = FALSE AND lab_status IS NULL AND (excluded IS NULL OR excluded = 0) AND node_type != 'raw' AND content LIKE $1
             ORDER BY weight DESC LIMIT ${RC.queryLimits.knowledgeAltQueryLimit}`,
            [`%${topic}%`]
        );
        const existing = new Set(nodes.map(n => n.content));
        nodes = [...nodes, ...contentNodes.filter(n => !existing.has(n.content))];
    }

    // Resolve number variable placeholders — safe for output (display only)
    for (const n of nodes) {
        if (n.content) n.content = await resolveContent(n.content);
    }

    // If no task, return weight-sorted (original behavior)
    if (!task || nodes.length === 0) {
        return nodes.slice(0, limit);
    }

    // Task-aware reranking via embedding similarity
    const { getEmbedding } = await import('../models.js');
    const taskEmbedding = await getEmbedding(task);

    if (!taskEmbedding) {
        // Embedding service unavailable — fall back to weight ordering
        return nodes.slice(0, limit);
    }

    // Score each node: blend task similarity (0.7) with weight (0.3)
    const scored = nodes.map(node => {
        let similarity = 0;
        if (node.embedding) {
            const emb = typeof node.embedding === 'string'
                ? JSON.parse(node.embedding) : node.embedding;
            similarity = cosineSimilarity(taskEmbedding, emb);
        }
        const weightScore = Math.min(node.weight / 2.0, 1);
        const combined = (similarity * 0.7) + (weightScore * 0.3);
        return { ...node, relevance: combined, taskSimilarity: similarity };
    });

    scored.sort((a, b) => b.relevance - a.relevance);

    // Strip embedding from returned nodes (large, not needed downstream)
    return scored.slice(0, limit).map(({ embedding, ...rest }) => rest);
}

// Track in-flight warming to prevent concurrent regeneration of the same entry
const warmingInFlight = new Set<string>();

/**
 * Invalidate knowledge cache entries that cover the given domain.
 *
 * Marks matching entries as stale (increments `changes_since_cached`) rather
 * than deleting them, so consumers get stale data instead of nothing while
 * background warming regenerates fresh entries.
 *
 * @param domain - The domain whose cache entries should be invalidated. No-op if null.
 */
async function invalidateKnowledgeCache(domain: string | null) {
    if (!domain) return;
    const toWarm: Array<{ cache_type: string; topic: string }> = [];
    try {
        // Mark cache entries stale instead of deleting — stale data is better than no data
        const entries = await query(
            `SELECT cache_type, topic, domains FROM knowledge_cache`
        );
        for (const entry of entries) {
            try {
                const domains = JSON.parse(entry.domains);
                if (domains.includes(domain)) {
                    await query(
                        `UPDATE knowledge_cache SET stale = 1, changes_since_cached = changes_since_cached + 1
                         WHERE cache_type = $1 AND topic = $2`,
                        [entry.cache_type, entry.topic]
                    );
                    toWarm.push({ cache_type: entry.cache_type, topic: entry.topic });
                }
            } catch { /* skip malformed entries */ }
        }
    } catch {
        // Cache table may not exist yet — ignore
    }

    // Fire-and-forget background warming for affected entries
    if (toWarm.length > 0) {
        warmStaleEntries(toWarm).catch(err =>
            console.error(`[cache-warm] Background warming failed:`, err.message)
        );
    }
}

/**
 * Background cache warming — regenerates stale cache entries without blocking callers.
 * Skips entries already being warmed (deduplication via in-flight set).
 */
async function warmStaleEntries(entries: Array<{ cache_type: string; topic: string }>) {
    for (const { cache_type, topic } of entries) {
        const key = `${cache_type}:${topic}`;
        if (warmingInFlight.has(key)) continue;
        warmingInFlight.add(key);

        try {
            if (cache_type === 'compress') {
                await regenerateCacheEntry('compress', topic);
            } else if (cache_type === 'summarize') {
                await regenerateCacheEntry('summarize', topic);
            } else if (cache_type === 'digest') {
                await generateDomainDigest(topic);
            }
            console.error(`[cache-warm] Regenerated ${cache_type} for "${topic}"`);
        } catch (err: any) {
            console.error(`[cache-warm] Failed to regenerate ${cache_type} for "${topic}": ${err.message}`);
            // Stale entry remains — consumers get stale data instead of nothing
        } finally {
            warmingInFlight.delete(key);
        }
    }
}

/**
 * Core regeneration logic shared by background warming and direct calls.
 * Fetches fresh nodes, calls the LLM, and writes the cache entry.
 */
async function regenerateCacheEntry(cacheType: 'compress' | 'summarize', topic: string) {
    const { callSubsystemModel } = await import('../models.js');
    const limit = cacheType === 'compress' ? 25 : 20;
    const nodes = await fetchTopicNodes(topic, null, limit);

    if (nodes.length === 0) return;

    const nodeList = nodes.map(n => formatNodeWithProvenance(n, n.content)).join('\n');

    const promptKey = cacheType === 'compress' ? 'knowledge.compress' : 'knowledge.summarize';
    const prompt = await getPrompt(promptKey, { topic, nodeList, provenanceGuide: PROVENANCE_GUIDE_USER });
    const output = await callSubsystemModel('compress', prompt, {});
    if (!output) return;

    let result: any;
    if (cacheType === 'compress') {
        result = { topic, nodeCount: nodes.length, compressed: output };
    } else {
        const breakthroughs = nodes.filter(n => n.node_type === 'breakthrough' || n.weight > 1.3);
        const syntheses = nodes.filter(n => n.node_type === 'synthesis' || n.node_type === 'voiced');
        const seeds = nodes.filter(n => n.node_type === 'seed');
        result = { topic, nodeCount: nodes.length, breakthroughs: breakthroughs.length, syntheses: syntheses.length, seeds: seeds.length, summary: output };
    }

    const allDomains = [...new Set(nodes.map(n => n.domain))];
    await query(
        `INSERT OR REPLACE INTO knowledge_cache (cache_type, topic, domains, node_count, result, stale, changes_since_cached)
         VALUES ($1, $2, $3, $4, $5, 0, 0)`,
        [cacheType, topic, JSON.stringify(allDomains), nodes.length, JSON.stringify(result)]
    );
}

/**
 * Generate a structured summary for a topic from graph knowledge.
 *
 * Returns cached results when no task or explicit domains are provided.
 * Stale cache entries are returned with staleness metadata while background
 * warming regenerates. On cache miss, calls the compress subsystem LLM.
 *
 * @param params - Object with `topic` (required), optional `task`, `domains`, `targetProfile`.
 * @returns Summary with node counts by type, or `{ error }` if no knowledge found.
 */
async function handleSummarize(params: Record<string, any>) {
    const { topic, task, domains, targetProfile } = params;
    if (!topic) return { error: 'topic is required' };

    const explicitDomains = domains && domains.length > 0 ? domains : undefined;

    // Cache lookup: only when no task and no explicit domains (both make results dynamic)
    if (!task && !explicitDomains) {
        try {
            const cached = await queryOne(
                `SELECT result, node_count, created_at, stale, changes_since_cached
                 FROM knowledge_cache WHERE cache_type = 'summarize' AND topic = $1`,
                [topic]
            );
            if (cached && !cached.stale) {
                const result = JSON.parse(cached.result);
                console.error(`[summarize] CACHE HIT for "${topic}" — summary length: ${result.summary?.length ?? 0} chars`);
                return { ...result, cached: true, cachedAt: cached.created_at };
            }
            if (cached?.stale) {
                // Return stale data with staleness metadata — better than blocking on LLM call
                const result = JSON.parse(cached.result);
                console.error(`[summarize] STALE CACHE for "${topic}" — ${cached.changes_since_cached} changes since cached, warming in background`);
                return { ...result, cached: true, stale: true, changesSinceCached: cached.changes_since_cached, cachedAt: cached.created_at };
            }
        } catch { /* cache miss or table doesn't exist */ }
    }

    console.error(`[summarize] CACHE MISS for "${topic}" — calling LLM`);
    const nodes = await fetchTopicNodes(topic, task, 20, explicitDomains);

    if (nodes.length === 0) {
        return { error: `No knowledge found about "${topic}". Use podbit.propose to add seeds first.` };
    }

    const breakthroughs = nodes.filter(n => n.node_type === 'breakthrough' || n.weight > 1.3);
    const syntheses = nodes.filter(n => n.node_type === 'synthesis' || n.node_type === 'voiced');
    const seeds = nodes.filter(n => n.node_type === 'seed');

    const { callSubsystemModel } = await import('../models.js');
    const nodeList = nodes.map(n => formatNodeWithProvenance(n, n.content)).join('\n');

    const prompt = task
        ? await getPrompt('knowledge.summarize_task', { topic, task, nodeList, provenanceGuide: PROVENANCE_GUIDE_USER })
        : await getPrompt('knowledge.summarize', { topic, nodeList, provenanceGuide: PROVENANCE_GUIDE_USER });

    let summary: string;
    try {
        summary = await callSubsystemModel('compress', prompt, {});
    } catch (err: any) {
        return { error: `Compress model failed for summarize: ${err.message}` };
    }

    const result = {
        topic,
        ...(task ? { task } : {}),
        ...(targetProfile ? { targetProfile } : {}),
        nodeCount: nodes.length,
        breakthroughs: breakthroughs.length,
        syntheses: syntheses.length,
        seeds: seeds.length,
        summary,
    };

    // Cache write: only when no task AND summary is non-empty (don't poison cache with empty results)
    if (!task && summary) {
        const allDomains = [...new Set(nodes.map(n => n.domain))];
        try {
            await query(
                `INSERT OR REPLACE INTO knowledge_cache (cache_type, topic, domains, node_count, result, stale, changes_since_cached)
                 VALUES ($1, $2, $3, $4, $5, 0, 0)`,
                ['summarize', topic, JSON.stringify(allDomains), nodes.length, JSON.stringify(result)]
            );
        } catch { /* cache write failure is non-fatal */ }
    }

    return result;
}

/**
 * Generate a dense compressed knowledge prompt for a topic from graph knowledge.
 *
 * Returns cached results when no task or explicit domains are provided.
 * Stale cache entries are returned with staleness metadata. On cache miss,
 * calls the compress subsystem LLM to produce a compact system prompt.
 *
 * @param params - Object with `topic` (required), optional `task`, `domains`, `targetProfile`.
 * @returns Compressed text with node count, or `{ error }` if no knowledge found.
 */
async function handleCompress(params: Record<string, any>) {
    const { topic, task, domains, targetProfile } = params;
    if (!topic) return { error: 'topic is required' };

    const explicitDomains = domains && domains.length > 0 ? domains : undefined;

    // Cache lookup: only when no task and no explicit domains (both make results dynamic)
    if (!task && !explicitDomains) {
        try {
            const cached = await queryOne(
                `SELECT result, node_count, created_at, stale, changes_since_cached
                 FROM knowledge_cache WHERE cache_type = 'compress' AND topic = $1`,
                [topic]
            );
            if (cached && !cached.stale) {
                const result = JSON.parse(cached.result);
                return { ...result, cached: true, cachedAt: cached.created_at };
            }
            if (cached?.stale) {
                const result = JSON.parse(cached.result);
                console.error(`[compress] STALE CACHE for "${topic}" — ${cached.changes_since_cached} changes since cached, warming in background`);
                return { ...result, cached: true, stale: true, changesSinceCached: cached.changes_since_cached, cachedAt: cached.created_at };
            }
        } catch { /* cache miss or table doesn't exist */ }
    }

    const nodes = await fetchTopicNodes(topic, task, 25, explicitDomains);

    if (nodes.length === 0) {
        return { error: `No knowledge found about "${topic}". Use podbit.propose to add seeds first.` };
    }

    const { callSubsystemModel } = await import('../models.js');
    const nodeList = nodes.map(n => formatNodeWithProvenance(n, n.content)).join('\n');

    const prompt = task
        ? await getPrompt('knowledge.compress_task', { topic, task, nodeList, provenanceGuide: PROVENANCE_GUIDE_USER })
        : await getPrompt('knowledge.compress', { topic, nodeList, provenanceGuide: PROVENANCE_GUIDE_USER });

    let compressed: string;
    try {
        compressed = await callSubsystemModel('compress', prompt, {});
    } catch (err: any) {
        return { error: `Compress model failed: ${err.message}` };
    }

    const result = {
        topic,
        ...(task ? { task } : {}),
        ...(targetProfile ? { targetProfile } : {}),
        nodeCount: nodes.length,
        compressed,
    };

    // Cache write: only when no task AND compressed is non-empty (don't poison cache with empty results)
    if (!task && compressed) {
        const allDomains = [...new Set(nodes.map(n => n.domain))];
        try {
            await query(
                `INSERT OR REPLACE INTO knowledge_cache (cache_type, topic, domains, node_count, result, stale, changes_since_cached)
                 VALUES ($1, $2, $3, $4, $5, 0, 0)`,
                ['compress', topic, JSON.stringify(allDomains), nodes.length, JSON.stringify(result)]
            );
        } catch { /* cache write failure is non-fatal */ }
    }

    return result;
}

/**
 * Generate or fetch a cached domain digest — a dense ~200 token summary of a domain.
 * Used by the context engine for micro/small model profiles as a more efficient
 * alternative to serving 3-5 individual knowledge nodes.
 */
async function generateDomainDigest(domain: string): Promise<string | null> {
    // Check cache first
    try {
        const cached = await queryOne(
            `SELECT result FROM knowledge_cache WHERE cache_type = 'digest' AND topic = $1`,
            [domain]
        );
        if (cached) {
            return JSON.parse(cached.result).digest;
        }
    } catch { /* cache miss or table doesn't exist */ }

    // Fetch top-10 nodes by weight for this domain (include provenance columns)
    const nodes = await query(
        `SELECT content, node_type, weight, generation, contributor, origin, verification_status, verification_score FROM nodes
         WHERE archived = FALSE AND lab_status IS NULL AND (excluded IS NULL OR excluded = 0) AND domain = $1
         ORDER BY weight DESC LIMIT ${RC.queryLimits.knowledgeContextLimit}`,
        [domain]
    );

    if (nodes.length === 0) return null;

    const { callSubsystemModel } = await import('../models.js');
    const nodeList = nodes.map((n: any) => formatNodeWithProvenance(n, n.content)).join('\n');

    const prompt = await getPrompt('knowledge.digest', {
        nodeCount: String(nodes.length),
        domain,
        nodeList,
        provenanceGuide: PROVENANCE_GUIDE_USER,
    });

    let digest: string | null = null;
    try {
        digest = await callSubsystemModel('compress', prompt, {});
    } catch {
        return null;
    }

    if (digest) {
        // Cache the digest
        try {
            await query(
                `INSERT OR REPLACE INTO knowledge_cache (cache_type, topic, domains, node_count, result, stale, changes_since_cached)
                 VALUES ($1, $2, $3, $4, $5, 0, 0)`,
                ['digest', domain, JSON.stringify([domain]), nodes.length, JSON.stringify({ digest })]
            );
        } catch { /* cache write failure is non-fatal */ }
    }

    return digest;
}

export {
    cosineSimilarity,
    fetchTopicNodes,
    invalidateKnowledgeCache,
    handleSummarize,
    handleCompress,
    generateDomainDigest,
};
