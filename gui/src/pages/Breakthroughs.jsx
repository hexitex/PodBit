import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Zap, TrendingUp, Users, ChevronDown, ChevronUp, Layers, Globe, Pencil,
  FileText, RefreshCw, Code2, Terminal, Shield, MessageSquare, GitBranch, Cpu, Hash, Network,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { breakthroughRegistry, database } from '../lib/api';
import { resolveNodeNames, getCachedName } from '../lib/node-names';

function StatCard({ title, value, subtitle, icon: Icon, color = 'purple' }) {
  const colorClasses = {
    purple: 'bg-purple-500',
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    amber: 'bg-amber-500',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-2xl font-bold mt-1 dark:text-gray-100">{value}</p>
          {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`${colorClasses[color]} p-3 rounded-lg`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function TimelineChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-5">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Timeline</h3>
        <p className="text-gray-400 dark:text-gray-500 text-sm text-center py-8">No breakthroughs recorded yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">Breakthroughs Over Time</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data}>
          <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px', color: '#f3f4f6' }}
            labelFormatter={(d) => `Date: ${d}`}
          />
          <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BreakdownTable({ title, data, columns }) {
  if (!data || data.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-5">
      <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">{title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((col) => (
                <th key={col.key} className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                {columns.map((col) => (
                  <td key={col.key} className="py-2 px-2 text-gray-700 dark:text-gray-300">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoreSliders({ scores, onChange }) {
  return (
    <div className="space-y-2">
      {[
        { key: 'synthesis', label: 'Synthesis' },
        { key: 'novelty', label: 'Novelty' },
        { key: 'testability', label: 'Testability' },
        { key: 'tension_resolution', label: 'Tension Resolution' },
      ].map(({ key, label }) => (
        <div key={key}>
          <div className="flex items-center justify-between mb-0.5">
            <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
            <span className="text-xs font-mono text-gray-500 w-6 text-right">{scores[key]}</span>
          </div>
          <input
            type="range" min="0" max="10" step="1"
            value={scores[key]}
            onChange={(e) => onChange({ ...scores, [key]: parseInt(e.target.value, 10) })}
            className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-purple-500"
          />
        </div>
      ))}
    </div>
  );
}

function DocSection({ title, icon: Icon, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <Icon size={13} />
        {title}
        <span className="ml-auto">{open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
      </button>
      {open && <div className="px-3 py-2 text-xs">{children}</div>}
    </div>
  );
}

function DocumentationPanel({ bt }) {
  const queryClient = useQueryClient();
  const [showDoc, setShowDoc] = useState(false);

  const { data: docData, isLoading, refetch } = useQuery({
    queryKey: ['breakthroughDoc', bt.id],
    queryFn: () => breakthroughRegistry.getDocumentation(bt.id),
    enabled: showDoc,
    staleTime: 60000,
  });

  const rebuildMutation = useMutation({
    mutationFn: () => breakthroughRegistry.rebuildDocumentation(bt.id),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['breakthroughRegistry'] });
    },
  });

  const doc = docData?.documentation;

  // Resolve names for generativity boost node IDs
  const [, _forceNames] = useState(0);
  useEffect(() => {
    const ids = (doc?.promotion?.generativityBoosts || []).map(b => b.id).filter(Boolean);
    if (ids.length > 0) resolveNodeNames(ids).then(() => _forceNames(n => n + 1));
  }, [doc?.promotion?.generativityBoosts?.length]);

  return (
    <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowDoc(!showDoc)}
          className="flex items-center gap-1.5 text-xs text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <FileText size={13} />
          {showDoc ? 'Hide Documentation' : 'View Documentation'}
        </button>
        {showDoc && (
          <button
            onClick={() => rebuildMutation.mutate()}
            disabled={rebuildMutation.isPending}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
            title="Rebuild documentation from current DB state"
          >
            <RefreshCw size={12} className={rebuildMutation.isPending ? 'animate-spin' : ''} />
            Rebuild
          </button>
        )}
      </div>

      {showDoc && (
        <div className="mt-2">
          {isLoading ? (
            <p className="text-xs text-gray-400">Loading documentation...</p>
          ) : !doc ? (
            <div className="text-xs text-gray-400 py-3 text-center">
              No documentation snapshot.{' '}
              <button
                onClick={() => rebuildMutation.mutate()}
                disabled={rebuildMutation.isPending}
                className="text-indigo-500 hover:text-indigo-600 underline"
              >
                Click Rebuild to generate.
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[10px] text-gray-400">
                Snapshot: {new Date(doc.snapshotAt).toLocaleString()} (v{doc.version})
              </p>

              {/* Node Identity */}
              {doc.node && !doc.node.error && (
                <DocSection title="Node Identity" icon={Hash} defaultOpen>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400">
                    <span>ID:</span><span className="font-mono truncate">{doc.node.id}</span>
                    <span>Type:</span><span>{doc.node.nodeType}</span>
                    <span>Domain:</span><span>{doc.node.domain || '—'}</span>
                    <span>Trajectory:</span><span>{doc.node.trajectory || '—'}</span>
                    <span>Weight:</span><span>{doc.node.weight?.toFixed(3)}</span>
                    <span>Salience:</span><span>{doc.node.salience?.toFixed(3) ?? '—'}</span>
                    <span>Contributor:</span><span>{doc.node.contributor || '—'}</span>
                    <span>Lifecycle:</span><span>{doc.node.lifecycleState || '—'}</span>
                    <span>Generation:</span><span>{doc.node.generation ?? 0}</span>
                    <span>Children:</span><span>{doc.node.totalChildren ?? 0}</span>
                    <span>Created:</span><span>{doc.node.createdAt ? new Date(doc.node.createdAt).toLocaleString() : '—'}</span>
                  </div>
                  {doc.node.contentHash && (
                    <p className="mt-1.5 text-[10px] text-gray-400 font-mono truncate">Hash: {doc.node.contentHash}</p>
                  )}
                </DocSection>
              )}

              {/* Lineage */}
              {doc.lineage && !doc.lineage.error && (
                <DocSection title={`Lineage (${doc.lineage.parents?.length || 0} parents, ${doc.lineage.children?.length || 0} children)`} icon={GitBranch}>
                  {doc.lineage.parents?.length > 0 && (
                    <div className="mb-2">
                      <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">Parents</p>
                      {doc.lineage.parents.map((p) => (
                        <div key={p.id} className="pl-2 border-l-2 border-purple-300 dark:border-purple-700 mb-1.5">
                          <p className="text-gray-700 dark:text-gray-300">{p.content}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {p.node_type} | {p.domain} | w:{p.weight?.toFixed(2)} | {p.edge_type}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {doc.lineage.grandparents?.length > 0 && (
                    <div className="mb-2">
                      <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">Grandparents</p>
                      {doc.lineage.grandparents.map((gp, i) => (
                        <div key={gp.id + i} className="pl-2 border-l-2 border-gray-300 dark:border-gray-600 mb-1">
                          <p className="text-gray-600 dark:text-gray-400">{gp.content}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{gp.node_type} | {gp.domain}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  {doc.lineage.children?.length > 0 && (
                    <div>
                      <p className="font-medium text-gray-500 dark:text-gray-400 mb-1">Children</p>
                      {doc.lineage.children.map((c) => (
                        <div key={c.id} className="pl-2 border-l-2 border-blue-300 dark:border-blue-700 mb-1">
                          <p className="text-gray-600 dark:text-gray-400">{c.content}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{c.node_type} | {c.domain}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </DocSection>
              )}

              {/* Lab Verification */}
              {doc.verification && !doc.verification.error && (
                <DocSection title={`Lab Verification (${doc.verification.attempts?.length || 0} attempts)`} icon={Shield}>
                  {doc.verification.status && (
                    <p className="mb-2 text-gray-500 dark:text-gray-400">
                      Status: <span className={doc.verification.status === 'completed' ? 'text-green-500' : 'text-yellow-500'}>{doc.verification.status}</span>
                      {doc.verification.score != null && ` | Score: ${doc.verification.score}`}
                    </p>
                  )}
                  {doc.verification.attempts?.map((a, i) => (
                    <DocSection key={a.id || i} title={`Attempt ${i + 1} — ${a.status}${a.claim_supported ? ' (supported)' : a.status === 'completed' ? ' (disproved)' : ''}`} icon={Code2}>
                      {a.hypothesis && <p className="text-gray-600 dark:text-gray-400 mb-1.5 italic">{a.hypothesis}</p>}
                      {a.code && (
                        <div className="mb-2">
                          <p className="text-[10px] text-gray-400 mb-0.5">Code ({a.evaluation_mode || 'unknown'} mode, {a.claim_type || 'unknown'} claim)</p>
                          <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-3 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-words">{a.code}</pre>
                        </div>
                      )}
                      {a.stdout && (
                        <div className="mb-2">
                          <p className="text-[10px] text-gray-400 mb-0.5 flex items-center gap-1"><Terminal size={10} /> stdout</p>
                          <pre className="text-xs bg-gray-900 text-gray-300 rounded-lg p-2 overflow-x-auto max-h-36 overflow-y-auto whitespace-pre-wrap break-words">{a.stdout}</pre>
                        </div>
                      )}
                      {a.stderr && (
                        <div className="mb-2">
                          <p className="text-[10px] text-red-400 mb-0.5 flex items-center gap-1"><Terminal size={10} /> stderr</p>
                          <pre className="text-xs bg-gray-900 text-red-400 rounded-lg p-2 overflow-x-auto max-h-36 overflow-y-auto whitespace-pre-wrap break-words">{a.stderr}</pre>
                        </div>
                      )}
                      <div className="flex flex-wrap gap-3 text-[10px] text-gray-400 mt-1">
                        {a.confidence != null && <span>Confidence: {(a.confidence * 100).toFixed(0)}%</span>}
                        {a.execution_time_ms != null && <span>{a.execution_time_ms}ms</span>}
                        {a.weight_before != null && a.weight_after != null && (
                          <span>Weight: {Number(a.weight_before).toFixed(3)} → {Number(a.weight_after).toFixed(3)}</span>
                        )}
                        {a.created_at && <span>{new Date(a.created_at).toLocaleString()}</span>}
                      </div>
                      {a.error && <p className="text-red-400 mt-1">{a.error}</p>}
                      {a.guidance && <p className="text-yellow-400 mt-1 italic">Guidance: {a.guidance}</p>}
                    </DocSection>
                  ))}
                  {(!doc.verification.attempts || doc.verification.attempts.length === 0) && (
                    <p className="text-gray-400">No verification attempts recorded.</p>
                  )}
                </DocSection>
              )}

              {/* Feedback History */}
              {doc.feedback && !doc.feedback.error && doc.feedback.length > 0 && (
                <DocSection title={`Feedback History (${doc.feedback.length})`} icon={MessageSquare}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="text-left py-1">Rating</th>
                        <th className="text-left py-1">Source</th>
                        <th className="text-left py-1">Note</th>
                        <th className="text-left py-1">Weight</th>
                        <th className="text-left py-1">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.feedback.map((f, i) => (
                        <tr key={f.id || i} className="border-b border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400">
                          <td className="py-1">{f.rating === 1 ? '+1' : f.rating === -1 ? '-1' : '0'}</td>
                          <td className="py-1">{f.source}/{f.contributor}</td>
                          <td className="py-1 max-w-[200px] truncate">{f.note || '—'}</td>
                          <td className="py-1">
                            {f.weight_before != null && f.weight_after != null
                              ? `${Number(f.weight_before).toFixed(2)} → ${Number(f.weight_after).toFixed(2)}`
                              : '—'}
                          </td>
                          <td className="py-1">{f.created_at ? new Date(f.created_at).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DocSection>
              )}

              {/* Governance Decisions */}
              {doc.decisions && !doc.decisions.error && doc.decisions.length > 0 && (
                <DocSection title={`Governance Decisions (${doc.decisions.length})`} icon={Layers}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="text-left py-1">Field</th>
                        <th className="text-left py-1">Change</th>
                        <th className="text-left py-1">Tier</th>
                        <th className="text-left py-1">Reason</th>
                        <th className="text-left py-1">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.decisions.map((d, i) => (
                        <tr key={d.id || i} className="border-b border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400">
                          <td className="py-1">{d.field}</td>
                          <td className="py-1 max-w-[150px] truncate">{d.old_value || '—'} → {d.new_value}</td>
                          <td className="py-1">{d.decided_by_tier}/{d.contributor}</td>
                          <td className="py-1 max-w-[200px] truncate">{d.reason || '—'}</td>
                          <td className="py-1">{d.created_at ? new Date(d.created_at).toLocaleDateString() : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </DocSection>
              )}

              {/* Integrity Chain */}
              {doc.integrity && !doc.integrity.error && doc.integrity.length > 0 && (
                <DocSection title={`Integrity Chain (${doc.integrity.length} entries)`} icon={Shield}>
                  {doc.integrity.map((entry, i) => (
                    <div key={i} className="flex items-start gap-2 py-1 border-b border-gray-100 dark:border-gray-800 last:border-0 text-gray-600 dark:text-gray-400">
                      <span className="font-medium shrink-0">{entry.operation}</span>
                      <span className="font-mono text-[10px] truncate flex-1">
                        {entry.content_hash_after?.slice(0, 12)}...
                      </span>
                      <span className="text-[10px] shrink-0">{entry.contributor}</span>
                      <span className="text-[10px] shrink-0">{entry.timestamp ? new Date(entry.timestamp).toLocaleDateString() : ''}</span>
                    </div>
                  ))}
                </DocSection>
              )}

              {/* Model Snapshot */}
              {doc.modelSnapshot?.assignments && !doc.modelSnapshot.error && (
                <DocSection title="Model Snapshot (at promotion time)" icon={Cpu}>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="text-left py-1">Subsystem</th>
                        <th className="text-left py-1">Model</th>
                        <th className="text-left py-1">Provider</th>
                        <th className="text-left py-1">Consultant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(doc.modelSnapshot.assignments)
                        .filter(([, m]) => m !== null)
                        .map(([sub, m]) => (
                          <tr key={sub} className="border-b border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-400">
                            <td className="py-1">{sub}</td>
                            <td className="py-1">{m.modelName}</td>
                            <td className="py-1">{m.provider}</td>
                            <td className="py-1">{m.consultantModelName || '—'}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </DocSection>
              )}

              {/* Number References */}
              {doc.numberRefs && !doc.numberRefs.error && doc.numberRefs.length > 0 && (
                <DocSection title={`Number References (${doc.numberRefs.length})`} icon={Hash}>
                  {doc.numberRefs.map((ref, i) => (
                    <div key={i} className="flex gap-2 py-1 text-gray-600 dark:text-gray-400">
                      <span className="font-mono">{ref.var_id}</span>
                      <span>= {ref.value}</span>
                      <span className="text-gray-400 truncate">({ref.scope_text})</span>
                    </div>
                  ))}
                </DocSection>
              )}

              {/* Partition Context */}
              {doc.partition && !doc.partition.error && (
                <DocSection title="Partition Context" icon={Network}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400">
                    <span>ID:</span><span>{doc.partition.id}</span>
                    <span>Name:</span><span>{doc.partition.name}</span>
                    <span>Domains:</span><span>{doc.partition.domains?.join(', ') || '—'}</span>
                    <span>Bridges:</span><span>{doc.partition.bridges?.length > 0 ? doc.partition.bridges.join(', ') : 'None'}</span>
                  </div>
                  {doc.partition.description && (
                    <p className="mt-1 text-gray-400 italic">{doc.partition.description}</p>
                  )}
                </DocSection>
              )}

              {/* Promotion Metadata */}
              {doc.promotion && (
                <DocSection title="Promotion Details" icon={Zap}>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400">
                    <span>Promoted By:</span><span>{doc.promotion.promotedBy || '—'}</span>
                    <span>Source:</span><span>{doc.promotion.promotionSource || '—'}</span>
                    <span>Reason:</span><span>{doc.promotion.validationReason || '—'}</span>
                  </div>
                  {doc.promotion.scores && (
                    <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-600 dark:text-gray-400">
                      <span>Synthesis:</span><span>{doc.promotion.scores.synthesis ?? '—'}</span>
                      <span>Novelty:</span><span>{doc.promotion.scores.novelty ?? '—'}</span>
                      <span>Testability:</span><span>{doc.promotion.scores.testability ?? '—'}</span>
                      <span>Tension:</span><span>{doc.promotion.scores.tension_resolution ?? '—'}</span>
                      <span>Composite:</span><span>{doc.promotion.scores.composite ?? '—'}</span>
                    </div>
                  )}
                  {doc.promotion.generativityBoosts?.length > 0 && (
                    <div className="mt-1.5">
                      <p className="font-medium text-gray-500 dark:text-gray-400">Generativity Boosts</p>
                      {doc.promotion.generativityBoosts.map((b, i) => (
                        <p key={i} className="text-gray-500 dark:text-gray-400 font-mono">
                          <Link to={`/graph?node=${b.id}`} className="text-blue-500 hover:underline">{getCachedName(b.id)}</Link> +{b.boost} (gen {b.generation})
                        </p>
                      ))}
                    </div>
                  )}
                </DocSection>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BreakthroughCard({ bt }) {
  const [expanded, setExpanded] = useState(false);
  const [editingScores, setEditingScores] = useState(false);
  const [scores, setScores] = useState({
    synthesis: bt.validation_synthesis ?? 7,
    novelty: bt.validation_novelty ?? 7,
    testability: bt.validation_testability ?? 5,
    tension_resolution: bt.validation_tension_resolution ?? 5,
  });
  const queryClient = useQueryClient();
  const parents = bt.parent_contents;
  const hasParents = parents && parents.length > 0;

  const scoreMutation = useMutation({
    mutationFn: (s) => breakthroughRegistry.updateScores(bt.id, s),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['breakthroughRegistry'] });
      setEditingScores(false);
    },
  });

  const scoreBar = (label, value) => {
    if (value == null) return null;
    const pct = Math.min(100, Math.max(0, value * 10));
    const color = value >= 7 ? 'bg-green-500' : value >= 5 ? 'bg-yellow-500' : 'bg-red-400';
    return (
      <div className="flex items-center gap-2 text-xs">
        <span className="w-20 text-gray-500 dark:text-gray-400 shrink-0">{label}</span>
        <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
          <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
        </div>
        <span className="w-6 text-right text-gray-600 dark:text-gray-300">{value}</span>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{bt.content}</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {bt.domain && (
              <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full">
                {bt.domain}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full">
              {bt.project_name}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              bt.promotion_source === 'autonomous'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
            }`}>
              {bt.promotion_source === 'autonomous' ? 'Autonomous' : 'Manual'}
            </span>
            {bt.validation_composite != null && (
              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                Score: {bt.validation_composite}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setEditingScores(!editingScores)}
            className="p-1 text-gray-400 hover:text-purple-500 transition-colors"
            title={bt.validation_composite != null ? 'Edit scores' : 'Add scores'}
          >
            <Pencil size={14} />
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
            {bt.promoted_at ? new Date(bt.promoted_at).toLocaleDateString() : ''}
          </span>
        </div>
      </div>

      {/* Score editing */}
      {editingScores && (
        <div className="mt-3 border border-purple-200 dark:border-purple-800 rounded-lg p-3 bg-purple-50/50 dark:bg-purple-900/10">
          <ScoreSliders scores={scores} onChange={setScores} />
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => scoreMutation.mutate(scores)}
              disabled={scoreMutation.isPending}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
            >
              {scoreMutation.isPending ? 'Saving...' : 'Save Scores'}
            </button>
            <button
              onClick={() => setEditingScores(false)}
              className="px-3 py-1.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Scores */}
      {!editingScores && bt.validation_composite != null && (
        <div className="mt-3 space-y-1.5">
          {scoreBar('Synthesis', bt.validation_synthesis)}
          {scoreBar('Novelty', bt.validation_novelty)}
          {scoreBar('Testability', bt.validation_testability)}
          {scoreBar('Tension', bt.validation_tension_resolution)}
        </div>
      )}

      {/* No scores — prompt to add */}
      {!editingScores && bt.validation_composite == null && (
        <button
          onClick={() => setEditingScores(true)}
          className="mt-3 flex items-center gap-1.5 text-xs text-purple-500 hover:text-purple-600 dark:text-purple-400 dark:hover:text-purple-300"
        >
          <Pencil size={12} />
          Add validation scores
        </button>
      )}

      {/* Validation reason */}
      {bt.validation_reason && (
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">{bt.validation_reason}</p>
      )}

      {/* Expandable parent contents */}
      {hasParents && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {parents.length} source{parents.length !== 1 ? 's' : ''}
          </button>
          {expanded && (
            <div className="mt-2 space-y-1.5 pl-3 border-l-2 border-gray-200 dark:border-gray-700">
              {parents.map((p, i) => (
                <p key={i} className="text-xs text-gray-500 dark:text-gray-400">{p}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Documentation Panel */}
      <DocumentationPanel bt={bt} />
    </div>
  );
}

/** Breakthroughs page: filtered list of promoted nodes with documentation panel. */
export default function Breakthroughs() {
  const [filters, setFilters] = useState({
    project: '',
    domain: '',
    promotionSource: '',
    orderBy: 'promoted_at',
    direction: 'DESC',
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['breakthroughRegistry', 'stats', filters.project],
    queryFn: () => breakthroughRegistry.stats(filters.project ? { project: filters.project } : {}),
    staleTime: 15000,
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ['breakthroughRegistry', 'list', filters],
    queryFn: () => breakthroughRegistry.list({
      ...(filters.project && { project: filters.project }),
      ...(filters.domain && { domain: filters.domain }),
      ...(filters.promotionSource && { promotionSource: filters.promotionSource }),
      orderBy: filters.orderBy,
      direction: filters.direction,
      limit: 100,
    }),
    staleTime: 15000,
  });

  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: database.listProjects,
    staleTime: 60000,
  });

  // Extract unique domains from list
  const domains = [...new Set(
    (listData?.breakthroughs || [])
      .map((b) => b.domain)
      .filter(Boolean)
  )].sort();

  const projects = projectsData?.projects ? Object.keys(projectsData.projects) : [];

  return (
    <div className="p-4 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <Zap className="text-purple-500" size={24} />
        <h1 className="text-2xl font-bold dark:text-gray-100">Breakthrough Registry</h1>
        <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300 rounded-full">
          {stats?.total || 0} total
        </span>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="Total Breakthroughs"
          value={stats?.total || 0}
          subtitle="across all projects"
          icon={Zap}
          color="purple"
        />
        <StatCard
          title={`Recent (${stats?.recentDays || 30}d)`}
          value={stats?.recent || 0}
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          title="Avg Composite"
          value={stats?.avgComposite ?? '—'}
          subtitle="validation score"
          icon={Globe}
          color="green"
        />
        <StatCard
          title="Manual / Auto"
          value={`${stats?.bySource?.manual || 0} / ${stats?.bySource?.autonomous || 0}`}
          icon={Users}
          color="orange"
        />
      </div>

      {/* Timeline */}
      <div className="mb-6">
        <TimelineChart data={stats?.timeline} />
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <BreakdownTable
          title="By Project"
          data={stats?.byProject}
          columns={[
            { key: 'project', label: 'Project' },
            { key: 'count', label: 'Count' },
            { key: 'avgComposite', label: 'Avg Score', render: (v) => v ?? '—' },
          ]}
        />
        <BreakdownTable
          title="By Domain"
          data={stats?.byDomain}
          columns={[
            { key: 'domain', label: 'Domain' },
            { key: 'count', label: 'Count' },
            { key: 'avgComposite', label: 'Avg Score', render: (v) => v ?? '—' },
          ]}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filters.project}
          onChange={(e) => setFilters({ ...filters, project: e.target.value })}
          className="text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
        >
          <option value="">All Projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <select
          value={filters.domain}
          onChange={(e) => setFilters({ ...filters, domain: e.target.value })}
          className="text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
        >
          <option value="">All Domains</option>
          {domains.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
        <select
          value={filters.promotionSource}
          onChange={(e) => setFilters({ ...filters, promotionSource: e.target.value })}
          className="text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
        >
          <option value="">All Sources</option>
          <option value="manual">Manual</option>
          <option value="autonomous">Autonomous</option>
        </select>
        <select
          value={`${filters.orderBy}-${filters.direction}`}
          onChange={(e) => {
            const [orderBy, direction] = e.target.value.split('-');
            setFilters({ ...filters, orderBy, direction });
          }}
          className="text-sm px-3 py-1.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300"
        >
          <option value="promoted_at-DESC">Newest First</option>
          <option value="promoted_at-ASC">Oldest First</option>
          <option value="validation_composite-DESC">Highest Score</option>
          <option value="validation_composite-ASC">Lowest Score</option>
        </select>
      </div>

      {/* Breakthrough List */}
      {listLoading ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">Loading breakthroughs...</div>
      ) : !listData?.breakthroughs?.length ? (
        <div className="text-center py-12">
          <Zap className="mx-auto text-gray-300 dark:text-gray-600 mb-3" size={48} />
          <p className="text-gray-500 dark:text-gray-400">No breakthroughs recorded yet</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Promote nodes via the Graph page or let the synthesis engine discover them
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {listData.breakthroughs.map((bt) => (
            <BreakthroughCard key={bt.id} bt={bt} />
          ))}
          {listData.total > listData.breakthroughs.length && (
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 pt-2">
              Showing {listData.breakthroughs.length} of {listData.total}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
