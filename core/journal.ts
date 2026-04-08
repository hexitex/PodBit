/**
 * Graph journaling — rollback engine, pin mechanism, and timeline markers.
 *
 * The journal captures every mutation on Tier 1 tables via SQLite triggers.
 * This module provides:
 * - Timeline marker creation for high-impact events
 * - Node pinning (export ancestry chain for preservation during rollback)
 * - Rollback to any timestamp (replay journal backwards, reimport pinned nodes)
 * - Journal querying and pruning
 *
 * IMPORTANT: All SQL must use $1/$2/$N style params — the query layer's
 * translate() function only processes $N patterns, not raw ?.
 *
 * @module core/journal
 */

import { query, queryOne, transactionSync } from '../db/sqlite-backend.js';
import type { TransactionClient } from '../db/sqlite-backend.js';

// =============================================================================
// TYPES
// =============================================================================

export interface TimelineMarker {
    id: number;
    event_type: string;
    label: string;
    detail: any;
    timestamp: string;
    contributor: string | null;
}

export interface JournalEntry {
    id: number;
    table_name: string;
    row_id: string;
    operation: 'INSERT' | 'UPDATE' | 'DELETE';
    before_state: string | null;
    timestamp: string;
    marker_id: number | null;
}

export interface PinnedPackage {
    pinGroup: string;
    nodes: any[];
    edges: any[];
    partitions: any[];
    partitionDomains: any[];
    /** Dynamic: every table with a node_id column → rows for pinned nodes */
    associatedData: Record<string, any[]>;
}

export interface RollbackPreview {
    targetTimestamp: string;
    entriesAffected: number;
    byTable: Record<string, { inserts: number; updates: number; deletes: number }>;
    nodesCreated: number;
    nodesModified: number;
    nodesDeleted: number;
    pinnableNodes: any[];
}

export interface RollbackResult {
    success: boolean;
    targetTimestamp: string;
    entriesReplayed: number;
    rowsCleaned: number;
    cleanedTables: Record<string, number>;
    pinnedNodesRestored: number;
    markerId: number;
}

/** Node types that can be pinned (seeds are captured as ancestry) */
const PINNABLE_TYPES = new Set(['voiced', 'synthesis', 'possible', 'elite_verification', 'breakthrough']);

/** Build $1,$2,...$N placeholder string for N params starting at offset */
function placeholders(count: number, offset = 1): string {
    return Array.from({ length: count }, (_, i) => `$${offset + i}`).join(', ');
}

// =============================================================================
// TIMELINE MARKERS
// =============================================================================

/**
 * Create a timeline marker for a high-impact event.
 */
export async function createTimelineMarker(
    eventType: string,
    label: string,
    detail?: Record<string, any>,
    contributor?: string
): Promise<number> {
    await query(
        `INSERT INTO timeline_markers (event_type, label, detail, contributor)
         VALUES ($1, $2, $3, $4)`,
        [eventType, label, detail ? JSON.stringify(detail) : null, contributor || null]
    );
    const row = await queryOne('SELECT last_insert_rowid() as id');
    return row?.id || 0;
}

/**
 * List timeline markers with optional filtering.
 */
