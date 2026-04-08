/**
 * SuggestionRow — displays a single parameter tuning suggestion
 * with current/proposed values, visual range bar, and accept toggle.
 */

export default function SuggestionRow({ suggestion, accepted, onToggle }) {
  const { label, key, currentValue, suggestedValue, explanation, min, max } = suggestion;
  const increased = suggestedValue > currentValue;
  const pctChange = currentValue !== 0
    ? ((suggestedValue - currentValue) / Math.abs(currentValue) * 100).toFixed(0)
    : suggestedValue > 0 ? '+100' : '0';

  const range = max - min || 1;
  const currentPct = ((currentValue - min) / range) * 100;
  const suggestedPct = ((suggestedValue - min) / range) * 100;

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        accepted
          ? 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20'
          : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 opacity-60'
      }`}
    >
      {/* Header: checkbox + label + value change */}
      <div className="flex items-center justify-between mb-1.5">
        <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            checked={accepted}
            onChange={onToggle}
            className="w-4 h-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
          />
          {label}
        </label>
        <span
          className={`text-xs font-mono ${
            increased ? 'text-green-600' : 'text-orange-600'
          }`}
        >
          {currentValue} &rarr; {suggestedValue}
          <span className="ml-1 text-xs opacity-75">
            ({pctChange > 0 ? '+' : ''}{pctChange}%)
          </span>
        </span>
      </div>

      {/* Mini range visualization */}
      <div className="relative h-2 bg-gray-200 dark:bg-gray-700 rounded-full mb-2">
        {/* Current value marker (gray) */}
        <div
          className="absolute top-0 h-2 w-1 bg-gray-400 rounded-full"
          style={{ left: `calc(${Math.min(100, Math.max(0, currentPct))}% - 2px)` }}
          title={`Current: ${currentValue}`}
        />
        {/* Suggested value marker (blue) */}
        <div
          className="absolute top-0 h-2 w-1.5 bg-blue-500 rounded-full"
          style={{ left: `calc(${Math.min(100, Math.max(0, suggestedPct))}% - 3px)` }}
          title={`Suggested: ${suggestedValue}`}
        />
        {/* Range highlight between current and suggested */}
        {currentPct !== suggestedPct && (
          <div
            className={`absolute top-0 h-2 rounded-full opacity-30 ${
              increased ? 'bg-green-400' : 'bg-orange-400'
            }`}
            style={{
              left: `${Math.min(currentPct, suggestedPct)}%`,
              width: `${Math.abs(suggestedPct - currentPct)}%`,
            }}
          />
        )}
      </div>

      {/* Explanation */}
      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{explanation}</p>
    </div>
  );
}
