import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, Sparkles, AlertTriangle, CheckCircle, AlertCircle, ChevronLeft, Check, History, Trash2, RotateCcw, ClipboardList, ChevronDown, ChevronUp, ShieldAlert, Loader2, Wrench, ArrowRight, Activity } from 'lucide-react';
import { configApi } from '../lib/api';
import Markdown from './Markdown';

// ─── Question History (localStorage) ────────────────────────────────────────

const HISTORY_KEY = 'config-assistant-question-history';
const MAX_HISTORY = 50;

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch { return []; }
}

function saveToHistory(question) {
  const trimmed = question.trim();
  if (!trimmed) return;
  const history = loadHistory().filter(q => q !== trimmed);
  history.unshift(trimmed);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

// ─── Interview Profile (localStorage) ─────────────────────────────────────────

const PROFILE_KEY = 'config-assistant-profile';

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY));
  } catch { return null; }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function clearProfile() {
  localStorage.removeItem(PROFILE_KEY);
}

// ─── Interview Questions ──────────────────────────────────────────────────────

const INTERVIEW_QUESTIONS = [
  {
    id: 'domain',
    title: 'Research Domain',
    subtitle: 'What kind of knowledge are you working with?',
    options: [
      { value: 'hard_science', label: 'Hard Science', desc: 'Physics, chemistry, biology, engineering — precise, numerical, falsifiable' },
      { value: 'formal_math', label: 'Formal / Mathematical', desc: 'Logic, mathematics, theoretical CS — proof-based, structural' },
      { value: 'applied_technical', label: 'Applied / Technical', desc: 'Software architecture, systems design, clinical practice — pragmatic, pattern-oriented' },
      { value: 'social_science', label: 'Social Science', desc: 'Psychology, economics, sociology — statistical, contextual' },
      { value: 'humanities', label: 'Humanities / Philosophy', desc: 'Ethics, epistemology, history, literary theory — interpretive, conceptual' },
      { value: 'speculative', label: 'Speculative / Exploratory', desc: 'Futurism, creative brainstorming, emerging frontiers — high novelty tolerance' },
      { value: 'mixed', label: 'Mixed / Interdisciplinary', desc: 'Cross-domain synthesis is the goal' },
    ],
  },
  {
    id: 'material',
    title: 'Source Material',
    subtitle: 'What does your content look like?',
    options: [
      { value: 'quantitative', label: 'Quantitative', desc: 'Numbers, measurements, formulas, data-heavy' },
      { value: 'qualitative', label: 'Qualitative / Conceptual', desc: 'Ideas, frameworks, narratives, arguments' },
      { value: 'balanced', label: 'Balanced Mix', desc: 'Both quantitative and conceptual material' },
    ],
  },
  {
    id: 'stance',
    title: 'Synthesis Stance',
    subtitle: 'How creative should the synthesis engine be?',
    options: [
      { value: 'conservative', label: 'Conservative', desc: 'Only grounded claims — reject anything speculative' },
      { value: 'balanced', label: 'Balanced', desc: 'Allow moderate extrapolation from source material' },
      { value: 'exploratory', label: 'Exploratory', desc: 'Encourage novel connections — tolerate creative leaps' },
    ],
  },
  {
    id: 'verification',
    title: 'Verification Priority',
    subtitle: 'How rigorously should claims be verified?',
    options: [
      { value: 'high', label: 'High', desc: 'Every claim should be testable and verifiable where possible' },
      { value: 'moderate', label: 'Moderate', desc: 'Verify key claims, accept well-argued conceptual ones' },
      { value: 'low', label: 'Low', desc: 'Trust the synthesis engine — minimal gating' },
    ],
  },
  {
    id: 'maturity',
    title: 'Graph Maturity',
    subtitle: 'How much content is already in your knowledge graph?',
    options: [
      { value: 'fresh', label: 'Starting Fresh', desc: 'Few or no nodes — need permissive settings to bootstrap' },
      { value: 'growing', label: 'Growing', desc: '50-500 nodes — building momentum' },
      { value: 'mature', label: 'Mature', desc: '500+ nodes — tighten quality to prevent noise' },
    ],
  },
  {
    id: 'budget',
    title: 'Resource Budget',
    subtitle: 'What models and compute are you working with?',
    options: [
      { value: 'minimal', label: 'Minimal', desc: 'Local models, slow cycles, cost-sensitive' },
      { value: 'moderate', label: 'Moderate', desc: 'API models with rate limits, balanced throughput' },
      { value: 'generous', label: 'Generous', desc: 'Frontier models, fast cycles, quality over cost' },
    ],
  },
];

