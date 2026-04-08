import { useQuery } from '@tanstack/react-query';
import { Activity, Loader, Shield } from 'lucide-react';
import { configApi } from '../../lib/api';

/** Overfitting and synthesis health signals from config metrics. */
export default function OverfittingWarnings() {
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['config-metrics'],
    queryFn: () => configApi.metrics(7),
    refetchInterval: 30000,
  });

  const overfitting = metrics?.overfitting;
  const synthesis = metrics?.synthesisEngine;

  const signalColors = {
    safe: 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
    warning: 'bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300',
    danger: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  };

  const getOverallStatus = () => {
    if (!overfitting) return 'safe';
    if (overfitting.metricOscillation) return 'danger';
    if (overfitting.qualityPlateau || overfitting.diversityCollapse) return 'warning';
    return 'safe';
  };

  const status = getOverallStatus();

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <div className="flex items-center gap-2 mb-2">
        <Activity size={18} className={status === 'safe' ? 'text-green-500' : status === 'warning' ? 'text-yellow-500' : 'text-red-500'} />
        <h2 className="text-lg font-semibold">System Health</h2>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Synthesis engine quality metrics and overfitting detection (last 7 days).
      </p>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Loader size={14} className="animate-spin" /> Loading metrics...
        </div>
      ) : !metrics ? (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-500 dark:text-gray-400">
          No metrics available. Run the synthesis engine to generate data.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Synthesis engine summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <div className="text-lg font-bold">{synthesis?.totalCycles || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Cycles</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <div className="text-lg font-bold">{synthesis?.childrenCreated || 0}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Created</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <div className="text-lg font-bold">{synthesis?.successRate != null ? `${(synthesis.successRate * 100).toFixed(1)}%` : '—'}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">Success</div>
            </div>
          </div>

          {/* Rejection breakdown */}
          {synthesis?.rejectionBreakdown?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Top Rejections</div>
              <div className="space-y-1">
                {synthesis.rejectionBreakdown.slice(0, 5).map((r) => (
                  <div key={r.reason} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300 truncate">{r.reason}</span>
                    <span className="text-gray-400 dark:text-gray-500 ml-2 shrink-0">{r.count} ({r.pct}%)</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Overfitting signals */}
          {overfitting && (
            <div>
              <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Overfitting Signals</div>
              <div className="space-y-1.5">
                {overfitting.metricOscillation && (
                  <div className={`p-2 rounded border text-xs ${signalColors.danger}`}>
                    <span className="font-medium">Oscillation detected</span> — parameters being changed back and forth.
                    {overfitting.oscillatingParameters?.length > 0 && (
                      <span className="block text-xs mt-0.5 opacity-75">
                        {overfitting.oscillatingParameters.join(', ')}
                      </span>
                    )}
                  </div>
                )}
                {overfitting.qualityPlateau && (
                  <div className={`p-2 rounded border text-xs ${signalColors.warning}`}>
                    <span className="font-medium">Quality plateau</span> — success rate stagnant ({overfitting.improvementPct}% change).
                    <span className="block mt-0.5 opacity-75">
                      Recent: {Math.round((overfitting.recentSuccessRate || 0) * 100)}% — Prior: {Math.round((overfitting.priorSuccessRate || 0) * 100)}%
                    </span>
                  </div>
                )}
                {overfitting.diversityCollapse && (
                  <div className={`p-2 rounded border text-xs ${signalColors.warning}`}>
                    <span className="font-medium">Diversity collapse</span> — synthesis output concentrated in one domain.
                  </div>
                )}
                {!overfitting.metricOscillation && !overfitting.qualityPlateau && !overfitting.diversityCollapse && (
                  <div className={`p-2 rounded border text-xs ${signalColors.safe}`}>
                    No overfitting signals detected.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Recommendation */}
          {overfitting?.recommendation && status !== 'safe' && (
            <div className="p-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-700 dark:text-blue-300">
              <Shield size={12} className="inline mr-1" />
              {overfitting.recommendation}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
