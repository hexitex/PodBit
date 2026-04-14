/**
 * @module routes/partitions/exchange
 *
 * Partition export/import logic.  `exportPartition` serialises a partition
 * (domains, active nodes without embeddings, edges, bridges, number
 * variables, integrity log, and elite metadata) into a JSON envelope.
 * `importPartition` restores one — creating the partition, domains, nodes,
 * edges, bridges, number variables, elite metadata, and integrity log
 * entries, with optional overwrite semantics.
 */

import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { query, queryOne } from '../../db.js';
import { VERSION } from '../../config.js';
import { invalidateKnowledgeCache } from '../../handlers/knowledge.js';

/**
 * Registers partition export and import HTTP routes.
 *
 * Routes:
 * - `GET  /partitions/:id/export`  — export partition as JSON (requires `?owner=` query param)
 * - `POST /partitions/import`      — import partition from JSON body (optional `?overwrite=true`)
 *
 * @param router - The Express router to mount routes on.
 */
export function registerExchangeRoutes(router: Router) {
    // Export a partition as JSON (full: partition + domains + nodes + edges)
    router.get('/partitions/:id/export', asyncHandler(async (req, res) => {
        const owner = req.query.owner as string;
        if (!owner) {
            return res.status(400).json({ error: 'owner query parameter is required (e.g., ?owner=rob)' });
        }

        const exportData = await exportPartition(req.params.id, owner);
        if (!exportData) {
            return res.status(404).json({ error: 'Partition not found' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${owner}-${req.params.id}.podbit.json"`);
        res.json(exportData);
    }));

    // Import a partition from JSON
    router.post('/partitions/import', async (req, res, next) => {
        try {
            const data = req.body;
            const overwrite = req.query.overwrite === 'true';
            const result = await importPartition(data, overwrite);
            res.json(result);
        } catch (err: any) {
            if (err.message?.startsWith('VALIDATION:') || err.message?.startsWith('CONFLICT:')) {
                return res.status(400).json({ error: err.message });
            }
            next(err);
        }
    });
}

// --- Export logic ---

/**
 * Exports a partition as a self-contained JSON envelope.
 *
 * The export includes: partition metadata, domains, active nodes (without
 * embedding vectors), edges between those nodes, bridges to other partitions,
 * number variable registry/refs, integrity Merkle root + chain log, and
 * elite pool metadata (elite_nodes, manifest_mappings, verified_variables,
 * bridging_log).
 *
 * @param partitionId - The partition ID to export.
 * @param owner       - Owner label embedded in the export (used to namespace on import).
 * @returns The export envelope object, or `null` if the partition does not exist.
 */
export async function exportPartition(partitionId: string, owner: string) {
    // Get partition metadata
    const partition = await queryOne(`
        SELECT id, name, description, created_at FROM domain_partitions WHERE id = $1
    `, [partitionId]);
    if (!partition) return null;

    // Get domains
    const domainRows = await query(`
        SELECT domain FROM partition_domains WHERE partition_id = $1 ORDER BY domain
    `, [partitionId]);
    const domains = domainRows.map((d: any) => d.domain);

    if (domains.length === 0) {
        return {
            podbitExport: '1.0',
            systemVersion: VERSION,
            exportedAt: new Date().toISOString(),
            owner,
            partition: { id: partition.id, name: partition.name, description: partition.description, domains },
            bridges: [],
            nodes: [],
            edges: [],
            nodeCount: 0,
            edgeCount: 0,
        };
    }

    // Get bridges
    const bridges = await query(`
        SELECT partition_a, partition_b FROM partition_bridges
        WHERE partition_a = $1 OR partition_b = $1
    `, [partitionId]);
    const bridgeList = bridges.map((b: any) => ({
        targetPartition: b.partition_a === partitionId ? b.partition_b : b.partition_a,
    }));

    // Build domain placeholders for IN clause
    const domainPlaceholders = domains.map((_: string, i: number) => `$${i + 1}`).join(', ');

    // Get all active nodes in these domains
    const nodes = await query(`
        SELECT id, content, node_type, trajectory, domain,
               weight, salience, specificity, origin, contributor,
               validation_synthesis, validation_novelty, validation_testability,
               validation_tension_resolution, validation_composite,
               validation_reason, validated_at, validated_by,
               content_hash, created_at, updated_at
        FROM nodes
        WHERE domain IN (${domainPlaceholders})
          AND (archived = 0 OR archived IS NULL)
          AND (junk = 0 OR junk IS NULL)
        ORDER BY created_at
    `, domains);

    // Get edges between exported nodes
    const nodeIds = nodes.map((n: any) => n.id);
    let edges: any[] = [];
    if (nodeIds.length > 0) {
        const nodeIdPlaceholders = nodeIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
        edges = await query(`
            SELECT source_id, target_id, edge_type, strength
            FROM edges
            WHERE source_id IN (${nodeIdPlaceholders})
              AND target_id IN (${nodeIdPlaceholders})
        `, [...nodeIds, ...nodeIds]);
    }

    // Get number variable data for exported nodes
    let numberVariables: any = null;
    if (nodeIds.length > 0) {
        try {
            const nodeIdPlaceholders2 = nodeIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
            // Get all var refs for exported nodes
            const refs = await query(`
                SELECT node_id, var_id FROM node_number_refs
                WHERE node_id IN (${nodeIdPlaceholders2})
            `, nodeIds);
            if (refs.length > 0) {
                const varIds = [...new Set(refs.map((r: any) => r.var_id))];
                const varPlaceholders = varIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
                const registry = await query(`
                    SELECT var_id, value, scope_text, source_node_id, domain, created_at
                    FROM number_registry WHERE var_id IN (${varPlaceholders})
                `, varIds);
                numberVariables = { registry, refs };
            }
        } catch (err: any) {
            // Table may not exist on older DBs — non-fatal
            console.warn(`[export] Number variable export skipped: ${err.message}`);
        }
    }

    // Compute integrity: Merkle root + log entries for exported nodes
    let integrity: any = null;
    try {
        const { computeMerkleRoot, getIntegrityLogForNodes } = await import('../../core/integrity.js');
        const contentHashes = nodes.map((n: any) => n.content_hash).filter(Boolean);
        const merkleRoot = computeMerkleRoot(contentHashes);

        // Get integrity log entries for the exported nodes
        const nodeIds2 = nodes.map((n: any) => n.id);
        const logEntries = nodeIds2.length > 0 ? await getIntegrityLogForNodes(nodeIds2) : [];
        const logForExport = logEntries.map((e: any) => ({
            nodeId: e.node_id,
            operation: e.operation,
            contentHashBefore: e.content_hash_before,
            contentHashAfter: e.content_hash_after,
            parentHashes: e.parent_hashes,
            contributor: e.contributor,
            prevLogHash: e.prev_log_hash,
            logHash: e.log_hash,
            partitionId: e.partition_id,
            timestamp: e.timestamp,
        }));

        integrity = {
            merkleRoot,
            chainLength: logForExport.length,
            nodesWithHashes: contentHashes.length,
            nodesTotal: nodes.length,
            log: logForExport,
        };
    } catch (err: any) {
        console.error(`[integrity] Failed to compute export integrity: ${err.message}`);
    }

    // Export elite pool metadata for elite_verification nodes in this partition
    let eliteMetadata: any = null;
    if (nodeIds.length > 0) {
        try {
            const nodeIdPlaceholders3 = nodeIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
            const eliteNodes = await query(`
                SELECT node_id, source_verification_id, promoted_at, confidence, verification_type, provenance_chain
                FROM elite_nodes WHERE node_id IN (${nodeIdPlaceholders3})
            `, nodeIds);

            if (eliteNodes.length > 0) {
                const eliteIds = eliteNodes.map((e: any) => e.node_id);
                const eliteIdPlaceholders = eliteIds.map((_: string, i: number) => `$${i + 1}`).join(', ');

                const manifestMappings = await query(`
                    SELECT id, node_id, manifest_target_type, manifest_target_text, relevance_score, mapped_at
                    FROM elite_manifest_mappings WHERE node_id IN (${eliteIdPlaceholders})
                `, eliteIds);

                const verifiedVars = await query(`
                    SELECT id, var_id, elite_node_id, verification_confidence, verified_value, verified_at
                    FROM elite_verified_variables WHERE elite_node_id IN (${eliteIdPlaceholders})
                `, eliteIds);

                const bridgingLog = await query(`
                    SELECT id, parent_a_id, parent_b_id, synthesis_node_id, outcome, attempted_at
                    FROM elite_bridging_log
                    WHERE parent_a_id IN (${eliteIdPlaceholders}) OR parent_b_id IN (${eliteIdPlaceholders})
                `, [...eliteIds, ...eliteIds]);

                eliteMetadata = {
                    eliteNodes,
                    manifestMappings,
                    verifiedVariables: verifiedVars,
                    bridgingLog,
                };
            }
        } catch (err: any) {
            console.warn(`[export] Elite metadata export skipped: ${err.message}`);
        }
    }

    return {
        podbitExport: integrity ? '1.1' : '1.0',
        systemVersion: VERSION,
        exportedAt: new Date().toISOString(),
        owner,
        partition: { id: partition.id, name: partition.name, description: partition.description, domains },
        bridges: bridgeList,
        nodes,
        edges,
        nodeCount: nodes.length,
        edgeCount: edges.length,
        ...(integrity ? { integrity } : {}),
        ...(numberVariables ? { numberVariables } : {}),
        ...(eliteMetadata ? { eliteMetadata } : {}),
    };
}

// --- Import logic ---

/**
 * Imports a partition from an export envelope.
 *
 * Creates the partition under the ID `{owner}/{partition.id}`, inserts
 * domains, nodes (without embeddings), edges, bridges (only to partitions
 * that already exist locally), number variables, elite metadata, and
 * integrity log entries.  If `overwrite` is true and the target partition
 * already exists, the existing partition's nodes, edges, domains, and
 * bridges are deleted first.
 *
 * Integrity verification (Merkle root + chain) is performed when present
 * but is non-blocking — mismatches produce warnings, not errors.
 *
 * @param data      - The export envelope (must have `podbitExport`, `owner`, `partition`).
 * @param overwrite - If true, replace an existing partition with the same target ID.
 * @returns A summary object with counts of imported/skipped items and optional integrity results.
 * @throws Error with `VALIDATION:` or `CONFLICT:` prefix on bad input or collisions.
 */
export async function importPartition(data: any, overwrite: boolean = false) {
    // Validate format
    if (!data.podbitExport || !data.owner || !data.partition) {
        throw new Error('VALIDATION: Invalid export format. Required: podbitExport, owner, partition');
    }
    if (!data.partition.id || !data.partition.domains) {
        throw new Error('VALIDATION: partition must have id and domains');
    }

    const owner = data.owner;
    const targetPartitionId = `${owner}/${data.partition.id}`;
    const domains = data.partition.domains || [];
    const nodes = data.nodes || [];
    const edges = data.edges || [];
    const bridges = data.bridges || [];

    // Check for collision
    const existing = await queryOne(`
        SELECT id FROM domain_partitions WHERE id = $1
    `, [targetPartitionId]);

    if (existing) {
        if (!overwrite) {
            throw new Error(`CONFLICT: Partition "${targetPartitionId}" already exists. Use overwrite=true to replace.`);
        }
        // Overwrite: delete existing partition and its nodes
        const existingDomains = await query(`
            SELECT domain FROM partition_domains WHERE partition_id = $1
        `, [targetPartitionId]);
        for (const d of existingDomains) {
            // Cancel any active lab jobs for nodes in this domain
            try { const { cancelBulkLabJobs } = await import('../../evm/queue-worker.js'); await cancelBulkLabJobs(d.domain); } catch { /* non-fatal */ }
            // Clean up number variable refs/registry before deleting nodes
            try {
                await query(`DELETE FROM node_number_refs WHERE node_id IN (SELECT id FROM nodes WHERE domain = $1)`, [d.domain]);
                await query(`DELETE FROM number_registry WHERE source_node_id IN (SELECT id FROM nodes WHERE domain = $1)`, [d.domain]);
            } catch { /* table may not exist */ }
            await query(`DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE domain = $1) OR target_id IN (SELECT id FROM nodes WHERE domain = $1)`, [d.domain]);
            await query(`DELETE FROM nodes WHERE domain = $1`, [d.domain]);
        }
        await query(`DELETE FROM partition_bridges WHERE partition_a = $1 OR partition_b = $1`, [targetPartitionId]);
        await query(`DELETE FROM partition_domains WHERE partition_id = $1`, [targetPartitionId]);
        await query(`DELETE FROM domain_partitions WHERE id = $1`, [targetPartitionId]);
    }

    // Create partition
    await query(`
        INSERT INTO domain_partitions (id, name, description) VALUES ($1, $2, $3)
    `, [targetPartitionId, data.partition.name || targetPartitionId, data.partition.description || null]);

    // Add domains
    for (const domain of domains) {
        await query(`
            INSERT INTO partition_domains (partition_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING
        `, [targetPartitionId, domain]);
    }

    // Verify integrity if present (non-blocking — warn only)
    let integrityResult: any = null;
    if (data.integrity?.merkleRoot) {
        try {
            const { verifyPartitionIntegrity } = await import('../../core/integrity.js');
            integrityResult = verifyPartitionIntegrity(data);
            if (!integrityResult.merkleValid) {
                console.warn(`[import] Merkle root mismatch: computed ${integrityResult.merkleComputed?.slice(0, 16)}...`);
            }
            if (!integrityResult.chainValid) {
                console.warn(`[import] Integrity chain broken at entry ${integrityResult.chainBrokenAt}: ${integrityResult.chainReason}`);
            }
        } catch (err: any) {
            console.error(`[import] Integrity verification failed: ${err.message}`);
        }
    }

    // Insert nodes (without embeddings, preserving content_hash)
    let nodesImported = 0;
    let nodesSkipped = 0;
    for (const node of nodes) {
        try {
            await query(`
                INSERT INTO nodes (
                    id, content, node_type, trajectory, domain,
                    weight, salience, specificity, origin, contributor,
                    validation_synthesis, validation_novelty, validation_testability,
                    validation_tension_resolution, validation_composite,
                    validation_reason, validated_at, validated_by,
                    content_hash, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
            `, [
                node.id, node.content, node.node_type, node.trajectory || null, node.domain,
                node.weight ?? 1.0, node.salience ?? 1.0, node.specificity ?? null,
                node.origin || 'import', node.contributor || null,
                node.validation_synthesis ?? null, node.validation_novelty ?? null,
                node.validation_testability ?? null, node.validation_tension_resolution ?? null,
                node.validation_composite ?? null, node.validation_reason ?? null,
                node.validated_at ?? null, node.validated_by ?? null,
                node.content_hash || null,
                node.created_at || new Date().toISOString(), node.updated_at || new Date().toISOString(),
            ]);
            nodesImported++;
        } catch (err: any) {
            // UUID collision — skip
            console.warn(`[import] Skipped node ${node.id}: ${err.message}`);
            nodesSkipped++;
        }
    }

    // Import integrity log entries if present
    if (data.integrity?.log?.length > 0) {
        try {
            for (const entry of data.integrity.log) {
                await query(`
                    INSERT INTO integrity_log (
                        node_id, operation, content_hash_before, content_hash_after,
                        parent_hashes, contributor, prev_log_hash, log_hash, partition_id, timestamp
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                    ON CONFLICT DO NOTHING
                `, [
                    entry.nodeId || entry.node_id,
                    entry.operation,
                    entry.contentHashBefore ?? entry.content_hash_before ?? null,
                    entry.contentHashAfter || entry.content_hash_after,
                    entry.parentHashes ?? entry.parent_hashes ?? null,
                    entry.contributor || null,
                    entry.prevLogHash ?? entry.prev_log_hash ?? null,
                    entry.logHash || entry.log_hash,
                    entry.partitionId ?? entry.partition_id ?? targetPartitionId,
                    entry.timestamp,
                ]);
            }
        } catch (err: any) {
            console.warn(`[import] Integrity log import failed (non-fatal): ${err.message}`);
        }
    }

    // Insert edges
    let edgesImported = 0;
    let edgesSkipped = 0;
    for (const edge of edges) {
        try {
            await query(`
                INSERT INTO edges (source_id, target_id, edge_type, strength)
                VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
            `, [edge.source_id, edge.target_id, edge.edge_type, edge.strength ?? 1.0]);
            edgesImported++;
        } catch (err: any) {
            console.warn(`[import] Skipped edge: ${err.message}`);
            edgesSkipped++;
        }
    }

    // Create bridges (only to partitions that exist on this system)
    let bridgesCreated = 0;
    const skippedBridges: string[] = [];
    for (const bridge of bridges) {
        const targetId = `${owner}/${bridge.targetPartition}`;
        const exists = await queryOne(`SELECT id FROM domain_partitions WHERE id = $1`, [targetId]);
        if (exists) {
            const [a, b] = targetPartitionId < targetId ? [targetPartitionId, targetId] : [targetId, targetPartitionId];
            await query(`
                INSERT INTO partition_bridges (partition_a, partition_b) VALUES ($1, $2) ON CONFLICT DO NOTHING
            `, [a, b]);
            bridgesCreated++;
        } else {
            skippedBridges.push(targetId);
        }
    }

    // Import number variables (IDs are installation-scoped, globally unique — no remapping needed)
    let varsImported = 0;
    if (data.numberVariables?.registry?.length > 0) {
        try {
            for (const entry of data.numberVariables.registry) {
                try {
                    await query(`
                        INSERT INTO number_registry (var_id, value, scope_text, source_node_id, domain, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [entry.var_id, entry.value, entry.scope_text, entry.source_node_id, entry.domain, entry.created_at || new Date().toISOString()]);
                    varsImported++;
                } catch { /* skip on conflict — same var already exists */ }
            }
            for (const ref of (data.numberVariables.refs || [])) {
                try {
                    await query(`INSERT OR IGNORE INTO node_number_refs (node_id, var_id) VALUES ($1, $2)`, [ref.node_id, ref.var_id]);
                } catch { /* skip */ }
            }
        } catch (err: any) {
            console.warn(`[import] Number variable import failed (non-fatal): ${err.message}`);
        }
    }

    // Import elite metadata (elite_nodes, manifest_mappings, verified_variables, bridging_log)
    let eliteImported = 0;
    if (data.eliteMetadata?.eliteNodes?.length > 0) {
        try {
            for (const en of data.eliteMetadata.eliteNodes) {
                try {
                    await query(`
                        INSERT OR IGNORE INTO elite_nodes (node_id, source_verification_id, promoted_at, confidence, verification_type, provenance_chain)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [en.node_id, en.source_verification_id, en.promoted_at, en.confidence, en.verification_type, en.provenance_chain]);
                    eliteImported++;
                } catch { /* skip on conflict */ }
            }
            for (const mm of (data.eliteMetadata.manifestMappings || [])) {
                try {
                    await query(`
                        INSERT OR IGNORE INTO elite_manifest_mappings (id, node_id, manifest_target_type, manifest_target_text, relevance_score, mapped_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [mm.id, mm.node_id, mm.manifest_target_type, mm.manifest_target_text, mm.relevance_score, mm.mapped_at]);
                } catch { /* skip */ }
            }
            for (const vv of (data.eliteMetadata.verifiedVariables || [])) {
                try {
                    await query(`
                        INSERT OR IGNORE INTO elite_verified_variables (id, var_id, elite_node_id, verification_confidence, verified_value, verified_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [vv.id, vv.var_id, vv.elite_node_id, vv.verification_confidence, vv.verified_value, vv.verified_at]);
                } catch { /* skip */ }
            }
            for (const bl of (data.eliteMetadata.bridgingLog || [])) {
                try {
                    await query(`
                        INSERT OR IGNORE INTO elite_bridging_log (id, parent_a_id, parent_b_id, synthesis_node_id, outcome, attempted_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [bl.id, bl.parent_a_id, bl.parent_b_id, bl.synthesis_node_id, bl.outcome, bl.attempted_at]);
                } catch { /* skip */ }
            }
        } catch (err: any) {
            console.warn(`[import] Elite metadata import failed (non-fatal): ${err.message}`);
        }
    }

    // Invalidate knowledge cache for imported domains (marks stale + triggers background warming)
    for (const domain of domains) {
        await invalidateKnowledgeCache(domain);
    }

    return {
        success: true,
        imported: {
            partitionId: targetPartitionId,
            nodes: nodesImported,
            edges: edgesImported,
            bridges: bridgesCreated,
            domains: domains.length,
            numberVariables: varsImported,
            eliteNodes: eliteImported,
        },
        skipped: {
            nodes: nodesSkipped,
            edges: edgesSkipped,
            bridges: skippedBridges,
        },
        ...(integrityResult ? {
            integrity: {
                merkleValid: integrityResult.merkleValid,
                chainValid: integrityResult.chainValid,
                chainLength: integrityResult.chainVerified,
                nodesWithHashes: integrityResult.nodesWithHashes,
                nodesTotal: integrityResult.nodesTotal,
            },
        } : {}),
    };
}
