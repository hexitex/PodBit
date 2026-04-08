

/** Help section: common issues and resolutions (synthesis, lab verification, models, proxy). */
export default function Part4Troubleshooting() {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Troubleshooting</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Common issues and how to resolve them.
        </p>
      </div>

      {/* Synthesis Not Producing Results */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Synthesis Not Producing Results</h3>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check that <strong>embedding</strong> and <strong>synthesis</strong> subsystems are assigned on the Models page</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Verify models are online (Models page health indicators)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Ensure you have at least <strong>10&ndash;20 seeds</strong> in a domain before expecting synthesis output</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check the activity feed for rejection reasons &mdash; quality gates may be filtering output</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Try lowering the <strong>resonance threshold</strong> in Config to widen the pairing band</span>
          </li>
        </ul>
      </div>

      {/* No Embeddings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">No Embeddings</h3>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>An embedding model must be assigned to the <strong>embedding</strong> subsystem</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Local models are recommended (fast, free, no API key needed)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check that the embedding model endpoint is reachable</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>View embedding status on the Models page</span>
          </li>
        </ul>
      </div>

      {/* Chat Not Using Knowledge */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Chat Not Using Knowledge</h3>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Verify nodes exist in the graph (Dashboard stat cards)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check domain scoping &mdash; you may be filtering too narrowly</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Ensure the <strong>chat</strong> or <strong>context</strong> subsystem has a model assigned</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check the Context Panel sidebar for injected nodes</span>
          </li>
        </ul>
      </div>

      {/* Knowledge Proxy Not Working */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Knowledge Proxy Not Working</h3>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Default port: <strong>11435</strong> (configurable in .env)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check the proxy is running (Dashboard service panel)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Verify client base_url: <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">http://localhost:11435/v1</code></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>API key is not needed (any string works as placeholder)</span>
          </li>
        </ul>
      </div>

      {/* KB Ingestion Failing */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">KB Ingestion Failing</h3>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check file permissions on the watched folder</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Verify reader plugins are available (<code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">podbit.kb readers</code>)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Image reader requires a vision model assigned to <strong>reader_image</strong></span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>PDF/Doc/Sheet readers need optional npm dependencies installed</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check the activity feed for specific error messages</span>
          </li>
        </ul>
      </div>

      {/* High API Costs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">High API Costs</h3>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Use the Costs page to identify expensive subsystems</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Assign local models to high-volume subsystems (autorating, keyword, domain classification)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Use the budgeting system to cap spend</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Consider Consultant pipeline mode (fewer LLM calls per synthesis)</span>
          </li>
        </ul>
      </div>

      {/* Slow Performance */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Slow Performance</h3>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Embeddings run in-memory &mdash; efficient up to ~10K nodes</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Use domain scoping to limit context engine search space</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Reduce autonomous cycle frequency in Config</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Check if file watchers are processing too many files</span>
          </li>
        </ul>
      </div>

      {/* Configuration Not Taking Effect */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Configuration Not Taking Effect</h3>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Config changes are live (no restart needed for most settings)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Exception: model registry changes may need subsystem reassignment</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Clear tsx cache if running in development: <code className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">rm -rf /tmp/tsx-*/</code></span>
          </li>
        </ul>
      </div>

      {/* Common Error Messages */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Common Error Messages</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-4 text-gray-500 dark:text-gray-400 font-medium">Error</th>
                <th className="text-left py-2 text-gray-500 dark:text-gray-400 font-medium">Solution</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-300">
              <tr className="border-b border-gray-100 dark:border-gray-700/50">
                <td className="py-2 pr-4 font-mono text-xs">"No model assigned for subsystem X"</td>
                <td className="py-2">Go to Models page, assign a model to the listed subsystem</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700/50">
                <td className="py-2 pr-4 font-mono text-xs">"Embedding dimension mismatch"</td>
                <td className="py-2">All nodes must use the same embedding dimension; re-embed if the model was changed</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">"Domain concentration throttled"</td>
                <td className="py-2">Normal during high-volume KB ingestion &mdash; KB contributors are exempt from throttling</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Cross-section links */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Related Sections</h4>
        <div className="flex flex-wrap gap-2">
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="first-steps">First Steps</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="configuration">Configuration</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="chat-questions">Chat & Questions</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="adding-knowledge">Adding Knowledge</button>
        </div>
      </div>
    </div>
  );
}
