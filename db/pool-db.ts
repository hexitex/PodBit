/**
 * PARTITION POOL - SYSTEM-LEVEL DATABASE
 *
 * Self-contained SQLite module for data/pool.db.
 * Independent of the project DB — survives project switches.
 * Stores the partition pool, recruitment schedules, and partition history.
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from '../config.js';
import { RC } from '../config/constants.js';
import { applyEncryptionKey } from './sqlite-backend.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

let db: Database.Database | null = null;

/**
 * Generate a v4-style UUID string without the `crypto` dependency.
 *
 * Uses `Math.random()` for byte generation. The UUID conforms to the
 * version-4 format (version nibble = `4`, variant bits = `10xx`).
 *
 * @returns A lowercase UUID string (e.g. `'a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5'`).
 */
function genUUID(): string {
    const hex = (n: number): string => {
        const bytes = new Uint8Array(n);
        for (let i = 0; i < n; i++) bytes[i] = Math.floor(Math.random() * 256);
        return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    };
    const a = hex(4), b = hex(2);
    const c = '4' + hex(2).substring(1);
    const d = ((parseInt(hex(1), 16) & 0x3) | 0x8).toString(16) + hex(2).substring(1);
    const e = hex(6);
    return `${a}-${b}-${c}-${d}-${e}`;
}

/** Creates pool_partitions, recruitments, and partition_history tables if missing; then runs migrateSchema. */
function initSchema(database: Database.Database): void {
    database.exec(`
        CREATE TABLE IF NOT EXISTS pool_partitions (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            description     TEXT,
            owner           TEXT NOT NULL,
            export_data     TEXT NOT NULL,
            domain_count    INTEGER DEFAULT 0,
            node_count      INTEGER DEFAULT 0,
            domains         TEXT,
            added_at        TEXT DEFAULT (datetime('now')),
            last_returned_at TEXT,
            times_recruited INTEGER DEFAULT 0,
            checked_out     INTEGER DEFAULT 0,
            fitness         REAL DEFAULT 0,
            generation      INTEGER DEFAULT 0,
            breakthrough_count INTEGER DEFAULT 0,
            avg_weight      REAL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS recruitments (
            id                  TEXT PRIMARY KEY,
            pool_partition_id   TEXT NOT NULL,
            target_project      TEXT NOT NULL,
            status              TEXT NOT NULL DEFAULT 'pending',
            bridges_config      TEXT,
            procreation_hours   REAL NOT NULL,
            min_cycles          INTEGER DEFAULT 5,
            max_cycles          INTEGER DEFAULT 100,
            current_cycles      INTEGER DEFAULT 0,
            current_barren      INTEGER DEFAULT 0,
            exhaustion_threshold INTEGER DEFAULT 10,
            scheduled_at        TEXT DEFAULT (datetime('now')),
            activated_at        TEXT,
            return_due_at       TEXT,
            returned_at         TEXT,
            transient_id        TEXT,
            error               TEXT,
            node_count_at_recruit    INTEGER DEFAULT 0,
            avg_weight_at_recruit    REAL DEFAULT 0,
            breakthroughs_at_recruit INTEGER DEFAULT 0,
            FOREIGN KEY (pool_partition_id) REFERENCES pool_partitions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_recruitments_status ON recruitments(status);
        CREATE INDEX IF NOT EXISTS idx_recruitments_project ON recruitments(target_project);

        CREATE TABLE IF NOT EXISTS partition_history (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            pool_partition_id TEXT NOT NULL,
            recruitment_id    TEXT,
            generation        INTEGER NOT NULL,
            event_type        TEXT NOT NULL,
            project           TEXT,
            node_count        INTEGER DEFAULT 0,
            breakthrough_count INTEGER DEFAULT 0,
            avg_weight        REAL DEFAULT 0,
            fitness           REAL DEFAULT 0,
            cycles_run        INTEGER DEFAULT 0,
            domains           TEXT,
            timestamp         TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (pool_partition_id) REFERENCES pool_partitions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_history_partition ON partition_history(pool_partition_id);
    `);

    // Migrations for existing databases
    migrateSchema(database);
}

