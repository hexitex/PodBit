import { useState, } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, Download, ArrowUpDown, ChevronLeft, ChevronRight, Shield, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { models, budget } from '../lib/api';

const GRANULARITIES = ['hour', 'day', 'month', 'year'];
const DAY_PRESETS = [
  { label: '24h', value: 1 },
  { label: '7d', value: 7 },
  { label: '30d', value: 30 },
  { label: '90d', value: 90 },
  { label: '1y', value: 365 },
  { label: 'All', value: 3650 },
];

function formatCost(v) {
  if (v == null) return '$0.0000';
  return `$${Number(v).toFixed(4)}`;
}

function formatTokens(v) {
  if (v == null) return '0';
  return Number(v).toLocaleString();
}

function formatPeriodLabel(period, granularity) {
  if (!period) return '';
  if (granularity === 'hour') {
    // "2026-02-15 14:00" → "Feb 15 14:00"
    const [date, time] = period.split(' ');
    const d = new Date(date + 'T' + (time || '00:00'));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + (time || '00:00');
  }
  if (granularity === 'day') {
    const d = new Date(period + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (granularity === 'month') {
    const [y, m] = period.split('-');
    const d = new Date(Number(y), Number(m) - 1);
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }
  return period; // year
}

const PERIODS = [
  { key: 'hourly', label: 'Hourly' },
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
];

function BudgetPanel() {
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery({
    queryKey: ['budget', 'status'],
    queryFn: () => budget.status(),
    refetchInterval: 10000,
  });

  const updateMutation = useMutation({
    mutationFn: (updates) => budget.updateConfig(updates),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  });

  const resumeMutation = useMutation({
    mutationFn: () => budget.resume(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  });

  const config = status?.config;
  const costs = status?.costs || {};
  const utilization = status?.utilization || {};

  const handleToggle = () => {
    updateMutation.mutate({ enabled: !config?.enabled });
  };

  const handleLimitChange = (period, value) => {
    const num = value === '' ? null : parseFloat(value);
    if (value !== '' && (Number.isNaN(num) || num <= 0)) return;
    updateMutation.mutate({ limits: { [period]: num } });
  };

  const handleThresholdChange = (value) => {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num < 50 || num > 99) return;
    updateMutation.mutate({ warningThreshold: num / 100 });
  };

  if (isLoading) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield size={18} className={config?.enabled ? 'text-podbit-500' : 'text-gray-400'} />
          <h2 className="font-semibold text-sm">Budget Limits</h2>
          {status?.exceeded && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full">
              <AlertTriangle size={12} /> PAUSED
            </span>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <span className="text-xs text-gray-500">{config?.enabled ? 'On' : 'Off'}</span>
          <button
            onClick={handleToggle}
            className={`relative w-10 h-5 rounded-full transition-colors ${config?.enabled ? 'bg-podbit-500' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config?.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </label>
      </div>

      {config?.enabled && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {PERIODS.map(({ key, label }) => {
              const limit = config?.limits?.[key];
              const cost = costs[key] || 0;
              const util = utilization[key];
              const pct = util != null ? Math.min(util * 100, 100) : null;
              const isOver = pct != null && pct >= 100;
              const isWarn = pct != null && pct >= (config?.warningThreshold || 0.8) * 100 && !isOver;

              return (
                <div key={key} className="space-y-1.5">
                  <label className="text-xs text-gray-500 dark:text-gray-400">{label} ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No limit"
                    value={limit ?? ''}
                    onChange={(e) => handleLimitChange(key, e.target.value)}
                    onBlur={(e) => handleLimitChange(key, e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-1 focus:ring-podbit-400 focus:border-podbit-400"
                  />
                  {limit != null && (
                    <div className="space-y-0.5">
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>${cost.toFixed(4)}</span>
                        <span className={isOver ? 'text-red-500 font-medium' : isWarn ? 'text-amber-500' : ''}>
                          {pct != null ? `${pct.toFixed(0)}%` : ''}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${isOver ? 'bg-red-500' : isWarn ? 'bg-amber-400' : 'bg-podbit-400'}`}
                          style={{ width: `${Math.min(pct || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 flex-1">
              <label className="text-xs text-gray-500 whitespace-nowrap">Warning at</label>
              <input
                type="number"
                min="50"
                max="99"
                value={Math.round((config?.warningThreshold || 0.8) * 100)}
                onChange={(e) => handleThresholdChange(e.target.value)}
                className="w-16 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              />
              <span className="text-xs text-gray-400">%</span>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 whitespace-nowrap">Force resume budget</label>
              <span className="text-xs text-gray-400">$</span>
              <input
                type="number"
                min="0.01"
                step="0.50"
                value={config?.forceResumeBudget ?? 1.00}
                onChange={(e) => {
                  const num = parseFloat(e.target.value);
                  if (!Number.isNaN(num) && num > 0) updateMutation.mutate({ forceResumeBudget: num });
                }}
                className="w-20 px-2 py-1 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800"
              />
            </div>

            {(status?.exceeded || status?.activeOverride) && (
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isLoading}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {resumeMutation.isLoading ? 'Resuming...' : status?.exceeded ? 'Force Resume' : 'Add More Budget'}
              </button>
            )}
          </div>

          {status?.activeOverride && (
            <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
              <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">Override active:</span>
              <span className="text-xs text-amber-600 dark:text-amber-500">
                +${status.activeOverride.extraBudget.toFixed(2)} on {status.activeOverride.period} limit
                (${status.activeOverride.remainingExtra.toFixed(4)} remaining)
              </span>
              <div className="flex-1 h-1.5 bg-amber-100 dark:bg-amber-900/40 rounded-full overflow-hidden ml-2">
                <div
                  className="h-full bg-amber-400 dark:bg-amber-500 rounded-full transition-all"
                  style={{ width: `${Math.max(0, (status.activeOverride.remainingExtra / status.activeOverride.extraBudget) * 100)}%` }}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Cost analytics page: usage over time, by subsystem/model, and detail table. */
export default function CostAnalytics() {
  const [granularity, setGranularity] = useState('day');
  const [days, setDays] = useState(30);
  const [subsystemFilter, setSubsystemFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [detailPage, setDetailPage] = useState(0);
  const [sortCol, setSortCol] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const PAGE_SIZE = 50;

  const filterParams = {
    days,
    ...(subsystemFilter && { subsystem: subsystemFilter }),
    ...(modelFilter && { model: modelFilter }),
  };

  // Summary data
  const { data: summary } = useQuery({
    queryKey: ['cost', 'summary', filterParams],
    queryFn: () => models.cost(filterParams),
  });

  // Time series data
  const { data: timeseries } = useQuery({
    queryKey: ['cost', 'timeseries', granularity, filterParams],
    queryFn: () => models.costTimeSeries({ ...filterParams, granularity }),
  });

  // Detail rows
  const { data: details } = useQuery({
    queryKey: ['cost', 'details', filterParams, detailPage, PAGE_SIZE],
    queryFn: () => models.costDetails({ ...filterParams, limit: PAGE_SIZE, offset: detailPage * PAGE_SIZE }),
  });

  const totals = summary?.totals || {};
  const byModel = summary?.byModel || [];
  const bySubsystem = summary?.bySubsystem || [];
  const chartData = (timeseries || []).map((d) => ({
    ...d,
    label: formatPeriodLabel(d.period, granularity),
  }));

  const detailRows = details?.rows || [];
  const detailTotal = details?.total || 0;
  const totalPages = Math.ceil(detailTotal / PAGE_SIZE);

  // Sort detail rows client-side
  const sortedRows = [...detailRows].sort((a, b) => {
    const av = a[sortCol], bv = b[sortCol];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
  });

  const toggleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const handleExport = () => {
    window.open(models.costExportUrl(filterParams), '_blank');
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <DollarSign size={24} className="text-podbit-400" />
          <h1 className="text-2xl font-bold">Cost Analytics</h1>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-podbit-600 text-white rounded-lg hover:bg-podbit-700 transition-colors text-sm"
        >
          <Download size={16} />
          Export CSV
        </button>
      </div>

      {/* Budget Limits Panel */}
      <BudgetPanel />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        {/* Granularity tabs */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize ${
                granularity === g
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        {/* Day presets */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {DAY_PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => { setDays(p.value); setDetailPage(0); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                days === p.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Subsystem filter */}
        {bySubsystem.length > 0 && (
          <select
            value={subsystemFilter}
            onChange={(e) => { setSubsystemFilter(e.target.value); setDetailPage(0); }}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="">All subsystems</option>
            {bySubsystem.map((s) => (
              <option key={s.subsystem} value={s.subsystem}>{s.subsystem}</option>
            ))}
          </select>
        )}

        {/* Model filter */}
        {byModel.length > 0 && (
          <select
            value={modelFilter}
            onChange={(e) => { setModelFilter(e.target.value); setDetailPage(0); }}
            className="text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300"
          >
            <option value="">All models</option>
            {byModel.map((m) => (
              <option key={m.model_id} value={m.model_id}>{m.model_name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <SummaryCard label="Total Calls" value={totals.calls || 0} />
        <SummaryCard label="Input Tokens" value={formatTokens(totals.input_tokens)} sub={formatCost(totals.input_cost)} />
        <SummaryCard label="Output Tokens" value={formatTokens(totals.output_tokens)} sub={formatCost(totals.output_cost)} />
        <SummaryCard label="Total Cost" value={formatCost(totals.total_cost)} highlight />
      </div>

      {/* Time series chart */}
      {chartData.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">
            Cost Over Time ({granularity})
          </h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.15)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v.toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 11,
                  backgroundColor: 'rgba(17,24,39,0.95)',
                  border: '1px solid rgba(55,65,81,0.5)',
                  borderRadius: 8,
                  color: '#e5e7eb',
                }}
                formatter={(value, name) => {
                  if (name.includes('cost') || name.includes('Cost')) return [formatCost(value), name];
                  return [formatTokens(value), name];
                }}
                labelFormatter={(label) => label}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="input_cost" name="Input Cost" fill="#3b82f6" radius={[2, 2, 0, 0]} stackId="cost" />
              <Bar dataKey="output_cost" name="Output Cost" fill="#8b5cf6" radius={[2, 2, 0, 0]} stackId="cost" />
              <Bar dataKey="tool_cost" name="Tool Cost" fill="#f59e0b" radius={[2, 2, 0, 0]} stackId="cost" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* By model & by subsystem side by side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* By Model */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
          <h2 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">By Model</h2>
          {byModel.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="pb-2 font-medium">Model</th>
                    <th className="pb-2 font-medium text-right">Calls</th>
                    <th className="pb-2 font-medium text-right">In Tokens</th>
                    <th className="pb-2 font-medium text-right">Out Tokens</th>
                    <th className="pb-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {byModel.map((m) => (
                    <tr key={m.model_id} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 text-gray-700 dark:text-gray-300 truncate max-w-[150px]" title={m.model_name}>{m.model_name}</td>
                      <td className="py-2 text-right">{m.calls}</td>
                      <td className="py-2 text-right">{formatTokens(m.input_tokens)}</td>
                      <td className="py-2 text-right">{formatTokens(m.output_tokens)}</td>
                      <td className="py-2 text-right font-medium">{formatCost(m.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* By Subsystem */}
        <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
          <h2 className="text-sm font-semibold mb-3 text-gray-700 dark:text-gray-300">By Subsystem</h2>
          {bySubsystem.length === 0 ? (
            <p className="text-xs text-gray-400">No data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                    <th className="pb-2 font-medium">Subsystem</th>
                    <th className="pb-2 font-medium text-right">Calls</th>
                    <th className="pb-2 font-medium text-right">In Tokens</th>
                    <th className="pb-2 font-medium text-right">Out Tokens</th>
                    <th className="pb-2 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {bySubsystem.map((s) => (
                    <tr key={s.subsystem} className="border-b border-gray-100 dark:border-gray-800">
                      <td className="py-2 text-gray-700 dark:text-gray-300">{s.subsystem}</td>
                      <td className="py-2 text-right">{s.calls}</td>
                      <td className="py-2 text-right">{formatTokens(s.input_tokens)}</td>
                      <td className="py-2 text-right">{formatTokens(s.output_tokens)}</td>
                      <td className="py-2 text-right font-medium">{formatCost(s.total_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail log */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Call Log ({detailTotal} total)
          </h2>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-xs">
              <button
                disabled={detailPage === 0}
                onClick={() => setDetailPage((p) => Math.max(0, p - 1))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-gray-500 dark:text-gray-400">
                {detailPage + 1} / {totalPages}
              </span>
              <button
                disabled={detailPage >= totalPages - 1}
                onClick={() => setDetailPage((p) => Math.min(totalPages - 1, p + 1))}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 text-left text-gray-500 dark:text-gray-400">
                <SortableHeader col="created_at" label="Time" current={sortCol} dir={sortDir} onSort={toggleSort} />
                <SortableHeader col="subsystem" label="Subsystem" current={sortCol} dir={sortDir} onSort={toggleSort} />
                <SortableHeader col="model_name" label="Model" current={sortCol} dir={sortDir} onSort={toggleSort} />
                <SortableHeader col="input_tokens" label="In Tokens" current={sortCol} dir={sortDir} onSort={toggleSort} right />
                <SortableHeader col="output_tokens" label="Out Tokens" current={sortCol} dir={sortDir} onSort={toggleSort} right />
                <SortableHeader col="total_cost" label="Cost" current={sortCol} dir={sortDir} onSort={toggleSort} right />
                <SortableHeader col="latency_ms" label="Latency" current={sortCol} dir={sortDir} onSort={toggleSort} right />
                <th className="pb-2 font-medium">Finish</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-400">No cost data recorded yet</td>
                </tr>
              ) : sortedRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                  <td className="py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatTimestamp(r.created_at)}</td>
                  <td className="py-2 text-gray-700 dark:text-gray-300">{r.subsystem}</td>
                  <td className="py-2 text-gray-700 dark:text-gray-300 truncate max-w-[120px]" title={r.model_name}>{r.model_name}</td>
                  <td className="py-2 text-right">{formatTokens(r.input_tokens)}</td>
                  <td className="py-2 text-right">{formatTokens(r.output_tokens)}</td>
                  <td className="py-2 text-right font-medium">{formatCost(r.total_cost)}</td>
                  <td className="py-2 text-right text-gray-500">{r.latency_ms ? `${r.latency_ms}ms` : '—'}</td>
                  <td className="py-2">
                    <FinishBadge reason={r.finish_reason} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, sub, highlight }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${highlight ? 'text-podbit-500' : ''}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function SortableHeader({ col, label, current, dir, onSort, right }) {
  const active = current === col;
  return (
    <th
      className={`pb-2 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-300 transition-colors ${right ? 'text-right' : ''}`}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <ArrowUpDown size={10} className="text-podbit-400" />}
      </span>
    </th>
  );
}

function FinishBadge({ reason }) {
  if (!reason) return <span className="text-gray-400">—</span>;
  const colors = {
    stop: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    length: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${colors[reason] || 'bg-gray-100 dark:bg-gray-800 text-gray-500'}`}>
      {reason}
    </span>
  );
}

function formatTimestamp(ts) {
  if (!ts) return '—';
  const d = new Date(ts + 'Z');
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}
