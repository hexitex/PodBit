import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Radio, ChevronDown, ChevronUp, Pause, Play, Trash2 } from 'lucide-react';
import { getSecurityKey } from '../lib/api';
import { resolveNodeNames, getCachedName } from '../lib/node-names';

const CATEGORY_COLORS = {
  synthesis:  { bg: 'bg-purple-500', text: 'text-purple-400', dot: 'bg-purple-400', bar: '#a855f7' },
  proxy:      { bg: 'bg-orange-500', text: 'text-orange-400', dot: 'bg-orange-400', bar: '#fb923c' },
  mcp:        { bg: 'bg-blue-500',   text: 'text-blue-400',   dot: 'bg-blue-400',   bar: '#60a5fa' },
  kb:         { bg: 'bg-emerald-500', text: 'text-emerald-400', dot: 'bg-emerald-400', bar: '#34d399' },
  voicing:    { bg: 'bg-pink-500',   text: 'text-pink-400',   dot: 'bg-pink-400',   bar: '#f472b6' },
  config:     { bg: 'bg-yellow-500',  text: 'text-yellow-400', dot: 'bg-yellow-400', bar: '#facc15' },
  system:     { bg: 'bg-gray-500',   text: 'text-gray-400',   dot: 'bg-gray-400',   bar: '#9ca3af' },
  llm:        { bg: 'bg-cyan-500',   text: 'text-cyan-400',   dot: 'bg-cyan-400',   bar: '#22d3ee' },
  cycle:      { bg: 'bg-teal-500',   text: 'text-teal-400',   dot: 'bg-teal-400',   bar: '#2dd4bf' },
  elite:      { bg: 'bg-amber-500',  text: 'text-amber-400',  dot: 'bg-amber-400',  bar: '#fbbf24' },
  lifecycle:  { bg: 'bg-rose-500',   text: 'text-rose-400',   dot: 'bg-rose-400',   bar: '#fb7185' },
  api:        { bg: 'bg-indigo-500', text: 'text-indigo-400', dot: 'bg-indigo-400', bar: '#818cf8' },
};

const CATEGORIES = Object.keys(CATEGORY_COLORS);
const MAX_EVENTS = 200;

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Inline similarity bar — shows score vs threshold as a colored gauge */
function SimilarityBar({ similarity, threshold, passed, gate }) {
  const pct = Math.min(similarity * 100, 100);
  const threshPct = Math.min(threshold * 100, 100);
  const barColor = passed ? '#34d399' : '#ef4444';
  const label = gate === 'specificity'
    ? `${(similarity * 10).toFixed(1)}`
    : similarity.toFixed(3);

  return (
    <div className="inline-flex items-center gap-1.5 ml-2">
      <div className="relative w-24 h-2.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="absolute top-0 bottom-0 w-px bg-yellow-400/80 z-10"
          style={{ left: `${threshPct}%` }}
          title={`Threshold: ${threshold.toFixed(3)}`}
        />
        <div
          className="absolute top-0 left-0 bottom-0 rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <span className="text-xs font-mono" style={{ color: barColor }}>{label}</span>
    </div>
  );
}

// ─── Inline chips ────────────────────────────────────────────────
// Small badges shown after the message for key detail fields

const CHIP = 'inline-flex items-center px-1.5 py-0 rounded text-[10px] font-mono leading-relaxed';

