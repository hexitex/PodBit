/**
 * Core configuration REST API routes.
 *
 * GET/PUT for the main application config, with admin authentication for
 * sensitive paths, automatic snapshot creation before saves, config history
 * logging, and node weight/salience clamping.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/config-routes
 */

import { Router } from 'express';
import { getSafeConfig, updateConfig } from '../config.js';
import { config as rawConfig } from '../config.js';
import { query } from '../db.js';
import { systemQuery } from '../db.js';
import { asyncHandler } from '../utils/async-handler.js';
import { isSensitiveConfigPath, isAdminPasswordSet, verifyAdminPassword } from '../core/security.js';

const router = Router();

router.get('/config', (_req, res) => {
    res.json(getSafeConfig());
});

/**
 * Resolve a dot-separated path to a nested value in an object.
 *
 * @param obj - The object to traverse
 * @param path - Dot-separated path string (e.g. "engine.threshold")
 * @returns The value at the path, or undefined if any segment is missing
 */
function getNestedValue(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;
    for (const p of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[p];
    }
    return current;
}

router.put('/config', async (req, res) => {
    // Check if any sensitive paths are actually being changed — require admin auth
    const changedPaths: string[] = [];
    const collectChanged = (obj: any, prefix: string) => {
        for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                collectChanged(value, path);
            } else {
                // Only flag paths whose values differ from current config
                const current = getNestedValue(rawConfig, path);
                if (JSON.stringify(current) !== JSON.stringify(value)) {
                    changedPaths.push(path);
                }
            }
        }
    };
    collectChanged(req.body, '');

    const sensitivePaths = changedPaths.filter(p => isSensitiveConfigPath(p.split('.')));
    if (sensitivePaths.length > 0) {
        const passwordSet = await isAdminPasswordSet();
        if (passwordSet) {
            const adminToken = req.headers['x-admin-token'] as string | undefined;
            const adminPassword = req.headers['x-admin-password'] as string | undefined;

            // Import token validator from security routes
            let tokenValid = false;
            if (adminToken) {
                // Lazy import to avoid circular dependency
                const { validateAdminTokenExport } = await import('./security.js');
                tokenValid = validateAdminTokenExport(adminToken);
            }
            const passwordValid = adminPassword ? await verifyAdminPassword(adminPassword) : false;

            if (!tokenValid && !passwordValid) {
                res.status(403).json({
                    error: 'Admin authentication required for sensitive config changes',
                    adminRequired: true,
                    sensitivePaths,
                });
                return;
            }
        }
    }

    // Auto-save snapshot before applying GUI changes (rollback point)
    try {
        const { handleConfig } = await import('../handlers/config-tune-handler.js');
        await handleConfig({
            action: 'snapshot',
            snapshotAction: 'save',
            snapshotLabel: `auto-save before GUI save`,
            contributor: 'system',
        });
    } catch { /* non-fatal — snapshot failure shouldn't block config save */ }

    // Snapshot current values before applying for config history
    const before: Record<string, any> = {};
    const flatten = (obj: any, prefix: string) => {
        for (const [key, value] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
                flatten(value, path);
            } else {
                before[path] = getNestedValue(rawConfig, path);
            }
        }
    };
    flatten(req.body, '');

    // Get project name for history scoping
    let projectName = 'default';
    try {
        const { readProjectsMeta } = await import('../handlers/projects/meta.js');
        projectName = readProjectsMeta().currentProject || 'default';
    } catch { /* fallback to default */ }

    const warnings = await updateConfig(req.body);

    // Write config history for changed values
    for (const [path, oldValue] of Object.entries(before)) {
        const newValue = getNestedValue(rawConfig, path);
        if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
            try {
                await systemQuery(`
                    INSERT INTO config_history
                    (config_path, old_value, new_value, changed_by, contributor, reason, project_name)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                `, [path, JSON.stringify(oldValue), JSON.stringify(newValue), 'human', 'human:gui', 'GUI config save', projectName]);
            } catch { /* non-fatal */ }
        }
    }

    res.json({ success: true, config: getSafeConfig(), warnings });
});

/**
 * Clamp existing node weights/saliences to new floor/ceiling bounds.
 * Supports preview mode (counts only) and partition-scoped application.
 */
