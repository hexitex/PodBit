/**
 * Re-Embedding CLI Tool
 *
 * Reads all nodes where embedding_model differs from the current config (or is NULL),
 * re-embeds them in batches, and updates both JSON and binary columns.
 *
 * Usage:
 *   npx tsx tools/re-embed.ts [--domain <domain>] [--batch-size 50] [--dry-run]
 *
 * Supports resume: tracks progress via the last processed node ID.
 * Safe to interrupt and restart — already-updated nodes are skipped.
 */

import { query, queryOne } from '../db.js';
import { getEmbedding, getEmbeddingModelName, getSubsystemAssignments } from '../models.js';
import { l2Normalize, embeddingToBuffer } from '../core/scoring.js';

// Parse CLI args
const args = process.argv.slice(2);

/**
 * Retrieve a named CLI argument value (e.g. `--domain foo` returns "foo").
 * @param name - Argument name without the leading "--"
 * @returns The argument value, or null if not present
 */
function getArg(name: string): string | null {
    const idx = args.indexOf(`--${name}`);
    return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}
const dryRun = args.includes('--dry-run');
const domain = getArg('domain');
const batchSize = parseInt(getArg('batch-size') || '50', 10);

async function main() {
    // Load subsystem assignments so getEmbeddingModelName() resolves correctly
    await getSubsystemAssignments();
    const currentModel = getEmbeddingModelName();

    if (!currentModel) {
        console.error('No embedding model assigned. Assign one to the "embedding" subsystem on the Models page.');
        process.exit(1);
    }

    console.log(`Re-embedding tool`);
    console.log(`  Current model: ${currentModel}`);
    console.log(`  Domain filter: ${domain || 'all'}`);
    console.log(`  Batch size: ${batchSize}`);
    console.log(`  Dry run: ${dryRun}`);
    console.log('');

    // Count nodes that need re-embedding
    const countQuery = `
        SELECT COUNT(*) as count FROM nodes
        WHERE archived = 0
          AND (embedding_model IS NULL OR embedding_model != $1)
          AND embedding IS NOT NULL
          ${domain ? 'AND domain = $2' : ''}
    `;
    const countParams = domain ? [currentModel, domain] : [currentModel];
    const countResult = await queryOne(countQuery, countParams);
    const totalToProcess = countResult?.count || 0;

    if (totalToProcess === 0) {
        console.log('All embeddings are up to date. Nothing to do.');
        process.exit(0);
    }

    console.log(`Found ${totalToProcess} nodes to re-embed.`);
    if (dryRun) {
        console.log('Dry run mode — no changes will be made.');
        process.exit(0);
    }

    let processed = 0;
    let errors = 0;
    let lastId: string | null = null;

    while (processed < totalToProcess) {
        // Fetch batch of stale nodes (ordered by ID for deterministic resume)
        const batchQuery = `
            SELECT id, content FROM nodes
            WHERE archived = 0
              AND (embedding_model IS NULL OR embedding_model != $1)
              AND embedding IS NOT NULL
              ${domain ? 'AND domain = $2' : ''}
              ${lastId ? `AND id > $${domain ? 3 : 2}` : ''}
            ORDER BY id ASC
            LIMIT $${domain ? (lastId ? 4 : 3) : (lastId ? 3 : 2)}
        `;
        const batchParams: any[] = [currentModel];
        if (domain) batchParams.push(domain);
        if (lastId) batchParams.push(lastId);
        batchParams.push(batchSize);

        const batch = await query(batchQuery, batchParams);
        if (batch.length === 0) break;

        for (const node of batch) {
            try {
                const embedding = await getEmbedding(node.content);
                if (!embedding) {
                    console.warn(`  [skip] ${node.id} — embedding service returned null`);
                    errors++;
                    continue;
                }

                const normalized = l2Normalize(embedding);
                const binary = embeddingToBuffer(normalized);

                await query(
                    `UPDATE nodes SET
                        embedding = $2,
                        embedding_bin = $3,
                        embedding_model = $4,
                        embedding_dims = $5,
                        updated_at = datetime('now')
                     WHERE id = $1`,
                    [node.id, JSON.stringify(embedding), binary, currentModel, embedding.length]
                );

                processed++;
                lastId = node.id;

                if (processed % 10 === 0) {
                    const pct = ((processed / totalToProcess) * 100).toFixed(1);
                    console.log(`  [${pct}%] ${processed}/${totalToProcess} re-embedded (${errors} errors)`);
                }
            } catch (err: any) {
                console.error(`  [error] ${node.id}: ${err.message}`);
                errors++;
                lastId = node.id; // Skip past this node on resume
            }
        }

        // Small delay between batches to avoid hammering the embedding service
        await new Promise(r => setTimeout(r, 200));
    }

    console.log('');
    console.log(`Done. Processed: ${processed}, Errors: ${errors}`);

    if (errors > 0) {
        console.log(`Re-run the tool to retry failed nodes.`);
    }

    process.exit(errors > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
