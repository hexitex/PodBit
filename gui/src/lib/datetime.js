/**
 * UTC datetime utilities for GUI display.
 *
 * Server stores all timestamps as UTC via SQLite datetime('now') which
 * omits the timezone suffix. These helpers ensure correct UTC parsing
 * before converting to the browser's local timezone for display.
 */

/**
 * Parse a server datetime string as UTC Date.
 * Handles both "2026-04-10 21:08:12" (SQLite) and ISO 8601 with Z.
 * Returns null for falsy input.
 */
export function utcDate(value) {
    if (!value) return null;
    if (typeof value !== 'string') return new Date(value);
    if (value.includes('Z') || value.includes('+') || /T\d{2}:\d{2}:\d{2}[+-]/.test(value)) {
        return new Date(value);
    }
    return new Date(value + 'Z');
}

/**
 * Format a server datetime for display in the user's local timezone.
 * Returns '--' for falsy input.
 */
export function formatLocal(value, opts) {
    const d = utcDate(value);
    if (!d || isNaN(d.getTime())) return '--';
    return d.toLocaleString('en-GB', opts);
}

/**
 * Format as short local date (e.g. "10 Apr 2026").
 */
export function formatLocalDate(value) {
    const d = utcDate(value);
    if (!d || isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Format as short local time (e.g. "21:08").
 */
export function formatLocalTime(value) {
    const d = utcDate(value);
    if (!d || isNaN(d.getTime())) return '--';
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Format as compact date+time (e.g. "10 Apr 21:08").
 */
export function formatLocalShort(value) {
    const d = utcDate(value);
    if (!d || isNaN(d.getTime())) return '--';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
           d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Epoch ms from a server datetime. Returns 0 for falsy input.
 */
export function utcMs(value) {
    if (!value) return 0;
    const d = utcDate(value);
    return d ? d.getTime() : 0;
}
