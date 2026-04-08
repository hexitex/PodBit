import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { GATES, LAB_GATES, DEFAULT_SPEED } from './constants';

/**
 * Playback state machine for the Pipeline VCR.
 *
 * Manages cursor position over the event timeline and computes
 * gate counts and visible particles up to the cursor.
 *
 * Modes: 'live' | 'playing' | 'paused'
 */
export function usePlaybackState(events, timeRange, _isLive) {
  const [mode, setModeRaw] = useState('live');
  const [speed, setSpeed] = useState(DEFAULT_SPEED);
  const [cursorTime, setCursorTime] = useState(Date.now);
  const rafRef = useRef(null);
  const lastFrameRef = useRef(null);

  const setMode = useCallback((m) => {
    setModeRaw(m);
    if (m === 'live') setCursorTime(Date.now());
  }, []);

  const seek = useCallback((time) => {
    setCursorTime(time);
    setModeRaw('paused');
  }, []);

  const stepForward = useCallback(() => {
    const next = events.find((e) => e.time > cursorTime);
    if (next) { setCursorTime(next.time); setModeRaw('paused'); }
  }, [events, cursorTime]);

  const stepBackward = useCallback(() => {
    const prev = [...events].reverse().find((e) => e.time < cursorTime - 50);
    if (prev) { setCursorTime(prev.time); setModeRaw('paused'); }
  }, [events, cursorTime]);

  // Animation loop for 'playing' mode
  useEffect(() => {
    if (mode !== 'playing') return;
    lastFrameRef.current = performance.now();

    const tick = (now) => {
      const delta = now - (lastFrameRef.current || now);
      lastFrameRef.current = now;
      setCursorTime((prev) => {
        const next = prev + delta * speed;
        if (next >= timeRange.end + 2000) {
          setModeRaw('paused');
          return timeRange.end;
        }
        return next;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [mode, speed, timeRange.end]);

  // Live mode: keep cursor at now
  useEffect(() => {
    if (mode !== 'live') return;
    const id = setInterval(() => setCursorTime(Date.now()), 500);
    return () => clearInterval(id);
  }, [mode]);

  // Gate counts up to cursor
  const gateCounts = useMemo(() => {
    const counts = {};
    for (const g of GATES) counts[g.id] = { pass: 0, fail: 0, events: [] };
    for (const g of LAB_GATES) counts[g.id] = { pass: 0, fail: 0, events: [] };

    for (const evt of events) {
      if (evt.time > cursorTime) break;
      const gateId = evt.gateId;
      if (counts[gateId]) {
        if (evt.passed) counts[gateId].pass++;
        else counts[gateId].fail++;
        counts[gateId].events.push(evt);
      }
    }
    return counts;
  }, [events, cursorTime]);

  // Recent particles for animation — wider window at high speeds
  const recentParticles = useMemo(() => {
    // At 100x, show events from the last ~60s of real time (= 100min of event time)
    const windowMs = Math.max(60_000, 300_000 * speed);
    const cutoff = cursorTime - windowMs;
    return events.filter((e) => e.time > cutoff && e.time <= cursorTime).slice(-40);
  }, [events, cursorTime, speed]);

  return {
    mode,
    setMode,
    speed,
    setSpeed,
    cursorTime,
    seek,
    stepForward,
    stepBackward,
    gateCounts,
    recentParticles,
  };
}
