/**
 * Config tuning — behavioral entropy analysis and overfitting detection.
 */
import { query, queryOne, systemQuery, systemQueryOne } from '../../core.js';
import { withinDays } from '../../db/sql.js';
import {
    type BehavioralAnalysis,
    type BehavioralEntropyResult,
    type EnvironmentChangeResult,
    BEHAVIORAL_WEIGHTS,
    BEHAVIORAL_NORMALIZATION,
    CONVERGENCE_RATIO,
    MIN_IMPACT,
    ENVIRONMENT_CHANGE_THRESHOLD,
} from './types.js';

// =============================================================================
// BEHAVIORAL ENTROPY ANALYSIS
// =============================================================================

/**
 * Compute behavioral entropy for parameters flagged as structurally oscillating.
 *
 * For each oscillating config path, computes weighted normalized impact deltas
 * between consecutive changes, builds per-value profiles, and classifies as
 * genuine oscillation vs. convergence based on impact ratio thresholds.
 *
 * @param oscillatingPaths - Config paths that changed back-and-forth (>=4 changes, <=2 distinct values).
 * @param days - Lookback window for change history.
 * @returns `{ genuineOscillation, convergingParameters, analyses }` with per-path classification.
 */
export async function computeBehavioralEntropy(
    oscillatingPaths: string[],
    days: number,
): Promise<BehavioralEntropyResult> {
    const analyses: BehavioralAnalysis[] = [];
    const genuineOscillation: string[] = [];
    const convergingParameters: BehavioralEntropyResult['convergingParameters'] = [];

    for (const configPath of oscillatingPaths) {
        const changes = await systemQuery(`
            SELECT config_path, new_value, metrics_before, created_at
            FROM config_history
            WHERE config_path = $1
              AND ${withinDays('created_at', '$2')}
            ORDER BY created_at ASC
        `, [configPath, days]);

        if (changes.length < 2) {
            analyses.push({
                configPath,
                classification: 'insufficient_data',
                valueProfiles: [],
                impactRatio: 0,
                bestValue: '',
                entropyScore: 0,
            });
            genuineOscillation.push(configPath);
            continue;
        }

        // Compute behavioral deltas from consecutive entries
        // metrics_before[i+1] serves as proxy for metrics_after[i]
        const valueImpacts = new Map<string, { impacts: number[]; deltas: Array<{ d: number | null; r: number | null; s: number | null }> }>();

        for (let i = 0; i < changes.length - 1; i++) {
            let metricsCurr: any = null;
            let metricsNext: any = null;
            try { metricsCurr = JSON.parse(changes[i].metrics_before); } catch { continue; }
            try { metricsNext = JSON.parse(changes[i + 1].metrics_before); } catch { continue; }
            if (!metricsCurr || !metricsNext) continue;

            const deltaSynthesis = (metricsNext.synthesisSuccessRate != null && metricsCurr.synthesisSuccessRate != null)
                ? metricsNext.synthesisSuccessRate - metricsCurr.synthesisSuccessRate : null;
            const deltaResonance = (metricsNext.avgResonance != null && metricsCurr.avgResonance != null)
                ? metricsNext.avgResonance - metricsCurr.avgResonance : null;
            const deltaSpecificity = (metricsNext.avgSpecificity != null && metricsCurr.avgSpecificity != null)
                ? metricsNext.avgSpecificity - metricsCurr.avgSpecificity : null;

            // Weighted normalized impact
            let impact = 0;
            let weightSum = 0;
            if (deltaSynthesis != null) {
                impact += (deltaSynthesis / BEHAVIORAL_NORMALIZATION.synthesisSuccessRate) * BEHAVIORAL_WEIGHTS.synthesisSuccessRate;
                weightSum += BEHAVIORAL_WEIGHTS.synthesisSuccessRate;
            }
            if (deltaResonance != null) {
                impact += (deltaResonance / BEHAVIORAL_NORMALIZATION.avgResonance) * BEHAVIORAL_WEIGHTS.avgResonance;
                weightSum += BEHAVIORAL_WEIGHTS.avgResonance;
            }
            if (deltaSpecificity != null) {
                impact += (deltaSpecificity / BEHAVIORAL_NORMALIZATION.avgSpecificity) * BEHAVIORAL_WEIGHTS.avgSpecificity;
                weightSum += BEHAVIORAL_WEIGHTS.avgSpecificity;
            }
            if (weightSum > 0) impact /= weightSum;

            const value = changes[i].new_value;
            if (!valueImpacts.has(value)) valueImpacts.set(value, { impacts: [], deltas: [] });
            valueImpacts.get(value)!.impacts.push(impact);
            valueImpacts.get(value)!.deltas.push({ d: deltaSynthesis, r: deltaResonance, s: deltaSpecificity });
        }

        // Build per-value profiles
        const valueProfiles: BehavioralAnalysis['valueProfiles'] = [];
        for (const [value, data] of valueImpacts.entries()) {
            const avg = (arr: (number | null)[]) => {
                const valid = arr.filter((v): v is number => v != null);
                return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
            };
            const avgImpact = data.impacts.reduce((a, b) => a + b, 0) / data.impacts.length;
            valueProfiles.push({
                value,
                occurrences: data.impacts.length,
                avgImpact: Math.round(avgImpact * 10000) / 10000,
                rawDeltas: {
                    synthesisSuccessRate: avg(data.deltas.map(d => d.d)) != null
                        ? Math.round(avg(data.deltas.map(d => d.d))! * 10000) / 10000 : null,
                    avgResonance: avg(data.deltas.map(d => d.r)) != null
                        ? Math.round(avg(data.deltas.map(d => d.r))! * 10000) / 10000 : null,
                    avgSpecificity: avg(data.deltas.map(d => d.s)) != null
                        ? Math.round(avg(data.deltas.map(d => d.s))! * 10000) / 10000 : null,
                },
            });
        }

        // Classify: convergence vs oscillation
        if (valueProfiles.length < 2) {
            analyses.push({
                configPath, classification: 'insufficient_data', valueProfiles,
                impactRatio: 0, bestValue: '', entropyScore: 0,
            });
            genuineOscillation.push(configPath);
            continue;
        }

        const absImpacts = valueProfiles.map(p => Math.abs(p.avgImpact));
        const maxAbs = Math.max(...absImpacts);
        const minAbs = Math.min(...absImpacts);

        if (maxAbs < MIN_IMPACT) {
            analyses.push({
                configPath, classification: 'insufficient_data', valueProfiles,
                impactRatio: 0, bestValue: '', entropyScore: 0,
            });
            genuineOscillation.push(configPath);
            continue;
        }

        const impactRatio = minAbs > 0 ? maxAbs / minAbs : Infinity;
        const entropyScore = minAbs > 0 ? minAbs / maxAbs : 0; // 0 = convergent, 1 = oscillation
        const bestProfile = valueProfiles.reduce((a, b) =>
            a.avgImpact > b.avgImpact ? a : b
        );
        const classification = impactRatio >= CONVERGENCE_RATIO ? 'convergence' : 'oscillation';

        analyses.push({
            configPath, classification, valueProfiles,
            impactRatio: Math.round(impactRatio * 100) / 100,
            bestValue: bestProfile.value,
            entropyScore: Math.round(entropyScore * 1000) / 1000,
        });

        if (classification === 'oscillation') {
            genuineOscillation.push(configPath);
        } else {
            convergingParameters.push({
                configPath,
                bestValue: bestProfile.value,
                impactRatio: Math.round(impactRatio * 100) / 100,
                recommendation: `Parameter ${configPath} shows convergence toward ${bestProfile.value} (${impactRatio.toFixed(1)}x impact ratio). Persist this value.`,
            });
        }
    }

    return { genuineOscillation, convergingParameters, analyses };
}

