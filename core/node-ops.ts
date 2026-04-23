/**
 * Node operations — the primary interface for knowledge graph mutation.
 *
 * **createNode** is the single entry point for inserting nodes. Every code path
 * (MCP propose, synthesis engine, question cycle, KB ingestion) flows through it.
 * The function runs a multi-step pipeline: embedding generation, specificity
 * measurement, universal dedup gate, domain synonym + partition auto-creation,
 * number-variable extraction, content hashing, and fire-and-forget background
 * tasks (keyword generation, inline autorating, avatar generation).
 *
 * **sampleNodes** is the foundation of pair discovery for synthesis. It selects
 * up to `n` breedable nodes using salience-weighted random sampling, respects
 * partition boundaries (only nodes from the same or bridged partitions are
 * eligible), and applies a cooldown to prevent re-selecting recently resonated
 * nodes. Barren-cycle penalties reduce selection probability for nodes that
 * have repeatedly failed to produce viable children.
 *
 * **Attention economy:** `decayAll` implements the four-phase decay that drives
 * the evolutionary pressure on the graph -- salience decay (selection pressure),
 * salience rescue (prevents orphaned partition death spirals), weight decay
 * (baseline regression), and optional synthesis decay (GA-inspired pressure on
 * unused synthesis/voiced nodes).
 *
 * Also provides edge CRUD, domain inference (3-tier: synonym -> embedding -> LLM),
 * domain synonym management, node editing with full audit trail, and brief
 * exclusion toggling.
 */

import { query, queryOne } from '../db.js';
import { weightedRandom } from '../db/sql.js';
import { getEmbedding } from '../models.js';
import { config as appConfig } from '../config.js';
import { config } from './engine-config.js';
import { measureSpecificity } from './specificity.js';
import { l2Normalize, embeddingToBuffer, cosineSimilarity, parseEmbedding } from './scoring.js';
import { getAccessibleDomains, ensurePartition, logDecision } from './governance.js';
import { emitActivity, nodeLabel } from '../services/event-bus.js';
import { computeContentHash, logOperation } from './integrity.js';
import { RC } from '../config/constants.js';
import type { CreateNodeOptions } from './types.js';

/**
 * Pick up to `n` breedable nodes for synthesis, partition-aware and cooldown-gated.
 *
 * Selection uses effective salience (penalized by barren cycles) as the random weight.
 * Nodes that were last resonated within 10 minutes are excluded (cooldown).
 * Raw, question, and elite_verification node types are always excluded.
 *
 * When a domain is provided, sampling is restricted to that domain's partition-accessible set.
 * When no domain is provided, a random domain is chosen first, then its accessible set is used.
 *
 * @param n - Maximum number of nodes to return (default 2).
 * @param domain - Optional domain to restrict sampling to (and its bridged partitions).
 * @returns An array of node rows suitable for synthesis pairing.
 */
