/**
 * Feature migrations — prompts, scaffolding, feedback, breakthroughs, lifecycle,
 * config history/snapshots, elite pool, activity log, and model provenance.
 *
 * Split into two phases:
 * - `runFeaturesInitMigrations`: runs on every DB open (columns, tables, backfills).
 * - `runFeaturesSchemaMigrations`: runs after init (validation columns, composite
 *   indexes, elite pool tables, generation backfill, activity log).
 *
 * @module db/migrations/features
 */

import type Database from 'better-sqlite3';

/**
 * Run feature init migrations (prompts, scaffold rename, feedback, breakthrough
 * registry, node_keywords, gold standards, dedup gate overrides, lifecycle
 * columns, avatar, config history/snapshots).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runFeaturesInitMigrations(db: Database.Database): void {
    // Migrate: add prompts table if missing
    try {
        db.prepare('SELECT id FROM prompts LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS prompts (
                id          TEXT NOT NULL,
                category    TEXT NOT NULL,
                locale      TEXT NOT NULL DEFAULT 'en',
                content     TEXT NOT NULL,
                description TEXT,
                updated_at  TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (id, locale)
            )
        `);
        console.error('[sqlite] Added prompts table');
    }

    // Migrate: add scaffold_jobs table if missing
    try {
        db.prepare('SELECT id FROM scaffold_jobs LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS scaffold_jobs (
                id              TEXT PRIMARY KEY,
                request         TEXT NOT NULL,
                task_type       TEXT NOT NULL,
                outline         TEXT NOT NULL,
                sections        TEXT NOT NULL DEFAULT '{}',
                status          TEXT NOT NULL DEFAULT 'in_progress',
                error           TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_scaffold_jobs_status ON scaffold_jobs (status);
        `);
        console.error('[sqlite] Added scaffold_jobs table');
    }

    // Migrate: rename 'scaffold' → 'docs' across subsystem assignments and prompts
    try {
        const row = db.prepare("SELECT COUNT(*) as count FROM subsystem_assignments WHERE subsystem = 'scaffold'").get() as any;
        if (row?.count > 0) {
            db.exec("UPDATE subsystem_assignments SET subsystem = 'docs' WHERE subsystem = 'scaffold'");
            console.error('[sqlite] Renamed scaffold subsystem assignment to docs');
        }
    } catch {
        // subsystem_assignments table may not exist yet — non-critical
    }
    try {
        const promptRow = db.prepare("SELECT COUNT(*) as count FROM prompts WHERE id LIKE 'scaffold.%'").get() as any;
        if (promptRow?.count > 0) {
            db.exec("UPDATE prompts SET id = REPLACE(id, 'scaffold.', 'docs.'), category = 'docs' WHERE id LIKE 'scaffold.%'");
            console.error(`[sqlite] Renamed ${promptRow.count} scaffold prompt overrides to docs`);
        }
    } catch {
        // prompts table may not exist yet — non-critical
    }

    // Migrate: add feedback columns to nodes table
    try {
        db.prepare('SELECT feedback_rating FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN feedback_rating INTEGER`);
        db.exec(`ALTER TABLE nodes ADD COLUMN feedback_source TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN feedback_at TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN feedback_note TEXT`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_feedback ON nodes (feedback_rating) WHERE feedback_rating IS NOT NULL`);
        console.error('[sqlite] Added feedback columns to nodes');
    }

    // Migrate: add node_feedback table for feedback history
    try {
        db.prepare('SELECT id FROM node_feedback LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS node_feedback (
                id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                rating          INTEGER NOT NULL,
                source          TEXT NOT NULL DEFAULT 'human',
                contributor     TEXT,
                note            TEXT,
                context         TEXT,
                weight_before   REAL,
                weight_after    REAL,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_node_feedback_node ON node_feedback (node_id);
            CREATE INDEX IF NOT EXISTS idx_node_feedback_rating ON node_feedback (rating);
            CREATE INDEX IF NOT EXISTS idx_node_feedback_source ON node_feedback (source);
            CREATE INDEX IF NOT EXISTS idx_node_feedback_created ON node_feedback (created_at DESC);
        `);
        console.error('[sqlite] Added node_feedback table');
    }

    // Migrate: add breakthrough_registry table if missing (shared across projects)
    try {
        db.prepare('SELECT id FROM breakthrough_registry LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS breakthrough_registry (
                id                          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                node_id                     TEXT NOT NULL,
                content                     TEXT NOT NULL,
                domain                      TEXT,
                partition_id                 TEXT,
                partition_name               TEXT,
                trajectory                   TEXT,
                validation_synthesis         REAL,
                validation_novelty           REAL,
                validation_testability       REAL,
                validation_tension_resolution REAL,
                validation_composite         REAL,
                validation_reason            TEXT,
                project_name                 TEXT NOT NULL,
                promoted_by                  TEXT,
                promotion_source             TEXT NOT NULL DEFAULT 'manual',
                parent_contents              TEXT,
                promoted_at                  TEXT DEFAULT (datetime('now')),
                created_at                   TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_project ON breakthrough_registry (project_name);
            CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_domain ON breakthrough_registry (domain);
            CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_promoted ON breakthrough_registry (promoted_at DESC);
            CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_composite ON breakthrough_registry (validation_composite DESC);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_breakthrough_registry_dedup ON breakthrough_registry (node_id, project_name);
        `);
        console.error('[sqlite] Added breakthrough_registry table');
    }

    // Migrate: add documentation column to breakthrough_registry if missing
    try {
        db.prepare('SELECT documentation FROM breakthrough_registry LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE breakthrough_registry ADD COLUMN documentation TEXT`);
        console.error('[sqlite] Added documentation column to breakthrough_registry');
    }

    // Migrate: add node_keywords table if missing
    try {
        db.prepare('SELECT node_id FROM node_keywords LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS node_keywords (
                node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                keyword     TEXT NOT NULL,
                source      TEXT NOT NULL DEFAULT 'llm',
                created_at  TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (node_id, keyword)
            );
            CREATE INDEX IF NOT EXISTS idx_node_keywords_keyword ON node_keywords (keyword);
            CREATE INDEX IF NOT EXISTS idx_node_keywords_node ON node_keywords (node_id);
        `);
        console.error('[sqlite] Added node_keywords table');
    }

    // Migrate: add prompt_gold_standards table if missing
    try {
        db.prepare('SELECT id FROM prompt_gold_standards LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS prompt_gold_standards (
                id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                prompt_id       TEXT NOT NULL,
                tier            INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 3),
                content         TEXT NOT NULL,
                test_input      TEXT NOT NULL,
                embedding       BLOB,
                model_used      TEXT,
                generated_at    TEXT DEFAULT (datetime('now')),
                UNIQUE(prompt_id, tier)
            );
            CREATE INDEX IF NOT EXISTS idx_gold_standards_prompt ON prompt_gold_standards (prompt_id);
        `);
        console.error('[sqlite] Added prompt_gold_standards table');
    }

    // Migrate: add dedup_gate_overrides table for per-source dedup thresholds
    try {
        db.prepare('SELECT source FROM dedup_gate_overrides LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS dedup_gate_overrides (
                source                  TEXT PRIMARY KEY,
                embedding_threshold     REAL,
                word_overlap_threshold  REAL,
                llm_judge_enabled       INTEGER,
                llm_judge_doubt_floor   REAL,
                llm_judge_hard_ceiling  REAL,
                updated_at              TEXT DEFAULT (datetime('now'))
            );
        `);
        console.error('[sqlite] Added dedup_gate_overrides table');
    }

    // Migrate: add locked column to prompt_gold_standards
    try {
        db.prepare('SELECT locked FROM prompt_gold_standards LIMIT 1').get();
    } catch {
        try {
            db.exec(`ALTER TABLE prompt_gold_standards ADD COLUMN locked INTEGER DEFAULT 0`);
            console.error('[sqlite] Added locked column to prompt_gold_standards');
        } catch { /* table may not exist yet — schema.sql handles it */ }
    }

    // =========================================================================
    // NODE LIFECYCLE — Phase 1
    // =========================================================================

    // Migrate: add lifecycle columns to nodes table
    try {
        db.prepare('SELECT lifecycle_state FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN lifecycle_state TEXT DEFAULT 'nascent'`);
        db.exec(`ALTER TABLE nodes ADD COLUMN born_at TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN activated_at TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN declining_since TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN composted_at TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN barren_cycles INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE nodes ADD COLUMN total_children INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE nodes ADD COLUMN generation INTEGER DEFAULT 0`);
        console.error('[sqlite] Added lifecycle columns to nodes table');

        // Backfill: existing nodes start as 'active' (they already exist in the graph)
        // Only new nodes created after this migration start as 'nascent'
        db.exec(`UPDATE nodes SET lifecycle_state = 'active', born_at = created_at WHERE lifecycle_state = 'nascent'`);
        console.error('[sqlite] Backfilled existing nodes as active with born_at = created_at');
    }

    // Migrate: add lifecycle index for sweep queries
    try {
        const exists = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_nodes_lifecycle'").get();
        if (!exists) {
            db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_lifecycle ON nodes (lifecycle_state, barren_cycles)`);
            console.error('[sqlite] Added lifecycle index on nodes');
        }
    } catch {
        db.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_lifecycle ON nodes (lifecycle_state, barren_cycles)`);
        console.error('[sqlite] Added lifecycle index on nodes');
    }

    // Migrate: add avatar_url column if missing
    try {
        db.prepare('SELECT avatar_url FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN avatar_url TEXT`);
        console.error('[sqlite] Added avatar_url column to nodes');
    }

    // Migrate: clear any external avatar URLs (not data URIs) → regenerated locally
    try {
        const ext = db.prepare(`SELECT COUNT(*) as count FROM nodes WHERE avatar_url IS NOT NULL AND avatar_url NOT LIKE 'data:%'`).get() as any;
        if (ext?.count > 0) {
            db.exec(`UPDATE nodes SET avatar_url = NULL WHERE avatar_url IS NOT NULL AND avatar_url NOT LIKE 'data:%'`);
            console.error(`[sqlite] Cleared ${ext.count} external avatar URLs — will regenerate locally as data URIs`);
        }
    } catch {}

    // Migrate: backfill total_children + lifecycle_state for answered question nodes.
    // The questions cycle was not calling recordBirth(), so questions that have voiced
    // answer children still show total_children=0 and lifecycle_state='nascent'.
    try {
        const stale = db.prepare(`
            SELECT q.id, COUNT(e.target_id) as child_count
            FROM nodes q
            JOIN edges e ON e.source_id = q.id AND e.edge_type = 'parent'
            JOIN nodes c ON c.id = e.target_id AND c.node_type = 'voiced' AND c.archived = 0
            WHERE q.node_type = 'question' AND q.archived = 0 AND q.total_children = 0
            GROUP BY q.id
        `).all() as any[];
        if (stale.length > 0) {
            const update = db.prepare(`
                UPDATE nodes SET total_children = $count, lifecycle_state = 'active',
                    activated_at = COALESCE(activated_at, datetime('now')), barren_cycles = 0
                WHERE id = $id
            `);
            for (const row of stale) {
                update.run({ id: row.id, count: row.child_count });
            }
            console.error(`[sqlite] Backfilled lifecycle for ${stale.length} answered question nodes`);
        }
    } catch (e: any) {
        console.error('[sqlite] Question lifecycle backfill skipped:', e.message);
    }

    // Migrate: add config_history table if missing
    try {
        db.prepare('SELECT id FROM config_history LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS config_history (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                config_path     TEXT NOT NULL,
                old_value       TEXT,
                new_value       TEXT NOT NULL,
                changed_by      TEXT NOT NULL,
                contributor     TEXT,
                reason          TEXT,
                section_id      TEXT,
                metrics_before  TEXT,
                snapshot_id     TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_config_history_path ON config_history (config_path);
            CREATE INDEX IF NOT EXISTS idx_config_history_time ON config_history (created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_config_history_contributor ON config_history (contributor);
        `);
        console.error('[sqlite] Added config_history table');
    }

    // Migrate: add config_snapshots table if missing
    try {
        db.prepare('SELECT id FROM config_snapshots LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS config_snapshots (
                id              TEXT PRIMARY KEY,
                label           TEXT NOT NULL,
                parameters      TEXT NOT NULL,
                metrics_at_save TEXT,
                created_by      TEXT,
                created_at      TEXT DEFAULT (datetime('now'))
            );
        `);
        console.error('[sqlite] Added config_snapshots table');
    }
}

/**
 * Run feature schema migrations (scaffold_jobs, node_keywords, validation
 * columns, tuning registry, elite pool tables, generation backfill,
 * composite indexes, activity log, model provenance, synthesizability).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runFeaturesSchemaMigrations(db: Database.Database): void {
    // Add synthesizable column to nodes — NULL = not yet classified, 1 = yes, 0 = no.
    // Nodes with synthesizable = 0 are skipped by the synthesis engine ground-rules gate.
    try {
        db.prepare('SELECT synthesizable FROM nodes LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE nodes ADD COLUMN synthesizable INTEGER DEFAULT NULL');
        console.error('[sqlite] Added synthesizable column to nodes');
    }
    // Add scaffold_jobs table if it doesn't exist
    const scaffoldJobsExist = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='scaffold_jobs'"
    ).get();

    if (!scaffoldJobsExist) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS scaffold_jobs (
                id              TEXT PRIMARY KEY,
                request         TEXT NOT NULL,
                task_type       TEXT NOT NULL,
                outline         TEXT NOT NULL,
                sections        TEXT NOT NULL DEFAULT '{}',
                status          TEXT NOT NULL DEFAULT 'in_progress',
                error           TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_scaffold_jobs_status ON scaffold_jobs (status);
        `);
        console.error('[sqlite] Added scaffold_jobs table');
    }

    // Migrate: add node_keywords table if missing
    try {
        db.prepare('SELECT node_id FROM node_keywords LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS node_keywords (
                node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                keyword     TEXT NOT NULL,
                source      TEXT NOT NULL DEFAULT 'llm',
                created_at  TEXT DEFAULT (datetime('now')),
                PRIMARY KEY (node_id, keyword)
            );
            CREATE INDEX IF NOT EXISTS idx_node_keywords_keyword ON node_keywords (keyword);
            CREATE INDEX IF NOT EXISTS idx_node_keywords_node ON node_keywords (node_id);
        `);
        console.error('[sqlite] Added node_keywords table');
    }

    // =========================================================================
    // VALIDATION — promotion score columns on nodes table
    // =========================================================================

    try {
        db.prepare('SELECT validation_synthesis FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN validation_synthesis REAL`);
        db.exec(`ALTER TABLE nodes ADD COLUMN validation_novelty REAL`);
        db.exec(`ALTER TABLE nodes ADD COLUMN validation_testability REAL`);
        db.exec(`ALTER TABLE nodes ADD COLUMN validation_tension_resolution REAL`);
        db.exec(`ALTER TABLE nodes ADD COLUMN validation_composite REAL`);
        db.exec(`ALTER TABLE nodes ADD COLUMN validation_reason TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN validated_at TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN validated_by TEXT`);
        console.error('[sqlite] Added validation columns to nodes table');
    }

    // =========================================================================
    // TUNING REGISTRY — per-model config preservation
    // =========================================================================
    const tuningRegistryExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='tuning_registry'"
    ).get();
    if (!tuningRegistryExists) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS tuning_registry (
                id              TEXT PRIMARY KEY,
                model_id        TEXT NOT NULL,
                model_name      TEXT NOT NULL,
                model_provider  TEXT NOT NULL,
                parameters      TEXT NOT NULL,
                metrics_at_save TEXT,
                tuning_changes  INTEGER DEFAULT 0,
                subsystems      TEXT,
                created_at      TEXT DEFAULT (datetime('now')),
                updated_at      TEXT DEFAULT (datetime('now')),
                UNIQUE(model_id)
            );
            CREATE INDEX IF NOT EXISTS idx_tuning_registry_model ON tuning_registry (model_id);
        `);
        console.error('[sqlite] Added tuning_registry table');
    }

    // =========================================================================
    // ELITE VERIFICATION POOL — tables + generation backfill
    // =========================================================================
    // Migrate: add elite_nodes metadata table
    try {
        db.prepare('SELECT node_id FROM elite_nodes LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS elite_nodes (
                node_id                 TEXT PRIMARY KEY,
                source_verification_id  TEXT,
                promoted_at             TEXT DEFAULT (datetime('now')),
                confidence              REAL,
                verification_type       TEXT,
                provenance_chain        TEXT
            );
        `);
        console.error('[sqlite] Added elite_nodes table');
    }

    // Migrate: add elite_manifest_mappings table
    try {
        db.prepare('SELECT id FROM elite_manifest_mappings LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS elite_manifest_mappings (
                id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                node_id              TEXT NOT NULL,
                manifest_target_type TEXT NOT NULL,
                manifest_target_text TEXT NOT NULL,
                relevance_score      REAL,
                mapped_at            TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_elite_manifest_node ON elite_manifest_mappings (node_id);
            CREATE INDEX IF NOT EXISTS idx_elite_manifest_target ON elite_manifest_mappings (manifest_target_type);
        `);
        console.error('[sqlite] Added elite_manifest_mappings table');
    }

    // Migrate: add elite_verified_variables table
    try {
        db.prepare('SELECT id FROM elite_verified_variables LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS elite_verified_variables (
                id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                var_id                  TEXT NOT NULL,
                elite_node_id           TEXT NOT NULL,
                verification_confidence REAL,
                verified_value          TEXT,
                verified_at             TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_elite_verified_vars_node ON elite_verified_variables (elite_node_id);
            CREATE INDEX IF NOT EXISTS idx_elite_verified_vars_var ON elite_verified_variables (var_id);
        `);
        console.error('[sqlite] Added elite_verified_variables table');
    }

    // Migrate: add elite_bridging_log table
    try {
        db.prepare('SELECT id FROM elite_bridging_log LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS elite_bridging_log (
                id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
                parent_a_id       TEXT NOT NULL,
                parent_b_id       TEXT NOT NULL,
                synthesis_node_id TEXT,
                outcome           TEXT,
                attempted_at      TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_elite_bridging_time ON elite_bridging_log (attempted_at DESC);
            CREATE INDEX IF NOT EXISTS idx_elite_bridging_parents ON elite_bridging_log (parent_a_id, parent_b_id);
        `);
        console.error('[sqlite] Added elite_bridging_log table');
    }

    // Migrate: backfill node generation numbers from parent-chain depth (one-time)
    try {
        const genMigration = db.prepare(
            "SELECT value FROM settings WHERE key = '_migration_elite_gen_backfill'"
        ).get();
        if (!genMigration) {
            // BFS backfill: roots get gen 0, children get max(parent gens) + 1
            const allNodes = db.prepare(`
                SELECT n.id,
                       GROUP_CONCAT(e.source_id) as parent_ids
                FROM nodes n
                LEFT JOIN edges e ON e.target_id = n.id AND e.edge_type = 'parent'
                WHERE n.archived = FALSE
                GROUP BY n.id
            `).all() as any[];

            const parentMap = new Map<string, string[]>();
            const childMap = new Map<string, string[]>();
            const roots: string[] = [];

            for (const row of allNodes) {
                const parents: string[] = row.parent_ids ? row.parent_ids.split(',') : [];
                parentMap.set(row.id, parents);
                if (parents.length === 0) {
                    roots.push(row.id);
                }
                for (const p of parents) {
                    const children = childMap.get(p) || [];
                    children.push(row.id);
                    childMap.set(p, children);
                }
            }

            const generationMap = new Map<string, number>();
            for (const r of roots) generationMap.set(r, 0);

            const updateStmt = db.prepare('UPDATE nodes SET generation = ? WHERE id = ?');

            const backfill = db.transaction(() => {
                // Set roots to generation 0
                for (const r of roots) {
                    updateStmt.run(0, r);
                }

                let wave = [...roots];
                let updated = 0;
                let safetyCounter = 0;

                while (wave.length > 0 && safetyCounter < 100) {
                    const nextWave: string[] = [];
                    for (const nodeId of wave) {
                        const children = childMap.get(nodeId) || [];
                        for (const child of children) {
                            if (generationMap.has(child)) continue;
                            const parents = parentMap.get(child) || [];
                            const allParentsProcessed = parents.every(p => generationMap.has(p));
                            if (allParentsProcessed) {
                                const maxParentGen = Math.max(...parents.map(p => generationMap.get(p) || 0));
                                const childGen = maxParentGen + 1;
                                generationMap.set(child, childGen);
                                updateStmt.run(childGen, child);
                                updated++;
                                nextWave.push(child);
                            }
                        }
                    }
                    wave = nextWave;
                    safetyCounter++;
                }

                return updated;
            });

            const count = backfill();
            db.prepare(
                "INSERT INTO settings (key, value) VALUES ('_migration_elite_gen_backfill', 'done')"
            ).run();
            if (count > 0) {
                console.error(`[sqlite] Backfilled generation numbers for ${count} nodes`);
            }
        }
    } catch (e: any) {
        console.error(`[sqlite] Generation backfill failed (non-critical): ${e.message}`);
    }

    // =========================================================================
    // COMPOSITE INDEXES — covering indexes for hot query patterns
    // =========================================================================

    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_nodes_domain_type_weight ON nodes (domain, node_type, weight DESC) WHERE archived = 0;
        CREATE INDEX IF NOT EXISTS idx_nodes_type_weight ON nodes (node_type, weight DESC) WHERE archived = 0;
        CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes (created_at DESC) WHERE archived = 0;
        CREATE INDEX IF NOT EXISTS idx_nodes_junk_created ON nodes (created_at DESC) WHERE junk = 1;
        CREATE INDEX IF NOT EXISTS idx_nodes_domain_created ON nodes (domain, created_at DESC) WHERE archived = 0;
        CREATE INDEX IF NOT EXISTS idx_elite_nodes_gen ON nodes (generation, node_type) WHERE node_type = 'elite_verification' AND archived = 0;
        CREATE INDEX IF NOT EXISTS idx_lab_node_created ON lab_executions (node_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_nodes_verif_status ON nodes (verification_status, archived) WHERE verification_status IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_dream_cycles_domain_completed ON dream_cycles (domain, completed_at DESC) WHERE domain IS NOT NULL;
    `);

    // Migrate: add elite_considered column to nodes
    try {
        db.prepare('SELECT elite_considered FROM nodes LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE nodes ADD COLUMN elite_considered INTEGER DEFAULT 0');
        console.error('[sqlite] Added elite_considered column to nodes');
    }

    // Add activity_log table for persistent event history
    const activityLogExists = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='activity_log'"
    ).get();

    if (!activityLogExists) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                type TEXT NOT NULL,
                message TEXT NOT NULL,
                detail TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_activity_log_cat_time ON activity_log(category, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type, created_at DESC);
        `);
        console.error('[sqlite] Added activity_log table');
    }

    // ── Model provenance on nodes ──────────────────────────────────────
    try { db.exec('SELECT model_id FROM nodes LIMIT 0'); } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN model_id TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN model_name TEXT`);
        console.error('[sqlite] Added model_id, model_name columns to nodes');
    }

    // =========================================================================
    // PROJECT ASSIGNMENTS — per-project subsystem assignment overrides
    // =========================================================================
    // Overrides the system-level subsystem_assignments in system.db.
    // Only rows that differ from the baseline exist here; missing rows fall back
    // to the system default. Lookup: project_assignments → subsystem_assignments.
    try {
        db.prepare('SELECT subsystem FROM project_assignments LIMIT 1').get();
    } catch {
        db.exec(`
            CREATE TABLE IF NOT EXISTS project_assignments (
                subsystem           TEXT PRIMARY KEY,
                model_id            TEXT,
                thinking_level      TEXT DEFAULT NULL,
                consultant_model_id TEXT,
                updated_at          TEXT DEFAULT (datetime('now'))
            );
        `);
        console.error('[sqlite] Created project_assignments table');
    }

    // Migrate: add cull_evaluated_at column for population control cycle
    try {
        db.prepare('SELECT cull_evaluated_at FROM nodes LIMIT 1').get();
    } catch {
        db.exec('ALTER TABLE nodes ADD COLUMN cull_evaluated_at TEXT');
        db.exec('CREATE INDEX IF NOT EXISTS idx_nodes_cull_eval ON nodes (cull_evaluated_at) WHERE cull_evaluated_at IS NULL');
        console.error('[sqlite] Added cull_evaluated_at column to nodes');
    }

    // ── Node name column ──────────────────────────────────────────────
    try { db.exec('SELECT name FROM nodes LIMIT 0'); } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN name TEXT`);
        console.error('[sqlite] Added name column to nodes');
    }

    // Migrate: normalize specificity to per-word density
    // Previously specificity was an unbounded sum (typically 5-15+); now it's divided
    // by word count to produce a bounded 0-1 density score. Recalculate for all nodes
    // so old and new values are on the same scale.
    try {
        const marker = db.prepare(`SELECT value FROM settings WHERE key = '_migration_specificity_normalized'`).get() as any;
        if (!marker) {
            // Approximate word count via SQL: count spaces + 1
            // LENGTH(content) - LENGTH(REPLACE(content, ' ', '')) counts spaces
            const result = db.prepare(`
                UPDATE nodes SET specificity = CASE
                    WHEN LENGTH(content) > 0
                    THEN specificity / MAX(1.0, LENGTH(content) - LENGTH(REPLACE(content, ' ', '')) + 1.0)
                    ELSE 0
                END
                WHERE specificity > 0
            `).run();
            db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('_migration_specificity_normalized', '1')`).run();
            console.error(`[sqlite] Normalized specificity to per-word density for ${result.changes} nodes`);
        }
    } catch (e: any) {
        console.error('[sqlite] Specificity normalization migration skipped:', e.message);
    }
}