// =============================================================================
// ENVIRONMENT CHANGE DETECTION
// =============================================================================

/**
 * Detect whether the system environment changed significantly during the analysis window.
 *
 * Checks 5 signals: subsystem assignment changes, graph growth percentage,
 * KB file ingestion count, snapshot restores, and new domain appearances.
 * Each signal contributes a capped score; if the total exceeds the
 * ENVIRONMENT_CHANGE_THRESHOLD, oscillation may be adaptive rather than pathological.
 *
 * @param days - Lookback window in days.
 * @returns `{ environmentChanged, changeScore, signals, ... }` with per-signal detail.
 */
export async function detectEnvironmentChanges(days: number): Promise<EnvironmentChangeResult> {
    const signals: string[] = [];
    let score = 0;

    // 1. Model / subsystem assignment changes
    let modelChanges = 0;
    try {
        const mc = await systemQueryOne(`
            SELECT COUNT(*) as cnt FROM subsystem_assignments
            WHERE ${withinDays('updated_at', '$1')}
        `, [days]);
        modelChanges = parseInt(mc?.cnt, 10) || 0;
        if (modelChanges > 0) {
            signals.push(`${modelChanges} subsystem assignment change(s)`);
            score += Math.min(modelChanges * 0.15, 0.4); // cap contribution at 0.4
        }
    } catch { /* table may not exist */ }

    // 2. Graph growth — compare active nodes now vs created before the window
    let graphGrowthPct = 0;
    try {
        const totalNow = await queryOne(`
            SELECT COUNT(*) as cnt FROM nodes WHERE archived = 0 AND node_type != 'raw'
        `, []);
        const createdInWindow = await queryOne(`
            SELECT COUNT(*) as cnt FROM nodes
            WHERE archived = 0 AND node_type != 'raw'
              AND ${withinDays('created_at', '$1')}
        `, [days]);
        const total = parseInt(totalNow?.cnt, 10) || 0;
        const recent = parseInt(createdInWindow?.cnt, 10) || 0;
        const priorCount = total - recent;
        graphGrowthPct = priorCount > 0 ? Math.round((recent / priorCount) * 100) : (recent > 0 ? 100 : 0);
        if (graphGrowthPct >= 10) {
            signals.push(`${graphGrowthPct}% graph growth (${recent} new nodes)`);
            score += Math.min(graphGrowthPct / 100, 0.3); // 100% growth → 0.3
        }
    } catch { /* nodes table should always exist */ }

    // 3. KB ingestion activity
    let kbIngestions = 0;
    try {
        const kb = await queryOne(`
            SELECT COUNT(*) as cnt FROM kb_files
            WHERE status = 'completed'
              AND ${withinDays('processed_at', '$1')}
        `, [days]);
        kbIngestions = parseInt(kb?.cnt, 10) || 0;
        if (kbIngestions > 0) {
            signals.push(`${kbIngestions} KB file(s) ingested`);
            score += Math.min(kbIngestions * 0.02, 0.3); // 15+ files → 0.3
        }
    } catch { /* kb_files may not exist */ }

    // 4. Snapshot restores (which cause bulk parameter changes that look like oscillation)
    let snapshotRestores = 0;
    try {
        const sr = await systemQueryOne(`
            SELECT COUNT(*) as cnt FROM config_history
            WHERE snapshot_id IS NOT NULL
              AND ${withinDays('created_at', '$1')}
        `, [days]);
        snapshotRestores = parseInt(sr?.cnt, 10) || 0;
        if (snapshotRestores > 0) {
            signals.push(`${snapshotRestores} parameter(s) restored from snapshot`);
            score += 0.3; // snapshot restore is a strong environment change signal
        }
    } catch { /* config_history may not exist */ }

    // 5. New domains appearing
    let newDomains = 0;
    try {
        const nd = await queryOne(`
            SELECT COUNT(DISTINCT domain) as cnt FROM nodes
            WHERE archived = 0 AND node_type != 'raw'
              AND ${withinDays('created_at', '$1')}
              AND domain NOT IN (
                  SELECT DISTINCT domain FROM nodes
                  WHERE archived = 0 AND node_type != 'raw'
                    AND created_at <= datetime('now', '-' || $1 || ' days')
              )
        `, [days]);
        newDomains = parseInt(nd?.cnt, 10) || 0;
        if (newDomains > 0) {
            signals.push(`${newDomains} new domain(s) appeared`);
            score += Math.min(newDomains * 0.1, 0.3);
        }
    } catch { /* non-critical */ }

    score = Math.min(score, 1.0); // cap at 1.0

    return {
        environmentChanged: score >= ENVIRONMENT_CHANGE_THRESHOLD,
        changeScore: Math.round(score * 1000) / 1000,
        signals,
        modelChanges,
        graphGrowthPct,
        kbIngestions,
        snapshotRestores,
        newDomains,
    };
}