async function sampleNodes(n: number = 2, domain: string | null = null) {
    // Penalize barren nodes: effective_salience = salience / (1 + barren_cycles * 0.3)
    // A node with 3 failed cycles has ~50% selection probability; at 8 (lifecycle threshold) ~28%.
    // This prevents the engine from endlessly retrying the same exhausted nodes.
    const baseSalience = `(salience / (1.0 + COALESCE(barren_cycles, 0) * 0.3))`;

    // Cap effective salience for nodes that EVM has disproved or classified as incoherent.
    // Three EVM outcome categories for parent selection:
    //   1. Disproved (completed, claimSupported=false) → cap salience
    //   2. Skipped-incoherent (not_testable — word salad, untestable) → cap salience
    //   3. Skipped-empirical (domain_expert — coherent but needs real-world data) → no cap (valuable)
    const evmCap = appConfig.labVerify.failedSalienceCap;
    const effectiveSalience = `(CASE ` +
        // Disproved: EVM ran and the claim was not supported
        `WHEN verification_results IS NOT NULL AND json_extract(verification_results, '$.claimSupported') = 0 ` +
        `THEN MIN(${baseSalience}, ${evmCap}) ` +
        // Skipped-incoherent: triage couldn't formulate a test (word salad / not_testable)
        `WHEN verification_status IN ('skipped', 'rejected_resynthesis') ` +
            `AND verification_results IS NOT NULL ` +
            `AND json_extract(verification_results, '$.testCategory') = 'not_testable' ` +
        `THEN MIN(${baseSalience}, ${evmCap}) ` +
        // Everything else (skipped-empirical, verified, untested) → no cap
        `ELSE ${baseSalience} END)`;
    const orderByRandom = `ORDER BY ${weightedRandom(effectiveSalience)}`;

    // Cooldown: skip nodes that were last resonated within the last 10 minutes.
    // Prevents the same node from being selected on consecutive cycles.
    const cooldownFilter = `AND (last_resonated IS NULL OR last_resonated < datetime('now', '-${RC.misc.nodeReselectionCooldownMinutes} minutes'))`;

    // If domain specified, use partition-aware accessible domains
    if (domain) {
        const accessible = await getAccessibleDomains(domain);
        if (accessible.length === 1) {
            return query(`
                SELECT id, content, embedding, weight, salience, specificity, domain,
                       node_type, generation, contributor, origin, verification_status, verification_score
                FROM nodes
                WHERE archived = FALSE
                  AND lab_status IS NULL
                  AND salience > $2
                  AND node_type NOT IN ('question', 'raw', 'elite_verification')
                  AND breedable != 0
                  AND COALESCE(synthesizable, 1) != 0
                  AND domain = $3
                  ${cooldownFilter}
                ${orderByRandom}
                LIMIT $1
            `, [n, config.salienceFloor, accessible[0]]);
        }
        const placeholders = accessible.map((_, i) => `$${i + 3}`).join(', ');
        return query(`
            SELECT id, content, embedding, weight, salience, specificity, domain,
                       node_type, generation, contributor, origin, verification_status, verification_score
            FROM nodes
            WHERE archived = FALSE
              AND lab_status IS NULL
              AND salience > $2
              AND node_type NOT IN ('question', 'raw', 'elite_verification')
              AND breedable != 0
              AND COALESCE(synthesizable, 1) != 0
              AND domain IN (${placeholders})
              ${cooldownFilter}
            ${orderByRandom}
            LIMIT $1
        `, [n, config.salienceFloor, ...accessible]);
    }

    // No domain specified: pick a random domain, then use its accessible set.
    // System domains (e.g. tuning) may be selected — getAccessibleDomains() ensures
    // they only pair with nodes in their own partition (no bridges can exist for system partitions).
    const randomDomain = await queryOne(`
        SELECT domain FROM nodes
        WHERE archived = FALSE AND domain IS NOT NULL
        GROUP BY domain
        ORDER BY RANDOM()
        LIMIT 1
    `);

    if (!randomDomain?.domain) {
        // No domains at all -- sample everything
        return query(`
            SELECT id, content, embedding, weight, salience, specificity, domain,
                       node_type, generation, contributor, origin, verification_status, verification_score
            FROM nodes
            WHERE archived = FALSE
              AND lab_status IS NULL
              AND salience > $1
              AND node_type NOT IN ('question', 'raw', 'elite_verification')
              AND breedable != 0
              AND COALESCE(synthesizable, 1) != 0
              ${cooldownFilter}
            ${orderByRandom}
            LIMIT $2
        `, [config.salienceFloor, n]);
    }

    // Partition-enforced: only sample from accessible domains
    const sampleDomains = await getAccessibleDomains(randomDomain.domain);

    if (sampleDomains.length === 1) {
        return query(`
            SELECT id, content, embedding, weight, salience, specificity, domain,
                       node_type, generation, contributor, origin, verification_status, verification_score
            FROM nodes
            WHERE archived = FALSE
              AND salience > $2
              AND node_type NOT IN ('question', 'raw', 'elite_verification')
              AND breedable != 0
              AND COALESCE(synthesizable, 1) != 0
              AND domain = $3
              ${cooldownFilter}
            ${orderByRandom}
            LIMIT $1
        `, [n, config.salienceFloor, sampleDomains[0]]);
    }

    const placeholders = sampleDomains.map((_, i) => `$${i + 3}`).join(', ');
    return query(`
        SELECT id, content, embedding, weight, salience, specificity, domain,
                       node_type, generation, contributor, origin, verification_status, verification_score
        FROM nodes
        WHERE archived = FALSE
          AND salience > $2
          AND node_type NOT IN ('question', 'raw', 'elite_verification')
          AND breedable != 0
          AND COALESCE(synthesizable, 1) != 0
          AND domain IN (${placeholders})
          ${cooldownFilter}
        ${orderByRandom}
        LIMIT $1
    `, [n, config.salienceFloor, ...sampleDomains]);
}

/**
 * Insert a new node into the graph with full pipeline processing.
 *
 * Pipeline steps (in order):
 * 1. Embedding generation (or use pre-computed from options).
 * 2. Specificity measurement.
 * 3. Universal dedup gate (skippable via `options.skipDedup`).
 * 4. Domain synonym + partition auto-creation.
 * 5. Embedding normalization + binary storage.
 * 6. DB INSERT.
 * 7. Number-variable extraction (replaces raw numbers with `[[[NXnnn]]]` placeholders).
 * 8. Content hash + integrity log.
 * 9. Fire-and-forget: keyword generation, inline autorating, avatar generation.
 *
 * @param content - The node's text content.
 * @param nodeType - Node type (e.g. 'seed', 'voiced', 'synthesis', 'raw', 'question').
 * @param origin - How the node was created (e.g. 'human', 'synthesis', 'voicing').
 * @param options - Additional options (domain, contributor, weight, salience, embedding, metadata, etc.).
 * @returns The inserted node row (with all columns), or `null` if rejected by the dedup gate.
 */
