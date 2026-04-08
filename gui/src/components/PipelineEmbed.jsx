import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { GitBranch, ExternalLink } from 'lucide-react';
import { resonance } from '../lib/api';
import PipelineTree from '../pages/pipeline/PipelineTree';
import { usePipelineEvents } from '../pages/pipeline/usePipelineEvents';
import { usePlaybackState } from '../pages/pipeline/usePlaybackState';

/**
 * Dashboard embed — compact Sankey flow diagram.
 * Shows pipeline flow in miniature. Links to /pipeline for full detail.
 */
export default function PipelineEmbed() {
  const { events, timeRange, isLive, cullCounts } = usePipelineEvents();
  const { data: graphStats } = useQuery({
    queryKey: ['resonance', 'stats'],
    queryFn: () => resonance.getStats({}),
    staleTime: 30_000,
  });
  const playback = usePlaybackState(events, timeRange, isLive);

  const totalBorn = playback.gateCounts.born?.pass || 0;
  const totalRejected = Object.values(playback.gateCounts).reduce((s, c) => s + c.fail, 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4">
      {/* Header with graph context */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <GitBranch size={16} className="text-purple-500" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Synthesis Pipeline</span>
          {isLive && (
            <span className="flex items-center gap-1.5 text-xs text-green-500">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          )}
          {/* Graph context inline */}
          {graphStats?.nodes && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 ml-2">
              <span className="font-mono font-bold text-gray-600 dark:text-gray-300">{graphStats.nodes.total}</span> nodes
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <span className="font-mono font-bold text-gray-600 dark:text-gray-300">{graphStats.domainConcentration?.topDomains?.length || 0}</span> domains
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-600 dark:text-green-400 font-mono">{totalBorn} born</span>
            <span className="text-red-500 dark:text-red-400 font-mono">{totalRejected} rejected</span>
          </div>
          <Link
            to="/pipeline"
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-purple-500 dark:hover:text-purple-400 transition-colors"
          >
            Full View <ExternalLink size={12} />
          </Link>
        </div>
      </div>

      {/* Compact Sankey diagram — birth pipeline */}
      <PipelineTree
        gateCounts={playback.gateCounts}
        compact
      />

      {/* Compact cull summary */}
      {cullCounts.total > 0 && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 text-xs">
          <span className="text-gray-400 dark:text-gray-500 font-medium">Cull:</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-mono">{cullCounts.cull_boost?.pass || 0}↑</span>
          <span className="text-amber-600 dark:text-amber-400 font-mono">{cullCounts.cull_demote?.pass || 0}↓</span>
          <span className="text-red-500 dark:text-red-400 font-mono">{cullCounts.cull_archive?.pass || 0}✗</span>
        </div>
      )}
    </div>
  );
}
