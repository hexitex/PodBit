import { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import * as d3 from 'd3';
import { sankey as d3Sankey, sankeyLinkHorizontal } from 'd3-sankey';
import { GATES, GATE_COLORS } from './constants';
import EventCard from './EventCard';
import { resolveNodeNames } from '../../lib/node-names';

/*
 * D3 Sankey flow diagram for the synthesis pipeline.
 *
 * The main flow enters from the left and passes through each gate sequentially.
 * At each gate, failures branch off downward/right to rejection reason nodes.
 * Link width is proportional to event count — the flow visually narrows as
 * events are filtered through the pipeline.
 *
 * Click any gate or reason node to see full event detail below the diagram.
 */

const GATE_CONFIG = {
  resonance: 'resonance_specificity', structural: 'synthesis_validation',
  voicing: 'voicing_constraints', provenance: 'claim_provenance',
  counterfactual: 'counterfactual_independence', consultant_pipeline: 'consultant_pipeline',
  redundancy: 'redundancy_ceiling', dedup: 'dedup_settings',
  junk: 'synthesis_quality_gates', specificity: 'synthesis_quality_gates',
};

/** Sankey-style gate tree with pass/fail counts and reason breakdown. */
export default function PipelineTree({ gateCounts = {}, compact = false, authoritativeBorn }) {
  const activeGates = GATES;
  const svgRef = useRef(null);
  const [selectedGate, setSelectedGate] = useState(null);
  const [reasonFilter, setReasonFilter] = useState(null);
  const [dims, setDims] = useState({ width: 880, height: 400 });

  // Build gate data with reason breakdowns
  const gateData = useMemo(() => {
    return activeGates.map((gate) => {
      const c = gateCounts[gate.id] || { pass: 0, fail: 0, events: [] };
      const reasons = {};
      for (const e of (c.events || [])) {
        if (e.passed) continue;
        const r = e.reason || e.detail?.reason || 'unknown';
        reasons[r] = (reasons[r] || 0) + 1;
      }
      const sorted = Object.entries(reasons).sort(([, a], [, b]) => b - a);
      return { gate, pass: c.pass, fail: c.fail, total: c.pass + c.fail, events: c.events || [], reasons: sorted };
    });
  }, [activeGates, gateCounts]);

  const totalEvents = gateData.reduce((s, d) => s + d.total, 0);

  // Batch-resolve node names from all events so EventCard can use getCachedName
  const [, _forceNames] = useState(0);
  useEffect(() => {
    const ids = new Set();
    for (const gd of gateData) {
      for (const e of gd.events) {
        const d = e.detail;
        if (!d) continue;
        for (const key of ['nodeId', 'childId', 'nodeA', 'nodeB', 'parentA', 'parentB', 'matchedNode', 'junkNode']) {
          const v = d[key];
          if (v && typeof v === 'string' && v.length > 8) ids.add(v);
        }
      }
    }
    if (ids.size > 0) resolveNodeNames([...ids]).then(() => _forceNames(n => n + 1));
  }, [totalEvents]);

  // Build Sankey graph data
  const { nodes, links } = useMemo(() => {
    if (totalEvents === 0) return { nodes: [], links: [] };

    const nodes = [];
    const links = [];
    const nodeMap = {};

    const addNode = (id, label, type, gateId, extra) => {
      if (nodeMap[id] != null) return nodeMap[id];
      const idx = nodes.length;
      nodes.push({ id, label, type, gateId, ...extra });
      nodeMap[id] = idx;
      return idx;
    };

    // Create gate nodes and reason nodes
    for (let i = 0; i < gateData.length; i++) {
      const d = gateData[i];
      const gateId = d.gate.id;
      const actualBorn = gateId === 'born' ? Math.max(d.pass, authoritativeBorn || 0) : undefined;
      addNode(`gate:${gateId}`, d.gate.label, d.gate.id === 'born' ? 'born' : 'gate', gateId,
        gateId === 'born' ? { bornCount: actualBorn } : undefined);

      // Reason nodes for this gate
      if (d.fail > 0 && gateId !== 'born') {
        const topReasons = compact ? d.reasons.slice(0, 2) : d.reasons.slice(0, 5);
        const shownFail = topReasons.reduce((s, [, c]) => s + c, 0);
        const otherFail = d.fail - shownFail;

        for (const [reason] of topReasons) {
          addNode(`reason:${gateId}:${reason}`, reason, 'reason', gateId);
        }
        if (otherFail > 0) {
          addNode(`reason:${gateId}:_other`, 'other', 'reason', gateId);
        }
      }
    }

    // Create links: gate → next gate (pass flow), gate → reasons (fail flow)
    for (let i = 0; i < gateData.length; i++) {
      const d = gateData[i];
      const gateId = d.gate.id;
      const srcIdx = nodeMap[`gate:${gateId}`];

      // Pass flow to next gate
      if (i < gateData.length - 1) {
        const nextGateId = gateData[i + 1].gate.id;
        // For the link into born, use the actual born count (child_created events)
        // rather than the previous gate's pass count, because not all pipeline paths
        // emit pass events at every intermediate gate.
        const linkValue = nextGateId === 'born'
          ? Math.max(d.pass, gateData[i + 1].pass, authoritativeBorn || 0)
          : d.pass;
        if (linkValue > 0) {
          const tgtIdx = nodeMap[`gate:${nextGateId}`];
          links.push({ source: srcIdx, target: tgtIdx, value: linkValue, type: 'pass' });
        }
      }

      // Fail flows to reason nodes
      if (d.fail > 0 && gateId !== 'born') {
        const topReasons = compact ? d.reasons.slice(0, 2) : d.reasons.slice(0, 5);
        const shownFail = topReasons.reduce((s, [, c]) => s + c, 0);
        const otherFail = d.fail - shownFail;

        for (const [reason, count] of topReasons) {
          const tgtIdx = nodeMap[`reason:${gateId}:${reason}`];
          links.push({ source: srcIdx, target: tgtIdx, value: count, type: 'fail' });
        }
        if (otherFail > 0) {
          const tgtIdx = nodeMap[`reason:${gateId}:_other`];
          links.push({ source: srcIdx, target: tgtIdx, value: otherFail, type: 'fail' });
        }
      }
    }

    // Filter out zero-value links
    return { nodes, links: links.filter(l => l.value > 0) };
  }, [gateData, totalEvents, compact]);

  // Render Sankey with D3
  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const width = dims.width;
    const height = dims.height;
    const margin = { top: 8, right: compact ? 80 : 220, bottom: 8, left: 8 };

    // Build sankey layout
    const sankeyGen = d3Sankey()
      .nodeId((_d, i) => i)
      .nodeWidth(compact ? 14 : 18)
      .nodePadding(compact ? 6 : 14)
      .nodeSort((a, b) => {
        // Gates and born always sort above reasons — keeps the main flow at the top
        if (a.type === 'reason' && b.type !== 'reason') return 1;
        if (a.type !== 'reason' && b.type === 'reason') return -1;
        return 0;
      })
      .extent([[margin.left, margin.top], [width - margin.right, height - margin.bottom]]);

    const graph = sankeyGen({
      nodes: nodes.map(d => ({ ...d })),
      links: links.map(d => ({ ...d })),
    });

    const g = svg.append('g');

    // Links
    g.append('g')
      .selectAll('path')
      .data(graph.links)
      .join('path')
      .attr('d', sankeyLinkHorizontal())
      .attr('fill', 'none')
      .attr('stroke', d => {
        const sourceNode = graph.nodes[d.source.index ?? d.source];
        const gateId = sourceNode?.gateId;
        if (d.type === 'fail') return GATE_COLORS[gateId] || '#ef4444';
        return GATE_COLORS[gateId] || '#34d399';
      })
      .attr('stroke-opacity', d => d.type === 'fail' ? 0.35 : 0.45)
      .attr('stroke-width', d => Math.max(1.5, d.width));

    // Nodes
    const nodeGroup = g.append('g')
      .selectAll('g')
      .data(graph.nodes)
      .join('g')
      .style('cursor', compact ? 'default' : 'pointer')
      .on('click', (event, d) => {
        if (compact) return;
        event.stopPropagation();
        const gateId = d.gateId;
        if (d.type === 'reason') {
          setSelectedGate(gateId);
          setReasonFilter(prev => prev === d.label ? null : d.label);
        } else {
          setSelectedGate(prev => prev === gateId ? null : gateId);
          setReasonFilter(null);
        }
      });

    // Node rects
    nodeGroup.append('rect')
      .attr('x', d => d.x0)
      .attr('y', d => d.y0)
      .attr('width', d => d.x1 - d.x0)
      .attr('height', d => Math.max(1, d.y1 - d.y0))
      .attr('rx', 3)
      .attr('fill', d => {
        if (d.type === 'reason') return GATE_COLORS[d.gateId] || '#ef4444';
        return GATE_COLORS[d.gateId] || '#a855f7';
      })
      .attr('opacity', d => {
        if (d.type === 'reason') return 0.5;
        return 0.8;
      });

    // Node labels
    nodeGroup.append('text')
      .attr('x', d => d.x1 + 6)
      .attr('y', d => (d.y0 + d.y1) / 2)
      .attr('dy', '0.35em')
      .attr('text-anchor', 'start')
      .text(d => {
        const val = d.bornCount != null
          ? d.bornCount
          : (d.value || (d.sourceLinks || []).reduce((s, l) => s + l.value, 0));
        const maxLen = d.type === 'reason' ? 24 : 16;
        const label = d.label.length > maxLen ? d.label.slice(0, maxLen - 1) + '\u2026' : d.label;
        return `${label} (${val})`;
      })
      .attr('fill', d => GATE_COLORS[d.gateId] || '#9ca3af')
      .style('font-size', compact ? '10px' : '12px')
      .style('font-family', 'ui-monospace, monospace')
      .style('font-weight', d => d.type === 'gate' || d.type === 'born' ? '600' : '400')
      .style('pointer-events', 'none');

  }, [nodes, links, dims, compact]);

  // Resize observer
  useEffect(() => {
    if (!svgRef.current) return;
    const container = svgRef.current.parentElement;
    if (!container) return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (w > 0) {
          // Height scales with number of nodes
          const h = compact
            ? Math.max(150, Math.min(300, nodes.length * 18))
            : Math.max(300, Math.min(700, nodes.length * 28));
          setDims({ width: w, height: h });
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [nodes.length, compact]);

  if (totalEvents === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 dark:text-gray-500 text-sm">
        No pipeline events yet. Start a synthesis cycle to see gate activity.
      </div>
    );
  }

  const selectedData = selectedGate ? gateData.find(d => d.gate.id === selectedGate) : null;

  return (
    <div>
      <svg
        ref={svgRef}
        width={dims.width}
        height={dims.height}
        className="w-full"
        style={{ minHeight: compact ? 150 : 300 }}
      />

      {/* Detail panel — appears below Sankey when a gate is selected */}
      {!compact && selectedData && (
        <GateDetail
          data={selectedData}
          reasonFilter={reasonFilter}
          onReasonFilter={setReasonFilter}
          onClose={() => { setSelectedGate(null); setReasonFilter(null); }}
        />
      )}
    </div>
  );
}