async function createNode(content: string, nodeType: string, origin: string, options: CreateNodeOptions = {}) {
    const embedding = options.embedding || await getEmbedding(content);
    const specificity = measureSpecificity(content, options.domain);

    // Universal dedup gate — check for duplicates before inserting
    // Synthesis engine passes skipDedup: true since it runs its own checkDuplicate() first
    if (!options.skipDedup && options.domain) {
        try {
            const { checkDuplicate } = await import('../handlers/dedup.js');
            const dupCheck = await checkDuplicate(content, embedding, options.domain, origin);
            if (dupCheck.isDuplicate) {
                emitActivity('synthesis', 'similarity_check', `Duplicate rejected → ${dupCheck.matchedNodeId?.slice(0, 8)}`, {
                    gate: 'dedup',
                    similarity: dupCheck.similarity || 0,
                    threshold: appConfig.dedup.embeddingSimilarityThreshold,
                    passed: false,
                    matchedNode: dupCheck.matchedNodeId,
                    reason: dupCheck.reason,
                    content: content.slice(0, 60),
                });
                console.error(`[createNode] Duplicate rejected: ${dupCheck.reason} (matched ${dupCheck.matchedNodeId?.slice(0, 8)})`);
                return null;
            }
        } catch (e: any) {
            // Non-fatal — if dedup check fails, allow creation to proceed
            emitActivity('system', 'warning', `Dedup check failed (proceeding): ${e.message}`, { error: e.message, nodeType, origin });
            console.error(`[createNode] Dedup check failed (proceeding): ${e.message}`);
        }
    }

    // Check if this is a new domain and generate synonyms + auto-partition
    if (options.domain) {
        await ensureDomainSynonyms(options.domain);
        try {
            await ensurePartition(options.domain, options.decidedByTier || 'system');
        } catch (e: any) {
            console.error(`[createNode] ensurePartition failed for ${options.domain}:`, e.message);
        }
    }

    // Pre-normalize embedding and store both JSON + binary formats
    const normalizedEmb = embedding ? l2Normalize(embedding) : null;
    const embeddingBin = normalizedEmb ? embeddingToBuffer(normalizedEmb) : null;
    const { getEmbeddingModelName } = await import('../models.js');
    const embeddingModel = embedding ? getEmbeddingModelName() : null;
    const embeddingDims = embedding ? embedding.length : null;

    const result = await queryOne(`
        INSERT INTO nodes (
            content, embedding, embedding_bin, embedding_model, embedding_dims,
            node_type, trajectory, domain,
            weight, salience, specificity, origin, contributor, metadata,
            lifecycle_state, born_at, model_id, model_name, name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
        RETURNING *
    `, [
        content,
        embedding ? JSON.stringify(embedding) : null,
        embeddingBin,
        embeddingModel,
        embeddingDims,
        nodeType,
        options.trajectory || null,
        options.domain || null,
        options.weight || config.nodes.defaultWeight,
        options.salience || config.nodes.defaultSalience,
        specificity,
        origin,
        options.contributor || null,
        options.metadata ? JSON.stringify(options.metadata) : null,
        'nascent',
        new Date().toISOString(),
        options.modelId || null,
        options.modelName || null,
        options.name || null,
    ]);

    // Append ID-based suffix to names for disambiguation (e.g. "Sparse Activation Threshold-A7F")
    if (result && result.name) {
        const suffix = result.id.replace(/-/g, '').slice(0, 3).toUpperCase();
        const suffixedName = `${result.name}-${suffix}`;
        await query('UPDATE nodes SET name = $1 WHERE id = $2', [suffixedName, result.id]);
        result.name = suffixedName;
    }

    // Number variable extraction — extract domain-scoped numbers and replace with [[[NXnnn]]] refs.
    // Runs here so ALL code paths (handlePropose, synthesis engine, question cycle, voicing cycle)
    // get extraction, not just the MCP handler.
    let finalContent = content;
    if (result && appConfig.numberVariables?.enabled && options.domain && nodeType !== 'raw') {
        try {
            const { registerNodeVariables } = await import('./number-variables.js');
            const varResult = await registerNodeVariables(result.id, result.content, options.domain);
            if (varResult.varIds.length > 0) {
                await query('UPDATE nodes SET content = $1 WHERE id = $2', [varResult.annotatedContent, result.id]);
                result.content = varResult.annotatedContent;
                finalContent = varResult.annotatedContent;
            }
        } catch (err: any) {
            console.error(`[node-ops] Number variable extraction failed for ${result.id}: ${err.message}`);
        }
    }

    // Compute and store content hash (no parent hashes yet — linked separately in handlePropose)
    if (result) {
        try {
            const contentHash = computeContentHash({
                content: finalContent,
                nodeType,
                contributor: options.contributor || null,
                createdAt: result.created_at || result.born_at || new Date().toISOString(),
            });
            await query('UPDATE nodes SET content_hash = $1 WHERE id = $2', [contentHash, result.id]);
            result.content_hash = contentHash;

            // Log creation to integrity chain
            logOperation({
                nodeId: result.id,
                operation: 'created',
                contentHashBefore: null,
                contentHashAfter: contentHash,
                contributor: options.contributor || origin,
                domain: options.domain,
            }).catch((err: any) => {
                console.error(`[integrity] Failed to log creation for ${result.id}: ${err.message}`);
            });
        } catch (err: any) {
            console.error(`[integrity] Failed to compute hash for ${result.id}: ${err.message}`);
        }
    }

    // Log creation decision with tier provenance
    if (result) {
        emitActivity('synthesis', 'node_created',
            `${nodeType} → ${(options.domain || 'unassigned').slice(0, 20)} (spec:${specificity.toFixed(3)})`, {
                nodeId: result.id,
                nodeType,
                domain: options.domain,
                specificity: +specificity.toFixed(4),
                weight: +(options.weight || config.nodes.defaultWeight).toFixed(2),
                origin,
                contributor: options.contributor,
            });
        const tier = options.decidedByTier || (origin === 'human' ? 'human' : 'system');
        await logDecision('node', result.id, 'created', null, nodeType, tier, options.contributor || origin, `Node created: ${nodeType}`);
        if (options.domain) {
            await logDecision('node', result.id, 'domain', null, options.domain, tier, options.contributor || origin, `Domain assigned at creation`);
        }

        // Fire-and-forget: generate keywords for this node in the background
        if (result.content && options.domain) {
            import('./keywords.js').then(({ generateNodeKeywords }) => {
                generateNodeKeywords(result.id, result.content, options.domain!).catch((err: any) => {
                    console.error(`[node-ops] Background keyword generation failed: ${err.message}`);
                });
            }).catch(() => { /* keywords module not available */ });
        }

        // Fire-and-forget: inline autorating — rate every new node immediately
        // LLM concurrency is controlled by the model semaphore, so bulk creation is safe.
        if (nodeType !== 'raw' && appConfig.autonomousCycles.autorating.enabled && appConfig.autonomousCycles.autorating.inlineEnabled) {
            autorateNodeInline(result.id, result.content, nodeType, options.domain || 'unknown').catch((err: any) => {
                // Silently ignore — autorating is best-effort, never blocks creation
                if (!err.message?.includes('No model assigned')) {
                    console.error(`[node-ops] Inline autorating failed: ${err.message}`);
                }
            });
        }

        // Fire-and-forget: set DiceBear avatar URL for the new node
        if (result.content && options.domain && nodeType !== 'raw') {
            import('./avatar-gen.js').then(({ generateAvatar }) => {
                generateAvatar(result.id, result.content, nodeType, options.domain!).catch((err: any) => {
                    console.error(`[node-ops] Avatar generation failed: ${err.message}`);
                });
            }).catch(() => {});
        }
    }

    return result;
}

