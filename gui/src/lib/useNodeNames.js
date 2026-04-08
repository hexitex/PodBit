/**
 * React hook for resolving node IDs to human-readable names.
 * Uses the shared node-names cache — triggers a single batch API call
 * per render cycle for all uncached IDs.
 */
import { useState, useEffect } from 'react';
import { resolveNodeNames } from './node-names';

/**
 * Given an array of node IDs, returns a map of id -> name.
 * Triggers an async fetch for any uncached IDs and re-renders when resolved.
 * @param {string[]} ids - Array of node IDs to resolve
 * @returns {Record<string, string>} Map of id -> resolved name (or truncated ID while loading)
 */
export function useNodeNames(ids) {
  const [names, setNames] = useState({});

  useEffect(() => {
    const validIds = (ids || []).filter(id => id && typeof id === 'string' && id.length > 8);
    if (validIds.length === 0) return;

    let cancelled = false;
    resolveNodeNames(validIds).then(resolved => {
      if (!cancelled) setNames(prev => ({ ...prev, ...resolved }));
    });
    return () => { cancelled = true; };
  }, [ids?.join(',')]);

  return names;
}
