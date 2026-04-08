/**
 * Shared Lab Verification Detail Modal — used on both Graph and Verification pages.
 */
import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { CheckCircle2, XCircle, AlertTriangle, Clock, Code2, Terminal, FlaskConical, ArrowRight, ExternalLink, SkipForward, Bug, Microscope, Loader2, Eye, GraduationCap, RefreshCw, ThumbsUp, ThumbsDown, RotateCcw, X, Database, Target, Minimize2, Lightbulb, Sparkles, MessageSquare, Send, Scissors, ChevronLeft, ChevronRight } from 'lucide-react';
import { evm } from '../lib/api';
import api from '../lib/api';
import { formatNodeTime } from '../pages/resonance/node-utils';
import { resolveNodeNames, getCachedName } from '../lib/node-names';
import VariableRefText from './VariableRefText';

// ─── Outcome helpers ────────────────────────────────────────────

/** Derives display outcome (supported, refuted, needs_review, etc.) from lab execution row. */
export function getOutcome(exec) {
  if (exec.status === 'analysis') return 'analysis';
  if (exec.status === 'completed') {
    // If neither claim_supported nor verified was set (LLM eval auto-approve), infer from weight change
    if (exec.claim_supported == null && exec.verified == null) {
      return (exec.weight_after ?? 0) >= (exec.weight_before ?? 0) ? 'supported' : 'disproved';
    }
    const supported = exec.claim_supported != null ? exec.claim_supported === 1 : exec.verified === 1;
    return supported ? 'supported' : 'disproved';
  }
  if (exec.status === 'code_error') return 'code_error';
  if (exec.status === 'failed') return 'error';
  if (exec.status === 'skipped') return 'skipped';
  if (exec.status === 'needs_review') return 'needs_review';
  if (exec.status === 'needs_expert') return 'needs_expert';
  if (exec.status === 'rejected_resynthesis') return 'rejected_resynthesis';
  return 'running';
}

