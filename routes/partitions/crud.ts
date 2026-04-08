/**
 * @module routes/partitions/crud
 *
 * Partition CRUD routes — list, get, create, update, delete partitions,
 * plus domain management (add, remove, rename) and bridge management
 * (list, create, delete).  Bridge IDs are canonically ordered
 * (`partition_a < partition_b`) to avoid duplicates.
 */

import { Router } from 'express';
import { asyncHandler } from '../../utils/async-handler.js';
import { query, queryOne } from '../../db.js';

/**
 * Registers partition CRUD and bridge management routes on the given router.
 *
 * Routes:
 * - `GET    /partitions/bridges`                  — list all bridges
 * - `POST   /partitions/bridges`                  — create a bridge (guards system partitions)
 * - `DELETE /partitions/bridges`                  — delete a bridge
 * - `GET    /partitions`                          — list all partitions with domains
 * - `GET    /partitions/:id`                      — get a single partition
 * - `POST   /partitions`                          — create a partition
 * - `PUT    /partitions/:id`                      — update partition (name, description, system, allowed_cycles)
 * - `PUT    /partitions/domains/:domain/rename`   — rename a domain across all tables
 * - `DELETE /partitions/:id`                      — delete a partition (and its domain assignments)
 * - `POST   /partitions/:id/domains`              — add a domain to a partition
 * - `DELETE /partitions/:id/domains/:domain`      — remove a domain from a partition
 *
 * @param router - The Express router to mount routes on.
 */