/** Adds missing columns to pool tables for backward-compatible schema evolution. */
function migrateSchema(database: Database.Database): void {
    const addColumn = (table: string, column: string, type: string) => {
        try {
            database.prepare(`SELECT ${column} FROM ${table} LIMIT 1`).get();
        } catch {
            database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
        }
    };

    // pool_partitions migrations
    addColumn('pool_partitions', 'checked_out', 'INTEGER DEFAULT 0');
    addColumn('pool_partitions', 'fitness', 'REAL DEFAULT 0');
    addColumn('pool_partitions', 'generation', 'INTEGER DEFAULT 0');
    addColumn('pool_partitions', 'breakthrough_count', 'INTEGER DEFAULT 0');
    addColumn('pool_partitions', 'avg_weight', 'REAL DEFAULT 0');

    // recruitments migrations
    addColumn('recruitments', 'node_count_at_recruit', 'INTEGER DEFAULT 0');
    addColumn('recruitments', 'avg_weight_at_recruit', 'REAL DEFAULT 0');
    addColumn('recruitments', 'breakthroughs_at_recruit', 'INTEGER DEFAULT 0');

    // integrity migrations
    addColumn('pool_partitions', 'merkle_root', 'TEXT');
    addColumn('pool_partitions', 'integrity_status', "TEXT DEFAULT 'unverified'");
    addColumn('pool_partitions', 'chain_length', 'INTEGER DEFAULT 0');
}

/** Opens or returns the singleton pool database (pool.db); initializes schema on first open. */
export function getPoolDb(): Database.Database {
    if (!db) {
        const dbPath = path.isAbsolute(config.partitionServer.dbPath)
            ? config.partitionServer.dbPath
            : path.join(projectRoot, config.partitionServer.dbPath);

        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        db = new Database(dbPath);
        applyEncryptionKey(db);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        db.pragma(`busy_timeout = ${RC.database.projectDb.busyTimeoutMs}`);
        initSchema(db);
    }
    return db;
}

/** Closes the pool database and clears the singleton reference. */
export function closePoolDb(): void {
    if (db) {
        db.close();
        db = null;
    }
}

// --- Fitness Computation ---

/**
 * Compute partition fitness score from export data for pool ranking.
 *
 * Formula: `avgWeight * log2(nodeCount) * typeDiversity + breakthroughBonus`
 * where typeDiversity is `1.0 + 0.1 * (uniqueTypes - 1)` capped at 1.5,
 * and breakthroughBonus is `breakthroughCount * 0.05`.
 *
 * @param exportData - Partition export object with a `nodes` array.
 * @returns Object with `fitness` (rounded to 2 decimals), `avgWeight`, and `breakthroughCount`.
 */
export function computeFitness(exportData: any): { fitness: number; avgWeight: number; breakthroughCount: number } {
    const nodes = exportData?.nodes || [];
    if (nodes.length === 0) return { fitness: 0, avgWeight: 0, breakthroughCount: 0 };

    const totalWeight = nodes.reduce((sum: number, n: any) => sum + (n.weight || 1.0), 0);
    const avgWeight = totalWeight / nodes.length;

    const types = new Set<string>();
    let breakthroughCount = 0;
    for (const n of nodes) {
        if (n.node_type) types.add(n.node_type);
        if (n.node_type === 'breakthrough') breakthroughCount++;
    }

    const typeDiversity = Math.min(1.5, 1.0 + 0.1 * (types.size - 1));
    const breakthroughBonus = breakthroughCount * 0.05;
    const fitness = avgWeight * Math.log2(Math.max(2, nodes.length)) * typeDiversity + breakthroughBonus;

    return { fitness: Math.round(fitness * 100) / 100, avgWeight: Math.round(avgWeight * 100) / 100, breakthroughCount };
}

// --- Checkout/Checkin ---

/** Atomically marks a partition as checked out; returns true if it was available. */
export function checkoutPartition(id: string): boolean {
    const d = getPoolDb();
    const result = d.prepare(`UPDATE pool_partitions SET checked_out = 1 WHERE id = ? AND checked_out = 0`).run(id);
    return result.changes > 0;
}

