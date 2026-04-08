/**
 * Lab framework migrations.
 *
 * Init phase adds freeze/taint columns to `nodes` and template/polling columns
 * to `lab_queue` and `lab_executions` (formerly `evm_queue` and `evm_executions`).
 *
 * Schema phase creates the `lab_templates` table and seeds the `math-lab`
 * system template.
 *
 * @module db/migrations/lab
 */

import type Database from 'better-sqlite3';
import { PORTS, localUrl } from '../../config/ports.js';

/**
 * Run lab init migrations (nodes freeze/taint columns, queue/execution template columns).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runLabInitMigrations(db: Database.Database): void {
    // =========================================================================
    // NODES — freeze columns
    // =========================================================================
    try {
        db.prepare('SELECT lab_status FROM nodes LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE nodes ADD COLUMN lab_status TEXT');
        db.exec('ALTER TABLE nodes ADD COLUMN lab_experiment_id TEXT');
        db.exec('ALTER TABLE nodes ADD COLUMN lab_frozen_at TEXT');
        console.error('[sqlite] Added lab freeze columns to nodes');
    }

    // =========================================================================
    // NODES — taint columns
    // =========================================================================
    try {
        db.prepare('SELECT lab_taint_source_id FROM nodes LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE nodes ADD COLUMN lab_taint_source_id TEXT');
        db.exec('ALTER TABLE nodes ADD COLUMN lab_tainted_at TEXT');
        console.error('[sqlite] Added lab taint columns to nodes');
    }

    // =========================================================================
    // QUEUE — template and polling columns (handles both old evm_queue and new lab_queue names)
    // =========================================================================
    const queueTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('lab_queue', 'evm_queue')").get() as { name: string } | undefined;
    const qTable = queueTable?.name || 'lab_queue';
    try {
        db.prepare(`SELECT template_id FROM ${qTable} LIMIT 1`).get();
    } catch {
        try {
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN template_id TEXT DEFAULT 'math-lab'`);
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN external_job_id TEXT`);
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN last_polled_at TEXT`);
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN poll_count INTEGER DEFAULT 0`);
            console.error(`[sqlite] Added lab columns to ${qTable}`);
        } catch { /* table may not exist yet — created in schema phase */ }
    }

    // =========================================================================
    // EXECUTIONS — template and evidence columns (handles both old and new names)
    // =========================================================================
    const execTable = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('lab_executions', 'evm_executions')").get() as { name: string } | undefined;
    const eTable = execTable?.name || 'lab_executions';
    try {
        db.prepare(`SELECT template_id FROM ${eTable} LIMIT 1`).get();
    } catch {
        try {
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN template_id TEXT DEFAULT 'math-lab'`);
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN evidence TEXT`);
            console.error(`[sqlite] Added lab columns to ${eTable}`);
        } catch { /* table may not exist yet — created in schema phase */ }
    }

    // =========================================================================
    // EXECUTIONS — traceability columns (lab job ID, lab ID, spec JSON, artifact zip ID)
    // =========================================================================
    try {
        db.prepare(`SELECT lab_job_id FROM ${eTable} LIMIT 1`).get();
    } catch {
        try {
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN lab_job_id TEXT`);
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN lab_id TEXT`);
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN spec TEXT`);
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN artifact_zip_id TEXT`);
            console.error(`[sqlite] Added traceability columns to ${eTable}`);
        } catch { /* may not exist yet */ }
    }

    // =========================================================================
    // EXECUTIONS — lab_name column (denormalized for display)
    // =========================================================================
    try {
        db.prepare(`SELECT lab_name FROM ${eTable} LIMIT 1`).get();
    } catch {
        try {
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN lab_name TEXT`);
            console.error(`[sqlite] Added lab_name column to ${eTable}`);
        } catch { /* may not exist yet */ }
    }

    // =========================================================================
    // QUEUE — lab_id column for multi-lab routing
    // =========================================================================
    try {
        db.prepare(`SELECT lab_id FROM ${qTable} LIMIT 1`).get();
    } catch {
        try {
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN lab_id TEXT`);
            console.error(`[sqlite] Added lab_id column to ${qTable}`);
        } catch { /* table may not exist yet */ }
    }

    // =========================================================================
    // QUEUE — lab chaining columns
    // =========================================================================
    try {
        db.prepare(`SELECT chain_parent_id FROM ${qTable} LIMIT 1`).get();
    } catch {
        try {
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN chain_parent_id INTEGER`);
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN chain_depth INTEGER DEFAULT 0`);
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN chain_type TEXT`);
            db.exec(`ALTER TABLE ${qTable} ADD COLUMN chain_spec TEXT`);
            console.error(`[sqlite] Added lab chaining columns to ${qTable}`);
        } catch { /* table may not exist yet */ }
    }

    // =========================================================================
    // EXECUTIONS — lab chaining columns
    // =========================================================================
    try {
        db.prepare(`SELECT chain_parent_id FROM ${eTable} LIMIT 1`).get();
    } catch {
        try {
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN chain_parent_id TEXT`);
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN chain_type TEXT`);
            db.exec(`ALTER TABLE ${eTable} ADD COLUMN chain_status TEXT`);
            console.error(`[sqlite] Added lab chaining columns to ${eTable}`);
        } catch { /* may not exist yet */ }
    }

    // =========================================================================
    // CLEANUP — remove project-level assignments for deprecated EVM subsystems
    // =========================================================================
    try {
        const deprecated = ['evm_codegen', 'evm_triage', 'evm_research', 'evm_structural', 'evm_expert'];
        const removed = db.prepare(
            `DELETE FROM project_assignments WHERE subsystem IN (${deprecated.map(() => '?').join(',')})`
        ).run(...deprecated);
        if (removed.changes > 0) {
            console.error(`[sqlite] Removed ${removed.changes} deprecated EVM project assignment(s)`);
        }
    } catch { /* project_assignments may not exist yet — non-fatal */ }
}

/**
 * Run lab schema migrations (lab_templates table, indexes, seed data).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runLabSchemaMigrations(db: Database.Database): void {
    // =========================================================================
    // LAB_TEMPLATES — template definition table
    // =========================================================================
    try {
        db.prepare('SELECT id FROM lab_templates LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS lab_templates (
                id                TEXT PRIMARY KEY,
                name              TEXT NOT NULL UNIQUE,
                description       TEXT,
                system_template   INTEGER NOT NULL DEFAULT 0,
                execution_config  TEXT,
                triage_config     TEXT,
                poll_config       TEXT,
                interpret_config  TEXT,
                outcome_config    TEXT,
                evidence_schema   TEXT,
                budget_config     TEXT,
                created_at        TEXT DEFAULT (datetime('now')),
                updated_at        TEXT DEFAULT (datetime('now'))
            );
        `);
        console.error('[sqlite] Created lab_templates table');
    }

    // Add spec_types column if missing
    try {
        db.prepare('SELECT spec_types FROM lab_templates LIMIT 1').get();
    } catch {
        db.exec("ALTER TABLE lab_templates ADD COLUMN spec_types TEXT DEFAULT '[]'");
        console.error('[sqlite] Added spec_types column to lab_templates');
    }

    // Seed the math-lab system template
    try {
        const existing = db.prepare("SELECT id FROM lab_templates WHERE id = 'math-lab'").get();
        if (!existing) {
            db.prepare(`
                INSERT INTO lab_templates (id, name, description, system_template, execution_config, poll_config, outcome_config, evidence_schema, spec_types)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                'math-lab',
                'Math Lab',
                'Mathematical and computational verification — numerical identity, convergence, symbolic, curve shape, threshold behaviour, structural mapping',
                1,
                JSON.stringify({ url: localUrl(PORTS.mathLab), submitEndpoint: '/submit', statusEndpoint: '/status/{jobId}', resultEndpoint: '/result/{jobId}' }),
                JSON.stringify({ strategy: 'interval', pollIntervalMs: 2000, maxPollAttempts: 300, statusField: 'status', completionValues: ['completed', 'failed'], failureValues: ['failed'] }),
                JSON.stringify({ freezeOnStart: true, taintOnRefute: true }),
                JSON.stringify([{ type: 'text', label: 'stdout', required: true }, { type: 'text', label: 'stderr', required: false }]),
                JSON.stringify(['math', 'structural_analysis', 'parameter_sweep'])
            );
            console.error('[sqlite] Seeded math-lab lab template');
        }
    } catch { /* non-fatal — template may already exist */ }

    // =========================================================================
    // LAB_EVIDENCE — reusable empirical data from experiments
    // =========================================================================
    try {
        db.prepare('SELECT id FROM lab_evidence LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS lab_evidence (
                id              TEXT PRIMARY KEY,
                experiment_id   TEXT,
                node_id         TEXT,
                label           TEXT NOT NULL,
                type            TEXT NOT NULL,
                mime_type       TEXT,
                data_inline     TEXT,
                data_path       TEXT,
                size_bytes      INTEGER,
                domain          TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_lab_evidence_node ON lab_evidence (node_id);
            CREATE INDEX IF NOT EXISTS idx_lab_evidence_domain ON lab_evidence (domain);
            CREATE INDEX IF NOT EXISTS idx_lab_evidence_label ON lab_evidence (label);
            CREATE INDEX IF NOT EXISTS idx_lab_evidence_experiment ON lab_evidence (experiment_id);
        `);
        console.error('[sqlite] Created lab_evidence table');
    }

    // =========================================================================
    // INDEXES — partial index on lab_status for efficient freeze/taint filtering
    // =========================================================================
    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_lab_status ON nodes (lab_status) WHERE lab_status IS NOT NULL');
    } catch { /* non-fatal — index may already exist */ }

    // =========================================================================
    // STARTUP RECOVERY — unfreeze nodes whose experiments are no longer running
    // =========================================================================
    try {
        // If a node is frozen but its experiment is completed/failed/cancelled, unfreeze it
        const stuck = db.prepare(`
            UPDATE nodes SET lab_status = NULL, lab_experiment_id = NULL, lab_frozen_at = NULL
            WHERE lab_status = 'frozen'
            AND lab_experiment_id IS NOT NULL
            AND CAST(lab_experiment_id AS INTEGER) IN (
                SELECT id FROM lab_queue WHERE status IN ('completed', 'failed', 'cancelled')
            )
        `).run();
        if (stuck.changes > 0) {
            console.error(`[sqlite] Lab: unfroze ${stuck.changes} nodes with completed experiments`);
        }
    } catch { /* non-fatal */ }

    // =========================================================================
    // MIGRATE DATA — merge evm_queue/evm_executions into lab_queue/lab_executions
    // Both old and new tables may coexist if CREATE TABLE ran before the rename.
    // Copy any rows from old tables that aren't in new tables, then drop old tables.
    // =========================================================================
    try {
        const evmQueueExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='evm_queue'"
        ).get();
        if (evmQueueExists) {
            const labQueueExists = db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='lab_queue'"
            ).get();
            if (labQueueExists) {
                // Both exist — merge old data using shared columns only
                const oldCols = (db.pragma('table_info(evm_queue)') as any[]).map(c => c.name as string);
                const newCols = (db.pragma('table_info(lab_queue)') as any[]).map(c => c.name as string);
                const shared = oldCols.filter(c => newCols.includes(c));
                const colList = shared.join(', ');
                const merged = db.prepare(`
                    INSERT OR IGNORE INTO lab_queue (${colList}) SELECT ${colList} FROM evm_queue
                `).run();
                if (merged.changes > 0) {
                    console.error(`[sqlite] Merged ${merged.changes} rows from evm_queue → lab_queue`);
                }
                db.exec('DROP TABLE evm_queue');
                console.error('[sqlite] Dropped old evm_queue table');
            } else {
                // Only old table exists — rename it
                db.exec('ALTER TABLE evm_queue RENAME TO lab_queue');
                console.error('[sqlite] Renamed evm_queue → lab_queue');
            }
            // Recreate indexes on lab_queue
            db.exec('DROP INDEX IF EXISTS idx_evm_queue_status');
            db.exec('DROP INDEX IF EXISTS idx_evm_queue_node');
            db.exec('DROP INDEX IF EXISTS idx_evm_queue_priority');
            db.exec('CREATE INDEX IF NOT EXISTS idx_lab_queue_status ON lab_queue (status)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_lab_queue_node ON lab_queue (node_id)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_lab_queue_priority ON lab_queue (status, priority DESC, queued_at ASC)');
        }
    } catch (e: any) {
        console.error(`[sqlite] evm_queue migration: ${e.message}`);
    }

    try {
        const evmExecExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='evm_executions'"
        ).get();
        if (evmExecExists) {
            const labExecExists = db.prepare(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='lab_executions'"
            ).get();
            if (labExecExists) {
                // Both exist — merge old data using shared columns only
                const oldCols = (db.pragma('table_info(evm_executions)') as any[]).map(c => c.name as string);
                const newCols = (db.pragma('table_info(lab_executions)') as any[]).map(c => c.name as string);
                const shared = oldCols.filter(c => newCols.includes(c));
                const colList = shared.join(', ');
                const merged = db.prepare(`
                    INSERT OR IGNORE INTO lab_executions (${colList}) SELECT ${colList} FROM evm_executions
                `).run();
                if (merged.changes > 0) {
                    console.error(`[sqlite] Merged ${merged.changes} rows from evm_executions → lab_executions`);
                }
                db.exec('DROP TABLE evm_executions');
                console.error('[sqlite] Dropped old evm_executions table');
            } else {
                // Only old table exists — rename it
                db.exec('ALTER TABLE evm_executions RENAME TO lab_executions');
                console.error('[sqlite] Renamed evm_executions → lab_executions');
            }
            // Recreate indexes on lab_executions
            db.exec('DROP INDEX IF EXISTS idx_evm_executions_node');
            db.exec('DROP INDEX IF EXISTS idx_evm_executions_status');
            db.exec('DROP INDEX IF EXISTS idx_evm_executions_verified');
            db.exec('DROP INDEX IF EXISTS idx_evm_executions_created');
            db.exec('DROP INDEX IF EXISTS idx_evm_node_created');
            db.exec('CREATE INDEX IF NOT EXISTS idx_lab_executions_node ON lab_executions (node_id)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_lab_executions_status ON lab_executions (status)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_lab_executions_verified ON lab_executions (verified)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_lab_executions_created ON lab_executions (created_at DESC)');
            db.exec('CREATE INDEX IF NOT EXISTS idx_lab_node_created ON lab_executions (node_id, created_at DESC)');
        }
    } catch (e: any) {
        console.error(`[sqlite] evm_executions migration: ${e.message}`);
    }
}
