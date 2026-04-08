import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import RadarProfile from './RadarProfile';
import {
  SYSTEM_PROFILE_AXES, AXIS_PARAM_TERMS,
  computeSystemProfile, reverseMapAxis, norm, getNestedValue,
} from '../pages/config/config-constants';

/**
 * AxisDetailPanel — shows contributing parameters grouped by section
 * when an axis is selected. Each section is clickable for navigation.
 */
function AxisDetailPanel({ axisKey, config, onNavigateToSection, onClose }) {
  const terms = axisKey ? AXIS_PARAM_TERMS[axisKey] : [];
  const axisLabel = axisKey ? SYSTEM_PROFILE_AXES.find(a => a.key === axisKey)?.label : '';

  // Group terms by sectionId
  const grouped = useMemo(() => {
    const g = {};
    for (const term of terms) {
      const sid = term.sectionId || 'other';
      if (!g[sid]) g[sid] = { terms: [], totalWeight: 0 };
      g[sid].terms.push(term);
      g[sid].totalWeight += term.weight;
    }
    // Sort sections by total weight descending
    return Object.entries(g).sort((a, b) => b[1].totalWeight - a[1].totalWeight);
  }, [axisKey, terms]);

  if (!axisKey) return null;

  const continuousCount = terms.filter(t => t.type === 'continuous' || t.type === 'absValue').length;
  const booleanCount = terms.filter(t => t.type === 'boolean').length;
  const computedCount = terms.filter(t => t.type === 'computed').length;

  return (
    <div className="mt-3 border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50/50 dark:bg-blue-900/20 animate-in fade-in duration-200">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-300">
          {axisLabel}
          <span className="ml-2 font-normal text-blue-500 dark:text-blue-400 text-xs">
            {terms.length} params ({continuousCount} draggable{booleanCount > 0 ? `, ${booleanCount} toggle` : ''}{computedCount > 0 ? `, ${computedCount} computed` : ''})
          </span>
        </h4>
        <button
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 px-1"
        >
          close
        </button>
      </div>

      <div className="space-y-2.5">
        {grouped.map(([sectionId, { terms: sectionTerms, totalWeight }]) => (
          <div key={sectionId}>
            <button
              onClick={() => onNavigateToSection(sectionId)}
              className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 hover:underline mb-1"
            >
              <ChevronRight size={12} />
              <span>{sectionId.replace(/_/g, ' ')}</span>
              <span className="text-blue-400 dark:text-blue-500 font-normal ml-1">
                ({(totalWeight * 100).toFixed(0)}%)
              </span>
            </button>
            <div className="ml-4 space-y-0.5">
              {sectionTerms.map((term, i) => {
                let effectiveNorm = 0;
                if (term.type === 'boolean') {
                  const val = getNestedValue(config, term.configPath) ?? term.defaultValue;
                  effectiveNorm = val ? 1 : 0;
                } else if (term.type === 'computed') {
                  effectiveNorm = term.computeFn(config);
                } else if (term.type === 'absValue') {
                  const val = getNestedValue(config, term.configPath) ?? term.defaultValue;
                  const n = norm(Math.abs(val), term.min, term.max);
                  effectiveNorm = term.inverted ? (1 - n) : n;
                } else {
                  const val = getNestedValue(config, term.configPath) ?? term.defaultValue;
                  const n = norm(val, term.min, term.max);
                  effectiveNorm = term.inverted ? (1 - n) : n;
                }

                const _contribution = effectiveNorm * term.weight;
                const isBool = term.type === 'boolean';
                const isComputed = term.type === 'computed';

                return (
                  <div key={i} className="flex items-center gap-2 text-xs group">
                    <span className={`w-36 truncate ${isBool || isComputed ? 'text-gray-400 dark:text-gray-500 italic' : 'text-gray-600 dark:text-gray-400'}`} title={term.label}>
                      {term.label}
                      {isBool && ' (toggle)'}
                      {isComputed && ' (computed)'}
                    </span>
                    <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden min-w-[60px]">
                      <div
                        className={`h-full rounded-full transition-all ${isBool ? 'bg-amber-400' : isComputed ? 'bg-purple-400' : 'bg-blue-500'}`}
                        style={{ width: `${effectiveNorm * 100}%` }}
                      />
                    </div>
                    <span className="text-gray-400 dark:text-gray-500 font-mono w-8 text-right text-[10px]">
                      {(term.weight * 100).toFixed(0)}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * InteractiveRadar — wraps RadarProfile with draggable SVG dots and detail panel.
 *
 * @param {Object} props
 * @param {Object} props.config - Current config object
 * @param {Function} props.onDragCommit - (changes: {configPath, value}[]) => void
 * @param {number} [props.size=300] - Chart height in px
 */
export default function InteractiveRadar({ config, onDragCommit, onNavigateToSection, size = 300 }) {
  const containerRef = useRef(null);
  const [selectedAxis, setSelectedAxis] = useState(null);
  const [dragState, setDragState] = useState(null); // { axisKey, axisIndex, targetValue }
  const [pendingChanges, setPendingChanges] = useState(null); // { axisKey, changes: [] } — shown after drag release
  const [containerRect, setContainerRect] = useState(null);

  const axes = SYSTEM_PROFILE_AXES;
  const currentProfile = useMemo(() => computeSystemProfile(config || {}), [config]);

  // Observe container size for overlay positioning
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) setContainerRect(entries[0].contentRect);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Build layers for the base RadarProfile
  const layers = useMemo(() => {
    const l = [
      { name: 'Current', data: currentProfile, color: '#2563eb', active: true },
    ];
    if (dragState) {
      l.push({
        name: 'Target',
        data: { ...currentProfile, [dragState.axisKey]: dragState.targetValue },
        color: '#f59e0b',
        active: true,
      });
    }
    return l;
  }, [currentProfile, dragState]);

  // Polar coordinate math matching Recharts layout
  const computeDotPosition = useCallback((axisIndex, value) => {
    if (!containerRect) return null;
    const cx = containerRect.width / 2;
    const cy = containerRect.height / 2;
    const r = Math.min(cx, cy) * 0.75;
    const angle = (axisIndex * 2 * Math.PI / axes.length) - Math.PI / 2;
    return {
      x: cx + r * value * Math.cos(angle),
      y: cy + r * value * Math.sin(angle),
    };
  }, [containerRect, axes.length]);

  const handlePointerDown = useCallback((axisIndex, axisKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.setPointerCapture(e.pointerId);
    setSelectedAxis(axisKey);
    setDragState({ axisKey, axisIndex, targetValue: currentProfile[axisKey] });
  }, [currentProfile]);

  const handlePointerMove = useCallback((e) => {
    if (!dragState || !containerRect) return;

    const svgEl = containerRef.current?.querySelector('.interactive-radar-overlay');
    if (!svgEl) return;
    const svgRect = svgEl.getBoundingClientRect();

    const cx = containerRect.width / 2;
    const cy = containerRect.height / 2;
    const r = Math.min(cx, cy) * 0.75;

    const mouseX = e.clientX - svgRect.left - cx;
    const mouseY = e.clientY - svgRect.top - cy;

    const angle = (dragState.axisIndex * 2 * Math.PI / axes.length) - Math.PI / 2;
    const axisX = Math.cos(angle);
    const axisY = Math.sin(angle);

    // Project mouse position onto the axis line
    const projection = (mouseX * axisX + mouseY * axisY) / r;
    const clamped = Math.max(0, Math.min(1, projection));

    setDragState(prev => prev ? { ...prev, targetValue: clamped } : null);
  }, [dragState, containerRect, axes.length]);

  // Live preview of what parameters would change during drag
  const liveChanges = useMemo(() => {
    if (!dragState) return [];
    return reverseMapAxis(dragState.axisKey, dragState.targetValue, config || {});
  }, [dragState?.axisKey, dragState?.targetValue, config]);

  const handlePointerUp = useCallback(() => {
    if (!dragState) return;
    const changes = reverseMapAxis(dragState.axisKey, dragState.targetValue, config || {});
    if (changes.length > 0) {
      setPendingChanges({ axisKey: dragState.axisKey, changes });
    }
    setDragState(null);
  }, [dragState, config]);

  const handleAxisClick = useCallback((axisKey) => {
    setSelectedAxis(prev => prev === axisKey ? null : axisKey);
  }, []);

  return (
    <div>
      {/* Radar with overlay */}
      <div ref={containerRef} className="relative" style={{ height: size }}>
        {/* Base Recharts radar — hide its dots since we overlay our own */}
        <RadarProfile
          layers={layers}
          axes={axes}
          size={size}
          showLegend={true}
        />

        {/* Interactive SVG overlay */}
        {containerRect && (
          <svg
            className="interactive-radar-overlay absolute inset-0"
            width={containerRect.width}
            height={containerRect.height}
            style={{ pointerEvents: dragState ? 'auto' : 'none' }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            {axes.map((axis, i) => {
              const isDragging = dragState?.axisKey === axis.key;
              const value = isDragging ? dragState.targetValue : currentProfile[axis.key];
              const pos = computeDotPosition(i, value);
              if (!pos) return null;

              const isSelected = selectedAxis === axis.key;

              return (
                <g key={axis.key}>
                  {/* Larger invisible hit area for easier grabbing */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={16}
                    fill="transparent"
                    className="pointer-events-auto cursor-grab active:cursor-grabbing"
                    onPointerDown={(e) => handlePointerDown(i, axis.key, e)}
                    onClick={() => handleAxisClick(axis.key)}
                  />
                  {/* Visible dot */}
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={isDragging ? 7 : isSelected ? 6 : 4.5}
                    fill={isDragging ? '#f59e0b' : isSelected ? '#3b82f6' : '#2563eb'}
                    stroke="white"
                    strokeWidth={2}
                    className="pointer-events-none transition-all duration-100"
                    style={{ filter: isDragging || isSelected ? 'drop-shadow(0 0 4px rgba(59, 130, 246, 0.5))' : 'none' }}
                  />
                  {/* Value label during drag */}
                  {isDragging && (
                    <text
                      x={pos.x}
                      y={pos.y - 14}
                      textAnchor="middle"
                      className="text-[10px] font-mono font-medium fill-amber-600 dark:fill-amber-400 pointer-events-none"
                    >
                      {dragState.targetValue.toFixed(2)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>

      {/* Live change preview during drag */}
      {dragState && liveChanges.length > 0 && (
        <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs">
          <p className="font-semibold text-amber-700 dark:text-amber-300 mb-1">
            Dragging {axes.find(a => a.key === dragState.axisKey)?.label} — {liveChanges.length} params
          </p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {liveChanges.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <span className="truncate flex-1">{c.label}</span>
                <span className="font-mono text-[10px] text-gray-400">{typeof c.currentValue === 'number' ? c.currentValue.toFixed(3) : c.currentValue}</span>
                <span className="text-amber-500">&rarr;</span>
                <span className="font-mono text-[10px] font-semibold">{typeof c.value === 'number' ? c.value.toFixed(3) : c.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending changes confirmation after drag release */}
      {pendingChanges && (
        <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg text-xs">
          <p className="font-semibold text-blue-700 dark:text-blue-300 mb-2">
            Apply {pendingChanges.changes.length} changes to {axes.find(a => a.key === pendingChanges.axisKey)?.label}?
          </p>
          <div className="space-y-0.5 max-h-40 overflow-y-auto mb-3">
            {pendingChanges.changes.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                <span className="truncate flex-1">{c.label}</span>
                <span className="font-mono text-[10px] text-gray-400">{typeof c.currentValue === 'number' ? c.currentValue.toFixed(3) : c.currentValue}</span>
                <span className="text-blue-500">&rarr;</span>
                <span className="font-mono text-[10px] font-semibold">{typeof c.value === 'number' ? c.value.toFixed(3) : c.value}</span>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onDragCommit?.(pendingChanges.changes);
                setPendingChanges(null);
              }}
              className="flex-1 px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 text-xs font-medium"
            >
              Apply
            </button>
            <button
              onClick={() => setPendingChanges(null)}
              className="flex-1 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-xs"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Axis detail panel */}
      {!dragState && !pendingChanges && (
        <AxisDetailPanel
          axisKey={selectedAxis}
          config={config || {}}
          onNavigateToSection={(sectionId) => {
            onNavigateToSection?.(sectionId);
          }}
          onClose={() => setSelectedAxis(null)}
        />
      )}
    </div>
  );
}
