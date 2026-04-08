/**
 * INTEGRITY MODULE — Merkle DAG Cryptographic Provenance
 *
 * Provides hash-linked provenance for every node in the knowledge graph.
 * Each node gets a content_hash = SHA-256(content + node_type + contributor + created_at + sorted parent hashes).
 * Operations are logged in a tamper-evident hash chain (integrity_log).
 * Partitions get a Merkle root computed at export time from all node content_hashes.
 *
 * This enables:
 * - Provenance: every synthesis is cryptographically linked to its parent nodes
 * - Tamper detection: verify returned partitions haven't been corrupted
 * - Chain of custody: every mutation logged in a hash chain
 * - Trust scoring: unbroken chains = premium partitions in the data broker pool
 */

import { createHash } from 'crypto';
import { query, queryOne } from '../db.js';

// =============================================================================
// PURE HASH FUNCTIONS — No DB dependencies
// =============================================================================

/**
 * Compute SHA-256 content hash for a node's immutable identity.
 * Fields hashed: content, node_type, contributor, created_at, sorted parent hashes.
 * Null-byte separators prevent field-boundary confusion.
 *
 * @param params - Node fields to hash
 * @param params.content - Node content text
 * @param params.nodeType - Node type (seed, voiced, synthesis, breakthrough, etc.)
 * @param params.contributor - Who created the node, or null
 * @param params.createdAt - ISO timestamp of node creation
 * @param params.parentHashes - Content hashes of parent nodes (sorted lexicographically before hashing)
 * @returns Hex-encoded SHA-256 hash string
 */
export function computeContentHash(params: {
    content: string;
    nodeType: string;
    contributor: string | null;
    createdAt: string;
    parentHashes?: string[];
}): string {
    const parts = [
        params.content,
        params.nodeType,
        params.contributor || '',
        params.createdAt,
        (params.parentHashes || []).slice().sort().join(','),
    ];
    return createHash('sha256').update(parts.join('\0'), 'utf-8').digest('hex');
}

/**
 * Compute SHA-256 hash of a log entry for chain linking.
 * Includes all fields + prev_log_hash to make the chain tamper-evident.
 *
 * @param entry - Log entry fields to hash (all concatenated with null-byte separators)
 * @returns Hex-encoded SHA-256 hash string
 */
export function computeLogEntryHash(entry: {
    nodeId: string;
    operation: string;
    contentHashBefore: string | null;
    contentHashAfter: string;
    parentHashes: string | null;
    contributor: string | null;
    details: string | null;
    prevLogHash: string | null;
    partitionId: string | null;
    timestamp: string;
}): string {
    const parts = [
        entry.nodeId,
        entry.operation,
        entry.contentHashBefore || '',
        entry.contentHashAfter,
        entry.parentHashes || '',
        entry.contributor || '',
        entry.details || '',
        entry.prevLogHash || '',
        entry.partitionId || '',
        entry.timestamp,
    ];
    return createHash('sha256').update(parts.join('\0'), 'utf-8').digest('hex');
}

/**
 * Compute Merkle root from an array of content hashes.
 * Sorts lexicographically, then pair-wise hashes up to a single root.
 * Odd nodes at any level are promoted unchanged to the next level.
 *
 * @param contentHashes - Array of hex-encoded SHA-256 hashes
 * @returns Hex-encoded SHA-256 Merkle root (SHA-256 of empty string if input is empty)
 */
export function computeMerkleRoot(contentHashes: string[]): string {
    if (contentHashes.length === 0) {
        return createHash('sha256').update('', 'utf-8').digest('hex');
    }

    // Sort for deterministic ordering
    let level = contentHashes.slice().sort();

    while (level.length > 1) {
        const nextLevel: string[] = [];
        for (let i = 0; i < level.length; i += 2) {
            if (i + 1 < level.length) {
                // Pair: hash(left + right)
                nextLevel.push(
                    createHash('sha256').update(level[i] + level[i + 1], 'utf-8').digest('hex')
                );
            } else {
                // Odd node: promote to next level
                nextLevel.push(level[i]);
            }
        }
        level = nextLevel;
    }

    return level[0];
}

/**
 * Verify a Merkle root against a set of nodes with content_hash fields.
 * Extracts non-null hashes from nodes, computes the Merkle root, and compares.
 *
 * @param nodes - Array of node objects with optional content_hash field
 * @param expectedRoot - Expected hex-encoded Merkle root to verify against
 * @returns Verification result with computed root and node hash coverage stats
 */
export function verifyMerkleRoot(
    nodes: Array<{ content_hash?: string | null }>,
    expectedRoot: string
): { valid: boolean; computed: string; nodesWithHashes: number; nodesTotal: number } {
    const hashes = nodes
        .map(n => n.content_hash)
        .filter((h): h is string => !!h);
    const computed = computeMerkleRoot(hashes);
    return {
        valid: computed === expectedRoot,
        computed,
        nodesWithHashes: hashes.length,
        nodesTotal: nodes.length,
    };
}

