/**
 * @module number-variables
 *
 * Number Variable Registry — extracts domain-scoped numeric values from node content,
 * stores them in a registry, and replaces them with `[[[PREFIX+nnn]]]` variable references.
 *
 * Variable IDs are globally unique: a 4-letter installation prefix (derived from a
 * per-installation UUID) followed by a sequential counter. Example: MRKQ1, MRKQ2.
 * This means IDs never collide across installations, so exports/imports and pool
 * round-trips preserve stable variable identity with full provenance.
 *
 * This prevents the synthesis engine from universalizing domain-specific numbers
 * (e.g., "1-5% activation density" from biology becoming a universal constant).
 */

import { query as dbQuery, queryOne as dbQueryOne } from '../db.js';
import { config as appConfig } from '../config.js';
import crypto from 'crypto';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A resolved number variable entry from the registry.
 * Maps a `[[[PREFIX+nnn]]]` placeholder back to its original numeric value,
 * provenance (source node), and surrounding context.
 */
export interface NumberVariable {
    /** Globally unique variable ID (e.g., `MRKQ1`). */
    varId: string;
    /** The original numeric value as a string (e.g., `"3.14"`). */
    value: string;
    /** Surrounding context words (±N) for human-readable provenance. */
    scopeText: string;
    /** UUID of the node from which this number was originally extracted. */
    sourceNodeId: string;
    /** Domain of the source node — enforces domain-scoped isolation. */
    domain: string;
}

/** Internal representation of a number found during content extraction. */
interface ExtractedNumber {
    /** The matched numeric string (e.g., `"42"` or `"3.14"`). */
    rawValue: string;
    /** Character offset in the source content where the match begins. */
    offset: number;
    /** Character length of the matched text. */
    length: number;
}

// =============================================================================
// EXTRACTION (pure functions, no DB)
// =============================================================================

/** Regex for numeric values — just the number, no units */
const NUMBER_RE = /\b(\d+\.?\d*)\b/g;

/** Pattern to detect existing variable refs so we don't re-extract them */
const VAR_REF_RE = /\[\[\[[A-Z]+\d+\]\]\]/g;

/**
 * Extract ALL numbers from content.
 * Every number in a knowledge node is a domain-scoped claim — there is no
 * "trivial" number in synthesized knowledge. Skips numbers already inside
 * `[[[PREFIX+nnn]]]` variable refs.
 *
 * @param content - The node content text to scan for numbers.
 * @returns Array of extracted numbers, capped at `maxVarsPerNode` from config.
 */
function extractNumbers(content: string): ExtractedNumber[] {
    const cfg = appConfig.numberVariables;
    const results: ExtractedNumber[] = [];

    // Find all existing variable ref ranges so we can skip them
    const varRefRanges: Array<[number, number]> = [];
    let vrMatch;
    const vrRe = new RegExp(VAR_REF_RE.source, 'g');
    while ((vrMatch = vrRe.exec(content)) !== null) {
        varRefRanges.push([vrMatch.index, vrMatch.index + vrMatch[0].length]);
    }

    const re = new RegExp(NUMBER_RE.source, 'g');
    let match;
    while ((match = re.exec(content)) !== null) {
        const offset = match.index;

        // Skip if inside a variable ref
        const insideRef = varRefRanges.some(([start, end]) => offset >= start && offset < end);
        if (insideRef) continue;

        results.push({
            rawValue: match[1],
            offset,
            length: match[0].length,
        });
    }

    // Enforce max vars per node
    return results.slice(0, cfg.maxVarsPerNode);
}

/**
 * Extract scope context: ±N words around the number for human-readable description.
 *
 * @param content - Full node content text.
 * @param offset - Character offset of the number within `content`.
 * @param length - Character length of the matched number.
 * @returns A string of the form `"words before ... words after"` with variable refs stripped.
 */
function extractScopeContext(content: string, offset: number, length: number): string {
    const windowSize = appConfig.numberVariables.contextWindowSize;

    // Get text before and after the number
    const before = content.slice(0, offset);
    const after = content.slice(offset + length);

    const wordsBefore = before.trim().split(/\s+/).filter(Boolean);
    const wordsAfter = after.trim().split(/\s+/).filter(Boolean);

    const contextBefore = wordsBefore.slice(-windowSize).join(' ');
    const contextAfter = wordsAfter.slice(0, windowSize).join(' ');

    // Clean up any variable refs from context for readability
    return `${contextBefore} ... ${contextAfter}`.replace(VAR_REF_RE, '').trim();
}