/** Marks a partition as no longer checked out so it can be recruited again. */
export function checkinPartition(id: string): void {
    const d = getPoolDb();
    d.prepare(`UPDATE pool_partitions SET checked_out = 0 WHERE id = ?`).run(id);
}

// --- History ---

/** Appends one partition_history row for audit trail (event type, counts, fitness, etc.). */
export function recordHistory(params: {
    poolPartitionId: string;
    recruitmentId?: string;
    eventType: string;
    project?: string;
    nodeCount?: number;
    breakthroughCount?: number;
    avgWeight?: number;
    fitness?: number;
    cyclesRun?: number;
    domains?: string;
}): void {
    const d = getPoolDb();
    // Auto-derive generation: next in sequence for this partition
    const maxGen = d.prepare(
        `SELECT COALESCE(MAX(generation), -1) AS max_gen FROM partition_history WHERE pool_partition_id = ?`
    ).get(params.poolPartitionId) as any;
    const generation = (maxGen?.max_gen ?? -1) + 1;

    d.prepare(`
        INSERT INTO partition_history (pool_partition_id, recruitment_id, generation, event_type, project, node_count, breakthrough_count, avg_weight, fitness, cycles_run, domains)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        params.poolPartitionId,
        params.recruitmentId || null,
        generation,
        params.eventType,
        params.project || null,
        params.nodeCount ?? 0,
        params.breakthroughCount ?? 0,
        params.avgWeight ?? 0,
        params.fitness ?? 0,
        params.cyclesRun ?? 0,
        params.domains || null,
    );
}

/** Returns all history rows for a pool partition ordered by generation and timestamp. */
export function getPartitionHistory(poolPartitionId: string): any[] {
    const d = getPoolDb();
    return d.prepare(`
        SELECT * FROM partition_history
        WHERE pool_partition_id = ?
        ORDER BY generation ASC, timestamp ASC
    `).all(poolPartitionId);
}

// --- Dashboard Stats ---

/** Returns aggregate pool stats: total partitions, active recruitments count, avg fitness, oldest partition. */
export function getDashboardStats(): { totalPartitions: number; totalActive: number; avgFitness: number; oldestPartition: string | null } {
    const d = getPoolDb();
    const stats = d.prepare(`
        SELECT
            COUNT(*) AS total_partitions,
            COALESCE(AVG(fitness), 0) AS avg_fitness,
            MIN(added_at) AS oldest
        FROM pool_partitions
    `).get() as any;

    const active = d.prepare(`SELECT COUNT(*) AS cnt FROM recruitments WHERE status = 'active'`).get() as any;

    return {
        totalPartitions: stats?.total_partitions || 0,
        totalActive: active?.cnt || 0,
        avgFitness: Math.round((stats?.avg_fitness || 0) * 100) / 100,
        oldestPartition: stats?.oldest || null,
    };
}

// --- Stale Reclaim ---

/** Returns active recruitments whose return_due_at is past by graceHours (for return-to-pool). */
export function getExpiredRecruitments(graceHours: number): any[] {
    const d = getPoolDb();
    return d.prepare(`
        SELECT * FROM recruitments
        WHERE status = 'active'
          AND return_due_at IS NOT NULL
          AND datetime(return_due_at, '+' || ? || ' hours') < datetime('now')
    `).all(graceHours);
}

// --- Pool Partition CRUD ---

/**
 * Insert or update a partition in the pool from export data.
 *
 * Validates the export format and minimum node count (from config). Computes
 * fitness and integrity metadata. Uses `INSERT ... ON CONFLICT DO UPDATE` for
 * upsert semantics. Records a `'added'` history event for new partitions.
 *
 * @param exportData - Partition export object (must have `podbitExport` version
 *   and `partition` data with `id` and optionally `name`/`description`).
 * @returns Object with the pool partition `id` (format: `owner/partitionId`)
 *   and computed `fitness` score.
 * @throws {Error} If export format is invalid or node count is below minimum.
 */
export function addToPool(exportData: any): { id: string; fitness: number } {
    const d = getPoolDb();
    const partition = exportData?.partition;
    if (!exportData?.podbitExport || !partition) {
        throw new Error('Invalid export format: must have podbitExport version and partition data');
    }

    const nodeCount = (exportData.nodes || []).length;
    const minNodes = config.partitionServer.minPoolNodes;
    if (nodeCount < minNodes) {
        throw new Error(`Partition has ${nodeCount} nodes, minimum is ${minNodes}`);
    }

    const owner = exportData.owner || 'unknown';
    const id = `${owner}/${partition.id}`;
    const domains = (exportData.domains || []).map((dm: any) => dm.domain || dm).join(', ');
    const { fitness, avgWeight, breakthroughCount } = computeFitness(exportData);

    // Extract integrity data if present
    const merkleRoot = exportData.integrity?.merkleRoot || null;
    const chainLength = exportData.integrity?.log?.length || 0;
    const integrityStatus = merkleRoot ? 'unverified' : 'none';

    const tx = d.transaction(() => {
        const existing = d.prepare('SELECT id, generation FROM pool_partitions WHERE id = ?').get(id) as any;

        d.prepare(`
            INSERT INTO pool_partitions (id, name, description, owner, export_data, domain_count, node_count, domains, fitness, avg_weight, breakthrough_count, generation, merkle_root, integrity_status, chain_length)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
            ON CONFLICT (id) DO UPDATE SET
                export_data = excluded.export_data,
                domain_count = excluded.domain_count,
                node_count = excluded.node_count,
                domains = excluded.domains,
                fitness = excluded.fitness,
                avg_weight = excluded.avg_weight,
                breakthrough_count = excluded.breakthrough_count,
                merkle_root = excluded.merkle_root,
                integrity_status = excluded.integrity_status,
                chain_length = excluded.chain_length,
                last_returned_at = datetime('now')
        `).run(
            id,
            partition.name || partition.id,
            partition.description || null,
            owner,
            JSON.stringify(exportData),
            (exportData.domains || []).length,
            nodeCount,
            domains,
            fitness,
            avgWeight,
            breakthroughCount,
            merkleRoot,
            integrityStatus,
            chainLength
        );

        // Record history: 'added' for new, skip for re-add (update)
        if (!existing) {
            recordHistory({
                poolPartitionId: id,
                eventType: 'added',
                nodeCount,
                breakthroughCount,
                avgWeight,
                fitness,
                domains,
            });
        }
    });
    tx();

    return { id, fitness };
}

/** Returns all pool partitions with active recruitment count, ordered by fitness descending. */
export function listPool(): any[] {
    const d = getPoolDb();
    return d.prepare(`
        SELECT pp.id, pp.name, pp.description, pp.owner, pp.domain_count, pp.node_count, pp.domains,
               pp.added_at, pp.last_returned_at, pp.times_recruited,
               pp.checked_out, pp.fitness, pp.generation, pp.breakthrough_count, pp.avg_weight,
               pp.merkle_root, pp.integrity_status, pp.chain_length,
               (SELECT COUNT(*) FROM recruitments r WHERE r.pool_partition_id = pp.id AND r.status = 'active') AS active_in
        FROM pool_partitions pp
        ORDER BY pp.fitness DESC
    `).all();
}

/** Returns a single pool partition by id or null. */
export function getPoolPartition(id: string): any | null {
    const d = getPoolDb();
    return d.prepare('SELECT * FROM pool_partitions WHERE id = ?').get(id) || null;
}

/** Deletes a partition from the pool and its history; cancels pending recruitments. */
export function removeFromPool(id: string): void {
    const d = getPoolDb();
    const tx = d.transaction(() => {
        d.prepare("DELETE FROM recruitments WHERE pool_partition_id = ? AND status = 'pending'").run(id);
        d.prepare('DELETE FROM partition_history WHERE pool_partition_id = ?').run(id);
        d.prepare('DELETE FROM pool_partitions WHERE id = ?').run(id);
    });
    tx();
}

// --- Recruitment CRUD ---

/**
 * Create a pending recruitment for a project. The target partition must not
 * already be checked out by another project.
 *
 * @param params - Recruitment configuration.
 * @param params.poolPartitionId - ID of the pool partition to recruit.
 * @param params.targetProject - Name of the project requesting the recruitment.
 * @param params.procreationHours - Duration (hours) before the partition should be returned.
 * @param params.minCycles - Minimum synthesis cycles before return is allowed (default 5).
 * @param params.maxCycles - Maximum synthesis cycles before forced return (default 100).
 * @param params.exhaustionThreshold - Barren cycles before exhaustion return (default 10).
 * @param params.bridgesConfig - Optional array of partition IDs to bridge with.
 * @returns Object with the generated recruitment `id`.
 * @throws {Error} If the partition is not found or is currently checked out.
 */
export function createRecruitment(params: {
    poolPartitionId: string;
    targetProject: string;
    procreationHours: number;
    minCycles?: number;
    maxCycles?: number;
    exhaustionThreshold?: number;
    bridgesConfig?: string[];
}): { id: string } {
    const d = getPoolDb();

    // Check if partition is checked out
    const partition = d.prepare('SELECT checked_out FROM pool_partitions WHERE id = ?').get(params.poolPartitionId) as any;
    if (!partition) throw new Error('Pool partition not found');
    if (partition.checked_out) throw new Error('Partition is currently checked out by another project');

    const id = genUUID();
    d.prepare(`
        INSERT INTO recruitments (id, pool_partition_id, target_project, status, bridges_config, procreation_hours, min_cycles, max_cycles, exhaustion_threshold)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `).run(
        id,
        params.poolPartitionId,
        params.targetProject,
        params.bridgesConfig ? JSON.stringify(params.bridgesConfig) : null,
        params.procreationHours,
        params.minCycles ?? 5,
        params.maxCycles ?? 100,
        params.exhaustionThreshold ?? 10
    );

    // NOTE: times_recruited is now incremented at activation time, not here

    return { id };
}

/** Returns recruitments optionally filtered by status and/or project; joined with partition name/domains. */
export function listRecruitments(filters?: { status?: string; project?: string }): any[] {
    const d = getPoolDb();
    let sql = `
        SELECT r.*, pp.name AS partition_name, pp.domains AS partition_domains
        FROM recruitments r
        LEFT JOIN pool_partitions pp ON r.pool_partition_id = pp.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters?.status) {
        conditions.push('r.status = ?');
        params.push(filters.status);
    }
    if (filters?.project) {
        conditions.push('r.target_project = ?');
        params.push(filters.project);
    }
    if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY r.scheduled_at DESC';

    return d.prepare(sql).all(...params);
}

