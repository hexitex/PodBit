/**
 * EmbeddingEval — calibration dashboard for the embedding evaluation layer.
 *
 * Shows side-by-side comparison of embedding checks vs LLM consultant verdicts,
 * per-mode stats with precision/recall, score distributions, and individual
 * node-level detail for threshold tuning.
 */
import { useState, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Activity, BarChart3, Target, CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { embeddingEval } from '../lib/api';
import { resolveNodeNames, getCachedName } from '../lib/node-names';

const DAYS_OPTIONS = [1, 3, 7, 14, 30];

const AGREEMENT_LABELS = {
  true_positive: { label: 'True Positive', color: 'text-green-400 bg-green-900/30', desc: 'Embedding flagged → Consultant archived' },
  true_negative: { label: 'True Negative', color: 'text-blue-400 bg-blue-900/30', desc: 'Embedding passed → Consultant kept' },
  false_positive: { label: 'False Positive', color: 'text-yellow-400 bg-yellow-900/30', desc: 'Embedding flagged → Consultant kept' },
  false_negative: { label: 'False Negative', color: 'text-red-400 bg-red-900/30', desc: 'Embedding passed → Consultant archived' },
  unknown: { label: 'No Consultant', color: 'text-gray-400 bg-gray-700/30', desc: 'No consultant outcome yet' },
};

function StatCard({ title, value, subtitle, icon: Icon, color = 'blue' }) {
  const colors = {
    blue: 'bg-blue-500', green: 'bg-green-500', red: 'bg-red-500',
    amber: 'bg-amber-500', purple: 'bg-purple-500', gray: 'bg-gray-500',
  };
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{title}</p>
          <p className="text-xl font-bold mt-1 dark:text-gray-100">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
        <div className={`${colors[color] || colors.blue} p-2 rounded-lg shrink-0`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
    </div>
  );
}

function ModeCard({ mode }) {
  const precision = mode.precision !== null ? `${(mode.precision * 100).toFixed(0)}%` : '—';
  const recall = mode.recall !== null ? `${(mode.recall * 100).toFixed(0)}%` : '—';
  const passRate = mode.total > 0 ? `${((mode.pass / mode.total) * 100).toFixed(0)}%` : '—';
  const failRate = mode.total > 0 ? `${((mode.fail / mode.total) * 100).toFixed(0)}%` : '—';

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold dark:text-gray-100">Mode {mode.mode}</h3>
          <p className="text-xs text-gray-400">{mode.modeName}</p>
        </div>
        <span className="text-xs font-mono text-gray-400">{mode.total} checks</span>
      </div>

      {/* Pass/Fail bar */}
      {mode.total > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden mb-3 bg-gray-200 dark:bg-gray-700">
          {mode.pass > 0 && <div className="bg-green-500" style={{ width: `${(mode.pass / mode.total) * 100}%` }} />}
          {mode.fail > 0 && <div className="bg-red-500" style={{ width: `${(mode.fail / mode.total) * 100}%` }} />}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
        <div className="text-center">
          <span className="text-green-400 font-mono">{passRate}</span>
          <p className="text-gray-500">Pass</p>
        </div>
        <div className="text-center">
          <span className="text-red-400 font-mono">{failRate}</span>
          <p className="text-gray-500">Fail</p>
        </div>
      </div>

      {/* Score range */}
      <div className="text-xs text-gray-400 mb-2">
        Score: <span className="font-mono">{mode.scoreMin?.toFixed(3)}</span> — <span className="font-mono">{mode.scoreMax?.toFixed(3)}</span>
        {' '}(avg <span className="font-mono">{mode.scoreAvg?.toFixed(3)}</span>, med <span className="font-mono">{mode.scoreMedian?.toFixed(3)}</span>)
      </div>

      {/* Precision / Recall vs Consultant */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-2 mt-2">
        <p className="text-xs text-gray-500 mb-1">vs Consultant</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-gray-400">Precision:</span>{' '}
            <span className="font-mono font-semibold dark:text-gray-200">{precision}</span>
          </div>
          <div>
            <span className="text-gray-400">Recall:</span>{' '}
            <span className="font-mono font-semibold dark:text-gray-200">{recall}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1 text-xs mt-1">
          <div className="text-center" title="Embedding flagged, consultant archived">
            <span className="text-green-400 font-mono">{mode.truePositive}</span>
            <p className="text-gray-500 truncate">TP</p>
          </div>
          <div className="text-center" title="Embedding passed, consultant kept">
            <span className="text-blue-400 font-mono">{mode.trueNegative}</span>
            <p className="text-gray-500 truncate">TN</p>
          </div>
          <div className="text-center" title="Embedding flagged, consultant kept">
            <span className="text-yellow-400 font-mono">{mode.falsePositive}</span>
            <p className="text-gray-500 truncate">FP</p>
          </div>
          <div className="text-center" title="Embedding passed, consultant archived">
            <span className="text-red-400 font-mono">{mode.falseNegative}</span>
            <p className="text-gray-500 truncate">FN</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function NodeRow({ node, expanded, onToggle }) {
  const agr = AGREEMENT_LABELS[node.agreement] || AGREEMENT_LABELS.unknown;

  return (
    <>
      <tr
        className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer border-b border-gray-100 dark:border-gray-800"
        onClick={onToggle}
      >
        <td className="px-3 py-2 text-xs font-mono text-gray-500 dark:text-gray-400 max-w-[120px] truncate">
          <Link to={`/graph?node=${node.nodeId}`} className="text-blue-500 hover:underline">{getCachedName(node.nodeId)}</Link>
        </td>
        <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-300 max-w-[300px] truncate">
          {node.contentPreview}
        </td>
        <td className="px-3 py-2 text-xs text-gray-400">{node.domain}</td>
        <td className="px-3 py-2">
          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
            node.embeddingVerdict === 'PASS' ? 'text-green-400 bg-green-900/30' :
            node.embeddingVerdict === 'FAIL' ? 'text-red-400 bg-red-900/30' :
            'text-yellow-400 bg-yellow-900/30'
          }`}>
            {node.embeddingVerdict}
          </span>
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
            node.consultantVerdict === 'BOOST' ? 'text-green-400 bg-green-900/30' :
            node.consultantVerdict === 'ARCHIVE' ? 'text-red-400 bg-red-900/30' :
            node.consultantVerdict === 'DEMOTE' ? 'text-yellow-400 bg-yellow-900/30' :
            'text-gray-400 bg-gray-700/30'
          }`}>
            {node.consultantVerdict}
          </span>
        </td>
        <td className="px-3 py-2">
          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${agr.color}`}>
            {agr.label}
          </span>
        </td>
        <td className="px-3 py-2 text-xs text-gray-400">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-50 dark:bg-gray-800/30">
          <td colSpan={7} className="px-4 py-3">
            <div className="grid grid-cols-2 gap-4">
              {/* Embedding checks detail */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Embedding Checks</p>
                <div className="space-y-1">
                  {node.embeddingChecks.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="font-mono text-gray-400 w-12">M{c.mode}</span>
                      <span className="text-gray-500 w-32 truncate">{c.mode_name}</span>
                      <span className={`font-mono w-16 ${
                        c.result === 'PASS' ? 'text-green-400' :
                        c.result === 'FAIL' ? 'text-red-400' : 'text-yellow-400'
                      }`}>{c.result}</span>
                      <span className="font-mono text-gray-400">{c.score?.toFixed(4)}</span>
                      {c.compared_to && (
                        <Link to={`/graph?node=${c.compared_to}`} className="text-blue-500 hover:underline truncate max-w-[120px]" title={c.compared_to}>
                          vs {getCachedName(c.compared_to)}
                        </Link>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Consultant detail */}
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2">Consultant Outcome</p>
                {node.consultantOutcome ? (
                  <div className="space-y-1 text-xs">
                    <div><span className="text-gray-500">Action:</span> <span className="font-mono dark:text-gray-300">{node.consultantOutcome.action}</span></div>
                    {node.consultantOutcome.compositeScore !== undefined && (
                      <div><span className="text-gray-500">Score:</span> <span className="font-mono dark:text-gray-300">{node.consultantOutcome.compositeScore}</span></div>
                    )}
                    {node.consultantOutcome.embeddingFail && (
                      <div className="text-amber-400">Embedding check triggered flag</div>
                    )}
                    {node.consultantOutcome.reasoning && (
                      <p className="text-gray-400 mt-1 text-xs leading-relaxed">{node.consultantOutcome.reasoning}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">No consultant outcome recorded</p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function EmbeddingEval() {
  const [days, setDays] = useState(7);
  const [expandedNode, setExpandedNode] = useState(null);
  const [filterAgreement, setFilterAgreement] = useState(null);

  const { data: report, isLoading } = useQuery({
    queryKey: ['embedding-eval-report', days],
    queryFn: () => embeddingEval.report(days),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const { data: stats } = useQuery({
    queryKey: ['embedding-eval-stats', days],
    queryFn: () => embeddingEval.stats(days),
    refetchInterval: 30000,
    placeholderData: keepPreviousData,
  });

  const summary = report?.summary || [];
  const nodes = report?.nodes || [];
  const filteredNodes = filterAgreement
    ? nodes.filter(n => n.agreement === filterAgreement)
    : nodes;

  // Batch-resolve node names
  const [, _forceNames] = useState(0);
  useEffect(() => {
    const ids = nodes.map(n => n.nodeId).filter(Boolean);
    if (ids.length > 0) resolveNodeNames(ids).then(() => _forceNames(n => n + 1));
  }, [nodes.length]);

  // Compute totals
  const totalChecks = summary.reduce((s, m) => s + m.total, 0);
  const totalTP = summary.reduce((s, m) => s + m.truePositive, 0);
  const totalFP = summary.reduce((s, m) => s + m.falsePositive, 0);
  const totalFN = summary.reduce((s, m) => s + m.falseNegative, 0);
  const totalTN = summary.reduce((s, m) => s + m.trueNegative, 0);
  const overallPrecision = totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : null;
  const overallRecall = totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : null;

  // Agreement counts for filter chips
  const agreementCounts = {};
  for (const n of nodes) {
    agreementCounts[n.agreement] = (agreementCounts[n.agreement] || 0) + 1;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold dark:text-white flex items-center gap-2">
            <Activity className="text-violet-500" size={24} />
            Embedding Eval Calibration
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Compare embedding checks against LLM consultant verdicts to tune thresholds
          </p>
        </div>
        <div className="flex items-center gap-1">
          {DAYS_OPTIONS.map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                days === d
                  ? 'bg-violet-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-700'
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading && !report ? (
        <div className="text-center py-12 text-gray-400">Loading calibration data...</div>
      ) : report?.message && nodes.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow p-8 text-center border border-gray-200 dark:border-gray-700">
          <AlertTriangle className="mx-auto mb-3 text-amber-400" size={32} />
          <p className="text-gray-500 dark:text-gray-400">{report.message}</p>
        </div>
      ) : (
        <>
          {/* Overview stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="Nodes Evaluated" value={report?.totalNodes || 0} icon={Target} color="purple" />
            <StatCard title="Total Checks" value={totalChecks} icon={BarChart3} color="blue" />
            <StatCard
              title="Overall Precision"
              value={overallPrecision !== null ? `${(overallPrecision * 100).toFixed(0)}%` : '—'}
              subtitle="TP / (TP + FP)"
              icon={CheckCircle}
              color="green"
            />
            <StatCard
              title="Overall Recall"
              value={overallRecall !== null ? `${(overallRecall * 100).toFixed(0)}%` : '—'}
              subtitle="TP / (TP + FN)"
              icon={XCircle}
              color={overallRecall !== null && overallRecall < 0.5 ? 'red' : 'amber'}
            />
          </div>

          {/* Per-mode cards */}
          {summary.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold dark:text-gray-300 mb-3">Per-Mode Breakdown</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {summary.map(m => <ModeCard key={m.mode} mode={m} />)}
              </div>
            </div>
          )}

          {/* Agreement filter chips */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-xs text-gray-500 dark:text-gray-400">Filter:</span>
            <button
              onClick={() => setFilterAgreement(null)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                !filterAgreement ? 'bg-violet-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
              }`}
            >
              All ({nodes.length})
            </button>
            {Object.entries(AGREEMENT_LABELS).map(([key, meta]) => {
              const count = agreementCounts[key] || 0;
              if (count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilterAgreement(filterAgreement === key ? null : key)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    filterAgreement === key ? 'bg-violet-600 text-white' : `${meta.color}`
                  }`}
                  title={meta.desc}
                >
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Node comparison table */}
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-800 text-left">
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Node</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Content</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Domain</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Embedding</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Consultant</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400">Agreement</th>
                    <th className="px-3 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredNodes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-xs text-gray-400">
                        {filterAgreement ? 'No nodes match this filter' : 'No comparison data available'}
                      </td>
                    </tr>
                  ) : (
                    filteredNodes.map(node => (
                      <NodeRow
                        key={node.nodeId}
                        node={node}
                        expanded={expandedNode === node.nodeId}
                        onToggle={() => setExpandedNode(expandedNode === node.nodeId ? null : node.nodeId)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
