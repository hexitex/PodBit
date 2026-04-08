import { useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, Scissors, FlaskConical } from 'lucide-react';
import { resonance } from '../lib/api';
import PipelineTree from './pipeline/PipelineTree';
import PlaybackControls from './pipeline/PlaybackControls';
import GraphContext from './pipeline/GraphContext';
import { usePlaybackState } from './pipeline/usePlaybackState';
import { usePipelineEvents } from './pipeline/usePipelineEvents';

/** Pipeline VCR page: gated funnel visualization with playback and gate baskets. */
export default function Pipeline() {
  const { events, timeRange, isLive, setLive, isLoading, cullCounts } = usePipelineEvents();
  const { data: graphStats } = useQuery({
    queryKey: ['resonance', 'stats'],
    queryFn: () => resonance.getStats({}),
    refetchInterval: 30_000,
  });
  const playback = usePlaybackState(events, timeRange, isLive);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key) {
        case ' ':
          e.preventDefault();
          playback.setMode(playback.mode === 'playing' ? 'paused' : 'playing');
          break;
        case 'ArrowRight':
          e.preventDefault();
          playback.stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          playback.stepBackward();
          break;
        case 'l':
        case 'L':
          e.preventDefault();
          setLive(true);
          playback.setMode('live');
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [playback, setLive]);

  const handleGoLive = useCallback(() => {
    setLive(true);
    playback.setMode('live');
  }, [setLive, playback]);

  // Summary stats — use the authoritative childrenCreated from dream_cycles
  // as a floor, since activity log may be missing child_created events from
  // domain-directed and cluster synthesis paths.
  const activityBorn = playback.gateCounts.born?.pass || 0;
  const statsBorn = graphStats?.synthesisCycles?.childrenCreated || 0;
  const totalBorn = Math.max(activityBorn, statsBorn);
  const totalRejected = Object.values(playback.gateCounts).reduce((s, c) => s + c.fail, 0);
  const passRate = (totalBorn + totalRejected) > 0
    ? ((totalBorn / (totalBorn + totalRejected)) * 100).toFixed(1)
    : '0';

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GitBranch size={24} className="text-purple-500" />
          <div>
            <h1 className="text-2xl font-bold dark:text-white">Pipeline</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Birth &amp; cull quality pipelines
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {isLive && playback.mode === 'live' && (
            <span className="flex items-center gap-2 text-sm text-green-500">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          {/* Summary chips */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded font-mono">
              {totalBorn} born
            </span>
            <span className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded font-mono">
              {totalRejected} rejected
            </span>
            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded font-mono">
              {passRate}% pass
            </span>
          </div>
        </div>
      </div>

      {/* Graph context — what feeds the pipeline */}
      <GraphContext stats={graphStats} />

      {/* Birth pipeline tree visualization */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <GitBranch size={14} className="text-purple-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Birth Pipeline</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">Mechanical checks + minitruth</span>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
            Loading pipeline events...
          </div>
        ) : (
          <PipelineTree
            gateCounts={playback.gateCounts}
            authoritativeBorn={totalBorn}
          />
        )}

        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <PlaybackControls
            mode={playback.mode}
            speed={playback.speed}
            cursorTime={playback.cursorTime}
            timeRange={timeRange}
            events={events}
            onModeChange={playback.setMode}
            onSpeedChange={playback.setSpeed}
            onSeek={playback.seek}
            onStepForward={playback.stepForward}
            onStepBackward={playback.stepBackward}
            onGoLive={handleGoLive}
          />
        </div>
      </div>

      {/* Cull pipeline summary */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Scissors size={14} className="text-amber-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Cull Pipeline</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">Embedding eval + LLM consultant + dedup sweep</span>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-gray-500 dark:text-gray-400">{cullCounts.total} evaluated</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Embedding eval */}
            {((cullCounts.cull_embedding?.pass || 0) + (cullCounts.cull_embedding?.fail || 0)) > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-violet-500" />
                {cullCounts.cull_embedding?.pass || 0}/{(cullCounts.cull_embedding?.pass || 0) + (cullCounts.cull_embedding?.fail || 0)} embed pass
              </span>
            )}
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {cullCounts.cull_boost?.pass || 0} boosted
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {cullCounts.cull_demote?.pass || 0} demoted
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {cullCounts.cull_archive?.pass || 0} archived
            </span>
            {/* Dedup sweep */}
            {(cullCounts.cull_dedup?.pass || 0) > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-orange-500" />
                {cullCounts.cull_dedup?.pass || 0} deduped
              </span>
            )}
            {(cullCounts.cull_error?.fail || 0) > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-mono">
                {cullCounts.cull_error.fail} errors
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lab verification summary */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <FlaskConical size={14} className="text-purple-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">Lab Verification</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">Spec extraction → lab → data evaluation</span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-purple-500" />
            {(playback.gateCounts.lab_extract?.pass || 0) + (playback.gateCounts.lab_extract?.fail || 0)} extracted
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            {playback.gateCounts.lab_supported?.pass || 0} supported
          </span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            {playback.gateCounts.lab_refuted?.pass || 0} refuted
          </span>
          {(playback.gateCounts.lab_extract?.fail || 0) > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-mono">
              {playback.gateCounts.lab_extract?.fail || 0} not reducible
            </span>
          )}
          {(playback.gateCounts.lab_taint?.pass || 0) > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              {playback.gateCounts.lab_taint?.pass || 0} tainted
            </span>
          )}
          {(playback.gateCounts.lab_evidence?.pass || 0) > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-cyan-500" />
              {playback.gateCounts.lab_evidence?.pass || 0} evidence
            </span>
          )}
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-600 mt-1">
        <span>Space: Play/Pause</span>
        <span>Arrows: Step</span>
        <span>L: Go Live</span>
        <span>Click gate to expand</span>
      </div>
    </div>
  );
}
