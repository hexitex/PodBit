import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, RefreshCw, Search, Check, X, Edit2, Zap, Server, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { models, database, configApi, labRegistry } from '../lib/api';
import { getModelProvider } from '../lib/model-utils';
import { useConfirmDialog } from '../components/ConfirmDialog';
import AutoTuneDialog from '../components/AutoTuneDialog';
import { PageRelationshipBanner, PromptLink, ConfigLink } from '../components/RelatedLinks';
import { SUBSYSTEM_MAP, SUPER_GROUPS, SUBSYSTEM_TO_GROUP } from '../lib/subsystem-map';
import { useScrollToHash } from '../lib/useScrollToHash';

function ModelSuperGroup({ title, description, children }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="mb-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 tracking-wide">{title}</h3>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
        </div>
        {isOpen
          ? <ChevronDown size={18} className="text-gray-400 shrink-0" />
          : <ChevronRight size={18} className="text-gray-400 shrink-0" />
        }
      </button>
      {isOpen && (
        <div className="mt-3">
          {children}
        </div>
      )}
    </div>
  );
}

const PROVIDERS = [
  { value: 'lmstudio', label: 'LM Studio' },
  { value: 'local', label: 'Ollama' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI Compatible' },
];

const SUBSYSTEMS = [
  { key: 'voice', label: 'Voice', description: 'On-demand voicing (MCP)', tier: 'frontier' },
  { key: 'chat', label: 'Chat', description: 'GUI chat responses', tier: 'frontier' },
  { key: 'research', label: 'Research', description: 'Autonomous domain researcher', tier: 'frontier' },
  { key: 'docs', label: 'Docs', description: 'Document generation', tier: 'frontier' },
  { key: 'tuning_judge', label: 'Tuning Judge', description: 'Gold standard reference responses', tier: 'frontier' },
  { key: 'breakthrough_check', label: 'Breakthrough Check', description: 'Novelty gate for auto-promotion — skeptical frontier check', tier: 'frontier' },
  { key: 'synthesis', label: 'Synthesis', description: 'Orchestration only — delegates generation to voice', tier: 'medium' },
  { key: 'compress', label: 'Compress', description: 'Summarize / compress', tier: 'medium' },
  { key: 'config_tune', label: 'Config Tune', description: 'Parameter tuning suggestions', tier: 'medium' },
  { key: 'reader_text', label: 'KB: Text', description: 'Text/markdown/config file reader', tier: 'medium' },
  { key: 'reader_pdf', label: 'KB: PDF', description: 'PDF document reader', tier: 'medium' },
  { key: 'reader_doc', label: 'KB: Doc', description: 'Word/OpenDoc reader', tier: 'medium' },
  { key: 'reader_image', label: 'KB: Image', description: 'Image describer (needs vision model)', tier: 'medium' },
  { key: 'reader_sheet', label: 'KB: Sheet', description: 'Spreadsheet reader (xlsx/ods)', tier: 'medium' },
  { key: 'reader_code', label: 'KB: Code', description: 'Source code reader', tier: 'medium' },
  { key: 'context', label: 'Context', description: 'History compression', tier: 'small' },
  { key: 'keyword', label: 'Keyword', description: 'Domain synonyms & node keywords', tier: 'small' },
  { key: 'dedup_judge', label: 'Dedup Judge', description: 'Borderline duplicate detection', tier: 'small' },
  { key: 'autorating', label: 'Autorating', description: 'Automatic node quality rating', tier: 'small' },
  { key: 'proxy', label: 'Proxy', description: 'Knowledge-enriched proxy', tier: 'small' },
  { key: 'spec_extraction', label: 'Spec Extraction', description: 'Extracts experiment specifications from claims — the one auditable bias surface in verification', tier: 'medium' },
  { key: 'spec_review', label: 'Spec Review', description: 'Adversarial falsifiability check — detects cherry-picked parameters that guarantee a predetermined outcome', tier: 'medium' },
  { key: 'evm_analysis', label: 'Post-Rejection Analysis', description: 'LLM investigates why a claim was refuted by lab experiments', tier: 'frontier' },
  { key: 'evm_guidance', label: 'Guidance & Decompose', description: 'Diagnose failed verifications and suggest retries. Powers claim decomposition.', tier: 'frontier' },
  { key: 'api_verification', label: 'API Verification', description: 'Decision, query formulation, and interpretation for external API verification', tier: 'medium' },
  { key: 'elite_mapping', label: 'Elite Mapping', description: 'Elite pool content synthesis and manifest mapping', tier: 'medium' },
  { key: 'ground_rules', label: 'Ground Rules', description: 'Synthesizability classification — filters non-synthesizable nodes from the graph', tier: 'small' },
  { key: 'population_control', label: 'Population Control', description: 'Post-birth culling — evaluates nodes against parents and demotes or archives weak ones', tier: 'medium' },
  { key: 'lab_routing', label: 'Lab Routing', description: 'Selects the best lab server when multiple labs support a spec type — uses capabilities, queue depth, health, and priority', tier: 'medium' },
  { key: 'embedding', label: 'Embedding', description: 'Vector embeddings (also used by embedding eval layer)', tier: 'dedicated' },
];

const TIER_BADGES = {
  frontier: { label: 'Frontier', style: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30' },
  medium: { label: 'Medium', style: 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30' },
  small: { label: 'Small', style: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30' },
  dedicated: { label: 'Dedicated', style: 'text-sky-600 dark:text-sky-400 bg-sky-100 dark:bg-sky-900/30' },
};

function ProviderBadge({ modelId }) {
  const label = getModelProvider(modelId);
  return (
    <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
      {label}
    </span>
  );
}

// ─── Shared UI helpers ───────────────────────────────────────────────────────

const INPUT_CLS = 'w-full border rounded px-3 py-1.5 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-gray-200';
const LABEL_CLS = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

function FormField({ label, hint, children, ...inputProps }) {
  return (
    <div>
      <label className={LABEL_CLS}>
        {label}{hint && <span className="text-gray-400 font-normal"> {hint}</span>}
      </label>
      {children ?? <input className={INPUT_CLS} {...inputProps} />}
    </div>
  );
}

function FormSelect({ label, hint, children, ...selectProps }) {
  return (
    <div>
      <label className={LABEL_CLS}>
        {label}{hint && <span className="text-gray-400 font-normal"> {hint}</span>}
      </label>
      <select className={INPUT_CLS} {...selectProps}>{children}</select>
    </div>
  );
}

function RangeField({ label, value, min, max, step, onChange, minLabel, maxLabel }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}: {value}</label>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} className="w-full" />
      <div className="flex justify-between text-xs text-gray-400">
        <span>{minLabel ?? min}</span><span>{maxLabel ?? max}</span>
      </div>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">{title}</p>
      {children}
    </div>
  );
}

function StatRow({ label, value, valueClass }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

// ─── Conversational Logging Toggle ───────────────────────────────────────────

function ConvLoggingToggle() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['models', 'conv-logging'],
    queryFn: models.convLogging,
  });

  const mutation = useMutation({
    mutationFn: (enabled) => models.setConvLogging(enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['models', 'conv-logging'] }),
  });

  if (isLoading || !data) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <h2 className="text-lg font-semibold mb-3">Diagnostics</h2>
      <label className="flex items-center gap-3 text-sm">
        <input
          type="checkbox"
          checked={data.enabled}
          onChange={(e) => mutation.mutate(e.target.checked)}
          disabled={mutation.isPending}
        />
        <div>
          <span className="font-medium">Conversational Logging</span>
          <p className="text-xs text-gray-400 mt-0.5">
            Log full LLM request/response payloads to <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">data/logs/</code>. Use to verify noThink, inspect prompts, and debug model calls.
          </p>
        </div>
      </label>
    </div>
  );
}