// =============================================================================
// INSTALLATION PREFIX — globally unique variable ID prefix
// =============================================================================

let _cachedPrefix: string | null = null;
let _nextCounter: number | null = null;  // in-memory counter — avoids SQL on every propose

/**
 * Derive a 4-letter uppercase prefix from a UUID.
 * Maps SHA-256 bytes to A-Z for regex compatibility with the `[A-Z]+\d+` pattern.
 *
 * @param installationId - The installation UUID to hash.
 * @returns A 4-character uppercase string (e.g., `"MRKQ"`).
 */
function derivePrefix(installationId: string): string {
    const hash = crypto.createHash('sha256').update(installationId).digest();
    return Array.from(hash.slice(0, 4))
        .map(b => String.fromCharCode((b % 26) + 65))
        .join('');
}

/**
 * Get the installation prefix (4 uppercase letters).
 * Generated once from a per-installation UUID stored in the settings table.
 * Cached in memory after first call.
 */
async function getInstallationPrefix(): Promise<string> {
    if (_cachedPrefix) return _cachedPrefix;

    // Check for existing installation ID
    let row = await dbQueryOne(`SELECT value FROM settings WHERE key = 'installation.id'`);
    if (!row) {
        // Generate and store a new installation UUID
        const uuid = crypto.randomUUID();
        await dbQuery(`INSERT INTO settings (key, value) VALUES ('installation.id', $1)`, [uuid]);
        row = { value: uuid };
    }

    _cachedPrefix = derivePrefix(row.value);
    return _cachedPrefix;
}

/** Clear cached prefix and counter (for testing or project switch). */
function clearInstallationPrefixCache(): void {
    _cachedPrefix = null;
    _nextCounter = null;
}

// =============================================================================
// DB OPERATIONS
// =============================================================================

/**
 * Load the next counter from DB if not yet cached.
 * Called lazily on first use and after project switch.
 */
async function ensureCounterLoaded(): Promise<void> {
    if (_nextCounter !== null) return;
    const prefix = await getInstallationPrefix();
    const row = await dbQueryOne(
        `SELECT COALESCE(MAX(CAST(SUBSTR(var_id, $2) AS INTEGER)), 0) AS max_id
         FROM number_registry WHERE var_id LIKE $1`,
        [`${prefix}%`, prefix.length + 1]
    );
    _nextCounter = (parseInt(row?.max_id, 10) || 0) + 1;
}

/**
 * Get the next available variable id for this installation.
 * Format: {4-letter prefix}{counter} — e.g., MRKQ1, MRKQ2.
 * Uses in-memory counter — only hits DB on first call per session/project.
 */
async function getNextVarId(): Promise<string> {
    const prefix = await getInstallationPrefix();
    await ensureCounterLoaded();
    return `${prefix}${_nextCounter!}`;
}

/**
 * Register all numeric variables from a node's content.
 * Extracts numbers, creates registry entries in the DB, and replaces raw numbers
 * with `[[[PREFIX+nnn]]]` placeholder refs.
 *
 * @param nodeId - UUID of the node whose content is being processed.
 * @param content - Raw node content text containing numbers.
 * @param domain - Domain of the node (stored in the registry for scoping).
 * @returns Object with `annotatedContent` (content with placeholders) and `varIds` (created variable IDs).
 */
async function registerNodeVariables(
    nodeId: string,
    content: string,
    domain: string
): Promise<{ annotatedContent: string; varIds: string[] }> {
    const extracted = extractNumbers(content);
    if (extracted.length === 0) {
        return { annotatedContent: content, varIds: [] };
    }

    const prefix = await getInstallationPrefix();
    await ensureCounterLoaded();
    const varIds: string[] = [];

    // Build replacement list — process from end to start to preserve offsets
    const replacements: Array<{ offset: number; length: number; varId: string; value: string; scopeText: string }> = [];

    for (const ext of extracted) {
        const varId = `${prefix}${_nextCounter!++}`;
        const scopeText = extractScopeContext(content, ext.offset, ext.length);

        replacements.push({
            offset: ext.offset,
            length: ext.length,
            varId,
            value: ext.rawValue,
            scopeText,
        });
        varIds.push(varId);
    }

    // Sort by offset descending so replacements don't shift earlier offsets
    replacements.sort((a, b) => b.offset - a.offset);

    // Apply replacements to content
    let annotated = content;
    for (const rep of replacements) {
        const before = annotated.slice(0, rep.offset);
        const after = annotated.slice(rep.offset + rep.length);
        annotated = `${before}[[[${rep.varId}]]]${after}`;
    }

    // Insert into DB
    for (const rep of replacements) {
        await dbQuery(
            `INSERT INTO number_registry (var_id, value, scope_text, source_node_id, domain, created_at)
             VALUES ($1, $2, $3, $4, $5, datetime('now'))`,
            [rep.varId, rep.value, rep.scopeText, nodeId, domain]
        );
        await dbQuery(
            `INSERT OR IGNORE INTO node_number_refs (node_id, var_id) VALUES ($1, $2)`,
            [nodeId, rep.varId]
        );
    }

    return { annotatedContent: annotated, varIds };
}