// ─── Interview Wizard ─────────────────────────────────────────────────────────

function InterviewWizard({ onComplete, onSkip }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const question = INTERVIEW_QUESTIONS[step];
  const totalSteps = INTERVIEW_QUESTIONS.length;
  const canGoBack = step > 0;
  const selected = answers[question.id] || null;

  const handleSelect = (value) => {
    const updated = { ...answers, [question.id]: value };
    setAnswers(updated);

    if (step < totalSteps - 1) {
      setTimeout(() => setStep(step + 1), 150);
    } else {
      handleSubmit(updated);
    }
  };

  const handleSubmit = async (finalAnswers) => {
    setSubmitting(true);
    setError(null);
    try {
      const data = await configApi.assistInterview(finalAnswers);
      saveProfile(data.profile);
      onComplete(data.suggestions, data.profile);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Interview failed');
      setSubmitting(false);
    }
  };

  if (submitting) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mb-3" />
        <p className="text-sm text-gray-600 dark:text-gray-400">Generating your config profile...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Progress bar */}
      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            Step {step + 1} of {totalSteps}
          </span>
          <button
            onClick={onSkip}
            className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            Skip interview
          </button>
        </div>
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-300"
            style={{ width: `${((step + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {/* Question content */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Back button */}
        {canGoBack && (
          <button
            onClick={() => setStep(step - 1)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 mb-3 transition-colors"
          >
            <ChevronLeft size={14} />
            Back
          </button>
        )}

        <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200 mb-1">{question.title}</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{question.subtitle}</p>

        <div className="space-y-2">
          {question.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              className={`w-full text-left px-3.5 py-2.5 rounded-lg border transition-all ${
                selected === opt.value
                  ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-400 dark:ring-blue-500'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                  selected === opt.value
                    ? 'border-blue-500 bg-blue-500'
                    : 'border-gray-300 dark:border-gray-600'
                }`}>
                  {selected === opt.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-800 dark:text-gray-200">{opt.label}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.desc}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Health Check Panel ──────────────────────────────────────────────────────

/** Convert camelCase/dot-path config keys to human-readable labels */
function formatParamName(key) {
  return key
    .split('.')
    .map(seg => seg
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/^./, c => c.toUpperCase())
    )
    .join(' \u203A ');
}

const healthColors = {
  critical: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  good: 'text-green-600 dark:text-green-400',
};

const healthIcons = {
  critical: <ShieldAlert size={20} className="text-red-500" />,
  warning: <AlertCircle size={20} className="text-amber-500" />,
  good: <CheckCircle size={20} className="text-green-500" />,
};

const issueSeverityColors = {
  critical: 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20',
  warning: 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20',
  info: 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20',
};

const issueSeverityIcons = {
  critical: <AlertTriangle size={14} className="text-red-500 shrink-0" />,
  warning: <AlertCircle size={14} className="text-amber-500 shrink-0" />,
  info: <Activity size={14} className="text-blue-500 shrink-0" />,
};

function HealthIssueCard({ issue, defaultExpanded }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasFix = issue.currentSettings && issue.recommendedSettings;

  return (
    <div className={`border rounded-lg overflow-hidden ${issueSeverityColors[issue.severity] || issueSeverityColors.info}`}>
      <button onClick={() => setExpanded(!expanded)} className="w-full p-2.5 text-left">
        <div className="flex items-start gap-2">
          <div className="mt-0.5 shrink-0">{issueSeverityIcons[issue.severity]}</div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-medium leading-snug">{issue.title}</span>
          </div>
          <div className="shrink-0 mt-0.5">
            {expanded ? <ChevronUp size={12} className="text-gray-400" /> : <ChevronDown size={12} className="text-gray-400" />}
          </div>
        </div>
        {issue.estimatedImpact && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 ml-[22px]">{issue.estimatedImpact}</div>
        )}
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 space-y-1.5">
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{issue.detail}</p>
          {hasFix && (
            <div className="bg-white/50 dark:bg-gray-800/50 rounded p-2 space-y-1">
              <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">Suggested Changes</div>
              {Object.keys(issue.recommendedSettings).map((k) => (
                <div key={k} className="text-xs py-0.5">
                  <div className="text-gray-700 dark:text-gray-300 font-medium">{formatParamName(k)}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 ml-2">
                    <span className="font-mono text-red-600 dark:text-red-400 line-through">{String(issue.currentSettings[k] ?? '?')}</span>
                    <ArrowRight size={10} className="text-gray-400 shrink-0" />
                    <span className="font-mono text-green-600 dark:text-green-400 font-semibold">{String(issue.recommendedSettings[k])}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HealthCheckPanel({ onApplyFixes, onDiscuss }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  const runAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCollapsed(false);
    try {
      const result = await configApi.criticalAnalysis();
      setAnalysis(result);
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || 'Analysis failed');
    } finally {
      setLoading(false);
    }
  }, []);

  // Not yet run — show trigger button
  if (!analysis && !loading && !error) {
    return (
      <button
        onClick={runAnalysis}
        className="w-full flex items-center gap-2 p-3 mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-left transition-colors"
      >
        <ShieldAlert size={16} className="text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Run Health Check</div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">LLM-powered analysis of your config for waste and issues</div>
        </div>
        <Sparkles size={14} className="text-blue-400 shrink-0" />
      </button>
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center gap-2.5 p-4 mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <Loader2 size={16} className="animate-spin text-blue-500 shrink-0" />
        <div>
          <div className="text-sm text-gray-600 dark:text-gray-400">Analyzing configuration...</div>
          <div className="text-[11px] text-gray-400 dark:text-gray-500">Using config_tune model to evaluate settings</div>
        </div>
      </div>
    );
  }

  // Error
  if (error && !analysis) {
    return (
      <div className="p-3 mb-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
        <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        <button onClick={runAnalysis} className="mt-1.5 text-xs text-red-600 hover:text-red-800 underline">Retry</button>
      </div>
    );
  }

  if (!analysis) return null;

  const criticalCount = analysis.issues?.filter(i => i.severity === 'critical').length || 0;
  const warningCount = analysis.issues?.filter(i => i.severity === 'warning').length || 0;
  const infoCount = analysis.issues?.filter(i => i.severity === 'info').length || 0;
  const hasFixableIssues = analysis.issues?.some(i => i.recommendedSettings) || false;

  /** Collect all fixable issues into configPath+value pairs */
  const collectFixes = () => {
    const suggestions = [];
    for (const issue of (analysis?.issues || [])) {
      if (!issue.recommendedSettings) continue;
      if (issue.configPaths?.length) {
        for (const cp of issue.configPaths) {
          const bareKey = cp[cp.length - 1];
          const dotKey = cp.join('.');
          const value = bareKey in issue.recommendedSettings
            ? issue.recommendedSettings[bareKey]
            : dotKey in issue.recommendedSettings
              ? issue.recommendedSettings[dotKey]
              : undefined;
          if (value !== undefined) {
            suggestions.push({ configPath: cp, value });
          }
        }
      } else {
        for (const [k, v] of Object.entries(issue.recommendedSettings)) {
          const parts = k.split('.');
          if (parts.length >= 2) {
            suggestions.push({ configPath: parts, value: v });
          }
        }
      }
    }
    return suggestions;
  };

  const handleApplyAll = () => {
    const fixes = collectFixes();
    if (fixes.length > 0) onApplyFixes(fixes);
  };

  const handleDiscuss = () => {
    const issuesSummary = (analysis.issues || [])
      .map(i => `- [${i.severity}] ${i.title}: ${i.detail}`)
      .join('\n');
    onDiscuss(`The health check found these issues (overall: ${analysis.overallHealth}, ~${analysis.estimatedWastePercent}% waste):\n${issuesSummary}\n\nPlease walk through each issue, explain what it means, and suggest specific parameter changes to fix ALL of them.`);
  };

  return (
    <div className="mb-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
      {/* Summary header — always visible */}
      <button onClick={() => setCollapsed(!collapsed)} className="w-full p-3 text-left">
        <div className="flex items-center gap-3">
          {healthIcons[analysis.overallHealth]}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-sm font-bold capitalize ${healthColors[analysis.overallHealth]}`}>
                {analysis.overallHealth}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ~{analysis.estimatedWastePercent}% estimated waste
              </span>
            </div>
            <div className="flex items-center gap-2.5 mt-0.5 text-xs">
              {criticalCount > 0 && <span className="flex items-center gap-0.5 text-red-600 dark:text-red-400"><AlertTriangle size={10} /> {criticalCount}</span>}
              {warningCount > 0 && <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400"><AlertCircle size={10} /> {warningCount}</span>}
              {infoCount > 0 && <span className="flex items-center gap-0.5 text-blue-600 dark:text-blue-400"><Activity size={10} /> {infoCount}</span>}
              {analysis.issues?.length === 0 && <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400"><CheckCircle size={10} /> No issues</span>}
            </div>
          </div>
          <div className="shrink-0">
            {collapsed ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronUp size={14} className="text-gray-400" />}
          </div>
        </div>
      </button>

      {/* Expanded detail */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{analysis.summary}</p>

          {analysis.estimatedWastePercent > 10 && (
            <div className="p-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded">
              <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                <strong>Cost impact:</strong> ~{analysis.estimatedWastePercent} out of every 100 cycles produce junk. Fixing these saves LLM tokens.
              </p>
            </div>
          )}

          {/* Issue cards */}
          <div className="space-y-1.5">
            {analysis.issues?.map((issue, i) => (
              <HealthIssueCard key={i} issue={issue} defaultExpanded={issue.severity === 'critical'} />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={runAnalysis}
              disabled={loading}
              className="text-xs px-2.5 py-1.5 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            >
              Re-analyze
            </button>
            <div className="flex-1" />
            <button
              onClick={handleDiscuss}
              className="text-xs px-2.5 py-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded transition-colors"
            >
              Discuss with AI
            </button>
            {hasFixableIssues && (
              <button
                onClick={handleApplyAll}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                <Wrench size={12} />
                Apply All Fixes
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Suggestion Card ─────────────────────────────────────────────────────────

function SuggestionCard({ suggestion, accepted, onToggle }) {
  return (
    <div
      className={`flex items-start gap-2 p-2 rounded border text-xs cursor-pointer transition-colors ${
        accepted
          ? 'border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50'
      }`}
      onClick={onToggle}
    >
      <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
        accepted ? 'bg-blue-500 border-blue-500' : 'border-gray-300 dark:border-gray-600'
      }`}>
        {accepted && <Check size={10} className="text-white" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-gray-800 dark:text-gray-200">{suggestion.label}</span>
          <span className="text-gray-400">
            {typeof suggestion.currentValue === 'number' ? suggestion.currentValue.toFixed(suggestion.step < 1 ? 2 : 0) : suggestion.currentValue}
          </span>
          <span className="text-gray-400">&rarr;</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400">
            {typeof suggestion.suggestedValue === 'number' ? suggestion.suggestedValue.toFixed(suggestion.step < 1 ? 2 : 0) : suggestion.suggestedValue}
          </span>
        </div>
        <p className="text-gray-500 dark:text-gray-400">{suggestion.explanation}</p>
      </div>
    </div>
  );
}

// ─── Message Component ───────────────────────────────────────────────────────

function AssistantMessage({ message, accepted, onToggleSuggestion }) {
  return (
    <div className={`mb-3 ${message.role === 'user' ? 'pl-8' : 'pr-4'}`}>
      <div className={`rounded-lg p-3 text-sm ${
        message.role === 'user'
          ? 'bg-blue-500 text-white ml-auto max-w-[85%]'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
      }`}>
        {message.role === 'user' ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <Markdown content={message.content} />
        )}
      </div>

      {message.suggestions?.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {message.suggestions.map((s, i) => (
            <SuggestionCard
              key={`${s.key}-${i}`}
              suggestion={s}
              accepted={accepted[`${message.id}-${i}`] !== false}
              onToggle={() => onToggleSuggestion(message.id, i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/** Modal chat assistant for config tuning with suggestions and apply/save. */
export default function ConfigAssistant({ isOpen, onClose, onApplySuggestions, onSave }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [accepted, setAccepted] = useState({});
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState(() => loadHistory());
  const [showInterview, setShowInterview] = useState(() => !loadProfile());
  const [profile, setProfile] = useState(() => loadProfile());
  const [_interviewSuggestions, setInterviewSuggestions] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const msgIdCounter = useRef(0);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return;

    saveToHistory(text);
    setHistory(loadHistory());
    setShowHistory(false);

    const userMsgId = `msg-${++msgIdCounter.current}`;
    const userMsg = { id: userMsgId, role: 'user', content: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const data = await configApi.assist(text.trim(), conversationId);
      setConversationId(data.conversationId);

      const assistantMsgId = `msg-${++msgIdCounter.current}`;
      const assistantMsg = {
        id: assistantMsgId,
        role: 'assistant',
        content: data.response,
        suggestions: data.suggestions || [],
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to get response');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isLoading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const toggleSuggestion = (msgId, index) => {
    setAccepted(prev => ({
      ...prev,
      [`${msgId}-${index}`]: prev[`${msgId}-${index}`]  === false,
    }));
  };

  const handleReset = () => {
    setMessages([]);
    setConversationId(null);
    setAccepted({});
    setError(null);
    setShowHistory(false);
    setInput('');
    setInterviewSuggestions(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleInterviewComplete = (suggestions, completedProfile) => {
    setProfile(completedProfile);
    setShowInterview(false);
    setInterviewSuggestions(suggestions);

    // Inject suggestions as an assistant message so SuggestionCards render
    const msgId = `msg-${++msgIdCounter.current}`;
    setMessages([{
      id: msgId,
      role: 'assistant',
      content: `**Profile: ${completedProfile.label}**\n\n${completedProfile.description}\n\nHere are the recommended config changes for your research profile. Toggle any you want to skip, then click **Apply Changes**.`,
      suggestions,
    }]);
  };

  const handleInterviewSkip = () => {
    setShowInterview(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleRerunInterview = () => {
    clearProfile();
    setProfile(null);
    setShowInterview(true);
    setMessages([]);
    setAccepted({});
    setInterviewSuggestions(null);
  };

  // Collect all accepted suggestions from all messages
  const allAcceptedSuggestions = messages
    .filter(m => m.suggestions?.length > 0)
    .flatMap(m => m.suggestions.map((s, i) => ({
      ...s,
      isAccepted: accepted[`${m.id}-${i}`] !== false,
    })))
    .filter(s => s.isAccepted);

  const handleApply = () => {
    const changes = allAcceptedSuggestions.map(s => ({
      configPath: s.configPath,
      value: s.suggestedValue,
    }));
    onApplySuggestions(changes);

    // Mark all as applied by clearing acceptance state
    setAccepted({});

    // Add a system-like message noting the application
    const applyMsgId = `msg-${++msgIdCounter.current}`;
    setMessages(prev => [...prev, {
      id: applyMsgId,
      role: 'assistant',
      content: `Applied ${changes.length} change${changes.length > 1 ? 's' : ''} to the config. Click **Save** in the config header to persist them.`,
      suggestions: [],
    }]);
  };

  const examplePrompts = [
    'Run a full pipeline diagnosis and fix all issues',
    'Make the system more permissive for early-stage exploration',
    'Tighten quality gates to reduce noise in a mature graph',
    'Explain how the quality gates work',
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-[840px] max-w-[95vw] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 shadow-2xl flex flex-col z-50">
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <Sparkles size={16} className="text-blue-500" />
        <span className="font-semibold text-sm text-gray-800 dark:text-gray-200">Config Assistant</span>
        {profile && !showInterview && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
            {profile.label}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {!showInterview && profile && (
            <button
              onClick={handleRerunInterview}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Re-run config interview"
            >
              <ClipboardList size={13} />
              Re-profile
            </button>
          )}
          {messages.length > 0 && !showInterview && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Start new conversation"
            >
              <RotateCcw size={13} />
              New chat
            </button>
          )}
          {history.length > 0 && (
            <button
              onClick={() => setShowHistory(v => !v)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                showHistory
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              title="Question history"
            >
              <History size={13} />
              <span>{history.length}</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={16} className="text-gray-500" />
          </button>
        </div>
      </div>

      {/* History panel */}
      {showHistory && (
        <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
              Past Questions ({history.length})
            </span>
            <button
              onClick={() => {
                localStorage.removeItem(HISTORY_KEY);
                setHistory([]);
                setShowHistory(false);
              }}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 transition-colors"
              title="Clear history"
            >
              <Trash2 size={11} />
              Clear
            </button>
          </div>
          <div className="max-h-56 overflow-y-auto pb-2">
            {history.map((q, i) => (
              <button
                key={i}
                onClick={() => { setInput(q); setShowHistory(false); setTimeout(() => inputRef.current?.focus(), 50); }}
                className="w-full text-left text-xs px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 truncate transition-colors"
                title={q}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Interview wizard OR messages area */}
      {showInterview ? (
        <InterviewWizard onComplete={handleInterviewComplete} onSkip={handleInterviewSkip} />
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {/* Health check panel at top */}
          <HealthCheckPanel
            onApplyFixes={(fixes) => {
              onApplySuggestions(fixes.map(f => ({ configPath: f.configPath, value: f.value })));
              const applyMsgId = `msg-${++msgIdCounter.current}`;
              setMessages(prev => [...prev, {
                id: applyMsgId,
                role: 'assistant',
                content: `Applied ${fixes.length} fix${fixes.length > 1 ? 'es' : ''} from health check. Click **Save** in the config header to persist.`,
                suggestions: [],
              }]);
            }}
            onDiscuss={sendMessage}
          />

          {/* Empty state with example prompts (only when no messages and no interview) */}
          {messages.length === 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Try asking:</p>
              <div className="space-y-1.5">
                {examplePrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => sendMessage(prompt)}
                    className="w-full text-left text-xs px-3 py-2 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((msg) => (
            <AssistantMessage
              key={msg.id}
              message={msg}
              accepted={accepted}
              onToggleSuggestion={toggleSuggestion}
            />
          ))}

          {/* Loading indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 p-3 text-xs text-gray-500 dark:text-gray-400">
              <div className="animate-spin w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full" />
              Analyzing your config...
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Apply bar */}
      {allAcceptedSuggestions.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20 flex items-center gap-2">
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">
            {allAcceptedSuggestions.length} change{allAcceptedSuggestions.length > 1 ? 's' : ''} ready
          </span>
          <button
            onClick={handleApply}
            className="ml-auto text-xs px-3 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-white font-medium transition-colors"
          >
            Apply Changes
          </button>
          <button
            onClick={() => onSave?.()}
            className="text-xs px-3 py-1.5 rounded border border-blue-300 dark:border-blue-600 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/30 font-medium transition-colors"
          >
            Save
          </button>
        </div>
      )}

      {/* Input bar — hidden during interview */}
      {!showInterview && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you want to change..."
              rows={1}
              className="flex-1 text-sm resize-none rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:text-gray-200 placeholder-gray-400"
              style={{ maxHeight: '80px' }}
              disabled={isLoading}
            />
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || isLoading}
              className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
