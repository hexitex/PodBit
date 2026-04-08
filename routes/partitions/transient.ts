/**
 * @module routes/partitions/transient
 *
 * Transient ("visiting") partition lifecycle — import, quarantine scan,
 * approval, synthesis participation, and departure with stub creation.
 *
 * A transient partition arrives as an export envelope, is imported in
 * quarantine state (weight/salience reset, no bridges), scanned for
 * injection patterns, optionally approved (bridges created, state -> active),
 * participates in synthesis cycles, and eventually departs (nodes removed,
 * stubs created for lineage preservation, export data returned).
 */

import { Router } from 'express';
import crypto from 'crypto';
import { asyncHandler } from '../../utils/async-handler.js';
import { query, queryOne } from '../../db.js';
import { config as appConfig } from '../../config.js';
import { invalidateKnowledgeCache } from '../../handlers/knowledge.js';
import { logDecision, clearTransientCache } from '../../core/governance.js';
import { exportPartition } from './exchange.js';

/**
 * Registers transient partition HTTP routes on the given router.
 *
 * Routes:
 * - `POST /partitions/transient/import` — import a transient partition from export JSON
 * - `POST /partitions/:id/approve`      — approve a quarantined transient partition
 * - `POST /partitions/:id/depart`       — trigger departure (export + cleanup + stubs)
 * - `GET  /partitions/:id/visits`       — visit history for a partition
 *
 * @param router - The Express router to mount routes on.
 */
export function registerTransientRoutes(router: Router) {
    // Import a transient partition from export JSON
    router.post('/partitions/transient/import', async (req, res, next) => {
        try {
            const result = await importTransient(req.body);
            res.json(result);
        } catch (err: any) {
            if (err.message?.startsWith('VALIDATION:') || err.message?.startsWith('LIMIT:')) {
                return res.status(400).json({ error: err.message });
            }
            next(err);
        }
    });

    // Approve a quarantined transient partition
    router.post('/partitions/:id/approve', asyncHandler(async (req, res) => {
        const { bridgeTo } = req.body || {};
        const result = await approveTransient(req.params.id, bridgeTo);
        if (result.error) {
            return res.status(400).json(result);
        }
        res.json(result);
    }));

    // Depart a transient partition (export + cleanup)
    router.post('/partitions/:id/depart', asyncHandler(async (req, res) => {
        const { reason } = req.body || {};
        const result = await departTransient(req.params.id, reason);
        if (result.error) {
            return res.status(400).json(result);
        }
        res.json(result);
    }));

    // Visit history for a partition
    router.get('/partitions/:id/visits', asyncHandler(async (req, res) => {
        const visits = await query(`
            SELECT * FROM partition_visits WHERE partition_id = $1 ORDER BY arrived_at DESC
        `, [req.params.id]);
        res.json(visits);
    }));
}

/**
 * Imports a partition as a transient (quarantined visitor).
 *
 * Nodes are inserted with weight reset to 1.0 and salience to 0.5.
 * No bridges are created — the partition stays isolated until approved.
 * The function enforces config limits on max transient partitions, max
 * nodes per import, and transient-to-host node ratio.
 *
 * @param data - Export envelope (must have `podbitExport`, `owner`, `partition`).
 * @returns A summary with `partitionId`, `state: 'quarantine'`, and import counts.
 * @throws Error with `VALIDATION:` or `LIMIT:` prefix on bad input or limit violations.
 */