export async function getTimeline(options: {
    limit?: number;
    offset?: number;
    since?: string;
    until?: string;
    eventType?: string;
} = {}): Promise<{ markers: TimelineMarker[]; total: number }> {
    const { limit = 50, offset = 0, since, until, eventType } = options;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (since) {
        conditions.push(`timestamp >= $${idx++}`);
        params.push(since);
    }
    if (until) {
        conditions.push(`timestamp <= $${idx++}`);
        params.push(until);
    }
    if (eventType) {
        conditions.push(`event_type = $${idx++}`);
        params.push(eventType);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await queryOne(`SELECT COUNT(*) as total FROM timeline_markers ${where}`, params);
    const total = countRow?.total || 0;

    const markers = await query(
        `SELECT * FROM timeline_markers ${where} ORDER BY timestamp DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
    );

    return {
        markers: markers.map((m: any) => ({
            ...m,
            detail: m.detail ? JSON.parse(m.detail) : null,
        })),
        total,
    };
}

// =============================================================================
// PINNING
// =============================================================================

/**
 * Pin nodes for preservation during rollback.
 * Only voiced, synthesis, possible, elite_verification, and breakthrough nodes can be pinned.
 * Seeds are automatically captured as ancestors.
 */
export async function pinNodes(nodeIds: string[], pinGroup: string): Promise<{ pinned: number; skipped: string[] }> {
    const skipped: string[] = [];
    let pinned = 0;

    for (const nodeId of nodeIds) {
        const node = await queryOne('SELECT id, node_type FROM nodes WHERE id = $1', [nodeId]);
        if (!node) {
            skipped.push(nodeId);
            continue;
        }
        if (!PINNABLE_TYPES.has(node.node_type)) {
            skipped.push(nodeId);
            continue;
        }
        try {
            await query(
                'INSERT OR IGNORE INTO journal_pins (node_id, pin_group) VALUES ($1, $2)',
                [nodeId, pinGroup]
            );
            pinned++;
        } catch {
            skipped.push(nodeId);
        }
    }

    return { pinned, skipped };
}

/**
 * List pins in a group.
 */
export async function listPins(pinGroup: string): Promise<any[]> {
    return query(
        `SELECT jp.node_id, jp.created_at, n.content, n.node_type, n.domain
         FROM journal_pins jp
         LEFT JOIN nodes n ON n.id = jp.node_id
         WHERE jp.pin_group = $1
         ORDER BY jp.created_at`,
        [pinGroup]
    );
}

/**
 * Remove pins (by group or specific node IDs).
 */
export async function removePins(pinGroup: string, nodeIds?: string[]): Promise<number> {
    if (nodeIds && nodeIds.length > 0) {
        const ph = placeholders(nodeIds.length, 2);
        await query(
            `DELETE FROM journal_pins WHERE pin_group = $1 AND node_id IN (${ph})`,
            [pinGroup, ...nodeIds]
        );
        return nodeIds.length;
    }
    await query('DELETE FROM journal_pins WHERE pin_group = $1', [pinGroup]);
    return 0;
}

/**
 * Export pinned nodes + their full parent ancestry chain.
 */
export async function exportPinnedPackage(pinGroup: string): Promise<PinnedPackage> {
    const pins = await query('SELECT node_id FROM journal_pins WHERE pin_group = $1', [pinGroup]);
    const pinnedIds = new Set<string>(pins.map((p: any) => p.node_id));

    if (pinnedIds.size === 0) {
        return { pinGroup, nodes: [], edges: [], partitions: [], partitionDomains: [], associatedData: {} };
    }

    // Walk parent ancestry upward (BFS)
    const allNodeIds = new Set<string>(pinnedIds);
    const queue = [...pinnedIds];

    while (queue.length > 0) {
        const batch = queue.splice(0, 50);
        const ph = placeholders(batch.length);
        const parentEdges = await query(
            `SELECT source_id FROM edges WHERE target_id IN (${ph}) AND edge_type = 'parent'`,
            batch
        );
        for (const edge of parentEdges) {
            if (!allNodeIds.has(edge.source_id)) {
                allNodeIds.add(edge.source_id);
                queue.push(edge.source_id);
            }
        }
    }

    const nodeIdList = [...allNodeIds];
    const nodes: any[] = [];

    for (let i = 0; i < nodeIdList.length; i += 50) {
        const batch = nodeIdList.slice(i, i + 50);
        const ph = placeholders(batch.length);
        const rows = await query(
            `SELECT id, content, node_type, trajectory, domain,
                    weight, salience, specificity, origin, contributor,
                    validation_synthesis, validation_novelty, validation_testability,
                    validation_tension_resolution, validation_composite,
                    validation_reason, validated_at, validated_by,
                    feedback_rating, feedback_source, feedback_at, feedback_note,
                    verification_status, verification_score, verification_results,
                    excluded, metadata, created_at, updated_at, last_resonated,
                    archived, junk, lifecycle_state, born_at, activated_at,
                    declining_since, composted_at, barren_cycles, total_children,
                    generation, elite_considered, avatar_url, content_hash,
                    voice_mode, breedable, synthesizable, model_id, model_name,
                    cull_evaluated_at, lab_status, lab_experiment_id, lab_frozen_at,
                    lab_taint_source_id, lab_tainted_at
             FROM nodes WHERE id IN (${ph})`,
            batch
        );
        nodes.push(...rows);
    }

    const edges: any[] = [];
    for (let i = 0; i < nodeIdList.length; i += 50) {
        const batch = nodeIdList.slice(i, i + 50);
        const n = batch.length;
        const ph1 = placeholders(n);
        const ph2 = placeholders(n, n + 1);
        const rows = await query(
            `SELECT source_id, target_id, edge_type, strength, created_at
             FROM edges
             WHERE source_id IN (${ph1}) AND target_id IN (${ph2})`,
            [...batch, ...batch]
        );
        edges.push(...rows);
    }

    // Partitions
    const domains = [...new Set(nodes.map((n: any) => n.domain).filter(Boolean))];
    let partitions: any[] = [];
    let partitionDomains: any[] = [];
    if (domains.length > 0) {
        const dph = placeholders(domains.length);
        partitionDomains = await query(
            `SELECT * FROM partition_domains WHERE domain IN (${dph})`,
            domains
        );
        const partitionIds = [...new Set(partitionDomains.map((pd: any) => pd.partition_id))];
        if (partitionIds.length > 0) {
            const pph = placeholders(partitionIds.length);
            partitions = await query(
                `SELECT * FROM domain_partitions WHERE id IN (${pph})`,
                partitionIds
            );
        }
    }

    // ── DYNAMIC ASSOCIATED DATA ──────────────────────────────────────
    // Discover every table with a node_id column and export matching rows.
    // Also handles entity_id (decisions), experiment_id (lab_evidence via
    // lab_executions), and var_id (number_registry via node_number_refs).
    // This way new tables automatically get included — no hardcoded list.
    const SKIP_EXPORT = new Set([
        'nodes', 'edges',  // handled explicitly above
        'domain_partitions', 'partition_domains', 'partition_bridges',
        'graph_journal', 'timeline_markers', 'journal_pins', 'settings',
    ]);

    const associatedData: Record<string, any[]> = {};

    const allTables = await query(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    );

    for (const { name: table } of allTables) {
        if (SKIP_EXPORT.has(table)) continue;

        const cols = await query(`PRAGMA table_info('${table}')`) as { name: string }[];
        const colNames = cols.map(c => c.name);

        // Determine which column references node IDs
        let refCol: string | null = null;
        if (colNames.includes('node_id')) refCol = 'node_id';
        else if (colNames.includes('source_node_id')) refCol = 'source_node_id';
        else if (colNames.includes('elite_node_id')) refCol = 'elite_node_id';
        else if (table === 'decisions' && colNames.includes('entity_id')) refCol = 'entity_id';
        if (!refCol) continue;

        const rows: any[] = [];
        for (let i = 0; i < nodeIdList.length; i += 50) {
            const batch = nodeIdList.slice(i, i + 50);
            const ph = placeholders(batch.length);
            const entityFilter = table === 'decisions' ? ` AND entity_type = 'node'` : '';
            const r = await query(
                `SELECT * FROM ${table} WHERE ${refCol} IN (${ph})${entityFilter}`,
                batch
            );
            rows.push(...r);
        }

        if (rows.length > 0) {
            associatedData[table] = rows;

            // Follow experiment_id links (lab_evidence references experiments, not nodes directly)
            if (table === 'lab_executions' && !associatedData['lab_evidence']) {
                const execIds = rows.map((r: any) => r.id).filter(Boolean);
                const evidence: any[] = [];
                for (let i = 0; i < execIds.length; i += 50) {
                    const batch = execIds.slice(i, i + 50);
                    const ph = placeholders(batch.length);
                    evidence.push(...await query(
                        `SELECT * FROM lab_evidence WHERE experiment_id IN (${ph})`,
                        batch
                    ));
                }
                if (evidence.length > 0) {
                    associatedData['lab_evidence'] = [
                        ...(associatedData['lab_evidence'] || []),
                        ...evidence.filter((e: any) =>
                            !(associatedData['lab_evidence'] || []).some((x: any) => x.id === e.id)
                        ),
                    ];
                }
            }
        }
    }

    return { pinGroup, nodes, edges, partitions, partitionDomains, associatedData };
}

// =============================================================================
// ROLLBACK
// =============================================================================

/**
 * Preview what a rollback would affect without executing it.
 * Returns unique node counts (not raw journal entries) and pinnable nodes.
 */
export async function previewRollback(targetTimestamp: string): Promise<RollbackPreview> {
    // Count unique rows affected per table+operation
    const summary = await query(
        `SELECT table_name, operation, COUNT(DISTINCT row_id) as unique_rows, COUNT(*) as entries
         FROM graph_journal WHERE timestamp > $1
         GROUP BY table_name, operation ORDER BY table_name, operation`,
        [targetTimestamp]
    );

    const byTable: Record<string, { inserts: number; updates: number; deletes: number }> = {};
    let totalEntries = 0;
    let nodesCreated = 0;
    let nodesModified = 0;
    let nodesDeleted = 0;

    for (const row of summary) {
        if (!byTable[row.table_name]) {
            byTable[row.table_name] = { inserts: 0, updates: 0, deletes: 0 };
        }
        const key = row.operation === 'INSERT' ? 'inserts'
            : row.operation === 'UPDATE' ? 'updates' : 'deletes';
        byTable[row.table_name][key] = row.unique_rows;
        totalEntries += row.entries;

        if (row.table_name === 'nodes') {
            if (row.operation === 'INSERT') nodesCreated = row.unique_rows;
            else if (row.operation === 'UPDATE') nodesModified = row.unique_rows;
            else if (row.operation === 'DELETE') nodesDeleted = row.unique_rows;
        }
    }

    // Nodes created after the restore point that were also updated get double-counted:
    // they appear in both nodesCreated (will be removed) and nodesModified (will be restored).
    // Only pre-existing nodes that were modified should count as "restored to earlier state".
    if (nodesCreated > 0 && nodesModified > 0) {
        const overlapResult = await query(
            `SELECT COUNT(*) as cnt FROM (
                SELECT DISTINCT row_id FROM graph_journal
                WHERE table_name = 'nodes' AND operation = 'INSERT' AND timestamp > $1
                INTERSECT
                SELECT DISTINCT row_id FROM graph_journal
                WHERE table_name = 'nodes' AND operation = 'UPDATE' AND timestamp > $1
            )`,
            [targetTimestamp]
        );
        const overlap = (overlapResult[0] as any)?.cnt ?? 0;
        nodesModified -= overlap;
    }

    // Find pinnable nodes created after the restore point
    // Query nodes directly by created_at — doesn't depend on journal INSERT entries
    // (nodes created before journaling was enabled won't have INSERT entries)
    const pinnableNodes = await query(
        `SELECT id, content, node_type, domain, weight, created_at
         FROM nodes
         WHERE created_at > $1
           AND node_type IN ('voiced', 'synthesis', 'possible', 'elite_verification', 'breakthrough')
           AND (archived = 0 OR archived IS NULL)
           AND (junk = 0 OR junk IS NULL)
         ORDER BY created_at DESC`,
        [targetTimestamp]
    );

    return {
        targetTimestamp,
        entriesAffected: totalEntries,
        byTable,
        nodesCreated,
        nodesModified,
        nodesDeleted,
        pinnableNodes,
    };
}

/**
 * Execute rollback to a target timestamp.
 * Stops all background services first to prevent concurrent writes during rollback.
 */
export async function executeRollback(
    targetTimestamp: string,
    pinGroup?: string
): Promise<RollbackResult> {
    // Stop all cycles, workers, and lab queue — prevents concurrent DB writes during rollback.
    // Does NOT set projectSwitching flag (this isn't a switch, just a pause).
    try {
        const { stopAllCyclesAndWorkers } = await import('../handlers/projects/services.js');
        await stopAllCyclesAndWorkers();
        console.error('[journal] Stopped all background services before rollback');
    } catch (err: any) {
        console.error(`[journal] Warning: failed to stop background services: ${err.message}`);
    }

    // Export pinned package before rollback
    let pinnedPackage: PinnedPackage | null = null;
    if (pinGroup) {
        pinnedPackage = await exportPinnedPackage(pinGroup);
    }

    // Execute in a single atomic transaction
    // NOTE: transactionSync uses raw better-sqlite3 which accepts ? params directly
    const result = transactionSync((tx: TransactionClient) => {
        // Disable triggers during rollback
        tx.query("INSERT OR REPLACE INTO settings (key, value) VALUES ('journal.enabled', '0')");

        const entries = tx.query(
            'SELECT * FROM graph_journal WHERE timestamp > $1 ORDER BY id DESC',
            [targetTimestamp]
        ) as JournalEntry[];

        let replayed = 0;

        for (const entry of entries) {
            try {
                if (entry.operation === 'INSERT') {
                    const pk = getTablePk(entry.table_name);
                    tx.query(`DELETE FROM ${entry.table_name} WHERE ${pk} = $1`, [entry.row_id]);
                } else if (entry.operation === 'UPDATE' && entry.before_state) {
                    const beforeState = JSON.parse(entry.before_state);
                    restoreRow(tx, entry.table_name, beforeState);
                } else if (entry.operation === 'DELETE' && entry.before_state) {
                    const beforeState = JSON.parse(entry.before_state);
                    reinsertRow(tx, entry.table_name, beforeState);
                }
                replayed++;
            } catch (err: any) {
                console.error(`[journal] Failed to replay entry ${entry.id} (${entry.operation} on ${entry.table_name}): ${err.message}`);
            }
        }

        tx.query('DELETE FROM graph_journal WHERE timestamp > $1', [targetTimestamp]);

        // ── FULL PROJECT CLEANUP: delete all rows created after target ──────
        // The journal only tracks TIER1 tables. A rollback must undo the
        // entire project state — lab executions, decisions, activity, caches,
        // everything. Dynamically discover all tables with a timestamp column
        // and delete rows created after the target. This also serves as a
        // safety net for TIER1 tables whose journal entries are missing.
        const SKIP_TABLES = new Set([
            'graph_journal', 'timeline_markers', 'journal_pins', 'settings',
            'sqlite_sequence',
        ]);
        const TIMESTAMP_COLUMNS = [
            'created_at', 'started_at', 'queued_at', 'timestamp',
            'promoted_at', 'mapped_at', 'verified_at', 'attempted_at',
        ];

        const allTables = tx.query(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        ) as { name: string }[];

        let totalCleaned = 0;
        const cleanedTables: Record<string, number> = {};

        for (const { name: table } of allTables) {
            if (SKIP_TABLES.has(table)) continue;

            const cols = tx.query(`PRAGMA table_info('${table}')`) as { name: string }[];
            const colNames = cols.map(c => c.name);
            const tsCol = TIMESTAMP_COLUMNS.find(tc => colNames.includes(tc));
            if (!tsCol) continue;

            const countBefore = (tx.queryOne(
                `SELECT COUNT(*) as cnt FROM ${table} WHERE ${tsCol} > $1`,
                [targetTimestamp]
            ) as any)?.cnt || 0;

            if (countBefore > 0) {
                tx.query(`DELETE FROM ${table} WHERE ${tsCol} > $1`, [targetTimestamp]);
                totalCleaned += countBefore;
                cleanedTables[table] = countBefore;
            }
        }

        if (totalCleaned > 0) {
            console.error(`[journal] Full project cleanup: deleted ${totalCleaned} row(s) across ${Object.keys(cleanedTables).length} table(s): ${JSON.stringify(cleanedTables)}`);
        }

        // ── RESET PIPELINE & LIFECYCLE STATE ──────────────────────────
        // These columns are NOT journaled (too noisy) and reference pipeline
        // operations (lab runs, lifecycle scoring) that were just deleted.
        // Reset BEFORE pinned import so pinned nodes keep their exported state.
        tx.query(`UPDATE nodes SET
            lab_frozen_at = NULL,
            lab_tainted_at = NULL,
            lifecycle_state = NULL,
            declining_since = NULL,
            composted_at = NULL,
            elite_considered = 0,
            cull_evaluated_at = NULL,
            last_resonated = NULL,
            barren_cycles = 0,
            total_children = (
                SELECT COUNT(*) FROM edges e
                WHERE e.source_id = nodes.id AND e.edge_type = 'parent'
            )
        `);

        // ── REIMPORT PINNED NODES ───────────────────────────────────
        // After cleanup and reset, restore pinned nodes with full state intact.
        let pinnedRestored = 0;
        if (pinnedPackage) {
            pinnedRestored = reimportPinnedPackage(tx, pinnedPackage);
        }

        // ── ORPHAN CLEANUP: remove rows referencing deleted nodes ──────
        // Runs after pinned import so we don't delete their refs.
        tx.query(`DELETE FROM edges WHERE source_id NOT IN (SELECT id FROM nodes) OR target_id NOT IN (SELECT id FROM nodes)`);
        tx.query(`DELETE FROM node_number_refs WHERE node_id NOT IN (SELECT id FROM nodes)`);
        try { tx.query(`DELETE FROM node_abstract_patterns WHERE node_id NOT IN (SELECT id FROM nodes)`); } catch { /* table may not exist */ }
        try { tx.query(`DELETE FROM node_keywords WHERE node_id NOT IN (SELECT id FROM nodes)`); } catch { /* table may not exist */ }
        try { tx.query(`DELETE FROM node_stubs WHERE node_id NOT IN (SELECT id FROM nodes)`); } catch { /* table may not exist */ }
        try { tx.query(`DELETE FROM embedding_eval_cache WHERE node_id NOT IN (SELECT id FROM nodes)`); } catch { /* table may not exist */ }
        try { tx.query(`DELETE FROM embedding_eval_results WHERE node_id NOT IN (SELECT id FROM nodes)`); } catch { /* table may not exist */ }
        try { tx.query(`DELETE FROM elite_nodes WHERE node_id NOT IN (SELECT id FROM nodes)`); } catch { /* table may not exist */ }

        tx.query("DELETE FROM settings WHERE key = 'journal.enabled'");

        tx.query(
            `INSERT INTO timeline_markers (event_type, label, detail, contributor)
             VALUES ('rollback', $1, $2, 'journal')`,
            [
                `Rolled back to ${targetTimestamp}`,
                JSON.stringify({
                    targetTimestamp,
                    entriesReplayed: replayed,
                    rowsCleaned: totalCleaned,
                    cleanedTables,
                    pinnedNodesRestored: pinnedRestored,
                    pinGroup: pinGroup || null,
                }),
            ]
        );

        const marker = tx.queryOne('SELECT last_insert_rowid() as id');

        if (pinGroup) {
            tx.query('DELETE FROM journal_pins WHERE pin_group = $1', [pinGroup]);
        }

        return {
            success: true,
            targetTimestamp,
            entriesReplayed: replayed,
            rowsCleaned: totalCleaned,
            cleanedTables,
            pinnedNodesRestored: pinnedRestored,
            markerId: marker?.id || 0,
        };
    });

    return result;
}

// =============================================================================
// JOURNAL QUERIES
// =============================================================================

/**
 * Query raw journal entries with optional filtering.
 */
export async function getJournalEntries(options: {
    tableName?: string;
    since?: string;
    until?: string;
    operation?: string;
    limit?: number;
    offset?: number;
} = {}): Promise<{ entries: JournalEntry[]; total: number }> {
    const { tableName, since, until, operation, limit = 50, offset = 0 } = options;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (tableName) {
        conditions.push(`table_name = $${idx++}`);
        params.push(tableName);
    }
    if (since) {
        conditions.push(`timestamp >= $${idx++}`);
        params.push(since);
    }
    if (until) {
        conditions.push(`timestamp <= $${idx++}`);
        params.push(until);
    }
    if (operation) {
        conditions.push(`operation = $${idx++}`);
        params.push(operation);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await queryOne(`SELECT COUNT(*) as total FROM graph_journal ${where}`, params);
    const total = countRow?.total || 0;

    // We don't return raw before_state (too large), but we DO return a small `meta`
    // object per entry so the GUI can render meaningful descriptions instead of
    // "1 node updated in unknown". For node rows we look up the current state
    // first (works for INSERT/UPDATE where the row still exists) and fall back to
    // parsing before_state for DELETEs and rows that have since been removed.
    const entries = await query(
        `SELECT id, table_name, row_id, operation, timestamp, marker_id, before_state
         FROM graph_journal ${where} ORDER BY id DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
    );

    const enriched = await enrichJournalEntries(entries as any[]);

    return { entries: enriched, total };
}

/**
 * Walk a page of journal entries and attach a small `meta` object to each so
 * the GUI can render descriptions like "1 node created in Standard Physics
 * (possible)" instead of "1 node updated in unknown". The strategy:
 *
 *   - For each `nodes` entry: prefer the live row from the `nodes` table.
 *     Falls back to parsing the entry's own `before_state` (necessary for
 *     DELETEs and for rows deleted between the journal entry and this read).
 *   - For each `edges` entry: parse before_state for source/target ids.
 *   - For each `node_number_refs` entry: parse before_state to get node_id +
 *     var_id so the GUI can attribute the link to a specific node.
 *
 * The raw `before_state` field is stripped from the returned objects — we keep
 * the response payload lean and just expose the extracted facts via `meta`.
 */
async function enrichJournalEntries(entries: any[]): Promise<any[]> {
    if (entries.length === 0) return entries;

    // Collect distinct node row_ids that need a current-state lookup.
    const nodeIds = new Set<string>();
    for (const e of entries) {
        if (e.table_name === 'nodes' && e.row_id) nodeIds.add(e.row_id);
    }

    // Bulk fetch current state for any nodes still in the table (one query
    // total, not one per entry).
    const liveNodes = new Map<string, { domain: string | null; node_type: string | null; content: string | null; archived: number | null }>();
    if (nodeIds.size > 0) {
        const ids = [...nodeIds];
        // Cap batch size at 500 to keep the IN-list reasonable.
        for (let i = 0; i < ids.length; i += 500) {
            const batch = ids.slice(i, i + 500);
            const ph = batch.map((_, j) => `$${j + 1}`).join(', ');
            const rows = await query(
                `SELECT id, domain, node_type, content, archived FROM nodes WHERE id IN (${ph})`,
                batch
            ) as any[];
            for (const r of rows) liveNodes.set(r.id, r);
        }
    }

    return entries.map((e: any) => {
        const meta: Record<string, any> = {};

        if (e.table_name === 'nodes') {
            const live = liveNodes.get(e.row_id);
            if (live) {
                meta.domain = live.domain ?? null;
                meta.node_type = live.node_type ?? null;
                meta.contentExcerpt = excerptContent(live.content);
                if (live.archived) meta.archived = true;
            } else if (e.before_state) {
                // Row has since been deleted (or this entry IS the delete) —
                // recover what we can from before_state.
                try {
                    const before = JSON.parse(e.before_state);
                    meta.domain = before?.domain ?? null;
                    meta.node_type = before?.node_type ?? null;
                    meta.contentExcerpt = excerptContent(before?.content);
                    meta.fromBeforeState = true;
                } catch { /* leave meta empty */ }
            }
        } else if (e.table_name === 'edges' && e.before_state) {
            try {
                const before = JSON.parse(e.before_state);
                if (before?.source_id) meta.source_id = before.source_id;
                if (before?.target_id) meta.target_id = before.target_id;
                if (before?.edge_type) meta.edge_type = before.edge_type;
            } catch { /* non-fatal */ }
        } else if (e.table_name === 'node_number_refs' && e.before_state) {
            try {
                const before = JSON.parse(e.before_state);
                if (before?.node_id) meta.node_id = before.node_id;
                if (before?.var_id) meta.var_id = before.var_id;
            } catch { /* non-fatal */ }
        } else if (e.table_name === 'number_registry' && e.before_state) {
            try {
                const before = JSON.parse(e.before_state);
                if (before?.var_id) meta.var_id = before.var_id;
                if (before?.value != null) meta.value = before.value;
            } catch { /* non-fatal */ }
        }

        // Strip the heavy before_state column before sending to the GUI; meta
        // already carries the bits the renderer needs.
        const { before_state: _stripped, ...rest } = e;
        return Object.keys(meta).length > 0 ? { ...rest, meta } : rest;
    });
}

/** Trim a node's content to a short snippet suitable for journal labels. */
function excerptContent(content: string | null | undefined): string | null {
    if (!content) return null;
    const flat = String(content).replace(/\s+/g, ' ').trim();
    if (flat.length === 0) return null;
    return flat.length > 80 ? flat.slice(0, 80) + '…' : flat;
}

/**
 * Prune old journal entries before a given timestamp.
 */
export async function pruneJournal(olderThan: string): Promise<{ deleted: number }> {
    const countRow = await queryOne(
        'SELECT COUNT(*) as cnt FROM graph_journal WHERE timestamp < $1',
        [olderThan]
    );
    await query('DELETE FROM graph_journal WHERE timestamp < $1', [olderThan]);

    await createTimelineMarker('prune', `Pruned journal entries before ${olderThan}`, {
        olderThan,
        entriesDeleted: countRow?.cnt || 0,
    }, 'journal');

    return { deleted: countRow?.cnt || 0 };
}

/**
 * Get journal statistics.
 */
export async function getJournalStats(): Promise<Record<string, any>> {
    const total = await queryOne('SELECT COUNT(*) as cnt FROM graph_journal');
    const oldest = await queryOne('SELECT MIN(timestamp) as ts FROM graph_journal');
    const newest = await queryOne('SELECT MAX(timestamp) as ts FROM graph_journal');
    const byTable = await query(
        'SELECT table_name, COUNT(*) as cnt FROM graph_journal GROUP BY table_name ORDER BY cnt DESC'
    );
    const byOp = await query(
        'SELECT operation, COUNT(*) as cnt FROM graph_journal GROUP BY operation ORDER BY cnt DESC'
    );
    const markerCount = await queryOne('SELECT COUNT(*) as cnt FROM timeline_markers');

    return {
        totalEntries: total?.cnt || 0,
        oldestEntry: oldest?.ts || null,
        newestEntry: newest?.ts || null,
        byTable,
        byOperation: byOp,
        timelineMarkers: markerCount?.cnt || 0,
    };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

function getTablePk(tableName: string): string {
    const pks: Record<string, string> = {
        nodes: 'id',
        edges: 'rowid',
        domain_partitions: 'id',
        partition_domains: 'rowid',
        partition_bridges: 'rowid',
        number_registry: 'var_id',
        node_number_refs: 'rowid',
    };
    return pks[tableName] || 'id';
}

/** Restore a row to its before_state (UPDATE → SET all columns) */
function restoreRow(tx: TransactionClient, tableName: string, data: Record<string, any>): void {
    const pk = getTablePk(tableName);
    const pkValue = data[pk];
    if (!pkValue) return;

    const cols = Object.keys(data).filter(k => k !== pk);
    if (cols.length === 0) return;

    const setClause = cols.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const values = cols.map(c => data[c]);

    tx.query(`UPDATE ${tableName} SET ${setClause} WHERE ${pk} = $${cols.length + 1}`, [...values, pkValue]);
}

/** Re-insert a row from its before_state (DELETE → INSERT) */
function reinsertRow(tx: TransactionClient, tableName: string, data: Record<string, any>): void {
    const cols = Object.keys(data);
    if (cols.length === 0) return;

    const ph = placeholders(cols.length);
    const values = cols.map(c => data[c]);

    tx.query(
        `INSERT OR IGNORE INTO ${tableName} (${cols.join(', ')}) VALUES (${ph})`,
        values
    );
}

/** Reimport a pinned package into the database (INSERT OR IGNORE) */
function reimportPinnedPackage(tx: TransactionClient, pkg: PinnedPackage): number {
    let restored = 0;

    const insertOrIgnore = (table: string, rows: any[]) => {
        for (const row of rows) {
            const cols = Object.keys(row);
            const ph = placeholders(cols.length);
            tx.query(
                `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${ph})`,
                cols.map(c => row[c])
            );
        }
    };

    insertOrIgnore('domain_partitions', pkg.partitions);
    insertOrIgnore('partition_domains', pkg.partitionDomains);

    for (const node of pkg.nodes) {
        const cols = Object.keys(node);
        const ph = placeholders(cols.length);
        try {
            tx.query(
                `INSERT OR IGNORE INTO nodes (${cols.join(', ')}) VALUES (${ph})`,
                cols.map(c => node[c])
            );
            restored++;
        } catch (err: any) {
            console.error(`[journal] Failed to restore node ${node.id}: ${err.message}`);
        }
    }

    insertOrIgnore('edges', pkg.edges);

    // Restore all associated data (dynamically exported)
    for (const [table, rows] of Object.entries(pkg.associatedData || {})) {
        insertOrIgnore(table, rows);
    }

    return restored;
}
