/**
 * Config tuning — Know Thyself partition management, seeding, and content formatters.
 *
 * Know Thyself seeding is DISABLED by default. It writes tuning knowledge into the
 * active project's nodes table, which pollutes project databases. The config history
 * table already provides a full audit trail. Enable via settings if a separate
 * system-level DB is added in the future.
 */
import { RC } from '../../config/constants.js';
import { query, queryOne, systemQueryOne, createNode, createEdge } from '../../core.js';
import { invalidateKnowledgeCache } from '../knowledge.js';
import { state, type TuningSeedOptions } from './types.js';

/** Check if Know Thyself seeding is enabled. Reads from settings table, cached. */
let _seedingEnabled: boolean | null = null;
let _seedingCheckedAt = 0;
async function isSeedingEnabled(): Promise<boolean> {
    // Cache for 60 seconds
    if (_seedingEnabled !== null && Date.now() - _seedingCheckedAt < 60_000) return _seedingEnabled;
    try {
        const row = await systemQueryOne('SELECT value FROM settings WHERE key = $1', ['knowThyself.seedingEnabled']);
        _seedingEnabled = row?.value === 'true' || row?.value === '1';
    } catch {
        _seedingEnabled = false; // Default: disabled
    }
    _seedingCheckedAt = Date.now();
    return _seedingEnabled;
}
/** Reset cache when settings change externally. */
export function resetSeedingCache(): void { _seedingEnabled = null; }

// =============================================================================
// PARTITION INIT
// =============================================================================

/**
 * Ensure the Know Thyself system partition exists and owns the 'tuning' domain.
 *
 * Idempotent: skips if already initialized or if seeding is disabled.
 * Reclaims the 'tuning' domain from any stale auto-created partition (race condition
 * defense), restores the persisted overfitting hash from settings, and sets
 * `state.knowThyselfInitialized = true`.
 */
export async function ensureKnowThyselfPartition(): Promise<void> {
    if (state.knowThyselfInitialized) return;
    if (!await isSeedingEnabled()) { state.knowThyselfInitialized = true; return; }

    try {
        // Upsert partition — always ensure system=1 even if a stale non-system
        // partition was created by ensurePartition() before this ran.
        await query(
            `INSERT INTO domain_partitions (id, name, description, system) VALUES ($1, $2, $3, 1)
             ON CONFLICT (id) DO UPDATE SET system = 1`,
            [
                'know-thyself',
                'Know Thyself',
                'Meta-knowledge about system tuning, quality signals, and calibration history. Synthesis engine discovers patterns in how parameter changes affect system behavior.',
            ]
        );

        // Reclaim 'tuning' domain if it was assigned to a stale auto-created partition
        // (race condition: createNode → ensurePartition('tuning') before this init)
        const staleAssignment = await queryOne(
            `SELECT partition_id FROM partition_domains WHERE domain = $1 AND partition_id != 'know-thyself'`,
            ['tuning']
        );
        if (staleAssignment) {
            const staleId = staleAssignment.partition_id;
            await query('DELETE FROM partition_domains WHERE domain = $1 AND partition_id = $2', ['tuning', staleId]);
            // Remove any bridges to the stale partition
            await query('DELETE FROM partition_bridges WHERE partition_a = $1 OR partition_b = $1', [staleId]);
            // Delete the stale partition if now empty
            const remaining = await queryOne(
                'SELECT COUNT(*) as cnt FROM partition_domains WHERE partition_id = $1', [staleId]
            );
            if (!remaining || parseInt(remaining.cnt, 10) === 0) {
                await query('DELETE FROM domain_partitions WHERE id = $1', [staleId]);
            }
            console.error(`[know-thyself] Reclaimed 'tuning' domain from stale partition "${staleId}"`);
        }

        // Ensure tuning domain is in the partition
        await query(
            `INSERT OR IGNORE INTO partition_domains (partition_id, domain) VALUES ($1, $2)`,
            ['know-thyself', 'tuning']
        );

        // Restore persisted overfitting hash so we don't re-seed identical assessments after restart
        try {
            const row = await systemQueryOne('SELECT value FROM settings WHERE key = $1', ['knowthyself.overfittingHash']);
            if (row?.value) state.lastOverfittingHash = typeof row.value === 'string' ? row.value : null;
        } catch { /* settings table may not exist yet */ }

        state.knowThyselfInitialized = true;
    } catch (e: any) {
        console.error('[know-thyself] Partition init failed:', e.message);
    }
}

