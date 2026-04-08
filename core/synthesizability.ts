/**
 * @module core/synthesizability
 *
 * Ground-rules gate for the synthesis pipeline. Classifies whether a node
 * contains synthesizable knowledge (mechanisms, principles, causal claims)
 * versus inert content (paper summaries, methodology descriptions, bare results).
 *
 * Two modes:
 * 1. **Batch classification** — scans unclassified nodes and calls a small model
 *    to tag each as synthesizable (1) or not (0). Non-synthesizable orphans
 *    (no parents, no children) are removed; connected ones are archived.
 * 2. **Inline filter** — the `synthesizable` column on nodes is checked in
 *    `sampleNodes()` and candidate queries. Nodes with `synthesizable = 0`
 *    are excluded from synthesis partner selection.
 *
 * The classification uses a lightweight prompt (`kb.synthesizability_check`)
 * via the `keyword` subsystem (typically a small/cheap model).
 */

import { query, queryOne } from '../db.js';
import { emitActivity } from '../services/event-bus.js';
import { resolveContent } from './number-variables.js';

/**
 * Classify a single unclassified node for synthesizability.
 *
 * Picks one random node where `synthesizable IS NULL`, calls the ground_rules
 * subsystem, updates the node, and handles non-synthesizable removal/archiving.
 * Designed to be called once per tick by `runCycleLoop`.
 *
 * @returns true if a node was classified, false if backlog is empty
 */
export async function classifySingleNode(): Promise<boolean> {
    const { callSubsystemModel } = await import('../models.js');
    const { getPrompt } = await import('../prompts/index.js');

    const node = await queryOne(`
        SELECT id, content, node_type, domain
        FROM nodes
        WHERE archived = FALSE
          AND synthesizable IS NULL
          AND node_type NOT IN ('question', 'raw', 'elite_verification')
        ORDER BY RANDOM()
        LIMIT 1
    `);

    if (!node) return false;

    const resolved = await resolveContent(node.content);
    const prompt = await getPrompt('kb.synthesizability_check', { content: resolved });
    const response = await callSubsystemModel('ground_rules', prompt, {
        temperature: 0.1,
    });

    const answer = (typeof response === 'string' ? response : String(response)).trim().toUpperCase();
    const isSynthesizable = answer.startsWith('YES');

    await query('UPDATE nodes SET synthesizable = $1 WHERE id = $2', [
        isSynthesizable ? 1 : 0,
        node.id,
    ]);

    if (isSynthesizable) {
        emitActivity('system', 'ground_rules_pass', `Node classified as synthesizable`, {
            nodeId: node.id, domain: node.domain, nodeType: node.node_type,
        });
    } else {
        const action = await handleNonSynthesizable(node.id);
        emitActivity('system', 'ground_rules_cull', `Node classified as non-synthesizable (${action})`, {
            nodeId: node.id, domain: node.domain, nodeType: node.node_type, action,
        });
    }

    return true;
}

/**
 * Classify a batch of unclassified nodes for synthesizability.
 *
 * Queries nodes where `synthesizable IS NULL`, calls the ground_rules subsystem
 * with the synthesizability prompt, and updates each node.
 *
 * @param limit - Maximum nodes to classify per batch (default 50)
 * @returns Summary of classification results
 */
export async function classifyUnclassifiedNodes(limit: number = 50): Promise<{
    classified: number;
    synthesizable: number;
    notSynthesizable: number;
    removed: number;
    archived: number;
    errors: number;
}> {
    const { callSubsystemModel } = await import('../models.js');
    const { getPrompt } = await import('../prompts/index.js');

    const results = { classified: 0, synthesizable: 0, notSynthesizable: 0, removed: 0, archived: 0, errors: 0 };

    // Get unclassified nodes — skip raw and question types (they don't participate anyway)
    const unclassified = await query(`
        SELECT id, content, node_type, domain
        FROM nodes
        WHERE archived = FALSE
          AND synthesizable IS NULL
          AND node_type NOT IN ('question', 'raw', 'elite_verification')
        ORDER BY RANDOM()
        LIMIT $1
    `, [limit]);

    if (unclassified.length === 0) return results;

    for (const node of unclassified) {
        try {
            const resolved = await resolveContent(node.content);
            const prompt = await getPrompt('kb.synthesizability_check', { content: resolved });
            const response = await callSubsystemModel('ground_rules', prompt, {
                temperature: 0.1,
            });

            const answer = (typeof response === 'string' ? response : String(response)).trim().toUpperCase();
            const isSynthesizable = answer.startsWith('YES');

            await query('UPDATE nodes SET synthesizable = $1 WHERE id = $2', [
                isSynthesizable ? 1 : 0,
                node.id,
            ]);

            results.classified++;
            if (isSynthesizable) {
                results.synthesizable++;
            } else {
                results.notSynthesizable++;
                const action = await handleNonSynthesizable(node.id);
                if (action === 'removed') results.removed++;
                else results.archived++;
            }
        } catch (err: any) {
            console.error(`[synthesizability] Error classifying ${node.id}: ${err.message}`);
            results.errors++;
        }
    }

    emitActivity('system', 'synthesizability_scan', `Classified ${results.classified} nodes: ${results.synthesizable} synthesizable, ${results.notSynthesizable} not`, {
        ...results,
    });

    return results;
}

/**
 * Handle a node classified as non-synthesizable.
 * - No parents AND no children → remove (hard delete via archive + junk)
 * - Has connections → archive (soft-delete, preserves graph integrity)
 */
async function handleNonSynthesizable(nodeId: string): Promise<'removed' | 'archived'> {
    // Check for parent edges (this node is a child of something)
    const hasParent = await queryOne(`
        SELECT 1 FROM edges WHERE target_id = $1 AND edge_type = 'parent' LIMIT 1
    `, [nodeId]);

    // Check for child edges (this node is a parent of something)
    const hasChild = await queryOne(`
        SELECT 1 FROM edges WHERE source_id = $1 AND edge_type = 'parent' LIMIT 1
    `, [nodeId]);

    // Both paths archive — orphans are "removed" (archived with no connections)
    await query('UPDATE nodes SET archived = TRUE, synthesizable = 0 WHERE id = $1', [nodeId]);
    return (!hasParent && !hasChild) ? 'removed' : 'archived';
}

/**
 * Get synthesizability stats for the current graph.
 */
export async function getSynthesizabilityStats(): Promise<{
    total: number;
    classified: number;
    unclassified: number;
    synthesizable: number;
    notSynthesizable: number;
}> {
    const total = await queryOne('SELECT COUNT(*) as count FROM nodes WHERE archived = FALSE AND node_type NOT IN (\'question\', \'raw\', \'elite_verification\')');
    const classified = await queryOne('SELECT COUNT(*) as count FROM nodes WHERE archived = FALSE AND synthesizable IS NOT NULL AND node_type NOT IN (\'question\', \'raw\', \'elite_verification\')');
    const synth = await queryOne('SELECT COUNT(*) as count FROM nodes WHERE archived = FALSE AND synthesizable = 1 AND node_type NOT IN (\'question\', \'raw\', \'elite_verification\')');
    const notSynth = await queryOne('SELECT COUNT(*) as count FROM nodes WHERE archived = FALSE AND synthesizable = 0 AND node_type NOT IN (\'question\', \'raw\', \'elite_verification\')');

    return {
        total: total?.count ?? 0,
        classified: classified?.count ?? 0,
        unclassified: (total?.count ?? 0) - (classified?.count ?? 0),
        synthesizable: synth?.count ?? 0,
        notSynthesizable: notSynth?.count ?? 0,
    };
}