/**
 * Ensure a domain has synonyms in the `domain_synonyms` table.
 * If none exist, generates rule-based synonyms immediately and kicks off
 * LLM-enriched synonym generation in the background.
 *
 * @param domain - The domain name to check/populate synonyms for.
 */
async function ensureDomainSynonyms(domain: string) {
    // Check if domain already has synonyms
    const existing = await query(
        'SELECT 1 FROM domain_synonyms WHERE domain = $1 LIMIT 1',
        [domain]
    );

    if (existing.length > 0) return;

    // Generate synonyms from the domain name
    const synonyms = generateDomainSynonyms(domain);

    // Store synonyms
    for (const synonym of synonyms) {
        try {
            await query(
                'INSERT INTO domain_synonyms (domain, synonym) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [domain, synonym]
            );
        } catch (_e) {
            // Ignore duplicates
        }
    }

    // Fire-and-forget: generate LLM synonyms in the background
    import('./keywords.js').then(({ generateLLMDomainSynonyms }) => {
        generateLLMDomainSynonyms(domain).catch((err: any) => {
            console.error(`[node-ops] Background LLM synonym generation failed: ${err.message}`);
        });
    }).catch(() => { /* keywords module not available */ });
}

/**
 * Generate rule-based synonyms from a domain name by splitting on hyphens
 * and applying morphological transformations (plural, -ing, -ed variants).
 *
 * For bio-related domains (containing "organ", "cell", or "tissue"), also
 * generates "bio"-prefixed variants.
 *
 * @example
 * generateDomainSynonyms("organ-printing")
 * // => ["organ", "organs", "printing", "print", "printed", "organprinting", "bioprinting", ...]
 *
 * @param domain - A kebab-case domain name.
 * @returns An array of unique synonym strings.
 */
function generateDomainSynonyms(domain: string): string[] {
    const synonyms = new Set<string>();

    // Split by hyphens
    const parts = domain.split('-');

    for (const part of parts) {
        synonyms.add(part);

        // Add singular/plural variants
        if (part.endsWith('s') && part.length > 3) {
            synonyms.add(part.slice(0, -1)); // organs -> organ
        } else if (!part.endsWith('s')) {
            synonyms.add(part + 's'); // organ -> organs
        }

        // Add -ing/-ed variants
        if (part.endsWith('ing')) {
            synonyms.add(part.slice(0, -3)); // printing -> print
            synonyms.add(part.slice(0, -3) + 'ed'); // printing -> printed
        } else if (part.endsWith('ed')) {
            synonyms.add(part.slice(0, -2)); // printed -> print
            synonyms.add(part.slice(0, -2) + 'ing'); // printed -> printing
        } else if (part.length > 3) {
            synonyms.add(part + 'ing'); // print -> printing
        }
    }

    // Add the full domain without hyphens
    synonyms.add(parts.join(''));

    // Add common prefixes for bio-related domains
    if (domain.includes('organ') || domain.includes('cell') || domain.includes('tissue')) {
        synonyms.add('bio' + parts[0]);
        synonyms.add('bio-' + parts[0]);
    }

    return [...synonyms];
}

/**
 * Find domains that match a search term using a multi-tier strategy:
 * 1. Exact domain name match (hyphenated and spaced forms).
 * 2. Synonym table lookup (ILIKE partial match).
 * 3. Partial domain name match on the `nodes` table.
 * 4. Individual word fallback (each word >= 3 chars matched independently).
 *
 * @param searchTerm - The user's search string (spaces or hyphens accepted).
 * @returns An array of matching domain names (may be empty).
 */
