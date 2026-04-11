import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, DollarSign, X, Ban } from 'lucide-react';
import { budget } from '../lib/api';
import { utcDate } from '../lib/datetime';

/** Banner showing budget status and option to resume when exceeded. */
export default function BudgetBanner() {
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [resuming, setResuming] = useState(false);
  const location = useLocation();

  const refresh = useCallback(async () => {
    try {
      const s = await budget.status();
      setStatus(s);
      // Reset dismissed if state changed to exceeded
      if (s.exceeded) setDismissed(false);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3 * 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const handleResume = async () => {
    setResuming(true);
    try {
      await budget.resume();
      await refresh();
    } catch { /* ignore */ }
    setResuming(false);
  };

  // Hide on help pages
  if (location.pathname.startsWith('/help')) return null;

  if (!status || !status.config.enabled) return null;

  // Dismissed only hides warnings, never exceeded
  if (dismissed && !status.exceeded) return null;

  if (status.exceeded) {
    return (
      <div className="bg-red-600 dark:bg-red-900 text-white px-5 py-3 flex items-center gap-4 shadow-lg border-b-2 border-red-800 dark:border-red-700">
        <div className="flex items-center gap-2 flex-shrink-0 animate-pulse">
          <Ban size={22} className="text-white" />
          <DollarSign size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-base text-white">Budget Exceeded — LLM Calls Paused</p>
          <p className="text-sm text-red-100 dark:text-red-200 mt-0.5">
            Period: {status.exceededPeriod}
            {status.config.pausedAt && (
              <span className="ml-2">
                — paused since {utcDate(status.config.pausedAt)?.toLocaleTimeString() || '--'}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={handleResume}
          disabled={resuming}
          className="px-4 py-2 bg-white dark:bg-gray-100 text-red-700 dark:text-red-800 hover:bg-red-50 dark:hover:bg-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex-shrink-0"
        >
          {resuming ? 'Resuming...' : 'Force Resume'}
        </button>
      </div>
    );
  }

  if (status.warning && status.warningPeriods.length > 0) {
    return (
      <div className="bg-amber-500 dark:bg-amber-800 text-white px-5 py-3 flex items-center gap-4 shadow-md border-b border-amber-600 dark:border-amber-700">
        <AlertTriangle size={20} className="flex-shrink-0 text-white" />
        <div className="flex-1">
          <p className="font-bold text-sm text-white">Approaching Budget Limit</p>
          <p className="text-xs text-amber-100 dark:text-amber-200 mt-0.5">
            {status.warningPeriods.map(p => {
              const util = status.utilization[p];
              return `${p}: ${util ? (util * 100).toFixed(0) : '?'}%`;
            }).join(' · ')}
          </p>
        </div>
        <button onClick={() => setDismissed(true)} className="p-1.5 hover:bg-white/20 dark:hover:bg-white/10 rounded-lg transition-colors text-white">
          <X size={16} />
        </button>
      </div>
    );
  }

  return null;
}
