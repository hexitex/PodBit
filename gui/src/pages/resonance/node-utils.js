/** Shared constants and pure utilities for the Knowledge Graph / Podbit page. */

export const TYPE_COLORS = {
  seed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  synthesis: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  voiced: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  breakthrough: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  possible: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  question: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  raw: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  elite_verification: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
};

/** Returns a compact relative timestamp (e.g. "5m ago", "3h ago", "2d ago") or short date for node lists. */
export function formatNodeTime(ts) {
  if (!ts) return null;
  const d = new Date(ts.endsWith?.('Z') ? ts : ts + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  const diffMs = now - d;
  const diffH = diffMs / 3600000;
  if (diffH < 24) {
    const h = Math.floor(diffH);
    if (h < 1) { const m = Math.floor(diffMs / 60000); return `${m}m ago`; }
    return `${h}h ago`;
  }
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

/** Returns a full locale date-time string for node detail views. */
export function formatNodeTimeFull(ts) {
  if (!ts) return 'N/A';
  const d = new Date(ts.endsWith?.('Z') ? ts : ts + 'Z');
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleString();
}
