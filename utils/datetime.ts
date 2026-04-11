/**
 * UTC datetime utilities for SQLite interop.
 *
 * SQLite's datetime('now') returns strings like "2026-04-10 21:08:12" - UTC
 * but without a timezone suffix. JavaScript's new Date() parses these as
 * LOCAL time, silently adding the timezone offset (e.g. +3600s in BST).
 * This causes phantom timeouts, incorrect age calculations, and premature
 * expiry checks that vary by server timezone.
 *
 * ALL server-side code that parses SQLite datetime strings MUST use these
 * functions instead of raw new Date(). The GUI converts to local for display.
 */

/**
 * Parse a SQLite datetime string as UTC. Handles both formats:
 *   - "2026-04-10 21:08:12"     (SQLite default - no timezone)
 *   - "2026-04-10T21:08:12.123Z" (ISO 8601 - already has timezone)
 *
 * Returns epoch milliseconds. Returns 0 for null/undefined/empty input.
 */
export function dbDateMs(value: string | null | undefined): number {
    if (!value) return 0;
    // Already has timezone info (ISO 8601 with Z or +/- offset) - parse directly
    if (value.includes('Z') || value.includes('+') || /T\d{2}:\d{2}:\d{2}[+-]/.test(value)) {
        return new Date(value).getTime();
    }
    // SQLite format without timezone - append Z to force UTC interpretation
    return new Date(value + 'Z').getTime();
}

/**
 * Parse a SQLite datetime string as a UTC Date object.
 * Returns null for null/undefined/empty input.
 */
export function dbDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const ms = dbDateMs(value);
    return ms ? new Date(ms) : null;
}

/**
 * Seconds elapsed since a SQLite datetime string (UTC).
 * Returns Infinity for null/undefined/empty input.
 */
export function dbDateAgeSeconds(value: string | null | undefined): number {
    if (!value) return Infinity;
    return Math.round((Date.now() - dbDateMs(value)) / 1000);
}