export function registerCrudRoutes(router: Router) {
    // List all bridges (MUST come before :id routes)
    router.get('/partitions/bridges', asyncHandler(async (_req, res) => {
        const bridges = await query(`
            SELECT pb.partition_a, pb.partition_b, pb.created_at,
                   pa.name AS name_a, pb2.name AS name_b
            FROM partition_bridges pb
            JOIN domain_partitions pa ON pa.id = pb.partition_a
            JOIN domain_partitions pb2 ON pb2.id = pb.partition_b
            WHERE COALESCE(pa.system, 0) = 0 AND COALESCE(pb2.system, 0) = 0
            ORDER BY pb.created_at DESC
        `);
        res.json(bridges);
    }));

    // Create a bridge between two partitions
    router.post('/partitions/bridges', asyncHandler(async (req, res) => {
        const { partitionA, partitionB } = req.body;
        if (!partitionA || !partitionB) {
            return res.status(400).json({ error: 'partitionA and partitionB are required' });
        }
        if (partitionA === partitionB) {
            return res.status(400).json({ error: 'Cannot bridge a partition to itself' });
        }
        // Guard: system partitions are structurally un-bridgeable
        const pA = await queryOne('SELECT system FROM domain_partitions WHERE id = $1', [partitionA]);
        const pB = await queryOne('SELECT system FROM domain_partitions WHERE id = $1', [partitionB]);
        if (pA?.system === 1 || pB?.system === 1) {
            return res.status(400).json({ error: 'Cannot bridge to or from a system partition. System partitions synthesize internally only.' });
        }
        const [a, b] = partitionA < partitionB ? [partitionA, partitionB] : [partitionB, partitionA];
        await query(`
            INSERT INTO partition_bridges (partition_a, partition_b)
            VALUES ($1, $2) ON CONFLICT DO NOTHING
        `, [a, b]);
        res.json({ success: true, bridge: { partition_a: a, partition_b: b } });
    }));

    // Delete a bridge between two partitions
    router.delete('/partitions/bridges', asyncHandler(async (req, res) => {
        const { partitionA, partitionB } = req.body;
        if (!partitionA || !partitionB) {
            return res.status(400).json({ error: 'partitionA and partitionB are required' });
        }
        const [a, b] = partitionA < partitionB ? [partitionA, partitionB] : [partitionB, partitionA];
        await query(`
            DELETE FROM partition_bridges WHERE partition_a = $1 AND partition_b = $2
        `, [a, b]);
        res.json({ success: true });
    }));

    // List all partitions with their domains
    router.get('/partitions', asyncHandler(async (_req, res) => {
        const partitions = await query(`
            SELECT dp.id, dp.name, dp.description, dp.created_at,
                   COALESCE(dp.system, 0) as system,
                   COALESCE(dp.transient, 0) as transient,
                   dp.state, dp.source_project, dp.source_owner, dp.imported_at,
                   COALESCE(dp.cycles_completed, 0) as cycles_completed,
                   COALESCE(dp.barren_cycles, 0) as barren_cycles,
                   dp.allowed_cycles,
                   GROUP_CONCAT(pd.domain) as domains
            FROM domain_partitions dp
            LEFT JOIN partition_domains pd ON pd.partition_id = dp.id
            GROUP BY dp.id, dp.name, dp.description, dp.created_at, dp.system, dp.transient, dp.state, dp.source_project, dp.source_owner, dp.imported_at, dp.cycles_completed, dp.barren_cycles, dp.allowed_cycles
            ORDER BY dp.name
        `);
        res.json(partitions.map(p => {
            let allowedCycles: string[] | null = null;
            try { if (p.allowed_cycles) allowedCycles = JSON.parse(p.allowed_cycles); } catch { /* ignore */ }
            return {
                ...p,
                system: p.system === 1,
                transient: p.transient === 1,
                state: p.transient === 1 ? (p.state || 'active') : undefined,
                source_project: p.transient === 1 ? p.source_project : undefined,
                source_owner: p.transient === 1 ? p.source_owner : undefined,
                imported_at: p.transient === 1 ? p.imported_at : undefined,
                cycles_completed: p.transient === 1 ? p.cycles_completed : undefined,
                barren_cycles: p.transient === 1 ? p.barren_cycles : undefined,
                allowed_cycles: allowedCycles,
                domains: p.domains ? p.domains.split(',') : [],
            };
        }));
    }));

    // Get a specific partition
    router.get('/partitions/:id', asyncHandler(async (req, res) => {
        const partition = await query(`
            SELECT dp.id, dp.name, dp.description, dp.created_at,
                   COALESCE(dp.system, 0) as system,
                   dp.allowed_cycles
            FROM domain_partitions dp
            WHERE dp.id = $1
        `, [req.params.id]);

        if (partition.length === 0) {
            return res.status(404).json({ error: 'Partition not found' });
        }

        const domains = await query(`
            SELECT domain, added_at FROM partition_domains WHERE partition_id = $1
        `, [req.params.id]);

        let allowedCycles: string[] | null = null;
        try { if (partition[0].allowed_cycles) allowedCycles = JSON.parse(partition[0].allowed_cycles); } catch { /* ignore */ }

        res.json({ ...partition[0], system: partition[0].system === 1, allowed_cycles: allowedCycles, domains: domains.map(d => d.domain) });
    }));

    // Create a partition
    router.post('/partitions', asyncHandler(async (req, res) => {
        const { id, name, description, domains, system } = req.body;
        if (!id || !name) {
            return res.status(400).json({ error: 'id and name are required' });
        }

        await query(`
            INSERT INTO domain_partitions (id, name, description, system) VALUES ($1, $2, $3, $4)
        `, [id, name, description || null, system ? 1 : 0]);

        if (domains && Array.isArray(domains)) {
            for (const domain of domains) {
                await query(`
                    INSERT INTO partition_domains (partition_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING
                `, [id, domain]);
            }
        }

        res.json({ success: true, id, name, system: !!system, domains: domains || [] });
    }));

    // Update a partition
    router.put('/partitions/:id', asyncHandler(async (req, res) => {
        const { name, description, system, allowed_cycles } = req.body;
        const updates = [];
        const params = [];
        let idx = 1;

        if (name !== undefined) {
            updates.push(`name = $${idx++}`);
            params.push(name);
        }
        if (description !== undefined) {
            updates.push(`description = $${idx++}`);
            params.push(description);
        }
        if (system !== undefined) {
            updates.push(`system = $${idx++}`);
            params.push(system ? 1 : 0);
        }
        if (allowed_cycles !== undefined) {
            updates.push(`allowed_cycles = $${idx++}`);
            // null = all cycles (unrestricted), array = only those cycles
            params.push(allowed_cycles === null ? null : JSON.stringify(allowed_cycles));
        }

        if (updates.length > 0) {
            params.push(req.params.id);
            await query(`UPDATE domain_partitions SET ${updates.join(', ')} WHERE id = $${idx}`, params);
            // Clear cycle exclusion cache if allowed_cycles changed
            if (allowed_cycles !== undefined) {
                const { clearCycleExclusionCache } = await import('../../core/governance.js');
                clearCycleExclusionCache();
            }
        }

        res.json({ success: true });
    }));

    // Rename a domain across all tables
    router.put('/partitions/domains/:domain/rename', asyncHandler(async (req, res) => {
        const oldDomain = decodeURIComponent(req.params.domain);
        const { newDomain } = req.body;

        if (!newDomain || typeof newDomain !== 'string') {
            return res.status(400).json({ error: 'newDomain is required' });
        }

        const { renameDomain } = await import('../../core/governance.js');
        const result = await renameDomain(oldDomain, newDomain.trim(), 'human:gui');

        if (!result.success) {
            return res.status(400).json({ error: result.error });
        }

        res.json(result);
    }));

    // Delete a partition
    router.delete('/partitions/:id', asyncHandler(async (req, res) => {
        await query(`DELETE FROM partition_bridges WHERE partition_a_id = $1 OR partition_b_id = $1`, [req.params.id]);
        await query(`DELETE FROM partition_domains WHERE partition_id = $1`, [req.params.id]);
        await query(`DELETE FROM domain_partitions WHERE id = $1`, [req.params.id]);
        res.json({ success: true });
    }));

    // Add a domain to a partition
    router.post('/partitions/:id/domains', asyncHandler(async (req, res) => {
        const { domain } = req.body;
        if (!domain) {
            return res.status(400).json({ error: 'domain is required' });
        }

        await query(`
            INSERT INTO partition_domains (partition_id, domain) VALUES ($1, $2) ON CONFLICT DO NOTHING
        `, [req.params.id, domain]);

        res.json({ success: true, partition: req.params.id, domain });
    }));

    // Remove a domain from a partition
    router.delete('/partitions/:id/domains/:domain', asyncHandler(async (req, res) => {
        await query(`
            DELETE FROM partition_domains WHERE partition_id = $1 AND domain = $2
        `, [req.params.id, req.params.domain]);

        res.json({ success: true });
    }));
}