/** Returns a single recruitment by id with partition name/domains, or null. */
export function getRecruitment(id: string): any | null {
    const d = getPoolDb();
    return d.prepare(`
        SELECT r.*, pp.name AS partition_name, pp.domains AS partition_domains
        FROM recruitments r
        LEFT JOIN pool_partitions pp ON r.pool_partition_id = pp.id
        WHERE r.id = ?
    `).get(id) || null;
}

/**
 * Updates recruitment row with the given key-value pairs.
 *
 * **SQL injection warning:** Column names from `updates` keys are interpolated directly
 * into the SET clause (not parameterized). Only call with trusted, internally-constructed
 * keys — never pass user-supplied key names.
 */
export function updateRecruitment(id: string, updates: Record<string, any>): void {
    const d = getPoolDb();
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => updates[k]);
    d.prepare(`UPDATE recruitments SET ${setClauses} WHERE id = ?`).run(...values, id);
}

/** Returns pending recruitments for a project with export_data for activation. */
export function getPendingForProject(projectName: string): any[] {
    const d = getPoolDb();
    return d.prepare(`
        SELECT r.*, pp.export_data
        FROM recruitments r
        JOIN pool_partitions pp ON r.pool_partition_id = pp.id
        WHERE r.target_project = ? AND r.status = 'pending'
        ORDER BY r.scheduled_at ASC
    `).all(projectName);
}