/**
 * Verify the integrity of a log chain.
 * Walks from the first entry (prev_log_hash=null) to the last,
 * recomputing each entry's hash and comparing against the stored logHash.
 * Also verifies that each entry's prevLogHash matches the previous entry's logHash.
 *
 * @param logEntries - Ordered array of log entries (must be sorted by creation order)
 * @returns Verification result: valid flag, count of verified entries, and break location if invalid
 */
export function verifyLogChain(logEntries: Array<{
    nodeId: string;
    operation: string;
    contentHashBefore: string | null;
    contentHashAfter: string;
    parentHashes: string | null;
    contributor: string | null;
    details: string | null;
    prevLogHash: string | null;
    logHash: string;
    partitionId: string | null;
    timestamp: string;
}>): { valid: boolean; verified: number; brokenAt?: number; reason?: string } {
    if (logEntries.length === 0) {
        return { valid: true, verified: 0 };
    }

    for (let i = 0; i < logEntries.length; i++) {
        const entry = logEntries[i];

        // Verify chain linkage
        if (i === 0) {
            if (entry.prevLogHash !== null) {
                return { valid: false, verified: i, brokenAt: i, reason: 'First entry has non-null prevLogHash' };
            }
        } else {
            if (entry.prevLogHash !== logEntries[i - 1].logHash) {
                return { valid: false, verified: i, brokenAt: i, reason: `Chain break: entry ${i} prevLogHash doesn't match entry ${i - 1} logHash` };
            }
        }

        // Verify entry hash
        const computed = computeLogEntryHash(entry);
        if (computed !== entry.logHash) {
            return { valid: false, verified: i, brokenAt: i, reason: `Hash mismatch at entry ${i}: computed ${computed.slice(0, 16)}... != stored ${entry.logHash.slice(0, 16)}...` };
        }
    }

    return { valid: true, verified: logEntries.length };
}

// =============================================================================
// DB-AWARE FUNCTIONS
// =============================================================================

/**
 * Resolve the partition ID for a domain from the partition_domains table.
 *
 * @param domain - Domain name to look up, or null
 * @returns Partition ID string, or null if domain is null or not found
 */
async function resolvePartitionId(domain: string | null): Promise<string | null> {
    if (!domain) return null;
    const row = await queryOne(
        'SELECT partition_id FROM partition_domains WHERE domain = $1',
        [domain]
    );
    return row?.partition_id || null;
}

/**
 * Get the most recent log_hash for a partition's integrity chain.
 * Used to link new log entries to the existing chain.
 *
 * @param partitionId - Partition ID to query, or null
 * @returns Most recent log hash hex string, or null if no entries or partitionId is null
 */
async function getLastLogHash(partitionId: string | null): Promise<string | null> {
    if (!partitionId) return null;
    const row = await queryOne(
        'SELECT log_hash FROM integrity_log WHERE partition_id = $1 ORDER BY id DESC LIMIT 1',
        [partitionId]
    );
    return row?.log_hash || null;
}

/**
 * Log an integrity operation into the tamper-evident hash chain.
 * Resolves the partition from the domain, fetches the last log hash for chain linking,
 * computes the new entry's hash, and inserts into the integrity_log table.
 *
 * @param params - Operation details including node ID, operation type, content hashes, and optional metadata
 */
