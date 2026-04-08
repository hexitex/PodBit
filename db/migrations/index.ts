/**
 * Migration orchestrator for the project database.
 *
 * Organizes migrations into two phases:
 * - **Init migrations** (`runInitMigrations`): run every time the DB is opened.
 *   These add columns, rename values, create tables that the application requires
 *   immediately. Each module is idempotent (checks before altering).
 * - **Schema migrations** (`runSchemaMigrations`): run after init migrations.
 *   These create governance/partition tables, composite indexes, elite pool tables,
 *   and other structures that depend on the init phase completing first.
 *
 * Both functions are called from `openDatabase()` in `sqlite-backend.ts`.
 *
 * @module db/migrations/index
 */

import type Database from 'better-sqlite3';

import { runCoreMigrations } from './core.js';
import { runEmbeddingsMigrations } from './embeddings.js';
import { runModelsMigrations } from './models.js';
import { runGovernanceInitMigrations, runGovernanceSchemaMigrations } from './governance.js';
import { runEvmInitMigrations, runEvmSchemaMigrations } from './evm.js';
import { runContextInitMigrations, runContextSchemaMigrations } from './context.js';
import { runKbMigrations } from './kb.js';
import { runFeaturesInitMigrations, runFeaturesSchemaMigrations } from './features.js';
import { runProvenanceInitMigrations, runProvenanceSchemaMigrations } from './provenance.js';
import { runApiVerificationInitMigrations, runApiVerificationSchemaMigrations } from './api-verification.js';
import { runEmbeddingEvalInitMigrations } from './embedding-eval.js';
import { runLabInitMigrations, runLabSchemaMigrations } from './lab.js';
import { runJournalInitMigrations, runJournalSchemaMigrations } from './journal.js';

// =============================================================================
// INIT MIGRATIONS — run every time the DB is opened
// =============================================================================

/**
 * Run all init-phase migrations against the project database.
 *
 * Each sub-module is idempotent: it checks whether its columns/tables already
 * exist before altering the schema. Order matters where there are dependencies
 * (e.g. core before embeddings, models before features).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runInitMigrations(db: Database.Database): void {
    runCoreMigrations(db);
    runEmbeddingsMigrations(db);
    runModelsMigrations(db);
    runGovernanceInitMigrations(db);
    runEvmInitMigrations(db);
    runContextInitMigrations(db);
    runKbMigrations(db);
    runFeaturesInitMigrations(db);
    runProvenanceInitMigrations(db);
    runApiVerificationInitMigrations(db);
    runEmbeddingEvalInitMigrations(db);
    runLabInitMigrations(db);
    runJournalInitMigrations(db);
}

// =============================================================================
// SCHEMA MIGRATIONS — called from migrate() for partition/decision tables
// =============================================================================

/**
 * Run all schema-phase migrations against the project database.
 *
 * These create tables and indexes that depend on the init phase completing
 * (e.g. partition tables, decision audit trail, composite covering indexes,
 * elite pool tables, integrity log).
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runSchemaMigrations(db: Database.Database): void {
    runGovernanceSchemaMigrations(db);
    runContextSchemaMigrations(db);
    runFeaturesSchemaMigrations(db);
    runProvenanceSchemaMigrations(db);
    runEvmSchemaMigrations(db);
    runApiVerificationSchemaMigrations(db);
    runLabSchemaMigrations(db);
    runJournalSchemaMigrations(db);
}
