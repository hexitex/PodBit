import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, Loader, ChevronDown, ChevronRight } from 'lucide-react';
import { configApi } from '../../lib/api';
import { formatLocal } from '../../lib/datetime';

function isComplex(v) {
  if (v == null) return false;
  if (Array.isArray(v)) return true;
  if (typeof v === 'object') return true;
  if (typeof v === 'string' && v.length > 40) return true;
  return false;
}

function formatInline(v) {
  if (v == null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return `${v.length} item${v.length !== 1 ? 's' : ''}`;
  return `${Object.keys(v).length} keys`;
}

// For arrays of primitives, compute a readable diff
function ArrayDiff({ oldVal, newVal }) {
  const oldSet = new Set(Array.isArray(oldVal) ? oldVal.map(String) : []);
  const newSet = new Set(Array.isArray(newVal) ? newVal.map(String) : []);
  const removed = [...oldSet].filter(x => !newSet.has(x));
  const added = [...newSet].filter(x => !oldSet.has(x));
  const kept = [...newSet].filter(x => oldSet.has(x));

  if (removed.length === 0 && added.length === 0) {
    // Order changed or identical
    return (
      <div className="font-mono text-gray-600 dark:text-gray-400 whitespace-pre-wrap break-all">
        {[...newSet].join('\n')}
      </div>
    );
  }

  return (
    <div className="space-y-0.5 font-mono">
      {removed.map((item, i) => (
        <div key={`r${i}`} className="text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-1 rounded">− {item}</div>
      ))}
      {kept.map((item, i) => (
        <div key={`k${i}`} className="text-gray-500 dark:text-gray-400 px-1">&nbsp; {item}</div>
      ))}
      {added.map((item, i) => (
        <div key={`a${i}`} className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-1 rounded">+ {item}</div>
      ))}
    </div>
  );
}

function ExpandedDiff({ oldValue, newValue }) {
  const bothArraysOfPrimitives =
    Array.isArray(oldValue) && Array.isArray(newValue) &&
    [...oldValue, ...newValue].every(x => typeof x !== 'object' || x == null);

  if (bothArraysOfPrimitives || (oldValue == null && Array.isArray(newValue))) {
    return <ArrayDiff oldVal={oldValue} newVal={newValue} />;
  }

  // Object or long string — show stacked before/after
  const renderFull = (v, colorClass, label) => (
    <div>
      <div className={`text-xs font-medium mb-0.5 ${colorClass}`}>{label}</div>
      <pre className={`font-mono text-xs whitespace-pre-wrap break-all p-1.5 rounded ${
        label === 'Before'
          ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
          : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
      }`}>
        {typeof v === 'string' ? v : JSON.stringify(v, null, 2)}
      </pre>
    </div>
  );

  return (
    <div className="space-y-1.5">
      {oldValue != null && renderFull(oldValue, 'text-red-500 dark:text-red-400', 'Before')}
      {renderFull(newValue, 'text-green-600 dark:text-green-400', 'After')}
    </div>
  );
}

/** Config history: parameter change log with expandable diff. */
export default function ConfigHistory() {
  const [days, setDays] = useState(7);
  const [expanded, setExpanded] = useState(new Set());

  const toggleExpand = (id) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const { data: historyData, isLoading } = useQuery({
    queryKey: ['config-history', days],
    queryFn: () => configApi.history(days, 50),
    refetchInterval: 15000,
  });

  const tierColors = {
    human: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    frontier: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    tier2: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    medium: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    tier1: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
    system: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-gray-400" />
          <h2 className="text-lg font-semibold dark:text-gray-100">Config Change History</h2>
        </div>
        <select
          value={days}
          onChange={(e) => setDays(parseInt(e.target.value, 10))}
          className="text-xs border border-gray-200 dark:border-gray-700 rounded px-2 py-1 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
        >
          <option value={1}>24h</option>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
        </select>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Parameter changes for the current project — who changed what and why.
      </p>

      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Loader size={14} className="animate-spin" /> Loading history...
        </div>
      ) : !historyData?.changes || historyData.changes.length === 0 ? (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-500 dark:text-gray-400">
          No config changes in the last {days} day{days !== 1 ? 's' : ''}. Changes are recorded when parameters are saved via GUI or applied via MCP.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {historyData.changes.map((c) => (
            <div key={c.id} className="text-xs p-2.5 bg-gray-50 dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
              {/* Top row: who + when */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`px-1.5 py-0.5 rounded font-medium shrink-0 ${tierColors[c.changedBy] || tierColors.system}`}>
                  {c.contributor || c.changedBy}
                </span>
                <span className="text-gray-300 dark:text-gray-600 ml-auto shrink-0">
                  {formatLocal(c.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              {/* Parameter name */}
              <div className="mb-1">
                {c.label ? (
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-100">{c.label}</span>
                    {c.sectionTitle && (
                      <span className="text-gray-400 dark:text-gray-500 ml-1.5">in {c.sectionTitle}</span>
                    )}
                  </div>
                ) : (
                  <span className="font-mono text-gray-600 dark:text-gray-400">{c.configPath}</span>
                )}
                {c.description && (
                  <div className="text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{c.description}</div>
                )}
              </div>
              {/* Value change */}
              {isComplex(c.oldValue) || isComplex(c.newValue) ? (
                <div>
                  <button
                    onClick={() => toggleExpand(c.id)}
                    className="flex items-center gap-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 mb-1"
                  >
                    {expanded.has(c.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span className="font-mono">
                      {c.oldValue != null ? (
                        <><span className="text-red-500 line-through">{formatInline(c.oldValue)}</span><span className="mx-1">→</span></>
                      ) : null}
                      <span className="text-green-600 dark:text-green-400">{formatInline(c.newValue)}</span>
                    </span>
                    <span className="ml-1 text-gray-300 dark:text-gray-600">(click to expand)</span>
                  </button>
                  {expanded.has(c.id) && (
                    <div className="mt-1.5 pl-1 border-l-2 border-gray-200 dark:border-gray-700">
                      <ExpandedDiff oldValue={c.oldValue} newValue={c.newValue} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {c.oldValue != null && (
                    <>
                      <span className="font-mono bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded line-through">{formatInline(c.oldValue)}</span>
                      <span className="text-gray-300 dark:text-gray-600">→</span>
                    </>
                  )}
                  <span className="font-mono bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded">{formatInline(c.newValue)}</span>
                </div>
              )}
              {c.reason && c.reason !== 'GUI config save' && (
                <div className="text-gray-400 dark:text-gray-500 italic mt-1" title={c.reason}>{c.reason}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
