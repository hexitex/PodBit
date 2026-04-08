/**
 * PODBIT v0.5 - SQL TRANSLATION LAYER
 *
 * Translates PostgreSQL-flavored $1,$2,$3 parameter placeholders to
 * SQLite ? placeholders, and provides SQLite-specific SQL helpers.
 */

// =============================================================================
// TYPES
// =============================================================================

/** Result of translating SQL and its parameter list. */
export interface TranslateResult {
    sql: string;
    params: unknown[];
}

// =============================================================================
// PARAMETER TRANSLATION
// =============================================================================

/**
 * Translate PostgreSQL `$1,$2,$3` parameter placeholders to SQLite `?` placeholders.
 *
 * Handles repeated references to the same parameter (e.g., `$1` used twice)
 * by duplicating the value in the output array. Boolean values are coerced
 * to `1`/`0` for SQLite compatibility.
 *
 * @param sql - SQL string with PostgreSQL-style `$N` placeholders.
 * @param params - Positional parameter values (0-indexed internally, 1-indexed in SQL).
 * @returns Translated SQL with `?` placeholders and reordered parameter array.
 */
function translateParams(sql: string, params: unknown[] = []): TranslateResult {
    if (!params || params.length === 0) {
        return { sql: sql.replace(/\$\d+/g, '?'), params: [] };
    }

    const reorderedParams: unknown[] = [];
    const translated = sql.replace(/\$(\d+)/g, (_match: string, num: string) => {
        const idx = parseInt(num, 10) - 1;
        const val = params[idx];
        reorderedParams.push(typeof val === 'boolean' ? (val ? 1 : 0) : val);
        return '?';
    });

    return { sql: translated, params: reorderedParams };
}

// =============================================================================
// ARRAY EXPANSION (ANY / ALL)
// =============================================================================

/**
 * Expand PostgreSQL `ANY($N)`, `ALL($N)`, and `ILIKE ANY($N)` array operators
 * to SQLite-compatible `IN (...)` / `NOT IN (...)` / `(col LIKE ... OR ...)`
 * expressions. Must be called **before** `translateParams`.
 *
 * Empty arrays produce null-safe expressions (`IN (NULL)`, `1=0`, `!= NULL OR 1=1`).
 * New placeholder positions are appended to the params array.
 *
 * @param sql - SQL string potentially containing array operators.
 * @param params - Parameter values, where array-typed entries will be expanded.
 * @returns Expanded SQL and augmented parameter array.
 */
function expandArrays(sql: string, params: unknown[] = []): TranslateResult {
    if (!params || params.length === 0) return { sql, params };

    let expandedSql = sql;
    const expandedParams: unknown[] = [...params];

    // Process != ALL($N) -> NOT IN (...)
    const allMatches = [...sql.matchAll(/!=\s*ALL\(\$(\d+)\)/g)];
    for (let i = allMatches.length - 1; i >= 0; i--) {
        const match = allMatches[i];
        const paramIdx = parseInt(match[1], 10) - 1;
        const arr = params[paramIdx];

        if (!Array.isArray(arr) || arr.length === 0) {
            expandedSql = expandedSql.substring(0, match.index!) +
                '!= NULL OR 1=1' +
                expandedSql.substring(match.index! + match[0].length);
            continue;
        }

        const startIdx = expandedParams.length;
        expandedParams.push(...arr);
        const placeholders = arr.map((_: unknown, j: number) => `$${startIdx + j + 1}`).join(', ');
        expandedSql = expandedSql.substring(0, match.index!) +
            `NOT IN (${placeholders})` +
            expandedSql.substring(match.index! + match[0].length);
    }

    // Process column ILIKE ANY($N) -> (column LIKE $x OR column LIKE $y OR ...)
    const ilikeAnyMatches = [...expandedSql.matchAll(/(\w+(?:\.\w+)?)\s+ILIKE\s+ANY\(\$(\d+)\)/gi)];
    for (let i = ilikeAnyMatches.length - 1; i >= 0; i--) {
        const match = ilikeAnyMatches[i];
        const column = match[1];
        const paramIdx = parseInt(match[2], 10) - 1;
        const arr = params[paramIdx];

        if (!Array.isArray(arr) || arr.length === 0) {
            expandedSql = expandedSql.substring(0, match.index!) +
                '1=0' +
                expandedSql.substring(match.index! + match[0].length);
            continue;
        }

        const startIdx = expandedParams.length;
        expandedParams.push(...arr);
        const conditions = arr.map((_: unknown, j: number) => `${column} LIKE $${startIdx + j + 1}`).join(' OR ');
        expandedSql = expandedSql.substring(0, match.index!) +
            `(${conditions})` +
            expandedSql.substring(match.index! + match[0].length);
    }

    // Process = ANY($N) -> IN (...)
    const anyMatches = [...expandedSql.matchAll(/=\s*ANY\(\$(\d+)\)/g)];
    for (let i = anyMatches.length - 1; i >= 0; i--) {
        const match = anyMatches[i];
        const paramIdx = parseInt(match[1], 10) - 1;
        const arr = params[paramIdx];

        if (!Array.isArray(arr) || arr.length === 0) {
            expandedSql = expandedSql.substring(0, match.index!) +
                'IN (NULL)' +
                expandedSql.substring(match.index! + match[0].length);
            continue;
        }

        const startIdx = expandedParams.length;
        expandedParams.push(...arr);
        const placeholders = arr.map((_: unknown, j: number) => `$${startIdx + j + 1}`).join(', ');
        expandedSql = expandedSql.substring(0, match.index!) +
            `IN (${placeholders})` +
            expandedSql.substring(match.index! + match[0].length);
    }

    return { sql: expandedSql, params: expandedParams };
}

