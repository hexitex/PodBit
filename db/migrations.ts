/**
 * Barrel re-export for database migrations.
 *
 * Delegates to `./migrations/index.js` which orchestrates all init and schema
 * migration modules (core, embeddings, models, governance, evm, context, kb,
 * features, provenance, api-verification).
 *
 * @module db/migrations
 */
export * from './migrations/index.js';