// =============================================================================
// SEEDING
// =============================================================================

/**
 * Seed a tuning knowledge node into the Know Thyself partition.
 *
 * Returns null without action if seeding is disabled, content is too short (<20 chars),
 * or node creation fails. Truncates content exceeding 2000 chars at a sentence boundary.
 *
 * @param options - Seed options: `content` (required), optional `nodeType`, `salience`,
 *   `contributor`, `parentIds`.
 * @returns Created node ID, or null if seeding was skipped/failed.
 */
export async function seedTuningKnowledge(options: TuningSeedOptions): Promise<string | null> {
    if (!await isSeedingEnabled()) return null;
    await ensureKnowThyselfPartition();

    let { content } = options;
    const {
        nodeType = 'seed',
        salience = 0.6,
        contributor = 'system',
    } = options;

    try {
        // Content length validation
        if (content.length < 20) return null;
        if (content.length > RC.contentLimits.knowThyselfTruncationChars) {
            content = content.substring(0, RC.contentLimits.knowThyselfTruncationChars).replace(/\.[^.]*$/, '.');
        }

        const node = await createNode(content, nodeType, 'config-tune', {
            domain: 'tuning',
            contributor,
            decidedByTier: contributor.startsWith('human') ? 'human' : 'system',
            salience,
            trajectory: 'knowledge',
        });

        if (!node) return null;

        // Create parent edges if specified
        if (options.parentIds && options.parentIds.length > 0) {
            for (const parentId of options.parentIds) {
                try {
                    await createEdge(parentId, node.id, 'parent');
                } catch { /* parent may not exist */ }
            }
        }

        invalidateKnowledgeCache('tuning');
        return node.id;
    } catch (e: any) {
        console.error('[know-thyself] Seed failed:', e.message);
        return null;
    }
}

// =============================================================================
// CONTENT FORMATTERS
// =============================================================================

/**
 * Format a human-readable seed content string describing config parameter changes.
 *
 * @param applied - Array of applied changes with configPath, oldValue, newValue, label.
 * @param reason - Optional reason for the change.
 * @param metricsBefore - System metrics captured before the change.
 * @param contributor - Who made the change.
 * @returns Formatted seed content string.
 */
export function formatConfigChangeSeed(
    applied: Array<{ configPath: string[]; oldValue: any; newValue: any; label: string }>,
    reason: string | null,
    metricsBefore: Record<string, any>,
    contributor: string,
): string {
    const changes = applied.map(a => {
        const direction = a.newValue > a.oldValue ? 'increased' : 'decreased';
        const pathStr = a.configPath.join('.');
        return `${direction} ${a.label} (${pathStr}) from ${a.oldValue} to ${a.newValue}`;
    });

    const metricsStr = metricsBefore.synthesisSuccessRate != null
        ? `Synthesis success rate was ${(metricsBefore.synthesisSuccessRate * 100).toFixed(1)}% with ${metricsBefore.totalNodes} active nodes and avg specificity ${metricsBefore.avgSpecificity?.toFixed(2) ?? 'unknown'}.`
        : 'Metrics unavailable at time of change.';

    const reasonStr = reason ? ` Reason: ${reason}.` : '';

    return `Tuning change by ${contributor}: ${changes.join('; ')}.${reasonStr} ${metricsStr}`;
}

/**
 * Format an overfitting assessment into a seed content string for the tuning domain.
 *
 * @param overfitting - Overfitting detection result from `detectOverfitting()`.
 * @returns Formatted seed content with signal descriptions and system recommendation.
 */
