/**
 * Model system initialization -- called once at startup.
 *
 * Loads API keys, auto-imports environment variable models into the registry,
 * and auto-re-embeds nodes when the embedding model changes.
 * @module models/startup
 */
import { query, queryOne } from '../db.js';
import { loadApiKeys } from './api-keys.js';
import { autoImportToRegistry } from './registry.js';
import { getEmbeddingModelName, getEmbedding } from './embedding.js';
import { l2Normalize, embeddingToBuffer } from '../core/scoring.js';
import { emitActivity } from '../services/event-bus.js';

/**
 * Initialize the model system: load API keys, auto-import registry, and check embedding model.
 * Must be called before any LLM calls are made. Order matters: API keys must be loaded
 * before registry import so the correct provider can be determined.
 */
export async function loadSavedModels(): Promise<void> {
    // Load API keys from settings table (with env var fallback)
    await loadApiKeys();

    // Auto-import env-var models into registry if empty, then sync
    // (must happen before embedding check so assignment cache is loaded)
    await autoImportToRegistry();

    // Auto-re-embed if embedding model changed
    autoReEmbed().catch(err => {
        console.error(`[models] Auto re-embed failed: ${err.message}`);
    });
}

/**
 * Detect embedding model mismatch and automatically re-embed stale nodes in the background.
 * Runs at startup — non-blocking, non-fatal.
 */
async function autoReEmbed(): Promise<void> {
    try {
        const currentModel = getEmbeddingModelName();
        if (!currentModel) return;

        // Count stale nodes (wrong model or no provenance)
        const stale = await queryOne(
            `SELECT COUNT(*) as count FROM nodes
             WHERE archived = 0 AND embedding IS NOT NULL
             AND (embedding_model IS NULL OR embedding_model != $1)`,
            [currentModel]
        );

        if (!stale || stale.count === 0) return;

        console.warn(`\n⚠  EMBEDDING MODEL CHANGED — auto re-embedding ${stale.count} nodes`);
        console.warn(`   Current model: ${currentModel}`);
        emitActivity('system', 'reembed_start', `Auto re-embedding ${stale.count} nodes for model ${currentModel}`, { count: stale.count, model: currentModel });

        let processed = 0;
        let errors = 0;
        let lastId: string | null = null;
        const batchSize = 20;

        while (true) {
            const batchQuery = `
                SELECT id, content FROM nodes
                WHERE archived = 0 AND embedding IS NOT NULL
                AND (embedding_model IS NULL OR embedding_model != $1)
                ${lastId ? 'AND id > $2' : ''}
                ORDER BY id ASC LIMIT $${lastId ? 3 : 2}
            `;
            const params: any[] = [currentModel];
            if (lastId) params.push(lastId);
            params.push(batchSize);

            const batch = await query(batchQuery, params) as any[];
            if (batch.length === 0) break;

            for (const node of batch) {
                try {
                    const embedding = await getEmbedding(node.content);
                    if (!embedding) { errors++; lastId = node.id; continue; }

                    const normalized = l2Normalize(embedding);
                    const binary = embeddingToBuffer(normalized);

                    await query(
                        `UPDATE nodes SET embedding = $2, embedding_bin = $3, embedding_model = $4, embedding_dims = $5, updated_at = datetime('now') WHERE id = $1`,
                        [node.id, JSON.stringify(embedding), binary, currentModel, embedding.length]
                    );

                    processed++;
                    lastId = node.id;
                } catch (err: any) {
                    errors++;
                    lastId = node.id;
                }
            }

            if (processed % 50 === 0 && processed > 0) {
                console.log(`  [re-embed] ${processed}/${stale.count} done (${errors} errors)`);
            }

            // Don't hammer the embedding service
            await new Promise(r => setTimeout(r, 100));
        }

        console.log(`  ✓ Re-embed complete: ${processed} updated, ${errors} errors`);
        emitActivity('system', 'reembed_complete', `Re-embedded ${processed} nodes (${errors} errors)`, { processed, errors, model: currentModel });
    } catch {
        // Non-critical — columns may not exist yet
    }
}
