#!/usr/bin/env npx tsx
/**
 * Retroactive content-spec extraction.
 *
 * Walks existing synthesis and research-seeded nodes and runs the content
 * spec extractor against each, writing the result into node.metadata.
 * Nodes that already have a valid content_spec are skipped. Degenerate-spec
 * nodes are recorded but NOT rejected — archiving old output is too
 * destructive for a backfill; the user can decide per-node.
 *
 * Only touches the currently active project database.
 *
 * Usage:
 *   npx tsx scripts/content-spec-backfill.ts                        # dry-run
 *   npx tsx scripts/content-spec-backfill.ts --apply                # write metadata
 *   npx tsx scripts/content-spec-backfill.ts --apply --limit 50     # bounded run
 *   npx tsx scripts/content-spec-backfill.ts --apply --type synthesis  # synthesis-only
 *   npx tsx scripts/content-spec-backfill.ts --apply --type seed       # research seeds only
 *
 * The --limit flag is inclusive and orders nodes by weight DESC so the
 * most load-bearing nodes get specced first.
 */

import { query, queryOne } from '../db/sqlite-backend.js';
import {
    extractContentSpecFromSynthesis,
    extractContentSpecFromResearch,
    readContentSpecFromMetadata,
} from '../core/content-spec.js';
import { config as appConfig } from '../config.js';

interface NodeRow {
    id: string;
    content: string;
    domain: string | null;
    node_type: string;
    weight: number;
    contributor: string | null;
    metadata: string | null;
}

interface ParentRow {
    content: string;
}

async function main() {
    const args = process.argv.slice(2);
    const apply = args.includes('--apply');
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : -1;
    const typeIdx = args.indexOf('--type');
    const typeFilter = typeIdx >= 0 ? args[typeIdx + 1] : 'all'; // all | synthesis | seed

    if (!appConfig.contentSpec?.enabled) {
        console.warn('WARNING: config.contentSpec.enabled = false. The backfill extractor will run anyway; it only consults the config for minValidFields.');
    }

    console.log('=== Content Spec Backfill ===');
    console.log(`Mode:          ${apply ? 'APPLY (will write metadata)' : 'DRY-RUN (no writes)'}`);
    console.log(`Scope:         ${typeFilter}`);
    console.log(`Limit:         ${limit > 0 ? limit : 'no limit'}`);
    console.log(`Min valid:     ${appConfig.contentSpec?.minValidFields ?? 3} of 4 fields`);
    console.log('');

    const typePredicate = typeFilter === 'synthesis'
        ? "n.node_type IN ('synthesis', 'voiced', 'breakthrough')"
        : typeFilter === 'seed'
        ? "n.node_type = 'seed'"
        : "n.node_type IN ('synthesis', 'voiced', 'breakthrough', 'seed')";

    const limitClause = limit > 0 ? `LIMIT ${limit}` : '';

    const candidates = await query(`
        SELECT n.id, n.content, n.domain, n.node_type, n.weight, n.contributor, n.metadata
        FROM nodes n
        WHERE n.archived = 0
          AND ${typePredicate}
        ORDER BY n.weight DESC
        ${limitClause}
    `) as NodeRow[];

    console.log(`Candidates:    ${candidates.length}`);

    let alreadySpecced = 0;
    let extracted = 0;
    let wouldWrite = 0;
    let wouldReject = 0;
    let extractionFail = 0;
    let written = 0;
    const byType = new Map<string, { total: number; valid: number; degenerate: number }>();

    for (let i = 0; i < candidates.length; i++) {
        const node = candidates[i];
        const existing = readContentSpecFromMetadata(node.metadata);
        if (existing) {
            alreadySpecced++;
            continue;
        }

        // Progress log every 25 nodes
        if ((i + 1) % 25 === 0) {
            console.log(`  [${i + 1}/${candidates.length}] specced=${extracted}, reject=${wouldReject}, skip=${alreadySpecced}, fail=${extractionFail}`);
        }

        // Fetch parents for synthesis-type nodes; seeds don't need parent context
        let parentContents: string[] = [];
        if (node.node_type !== 'seed') {
            const parents = await query(
                `SELECT n.content FROM edges e JOIN nodes n ON n.id = e.source_id
                 WHERE e.target_id = $1 AND e.edge_type = 'parent'
                 ORDER BY e.created_at`,
                [node.id],
            ) as ParentRow[];
            parentContents = parents.map(p => p.content);
        }

        const spec = node.node_type === 'seed'
            ? await extractContentSpecFromResearch(node.content, node.domain ?? 'unknown')
            : await extractContentSpecFromSynthesis(node.content, parentContents);

        if (!spec) {
            extractionFail++;
            continue;
        }

        extracted++;
        const bucket = byType.get(node.node_type) ?? { total: 0, valid: 0, degenerate: 0 };
        bucket.total++;
        if (spec.valid) bucket.valid++;
        else bucket.degenerate++;
        byType.set(node.node_type, bucket);

        if (spec.valid) wouldWrite++;
        else wouldReject++;

        if (apply) {
            // Merge the spec into existing metadata (preserve any prior fields)
            let merged: any = {};
            if (node.metadata) {
                try { merged = typeof node.metadata === 'string' ? JSON.parse(node.metadata) : node.metadata; } catch { merged = {}; }
            }
            merged.contentSpec = spec;
            await query(
                `UPDATE nodes SET metadata = $1, updated_at = datetime('now') WHERE id = $2`,
                [JSON.stringify(merged), node.id],
            );
            written++;
        }
    }

    console.log('');
    console.log(`Already had a spec:   ${alreadySpecced}`);
    console.log(`Extracted:            ${extracted}`);
    console.log(`  - valid (specced):  ${wouldWrite}`);
    console.log(`  - degenerate:       ${wouldReject}`);
    console.log(`Extraction failed:    ${extractionFail}`);
    console.log('');

    if (byType.size > 0) {
        console.log('By node type:');
        for (const [type, b] of [...byType.entries()].sort((a, b) => b[1].total - a[1].total)) {
            const ratio = b.total > 0 ? (100 * b.valid / b.total).toFixed(1) : '-';
            console.log(`  ${type.padEnd(15)} total=${b.total.toString().padStart(4)}  valid=${b.valid.toString().padStart(4)}  degenerate=${b.degenerate.toString().padStart(4)}  (${ratio}% valid)`);
        }
        console.log('');
    }

    if (apply) {
        console.log(`Wrote metadata on ${written} node(s).`);
    } else {
        console.log('Dry-run only. Re-run with --apply to write metadata.');
    }
}

main().catch(err => {
    console.error('Backfill failed:', err);
    process.exit(1);
});