router.post('/config/clamp-nodes', asyncHandler(async (req, res) => {
    const {
        partitions: partitionIds = [],
        includeUnpartitioned = false,
        weightCeiling,
        salienceCeiling,
        salienceFloor,
        preview = false,
    } = req.body;

    if (!weightCeiling && !salienceCeiling && !salienceFloor) {
        return res.status(400).json({ error: 'At least one bound (weightCeiling, salienceCeiling, salienceFloor) is required' });
    }
    if (partitionIds.length === 0 && !includeUnpartitioned) {
        return res.status(400).json({ error: 'Select at least one partition or include unpartitioned nodes' });
    }

    // 1. Resolve domains from selected partitions
    let domains: string[] = [];
    if (partitionIds.length > 0) {
        const placeholders = partitionIds.map((_: string, i: number) => `$${i + 1}`).join(', ');
        const rows = await query(
            `SELECT DISTINCT domain FROM partition_domains WHERE partition_id IN (${placeholders})`,
            partitionIds
        );
        domains = rows.map((r: any) => r.domain);
    }

    // 2. Helper to build WHERE clause for domain scoping
    const buildDomainWhere = (paramOffset: number): { clause: string; params: any[] } => {
        const conditions: string[] = [];
        const params: any[] = [];

        if (domains.length > 0) {
            const placeholders = domains.map((_, i) => `$${paramOffset + i + 1}`).join(', ');
            conditions.push(`domain IN (${placeholders})`);
            params.push(...domains);
        }

        if (includeUnpartitioned) {
            conditions.push(`(domain IS NULL OR domain NOT IN (SELECT domain FROM partition_domains))`);
        }

        return {
            clause: `(${conditions.join(' OR ')})`,
            params,
        };
    };

    // 3. Count and optionally clamp for each bound
    const counts = { weightCeiling: 0, salienceCeiling: 0, salienceFloor: 0 };

    if (weightCeiling !== undefined) {
        const { clause, params: domainParams } = buildDomainWhere(0);
        const boundIdx = domainParams.length + 1;
        const countResult = await query(
            `SELECT COUNT(*) as cnt FROM nodes WHERE archived = FALSE AND weight > $${boundIdx} AND ${clause}`,
            [...domainParams, weightCeiling]
        );
        counts.weightCeiling = (countResult[0] as any)?.cnt ?? 0;

        if (!preview && counts.weightCeiling > 0) {
            await query(
                `UPDATE nodes SET weight = $${boundIdx} WHERE archived = FALSE AND weight > $${boundIdx} AND ${clause}`,
                [...domainParams, weightCeiling]
            );
        }
    }

    if (salienceCeiling !== undefined) {
        const { clause, params: domainParams } = buildDomainWhere(0);
        const boundIdx = domainParams.length + 1;
        const countResult = await query(
            `SELECT COUNT(*) as cnt FROM nodes WHERE archived = FALSE AND salience > $${boundIdx} AND ${clause}`,
            [...domainParams, salienceCeiling]
        );
        counts.salienceCeiling = (countResult[0] as any)?.cnt ?? 0;

        if (!preview && counts.salienceCeiling > 0) {
            await query(
                `UPDATE nodes SET salience = $${boundIdx} WHERE archived = FALSE AND salience > $${boundIdx} AND ${clause}`,
                [...domainParams, salienceCeiling]
            );
        }
    }

    if (salienceFloor !== undefined) {
        const { clause, params: domainParams } = buildDomainWhere(0);
        const boundIdx = domainParams.length + 1;
        const countResult = await query(
            `SELECT COUNT(*) as cnt FROM nodes WHERE archived = FALSE AND salience < $${boundIdx} AND ${clause}`,
            [...domainParams, salienceFloor]
        );
        counts.salienceFloor = (countResult[0] as any)?.cnt ?? 0;

        if (!preview && counts.salienceFloor > 0) {
            await query(
                `UPDATE nodes SET salience = $${boundIdx} WHERE archived = FALSE AND salience < $${boundIdx} AND ${clause}`,
                [...domainParams, salienceFloor]
            );
        }
    }

    const total = counts.weightCeiling + counts.salienceCeiling + counts.salienceFloor;

    if (preview) {
        res.json({ preview: true, counts, total });
    } else {
        console.error(`[config] Clamped ${total} nodes: weight=${counts.weightCeiling}, salienceCeil=${counts.salienceCeiling}, salienceFloor=${counts.salienceFloor}`);
        res.json({ applied: true, clamped: counts, total });
    }
}));

export default router;
