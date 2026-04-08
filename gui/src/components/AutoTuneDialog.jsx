import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Zap, Loader2, Check, AlertTriangle, ChevronDown, ChevronRight, Link2, ArrowRight, RotateCcw } from 'lucide-react';
import { models } from '../lib/api';

const TUNABLE_SUBSYSTEMS = [
  { key: 'voice', label: 'Voice', group: 'Core' },
  { key: 'synthesis', label: 'Synthesis', group: 'Core' },
  { key: 'chat', label: 'Chat', group: 'Core' },
  { key: 'compress', label: 'Compress', group: 'Core' },
  { key: 'context', label: 'Context', group: 'Core' },
  { key: 'docs', label: 'Docs', group: 'Core' },
  { key: 'research', label: 'Research', group: 'Core' },
  { key: 'proxy', label: 'Proxy', group: 'Core' },
  { key: 'keyword', label: 'Keyword', group: 'Core' },
  { key: 'autorating', label: 'Autorating', group: 'Core' },
  { key: 'dedup_judge', label: 'Dedup Judge', group: 'Core' },
  { key: 'config_tune', label: 'Config Tune', group: 'Core' },
  { key: 'tuning_judge', label: 'Tuning Judge', group: 'Core' },
  { key: 'breakthrough_check', label: 'Breakthrough Check', group: 'Core' },
  { key: 'reader_text', label: 'KB: Text', group: 'Readers' },
  { key: 'reader_pdf', label: 'KB: PDF', group: 'Readers' },
  { key: 'reader_doc', label: 'KB: Doc', group: 'Readers' },
  { key: 'reader_image', label: 'KB: Image', group: 'Readers' },
  { key: 'reader_sheet', label: 'KB: Sheet', group: 'Readers' },
  { key: 'reader_code', label: 'KB: Code', group: 'Readers' },
  { key: 'spec_extraction', label: 'Spec Extraction', group: 'Verification' },
  { key: 'evm_analysis', label: 'Post-Rejection Analysis', group: 'Verification' },
  { key: 'api_verification', label: 'API Verification', group: 'Verification' },
  // Consultant models — tuned separately with their own inference params
  { key: 'c:voice', label: 'Voice', group: 'Consultants', consultant: true, subsystem: 'voice' },
  { key: 'c:synthesis', label: 'Synthesis', group: 'Consultants', consultant: true, subsystem: 'synthesis' },
  { key: 'c:dedup_judge', label: 'Dedup Judge', group: 'Consultants', consultant: true, subsystem: 'dedup_judge' },
  { key: 'c:research', label: 'Research', group: 'Consultants', consultant: true, subsystem: 'research' },
  { key: 'c:spec_extraction', label: 'Spec Extraction', group: 'Consultants', consultant: true, subsystem: 'spec_extraction' },
  { key: 'c:config_tune', label: 'Config Tune', group: 'Consultants', consultant: true, subsystem: 'config_tune' },
  { key: 'c:tuning_judge', label: 'Tuning Judge', group: 'Consultants', consultant: true, subsystem: 'tuning_judge' },
  { key: 'c:api_verification', label: 'API Verification', group: 'Consultants', consultant: true, subsystem: 'api_verification' },
];

const _TUNABLE_KEYS = new Set(TUNABLE_SUBSYSTEMS.map(s => s.key));

const PARAM_NAMES = {
  temperature: 'Temp',
  topP: 'Top P',
  minP: 'Min P',
  topK: 'Top K',
  repeatPenalty: 'Repeat',
};

