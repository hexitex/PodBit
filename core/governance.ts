/**
 * Partition Governance — enforcement, decision logging, and domain isolation.
 *
 * Manages the partition system that controls which domains can synthesize together:
 * - Partition isolation: domains in different partitions cannot cross-pollinate unless bridged
 * - Transient domains: temporary visitors with a quarantine/active/departing lifecycle
 * - Decision audit trail: every partition/domain change is logged with tier provenance
 * - Cycle exclusion: per-partition control over which autonomous cycles can run
 * - Domain renaming: propagates renames across all 9+ tables referencing domain strings
 */

import { query, queryOne } from '../db.js';
import type { OverrideResult } from './types.js';

// =============================================================================
// TRANSIENT DOMAIN CACHE
// Transient partitions are temporary visitors with a lifecycle:
//   quarantine → active → departing → departed
// Only 'active' transient domains participate in synthesis.
// =============================================================================

let _transientDomainsCache: { domains: string[]; states: Map<string, string> } | null = null;
let _transientDomainsCacheTime = 0;
const TRANSIENT_CACHE_TTL = 60_000; // 1 minute

/**
 * Load transient partition domains and their lifecycle states.
 * Results are cached for 1 minute (TRANSIENT_CACHE_TTL).
 *
 * @returns Object with `domains` (all transient domain names) and `states` (domain to lifecycle state map)
 */
async function getTransientDomains(): Promise<{ domains: string[]; states: Map<string, string> }> {
    const now = Date.now();
    if (_transientDomainsCache && now - _transientDomainsCacheTime < TRANSIENT_CACHE_TTL) {
        return _transientDomainsCache;
    }
    try {
        const rows = await query(`
            SELECT pd.domain, dp.state FROM partition_domains pd
            JOIN domain_partitions dp ON dp.id = pd.partition_id
            WHERE dp.transient = 1
        `);
        const domains = (rows as any[]).map(r => r.domain);
        const states = new Map((rows as any[]).map(r => [r.domain, r.state || 'active']));
        _transientDomainsCache = { domains, states };
    } catch {
        _transientDomainsCache = { domains: [], states: new Map() };
    }
    _transientDomainsCacheTime = now;
    return _transientDomainsCache;
}

/**
 * Check if a domain belongs to a transient partition.
 *
 * @param domain - Domain name to check, or null
 * @param transientDomains - Pre-fetched list of transient domain names (from getTransientDomains)
 * @returns True if the domain is in the transient domains list
 */
function isTransientDomain(domain: string | null, transientDomains: string[]): boolean {
    return domain !== null && transientDomains.includes(domain);
}

/** Clears transient-domains cache (e.g. after partition/state changes). */
function clearTransientCache(): void {
    _transientDomainsCache = null;
    _transientDomainsCacheTime = 0;
}

/**
 * Get all domains accessible from a given domain.
 * Enforces partition isolation:
 *   - If domain is in a partition -> returns that partition's domains + bridged partition domains
 *   - If domain is NOT in any partition -> returns only that domain (isolated)
 *
 * @param {string} domain
 * @returns {Promise<string[]>} accessible domain list
 */
async function getAccessibleDomains(domain: string): Promise<string[]> {
    if (!domain) return [];

    // Check if this domain belongs to a partition
    const partition = await queryOne(`
        SELECT partition_id FROM partition_domains WHERE domain = $1
    `, [domain]);

    if (!partition) {
        // Not in a partition -- strict isolation: only this domain
        return [domain];
    }

    // Get all domains in the same partition
    const ownDomains = await query(`
        SELECT domain FROM partition_domains WHERE partition_id = $1
    `, [partition.partition_id]);

    const accessible = new Set<string>(ownDomains.map((d: any) => d.domain));

    // Check for opt-in bridges to other partitions
    const bridges = await query(`
        SELECT partition_a, partition_b FROM partition_bridges
        WHERE partition_a = $1 OR partition_b = $1
    `, [partition.partition_id]);

    for (const bridge of bridges as any[]) {
        const bridgedId = bridge.partition_a === partition.partition_id
            ? bridge.partition_b
            : bridge.partition_a;
        const bridgedDomains = await query(`
            SELECT domain FROM partition_domains WHERE partition_id = $1
        `, [bridgedId]);
        for (const d of bridgedDomains as any[]) accessible.add(d.domain);
    }

    // Filter out quarantined/departed transient domains — only active transient domains participate
    const { states: transientStates } = await getTransientDomains();
    const result = [...accessible].filter(d => {
        const state = transientStates.get(d);
        return !state || state === 'active';
    });

    return result;
}

