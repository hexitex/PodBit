import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { labRegistry } from '../lib/api';
import { FlaskConical, Plus, RefreshCw, Trash2, Power, PowerOff, Activity, ExternalLink, Pencil, Save } from 'lucide-react';
import api from '../lib/api';

// ─── Health Status Dot ───────────────────────────────────────────────────────

function HealthDot({ status }) {
  const colors = {
    ok: 'bg-green-500',
    degraded: 'bg-yellow-500',
    offline: 'bg-red-500',
    unknown: 'bg-gray-400',
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status] || colors.unknown}`}
          title={status} />
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-gray-900 dark:text-white' }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Lab Form Modal (register + edit) ────────────────────────────────────────

function ContextPromptEditor({ labId }) {
  const [prompt, setPrompt] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = async () => {
    if (loaded) return;
    try {
      const resp = await api.get(`/lab-registry/${labId}/context-prompt`);
      setPrompt(resp.data.contextPrompt || '');
      setLoaded(true);
    } catch { /* non-fatal */ }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/lab-registry/${labId}/context-prompt`, { contextPrompt: prompt });
      setDirty(false);
    } catch { /* non-fatal */ }
    setSaving(false);
  };

  return (
    <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-1">
        <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
          <Pencil size={12} /> Supplementary Notes
        </h5>
        <div className="flex items-center gap-2">
          {!loaded && (
            <button onClick={load} className="text-xs text-podbit-600 dark:text-podbit-400 hover:underline">
              Edit
            </button>
          )}
          {loaded && dirty && (
            <button onClick={save} disabled={saving}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 bg-podbit-600 text-white rounded hover:bg-podbit-700 disabled:opacity-50">
              <Save size={10} /> {saving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
        Optional extra context for the spec extractor. Experiment types and descriptions are auto-synced from the lab server above — these notes add detail like menus, constraints, or usage tips.
      </p>
      {loaded && (
        <textarea
          className="w-full h-40 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded text-xs font-mono text-gray-700 dark:text-gray-300 resize-y"
          value={prompt}
          onChange={(e) => { setPrompt(e.target.value); setDirty(true); }}
          placeholder="Describe what this lab can test, what spec types it supports, and what it cannot do..."
        />
      )}
    </div>
  );
}

function LabFormModal({ initial, onClose, onSave, saving }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name || '',
    url: initial?.url || '',
    description: initial?.description || '',
    authType: initial?.authType || 'none',
    authCredential: initial?.authCredential || '',
    authHeader: initial?.authHeader || '',
    specTypes: (initial?.specTypes || []).join(', '),
    priority: initial?.priority ?? 0,
    queueLimit: initial?.queueLimit ?? '',
    artifactTtlSeconds: initial?.artifactTtlSeconds ?? '',
    tags: (initial?.tags || []).join(', '),
    templateId: initial?.templateId || '',
    uiUrl: initial?.uiUrl || '',
    portKey: initial?.portKey || '',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      // When portKey is set, URL is overlaid from server config — send empty string as hint
      url: form.portKey ? '' : form.url,
      specTypes: form.specTypes ? form.specTypes.split(',').map(s => s.trim()).filter(Boolean) : [],
      tags: form.tags ? form.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
      priority: parseInt(form.priority) || 0,
      queueLimit: form.queueLimit !== '' ? parseInt(form.queueLimit) || null : null,
      artifactTtlSeconds: form.artifactTtlSeconds !== '' ? parseInt(form.artifactTtlSeconds) || null : null,
      authHeader: form.authHeader || undefined,
      templateId: form.templateId || undefined,
      uiUrl: form.uiUrl || undefined,
      portKey: form.portKey || null,
    };
    onSave(payload);
  };

  const inputCls = "w-full px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded text-sm";
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl border border-gray-200 dark:border-gray-800"
           onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">{isEdit ? 'Edit Lab' : 'Register Lab'}</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className={labelCls}>Name *</label>
            <input className={inputCls}
                   value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <label className={labelCls}>API URL {!form.portKey && '*'}</label>
            <input className={inputCls} placeholder="http://localhost:4714"
                   value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                   required={!form.portKey}
                   disabled={!!form.portKey} />
            {form.portKey && (
              <div className="text-xs text-gray-500 mt-1">URL is overlaid from <code>PORTS.{form.portKey}</code> at read time — the field above is a hint only and is ignored while a Port Key is set.</div>
            )}
          </div>
          <div>
            <label className={labelCls}>Port Key <span className="font-normal text-gray-400">(optional — bind to a config slot)</span></label>
            <select className={inputCls}
                    value={form.portKey} onChange={e => setForm({ ...form, portKey: e.target.value })}>
              <option value="">— none (use API URL above) —</option>
              <option value="mathLab">mathLab — uses PORTS.mathLab from .env</option>
              <option value="nnLab">nnLab — uses PORTS.nnLab from .env</option>
              <option value="critiqueLab">critiqueLab — uses PORTS.critiqueLab from .env</option>
            </select>
            <div className="text-xs text-gray-500 mt-1">Set this for built-in / co-located labs so port changes in <code>.env</code> propagate without DB edits. Leave blank for remote labs.</div>
          </div>
          <div>
            <label className={labelCls}>Dashboard URL <span className="font-normal text-gray-400">(queue management UI)</span></label>
            <input className={inputCls} placeholder="http://localhost:4714/ui"
                   value={form.uiUrl} onChange={e => setForm({ ...form, uiUrl: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input className={inputCls}
                   value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* Auth section */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Auth Type</label>
              <select className={inputCls}
                      value={form.authType} onChange={e => setForm({ ...form, authType: e.target.value })}>
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="api_key">API Key</option>
                <option value="header">Custom Header</option>
              </select>
            </div>
            {form.authType !== 'none' && (
              <div>
                <label className={labelCls}>Auth Header</label>
                <input className={inputCls} placeholder="Authorization"
                       value={form.authHeader} onChange={e => setForm({ ...form, authHeader: e.target.value })} />
              </div>
            )}
          </div>
          {form.authType !== 'none' && (
            <div>
              <label className={labelCls}>Credential {isEdit && '(leave blank to keep current)'}</label>
              <input type="password" className={inputCls}
                     placeholder={isEdit ? '(unchanged)' : ''}
                     value={form.authCredential} onChange={e => setForm({ ...form, authCredential: e.target.value })} />
            </div>
          )}

          {/* Spec types & tags */}
          <div>
            <label className={labelCls}>Spec Types (comma-separated)</label>
            <input className={inputCls} placeholder="math, simulation, parameter_sweep"
                   value={form.specTypes} onChange={e => setForm({ ...form, specTypes: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Tags (comma-separated)</label>
            <input className={inputCls} placeholder="gpu, local, production"
                   value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
          </div>

          {/* Numeric settings */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>Priority</label>
              <input type="number" className={inputCls}
                     value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Queue Limit</label>
              <input type="number" className={inputCls} placeholder="No limit" min="1"
                     value={form.queueLimit} onChange={e => setForm({ ...form, queueLimit: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Artifact TTL (s)</label>
              <input type="number" className={inputCls} placeholder="Default" min="0"
                     value={form.artifactTtlSeconds} onChange={e => setForm({ ...form, artifactTtlSeconds: e.target.value })} />
            </div>
          </div>

          {/* Template */}
          <div>
            <label className={labelCls}>Template ID</label>
            <input className={inputCls} placeholder="Optional — link to a lab template"
                   value={form.templateId} onChange={e => setForm({ ...form, templateId: e.target.value })} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
                    className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              Cancel
            </button>
            <button type="submit" disabled={saving}
                    className="px-4 py-2 text-sm bg-podbit-600 text-white rounded hover:bg-podbit-700 disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Register'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Labs Page ───────────────────────────────────────────────────────────────

export default function Labs() {
  const qc = useQueryClient();
  const [showRegister, setShowRegister] = useState(false);
  const [editingLab, setEditingLab] = useState(null);
  const [expandedLab, setExpandedLab] = useState(null);
  const [checkingHealth, setCheckingHealth] = useState(null);

  const { data: statsData } = useQuery({
    queryKey: ['lab-registry-stats'],
    queryFn: labRegistry.stats,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  const { data: labsData, isLoading } = useQuery({
    queryKey: ['lab-registry'],
    queryFn: labRegistry.list,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  const registerMut = useMutation({
    mutationFn: (data) => labRegistry.register(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab-registry'] });
      qc.invalidateQueries({ queryKey: ['lab-registry-stats'] });
      setShowRegister(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => labRegistry.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab-registry'] });
      qc.invalidateQueries({ queryKey: ['lab-registry-stats'] });
      setEditingLab(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id) => labRegistry.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lab-registry'] });
      qc.invalidateQueries({ queryKey: ['lab-registry-stats'] });
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, enabled }) => enabled ? labRegistry.disable(id) : labRegistry.enable(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lab-registry'] }),
  });

  const handleHealthCheck = async (id) => {
    setCheckingHealth(id);
    try {
      await labRegistry.checkHealth(id);
      qc.invalidateQueries({ queryKey: ['lab-registry'] });
      qc.invalidateQueries({ queryKey: ['lab-registry-stats'] });
    } finally {
      setCheckingHealth(null);
    }
  };

  const labs = labsData?.labs || [];
  const stats = statsData || {};

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical size={24} className="text-podbit-600 dark:text-podbit-400" />
          <h1 className="text-2xl font-bold">Lab Registry</h1>
        </div>
        <button onClick={() => setShowRegister(true)}
                className="flex items-center gap-2 px-4 py-2 bg-podbit-600 text-white rounded-lg hover:bg-podbit-700 text-sm">
          <Plus size={16} /> Register Lab
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <StatCard label="Total Labs" value={stats.total ?? 0} />
        <StatCard label="Online" value={stats.online ?? 0} color="text-green-600 dark:text-green-400" />
        <StatCard label="Offline" value={stats.offline ?? 0} color="text-red-600 dark:text-red-400" />
        <StatCard label="Degraded" value={stats.degraded ?? 0} color="text-yellow-600 dark:text-yellow-400" />
        <StatCard label="Queue Depth" value={stats.totalQueueDepth ?? 0} sub="across all labs" />
      </div>

      {/* Lab Table */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : labs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No labs registered. Click "Register Lab" to add one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase">
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">URL</th>
                <th className="px-4 py-3">Spec Types</th>
                <th className="px-4 py-3 text-center">Queue</th>
                <th className="px-4 py-3 text-center">Priority</th>
                <th className="px-4 py-3 text-center">Enabled</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {labs.map((lab) => (
                <React.Fragment key={lab.id}>
                <tr className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 cursor-pointer"
                    onClick={() => setExpandedLab(expandedLab === lab.id ? null : lab.id)}>
                  <td className="px-4 py-3">
                    <HealthDot status={lab.healthStatus} />
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {lab.name}
                    {lab.description && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{lab.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 dark:text-gray-400">
                    {lab.url}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(lab.specTypes || []).map((t) => (
                        <span key={t} className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">
                    {lab.queueDepth}{lab.queueLimit ? `/${lab.queueLimit}` : ''}
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">{lab.priority}</td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleMut.mutate({ id: lab.id, enabled: lab.enabled }); }}
                      className={`p-1 rounded ${lab.enabled ? 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                      title={lab.enabled ? 'Disable' : 'Enable'}>
                      {lab.enabled ? <Power size={16} /> : <PowerOff size={16} />}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setEditingLab(lab); }}
                              className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                              title="Edit">
                        <Pencil size={14} />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleHealthCheck(lab.id); }}
                              disabled={checkingHealth === lab.id}
                              className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
                              title="Health check">
                        <RefreshCw size={14} className={checkingHealth === lab.id ? 'animate-spin' : ''} />
                      </button>
                      <a href={lab.uiUrl || lab.url} target="_blank" rel="noopener noreferrer"
                         className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                         title={lab.uiUrl ? "Open lab dashboard" : "Open lab API"}>
                        <ExternalLink size={14} />
                      </a>
                      <button onClick={(e) => {
                                e.stopPropagation();
                                if (confirm(`Delete lab "${lab.name}"?`)) deleteMut.mutate(lab.id);
                              }}
                              className="p-1 rounded text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                              title="Delete">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedLab === lab.id && (
                  <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                    <td colSpan={8} className="px-6 py-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">Version</p>
                          <p className="text-gray-900 dark:text-white">{lab.version || lab.capabilities?.version || 'Unknown'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">Queue Limit</p>
                          <p className="text-gray-900 dark:text-white">{lab.queueLimit ?? lab.capabilities?.queueLimit ?? 'No limit'}</p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">Artifact TTL</p>
                          <p className="text-gray-900 dark:text-white">
                            {lab.artifactTtlSeconds ?? lab.capabilities?.artifactTtlSeconds
                              ? `${Math.round((lab.artifactTtlSeconds || lab.capabilities?.artifactTtlSeconds) / 86400)}d`
                              : 'Unknown'}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">Auth</p>
                          <p className="text-gray-900 dark:text-white">{lab.authType === 'none' ? 'None' : lab.authType}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">Features</p>
                          <div className="flex flex-wrap gap-1">
                            {(lab.capabilities?.features || []).length > 0
                              ? lab.capabilities.features.map((f) => (
                                  <span key={f} className="px-1.5 py-0.5 bg-podbit-100 dark:bg-podbit-900/30 text-podbit-700 dark:text-podbit-300 rounded text-xs">{f}</span>
                                ))
                              : <span className="text-gray-400">No features reported</span>}
                          </div>
                        </div>
                        {(lab.tags || []).length > 0 && (
                          <div className="col-span-2">
                            <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">Tags</p>
                            <div className="flex flex-wrap gap-1">
                              {lab.tags.map((t) => (
                                <span key={t} className="px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs">{t}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {lab.templateId && (
                          <div className="col-span-2">
                            <p className="text-gray-500 dark:text-gray-400 font-medium mb-1">Template</p>
                            <p className="text-gray-900 dark:text-white font-mono">{lab.templateId}</p>
                          </div>
                        )}
                      </div>

                      {/* Capabilities — structured, auto-synced from lab server */}
                      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                        <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                          Experiment Types
                          <span className="font-normal normal-case tracking-normal text-gray-400 dark:text-gray-500 ml-2">synced from lab server</span>
                        </h5>
                        {(() => {
                          const capsSpecTypes = lab.capabilities?.specTypes;
                          const isObject = capsSpecTypes && !Array.isArray(capsSpecTypes) && typeof capsSpecTypes === 'object';
                          const specTypes = lab.specTypes || [];
                          if (specTypes.length === 0) return <p className="text-xs text-gray-400">No experiment types reported. Run a health check.</p>;
                          return (
                            <div className="space-y-2">
                              {specTypes.map((t) => (
                                <div key={t} className="flex gap-2">
                                  <code className="shrink-0 px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded text-xs font-mono">{t}</code>
                                  {isObject && capsSpecTypes[t] && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{capsSpecTypes[t]}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>

                      {/* Lab description */}
                      {lab.capabilities?.description && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Description</h5>
                          <p className="text-xs text-gray-600 dark:text-gray-300">{lab.capabilities.description}</p>
                        </div>
                      )}

                      <ContextPromptEditor labId={lab.id} />
                      {lab.healthMessage && (
                        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs">
                          <span className="text-gray-500 dark:text-gray-400">Last health check: </span>
                          <span className="text-gray-700 dark:text-gray-300">{lab.healthMessage}</span>
                          {lab.healthCheckedAt && <span className="text-gray-400 ml-2">({new Date(lab.healthCheckedAt).toLocaleString()})</span>}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Health message detail */}
      {labs.some(l => l.healthMessage) && (
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
          <h3 className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-2">
            <Activity size={14} /> Health Messages
          </h3>
          <div className="space-y-1">
            {labs.filter(l => l.healthMessage).map(l => (
              <div key={l.id} className="flex items-center gap-2 text-xs">
                <HealthDot status={l.healthStatus} />
                <span className="font-medium">{l.name}:</span>
                <span className="text-gray-500 dark:text-gray-400">{l.healthMessage}</span>
                {l.healthCheckedAt && (
                  <span className="text-gray-400 dark:text-gray-500 ml-auto">
                    {new Date(l.healthCheckedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Register Modal */}
      {showRegister && (
        <LabFormModal
          onClose={() => setShowRegister(false)}
          onSave={(data) => registerMut.mutate(data)}
          saving={registerMut.isPending}
        />
      )}

      {/* Edit Modal */}
      {editingLab && (
        <LabFormModal
          initial={editingLab}
          onClose={() => setEditingLab(null)}
          onSave={(data) => {
            // Don't send empty authCredential on edit (keep existing)
            const changes = { ...data };
            if (!changes.authCredential) delete changes.authCredential;
            updateMut.mutate({ id: editingLab.id, data: changes });
          }}
          saving={updateMut.isPending}
        />
      )}
    </div>
  );
}