async function findDomainsBySynonym(searchTerm: string): Promise<string[]> {
    const hyphenated = searchTerm.toLowerCase().replace(/\s+/g, '-');
    const spaced = searchTerm.toLowerCase();

    // Try exact domain match (both hyphenated and spaced forms)
    const exactMatch = await query(
        'SELECT DISTINCT domain FROM nodes WHERE (LOWER(domain) = $1 OR LOWER(domain) = $2) AND archived = FALSE LIMIT 1',
        [hyphenated, spaced]
    );
    if (exactMatch.length > 0) {
        return exactMatch.map((r: any) => r.domain);
    }

    // Try synonym lookup
    const synonymMatch = await query(
        'SELECT DISTINCT domain FROM domain_synonyms WHERE synonym ILIKE $1 OR synonym ILIKE $2',
        [`%${hyphenated}%`, `%${spaced}%`]
    );
    if (synonymMatch.length > 0) {
        return synonymMatch.map((r: any) => r.domain);
    }

    // Try partial domain match (both forms)
    const partialMatch = await query(
        'SELECT DISTINCT domain FROM nodes WHERE (domain ILIKE $1 OR domain ILIKE $2) AND archived = FALSE',
        [`%${hyphenated}%`, `%${spaced}%`]
    );
    if (partialMatch.length > 0) {
        return partialMatch.map((r: any) => r.domain);
    }

    // Fallback: try each word individually for partial domain match
    const words = spaced.split(/\s+/).filter(w => w.length >= 3);
    if (words.length > 1) {
        const conditions = words.map((_, i) => `domain ILIKE $${i + 1}`).join(' OR ');
        const wordMatch = await query(
            `SELECT DISTINCT domain FROM nodes WHERE (${conditions}) AND archived = FALSE`,
            words.map(w => `%${w}%`)
        );
        return wordMatch.map((r: any) => r.domain);
    }

    return [];
}

/**
 * Create or upsert an edge between two nodes.
 * If an edge with the same (source, target, type) already exists, its strength is updated.
 *
 * @param sourceId - The source (parent) node UUID.
 * @param targetId - The target (child) node UUID.
 * @param edgeType - Relationship type (e.g. 'parent', 'synthesis', 'supersedes').
 * @param strength - Edge strength in [0, 1] (default 1.0).
 * @returns The inserted or updated edge row.
 */
async function createEdge(sourceId: string, targetId: string, edgeType: string, strength: number = 1.0) {
    return queryOne(`
        INSERT INTO edges (source_id, target_id, edge_type, strength)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (source_id, target_id, edge_type) DO UPDATE SET strength = $4
        RETURNING *
    `, [sourceId, targetId, edgeType, strength]);
}

/**
 * Bump a node's salience by a delta, capped at the engine salience ceiling.
 *
 * @param nodeId - The node UUID to update.
 * @param delta - The amount to add to the current salience (can be negative).
 */
async function updateNodeSalience(nodeId: string, delta: number) {
    return query(`
        UPDATE nodes
        SET salience = MIN(salience + $2, $3)
        WHERE id = $1
    `, [nodeId, delta, config.salienceCeiling]);
}

/**
 * Adjust a node's weight by a delta, capped at the configured weight ceiling.
 *
 * @param nodeId - The node UUID to update.
 * @param delta - The amount to add to the current weight (can be negative).
 */
async function updateNodeWeight(nodeId: string, delta: number) {
    const ceiling = config.weightCeiling ?? 3.0;
    const floor = appConfig.engine.weightFloor ?? 0.05;
    return query(`
        UPDATE nodes
        SET weight = MAX($4, MIN($3, weight + $2))
        WHERE id = $1
    `, [nodeId, delta, ceiling, floor]);
}

/**
 * Apply periodic decay to all active (non-archived) nodes.
 *
 * Four decay phases:
 * 1. **Salience decay** — multiplicative decay toward the salience floor.
 * 2. **Salience rescue** — nodes stuck near the floor for too many days are bumped to 2x floor,
 *    preventing the "orphaned partition death spiral".
 * 3. **Weight decay** — multiplicative decay toward baseline for all nodes.
 * 4. **Synthesis decay** (optional) — extra weight decay for synthesis/voiced nodes never used
 *    by the context engine, applying GA-inspired selection pressure.
 */
async function decayAll() {
    // Decay saliences toward floor (replaces stored function decay_saliences)
    await query(`
        UPDATE nodes
        SET salience = salience * $1
        WHERE archived = FALSE AND lab_status IS NULL AND salience > $2
    `, [config.salienceDecay, config.salienceFloor]);

    // Rescue stale nodes: if salience has decayed to near the floor, periodically
    // reset to a minimum viable level. This prevents the "orphaned partition death
    // spiral" where nodes in isolated partitions can never get synthesis boosts and
    // decay below the sampling threshold permanently. The rescue is small (2x floor)
    // so rescued nodes have low but nonzero selection probability.
    const rescueThreshold = config.salienceFloor * 1.5;
    const rescueSalience = config.salienceFloor * 2;
    await query(`
        UPDATE nodes
        SET salience = $1
        WHERE archived = FALSE
          AND lab_status IS NULL
          AND salience > 0
          AND salience <= $2
          AND updated_at < datetime('now', '-' || $3 || ' days')
    `, [rescueSalience, rescueThreshold, appConfig.magicNumbers.salienceRescueDays]);

    // Decay weights toward baseline (replaces stored function decay_weights)
    const floor = appConfig.engine.weightFloor ?? 0.05;
    await query(`
        UPDATE nodes
        SET weight = MAX($2, weight * $1)
        WHERE archived = FALSE AND lab_status IS NULL
    `, [config.weightDecay, floor]);

    // GA-inspired: extra decay for synthesis/voiced nodes that have proven no usefulness.
    // A node is "useful" if EITHER referenced in chat (session_node_usage) OR has produced
    // at least one surviving child (parent edge to a non-archived node). Nodes that fail
    // both signals after the grace period get the extra decay.
    if (appConfig.engine.synthesisDecayEnabled) {
        const graceDays = appConfig.engine.synthesisDecayGraceDays;
        const multiplier = appConfig.engine.synthesisDecayMultiplier;
        await query(`
            UPDATE nodes SET weight = MAX($3, weight * $1)
            WHERE archived = FALSE
              AND lab_status IS NULL
              AND node_type IN ('synthesis', 'voiced')
              AND created_at < datetime('now', '-' || $2 || ' days')
              AND id NOT IN (SELECT node_id FROM session_node_usage WHERE times_used > 0)
              AND id NOT IN (
                  SELECT e.source_id FROM edges e
                  JOIN nodes c ON c.id = e.target_id
                  WHERE e.edge_type = 'parent' AND c.archived = FALSE
              )
        `, [multiplier, graceDays, floor]);
    }
}