function InlineChips({ detail, type }) {
  if (!detail) return null;
  const chips = [];

  // Domain
  if (detail.domain) {
    chips.push(
      <span key="domain" className={`${CHIP} bg-gray-800 text-gray-400`}>{detail.domain}</span>
    );
  }

  // Node IDs — show cached name (or truncated ID as fallback) as a link
  const nodeId = detail.nodeId || detail.childId || detail.nodeA || detail.parentA;
  if (nodeId && typeof nodeId === 'string' && nodeId.length > 8) {
    chips.push(
      <Link key="node" to={`/graph?node=${nodeId}`} onClick={(e) => e.stopPropagation()}
        className={`${CHIP} bg-blue-900/40 text-blue-400 hover:bg-blue-900/60`}
        title={nodeId}>
        {getCachedName(nodeId)}
      </Link>
    );
  }

  // Second node for pair operations
  const nodeB = detail.nodeB || detail.parentB;
  if (nodeB && typeof nodeB === 'string' && nodeB.length > 8) {
    chips.push(
      <Link key="nodeB" to={`/graph?node=${nodeB}`} onClick={(e) => e.stopPropagation()}
        className={`${CHIP} bg-blue-900/40 text-blue-400 hover:bg-blue-900/60`}
        title={nodeB}>
        {getCachedName(nodeB)}
      </Link>
    );
  }

  // Subsystem / model for LLM calls
  if (detail.subsystem) {
    chips.push(
      <span key="sub" className={`${CHIP} bg-cyan-900/40 text-cyan-400`}>{detail.subsystem}</span>
    );
  }
  if (detail.model || detail.modelName) {
    chips.push(
      <span key="model" className={`${CHIP} bg-cyan-900/30 text-cyan-500`}>{detail.model || detail.modelName}</span>
    );
  }

  // Weight change
  if (detail.weight != null) {
    const w = Number(detail.weight);
    chips.push(
      <span key="weight" className={`${CHIP} ${w >= 1.0 ? 'text-green-400' : w < 0.5 ? 'text-red-400' : 'text-gray-400'} bg-gray-800`}>
        w:{w.toFixed(3)}
      </span>
    );
  }

  // Fitness
  if (detail.fitness != null) {
    const f = Number(detail.fitness);
    chips.push(
      <span key="fitness" className={`${CHIP} ${f >= 0.3 ? 'text-green-400' : 'text-yellow-400'} bg-gray-800`}>
        fit:{f.toFixed(3)}
      </span>
    );
  }

  // Specificity
  if (detail.specificity != null && !detail.similarity) {
    chips.push(
      <span key="spec" className={`${CHIP} bg-gray-800 text-gray-400`}>
        spec:{Number(detail.specificity).toFixed(1)}
      </span>
    );
  }

  // Elapsed time for LLM calls
  if (detail.elapsed != null) {
    const ms = Number(detail.elapsed);
    const label = ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
    chips.push(
      <span key="elapsed" className={`${CHIP} bg-gray-800 ${ms > 10000 ? 'text-red-400' : ms > 3000 ? 'text-yellow-400' : 'text-gray-500'}`}>
        {label}
      </span>
    );
  }

  // Token usage
  if (detail.usage?.total_tokens) {
    chips.push(
      <span key="tokens" className={`${CHIP} bg-gray-800 text-gray-500`}>
        {detail.usage.total_tokens.toLocaleString()}tok
      </span>
    );
  }

  // Generation level for elite
  if (detail.generation != null && typeof detail.generation === 'number') {
    chips.push(
      <span key="gen" className={`${CHIP} bg-amber-900/30 text-amber-400`}>
        gen:{detail.generation}
      </span>
    );
  }

  // Gate name
  if (detail.gate && detail.passed != null) {
    chips.push(
      <span key="gate" className={`${CHIP} ${detail.passed ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
        {detail.gate}:{detail.passed ? 'pass' : 'fail'}
      </span>
    );
  }

  // Trajectory
  if (detail.trajectory) {
    chips.push(
      <span key="traj" className={`${CHIP} bg-gray-800 ${detail.trajectory === 'abstraction' ? 'text-purple-400' : 'text-blue-400'}`}>
        {detail.trajectory}
      </span>
    );
  }

  // API verification impact
  if (detail.impact) {
    const impactColors = {
      structural_refutation: 'text-red-400 bg-red-900/30',
      value_correction: 'text-yellow-400 bg-yellow-900/30',
      structural_validation: 'text-green-400 bg-green-900/30',
      inconclusive: 'text-gray-400 bg-gray-800',
    };
    chips.push(
      <span key="impact" className={`${CHIP} ${impactColors[detail.impact] || 'bg-gray-800 text-gray-400'}`}>
        {detail.impact.replace('structural_', '').replace('value_', '')}
      </span>
    );
  }

  // API name
  if (detail.apiName) {
    chips.push(
      <span key="apiName" className={`${CHIP} bg-indigo-900/30 text-indigo-400`}>{detail.apiName}</span>
    );
  }

  // HTTP status for API calls
  if (detail.httpStatus) {
    const statusColor = detail.httpStatus >= 400 ? 'text-red-400 bg-red-900/30' : 'text-green-400 bg-green-900/30';
    chips.push(
      <span key="http" className={`${CHIP} ${statusColor}`}>HTTP {detail.httpStatus}</span>
    );
  }

  // Response time for API calls
  if (detail.responseTimeMs != null) {
    const ms = Number(detail.responseTimeMs);
    chips.push(
      <span key="apiTime" className={`${CHIP} bg-gray-800 ${ms > 5000 ? 'text-red-400' : ms > 2000 ? 'text-yellow-400' : 'text-gray-500'}`}>
        {ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}
      </span>
    );
  }

  // Rating for autorating
  if (detail.ratingLabel) {
    const rColors = { useful: 'text-green-400 bg-green-900/30', 'not useful': 'text-yellow-400 bg-yellow-900/30', harmful: 'text-red-400 bg-red-900/30' };
    chips.push(
      <span key="rating" className={`${CHIP} ${rColors[detail.ratingLabel] || 'bg-gray-800 text-gray-400'}`}>
        {detail.ratingLabel}
      </span>
    );
  }

  // Promoted flag
  if (detail.promoted === true) {
    chips.push(
      <span key="promoted" className={`${CHIP} bg-amber-900/30 text-amber-400`}>promoted</span>
    );
  }

  return chips.length > 0 ? <span className="inline-flex items-center gap-1 ml-2 flex-wrap">{chips}</span> : null;
}

// ─── Formatted detail section ────────────────────────────────────

// Keys already surfaced as inline chips — hide from detail dump to avoid duplication
const CHIP_KEYS = new Set([
  'domain', 'nodeId', 'childId', 'nodeA', 'nodeB', 'parentA', 'parentB',
  'subsystem', 'model', 'modelId', 'modelName', 'weight', 'fitness', 'elapsed', 'usage',
  'generation', 'gate', 'passed', 'trajectory', 'ratingLabel', 'promoted',
  // Also hide similarity/threshold since they get the SimilarityBar
  'similarity', 'threshold',
  // API verification chips
  'impact', 'apiName', 'httpStatus', 'responseTimeMs',
]);

function formatDetailValue(key, value) {
  if (value === null || value === undefined) return <span className="text-gray-600 italic">null</span>;
  if (typeof value === 'boolean') {
    return value
      ? <span className="text-green-400">true</span>
      : <span className="text-red-400">false</span>;
  }
  if (typeof value === 'number') {
    // Node counts, scores, etc — format nicely
    if (key.includes('similarity') || key.includes('confidence') || key.includes('composite') || key.includes('Score') || key.includes('score')) {
      return <span className="text-cyan-400">{value.toFixed(3)}</span>;
    }
    if (key.includes('weight') || key.includes('specificity')) {
      return <span className="text-cyan-400">{value.toFixed(3)}</span>;
    }
    if (key.includes('time') || key.includes('Ms') || key.includes('ms')) {
      const ms = value;
      return <span className="text-gray-400">{ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`}</span>;
    }
    return <span className="text-cyan-400">{value.toLocaleString()}</span>;
  }
  if (typeof value === 'string') {
    // Node ID — truncate and link
    if ((key.endsWith('Id') || key.endsWith('_id') || key === 'nodeA' || key === 'nodeB' || key === 'matchedNode' || key === 'junkNode') && /^[0-9a-f-]{30,}$/i.test(value)) {
      return (
        <Link to={`/graph?node=${value}`} className="text-blue-400 hover:text-blue-300 hover:underline" title={value}>
          {getCachedName(value)}
        </Link>
      );
    }
    return <span className="text-gray-300">{value}</span>;
  }
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return <span className="text-gray-400">[{value.length} items]</span>;
    }
    // Render sub-object as mini key-value pairs
    return (
      <span className="text-gray-400">
        {Object.entries(value).map(([k, v], i) => (
          <span key={k}>
            {i > 0 && <span className="text-gray-700"> | </span>}
            <span className="text-gray-600">{k}:</span> {typeof v === 'number' ? v.toLocaleString() : String(v)}
          </span>
        ))}
      </span>
    );
  }
  return <span className="text-gray-400">{String(value)}</span>;
}

