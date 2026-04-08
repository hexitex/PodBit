/**
 * Embedding storage migrations.
 *
 * Adds `embedding_bin` (BLOB) for binary Float32Array storage and backfills
 * from the legacy JSON `embedding` column with L2-normalization. Also adds
 * `embedding_model` and `embedding_dims` provenance columns with backfill.
 *
 * @module db/migrations/embeddings
 */

import type Database from 'better-sqlite3';

/**
 * Run embedding migrations: binary column + model provenance columns.
 *
 * Adds `embedding_bin` (BLOB) and backfills existing JSON embeddings by parsing them,
 * L2-normalizing the vectors, and converting to `Float32Array` binary buffers. Also adds
 * `embedding_model` and `embedding_dims` provenance columns with dimension backfill.
 *
 * @param db - The open better-sqlite3 project database connection.
 */
export function runEmbeddingsMigrations(db: Database.Database): void {
    // Migrate: add embedding_bin column for binary embeddings
    try {
        db.prepare('SELECT embedding_bin FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN embedding_bin BLOB`);
        console.error('[sqlite] Added embedding_bin column to nodes');

        // Backfill: convert existing JSON embeddings to normalized binary
        const rows = db.prepare(
            "SELECT id, embedding FROM nodes WHERE embedding IS NOT NULL AND embedding_bin IS NULL"
        ).all() as any[];

        if (rows.length > 0) {
            const update = db.prepare("UPDATE nodes SET embedding_bin = ? WHERE id = ?");
            const backfill = db.transaction(() => {
                let count = 0;
                for (const row of rows) {
                    try {
                        const emb: number[] = JSON.parse(row.embedding);
                        // L2-normalize
                        let norm = 0;
                        for (let i = 0; i < emb.length; i++) norm += emb[i] * emb[i];
                        norm = Math.sqrt(norm);
                        if (norm > 0) {
                            for (let i = 0; i < emb.length; i++) emb[i] /= norm;
                        }
                        // Convert to Float32Array buffer
                        const f32 = new Float32Array(emb);
                        const buf = Buffer.from(f32.buffer);
                        update.run(buf, row.id);
                        count++;
                    } catch {
                        // Skip malformed embeddings
                    }
                }
                return count;
            });
            const migrated = backfill();
            console.error(`[sqlite] Backfilled ${migrated} embeddings to binary format`);
        }
    }

    // Migrate: add embedding provenance columns (embedding_model, embedding_dims)
    try {
        db.prepare('SELECT embedding_model FROM nodes LIMIT 1').get();
    } catch {
        db.exec(`ALTER TABLE nodes ADD COLUMN embedding_model TEXT`);
        db.exec(`ALTER TABLE nodes ADD COLUMN embedding_dims INTEGER`);
        console.error('[sqlite] Added embedding_model and embedding_dims columns to nodes');

        // Backfill: set dims from existing embeddings
        const rows = db.prepare(
            "SELECT id, embedding FROM nodes WHERE embedding IS NOT NULL AND embedding_dims IS NULL"
        ).all() as any[];

        if (rows.length > 0) {
            const update = db.prepare("UPDATE nodes SET embedding_dims = ? WHERE id = ?");
            const backfill = db.transaction(() => {
                let count = 0;
                for (const row of rows) {
                    try {
                        const emb: number[] = JSON.parse(row.embedding);
                        update.run(emb.length, row.id);
                        count++;
                    } catch {
                        // Skip malformed embeddings
                    }
                }
                return count;
            });
            const migrated = backfill();
            console.error(`[sqlite] Backfilled ${migrated} embedding dimensions`);
        }
    }
}
