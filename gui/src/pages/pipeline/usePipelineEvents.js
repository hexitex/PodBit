import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { activity, getSecurityKey } from '../../lib/api';
import { classifyEvent, GATES, CULL_GATES } from './constants';

/**
 * Fetches pipeline events, classifies them into gate buckets,
 * and provides live SSE streaming.
 */
export function usePipelineEvents() {
  const [liveEvents, setLiveEvents] = useState([]);
  const [isLive, setIsLive] = useState(true);
  const esRef = useRef(null);

  // Historical fetch
  const { data: histData, isLoading } = useQuery({
    queryKey: ['pipeline', 'history'],
    queryFn: async () => {
      const [synth, voicing, cycleEvts, eliteEvts, grPass, grCull, labEvts, evmSys] = await Promise.all([
        activity.log({ days: 2, category: 'synthesis', limit: 200 }),
        activity.log({ days: 2, category: 'voicing', limit: 200 }),
        activity.log({ days: 2, category: 'cycle', limit: 200 }),
        activity.log({ days: 2, category: 'elite', limit: 100 }),
        activity.log({ days: 2, category: 'system', type: 'ground_rules_pass', limit: 200 }),
        activity.log({ days: 2, category: 'system', type: 'ground_rules_cull', limit: 200 }),
        activity.log({ days: 2, category: 'lab', limit: 200 }),
        activity.log({ days: 2, category: 'system', limit: 200 }),
      ]);
      return [
        ...(synth.events || []),
        ...(voicing.events || []),
        ...(cycleEvts.events || []),
        ...(eliteEvts.events || []),
        ...(grPass.events || []),
        ...(grCull.events || []),
        ...(labEvts.events || []),
        // Filter system events to just lab-verification-related ones
        ...(evmSys.events || []).filter(e => e.type?.startsWith('evm_')),
      ];
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const normalize = useCallback((evt) => {
    const ts = evt.timestamp || evt.created_at;
    return {
      ...evt,
      time: new Date(ts + (ts.endsWith('Z') ? '' : 'Z')).getTime(),
      detail: typeof evt.detail === 'string' ? (() => { try { return JSON.parse(evt.detail); } catch { return {}; } })() : (evt.detail || {}),
    };
  }, []);

  // SSE for live events (key in query — EventSource cannot send headers)
  useEffect(() => {
    if (!isLive) {
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
      return;
    }
    let cancelled = false;
    getSecurityKey().then((key) => {
      if (cancelled) return;
      const url = key ? `/api/activity/stream?key=${encodeURIComponent(key)}` : '/api/activity/stream';
      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener('message', (e) => {
        try {
          const event = JSON.parse(e.data);
          if (['synthesis', 'voicing', 'cycle', 'elite'].includes(event.category)
              || (event.category === 'system' && event.type?.startsWith('ground_rules_'))) {
            const norm = normalize(event);
            const cls = classifyEvent(norm);
            if (cls) {
              setLiveEvents((prev) => {
                const next = [...prev, norm];
                return next.length > 500 ? next.slice(-500) : next;
              });
            }
          }
        } catch { /* skip */ }
      });
    });

    return () => {
      cancelled = true;
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, [isLive, normalize]);

  // Merge, sort, dedup
  // Dedup by content fingerprint rather than by ID alone, because live SSE events
  // use in-memory counter IDs that collide with DB auto-increment IDs.
  // Use full message (not truncated) + childId from detail to distinguish births
  // that happen in the same second with similar messages.
  const historicalNorm = useMemo(() => (histData || []).map(normalize), [histData, normalize]);
  const allSorted = useMemo(() => {
    const merged = [...historicalNorm, ...liveEvents].sort((a, b) => a.time - b.time);
    const seen = new Set();
    return merged.filter((e) => {
      const detail = e.detail || {};
      const uniqueId = detail.childId || detail.nodeId || '';
      const key = `${e.time}:${e.category}:${e.type}:${uniqueId}:${(e.message || '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [historicalNorm, liveEvents]);

  // Classify all events into gate buckets
  const { classified, gateCounts } = useMemo(() => {
    const classified = [];
    const counts = {};
    // Initialize buckets for all known gates (birth + cull).
    const allGateIds = new Set([...GATES.map(g => g.id), ...CULL_GATES.map(g => g.id)]);
    for (const id of allGateIds) counts[id] = { pass: 0, fail: 0, events: [] };

    for (const evt of allSorted) {
      const cls = classifyEvent(evt);
      if (!cls) continue;

      const gateId = cls.gate;
      const passed = cls.passed;
      const entry = { ...evt, gateId, passed, reason: cls.reason };
      classified.push(entry);

      if (counts[gateId]) {
        if (passed) counts[gateId].pass++;
        else counts[gateId].fail++;
        counts[gateId].events.push(entry);
      }
    }
    return { classified, gateCounts: counts };
  }, [allSorted]);

  const timeRange = allSorted.length > 0
    ? { start: allSorted[0].time, end: allSorted[allSorted.length - 1].time }
    : { start: Date.now() - 3600_000, end: Date.now() };

  // Separate cull pipeline counts from birth pipeline counts
  const cullCounts = useMemo(() => {
    const counts = {};
    for (const g of CULL_GATES) {
      counts[g.id] = gateCounts[g.id] || { pass: 0, fail: 0, events: [] };
    }
    counts.total = CULL_GATES.reduce((s, g) => s + (gateCounts[g.id]?.pass || 0) + (gateCounts[g.id]?.fail || 0), 0);
    return counts;
  }, [gateCounts]);

  return {
    events: classified,
    allEvents: allSorted,
    gateCounts,
    cullCounts,
    timeRange,
    isLive,
    setLive: setIsLive,
    isLoading,
  };
}