function DetailSection({ detail }) {
  // Filter out keys already shown as chips
  const entries = Object.entries(detail).filter(([k]) => !CHIP_KEYS.has(k));
  if (entries.length === 0) return <div className="text-gray-700 italic">No additional detail</div>;

  // Group: scores/metrics first, then IDs, then everything else
  const scores = entries.filter(([k]) =>
    k.includes('score') || k.includes('Score') || k.includes('confidence') || k.includes('composite') ||
    k.includes('weight') || k.includes('specificity') || k.includes('dissim') || k.includes('novel') ||
    k.includes('diversity') || k.includes('coherence') || k.includes('energy')
  );
  const ids = entries.filter(([k, v]) =>
    typeof v === 'string' && /^[0-9a-f-]{30,}$/i.test(v) && !scores.some(([sk]) => sk === k)
  );
  const rest = entries.filter(([k]) =>
    !scores.some(([sk]) => sk === k) && !ids.some(([ik]) => ik === k)
  );

  const renderGroup = (items) => items.map(([k, v]) => (
    <div key={k} className="flex gap-2">
      <span className="text-gray-600 shrink-0">{k}:</span>
      {formatDetailValue(k, v)}
    </div>
  ));

  return (
    <div className="space-y-0.5">
      {scores.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-0.5">
          {scores.map(([k, v]) => (
            <span key={k} className="inline-flex gap-1">
              <span className="text-gray-600">{k}:</span>
              {formatDetailValue(k, v)}
            </span>
          ))}
        </div>
      )}
      {ids.length > 0 && renderGroup(ids)}
      {rest.length > 0 && renderGroup(rest)}
    </div>
  );
}

