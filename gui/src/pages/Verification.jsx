import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, Link } from 'react-router-dom';
import { ShieldCheck, CheckCircle2, XCircle, AlertTriangle, Bug, SkipForward, Loader2, Eye, FlaskConical, RotateCcw, Trash2, X, ThumbsUp, ThumbsDown, Search, Clock, ListOrdered, Globe, } from 'lucide-react';
import { evm, apiRegistry } from '../lib/api';
import { TEST_CATEGORY_LABELS, OutcomeBadge, ConfidenceBar, VerificationDetailModal } from '../components/VerificationDetail';
import VariableRefText from '../components/VariableRefText';
import { resolveNodeNames, getCachedName } from '../lib/node-names';

function StatCard({ title, value, subtitle, icon: Icon, color = 'blue' }) {
  const colorClasses = {
    blue: 'bg-blue-500', green: 'bg-green-500', red: 'bg-red-500',
    orange: 'bg-orange-500', amber: 'bg-amber-500', purple: 'bg-purple-500', gray: 'bg-gray-500',
  };
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{title}</p>
          <p className="text-xl font-bold mt-1 dark:text-gray-100">{value}</p>
          {subtitle && <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <div className={`${colorClasses[color]} p-2 rounded-lg shrink-0`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr + 'Z');
  const now = new Date();
  const diffMs = now - d;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isReviewable(exec) {
  return ['needs_review', 'needs_expert'].includes(exec.status);
}

// ─── Prune Confirmation Dialog ──────────────────────────────────────────────

function PruneDialog({ open, onClose, onConfirm, isPending }) {
  const [daysInput, setDaysInput] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    if (open) { setDaysInput(''); setPreview(null); }
  }, [open]);

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const result = await evm.prune({ dryRun: true, olderThanDays: daysInput ? parseInt(daysInput, 10) : undefined });
      setPreview(result);
    } catch { setPreview({ error: true }); }
    setPreviewing(false);
  };

  const handleConfirm = () => {
    onConfirm(daysInput ? parseInt(daysInput, 10) : undefined);
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl dark:shadow-black/50 w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold dark:text-gray-100 mb-2">Prune Old Executions</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Removes duplicate and stale verification records (failed, skipped, code errors).
          Always keeps the latest execution per node and all successful verifications.
        </p>
        <div className="mb-4">
          <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">Only prune records older than (days)</label>
          <div className="flex gap-2">
            <input type="number" min="0" value={daysInput} onChange={(e) => { setDaysInput(e.target.value); setPreview(null); }}
              placeholder="0 = all eligible"
              className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            <button onClick={handlePreview} disabled={previewing}
              className="px-3 py-2 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
              {previewing ? <Loader2 size={14} className="animate-spin" /> : 'Preview'}
            </button>
          </div>
        </div>
        {preview && !preview.error && (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              {preview.deleted === 0
                ? 'Nothing to prune — all records are either the latest per node or successful verifications.'
                : <>Will remove <span className="font-bold">{preview.deleted}</span> record{preview.deleted !== 1 ? 's' : ''}, keeping <span className="font-bold">{preview.kept}</span>.</>}
            </p>
          </div>
        )}
        {preview?.error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-600 dark:text-red-400">Preview failed</p>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancel</button>
          <button onClick={handleConfirm} disabled={isPending || (preview && preview.deleted === 0)}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors">
            {isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : <Trash2 size={14} className="inline mr-1" />}
            {isPending ? 'Pruning...' : 'Prune'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── API Verification Sub-View ─────────────────────────────────────────────

const API_IMPACT_STYLES = {
  value_correction:       { label: 'Value Correction',       color: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30' },
  structural_validation:  { label: 'Structural Validation',  color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' },
  structural_refutation:  { label: 'Structural Refutation',  color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' },
  inconclusive:           { label: 'Inconclusive',           color: 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800' },
};

const API_STATUS_STYLES = {
  success:   { label: 'Success',   color: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' },
  api_error: { label: 'API Error', color: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' },
  timeout:   { label: 'Timeout',   color: 'text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30' },
  skipped:   { label: 'Skipped',   color: 'text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800' },
};

function ApiBadge({ style, label }) {
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${style}`}>{label}</span>;
}

function ApiVerificationsView({ days }) {
  const [apiFilter, setApiFilter] = useState('');
  const [impactFilter, setImpactFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [expandedApiRow, setExpandedApiRow] = useState(null);
  const pageSize = 25;

  const { data: apis = [] } = useQuery({
    queryKey: ['api-registry-list'],
    queryFn: apiRegistry.list,
    staleTime: 60000,
  });

  const { data: apiStats } = useQuery({
    queryKey: ['api-registry-stats', days],
    queryFn: () => apiRegistry.stats(days),
    staleTime: 30000,
  });

  const filters = {
    ...(apiFilter ? { apiId: apiFilter } : {}),
    ...(impactFilter ? { impact: impactFilter } : {}),
    ...(statusFilter ? { status: statusFilter } : {}),
    limit: pageSize,
    offset: page * pageSize,
  };

  const { data, isLoading } = useQuery({
    queryKey: ['api-verifications', filters],
    queryFn: () => apiRegistry.verifications(filters),
    keepPreviousData: true,
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  const selectClass = "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500";

  return (
    <>
      {/* API Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard title="Total API Calls" value={apiStats?.total ?? '-'} subtitle={`Last ${days} days`} icon={Globe} color="blue" />
        <StatCard title="Registered APIs" value={apis.length || '-'} subtitle={`${apis.filter(a => a.enabled).length} enabled`} icon={Globe} color="gray" />
        <StatCard title="Corrections" value={apiStats?.corrections ?? '-'} subtitle="Value fixed" icon={AlertTriangle} color="amber" />
        <StatCard title="Validations" value={apiStats?.validations ?? '-'} subtitle="Structure confirmed" icon={CheckCircle2} color="green" />
        <StatCard title="Refutations" value={apiStats?.refutations ?? '-'} subtitle="Premise rejected" icon={XCircle} color="red" />
        <StatCard title="Errors" value={apiStats?.errors ?? '-'} subtitle="API failures" icon={Bug} color="orange" />
        {(apiStats?.enrichments ?? 0) > 0 && (
          <StatCard title="Enrichments" value={apiStats.enrichments} subtitle="Nodes created" icon={FlaskConical} color="purple" />
        )}
      </div>

      {/* Sub-filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select className={selectClass} value={apiFilter} onChange={e => { setApiFilter(e.target.value); setPage(0); }}>
          <option value="">All APIs</option>
          {apis.map(a => <option key={a.id} value={a.id}>{a.displayName}</option>)}
        </select>
        <select className={selectClass} value={impactFilter} onChange={e => { setImpactFilter(e.target.value); setPage(0); }}>
          <option value="">All Impacts</option>
          <option value="value_correction">Value Correction</option>
          <option value="structural_validation">Structural Validation</option>
          <option value="structural_refutation">Structural Refutation</option>
          <option value="inconclusive">Inconclusive</option>
        </select>
        <select className={selectClass} value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }}>
          <option value="">All Statuses</option>
          <option value="success">Success</option>
          <option value="api_error">API Error</option>
          <option value="timeout">Timeout</option>
          <option value="skipped">Skipped</option>
        </select>
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">{total} result{total !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-gray-400 dark:text-gray-500">Loading API verifications...</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center">
            <Globe size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No API verifications found</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Register APIs and enable verification to see results here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Impact</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Claim</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">API</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Confidence</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Mode</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Corrections</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Enriched</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400 text-right">Time</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((row) => {
                  const impactStyle = API_IMPACT_STYLES[row.verification_impact];
                  const statusStyle = API_STATUS_STYLES[row.status];
                  const hasDetail = row.error || row.evidence_summary || row.decision_reason || row.request_url;
                  const isExpanded = expandedApiRow === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
                        onClick={() => hasDetail && setExpandedApiRow(isExpanded ? null : row.id)}
                      >
                        <td className="px-4 py-3">
                          {impactStyle ? <ApiBadge style={impactStyle.color} label={impactStyle.label} /> : <span className="text-gray-400 dark:text-gray-500">—</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-sm">
                          <div className="line-clamp-2">{row.node_content_preview || row.node_id?.slice(0, 12) || <span className="text-gray-400 italic">No content</span>}</div>
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {row.api_display_name || row.api_name || row.api_id?.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">
                          {statusStyle ? <ApiBadge style={statusStyle.color} label={statusStyle.label} /> : <span className="text-xs">{row.status}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <ConfidenceBar value={row.confidence} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                          {row.decision_mode && row.decision_mode !== 'verify' ? (
                            <span className={`font-medium px-1.5 py-0.5 rounded-full ${
                              row.decision_mode === 'both'
                                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                                : row.decision_mode === 'enrich'
                                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                  : ''
                            }`}>{row.decision_mode}</span>
                          ) : <span className="text-gray-400 dark:text-gray-600">verify</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 text-right">
                          {row.corrections_applied || 0}
                        </td>
                        <td className="px-4 py-3 text-xs text-right">
                          {(row.enrichment_count || 0) > 0
                            ? <span className="text-purple-600 dark:text-purple-400 font-medium">+{row.enrichment_count} nodes</span>
                            : <span className="text-gray-400 dark:text-gray-600">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400 text-right">
                          {row.response_time_ms != null ? `${row.response_time_ms}ms` : '—'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            {timeAgo(row.created_at)}
                            {hasDetail && <span className="text-gray-400">{isExpanded ? '\u25B4' : '\u25BE'}</span>}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr>
                          <td colSpan={10} className="bg-gray-50 dark:bg-gray-800/30 px-6 py-3 border-b border-gray-100 dark:border-gray-800">
                            <div className="grid grid-cols-1 gap-2 text-xs">
                              {row.error && (
                                <div>
                                  <span className="font-medium text-red-600 dark:text-red-400">Error: </span>
                                  <span className="text-gray-700 dark:text-gray-300">{row.error}</span>
                                </div>
                              )}
                              {row.evidence_summary && (
                                <div>
                                  <span className="font-medium text-gray-600 dark:text-gray-400">Evidence: </span>
                                  <span className="text-gray-700 dark:text-gray-300">{row.evidence_summary}</span>
                                </div>
                              )}
                              {row.decision_reason && (
                                <div>
                                  <span className="font-medium text-gray-600 dark:text-gray-400">Decision: </span>
                                  <span className="text-gray-700 dark:text-gray-300">{row.decision_reason}</span>
                                </div>
                              )}
                              {row.request_url && (
                                <div>
                                  <span className="font-medium text-gray-600 dark:text-gray-400">URL: </span>
                                  <code className="text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded text-[11px] break-all">{row.request_method || 'GET'} {row.request_url}</code>
                                </div>
                              )}
                              {row.response_status && (
                                <div>
                                  <span className="font-medium text-gray-600 dark:text-gray-400">HTTP Response: </span>
                                  <span className={`${row.response_status >= 400 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{row.response_status}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-4 text-gray-500 dark:text-gray-500 mt-1">
                                <Link to={`/graph?node=${row.node_id}`} className="text-blue-500 hover:text-blue-400 hover:underline font-mono">{getCachedName(row.node_id)}</Link>
                                {row.decision_confidence != null && <span>Decision confidence: {(row.decision_confidence * 100).toFixed(0)}%</span>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-3 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Previous</button>
            <span className="text-xs text-gray-500 dark:text-gray-400">Page {page + 1} of {totalPages}</span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Next</button>
          </div>
        )}
      </div>
    </>
  );
}

function ExecutionRow({ exec, onSelect, selected, onToggleSelect }) {
  return (
    <tr
      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={() => onSelect(exec)}
    >
      <td className="px-4 py-2 w-8" onClick={(e) => e.stopPropagation()}>
        {isReviewable(exec) ? (
          <input
            type="checkbox"
            checked={!!selected}
            onChange={() => onToggleSelect(exec.node_id)}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
        ) : <span className="w-4 inline-block" />}
      </td>
      <td className="px-4 py-3">
        <OutcomeBadge exec={exec} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-sm">
        <div className="line-clamp-2">
          {exec.node_content ? <VariableRefText>{exec.node_content}</VariableRefText> : <span className="text-gray-400 italic">No content</span>}
        </div>
        {exec.status === 'skipped' && exec.error && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">
            {exec.error.replace(/^Not reducible to test spec:\s*/i, '')}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        {exec.node_domain || '-'}
      </td>
      <td className="px-4 py-3 text-xs">
        {exec.test_category ? (
          <span className={TEST_CATEGORY_LABELS[exec.test_category]?.color || 'text-gray-500'}>
            {TEST_CATEGORY_LABELS[exec.test_category]?.label || exec.test_category}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">-</span>
        )}
      </td>
      <td className="px-4 py-3">
        <ConfidenceBar value={exec.confidence} />
      </td>
      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
        {timeAgo(exec.created_at)}
      </td>
      <td className="px-4 py-3 text-gray-400">
        <Eye size={14} />
      </td>
    </tr>
  );
}

/** Verification page: Lab experiment results, execution history, and detail modal. */
export default function Verification() {
  const [searchParams, setSearchParams] = useSearchParams();
  const nodeFilter = searchParams.get('node') || null;
  const [days, setDays] = useState(nodeFilter ? 365 : 7);
  const [outcomeFilter, setOutcomeFilter] = useState(nodeFilter ? 'all' : 'attention');
  const [confRange, setConfRange] = useState([0, 100]);
  const [confDrag, setConfDrag] = useState(null);
  const confMin = confDrag ? confDrag[0] : confRange[0];
  const confMax = confDrag ? confDrag[1] : confRange[1];
  const [selectedExec, setSelectedExec] = useState(null);
  const [page, setPage] = useState(0);
  const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
  const [searchText, setSearchText] = useState('');
  const [searchCommitted, setSearchCommitted] = useState('');
  const [pruneOpen, setPruneOpen] = useState(false);
  const pageSize = 25;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (nodeFilter) { setDays(365); setOutcomeFilter('all'); setPage(0); }
    else { setDays(7); setOutcomeFilter('attention'); setPage(0); }
  }, [nodeFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== searchCommitted) { setSearchCommitted(searchText); setPage(0); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const reevaluateMutation = useMutation({
    mutationFn: () => evm.reevaluate(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lab-recent'] }); queryClient.invalidateQueries({ queryKey: ['lab-stats'] }); },
  });
  // Auto-clear re-evaluate result after 6 seconds
  useEffect(() => {
    if (reevaluateMutation.isSuccess || reevaluateMutation.isError) {
      const t = setTimeout(() => reevaluateMutation.reset(), 6000);
      return () => clearTimeout(t);
    }
  }, [reevaluateMutation.isSuccess, reevaluateMutation.isError]);
  const reevalReviewsMutation = useMutation({
    mutationFn: () => evm.reevaluateReviews({ rerunLLM: true }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lab-reeval-progress'] }); queryClient.invalidateQueries({ queryKey: ['lab-recent'] }); queryClient.invalidateQueries({ queryKey: ['lab-stats'] }); },
    onError: () => { queryClient.invalidateQueries({ queryKey: ['lab-reeval-progress'] }); },
  });
  const { data: reevalProgress } = useQuery({
    queryKey: ['lab-reeval-progress'],
    queryFn: () => evm.reevalReviewsProgress(),
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.status === 'running' ? 1000 : (d?.status === 'done' || d?.status === 'error') ? 10000 : 30000;
    },
  });
  const reevalResetMutation = useMutation({
    mutationFn: () => evm.reevalReviewsReset(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lab-reeval-progress'] }); queryClient.invalidateQueries({ queryKey: ['lab-stats'] }); queryClient.invalidateQueries({ queryKey: ['lab-recent'] }); },
  });
  // Refresh stats when reevaluation completes
  const reevalPrevStatus = useRef(null);
  useEffect(() => {
    if (reevalProgress?.status === 'done' && reevalPrevStatus.current === 'running') {
      queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lab-recent'] });
    }
    reevalPrevStatus.current = reevalProgress?.status ?? null;
  }, [reevalProgress?.status]);
  const pruneMutation = useMutation({
    mutationFn: (olderThanDays) => evm.prune({ olderThanDays }),
    onSuccess: () => { setPruneOpen(false); queryClient.invalidateQueries({ queryKey: ['lab-recent'] }); queryClient.invalidateQueries({ queryKey: ['lab-stats'] }); },
  });
  // Auto-clear prune result after 6 seconds
  useEffect(() => {
    if (pruneMutation.isSuccess || pruneMutation.isError) {
      const t = setTimeout(() => pruneMutation.reset(), 6000);
      return () => clearTimeout(t);
    }
  }, [pruneMutation.isSuccess, pruneMutation.isError]);

  const { data: stats } = useQuery({
    queryKey: ['lab-stats', days],
    queryFn: () => evm.stats(days),
    refetchInterval: 30000,
  });

  const confActive = confRange[0] > 0 || confRange[1] < 100;
  const confidenceParams = confActive
    ? { ...(confRange[0] > 0 ? { minConfidence: confRange[0] / 100 } : {}), ...(confRange[1] < 100 ? { maxConfidence: confRange[1] / 100 } : {}) }
    : {};

  const { data: recentData, isLoading } = useQuery({
    queryKey: ['lab-recent', days, outcomeFilter, confRange[0], confRange[1], page, searchCommitted, nodeFilter],
    queryFn: () => evm.recent({
      days, limit: pageSize, offset: page * pageSize,
      ...confidenceParams,
      ...(searchCommitted ? { search: searchCommitted } : {}),
      ...(nodeFilter ? { nodeId: nodeFilter } : {}),
      ...(outcomeFilter === 'attention' ? { status: 'attention' } : {}),
      ...(outcomeFilter === 'supported' ? { verified: true } : {}),
      ...(outcomeFilter === 'disproved' ? { verified: false } : {}),
      ...(outcomeFilter === 'code_error' ? { status: 'code_error' } : {}),
      ...(outcomeFilter === 'error' ? { status: 'failed' } : {}),
      ...(outcomeFilter === 'skipped' ? { status: 'skipped' } : {}),
      ...(outcomeFilter === 'needs_review' ? { status: 'needs_review' } : {}),
      ...(outcomeFilter === 'needs_expert' ? { status: 'needs_expert' } : {}),
      ...(outcomeFilter === 'analysis' ? { status: 'analysis' } : {}),
    }),
    refetchInterval: 30000,
  });

  const bulkApproveMutation = useMutation({
    mutationFn: ({ nodeIds, approved }) => evm.bulkReview(nodeIds, approved),
    onSuccess: () => { setSelectedNodeIds(new Set()); queryClient.invalidateQueries({ queryKey: ['lab-recent'] }); queryClient.invalidateQueries({ queryKey: ['lab-stats'] }); },
  });

  // Queue visibility
  const { data: queueStats } = useQuery({
    queryKey: ['lab-queue-stats'],
    queryFn: () => evm.queueStats(),
    refetchInterval: 5000,
  });
  const queueActive = (queueStats?.pending ?? 0) + (queueStats?.processing ?? 0);
  const { data: queueData } = useQuery({
    queryKey: ['lab-queue'],
    queryFn: () => evm.queue({ limit: 50 }),
    refetchInterval: 5000,
    enabled: queueActive > 0 || outcomeFilter === 'in_queue',
  });
  const queueEntries = (queueData?.entries || []).filter(e => e.status === 'pending' || e.status === 'processing');
  const cancelQueueMutation = useMutation({
    mutationFn: (id) => evm.cancelQueue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
      queryClient.invalidateQueries({ queryKey: ['lab-queue-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lab-recent'] });
    },
  });

  // Auto-refresh execution list when queue items finish processing
  const prevQueueActive = useRef(queueActive);
  useEffect(() => {
    if (prevQueueActive.current > 0 && queueActive < prevQueueActive.current) {
      // Queue shrunk — something finished, refresh results immediately
      queryClient.invalidateQueries({ queryKey: ['lab-recent'] });
      queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
    }
    prevQueueActive.current = queueActive;
  }, [queueActive]);

  // Batch-resolve node names for display
  const [, _forceNames] = useState(0);
  useEffect(() => {
    const ids = new Set();
    for (const r of (recentData?.executions || [])) { if (r.node_id) ids.add(r.node_id); }
    for (const q of queueEntries) { if (q.node_id) ids.add(q.node_id); }
    if (ids.size > 0) resolveNodeNames([...ids]).then(() => _forceNames(n => n + 1));
  }, [recentData?.executions?.length, queueEntries.length]);

  const executions = recentData?.executions || [];
  const total = recentData?.total || 0;
  const totalPages = Math.ceil(total / pageSize);

  // Navigate to next reviewable item after approve/reject in modal.
  // The current item is still in the stale executions array with its old status,
  // so we skip it by id when searching for the next reviewable.
  const navigateToNextReviewable = useCallback(() => {
    if (!selectedExec) return;
    const currentId = selectedExec.id;
    const currentIndex = executions.findIndex(e => e.id === currentId);
    // Find next reviewable after current (skip the just-reviewed item)
    for (let i = currentIndex + 1; i < executions.length; i++) {
      if (executions[i].id !== currentId && isReviewable(executions[i])) { setSelectedExec(executions[i]); return; }
    }
    // Wrap around: find first reviewable before current
    for (let i = 0; i < currentIndex; i++) {
      if (executions[i].id !== currentId && isReviewable(executions[i])) { setSelectedExec(executions[i]); return; }
    }
    // No more reviewable — close modal
    setSelectedExec(null);
  }, [selectedExec, executions]);

  const reviewableOnPage = executions.filter(isReviewable);
  const allReviewableSelected = reviewableOnPage.length > 0 && reviewableOnPage.every(e => selectedNodeIds.has(e.node_id));
  const toggleSelectNode = (nodeId) => {
    setSelectedNodeIds(prev => { const next = new Set(prev); if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId); return next; });
  };
  const toggleSelectAll = () => {
    if (allReviewableSelected) setSelectedNodeIds(new Set());
    else setSelectedNodeIds(new Set(reviewableOnPage.map(e => e.node_id)));
  };

  // Auto-open modal from ?exec=<id> query parameter
  useEffect(() => {
    const execId = searchParams.get('exec');
    if (!execId) return;
    const found = executions.find((e) => String(e.id) === execId);
    if (found) {
      setSelectedExec(found);
      setTimeout(() => setSearchParams({}, { replace: true }), 0);
      return;
    }
    if (!isLoading) {
      evm.recent({ days: 90, limit: 200 }).then((res) => {
        const match = res?.executions?.find((e) => String(e.id) === execId);
        if (match) setSelectedExec(match);
        setTimeout(() => setSearchParams({}, { replace: true }), 0);
      }).catch(() => {
        setTimeout(() => setSearchParams({}, { replace: true }), 0);
      });
    }
  }, [searchParams, executions, isLoading, selectedExec]);

  const tested = (stats?.verified ?? 0) + (stats?.disproved ?? stats?.failed ?? 0);
  const supportedOfTested = tested > 0 ? Math.round(((stats?.verified ?? 0) / tested) * 100) : 0;

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ShieldCheck size={28} className="text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold dark:text-gray-100">Verification</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Lab experiment results and verification pipeline</p>
          </div>
          {nodeFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium">
              Filtered to node
              <button onClick={() => setSearchParams({}, { replace: true })} className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200" title="Clear node filter"><X size={12} /></button>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {outcomeFilter !== 'api' && <>
            <button onClick={() => reevaluateMutation.mutate()} disabled={reevaluateMutation.isPending}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors">
              {reevaluateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
              {reevaluateMutation.isPending ? 'Re-evaluating...' : 'Re-evaluate'}
            </button>
            {reevaluateMutation.isSuccess && <span className="text-xs text-green-600 dark:text-green-400">{reevaluateMutation.data?.changed ?? 0} changed of {reevaluateMutation.data?.reprocessed ?? 0}</span>}
            {reevaluateMutation.isError && <span className="text-xs text-red-500">Failed</span>}
            {(() => {
              const rp = reevalProgress;
              const isRunning = rp?.status === 'running';
              const isDone = rp?.status === 'done';
              const isError = rp?.status === 'error';
              const showProgress = isRunning || isDone || isError;

              if (showProgress) {
                // Running / done / error — show progress panel
                const totalApproved = (rp.autoApproved || 0) + (rp.phase2AutoApproved || 0);
                const phase = rp.phase || 1;
                const pct = phase === 2 && rp.phase2Total > 0
                  ? Math.round((rp.phase2Processed / rp.phase2Total) * 100)
                  : phase === 1 ? 0 : 100;

                return (
                  <div className="flex items-center gap-2">
                    {isRunning && (
                      <>
                        <Loader2 size={14} className="animate-spin text-amber-500" />
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                            {phase === 1
                              ? `Phase 1: checking thresholds (${rp.total} items)...`
                              : `Phase 2: LLM re-eval ${rp.phase2Processed}/${rp.phase2Total}`}
                          </span>
                          {phase === 2 && (
                            <div className="w-32 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {totalApproved} approved, {rp.unchanged || 0} unchanged, {rp.errors || 0} errors
                          </span>
                        </div>
                      </>
                    )}
                    {isDone && (
                      <>
                        <CheckCircle2 size={14} className="text-green-500" />
                        <span className="text-xs text-green-600 dark:text-green-400">
                          Done: {totalApproved} approved, {rp.unchanged || 0} unchanged
                        </span>
                        <button onClick={() => reevalResetMutation.mutate()}
                          className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">
                          dismiss
                        </button>
                      </>
                    )}
                    {isError && (
                      <>
                        <XCircle size={14} className="text-red-500" />
                        <span className="text-xs text-red-500">{rp.errorMessage || 'Re-evaluation failed'}</span>
                        <button onClick={() => reevalResetMutation.mutate()}
                          className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline">
                          dismiss
                        </button>
                      </>
                    )}
                  </div>
                );
              }

              // Idle — show start button if there are pending reviews
              if (stats?.pendingReviews > 0) {
                return (
                  <button onClick={() => reevalReviewsMutation.mutate()} disabled={reevalReviewsMutation.isPending}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-colors"
                    title="Re-run LLM evaluation on all review queue items with current prompts and thresholds">
                    <FlaskConical size={14} />
                    Re-evaluate reviews ({stats.pendingReviews})
                  </button>
                );
              }
              return null;
            })()}
            <button onClick={() => setPruneOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Remove old failed/skipped executions, keeping only the latest per node">
              <Trash2 size={14} /> Prune
            </button>
            {pruneMutation.isSuccess && <span className="text-xs text-green-600 dark:text-green-400">{pruneMutation.data?.deleted ?? 0} pruned</span>}
            {pruneMutation.isError && <span className="text-xs text-red-500">Prune failed</span>}
          </>}
          <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => { setDays(d); setPage(0); }}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${days === d ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}>
                {d}d
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Lab Stat cards — hidden when API view is active */}
      {outcomeFilter !== 'api' && <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4 mb-6">
        <StatCard title="Experiments" value={stats?.total ?? '-'} subtitle={`Last ${days} days`} icon={ShieldCheck} color="blue" />
        <StatCard title="Supported" value={stats?.verified ?? '-'} subtitle={supportedOfTested ? `${supportedOfTested}% of tested` : undefined} icon={CheckCircle2} color="green" />
        <StatCard title="Refuted" value={stats?.disproved ?? stats?.failed ?? '-'} subtitle="Claim contradicted by data" icon={XCircle} color="red" />
        <StatCard title="Not Reducible" value={stats?.skipped ?? '-'} subtitle="Can't be tested empirically" icon={SkipForward} color="gray" />
        <StatCard title="Errors" value={(stats?.codeErrors ?? 0) + (stats?.errors ?? 0) || '-'} subtitle="Lab or pipeline failures" icon={AlertTriangle} color="amber" />
        <StatCard title="In Queue" value={queueActive || '-'} subtitle={queueActive > 0 ? `${queueStats?.processing ?? 0} running` : undefined} icon={queueActive > 0 ? Loader2 : ListOrdered} color={queueActive > 0 ? 'blue' : 'gray'} />
        <StatCard title="Avg Confidence" value={stats?.avgConfidence != null ? `${Math.round(stats.avgConfidence * 100)}%` : '-'} subtitle="Data-driven" icon={FlaskConical} color="purple" />
      </div>}

      {/* Category breakdown */}
      {outcomeFilter !== 'api' && stats?.categories && Object.keys(stats.categories).length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Experiment Types</h3>
          <div className="flex flex-wrap gap-4">
            {Object.entries(stats.categories).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-2">
                <span className={`text-xs font-medium ${TEST_CATEGORY_LABELS[cat]?.color || 'text-gray-500'}`}>{TEST_CATEGORY_LABELS[cat]?.label || cat}</span>
                <span className="text-sm font-bold dark:text-gray-100">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Queue panel — visible only when items are queued and not in API view */}
      {outcomeFilter !== 'api' && queueEntries.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ListOrdered size={16} className="text-blue-500" />
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Verification Queue</h3>
            <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{queueEntries.length}</span>
          </div>
          <div className="space-y-1.5">
            {queueEntries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-800/50">
                {entry.status === 'processing' ? (
                  <Loader2 size={14} className="text-blue-500 animate-spin shrink-0" />
                ) : (
                  <Clock size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
                )}
                <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1 min-w-0">
                  {entry.node_content || (entry.node_id ? <Link to={`/graph?node=${entry.node_id}`} className="text-blue-500 hover:underline font-mono" onClick={e => e.stopPropagation()}>{getCachedName(entry.node_id)}</Link> : '?')}
                </span>
                {entry.domain && <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{entry.domain}</span>}
                {entry.retry_count > 0 && (
                  <span className="text-[10px] text-amber-500 dark:text-amber-400 shrink-0">Retry {entry.retry_count}/{entry.max_retries}</span>
                )}
                <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">{timeAgo(entry.queued_at)}</span>
                {entry.status === 'pending' && (
                  <button onClick={() => cancelQueueMutation.mutate(entry.id)}
                    className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 shrink-0" title="Cancel">
                    <X size={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { value: 'attention', label: 'Needs Attention' }, { value: '', label: 'All' },
            { value: 'in_queue', label: 'In Queue', count: queueActive || 0 },
            { value: 'supported', label: 'Supported' }, { value: 'disproved', label: 'Refuted' },
            { value: 'skipped', label: 'Not Reducible' },
            { value: 'error', label: 'Errors' },
            { value: 'analysis', label: 'Post-Rejection' },
          ].map((f) => (
            <button key={f.value} onClick={() => { setOutcomeFilter(f.value); setPage(0); setSelectedNodeIds(new Set()); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors ${outcomeFilter === f.value ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
              {f.label}
              {f.count > 0 && <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold rounded-full text-white ${f.countColor || 'bg-blue-500'}`}>{f.count}</span>}
            </button>
          ))}
          <span className="w-px h-5 bg-gray-300 dark:bg-gray-600" />
          <button onClick={() => { setOutcomeFilter('api'); setPage(0); setSelectedNodeIds(new Set()); }}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors flex items-center gap-1 ${outcomeFilter === 'api' ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}>
            <Globe size={12} /> API
          </button>
        </div>
        {outcomeFilter !== 'api' && (
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none" />
              <input type="text" value={searchText} onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search claims, domains, IDs..."
                className="pl-8 pr-7 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 w-52" />
              {searchText && (
                <button onClick={() => { setSearchText(''); setSearchCommitted(''); setPage(0); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"><X size={12} /></button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Conf:</span>
              <div className="relative w-32 h-5 flex items-center">
                <div className="absolute w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full" />
                <div className="absolute h-1 bg-blue-400 dark:bg-blue-500 rounded-full" style={{ left: `${confMin}%`, width: `${confMax - confMin}%` }} />
                <input type="range" min={0} max={100} step={5} value={confMin}
                  onChange={(e) => { const v = Math.min(Number(e.target.value), confMax - 5); setConfDrag([v, confMax]); }}
                  onMouseUp={() => { if (confDrag) { setConfRange(confDrag); setConfDrag(null); setPage(0); } }}
                  onTouchEnd={() => { if (confDrag) { setConfRange(confDrag); setConfDrag(null); setPage(0); } }}
                  className="absolute w-full h-1 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                  style={{ zIndex: confMin > 95 ? 5 : 3 }} />
                <input type="range" min={0} max={100} step={5} value={confMax}
                  onChange={(e) => { const v = Math.max(Number(e.target.value), confMin + 5); setConfDrag([confMin, v]); }}
                  onMouseUp={() => { if (confDrag) { setConfRange(confDrag); setConfDrag(null); setPage(0); } }}
                  onTouchEnd={() => { if (confDrag) { setConfRange(confDrag); setConfDrag(null); setPage(0); } }}
                  className="absolute w-full h-1 appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-500 [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:cursor-pointer"
                  style={{ zIndex: 4 }} />
              </div>
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums w-16 text-right">{confMin}–{confMax}%</span>
              {confActive && (
                <button onClick={() => { setConfRange([0, 100]); setConfDrag(null); setPage(0); }}
                  className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Reset confidence filter"><X size={10} /></button>
              )}
            </div>
            <span className="text-xs text-gray-500 dark:text-gray-400">{outcomeFilter === 'in_queue' ? queueEntries.length : total} result{(outcomeFilter === 'in_queue' ? queueEntries.length : total) !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>

      {/* API Verifications view — replaces lab content when API filter is active */}
      {outcomeFilter === 'api' && <ApiVerificationsView days={days} />}

      {/* Lab Bulk action bar */}
      {outcomeFilter !== 'api' && selectedNodeIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-400">{selectedNodeIds.size} selected</span>
          <button onClick={() => bulkApproveMutation.mutate({ nodeIds: [...selectedNodeIds], approved: true })} disabled={bulkApproveMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 transition-colors">
            {bulkApproveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <ThumbsUp size={12} />} Approve All
          </button>
          <button onClick={() => bulkApproveMutation.mutate({ nodeIds: [...selectedNodeIds], approved: false })} disabled={bulkApproveMutation.isPending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 disabled:opacity-50 transition-colors">
            {bulkApproveMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <ThumbsDown size={12} />} Reject All
          </button>
          <button onClick={() => setSelectedNodeIds(new Set())} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 ml-auto">Clear</button>
          {bulkApproveMutation.isSuccess && <span className="text-xs text-green-600 dark:text-green-400">{bulkApproveMutation.data?.succeeded ?? 0} done</span>}
          {bulkApproveMutation.isError && <span className="text-xs text-red-500">Bulk action failed</span>}
        </div>
      )}

      {/* Lab Results Table */}
      {outcomeFilter !== 'api' && <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 overflow-hidden">
        {outcomeFilter === 'in_queue' ? (
          /* Queue view */
          queueEntries.length === 0 ? (
            <div className="p-12 text-center">
              <ListOrdered size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400">Queue is empty</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Nodes queued for verification will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <th className="px-4 py-2 w-8"></th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Claim</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Domain</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Priority</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Retries</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Queued</th>
                    <th className="px-4 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {queueEntries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-2 w-8"></td>
                      <td className="px-4 py-3">
                        {entry.status === 'processing' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                            <Loader2 size={10} className="animate-spin" /> Processing
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                            <Clock size={10} /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-sm">
                        <div className="line-clamp-2">{entry.node_content || (entry.node_id ? <Link to={`/graph?node=${entry.node_id}`} className="text-blue-500 hover:underline font-mono">{getCachedName(entry.node_id)}</Link> : '?')}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{entry.domain || '-'}</td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{entry.priority || 0}</td>
                      <td className="px-4 py-3 text-xs">
                        {entry.retry_count > 0 ? (
                          <span className="text-amber-500 dark:text-amber-400">{entry.retry_count}/{entry.max_retries}</span>
                        ) : (
                          <span className="text-gray-400 dark:text-gray-500">0/{entry.max_retries}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400">{timeAgo(entry.queued_at)}</td>
                      <td className="px-4 py-3">
                        {entry.status === 'pending' && (
                          <button onClick={() => cancelQueueMutation.mutate(entry.id)}
                            className="text-gray-400 hover:text-red-500 dark:hover:text-red-400" title="Cancel">
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : isLoading ? (
          <div className="p-12 text-center text-gray-400 dark:text-gray-500">Loading executions...</div>
        ) : executions.length === 0 ? (
          <div className="p-12 text-center">
            <ShieldCheck size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 dark:text-gray-400">No items need attention</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              {outcomeFilter === 'attention' ? 'Switch to "All" to see the full history' : 'Enable the verification cycle and assign a model to the spec_extraction subsystem. Ensure a lab server is running.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-4 py-2 w-8">
                    {reviewableOnPage.length > 0 && (
                      <input type="checkbox" checked={allReviewableSelected} onChange={toggleSelectAll}
                        className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500" />
                    )}
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Verdict</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Hypothesis</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Domain</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Spec Type</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Confidence</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">When</th>
                  <th className="px-4 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {executions.map((exec) => (
                  <ExecutionRow key={exec.id} exec={exec} onSelect={setSelectedExec}
                    selected={selectedNodeIds.has(exec.node_id)} onToggleSelect={toggleSelectNode} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {outcomeFilter !== 'in_queue' && (totalPages > 1 || total > 0) && (
          <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-700 px-4 py-3">
            <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
              className="px-3 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Previous</button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {total > 0 ? `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, total)} of ${total}` : 'No results'}
            </span>
            <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-40 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Next</button>
          </div>
        )}
      </div>}

      {/* Detail modal */}
      {outcomeFilter !== 'api' && selectedExec && (
        <VerificationDetailModal
          exec={selectedExec}
          onClose={() => setSelectedExec(null)}
          onReviewed={navigateToNextReviewable}
          navControls={executions.length > 1 ? {
            onPrev: () => {
              const idx = executions.findIndex(e => e.id === selectedExec.id);
              if (idx > 0) setSelectedExec(executions[idx - 1]);
            },
            onNext: () => {
              const idx = executions.findIndex(e => e.id === selectedExec.id);
              if (idx < executions.length - 1) setSelectedExec(executions[idx + 1]);
            },
            hasPrev: executions.findIndex(e => e.id === selectedExec.id) > 0,
            hasNext: executions.findIndex(e => e.id === selectedExec.id) < executions.length - 1,
            position: `${executions.findIndex(e => e.id === selectedExec.id) + 1} / ${executions.length}`,
          } : null}
        />
      )}

      {/* Prune dialog */}
      <PruneDialog open={pruneOpen} onClose={() => setPruneOpen(false)} onConfirm={(days) => pruneMutation.mutate(days)} isPending={pruneMutation.isPending} />
    </div>
  );
}