export async function logOperation(params: {
    nodeId: string;
    operation: string;
    contentHashBefore: string | null;
    contentHashAfter: string;
    parentHashes?: string[];
    contributor: string | null;
    details?: Record<string, any>;
    domain?: string | null;
}): Promise<void> {
    const partitionId = await resolvePartitionId(params.domain || null);
    const prevLogHash = await getLastLogHash(partitionId);
    const timestamp = new Date().toISOString();
    const parentHashesJson = params.parentHashes ? JSON.stringify(params.parentHashes) : null;
    const detailsJson = params.details ? JSON.stringify(params.details) : null;

    const logHash = computeLogEntryHash({
        nodeId: params.nodeId,
        operation: params.operation,
        contentHashBefore: params.contentHashBefore,
        contentHashAfter: params.contentHashAfter,
        parentHashes: parentHashesJson,
        contributor: params.contributor,
        details: detailsJson,
        prevLogHash,
        partitionId,
        timestamp,
    });

    await query(`
        INSERT INTO integrity_log (
            node_id, operation, content_hash_before, content_hash_after,
            parent_hashes, contributor, details,
            prev_log_hash, log_hash, partition_id, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [
        params.nodeId,
        params.operation,
        params.contentHashBefore,
        params.contentHashAfter,
        parentHashesJson,
        params.contributor,
        detailsJson,
        prevLogHash,
        logHash,
        partitionId,
        timestamp,
    ]);
}

/**
 * Get all integrity log entries for a partition, ordered by ID ascending for chain verification.
 *
 * @param partitionId - Partition ID to query
 * @returns Array of integrity_log rows in insertion order
 */
export async function getPartitionIntegrityLog(partitionId: string): Promise<any[]> {
    return query(
        'SELECT * FROM integrity_log WHERE partition_id = $1 ORDER BY id ASC',
        [partitionId]
    );
}

/**
 * Get integrity log entries for a set of node IDs (for export filtering).
 *
 * @param nodeIds - Array of node UUIDs to fetch log entries for
 * @returns Array of integrity_log rows in insertion order, empty if nodeIds is empty
 */
export async function getIntegrityLogForNodes(nodeIds: string[]): Promise<any[]> {
    if (nodeIds.length === 0) return [];
    const placeholders = nodeIds.map((_, i) => `$${i + 1}`).join(',');
    return query(
        `SELECT * FROM integrity_log WHERE node_id IN (${placeholders}) ORDER BY id ASC`,
        nodeIds
    );
}

/**
 * Compute content hash for an existing node by fetching its data and parent hashes from the database.
 *
 * @param nodeId - UUID of the node to compute a hash for
 * @returns Hex-encoded SHA-256 content hash, or null if the node does not exist
 */
export async function computeNodeContentHash(nodeId: string): Promise<string | null> {
    const node = await queryOne(
        'SELECT content, node_type, contributor, created_at FROM nodes WHERE id = $1',
        [nodeId]
    );
    if (!node) return null;

    // Get parent content_hashes from edges
    const parentRows = await query(
        `SELECT n.content_hash FROM edges e
         JOIN nodes n ON n.id = e.source_id
         WHERE e.target_id = $1 AND e.edge_type = 'parent' AND n.content_hash IS NOT NULL`,
        [nodeId]
    );
    const parentHashes = parentRows.map((r: any) => r.content_hash).filter(Boolean);

    return computeContentHash({
        content: node.content,
        nodeType: node.node_type,
        contributor: node.contributor,
        createdAt: node.created_at,
        parentHashes,
    });
}

/**
 * Full verification of export data integrity.
 * Performs two checks: Merkle root verification (nodes' content hashes match the stored root)
 * and log chain verification (each entry's hash links to the previous).
 *
 * @param exportData - Exported partition data containing `nodes` array and `integrity` object with `merkleRoot` and `log`
 * @returns Combined verification result for both Merkle and chain checks
 */
export function verifyPartitionIntegrity(exportData: any): {
    merkleValid: boolean;
    merkleComputed: string;
    chainValid: boolean;
    chainVerified: number;
    chainBrokenAt?: number;
    chainReason?: string;
    nodesWithHashes: number;
    nodesTotal: number;
} {
    const nodes = exportData?.nodes || [];
    const integrity = exportData?.integrity;

    // Merkle verification
    let merkleValid = false;
    let merkleComputed = '';
    let nodesWithHashes = 0;

    if (integrity?.merkleRoot) {
        const result = verifyMerkleRoot(nodes, integrity.merkleRoot);
        merkleValid = result.valid;
        merkleComputed = result.computed;
        nodesWithHashes = result.nodesWithHashes;
    }

    // Log chain verification
    let chainValid = true;
    let chainVerified = 0;
    let chainBrokenAt: number | undefined;
    let chainReason: string | undefined;

    if (integrity?.log && integrity.log.length > 0) {
        // Convert camelCase log entries to match verifyLogChain's expected format
        const entries = integrity.log.map((e: any) => ({
            nodeId: e.nodeId || e.node_id,
            operation: e.operation,
            contentHashBefore: e.contentHashBefore ?? e.content_hash_before ?? null,
            contentHashAfter: e.contentHashAfter || e.content_hash_after,
            parentHashes: e.parentHashes ?? e.parent_hashes ?? null,
            contributor: e.contributor || null,
            details: e.details || null,
            prevLogHash: e.prevLogHash ?? e.prev_log_hash ?? null,
            logHash: e.logHash || e.log_hash,
            partitionId: e.partitionId ?? e.partition_id ?? null,
            timestamp: e.timestamp,
        }));
        const chainResult = verifyLogChain(entries);
        chainValid = chainResult.valid;
        chainVerified = chainResult.verified;
        chainBrokenAt = chainResult.brokenAt;
        chainReason = chainResult.reason;
    }

    return {
        merkleValid,
        merkleComputed,
        chainValid,
        chainVerified,
        chainBrokenAt,
        chainReason,
        nodesWithHashes,
        nodesTotal: nodes.length,
    };
}