/**
 * Get all variables referenced by a node.
 *
 * @param nodeId - UUID of the node to look up.
 * @returns Array of {@link NumberVariable} entries linked to the node.
 */
async function getNodeVariables(nodeId: string): Promise<NumberVariable[]> {
    const rows = await dbQuery(
        `SELECT r.var_id, r.value, r.scope_text, r.source_node_id, r.domain
         FROM number_registry r
         JOIN node_number_refs ref ON r.var_id = ref.var_id
         WHERE ref.node_id = $1`,
        [nodeId]
    );
    return (rows as any[]).map(r => ({
        varId: r.var_id,
        value: r.value,
        scopeText: r.scope_text,
        sourceNodeId: r.source_node_id,
        domain: r.domain,
    }));
}

/**
 * Get variables by their IDs.
 *
 * @param varIds - Array of variable IDs to look up (e.g., `["MRKQ1", "MRKQ2"]`).
 * @returns Array of matching {@link NumberVariable} entries. IDs not found in the
 *          registry are silently omitted.
 */
async function getVariablesByIds(varIds: string[]): Promise<NumberVariable[]> {
    if (varIds.length === 0) return [];

    const placeholders = varIds.map((_, i) => `$${i + 1}`).join(', ');
    const rows = await dbQuery(
        `SELECT var_id, value, scope_text, source_node_id, domain
         FROM number_registry WHERE var_id IN (${placeholders})`,
        varIds
    );
    return (rows as any[]).map(r => ({
        varId: r.var_id,
        value: r.value,
        scopeText: r.scope_text,
        sourceNodeId: r.source_node_id,
        domain: r.domain,
    }));
}

/**
 * Resolve all `[[[PREFIX+nnn]]]` references in content back to actual numeric values.
 * Used before sending content to an LLM or for display/clean output.
 *
 * @param content - Content string potentially containing variable placeholders.
 * @returns Content with all resolvable placeholders replaced by their numeric values.
 *          Unresolved placeholders are left as-is.
 */
async function resolveContent(content: string): Promise<string> {
    const varIds = extractVarIdsFromContent(content);
    if (varIds.length === 0) return content;

    const vars = await getVariablesByIds(varIds);
    const varMap = new Map(vars.map(v => [v.varId, v.value]));

    return content.replace(/\[\[\[([A-Z]+\d+)\]\]\]/g, (match, varId) => {
        return varMap.get(varId) ?? match;
    });
}

// =============================================================================
// ANNOTATION HELPERS
// =============================================================================

/**
 * Extract all `[[[PREFIX+nnn]]]` variable IDs from content text.
 *
 * @param content - Content string to scan for variable placeholders.
 * @returns De-duplicated array of variable IDs found (e.g., `["MRKQ1", "MRKQ3"]`).
 */
function extractVarIdsFromContent(content: string): string[] {
    const ids: string[] = [];
    const re = /\[\[\[([A-Z]+\d+)\]\]\]/g;
    let match;
    while ((match = re.exec(content)) !== null) {
        ids.push(match[1]);
    }
    return [...new Set(ids)];
}

/**
 * Build a legend block for synthesis prompts explaining each variable.
 * Grouped by domain for clarity. Used by the voicing pipeline to inject
 * a variable legend into the LLM prompt so the model sees each variable's
 * actual value and domain provenance.
 *
 * @param variables - Array of {@link NumberVariable} entries to include in the legend.
 * @returns A multi-line string block, or an empty string if no variables are provided.
 */