/**
 * System domains managed by dedicated init functions. ensurePartition must not
 * auto-create partitions for these, or they'll be created without system=1 and
 * auto-bridged to everything.
 */
const SYSTEM_MANAGED_DOMAINS = new Set(['tuning']);

/**
 * Ensure a domain has a partition, auto-creating one if missing.
 * Partition ID = domain name (kebab-case), name = Title Case.
 * If `project.autoBridge` setting is true, the new partition is auto-bridged
 * to all existing non-system, non-transient partitions.
 * Skips system-managed domains (e.g. tuning) which have dedicated init functions.
 *
 * @param domain - Domain name to ensure has a partition
 * @param decidedByTier - Tier provenance for the decision audit log (default: 'system')
 * @returns The partition ID, or null if the domain is empty or system-managed
 */
async function ensurePartition(domain: string, decidedByTier: string = 'system'): Promise<string | null> {
    if (!domain) return null;

    // Check if domain already belongs to a partition
    const existing = await queryOne(
        'SELECT partition_id FROM partition_domains WHERE domain = $1',
        [domain]
    );
    if (existing) return existing.partition_id;

    // System-managed domains have dedicated init functions (e.g. ensureKnowThyselfPartition)
    // that create their partition with the correct flags. Do not auto-create here.
    if (SYSTEM_MANAGED_DOMAINS.has(domain)) {
        return null;
    }

    // Derive partition id and name from the domain
    const partitionId = domain.toLowerCase().replace(/\s+/g, '-');
    const partitionName = domain
        .split(/[-_]/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

    // Create the partition (if not already existing from another domain)
    try {
        await query(
            `INSERT INTO domain_partitions (id, name, description)
             VALUES ($1, $2, $3)
             ON CONFLICT (id) DO NOTHING`,
            [partitionId, partitionName, `Auto-created partition for domain: ${domain}`]
        );
    } catch (e: any) {
        console.error(`[partition] ERROR creating partition: ${e.message}`);
    }

    // Assign domain to partition
    try {
        await query(
            `INSERT INTO partition_domains (partition_id, domain)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [partitionId, domain]
        );
    } catch (e: any) {
        console.error(`[partition] ERROR assigning domain: ${e.message}`);
    }

    // Log the decision
    await logDecision('partition', partitionId, 'domain_assignment', null, domain, decidedByTier, 'system', `Auto-assigned domain "${domain}" to partition "${partitionName}"`);

    // Auto-bridge if the project has opted in via project.autoBridge setting
    try {
        const autoBridgeSetting = await queryOne(
            `SELECT value FROM settings WHERE key = 'project.autoBridge'`
        );
        if (autoBridgeSetting?.value === 'true') {
            const otherPartitions = await query(
                `SELECT id FROM domain_partitions WHERE id != $1 AND (system = 0 OR system IS NULL) AND (transient = 0 OR transient IS NULL)`,
                [partitionId]
            );
            for (const other of otherPartitions as any[]) {
                await query(
                    `INSERT INTO partition_bridges (partition_a, partition_b)
                     VALUES (MIN($1, $2), MAX($1, $2))
                     ON CONFLICT DO NOTHING`,
                    [partitionId, other.id]
                );
            }
            if (otherPartitions.length > 0) {
                console.error(`[partition] Auto-bridged "${partitionName}" to ${otherPartitions.length} existing partition(s) (project.autoBridge=true)`);
            }
        }
    } catch {
        // Non-fatal — auto-bridge is a convenience, not a requirement
    }

    console.error(`[partition] Auto-created partition "${partitionName}" for domain "${domain}"`);
    return partitionId;
}

/**
 * Log a decision with tier provenance for audit and enforcement.
 * Inserts a row into the `decisions` table for later override checks.
 *
 * @param entityType - Type of entity being decided on (e.g. 'partition', 'domain', 'node')
 * @param entityId - ID of the entity
 * @param field - Which field/property was decided (e.g. 'domain_assignment', 'rename')
 * @param oldValue - Previous value, or null if new
 * @param newValue - New value being set
 * @param decidedByTier - Tier that made the decision ('human', 'system', 'tier1', etc.)
 * @param contributor - Who made the change (username or system identifier)
 * @param reason - Human-readable reason for the decision
 */
async function logDecision(entityType: string, entityId: string, field: string, oldValue: string | null, newValue: string, decidedByTier: string, contributor: string, reason: string): Promise<void> {
    try {
        await query(`
            INSERT INTO decisions (entity_type, entity_id, field, old_value, new_value, decided_by_tier, contributor, reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [entityType, entityId, field, oldValue, newValue, decidedByTier, contributor, reason]);
    } catch (e: any) {
        console.error('[decisions] FAILED to log decision:', e.message, e.stack);
    }
}

/**
 * Check if a tier can override a previous decision on an entity+field.
 * Human tier always wins. Non-human decisions can be overridden by anyone.
 * Human decisions can only be overridden by another human.
 *
 * @param entityType - Type of entity (e.g. 'partition', 'domain')
 * @param entityId - ID of the entity
 * @param field - Which field/property to check
 * @param requestingTier - Tier requesting the override ('human', 'system', etc.)
 * @returns Override result with allowed flag, reason, and optional lastDecision
 */
async function canOverride(entityType: string, entityId: string, field: string, requestingTier: string): Promise<OverrideResult> {
    // Human always overrides
    if (requestingTier === 'human') {
        return { allowed: true, reason: 'Human override' };
    }

    try {
        const lastDecision = await queryOne(`
            SELECT decided_by_tier, contributor, created_at
            FROM decisions
            WHERE entity_type = $1 AND entity_id = $2 AND field = $3
            ORDER BY created_at DESC
            LIMIT 1
        `, [entityType, entityId, field]);

        if (!lastDecision) {
            return { allowed: true, reason: 'No prior decision', lastDecision: null };
        }

        // Human decisions: only human can override human
        if (lastDecision.decided_by_tier === 'human') {
            if (requestingTier !== 'human') {
                return { allowed: false, reason: `Human decision -- only human can override`, lastDecision };
            }
            return { allowed: true, reason: 'Human overriding human', lastDecision };
        }

        // Non-human decisions can be overridden by anyone
        return { allowed: true, reason: `${requestingTier} overriding ${lastDecision.decided_by_tier}`, lastDecision };
    } catch (_e: any) {
        // If decisions table doesn't exist yet, allow everything
        return { allowed: true, reason: 'Decisions table not available' };
    }
}

/**
 * Get the partition ID for a domain, or null if not in any partition.
 *
 * @param domain - Domain name to look up
 * @returns Partition ID string, or null if the domain is unassigned
 */
async function getPartitionForDomain(domain: string): Promise<string | null> {
    if (!domain) return null;
    const row = await queryOne(
        'SELECT partition_id FROM partition_domains WHERE domain = $1',
        [domain]
    );
    return row?.partition_id ?? null;
}

/**
 * GA-inspired island migration: get top-weighted nodes from foreign (non-bridged) partitions.
 * Used by synthesis engine to find migration candidates for cross-partition synthesis.
 * Returns nodes from partitions that are NOT bridged to the excluded partition.
 *
 * @param excludePartitionId - Partition ID to exclude (along with all its bridged partitions)
 * @param topK - Maximum number of nodes to return, ordered by weight descending
 * @returns Array of node rows with id, content, embedding, weight, salience, specificity, domain
 */
async function getPartitionTopNodes(excludePartitionId: string, topK: number): Promise<any[]> {
    // Find all partitions that are bridged to the excluded one (these are already accessible)
    const bridges = await query(`
        SELECT partition_a, partition_b FROM partition_bridges
        WHERE partition_a = $1 OR partition_b = $1
    `, [excludePartitionId]);

    const excludeIds = new Set([excludePartitionId]);
    for (const b of bridges as any[]) {
        excludeIds.add(b.partition_a);
        excludeIds.add(b.partition_b);
    }

    // Get top-weighted nodes from all NON-excluded partitions
    const excludeArr = [...excludeIds];
    const placeholders = excludeArr.map((_, i) => `$${i + 2}`).join(', ');
    return query(`
        SELECT n.id, n.content, n.embedding, n.weight, n.salience, n.specificity, n.domain
        FROM nodes n
        JOIN partition_domains pd ON n.domain = pd.domain
        WHERE n.archived = FALSE
          AND pd.partition_id NOT IN (${placeholders})
          AND n.embedding IS NOT NULL
        ORDER BY n.weight DESC
        LIMIT $1
    `, [topK, ...excludeArr]);
}

/**
 * Check partition health: find unbridged partitions, empty partitions, and orphaned domains.
 * System and transient partitions are excluded from the unbridged warning.
 *
 * @returns Health report with lists of problematic partitions and orphaned domains
 */
interface PartitionHealth {
    healthy: boolean;
    unbridgedPartitions: { id: string; name: string; domains: string[] }[];
    emptyPartitions: { id: string; name: string }[];
    orphanedDomains: string[];
}

async function checkPartitionHealth(): Promise<PartitionHealth> {
    // Single query: partitions with their domains (eliminates N+1 per-partition query)
    const [allPartitions, bridges, allDomains, orphaned] = await Promise.all([
        query(`SELECT dp.id, dp.name, COALESCE(dp.system, 0) as system, COALESCE(dp.transient, 0) as transient FROM domain_partitions dp`),
        query(`SELECT partition_a, partition_b FROM partition_bridges`),
        query(`SELECT partition_id, domain FROM partition_domains`),
        query(`
            SELECT DISTINCT n.domain
            FROM nodes n
            WHERE n.archived = FALSE
              AND n.domain IS NOT NULL
              AND n.domain != ''
              AND n.domain NOT IN (SELECT domain FROM partition_domains)
        `),
    ]);

    const bridgedIds = new Set<string>();
    for (const b of bridges as any[]) {
        bridgedIds.add(b.partition_a);
        bridgedIds.add(b.partition_b);
    }

    // Build partition -> domains map from single query
    const domainsByPartition = new Map<string, string[]>();
    for (const d of allDomains as any[]) {
        if (!domainsByPartition.has(d.partition_id)) domainsByPartition.set(d.partition_id, []);
        domainsByPartition.get(d.partition_id)!.push(d.domain);
    }

    const unbridgedPartitions: PartitionHealth['unbridgedPartitions'] = [];
    const emptyPartitions: PartitionHealth['emptyPartitions'] = [];

    for (const p of allPartitions as any[]) {
        const doms = domainsByPartition.get(p.id) || [];
        if (doms.length === 0) {
            emptyPartitions.push({ id: p.id, name: p.name });
        } else if (!bridgedIds.has(p.id) && !p.system && !p.transient) {
            unbridgedPartitions.push({ id: p.id, name: p.name, domains: doms });
        }
    }

    const orphanedDomains = orphaned.map((r: any) => r.domain);

    const healthy = unbridgedPartitions.length === 0
        && emptyPartitions.length === 0
        && orphanedDomains.length === 0;

    return { healthy, unbridgedPartitions, emptyPartitions, orphanedDomains };
}

/**
 * Rename a domain across all tables that reference it.
 * No FK constraints exist -- domain is a raw string in 9+ tables.
 * Validates slug format, checks for conflicts, and regenerates domain synonyms.
 *
 * @param oldDomain - Current domain name
 * @param newDomain - Desired new domain name (will be normalized to kebab-case)
 * @param contributor - Who initiated the rename (default: 'human')
 * @returns Success/failure with optional error message and per-table update counts
 */
async function renameDomain(
    oldDomain: string,
    newDomain: string,
    contributor: string = 'human'
): Promise<{ success: boolean; error?: string; tablesUpdated?: Record<string, number> }> {
    if (!oldDomain || !newDomain) {
        return { success: false, error: 'Both oldDomain and newDomain are required' };
    }

    // Validate slug format
    const slug = newDomain.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug || slug.length > 50) {
        return { success: false, error: 'Invalid domain name (must be kebab-case, max 50 chars)' };
    }
    if (slug === oldDomain) {
        return { success: false, error: 'New domain name is the same as old' };
    }

    // Check old domain exists — in nodes OR in partition_domains
    const oldNodeCount = await queryOne(
        'SELECT COUNT(*) as cnt FROM nodes WHERE domain = $1 AND archived = FALSE',
        [oldDomain]
    );
    const oldInPartition = await queryOne(
        'SELECT 1 FROM partition_domains WHERE domain = $1',
        [oldDomain]
    );
    if ((!oldNodeCount || parseInt(oldNodeCount.cnt, 10) === 0) && !oldInPartition) {
        return { success: false, error: `Domain "${oldDomain}" not found` };
    }

    // Check new domain doesn't already exist (would merge — reject)
    const newNodeCount = await queryOne(
        'SELECT COUNT(*) as cnt FROM nodes WHERE domain = $1 AND archived = FALSE',
        [slug]
    );
    const newInPartition = await queryOne(
        'SELECT 1 FROM partition_domains WHERE domain = $1',
        [slug]
    );
    if ((newNodeCount && parseInt(newNodeCount.cnt, 10) > 0) || newInPartition) {
        const cnt = newNodeCount ? parseInt(newNodeCount.cnt, 10) : 0;
        return { success: false, error: `Domain "${slug}" already exists${cnt > 0 ? ` (${cnt} nodes)` : ''}. Merging is not supported.` };
    }

    const tablesUpdated: Record<string, number> = {};

    try {
        // 1. nodes
        const r1 = await query('UPDATE nodes SET domain = $1 WHERE domain = $2', [slug, oldDomain]);
        tablesUpdated.nodes = (r1 as any)?.changes ?? (r1 as any)?.rowCount ?? 0;

        // 2. partition_domains — check for PK conflict first
        const existingPd = await queryOne(
            'SELECT partition_id FROM partition_domains WHERE domain = $1',
            [oldDomain]
        );
        if (existingPd) {
            const conflictPd = await queryOne(
                'SELECT 1 FROM partition_domains WHERE partition_id = $1 AND domain = $2',
                [existingPd.partition_id, slug]
            );
            if (conflictPd) {
                // New domain already in same partition — just delete old
                await query('DELETE FROM partition_domains WHERE domain = $1', [oldDomain]);
            } else {
                await query('UPDATE partition_domains SET domain = $1 WHERE domain = $2', [slug, oldDomain]);
            }
            tablesUpdated.partition_domains = 1;
        }

        // 3. parameters
        const r3 = await query('UPDATE parameters SET domain = $1 WHERE domain = $2', [slug, oldDomain]);
        tablesUpdated.parameters = (r3 as any)?.changes ?? (r3 as any)?.rowCount ?? 0;

        // 4. dream_cycles
        const r4 = await query('UPDATE dream_cycles SET domain = $1 WHERE domain = $2', [slug, oldDomain]);
        tablesUpdated.dream_cycles = (r4 as any)?.changes ?? (r4 as any)?.rowCount ?? 0;

        // 5. domain_synonyms — delete old, regenerate for new
        await query('DELETE FROM domain_synonyms WHERE domain = $1', [oldDomain]);
        tablesUpdated.domain_synonyms = 1;

        // 6. session_insights
        const r6 = await query('UPDATE session_insights SET domain = $1 WHERE domain = $2', [slug, oldDomain]);
        tablesUpdated.session_insights = (r6 as any)?.changes ?? (r6 as any)?.rowCount ?? 0;

        // 7. bias_observations (may not exist in all installations)
        try {
            const r7 = await query('UPDATE bias_observations SET domain = $1 WHERE domain = $2', [slug, oldDomain]);
            tablesUpdated.bias_observations = (r7 as any)?.changes ?? (r7 as any)?.rowCount ?? 0;
        } catch (_e) { /* table may not exist */ }

        // 8. decisions audit trail
        await query(
            `UPDATE decisions SET new_value = $1 WHERE field IN ('domain', 'domain_assignment') AND new_value = $2`,
            [slug, oldDomain]
        );
        await query(
            `UPDATE decisions SET old_value = $1 WHERE field IN ('domain', 'domain_assignment') AND old_value = $2`,
            [slug, oldDomain]
        );
        tablesUpdated.decisions = 1;

        // 9. knowledge_cache — invalidate entries referencing old domain
        const r9 = await query(
            `DELETE FROM knowledge_cache WHERE domains LIKE $1`,
            [`%${oldDomain}%`]
        );
        tablesUpdated.knowledge_cache = (r9 as any)?.changes ?? (r9 as any)?.rowCount ?? 0;

        // Generate synonyms for new domain name
        const { ensureDomainSynonyms } = await import('./node-ops.js');
        await ensureDomainSynonyms(slug);

        // Log the rename decision
        await logDecision(
            'domain', oldDomain, 'rename', oldDomain, slug,
            contributor.startsWith('human') ? 'human' : 'system',
            contributor,
            `Domain renamed from "${oldDomain}" to "${slug}"`
        );

        console.error(`[governance] Domain renamed: "${oldDomain}" → "${slug}"`);
        return { success: true, tablesUpdated };

    } catch (e: any) {
        console.error(`[governance] Domain rename failed: ${e.message}`);
        return { success: false, error: e.message };
    }
}

// =============================================================================
// CYCLE EXCLUSION — per-partition allowed_cycles filtering
// =============================================================================

/** All recognized autonomous cycle names for allowed_cycles filtering. */
const ALL_CYCLE_NAMES = ['synthesis', 'voicing', 'research', 'tensions', 'questions', 'validation', 'evm'] as const;
type CycleName = typeof ALL_CYCLE_NAMES[number];

let _cycleExclusionCache: Map<string, Set<string>> | null = null;  // cycleName -> Set<excluded domains>
let _cycleExclusionCacheTime = 0;
const CYCLE_EXCLUSION_CACHE_TTL = 60_000; // 1 minute

/**
 * Rebuild the cycle exclusion cache from `domain_partitions.allowed_cycles`.
 * For each partition with a non-null allowed_cycles JSON array, any cycle
 * NOT in the list gets the partition's domains added to its exclusion set.
 *
 * @returns Map from cycle name to set of excluded domain names
 */
async function loadCycleExclusionCache(): Promise<Map<string, Set<string>>> {
    const rows = await query(`
        SELECT dp.allowed_cycles, pd.domain
        FROM domain_partitions dp
        JOIN partition_domains pd ON pd.partition_id = dp.id
        WHERE dp.allowed_cycles IS NOT NULL
    `);

    const excluded = new Map<string, Set<string>>();
    for (const name of ALL_CYCLE_NAMES) excluded.set(name, new Set());

    for (const row of rows as any[]) {
        let allowed: string[];
        try { allowed = JSON.parse(row.allowed_cycles); } catch { continue; }
        if (!Array.isArray(allowed)) continue;

        // For each cycle NOT in the allowed list, add this domain to its exclusion set
        for (const name of ALL_CYCLE_NAMES) {
            if (!allowed.includes(name)) {
                excluded.get(name)!.add(row.domain);
            }
        }
    }

    return excluded;
}

/**
 * Get all domains excluded from a specific cycle.
 * Reads domain_partitions.allowed_cycles -- partitions with NULL participate in all cycles.
 * Results are cached for 1 minute.
 *
 * @param cycleName - Name of the cycle to check (e.g. 'synthesis', 'voicing', 'research')
 * @returns Set of domain names excluded from the specified cycle
 */
async function getExcludedDomainsForCycle(cycleName: string): Promise<Set<string>> {
    const now = Date.now();
    if (!_cycleExclusionCache || now - _cycleExclusionCacheTime > CYCLE_EXCLUSION_CACHE_TTL) {
        _cycleExclusionCache = await loadCycleExclusionCache();
        _cycleExclusionCacheTime = now;
    }
    return _cycleExclusionCache.get(cycleName) ?? new Set();
}

/** Clears cycle exclusion cache (e.g. after partition updates). */
function clearCycleExclusionCache(): void {
    _cycleExclusionCache = null;
    _cycleExclusionCacheTime = 0;
}

export { getAccessibleDomains, ensurePartition, logDecision, canOverride, getPartitionForDomain, getPartitionTopNodes, checkPartitionHealth, renameDomain, getTransientDomains, isTransientDomain, clearTransientCache, getExcludedDomainsForCycle, clearCycleExclusionCache, ALL_CYCLE_NAMES };