/**
 * Edit a node's content in-place with full audit trail and embedding regeneration.
 *
 * Validates content length (5-200 words unless `skipWordValidation` is set),
 * regenerates the embedding, re-measures specificity, updates the content hash,
 * logs the edit to both the decision log and the integrity chain, and invalidates
 * the knowledge cache for the node's domain.
 *
 * @param nodeId - The UUID of the node to edit.
 * @param newContent - The replacement text content.
 * @param contributor - Who initiated the edit (used for audit trail; prefix 'human' for human tier).
 * @param reason - Optional reason for the edit (recorded in the decision log).
 * @param options - Optional flags; `skipWordValidation` bypasses the 5-200 word length check.
 * @returns An object with `id`, `content`, `domain`, and `specificity`.
 * @throws If the node is not found or is archived.
 */
async function editNodeContent(nodeId: string, newContent: string, contributor: string, reason?: string, options?: { skipWordValidation?: boolean }) {
    const { queryOne: qOne } = await import('../db.js');
    const node = await qOne('SELECT id, content, domain, archived, node_type FROM nodes WHERE id = $1', [nodeId]);
    if (!node) throw new Error(`Node ${nodeId} not found`);
    if (node.archived) throw new Error(`Node ${nodeId} is archived — cannot edit`);

    // Validate content length (bypass for system enrichment edits)
    if (!options?.skipWordValidation) {
        const wordCount = newContent.trim().split(/\s+/).length;
        if (wordCount < 5) throw new Error('Content too short (minimum 5 words)');
        if (wordCount > 200) throw new Error('Content too long (maximum 200 words)');
    }

    const oldContent = node.content;

    // Log the edit decision
    await logDecision('node', nodeId, 'content', oldContent, newContent, contributor.startsWith('human') ? 'human' : 'system', contributor, reason || 'Content edited');

    // Regenerate embedding
    const embedding = await getEmbedding(newContent);
    const normalizedEmb = embedding ? l2Normalize(embedding) : null;
    const embeddingBin = normalizedEmb ? embeddingToBuffer(normalizedEmb) : null;
    const { getEmbeddingModelName } = await import('../models.js');
    const embeddingModel = embedding ? getEmbeddingModelName() : null;
    const embeddingDims = embedding ? embedding.length : null;

    // Re-measure specificity
    const specificity = measureSpecificity(newContent, node.domain);

    // Update the node
    await query(`
        UPDATE nodes SET
            content = $1, embedding = $2, embedding_bin = $3,
            embedding_model = $4, embedding_dims = $5,
            specificity = $6, updated_at = datetime('now')
        WHERE id = $7
    `, [
        newContent,
        embedding ? JSON.stringify(embedding) : null,
        embeddingBin,
        embeddingModel,
        embeddingDims,
        specificity,
        nodeId,
    ]);

    // Update content hash
    try {
        const oldHash = (await queryOne('SELECT content_hash FROM nodes WHERE id = $1', [nodeId]))?.content_hash || null;
        // Fetch parent hashes to include in recomputed hash
        const parentRows = await query(
            `SELECT n.content_hash FROM edges e JOIN nodes n ON n.id = e.source_id
             WHERE e.target_id = $1 AND e.edge_type = 'parent' AND n.content_hash IS NOT NULL`,
            [nodeId]
        );
        const parentHashes = parentRows.map((r: any) => r.content_hash);
        // Use original contributor and created_at (identity doesn't change)
        const origNode = await queryOne('SELECT contributor, created_at FROM nodes WHERE id = $1', [nodeId]);
        const newHash = computeContentHash({
            content: newContent,
            nodeType: node.node_type || 'seed',
            contributor: origNode?.contributor || null,
            createdAt: origNode?.created_at || '',
            parentHashes,
        });
        await query('UPDATE nodes SET content_hash = $1 WHERE id = $2', [newHash, nodeId]);
        logOperation({
            nodeId,
            operation: 'edited',
            contentHashBefore: oldHash,
            contentHashAfter: newHash,
            parentHashes,
            contributor,
            domain: node.domain,
            details: { reason: reason || 'Content edited' },
        }).catch((err: any) => {
            console.error(`[integrity] Failed to log edit for ${nodeId}: ${err.message}`);
        });
    } catch (err: any) {
        console.error(`[integrity] Failed to update hash on edit for ${nodeId}: ${err.message}`);
    }

    // Invalidate knowledge cache for this domain
    const { invalidateKnowledgeCache } = await import('../handlers/knowledge.js');
    invalidateKnowledgeCache(node.domain);

    return { id: nodeId, content: newContent, domain: node.domain, specificity };
}

