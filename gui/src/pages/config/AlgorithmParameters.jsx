import { useState, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, ChevronDown, ChevronRight, X, Clock, Activity, Shield, CheckCircle, Settings, Sliders, GitBranch, List, RotateCcw, Zap, Gauge, BookOpen, Cpu, AlertTriangle, Info, Scissors } from 'lucide-react';
import { configApi, models as modelsApi } from '../../lib/api';
import TuneDialog from '../../components/TuneDialog';
import InteractiveRadar from '../../components/InteractiveRadar';
import {
  SECTION_PRESETS, SECTION_TIERS, TIER_LEVELS,
  initSectionMetadata,
} from './config-constants';
import { PageRelationshipBanner } from '../../components/RelatedLinks';
import { useScrollToHash } from '../../lib/useScrollToHash';
import MetadataSection, { sectionMatchesSearch } from './MetadataSection';
import { SUBSYSTEM_MAP, SUPER_GROUPS, CONFIG_CATEGORY_TO_GROUP } from '../../lib/subsystem-map';

/**
 * SuperGroup — top-level pipeline stage header (Birthing, Population Control, Enrichment, Infrastructure).
 * Contains CategoryGroup components as children.
 */
function SuperGroup({ title, description, children, hasContent }) {
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
        <div className="mt-3 ml-2 pl-4 border-l-2 border-gray-300 dark:border-gray-600">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * CategoryGroup — collapsible top-level grouping for related config sections.
 * Adds hierarchy to reduce visual overwhelm.
 */
function CategoryGroup({ title, icon: Icon, children, defaultOpen = false, count, searchActive }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const effectiveOpen = searchActive || isOpen;

  return (
    <div className="mb-6" data-category-collapsed={!effectiveOpen ? 'true' : 'false'}>
      <button
        data-category-toggle
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors group"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {Icon && <Icon size={16} className="text-gray-400 dark:text-gray-500 shrink-0" />}
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">{title}</h3>
          {count > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 font-normal">({count})</span>
          )}
        </div>
        {effectiveOpen
          ? <ChevronDown size={16} className="text-gray-400 shrink-0" />
          : <ChevronRight size={16} className="text-gray-400 shrink-0" />
        }
      </button>
      {/* Always render children so anchor IDs exist in DOM for hash navigation.
          Use CSS hidden instead of conditional render when collapsed. */}
      <div className={`mt-1 ml-1 pl-4 border-l-2 border-gray-200 dark:border-gray-700 ${effectiveOpen ? '' : 'hidden'}`}>
        {children}
      </div>
    </div>
  );
}

// Input sources that produce content flowing through the dedup gate.
// Each maps to a subsystem or engine origin that can have its own threshold overrides.
const GATE_SOURCES = [
  { key: 'reader_text',  label: 'KB: Text',    description: 'Text, markdown, and config files', origin: 'reader_text', subsystem: 'reader_text' },
  { key: 'reader_pdf',   label: 'KB: PDF',     description: 'PDF documents', origin: 'reader_pdf', subsystem: 'reader_pdf' },
  { key: 'reader_doc',   label: 'KB: Doc',     description: 'Word / OpenDoc files', origin: 'reader_doc', subsystem: 'reader_doc' },
  { key: 'reader_image', label: 'KB: Image',   description: 'Image descriptions (vision)', origin: 'reader_image', subsystem: 'reader_image' },
  { key: 'reader_sheet', label: 'KB: Sheet',   description: 'Spreadsheets (xlsx/ods)', origin: 'reader_sheet', subsystem: 'reader_sheet' },
  { key: 'reader_code',  label: 'KB: Code',    description: 'Source code files', origin: 'reader_code', subsystem: 'reader_code' },
  { key: 'synthesis',    label: 'Synthesis',    description: 'Autonomous synthesis engine', origin: 'synthesis', prompt: 'core.insight_synthesis', subsystem: 'voice' },
  { key: 'domain-directed', label: 'Domain-Directed', description: 'Targeted domain synthesis', origin: 'domain-directed', prompt: 'core.insight_synthesis', subsystem: 'voice' },
  { key: 'cluster-synthesis', label: 'Cluster',  description: 'Cluster-based synthesis', origin: 'cluster-synthesis', prompt: 'core.multi_insight_synthesis', subsystem: 'voice' },
  { key: 'research',     label: 'Research',     description: 'Autonomous domain researcher', origin: 'research-cycle', prompt: 'core.research_cycle', subsystem: 'research' },
  { key: 'question-cycle', label: 'Questions',  description: 'Question generation cycle', origin: 'tension-cycle', prompt: 'core.question_generation', subsystem: 'voice' },
];

