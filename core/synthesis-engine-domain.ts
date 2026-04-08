/**
 * Synthesis engine — domain sampling utilities.
 * Extracted from synthesis-engine.ts: system-domain cache, niching, pair selection, cold node sampling.
 */

import { query } from '../db.js';
import { config as appConfig } from '../config.js';
import { config } from './engine-config.js';
import { getAccessibleDomains, getPartitionForDomain, getPartitionTopNodes, getTransientDomains } from './governance.js';
import { inverseWeightedRandom } from '../db/sql.js';
import type { ResonanceNode } from './types.js';

// =============================================================================
// SYSTEM DOMAIN EXCLUSION
// System partition domains (e.g. "tuning" in know-thyself) are auto-populated
// by the config-tune system. They synthesize INTERNALLY within their own
// partition but must never have output assigned to non-system domains.
// Bridge guards (governance.ts) prevent cross-partition contamination.
// =============================================================================

let _systemDomainsCache: string[] | null = null;
let _systemDomainsCacheTime = 0;
const SYSTEM_DOMAINS_CACHE_TTL = 60_000; // 1 minute

/**
 * Return the list of system-partition domain names (e.g. `"tuning"` from `know-thyself`).
 *
 * Results are cached for {@link SYSTEM_DOMAINS_CACHE_TTL} ms (1 minute) to avoid
 * repeated DB queries during tight synthesis loops.
 *
 * @returns Array of domain name strings belonging to system partitions.
 */
export async function getSystemDomains(): Promise<string[]> {
    const now = Date.now();
    if (_systemDomainsCache && now - _systemDomainsCacheTime < SYSTEM_DOMAINS_CACHE_TTL) {
        return _systemDomainsCache;
    }
    try {
        const rows = await query(
            `SELECT pd.domain FROM partition_domains pd
             JOIN domain_partitions dp ON dp.id = pd.partition_id
             WHERE dp.system = 1`
        );
        _systemDomainsCache = (rows as any[]).map(r => r.domain);
    } catch {
        _systemDomainsCache = [];
    }
    _systemDomainsCacheTime = now;
    return _systemDomainsCache;
}

/**
 * Check whether a domain belongs to a system partition.
 *
 * @param domain - The domain name to test (may be `null`).
 * @param systemDomains - Pre-fetched list from {@link getSystemDomains}.
 * @returns `true` if the domain is in the system-domains list.
 */
export function isSystemDomain(domain: string | null, systemDomains: string[]): boolean {
    return domain !== null && systemDomains.includes(domain);
}

// =============================================================================
// NICHING — GA-inspired domain diversity protection
// =============================================================================

/**
 * Select a domain for synthesis sampling using niching (fitness sharing).
 *
 * Examines recent synthesis cycle distribution and identifies domains that have
 * received fewer cycles than their fair share. A random underrepresented domain
 * is returned so the caller can constrain the next synthesis cycle to it.
 *
 * @returns An underrepresented domain name, or `null` if niching is disabled,
 *          there is insufficient data, or all domains are adequately represented.
 */
export async function selectDomainWithNiching(): Promise<string | null> {
    if (!appConfig.synthesisEngine.nichingEnabled) return null;

    const lookback = appConfig.synthesisEngine.nichingLookbackCycles;
    const minShare = appConfig.synthesisEngine.nichingMinShare;

    // Get all active domains, excluding system domains and non-active transient domains
    const sysDomains = await getSystemDomains();
    const { states: transientStates } = await getTransientDomains();
    const allDomains = await query(`
        SELECT domain, COUNT(*) as node_count FROM nodes
        WHERE archived = FALSE AND node_type != 'raw' AND domain IS NOT NULL
        GROUP BY domain
    `);
    const domains = (allDomains as any[]).filter(d => {
        if (sysDomains.includes(d.domain)) return false;
        const tState = transientStates.get(d.domain);
        return !tState || tState === 'active';
    });
    if (domains.length <= 1) return null;

    // Get domain distribution in recent synthesis cycles
    const recentCycles = await query(`
        SELECT domain, COUNT(*) as cycle_count FROM dream_cycles
        WHERE domain IS NOT NULL AND completed_at > datetime('now', '-1 day')
        GROUP BY domain
        LIMIT $1
    `, [lookback * 10]);

    const cycleCounts: Record<string, number> = {};
    let totalCycles = 0;
    for (const row of recentCycles as any[]) {
        if (row.domain) {
            cycleCounts[row.domain] = (cycleCounts[row.domain] || 0) + row.cycle_count;
            totalCycles += row.cycle_count;
        }
    }

    if (totalCycles < lookback * 0.5) return null; // Not enough data yet

    // Find underrepresented domains
    const fairShare = 1.0 / domains.length;
    const threshold = Math.max(minShare, fairShare);
    const underrepresented: string[] = [];

    for (const d of domains as any[]) {
        const share = (cycleCounts[d.domain] || 0) / totalCycles;
        if (share < threshold) underrepresented.push(d.domain);
    }

    if (underrepresented.length === 0) return null;

    // Pick randomly from underrepresented domains
    return underrepresented[Math.floor(Math.random() * underrepresented.length)];
}