// =============================================================================
// SQL SYNTAX TRANSLATION
// =============================================================================

/**
 * Translate PostgreSQL-specific SQL syntax to SQLite equivalents.
 *
 * Replacements: `NOW()` → `datetime('now')`, `LEAST`/`GREATEST` → `MIN`/`MAX`,
 * `ILIKE` → `LIKE`, type casts (`::`), `NULLS LAST/FIRST`, `TRUE`/`FALSE` → `1`/`0`.
 *
 * @param sql - SQL string with PostgreSQL syntax.
 * @returns SQL string with SQLite-compatible syntax.
 */
function translateSQL(sql: string): string {
    let translated = sql;

    translated = translated.replace(/\bNOW\(\)/gi, "datetime('now')");
    translated = translated.replace(/\bLEAST\(/gi, 'MIN(');
    translated = translated.replace(/\bGREATEST\(/gi, 'MAX(');
    translated = translated.replace(/\bILIKE\b/gi, 'LIKE');
    translated = translated.replace(/::[A-Z_]+/gi, '');
    translated = translated.replace(/\bNULLS\s+(LAST|FIRST)\b/gi, '');
    translated = translated.replace(/\bTRUE\b/g, '1');
    translated = translated.replace(/\bFALSE\b/g, '0');

    return translated;
}

// =============================================================================
// FULL TRANSLATION PIPELINE
// =============================================================================

/**
 * Complete PostgreSQL-to-SQLite translation pipeline.
 *
 * Applies three stages in order:
 * 1. Array expansion (`ANY`/`ALL`/`ILIKE ANY` → `IN`/`NOT IN`/`LIKE OR`)
 * 2. Syntax translation (`NOW()`, `ILIKE`, casts, booleans, etc.)
 * 3. Parameter translation (`$N` → `?` with reordering)
 *
 * @param sql - PostgreSQL-flavored SQL string.
 * @param params - Positional parameter values.
 * @returns Translated SQL and parameter array ready for better-sqlite3.
 */
export function translate(sql: string, params: unknown[] = []): TranslateResult {
    const { sql: expanded, params: expandedParams } = expandArrays(sql, params);
    const syntaxTranslated = translateSQL(expanded);
    return translateParams(syntaxTranslated, expandedParams);
}

// =============================================================================
// SQL HELPERS
// =============================================================================

/**
 * Generate a `SUM(CASE WHEN ... THEN 1 ELSE 0 END)` aggregate for conditional counting.
 *
 * @param condition - SQL boolean expression (e.g. `"status = 'active'"`).
 * @returns SQL fragment suitable for use in a SELECT clause.
 */
export function countFilter(condition: string): string {
    return `SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END)`;
}

/**
 * Generate a date comparison expression for "within N days ago".
 *
 * @param column - Column name containing a datetime value.
 * @param daysParam - SQL expression or placeholder for the number of days.
 * @returns SQL boolean expression evaluating whether the column is within N days of now.
 */
export function withinDays(column: string, daysParam: string): string {
    return `${column} > datetime('now', '-' || ${daysParam} || ' days')`;
}

/**
 * Generate a `datetime('now', '-N unit')` expression for interval subtraction.
 *
 * @param amount - Number of units to subtract.
 * @param unit - Time unit (e.g. `'days'`, `'hours'`, `'minutes'`).
 * @returns SQL datetime expression for the point N units in the past.
 */
export function intervalAgo(amount: number, unit: string): string {
    return `datetime('now', '-${amount} ${unit}')`;
}

/**
 * Generate a weighted random ordering expression using exponential sampling.
 *
 * Higher salience values yield higher selection probability. Uses
 * `-LOG(uniform_random) / weight` — the Gumbel trick for weighted sampling.
 *
 * @param salienceExpr - Column name or SQL expression for the weight
 *   (e.g. `"salience / (1 + barren_cycles * 0.3)"`).
 * @returns SQL expression suitable for `ORDER BY` (ascending = highest probability first).
 */
export function weightedRandom(salienceExpr: string): string {
    return `-LOG(ABS(RANDOM()) / 9223372036854775807.0 + 1e-10) / (${salienceExpr})`;
}

/**
 * Generate an inverse-weighted random ordering expression.
 *
 * Lower column values yield higher selection probability (opposite of
 * {@link weightedRandom}). Used for cold-node sampling in domain-directed synthesis.
 *
 * @param column - Column name whose value inversely weights selection probability.
 * @returns SQL expression suitable for `ORDER BY` (ascending = highest probability first).
 */
export function inverseWeightedRandom(column: string): string {
    return `-LOG(ABS(RANDOM()) / 9223372036854775807.0 + 1e-10) * ${column}`;
}

/**
 * Get deep lineage query (ancestors and descendants) using recursive CTEs.
 * Params: $1 = node ID, $2 = max depth.
 * Returns connected_from so the frontend can reconstruct the tree structure.
 */
export function getLineageQuery(): string {
    return `
        WITH RECURSIVE
          ancestors(node_id, name, content, node_type, domain, weight, created_at, relation, distance, connected_from) AS (
            SELECT
              n.id, n.name, n.content, n.node_type, n.domain, n.weight, n.created_at,
              'ancestor', 1, $1
            FROM edges e
            JOIN nodes n ON n.id = e.source_id
            WHERE e.target_id = $1 AND e.edge_type = 'parent' AND n.archived = 0
            UNION ALL
            SELECT
              n.id, n.name, n.content, n.node_type, n.domain, n.weight, n.created_at,
              'ancestor', a.distance + 1, a.node_id
            FROM ancestors a
            JOIN edges e ON e.target_id = a.node_id AND e.edge_type = 'parent'
            JOIN nodes n ON n.id = e.source_id AND n.archived = 0
            WHERE a.distance < $2
          ),
          descendants(node_id, name, content, node_type, domain, weight, created_at, relation, distance, connected_from) AS (
            SELECT
              n.id, n.name, n.content, n.node_type, n.domain, n.weight, n.created_at,
              'descendant', 1, $1
            FROM edges e
            JOIN nodes n ON n.id = e.target_id
            WHERE e.source_id = $1 AND e.edge_type = 'parent' AND n.archived = 0
            UNION ALL
            SELECT
              n.id, n.name, n.content, n.node_type, n.domain, n.weight, n.created_at,
              'descendant', d.distance + 1, d.node_id
            FROM descendants d
            JOIN edges e ON e.source_id = d.node_id AND e.edge_type = 'parent'
            JOIN nodes n ON n.id = e.target_id AND n.archived = 0
            WHERE d.distance < $2
          )
        SELECT * FROM ancestors
        UNION ALL
        SELECT * FROM descendants
    `;
}

/**
 * Get the SQL query for finding pattern siblings — nodes that share abstract
 * patterns with a given node.
 *
 * Parameters: `$1` = source node ID, `$2` = exclude same domain (boolean),
 * `$3` = result limit.
 *
 * @returns SQL string returning node_id, content, domain, pattern_name, pattern_strength.
 */
export function getPatternSiblingsQuery(): string {
    return `
        SELECT DISTINCT
            n.id as node_id,
            n.content,
            n.domain,
            p.name as pattern_name,
            np2.strength as pattern_strength
        FROM node_abstract_patterns np1
        JOIN node_abstract_patterns np2 ON np1.pattern_id = np2.pattern_id AND np1.node_id != np2.node_id
        JOIN nodes n ON n.id = np2.node_id AND n.archived = FALSE
        JOIN abstract_patterns p ON p.id = np1.pattern_id
        WHERE np1.node_id = $1
          AND ($2 = FALSE OR n.domain != (SELECT domain FROM nodes WHERE id = $1))
        ORDER BY np2.strength DESC
        LIMIT $3
    `;
}