/** Returns active recruitments for a project (currently checked-out partitions). */
export function getActiveForProject(projectName: string): any[] {
    const d = getPoolDb();
    return d.prepare(`
        SELECT r.*, pp.name AS partition_name
        FROM recruitments r
        JOIN pool_partitions pp ON r.pool_partition_id = pp.id
        WHERE r.target_project = ? AND r.status = 'active'
        ORDER BY r.activated_at ASC
    `).all(projectName);
}

/** Updates current_cycles and current_barren on a recruitment (called from pool-integration). */
export function syncRecruitmentCycles(recruitmentId: string, cycles: number, barrenCycles: number): void {
    const d = getPoolDb();
    d.prepare(`UPDATE recruitments SET current_cycles = ?, current_barren = ? WHERE id = ?`)
        .run(cycles, barrenCycles, recruitmentId);
}

/**
 * Mark a recruitment as returned and update the pool partition with new export data.
 *
 * Atomically: updates partition fitness/counts/generation, marks recruitment
 * status as `'returned'`, and records a `'returned'` history event.
 *
 * @param recruitmentId - ID of the recruitment to return.
 * @param exportData - Updated partition export data after the project visit.
 * @throws {Error} If the recruitment ID is not found.
 */
export function returnPartitionToPool(recruitmentId: string, exportData: any): void {
    const d = getPoolDb();
    const recruitment = d.prepare('SELECT * FROM recruitments WHERE id = ?').get(recruitmentId) as any;
    if (!recruitment) throw new Error(`Recruitment ${recruitmentId} not found`);

    const { fitness, avgWeight, breakthroughCount } = computeFitness(exportData);
    const nodeCount = (exportData.nodes || []).length;
    const domains = (exportData.domains || []).map((dm: any) => dm.domain || dm).join(', ');

    // Extract integrity data if present
    const merkleRoot = exportData.integrity?.merkleRoot || null;
    const chainLength = exportData.integrity?.log?.length || 0;
    const integrityStatus = merkleRoot ? 'unverified' : 'none';

    const tx = d.transaction(() => {
        // Update pool partition with new export data (new generation)
        d.prepare(`
            UPDATE pool_partitions SET
                export_data = ?,
                domain_count = ?,
                node_count = ?,
                domains = ?,
                fitness = ?,
                avg_weight = ?,
                breakthrough_count = ?,
                generation = generation + 1,
                checked_out = 0,
                last_returned_at = datetime('now'),
                merkle_root = ?,
                integrity_status = ?,
                chain_length = ?
            WHERE id = ?
        `).run(
            JSON.stringify(exportData),
            (exportData.domains || []).length,
            nodeCount,
            domains,
            fitness,
            avgWeight,
            breakthroughCount,
            merkleRoot,
            integrityStatus,
            chainLength,
            recruitment.pool_partition_id
        );

        // Mark recruitment as returned
        d.prepare(`
            UPDATE recruitments SET status = 'returned', returned_at = datetime('now')
            WHERE id = ?
        `).run(recruitmentId);

        // Record history
        recordHistory({
            poolPartitionId: recruitment.pool_partition_id,
            recruitmentId,
            eventType: 'returned',
            project: recruitment.target_project,
            nodeCount,
            breakthroughCount,
            avgWeight,
            fitness,
            cyclesRun: recruitment.current_cycles || 0,
            domains,
        });
    });
    tx();
}

/**
 * Update integrity verification status for a pool partition.
 *
 * @param partitionId - Pool partition ID to update.
 * @param status - New integrity status (e.g. `'verified'`, `'failed'`, `'unverified'`).
 * @param merkleRoot - Optional new Merkle root hash (updated only if provided).
 */
export function updateIntegrityStatus(partitionId: string, status: string, merkleRoot?: string): void {
    const d = getPoolDb();
    if (merkleRoot) {
        d.prepare('UPDATE pool_partitions SET integrity_status = ?, merkle_root = ? WHERE id = ?')
            .run(status, merkleRoot, partitionId);
    } else {
        d.prepare('UPDATE pool_partitions SET integrity_status = ? WHERE id = ?')
            .run(status, partitionId);
    }
}
