import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Globe, Plus, Trash2, Edit2, Play, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, AlertTriangle, CheckCircle, XCircle, History, MessageSquare, Send, Loader } from 'lucide-react';
import { apiRegistry } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';

const AUTH_LABELS = { none: 'None', api_key: 'API Key', bearer: 'Bearer Token' };

// ─── Stat Cards ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color = 'text-gray-900 dark:text-white' }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─── API Form Modal ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  displayName: '',
  description: '',
  mode: 'verify',
  baseUrl: '',
  testUrl: '',
  authType: 'none',
  authKey: '',
  authHeader: '',
  responseFormat: 'json',
  maxResponseBytes: 65536,
  maxRpm: 5,
  maxConcurrent: 1,
  timeoutMs: 30000,
  capabilities: '',
  domains: '',
  promptQuery: '',
  promptInterpret: '',
  promptExtract: '',
  promptNotes: '',
};

const MODE_LABELS = { verify: 'Verify Only', enrich: 'Enrich Only', both: 'Verify + Enrich' };

function ApiFormModal({ initial, onSave, onClose, saving }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(() => {
    if (!initial) return { ...EMPTY_FORM };
    return {
      name: initial.name || '',
      displayName: initial.displayName || '',
      description: initial.description || '',
      mode: initial.mode || 'verify',
      baseUrl: initial.baseUrl || '',
      testUrl: initial.testUrl || '',
      authType: initial.authType || 'none',
      authKey: initial.authKey || '',
      authHeader: initial.authHeader || '',
      responseFormat: initial.responseFormat || 'json',
      maxResponseBytes: initial.maxResponseBytes ?? 65536,
      maxRpm: initial.maxRpm ?? 5,
      maxConcurrent: initial.maxConcurrent ?? 1,
      timeoutMs: initial.timeoutMs ?? 30000,
      capabilities: (initial.capabilities || []).join(', '),
      domains: (initial.domains || []).join(', '),
      promptQuery: initial.promptQuery || '',
      promptInterpret: initial.promptInterpret || '',
      promptExtract: initial.promptExtract || '',
      promptNotes: initial.promptNotes || '',
    };
  });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));
  const setNum = (key) => (e) => setForm(f => ({ ...f, [key]: parseInt(e.target.value, 10) || 0 }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const data = {
      ...form,
      maxResponseBytes: parseInt(form.maxResponseBytes, 10) || 65536,
      maxRpm: parseInt(form.maxRpm, 10) || 5,
      maxConcurrent: parseInt(form.maxConcurrent, 10) || 1,
      timeoutMs: parseInt(form.timeoutMs, 10) || 30000,
      capabilities: form.capabilities ? form.capabilities.split(',').map(s => s.trim()).filter(Boolean) : null,
      domains: form.domains ? form.domains.split(',').map(s => s.trim()).filter(Boolean) : null,
      promptNotes: undefined, // read-only, don't overwrite
    };
    onSave(data);
  };

  const inputClass = "w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-podbit-500 focus:border-transparent";
  const labelClass = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h2 className="text-lg font-bold">{isEdit ? 'Edit API' : 'Add API'}</h2>
          </div>

          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Basic Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Slug Name</label>
                  <input className={inputClass} value={form.name} onChange={set('name')} placeholder="e.g., pubchem" required disabled={isEdit} />
                </div>
                <div>
                  <label className={labelClass}>Display Name</label>
                  <input className={inputClass} value={form.displayName} onChange={set('displayName')} placeholder="e.g., PubChem" required />
                </div>
              </div>
              <div className="mt-3">
                <label className={labelClass}>Description</label>
                <input className={inputClass} value={form.description} onChange={set('description')} placeholder="e.g., Chemical compound database lookup" />
              </div>
              <div className="mt-3">
                <label className={labelClass}>Mode</label>
                <select className={inputClass} value={form.mode} onChange={set('mode')}>
                  <option value="verify">Verify Only — fact-check claims against API responses</option>
                  <option value="enrich">Enrich Only — extract new knowledge from API responses</option>
                  <option value="both">Verify + Enrich — fact-check AND extract new knowledge</option>
                </select>
              </div>
            </div>

            {/* Connection */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Connection</h3>
              <div>
                <label className={labelClass}>Base URL</label>
                <input className={inputClass} value={form.baseUrl} onChange={set('baseUrl')} placeholder="e.g., https://api.example.com/v1" required />
              </div>
              <div className="mt-3">
                <label className={labelClass}>Test URL <span className="font-normal text-gray-400">(optional — known-good endpoint for connectivity checks)</span></label>
                <input className={inputClass} value={form.testUrl} onChange={set('testUrl')} placeholder="e.g., https://api.example.com/v1/compound/name/water/property/MolecularWeight/JSON" />
              </div>
              <div className="grid grid-cols-3 gap-4 mt-3">
                <div>
                  <label className={labelClass}>Auth Type</label>
                  <select className={inputClass} value={form.authType} onChange={set('authType')}>
                    <option value="none">None</option>
                    <option value="api_key">API Key</option>
                    <option value="bearer">Bearer Token</option>
                  </select>
                </div>
                {form.authType !== 'none' && (
                  <>
                    <div>
                      <label className={labelClass}>{form.authType === 'bearer' ? 'Bearer Token' : 'API Key'}</label>
                      <input className={inputClass} type="password" value={form.authKey} onChange={set('authKey')} placeholder="sk-..." />
                    </div>
                    {form.authType === 'api_key' && (
                      <div>
                        <label className={labelClass}>Header Name</label>
                        <input className={inputClass} value={form.authHeader} onChange={set('authHeader')} placeholder="X-Api-Key" />
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className={labelClass}>Response Format</label>
                  <select className={inputClass} value={form.responseFormat} onChange={set('responseFormat')}>
                    <option value="json">JSON</option>
                    <option value="xml">XML</option>
                    <option value="text">Text</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Max Response Bytes</label>
                  <input className={inputClass} type="number" value={form.maxResponseBytes} onChange={setNum('maxResponseBytes')} />
                </div>
              </div>
            </div>

            {/* Rate Limiting */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Rate Limiting</h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Max RPM</label>
                  <input className={inputClass} type="number" value={form.maxRpm} onChange={setNum('maxRpm')} min={0} />
                </div>
                <div>
                  <label className={labelClass}>Max Concurrent</label>
                  <input className={inputClass} type="number" value={form.maxConcurrent} onChange={setNum('maxConcurrent')} min={1} />
                </div>
                <div>
                  <label className={labelClass}>Timeout (ms)</label>
                  <input className={inputClass} type="number" value={form.timeoutMs} onChange={setNum('timeoutMs')} min={1000} step={1000} />
                </div>
              </div>
            </div>

            {/* Scope */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Scope</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Capabilities (comma-separated)</label>
                  <input className={inputClass} value={form.capabilities} onChange={set('capabilities')} placeholder="e.g., compound_lookup, molecular_weight" />
                </div>
                <div>
                  <label className={labelClass}>Domains (comma-separated, empty = all)</label>
                  <input className={inputClass} value={form.domains} onChange={set('domains')} placeholder="e.g., chemistry, biology" />
                </div>
              </div>
            </div>

            {/* Prompts */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Prompts</h3>
              <div className="space-y-4">
                <div>
                  <label className={labelClass}>Query Formulation Prompt</label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Instructs the LLM how to build API requests for this service</p>
                  <textarea className={`${inputClass} h-32 font-mono text-xs`} value={form.promptQuery} onChange={set('promptQuery')} placeholder="e.g., Given a claim, construct an API URL. Available endpoints:&#10;- GET /compound/name/{name}/property/{props}/JSON&#10;- GET /compound/cid/{id}/JSON&#10;Properties: MolecularWeight, MolecularFormula, ..." />
                </div>
                <div>
                  <label className={labelClass}>Response Interpretation Prompt</label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Instructs the LLM how to read and classify API responses</p>
                  <textarea className={`${inputClass} h-32 font-mono text-xs`} value={form.promptInterpret} onChange={set('promptInterpret')} placeholder="e.g., The API returns JSON with PropertyTable.Properties array.&#10;Compare MolecularWeight field against the claimed value.&#10;If compound not found, classify as structural_refutation." />
                </div>
                {(form.mode === 'enrich' || form.mode === 'both') && (
                  <div>
                    <label className={labelClass}>Knowledge Extraction Prompt</label>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Instructs the LLM how to extract new factual claims from API responses</p>
                    <textarea className={`${inputClass} h-32 font-mono text-xs`} value={form.promptExtract} onChange={set('promptExtract')} placeholder="e.g., Extract individual synthesis routes as separate facts.&#10;Include reagents, conditions, and yield percentages.&#10;Each fact should be a standalone statement suitable as a graph node." />
                  </div>
                )}
                {form.promptNotes && (
                  <div>
                    <label className={labelClass}>Onboarding Notes (read-only)</label>
                    <textarea className={`${inputClass} h-24 font-mono text-xs bg-gray-100 dark:bg-gray-950`} value={form.promptNotes} readOnly />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-podbit-600 hover:bg-podbit-700 text-white rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : isEdit ? 'Update API' : 'Create API'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Prompt History Panel ───────────────────────────────────────────────────

function PromptHistoryPanel({ apiId }) {
  const { data: history, isLoading } = useQuery({
    queryKey: ['api-prompt-history', apiId],
    queryFn: () => apiRegistry.promptHistory(apiId),
    enabled: !!apiId,
  });

  if (isLoading) return <p className="text-sm text-gray-400 p-3">Loading history...</p>;
  if (!history || history.length === 0) return <p className="text-sm text-gray-400 p-3">No prompt changes recorded yet.</p>;

  // Group by field
  const byField = {};
  for (const h of history) {
    if (!byField[h.prompt_field]) byField[h.prompt_field] = [];
    byField[h.prompt_field].push(h);
  }

  const fieldLabels = {
    prompt_query: 'Query Formulation',
    prompt_interpret: 'Response Interpretation',
    prompt_extract: 'Knowledge Extraction',
    prompt_notes: 'Onboarding Notes',
  };

  return (
    <div className="space-y-4 p-3">
      {Object.entries(byField).map(([field, versions]) => (
        <div key={field}>
          <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">{fieldLabels[field] || field}</h4>
          <div className="space-y-2">
            {versions.map((v) => (
              <div key={v.id} className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-xs">
                <div className="flex justify-between text-gray-500 dark:text-gray-400 mb-1">
                  <span>v{v.version} by {v.contributor || 'unknown'}</span>
                  <span>{new Date(v.created_at).toLocaleString()}</span>
                </div>
                {v.reason && <p className="text-gray-600 dark:text-gray-300 italic mb-1">{v.reason}</p>}
                <pre className="whitespace-pre-wrap text-gray-700 dark:text-gray-200 max-h-24 overflow-y-auto">{v.content}</pre>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── API Card ───────────────────────────────────────────────────────────────

function ApiCard({ api, onEdit, onDelete, onToggle }) {
  const [expanded, setExpanded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showClaimTest, setShowClaimTest] = useState(false);
  const [claimInput, setClaimInput] = useState('');
  const [claimTesting, setClaimTesting] = useState(false);
  const [claimResult, setClaimResult] = useState(null);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiRegistry.test(api.id);
      setTestResult(result);
    } catch (err) {
      setTestResult({ success: false, error: err.message });
    }
    setTesting(false);
  };

  const handleTestClaim = async () => {
    if (!claimInput.trim()) return;
    setClaimTesting(true);
    setClaimResult(null);
    try {
      const result = await apiRegistry.testClaim(api.id, claimInput.trim());
      setClaimResult(result);
    } catch (err) {
      setClaimResult({ success: false, error: err.message });
    }
    setClaimTesting(false);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold truncate">{api.displayName}</h3>
              <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">{api.name}</span>
              {api.mode && api.mode !== 'verify' && (
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                  api.mode === 'both'
                    ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                }`}>
                  {MODE_LABELS[api.mode] || api.mode}
                </span>
              )}
              <button
                onClick={() => onToggle(api.id, !api.enabled)}
                title={api.enabled ? 'Disable' : 'Enable'}
                className="ml-auto"
              >
                {api.enabled
                  ? <ToggleRight size={22} className="text-green-500" />
                  : <ToggleLeft size={22} className="text-gray-400" />
                }
              </button>
            </div>
            {api.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{api.description}</p>
            )}
          </div>
        </div>

        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 font-mono truncate">{api.baseUrl}</div>

        <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>Auth: <strong className="text-gray-700 dark:text-gray-300">{AUTH_LABELS[api.authType] || api.authType}</strong></span>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <span>RPM: <strong className="text-gray-700 dark:text-gray-300">{api.maxRpm}</strong></span>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <span>Timeout: <strong className="text-gray-700 dark:text-gray-300">{(api.timeoutMs / 1000).toFixed(0)}s</strong></span>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <span>Calls: <strong className="text-gray-700 dark:text-gray-300">{api.totalCalls}</strong></span>
          {api.totalErrors > 0 && (
            <>
              <span className="text-gray-300 dark:text-gray-700">|</span>
              <span>Errors: <strong className="text-red-500">{api.totalErrors}</strong></span>
            </>
          )}
        </div>

        {/* Prompts preview */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-podbit-600 dark:text-podbit-400 hover:underline"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? 'Hide prompts' : 'Show prompts'}
        </button>

        {expanded && (
          <div className="mt-3 space-y-3">
            {api.promptQuery && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Query Formulation</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">{api.promptQuery}</pre>
              </div>
            )}
            {api.promptInterpret && (
              <div>
                <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Response Interpretation</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">{api.promptInterpret}</pre>
              </div>
            )}
            {api.promptExtract && (
              <div>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Knowledge Extraction</p>
                <pre className="text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono">{api.promptExtract}</pre>
              </div>
            )}
            {!api.promptQuery && !api.promptInterpret && (
              <p className="text-xs text-gray-400 italic">No prompts configured yet. Edit this API to add prompts.</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2 border-t border-gray-100 dark:border-gray-800 pt-3">
          <button onClick={() => onEdit(api)} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-podbit-600 dark:hover:text-podbit-400">
            <Edit2 size={14} /> Edit
          </button>
          <button onClick={handleTest} disabled={testing} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 disabled:opacity-50">
            <Play size={14} /> {testing ? 'Testing...' : 'Test'}
          </button>
          <button onClick={() => { setShowClaimTest(!showClaimTest); setClaimResult(null); }} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400">
            <AlertTriangle size={14} /> Test Claim
          </button>
          <button onClick={() => setShowHistory(!showHistory)} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400">
            <History size={14} /> Prompt History
          </button>
          <button onClick={() => onDelete(api.id, api.displayName)} className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 ml-auto">
            <Trash2 size={14} /> Delete
          </button>
        </div>

        {/* Test connectivity result */}
        {testResult && (
          <div className={`mt-3 p-3 rounded text-xs ${testResult.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
            <div className="flex items-center gap-1 font-medium mb-1">
              {testResult.success ? <CheckCircle size={14} /> : <XCircle size={14} />}
              {testResult.success ? `Reachable (HTTP ${testResult.status}) — ${testResult.responseTimeMs}ms` : `Failed: ${testResult.error || `HTTP ${testResult.status}`}`}
            </div>
            {testResult.note && <p className="text-xs opacity-75 mb-1">{testResult.note}</p>}
            {testResult.testUrl && testResult.testUrl !== api.baseUrl && (
              <p className="text-xs opacity-60 font-mono truncate">Tested: {testResult.testUrl}</p>
            )}
            {testResult.bodyPreview && (
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono opacity-75">{testResult.bodyPreview}</pre>
            )}
          </div>
        )}

        {/* Test with Claim — end-to-end pipeline test */}
        {showClaimTest && (
          <div className="mt-3 p-3 bg-purple-50 dark:bg-purple-900/10 rounded border border-purple-200 dark:border-purple-800">
            <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-2">End-to-end pipeline test: claim → query → API call → interpretation</p>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-white dark:bg-gray-800 border border-purple-300 dark:border-purple-700 rounded px-2 py-1.5 text-xs focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                value={claimInput}
                onChange={e => setClaimInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleTestClaim()}
                placeholder="e.g., Water has a molecular weight of 18.015 g/mol"
                disabled={claimTesting}
              />
              <button
                onClick={handleTestClaim}
                disabled={claimTesting || !claimInput.trim()}
                className="px-3 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded disabled:opacity-50 flex items-center gap-1"
              >
                {claimTesting ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
                Run
              </button>
            </div>
            {claimResult && (
              <div className={`mt-2 p-2 rounded text-xs ${
                claimResult.success
                  ? claimResult.impact === 'structural_refutation' ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : claimResult.impact === 'value_correction' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                    : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                  : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
              }`}>
                {claimResult.success ? (
                  <>
                    <div className="flex items-center gap-2 font-medium mb-1">
                      {claimResult.impact === 'structural_validation' && <><CheckCircle size={14} /> Validated</>}
                      {claimResult.impact === 'value_correction' && <><AlertTriangle size={14} /> Value Correction</>}
                      {claimResult.impact === 'structural_refutation' && <><XCircle size={14} /> Refuted</>}
                      <span className="font-normal opacity-75">({(claimResult.confidence * 100).toFixed(0)}% confidence)</span>
                    </div>
                    <p className="mb-1">{claimResult.evidenceSummary}</p>
                    {claimResult.corrections?.length > 0 && (
                      <div className="mt-1 space-y-1">
                        {claimResult.corrections.map((c, i) => (
                          <div key={i} className="font-mono">{c.oldValue} → {c.newValue} <span className="opacity-60">({c.source})</span></div>
                        ))}
                      </div>
                    )}
                    {claimResult.steps?.query && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs opacity-60 hover:opacity-100">Pipeline details</summary>
                        <div className="mt-1 space-y-1 text-xs font-mono opacity-75">
                          <div>URL: {claimResult.steps.query.method} {claimResult.steps.query.url}</div>
                          {claimResult.steps.call && <div>Response: HTTP {claimResult.steps.call.status} ({claimResult.steps.call.responseTimeMs}ms)</div>}
                        </div>
                      </details>
                    )}
                  </>
                ) : (
                  <div className="flex items-center gap-1 font-medium">
                    <XCircle size={14} /> {claimResult.error}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Prompt history panel */}
      {showHistory && (
        <div className="border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
          <PromptHistoryPanel apiId={api.id} />
        </div>
      )}
    </div>
  );
}

// ─── Onboard Interview Modal ────────────────────────────────────────────────

function OnboardModal({ onClose, onComplete }) {
  const [step, setStep] = useState('name'); // name | interview | done
  const [name, setName] = useState('');
  const [interviewId, setInterviewId] = useState(null);
  const [messages, setMessages] = useState([]); // { role, content }
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [createdApi, setCreatedApi] = useState(null);

  const startInterview = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRegistry.startOnboard(name.trim());
      if (result.status === 'error') {
        setError(result.error);
      } else {
        setInterviewId(result.interviewId);
        setMessages([{ role: 'assistant', content: result.question }]);
        setStep('interview');
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const sendResponse = async () => {
    if (!input.trim() || !interviewId) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', content: userMsg }]);
    setLoading(true);
    setError(null);
    try {
      const result = await apiRegistry.continueOnboard(interviewId, userMsg);
      if (result.status === 'error') {
        setError(result.error);
      } else if (result.status === 'complete') {
        setCreatedApi(result.api);
        setStep('done');
        onComplete?.();
      } else {
        setMessages(m => [...m, { role: 'assistant', content: result.question }]);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
    setLoading(false);
  };

  const inputClass = "w-full bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-sm focus:ring-2 focus:ring-podbit-500 focus:border-transparent";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <MessageSquare size={18} className="text-podbit-600 dark:text-podbit-400" />
          <h2 className="text-lg font-bold">Onboard API via Interview</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {step === 'name' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                The interview will walk through configuring a new external API — discovering its endpoints,
                response format, and generating the query formulation and interpretation prompts automatically.
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">API Slug Name</label>
                <input
                  className={inputClass}
                  value={name}
                  onChange={e => setName(e.target.value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, ''))}
                  placeholder="pubchem"
                  onKeyDown={e => e.key === 'Enter' && startInterview()}
                  autoFocus
                />
                <p className="text-xs text-gray-400 mt-1">Lowercase slug — spaces become hyphens automatically.</p>
              </div>
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          )}

          {step === 'interview' && (
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-podbit-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                  }`}>
                    <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2">
                    <Loader size={16} className="animate-spin text-gray-400" />
                  </div>
                </div>
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
            </div>
          )}

          {step === 'done' && (
            <div className="text-center py-8">
              <CheckCircle size={48} className="mx-auto text-green-500 mb-3" />
              <h3 className="text-lg font-semibold">API Created Successfully</h3>
              {createdApi && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                  <strong>{createdApi.displayName}</strong> ({createdApi.name}) has been added to the registry with generated prompts.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          {step === 'name' && (
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400">Cancel</button>
              <button onClick={startInterview} disabled={loading || !name.trim()} className="px-4 py-2 text-sm bg-podbit-600 hover:bg-podbit-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2">
                {loading ? <Loader size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                Start Interview
              </button>
            </div>
          )}
          {step === 'interview' && (
            <div className="flex gap-2">
              <input
                className={`${inputClass} flex-1`}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendResponse()}
                placeholder="Type your response..."
                disabled={loading}
                autoFocus
              />
              <button onClick={sendResponse} disabled={loading || !input.trim()} className="px-3 py-2 bg-podbit-600 hover:bg-podbit-700 text-white rounded-lg disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
          )}
          {step === 'done' && (
            <div className="flex justify-end">
              <button onClick={onClose} className="px-4 py-2 text-sm bg-podbit-600 hover:bg-podbit-700 text-white rounded-lg">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

/** API Registry page: external APIs for lab verification, onboard, and test. */
export default function ApiRegistry() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const [formOpen, setFormOpen] = useState(false);
  const [editingApi, setEditingApi] = useState(null);
  const [onboardOpen, setOnboardOpen] = useState(false);

  // Data
  const { data: apis = [], isLoading: apisLoading } = useQuery({
    queryKey: ['api-registry'],
    queryFn: apiRegistry.list,
  });

  const { data: stats } = useQuery({
    queryKey: ['api-registry-stats'],
    queryFn: () => apiRegistry.stats(),
    staleTime: 30000,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data) => apiRegistry.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-registry'] });
      queryClient.invalidateQueries({ queryKey: ['api-registry-stats'] });
      setFormOpen(false);
      setEditingApi(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => apiRegistry.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-registry'] });
      queryClient.invalidateQueries({ queryKey: ['api-registry-stats'] });
      setFormOpen(false);
      setEditingApi(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => enabled ? apiRegistry.enable(id) : apiRegistry.disable(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['api-registry'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => apiRegistry.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-registry'] });
      queryClient.invalidateQueries({ queryKey: ['api-registry-stats'] });
    },
  });

  const handleSave = (data) => {
    if (editingApi?.id) {
      updateMutation.mutate({ id: editingApi.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (api) => {
    setEditingApi(api);
    setFormOpen(true);
  };

  const handleDelete = async (id, name) => {
    const ok = await confirm({
      title: 'Delete API',
      message: `Delete "${name}"?\n\nThis will also remove its prompt history. Verification records are preserved.`,
      confirmLabel: 'Delete',
    });
    if (ok) deleteMutation.mutate(id);
  };

  const handleToggle = (id, enabled) => {
    toggleMutation.mutate({ id, enabled });
  };

  const enabledCount = apis.filter(a => a.enabled).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {ConfirmDialogEl}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe size={24} className="text-podbit-600 dark:text-podbit-400" />
          <div>
            <h1 className="text-xl font-bold">API Verification Registry</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">External APIs for pre-lab factual verification and enrichment</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setOnboardOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-lg"
          >
            <MessageSquare size={16} /> Onboard
          </button>
          <button
            onClick={() => { setEditingApi(null); setFormOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-podbit-600 hover:bg-podbit-700 text-white text-sm rounded-lg"
          >
            <Plus size={16} /> Add API
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total APIs" value={apis.length} />
        <StatCard label="Enabled" value={enabledCount} color={enabledCount > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-400'} />
        <StatCard label="Total Calls" value={stats?.total ?? 0} />
        <StatCard label="Corrections" value={stats?.corrections ?? 0} color="text-amber-600 dark:text-amber-400" />
        <StatCard label="Validations" value={stats?.validations ?? 0} color="text-green-600 dark:text-green-400" />
        <StatCard label="Refutations" value={stats?.refutations ?? 0} color="text-red-600 dark:text-red-400" />
        {(stats?.enrichments ?? 0) > 0 && (
          <StatCard label="Enrichments" value={stats.enrichments} color="text-purple-600 dark:text-purple-400" sub="nodes created" />
        )}
      </div>

      {/* API Cards */}
      <div className="space-y-4">
        {apisLoading ? (
          <p className="text-gray-400 text-sm py-8 text-center">Loading APIs...</p>
        ) : apis.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Globe size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-lg font-medium">No APIs registered</p>
            <p className="text-sm mt-1">Add an external API to enable pre-lab factual verification.</p>
          </div>
        ) : (
          apis.map(api => (
            <ApiCard
              key={api.id}
              api={api}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))
        )}
      </div>

      {/* Form Modal */}
      {formOpen && (
        <ApiFormModal
          initial={editingApi}
          onSave={handleSave}
          onClose={() => { setFormOpen(false); setEditingApi(null); }}
          saving={createMutation.isPending || updateMutation.isPending}
        />
      )}

      {onboardOpen && (
        <OnboardModal
          onClose={() => setOnboardOpen(false)}
          onComplete={() => {
            queryClient.invalidateQueries({ queryKey: ['api-registry'] });
            queryClient.invalidateQueries({ queryKey: ['api-registry-stats'] });
          }}
        />
      )}
    </div>
  );
}