/**
 * Toggle a node's exclusion from briefs (compress/summarize/scaffold).
 *
 * @param nodeId - The UUID of the node to update.
 * @param excluded - Whether the node should be excluded from briefs.
 * @param contributor - Who initiated the change (for audit trail).
 * @param reason - Optional reason for the change.
 * @returns An object with `id`, `excluded`, and `domain`.
 * @throws If the node is not found or is archived.
 */
async function setExcludedFromBriefs(nodeId: string, excluded: boolean, contributor: string, reason?: string) {
    const { queryOne: qOne } = await import('../db.js');
    const node = await qOne('SELECT id, domain, excluded FROM nodes WHERE id = $1 AND archived = FALSE', [nodeId]);
    if (!node) throw new Error(`Node ${nodeId} not found or archived`);

    const oldValue = node.excluded ? 'true' : 'false';
    const newValue = excluded ? 'true' : 'false';

    await query('UPDATE nodes SET excluded = $1, updated_at = datetime(\'now\') WHERE id = $2', [excluded ? 1 : 0, nodeId]);

    await logDecision('node', nodeId, 'excluded', oldValue, newValue, contributor.startsWith('human') ? 'human' : 'system', contributor, reason || `Brief exclusion ${excluded ? 'enabled' : 'disabled'}`);

    // Invalidate knowledge cache for this domain
    const { invalidateKnowledgeCache } = await import('../handlers/knowledge.js');
    invalidateKnowledgeCache(node.domain);

    return { id: nodeId, excluded, domain: node.domain };
}

/**
 * Convert arbitrary text to a valid domain slug (kebab-case, max 30 chars).
 * Strips non-alphanumeric characters, collapses whitespace into hyphens,
 * and removes trailing hyphens.
 *
 * @param text - The text to slugify.
 * @returns A lowercase kebab-case string, at most 30 characters.
 */
function toDomainSlug(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 30)
        .replace(/-$/, '');
}

/**
 * Infer the best domain for a piece of text using a 3-tier strategy:
 * 1. **Synonym match** — fast, no LLM call. Checks domain synonyms table.
 * 2. **Embedding similarity** — compares text embedding against each domain's highest-weight representative node.
 * 3. **LLM classification** — asks the `chat` subsystem to classify into an existing or new domain.
 *
 * Falls back to slugifying the first few words if all tiers fail.
 *
 * @param text - The content to classify into a domain.
 * @returns An object with the inferred `domain` name and the `source` tier that matched.
 */
async function inferDomain(text: string): Promise<{ domain: string; source: 'synonym' | 'embedding' | 'llm' | 'new' }> {
    // Extract a search key — first sentence or first ~80 chars
    const searchKey = text.length > RC.contentLimits.summaryMaxSearchOffset
        ? text.slice(0, text.indexOf('.', RC.contentLimits.summaryMinSearchOffset) > 0 ? text.indexOf('.', RC.contentLimits.summaryMinSearchOffset) + 1 : RC.contentLimits.summaryMaxSearchOffset).trim()
        : text;

    // Tier 1: synonym match (fast, no LLM)
    const synonymMatches = await findDomainsBySynonym(searchKey);
    if (synonymMatches.length > 0) {
        return { domain: synonymMatches[0], source: 'synonym' };
    }

    // Tier 2: embedding similarity against existing domain centroids
    try {
        const textEmbedding = await getEmbedding(text.slice(0, RC.contentLimits.embeddingTruncationChars));
        if (textEmbedding) {
            // Get top 5 nodes per domain (by weight) for centroid — single node is too noisy
            const domainReps = await query(
                `SELECT domain, embedding_bin FROM (
                     SELECT domain, embedding_bin,
                            ROW_NUMBER() OVER (PARTITION BY domain ORDER BY weight DESC) as rn
                     FROM nodes
                     WHERE archived = FALSE AND domain IS NOT NULL AND embedding_bin IS NOT NULL
                 ) ranked WHERE rn <= 5`,
                []
            );

            // Build centroid per domain
            const domainVecs = new Map<string, number[][]>();
            for (const rep of domainReps) {
                const vec = parseEmbedding(rep.embedding_bin);
                if (vec) {
                    if (!domainVecs.has(rep.domain)) domainVecs.set(rep.domain, []);
                    domainVecs.get(rep.domain)!.push(vec);
                }
            }

            let bestDomain = '';
            let bestSim = 0;
            const textVec = Array.isArray(textEmbedding) ? textEmbedding : parseEmbedding(textEmbedding as any);

            for (const [domain, vecs] of domainVecs) {
                if (!textVec || vecs.length === 0) continue;
                // Compute centroid
                const dim = vecs[0].length;
                const centroid = new Array(dim).fill(0);
                for (const v of vecs) { for (let i = 0; i < dim; i++) centroid[i] += v[i] / vecs.length; }
                const sim = cosineSimilarity(textVec, centroid);
                if (sim > bestSim) {
                    bestSim = sim;
                    bestDomain = domain;
                }
            }

            if (bestSim > appConfig.magicNumbers.domainInferenceThreshold && bestDomain) {
                return { domain: bestDomain, source: 'embedding' };
            }
        }
    } catch (e: any) {
        console.error(`[inferDomain] Embedding tier failed: ${e.message}`);
    }

    // Tier 3: LLM classification
    try {
        const existingDomains = await query(
            `SELECT DISTINCT domain FROM nodes WHERE archived = FALSE AND domain IS NOT NULL ORDER BY domain`,
            []
        );
        const domainList = existingDomains.map((r: any) => r.domain).join(', ');
        const truncatedText = text.slice(0, RC.contentLimits.specificityTruncationChars);

        const { getPrompt } = await import('../prompts.js');
        const prompt = await getPrompt('domain.classify', {
            text: truncatedText,
            existingDomains: domainList || '(none yet)',
        });

        const { callSubsystemModel } = await import('../models.js');
        const response = await callSubsystemModel('chat', prompt, {});

        // Parse JSON from response
        const jsonMatch = response.match(/\{[^}]*"domain"\s*:\s*"([^"]+)"[^}]*\}/);
        if (jsonMatch) {
            const suggested = toDomainSlug(jsonMatch[1]);
            if (suggested) {
                // Compare slugified forms to match regardless of spaces vs hyphens
                const existingMatch = existingDomains.find((r: any) => toDomainSlug(r.domain) === suggested);
                if (existingMatch) {
                    return { domain: existingMatch.domain, source: 'llm' };
                }
                return { domain: suggested, source: 'new' };
            }
        }
    } catch (e: any) {
        console.error(`[inferDomain] LLM tier failed: ${e.message}`);
    }

    // Final fallback: slug from first few words
    const fallback = toDomainSlug(searchKey.split(/\s+/).slice(0, RC.misc.domainSlugWords).join(' '));
    return { domain: fallback || 'unassigned', source: 'new' };
}

