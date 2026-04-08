import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { database } from '../../lib/api';

const TYPE_COLORS = {
  seed:         { bg: 'bg-green-500',  label: 'Seeds' },
  synthesis:    { bg: 'bg-blue-500',   label: 'Synthesis' },
  voiced:       { bg: 'bg-purple-500', label: 'Voiced' },
  breakthrough: { bg: 'bg-orange-500', label: 'Breakthrough' },
  possible:     { bg: 'bg-amber-500',  label: 'Possible' },
  question:     { bg: 'bg-red-400',    label: 'Questions' },
  raw:          { bg: 'bg-gray-400',   label: 'Raw' },
  elite_verification: { bg: 'bg-yellow-500', label: 'Elite' },
};

/**
 * Visual summary of the knowledge graph feeding the synthesis pipeline.
 * Uses /database/stats for byType + byDomain breakdowns,
 * and /resonance/stats for node metrics.
 */
export default function GraphContext({ stats }) {
  // database.stats() gives us byType and byDomain arrays
  const { data: dbStats } = useQuery({
    queryKey: ['database', 'stats'],
    queryFn: database.stats,
    staleTime: 30_000,
  });

  const n = stats?.nodes;
  const total = n?.total || 0;
  const types = (dbStats?.byType || []).filter((t) => t.count > 0).sort((a, b) => b.count - a.count);
  const domains = (dbStats?.byDomain || []).filter((d) => d.count > 0 && d.domain).sort((a, b) => b.count - a.count);
  const topDomains = stats?.domainConcentration?.topDomains || [];
  // Use whichever source has domain data
  const domainList = domains.length > 0 ? domains : topDomains;
  const domainCount = domainList.length;
  const synthCycles = stats?.synthesisCycles;

  if (!total) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 mb-4">
      {/* Header line */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{total}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">nodes</span>
          <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
          <span className="text-lg font-bold text-purple-600 dark:text-purple-400">{domainCount}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">domains</span>
          {synthCycles && synthCycles.childrenCreated > 0 && (
            <>
              <span className="text-gray-300 dark:text-gray-600 mx-1">|</span>
              <span className="text-lg font-bold text-green-600 dark:text-green-400">{synthCycles.childrenCreated}</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">born ({stats?.periodDays || 7}d)</span>
            </>
          )}
        </div>
        <Link to="/graph" className="text-xs text-gray-400 hover:text-purple-500 transition-colors">
          View Graph
        </Link>
      </div>

      {/* Node type distribution bar */}
      {types.length > 0 && (
        <div className="mb-3">
          <div className="flex h-4 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
            {types.map((t) => {
              const tc = TYPE_COLORS[t.type] || { bg: 'bg-gray-400', label: t.type };
              const pct = (t.count / total) * 100;
              return (
                <div
                  key={t.type}
                  className={`${tc.bg} transition-all duration-500`}
                  style={{ width: `${Math.max(pct, 0.5)}%` }}
                  title={`${tc.label}: ${t.count} (${pct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
            {types.map((t) => {
              const tc = TYPE_COLORS[t.type] || { bg: 'bg-gray-400', label: t.type };
              return (
                <span key={t.type} className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <span className={`w-2 h-2 rounded-full ${tc.bg} shrink-0`} />
                  {tc.label} <span className="font-mono font-bold">{t.count}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Domain chips */}
      {domainList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {domainList.slice(0, 15).map((d) => (
            <span
              key={d.domain}
              className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full font-mono"
            >
              {d.domain} <span className="text-gray-400 dark:text-gray-500">{d.count}</span>
            </span>
          ))}
          {domainList.length > 15 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">+{domainList.length - 15}</span>
          )}
        </div>
      )}
    </div>
  );
}