// =============================================================================
// OVERFITTING DETECTION
// =============================================================================

/**
 * Detect overfitting in the synthesis pipeline.
 *
 * Checks 5 signals: quality plateau (recent vs. prior success rate stagnation),
 * diversity collapse (single-domain concentration), metric oscillation (parameters
 * cycling between values), environment change mitigation, and rejection rate health.
 * Produces severity-proportional, environment-aware recommendations.
 *
 * @param days - Lookback window in days (default 7). Prior period is 2x this.
 * @returns Overfitting report with flags, rates, oscillating/converging params, and recommendation.
 */
export async function detectOverfitting(days: number = 7) {
    // 1. Quality plateau: compare recent success rate to prior period
    // Only count children that still exist and are not archived
    const recentStats = await queryOne(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN dc.created_child = 1
                  AND dc.child_node_id IS NOT NULL
                  AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = dc.child_node_id AND n.archived = 0)
                THEN 1 ELSE 0 END) as created
        FROM dream_cycles dc
        WHERE ${withinDays('dc.started_at', '$1')}
    `, [days]);

    const priorStats = await queryOne(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN dc.created_child = 1
                  AND dc.child_node_id IS NOT NULL
                  AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = dc.child_node_id AND n.archived = 0)
                THEN 1 ELSE 0 END) as created
        FROM dream_cycles dc
        WHERE dc.started_at > datetime('now', '-' || $1 || ' days')
          AND dc.started_at <= datetime('now', '-' || $2 || ' days')
    `, [days * 2, days]);

    const recentTotal = parseInt(recentStats?.total, 10) || 0;
    const recentCreated = parseInt(recentStats?.created, 10) || 0;
    const priorTotal = parseInt(priorStats?.total, 10) || 0;
    const priorCreated = parseInt(priorStats?.created, 10) || 0;

    const recentRate = recentTotal > 0 ? recentCreated / recentTotal : 0;
    const priorRate = priorTotal > 0 ? priorCreated / priorTotal : 0;
    const improvement = priorRate > 0
        ? (recentRate - priorRate) / priorRate
        : recentRate > 0 ? 1 : 0;  // 0→positive = 100% improvement; 0→0 = stagnant

    // Plateau = less than 5% change with enough data in BOTH windows for meaningful comparison
    const qualityPlateau = Math.abs(improvement) < 0.05 && recentTotal > 20 && priorTotal > 10;

    // 2. Diversity collapse: synthesis children concentrated in 1 domain
    const recentDomains = await query(`
        SELECT domain, COUNT(*) as count
        FROM nodes
        WHERE archived = 0
          AND origin = 'synthesis'
          AND ${withinDays('created_at', '$1')}
        GROUP BY domain
    `, [days]);
    const domainCount = recentDomains.length;
    const topDomainCount = parseInt(recentDomains[0]?.count, 10) || 0;
    const diversityCollapse = domainCount <= 1 && topDomainCount > 10;

    // 3. Metric oscillation: structural detection (parameters changed back and forth)
    let oscillations: any[] = [];
    try {
        oscillations = await systemQuery(`
            SELECT config_path, COUNT(*) as change_count,
                COUNT(DISTINCT new_value) as distinct_values
            FROM config_history
            WHERE ${withinDays('created_at', '$1')}
            GROUP BY config_path
            HAVING COUNT(*) >= 4 AND COUNT(DISTINCT new_value) <= 2
        `, [days]);
    } catch { /* table might not exist yet */ }

    // 3b. Behavioral entropy: distinguish genuine oscillation from convergence
    let behavioralResult: BehavioralEntropyResult | null = null;
    let genuineOscillation: string[] = oscillations.map((o: any) => o.config_path);
    let convergingParameters: BehavioralEntropyResult['convergingParameters'] = [];

    if (oscillations.length > 0) {
        try {
            behavioralResult = await computeBehavioralEntropy(
                oscillations.map((o: any) => o.config_path),
                days,
            );
            genuineOscillation = behavioralResult.genuineOscillation;
            convergingParameters = behavioralResult.convergingParameters;
        } catch {
            // Fall back to structural detection if behavioral analysis fails
        }
    }

    const metricOscillation = genuineOscillation.length > 0;

    // 4. Environment change detection — oscillation may be adaptive if the environment shifted
    const envChanges = await detectEnvironmentChanges(days);
    const oscillationMitigated = metricOscillation && envChanges.environmentChanged;

    // 5. Rejection rate sweet spot: 5-15% success is well-calibrated
    const rejectionRateHealthy = recentRate >= 0.05 && recentRate <= 0.15;

    // Build recommendation — severity-proportional, environment-aware
    let recommendation = '';
    if (metricOscillation && !oscillationMitigated) {
        // Oscillation in a stable environment — grade by success rate severity
        const paramList = genuineOscillation.join(', ');
        if (recentRate < 0.02) {
            // Severe: oscillating AND nothing works
            recommendation = `STOP TUNING. Parameters ${paramList} oscillating with near-zero success rate (${(recentRate * 100).toFixed(1)}%). Restore last known good snapshot and investigate input quality before tuning further.`;
        } else if (recentRate >= 0.05) {
            // Mild: oscillating but system is producing output
            recommendation = `Parameters ${paramList} are oscillating, but success rate is ${(recentRate * 100).toFixed(1)}%. Lock the better-performing values and focus tuning on other parameters.`;
        } else {
            // Moderate: oscillating with low success (2-5%)
            recommendation = `Parameters ${paramList} oscillating with low success rate (${(recentRate * 100).toFixed(1)}%). Consider restoring last snapshot, then tune one parameter at a time.`;
        }
    } else if (metricOscillation && oscillationMitigated) {
        // Oscillation but environment changed — may be adaptive
        const paramList = genuineOscillation.join(', ');
        recommendation = `Parameters ${paramList} changed back-and-forth, but the environment also changed (${envChanges.signals.join('; ')}). This may be adaptive tuning, not pathological oscillation. Continue monitoring.`;
    } else if (convergingParameters.length > 0) {
        const names = convergingParameters.map(p => p.configPath).join(', ');
        recommendation = `Convergence detected for ${names}. These parameters appear to oscillate structurally, but behavioral analysis shows a clear value preference. Persist the better-performing values rather than reverting.`;
    } else if (qualityPlateau && rejectionRateHealthy) {
        recommendation = 'System is well-calibrated. Quality is stable and rejection rate is in the healthy 5-15% range. No tuning needed.';
    } else if (qualityPlateau && !rejectionRateHealthy) {
        if (recentRate < 0.05) {
            recommendation = 'Quality plateaued but success rate is very low (<5%). Consider relaxing quality gates: synthesisJunkThreshold, synthesisMinSpecificity, subsetOverlapThreshold.';
        } else if (recentRate > 0.15) {
            recommendation = 'Quality plateaued but success rate is high (>15%). Quality gates may be too permissive. Consider tightening specificity and dedup thresholds.';
        }
    } else if (diversityCollapse) {
        recommendation = 'Synthesis output concentrated in one domain. Increase exploration (lower salienceBoost, faster salienceDecay) or seed more domains.';
    } else if (recentTotal < 20) {
        recommendation = 'Insufficient data for overfitting analysis. Let the synthesis engine run more cycles before tuning.';
    } else {
        recommendation = 'No overfitting signals detected. Continue monitoring.';
    }

    return {
        qualityPlateau,
        diversityCollapse,
        metricOscillation,
        oscillationMitigated,
        rejectionRateHealthy,
        recentSuccessRate: Math.round(recentRate * 1000) / 1000,
        priorSuccessRate: Math.round(priorRate * 1000) / 1000,
        improvementPct: Math.round(improvement * 1000) / 10,
        oscillatingParameters: genuineOscillation,
        convergingParameters,
        behavioralEntropy: behavioralResult?.analyses ?? [],
        environmentChanges: envChanges,
        recommendation,
    };
}
