import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { prompts as promptsApi } from '../lib/api';
import { Save, RotateCcw, ChevronDown, ChevronRight, Eye, Award, RefreshCw, Trash2, FileText, Download, Upload, Lock, Unlock, Pencil, X } from 'lucide-react';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { PageRelationshipBanner, SubsystemBadge, ConfigLink } from '../components/RelatedLinks';
import { PROMPT_TO_SUBSYSTEMS, SUBSYSTEM_MAP, SUPER_GROUPS, PROMPT_CATEGORY_TO_GROUP, SUBSYSTEM_TO_GROUP } from '../lib/subsystem-map';
import { useScrollToHash } from '../lib/useScrollToHash';

const CATEGORIES = ['all', 'system', 'core', 'context', 'knowledge', 'docs', 'chat', 'kb', 'autotune', 'evm', 'config', 'domain', 'keyword', 'project', 'dedup', 'quality'];

function PromptSuperGroup({ title, description, children, hasContent }) {
  const [isOpen, setIsOpen] = useState(false);
  if (!hasContent) return null;
  return (
    <div className="mb-8">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border border-gray-200 dark:border-gray-700"
      >
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-200 tracking-wide">{title}</h2>
          {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
        </div>
        {isOpen
          ? <ChevronDown size={18} className="text-gray-400 shrink-0" />
          : <ChevronRight size={18} className="text-gray-400 shrink-0" />
        }
      </button>
      {isOpen && (
        <div className="mt-3 ml-2 pl-4 border-l-2 border-gray-300 dark:border-gray-600 space-y-6">
          {children}
        </div>
      )}
    </div>
  );
}

/** Strip markdown code fences (```json ... ```) if present */
function stripFences(text) {
  const s = text.trim();
  if (s.startsWith('```')) {
    return s.replace(/^```\w*\n?/, '').replace(/\n?```\s*$/, '').trim();
  }
  return s;
}

/** Format gold standard content. Returns JSX for code-bearing output, string otherwise. */
function GoldContent({ raw }) {
  try {
    const parsed = JSON.parse(stripFences(raw));
    // Lab codegen output — code field needs its own non-wrapping scroll container
    if (parsed.code && parsed.hypothesis) {
      return (
        <div className="text-xs leading-relaxed opacity-90">
          <div className="space-y-1 mb-2">
            <div><span className="font-semibold opacity-70">Hypothesis:</span> {parsed.hypothesis}</div>
            <div><span className="font-semibold opacity-70">Mode:</span> {parsed.evaluationMode || '—'}</div>
            {parsed.expectedBehavior && <div><span className="font-semibold opacity-70">Expected:</span> {parsed.expectedBehavior}</div>}
          </div>
          <div className="border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800/60 overflow-x-auto">
            <pre className="text-xs font-mono p-2.5 whitespace-pre leading-relaxed">{parsed.code}</pre>
          </div>
        </div>
      );
    }
    return <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed opacity-90">{JSON.stringify(parsed, null, 2)}</pre>;
  } catch {
    return <pre className="text-xs font-mono whitespace-pre-wrap leading-relaxed opacity-90">{raw}</pre>;
  }
}

const TIER_LABELS = { 1: 'Ideal', 2: 'Good', 3: 'Acceptable' };
const TIER_COLORS = {
  1: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  2: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  3: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
};

function GoldStandardItem({ std, promptId }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const isDefault = std.source === 'default';

  const updateMutation = useMutation({
    mutationFn: (updates) => promptsApi.updateGoldStandard(promptId, std.id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gold-standards', promptId] });
      setEditing(false);
    },
  });

  const handleEdit = () => {
    setEditContent(std.content);
    setEditing(true);
  };

  const handleSave = () => {
    if (editContent.trim() === std.content) {
      setEditing(false);
      return;
    }
    updateMutation.mutate({ content: editContent.trim() });
  };

  const handleLockToggle = () => {
    updateMutation.mutate({ locked: !std.locked });
  };

  return (
    <div className={`p-3 rounded-lg border ${TIER_COLORS[std.tier] || 'border-gray-200'} ${isDefault ? 'opacity-80' : ''}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-semibold">
          Tier {std.tier}: {TIER_LABELS[std.tier] || 'Unknown'}
        </span>
        {isDefault && (
          <span className="text-xs px-1.5 py-0.5 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 rounded font-medium">
            default
          </span>
        )}
        {std.locked && (
          <span className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded">
            <Lock size={10} />
            locked
          </span>
        )}
        {std.has_embedding && (
          <span className="text-xs px-1.5 py-0.5 bg-white/50 dark:bg-black/20 rounded">
            embedded
          </span>
        )}
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
          {std.model_used}{std.generated_at ? ` · ${new Date(std.generated_at).toLocaleDateString()}` : ''}
        </span>
      </div>

      {editing ? (
        <div className="mt-1.5">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={8}
            className="w-full text-xs font-mono p-2.5 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 resize-y leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-1.5">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-md transition-colors disabled:opacity-50"
            >
              <Save size={12} />
              {updateMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={updateMutation.isPending}
              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
            >
              <X size={12} />
              Cancel
            </button>
            <span className="text-xs text-gray-400 ml-1">Saving will lock this tier from auto-regeneration</span>
            {updateMutation.isError && (
              <span className="text-xs text-red-500 ml-auto">{updateMutation.error?.message}</span>
            )}
          </div>
        </div>
      ) : (
        <div className="group relative">
          <GoldContent raw={std.content} />
          {!isDefault && (
            <div className="flex items-center gap-1.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={handleEdit}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
              >
                <Pencil size={10} />
                Edit
              </button>
              <button
                onClick={handleLockToggle}
                disabled={updateMutation.isPending}
                className="flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                title={std.locked ? 'Unlock — allow auto-regeneration to overwrite this tier' : 'Lock — prevent auto-regeneration from overwriting this tier'}
              >
                {std.locked ? <Unlock size={10} /> : <Lock size={10} />}
                {std.locked ? 'Unlock' : 'Lock'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GoldStandardPanel({ promptId }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const genStartRef = useRef(null);
  const { confirm, ConfirmDialogEl } = useConfirmDialog();

  const { data: standards = [], isLoading } = useQuery({
    queryKey: ['gold-standards', promptId],
    queryFn: () => promptsApi.goldStandards(promptId),
    enabled: expanded,
    refetchInterval: generating ? 3000 : false,
  });

  // Stop polling when we detect fresh standards arrived after generation started
  useEffect(() => {
    if (!generating || standards.length === 0 || !genStartRef.current) return;
    // Only check generated (non-default) standards for freshness
    const generated = standards.filter(s => s.source !== 'default');
    if (generated.length === 0) return;
    const newest = generated.reduce((max, s) => {
      const t = s.generated_at ? new Date(s.generated_at + 'Z').getTime() : 0;
      return t > max ? t : max;
    }, 0);
    if (newest > genStartRef.current) {
      setGenerating(false);
      queryClient.invalidateQueries({ queryKey: ['gold-standards-list'] });
    }
  }, [generating, standards, queryClient]);

  // Safety timeout — stop polling after 3 minutes
  useEffect(() => {
    if (!generating) return;
    const timer = setTimeout(() => setGenerating(false), 180_000);
    return () => clearTimeout(timer);
  }, [generating]);

  const generateMutation = useMutation({
    mutationFn: () => promptsApi.generateGoldStandards(promptId),
    onSuccess: () => {
      genStartRef.current = Date.now() - 5000; // 5s buffer for clock skew
      setGenerating(true);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => promptsApi.deleteGoldStandards(promptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gold-standards', promptId] });
      queryClient.invalidateQueries({ queryKey: ['gold-standards-list'] });
    },
  });

  const lockedCount = standards.filter(s => s.locked).length;
  const isShowingDefaults = standards.length > 0 && standards[0].source === 'default';
  const hasGenerated = standards.length > 0 && !isShowingDefaults;

  return (
    <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors rounded-t-lg"
      >
        <Award size={14} className="text-amber-500" />
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Gold Standards</span>
        {generating && <RefreshCw size={12} className="text-amber-500 animate-spin" />}
        {lockedCount > 0 && (
          <span className="flex items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400">
            <Lock size={10} />
            {lockedCount}
          </span>
        )}
        {expanded ? <ChevronDown size={14} className="text-gray-400 ml-auto" /> : <ChevronRight size={14} className="text-gray-400 ml-auto" />}
      </button>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-700">
          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => generateMutation.mutate()}
              disabled={generating}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white
                         bg-amber-600 hover:bg-amber-700 rounded-md transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={generating ? 'animate-spin' : ''} />
              {generating ? 'Generating...' : hasGenerated ? 'Regenerate' : 'Generate'}
            </button>

            {hasGenerated && !generating && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Delete Gold Standards',
                    message: 'Delete generated gold standards? Auto-tune will fall back to hardcoded defaults.',
                    confirmLabel: 'Delete',
                    confirmColor: 'bg-red-600 hover:bg-red-700',
                  });
                  if (ok) deleteMutation.mutate();
                }}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-500 dark:text-gray-400
                           bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-md transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
            )}

            {generating && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                Generating in background — polling every 3s...
              </span>
            )}
            {lockedCount > 0 && !generating && (
              <span className="text-xs text-orange-600 dark:text-orange-400">
                {lockedCount} locked tier{lockedCount > 1 ? 's' : ''} will be skipped on regenerate
              </span>
            )}
            {isShowingDefaults && !generating && (
              <span className="text-xs text-violet-600 dark:text-violet-400">
                Showing hardcoded defaults — Generate to create model-specific standards
              </span>
            )}
            {generateMutation.isError && (
              <span className="text-xs text-red-600 dark:text-red-400">{generateMutation.error?.response?.data?.error || generateMutation.error?.message}</span>
            )}
          </div>

          {/* Standards list */}
          {isLoading && <p className="mt-2 text-xs text-gray-400">Loading...</p>}

          {standards.length > 0 && (
            <div className="mt-3 space-y-2">
              {standards.map((std) => (
                <GoldStandardItem key={std.id} std={std} promptId={promptId} />
              ))}
            </div>
          )}

          {!isLoading && standards.length === 0 && !generating && (
            <p className="mt-2 text-xs text-gray-400 dark:text-gray-500">
              No gold standards or defaults available. Click Generate to create 3-tier reference responses using the tuning judge model.
            </p>
          )}
        </div>
      )}
      {ConfirmDialogEl}
    </div>
  );
}

// Prompt IDs that support gold standard generation
const TUNABLE_PROMPTS = new Set([
  // Voice / Synthesis
  'core.insight_synthesis', 'core.multi_insight_synthesis',
  'core.breakthrough_validation', 'core.novelty_gate', 'core.question_generation', 'core.question_answer',
  // Compress / Context
  'knowledge.compress', 'knowledge.compress_task', 'knowledge.summarize', 'knowledge.summarize_task',
  'context.history_compression',
  // Chat / Docs / Research
  'chat.default_response', 'chat.research_seeds', 'chat.summarize', 'chat.compress', 'chat.voice_connection',
  'core.research_cycle',
  'docs.outline_decomposition', 'docs.section_generation', 'docs.section_escalation',
  // Keyword
  'keyword.node_keywords', 'keyword.domain_synonyms',
  // Autorating
  'core.autorating',
  // KB Readers
  'kb.curate_text', 'kb.curate_code', 'kb.curate_document', 'kb.curate_data',
  // Lab Verification
  'evm.codegen', 'evm.triage', 'evm.analysis', 'evm.structural_eval', 'evm.expert_eval',
  // Dedup
  'dedup.llm_judge',
]);

function PromptEditor({ prompt, onSaved, goldStandardInfo }) {
  const locale = 'en';
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const [content, setContent] = useState(prompt.content);
  const [expanded, setExpanded] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);

  const isDirty = content !== prompt.content;
  const isTunable = TUNABLE_PROMPTS.has(prompt.id);

  const saveMutation = useMutation({
    mutationFn: () => promptsApi.save(prompt.id, locale, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['gold-standards-list'] });
      if (onSaved) onSaved();
    },
  });

  const revertMutation = useMutation({
    mutationFn: () => promptsApi.revert(prompt.id, locale),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['gold-standards-list'] });
      if (onSaved) onSaved();
    },
  });

  const previewMutation = useMutation({
    mutationFn: (variables) => promptsApi.preview(prompt.id, locale, variables),
    onSuccess: (data) => setPreviewResult(data.rendered),
  });

  function handlePreview() {
    // Build dummy variables from the prompt's variable list
    const vars = {};
    for (const v of prompt.variables) {
      vars[v] = `[${v}]`;
    }
    previewMutation.mutate(vars);
    setShowPreview(true);
  }

  // Collect related config sections from all subsystems that use this prompt
  const relatedConfigSections = [];
  const seen = new Set();
  for (const sub of (PROMPT_TO_SUBSYSTEMS[prompt.id] || [])) {
    for (const sid of (SUBSYSTEM_MAP[sub]?.configSections || [])) {
      if (!seen.has(sid)) { seen.add(sid); relatedConfigSections.push(sid); }
    }
  }

  return (
    <div id={prompt.id} className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{prompt.id}</span>
            {prompt.override && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                override
              </span>
            )}
            {PROMPT_TO_SUBSYSTEMS[prompt.id]?.map(sub => (
              <SubsystemBadge key={sub} subsystem={sub} tier={SUBSYSTEM_MAP[sub]?.tier} />
            ))}
            {relatedConfigSections.map(sid => (
              <ConfigLink key={sid} sectionId={sid} />
            ))}
            {isTunable && goldStandardInfo && (
              <span className={`flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium rounded ${
                goldStandardInfo.source === 'default'
                  ? 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                  : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
              }`}>
                <Award size={10} />
                {goldStandardInfo.count} {goldStandardInfo.source === 'default' ? 'default' : 'gold'}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{prompt.description}</p>
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">{prompt.category}</span>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          {/* Variables */}
          {prompt.variables.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Variables:</span>
              {prompt.variables.map((v) => (
                <span key={v} className="px-1.5 py-0.5 text-xs font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          )}

          {/* Textarea */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={Math.min(20, Math.max(6, content.split('\n').length + 2))}
            className="mt-3 w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg font-mono text-sm
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-podbit-400 focus:border-transparent
                       resize-y"
            spellCheck={false}
          />

          {/* Actions */}
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!isDirty || saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white
                         bg-podbit-600 hover:bg-podbit-700 rounded-lg transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={14} />
              {saveMutation.isPending ? 'Saving...' : 'Save Override'}
            </button>

            {prompt.override && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Revert to Default',
                    message: 'Revert this prompt to its default?\n\nYour custom override will be permanently deleted.',
                    confirmLabel: 'Revert',
                    confirmColor: 'bg-orange-600 hover:bg-orange-700',
                  });
                  if (ok) revertMutation.mutate();
                }}
                disabled={revertMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400
                           bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors
                           disabled:opacity-40"
              >
                <RotateCcw size={14} />
                Revert to Default
              </button>
            )}

            <button
              onClick={handlePreview}
              disabled={previewMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400
                         bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors ml-auto"
            >
              <Eye size={14} />
              Preview
            </button>
          </div>

          {/* Save success */}
          {saveMutation.isSuccess && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-300">Saved successfully.</p>
          )}
          {saveMutation.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-300">Save failed: {saveMutation.error?.message}</p>
          )}

          {/* Preview result */}
          {showPreview && previewResult && (
            <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Preview (variables replaced with placeholders)</span>
                <button onClick={() => setShowPreview(false)} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">
                  Close
                </button>
              </div>
              <pre className="text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{previewResult}</pre>
            </div>
          )}

          {/* Gold Standards Panel (only for tunable prompts) */}
          {isTunable && <GoldStandardPanel promptId={prompt.id} />}
        </div>
      )}
    {ConfirmDialogEl}
    </div>
  );
}

// =============================================================================
// TEST DATA EDITOR — simplified editor for autotune.data.* entries
// =============================================================================

function TestDataEditor({ prompt, onSaved }) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const [content, setContent] = useState(prompt.content);
  const [expanded, setExpanded] = useState(false);

  const isDirty = content !== prompt.content;
  const charCount = content.length;

  const saveMutation = useMutation({
    mutationFn: () => promptsApi.save(prompt.id, 'en', content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      if (onSaved) onSaved();
    },
  });

  const revertMutation = useMutation({
    mutationFn: () => promptsApi.revert(prompt.id, 'en'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      if (onSaved) onSaved();
    },
  });

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {expanded ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        <FileText size={14} className="text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-gray-900 dark:text-gray-100">{prompt.id.replace('autotune.data.', '')}</span>
            {prompt.override && (
              <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                override
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">{charCount} chars</span>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{prompt.description}</p>
        </div>
      </button>

      {/* Expanded editor */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={Math.min(16, Math.max(4, content.split('\n').length + 2))}
            className="mt-3 w-full p-3 border border-gray-200 dark:border-gray-700 rounded-lg font-mono text-sm
                       bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100
                       focus:outline-none focus:ring-2 focus:ring-podbit-400 focus:border-transparent
                       resize-y"
            spellCheck={false}
          />

          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!isDirty || saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white
                         bg-podbit-600 hover:bg-podbit-700 rounded-lg transition-colors
                         disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Save size={14} />
              {saveMutation.isPending ? 'Saving...' : 'Save Override'}
            </button>

            {prompt.override && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Revert to Default',
                    message: 'Revert this test data to its default?\n\nYour custom override will be permanently deleted.',
                    confirmLabel: 'Revert',
                    confirmColor: 'bg-orange-600 hover:bg-orange-700',
                  });
                  if (ok) revertMutation.mutate();
                }}
                disabled={revertMutation.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-400
                           bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg transition-colors
                           disabled:opacity-40"
              >
                <RotateCcw size={14} />
                Revert to Default
              </button>
            )}

            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              {charCount} characters
            </span>
          </div>

          {saveMutation.isSuccess && (
            <p className="mt-2 text-xs text-green-600 dark:text-green-300">Saved successfully.</p>
          )}
          {saveMutation.isError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-300">Save failed: {saveMutation.error?.message}</p>
          )}
        </div>
      )}
      {ConfirmDialogEl}
    </div>
  );
}

// =============================================================================
// TEST DATA TAB — dedicated view for autotune.data.* entries
// =============================================================================

function TestDataTab({ allPrompts, isLoading, error }) {
  const [search, setSearch] = useState('');

  const testDataPrompts = allPrompts.filter((p) => p.category === 'testdata');

  const filtered = testDataPrompts.filter((p) => {
    if (!search) return true;
    return p.id.includes(search) || p.description.toLowerCase().includes(search.toLowerCase());
  });

  const overrideCount = testDataPrompts.filter(p => p.override).length;

  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Editable test data fixtures used by the auto-tune system. Changes take effect immediately for gold standard generation and parameter tuning.
      </p>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search test data..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-podbit-400 w-60"
        />
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
        <span>{testDataPrompts.length} test data entries</span>
        {overrideCount > 0 && <span>{overrideCount} overrides</span>}
        <span>{filtered.length} shown</span>
      </div>

      {isLoading && <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>}
      {error && <p className="text-red-500 dark:text-red-400 text-sm">Failed to load: {error.message}</p>}

      <div className="space-y-2">
        {filtered.map((prompt) => (
          <TestDataEditor key={prompt.id} prompt={prompt} />
        ))}
      </div>

      {filtered.length === 0 && !isLoading && (
        <p className="text-gray-400 text-sm text-center py-8">No test data entries match your search.</p>
      )}
    </>
  );
}

// =============================================================================
// MAIN PROMPTS PAGE — with tabs for Prompt Editor and Test Data
// =============================================================================

/** Prompts page: list, edit, and test system prompts by category. */
export default function Prompts() {
  useScrollToHash();
  const [activeTab, setActiveTab] = useState('editor');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  const { data: allPrompts = [], isLoading, error } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => promptsApi.list('en'),
  });

  // Fetch gold standard counts for badge display
  const { data: goldStandardsList = [] } = useQuery({
    queryKey: ['gold-standards-list'],
    queryFn: () => promptsApi.goldStandardsList(),
  });

  // Backup info
  const { data: backupInfo } = useQuery({
    queryKey: ['prompts-backup-info'],
    queryFn: () => promptsApi.backupInfo(),
    staleTime: 30000,
  });

  const backupMutation = useMutation({
    mutationFn: () => promptsApi.backup(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['prompts-backup-info'] }),
  });

  const restoreMutation = useMutation({
    mutationFn: () => promptsApi.restore(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prompts'] });
      queryClient.invalidateQueries({ queryKey: ['prompts-backup-info'] });
    },
  });

  // Build lookup: prompt_id -> { count, source }
  const goldCounts = {};
  for (const gs of goldStandardsList) {
    goldCounts[gs.prompt_id] = { count: gs.count, source: gs.source || 'generated' };
  }

  // Filter (editor tab only — excludes testdata category)
  const filtered = allPrompts.filter((p) => {
    if (p.category === 'testdata') return false;
    if (category !== 'all' && p.category !== category) return false;
    if (search && !p.id.includes(search) && !p.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by category for display
  const grouped = {};
  for (const p of filtered) {
    if (!grouped[p.category]) grouped[p.category] = [];
    grouped[p.category].push(p);
  }

  const totalGoldPrompts = Object.keys(goldCounts).length;
  const testDataCount = allPrompts.filter(p => p.category === 'testdata').length;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header + Tabs */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-200">Prompts</h1>
          <PageRelationshipBanner currentPage="prompts" />
          <div className="flex items-center gap-2">
            {backupInfo?.exists && (
              <span className="text-xs text-gray-400 dark:text-gray-500 mr-1">
                Backup: {backupInfo.count} overrides
                {backupInfo.exported_at && ` \u00b7 ${new Date(backupInfo.exported_at).toLocaleDateString()}`}
              </span>
            )}
            <button
              onClick={() => backupMutation.mutate()}
              disabled={backupMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              <Download size={14} />
              {backupMutation.isPending ? 'Backing up...' : 'Backup'}
            </button>
            <button
              onClick={() => {
                if (window.confirm('Restore all prompt overrides from backup? This will overwrite current DB overrides with backed-up values.')) {
                  restoreMutation.mutate();
                }
              }}
              disabled={restoreMutation.isPending || !backupInfo?.exists}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors"
            >
              <Upload size={14} />
              {restoreMutation.isPending ? 'Restoring...' : 'Restore'}
            </button>
            {backupMutation.isSuccess && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Backed up {backupMutation.data?.count} overrides</span>
            )}
            {restoreMutation.isSuccess && (
              <span className="text-xs text-emerald-600 dark:text-emerald-400">Restored {restoreMutation.data?.restored}</span>
            )}
            {(backupMutation.isError || restoreMutation.isError) && (
              <span className="text-xs text-red-500">{(backupMutation.error || restoreMutation.error)?.message}</span>
            )}
          </div>
        </div>
        <div className="flex border-b border-gray-200 dark:border-gray-700 mt-4">
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'editor'
                ? 'border-podbit-600 text-podbit-600 dark:text-podbit-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Prompt Editor
          </button>
          <button
            onClick={() => setActiveTab('testdata')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === 'testdata'
                ? 'border-podbit-600 text-podbit-600 dark:text-podbit-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Test Data
            {testDataCount > 0 && (
              <span className="text-xs bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{testDataCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Test Data Tab */}
      {activeTab === 'testdata' && (
        <TestDataTab allPrompts={allPrompts} isLoading={isLoading} error={error} />
      )}

      {/* Prompt Editor Tab */}
      {activeTab === 'editor' && (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            {/* Category filter */}
            <div className="flex items-center gap-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                    category === cat
                      ? 'bg-podbit-600 text-white'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search prompts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-podbit-400 w-60"
            />

          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 mb-4 text-xs text-gray-500 dark:text-gray-400">
            <span>{allPrompts.filter(p => p.category !== 'testdata').length} total prompts</span>
            <span>{allPrompts.filter(p => p.override && p.category !== 'testdata').length} overrides</span>
            <span>{filtered.length} shown</span>
            {totalGoldPrompts > 0 && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Award size={12} />
                {totalGoldPrompts} with gold standards
              </span>
            )}
          </div>

          {/* Loading / Error */}
          {isLoading && <p className="text-gray-400 dark:text-gray-500 text-sm">Loading prompts...</p>}
          {error && <p className="text-red-500 dark:text-red-400 text-sm">Failed to load: {error.message}</p>}

          {/* Prompt list by super-group — individual prompts grouped by subsystem membership, then category fallback */}
          <div className="space-y-8">
            {SUPER_GROUPS.map(sg => {
              // Collect prompts for this super-group: check subsystem membership first, then category fallback
              const sgPrompts = {};
              for (const [cat, items] of Object.entries(grouped)) {
                for (const prompt of items) {
                  const subs = PROMPT_TO_SUBSYSTEMS[prompt.id] || [];
                  const promptGroup = subs.length > 0
                    ? SUBSYSTEM_TO_GROUP[subs[0]]
                    : PROMPT_CATEGORY_TO_GROUP[cat];
                  if (promptGroup === sg.id) {
                    if (!sgPrompts[cat]) sgPrompts[cat] = [];
                    sgPrompts[cat].push(prompt);
                  }
                }
              }
              const sgEntries = Object.entries(sgPrompts);
              return (
                <PromptSuperGroup key={sg.id} title={sg.title} description={sg.description} hasContent={sgEntries.length > 0}>
                  {sgEntries.map(([cat, items]) => (
                    <div key={cat}>
                      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">{cat}</h3>
                      <div className="space-y-2">
                        {items.map((prompt) => (
                          <PromptEditor
                            key={prompt.id}
                            prompt={prompt}
                            goldStandardInfo={goldCounts[prompt.id] || null}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </PromptSuperGroup>
              );
            })}
            {/* Ungrouped prompts (no subsystem match and no category match) */}
            {Object.entries(grouped)
              .map(([cat, items]) => {
                const ungrouped = items.filter(p => {
                  const subs = PROMPT_TO_SUBSYSTEMS[p.id] || [];
                  if (subs.length > 0 && SUBSYSTEM_TO_GROUP[subs[0]]) return false;
                  if (PROMPT_CATEGORY_TO_GROUP[cat]) return false;
                  return true;
                });
                return ungrouped.length > 0 ? [cat, ungrouped] : null;
              })
              .filter(Boolean)
              .map(([cat, items]) => (
                <div key={cat}>
                  <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-2">{cat}</h2>
                  <div className="space-y-2">
                    {items.map((prompt) => (
                      <PromptEditor
                        key={prompt.id}
                        prompt={prompt}
                        goldStandardInfo={goldCounts[prompt.id] || null}
                      />
                    ))}
                  </div>
                </div>
              ))
            }
          </div>

          {filtered.length === 0 && !isLoading && (
            <p className="text-gray-400 text-sm text-center py-8">No prompts match your filters.</p>
          )}
        </>
      )}
    </div>
  );
}