// =============================================================================
// DOMAIN-DIRECTED SYNTHESIS — top-down underserved domain pair selection
// =============================================================================

/**
 * Find bridged domain pairs ranked by how underserved they are.
 *
 * Builds all valid cross-domain pairs (same partition or bridged), then scores
 * each by `min(nodeCount) / (recentSyntheses + 1)` with jitter. Returns the
 * most underserved pair for domain-directed synthesis.
 *
 * @param constraintDomain - If provided, at least one domain in the pair must match this value.
 * @returns The most underserved `{ domainA, domainB }` pair, or `null` if fewer than 2 eligible domains exist.
 */
export async function selectDomainPair(constraintDomain?: string | null): Promise<{ domainA: string; domainB: string } | null> {
    const lookbackDays = appConfig.synthesisEngine.domainDirectedLookbackDays;

    // Get all domains with active node counts, excluding system domains and non-active transient domains
    const systemDomains = await getSystemDomains();
    const { states: transientStates2 } = await getTransientDomains();
    const allDomains = await query(`
        SELECT domain, COUNT(*) as node_count FROM nodes
        WHERE archived = FALSE AND node_type != 'raw' AND domain IS NOT NULL AND embedding IS NOT NULL
        GROUP BY domain HAVING COUNT(*) >= 3
    `);
    const domains = (allDomains as any[]).filter(d => {
        if (systemDomains.includes(d.domain)) return false;
        const tState = transientStates2.get(d.domain);
        return !tState || tState === 'active';
    });
    if (domains.length < 2) return null;

    const domainNames = domains.map((d: any) => d.domain);
    const nodeCounts: Record<string, number> = {};
    for (const d of domains as any[]) nodeCounts[d.domain] = d.node_count;

    // Build valid cross-domain pairs (same partition or bridged)
    const pairs: { domainA: string; domainB: string }[] = [];
    for (let i = 0; i < domainNames.length; i++) {
        const accessible = await getAccessibleDomains(domainNames[i]);
        for (let j = i + 1; j < domainNames.length; j++) {
            if (accessible.includes(domainNames[j])) {
                // If constraintDomain set, at least one must match
                if (constraintDomain && domainNames[i] !== constraintDomain && domainNames[j] !== constraintDomain) continue;
                pairs.push({ domainA: domainNames[i], domainB: domainNames[j] });
            }
        }
    }
    if (pairs.length === 0) return null;

    // Get recent cross-domain synthesis counts
    const recentSyntheses = await query(`
        SELECT domain, COUNT(*) as cnt FROM dream_cycles
        WHERE created_child = 1
          AND completed_at > datetime('now', '-' || $1 || ' days')
          AND domain IS NOT NULL
        GROUP BY domain
    `, [lookbackDays]);

    const synthCounts: Record<string, number> = {};
    for (const r of recentSyntheses as any[]) synthCounts[r.domain] = r.cnt;

    // Score each pair: min(nodeCount) / (recentSyntheses + 1) — higher = more underserved
    let bestPair: { domainA: string; domainB: string } | null = null;
    let bestScore = -1;

    for (const pair of pairs) {
        const minNodes = Math.min(nodeCounts[pair.domainA] || 0, nodeCounts[pair.domainB] || 0);
        const recentA = synthCounts[pair.domainA] || 0;
        const recentB = synthCounts[pair.domainB] || 0;
        const score = minNodes / (recentA + recentB + 1);

        // Add some randomization to avoid always picking the same pair
        const jitteredScore = score * (0.8 + Math.random() * 0.4);
        if (jitteredScore > bestScore) {
            bestScore = jitteredScore;
            bestPair = pair;
        }
    }

    return bestPair;
}

/**
 * Sample a single cold node from a domain using inverse-salience weighting.
 *
 * Low-salience nodes are MORE likely to be selected, ensuring underexplored
 * nodes get synthesis opportunities. Excludes `question`, `raw`, and
 * `elite_verification` node types, and nodes below the salience floor.
 *
 * @param domain - The domain to sample from.
 * @returns A single {@link ResonanceNode}, or `null` if none qualify.
 */
export async function sampleColdNode(domain: string): Promise<ResonanceNode | null> {
    const orderByCold = `ORDER BY ${inverseWeightedRandom('salience')}`;

    const rows = await query(`
        SELECT id, content, embedding, weight, salience, specificity, domain
        FROM nodes
        WHERE archived = FALSE
          AND domain = $1
          AND embedding IS NOT NULL
          AND node_type NOT IN ('question', 'raw', 'elite_verification')
          AND COALESCE(synthesizable, 1) != 0
          AND salience > $2
        ${orderByCold}
        LIMIT 1
    `, [domain, config.salienceFloor]);

    return (rows as any[])[0] ?? null;
}

// Re-export getPartitionForDomain + getPartitionTopNodes used by synthesis-engine.ts candidate sampling
export { getPartitionForDomain, getPartitionTopNodes };