function GateOverrideField({ label, value, onChange, min = 0.5, max = 0.99, step = 0.01 }) {
  const isSet = value != null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/50 w-28 shrink-0">{label}</span>
      {isSet ? (
        <>
          <input
            type="range" min={min} max={max} step={step}
            value={value}
            onChange={e => onChange(+e.target.value)}
            className="flex-1 h-1 accent-blue-500"
          />
          <span className="text-xs text-white/80 w-10 text-right font-mono">{value.toFixed(2)}</span>
          <button onClick={() => onChange(null)} className="text-white/30 hover:text-white/60" title="Reset to global">
            <X size={12} />
          </button>
        </>
      ) : (
        <button
          onClick={() => onChange(min + (max - min) / 2)}
          className="text-xs text-blue-400/60 hover:text-blue-400"
        >Set override</button>
      )}
    </div>
  );
}

function DedupGateOverrides() {
  const [gates, setGates] = useState({});   // { source: {overrides} }
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null); // source key currently expanded

  const loadGates = async () => {
    try {
      const data = await configApi.getDedupGates();
      const map = {};
      for (const g of (data.gates || [])) map[g.source] = g;
      setGates(map);
    } catch { /* table may not exist yet */ }
    setLoading(false);
  };

  useEffect(() => { loadGates(); }, []);

  const updateField = async (source, field, value) => {
    const current = gates[source] || {};
    const updated = { ...current, [field]: value };
    // Check if all override values are null — if so, delete the row
    const hasAny = ['embedding_threshold', 'word_overlap_threshold', 'llm_judge_enabled', 'llm_judge_doubt_floor', 'llm_judge_hard_ceiling']
      .some(f => updated[f] != null);
    if (!hasAny) {
      await configApi.deleteDedupGate(source);
    } else {
      await configApi.saveDedupGate(source, updated);
    }
    loadGates();
  };

  const clearSource = async (source) => {
    await configApi.deleteDedupGate(source);
    setExpanded(null);
    loadGates();
  };

  if (loading) return <div className="text-xs text-white/40 mt-2">Loading gate overrides...</div>;

  return (
    <div className="mt-4 pt-3 border-t border-white/10">
      <h4 className="text-sm font-medium text-white/70 mb-2">Per-Source Gate Overrides</h4>
      <p className="text-xs text-white/40 mb-3">Override dedup thresholds for specific input sources. Unset values fall back to global config above.</p>

      <div className="space-y-1.5">
        {GATE_SOURCES.map(({ key, label, description, origin, prompt, subsystem }) => {
          const gate = gates[key];
          const hasOverrides = gate && ['embedding_threshold', 'word_overlap_threshold', 'llm_judge_enabled', 'llm_judge_doubt_floor', 'llm_judge_hard_ceiling']
            .some(f => gate[f] != null);
          const isExpanded = expanded === key;

          return (
            <div key={key} className={`rounded-lg border transition-colors ${hasOverrides ? 'border-blue-500/30 bg-blue-500/5' : 'border-white/10 bg-white/[0.02]'}`}>
              <button
                onClick={() => setExpanded(isExpanded ? null : key)}
                className="w-full flex items-center justify-between p-2.5 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {isExpanded ? <ChevronDown size={14} className="text-white/40" /> : <ChevronRight size={14} className="text-white/40" />}
                    <span className="text-sm font-medium text-white/90" title={[origin && `Origin: ${origin}`, prompt && `Prompt: ${prompt}`, subsystem && `Subsystem: ${subsystem}`, `Gate key: ${key}`].filter(Boolean).join(' · ')}>{label}</span>
                    {hasOverrides && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400">custom</span>
                    )}
                  </div>
                  <p className="text-xs text-white/40 ml-[22px]">{description}</p>
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2 ml-[22px]">
                  <GateOverrideField
                    label="Embed threshold"
                    value={gate?.embedding_threshold ?? null}
                    onChange={v => updateField(key, 'embedding_threshold', v)}
                    min={0.5} max={0.99} step={0.01}
                  />
                  <GateOverrideField
                    label="Word overlap"
                    value={gate?.word_overlap_threshold ?? null}
                    onChange={v => updateField(key, 'word_overlap_threshold', v)}
                    min={0.3} max={0.99} step={0.01}
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/50 w-28 shrink-0">LLM Judge</span>
                    <select
                      className="bg-white/10 rounded px-2 py-0.5 text-xs text-white"
                      value={gate?.llm_judge_enabled ?? ''}
                      onChange={e => updateField(key, 'llm_judge_enabled', e.target.value === '' ? null : +e.target.value)}
                    >
                      <option value="">Global default</option>
                      <option value="1">On</option>
                      <option value="0">Off</option>
                    </select>
                  </div>
                  <GateOverrideField
                    label="Doubt floor"
                    value={gate?.llm_judge_doubt_floor ?? null}
                    onChange={v => updateField(key, 'llm_judge_doubt_floor', v)}
                    min={0.7} max={0.99} step={0.01}
                  />
                  <GateOverrideField
                    label="Hard ceiling"
                    value={gate?.llm_judge_hard_ceiling ?? null}
                    onChange={v => updateField(key, 'llm_judge_hard_ceiling', v)}
                    min={0.8} max={0.99} step={0.01}
                  />
                  {hasOverrides && (
                    <button
                      onClick={() => clearSource(key)}
                      className="text-xs text-red-400/60 hover:text-red-400 mt-1"
                    >Clear all overrides</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Sections excluded from category rendering (rendered separately or obsolete).
const TOP_LEVEL_SECTIONS = new Set([]);

/** Category rendering order — each maps to section.category from metadata. */
const CATEGORY_ORDER = [
  { id: 'synthesisBand', title: 'Synthesis Band', icon: Activity, defaultOpen: false },
  { id: 'qualityGates', title: 'Quality Gates', icon: Shield, defaultOpen: false },
  { id: 'cullPipeline', title: 'Cull Pipeline', icon: Scissors, defaultOpen: false },
  { id: 'outputShape', title: 'Output Shape', icon: Gauge, defaultOpen: false },
  { id: 'nodeEvolution', title: 'Node Evolution', icon: GitBranch, defaultOpen: false },
  { id: 'autonomousCycles', title: 'Autonomous Cycles', icon: Clock, defaultOpen: false },
  { id: 'verificationElite', title: 'Verification & Elite', icon: CheckCircle, defaultOpen: false },
  { id: 'knowledgeDelivery', title: 'Knowledge Delivery', icon: BookOpen, defaultOpen: false },
  { id: 'modelParameters', title: 'Model Parameters', icon: Cpu, defaultOpen: false },
  { id: 'wordListsPatterns', title: 'Word Lists & Patterns', icon: List, defaultOpen: false },
];

/** Compute soft warnings S1-S10 from config values. */
function computeWarnings(c) {
  if (!c) return [];
  const w = [];
  const e = c.engine || {};
  const se = c.synthesisEngine || {};
  const v = c.voicing || {};
  const d = c.dedup || {};
  const n = c.nodes || {};
  const ac = c.autonomousCycles || {};
  const fw = e.fitnessWeights || {};

  // S1: Narrow synthesis band
  const bandWidth = (d.embeddingSimilarityThreshold ?? 0.92) - (e.threshold ?? 0.35);
  if (bandWidth < 0.15) {
    w.push({ id: 'S1', text: `Productive synthesis band is only ${(bandWidth * 100).toFixed(0)} points wide (threshold=${e.threshold ?? 0.35}, dedup=${d.embeddingSimilarityThreshold ?? 0.92}). Most synthesis will be rejected as duplicate. Widen the gap to at least 0.15.`, severity: 'warning' });
  }

  // S2: Short output + high specificity
  if ((v.maxInsightWords ?? 30) < 20 && (e.minSpecificity ?? 1.5) > 2.0) {
    w.push({ id: 'S2', text: `Requesting only ${v.maxInsightWords} words but requiring specificity ≥ ${e.minSpecificity}. Short output may systematically fail the specificity gate. Lower minSpecificity to ≤ 2.0.`, severity: 'warning' });
  }

  // S3: Fast salience decay + fast cycles
  const salDecay = e.salienceDecay ?? 0.97;
  const cycleMs = e.cycleDelayMs ?? 15000;
  if (salDecay < 0.95 && cycleMs < 10000) {
    const halfCycles = Math.log(0.5) / Math.log(salDecay);
    const halfMin = (halfCycles * (e.decayEveryNCycles ?? 5) * cycleMs) / 60000;
    w.push({ id: 'S3', text: `With salience decay ${salDecay} and cycle delay ${cycleMs}ms, salience half-life is ~${halfMin.toFixed(0)} minutes. Nodes may die before participating in synthesis.`, severity: 'warning' });
  }

  // S4: Low junk threshold + aggressive exploration
  if ((e.junkThreshold ?? 0.85) < 0.75 && (se.migrationEnabled || (e.threshold ?? 0.35) < 0.3)) {
    w.push({ id: 'S4', text: `Low junk threshold (${e.junkThreshold}) with aggressive exploration risks junk filter poisoning — topic areas blocked permanently by one bad synthesis. Raise to ≥ 0.80.`, severity: 'warning' });
  }

  // S5: Low weight amplification
  const ampRange = (e.weightCeiling ?? 5.0) / (n.defaultWeight ?? 1.0);
  if (ampRange < 1.5) {
    w.push({ id: 'S5', text: `Weight ceiling is only ${ampRange.toFixed(1)}x the default weight. Very limited room for weight-based differentiation.`, severity: 'info' });
  }

  // S6: All cycles fast
  const cycleKeys = ['validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing'];
  const enabledCycles = cycleKeys.filter(k => ac[k]?.enabled);
  if (enabledCycles.length >= 5 && enabledCycles.every(k => (ac[k]?.intervalMs ?? 60000) < 30000)) {
    const callsPerHour = enabledCycles.reduce((sum, k) => sum + 3600000 / (ac[k]?.intervalMs ?? 60000), 0);
    w.push({ id: 'S6', text: `All ${enabledCycles.length} autonomous cycles enabled with intervals under 30s. Estimated ~${Math.round(callsPerHour)} LLM calls/hour. This may incur significant API cost.`, severity: 'warning' });
  }

  // S7: Fitness weights off balance
  const fwSum = (fw.dissimilarity ?? 0.5) + (fw.novelty ?? 0.3) + (fw.specificity ?? 0.2);
  if (Math.abs(fwSum - 1.0) > 0.1) {
    w.push({ id: 'S7', text: `Fitness weights sum to ${fwSum.toFixed(2)}. Weights summing to ~1.0 make the fitness modifier more predictable.`, severity: 'info' });
  }

  return w;
}

/** Compute diagnostics D1-D8 from config values. */
function computeDiagnostics(c) {
  if (!c) return null;
  const e = c.engine || {};
  const se = c.synthesisEngine || {};
  const n = c.nodes || {};
  const ce = c.contextEngine || {};
  const ac = c.autonomousCycles || {};
  const alloc = ce.allocation || {};

  // D1: Synthesis band width
  const threshold = e.threshold ?? 0.35;
  const ceiling = se.similarityCeiling ?? 0.92;
  const bandWidth = ceiling - threshold;

  // D2: Salience half-life
  const salDecay = e.salienceDecay ?? 0.97;
  const decayN = e.decayEveryNCycles ?? 5;
  const cycleMs = e.cycleDelayMs ?? 15000;
  const salHalfCycles = salDecay < 1 ? Math.log(0.5) / Math.log(salDecay) : Infinity;
  const salHalfMin = salHalfCycles * decayN * cycleMs / 60000;

  // D3: Weight half-life
  const wDecay = e.weightDecay ?? 0.999;
  const wHalfCycles = wDecay < 1 ? Math.log(0.5) / Math.log(wDecay) : Infinity;
  const wHalfMin = wHalfCycles * decayN * cycleMs / 60000;

  // D4: Gate strictness indicators
  const gates = [
    { name: 'Specificity', val: e.minSpecificity ?? 1.5, ref: 1.5, strict: 'high' },
    { name: 'Dedup', val: c.dedup?.embeddingSimilarityThreshold ?? 0.92, ref: 0.92, strict: 'low' },
    { name: 'Junk', val: e.junkThreshold ?? 0.85, ref: 0.85, strict: 'low' },
    { name: 'Hallucination', val: c.hallucination?.minRedFlags ?? 2, ref: 2, strict: 'low' },
  ];

  // D5: Amplification range
  const defaultW = n.defaultWeight ?? 1.0;
  const wCeiling = e.weightCeiling ?? 5.0;
  const ampRange = wCeiling / defaultW;

  // D6: Estimated LLM calls/hour
  const synthPerHour = 3600000 / cycleMs;
  const cycleKeys = ['validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing'];
  let cycleCallsPerHour = 0;
  for (const k of cycleKeys) {
    if (ac[k]?.enabled) cycleCallsPerHour += 3600000 / (ac[k]?.intervalMs ?? 60000);
  }
  const totalPerHour = Math.round(synthPerHour + cycleCallsPerHour);

  // D7: Context budget
  const budget = ce.totalBudget ?? 4096;
  const kPct = ((alloc.knowledge ?? 0.40) * 100).toFixed(0);
  const hPct = ((alloc.history ?? 0.30) * 100).toFixed(0);
  const sPct = ((alloc.systemPrompt ?? 0.15) * 100).toFixed(0);
  const rPct = ((alloc.response ?? 0.15) * 100).toFixed(0);

  return { bandWidth, threshold, ceiling, salHalfMin, wHalfMin, gates, ampRange, defaultW, wCeiling, totalPerHour, synthPerHour: Math.round(synthPerHour), cycleCallsPerHour: Math.round(cycleCallsPerHour), budget, kPct, hPct, sPct, rPct, consultantThreshold: c.consultantPipeline?.threshold ?? 6.5 };
}

/** Color class for diagnostic values. */
function diagColor(condition) {
  if (condition === 'red') return 'text-red-500 dark:text-red-400';
  if (condition === 'amber') return 'text-amber-500 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

/** Gate strictness dot: green=permissive, yellow=moderate, red=strict. */
function gateStrictness(gate) {
  const diff = gate.strict === 'high'
    ? (gate.val - gate.ref) / gate.ref   // higher = stricter
    : (gate.ref - gate.val) / gate.ref;  // lower = stricter
  if (diff > 0.2) return 'bg-red-500';
  if (diff > 0.05) return 'bg-amber-400';
  return 'bg-green-500';
}

/** Format minutes to human-readable duration. */
function fmtDuration(min) {
  if (!isFinite(min)) return '∞';
  if (min < 60) return `~${Math.round(min)} min`;
  if (min < 1440) return `~${(min / 60).toFixed(1)} hr`;
  return `~${(min / 1440).toFixed(1)} days`;
}

/** Algorithm parameters: sectioned sliders, tune dialog, and save. */
export default function AlgorithmParameters({ localConfig, updateParam, updateNestedParam, searchTerm = '', onSave }) {
  useScrollToHash();
  const [tuningSection, setTuningSection] = useState(null);
  const [tierLevel, setTierLevel] = useState(() => {
    try { return localStorage.getItem('podbit-config-tier') || 'basic'; }
    catch { return 'basic'; }
  });
  const [descMap, setDescMap] = useState({});
  const [sectionsData, setSectionsData] = useState(null);
  const [navigateToSection, setNavigateToSection] = useState(null);
  const [resettingAll, setResettingAll] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(new Set());
  const [assignments, setAssignments] = useState(null);

  const warnings = useMemo(() => computeWarnings(localConfig), [localConfig]);
  const diagnostics = useMemo(() => computeDiagnostics(localConfig), [localConfig]);

  // Compute setup readiness from subsystem assignments
  const readiness = useMemo(() => {
    if (!assignments) return null;
    const coreSubsystems = ['voice', 'synthesis', 'embedding'];
    const importantSubsystems = ['research', 'spec_extraction', 'compress', 'dedup_judge', 'keyword'];
    const coreAssigned = coreSubsystems.filter(s => !!assignments[s]).length;
    const importantAssigned = importantSubsystems.filter(s => !!assignments[s]).length;
    const deprecatedSubs = new Set(['evm_codegen', 'evm_triage', 'evm_research', 'evm_structural', 'evm_expert']);
    const activeSubs = Object.keys(SUBSYSTEM_MAP).filter(s => !deprecatedSubs.has(s));
    const totalSubs = activeSubs.length;
    const totalAssigned = activeSubs.filter(s => !!assignments[s]).length;
    const allCoreReady = coreAssigned === coreSubsystems.length;
    const unassignedImportant = importantSubsystems.filter(s => !assignments[s]);
    return { coreAssigned, coreTotal: coreSubsystems.length, importantAssigned, importantTotal: importantSubsystems.length, totalAssigned, totalSubs, allCoreReady, unassignedImportant };
  }, [assignments]);

  // Temporary highlight ring on navigated-to section
  useEffect(() => {
    if (!navigateToSection) return;
    const el = document.getElementById(navigateToSection);
    if (!el) return;
    el.classList.add('ring-2', 'ring-blue-400', 'dark:ring-blue-500');
    return () => el.classList.remove('ring-2', 'ring-blue-400', 'dark:ring-blue-500');
  }, [navigateToSection]);

  // Fetch section metadata from API — populates tiers, presets, descriptions,
  // and sectionsData for auto-rendering.
  useEffect(() => {
    configApi.sections().then(sections => {
      initSectionMetadata(sections);
      setSectionsData(sections);
      const map = {};
      for (const section of Object.values(sections)) {
        for (const param of section.parameters || []) {
          if (param.configPath) {
            map[param.configPath.join('.')] = param.description;
          }
        }
      }
      setDescMap(map);
    }).catch(() => {});
    // Fetch subsystem assignments for badge status indicators
    modelsApi.assignments().then(data => {
      setAssignments(data?.assignments ?? data ?? {});
    }).catch(() => {});
  }, []);

  const handleTierChange = (tier) => {
    setTierLevel(tier);
    try { localStorage.setItem('podbit-config-tier', tier); } catch {}
  };

  const handleAcceptSuggestions = (changes) => {
    for (const { configPath, value } of changes) {
      if (configPath.length === 2) {
        updateParam(configPath[0], configPath[1], value);
      } else if (configPath.length === 3) {
        updateNestedParam(configPath[0], configPath[1], configPath[2], value);
      } else if (configPath.length === 4) {
        // 4-level nesting: e.g. contextEngine.dynamicBudget.newProfile.knowledge
        const current = localConfig[configPath[0]]?.[configPath[1]]?.[configPath[2]] || {};
        updateNestedParam(configPath[0], configPath[1], configPath[2], { ...current, [configPath[3]]: value });
      }
    }
  };

  const handleReset = async (sectionId) => {
    try {
      const { defaults } = await configApi.getDefaults(sectionId);
      handleAcceptSuggestions(defaults);
    } catch (err) {
      console.error(`Failed to reset ${sectionId}:`, err);
    }
  };

  const handleResetAll = async () => {
    if (!confirm('Reset ALL config parameters to defaults? You will still need to Save to persist.')) return;
    setResettingAll(true);
    try {
      const sectionIds = Object.keys(SECTION_TIERS);
      for (const sectionId of sectionIds) {
        try {
          const { defaults } = await configApi.getDefaults(sectionId);
          handleAcceptSuggestions(defaults);
        } catch { /* skip sections without defaults endpoint */ }
      }
    } catch (err) {
      console.error('Failed to reset all:', err);
    } finally {
      setResettingAll(false);
    }
  };

  // Handle drag-commit from interactive radar
  const handleRadarDragCommit = useCallback((changes) => {
    handleAcceptSuggestions(changes);
  }, [updateParam, updateNestedParam]);

  // Navigate to a config section from the radar detail panel
  const handleNavigateToSection = useCallback((sectionId) => {
    setNavigateToSection(sectionId);
    // Clear highlight after animation
    setTimeout(() => setNavigateToSection(null), 2500);

    // Expand parent CategoryGroup if collapsed, then expand section, then scroll
    setTimeout(() => {
      const sectionEl = document.getElementById(sectionId);
      if (!sectionEl) return;

      // Walk up to find and expand collapsed CategoryGroup ancestors
      let parent = sectionEl.parentElement;
      while (parent) {
        if (parent.dataset?.categoryCollapsed === 'true') {
          parent.querySelector('[data-category-toggle]')?.click();
        }
        parent = parent.parentElement;
      }

      // Expand the section itself if collapsed
      if (sectionEl.dataset?.collapsed === 'true') {
        sectionEl.querySelector('[data-collapsible-toggle]')?.click();
      }

      // Scroll into view after expansion
      setTimeout(() => {
        const scrollParent = sectionEl.closest('main') || sectionEl.closest('[class*="overflow-auto"]');
        if (scrollParent) {
          const elRect = sectionEl.getBoundingClientRect();
          const parentRect = scrollParent.getBoundingClientRect();
          scrollParent.scrollBy({ top: elRect.top - parentRect.top - 80, behavior: 'smooth' });
        } else {
          sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 200);
    }, 50);
  }, []);

  if (!localConfig || !sectionsData) return null;

  // Group sections by category from metadata, excluding top-level sections
  const grouped = {};
  for (const section of Object.values(sectionsData)) {
    if (TOP_LEVEL_SECTIONS.has(section.id)) continue;
    const cat = section.category || 'lifecycle';
    (grouped[cat] ??= []).push(section);
  }

  const tunePresets = tuningSection ? SECTION_PRESETS[tuningSection] : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <h2 className="text-lg font-semibold mb-2">Algorithm Parameters</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
        Fine-tune Podbit's behavior. Changes take effect immediately for new synthesis cycles.
        Click <Sparkles size={12} className="inline text-purple-400" /> to get AI tuning suggestions, or <RotateCcw size={11} className="inline text-orange-500" /> Reset to revert a section to defaults.
      </p>
      <PageRelationshipBanner currentPage="config" />

      {/* Setup Readiness Indicator */}
      {readiness && !readiness.allCoreReady && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-500" />
          <span className="flex-1 text-xs leading-relaxed">
            <span className="font-semibold">Setup incomplete:</span>{' '}
            {readiness.coreAssigned}/{readiness.coreTotal} core subsystems assigned (voice, synthesis, embedding).
            {' '}{readiness.totalAssigned}/{readiness.totalSubs} total.
            {' '}Synthesis will not run without core subsystems.{' '}
            <a href="/models" className="underline font-medium hover:text-red-600 dark:hover:text-red-300">Assign models →</a>
          </span>
        </div>
      )}
      {readiness && readiness.allCoreReady && readiness.totalAssigned < readiness.totalSubs && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg mb-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200">
          <CheckCircle size={14} className="shrink-0 mt-0.5 text-emerald-500" />
          <span className="flex-1 text-xs leading-relaxed">
            Core subsystems ready. {readiness.totalAssigned}/{readiness.totalSubs} subsystems assigned.
            {readiness.importantAssigned < readiness.importantTotal && (
              <> {readiness.unassignedImportant.length} recommended subsystem{readiness.unassignedImportant.length !== 1 ? 's' : ''} unassigned ({readiness.unassignedImportant.join(', ')}). </>
            )}
            <a href="/models" className="underline font-medium hover:text-emerald-600 dark:hover:text-emerald-300">Manage assignments →</a>
          </span>
        </div>
      )}

      {/* Tier selector */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs text-gray-500 font-medium">Show:</span>
        <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5">
          {['basic', 'intermediate', 'advanced'].map(tier => (
            <button
              key={tier}
              onClick={() => handleTierChange(tier)}
              className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                tierLevel === tier
                  ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm font-medium'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              {tier.charAt(0).toUpperCase() + tier.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {Object.values(sectionsData).reduce((count, s) => count + (s.parameters || []).filter(p => TIER_LEVELS[p.tier || s.tier || 'basic'] <= TIER_LEVELS[tierLevel]).length, 0)} params
        </span>
        <div className="ml-auto">
          <button
            onClick={handleResetAll}
            disabled={resettingAll}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/40 border border-orange-200 dark:border-orange-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <RotateCcw size={12} className={resettingAll ? 'animate-spin' : ''} />
            {resettingAll ? 'Resetting...' : 'Reset All to Defaults'}
          </button>
        </div>
      </div>

      {/* System Configuration Profile — interactive radar with drag-to-adjust */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-1">System Configuration Profile</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Click an axis dot to see contributing parameters. Drag dots to adjust proportionally. Changes apply on release.
        </p>
        <InteractiveRadar
          config={localConfig}
          onDragCommit={handleRadarDragCommit}
          onNavigateToSection={handleNavigateToSection}
          size={300}
        />
      </div>

      {/* Computed Diagnostics D1-D8 — compact grid */}
      {diagnostics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Synthesis Band</div>
            <div className={`text-sm font-semibold font-mono ${diagColor(diagnostics.bandWidth < 0.15 ? 'red' : diagnostics.bandWidth > 0.40 ? 'amber' : 'green')}`}>
              {(diagnostics.bandWidth * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">{diagnostics.threshold} → {diagnostics.ceiling}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Salience Half-Life</div>
            <div className={`text-sm font-semibold ${diagColor(diagnostics.salHalfMin < 30 ? 'red' : diagnostics.salHalfMin > 10080 ? 'amber' : 'green')}`}>
              {fmtDuration(diagnostics.salHalfMin)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Weight Half-Life</div>
            <div className={`text-sm font-semibold ${diagColor(diagnostics.wHalfMin < 60 ? 'red' : diagnostics.wHalfMin > 10080 ? 'amber' : 'green')}`}>
              {fmtDuration(diagnostics.wHalfMin)}
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Amplification</div>
            <div className={`text-sm font-semibold font-mono ${diagColor(diagnostics.ampRange < 1.5 ? 'red' : diagnostics.ampRange > 10 ? 'amber' : 'green')}`}>
              {diagnostics.ampRange.toFixed(1)}x
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">{diagnostics.defaultW} → {diagnostics.wCeiling}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">LLM Calls/Hour</div>
            <div className={`text-sm font-semibold font-mono ${diagColor(diagnostics.totalPerHour > 500 ? 'red' : diagnostics.totalPerHour > 200 ? 'amber' : 'green')}`}>
              ~{diagnostics.totalPerHour}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">synth:{diagnostics.synthPerHour} + cycles:{diagnostics.cycleCallsPerHour}</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Consultant Threshold</div>
            <div className="text-sm font-semibold font-mono text-gray-700 dark:text-gray-200">
              {diagnostics.consultantThreshold}/10
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-500">population control quality gate</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Context Budget</div>
            <div className="text-sm font-semibold font-mono text-gray-700 dark:text-gray-200">{diagnostics.budget}</div>
            <div className="text-xs text-gray-400 dark:text-gray-500">K:{diagnostics.kPct}% H:{diagnostics.hPct}% S:{diagnostics.sPct}% R:{diagnostics.rPct}%</div>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Gate Strictness</div>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {diagnostics.gates.map(g => (
                <span key={g.name} className="flex items-center gap-1" title={`${g.name}: ${g.val}`}>
                  <span className={`w-2 h-2 rounded-full ${gateStrictness(g)}`} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{g.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Soft Warnings S1-S10 — dismissible banners */}
      {warnings.filter(w => !dismissedWarnings.has(w.id)).length > 0 && (
        <div className="space-y-2 mb-6">
          {warnings.filter(w => !dismissedWarnings.has(w.id)).map(w => (
            <div key={w.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
              w.severity === 'warning'
                ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                : 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200'
            }`}>
              {w.severity === 'warning'
                ? <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                : <Info size={14} className="shrink-0 mt-0.5 text-blue-500" />
              }
              <span className="flex-1 text-xs leading-relaxed">
                <span className="font-mono font-semibold mr-1">{w.id}</span>
                {w.text}
              </span>
              <button
                onClick={() => setDismissedWarnings(prev => new Set([...prev, w.id]))}
                className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Auto-rendered: super-groups containing category groups from section metadata */}
      {SUPER_GROUPS.map(sg => {
        const sgCategories = CATEGORY_ORDER.filter(cat => CONFIG_CATEGORY_TO_GROUP[cat.id] === sg.id);
        // Check if this super-group has any visible sections
        const sgHasContent = sgCategories.some(cat => {
          const allSections = grouped[cat.id] || [];
          return allSections.some(s =>
            (s.parameters || []).some(p => TIER_LEVELS[p.tier || s.tier || 'basic'] <= TIER_LEVELS[tierLevel])
          );
        });
        return (
          <SuperGroup key={sg.id} title={sg.title} description={sg.description} hasContent={sgHasContent}>
            {sgCategories.map(cat => {
              const allSections = grouped[cat.id] || [];
              const sections = allSections.filter(s =>
                (s.parameters || []).some(p => TIER_LEVELS[p.tier || s.tier || 'basic'] <= TIER_LEVELS[tierLevel])
              );
              if (sections.length === 0) return null;
              const catSearchActive = sections.some(s => sectionMatchesSearch(s, searchTerm));
              return (
                <CategoryGroup key={cat.id} title={cat.title} icon={cat.icon}
                               count={sections.length} searchActive={catSearchActive}
                               defaultOpen={cat.defaultOpen}>
                  {sections.map(section => (
                    <MetadataSection
                      key={section.id}
                      section={section}
                      localConfig={localConfig}
                      updateParam={updateParam}
                      updateNestedParam={updateNestedParam}
                      searchTerm={searchTerm}
                      tierLevel={tierLevel}
                      onTune={setTuningSection}
                      onReset={handleReset}
                      descMap={descMap}
                      assignments={assignments}
                    />
                  ))}
                  {cat.id === 'qualityGates' && <DedupGateOverrides />}
                </CategoryGroup>
              );
            })}
          </SuperGroup>
        );
      })}

      {/* AI Tune Dialog — single instance, controlled by tuningSection state */}
      <TuneDialog
        sectionId={tuningSection}
        sectionTitle={tunePresets?.title || ''}
        presets={tunePresets?.presets || []}
        isOpen={!!tuningSection}
        onClose={() => setTuningSection(null)}
        onAccept={handleAcceptSuggestions}
        onSave={onSave}
      />
    </div>
  );
}