// ─── Model Health (Provider Status) ─────────────────────────────────────────

function ModelHealth() {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['models', 'health'],
    queryFn: models.health,
  });

  if (isLoading) return <div className="text-sm text-gray-500 dark:text-gray-400">Checking models...</div>;
  if (error) return <div className="text-sm text-red-500">Failed to check models</div>;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Provider Status</h2>
        <button onClick={() => refetch()} disabled={isFetching} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
          <RotateCcw size={16} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="space-y-3">
        {Object.entries(data || {}).filter(([name]) => !name.startsWith('_')).map(([name, status]) => (
          <div key={name} className="flex items-center justify-between">
            <span className="text-sm">{name}</span>
            <span
              className={`text-sm px-2 py-1 rounded ${
                status === 'ok'
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}
            >
              {status === 'ok' ? 'Online' : status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Embedding Status ───────────────────────────────────────────────────────

function EmbeddingStatus() {
  const { data, isLoading } = useQuery({
    queryKey: ['database', 'embeddings', 'status'],
    queryFn: database.embeddingStatus,
  });

  if (isLoading || !data) return null;

  const needsAction = data.needsReEmbed > 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <h2 className="text-lg font-semibold mb-4">Embedding Status</h2>

      <div className="space-y-3">
        <StatRow label="Current Model" value={<span className="font-mono">{data.currentModel}</span>} />
        <StatRow label="Dimensions" value={<span className="font-mono">{data.currentDimensions}</span>} />
        <StatRow label="Total Embedded" value={data.totalWithEmbeddings} />
        <StatRow label="Up-to-date" value={data.currentModelCount} valueClass="text-green-600" />
        {data.legacyCount > 0 && <StatRow label="Legacy (no provenance)" value={data.legacyCount} valueClass="text-yellow-600" />}
        {data.staleCount > 0 && <StatRow label="Stale (wrong model)" value={data.staleCount} valueClass="text-red-600" />}
      </div>

      {data.byModel?.length > 1 && (
        <div className="mt-4 pt-3 border-t">
          <p className="text-xs text-gray-500 mb-2">By Model</p>
          <div className="space-y-1">
            {data.byModel.map((m) => (
              <div key={`${m.model}-${m.dimensions}`} className="flex justify-between text-xs">
                <span className={`font-mono ${m.model === data.currentModel ? 'text-green-600' : 'text-gray-500'}`}>
                  {m.model} ({m.dimensions || '?'}d)
                </span>
                <span>{m.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {needsAction && (
        <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
          <p className="text-xs text-yellow-700 dark:text-yellow-300">
            <strong>{data.needsReEmbed}</strong> nodes need re-embedding.
            Run: <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">npx tsx tools/re-embed.ts</code>
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Add / Edit Model Form ───────────────────────────────────────────────────

function ModelForm({ initial, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    provider: initial?.provider || 'lmstudio',
    modelId: initial?.modelId || '',
    endpointUrl: initial?.endpointUrl || '',
    apiKey: initial?.apiKey || '',
    maxTokens: initial?.maxTokens ?? '',
    contextSize: initial?.contextSize ?? '',
    costPer1k: initial?.costPer1k ?? 0,
    inputCostPerMtok: initial?.inputCostPerMtok ?? 0,
    outputCostPerMtok: initial?.outputCostPerMtok ?? 0,
    toolCostPerMtok: initial?.toolCostPerMtok ?? 0,
    sortOrder: initial?.sortOrder ?? 0,
    enabled: initial?.enabled !== false,
    maxRetries: initial?.maxRetries ?? 3,
    retryWindowMinutes: initial?.retryWindowMinutes ?? 2,
    maxConcurrency: initial?.maxConcurrency ?? 1,
    requestPauseMs: initial?.requestPauseMs ?? 0,
    requestTimeout: initial?.requestTimeout ?? 180,
    rateLimitBackoffMs: initial?.rateLimitBackoffMs ?? 120000,
    tier: initial?.tier || 'medium',
    noThink: initial?.noThink ?? false,
    supportsTools: initial?.supportsTools !== false, // default true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      endpointUrl: form.endpointUrl || null,
      apiKey: form.apiKey || null,
      maxTokens: form.maxTokens === '' ? null : Number(form.maxTokens),
      contextSize: form.contextSize === '' ? null : Number(form.contextSize),
      costPer1k: Number(form.costPer1k),
      inputCostPerMtok: Number(form.inputCostPerMtok),
      outputCostPerMtok: Number(form.outputCostPerMtok),
      toolCostPerMtok: Number(form.toolCostPerMtok),
      sortOrder: Number(form.sortOrder),
      maxRetries: Number(form.maxRetries),
      retryWindowMinutes: Number(form.retryWindowMinutes),
      maxConcurrency: Number(form.maxConcurrency),
      requestPauseMs: Number(form.requestPauseMs),
      requestTimeout: Number(form.requestTimeout),
      rateLimitBackoffMs: Number(form.rateLimitBackoffMs),
      tier: form.tier,
      noThink: !!form.noThink,
      supportsTools: !!form.supportsTools,
    });
  };

  const f = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  const fc = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.checked }));

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Display Name" type="text" value={form.name} onChange={f('name')} placeholder="e.g. Claude 3.5 Sonnet" required />
        <FormField label="Model ID" type="text" value={form.modelId} onChange={f('modelId')} placeholder="e.g. claude-3-5-sonnet-20241022" required />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <FormSelect label="Provider" value={form.provider} onChange={f('provider')}>
          {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </FormSelect>
        <FormSelect label="Tier" value={form.tier} onChange={f('tier')}>
          <option value="medium">Medium</option>
          <option value="frontier">Frontier</option>
        </FormSelect>
        <FormField label="Sort Order" type="number" value={form.sortOrder} onChange={f('sortOrder')} min="0" title="Lower = tried first" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Endpoint URL" hint="(optional)" type="text" value={form.endpointUrl} onChange={f('endpointUrl')} placeholder="Leave empty for provider default" />
        <FormField label="API Key" hint="(optional)" type="password" value={form.apiKey} onChange={f('apiKey')} placeholder="Per-model key (overrides provider key)" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Max Tokens" hint="(opt)" type="number" value={form.maxTokens} onChange={f('maxTokens')} placeholder="Auto" />
          <FormField label="Context Size" hint="(opt)" type="number" value={form.contextSize} onChange={f('contextSize')} placeholder="e.g. 8192" title="Model context window in tokens — used by proxy to budget knowledge injection" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Max Retries" type="number" min="1" value={form.maxRetries} onChange={f('maxRetries')} title="Maximum number of retry attempts when a model call fails" />
          <FormField label="Retry Window (min)" type="number" min="0.1" step="0.1" value={form.retryWindowMinutes} onChange={f('retryWindowMinutes')} title="Total time window in minutes for all retry attempts" />
          <FormField label="Max Concurrency" type="number" min="1" max="10" value={form.maxConcurrency} onChange={f('maxConcurrency')} title="Maximum simultaneous API calls. Set to 1 for models that only allow 1 connection (e.g. GLM 4.7)" />
          <FormField label="Request Pause (ms)" type="number" min="0" max="60000" step="100" value={form.requestPauseMs} onChange={f('requestPauseMs')} title="Minimum pause between consecutive API calls to this model (milliseconds). Prevents rate limiting. 0 = no pause." />
          <FormField label="Request Timeout (s)" type="number" min="10" max="600" value={form.requestTimeout} onChange={f('requestTimeout')} title="Per-request fetch timeout in seconds. Increase for slow endpoints or complex codegen tasks" />
          <FormField label="Rate Limit Backoff (ms)" type="number" min="1000" max="3600000" step="1000" value={form.rateLimitBackoffMs} onChange={f('rateLimitBackoffMs')} title="Default wait time (ms) after a rate-limit (429) error when the provider does not specify how long to wait. Default 120000 = 2 minutes." />
        </div>
      </div>

      {/* Token Cost Rates (per million tokens) */}
      <div>
        <label className={LABEL_CLS}>Token Costs <span className="text-gray-400 font-normal">($ per million tokens)</span></label>
        <div className="grid grid-cols-3 gap-3">
          {[
            { key: 'inputCostPerMtok', label: 'Input', title: 'Cost per million input tokens' },
            { key: 'outputCostPerMtok', label: 'Output', title: 'Cost per million output tokens' },
            { key: 'toolCostPerMtok', label: 'Tool Cost', title: 'Cost per million tool call tokens' },
          ].map(({ key, label, title }) => (
            <div key={key}>
              <input type="number" step="0.01" min="0" value={form[key]} onChange={f(key)} className={INPUT_CLS} placeholder="0" title={title} />
              <span className="text-xs text-gray-400 mt-0.5 block">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-4">
          {[
            { key: 'enabled', label: 'Enabled', title: undefined },
            { key: 'noThink', label: 'No Think', title: 'Strip <think> blocks from reasoning model output (DeepSeek R1, QwQ, Qwen3, etc.) and skip reasoning token bonus' },
            { key: 'supportsTools', label: 'Tools', title: 'Model supports OpenAI-style tool/function calling. Uncheck to strip tool definitions from proxy requests.' },
          ].map(({ key, label, title }) => (
            <label key={key} className="flex items-center gap-2 text-sm" title={title}>
              <input type="checkbox" checked={form[key]} onChange={fc(key)} />
              {label}
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">
            Cancel
          </button>
          <button type="submit" className="px-4 py-1.5 text-sm bg-podbit-600 text-white rounded hover:bg-podbit-700">
            {initial ? 'Update' : 'Add Model'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ─── Model Registry Table ────────────────────────────────────────────────────

function ModelRegistry() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [testingId, setTestingId] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [showDiscover, setShowDiscover] = useState(false);
  const { confirm, ConfirmDialogEl } = useConfirmDialog();

  const { data: registeredModels = [], isLoading } = useQuery({
    queryKey: ['models', 'registry'],
    queryFn: models.registry,
  });

  const addMutation = useMutation({
    mutationFn: models.registerModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      setShowForm(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => models.updateModel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: models.deleteModel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
    },
  });

  const handleTest = async (id) => {
    setTestingId(id);
    try {
      const result = await models.testModel(id);
      setTestResults(prev => ({ ...prev, [id]: result }));
    } catch {
      setTestResults(prev => ({ ...prev, [id]: { status: 'error', message: 'Request failed' } }));
    }
    setTestingId(null);
  };

  const _editingModel = editingId ? registeredModels.find(m => m.id === editingId) : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold">Model Registry</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">All configured LLMs. Models are grouped into tiers and tried in priority order.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowDiscover(!showDiscover)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm border dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <Search size={14} /> Discover
          </button>
          <button
            onClick={() => { setShowForm(true); setEditingId(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-podbit-600 text-white rounded hover:bg-podbit-700"
          >
            <Plus size={14} /> Add Model
          </button>
        </div>
      </div>

      {showDiscover && <DiscoverPanel onAdd={(data) => { addMutation.mutate(data); }} onClose={() => setShowDiscover(false)} />}

      {showForm && !editingId && (
        <div className="mb-4">
          <ModelForm onSave={(data) => addMutation.mutate(data)} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      ) : registeredModels.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No models registered. Add one or use Auto-Discover.</p>
      ) : (
        <div className="space-y-2">
          {registeredModels.map(model => (
            <div key={model.id}>
              {editingId === model.id ? (
                <ModelForm
                  initial={model}
                  onSave={(data) => updateMutation.mutate({ id: model.id, data })}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className={`flex items-center justify-between p-3 rounded-lg border ${
                  model.enabled ? 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700' : 'bg-gray-50 dark:bg-gray-800 border-gray-100 dark:border-gray-700 opacity-60'
                }`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex-shrink-0">
                      {testResults[model.id]?.status === 'ok' ? (
                        <span className="text-green-500 text-lg">●</span>
                      ) : testResults[model.id]?.status === 'error' ? (
                        <span className="text-red-500 text-lg" title={testResults[model.id].message}>●</span>
                      ) : (
                        <span className="text-gray-300 text-lg">●</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">{model.name}</span>
                        <ProviderBadge modelId={model.modelId} />
                        {model.tier && TIER_BADGES[model.tier] && (
                          <span className={`text-[0.6rem] px-1.5 py-0.5 rounded-full font-medium ${TIER_BADGES[model.tier].style}`}>
                            {TIER_BADGES[model.tier].label}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 truncate">{model.modelId}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => handleTest(model.id)}
                      disabled={testingId === model.id}
                      className="p-1.5 text-gray-400 hover:text-green-600 disabled:opacity-50"
                      title="Test model"
                    >
                      {testingId === model.id ? (
                        <RefreshCw size={14} className="animate-spin" />
                      ) : (
                        <Zap size={14} />
                      )}
                    </button>
                    <button
                      onClick={() => setEditingId(model.id)}
                      className="p-1.5 text-gray-400 hover:text-blue-600"
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Delete Model',
                          message: `Delete "${model.name}"?\n\nThis will remove the model from the registry. Any subsystem assignments using this model will need to be reassigned.`,
                          confirmLabel: 'Delete',
                        });
                        if (ok) deleteMutation.mutate(model.id);
                      }}
                      className="p-1.5 text-gray-400 hover:text-red-600"
                      title="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {ConfirmDialogEl}
    </div>
  );
}

// ─── Auto-Discover Panel ─────────────────────────────────────────────────────

function DiscoverPanel({ onAdd, onClose }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['models', 'available'],
    queryFn: models.available,
  });

  const { data: registered = [] } = useQuery({
    queryKey: ['models', 'registry'],
    queryFn: models.registry,
  });

  const registeredIds = new Set(registered.map(m => m.modelId));

  const allModels = [];
  if (data) {
    for (const [provider, list] of Object.entries(data)) {
      if (provider.endsWith('Error') || !Array.isArray(list)) continue;
      for (const m of list) {
        if (m.type === 'embedding') continue;
        allModels.push({ ...m, provider });
      }
    }
  }

  return (
    <div className="mb-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300">Discovered Models</h3>
        <button onClick={onClose} className="text-blue-400 hover:text-blue-600"><X size={16} /></button>
      </div>

      {isLoading && <p className="text-sm text-blue-600">Scanning providers...</p>}
      {error && <p className="text-sm text-red-600">Failed to discover models</p>}

      {data && (
        <>
          {Object.entries(data).filter(([k]) => k.endsWith('Error')).map(([k, v]) => (
            <p key={k} className="text-xs text-orange-600 mb-1">{k.replace('Error', '')}: {v}</p>
          ))}

          {allModels.length === 0 ? (
            <p className="text-sm text-blue-600">No LLM models found. Make sure LM Studio or Ollama is running.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {allModels.map((m, i) => {
                const alreadyAdded = registeredIds.has(m.id);
                return (
                  <div key={i} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm truncate">{m.name}</span>
                      <ProviderBadge modelId={m.id} />
                    </div>
                    {alreadyAdded ? (
                      <span className="text-xs text-green-600 flex items-center gap-1"><Check size={12} /> Added</span>
                    ) : (
                      <button
                        onClick={() => onAdd({
                          name: m.name,
                          provider: m.provider,
                          modelId: m.id,
                          endpointUrl: null,
                          enabled: true,
                          maxTokens: null,
                          costPer1k: 0,
                          inputCostPerMtok: 0,
                          outputCostPerMtok: 0,
                          toolCostPerMtok: 0,
                          sortOrder: 0,
                        })}
                        className="text-xs text-podbit-600 hover:text-podbit-700 font-medium"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Proxy Settings (nested under Proxy in Subsystem Assignments) ───────────

function ProxySettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['models', 'proxy-settings'],
    queryFn: models.proxySettings,
  });

  const mutation = useMutation({
    mutationFn: (updates) => models.updateProxySettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models', 'proxy-settings'] });
    },
  });

  if (isLoading || !settings) return null;

  const handleChange = (key, value) => {
    const num = parseFloat(value);
    if (!Number.isNaN(num)) mutation.mutate({ [key]: num });
  };

  return (
    <div className="mt-2 ml-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Knowledge Injection Budget</p>
      <div className="grid grid-cols-2 gap-3">
        <RangeField
          label={`Max reserve: ${Math.round(settings.knowledgeReserve * 100)}%`}
          value={settings.knowledgeReserve} min="0.01" max="0.5" step="0.01"
          onChange={(e) => handleChange('knowledgeReserve', e.target.value)}
          minLabel="1%" maxLabel="50%"
        />
        <RangeField
          label={`Min reserve: ${Math.round(settings.knowledgeMinReserve * 100)}%`}
          value={settings.knowledgeMinReserve} min="0" max="0.3" step="0.01"
          onChange={(e) => handleChange('knowledgeMinReserve', e.target.value)}
          minLabel="0%" maxLabel="30%"
        />
      </div>
      <p className="text-xs text-gray-400">
        Max: knowledge budget when conversation is short. Min: guaranteed floor as conversation grows. Sized as % of the model's context window.
      </p>

      <SettingsSection title="Telegraphic Compression">
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.telegraphicEnabled || false}
              onChange={(e) => mutation.mutate({ telegraphicEnabled: e.target.checked })}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Compress knowledge text</span>
          </label>
          {settings.telegraphicEnabled && (
            <select
              value={settings.telegraphicAggressiveness || 'medium'}
              onChange={(e) => mutation.mutate({ telegraphicAggressiveness: e.target.value })}
              className="border rounded px-2 py-1 text-xs"
            >
              <option value="light">Light</option>
              <option value="medium">Medium</option>
              <option value="aggressive">Aggressive</option>
            </select>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Removes filler words and replaces common phrases with symbols. Fits more knowledge into limited context windows.
        </p>
        {settings.telegraphicEnabled && (
          <label className="flex items-center gap-2 text-sm mt-2">
            <input
              type="checkbox"
              checked={settings.compressClientPrompt || false}
              onChange={(e) => mutation.mutate({ compressClientPrompt: e.target.checked })}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Also compress client system prompt</span>
          </label>
        )}
        {settings.telegraphicEnabled && settings.compressClientPrompt && (
          <p className="text-xs text-gray-400 mt-1">
            Compresses system prompts from coding assistants (Roo Code, Cursor, etc.) to fit more into small context windows.
          </p>
        )}
      </SettingsSection>

      <SettingsSection title="Fallback Model Profile">
        <div className="flex items-center gap-3">
          <select
            value={settings.defaultModelProfile || 'medium'}
            onChange={(e) => mutation.mutate({ defaultModelProfile: e.target.value })}
            className="border rounded px-2 py-1 text-xs"
          >
            <option value="micro">Micro (2K-4K)</option>
            <option value="small">Small (&lt; 8K)</option>
            <option value="medium">Medium (8K-32K)</option>
            <option value="large">Large (32K-128K)</option>
            <option value="xl">XL (128K+)</option>
          </select>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Used when a model has no context size set in the registry. Controls knowledge budget and injection behavior.
        </p>
      </SettingsSection>

      <SettingsSection title="Max Knowledge Nodes">
        <div className="flex items-center gap-3">
          <input
            type="number"
            min="0" max="100" step="1"
            value={settings.maxKnowledgeNodes || 0}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10) || 0;
              mutation.mutate({ maxKnowledgeNodes: Math.max(0, Math.min(100, v)) });
            }}
            className="border rounded px-2 py-1 text-xs w-20 dark:bg-gray-700 dark:border-gray-600"
          />
          <span className="text-xs text-gray-400">{(settings.maxKnowledgeNodes || 0) === 0 ? 'Auto (profile default)' : `${settings.maxKnowledgeNodes} nodes`}</span>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Override maximum knowledge nodes injected per request. 0 = use profile default (micro: 3, small: 5, medium: 15, large: 30, xl: 50).
        </p>
      </SettingsSection>

      <SettingsSection title="Tool Calling">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.toolCallingEnabled || false}
              onChange={(e) => mutation.mutate({ toolCallingEnabled: e.target.checked })}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Enable graph tools for LLM</span>
          </label>
          {settings.toolCallingEnabled && (
            <div className="grid grid-cols-3 gap-3 ml-6">
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Mode</label>
                <select
                  value={settings.toolCallingMode || 'read-only'}
                  onChange={(e) => mutation.mutate({ toolCallingMode: e.target.value })}
                  className="border rounded px-2 py-1 text-xs w-full"
                >
                  <option value="read-only">Read Only</option>
                  <option value="read-write">Read + Write</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Strategy</label>
                <select
                  value={settings.toolCallingStrategy || 'complement'}
                  onChange={(e) => mutation.mutate({ toolCallingStrategy: e.target.value })}
                  className="border rounded px-2 py-1 text-xs w-full"
                >
                  <option value="complement">Complement</option>
                  <option value="replace">Replace</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Max iterations: {settings.toolCallingMaxIterations || 5}</label>
                <input
                  type="range"
                  min="1" max="10" step="1"
                  value={settings.toolCallingMaxIterations || 5}
                  onChange={(e) => mutation.mutate({ toolCallingMaxIterations: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Lets the LLM call graph tools (query, summarize, tensions) to pull knowledge on demand.
          Complement: passive injection + tools. Replace: tools only (no pre-injection).
        </p>
      </SettingsSection>
    </div>
  );
}

// ─── Chat Settings (nested under chat in Subsystem Assignments) ─

function ChatSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['models', 'chat-settings'],
    queryFn: () => models.chatSettings(),
    staleTime: 10_000,
  });

  const mutation = useMutation({
    mutationFn: (updates) => models.updateChatSettings(updates),
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['models', 'chat-settings'] });
      const prev = queryClient.getQueryData(['models', 'chat-settings']);
      queryClient.setQueryData(['models', 'chat-settings'], (old) => old ? { ...old, ...updates } : old);
      return { prev };
    },
    onError: (_err, _updates, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['models', 'chat-settings'], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['models', 'chat-settings'] }),
  });

  if (isLoading || !settings) return null;

  return (
    <div className="mt-3 pl-4 border-l-2 border-gray-200 dark:border-gray-700 space-y-3">
      <SettingsSection title="Tool Calling">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.toolCallingEnabled || false}
              onChange={(e) => mutation.mutate({ toolCallingEnabled: e.target.checked })}
            />
            <span className="text-xs text-gray-600 dark:text-gray-400">Enable graph tools for chat LLM</span>
          </label>
          {settings.toolCallingEnabled && (
            <div className="grid grid-cols-2 gap-3 ml-6">
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Mode</label>
                <select
                  value={settings.toolCallingMode || 'read-write'}
                  onChange={(e) => mutation.mutate({ toolCallingMode: e.target.value })}
                  className="border rounded px-2 py-1 text-xs w-full"
                >
                  <option value="read-only">Read Only</option>
                  <option value="read-write">Read + Write</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-400 mb-0.5">Max iterations: {settings.toolCallingMaxIterations || 3}</label>
                <input
                  type="range"
                  min="1" max="10" step="1"
                  value={settings.toolCallingMaxIterations || 3}
                  onChange={(e) => mutation.mutate({ toolCallingMaxIterations: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Lets the chat LLM call graph tools (query, summarize, tensions) to pull knowledge on demand.
          Also togglable via the wrench icon in the Chat header.
        </p>
      </SettingsSection>
    </div>
  );
}

// ─── Image Reader Settings (nested under reader_image in Subsystem Assignments) ─

function ImageReaderSettings() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ['models', 'image-settings'],
    queryFn: models.imageSettings,
  });

  const mutation = useMutation({
    mutationFn: (updates) => models.updateImageSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models', 'image-settings'] });
    },
  });

  if (isLoading || !settings) return null;

  return (
    <div className="mt-2 ml-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-3">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Image Normalization</p>
      <div className="grid grid-cols-3 gap-3">
        <RangeField
          label={`Max dimension: ${settings.maxDimension}px`}
          value={settings.maxDimension} min="256" max="4096" step="128"
          onChange={(e) => mutation.mutate({ maxDimension: Number(e.target.value) })}
        />
        <RangeField
          label={`Quality: ${settings.quality}%`}
          value={settings.quality} min="10" max="100" step="5"
          onChange={(e) => mutation.mutate({ quality: Number(e.target.value) })}
          minLabel="10%" maxLabel="100%"
        />
        <div>
          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Format</label>
          <select value={settings.format} onChange={(e) => mutation.mutate({ format: e.target.value })} className="border rounded px-2 py-1 text-xs w-full dark:bg-gray-700 dark:border-gray-600">
            <option value="jpeg">JPEG (smallest)</option>
            <option value="webp">WebP (good balance)</option>
            <option value="png">PNG (lossless)</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Images are resized and compressed before sending to the vision model. Reduces token cost and API payload size.
      </p>
    </div>
  );
}

// ─── Subsystem Assignments ───────────────────────────────────────────────────

function SubsystemAssignments() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();

  const { data: assignmentData, isLoading: loadingAssignments } = useQuery({
    queryKey: ['models', 'assignments'],
    queryFn: models.assignments,
  });
  const assignments = assignmentData?.assignments ?? assignmentData ?? {};
  const _noThinkOverrides = assignmentData?.noThinkOverrides ?? {};
  const thinkingLevelOverrides = assignmentData?.thinkingLevelOverrides ?? {};
  const consultants = assignmentData?.consultants ?? {};

  // Fetch lab names for dynamic lab subsystem labels
  const { data: labListData } = useQuery({
    queryKey: ['lab-registry', 'list'],
    queryFn: labRegistry.list,
    staleTime: 60_000,
  });
  const labNameMap = {};
  for (const lab of (labListData?.labs || labListData || [])) {
    labNameMap[`lab:${lab.id}`] = lab.name;
  }

  const { data: registeredModels = [] } = useQuery({
    queryKey: ['models', 'registry'],
    queryFn: models.registry,
  });

  const { data: configData } = useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
  });

  // Check if a subsystem has been auto-tuned (has non-default inference params)
  // Check if a subsystem has been auto-tuned (has non-default inference params).
  // Only topP/minP/topK are empty by default — temperatures and repeatPenalties always have defaults.
  const isTuned = (key) => {
    if (!configData) return false;
    return (
      configData.subsystemTopP?.[key] != null ||
      configData.subsystemMinP?.[key] != null ||
      configData.subsystemTopK?.[key] != null
    );
  };

  const mutation = useMutation({
    mutationFn: ({ subsystem, modelId, resetParams }) =>
      models.setAssignment(subsystem, modelId, { resetParams }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['models', 'assignments'] });
      if (data?.registryRestore?.restored) {
        queryClient.invalidateQueries({ queryKey: ['config'] });
      }
    },
  });

  const thinkingMutation = useMutation({
    mutationFn: ({ subsystem, thinkingLevel }) =>
      models.setSubsystemThinking(subsystem, thinkingLevel),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models', 'assignments'] });
    },
  });

  const consultantMutation = useMutation({
    mutationFn: ({ subsystem, modelId }) =>
      models.setConsultant(subsystem, modelId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models', 'assignments'] });
    },
  });

  const handleAssignmentChange = async (key, newModelId) => {
    const modelId = newModelId || null;
    const currentAssignment = assignments[key];

    // If switching from one model to another (not just assigning or unassigning),
    // warn that inference params will be reset
    if (currentAssignment?.id && modelId && currentAssignment.id !== modelId) {
      const confirmed = await confirm({
        title: 'Save Tuning & Switch Model?',
        message: `Switching "${key}" from ${currentAssignment.name} to a new model.\n\nCurrent tuning will be saved to the Tuning Registry. If the new model has saved tuning, it will be auto-restored. Otherwise, parameters reset to defaults.`,
        confirmLabel: 'Switch Model',
        confirmColor: 'amber',
      });
      if (!confirmed) return;
      mutation.mutate({ subsystem: key, modelId, resetParams: true });
    } else {
      mutation.mutate({ subsystem: key, modelId, resetParams: false });
    }
  };

  const enabledModels = registeredModels.filter(m => m.enabled);
  const [showAutoTune, setShowAutoTune] = useState(false);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Subsystem Assignments</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            Assign a model to each subsystem. Unassigned subsystems will fail when called.
          </p>
        </div>
        <button
          onClick={() => setShowAutoTune(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 transition-colors"
        >
          <Zap className="w-4 h-4" />
          Auto-Tune
        </button>
      </div>

      <AutoTuneDialog
        isOpen={showAutoTune}
        onClose={() => setShowAutoTune(false)}
        assignments={assignments}
        consultants={consultants}
      />

      {loadingAssignments ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      ) : (
        <div className="space-y-6">
          {SUPER_GROUPS.map(sg => {
            // For the dynamic "Labs" group, build subsystem list from lab:* keys in assignments
            let groupSubs;
            if (sg.dynamic) {
              groupSubs = Object.keys(assignments || {})
                .filter(k => k.startsWith('lab:'))
                .map(k => ({
                  key: k,
                  label: labNameMap[k] || k.replace(/^lab:/, ''),
                  description: 'Primary model for codegen, consultant for evaluation',
                  tier: 'frontier',
                }));
            } else {
              groupSubs = SUBSYSTEMS.filter(s => SUBSYSTEM_TO_GROUP[s.key] === sg.id);
            }
            if (groupSubs.length === 0) return null;
            return (
              <ModelSuperGroup key={sg.id} title={sg.title} description={sg.description}>
                <div className="ml-2 pl-4 border-l-2 border-gray-300 dark:border-gray-600 space-y-2">
          {groupSubs.map(({ key, label, description, tier }) => {
            const assigned = assignments[key];
            const currentModelId = assigned?.id || '';
            const badge = TIER_BADGES[tier];

            return (
              <div key={key} id={`subsystem-${key}`}>
                <div className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="min-w-0 mr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{label}</span>
                      <span className={`text-xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${badge.style}`}>{badge.label}</span>
                      {assigned && <ProviderBadge modelId={assigned.modelId} />}
                      {isTuned(key) && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title="Inference parameters auto-tuned">
                          Tuned
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400">{description}</p>
                    {(SUBSYSTEM_MAP[key]?.prompts?.length > 0 || SUBSYSTEM_MAP[key]?.configSections?.length > 0) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {SUBSYSTEM_MAP[key]?.prompts?.map(pid => <PromptLink key={pid} promptId={pid} />)}
                        {SUBSYSTEM_MAP[key]?.configSections?.map(sid => <ConfigLink key={sid} sectionId={sid} />)}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={currentModelId}
                      onChange={(e) => handleAssignmentChange(key, e.target.value)}
                      className="border rounded px-3 py-1.5 text-sm min-w-[200px] max-w-[300px]"
                      disabled={mutation.isPending}
                    >
                      <option value="">— Not assigned —</option>
                      {enabledModels.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    {assigned && (() => {
                      const levelOverride = thinkingLevelOverrides[key];
                      const selectVal = levelOverride || 'inherit';
                      const baseModel = enabledModels.find(m => m.id === assigned.id);
                      const modelDefault = baseModel?.noThink ? 'Off' : 'On';
                      const consultantId = consultants[key]?.id || '';
                      return (
                        <>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">Thinking</span>
                            <select
                              value={selectVal}
                              onChange={(e) => {
                                const v = e.target.value;
                                const level = v === 'inherit' ? null : v;
                                thinkingMutation.mutate({ subsystem: key, thinkingLevel: level });
                              }}
                              className="border rounded px-2 py-1.5 text-xs w-[110px] dark:bg-gray-800 dark:border-gray-600"
                              disabled={thinkingMutation.isPending}
                              title="Thinking level override for this subsystem"
                            >
                              <option value="inherit">Inherit ({modelDefault})</option>
                              <option value="high">High</option>
                              <option value="medium">Medium</option>
                              <option value="low">Low</option>
                              <option value="off">Off</option>
                            </select>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">Consultant</span>
                            <select
                              value={consultantId}
                              onChange={(e) => consultantMutation.mutate({
                                subsystem: key,
                                modelId: e.target.value || null,
                              })}
                              className="border rounded px-2 py-1.5 text-xs w-[140px] dark:bg-gray-800 dark:border-gray-600"
                              disabled={consultantMutation.isPending}
                              title="Fallback model — used when primary model's output fails quality checks"
                            >
                              <option value="">None</option>
                              {enabledModels
                                .filter(m => m.id !== currentModelId)
                                .map(m => (
                                  <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
                {key === 'proxy' && <ProxySettings />}
                {key === 'chat' && <ChatSettings />}
                {key === 'reader_image' && <ImageReaderSettings />}
              </div>
            );
          })}
                </div>
              </ModelSuperGroup>
            );
          })}
        </div>
      )}
      {ConfirmDialogEl}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

/** Models page: registry, subsystem assignments, and provider settings. */
export default function Models() {
  useScrollToHash();
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Server className="text-podbit-600" size={24} />
        <div>
          <h1 className="text-2xl font-bold">Models</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Manage LLMs, providers, and model assignments</p>
        </div>
      </div>

      <PageRelationshipBanner currentPage="models" />

      <ModelRegistry />
      <SubsystemAssignments />
      <EmbeddingStatus />
      <ConvLoggingToggle />
      <ModelHealth />
    </div>
  );
}
