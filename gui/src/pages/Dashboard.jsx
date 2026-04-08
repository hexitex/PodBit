import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Activity, Brain, Zap, TrendingUp, Server, RefreshCw, Power, Square, Sparkles, Layers, ExternalLink, ThumbsUp, ThumbsDown, AlertTriangle, MessageSquare, Loader2, ShieldCheck, Monitor, Network, Boxes, ScanSearch, Shield, Scissors } from 'lucide-react';
import { Link } from 'react-router-dom';
import { resonance, synthesis, cycles, models, services, context, feedback, breakthroughRegistry, configApi } from '../lib/api';
import ActivityFeed from '../components/ActivityFeed';
import DecisionLog from './config/DecisionLog';
import { useConfirmDialog } from '../components/ConfirmDialog';
import PipelineEmbed from '../components/PipelineEmbed';

// ---------------------------------------------------------------------------
// Health & Stats Panel (merged StatCards + OverfittingWarnings + Lifecycle)
// ---------------------------------------------------------------------------
function HealthStatsPanel() {
  const { data: stats } = useQuery({
    queryKey: ['resonance', 'stats'],
    queryFn: () => resonance.getStats({}),
    refetchInterval: 30_000,
  });

  const { data: registryStats } = useQuery({
    queryKey: ['breakthroughRegistry', 'stats'],
    queryFn: () => breakthroughRegistry.stats(),
    staleTime: 30000,
  });

  const { data: metrics } = useQuery({
    queryKey: ['config-metrics'],
    queryFn: () => configApi.metrics(7),
    refetchInterval: 30000,
  });

  const { data: health } = useQuery({
    queryKey: ['orchestrator', 'health'],
    queryFn: services.health,
    retry: 1,
    staleTime: 60000,
  });

  const overfitting = metrics?.overfitting;
  const synthMetrics = metrics?.synthesisEngine;
  const m = stats?.metabolism;

  const signalColors = {
    safe: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    warning: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
    danger: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  };

  const hasOverfitSignal = overfitting && (overfitting.metricOscillation || overfitting.qualityPlateau || overfitting.diversityCollapse);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <Activity size={16} className="text-blue-500" />
        <h2 className="text-sm font-semibold">Health & Stats</h2>
        {health?.version && (
          <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full font-mono ml-auto">
            v{health.version}
          </span>
        )}
      </div>

      {/* Core stats - compact 2x2 */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Nodes</span>
            <Brain size={12} className="text-blue-400" />
          </div>
          <div className="text-lg font-bold dark:text-gray-100">{stats?.nodes?.total || 0}</div>
          <div className="text-xs text-gray-400">{stats?.nodes?.seeds || 0} seeds</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Breakthroughs</span>
            <Zap size={12} className="text-purple-400" />
          </div>
          <div className="text-lg font-bold dark:text-gray-100">{stats?.nodes?.breakthroughs || 0}</div>
          <div className="text-xs text-gray-400">{registryStats?.total ? `${registryStats.total} global` : ''}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Avg Weight</span>
            <TrendingUp size={12} className="text-green-400" />
          </div>
          <div className="text-lg font-bold dark:text-gray-100">{stats?.nodes?.avgWeight?.toFixed(2) || '0.00'}</div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 dark:text-gray-400">Avg Specificity</span>
            <Activity size={12} className="text-orange-400" />
          </div>
          <div className="text-lg font-bold dark:text-gray-100">{stats?.nodes?.avgSpecificity?.toFixed(1) || '0.0'}</div>
        </div>
      </div>

      {/* Synthesis engine summary */}
      {synthMetrics && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Synthesis (7d)</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-1.5">
              <div className="text-sm font-bold">{synthMetrics.totalCycles || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Cycles</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-1.5">
              <div className="text-sm font-bold">{synthMetrics.childrenCreated || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Created</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-1.5">
              <div className="text-sm font-bold">{synthMetrics.successRate != null ? `${(synthMetrics.successRate * 100).toFixed(0)}%` : '\u2014'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Success</div>
            </div>
          </div>
        </div>
      )}

      {/* Node lifecycle phase bar */}
      {m && m.totalNodes > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Lifecycle</div>
          <div className="w-full h-2 rounded-full overflow-hidden flex bg-gray-100 dark:bg-gray-800 mb-1">
            {m.nascentCount > 0 && <div className="bg-blue-400" style={{ width: `${(m.nascentCount / m.totalNodes) * 100}%` }} title={`Nascent: ${m.nascentCount}`} />}
            {m.activeCount > 0 && <div className="bg-green-400" style={{ width: `${(m.activeCount / m.totalNodes) * 100}%` }} title={`Active: ${m.activeCount}`} />}
            {m.decliningCount > 0 && <div className="bg-amber-400" style={{ width: `${(m.decliningCount / m.totalNodes) * 100}%` }} title={`Declining: ${m.decliningCount}`} />}
          </div>
          <div className="flex gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />{m.nascentCount}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />{m.activeCount}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />{m.decliningCount}</span>
            <span className="ml-auto">Birth/24h: {m.birthRate}</span>
          </div>
        </div>
      )}

      {/* Overfitting alerts - only shown when issues detected */}
      {hasOverfitSignal && (
        <div className="space-y-1.5 mt-auto">
          {overfitting.metricOscillation && (
            <div className={`p-2 rounded border text-xs ${signalColors.danger}`}>
              <span className="font-medium">Oscillation</span> — params changing back and forth
            </div>
          )}
          {overfitting.qualityPlateau && (
            <div className={`p-2 rounded border text-xs ${signalColors.warning}`}>
              <span className="font-medium">Quality plateau</span> — {overfitting.improvementPct}% change
            </div>
          )}
          {overfitting.diversityCollapse && (
            <div className={`p-2 rounded border text-xs ${signalColors.warning}`}>
              <span className="font-medium">Diversity collapse</span> — output concentrated
            </div>
          )}
          {overfitting.recommendation && (
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
              <Shield size={10} className="inline mr-1" />
              {overfitting.recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// System Control (services, synthesis engine, autonomous cycles)
// ---------------------------------------------------------------------------
function SystemControl() {
  const queryClient = useQueryClient();
  const [shutdownState, setShutdownState] = useState(null);
  const [synthMode, setSynthMode] = useState(() => localStorage.getItem('synthesis-mode') || 'mcp');
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const [pendingCycles, setPendingCycles] = useState({});

  // --- Queries ---
  const { data: serviceStatus, isLoading: servicesLoading, error: servicesError, refetch: refetchServices } = useQuery({
    queryKey: ['services', 'status'],
    queryFn: services.status,
    refetchInterval: shutdownState === 'done' ? false : 5000,
    retry: shutdownState === 'done' ? false : 1,
  });

  const { data: synthStatus, isLoading: synthLoading } = useQuery({
    queryKey: ['synthesis', 'status'],
    queryFn: synthesis.status,
    refetchInterval: 10_000,
  });

  const { data: cycleStatus } = useQuery({
    queryKey: ['cycles', 'status'],
    queryFn: cycles.status,
    refetchInterval: 10_000,
  });

  // Sync synthesis mode with server
  useEffect(() => {
    if (synthStatus?.running && synthStatus?.mode) setSynthMode(synthStatus.mode);
  }, [synthStatus?.running, synthStatus?.mode]);
  useEffect(() => { localStorage.setItem('synthesis-mode', synthMode); }, [synthMode]);

  // --- Mutations ---
  const _svcStartMutation = useMutation({
    mutationFn: (id) => services.start(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', 'status'] }),
  });
  const _svcStopMutation = useMutation({
    mutationFn: (id) => services.stop(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', 'status'] }),
  });
  const _svcRestartMutation = useMutation({
    mutationFn: (id) => services.restart(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', 'status'] }),
  });
  const startAllMutation = useMutation({
    mutationFn: () => services.startAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', 'status'] }),
  });
  const stopAllMutation = useMutation({
    mutationFn: () => services.stopAll(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['services', 'status'] }),
  });
  const synthStartMutation = useMutation({
    mutationFn: (params) => synthesis.start(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['synthesis', 'status'] }),
  });
  const synthStopMutation = useMutation({
    mutationFn: () => synthesis.stop(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['synthesis', 'status'] }),
  });
  const cycleStartMutation = useMutation({
    mutationFn: (type) => { setPendingCycles(p => ({ ...p, [type]: 'starting' })); return cycles.start(type); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cycles', 'status'] }),
    onSettled: (_d, _e, type) => setPendingCycles(p => { const next = { ...p }; delete next[type]; return next; }),
  });
  const cycleStopMutation = useMutation({
    mutationFn: (type) => { setPendingCycles(p => ({ ...p, [type]: 'stopping' })); return cycles.stop(type); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cycles', 'status'] }),
    onSettled: (_d, _e, type) => setPendingCycles(p => { const next = { ...p }; delete next[type]; return next; }),
  });

  const handleShutdown = async () => {
    const ok = await confirm({
      title: 'Shutdown System',
      message: 'Shutdown everything?\n\nThis will stop all services and the orchestrator. The GUI will become unavailable.',
      confirmLabel: 'Shutdown',
    });
    if (!ok) return;
    setShutdownState('shutting_down');
    try { await services.shutdown(); } catch { /* server exits */ }
    setShutdownState('done');
  };

  // --- Derived state ---
  const serviceIcons = { resonance: Server, gui: Monitor, proxy: Network, partitionServer: Boxes };
  const serviceEntries = serviceStatus ? Object.entries(serviceStatus) : [];
  const manageable = serviceEntries.filter(([, s]) => s.manageable);
  const dependencies = serviceEntries.filter(([, s]) => !s.manageable && !s.ideManaged);
  const hasAnyStopped = manageable.some(([, s]) => s.status === 'stopped' || s.status === 'error');
  const hasAnyRunning = manageable.some(([, s]) => s.status === 'running' || s.status === 'starting');

  const synthRunning = synthStatus?.running;
  const synthStopping = synthStatus?.running && synthStatus?.shouldStop;
  const synthEnabled = synthStatus?.enabled !== false;

  const cycleGroups = [
    { label: 'Birth', icon: Sparkles, cycles: [
      { type: 'voicing', label: 'Autonomous Voicing', icon: Sparkles },
      { type: 'ground_rules', label: 'Ground Rules', icon: Shield },
    ]},
    { label: 'Cull', icon: Scissors, cycles: [
      { type: 'population_control', label: 'Population Control', icon: Scissors },
    ]},
    { label: 'Enrichment', icon: Brain, cycles: [
      { type: 'validation', label: 'Breakthrough Scanner', icon: ScanSearch },
      { type: 'questions', label: 'Question Answerer', icon: MessageSquare },
      { type: 'tensions', label: 'Tension Explorer', icon: AlertTriangle },
      { type: 'research', label: 'Domain Researcher', icon: Brain },
      { type: 'autorating', label: 'Quality Autorator', icon: ThumbsUp },
      { type: 'evm', label: 'Lab Verification', icon: ShieldCheck },
    ]},
  ];
  const cycleTypes = cycleGroups.flatMap(g => g.cycles);

  const getCycleState = (cs, pending) => {
    if (pending === 'starting') return 'starting';
    if (pending === 'stopping') return 'stopping';
    if (cs?.running && cs?.shouldStop) return 'stopping';
    if (cs?.running) return 'running';
    return 'stopped';
  };

  const hasAnyCycleStopped = cycleTypes.some(({ type }) => getCycleState(cycleStatus?.[type], pendingCycles[type]) === 'stopped');
  const hasAnyCycleRunning = cycleTypes.some(({ type }) => {
    const st = getCycleState(cycleStatus?.[type], pendingCycles[type]);
    return st === 'running' || st === 'stopping';
  });

  const statusDot = (status) => {
    const colors = { running: 'text-green-500', starting: 'text-yellow-500', stopping: 'text-amber-500', stopped: 'text-gray-400 dark:text-gray-600', error: 'text-red-500', 'not configured': 'text-gray-300 dark:text-gray-700' };
    const icons = { running: '\u25CF', starting: '\u25D0', stopping: '\u25D0', stopped: '\u25CB', error: '\u25CF', 'not configured': '\u25CC' };
    const animate = (status === 'stopping' || status === 'starting') ? 'animate-pulse' : '';
    return <span className={`text-lg leading-none ${colors[status] || 'text-gray-500'} ${animate}`}>{icons[status] || '?'}</span>;
  };

  const serviceDetail = (svc) => {
    if (svc.status === 'not configured') return 'Not configured';
    if (svc.status === 'starting') return 'Starting...';
    if (svc.status !== 'running') return svc.error || 'Offline';
    if (svc.ideManaged) return 'Managed by IDE';
    if (svc.pid) return `PID: ${svc.pid}`;
    if (svc.external) return 'External';
    return 'Online';
  };

  if (shutdownState === 'done') {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6 h-full">
        <div className="text-center py-8">
          <Power size={32} className="mx-auto text-gray-400 mb-3" />
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">System shut down</div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">All services and the orchestrator have been stopped.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 h-full">
      {shutdownState === 'shutting_down' && (
        <div className="mb-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-center text-sm">
          <Loader2 size={14} className="animate-spin inline mr-2" />
          <span className="text-yellow-700 dark:text-yellow-300">Shutting down...</span>
        </div>
      )}

      {servicesError ? (
        <div className="text-sm text-red-500">Cannot connect to orchestrator</div>
      ) : servicesLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Connecting...</div>
      ) : (
        <div className="space-y-3">
          {/* Row 1: Services inline + bulk actions */}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[0.65rem] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Services</span>
            <div className="flex items-center gap-3 flex-1 flex-wrap">
              {manageable.map(([id, svc]) => {
                const SvcIcon = serviceIcons[id];
                return (
                  <span key={id} className="flex items-center gap-1.5 text-xs" title={serviceDetail(svc)}>
                    {statusDot(svc.status)}
                    {SvcIcon && <SvcIcon size={12} className="text-gray-400 dark:text-gray-500" />}
                    <span className="font-medium text-gray-700 dark:text-gray-300">{svc.name}</span>
                  </span>
                );
              })}
              {dependencies.map(([id, svc]) => (
                <span key={id} className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500" title={serviceDetail(svc)}>
                  {statusDot(svc.status)}
                  <span>{svc.name}</span>
                </span>
              ))}
            </div>
            <div className="flex items-center gap-1">
              {hasAnyStopped && (
                <button onClick={() => startAllMutation.mutate()} disabled={startAllMutation.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50">
                  <Play size={10} /> All
                </button>
              )}
              {hasAnyRunning && (
                <button onClick={() => stopAllMutation.mutate()} disabled={stopAllMutation.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50">
                  <Square size={10} /> All
                </button>
              )}
              <button onClick={() => refetchServices()} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors" title="Refresh">
                <RefreshCw size={12} />
              </button>
            </div>
          </div>

          {/* Row 2: Synthesis Engine inline */}
          <div className="flex items-center gap-3 border-t border-gray-100 dark:border-gray-800 pt-3">
            {statusDot(synthStopping ? 'stopping' : synthRunning ? 'running' : 'stopped')}
            <Sparkles size={14} className="text-gray-400 dark:text-gray-500 shrink-0" />
            <span className="text-sm font-medium">Synthesis</span>
            {synthRunning && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {synthStatus.cycleCount || 0} cycles
              </span>
            )}
            <div className="flex rounded overflow-hidden border border-gray-200 dark:border-gray-700 text-[0.65rem] leading-none ml-auto"
              title={synthMode === 'api' ? 'API: Calls LLMs directly' : 'MCP: Queues for IDE agent'}>
              <button onClick={() => setSynthMode('api')} disabled={synthRunning}
                className={`px-1.5 py-0.5 transition-colors ${synthMode === 'api' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>API</button>
              <button onClick={() => setSynthMode('mcp')} disabled={synthRunning}
                className={`px-1.5 py-0.5 transition-colors border-l border-gray-200 dark:border-gray-700 ${synthMode === 'mcp' ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>MCP</button>
            </div>
            {synthStopping ? (
              <Loader2 size={14} className="animate-spin text-amber-500 ml-2" />
            ) : !synthRunning ? (
              <button onClick={() => synthStartMutation.mutate({ mode: synthMode })} disabled={synthStartMutation.isPending || synthLoading || !synthEnabled}
                className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded transition-colors disabled:opacity-50 ml-2">
                <Play size={12} /> Start
              </button>
            ) : (
              <button onClick={() => synthStopMutation.mutate()} disabled={synthStopMutation.isPending}
                className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50 ml-2">
                <Square size={12} /> Stop
              </button>
            )}
          </div>

          {/* Row 3: Autonomous cycles grouped by pipeline */}
          <div className="border-t border-gray-100 dark:border-gray-800 pt-3 space-y-2">
            {cycleGroups.map(group => (
              <div key={group.label} className="flex items-center gap-2 flex-wrap">
                <span className="text-[0.65rem] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1 w-16 shrink-0">{group.label}</span>
                {group.cycles.map(({ type, label, icon: Icon }) => {
                  const cs = cycleStatus?.[type];
                  const pending = pendingCycles[type];
                  const state = getCycleState(cs, pending);
                  const running = state === 'running';
                  const transitioning = state === 'stopping' || state === 'starting';
                  return (
                    <button
                      key={type}
                      onClick={() => running ? cycleStopMutation.mutate(type) : cycleStartMutation.mutate(type)}
                      disabled={transitioning}
                      className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded-full border transition-colors ${
                        running
                          ? 'border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                          : transitioning
                            ? 'border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-600'
                            : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                      title={`${label}${running ? ` (${cs?.cycleCount || 0} cycles)` : ''}`}
                    >
                      {transitioning ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Icon size={11} />
                      )}
                      <span className="font-medium">{type.charAt(0).toUpperCase() + type.slice(1, 5)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="flex items-center gap-1 justify-end">
              {hasAnyCycleStopped && (
                <button onClick={() => { cycleTypes.forEach(({ type }) => { if (getCycleState(cycleStatus?.[type], pendingCycles[type]) === 'stopped') cycleStartMutation.mutate(type); }); }}
                  className="text-[0.65rem] text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 px-1.5 py-0.5 rounded transition-colors">
                  Start All
                </button>
              )}
              {hasAnyCycleRunning && (
                <button onClick={() => cycleTypes.forEach(({ type }) => { const st = getCycleState(cycleStatus?.[type], pendingCycles[type]); if (st === 'running') cycleStopMutation.mutate(type); })}
                  className="text-[0.65rem] text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 px-1.5 py-0.5 rounded transition-colors">
                  Stop All
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-end pt-2 mt-2 border-t border-gray-100 dark:border-gray-800">
        <button onClick={handleShutdown}
          className="text-[0.65rem] text-gray-400 hover:text-red-500 transition-colors">
          Shutdown
        </button>
      </div>
      {ConfirmDialogEl}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cost Summary
// ---------------------------------------------------------------------------
function CostSummary() {
  const { data } = useQuery({
    queryKey: ['models', 'cost'],
    queryFn: models.cost,
  });

  if (!data) return null;

  const totals = data.totals || {};
  const period = data.period?.days || 30;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">API Cost Summary</h2>
        <Link to="/costs" className="text-xs text-podbit-500 hover:text-podbit-400 transition-colors">View Details &rarr;</Link>
      </div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Last {period} days.</p>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">LLM Calls</span>
          <span>{totals.calls || 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Input Tokens</span>
          <span>{(totals.input_tokens || 0).toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500 dark:text-gray-400">Output Tokens</span>
          <span>{(totals.output_tokens || 0).toLocaleString()}</span>
        </div>
        <div className="pt-3 border-t dark:border-gray-700">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500 dark:text-gray-400">Input Cost</span>
            <span>${(totals.input_cost || 0).toFixed(4)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-500 dark:text-gray-400">Output Cost</span>
            <span>${(totals.output_cost || 0).toFixed(4)}</span>
          </div>
          <div className="flex justify-between font-medium mt-2">
            <span>Total Cost</span>
            <span>${(totals.total_cost || 0).toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Context Engine Panel
// ---------------------------------------------------------------------------
function ContextEnginePanel() {
  const { data: sessions } = useQuery({
    queryKey: ['context', 'sessions'],
    queryFn: context.listSessions,
    refetchInterval: 30_000,
  });

  const { data: aggregate } = useQuery({
    queryKey: ['context', 'aggregate'],
    queryFn: context.aggregate,
    refetchInterval: 30_000,
  });

  const { data: budgets } = useQuery({
    queryKey: ['context', 'budgets'],
    queryFn: context.budgets,
  });

  const sessionCount = sessions?.sessions?.length || 0;
  const totalTurns = aggregate?.totalTurns || 0;

  const budgetData = budgets ? [
    { name: 'Knowledge', value: budgets.knowledge, color: '#047857' },
    { name: 'History', value: budgets.history, color: '#0369a1' },
    { name: 'System', value: budgets.systemPrompt, color: '#b45309' },
    { name: 'Response', value: budgets.response, color: '#7c3aed' },
  ] : [];
  const budgetTotal = budgetData.reduce((s, b) => s + b.value, 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6 flex flex-col h-full">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Layers size={20} className="text-emerald-500" />
        Context Engine
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center">
          <p className="text-lg font-bold">{sessionCount}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Active Sessions</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center">
          <p className="text-lg font-bold">{totalTurns}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Turns</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center col-span-2 sm:col-span-1">
          <p className="text-lg font-bold">{aggregate?.persistedInsights || 0}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Saved Insights</p>
        </div>
      </div>

      {budgetTotal > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">Token Budget Allocation</p>
          <div className="flex h-4 rounded-full overflow-hidden">
            {budgetData.map((b) => (
              <div
                key={b.name}
                style={{ width: `${(b.value / budgetTotal) * 100}%`, backgroundColor: b.color }}
                className="flex items-center justify-center"
                title={`${b.name}: ${b.value} tokens (${Math.round((b.value / budgetTotal) * 100)}%)`}
              >
                <span className="text-[0.6rem] text-white font-semibold bar-text truncate px-1">
                  {Math.round((b.value / budgetTotal) * 100)}%
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-3 mt-1.5">
            {budgetData.map((b) => (
              <span key={b.name} className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ backgroundColor: b.color }} />
                {b.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {sessionCount === 0 && !aggregate?.persistedInsights && (
        <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
          No active sessions.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Feedback Stats Panel
// ---------------------------------------------------------------------------
function FeedbackStatsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ['feedback', 'stats'],
    queryFn: () => feedback.stats({ days: 30, limit: 5 }),
    refetchInterval: 60_000,
  });

  const { data: unratedData } = useQuery({
    queryKey: ['feedback', 'unrated'],
    queryFn: () => feedback.unrated({ limit: 1 }),
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6 h-full">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <MessageSquare size={20} className="text-blue-500" />
          Feedback
        </h2>
        <p className="text-xs text-gray-400 dark:text-gray-500">Loading...</p>
      </div>
    );
  }

  const byRating = data?.byRating || { useful: 0, notUseful: 0, harmful: 0 };
  const bySource = data?.bySource || { human: 0, agent: 0, auto: 0 };
  const totalFeedback = data?.totalFeedback || 0;
  const nodesCovered = data?.nodesCovered || 0;
  const qualityScore = totalFeedback > 0 ? Math.round((byRating.useful / totalFeedback) * 100) : 0;
  const unratedCount = unratedData?.total || 0;
  const recentFeedback = data?.recentFeedback || [];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6 flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare size={20} className="text-blue-500" />
          Feedback
        </h2>
        <Link to="/graph" className="text-xs text-blue-500 hover:text-blue-600 flex items-center gap-1">
          Rate Nodes <ExternalLink size={10} />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center">
          <p className="text-lg font-bold">{totalFeedback}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Ratings</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center">
          <p className="text-lg font-bold">{nodesCovered}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Nodes Rated</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center">
          <p className={`text-lg font-bold ${qualityScore >= 70 ? 'text-green-600' : qualityScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
            {qualityScore}%
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Quality Score</p>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 text-center">
          <p className={`text-lg font-bold ${unratedCount > 50 ? 'text-orange-600' : ''}`}>
            {unratedCount}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Need Rating</p>
        </div>
      </div>

      {totalFeedback > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">Rating Breakdown</p>
          <div className="flex h-5 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
            {byRating.useful > 0 && (
              <div style={{ width: `${(byRating.useful / totalFeedback) * 100}%`, backgroundColor: '#047857' }} className="flex items-center justify-center" title={`Useful: ${byRating.useful}`}>
                <span className="text-[0.65rem] text-white font-semibold bar-text">{byRating.useful}</span>
              </div>
            )}
            {byRating.notUseful > 0 && (
              <div style={{ width: `${(byRating.notUseful / totalFeedback) * 100}%`, backgroundColor: '#b45309' }} className="flex items-center justify-center" title={`Not Useful: ${byRating.notUseful}`}>
                <span className="text-[0.65rem] text-white font-semibold bar-text">{byRating.notUseful}</span>
              </div>
            )}
            {byRating.harmful > 0 && (
              <div style={{ width: `${(byRating.harmful / totalFeedback) * 100}%`, backgroundColor: '#dc2626' }} className="flex items-center justify-center" title={`Harmful: ${byRating.harmful}`}>
                <span className="text-[0.65rem] text-white font-semibold bar-text">{byRating.harmful}</span>
              </div>
            )}
          </div>
          <div className="flex gap-3 mt-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-1.5">
              <ThumbsUp size={12} className="text-green-500" /> Useful
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-1.5">
              <ThumbsDown size={12} className="text-yellow-500" /> Meh
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-300 flex items-center gap-1.5">
              <AlertTriangle size={12} className="text-red-500" /> Bad
            </span>
          </div>
        </div>
      )}

      {totalFeedback > 0 && (
        <div className="mb-4">
          <p className="text-xs text-gray-500 mb-1">By Source</p>
          <div className="flex flex-wrap gap-1.5">
            {bySource.human > 0 && (
              <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-100 dark:border-blue-800">
                Human: {bySource.human}
              </span>
            )}
            {bySource.agent > 0 && (
              <span className="text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-100 dark:border-purple-800">
                Agent: {bySource.agent}
              </span>
            )}
            {bySource.auto > 0 && (
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-2.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-700">
                Auto: {bySource.auto}
              </span>
            )}
          </div>
        </div>
      )}

      {recentFeedback.length > 0 && (
        <div className="flex-1 flex flex-col min-h-0">
          <p className="text-xs text-gray-500 mb-2 shrink-0">Recent Activity</p>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {recentFeedback.map((f) => (
              <div key={f.id} className={`text-xs rounded-lg p-2 border ${
                f.rating === 1 ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800' : f.rating === 0 ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-100 dark:border-yellow-800' : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800'
              }`}>
                <div className="flex justify-between items-center mb-0.5">
                  <span className={`font-medium flex items-center gap-1 ${
                    f.rating === 1 ? 'text-green-700 dark:text-green-300' : f.rating === 0 ? 'text-yellow-700 dark:text-yellow-300' : 'text-red-700 dark:text-red-300'
                  }`}>
                    {f.rating === 1 ? <ThumbsUp size={11} /> : f.rating === 0 ? <ThumbsDown size={11} /> : <AlertTriangle size={11} />}
                    {f.ratingLabel}
                  </span>
                  <span className={`font-mono ${f.weightChange > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {f.weightChange > 0 ? '+' : ''}{f.weightChange.toFixed(2)}
                  </span>
                </div>
                <div className="text-gray-600 dark:text-gray-300 truncate">{f.node?.content || '...'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {totalFeedback === 0 && (
        <div className="text-center py-4">
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">No feedback recorded yet.</p>
          <Link to="/resonance" className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
            <ThumbsUp size={12} /> Start Rating Nodes
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export default function Dashboard() {
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      {/* Row 1: Controls+Costs (left) + Health & Stats (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 mb-6">
        <div className="flex flex-col gap-4 md:gap-6">
          <SystemControl />
          <CostSummary />
        </div>
        <HealthStatsPanel />
      </div>

      {/* Row 2: Synthesis Pipeline (full width) */}
      <div className="mb-6">
        <PipelineEmbed />
      </div>

      {/* Row 3: Activity+Context (left) + Feedback+Decisions (right) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6">
        <div className="flex flex-col gap-4 md:gap-6">
          <div className="h-[400px] md:h-[500px]"><ActivityFeed /></div>
          <ContextEnginePanel />
        </div>
        <div className="flex flex-col gap-4 md:gap-6">
          <div className="h-[400px] md:h-[500px]"><FeedbackStatsPanel /></div>
          <div className="max-h-[300px] md:max-h-[400px] overflow-hidden"><DecisionLog /></div>
        </div>
      </div>
    </div>
  );
}