// ─── Event type badge ────────────────────────────────────────────

const TYPE_BADGES = {
  // Synthesis flow
  child_created: { label: 'created', color: 'text-green-400 bg-green-900/30' },
  node_created: { label: 'created', color: 'text-green-400 bg-green-900/30' },
  claim_provenance_rejected: { label: 'provenance', color: 'text-red-400 bg-red-900/30' },
  counterfactual_rejected: { label: 'decorative', color: 'text-red-400 bg-red-900/30' },
  redundancy_ceiling_rejected: { label: 'redundant', color: 'text-red-400 bg-red-900/30' },
  consultant_escalation: { label: 'escalated', color: 'text-yellow-400 bg-yellow-900/30' },
  // Validation
  validation_promoted: { label: 'promoted', color: 'text-amber-400 bg-amber-900/30' },
  validation_blocked: { label: 'blocked', color: 'text-red-400 bg-red-900/30' },
  validation_scored: { label: 'scored', color: 'text-blue-400 bg-blue-900/30' },
  // Lab Verification
  evm_start: { label: 'spec', color: 'text-blue-400 bg-blue-900/30' },
  evm_spec_extracted: { label: 'extracted', color: 'text-purple-400 bg-purple-900/30' },
  evm_not_reducible: { label: 'not reducible', color: 'text-gray-400 bg-gray-800' },
  evm_complete: { label: 'done', color: 'text-green-400 bg-green-900/30' },
  evm_skip: { label: 'skip', color: 'text-gray-400 bg-gray-800' },
  evm_retry: { label: 'retry', color: 'text-yellow-400 bg-yellow-900/30' },
  evm_result: { label: 'result', color: 'text-cyan-400 bg-cyan-900/30' },
  evm_elite_promoted: { label: 'elite', color: 'text-amber-400 bg-amber-900/30' },
  // Lab framework
  taint_propagated: { label: 'tainted', color: 'text-red-400 bg-red-900/30' },
  taint_cleared: { label: 'untainted', color: 'text-green-400 bg-green-900/30' },
  taint_decay: { label: 'taint decay', color: 'text-gray-400 bg-gray-800' },
  evidence_stored: { label: 'evidence', color: 'text-cyan-400 bg-cyan-900/30' },
  pre_lab_corrections: { label: 'corrected', color: 'text-amber-400 bg-amber-900/30' },
  // Elite
  elite_promoted: { label: 'promoted', color: 'text-amber-400 bg-amber-900/30' },
  elite_bridging_attempted: { label: 'bridge', color: 'text-amber-400 bg-amber-900/30' },
  elite_duplicate_rejected: { label: 'dedup', color: 'text-red-400 bg-red-900/30' },
  elite_backfill: { label: 'backfill', color: 'text-blue-400 bg-blue-900/30' },
  // Voicing
  voicing_created: { label: 'created', color: 'text-green-400 bg-green-900/30' },
  voicing_rejected: { label: 'rejected', color: 'text-red-400 bg-red-900/30' },
  voicing_skip: { label: 'skip', color: 'text-gray-400 bg-gray-800' },
  voicing_dedup: { label: 'dedup', color: 'text-red-400 bg-red-900/30' },
  // Research
  research_complete: { label: 'done', color: 'text-green-400 bg-green-900/30' },
  research_targeting: { label: 'target', color: 'text-blue-400 bg-blue-900/30' },
  research_relevance: { label: 'filtered', color: 'text-yellow-400 bg-yellow-900/30' },
  research_domain_skip: { label: 'skip', color: 'text-gray-400 bg-gray-800' },
  research_domain_exhausted: { label: 'exhausted', color: 'text-orange-400 bg-orange-900/30' },
  research_all_exhausted: { label: 'all exhausted', color: 'text-red-400 bg-red-900/30' },
  // Autorating
  autorating_rated: { label: 'rated', color: 'text-teal-400 bg-teal-900/30' },
  autorating_inline: { label: 'rated', color: 'text-teal-400 bg-teal-900/30' },
  // Questions
  question_answered: { label: 'answered', color: 'text-green-400 bg-green-900/30' },
  tension_question: { label: 'question', color: 'text-purple-400 bg-purple-900/30' },
  // LLM
  call_start: { label: 'call', color: 'text-cyan-400 bg-cyan-900/30' },
  call_complete: { label: 'done', color: 'text-green-400 bg-green-900/30' },
  call_failed: { label: 'failed', color: 'text-red-400 bg-red-900/30' },
  call_retry: { label: 'retry', color: 'text-yellow-400 bg-yellow-900/30' },
  // Lifecycle
  activated: { label: 'activated', color: 'text-green-400 bg-green-900/30' },
  composted: { label: 'composted', color: 'text-orange-400 bg-orange-900/30' },
  sweep_composted: { label: 'sweep', color: 'text-orange-400 bg-orange-900/30' },
  // Dedup
  dedup_judge: { label: 'judge', color: 'text-purple-400 bg-purple-900/30' },
  // API Verification
  api_call_start: { label: 'call', color: 'text-indigo-400 bg-indigo-900/30' },
  api_call_error: { label: 'error', color: 'text-red-400 bg-red-900/30' },
  api_interpretation: { label: 'result', color: 'text-indigo-400 bg-indigo-900/30' },
  api_corrections_applied: { label: 'corrected', color: 'text-yellow-400 bg-yellow-900/30' },
  api_enrichment_inline: { label: 'enriched', color: 'text-purple-400 bg-purple-900/30' },
  api_enrichment_complete: { label: 'enriched', color: 'text-purple-400 bg-purple-900/30' },
  api_enrichment_error: { label: 'enrich err', color: 'text-red-400 bg-red-900/30' },
  api_enrichment_fallback: { label: 'fallback', color: 'text-yellow-400 bg-yellow-900/30' },
  api_verification_complete: { label: 'done', color: 'text-green-400 bg-green-900/30' },
  api_decision_error: { label: 'error', color: 'text-red-400 bg-red-900/30' },
  api_refutation: { label: 'refuted', color: 'text-red-400 bg-red-900/30' },
  evm_api_refutation: { label: 'refuted', color: 'text-red-400 bg-red-900/30' },
  evm_api_errors: { label: 'api error', color: 'text-orange-400 bg-orange-900/30' },
  evm_api_error: { label: 'api error', color: 'text-orange-400 bg-orange-900/30' },
  // Embedding Evaluation & Population Control
  embedding_eval: { label: 'embed eval', color: 'text-violet-400 bg-violet-900/30' },
  population_control_boost: { label: 'boost', color: 'text-green-400 bg-green-900/30' },
  population_control_demote: { label: 'demote', color: 'text-yellow-400 bg-yellow-900/30' },
  population_control_archive: { label: 'archive', color: 'text-red-400 bg-red-900/30' },
  population_control_dedup: { label: 'dedup', color: 'text-orange-400 bg-orange-900/30' },
  population_control_dedup_summary: { label: 'dedup done', color: 'text-orange-400 bg-orange-900/30' },
  population_control_error: { label: 'error', color: 'text-red-400 bg-red-900/30' },
};

