import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader, Zap, Archive, Scale, Pencil, Star, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { decisions } from '../../lib/api';
import { resolveNodeNames, getCachedName } from '../../lib/node-names';

// Noise filter: skip routine creation/assignment entries that flood the log
const isNoise = (d) => {
  if (d.field === 'created') return true;
  if (d.field === 'domain' && d.reason?.includes('at creation')) return true;
  return false;
};

// Human-readable summary for each decision type
function describDecision(d) {
  const name = getCachedName(d.entity_id);

  if (d.field === 'node_type' && d.new_value === 'breakthrough')
    return { icon: Zap, color: 'text-amber-500', label: 'Breakthrough', desc: d.reason || `${name} promoted` };
  if (d.field === 'node_type' && d.new_value === 'synthesis')
    return { icon: Scale, color: 'text-blue-400', label: 'Demoted', desc: d.reason || `${name} demoted to synthesis` };
  if (d.field === 'junk')
    return { icon: Trash2, color: 'text-red-400', label: 'Junked', desc: d.reason || `${name} marked as junk` };
  if (d.field === 'archived')
    return { icon: Archive, color: 'text-gray-400', label: 'Archived', desc: d.reason || `${name} archived` };
  if (d.field === 'weight')
    return { icon: Star, color: 'text-green-400', label: 'Weight', desc: `${d.old_value} \u2192 ${d.new_value}${d.reason ? ' \u2014 ' + d.reason : ''}` };
  if (d.field === 'content')
    return { icon: Pencil, color: 'text-purple-400', label: 'Edited', desc: d.reason || `${name} content edited` };
  if (d.field === 'domain' || d.field === 'domain_assignment')
    return { icon: Scale, color: 'text-cyan-400', label: 'Domain', desc: `${d.old_value || '(none)'} \u2192 ${d.new_value}${d.reason ? ' \u2014 ' + d.reason : ''}` };
  if (d.field === 'excluded')
    return { icon: Archive, color: 'text-gray-400', label: d.new_value === 'true' ? 'Excluded' : 'Included', desc: d.reason || name };
  if (d.entity_type === 'autotune')
    return { icon: Scale, color: 'text-yellow-400', label: 'Config', desc: `${d.field}: ${d.old_value || '?'} \u2192 ${d.new_value}${d.reason ? ' \u2014 ' + d.reason : ''}` };

  // Fallback
  return { icon: Scale, color: 'text-gray-400', label: d.field, desc: d.reason || `${d.old_value || ''} \u2192 ${d.new_value || ''}` };
}

function formatTimeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Decision log: governance decisions with expandable detail. */
export default function DecisionLog() {
  const [showAll, setShowAll] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const { data: rawDecisions, isLoading } = useQuery({
    queryKey: ['decisions', { limit: 100 }],
    queryFn: () => decisions.list({ limit: 100 }),
    refetchInterval: 15000,
  });

  // Batch-resolve node names for entity IDs
  const [, _forceNames] = useState(0);
  useEffect(() => {
    if (!rawDecisions) return;
    const ids = rawDecisions.map(d => d.entity_id).filter(id => id && typeof id === 'string' && id.length > 8);
    if (ids.length > 0) resolveNodeNames([...new Set(ids)]).then(() => _forceNames(n => n + 1));
  }, [rawDecisions?.length]);

  const filteredDecisions = useMemo(() => {
    if (!rawDecisions) return [];
    return showAll ? rawDecisions : rawDecisions.filter(d => !isNoise(d));
  }, [rawDecisions, showAll]);

  const noiseCount = useMemo(() => {
    if (!rawDecisions) return 0;
    return rawDecisions.filter(isNoise).length;
  }, [rawDecisions]);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6 flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Changelog</h2>
        {noiseCount > 0 && (
          <button
            onClick={() => setShowAll(v => !v)}
            className="text-[0.7rem] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            {showAll ? 'Hide routine' : `+${noiseCount} routine`}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Loader size={14} className="animate-spin" /> Loading...
        </div>
      ) : filteredDecisions.length === 0 ? (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-500 dark:text-gray-400">
          No significant changes recorded yet.
        </div>
      ) : (
        <div className="space-y-0.5 flex-1 min-h-0 overflow-y-auto">
          {filteredDecisions.map((d) => {
            const { icon: Icon, color, label, desc } = describDecision(d);
            const isExpanded = expandedId === d.id;
            const hasDetail = d.reason && desc !== d.reason;
            const hasNodeLink = d.entity_id && d.entity_type !== 'autotune' && d.entity_id.length > 8;
            return (
              <div key={d.id}>
                <div
                  className={`flex items-start gap-2 py-1.5 px-2 rounded text-xs ${hasDetail ? 'cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800' : ''}`}
                  onClick={() => hasDetail && setExpandedId(isExpanded ? null : d.id)}
                >
                  <Icon size={14} className={`${color} shrink-0 mt-0.5`} />
                  <span className={`font-medium shrink-0 w-20 ${color}`}>{label}</span>
                  {hasNodeLink && (
                    <Link to={`/graph?node=${d.entity_id}`} className="text-blue-500 hover:underline font-mono shrink-0" onClick={e => e.stopPropagation()}>
                      {getCachedName(d.entity_id)}
                    </Link>
                  )}
                  <span className="text-gray-600 dark:text-gray-300 flex-1 min-w-0 truncate">{desc}</span>
                  <span className="text-gray-400 dark:text-gray-500 shrink-0 text-[0.65rem] ml-1 flex items-center gap-0.5">
                    {formatTimeAgo(d.created_at)}
                    {d.decided_by_tier === 'human' && <span className="text-green-500 font-semibold ml-1">H</span>}
                    {hasDetail && (isExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />)}
                  </span>
                </div>
                {isExpanded && d.reason && (
                  <div className="ml-8 mb-1 px-2 text-xs text-gray-500 dark:text-gray-400">
                    {d.reason}
                    {d.contributor && <span className="ml-1 text-gray-400">({d.contributor})</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