export async function importTransient(data: any) {
    const cfg = appConfig.transient;
    if (!cfg?.enabled) {
        throw new Error('VALIDATION: Transient partitions are not enabled. Set transient.enabled=true in config.');
    }

    // Validate format
    if (!data.podbitExport || !data.owner || !data.partition) {
        throw new Error('VALIDATION: Invalid export format. Required: podbitExport, owner, partition');
    }
    if (!data.partition.id || !data.partition.domains) {
        throw new Error('VALIDATION: partition must have id and domains');
    }

    const nodes = data.nodes || [];
    const edges = data.edges || [];
    const owner = data.owner;
    const targetPartitionId = `transient/${owner}/${data.partition.id}`;
    const domains = data.partition.domains || [];

    // Limit checks
    const existingTransient = await query(`
        SELECT id FROM domain_partitions WHERE transient = 1 AND state != 'departed'
    `);
    if (existingTransient.length >= cfg.maxTransientPartitions) {
        throw new Error(`LIMIT: Maximum transient partitions reached (${cfg.maxTransientPartitions}). Depart an existing transient partition first.`);
    }

    if (nodes.length > cfg.maxNodesPerImport) {
        throw new Error(`LIMIT: Import contains ${nodes.length} nodes, max allowed is ${cfg.maxNodesPerImport}.`);
    }

    // Check node ratio against host
    const hostCount = await queryOne(`
        SELECT COUNT(*) as cnt FROM nodes WHERE archived = FALSE
    `);
    const totalAfter = (hostCount?.cnt || 0) + nodes.length;
    if (totalAfter > 0 && nodes.length / totalAfter > cfg.maxTransientNodeRatio) {
        throw new Error(`LIMIT: Import would exceed max transient node ratio (${(cfg.maxTransientNodeRatio * 100).toFixed(0)}% of total graph).`);
    }

    // Check for collision
    const existing = await queryOne(`SELECT id FROM domain_partitions WHERE id = $1`, [targetPartitionId]);
    if (existing) {
        throw new Error(`VALIDATION: Transient partition "${targetPartitionId}" already exists.`);
    }

    // Get current project name
    const projectSetting = await queryOne(`SELECT value FROM settings WHERE key = 'project.name'`);
    const projectName = projectSetting?.value || 'unknown';

    // Create partition with transient metadata
    await query(`
        INSERT INTO domain_partitions (id, name, description, transient, source_project, source_owner, imported_at, state, visit_config, cycles_completed, barren_cycles)
        VALUES ($1, $2, $3, 1, $4, $5, $6, 'quarantine', $7, 0, 0)
    `, [
        targetPartitionId,
        data.partition.name || targetPartitionId,
        data.partition.description || null,
        `${owner}/${data.partition.id}`,
        owner,
        new Date().toISOString(),
        JSON.stringify({ minCycles: cfg.minCycles, maxCycles: cfg.maxCycles, exhaustionThreshold: cfg.exhaustionThreshold }),
    ]);

    // Add domains
    for (const domain of domains) {
        await query(`
            INSERT INTO partition_domains (partition_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING
        `, [targetPartitionId, domain]);
    }

    // Insert nodes with weight/salience reset (preserving content_hash for integrity)
    let nodesImported = 0;
    let nodesSkipped = 0;
    for (const node of nodes) {
        try {
            await query(`
                INSERT INTO nodes (
                    id, content, node_type, trajectory, domain,
                    weight, salience, specificity, origin, contributor,
                    content_hash, created_at, updated_at
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
            `, [
                node.id, node.content, node.node_type, node.trajectory || null, node.domain,
                1.0, 0.5, node.specificity ?? null,
                'transient-import', node.contributor || null,
                node.content_hash || null,
                node.created_at || new Date().toISOString(), new Date().toISOString(),
            ]);
            nodesImported++;
        } catch (err: any) {
            console.warn(`[transient-import] Skipped node ${node.id}: ${err.message}`);
            nodesSkipped++;
        }
    }

    // Insert edges
    let edgesImported = 0;
    for (const edge of edges) {
        try {
            await query(`
                INSERT INTO edges (source_id, target_id, edge_type, strength)
                VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING
            `, [edge.source_id, edge.target_id, edge.edge_type, edge.strength ?? 1.0]);
            edgesImported++;
        } catch { /* skip */ }
    }

    // Import number variables (IDs are installation-scoped, globally unique — no remapping needed)
    let _varsImported = 0;
    if (data.numberVariables?.registry?.length > 0) {
        try {
            for (const entry of data.numberVariables.registry) {
                try {
                    await query(`
                        INSERT INTO number_registry (var_id, value, scope_text, source_node_id, domain, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [entry.var_id, entry.value, entry.scope_text, entry.source_node_id, entry.domain, entry.created_at || new Date().toISOString()]);
                    _varsImported++;
                } catch { /* skip on conflict — same var already exists */ }
            }
            for (const ref of (data.numberVariables.refs || [])) {
                try {
                    await query(`INSERT OR IGNORE INTO node_number_refs (node_id, var_id) VALUES ($1, $2)`, [ref.node_id, ref.var_id]);
                } catch { /* skip */ }
            }
        } catch (err: any) {
            console.warn(`[transient-import] Number variable import failed (non-fatal): ${err.message}`);
        }
    }

    // Create visit record
    await query(`
        INSERT INTO partition_visits (partition_id, project_name, arrived_at)
        VALUES ($1, $2, $3)
    `, [targetPartitionId, projectName, new Date().toISOString()]);

    // Log decision
    await logDecision('partition', targetPartitionId, 'transient_import', null, 'quarantine', 'system', 'transient-import',
        `Imported ${nodesImported} nodes from ${owner}/${data.partition.id} as transient (quarantined)`);

    clearTransientCache();

    return {
        success: true,
        partitionId: targetPartitionId,
        state: 'quarantine',
        imported: { nodes: nodesImported, edges: edgesImported, domains: domains.length },
        skipped: { nodes: nodesSkipped },
    };
}

/**
 * Approves a quarantined transient partition after running an injection scan.
 *
 * All nodes in the partition's domains are scanned with `detectInjection()`.
 * If the failure rate exceeds `quarantine.scanFailThreshold`, the partition
 * is rejected and cleaned up.  Otherwise, the state moves to `'active'` and
 * bridges are created — either to the explicit `bridgeTo` list, or to all
 * non-system, non-transient partitions.
 *
 * @param partitionId - ID of the transient partition to approve.
 * @param bridgeTo    - Optional list of partition IDs to bridge to (defaults to all host partitions).
 * @returns A result object with `success`, scan summary, and bridge count; or `error` on failure.
 */
export async function approveTransient(partitionId: string, bridgeTo?: string[]) {
    const partition = await queryOne(`
        SELECT id, state, transient FROM domain_partitions WHERE id = $1
    `, [partitionId]);

    if (!partition) return { error: `Partition not found: ${partitionId}` };
    if (!partition.transient) return { error: 'Not a transient partition' };
    if (partition.state !== 'quarantine') return { error: `Partition state is "${partition.state}", expected "quarantine"` };

    const cfg = appConfig.transient;

    // Content scan: check for injection patterns
    const { detectInjection } = await import('../../core/scoring.js');
    const domains = await query(`SELECT domain FROM partition_domains WHERE partition_id = $1`, [partitionId]);
    const domainList = domains.map((d: any) => d.domain);

    let totalNodes = 0;
    let failedNodes = 0;
    const failReasons: string[] = [];

    if (domainList.length > 0) {
        const placeholders = domainList.map((_: string, i: number) => `$${i + 1}`).join(', ');
        const nodeRows = await query(`
            SELECT id, content FROM nodes
            WHERE domain IN (${placeholders}) AND archived = FALSE
        `, domainList);

        for (const node of nodeRows as any[]) {
            totalNodes++;
            const result = detectInjection(node.content);
            if (result.isInjection) {
                failedNodes++;
                failReasons.push(`${node.id.slice(0, 8)}: ${result.reasons[0]}`);
            }
        }
    }

    // Check fail rate
    const failRate = totalNodes > 0 ? failedNodes / totalNodes : 0;
    if (failRate > cfg.quarantine.scanFailThreshold) {
        // Reject: delete partition + nodes
        await cleanupTransientPartition(partitionId, domainList);
        clearTransientCache();

        return {
            error: `Quarantine scan failed: ${failedNodes}/${totalNodes} nodes flagged (${(failRate * 100).toFixed(1)}% > ${(cfg.quarantine.scanFailThreshold * 100).toFixed(0)}% threshold)`,
            rejected: true,
            failedNodes,
            totalNodes,
            reasons: failReasons.slice(0, 10),
        };
    }

    // Approve: set state to active
    await query(`UPDATE domain_partitions SET state = 'active' WHERE id = $1`, [partitionId]);

    // Create bridges to host partitions
    let bridgesCreated = 0;
    const targetPartitions = bridgeTo
        ? bridgeTo
        : (await query(`SELECT id FROM domain_partitions WHERE id != $1 AND (system = 0 OR system IS NULL) AND (transient = 0 OR transient IS NULL)`, [partitionId]))
            .map((p: any) => p.id);

    for (const targetId of targetPartitions) {
        const [a, b] = partitionId < targetId ? [partitionId, targetId] : [targetId, partitionId];
        await query(`INSERT INTO partition_bridges (partition_a, partition_b) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [a, b]);
        bridgesCreated++;
    }

    await logDecision('partition', partitionId, 'transient_approve', 'quarantine', 'active', 'system', 'transient-approve',
        `Approved transient partition. Scan: ${failedNodes}/${totalNodes} flagged. Bridged to ${bridgesCreated} partitions.`);

    clearTransientCache();

    // Invalidate knowledge cache for new domains
    for (const domain of domainList) {
        await invalidateKnowledgeCache(domain);
    }

    return {
        success: true,
        state: 'active',
        scan: { totalNodes, failedNodes, failRate: failRate.toFixed(3) },
        bridgesCreated,
    };
}

/**
 * Departs a transient partition: exports its data, creates node stubs for
 * lineage preservation, records visit statistics, and cleans up nodes/edges/
 * bridges/domains.  The partition record is kept with `state: 'departed'`
 * for provenance.
 *
 * @param partitionId - ID of the transient partition to depart.
 * @param reason      - Optional departure reason (defaults to `'manual'`).
 * @returns A result with `exportData` (the full export envelope), stub count,
 *          and visit stats; or `error` on failure.
 */
export async function departTransient(partitionId: string, reason?: string) {
    const partition = await queryOne(`
        SELECT id, state, transient, source_owner FROM domain_partitions WHERE id = $1
    `, [partitionId]);

    if (!partition) return { error: `Partition not found: ${partitionId}` };
    if (!partition.transient) return { error: 'Not a transient partition' };
    if (partition.state === 'departed') return { error: 'Partition has already departed' };

    // Set state to departing
    await query(`UPDATE domain_partitions SET state = 'departing' WHERE id = $1`, [partitionId]);

    // Export partition data (v0.5 format)
    const rawExport = await exportPartition(partitionId, partition.source_owner || 'unknown');
    const exportData = rawExport ? { ...rawExport, podbitExport: '2.0', transient: true } : null;

    // Get domains
    const domains = await query(`SELECT domain FROM partition_domains WHERE partition_id = $1`, [partitionId]);
    const domainList = domains.map((d: any) => d.domain);

    // Create departure stubs for nodes
    let stubsCreated = 0;
    if (domainList.length > 0) {
        const placeholders = domainList.map((_: string, i: number) => `$${i + 1}`).join(', ');
        const nodeRows = await query(`
            SELECT id, content, domain, weight FROM nodes
            WHERE domain IN (${placeholders}) AND archived = FALSE
        `, domainList);

        for (const node of nodeRows as any[]) {
            const contentHash = crypto.createHash('sha256').update(node.content).digest('hex');
            const summary = node.content.slice(0, 200);

            // Find children in host domains (non-transient)
            const innerPlaceholders = domainList.map((_: string, i: number) => `$${i + 2}`).join(', ');
            const children = await query(`
                SELECT n.id FROM edges e
                JOIN nodes n ON n.id = e.target_id
                WHERE e.source_id = $1 AND e.edge_type = 'parent'
                  AND n.domain NOT IN (${innerPlaceholders})
                  AND n.archived = FALSE
            `, [node.id, ...domainList]);
            const survivingChildren = children.map((c: any) => c.id);

            // Find parents for lineage preservation
            const parents = await query(`
                SELECT e.source_id FROM edges e
                WHERE e.target_id = $1 AND e.edge_type = 'parent'
            `, [node.id]);
            const parentIds = parents.map((p: any) => p.source_id);

            try {
                await query(`
                    INSERT INTO node_stubs (node_id, domain, partition_id, content_hash, summary, weight_at_stub, stubbed_at, surviving_children, parent_ids, cause, source_project)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    ON CONFLICT (node_id) DO NOTHING
                `, [node.id, node.domain, partitionId, contentHash, summary, node.weight, new Date().toISOString(),
                    survivingChildren.length > 0 ? JSON.stringify(survivingChildren) : null,
                    parentIds.length > 0 ? JSON.stringify(parentIds) : null,
                    'departed',
                    partition.source_owner || null]);
                stubsCreated++;
            } catch { /* skip on conflict */ }
        }
    }

    // Update visit record
    const cyclesCompleted = (await queryOne(`SELECT cycles_completed FROM domain_partitions WHERE id = $1`, [partitionId]))?.cycles_completed || 0;

    // Count children created in host domains during visit
    const childrenStats = domainList.length > 0 ? await queryOne(`
        SELECT COUNT(*) as cnt, AVG(n2.weight) as avg_weight
        FROM edges e
        JOIN nodes n1 ON n1.id = e.source_id
        JOIN nodes n2 ON n2.id = e.target_id
        WHERE n1.domain IN (${domainList.map((_: string, i: number) => `$${i + 1}`).join(', ')})
          AND n2.domain NOT IN (${domainList.map((_: string, i: number) => `$${i + domainList.length + 1}`).join(', ')})
          AND e.edge_type = 'parent'
          AND n2.archived = FALSE
    `, [...domainList, ...domainList]) : null;

    await query(`
        UPDATE partition_visits
        SET departed_at = $1, cycles_run = $2, children_created = $3, children_avg_weight = $4, departure_reason = $5
        WHERE partition_id = $6 AND departed_at IS NULL
    `, [
        new Date().toISOString(),
        cyclesCompleted,
        childrenStats?.cnt || 0,
        childrenStats?.avg_weight || 0,
        reason || 'manual',
        partitionId,
    ]);

    // Clean up: delete nodes, edges, bridges, domains
    await cleanupTransientPartition(partitionId, domainList);

    // Set final state
    await query(`UPDATE domain_partitions SET state = 'departed' WHERE id = $1`, [partitionId]);

    await logDecision('partition', partitionId, 'transient_depart', 'active', 'departed', 'system', 'transient-depart',
        `Departed: ${stubsCreated} stubs created, reason: ${reason || 'manual'}`);

    clearTransientCache();

    return {
        success: true,
        state: 'departed',
        stubs: stubsCreated,
        exportData,
        visit: {
            cyclesRun: cyclesCompleted,
            childrenCreated: childrenStats?.cnt || 0,
            childrenAvgWeight: childrenStats?.avg_weight || 0,
        },
    };
}

/**
 * Returns the visit history for a partition (arrival/departure records).
 *
 * @param partitionId - The partition ID to look up.
 * @returns An object with `partitionId` and an array of visit records ordered by arrival date (newest first).
 */
export async function getVisitHistory(partitionId: string) {
    const visits = await query(`
        SELECT * FROM partition_visits WHERE partition_id = $1 ORDER BY arrived_at DESC
    `, [partitionId]);
    return { partitionId, visits };
}

/**
 * Deletes all data owned by a transient partition: number variable refs/registry
 * entries, edges, nodes, bridges, and domain assignments.  The partition record
 * itself is intentionally preserved for provenance tracking.
 *
 * Also invalidates the knowledge cache for each affected domain.
 *
 * @param partitionId - The transient partition ID being cleaned up.
 * @param domainList  - List of domains belonging to the partition.
 */
async function cleanupTransientPartition(partitionId: string, domainList: string[]) {
    // Delete number variable refs and registry entries for nodes being removed
    if (domainList.length > 0) {
        const placeholders = domainList.map((_: string, i: number) => `$${i + 1}`).join(', ');
        try {
            // Delete refs first (FK-like dependency)
            await query(`
                DELETE FROM node_number_refs WHERE node_id IN (SELECT id FROM nodes WHERE domain IN (${placeholders}))
            `, domainList);
            // Delete orphaned registry entries (source node being deleted)
            await query(`
                DELETE FROM number_registry WHERE source_node_id IN (SELECT id FROM nodes WHERE domain IN (${placeholders}))
            `, domainList);
        } catch { /* table may not exist on older DBs */ }
    }

    // Delete edges involving transient nodes
    if (domainList.length > 0) {
        const placeholders = domainList.map((_: string, i: number) => `$${i + 1}`).join(', ');
        await query(`
            DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE domain IN (${placeholders}))
               OR target_id IN (SELECT id FROM nodes WHERE domain IN (${placeholders}))
        `, [...domainList, ...domainList]);

        // Delete nodes
        await query(`DELETE FROM nodes WHERE domain IN (${placeholders})`, domainList);
    }

    // Delete bridges
    await query(`DELETE FROM partition_bridges WHERE partition_a = $1 OR partition_b = $1`, [partitionId]);

    // Delete domain assignments
    await query(`DELETE FROM partition_domains WHERE partition_id = $1`, [partitionId]);

    // Invalidate knowledge cache
    for (const domain of domainList) {
        await invalidateKnowledgeCache(domain);
    }
}
