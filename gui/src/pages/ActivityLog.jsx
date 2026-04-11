import { useState, useMemo, useEffect } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Radio, Search, Loader, X } from 'lucide-react';
import { activity } from '../lib/api';
import { resolveNodeNames, getCachedName } from '../lib/node-names';
import { utcDate } from '../lib/datetime';

const CATEGORY_COLORS = {
  synthesis:  { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400', dot: 'bg-purple-500' },
  proxy:      { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600 dark:text-orange-400', dot: 'bg-orange-500' },
  mcp:        { bg: 'bg-blue-100 dark:bg-blue-900/30',     text: 'text-blue-600 dark:text-blue-400',     dot: 'bg-blue-500' },
  kb:         { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  voicing:    { bg: 'bg-pink-100 dark:bg-pink-900/30',     text: 'text-pink-600 dark:text-pink-400',     dot: 'bg-pink-500' },
  config:     { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-600 dark:text-yellow-400', dot: 'bg-yellow-500' },
  system:     { bg: 'bg-gray-100 dark:bg-gray-800',        text: 'text-gray-600 dark:text-gray-400',     dot: 'bg-gray-500' },
  llm:        { bg: 'bg-cyan-100 dark:bg-cyan-900/30',     text: 'text-cyan-600 dark:text-cyan-400',     dot: 'bg-cyan-500' },
  cycle:      { bg: 'bg-teal-100 dark:bg-teal-900/30',     text: 'text-teal-600 dark:text-teal-400',     dot: 'bg-teal-500' },
  lifecycle:  { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-600 dark:text-indigo-400', dot: 'bg-indigo-500' },
  elite:      { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-600 dark:text-amber-400',   dot: 'bg-amber-500' },
  api:        { bg: 'bg-sky-100 dark:bg-sky-900/30',       text: 'text-sky-600 dark:text-sky-400',       dot: 'bg-sky-500' },
};

function formatTimestamp(iso) {
  if (!iso) return '';
  const d = utcDate(iso);
  if (!d) return '';
  const now = new Date();
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  // Show date for older events
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' +
         d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatFullTimestamp(iso) {
  if (!iso) return '';
  return utcDate(iso)?.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

/** Render a confidence/score value as a small bar */
function MiniBar({ value, max = 1, color = 'bg-blue-500' }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="inline-flex items-center gap-1.5">
      <div className="w-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-gray-500 dark:text-gray-400">{typeof value === 'number' ? value.toFixed(2) : value}</span>
    </div>
  );
}

/** Render a detail value with smart formatting */
function DetailValue({ keyName, value }) {
  if ((keyName === 'confidence' || keyName === 'score') && typeof value === 'number') {
    return <MiniBar value={value} color={value >= 0.8 ? 'bg-green-500' : value >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'} />;
  }
  if ((keyName === 'similarity' || keyName === 'threshold') && typeof value === 'number') {
    return <MiniBar value={value} />;
  }
  if ((keyName.endsWith('Id') || keyName.endsWith('_id') || keyName === 'nodeId' || keyName === 'sourceNodeId' || keyName === 'eliteNodeId' || keyName === 'matchedEliteId' || keyName === 'childId') && typeof value === 'string' && /^[0-9a-f-]{30,}$/i.test(value)) {
    return (
      <Link to={`/graph?node=${value}`} className="font-mono text-purple-600 dark:text-purple-400 hover:underline" title={value}>
        {getCachedName(value)}
      </Link>
    );
  }
  if (typeof value === 'boolean') {
    return <span className={value ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{String(value)}</span>;
  }
  if (typeof value === 'object') {
    return <pre className="font-mono text-gray-500 dark:text-gray-400 whitespace-pre-wrap text-xs">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <span>{String(value)}</span>;
}

/** Modal for viewing event detail */
function EventDetailModal({ event, onClose }) {
  if (!event) return null;

  const colors = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.system;
  const detail = event.detail && typeof event.detail === 'object' ? Object.entries(event.detail) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`shrink-0 px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text}`}>
              {event.category}
            </span>
            <span className="text-xs font-mono text-gray-400 dark:text-gray-500 shrink-0">
              {event.type}
            </span>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {/* Message */}
          <div>
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{event.message}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatFullTimestamp(event.created_at)}</p>
          </div>

          {/* Detail key-value pairs */}
          {detail.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Detail</p>
              <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2">
                {detail.map(([key, value]) => (
                  <div key={key} className="flex items-start gap-3 text-sm">
                    <span className="text-gray-400 dark:text-gray-500 shrink-0 font-medium min-w-[120px] text-xs">{key}</span>
                    <span className="text-gray-700 dark:text-gray-300 break-all text-xs">
                      <DetailValue keyName={key} value={value} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const TIME_RANGES = [
  { label: '6h', days: 0.25 },
  { label: '24h', days: 1 },
  { label: '48h', days: 2 },
];

const PAGE_SIZE = 50;

/** Activity log page: paginated events with category and search filters. */
export default function ActivityLog() {
  const [days, setDays] = useState(2);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [page, setPage] = useState(0);
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Fetch categories with counts
  const { data: catData } = useQuery({
    queryKey: ['activity-categories', days],
    queryFn: () => activity.categories({ days }),
    refetchInterval: 10000,
  });

  // Fetch activity events
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['activity-log', { days, category: selectedCategory, search, limit: PAGE_SIZE, offset: page * PAGE_SIZE }],
    queryFn: () => activity.log({
      days,
      category: selectedCategory || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    refetchInterval: 10000,
    placeholderData: keepPreviousData,
  });

  const events = data?.events || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Resolve node names from event details
  const [, forceNames] = useState(0);
  useEffect(() => {
    const ids = new Set();
    for (const e of events) {
      const d = typeof e.detail === 'string' ? null : e.detail;
      if (!d) continue;
      for (const [k, v] of Object.entries(d)) {
        if (typeof v === 'string' && /^[0-9a-f-]{30,}$/i.test(v)) ids.add(v);
      }
    }
    if (ids.size > 0) resolveNodeNames([...ids]).then(() => forceNames(n => n + 1));
  }, [events]);

  const categories = useMemo(() => {
    if (!catData?.categories) return [];
    return catData.categories;
  }, [catData]);

  const totalEvents = useMemo(() => {
    return categories.reduce((sum, c) => sum + c.count, 0);
  }, [categories]);

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(0);
  };

  const handleCategoryClick = (cat) => {
    setSelectedCategory(prev => prev === cat ? null : cat);
    setPage(0);
  };

  const handleTimeRange = (d) => {
    setDays(d);
    setPage(0);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Radio size={24} className="text-green-500" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Activity Log</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {totalEvents.toLocaleString()} events in last {days < 1 ? `${Math.round(days * 24)}h` : `${days * 24}h`}
              {isFetching && !isLoading && <Loader size={12} className="inline ml-2 animate-spin" />}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Time range selector */}
          {TIME_RANGES.map(({ label, days: d }) => (
            <button
              key={d}
              onClick={() => handleTimeRange(d)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                days === d
                  ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Search bar */}
      <form onSubmit={handleSearch} className="mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search messages and details..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(''); setSearchInput(''); setPage(0); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => { setSelectedCategory(null); setPage(0); }}
          className={`px-3 py-1 text-xs rounded-full border transition-colors ${
            !selectedCategory
              ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
              : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400 dark:bg-gray-900 dark:text-gray-400 dark:border-gray-600 dark:hover:border-gray-500'
          }`}
        >
          All ({totalEvents})
        </button>
        {categories.map(({ category: cat, count }) => {
          const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.system;
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              className={`px-3 py-1 text-xs rounded-full border transition-colors flex items-center gap-1.5 ${
                isActive
                  ? `${colors.bg} ${colors.text} border-current`
                  : `bg-white text-gray-500 border-gray-300 hover:border-gray-400 dark:bg-gray-900 dark:text-gray-500 dark:border-gray-600 dark:hover:border-gray-500`
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
              {cat}
              <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Events list */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader size={20} className="animate-spin mr-2" /> Loading activity log...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            {search ? `No events matching "${search}"` : 'No activity events recorded yet'}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {events.map((event) => {
              const colors = CATEGORY_COLORS[event.category] || CATEGORY_COLORS.system;
              const hasDetail = event.detail && typeof event.detail === 'object' && Object.keys(event.detail).length > 0;

              return (
                <div
                  key={event.id}
                  className={`flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors ${hasDetail ? 'cursor-pointer' : ''}`}
                  onClick={() => hasDetail && setSelectedEvent(event)}
                >
                  {/* Category badge */}
                  <span className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${colors.bg} ${colors.text}`}>
                    {event.category}
                  </span>

                  {/* Type */}
                  <span className="shrink-0 text-xs font-mono text-gray-400 dark:text-gray-500 min-w-[140px]">
                    {event.type}
                  </span>

                  {/* Message */}
                  <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 min-w-0 truncate">
                    {event.message}
                  </span>

                  {/* Timestamp */}
                  <span
                    className="shrink-0 text-xs text-gray-400 dark:text-gray-500"
                    title={formatFullTimestamp(event.created_at)}
                  >
                    {formatTimestamp(event.created_at)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-xs rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                Prev
              </button>
              <span className="px-2 text-xs text-gray-500">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1 text-xs rounded bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <EventDetailModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
