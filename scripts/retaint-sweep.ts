#!/usr/bin/env npx tsx
/**
 * Retroactive taint sweep.
 *
 * Re-applies the current taint-similarity threshold against every node that
 * already carries lab_status='tainted'. Descendants whose embedding cosine
 * similarity with their taint source falls below config.lab.taintSimilarityThreshold
 * are released — they were tainted under the old, blanket BFS rules and would
 * not be tainted under the new content-aware rules.
 *
 * Usage:
 *   npx tsx scripts/retaint-sweep.ts                 # dry-run, prints what would clear
 *   npx tsx scripts/retaint-sweep.ts --apply         # actually clear taint
 *   npx tsx scripts/retaint-sweep.ts --apply --threshold 0.90   # override threshold
 *
 * Only touches the currently active project database (as determined by
 * projects.json + resolveProjectDbPath).
 */

import { query, queryOne } from '../db/sqlite-backend.js';
import { getNodeEmbedding } from '../vector/embedding-cache.js';
import { cosineSimilarity } from '../core/scoring.js';
import { config as appConfig } from '../config.js';

interface TaintedRow {
    id: string;
    domain: string | null;
    weight: number;
    lab_taint_source_id: string | null;
    lab_tainted_at: string | null;
    node_type: string;
}

async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const thresholdIdx = args.indexOf('--threshold');
    const thresholdOverride = thresholdIdx >= 0 ? parseFloat(args[thresholdIdx + 1]) : NaN;

    const threshold = Number.isFinite(thresholdOverride)
        ? thresholdOverride
        : (appConfig.lab?.taintSimilarityThreshold ?? 0.85);

    console.log(`=== Retroactive Taint Sweep ===`);
    console.log(`Mode:       ${apply ? 'APPLY (will clear taint)' : 'DRY-RUN (no changes)'}`);
    console.log(`Threshold:  ${threshold.toFixed(3)} (cosine similarity)`);
    console.log('');

    const tainted = (await query(`
        SELECT id, domain, weight, lab_taint_source_id, lab_tainted_at, node_type
        FROM nodes
        WHERE lab_status = 'tainted'
          AND archived = 0
    `)) as TaintedRow[];

    console.log(`Found ${tainted.length} tainted node(s) to evaluate.`);
    if (tainted.length === 0) { console.log('Nothing to do.'); return; }

    // Cache source embeddings (same source can taint many descendants)
    const sourceEmbeddings = new Map<string, number[] | null>();

    let clearedCount = 0;
    let keptCount = 0;
    let sourceMissingCount = 0;
    let childMissingCount = 0;
    let orphanSourceCount = 0;

    const perSourceCleared = new Map<string, number>();
    const perSourceKept = new Map<string, number>();
    const toClear: string[] = [];

    for (const row of tainted) {
        const srcId = row.lab_taint_source_id;
        if (!srcId) {
            orphanSourceCount++;
            toClear.push(row.id); // orphaned taint — nothing to compare against, release it
            continue;
        }

        let srcEmb = sourceEmbeddings.get(srcId);
        if (srcEmb === undefined) {
            srcEmb = await getNodeEmbedding(srcId);
            sourceEmbeddings.set(srcId, srcEmb);
        }

        if (!srcEmb) {
            sourceMissingCount++;
            // No source embedding — can't judge relatedness, keep taint to be safe
            keptCount++;
            perSourceKept.set(srcId, (perSourceKept.get(srcId) ?? 0) + 1);
            continue;
        }

        const childEmb = await getNodeEmbedding(row.id);
        if (!childEmb) {
            childMissingCount++;
            // No child embedding — can't judge, keep taint
            keptCount++;
            perSourceKept.set(srcId, (perSourceKept.get(srcId) ?? 0) + 1);
            continue;
        }

        const sim = cosineSimilarity(srcEmb, childEmb);
        if (sim < threshold) {
            clearedCount++;
            perSourceCleared.set(srcId, (perSourceCleared.get(srcId) ?? 0) + 1);
            toClear.push(row.id);
        } else {
            keptCount++;
            perSourceKept.set(srcId, (perSourceKept.get(srcId) ?? 0) + 1);
        }
    }

    console.log('');
    console.log(`Would clear:      ${clearedCount} node(s) (similarity below ${threshold.toFixed(2)})`);
    console.log(`Would keep:       ${keptCount} node(s) (similarity at/above threshold)`);
    console.log(`Orphaned taint:   ${orphanSourceCount} (no source id — will clear)`);
    console.log(`Source emb miss:  ${sourceMissingCount}`);
    console.log(`Child emb miss:   ${childMissingCount}`);
    console.log('');

    // Per-source breakdown (top 10 by impact)
    const allSources = new Set([...perSourceCleared.keys(), ...perSourceKept.keys()]);
    const breakdown = [...allSources].map(sid => ({
        sourceId: sid,
        cleared: perSourceCleared.get(sid) ?? 0,
        kept: perSourceKept.get(sid) ?? 0,
        total: (perSourceCleared.get(sid) ?? 0) + (perSourceKept.get(sid) ?? 0),
    })).sort((a, b) => b.total - a.total).slice(0, 10);

    if (breakdown.length > 0) {
        console.log('Top taint sources (by descendant count):');
        for (const b of breakdown) {
            const src = (await queryOne(
                'SELECT substr(content, 1, 80) as preview, domain, verification_status FROM nodes WHERE id = $1',
                [b.sourceId],
            )) as { preview: string; domain: string; verification_status: string } | null;
            const srcLabel = src ? `${b.sourceId.slice(0, 8)} [${src.domain ?? '?'}] ${src.verification_status ?? 'n/a'} :: ${src.preview?.replace(/\s+/g, ' ')}` : b.sourceId.slice(0, 8);
            console.log(`  ${b.total.toString().padStart(4)} total, ${b.cleared.toString().padStart(4)} clear, ${b.kept.toString().padStart(4)} keep  —  ${srcLabel}`);
        }
        console.log('');
    }

    if (!apply) {
        console.log('Dry-run only. Re-run with --apply to clear taint.');
        return;
    }

    if (toClear.length === 0) {
        console.log('Nothing to clear.');
        return;
    }

    // Apply in chunks to keep SQL parameter count sane
    const CHUNK = 200;
    let applied = 0;
    for (let i = 0; i < toClear.length; i += CHUNK) {
        const batch = toClear.slice(i, i + CHUNK);
        const placeholders = batch.map((_, j) => `$${j + 1}`).join(', ');
        await query(
            `UPDATE nodes
             SET lab_status = NULL, lab_taint_source_id = NULL, lab_tainted_at = NULL
             WHERE id IN (${placeholders}) AND lab_status = 'tainted'`,
            batch,
        );
        applied += batch.length;
    }

    console.log(`Cleared taint on ${applied} node(s).`);
}

main().catch(err => {
    console.error('Sweep failed:', err);
    process.exit(1);
});