export function formatOverfittingSeed(overfitting: Record<string, any>): string {
    const signals: string[] = [];

    if (overfitting.qualityPlateau) {
        signals.push(`quality plateau detected: success rate stagnant at ${(overfitting.recentSuccessRate * 100).toFixed(1)}% (${overfitting.improvementPct}% change from prior period)`);
    }
    if (overfitting.diversityCollapse) {
        signals.push('diversity collapse: synthesis output concentrated in a single domain');
    }
    if (overfitting.metricOscillation && !overfitting.oscillationMitigated) {
        signals.push(`genuine metric oscillation: parameters ${overfitting.oscillatingParameters.join(', ')} are being changed back and forth with no behavioral difference`);
    } else if (overfitting.metricOscillation && overfitting.oscillationMitigated) {
        const env = overfitting.environmentChanges;
        const envDetail = env?.signals?.length > 0 ? ` (${env.signals.join('; ')})` : '';
        signals.push(`parameter oscillation detected but mitigated by environment changes${envDetail} — may be adaptive tuning`);
    }
    if (overfitting.convergingParameters?.length > 0) {
        const convDetails = overfitting.convergingParameters
            .map((p: any) => `${p.configPath} converging toward ${p.bestValue} (${p.impactRatio.toFixed(1)}x impact ratio)`)
            .join('; ');
        signals.push(`behavioral convergence detected (not true oscillation): ${convDetails}`);
    }
    if (overfitting.rejectionRateHealthy) {
        signals.push(`rejection rate healthy at ${(overfitting.recentSuccessRate * 100).toFixed(1)}%`);
    } else if (overfitting.recentSuccessRate < 0.05) {
        signals.push(`low success rate at ${(overfitting.recentSuccessRate * 100).toFixed(1)}%, below the 5% floor`);
    } else if (overfitting.recentSuccessRate > 0.15) {
        signals.push(`high success rate at ${(overfitting.recentSuccessRate * 100).toFixed(1)}%, above the 15% ceiling`);
    }

    return `Overfitting assessment: ${signals.join('. ')}. System recommendation: ${overfitting.recommendation}`;
}

/**
 * Format a snapshot save/restore event into a seed content string.
 *
 * @param action - 'save' or 'restore'.
 * @param label - Snapshot label.
 * @param metrics - Current system metrics.
 * @param restoredCount - Number of parameters restored (restore action only).
 * @param contributor - Who triggered the action.
 * @returns Formatted seed content string.
 */
export function formatSnapshotSeed(
    action: 'save' | 'restore',
    label: string,
    metrics: Record<string, any>,
    restoredCount?: number,
    contributor?: string,
): string {
    const metricsStr = metrics.synthesisSuccessRate != null
        ? `Success rate: ${(metrics.synthesisSuccessRate * 100).toFixed(1)}%, avg resonance: ${metrics.avgResonance?.toFixed(3) ?? 'unknown'}, ${metrics.totalNodes} nodes.`
        : 'Metrics unavailable.';

    if (action === 'save') {
        return `Config snapshot saved: "${label}" by ${contributor || 'unknown'}. ${metricsStr} This captures the current parameter state as a restoration point.`;
    } else {
        return `Config snapshot restored: "${label}" by ${contributor || 'unknown'}. ${restoredCount} parameters changed. ${metricsStr} Previous state was reverted, likely due to quality degradation or experimentation.`;
    }
}

/**
 * Compute a deterministic hash of overfitting state to deduplicate seed events.
 *
 * Combines plateau/collapse/oscillation flags, parameter lists, and success rate
 * into a pipe-delimited string. Same hash means same overfitting signal pattern.
 *
 * @param overfitting - Overfitting detection result.
 * @returns Pipe-delimited hash string.
 */
export function computeOverfittingHash(overfitting: Record<string, any>): string {
    return [
        overfitting.qualityPlateau ? '1' : '0',
        overfitting.diversityCollapse ? '1' : '0',
        overfitting.metricOscillation ? '1' : '0',
        overfitting.oscillationMitigated ? 'm' : '0',
        overfitting.oscillatingParameters?.sort().join(',') || '',
        overfitting.convergingParameters?.map((p: any) => `${p.configPath}:${p.bestValue}`).sort().join(',') || '',
        Math.round(overfitting.recentSuccessRate * 100).toString(),
    ].join('|');
}
