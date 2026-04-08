/** Help section: cost tracking and budget limits. */
function CostsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Cost Analytics</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Costs page provides detailed tracking of all LLM API spend across Podbit's subsystems.
          Every call made by the synthesis engine, context engine, chat, proxy, config tuning, and KB readers
          is recorded with token counts, latency, and estimated cost.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Summary Cards</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
          Four cards at the top show headline metrics for the selected time window:
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Total Calls</p>
            <p className="text-sky-500 dark:text-sky-400">Number of LLM API calls made</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Input Tokens</p>
            <p className="text-sky-500 dark:text-sky-400">Total input tokens with estimated cost</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Output Tokens</p>
            <p className="text-sky-500 dark:text-sky-400">Total output tokens with estimated cost</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Total Cost</p>
            <p className="text-sky-500 dark:text-sky-400">Combined input + output + tool cost</p>
          </div>
        </div>
      </div>

      {/* Time Controls */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Time Controls & Filters</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
          Two sets of controls let you adjust the view:
        </p>
        <ul className="text-xs text-purple-600 dark:text-purple-400 list-disc list-inside space-y-1">
          <li><strong>Granularity</strong>  - Hour, Day, Month, or Year. Controls the resolution of the time-series chart.</li>
          <li><strong>Time window presets</strong>  - 24h, 7d, 30d, 90d, 1y, or All. Filters all data to the selected range.</li>
          <li><strong>Subsystem filter</strong>  - Show only calls from a specific subsystem (voiceSynthesis, chatResponse, embedding, etc.)</li>
          <li><strong>Model filter</strong>  - Show only calls to a specific registered model</li>
        </ul>
      </div>

      {/* Chart */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Cost Over Time Chart</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          A stacked bar chart showing cost broken down by <strong>input cost</strong> (blue),
          <strong> output cost</strong> (purple), and <strong>tool cost</strong> (amber) per time period.
          Hover over bars for detailed tooltips. The chart updates automatically when you change
          granularity or time window.
        </p>
      </div>

      {/* Breakdown Tables */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Breakdown Tables</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
          Two side-by-side tables provide cost attribution:
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-emerald-100 dark:border-emerald-700">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">By Model</p>
            <p className="text-emerald-500 dark:text-emerald-400">Calls, input/output tokens, and total cost per registered model</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-emerald-100 dark:border-emerald-700">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">By Subsystem</p>
            <p className="text-emerald-500 dark:text-emerald-400">Calls, input/output tokens, and total cost per subsystem</p>
          </div>
        </div>
      </div>

      {/* Call Log */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Call Log</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
          A detailed, paginated table of every individual LLM call. Each row shows:
        </p>
        <ul className="text-xs text-orange-600 dark:text-orange-400 list-disc list-inside space-y-1">
          <li><strong>Time</strong>  - when the call was made</li>
          <li><strong>Subsystem</strong>  - which part of Podbit made the call</li>
          <li><strong>Model</strong>  - which registered model was used</li>
          <li><strong>Input/Output Tokens</strong>  - token counts</li>
          <li><strong>Cost</strong>  - estimated cost based on model pricing</li>
          <li><strong>Latency</strong>  - response time in milliseconds</li>
          <li><strong>Finish Reason</strong>  - <span className="text-green-600 font-medium">stop</span> (completed) or <span className="text-amber-600 font-medium">length</span> (truncated)</li>
        </ul>
        <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
          Click column headers to sort. Use pagination controls for large datasets.
        </p>
      </div>

      {/* Export */}
      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">CSV Export</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Click the <strong>Export CSV</strong> button to download all cost data matching your current filters
          as a CSV file. Useful for reporting, spreadsheet analysis, or importing into other tools.
        </p>
      </div>
    </div>
  );
}

export default CostsSection;
