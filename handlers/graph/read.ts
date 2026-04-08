/**
 * Graph read handlers — single-node fetch and lineage tree traversal.
 * @module handlers/graph/read
 */

import { query, queryOne } from '../../core.js';
import { getLineageQuery } from '../../db/sql.js';

/**
 * Fetch a single node by ID with full metadata.
 *
 * Returns the node's content, type, domain, weight, salience, specificity,
 * validation scores, feedback, lifecycle state, keywords, domain synonyms,
 * partition membership, and governance decision history. Excludes embedding
 * columns to keep response size manageable.
 *
 * @param params - Object with `id` (node UUID).
 * @returns Full node object or `{ error }` if not found.
 */
async function handleGet(params: Record<string, any>) {
    const { id } = params;

    // Single query: node + lineage counts + partition — excludes embedding columns (10KB+ each)
    const node = await queryOne(`
        SELECT n.id, n.name, n.content, n.node_type, n.trajectory, n.domain, n.weight, n.salience,
            n.specificity, n.origin, n.contributor, n.excluded, n.metadata,
            n.created_at, n.updated_at, n.archived,
            n.validation_synthesis, n.validation_novelty, n.validation_testability,
            n.validation_tension_resolution, n.validation_composite, n.validation_reason,
            n.validated_at, n.validated_by,
            n.feedback_rating, n.feedback_source, n.feedback_at, n.feedback_note,
            n.verification_status, n.verification_score,
            n.lifecycle_state, n.born_at, n.activated_at, n.declining_since, n.composted_at,
            n.barren_cycles, n.total_children, n.generation,
            n.avatar_url, n.content_hash,
            pd.partition_id, dp.name AS partition_name,
            (SELECT COUNT(*) FROM edges WHERE target_id = n.id AND edge_type = 'parent') as parent_count,
            (SELECT COUNT(*) FROM edges WHERE source_id = n.id AND edge_type = 'parent') as child_count
        FROM nodes n
        LEFT JOIN partition_domains pd ON pd.domain = n.domain
        LEFT JOIN domain_partitions dp ON dp.id = pd.partition_id
        WHERE n.id = $1
    `, [id]);

    if (!node) {
        return { error: 'Node not found' };
    }

    // Run independent lookups in parallel
    const [decisions, kwRows, synRows] = await Promise.all([
        query(`
            SELECT field, old_value, new_value, decided_by_tier, contributor, reason, created_at
            FROM decisions
            WHERE entity_type = 'node' AND entity_id = $1
            ORDER BY created_at ASC
        `, [id]).catch(() => [] as any[]),
        query('SELECT keyword FROM node_keywords WHERE node_id = $1', [id]).catch(() => [] as any[]),
        node.domain
            ? query('SELECT synonym FROM domain_synonyms WHERE domain = $1', [node.domain]).catch(() => [] as any[])
            : Promise.resolve([] as any[]),
    ]);
    const keywords = kwRows.map((r: any) => r.keyword);
    const domainSynonyms = synRows.map((r: any) => r.synonym);

    return {
        id: node.id,
        content: node.content,
        type: node.node_type,
        trajectory: node.trajectory,
        domain: node.domain,
        weight: node.weight,
        salience: node.salience,
        specificity: node.specificity,
        origin: node.origin,
        contributor: node.contributor,
        excluded: !!node.excluded,
        archived: !!node.archived,
        metadata: node.metadata ? JSON.parse(node.metadata) : null,
        createdAt: node.created_at,
        updatedAt: node.updated_at,
        parentCount: parseInt(node.parent_count, 10),
        childCount: parseInt(node.child_count, 10),
        partition: node.partition_id ? {
            id: node.partition_id,
            name: node.partition_name,
        } : null,
        validation: node.validation_composite ? {
            synthesis: node.validation_synthesis,
            novelty: node.validation_novelty,
            testability: node.validation_testability,
            tensionResolution: node.validation_tension_resolution,
            composite: node.validation_composite,
            reason: node.validation_reason,
            validatedAt: node.validated_at,
            validatedBy: node.validated_by,
        } : null,
        provenance: decisions.length > 0 ? decisions.map(d => ({
            field: d.field,
            oldValue: d.old_value,
            newValue: d.new_value,
            tier: d.decided_by_tier,
            contributor: d.contributor,
            reason: d.reason,
            at: d.created_at,
        })) : null,
        feedback_rating: node.feedback_rating ?? null,
        feedback_source: node.feedback_source ?? null,
        feedback_at: node.feedback_at ?? null,
        feedback_note: node.feedback_note ?? null,
        keywords: keywords.length > 0 ? keywords : null,
        domainSynonyms: domainSynonyms.length > 0 ? domainSynonyms : null,
        avatarUrl: node.avatar_url || null,
        lifecycle: {
            state: node.lifecycle_state || 'active',
            barrenCycles: node.barren_cycles || 0,
            totalChildren: node.total_children || 0,
            generation: node.generation || 0,
            bornAt: node.born_at,
            activatedAt: node.activated_at,
            decliningSince: node.declining_since,
            compostedAt: node.composted_at,
        },
    };
}

/**
 * Fetch the ancestor/descendant lineage tree for a node.
 *
 * Uses a recursive CTE to walk parent edges up to the specified depth (clamped 1-10).
 * Returns both the full deep lineage (ancestors/descendants arrays) and a backward-
 * compatible flat subset of distance-1 parents/children.
 *
 * @param params - Object with `id` (node UUID) and optional `depth` (default 2, max 10).
 * @returns Lineage tree with triggerNode, parents, children, ancestors, descendants.
 */
async function handleLineage(params: Record<string, any>) {
    const { id, depth = 2 } = params;
    const clampedDepth = Math.min(Math.max(1, depth), 10);

    // Recursive CTE: params are [id, depth], $1 used in both CTE base cases
    const lineage = await query(getLineageQuery(), [id, clampedDepth]);

    const ancestors = lineage.filter((n: any) => n.relation === 'ancestor');
    const descendants = lineage.filter((n: any) => n.relation === 'descendant');

    // Fetch trigger node data so the frontend has it without a separate call
    const triggerNode = await queryOne(
        `SELECT id, name, content, node_type, domain, weight, created_at, archived FROM nodes WHERE id = $1`, [id]
    );

    const mapNode = (n: any) => ({
        id: n.node_id,
        name: n.name || null,
        content: n.content,
        type: n.node_type,
        domain: n.domain,
        weight: n.weight,
        createdAt: n.created_at,
        distance: n.distance,
        connectedFrom: n.connected_from,
    });

    return {
        nodeId: id,
        triggerNode: triggerNode ? {
            id: triggerNode.id,
            name: triggerNode.name || null,
            content: triggerNode.content,
            type: triggerNode.node_type,
            domain: triggerNode.domain,
            weight: triggerNode.weight,
            createdAt: triggerNode.created_at,
        } : null,
        // Backward-compatible: distance-1 subset with old field names
        parents: ancestors.filter((a: any) => a.distance === 1).map(mapNode),
        children: descendants.filter((d: any) => d.distance === 1).map(mapNode),
        // Full deep lineage with tree-building data
        ancestors: ancestors.map(mapNode),
        descendants: descendants.map(mapNode),
    };
}

export { handleGet, handleLineage };