function buildVariableLegend(variables: NumberVariable[]): string {
    if (variables.length === 0) return '';

    // Group by domain
    const byDomain = new Map<string, NumberVariable[]>();
    for (const v of variables) {
        const list = byDomain.get(v.domain) || [];
        list.push(v);
        byDomain.set(v.domain, list);
    }

    const lines: string[] = [
        'NUMBER VARIABLES (domain-scoped — do NOT transfer values across domains):'
    ];

    for (const [domain, vars] of byDomain) {
        for (const v of vars) {
            lines.push(`  [[[${v.varId}]]] = ${v.value} (${domain}: ${v.scopeText})`);
        }
    }

    return lines.join('\n');
}

/**
 * Strip all `[[[PREFIX+nnn]]]` notation from content, replacing with actual values.
 * Synchronous version for callers that already have a pre-loaded variable map.
 *
 * @param content - Content string with variable placeholders.
 * @param varMap - Map from variable ID to its resolved numeric value.
 * @returns Content with all resolvable placeholders replaced. Unresolved ones are left as-is.
 */
function stripVariableNotation(content: string, varMap: Map<string, string>): string {
    return content.replace(/\[\[\[([A-Z]+\d+)\]\]\]/g, (match, varId) => {
        return varMap.get(varId) ?? match;
    });
}

/**
 * Link an existing node to variable refs found in its content.
 * Used when a synthesis output echoes variable refs from parents —
 * the junction entries are created but no new registry rows are added.
 *
 * @param nodeId - UUID of the node to link.
 * @param content - The node's content, scanned for `[[[PREFIX+nnn]]]` refs.
 */
async function linkExistingVarRefs(nodeId: string, content: string): Promise<void> {
    const varIds = extractVarIdsFromContent(content);
    for (const varId of varIds) {
        await dbQuery(
            `INSERT OR IGNORE INTO node_number_refs (node_id, var_id) VALUES ($1, $2)`,
            [nodeId, varId]
        );
    }
}

/**
 * Backfill number variables for nodes that have raw numbers but no `[[[...]]]` placeholders.
 * Runs once per DB (guarded by the `numvar_backfill_v2` settings flag). Called at server
 * startup as fire-and-forget. Skips `raw` node types and nodes that already contain placeholders.
 *
 * @returns Counts of `processed` (annotated) and `skipped` (no numbers or error) nodes.
 */
async function backfillNumberVariables(): Promise<{ processed: number; skipped: number }> {
    if (!appConfig.numberVariables?.enabled) return { processed: 0, skipped: 0 };

    // Check if backfill already ran for this DB
    const flag = await dbQueryOne(`SELECT value FROM settings WHERE key = 'numvar_backfill_v2'`);
    if (flag) return { processed: 0, skipped: 0 };

    // Find nodes that likely need extraction:
    // - Have digits in content
    // - Don't already have [[[...}]] placeholders
    // - Have a domain (required for scoping)
    // - Not raw type
    const candidates = await dbQuery(`
        SELECT id, content, domain FROM nodes
        WHERE archived = FALSE
          AND domain IS NOT NULL
          AND node_type != 'raw'
          AND content NOT LIKE '%[[[%'
          AND (content GLOB '*[0-9]*')
        ORDER BY created_at DESC
    `) as any[];

    if (candidates.length === 0) {
        await dbQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('numvar_backfill_v2', 'done')`);
        return { processed: 0, skipped: 0 };
    }

    console.error(`[numvar] Backfill: found ${candidates.length} nodes without variable extraction`);

    let processed = 0;
    let skipped = 0;
    for (const node of candidates) {
        try {
            const result = await registerNodeVariables(node.id, node.content, node.domain);
            if (result.varIds.length > 0) {
                await dbQuery('UPDATE nodes SET content = $1 WHERE id = $2', [result.annotatedContent, node.id]);
                processed++;
            } else {
                skipped++;
            }
        } catch (err: any) {
            console.error(`[numvar] Backfill failed for ${node.id.slice(0, 8)}: ${err.message}`);
            skipped++;
        }
    }

    // Mark backfill as done
    await dbQuery(`INSERT OR REPLACE INTO settings (key, value) VALUES ('numvar_backfill_v2', 'done')`);
    console.error(`[numvar] Backfill complete: ${processed} nodes annotated, ${skipped} skipped`);
    return { processed, skipped };
}

export {
    extractNumbers,
    extractScopeContext,
    extractVarIdsFromContent,
    registerNodeVariables,
    getNodeVariables,
    getVariablesByIds,
    resolveContent,
    buildVariableLegend,
    stripVariableNotation,
    linkExistingVarRefs,
    getNextVarId,
    getInstallationPrefix,
    clearInstallationPrefixCache,
    backfillNumberVariables,
};