/**
 * Inline autorating — called fire-and-forget after node creation.
 * Rates the node immediately using the autorating LLM subsystem.
 * Silently skips if no autorating model is assigned.
 *
 * The LLM is asked for a rating of 1 (useful), 0 (not useful), or -1 (harmful),
 * plus a reason. The result is recorded via `handleRate` with source 'auto'.
 *
 * @param nodeId - The UUID of the newly created node.
 * @param content - The node's text content (number-variable placeholders are resolved before sending to LLM).
 * @param nodeType - The node type (e.g. 'seed', 'voiced').
 * @param domain - The node's domain.
 */
async function autorateNodeInline(nodeId: string, content: string, nodeType: string, domain: string): Promise<void> {
    const { callSubsystemModel } = await import('../models.js');
    const { getPrompt } = await import('../prompts.js');
    const { getProjectContextBlock } = await import('./project-context.js');
    const { handleRate } = await import('../handlers/feedback.js');
    const { resolveContent } = await import('./number-variables.js');

    const projectContext = await getProjectContextBlock() || '';

    // Resolve [[[SBKR...]]] placeholders back to actual numbers before LLM sees the content
    const resolvedContent = await resolveContent(content);

    const { buildProvenanceTag } = await import('./provenance.js');
    const prompt = await getPrompt('core.autorating', {
        nodeContent: resolvedContent,
        nodeType,
        nodeDomain: domain,
        parentContext: '\nNOTE: This is an inline rating at creation time — parent edges have not been created yet. For voiced/synthesis nodes, you cannot verify grounding against parents. Focus on surface quality: specificity, coherence, and whether the content reads as genuine insight vs vague filler. Do NOT rate -1 for unverifiable grounding — that is expected without parent context.\n',
        projectContext: projectContext ? projectContext + '\n\n' : '',
        provenanceTag: buildProvenanceTag({ node_type: nodeType }),
    });

    const jsonSchema = {
        name: 'autorating',
        schema: {
            type: 'object',
            properties: {
                rating: { type: 'number', enum: [1, 0, -1] },
                reason: { type: 'string' },
            },
            required: ['rating', 'reason'],
            additionalProperties: false,
        },
    };

    const response = await callSubsystemModel('autorating', prompt, { jsonSchema });

    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    let result: { rating: number; reason: string };
    try {
        result = JSON.parse(jsonMatch[0]);
    } catch {
        return;
    }

    if (![1, 0, -1].includes(result.rating)) return;

    await handleRate({
        nodeId,
        rating: result.rating,
        source: 'auto',
        contributor: 'autorating-inline',
        note: result.reason,
        context: JSON.stringify({ inline: true }),
    });

    const ratingLabel = result.rating === 1 ? 'useful' : result.rating === 0 ? 'not useful' : 'harmful';
    emitActivity('cycle', 'autorating_inline', `Inline rated ${nodeLabel(nodeId, content)} as ${ratingLabel}`, { nodeId, nodeType, domain, rating: result.rating, ratingLabel, reason: result.reason });
}

export {
    sampleNodes,
    createNode,
    createEdge,
    findDomainsBySynonym,
    ensureDomainSynonyms,
    updateNodeSalience,
    updateNodeWeight,
    decayAll,
    editNodeContent,
    setExcludedFromBriefs,
    inferDomain,
    toDomainSlug,
};
