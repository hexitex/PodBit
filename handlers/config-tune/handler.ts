/**
 * Config tuning — main MCP handler for podbit.config actions.
 */
import { query, queryOne, systemQuery, systemQueryOne } from '../../core.js';
import { withinDays } from '../../db/sql.js';
import { config, updateConfig, loadSavedConfig } from '../../config.js';
import { SECTION_METADATA } from '../../config-sections.js';
import { state } from './types.js';
import {
    getApiBaseUrl,
    securedFetch,
    generateUuid,
    buildParamLookup,
    getNestedValue,
    setNestedValue,
    getQuickMetrics,
} from './helpers.js';
import {
    seedTuningKnowledge,
    formatConfigChangeSeed,
    formatOverfittingSeed,
    formatSnapshotSeed,
    computeOverfittingHash,
} from './know-thyself.js';
import { detectOverfitting } from './analysis.js';
import { readProjectsMeta } from '../projects/meta.js';
import { isSensitiveConfigPath, isAdminPasswordSet, verifyAdminPassword } from '../../core/security.js';

/** Resolves the current project name from projects meta for snapshot/audit attribution. */
function getCurrentProjectName(): string {
    try {
        return readProjectsMeta().currentProject || 'default';
    } catch { return 'default'; }
}

/** Auto-save a snapshot before config changes. Prunes beyond 10 per project. */
async function autoSaveSnapshot(label: string): Promise<string | null> {
    try {
        const paramLookup = buildParamLookup();
        const tunableParams: Record<string, any> = {};
        for (const [pathStr, meta] of Object.entries(paramLookup)) {
            const val = getNestedValue(config, meta.configPath);
            if (val !== undefined) tunableParams[pathStr] = val;
        }
        const metrics = await getQuickMetrics();
        const id = generateUuid();
        const projectName = getCurrentProjectName();

        await systemQuery(`
            INSERT INTO config_snapshots (id, label, parameters, metrics_at_save, created_by, project_name)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [id, label, JSON.stringify(tunableParams), JSON.stringify(metrics), 'system', projectName]);

        // Prune: keep at most 10 per project
        await systemQuery(`
            DELETE FROM config_snapshots WHERE id IN (
                SELECT id FROM config_snapshots
                WHERE project_name = $1
                ORDER BY created_at DESC
                LIMIT -1 OFFSET 10
            )
        `, [projectName]);

        return id;
    } catch (err: any) {
        console.error('[config-tune] Auto-save snapshot failed:', err.message);
        return null;
    }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

/**
 * Dispatch podbit.config actions: get, sections, tune, apply, metrics, snapshot, history.
 *
 * Side effects vary by action:
 * - **apply**: Validates an admin password if one is set and the change targets a sensitive
 *   config path. Auto-saves a snapshot before applying changes. Persists config overrides
 *   to the system DB. Seeds the Know Thyself partition with a record of each change for
 *   cross-session tuning memory.
 * - **metrics**: Runs overfitting detection and, if a new overfitting event is found,
 *   auto-seeds it into the Know Thyself partition.
 * - **snapshot**: Save/restore/list/delete/compare config snapshots. Restore re-applies
 *   all snapshot values through `updateConfig` and persists them.
 *
 * @param params - Object with `action` (required) plus action-specific fields.
 * @returns Action-specific result, or `{ error }`.
 */
export async function handleConfig(params: Record<string, any>) {
    const { action } = params;

    if (!action) {
        return { error: 'action is required. Use: get, sections, tune, apply, metrics, snapshot, history' };
    }

    switch (action) {

        // =====================================================================
        // GET — Read current config (safe version) or specific section
        // =====================================================================
        case 'get': {
            const { sectionId } = params;
            const base = getApiBaseUrl();

            try {
                const res = await securedFetch(`${base}/api/config`);
                if (!res.ok) return { error: `API server not responding (${res.status})` };
                const currentConfig = await res.json();

                if (sectionId) {
                    const section = SECTION_METADATA[sectionId];
                    if (!section) {
                        return { error: `Unknown section: ${sectionId}. Use action "sections" to list available sections.` };
                    }
                    return {
                        sectionId,
                        sectionTitle: section.title,
                        parameters: section.parameters.map(p => ({
                            key: p.key,
                            label: p.label,
                            description: p.description,
                            value: getNestedValue(currentConfig, p.configPath),
                            default: p.default,
                            min: p.min,
                            max: p.max,
                            step: p.step,
                            configPath: p.configPath,
                        })),
                    };
                }

                return { config: currentConfig };
            } catch (err: any) {
                return { error: `Failed to reach API server: ${err.message}` };
            }
        }

        // =====================================================================
        // SECTIONS — List all tunable sections with parameter metadata
        // =====================================================================
        case 'sections': {
            const { sectionId } = params;
            const base = getApiBaseUrl();

            let currentConfig: any = null;
            try {
                const res = await securedFetch(`${base}/api/config`);
                if (res.ok) currentConfig = await res.json();
            } catch { /* current values will be null */ }

            if (sectionId) {
                const section = SECTION_METADATA[sectionId];
                if (!section) {
                    return { error: `Unknown section: ${sectionId}. Available: ${Object.keys(SECTION_METADATA).join(', ')}` };
                }
                return {
                    section: {
                        ...section,
                        parameters: section.parameters.map(p => ({
                            ...p,
                            currentValue: currentConfig ? getNestedValue(currentConfig, p.configPath) : null,
                        })),
                    },
                };
            }

            const sections: Record<string, any> = {};
            for (const [id, section] of Object.entries(SECTION_METADATA)) {
                sections[id] = {
                    id: section.id,
                    tier: section.tier,
                    title: section.title,
                    description: section.description,
                    behavior: section.behavior,
                    parameterCount: section.parameters.length,
                    presetCount: section.presets.length,
                    parameters: section.parameters.map(p => ({
                        ...p,
                        currentValue: currentConfig ? getNestedValue(currentConfig, p.configPath) : null,
                    })),
                };
            }

            return {
                totalSections: Object.keys(sections).length,
                totalParameters: Object.values(SECTION_METADATA).reduce((sum, s) => sum + s.parameters.length, 0),
                sections,
            };
        }

        // =====================================================================
        // TUNE — Get AI-powered suggestions for a section
        // =====================================================================
        case 'tune': {
            const { sectionId, request } = params;
            if (!sectionId) return { error: 'sectionId is required for tune action' };
            if (!request) return { error: 'request is required for tune action (natural language description of what to optimize)' };

            const base = getApiBaseUrl();

            try {
                const res = await securedFetch(`${base}/api/config/tune`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sectionId, request }),
                });
                if (res.ok) {
                    return await res.json();
                }
                const errBody = await res.text();
                return { error: `Tune API failed (${res.status}): ${errBody}` };
            } catch (err: any) {
                return { error: `Failed to reach API server: ${err.message}` };
            }
        }

        // =====================================================================
        // APPLY — Apply parameter changes with validation + audit trail
        // =====================================================================
        case 'apply': {
            const { changes, reason, contributor = 'claude' } = params;
            if (!changes || !Array.isArray(changes) || changes.length === 0) {
                return { error: 'changes array is required and must not be empty. Each item: { configPath: string[], value: number }' };
            }

            const base = getApiBaseUrl();
            const paramLookup = buildParamLookup();

            // Fetch current config from API server
            let currentConfig: any;
            try {
                const res = await securedFetch(`${base}/api/config`);
                if (!res.ok) return { error: `API server not responding (${res.status})` };
                currentConfig = await res.json();
            } catch (err: any) {
                return { error: `Failed to reach API server: ${err.message}` };
            }

            // Capture metrics before change
            const metricsBefore = await getQuickMetrics();

            const applied: any[] = [];
            const rejected: any[] = [];
            const updateObj: any = {};

            for (const change of changes) {
                const { configPath, value } = change;
                if (!configPath || !Array.isArray(configPath)) {
                    rejected.push({ configPath, reason: 'configPath must be a string array' });
                    continue;
                }
                if (typeof value !== 'number') {
                    rejected.push({ configPath, reason: `value must be a number, got ${typeof value}` });
                    continue;
                }

                const pathStr = configPath.join('.');
                const meta = paramLookup[pathStr];

                if (!meta) {
                    rejected.push({ configPath, reason: `Unknown parameter path: ${pathStr}` });
                    continue;
                }

                if (value < meta.min || value > meta.max) {
                    rejected.push({
                        configPath, reason: `Value ${value} out of range [${meta.min}, ${meta.max}]`,
                        min: meta.min, max: meta.max,
                    });
                    continue;
                }

                // Round to step precision
                const rounded = Math.round(value / meta.step) * meta.step;
                const finalValue = parseFloat(rounded.toFixed(10)); // avoid floating point noise

                const oldValue = getNestedValue(currentConfig, configPath);
                setNestedValue(updateObj, configPath, finalValue);

                applied.push({ configPath, oldValue, newValue: finalValue, label: meta.label });
            }

            // --- Check admin auth for sensitive paths ---
            const sensitiveChanges = applied.filter(c =>
                isSensitiveConfigPath(c.configPath)
            );
            if (sensitiveChanges.length > 0) {
                const passwordSet = await isAdminPasswordSet();
                if (passwordSet) {
                    const { adminPassword } = params;
                    if (!adminPassword) {
                        return {
                            error: 'Admin password required for sensitive config changes',
                            adminRequired: true,
                            sensitivePaths: sensitiveChanges.map((c: any) => c.configPath.join('.')),
                        };
                    }
                    const valid = await verifyAdminPassword(adminPassword);
                    if (!valid) {
                        return {
                            error: 'Invalid admin password',
                            adminRequired: true,
                        };
                    }
                }
            }

            // --- Persist changes (local config + DB, then sync API server) ---
            if (applied.length > 0) {
                // Auto-save snapshot before applying changes (rollback point)
                await autoSaveSnapshot(`auto-save before ${contributor} apply`);

                // 0. Reload from DB first — the API server (GUI) may have saved changes
                //    that this MCP process doesn't know about. Without this, persistConfigOverrides()
                //    would overwrite GUI changes with stale in-memory values.
                await loadSavedConfig();

                // 1. Update local MCP process config + persist to settings table
                //    This ensures changes survive restarts even if the API server is unreachable.
                await updateConfig(updateObj);

                // 2. Sync API server's in-memory config (best-effort)
                let _apiSyncFailed = false;
                try {
                    const applyRes = await securedFetch(`${base}/api/config`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updateObj),
                    });
                    if (!applyRes.ok) {
                        _apiSyncFailed = true;
                        console.warn('[config-tune] API server sync failed (changes persisted to DB, will load on restart)');
                    }
                } catch (err: any) {
                    _apiSyncFailed = true;
                    console.warn(`[config-tune] API server unreachable (changes persisted to DB): ${err.message}`);
                }

                // 3. Write audit trail AFTER persistence succeeds
                const projectName = getCurrentProjectName();
                for (const entry of applied) {
                    const pathStr = entry.configPath.join('.');
                    const meta = paramLookup[pathStr];
                    try {
                        await systemQuery(`
                            INSERT INTO config_history
                            (config_path, old_value, new_value, changed_by, contributor, reason, section_id, metrics_before, project_name)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        `, [
                            pathStr,
                            JSON.stringify(entry.oldValue),
                            JSON.stringify(entry.newValue),
                            contributor.startsWith('human') ? 'human' : 'system',
                            contributor,
                            reason || null,
                            meta?.sectionId || null,
                            JSON.stringify(metricsBefore),
                            projectName,
                        ]);
                    } catch (err: any) {
                        console.error('[config-tune] Audit trail write failed:', err.message);
                    }
                }
            }

            // === Timeline marker for journal ===
            if (applied.length > 0) {
                try {
                    const { createTimelineMarker } = await import('../../core/journal.js');
                    await createTimelineMarker('config_change', `Config: ${applied.map(a => a.configPath.join('.')).join(', ')}`, {
                        changes: applied.map(a => ({ path: a.configPath.join('.'), old: a.oldValue, new: a.newValue })),
                        reason,
                    }, contributor);
                } catch { /* journal may not be ready yet */ }
            }

            // === Tuning Registry: save subsystem inference params if any changed ===
            const SUBSYSTEM_PREFIXES = ['subsystemTemp.', 'subsystemTopP.', 'subsystemTopK.', 'subsystemMinP.'];
            const subsystemParamsChanged = applied.some(a =>
                SUBSYSTEM_PREFIXES.some(prefix => a.configPath.join('.').startsWith(prefix))
            );
            if (subsystemParamsChanged) {
                try {
                    const { getSubsystemAssignments } = await import('../../models.js');
                    const { saveToRegistry, incrementTuningChanges } = await import('../../models/tuning-registry.js');
                    const assignments = await getSubsystemAssignments();
                    const seenModels = new Map<string, { name: string; provider: string; subsystems: string[] }>();
                    for (const [sub, model] of Object.entries(assignments)) {
                        if (!model) continue;
                        if (seenModels.has(model.id)) {
                            seenModels.get(model.id)!.subsystems.push(sub);
                        } else {
                            seenModels.set(model.id, { name: model.name, provider: model.provider, subsystems: [sub] });
                        }
                    }
                    for (const [modelId, info] of seenModels) {
                        await saveToRegistry(modelId, info.name, info.provider, info.subsystems);
                        await incrementTuningChanges(modelId);
                    }
                } catch { /* non-fatal */ }
            }

            // === Know Thyself: auto-seed tuning change ===
            let tuningSeedId: string | null = null;
            if (applied.length > 0) {
                const significantChanges = applied.filter(a => {
                    const meta = paramLookup[a.configPath.join('.')];
                    if (!meta) return true;
                    const range = meta.max - meta.min;
                    const changeMagnitude = Math.abs(a.newValue - a.oldValue);
                    return range > 0 && (changeMagnitude / range) >= 0.01;
                });

                if (significantChanges.length > 0) {
                    const seedContent = formatConfigChangeSeed(significantChanges, reason, metricsBefore, contributor);
                    tuningSeedId = await seedTuningKnowledge({
                        content: seedContent,
                        nodeType: 'seed',
                        salience: 0.6,
                        contributor,
                    });
                    if (tuningSeedId) {
                        state.pendingMetricsFollow = { seedId: tuningSeedId, timestamp: Date.now() };
                    }
                }
            }

            return {
                success: true,
                appliedCount: applied.length,
                rejectedCount: rejected.length,
                applied,
                rejected: rejected.length > 0 ? rejected : undefined,
                tuningSeedId: tuningSeedId || undefined,
            };
        }

        // =====================================================================
        // METRICS — Quality dashboard for tuning decisions
        // =====================================================================
        case 'metrics': {
            const { days = 7 } = params;

            // 1. Synthesis cycle stats
            const synthesisStats = await queryOne(`
                SELECT
                    COUNT(*) as total_cycles,
                    SUM(CASE WHEN dc.created_child = 1
                          AND dc.child_node_id IS NOT NULL
                          AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = dc.child_node_id AND n.archived = 0)
                        THEN 1 ELSE 0 END) as children_created,
                    AVG(dc.resonance_score) as avg_resonance
                FROM dream_cycles dc
                WHERE ${withinDays('dc.started_at', '$1')}
            `, [days]);

            // 2. Rejection breakdown
            const rejections = await query(`
                SELECT rejection_reason, COUNT(*) as count
                FROM dream_cycles
                WHERE ${withinDays('started_at', '$1')}
                  AND created_child = 0
                  AND rejection_reason IS NOT NULL
                GROUP BY rejection_reason
                ORDER BY count DESC
            `, [days]);

            // 3. Podbit score distribution
            const resonanceDist = await query(`
                SELECT
                    CASE
                        WHEN resonance_score < 0.3 THEN '0.0-0.3'
                        WHEN resonance_score < 0.5 THEN '0.3-0.5'
                        WHEN resonance_score < 0.7 THEN '0.5-0.7'
                        WHEN resonance_score < 0.9 THEN '0.7-0.9'
                        ELSE '0.9-1.0'
                    END as bucket,
                    COUNT(*) as count
                FROM dream_cycles
                WHERE ${withinDays('started_at', '$1')}
                  AND resonance_score IS NOT NULL
                GROUP BY bucket
                ORDER BY bucket
            `, [days]);

            // 4. Context engine stats (from persisted session insights)
            const contextStats = await queryOne(`
                SELECT
                    COUNT(DISTINCT session_id) as session_count,
                    AVG(weight) as avg_topic_weight,
                    SUM(usage_count) as total_topic_usage
                FROM session_insights
                WHERE ${withinDays('last_seen', '$1')}
            `, [days]);

            // 5. Graph health
            const graphHealth = await queryOne(`
                SELECT
                    COUNT(*) as total,
                    AVG(weight) as avg_weight,
                    AVG(salience) as avg_salience,
                    AVG(specificity) as avg_specificity
                FROM nodes WHERE archived = 0 AND node_type != 'raw'
            `);

            const recentBreakthroughs = await queryOne(`
                SELECT COUNT(*) as count FROM nodes
                WHERE archived = 0 AND node_type = 'breakthrough'
                  AND ${withinDays('created_at', '$1')}
            `, [days]);

            const nodesByType = await query(`
                SELECT node_type as type, COUNT(*) as count
                FROM nodes WHERE archived = 0
                GROUP BY node_type ORDER BY count DESC
            `);

            const nodesByDomain = await query(`
                SELECT domain, COUNT(*) as count
                FROM nodes WHERE archived = 0 AND node_type != 'raw' AND domain IS NOT NULL
                GROUP BY domain ORDER BY count DESC
                LIMIT 20
            `);

            // 6. Tuning cycle count
            let tuningCount: any = { count: 0 };
            try {
                tuningCount = await systemQueryOne(`
                    SELECT COUNT(*) as count FROM config_history
                    WHERE ${withinDays('created_at', '$1')}
                `, [days]);
            } catch { /* table may not exist yet */ }

            // 7. Overfitting detection
            const overfitting = await detectOverfitting(days);

            // === Know Thyself: auto-seed overfitting signals ===
            const hasActionableSignals =
                overfitting.qualityPlateau ||
                overfitting.diversityCollapse ||
                overfitting.metricOscillation ||
                overfitting.convergingParameters?.length > 0;

            if (hasActionableSignals) {
                const hash = computeOverfittingHash(overfitting);
                if (hash !== state.lastOverfittingHash) {
                    state.lastOverfittingHash = hash;
                    // Persist hash so it survives server restarts
                    try {
                        await systemQuery(
                            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
                             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
                            ['knowthyself.overfittingHash', hash]
                        );
                    } catch { /* non-critical */ }
                    await seedTuningKnowledge({
                        content: formatOverfittingSeed(overfitting),
                        nodeType: 'synthesis',
                        salience: 0.8,
                        contributor: 'system',
                    });
                }
            }

            // === Know Thyself: metrics follow-up for prior tuning change ===
            if (state.pendingMetricsFollow && (Date.now() - state.pendingMetricsFollow.timestamp) > 5 * 60 * 1000) {
                const quickMetrics = await getQuickMetrics();
                const afterContent = `Follow-up metrics after tuning change: synthesis success rate is now ${((quickMetrics.synthesisSuccessRate ?? 0) * 100).toFixed(1)}%, avg resonance ${quickMetrics.avgResonance?.toFixed(3) ?? 'unknown'}, ${quickMetrics.totalNodes} active nodes, avg specificity ${quickMetrics.avgSpecificity?.toFixed(2) ?? 'unknown'}.`;
                await seedTuningKnowledge({
                    content: afterContent,
                    nodeType: 'seed',
                    salience: 0.6,
                    contributor: 'system',
                    parentIds: [state.pendingMetricsFollow.seedId],
                });
                state.pendingMetricsFollow = null;
            }

            const totalCycles = parseInt(synthesisStats?.total_cycles, 10) || 0;
            const childrenCreated = parseInt(synthesisStats?.children_created, 10) || 0;
            const successRate = totalCycles > 0 ? childrenCreated / totalCycles : 0;
            const totalRejected = totalCycles - childrenCreated;

            return {
                periodDays: days,
                synthesisEngine: {
                    totalCycles,
                    successRate: Math.round(successRate * 1000) / 1000,
                    childrenCreated,
                    rejectionBreakdown: rejections.map((r: any) => ({
                        reason: r.rejection_reason,
                        count: parseInt(r.count, 10),
                        pct: totalRejected > 0
                            ? Math.round((parseInt(r.count, 10) / totalRejected) * 1000) / 10
                            : 0,
                    })),
                    avgResonanceScore: Math.round((parseFloat(synthesisStats?.avg_resonance) || 0) * 1000) / 1000,
                    resonanceScoreDistribution: resonanceDist.map((d: any) => ({
                        bucket: d.bucket,
                        count: parseInt(d.count, 10),
                    })),
                },
                contextEngine: {
                    sessionCount: parseInt(contextStats?.session_count, 10) || 0,
                    avgTopicWeight: contextStats?.avg_topic_weight != null
                        ? Math.round(parseFloat(contextStats.avg_topic_weight) * 1000) / 1000
                        : null,
                    totalTopicUsage: parseInt(contextStats?.total_topic_usage, 10) || 0,
                },
                graphHealth: {
                    totalNodes: parseInt(graphHealth?.total, 10) || 0,
                    nodesByType: nodesByType.map((n: any) => ({
                        type: n.type, count: parseInt(n.count, 10),
                    })),
                    nodesByDomain: nodesByDomain.map((n: any) => ({
                        domain: n.domain, count: parseInt(n.count, 10),
                    })),
                    avgWeight: Math.round((parseFloat(graphHealth?.avg_weight) || 0) * 1000) / 1000,
                    avgSalience: Math.round((parseFloat(graphHealth?.avg_salience) || 0) * 1000) / 1000,
                    avgSpecificity: Math.round((parseFloat(graphHealth?.avg_specificity) || 0) * 1000) / 1000,
                    recentBreakthroughs: parseInt(recentBreakthroughs?.count, 10) || 0,
                },
                overfitting,
                tuningCycles: parseInt(tuningCount?.count, 10) || 0,
            };
        }

        // =====================================================================
        // SNAPSHOT — Save/restore/list parameter snapshots
        // =====================================================================
        case 'snapshot': {
            const { snapshotAction, snapshotId, snapshotLabel, contributor = 'claude' } = params;

            if (!snapshotAction) {
                return { error: 'snapshotAction is required: "save", "restore", or "list"' };
            }

            const base = getApiBaseUrl();

            switch (snapshotAction) {
                case 'save': {
                    const label = snapshotLabel || `snapshot-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}`;

                    // Fetch current config
                    let currentConfig: any;
                    try {
                        const res = await securedFetch(`${base}/api/config`);
                        if (!res.ok) return { error: `API server not responding (${res.status})` };
                        currentConfig = await res.json();
                    } catch (err: any) {
                        return { error: `Failed to reach API server: ${err.message}` };
                    }

                    // Extract only tunable parameters (not secrets)
                    const paramLookup = buildParamLookup();
                    const tunableParams: Record<string, any> = {};
                    for (const [pathStr, meta] of Object.entries(paramLookup)) {
                        const value = getNestedValue(currentConfig, meta.configPath);
                        if (value !== undefined) {
                            tunableParams[pathStr] = value;
                        }
                    }

                    const metrics = await getQuickMetrics();
                    const id = generateUuid();
                    const projectName = getCurrentProjectName();

                    await systemQuery(`
                        INSERT INTO config_snapshots (id, label, parameters, metrics_at_save, created_by, project_name)
                        VALUES ($1, $2, $3, $4, $5, $6)
                    `, [id, label, JSON.stringify(tunableParams), JSON.stringify(metrics), contributor, projectName]);

                    // Prune: keep at most 10 per project
                    await systemQuery(`
                        DELETE FROM config_snapshots WHERE id IN (
                            SELECT id FROM config_snapshots
                            WHERE project_name = $1
                            ORDER BY created_at DESC
                            LIMIT -1 OFFSET 10
                        )
                    `, [projectName]);

                    // === Know Thyself: seed snapshot save event ===
                    await seedTuningKnowledge({
                        content: formatSnapshotSeed('save', label, metrics, undefined, contributor),
                        nodeType: 'seed',
                        salience: 0.5,
                        contributor,
                    });

                    return {
                        success: true,
                        snapshotId: id,
                        label,
                        parameterCount: Object.keys(tunableParams).length,
                        metricsAtSave: metrics,
                        createdAt: new Date().toISOString(),
                    };
                }

                case 'list': {
                    const { project: filterProject, allProjects } = params;
                    let snapshots: any[];

                    if (allProjects) {
                        snapshots = await systemQuery(`
                            SELECT id, label, created_by, created_at, project_name, metrics_at_save
                            FROM config_snapshots
                            ORDER BY created_at DESC
                            LIMIT 50
                        `);
                    } else {
                        const projectName = filterProject || getCurrentProjectName();
                        snapshots = await systemQuery(`
                            SELECT id, label, created_by, created_at, project_name, metrics_at_save
                            FROM config_snapshots
                            WHERE project_name = $1
                            ORDER BY created_at DESC
                            LIMIT 20
                        `, [projectName]);
                    }

                    return {
                        count: snapshots.length,
                        currentProject: getCurrentProjectName(),
                        snapshots: snapshots.map((s: any) => {
                            const metrics = s.metrics_at_save ? JSON.parse(s.metrics_at_save) : null;
                            return {
                                id: s.id,
                                label: s.label,
                                createdBy: s.created_by,
                                createdAt: s.created_at,
                                projectName: s.project_name,
                                synthSuccessRate: metrics?.synthesisSuccessRate ?? null,
                            };
                        }),
                    };
                }

                case 'restore': {
                    if (!snapshotId) return { error: 'snapshotId is required for restore' };

                    const snapshot = await systemQueryOne(`
                        SELECT * FROM config_snapshots WHERE id = $1
                    `, [snapshotId]);

                    if (!snapshot) {
                        return { error: `Snapshot not found: ${snapshotId}` };
                    }

                    const savedParams = JSON.parse(snapshot.parameters);
                    const paramLookup = buildParamLookup();

                    // Fetch current config
                    let currentConfig: any;
                    try {
                        const res = await securedFetch(`${base}/api/config`);
                        if (!res.ok) return { error: `API server not responding (${res.status})` };
                        currentConfig = await res.json();
                    } catch (err: any) {
                        return { error: `Failed to reach API server: ${err.message}` };
                    }

                    const updateObj: any = {};
                    const restored: any[] = [];
                    const metricsBefore = await getQuickMetrics();

                    for (const [pathStr, savedValue] of Object.entries(savedParams)) {
                        const meta = paramLookup[pathStr];
                        if (!meta) continue;

                        const currentValue = getNestedValue(currentConfig, meta.configPath);
                        if (currentValue === savedValue) continue; // skip unchanged

                        setNestedValue(updateObj, meta.configPath, savedValue);
                        restored.push({
                            configPath: meta.configPath,
                            oldValue: currentValue,
                            newValue: savedValue,
                            label: meta.label,
                        });
                    }

                    // --- Persist changes (local config + DB, then sync API server) ---
                    if (restored.length > 0) {
                        // 0. Reload from DB — don't overwrite GUI changes with stale MCP memory
                        await loadSavedConfig();

                        // 1. Update local MCP process config + persist to settings table
                        await updateConfig(updateObj);

                        // 2. Sync API server's in-memory config (best-effort)
                        try {
                            const applyRes = await securedFetch(`${base}/api/config`, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(updateObj),
                            });
                            if (!applyRes.ok) {
                                console.warn('[config-tune] API server sync failed during restore (changes persisted to DB)');
                            }
                        } catch (err: any) {
                            console.warn(`[config-tune] API server unreachable during restore (changes persisted to DB): ${err.message}`);
                        }

                        // 3. Write audit trail AFTER persistence succeeds
                        const projectName = getCurrentProjectName();
                        for (const entry of restored) {
                            const pathStr = entry.configPath.join('.');
                            const meta = paramLookup[pathStr];
                            try {
                                await systemQuery(`
                                    INSERT INTO config_history
                                    (config_path, old_value, new_value, changed_by, contributor, reason, section_id, metrics_before, snapshot_id, project_name)
                                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                                `, [
                                    pathStr,
                                    JSON.stringify(entry.oldValue),
                                    JSON.stringify(entry.newValue),
                                    contributor.startsWith('human') ? 'human' : 'system',
                                    contributor,
                                    `Restored from snapshot: ${snapshot.label}`,
                                    meta?.sectionId || null,
                                    JSON.stringify(metricsBefore),
                                    snapshotId,
                                    projectName,
                                ]);
                            } catch (err: any) {
                                console.error('[config-tune] Audit trail write failed:', err.message);
                            }
                        }
                    }

                    // === Know Thyself: seed snapshot restore event ===
                    if (restored.length > 0) {
                        const currentMetrics = await getQuickMetrics();
                        await seedTuningKnowledge({
                            content: formatSnapshotSeed('restore', snapshot.label, currentMetrics, restored.length, contributor),
                            nodeType: 'seed',
                            salience: 0.7,
                            contributor,
                        });
                    }

                    return {
                        success: true,
                        snapshotId,
                        snapshotLabel: snapshot.label,
                        restoredCount: restored.length,
                        restored,
                    };
                }

                default:
                    return { error: `Unknown snapshotAction: ${snapshotAction}. Use "save", "restore", or "list".` };
            }
        }

        // =====================================================================
        // HISTORY — View parameter change audit log
        // =====================================================================
        case 'history': {
            const { limit = 20, sectionId, configPath } = params;

            let whereClause = '';
            const sqlParams: any[] = [];
            let paramIndex = 1;

            // Default to current project
            const projectName = params.project || getCurrentProjectName();
            whereClause += ` AND project_name = $${paramIndex++}`;
            sqlParams.push(projectName);

            if (sectionId) {
                whereClause += ` AND section_id = $${paramIndex++}`;
                sqlParams.push(sectionId);
            }
            if (configPath) {
                const pathStr = Array.isArray(configPath) ? configPath.join('.') : configPath;
                whereClause += ` AND config_path = $${paramIndex++}`;
                sqlParams.push(pathStr);
            }

            sqlParams.push(limit);

            const changes = await systemQuery(`
                SELECT * FROM config_history
                WHERE 1=1 ${whereClause}
                ORDER BY created_at DESC
                LIMIT $${paramIndex}
            `, sqlParams);

            const total = await systemQueryOne(`
                SELECT COUNT(*) as count FROM config_history
                WHERE 1=1 ${whereClause}
            `, sqlParams.slice(0, -1)); // exclude limit param

            const paramLookup = buildParamLookup();

            return {
                count: changes.length,
                total: parseInt(total?.count, 10) || 0,
                changes: changes.map((c: any) => {
                    const meta = paramLookup[c.config_path];
                    const sectionMeta = meta ? SECTION_METADATA[meta.sectionId] : null;
                    return {
                        id: c.id,
                        configPath: c.config_path,
                        label: meta?.label ?? null,
                        description: meta?.description ?? null,
                        sectionTitle: sectionMeta?.title ?? null,
                        oldValue: c.old_value ? JSON.parse(c.old_value) : null,
                        newValue: JSON.parse(c.new_value),
                        changedBy: c.changed_by,
                        contributor: c.contributor,
                        reason: c.reason,
                        sectionId: c.section_id,
                        snapshotId: c.snapshot_id,
                        createdAt: c.created_at,
                    };
                }),
            };
        }

        // =====================================================================
        // REFLECT — Synthesize recent tuning history for graph knowledge
        // =====================================================================
        case 'reflect': {
            const { days = 7, contributor = 'claude' } = params;

            // 1. Gather recent config changes
            let recentChanges: any[] = [];
            try {
                recentChanges = await systemQuery(`
                    SELECT config_path, old_value, new_value, reason, contributor, created_at
                    FROM config_history
                    WHERE ${withinDays('created_at', '$1')}
                    ORDER BY created_at DESC
                    LIMIT 30
                `, [days]);
            } catch { /* table may not exist */ }

            if (recentChanges.length === 0) {
                return {
                    success: false,
                    reason: 'No config changes in the specified period. Nothing to reflect on.',
                };
            }

            // 2. Get current overfitting state
            const overfitting = await detectOverfitting(days);

            // 3. Get current quick metrics
            const metrics = await getQuickMetrics();

            // 4. Get recent tuning seeds from the graph
            let recentTuningNodes: any[] = [];
            try {
                recentTuningNodes = await query(`
                    SELECT id, content, node_type, weight, created_at
                    FROM nodes
                    WHERE archived = 0 AND domain = 'tuning'
                    ORDER BY created_at DESC
                    LIMIT 10
                `);
            } catch { /* tuning domain may not exist yet */ }

            // 5. Build reflection context
            const changesSummary = recentChanges.map((c: any) => ({
                path: c.config_path,
                from: c.old_value ? JSON.parse(c.old_value) : null,
                to: JSON.parse(c.new_value),
                reason: c.reason,
                by: c.contributor,
                at: c.created_at,
            }));

            const parentIdsList = recentTuningNodes.map((n: any) => `"${n.id}"`).join(', ');

            return {
                success: true,
                mode: 'reflect',
                context: {
                    periodDays: days,
                    changeCount: recentChanges.length,
                    changes: changesSummary,
                    currentMetrics: metrics,
                    overfitting,
                    recentTuningNodes: recentTuningNodes.map((n: any) => ({
                        id: n.id,
                        content: n.content,
                        type: n.node_type,
                        createdAt: n.created_at,
                    })),
                },
                instructions: `Synthesize a reflection on the tuning activity over the past ${days} days. Consider: 1) What was the overall tuning trajectory? (improvement, degradation, oscillation, stability) 2) Which parameter changes had the most impact? 3) Are there patterns in what works vs. what doesn't? 4) What should be tried next, or avoided? Save your reflection via podbit.propose with: nodeType: "synthesis", domain: "tuning", contributor: "${contributor}", parentIds: [${parentIdsList}]`,
            };
        }

        default:
            return {
                error: `Unknown action: ${action}. Available actions: get, sections, tune, apply, metrics, snapshot, history, reflect`,
            };
    }
}