export const OUTCOME_CONFIG = {
  supported:             { label: 'Supported',       icon: CheckCircle2,  bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-700 dark:text-green-400' },
  disproved:             { label: 'Refuted',         icon: XCircle,       bg: 'bg-red-100 dark:bg-red-900/30',       text: 'text-red-700 dark:text-red-400' },
  code_error:            { label: 'Lab Error',       icon: Bug,           bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-400' },
  error:                 { label: 'Error',           icon: AlertTriangle, bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-700 dark:text-amber-400' },
  skipped:               { label: 'Not Reducible',   icon: SkipForward,   bg: 'bg-gray-100 dark:bg-gray-800',        text: 'text-gray-600 dark:text-gray-400' },
  needs_review:          { label: 'Review (legacy)',  icon: Eye,           bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400' },
  needs_expert:          { label: 'Expert (legacy)',  icon: GraduationCap, bg: 'bg-cyan-100 dark:bg-cyan-900/30',     text: 'text-cyan-700 dark:text-cyan-400' },
  rejected_resynthesis:  { label: 'Re-synth',        icon: RefreshCw,     bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-400' },
  analysis:              { label: 'Post-Rejection',  icon: Microscope,    bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-400' },
  running:               { label: 'Running',         icon: Clock,         bg: 'bg-blue-100 dark:bg-blue-900/30',     text: 'text-blue-700 dark:text-blue-400' },
};

export const TEST_CATEGORY_LABELS = {
  numerical_identity: { label: 'Numerical', color: 'text-green-600 dark:text-green-400' },
  convergence_rate: { label: 'Convergence', color: 'text-blue-600 dark:text-blue-400' },
  parameter_sensitivity: { label: 'Param Sweep', color: 'text-orange-600 dark:text-orange-400' },
  structural_property: { label: 'Structural', color: 'text-cyan-600 dark:text-cyan-400' },
  threshold_behaviour: { label: 'Threshold', color: 'text-amber-600 dark:text-amber-400' },
  symbolic_identity: { label: 'Symbolic', color: 'text-indigo-600 dark:text-indigo-400' },
  training_performance: { label: 'Training', color: 'text-purple-600 dark:text-purple-400' },
  model_behavior: { label: 'Model Behavior', color: 'text-rose-600 dark:text-rose-400' },
  qualitative: { label: 'Not Reducible', color: 'text-gray-500 dark:text-gray-400' },
  curve_shape: { label: 'Curve Shape', color: 'text-teal-600 dark:text-teal-400' },
  structural_mapping: { label: 'Structural Map', color: 'text-sky-600 dark:text-sky-400' },
};


// ─── Constants ──────────────────────────────────────────────────

const RESTATEMENT_PRESETS = [
  { id: 'real_data', label: 'Use Real Data', icon: Database,
    color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800',
    guidance: 'Previous attempt used placeholder or hardcoded decimal values. Compute BOTH sides of the identity from first principles using mpmath/sympy. Do NOT hardcode approximate decimal strings \u2014 derive every constant from its formula. If the claim references a known constant (pi, e, zeta, golden ratio), use the mpmath built-in, not a pasted decimal.' },
  { id: 'reframe', label: 'Reframe', icon: Target,
    color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    guidance: 'The hypothesis was poorly framed \u2014 it tested the wrong property of the claim. Re-read the claim carefully. Identify the core testable assertion and formulate a precise, falsifiable hypothesis. The test should directly verify what the claim actually states, not a tangential property.' },
  { id: 'simplify', label: 'Simplify', icon: Minimize2,
    color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800',
    guidance: 'Previous code was too complex and crashed. Write MINIMAL code: one or two imports, one computation, one comparison. Avoid loops over large ranges, nested classes, multi-step pipelines, or elaborate error handling. The simplest possible test that verifies the core claim.' },
  { id: 'different_angle', label: 'Different Angle', icon: Lightbulb,
    color: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800',
    guidance: 'The verification approach was fundamentally wrong for this type of claim. Try a completely different strategy \u2014 if numerical comparison failed try symbolic proof, if algebraic approach failed try geometric or combinatorial reasoning, if direct computation failed try verifying a known consequence of the claim instead.' },
  { id: 'narrow_focus', label: 'Narrow Focus', icon: Target,
    color: 'text-cyan-600 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800',
    guidance: 'The claim is too broad to test as a whole. Identify the single most specific, computationally testable sub-claim and verify ONLY that. For example, if the claim says "X has properties A, B, and C", pick the most concrete one (e.g., a specific numerical identity or threshold value) and test it rigorously.' },
];

const FACT_CATEGORY_COLORS = {
  definition: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  quantitative: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  relationship: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  mechanism: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  constraint: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  observation: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
};
const FACT_CATEGORIES = ['definition', 'quantitative', 'relationship', 'mechanism', 'constraint', 'observation'];

const STANDARD_RESULT_FIELDS = new Set(['verified', 'confidence', 'explanation', 'halt', 'rejection_reason', 'confidence_ceiling']);

// ─── Sub-components ─────────────────────────────────────────────

function SandboxOutput({ stdout, stderr, evidence }) {
  const [showRaw, setShowRaw] = useState(false);
  let parsed = null;
  let resultObj = null;
  let customFields = [];

  if (stdout) {
    try {
      parsed = JSON.parse(stdout.trim());
      resultObj = parsed?.result;
      if (resultObj && typeof resultObj === 'object' && !Array.isArray(resultObj)) {
        customFields = Object.entries(resultObj).filter(([k]) => !STANDARD_RESULT_FIELDS.has(k));
      }
    } catch { /* Not valid JSON */ }
  }
  const hasStructured = customFields.length > 0;
  const formatValue = (v) => {
    if (v === true) return <span className="text-green-400 font-medium">true</span>;
    if (v === false) return <span className="text-red-400 font-medium">false</span>;
    if (v === null || v === undefined) return <span className="text-gray-500 italic">null</span>;
    if (typeof v === 'number') return <span className="text-cyan-400 font-mono">{v}</span>;
    if (typeof v === 'object') return <span className="text-gray-300 font-mono">{JSON.stringify(v, null, 2)}</span>;
    return <span className="text-gray-300">{String(v)}</span>;
  };

  return (
    <div className="space-y-3">
      {hasStructured && (
        <div>
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
            <FlaskConical size={12} /> Computed Output
          </h4>
          <div className="bg-gray-900 rounded-lg p-3 overflow-x-auto">
            <table className="text-xs w-full">
              <tbody>
                {customFields.map(([key, val]) => (
                  <tr key={key} className="border-b border-gray-800 last:border-0">
                    <td className="text-amber-400 font-mono py-1.5 pr-4 whitespace-nowrap align-top">{key}</td>
                    <td className="py-1.5 whitespace-pre-wrap break-words">{formatValue(val)}</td>
                  </tr>
                ))}
                {resultObj?.explanation && (
                  <tr className="border-b border-gray-800 last:border-0">
                    <td className="text-gray-500 font-mono py-1.5 pr-4 whitespace-nowrap align-top">explanation</td>
                    <td className="text-gray-400 py-1.5 whitespace-pre-wrap break-words">{resultObj.explanation}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {/* Evidence items (new lab architecture) */}
      {evidence && (() => { try { const items = JSON.parse(evidence); if (Array.isArray(items) && items.length > 0) return (
        <div>
          <h4 className="text-xs font-medium text-cyan-600 dark:text-cyan-400 mb-1.5 flex items-center gap-1"><Terminal size={12} /> Evidence ({items.length} items)</h4>
          <div className="space-y-2">
            {items.map((item, i) => {
              // Semantic rendering for known evidence types
              const itemData = typeof item.data === 'string' ? (() => { try { return JSON.parse(item.data); } catch { return null; } })() : item.data;
              const isVerdict = item.label === 'verdict' && itemData && typeof itemData === 'object' && itemData.verdict;
              const isSpec = item.label === 'spec' && itemData && typeof itemData === 'object' && itemData.specType;
              const isExecMeta = item.label === 'execution_meta' && itemData && typeof itemData === 'object';
              if (isVerdict) return <div key={i}><VerdictCard data={itemData} /></div>;
              if (isSpec) return <div key={i}><SpecCard data={itemData} /></div>;
              if (isExecMeta) return <div key={i}><ExecMetaCard data={itemData} /></div>;
              return (
                <div key={i} className="bg-gray-50 dark:bg-gray-800 rounded-lg p-2.5 border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">{item.label}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{item.type}</span>
                  </div>
                  <pre className="text-xs bg-gray-900 text-gray-300 rounded p-2 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{
                    typeof item.data === 'string' ? (item.data.length > 2000 ? item.data.slice(0, 2000) + '...' : item.data) : JSON.stringify(item.data, null, 2)
                  }</pre>
                </div>
              );
            })}
          </div>
        </div>
      ); } catch { /* not valid JSON */ } return null; })()}

      {/* Raw output — always collapsed by default, toggle to expand */}
      {(stdout || stderr) && (
        <div>
          <button onClick={() => setShowRaw(!showRaw)}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1">
            <Terminal size={12} />
            {showRaw ? 'Hide raw output' : 'Show raw output'}
          </button>
          {showRaw && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-1.5">
              {stdout && (
                <div>
                  <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1"><Terminal size={12} /> Lab Results</h4>
                  <pre className="text-xs bg-gray-900 text-gray-300 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">
                    {parsed ? JSON.stringify(parsed, null, 2) : stdout}
                  </pre>
                </div>
              )}
              {stderr && (
                <div>
                  <h4 className="text-xs font-medium text-red-500 dark:text-red-400 mb-1 flex items-center gap-1"><Terminal size={12} /> Error</h4>
                  <pre className="text-xs bg-gray-900 text-red-400 rounded-lg p-3 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap break-words">{stderr}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GuidedRestatementPanel({ nodeId, onRetryStarted }) {
  const [guidanceText, setGuidanceText] = useState('');
  const [activePreset, setActivePreset] = useState(null);
  const queryClient = useQueryClient();

  const retryMutation = useMutation({
    mutationFn: (guidance) => evm.verify(nodeId, guidance || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-recent'] });
      queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lab', 'history', nodeId] });
      queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
      queryClient.invalidateQueries({ queryKey: ['lab-queue-stats'] });
      if (onRetryStarted) onRetryStarted();
    },
  });
  const suggestMutation = useMutation({
    mutationFn: () => evm.suggest(nodeId),
    onSuccess: (data) => { if (data?.suggestion) { setGuidanceText(data.suggestion); setActivePreset(null); } },
  });

  const handlePresetClick = (preset) => {
    if (activePreset === preset.id) { setActivePreset(null); setGuidanceText(''); }
    else { setActivePreset(preset.id); setGuidanceText(preset.guidance); }
  };
  const handleSubmit = () => {
    if (!guidanceText.trim()) return;
    retryMutation.mutate(guidanceText.trim());
    if (onRetryStarted) onRetryStarted();
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare size={14} className="text-gray-500 dark:text-gray-400" />
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Restate Verification</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {RESTATEMENT_PRESETS.map((preset) => {
          const Icon = preset.icon;
          const isActive = activePreset === preset.id;
          return (
            <button key={preset.id} onClick={() => handlePresetClick(preset)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                isActive ? preset.color + ' ring-1 ring-current'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}>
              <Icon size={12} /> {preset.label}
            </button>
          );
        })}
      </div>
      <textarea value={guidanceText} onChange={(e) => { setGuidanceText(e.target.value); setActivePreset(null); }}
        placeholder="Type custom guidance or click a preset above..." rows={3}
        className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:focus:ring-blue-500 placeholder-gray-400 dark:placeholder-gray-500 resize-y" />
      {suggestMutation.isSuccess && suggestMutation.data?.diagnosis && (
        <div className="bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800 rounded-md px-3 py-2">
          <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">LLM Diagnosis</span>
          <p className="text-sm text-indigo-800 dark:text-indigo-300 mt-0.5">{suggestMutation.data.diagnosis}</p>
          {suggestMutation.data.category && (
            <span className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-1 inline-block">{suggestMutation.data.category.replace(/_/g, ' ')}</span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between">
        <button onClick={() => suggestMutation.mutate()} disabled={suggestMutation.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition-colors">
          {suggestMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {suggestMutation.isPending ? 'Thinking...' : 'Ask LLM'}
        </button>
        <button onClick={handleSubmit} disabled={!guidanceText.trim() || retryMutation.isPending}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 dark:bg-blue-700 text-white hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {retryMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : retryMutation.data?.status === 'queued' ? <Clock size={12} /> : <Send size={12} />}
          {retryMutation.isPending ? 'Queueing...' : retryMutation.data?.status === 'queued' ? 'Queued' : 'Retry with Guidance'}
        </button>
      </div>
      {retryMutation.isSuccess && retryMutation.data?.status === 'queued' && <div className="text-xs text-blue-600 dark:text-blue-400">Queued for verification — the worker will process it shortly.</div>}
      {retryMutation.isSuccess && retryMutation.data?.status !== 'queued' && <div className="text-xs text-green-600 dark:text-green-400">Restatement submitted — check results below.</div>}
      {retryMutation.isError && <div className="text-xs text-red-500">{retryMutation.error?.response?.data?.error || retryMutation.error?.message || 'Retry failed'}</div>}
      {suggestMutation.isError && <div className="text-xs text-red-500">LLM suggestion failed: {suggestMutation.error?.response?.data?.error || suggestMutation.error?.message || 'Error'}</div>}
    </div>
  );
}

// ─── Semantic artifact renderers ─────────────────────────────────

function VerdictCard({ data }) {
  // Two paths to fielded critique data:
  //   1. Preferred — `structuredDetails` is a real object straight from the lab.
  //   2. Legacy — older lab versions stuffed a JSON-encoded object into `details`.
  // We accept both so freshly-produced rows render through path 1 while existing
  // rows in the DB (the 24% double-encoded ones) render through path 2.
  const merged = { ...data };

  function mergeFields(parsed) {
    if (!parsed || typeof parsed !== 'object') return;
    if (parsed.critique && !merged.critique) merged.critique = parsed.critique;
    if (parsed.action && !merged.action) merged.action = parsed.action;
    if (parsed.correctedVerdict && !merged.correctedVerdict) merged.correctedVerdict = parsed.correctedVerdict;
    if (parsed.correctedConfidence != null && merged.correctedConfidence == null) merged.correctedConfidence = parsed.correctedConfidence;
    if (parsed.methodologyScore != null && merged.methodologyScore == null) merged.methodologyScore = parsed.methodologyScore;
    if (parsed.issues && !merged.issues) merged.issues = parsed.issues;
    if (parsed.guidance && !merged.guidance) merged.guidance = parsed.guidance;
    if (parsed.scores && !merged.scores) merged.scores = parsed.scores;
    if (parsed.recommendation && !merged.recommendation) merged.recommendation = parsed.recommendation;
    if (parsed.suggestion && !merged.suggestion) merged.suggestion = parsed.suggestion;
    if (parsed.rewrittenClaim && !merged.rewrittenClaim) merged.rewrittenClaim = parsed.rewrittenClaim;
  }

  // Path 1: structured payload from the lab
  if (data.structuredDetails && typeof data.structuredDetails === 'object') {
    mergeFields(data.structuredDetails);
  }

  // Path 2: legacy JSON-encoded `details`
  if (typeof data.details === 'string' && data.details.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(data.details);
      if (parsed && typeof parsed === 'object') {
        mergeFields(parsed);
        // Replace `details` with prose only — never the raw JSON blob.
        merged.details = parsed.critique || parsed.details || null;
      }
    } catch { /* not JSON, keep as-is */ }
  }

  const v = merged.verdict?.toLowerCase();
  const conf = typeof merged.confidence === 'number' ? merged.confidence : null;
  const badge = v === 'supported' ? { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', border: 'border-green-200 dark:border-green-800' }
    : v === 'refuted' ? { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', border: 'border-red-200 dark:border-red-800' }
    : { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' };

  const scores = merged.scores && typeof merged.scores === 'object' ? Object.entries(merged.scores) : null;

  return (
    <div className={`rounded-lg border ${badge.border} ${badge.bg} p-3 space-y-2.5`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold uppercase tracking-wide ${badge.text}`}>{merged.verdict || 'unknown'}</span>
          {merged.action && (
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              merged.action === 'confirm' ? 'bg-green-200/60 dark:bg-green-800/40 text-green-700 dark:text-green-400' :
              merged.action === 'correct' ? 'bg-amber-200/60 dark:bg-amber-800/40 text-amber-700 dark:text-amber-400' :
              'bg-blue-200/60 dark:bg-blue-800/40 text-blue-700 dark:text-blue-400'
            }`}>{merged.action}</span>
          )}
        </div>
        {conf !== null && (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${v === 'supported' ? 'bg-green-500' : v === 'refuted' ? 'bg-red-500' : 'bg-amber-500'}`}
                   style={{ width: `${Math.round(conf * 100)}%` }} />
            </div>
            <span className={`text-xs font-medium tabular-nums ${badge.text}`}>{Math.round(conf * 100)}%</span>
          </div>
        )}
      </div>
      {/* Critique methodology score */}
      {merged.methodologyScore != null && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Methodology</span>
          <div className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden max-w-32">
            <div className={`h-full rounded-full ${merged.methodologyScore >= 0.7 ? 'bg-green-500' : merged.methodologyScore >= 0.4 ? 'bg-amber-500' : 'bg-red-500'}`}
                 style={{ width: `${Math.round(merged.methodologyScore * 100)}%` }} />
          </div>
          <span className="text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">{Math.round(merged.methodologyScore * 100)}%</span>
        </div>
      )}
      {/* Corrected verdict if different */}
      {merged.correctedVerdict && merged.correctedVerdict !== merged.verdict && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Corrected to:</span>
          <span className={`text-xs font-semibold uppercase ${
            merged.correctedVerdict === 'supported' ? 'text-green-600 dark:text-green-400' :
            merged.correctedVerdict === 'refuted' ? 'text-red-600 dark:text-red-400' :
            'text-amber-600 dark:text-amber-400'
          }`}>{merged.correctedVerdict}</span>
          {merged.correctedConfidence != null && (
            <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">({Math.round(merged.correctedConfidence * 100)}%)</span>
          )}
        </div>
      )}
      {merged.details && (
        <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">{merged.details}</p>
      )}
      {merged.recommendation && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500 dark:text-gray-400">Recommendation:</span>
          <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
            merged.recommendation === 'keep' || merged.recommendation === 'promote' ? 'bg-green-200/50 dark:bg-green-800/30 text-green-700 dark:text-green-400' :
            merged.recommendation === 'delete' || merged.recommendation === 'demote' ? 'bg-red-200/50 dark:bg-red-800/30 text-red-700 dark:text-red-400' :
            'bg-amber-200/50 dark:bg-amber-800/30 text-amber-700 dark:text-amber-400'
          }`}>{merged.recommendation}</span>
        </div>
      )}
      {scores && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1.5 pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
          {scores.map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span className="text-xs text-gray-500 dark:text-gray-400 capitalize truncate">{key}</span>
              <div className="flex-1 h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden min-w-8">
                <div className={`h-full rounded-full ${Number(val) >= 7 ? 'bg-green-500' : Number(val) >= 4 ? 'bg-amber-500' : 'bg-red-500'}`}
                     style={{ width: `${Math.round((Number(val) / 10) * 100)}%` }} />
              </div>
              <span className="text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300 w-4 text-right">{val}</span>
            </div>
          ))}
        </div>
      )}
      {merged.issues && Array.isArray(merged.issues) && merged.issues.length > 0 && (
        <div className="pt-1 border-t border-gray-200/50 dark:border-gray-700/50 space-y-1">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Issues</span>
          <ul className="space-y-0.5">
            {merged.issues.map((issue, i) => (
              <li key={i} className="text-xs text-gray-600 dark:text-gray-400 flex gap-1.5">
                <span className="text-red-400 shrink-0 mt-0.5">&bull;</span>
                <span>{issue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {merged.rewrittenClaim && (
        <div className="pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
          <span className="text-xs font-medium text-blue-500 dark:text-blue-400">Rewritten Claim</span>
          <p className="text-xs text-gray-700 dark:text-gray-200 mt-0.5 whitespace-pre-wrap bg-white/50 dark:bg-gray-800/50 rounded p-2 border border-blue-200/50 dark:border-blue-800/50">{merged.rewrittenClaim}</p>
        </div>
      )}
      {merged.suggestion && (
        <div className="pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Suggestion</span>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">{merged.suggestion}</p>
        </div>
      )}
      {merged.guidance && (
        <div className="pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
          <span className="text-xs font-medium text-blue-500 dark:text-blue-400">Corrective Guidance</span>
          <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5 whitespace-pre-wrap">{merged.guidance}</p>
        </div>
      )}
    </div>
  );
}

function SpecSetupValue({ k, val }) {
  const [expanded, setExpanded] = useState(false);
  // Simple scalar values
  if (val == null) return <span className="text-gray-400 italic">null</span>;
  if (typeof val === 'boolean') return <span className={val ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{String(val)}</span>;
  if (typeof val === 'number') return <span className="text-cyan-600 dark:text-cyan-400 font-mono">{val}</span>;
  if (typeof val === 'string') {
    // Short strings render inline
    if (val.length <= 120) return <span className="text-gray-700 dark:text-gray-300">{val}</span>;
    // Long strings — truncate with expand
    return (
      <div>
        <span className="text-gray-700 dark:text-gray-300">{expanded ? val : val.slice(0, 120)}</span>
        <button onClick={() => setExpanded(!expanded)} className="text-indigo-500 dark:text-indigo-400 ml-1 hover:underline">
          {expanded ? 'less' : `...+${val.length - 120}`}
        </button>
      </div>
    );
  }
  // Arrays — render compact or expanded
  if (Array.isArray(val)) {
    if (val.length <= 5 && val.every(v => typeof v !== 'object')) {
      return <span className="text-gray-700 dark:text-gray-300 font-mono">[{val.join(', ')}]</span>;
    }
    return (
      <div>
        <button onClick={() => setExpanded(!expanded)} className="text-indigo-500 dark:text-indigo-400 hover:underline">
          {expanded ? 'collapse' : `array(${val.length})`}
        </button>
        {expanded && <pre className="text-xs bg-gray-900/50 text-gray-300 rounded p-1.5 mt-0.5 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>}
      </div>
    );
  }
  // Objects — collapsible
  const str = JSON.stringify(val);
  if (str.length <= 80) return <span className="text-gray-700 dark:text-gray-300 font-mono">{str}</span>;
  return (
    <div>
      <button onClick={() => setExpanded(!expanded)} className="text-indigo-500 dark:text-indigo-400 hover:underline">
        {expanded ? 'collapse' : `{${Object.keys(val).length} keys}`}
      </button>
      {expanded && <pre className="text-xs bg-gray-900/50 text-gray-300 rounded p-1.5 mt-0.5 overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">{JSON.stringify(val, null, 2)}</pre>}
    </div>
  );
}

function SpecCard({ data }) {
  const [showRaw, setShowRaw] = useState(false);

  // For experiment_review specs, extract the key fields for a cleaner display
  const isReview = data.specType === 'experiment_review';
  const setup = data.setup || {};
  // Separate human-readable fields from technical metadata
  const primaryFields = isReview
    ? ['claim', 'claimDomain', 'claimType', 'labVerdict', 'labConfidence', 'labDetails', 'labName']
    : null;
  const secondaryFields = isReview
    ? Object.keys(setup).filter(k => !primaryFields.includes(k))
    : null;

  return (
    <div className="rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/20 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">{data.specType || 'experiment'}</span>
        <button onClick={() => setShowRaw(!showRaw)} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          {showRaw ? 'Structured' : 'Raw JSON'}
        </button>
      </div>
      {showRaw ? (
        <pre className="text-xs bg-gray-900 text-gray-300 rounded p-2 overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre>
      ) : (
        <>
          {data.hypothesis && (
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Hypothesis</span>
              <p className="text-xs text-gray-800 dark:text-gray-200 mt-0.5 leading-relaxed">{data.hypothesis}</p>
            </div>
          )}
          {isReview && setup.claim && (
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Original Claim</span>
              <p className="text-xs text-gray-800 dark:text-gray-200 mt-0.5 leading-relaxed">{setup.claim}</p>
            </div>
          )}
          {isReview && (setup.labVerdict || setup.labConfidence != null) && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center">
              {setup.labVerdict && (
                <span className={`text-xs font-semibold uppercase ${
                  setup.labVerdict === 'supported' ? 'text-green-600 dark:text-green-400' :
                  setup.labVerdict === 'refuted' ? 'text-red-600 dark:text-red-400' :
                  'text-amber-600 dark:text-amber-400'
                }`}>Original: {setup.labVerdict}</span>
              )}
              {setup.labConfidence != null && <span className="text-xs text-gray-500 tabular-nums">{Math.round(setup.labConfidence * 100)}% confidence</span>}
              {setup.labName && <span className="text-xs text-cyan-600 dark:text-cyan-400">{setup.labName}</span>}
              {setup.claimDomain && <span className="text-xs text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">{setup.claimDomain}</span>}
            </div>
          )}
          {isReview && setup.labDetails && (
            <div>
              <span className="text-xs text-gray-500 dark:text-gray-400">Original Lab Analysis</span>
              <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 leading-relaxed whitespace-pre-wrap">{setup.labDetails}</p>
            </div>
          )}
          {/* Standard setup for non-review specs */}
          {!isReview && setup && typeof setup === 'object' && (
            <div className="space-y-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Setup</span>
              <div className="grid gap-1">
                {Object.entries(setup).map(([k, val]) => (
                  <div key={k} className="flex gap-2 text-xs items-start">
                    <span className="text-indigo-500 dark:text-indigo-400 font-mono shrink-0">{k}:</span>
                    <SpecSetupValue k={k} val={val} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Secondary fields for review specs (parents, originalSpec, etc.) */}
          {isReview && secondaryFields && secondaryFields.length > 0 && (
            <div className="space-y-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Technical Details</span>
              <div className="grid gap-1">
                {secondaryFields.map(k => (
                  <div key={k} className="flex gap-2 text-xs items-start">
                    <span className="text-indigo-500 dark:text-indigo-400 font-mono shrink-0">{k}:</span>
                    <SpecSetupValue k={k} val={setup[k]} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExecMetaCard({ data }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs px-3 py-2 bg-gray-50 dark:bg-gray-800/60 rounded-lg border border-gray-200 dark:border-gray-700">
      {data.success != null && (
        <span className="flex items-center gap-1">
          {data.success ? <CheckCircle2 size={11} className="text-green-500" /> : <XCircle size={11} className="text-red-500" />}
          <span className={data.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{data.success ? 'Success' : 'Failed'}</span>
        </span>
      )}
      {data.exitCode != null && <span className="text-gray-500 dark:text-gray-400">Exit: <span className={`font-mono font-medium ${data.exitCode === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{data.exitCode}</span></span>}
      {data.executionTimeMs != null && <span className="text-gray-500 dark:text-gray-400">Time: <span className="font-medium text-gray-700 dark:text-gray-300">{data.executionTimeMs >= 1000 ? `${(data.executionTimeMs / 1000).toFixed(1)}s` : `${data.executionTimeMs}ms`}</span></span>}
      {data.attempt != null && data.attempt > 1 && <span className="text-gray-500 dark:text-gray-400">Attempt: <span className="font-medium text-orange-600 dark:text-orange-400">{data.attempt}</span></span>}
      {data.killed && <span className="text-red-500 font-medium">Killed (timeout)</span>}
    </div>
  );
}

function ArtifactViewer({ url: rawUrl, type, filename }) {
  // Strip /api prefix if present — the axios instance already has baseURL: '/api'
  const url = rawUrl?.startsWith('/api/') ? rawUrl.slice(4) : rawUrl;
  const [content, setContent] = useState(null);
  const [imageSrc, setImageSrc] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isText = type?.startsWith('text/') || type === 'application/json';
  const isImage = type?.startsWith('image/');
  const isPython = type === 'text/x-python' || filename?.endsWith('.py');
  const baseName = filename?.split('/')?.pop()?.toLowerCase();
  const isSemantic = baseName === 'verdict.json' || baseName === 'spec.json' || baseName === 'execution_meta.json';

  const loadContent = async () => {
    if (content !== null || !isText) return;
    setLoading(true);
    try {
      const resp = await api.get(url, { responseType: 'text', transformResponse: [d => d] });
      if (resp.data) setContent(resp.data);
    } catch { /* non-fatal */ }
    setLoading(false);
  };

  const loadImage = async () => {
    if (imageSrc || !isImage) return;
    setLoading(true);
    try {
      const resp = await api.get(url, { responseType: 'blob' });
      setImageSrc(URL.createObjectURL(resp.data));
    } catch { /* non-fatal */ }
    setLoading(false);
  };

  const handleDownload = async () => {
    try {
      const resp = await api.get(url, { responseType: 'blob' });
      const blobUrl = URL.createObjectURL(resp.data);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename || 'artifact';
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { /* non-fatal */ }
  };

  // Try semantic rendering for known JSON artifacts
  const renderSemantic = () => {
    if (!content || !isSemantic) return null;
    try {
      const parsed = JSON.parse(content);
      if (baseName === 'verdict.json') return <VerdictCard data={parsed} />;
      if (baseName === 'spec.json') return <SpecCard data={parsed} />;
      if (baseName === 'execution_meta.json') return <ExecMetaCard data={parsed} />;
    } catch { /* fall through to raw */ }
    return null;
  };

  if (!expanded) {
    return (
      <button onClick={() => { setExpanded(true); if (isText) loadContent(); if (isImage) loadImage(); }}
              className="text-xs text-podbit-600 dark:text-podbit-400 hover:underline">
        View
      </button>
    );
  }

  const semanticView = renderSemantic();

  return (
    <div className="mt-1 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1 bg-gray-100 dark:bg-gray-800 text-xs">
        <span className="font-mono text-gray-600 dark:text-gray-400 truncate">{filename}</span>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={handleDownload} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" title="Download">
            <ExternalLink size={11} />
          </button>
          <button onClick={() => setExpanded(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={11} />
          </button>
        </div>
      </div>
      {isImage && loading && <div className="p-3 text-xs text-gray-400">Loading image...</div>}
      {isImage && imageSrc && (
        <img src={imageSrc} alt={filename} className="max-w-full max-h-80 mx-auto p-2" />
      )}
      {isText && loading && (
        <div className="p-3 text-xs text-gray-400">Loading...</div>
      )}
      {isText && content !== null && (
        semanticView
          ? <div className="p-2">{semanticView}</div>
          : <pre className={`text-xs p-3 overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap break-words ${
              isPython ? 'bg-gray-900 text-green-400' :
              type === 'application/json' ? 'bg-gray-900 text-amber-300' :
              'bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300'
            }`}>{type === 'application/json' ? (() => { try { return JSON.stringify(JSON.parse(content), null, 2); } catch { return content; } })() : content}</pre>
      )}
      {!isText && !isImage && (
        <div className="p-3 text-xs text-gray-400">
          Binary file ({type}) — <button onClick={handleDownload} className="text-podbit-600 dark:text-podbit-400 hover:underline">Download</button>
        </div>
      )}
    </div>
  );
}

function LabTraceability({ exec }) {
  const [showSpec, setShowSpec] = useState(false);
  const [artifacts, setArtifacts] = useState(null);
  const [loadingArtifacts, setLoadingArtifacts] = useState(false);

  const loadArtifacts = async () => {
    if (!exec.artifact_zip_id || artifacts) return;
    setLoadingArtifacts(true);
    try {
      const resp = await api.get(`/lab/evidence/${exec.artifact_zip_id}/artifacts`);
      if (resp.data) {
        setArtifacts(resp.data.artifacts || []);
      }
    } catch { /* non-fatal */ }
    setLoadingArtifacts(false);
  };

  let spec = null;
  try { if (exec.spec) spec = JSON.parse(exec.spec); } catch { /* */ }

  // Group artifacts by category based on path
  const groupArtifacts = (list) => {
    const groups = { prompts: [], responses: [], code: [], output: [], errors: [], other: [] };
    for (const a of list) {
      const f = a.filename.toLowerCase();
      if (f.startsWith('prompts/') || f.includes('prompt')) groups.prompts.push(a);
      else if (f.startsWith('responses/') || f.includes('response') || f.includes('raw')) groups.responses.push(a);
      else if (f.startsWith('code/') || f.endsWith('.py')) groups.code.push(a);
      else if (f.startsWith('errors/')) groups.errors.push(a);
      else if (f === 'stdout.txt' || f === 'stderr.txt' || f === 'verdict.json' || f === 'execution_meta.json' || f === 'spec.json') groups.output.push(a);
      else groups.other.push(a);
    }
    return Object.entries(groups).filter(([, v]) => v.length > 0);
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700 rounded-lg p-3 space-y-2">
      <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider flex items-center gap-1">
        <FlaskConical size={12} /> Lab Experiment
      </h4>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {(exec.lab_name || exec.lab_id) && <span>Lab: <span className="font-medium text-cyan-600 dark:text-cyan-400">{exec.lab_name || exec.lab_id}</span></span>}
        {exec.lab_job_id && <span>Job: <span className="font-mono text-gray-600 dark:text-gray-300">{exec.lab_job_id.slice(0, 12)}...</span></span>}
        {exec.template_id && <span>Template: <span className="font-medium text-gray-600 dark:text-gray-300">{exec.template_id}</span></span>}
      </div>

      {spec && (
        <div>
          <button onClick={() => setShowSpec(!showSpec)}
                  className="text-xs text-podbit-600 dark:text-podbit-400 hover:underline flex items-center gap-1">
            <Code2 size={11} /> {showSpec ? 'Hide' : 'Show'} Experiment Spec
          </button>
          {showSpec && (
            <div className="mt-1">
              <SpecCard data={spec} />
            </div>
          )}
        </div>
      )}

      {exec.artifact_zip_id && (
        <div>
          {!artifacts ? (
            <button onClick={loadArtifacts} disabled={loadingArtifacts}
                    className="text-xs text-podbit-600 dark:text-podbit-400 hover:underline flex items-center gap-1 disabled:opacity-50">
              <Database size={11} /> {loadingArtifacts ? 'Loading...' : 'Load Lab Artifacts'}
            </button>
          ) : artifacts.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No artifacts found</p>
          ) : (
            <div className="space-y-2">
              {groupArtifacts(artifacts).map(([group, items]) => (
                <div key={group}>
                  <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 capitalize mb-1">
                    {group === 'other' ? 'Files' : group} ({items.length})
                  </h5>
                  <div className="space-y-1">
                    {items.map((a, i) => {
                      const artifactUrl = `/api/lab/evidence/${exec.artifact_zip_id}/artifacts/${a.filename}`;
                      return (
                        <div key={i} className="flex items-center gap-2 px-2 py-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-xs">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{
                            backgroundColor: a.type?.startsWith('text/x-python') ? '#22c55e' :
                              a.type === 'application/json' ? '#f59e0b' :
                              a.type?.startsWith('image/') ? '#8b5cf6' :
                              a.type?.startsWith('text/') ? '#6b7280' : '#94a3b8'
                          }} />
                          <span className="flex-1 truncate font-mono text-gray-700 dark:text-gray-300">{a.filename}</span>
                          <span className="text-gray-400 shrink-0 tabular-nums">{a.size > 1024 ? `${(a.size / 1024).toFixed(1)}KB` : `${a.size}B`}</span>
                          <ArtifactViewer url={artifactUrl} type={a.type} filename={a.filename} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!exec.lab_job_id && !exec.spec && !exec.artifact_zip_id && (
        <p className="text-xs text-gray-400 italic">No lab traceability data (pre-lab-architecture execution)</p>
      )}
    </div>
  );
}

function DecomposePanel({ nodeId }) {
  const [phase, setPhase] = useState('idle');
  const [result, setResult] = useState(null);
  const [applyResult, setApplyResult] = useState(null);
  const [facts, setFacts] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [error, setError] = useState(null);
  const queryClient = useQueryClient();

  const handleDecompose = async () => {
    setPhase('loading'); setError(null);
    try { const data = await evm.decompose(nodeId); setResult(data); setFacts(data.facts || []); setQuestions(data.questions || []); setPhase('preview'); }
    catch (err) { setError(err?.response?.data?.error || err?.message || 'Decomposition failed'); setPhase('idle'); }
  };
  const handleApply = async () => {
    setPhase('applying'); setError(null);
    try {
      const data = await evm.decomposeApply(nodeId, facts, questions); setApplyResult(data); setPhase('done');
      queryClient.invalidateQueries({ queryKey: ['lab-recent'] }); queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
    } catch (err) { setError(err?.response?.data?.error || err?.message || 'Apply failed'); setPhase('preview'); }
  };
  const handleCancel = () => { setPhase('idle'); setResult(null); setFacts([]); setQuestions([]); setError(null); };
  const updateFact = (index, field, value) => setFacts(prev => prev.map((f, i) => i === index ? { ...f, [field]: value } : f));
  const removeFact = (index) => setFacts(prev => prev.filter((_, i) => i !== index));
  const updateQuestion = (index, field, value) => setQuestions(prev => prev.map((q, i) => i === index ? { ...q, [field]: value } : q));
  const removeQuestion = (index) => setQuestions(prev => prev.filter((_, i) => i !== index));

  if (phase === 'idle') {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scissors size={14} className="text-teal-500 dark:text-teal-400" />
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Decompose Claim</span>
          </div>
          <button onClick={handleDecompose}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400 hover:bg-teal-200 dark:hover:bg-teal-900/50 transition-colors">
            <Scissors size={12} /> Split into Facts & Questions
          </button>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Split this claim into verifiable atomic facts and research questions.</p>
        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
      </div>
    );
  }
  if (phase === 'loading') {
    return (
      <div className="border border-teal-200 dark:border-teal-800 rounded-lg bg-teal-50 dark:bg-teal-950/20 p-4">
        <div className="flex items-center gap-2"><Loader2 size={14} className="animate-spin text-teal-500" /><span className="text-sm text-teal-700 dark:text-teal-400">Decomposing claim...</span></div>
      </div>
    );
  }
  if (phase === 'done' && applyResult) {
    return (
      <div className="border border-green-200 dark:border-green-800 rounded-lg bg-green-50 dark:bg-green-950/20 p-4">
        <div className="flex items-center gap-2 mb-2"><CheckCircle2 size={14} className="text-green-500" /><span className="text-sm font-medium text-green-700 dark:text-green-400">Decomposition Applied</span></div>
        <p className="text-sm text-green-800 dark:text-green-300">
          Created {applyResult.createdFacts?.length || 0} fact{(applyResult.createdFacts?.length || 0) !== 1 ? 's' : ''} and{' '}
          {applyResult.createdQuestions?.length || 0} question{(applyResult.createdQuestions?.length || 0) !== 1 ? 's' : ''}.
          {' '}Weight: {Number(applyResult.originalWeightBefore).toFixed(3)} &rarr; {Number(applyResult.originalWeightAfter).toFixed(3)}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-teal-200 dark:border-teal-800 rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4 space-y-4">
      <div className="flex items-center gap-2"><Scissors size={14} className="text-teal-500 dark:text-teal-400" /><span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">Claim Decomposition</span></div>
      {result?.summary && <p className="text-sm text-gray-600 dark:text-gray-400 italic">{result.summary}</p>}
      <div>
        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Known Facts ({facts.length})</h4>
        <div className="space-y-2">
          {facts.map((fact, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={fact.category} onChange={(e) => updateFact(i, 'category', e.target.value)}
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border-0 cursor-pointer ${FACT_CATEGORY_COLORS[fact.category] || 'bg-gray-100 text-gray-600'}`}>
                    {FACT_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                  <span className="text-[10px] text-gray-400">conf: {Number(fact.confidence).toFixed(2)}</span>
                </div>
                <button onClick={() => removeFact(i)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors shrink-0"><X size={12} /></button>
              </div>
              <textarea value={fact.content} onChange={(e) => updateFact(i, 'content', e.target.value)} rows={2}
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400 resize-y" />
            </div>
          ))}
          {facts.length === 0 && <p className="text-xs text-gray-400 italic">No facts extracted</p>}
        </div>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Research Questions ({questions.length})</h4>
        <div className="space-y-2">
          {questions.map((q, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Q{i + 1}</span>
                <button onClick={() => removeQuestion(i)} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors shrink-0"><X size={12} /></button>
              </div>
              <textarea value={q.content} onChange={(e) => updateQuestion(i, 'content', e.target.value)} rows={2}
                className="w-full text-sm rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-400 resize-y" />
              {q.reasoning && <p className="text-[10px] text-gray-400 mt-1 italic">Why: {q.reasoning}</p>}
            </div>
          ))}
          {questions.length === 0 && <p className="text-xs text-gray-400 italic">No research questions extracted</p>}
        </div>
      </div>
      {error && <div className="text-xs text-red-500">{error}</div>}
      <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
        <button onClick={handleCancel} disabled={phase === 'applying'}
          className="px-4 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">Cancel</button>
        <button onClick={handleApply} disabled={phase === 'applying' || (facts.length === 0 && questions.length === 0)}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium rounded-lg bg-teal-600 dark:bg-teal-700 text-white hover:bg-teal-700 dark:hover:bg-teal-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          {phase === 'applying' ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
          {phase === 'applying' ? 'Applying...' : `Apply Decomposition (${facts.length + questions.length} nodes)`}
        </button>
      </div>
    </div>
  );
}

function RecoveryProposal({ errorField }) {
  if (!errorField) return null;
  try {
    const proposal = JSON.parse(errorField);
    if (!proposal?.content) return null;
    return (
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded p-3">
        <h4 className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mb-1 flex items-center gap-1"><FlaskConical size={12} /> Recovery Proposal</h4>
        <p className="text-sm text-indigo-800 dark:text-indigo-300">{proposal.content}</p>
        {proposal.domain && <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">Domain: {proposal.domain}</p>}
      </div>
    );
  } catch { return null; }
}

// ─── Action buttons ─────────────────────────────────────────────

/** Renders a small badge for the execution outcome (supported, disproved, error, etc.). */
export function OutcomeBadge({ exec }) {
  const outcome = getOutcome(exec);
  const cfg = OUTCOME_CONFIG[outcome];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
}

/** Renders a horizontal bar and percentage for confidence 0–1. */
export function ConfidenceBar({ value }) {
  if (value == null) return <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-600 dark:text-gray-400">{pct}%</span>
    </div>
  );
}

function AnalyseButton({ nodeId }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => evm.analyse(nodeId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['lab-recent'] }); queryClient.invalidateQueries({ queryKey: ['lab', 'history', nodeId] }); },
  });
  return (
    <div className="space-y-2">
      <button onClick={(e) => { e.stopPropagation(); mutation.mutate(); }} disabled={mutation.isPending}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 disabled:opacity-50 transition-colors">
        {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Microscope size={12} />}
        {mutation.isPending ? 'Analysing...' : 'Analyse Rejection'}
        {mutation.isError && <span className="text-red-500 ml-1">{mutation.error?.response?.data?.error || mutation.error?.message || 'Failed'}</span>}
      </button>
      {mutation.isSuccess && mutation.data && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded p-3 text-sm" onClick={(e) => e.stopPropagation()}>
          <h4 className="text-xs font-medium text-indigo-700 dark:text-indigo-400 mb-1 flex items-center gap-1"><Microscope size={12} /> Analysis Result</h4>
          {mutation.data.message ? <p className="text-gray-500 dark:text-gray-400 italic">{mutation.data.message}</p> : (
            <>
              <p className="text-indigo-800 dark:text-indigo-300">{mutation.data.findings?.summary || 'No findings'}</p>
              {mutation.data.findings?.expectedValue && (
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">Expected: {mutation.data.findings.expectedValue} | Actual: {mutation.data.findings.actualValue}{mutation.data.findings.deviation && ` | Deviation: ${mutation.data.findings.deviation}`}</p>
              )}
              {mutation.data.findings?.alternativePattern && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Alternative: {mutation.data.findings.alternativePattern}{mutation.data.findings.alternativeConfidence != null && ` (${Math.round(mutation.data.findings.alternativeConfidence * 100)}%)`}</p>
              )}
              {mutation.data.recoveryProposed && <p className="text-xs text-green-600 dark:text-green-400 mt-1">Recovery node proposed</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function RetryButton({ nodeId }) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lab-recent'] });
    queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
    queryClient.invalidateQueries({ queryKey: ['lab', 'history', nodeId] });
  };
  const mutation = useMutation({ mutationFn: () => evm.verify(nodeId), onSuccess: invalidate, onError: invalidate });
  const isQueued = mutation.isSuccess && mutation.data?.status === 'queued';
  return (
    <button onClick={(e) => { e.stopPropagation(); mutation.mutate(); }} disabled={mutation.isPending || isQueued}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 transition-colors">
      {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : isQueued ? <Clock size={12} /> : <RefreshCw size={12} />}
      {mutation.isPending ? 'Queueing...' : isQueued ? 'Queued' : 'Retry'}
      {mutation.isError && <span className="text-red-500 ml-1">Failed</span>}
      {mutation.isSuccess && !isQueued && <span className="text-green-500 ml-1">Done</span>}
    </button>
  );
}

function DismissButton({ nodeId }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => evm.dismiss(nodeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lab-recent'] });
      queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
      queryClient.invalidateQueries({ queryKey: ['lab', 'history', nodeId] });
    },
  });
  return (
    <button onClick={(e) => { e.stopPropagation(); mutation.mutate(); }} disabled={mutation.isPending}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
      title="Dismiss \u2014 remove from attention view (keeps history)">
      {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
      {mutation.isPending ? 'Dismissing...' : 'Dismiss'}
    </button>
  );
}

function ReverifyButton({ nodeId }) {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['lab-recent'] });
    queryClient.invalidateQueries({ queryKey: ['lab-stats'] });
    queryClient.invalidateQueries({ queryKey: ['lab', 'history', nodeId] });
    queryClient.invalidateQueries({ queryKey: ['lab-queue'] });
    queryClient.invalidateQueries({ queryKey: ['lab-queue-stats'] });
  };
  const mutation = useMutation({ mutationFn: () => evm.verify(nodeId), onSuccess: invalidate, onError: invalidate });
  const isQueued = mutation.isSuccess && mutation.data?.status === 'queued';
  return (
    <button onClick={(e) => { e.stopPropagation(); mutation.mutate(); }} disabled={mutation.isPending || isQueued}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 transition-colors">
      {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : isQueued ? <Clock size={12} /> : <RotateCcw size={12} />}
      {mutation.isPending ? 'Queueing...' : isQueued ? 'Queued' : 'Re-verify'}
      {mutation.isError && <span className="text-red-500 ml-1">Failed</span>}
      {mutation.isSuccess && !isQueued && <span className="text-green-500 ml-1">Done</span>}
    </button>
  );
}

function ReviewButtons({ nodeId, status, exec, onReviewed }) {
  const queryClient = useQueryClient();
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ['lab-recent'] }); queryClient.invalidateQueries({ queryKey: ['lab-stats'] }); };
  const approveMutation = useMutation({
    mutationFn: () => evm.approveReview(nodeId, true),
    onSuccess: () => { invalidate(); if (onReviewed) setTimeout(onReviewed, 300); },
  });
  const rejectMutation = useMutation({
    mutationFn: () => evm.approveReview(nodeId, false),
    onSuccess: () => { invalidate(); if (onReviewed) setTimeout(onReviewed, 300); },
  });
  if (!['needs_review', 'needs_expert'].includes(status)) return null;

  // Extract LLM verdict from hypothesis field (format: "verdict — reviewFocus")
  const hypothesis = exec?.hypothesis || '';
  const verdictMatch = hypothesis.match(/^\[?(?:auto-approved\]\s*)?(\w+)\s*[—–-]\s*/i);
  const verdict = verdictMatch ? verdictMatch[1].toLowerCase() : null;
  const isLLMEval = exec?.test_category === 'structural' || exec?.test_category === 'domain_expert';
  const wb = exec?.weight_before != null ? Number(exec.weight_before) : null;
  const wa = exec?.weight_after != null ? Number(exec.weight_after) : null;
  const weightWillChange = isLLMEval && wa != null && wb != null && wa !== wb;
  const weightDelta = weightWillChange ? wa - wb : 0;

  // Build contextual labels
  let approveLabel, approveHint, rejectLabel, rejectHint;
  if (verdict === 'supported') {
    approveLabel = 'Accept: Claim Supported';
    approveHint = weightDelta > 0 ? `Weight +${weightDelta.toFixed(3)}` : 'No weight change';
    rejectLabel = 'Dismiss Evaluation';
    rejectHint = 'Discard — weight unchanged';
  } else if (verdict === 'unsupported') {
    approveLabel = 'Accept: Claim Unsupported';
    approveHint = weightDelta < 0 ? `Weight ${weightDelta.toFixed(3)}` : 'No weight change';
    rejectLabel = 'Dismiss Evaluation';
    rejectHint = 'Discard — weight unchanged';
  } else {
    approveLabel = 'Accept Evaluation';
    approveHint = weightWillChange ? `Weight → ${wa.toFixed(3)}` : 'No weight change';
    rejectLabel = 'Dismiss Evaluation';
    rejectHint = 'Discard — weight unchanged';
  }

  return (
    <div className="space-y-2">
      {/* Verdict context banner */}
      {verdict && (
        <div className={`text-xs rounded-md px-3 py-2 border ${
          verdict === 'supported' ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
          : verdict === 'unsupported' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
        }`}>
          <span className="font-semibold">LLM Verdict: {verdict}</span>
          {exec?.confidence != null && <span className="ml-2 opacity-75">({Math.round(exec.confidence * 100)}% confidence)</span>}
          {hypothesis.includes('—') && <p className="mt-0.5 opacity-80">{hypothesis.split('—').slice(1).join('—').trim()}</p>}
        </div>
      )}
      {/* Action buttons */}
      <div className="flex gap-2">
        <button onClick={(e) => { e.stopPropagation(); approveMutation.mutate(); }} disabled={approveMutation.isPending || rejectMutation.isPending}
          title={approveHint}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 disabled:opacity-50 transition-colors">
          <ThumbsUp size={12} /> {approveLabel}
          {weightWillChange && <span className={`ml-1 text-[10px] font-mono ${weightDelta > 0 ? 'text-green-600' : 'text-red-500'}`}>({weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(3)})</span>}
        </button>
        <button onClick={(e) => { e.stopPropagation(); rejectMutation.mutate(); }} disabled={approveMutation.isPending || rejectMutation.isPending}
          title={rejectHint}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors">
          <Scissors size={12} /> {rejectLabel}
        </button>
        {(approveMutation.isSuccess || rejectMutation.isSuccess) && <span className="text-xs text-green-600 dark:text-green-400 self-center">Done — advancing...</span>}
      </div>
    </div>
  );
}

// ─── Detail Modal ───────────────────────────────────────────────

/** Full-screen modal with execution details, node content, code, and review actions. */
export function VerificationDetailModal({ exec, onClose, onReviewed, navControls }) {
  const outcome = getOutcome(exec);
  const isAnalysis = outcome === 'analysis';
  const cfg = OUTCOME_CONFIG[outcome];
  const OutcomeIcon = cfg.icon;

  const { data: parentData } = useQuery({
    queryKey: ['lab-parents', exec.node_id],
    queryFn: () => evm.parents(exec.node_id),
    enabled: !!exec.node_id,
    staleTime: 60000,
  });
  const parents = parentData?.parents || [];

  // Resolve node names for exec and parents
  const [, _forceNames] = useState(0);
  useEffect(() => {
    const ids = [exec.node_id, ...parents.map(p => p.id)].filter(Boolean);
    if (ids.length > 0) resolveNodeNames(ids).then(() => _forceNames(n => n + 1));
  }, [exec.node_id, parents.length]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
    if (navControls) {
      if (e.key === 'ArrowLeft' && navControls.hasPrev) navControls.onPrev();
      if (e.key === 'ArrowRight' && navControls.hasNext) navControls.onNext();
    }
  }, [onClose, navControls]);
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKeyDown); document.body.style.overflow = ''; };
  }, [handleKeyDown]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl dark:shadow-black/50 w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`inline-flex items-center gap-1.5 text-sm px-3 py-1 rounded-full ${cfg.bg} ${cfg.text}`}><OutcomeIcon size={14} /> {cfg.label}</span>
            {exec.node_domain && <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">{exec.node_domain}</span>}
            {exec.test_category && (
              <span className={`text-xs font-medium ${TEST_CATEGORY_LABELS[exec.test_category]?.color || 'text-gray-500'}`}>
                {TEST_CATEGORY_LABELS[exec.test_category]?.label || exec.test_category}
              </span>
            )}
            <Link to={`/graph?node=${exec.node_id}`} className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 flex items-center gap-1" onClick={onClose}>
              <span className="font-mono">{getCachedName(exec.node_id)}</span> <ExternalLink size={10} />
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {navControls && (
              <>
                <button onClick={navControls.onPrev} disabled={!navControls.hasPrev} title="Previous (Left arrow)"
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors">
                  <ChevronLeft size={16} />
                </button>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums px-1">{navControls.position}</span>
                <button onClick={navControls.onNext} disabled={!navControls.hasNext} title="Next (Right arrow)"
                  className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 transition-colors">
                  <ChevronRight size={16} />
                </button>
                <span className="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
              </>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"><X size={18} /></button>
          </div>
        </div>

        {/* Body — key forces full remount on navigation so child state resets */}
        <div key={exec.id || exec.node_id} className="overflow-y-auto px-6 py-5 space-y-5 min-h-0">
          {exec.node_content && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Claim</h4>
              <p className="text-sm text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700 whitespace-pre-wrap break-words"><VariableRefText>{exec.node_content}</VariableRefText></p>
            </div>
          )}
          {parents.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Source Nodes ({parents.length})</h4>
              <div className="space-y-1.5">
                {parents.map((p, i) => (
                  <div key={p.id || i} className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Link to={`/graph?node=${p.id}`} className="text-[10px] font-mono text-blue-500 hover:underline" onClick={onClose}>{getCachedName(p.id)}</Link>
                      {p.domain && <span className="text-[10px] text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">{p.domain}</span>}
                      {p.node_type && <span className="text-[10px] text-gray-400">{p.node_type}</span>}
                      {p.created_at && <span className="text-[10px] text-gray-400 ml-auto" title={new Date(p.created_at.endsWith?.('Z') ? p.created_at : p.created_at + 'Z').toLocaleString()}>{formatNodeTime(p.created_at)}</span>}
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap"><VariableRefText>{p.content}</VariableRefText></p>
                  </div>
                ))}
              </div>
            </div>
          )}
          {isAnalysis && (
            <div className={`border rounded-lg p-4 ${exec.verified === 1 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800' : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
              <h4 className="text-sm font-medium text-indigo-700 dark:text-indigo-400 mb-2 flex items-center gap-1.5"><Microscope size={14} /> {exec.verified === 1 ? 'Interesting Findings' : 'No Alternative Pattern Found'}</h4>
              {exec.hypothesis && <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{exec.hypothesis}</p>}
              {exec.confidence != null && exec.verified === 1 && <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2">Alternative confidence: {Math.round(exec.confidence * 100)}%</p>}
            </div>
          )}
          {isAnalysis && <RecoveryProposal errorField={exec.error} />}
          {outcome === 'code_error' && exec.error && (
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-orange-700 dark:text-orange-400 mb-2 flex items-center gap-1.5"><Bug size={14} /> Code Error</h4>
              <p className="text-sm text-orange-800 dark:text-orange-300 font-mono whitespace-pre-wrap break-words">{exec.error}</p>
            </div>
          )}
          {outcome === 'error' && exec.error && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <h4 className="text-sm font-medium text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5"><AlertTriangle size={14} /> Pipeline Error</h4>
              <p className="text-sm text-amber-800 dark:text-amber-300 whitespace-pre-wrap break-words">{exec.error}</p>
            </div>
          )}
          {outcome === 'skipped' && exec.error && (
            <div className="bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2 flex items-center gap-1.5"><SkipForward size={14} /> Why Not Testable</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{exec.error.replace(/^Not reducible to test spec:\s*/i, '')}</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(outcome === 'supported' || outcome === 'disproved') && (
              <>
                <ReverifyButton nodeId={exec.node_id} />
                {outcome === 'disproved' && <AnalyseButton nodeId={exec.node_id} />}
              </>
            )}
            {(outcome === 'error' || outcome === 'code_error' || outcome === 'skipped') && (
              <>
                <RetryButton nodeId={exec.node_id} />
                <DismissButton nodeId={exec.node_id} />
              </>
            )}
            {(outcome === 'needs_review' || outcome === 'needs_expert') && (
              <>
                <ReviewButtons key={exec.id} nodeId={exec.node_id} status={exec.status} exec={exec} onReviewed={onReviewed} />
                <RetryButton nodeId={exec.node_id} />
              </>
            )}
          </div>
          {['code_error', 'error', 'disproved', 'skipped', 'needs_review', 'needs_expert'].includes(outcome) && (
            <GuidedRestatementPanel nodeId={exec.node_id} onRetryStarted={onClose} />
          )}
          {exec.node_id && <DecomposePanel nodeId={exec.node_id} />}
          {exec.guidance && (
            <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md px-3 py-2">
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1"><MessageSquare size={11} /> Guidance Used</span>
              <p className="text-sm text-blue-800 dark:text-blue-300 mt-0.5 whitespace-pre-wrap">{exec.guidance}</p>
            </div>
          )}
          {exec.hypothesis && !isAnalysis && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1"><FlaskConical size={12} /> Hypothesis</h4>
              <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">{exec.hypothesis}</p>
            </div>
          )}
          {/* Lab Traceability — spec, lab info, artifacts */}
          {(exec.lab_job_id || exec.lab_id || exec.spec || exec.artifact_zip_id) && (
            <LabTraceability exec={exec} />
          )}
          {exec.code && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1"><Code2 size={12} /> {isAnalysis ? 'Analysis Code' : 'Lab Generated Code'}</h4>
              <pre className="text-xs bg-gray-900 text-green-400 rounded-lg p-4 overflow-x-auto max-h-80 overflow-y-auto whitespace-pre-wrap break-words">{exec.code}</pre>
            </div>
          )}
          <SandboxOutput stdout={exec.stdout} stderr={exec.stderr} evidence={exec.evidence} />
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-100 dark:border-gray-800">
            {exec.claim_type && <span>Type: <span className="font-medium text-indigo-600 dark:text-indigo-400">{exec.claim_type.replace(/_/g, ' ')}</span></span>}
            {exec.evaluation_mode && <span>Eval: <span className="font-medium text-gray-700 dark:text-gray-300">{exec.evaluation_mode}</span></span>}
            {(exec.lab_name || exec.template_id) && <span>Lab: <span className="font-medium text-cyan-600 dark:text-cyan-400">{exec.lab_name || exec.template_id}</span></span>}
            {exec.execution_time_ms != null && <span>Time: <span className="font-medium text-gray-700 dark:text-gray-300">{exec.execution_time_ms}ms</span></span>}
            {exec.attempt > 1 && <span>Attempts: <span className="font-medium text-orange-600 dark:text-orange-400">{exec.attempt}</span></span>}
            {exec.weight_before != null && exec.weight_after != null && (
              <span className="flex items-center gap-1">
                Weight: <span className="font-medium text-gray-700 dark:text-gray-300">{Number(exec.weight_before).toFixed(3)}</span>
                <ArrowRight size={10} />
                <span className={`font-medium ${exec.weight_after > exec.weight_before ? 'text-green-600 dark:text-green-400' : exec.weight_after < exec.weight_before ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>{Number(exec.weight_after).toFixed(3)}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