/**
 * Detail panel for a selected gate — rejection breakdown, filter tabs, event cards.
 */
function GateDetail({ data, reasonFilter, onReasonFilter, onClose }) {
  const [filter, setFilter] = useState('all');
  const isBorn = data.gate.id === 'born';
  const configSection = GATE_CONFIG[data.gate.id];

  const filteredEvents = useMemo(() => {
    let events = data.events;
    if (filter === 'passed') events = events.filter(e => e.passed);
    else if (filter === 'failed') events = events.filter(e => !e.passed);
    if (reasonFilter) {
      events = events.filter(e => (e.reason || e.detail?.reason || 'unknown') === reasonFilter);
    }
    return [...events].reverse().slice(0, 50);
  }, [data.events, filter, reasonFilter]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.15 }}
        className="mt-2 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-4"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className={`text-sm font-semibold ${isBorn ? 'text-green-600 dark:text-green-400' : 'text-gray-900 dark:text-white'}`}>
              {data.gate.label}
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {data.pass} pass / {data.fail} fail
            </span>
            {configSection && (
              <Link
                to={`/config#${configSection}`}
                className="p-1 text-gray-300 dark:text-gray-600 hover:text-purple-500 dark:hover:text-purple-400"
                title="Configure this gate"
              >
                <Settings size={12} />
              </Link>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-2 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            Close
          </button>
        </div>

        {/* Rejection breakdown */}
        {data.reasons.length > 0 && (
          <div className="mb-3 space-y-1">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Rejection Breakdown
            </p>
            {data.reasons.map(([reason, count]) => {
              const pct = data.fail > 0 ? (count / data.fail) * 100 : 0;
              const isActive = reasonFilter === reason;
              return (
                <div
                  key={reason}
                  className={`flex items-center gap-2 text-xs cursor-pointer rounded px-1 py-0.5 transition-colors ${
                    isActive ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                  onClick={() => onReasonFilter(isActive ? null : reason)}
                >
                  <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-red-400 dark:bg-red-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-gray-600 dark:text-gray-300 w-28 truncate">{reason}</span>
                  <span className="text-gray-400 dark:text-gray-500 w-6 text-right font-mono">{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-1 text-xs mb-2">
          {['all', 'passed', 'failed'].map(f => (
            <button
              key={f}
              className={`px-2 py-0.5 rounded transition-colors ${
                filter === f
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 font-semibold'
                  : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
              }`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? `All (${data.total})` : f === 'passed' ? `Passed (${data.pass})` : `Failed (${data.fail})`}
            </button>
          ))}
          {reasonFilter && (
            <button
              className="px-2 py-0.5 rounded bg-red-100 dark:bg-red-900/20 text-red-500 dark:text-red-400 font-semibold"
              onClick={() => onReasonFilter(null)}
            >
              {reasonFilter} {'\u2717'}
            </button>
          )}
        </div>

        {/* Events list */}
        <div className="max-h-72 overflow-y-auto space-y-1">
          {filteredEvents.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 italic py-2">
              No events match filter
            </p>
          ) : (
            filteredEvents.map((evt, i) => <EventCard key={evt.id || i} evt={evt} />)
          )}
        </div>

        {data.events.length > 50 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 italic mt-1">
            Showing latest 50 of {data.events.length} events
          </p>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
