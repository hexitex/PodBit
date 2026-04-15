import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader, History, RotateCcw, Scissors, Pin, X,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle,
  Plus, RefreshCw, Minus,
} from 'lucide-react';
import { journal } from '../../lib/api';

// ---------------------------------------------------------------------------
// Table & operation styling
// ---------------------------------------------------------------------------
const TABLE_COLORS = {
  nodes:              { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  edges:              { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400' },
  domain_partitions:  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400' },
  partition_domains:  { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-400' },
  partition_bridges:  { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-400' },
  number_registry:    { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  node_number_refs:   { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400' },
};
const DEFAULT_TABLE = { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400' };

const OP_ICONS = { INSERT: Plus, UPDATE: RefreshCw, DELETE: Minus };
const OP_COLORS = {
  INSERT: 'text-green-600 dark:text-green-400',
  UPDATE: 'text-blue-600 dark:text-blue-400',
  DELETE: 'text-red-600 dark:text-red-400',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts.endsWith?.('Z') ? ts : ts + 'Z');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtTimeShort(ts) {
  if (!ts) return '—';
  const d = new Date(ts.endsWith?.('Z') ? ts : ts + 'Z');
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Group journal entries into time buckets (5 min windows) */
function groupByTime(entries) {
  const buckets = [];
  let current = null;
  const WINDOW = 5 * 60 * 1000;

  for (const entry of entries) {
    const ts = new Date(entry.timestamp.endsWith?.('Z') ? entry.timestamp : entry.timestamp + 'Z').getTime();
    if (!current || ts < current.start - WINDOW) {
      current = { start: ts, end: ts, entries: [entry], timestamp: entry.timestamp };
      buckets.push(current);
    } else {
      current.entries.push(entry);
      current.end = Math.min(current.end, ts);
    }
  }
  return buckets;
}

/**
 * Build human-readable action descriptions from a bucket of journal entries.
 *
 * Each entry comes with a server-attached `meta` object (see
 * `enrichJournalEntries` in core/journal.ts) that carries the row's current
 * domain / node_type / content excerpt — or, for deletions, the same fields
 * recovered from `before_state`. This is what makes "1 node created in
 * Standard Physics (possible)" possible instead of the old "in unknown".
 */
function describeActions(entries) {
  // Dedupe by (table, row_id) and remember the richest meta we saw across the
  // entry's lifetime. INSERT entries get their domain from the live row;
  // UPDATE entries usually do too; DELETE entries fall back to before_state.
  const rowOps = new Map();
  for (const e of entries) {
    const key = `${e.table_name}:${e.row_id}`;
    if (!rowOps.has(key)) {
      rowOps.set(key, { table: e.table_name, rowId: e.row_id, ops: new Set(), meta: null });
    }
    const row = rowOps.get(key);
    row.ops.add(e.operation);
    // Prefer the live-row meta over before-state meta — overwrite when better
    if (e.meta) {
      if (!row.meta || (row.meta.fromBeforeState && !e.meta.fromBeforeState)) {
        row.meta = e.meta;
      }
    }
  }

  // Group nodes by (domain, op) so we can say e.g.
  //   "3 nodes created in Standard Physics" + "1 node created in Quantum Field Theory"
  // instead of one undifferentiated "4 nodes created in unknown".
  const nodeBuckets = new Map(); // key: `${op}|${domain}` → { op, domain, count, types: Set, sample: string|null }
  function bumpNodeBucket(op, meta) {
    const domain = meta?.domain || 'no domain';
    const key = `${op}|${domain}`;
    if (!nodeBuckets.has(key)) {
      nodeBuckets.set(key, { op, domain, count: 0, types: new Set(), sample: null });
    }
    const b = nodeBuckets.get(key);
    b.count++;
    if (meta?.node_type) b.types.add(meta.node_type);
    if (!b.sample && meta?.contentExcerpt) b.sample = meta.contentExcerpt;
  }

  let edgesCreated = 0, edgesUpdated = 0, edgesDeleted = 0;
  let numberRefsAdded = 0, numberRefsRemoved = 0;
  let numberRegistryAdded = 0, numberRegistryUpdated = 0, numberRegistryRemoved = 0;
  const otherActions = [];

  for (const row of rowOps.values()) {
    if (row.table === 'nodes') {
      // Determine the effective operation: INSERT+DELETE in same bucket → DELETE,
      // INSERT alone → CREATE, UPDATE alone → UPDATE, etc.
      let op;
      if (row.ops.has('DELETE')) op = 'DELETE';
      else if (row.ops.has('INSERT')) op = 'INSERT';
      else if (row.ops.has('UPDATE')) op = 'UPDATE';
      if (op) bumpNodeBucket(op, row.meta);
    } else if (row.table === 'edges') {
      if (row.ops.has('INSERT')) edgesCreated++;
      else if (row.ops.has('DELETE')) edgesDeleted++;
      else if (row.ops.has('UPDATE')) edgesUpdated++;
    } else if (row.table === 'node_number_refs') {
      if (row.ops.has('DELETE')) numberRefsRemoved++;
      else if (row.ops.has('INSERT')) numberRefsAdded++;
    } else if (row.table === 'number_registry') {
      if (row.ops.has('DELETE')) numberRegistryRemoved++;
      else if (row.ops.has('INSERT')) numberRegistryAdded++;
      else if (row.ops.has('UPDATE')) numberRegistryUpdated++;
    } else {
      // Fallback for any other table — collapse below.
      const label = row.table.replace(/_/g, ' ');
      otherActions.push({ table: row.table, label, op: [...row.ops][0] });
    }
  }

  // Render node buckets in a stable order: created → updated → deleted, each
  // sorted by count descending so the busiest domain shows first.
  const opOrder = { INSERT: 0, UPDATE: 1, DELETE: 2 };
  const sortedBuckets = [...nodeBuckets.values()].sort((a, b) => {
    if (opOrder[a.op] !== opOrder[b.op]) return opOrder[a.op] - opOrder[b.op];
    return b.count - a.count;
  });

  const lines = [];
  for (const b of sortedBuckets) {
    const verb = b.op === 'INSERT' ? 'created in' : b.op === 'DELETE' ? 'removed from' : 'updated in';
    const noun = `${b.count} node${b.count !== 1 ? 's' : ''}`;
    const types = b.types.size > 0
      ? ` (${b.types.size === 1 ? [...b.types][0] : `${b.types.size} types`})`
      : '';
    const sample = b.count === 1 && b.sample ? `: ${b.sample}` : '';
    const icon = b.op === 'INSERT' ? 'insert' : b.op === 'DELETE' ? 'delete' : 'update';
    lines.push({ icon, text: `${noun} ${verb} ${b.domain}${types}${sample}` });
  }

  if (edgesCreated > 0) lines.push({ icon: 'insert', text: `${edgesCreated} edge${edgesCreated !== 1 ? 's' : ''} added` });
  if (edgesUpdated > 0) lines.push({ icon: 'update', text: `${edgesUpdated} edge${edgesUpdated !== 1 ? 's' : ''} updated` });
  if (edgesDeleted > 0) lines.push({ icon: 'delete', text: `${edgesDeleted} edge${edgesDeleted !== 1 ? 's' : ''} removed` });

  if (numberRefsAdded > 0) lines.push({ icon: 'insert', text: `${numberRefsAdded} number variable${numberRefsAdded !== 1 ? 's' : ''} linked to nodes` });
  if (numberRefsRemoved > 0) lines.push({ icon: 'delete', text: `${numberRefsRemoved} number variable link${numberRefsRemoved !== 1 ? 's' : ''} removed` });
  if (numberRegistryAdded > 0) lines.push({ icon: 'insert', text: `${numberRegistryAdded} number variable${numberRegistryAdded !== 1 ? 's' : ''} registered` });
  if (numberRegistryUpdated > 0) lines.push({ icon: 'update', text: `${numberRegistryUpdated} number variable${numberRegistryUpdated !== 1 ? 's' : ''} updated` });
  if (numberRegistryRemoved > 0) lines.push({ icon: 'delete', text: `${numberRegistryRemoved} number variable${numberRegistryRemoved !== 1 ? 's' : ''} removed` });

  // Collapse the long-tail of other tables by (table, op)
  const otherCounts = {};
  for (const a of otherActions) {
    const key = `${a.op}:${a.table}`;
    if (!otherCounts[key]) otherCounts[key] = { ...a, count: 0 };
    otherCounts[key].count++;
  }
  for (const { label, op, count } of Object.values(otherCounts)) {
    const verb = op === 'INSERT' ? 'added' : op === 'DELETE' ? 'removed' : 'updated';
    lines.push({ icon: op.toLowerCase(), text: `${count} ${label} ${verb}` });
  }

  return lines;
}

/** Summarize a bucket — count unique row_ids per table */
function summarizeBucket(entries) {
  const actions = describeActions(entries);
  return { actions, entryCount: entries.length };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function JournalTimeline() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);
  const [selectedBucket, setSelectedBucket] = useState(null);
  const [showRollback, setShowRollback] = useState(false);
  const [showClip, setShowClip] = useState(false);
  const [clipTimestamp, setClipTimestamp] = useState(null);
  const [message, setMessage] = useState(null);
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 500;

  // Fetch journal entries with paging
  const { data: entriesData, isLoading } = useQuery({
    queryKey: ['journal-entries', page],
    queryFn: () => journal.entries({ limit: PAGE_SIZE, offset: page * PAGE_SIZE }),
    refetchInterval: page === 0 ? 30000 : false, // only auto-refresh first page
  });

  // Fetch stats
  const { data: statsData } = useQuery({
    queryKey: ['journal-stats'],
    queryFn: () => journal.stats(),
    refetchInterval: 60000,
  });

  // Preview rollback — returns preview + pinnable nodes in one call
  const { data: previewData, mutate: runPreview, isPending: previewLoading } = useMutation({
    mutationFn: (ts) => journal.preview(ts),
  });

  // Pin + rollback
  const rollbackMutation = useMutation({
    mutationFn: async ({ targetTimestamp, nodeIds }) => {
      let pinGroup ;
      if (nodeIds.length > 0) {
        const pinResult = await journal.pin(nodeIds);
        pinGroup = pinResult.pinGroup;
      }
      return journal.rollback(targetTimestamp, pinGroup);
    },
    onSuccess: (data) => {
      setShowRollback(false);
      setPinnedIds(new Set());
      setMessage({ type: 'success', text: `Rolled back: ${data.entriesReplayed} journal entries replayed, ${data.rowsCleaned || 0} rows cleaned across ${Object.keys(data.cleanedTables || {}).length} tables, ${data.pinnedNodesRestored} pinned nodes restored.` });
      // Rollback changes the entire project state — invalidate everything
      queryClient.invalidateQueries();
      setTimeout(() => setMessage(null), 8000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: `Rollback failed: ${err.message}` });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  // Clip
  const clipMutation = useMutation({
    mutationFn: (olderThan) => journal.prune(olderThan),
    onSuccess: (data) => {
      setShowClip(false);
      setMessage({ type: 'success', text: `Clipped ${data.deleted} journal entries.` });
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] });
      queryClient.invalidateQueries({ queryKey: ['journal-stats'] });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const entries = entriesData?.entries || [];
  const stats = statsData || {};
  const buckets = useMemo(() => groupByTime(entries), [entries]);

  function selectRestorePoint(timestamp) {
    setPinnedIds(new Set());
    setShowRollback(true);
    runPreview(timestamp);
  }

  function togglePin(nodeId) {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  }

  const pinnableNodes = previewData?.pinnableNodes || [];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 md:p-6">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-gray-800 dark:text-gray-200">
          <History size={20} />
          Journal
        </h2>
        <div className="flex items-center gap-3">
          {stats.totalEntries != null && (
            <span className="text-xs text-gray-500 dark:text-gray-400">{stats.totalEntries.toLocaleString()} entries</span>
          )}
          {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        </div>
      </button>

      {/* Messages */}
      {message && (
        <div className={`mb-4 px-3 py-2 rounded text-xs flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
        }`}>
          {message.type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
          {message.text}
        </div>
      )}

      {expanded && (
        <>
          {/* Stats bar */}
          {stats.oldestEntry && (
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 pb-3">
              <span>
                <strong className="text-gray-700 dark:text-gray-300">{fmtTimeShort(stats.oldestEntry)}</strong>
                {' — '}
                <strong className="text-gray-700 dark:text-gray-300">{fmtTimeShort(stats.newestEntry)}</strong>
              </span>
              {stats.byTable?.map((t) => (
                <span key={t.table_name} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded">
                  {t.table_name}: {t.cnt}
                </span>
              ))}
              <button
                onClick={() => setShowClip(true)}
                className="ml-auto px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex items-center gap-1 text-gray-600 dark:text-gray-400"
              >
                <Scissors size={12} /> Clip
              </button>
            </div>
          )}

          {/* Timeline */}
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader size={20} className="animate-spin text-gray-400" /></div>
          ) : buckets.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400 dark:text-gray-500">
              No journal entries yet. Changes will appear here as the graph is modified.
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-[15px] top-2 bottom-2 w-px bg-gray-200 dark:bg-gray-700" />
              <div className="space-y-0.5">
                {buckets.map((bucket, idx) => {
                  const summary = summarizeBucket(bucket.entries);
                  const isSelected = selectedBucket === idx;

                  return (
                    <div key={idx}>
                      <div
                        className="flex items-start gap-3 py-1.5 px-1 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded cursor-pointer group relative"
                        onClick={() => setSelectedBucket(isSelected ? null : idx)}
                      >
                        <div className="mt-1.5 w-2 h-2 rounded-full bg-gray-400 dark:bg-gray-500 shrink-0 ring-2 ring-white dark:ring-gray-900 z-10 relative left-[11px]" />

                        <div className="flex-1 min-w-0 ml-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">{fmtTime(bucket.timestamp)}</span>
                            <span className="text-xs text-gray-400 dark:text-gray-500">({summary.entryCount} changes)</span>
                          </div>
                          <div className="mt-0.5 space-y-0.5">
                            {summary.actions.slice(0, isSelected ? undefined : 3).map((action, i) => {
                              const color = action.icon === 'insert' ? 'text-green-600 dark:text-green-400'
                                : action.icon === 'delete' ? 'text-red-600 dark:text-red-400'
                                : 'text-blue-600 dark:text-blue-400';
                              const Icon = action.icon === 'insert' ? Plus : action.icon === 'delete' ? Minus : RefreshCw;
                              return (
                                <div key={i} className={`flex items-center gap-1.5 text-xs ${color}`}>
                                  <Icon size={10} className="shrink-0" />
                                  <span>{action.text}</span>
                                </div>
                              );
                            })}
                            {!isSelected && summary.actions.length > 3 && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 ml-4">+{summary.actions.length - 3} more</span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); selectRestorePoint(bucket.timestamp); }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 flex items-center gap-1 shrink-0"
                        >
                          <RotateCcw size={10} /> Restore
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Paging controls */}
          {!isLoading && (entriesData?.total > PAGE_SIZE || page > 0) && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Newer
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {(page * PAGE_SIZE + 1).toLocaleString()}–{Math.min((page + 1) * PAGE_SIZE, entriesData?.total || 0).toLocaleString()} of {(entriesData?.total || 0).toLocaleString()}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={!entriesData?.total || (page + 1) * PAGE_SIZE >= entriesData.total}
                className="px-3 py-1 text-xs rounded bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Older
              </button>
            </div>
          )}
        </>
      )}

      {/* ===== ROLLBACK MODAL ===== */}
      {showRollback && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowRollback(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl dark:shadow-gray-950/50 w-full max-w-2xl mx-4 p-5 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Restore to Point</h3>
              <button onClick={() => setShowRollback(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>

            {previewLoading ? (
              <div className="flex items-center justify-center gap-2 py-12 text-gray-500">
                <Loader size={20} className="animate-spin" />
                <span className="text-sm">Calculating rollback impact...</span>
              </div>
            ) : previewData ? (
              <div className="space-y-4">
                {/* Summary */}
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <AlertTriangle size={16} />
                    Restore to {fmtTime(previewData.targetTimestamp)}
                  </p>
                  <div className="mt-2 text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
                    {previewData.nodesCreated > 0 && <p>{previewData.nodesCreated} node{previewData.nodesCreated !== 1 ? 's' : ''} will be <strong>removed</strong> (created after this point)</p>}
                    {previewData.nodesModified > 0 && <p>{previewData.nodesModified} node{previewData.nodesModified !== 1 ? 's' : ''} will be <strong>restored</strong> to earlier state</p>}
                    {previewData.nodesDeleted > 0 && <p>{previewData.nodesDeleted} node{previewData.nodesDeleted !== 1 ? 's' : ''} will be <strong>re-created</strong> (were deleted after this point)</p>}
                  </div>
                </div>

                {/* Table breakdown */}
                <div className="space-y-1">
                  {Object.entries(previewData.byTable || {}).map(([table, counts]) => {
                    const style = TABLE_COLORS[table] || DEFAULT_TABLE;
                    const label = table === 'node_number_refs' ? 'number refs' : table.replace(/_/g, ' ');
                    return (
                      <div key={table} className="flex items-center gap-3 text-xs">
                        <span className={`px-1.5 py-0.5 rounded w-32 ${style.bg} ${style.text}`}>{label}</span>
                        {counts.inserts > 0 && <span className="text-red-600 dark:text-red-400">{counts.inserts} undo</span>}
                        {counts.updates > 0 && <span className="text-blue-600 dark:text-blue-400">{counts.updates} revert</span>}
                        {counts.deletes > 0 && <span className="text-green-600 dark:text-green-400">{counts.deletes} re-create</span>}
                      </div>
                    );
                  })}
                </div>

                {/* Pinnable nodes */}
                {pinnableNodes.length > 0 ? (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1">
                        <Pin size={12} />
                        Pin nodes to keep ({pinnedIds.size}/{pinnableNodes.length})
                      </h4>
                      <div className="flex gap-2">
                        <button onClick={() => setPinnedIds(new Set(pinnableNodes.map(n => n.id)))} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Pin all</button>
                        <button onClick={() => setPinnedIds(new Set())} className="text-xs text-gray-500 hover:underline">Clear</button>
                      </div>
                    </div>

                    <div className="space-y-1 max-h-60 overflow-y-auto">
                      {pinnableNodes.map((node) => (
                        <label
                          key={node.id}
                          className={`flex items-start gap-2 p-2 rounded cursor-pointer transition-colors ${
                            pinnedIds.has(node.id)
                              ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                              : 'bg-gray-50 dark:bg-gray-800 border border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                          }`}
                        >
                          <input type="checkbox" checked={pinnedIds.has(node.id)} onChange={() => togglePin(node.id)} className="mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="px-1 py-0.5 rounded text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400">{node.node_type}</span>
                              {node.domain && <span className="px-1 py-0.5 rounded text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">{node.domain}</span>}
                              <span className="text-xs text-gray-400">{fmtTimeShort(node.created_at)}</span>
                            </div>
                            <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">{node.content}</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-400 p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    No pinnable nodes to preserve. All voiced, synthesis, and breakthrough nodes were created before this point.
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                  <button onClick={() => setShowRollback(false)} className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200">Cancel</button>
                  <button
                    onClick={() => rollbackMutation.mutate({ targetTimestamp: previewData.targetTimestamp, nodeIds: [...pinnedIds] })}
                    disabled={rollbackMutation.isPending}
                    className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1 disabled:opacity-50"
                  >
                    {rollbackMutation.isPending ? <Loader size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                    {pinnedIds.size > 0 ? `Pin ${pinnedIds.size} & Restore` : 'Restore'}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ===== CLIP MODAL ===== */}
      {showClip && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowClip(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl dark:shadow-gray-950/50 w-full max-w-lg mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Clip Journal</h3>
              <button onClick={() => setShowClip(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-gray-700 dark:text-gray-300">Remove journal entries older than a chosen date. You won't be able to roll back past this point.</p>
              {stats.oldestEntry && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Range: <strong>{fmtTimeShort(stats.oldestEntry)}</strong> — <strong>{fmtTimeShort(stats.newestEntry)}</strong>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Clip entries before:</label>
                <input
                  type="datetime-local"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
                  onChange={(e) => setClipTimestamp(e.target.value ? new Date(e.target.value).toISOString() : null)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowClip(false)} className="px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded hover:bg-gray-200">Cancel</button>
                <button
                  onClick={() => clipTimestamp && clipMutation.mutate(clipTimestamp)}
                  disabled={!clipTimestamp || clipMutation.isPending}
                  className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-1 disabled:opacity-50"
                >
                  {clipMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Scissors size={12} />}
                  Clip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