function TypeBadge({ type }) {
  const badge = TYPE_BADGES[type];
  if (!badge) return null;
  return (
    <span className={`inline-flex items-center px-1.5 py-0 rounded text-[10px] leading-relaxed ${badge.color}`}>
      {badge.label}
    </span>
  );
}

// ─── Main component ──────────────────────────────────────────────

/** Sidebar activity stream with category filters and pause. */
export default function ActivityFeed() {
  const [events, setEvents] = useState([]);
  const [paused, setPaused] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('activity-feed-collapsed');
    return saved === 'true';
  });
  const [enabledCategories, setEnabledCategories] = useState(() => {
    const saved = localStorage.getItem('activity-feed-categories');
    if (saved) {
      const parsed = JSON.parse(saved);
      for (const cat of CATEGORIES) {
        if (parsed[cat] === undefined) parsed[cat] = true;
      }
      return parsed;
    }
    return Object.fromEntries(CATEGORIES.map(c => [c, true]));
  });
  const [expandedId, setExpandedId] = useState(null);
  const [connected, setConnected] = useState(false);

  const scrollRef = useRef(null);
  const autoScrollRef = useRef(true);
  const pausedRef = useRef(paused);
  const eventsRef = useRef(events);

  pausedRef.current = paused;
  eventsRef.current = events;

  useEffect(() => {
    localStorage.setItem('activity-feed-collapsed', String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    localStorage.setItem('activity-feed-categories', JSON.stringify(enabledCategories));
  }, [enabledCategories]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && autoScrollRef.current && !paused) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events, paused]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
  }, []);

  // SSE connection (key in query — EventSource cannot send headers)
  useEffect(() => {
    let es;
    let reconnectTimer;
    let cancelled = false;

    async function connect() {
      const key = await getSecurityKey();
      if (cancelled) return;
      const url = key ? `/api/activity/stream?key=${encodeURIComponent(key)}` : '/api/activity/stream';
      es = new EventSource(url);

      es.addEventListener('init', (e) => {
        try {
          const initial = JSON.parse(e.data);
          setEvents(initial.slice(-MAX_EVENTS));
          setConnected(true);
        } catch {}
      });

      es.addEventListener('message', (e) => {
        if (pausedRef.current) return;
        try {
          const event = JSON.parse(e.data);
          setEvents(prev => {
            const next = [...prev, event];
            return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
          });
        } catch {}
      });

      es.addEventListener('open', () => setConnected(true));

      es.addEventListener('error', () => {
        setConnected(false);
        es.close();
        if (!cancelled) reconnectTimer = setTimeout(connect, 3000);
      });
    }

    connect();

    return () => {
      cancelled = true;
      if (es) es.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  // Resolve node names from events (batched, cached)
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const ids = new Set();
    for (const e of events) {
      const d = e.detail;
      if (!d) continue;
      for (const key of ['nodeId', 'childId', 'nodeA', 'nodeB', 'parentA', 'parentB', 'matchedNode', 'junkNode', 'sourceNodeId', 'eliteNodeId', 'matchedEliteId']) {
        const v = d[key];
        if (v && typeof v === 'string' && v.length > 8) ids.add(v);
      }
    }
    if (ids.size > 0) {
      resolveNodeNames([...ids]).then(() => forceUpdate(n => n + 1));
    }
  }, [events.length]);

  const toggleCategory = (cat) => {
    setEnabledCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const filteredEvents = events.filter(e => enabledCategories[e.category]);

  const clearEvents = () => {
    setEvents([]);
    setExpandedId(null);
  };

  return (
    <div className="bg-gray-950 rounded-lg shadow-lg border border-gray-800 overflow-hidden flex flex-col h-full">
      {/* Header */}
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-900/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Radio size={16} className={connected ? 'text-green-400 animate-pulse' : 'text-red-400'} />
          <span className="text-sm font-medium text-gray-200">Activity Feed</span>
          <span className="text-xs text-gray-500 font-mono">{filteredEvents.length} events</span>
          {!connected && <span className="text-xs text-red-400">disconnected</span>}
        </div>
        <div className="flex items-center gap-2">
          {collapsed
            ? <ChevronDown size={16} className="text-gray-500" />
            : <ChevronUp size={16} className="text-gray-500" />
          }
        </div>
      </button>

      {!collapsed && (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-800 bg-gray-900/50 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                className={`text-xs px-2 py-0.5 rounded-full border transition-all ${
                  enabledCategories[cat]
                    ? `${CATEGORY_COLORS[cat].text} border-current opacity-100`
                    : 'text-gray-600 border-gray-700 opacity-50'
                }`}
              >
                {cat}
              </button>
            ))}

            <div className="flex-1" />

            <button
              onClick={() => setPaused(p => !p)}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              title={paused ? 'Resume' : 'Pause'}
            >
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button
              onClick={clearEvents}
              className="p-1 rounded hover:bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors"
              title="Clear"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Event list */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed"
          >
            {filteredEvents.length === 0 && (
              <div className="flex items-center justify-center h-full text-gray-600">
                {paused ? 'Feed paused' : 'Waiting for server activity...'}
              </div>
            )}
            {filteredEvents.map(event => {
              const colors = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.system;
              const hasDetail = event.detail && Object.keys(event.detail).length > 0;
              const isExpanded = expandedId === event.id;
              const hasSimilarity = event.detail?.similarity != null && event.detail?.threshold != null;

              return (
                <div key={event.id}>
                  <div
                    className={`flex items-start gap-2 py-0.5 ${hasDetail ? 'cursor-pointer hover:bg-gray-900/50 -mx-1 px-1 rounded' : ''}`}
                    onClick={() => hasDetail && setExpandedId(isExpanded ? null : event.id)}
                  >
                    <span className="text-gray-600 shrink-0 select-none">{formatTime(event.timestamp)}</span>
                    <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${colors.dot}`} />
                    <span className={`shrink-0 uppercase tracking-wider ${colors.text}`} style={{ width: '72px' }}>
                      {event.category}
                    </span>
                    <TypeBadge type={event.type} />
                    <span className="text-gray-300 flex items-center flex-wrap min-w-0">
                      <span className="break-words">{event.message}</span>
                      {hasSimilarity && (
                        <SimilarityBar
                          similarity={event.detail.similarity}
                          threshold={event.detail.threshold}
                          passed={event.detail.passed}
                          gate={event.detail.gate}
                        />
                      )}
                      <InlineChips detail={event.detail} type={event.type} />
                    </span>
                    {hasDetail && (
                      <span className="text-gray-700 shrink-0 ml-auto">{isExpanded ? '\u25B4' : '\u25BE'}</span>
                    )}
                  </div>
                  {isExpanded && hasDetail && (
                    <div className="ml-24 mb-1 pl-3 border-l border-gray-800 text-gray-500">
                      <DetailSection detail={event.detail} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