const PHASE_BADGES = {
  full: { label: 'Full', className: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  refinement: { label: 'Refined', className: 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400' },
  inherited: { label: 'Inherited', className: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
};

// ─── Config Panel ─────────────────────────────────────────────────────────────

function ConfigPanel({ assignments, consultants, selected, onToggle, onSelectAll, onSelectNone, runsPerCombo, onRunsChange, maxCombos, onMaxCombosChange }) {
  const assignedKeys = new Set(
    TUNABLE_SUBSYSTEMS
      .filter(s => {
        if (s.consultant) return consultants?.[s.subsystem];
        return assignments?.[s.key];
      })
      .map(s => s.key)
  );

  const groups = {};
  for (const sub of TUNABLE_SUBSYSTEMS) {
    if (!groups[sub.group]) groups[sub.group] = [];
    groups[sub.group].push(sub);
  }

  const estCallsPerSub = maxCombos * runsPerCombo;
  const estTimePer = estCallsPerSub * 3;
  const estTotal = selected.size * estTimePer;

  // Count how many unique models are assigned to selected subsystems
  const selectedModels = new Set();
  for (const key of selected) {
    const sub = TUNABLE_SUBSYSTEMS.find(s => s.key === key);
    if (sub?.consultant) {
      const model = consultants?.[sub.subsystem];
      if (model) selectedModels.add(`c:${model.id || model.name}`);
    } else {
      const model = assignments?.[key];
      if (model) selectedModels.add(model.id || model.name);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">Subsystems to tune</h4>
          <div className="flex gap-2">
            <button onClick={onSelectAll} className="text-xs text-blue-500 hover:text-blue-600">Select all</button>
            <button onClick={onSelectNone} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
          </div>
        </div>

        {Object.entries(groups).map(([group, subs]) => (
          <div key={group} className="mb-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{group}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {subs.map((sub) => {
                const hasModel = assignedKeys.has(sub.key);
                const isSelected = selected.has(sub.key);
                const modelName = sub.consultant
                  ? consultants?.[sub.subsystem]?.name
                  : assignments?.[sub.key]?.name;
                return (
                  <label
                    key={sub.key}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs border transition-colors cursor-pointer
                      ${!hasModel ? 'opacity-40 cursor-not-allowed border-gray-200 dark:border-gray-700' :
                        isSelected ? 'border-amber-400 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-600' :
                        'border-gray-200 dark:border-gray-700 hover:border-gray-300'}`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      disabled={!hasModel}
                      onChange={() => onToggle(sub.key)}
                      className="accent-amber-500 flex-shrink-0"
                    />
                    <span className={`flex-shrink-0 ${hasModel ? '' : 'line-through'}`}>{sub.label}</span>
                    {hasModel && modelName && (
                      <span className="text-gray-400 truncate ml-1" title={modelName}>{modelName}</span>
                    )}
                    {!hasModel && <span className="text-xs text-gray-400">(no model)</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Runs per combo: {runsPerCombo}</label>
          <input type="range" min={1} max={5} step={1} value={runsPerCombo}
            onChange={(e) => onRunsChange(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
          <p className="text-xs text-gray-400">More runs = more accurate but slower</p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Max combos: {maxCombos}</label>
          <input type="range" min={10} max={50} step={5} value={maxCombos}
            onChange={(e) => onMaxCombosChange(Number(e.target.value))}
            className="w-full accent-amber-500"
          />
          <p className="text-xs text-gray-400">More combos = better search but slower</p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 text-xs text-gray-500 space-y-1">
        <div>
          <strong>Estimate:</strong> {selected.size} subsystem(s) across {selectedModels.size} model(s).
          ~{selected.size * estCallsPerSub} LLM calls, roughly {Math.ceil(estTotal / 60)} min at ~3s/call.
        </div>
        {selectedModels.size > 0 && selectedModels.size < selected.size && (
          <div className="text-amber-600 dark:text-amber-400">
            Reader subsystems sharing a model will use seeded refinement (faster).
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Result Row (used in both running + results phases) ─────────────────────

function ResultRow({ result, accepted, onToggle, showCheckbox = true }) {
  const [expanded, setExpanded] = useState(false);
  const improved = result.improvement > 0.01;
  const worse = result.improvement < -0.01;
  const isInherited = result.phase === 'inherited';
  const phaseBadge = PHASE_BADGES[result.phase];

  return (
    <div className={`border rounded-lg transition-colors ${
      accepted ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-600' :
      isInherited ? 'border-gray-200 dark:border-gray-700 opacity-80' :
      'border-gray-200 dark:border-gray-700'
    }`}>
      <div className="flex items-center gap-3 p-3">
        {showCheckbox && (
          <input
            type="checkbox"
            checked={accepted}
            onChange={onToggle}
            className="accent-amber-500 flex-shrink-0"
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{result.subsystem}</span>
            <span className="text-xs text-gray-400">({result.modelName})</span>
            {phaseBadge && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${phaseBadge.className}`}>
                {phaseBadge.label}
              </span>
            )}
            {result.seedFrom && (
              <span className="text-xs text-gray-400 flex items-center gap-0.5">
                <Link2 size={9} /> {result.seedFrom}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs mt-0.5">
            {!isInherited ? (
              <>
                <span className="text-gray-400">Score: {(result.currentScore * 100).toFixed(0)}%</span>
                <ArrowRight size={10} className="text-gray-400" />
                <span className={improved ? 'text-green-600 font-medium' : worse ? 'text-red-500' : 'text-gray-500'}>
                  {(result.bestScore * 100).toFixed(0)}%
                </span>
                {improved && <span className="text-green-600 text-xs">(+{(result.improvement * 100).toFixed(1)}%)</span>}
                {worse && <span className="text-red-500 text-xs">({(result.improvement * 100).toFixed(1)}%)</span>}
              </>
            ) : (
              <span className="text-gray-400">
                Shared from {result.seedFrom} — {(result.bestScore * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        {!isInherited && (
          <div className="text-xs text-gray-400">{result.testedCombos} combos / {(result.elapsedMs / 1000).toFixed(0)}s</div>
        )}

        <button onClick={() => setExpanded(!expanded)} className="p-1 text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 border-t border-gray-100 dark:border-gray-800 pt-2">
          {/* Parameter values — always shown */}
          <div className="grid grid-cols-5 gap-2 text-xs">
            {Object.entries(PARAM_NAMES).map(([key, label]) => {
              const current = result.currentParams[key];
              const best = result.bestCombo[key];
              const changed = !isInherited && current !== best;
              return (
                <div key={key} className={`p-2 rounded ${changed ? 'bg-amber-50 dark:bg-amber-950/30' : 'bg-gray-50 dark:bg-gray-800'}`}>
                  <div className="text-gray-400 mb-0.5">{label}</div>
                  <div className="font-mono">
                    {isInherited ? (
                      <span className="text-amber-600 dark:text-amber-400 font-medium">{formatParam(key, best)}</span>
                    ) : (
                      <>
                        <span className="text-gray-500">{formatParam(key, current)}</span>
                        {changed && (
                          <>
                            <span className="text-gray-400 mx-1">&rarr;</span>
                            <span className="text-amber-600 dark:text-amber-400 font-medium">{formatParam(key, best)}</span>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quality dimensions from best combo */}
          {result.allResults?.[0]?.scores?.[0]?.dimensions && (
            <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <p className="text-xs text-gray-400 mb-1">Best combo quality dimensions:</p>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(result.allResults[0].scores[0].dimensions).map(([dim, val]) => (
                  <span key={dim} className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800">
                    {dim}: <strong>{(val * 100).toFixed(0)}%</strong>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatParam(key, value) {
  if (key === 'topK') return String(Math.round(value));
  if (value == null) return '-';
  return value.toFixed(2);
}

// ─── Running Panel (with live results) ───────────────────────────────────────

function RunningPanel({ progress, accepted, onToggle, onApply, applyPending }) {
  if (!progress) return <div className="p-8 text-center"><Loader2 className="animate-spin mx-auto text-amber-400" size={24} /></div>;

  const pct = progress.totalCombos > 0
    ? Math.round((progress.currentCombo / progress.totalCombos) * 100)
    : 0;

  const completedResults = progress.results || [];
  const acceptedCount = Object.values(accepted).filter(Boolean).length;

  return (
    <div className="space-y-4">
      <div className="text-center py-3">
        <Loader2 className="animate-spin mx-auto text-amber-400 mb-2" size={24} />
        <p className="text-sm font-medium">
          Tuning: {progress.currentSubsystem || '...'}
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Subsystem {Math.min(progress.subsystemsComplete + 1, progress.subsystemsTotal)} of {progress.subsystemsTotal}
        </p>
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>Combo {progress.currentCombo}/{progress.totalCombos}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Completed subsystem results — live, with values and apply option */}
      {completedResults.length > 0 && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-gray-400">Completed — select to apply now</p>
            {acceptedCount > 0 && (
              <button
                onClick={onApply}
                disabled={applyPending}
                className="text-xs px-2.5 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1"
              >
                {applyPending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                Apply {acceptedCount}
              </button>
            )}
          </div>
          <div className="space-y-2">
            {completedResults.map((r) => (
              <ResultRow
                key={r.subsystem}
                result={r}
                accepted={!!accepted[r.subsystem]}
                onToggle={() => onToggle(r.subsystem)}
                showCheckbox={true}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Results Panel ────────────────────────────────────────────────────────────

function ResultsPanel({ results, accepted, onToggle, status }) {
  const improved = results.filter(r => r.improvement > 0.01);
  const neutral = results.filter(r => Math.abs(r.improvement) <= 0.01);
  const worse = results.filter(r => r.improvement < -0.01);
  const inheritedCount = results.filter(r => r.phase === 'inherited').length;

  return (
    <div className="space-y-3">
      {status === 'cancelled' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-400 text-xs">
          <AlertTriangle size={14} /> Auto-tune was cancelled. Partial results shown below.
        </div>
      )}
      {status === 'error' && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs">
          <AlertTriangle size={14} /> Auto-tune encountered an error.
        </div>
      )}

      <div className="text-xs text-gray-500 flex flex-wrap gap-x-2">
        {improved.length > 0 && <span className="text-green-600">{improved.length} improved</span>}
        {neutral.length > 0 && <span>{neutral.length} unchanged</span>}
        {worse.length > 0 && <span className="text-red-500">{worse.length} worse</span>}
        {inheritedCount > 0 && <span className="text-gray-400">{inheritedCount} inherited</span>}
      </div>

      {results.map((r) => (
        <ResultRow
          key={r.subsystem}
          result={r}
          accepted={!!accepted[r.subsystem]}
          onToggle={() => onToggle(r.subsystem)}
        />
      ))}
    </div>
  );
}

// ─── Main Dialog ──────────────────────────────────────────────────────────────

/** Modal to run autotune: select subsystems/combos, run, then review and apply results. */
export default function AutoTuneDialog({ isOpen, onClose, assignments, consultants }) {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState('config'); // 'config' | 'running' | 'results'
  const [selected, setSelected] = useState(new Set());
  const [runsPerCombo, setRunsPerCombo] = useState(3);
  const [maxCombos, setMaxCombos] = useState(25);
  const [accepted, setAccepted] = useState({});
  const [initialized, setInitialized] = useState(false);

  // Reset initialization flag when dialog closes
  useEffect(() => {
    if (!isOpen) setInitialized(false);
  }, [isOpen]);

  // Poll progress — always enabled when dialog is open, fast polling when running
  const { data: progress } = useQuery({
    queryKey: ['autotune-progress'],
    queryFn: models.autotuneProgress,
    refetchInterval: phase === 'running' ? 2000 : false,
    enabled: isOpen,
    gcTime: 0, // No stale cache between dialog sessions
  });

  // Phase management: reconnect to server state on open, detect completion during running
  useEffect(() => {
    if (!isOpen || !progress) return;

    // One-time initialization per dialog open — reconnect to server state
    if (!initialized && assignments) {
      setInitialized(true);

      if (progress.status === 'running') {
        setPhase('running');
        return;
      }

      if (['complete', 'cancelled', 'error'].includes(progress.status) && progress.results?.length > 0) {
        setPhase('results');
        const acc = {};
        for (const r of progress.results) {
          acc[r.subsystem] = r.improvement > 0.01;
        }
        setAccepted(acc);
        return;
      }

      // Server is idle — show config (select only primary subsystems by default)
      const assigned = new Set(
        TUNABLE_SUBSYSTEMS
          .filter(s => {
            if (s.consultant) return false; // don't auto-select consultants
            return assignments?.[s.key];
          })
          .map(s => s.key)
      );
      setSelected(assigned);
      setPhase('config');
      setAccepted({});
      return;
    }

    // Ongoing: detect completion while in running phase
    if (phase === 'running' && ['complete', 'cancelled', 'error'].includes(progress.status)) {
      setPhase('results');
      setAccepted(prev => {
        const acc = { ...prev };
        for (const r of (progress.results || [])) {
          if (!(r.subsystem in acc)) {
            acc[r.subsystem] = r.improvement > 0.01;
          }
        }
        return acc;
      });
    }
  }, [isOpen, progress, initialized, assignments, phase]);

  const startMutation = useMutation({
    mutationFn: (config) => models.autotuneStart(config),
    onSuccess: () => setPhase('running'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => models.autotuneCancel(),
  });

  const applyMutation = useMutation({
    mutationFn: (changes) => models.autotuneApply(changes),
    onSuccess: (_, changes) => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      // Mark applied subsystems so they don't get double-applied
      setAccepted(prev => {
        const updated = { ...prev };
        for (const c of changes) {
          updated[c.subsystem] = false; // uncheck after applying
        }
        return updated;
      });
    },
  });

  const handleToggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const assignedKeys = new Set(
    TUNABLE_SUBSYSTEMS
      .filter(s => {
        if (s.consultant) return consultants?.[s.subsystem];
        return assignments?.[s.key];
      })
      .map(s => s.key)
  );

  const handleSelectAll = () => setSelected(new Set(assignedKeys));
  const handleSelectNone = () => setSelected(new Set());

  const handleStart = () => {
    startMutation.mutate({
      subsystems: [...selected],
      runsPerCombo,
      maxCombos,
    });
  };

  const handleApply = () => {
    const results = progress?.results || [];
    const changes = results
      .filter((r) => accepted[r.subsystem])
      .map((r) => ({ subsystem: r.subsystem, params: r.bestCombo }));
    if (changes.length > 0) {
      applyMutation.mutate(changes);
    }
  };

  const handleDismiss = () => {
    // Reset server state so a new job can be started without restarting
    models.autotuneReset().catch(() => {});
    onClose();
  };

  const acceptedCount = Object.values(accepted).filter(Boolean).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Zap size={16} className="text-amber-500" />
              Auto-Tune Subsystem Parameters
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {phase === 'config' && 'Select subsystems and configure search'}
              {phase === 'running' && 'Testing parameter combinations...'}
              {phase === 'results' && 'Review and apply optimal parameters'}
            </p>
          </div>
          <button onClick={phase === 'results' ? handleDismiss : onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-4">
          {phase === 'config' && (
            <ConfigPanel
              assignments={assignments}
              consultants={consultants}
              selected={selected}
              onToggle={handleToggle}
              onSelectAll={handleSelectAll}
              onSelectNone={handleSelectNone}
              runsPerCombo={runsPerCombo}
              onRunsChange={setRunsPerCombo}
              maxCombos={maxCombos}
              onMaxCombosChange={setMaxCombos}
            />
          )}
          {phase === 'running' && (
            <RunningPanel
              progress={progress}
              accepted={accepted}
              onToggle={(sub) => setAccepted((p) => ({ ...p, [sub]: !p[sub] }))}
              onApply={handleApply}
              applyPending={applyMutation.isPending}
            />
          )}
          {phase === 'results' && (
            <ResultsPanel
              results={progress?.results || []}
              accepted={accepted}
              onToggle={(sub) => setAccepted((p) => ({ ...p, [sub]: !p[sub] }))}
              status={progress?.status}
            />
          )}
        </div>

        {/* Action bar */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex flex-col gap-2 flex-shrink-0">
          {/* Phase-specific actions */}
          <div className="flex gap-2">
            {phase === 'config' && (
              <>
                <button onClick={onClose} className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
                  Cancel
                </button>
                <button
                  onClick={handleStart}
                  disabled={selected.size === 0 || startMutation.isPending}
                  className="flex-1 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {startMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  Start Auto-Tune ({selected.size})
                </button>
              </>
            )}
            {phase === 'running' && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="flex-1 px-4 py-2 text-sm bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-950/50"
              >
                Cancel Auto-Tune
              </button>
            )}
            {phase === 'results' && (
              <>
                <button onClick={handleDismiss} className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
                  Dismiss
                </button>
                <button
                  onClick={() => {
                    models.autotuneReset().then(() => {
                      setPhase('config');
                      setAccepted({});
                      setInitialized(false);
                    }).catch(() => {});
                  }}
                  className="flex-1 px-4 py-2 text-sm bg-blue-100 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-950/50 flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={14} />
                  Re-tune
                </button>
                <button
                  onClick={handleApply}
                  disabled={acceptedCount === 0 || applyMutation.isPending}
                  className="flex-1 px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {applyMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Apply {acceptedCount} Change{acceptedCount !== 1 ? 's' : ''}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
