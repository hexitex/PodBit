import { Link } from 'react-router-dom';

function ContextEngineDiagram() {
  return (
    <svg viewBox="0 0 800 390" className="w-full mx-auto" role="img" aria-label="Context engine flow">
      <defs>
        <marker id="arrow3" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
        <marker id="arrow3p" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
        </marker>
      </defs>

      {/* Agent / Client */}
      <rect x="15" y="20" width="130" height="55" rx="8" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="80" y="42" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Agent / Client</text>
      <text x="80" y="58" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">User message</text>

      <path d="M 145 47 L 185 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow3)" />

      {/* Prepare */}
      <rect x="190" y="5" width="170" height="88" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="275" y="24" textAnchor="middle" className="text-xs font-semibold fill-emerald-700 dark:fill-emerald-400">prepare()</text>
      <text x="275" y="40" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Detect intent</text>
      <text x="275" y="55" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Extract + cluster topics</text>
      <text x="275" y="70" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Select knowledge</text>
      <text x="275" y="85" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Model-aware formatting</text>

      <path d="M 360 47 L 405 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow3)" />

      {/* Context Package */}
      <rect x="410" y="5" width="170" height="88" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="495" y="24" textAnchor="middle" className="text-xs font-semibold fill-sky-700 dark:fill-sky-400">Context Package</text>
      <text x="495" y="42" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Knowledge nodes</text>
      <text x="495" y="57" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">System prompt</text>
      <text x="495" y="72" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">History + intent</text>
      <text x="495" y="87" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Dynamic budget</text>

      <path d="M 580 47 L 625 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow3)" />

      {/* LLM */}
      <rect x="630" y="15" width="110" height="65" rx="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="685" y="42" textAnchor="middle" className="text-xs font-semibold fill-amber-700 dark:fill-amber-400">LLM</text>
      <text x="685" y="58" textAnchor="middle" className="text-xs fill-amber-500 dark:fill-amber-500">Generate</text>

      {/* LLM -> response down */}
      <path d="M 685 80 L 685 115" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" />
      <text x="710" y="102" className="text-xs fill-gray-400 dark:fill-gray-500">response</text>

      {/* Response -> Client (curved return) */}
      <path d="M 685 120 C 685 150, 100 150, 80 80" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arrow3)" />
      <text x="390" y="160" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400 font-medium">Response to Client</text>

      {/* LLM -> update() */}
      <path d="M 630 120 L 585 120" fill="none" stroke="#8b5cf6" strokeWidth="1.5" markerEnd="url(#arrow3p)" />

      {/* update() */}
      <rect x="410" y="105" width="170" height="70" rx="8" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeWidth="1.5" />
      <text x="495" y="124" textAnchor="middle" className="text-xs font-semibold fill-purple-700 dark:fill-purple-400">update()</text>
      <text x="495" y="140" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Feedback loop</text>
      <text x="495" y="155" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Quality metrics</text>
      <text x="495" y="170" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Weight boost used nodes</text>

      {/* Dynamic budget visualization */}
      <rect x="40" y="200" width="720" height="82" rx="8" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
      <text x="400" y="218" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Dynamic Budget Allocation (adapts with conversation depth)</text>

      {/* New conversation budgets */}
      <text x="58" y="237" className="text-xs fill-gray-500 dark:fill-gray-400 font-medium">New:</text>
      <rect x="90" y="229" width="300" height="13" rx="3" fill="#10b981" opacity="0.3" />
      <text x="240" y="239" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-medium">Knowledge 55%</text>
      <rect x="396" y="229" width="30" height="13" rx="3" fill="#0ea5e9" opacity="0.3" />
      <text x="411" y="239" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400">5%</text>
      <rect x="432" y="229" width="85" height="13" rx="3" fill="#f59e0b" opacity="0.3" />
      <text x="474" y="239" textAnchor="middle" className="text-xs fill-amber-700 dark:fill-amber-400 font-medium">Sys 15%</text>
      <rect x="523" y="229" width="140" height="13" rx="3" fill="#8b5cf6" opacity="0.3" />
      <text x="593" y="239" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-medium">Response 25%</text>

      {/* Deep conversation budgets */}
      <text x="55" y="264" className="text-xs fill-gray-500 dark:fill-gray-400 font-medium">Deep:</text>
      <rect x="90" y="256" width="140" height="13" rx="3" fill="#10b981" opacity="0.3" />
      <text x="160" y="266" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-medium">Know 25%</text>
      <rect x="236" y="256" width="250" height="13" rx="3" fill="#0ea5e9" opacity="0.3" />
      <text x="361" y="266" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-medium">History 45%</text>
      <rect x="492" y="256" width="55" height="13" rx="3" fill="#f59e0b" opacity="0.3" />
      <text x="519" y="266" textAnchor="middle" className="text-xs fill-amber-700 dark:fill-amber-400">10%</text>
      <rect x="553" y="256" width="110" height="13" rx="3" fill="#8b5cf6" opacity="0.3" />
      <text x="608" y="266" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-medium">Resp 20%</text>

      {/* Scoring signals */}
      <rect x="40" y="298" width="720" height="82" rx="8" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
      <text x="400" y="316" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Knowledge Selection Signals (4 base + 1 bonus)</text>
      <rect x="60" y="326" width="130" height="30" rx="4" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1" />
      <text x="125" y="340" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-medium">Embedding</text>
      <text x="125" y="352" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">40%</text>

      <rect x="200" y="326" width="130" height="30" rx="4" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1" />
      <text x="265" y="340" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-medium">Topic Match</text>
      <text x="265" y="352" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">30%</text>

      <rect x="340" y="326" width="130" height="30" rx="4" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1" />
      <text x="405" y="340" textAnchor="middle" className="text-xs fill-amber-700 dark:fill-amber-400 font-medium">Node Weight</text>
      <text x="405" y="352" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">20%</text>

      <rect x="480" y="326" width="110" height="30" rx="4" fill="#ef4444" opacity="0.15" stroke="#ef4444" strokeWidth="1" />
      <text x="535" y="340" textAnchor="middle" className="text-xs fill-red-700 dark:fill-red-400 font-medium">Recency</text>
      <text x="535" y="352" textAnchor="middle" className="text-xs fill-red-600 dark:fill-red-400">10%</text>

      <rect x="600" y="326" width="130" height="30" rx="4" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4 2" />
      <text x="665" y="340" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-medium">Cluster</text>
      <text x="665" y="352" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">+15% bonus</text>

      <text x="400" y="378" textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">Base signals sum to 100%. Cluster match adds +15% bonus when topic clustering is enabled.</text>
    </svg>
  );
}

function CrossSessionDiagram() {
  return (
    <svg viewBox="0 0 760 160" className="w-full mx-auto" role="img" aria-label="Cross-session learning flow">
      <defs>
        <marker id="arrow5" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Session A */}
      <rect x="20" y="20" width="140" height="50" rx="6" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="90" y="42" textAnchor="middle" className="text-xs font-semibold fill-sky-700 dark:fill-sky-400">Session A</text>
      <text x="90" y="57" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Topics + feedback</text>

      <line x1="160" y1="45" x2="205" y2="45" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow5)" />

      {/* Persist */}
      <rect x="210" y="15" width="130" height="60" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="275" y="35" textAnchor="middle" className="text-xs font-semibold fill-emerald-700 dark:fill-emerald-400">Persist</text>
      <text x="275" y="50" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Insights</text>
      <text x="275" y="63" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Node Usage</text>

      <line x1="340" y1="45" x2="385" y2="45" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow5)" />

      {/* Database */}
      <rect x="390" y="20" width="130" height="50" rx="6" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="455" y="42" textAnchor="middle" className="text-xs font-semibold fill-amber-700 dark:fill-amber-400">SQLite</text>
      <text x="455" y="57" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">session_insights</text>

      <line x1="520" y1="45" x2="565" y2="45" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow5)" />

      {/* Session B */}
      <rect x="570" y="20" width="140" height="50" rx="6" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeWidth="1.5" />
      <text x="640" y="42" textAnchor="middle" className="text-xs font-semibold fill-purple-700 dark:fill-purple-400">Session B</text>
      <text x="640" y="57" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Warm-started!</text>

      {/* Bottom annotation */}
      <rect x="170" y="95" width="420" height="45" rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
      <text x="380" y="113" textAnchor="middle" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">On session TTL expiry: topics, clusters, node usage</text>
      <text x="380" y="128" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">persist to DB. New sessions load matching insights.</text>

      <line x1="275" y1="75" x2="275" y2="95" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
      <line x1="455" y1="70" x2="455" y2="95" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
    </svg>
  );
}

/** Help section: context engine, session learning, and token budgets. */
function ContextSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Context Engine</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The context engine provides <strong>consent-based, opt-in context preparation</strong> for LLM conversations.
          Agents explicitly call prepare() before each LLM call to get relevant knowledge and structured context.
          It adapts to conversation depth, detects intent, clusters topics, and learns from LLM responses.
        </p>
      </div>

      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Agent & Proxy Intelligence Layer</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400">
          The context engine is the intelligence layer that powers both the{' '}
          <Link to="/help/proxy" className="font-semibold underline decoration-orange-300 hover:text-orange-800 dark:hover:text-orange-200">Knowledge Proxy</Link> (automatic enrichment for any OpenAI-compatible client) and the{' '}
          <strong>GUI Chat</strong> (interactive conversations with knowledge grounding). When the proxy receives a request, it
          calls <code className="bg-orange-100 dark:bg-orange-900/30 px-1 rounded">prepare()</code> to select and inject relevant knowledge into the system
          message, then calls <code className="bg-orange-100 dark:bg-orange-900/30 px-1 rounded">update()</code> with the LLM's response to track which
          knowledge was actually used. This feedback loop improves node selection over time. See{' '}
          <Link to="/help/proxy" className="font-semibold underline decoration-orange-300 hover:text-orange-800 dark:hover:text-orange-200">Knowledge Proxy</Link> for setup instructions.
        </p>
      </div>

      <ContextEngineDiagram />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Prepare Flow</h3>
          <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
            <li><strong>Detect intent</strong>  - classify query as retrieval, action, diagnosis, or exploration</li>
            <li>Extract topics from user message + session history</li>
            <li><strong>Cluster topics</strong>  - group by embedding similarity into concept clusters</li>
            <li>Match domains from extracted topics</li>
            <li>Score nodes using 5 signals: embedding, topic match, weight, <strong>cluster centroids</strong>, recency</li>
            <li>Adjust weights by intent (e.g., retrieval boosts embedding, diagnosis boosts recency)</li>
            <li><strong>Apply model profile</strong>  - adapt budget and node limits for model size</li>
            <li>Build system prompt (compressed format for small models)</li>
            <li>Use <strong>dynamic budget</strong>  - more knowledge early, more history later</li>
            <li>Return context package with intent and metrics</li>
          </ol>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Update Flow</h3>
          <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
            <li>Track LLM response in session history</li>
            <li>Extract topics from response</li>
            <li><strong>Feedback loop</strong>  - compare response embedding to delivered nodes</li>
            <li>Boost weight of nodes the LLM actually used (similarity &ge; 0.65)</li>
            <li><strong>Quality metrics</strong>  - compute utilization, grounding, coverage, efficiency</li>
            <li>Store per-turn composite quality score</li>
          </ol>
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-3">
            The feedback loop creates natural selection: useful knowledge gets boosted,
            unused knowledge slowly decays. Over time, the graph converges on what LLMs actually find helpful.
          </p>
        </div>
      </div>

      {/* Intent Detection */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Intent Detection</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Zero-cost keyword classifier that detects query intent and adjusts knowledge selection strategy.
          No LLM call required  - pure regex pattern matching.
        </p>
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-2">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Retrieval</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">"what is", "explain", "?"</p>
            <p className="text-xs text-blue-500 dark:text-blue-400">Boosts embedding similarity</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded p-2">
            <p className="text-xs font-semibold text-green-700 dark:text-green-300">Action</p>
            <p className="text-xs text-green-600 dark:text-green-400 mb-1">"create", "build", "fix"</p>
            <p className="text-xs text-green-500 dark:text-green-400">Boosts topic + weight</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-2">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300">Diagnosis</p>
            <p className="text-xs text-red-600 dark:text-red-400 mb-1">"why", "bug", "error"</p>
            <p className="text-xs text-red-500 dark:text-red-400">Boosts recency</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-2">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Exploration</p>
            <p className="text-xs text-purple-600 dark:text-purple-400 mb-1">"what if", "pattern"</p>
            <p className="text-xs text-purple-500 dark:text-purple-400">Boosts embedding + recency</p>
          </div>
        </div>
      </div>

      {/* Model Awareness */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Model-Aware Context</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          The context engine adapts its output format and budget based on the target LLM's context window.
          Pass <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">modelProfile</code> to prepare() for optimal formatting.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b">
                <th className="pb-1 pr-3">Profile</th>
                <th className="pb-1 pr-3">Budget</th>
                <th className="pb-1 pr-3">Max Nodes</th>
                <th className="pb-1 pr-3">Format</th>
                <th className="pb-1">History</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-400">
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3 font-medium">micro (2-4K)</td>
                <td className="py-1.5 pr-3">0.12x</td>
                <td className="py-1.5 pr-3">3</td>
                <td className="py-1.5 pr-3">Dense paragraph</td>
                <td className="py-1.5">2 turns</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3 font-medium">small (&lt;8K)</td>
                <td className="py-1.5 pr-3">0.25x</td>
                <td className="py-1.5 pr-3">5</td>
                <td className="py-1.5 pr-3">Dense paragraph</td>
                <td className="py-1.5">4 turns</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3 font-medium">medium (8-32K)</td>
                <td className="py-1.5 pr-3">1.0x</td>
                <td className="py-1.5 pr-3">15</td>
                <td className="py-1.5 pr-3">Structured sections</td>
                <td className="py-1.5">20 turns</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3 font-medium">large (32-128K)</td>
                <td className="py-1.5 pr-3">4.0x</td>
                <td className="py-1.5 pr-3">30</td>
                <td className="py-1.5 pr-3">Structured sections</td>
                <td className="py-1.5">50 turns</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 font-medium">xl (128K+)</td>
                <td className="py-1.5 pr-3">8.0x</td>
                <td className="py-1.5 pr-3">50</td>
                <td className="py-1.5 pr-3">Structured sections</td>
                <td className="py-1.5">100 turns</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Quality Metrics */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Quality Metrics</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Every update() call computes per-turn quality metrics. Use the <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">metrics</code> action
          to see how well the context engine is performing across a session.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Knowledge Utilization</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">What fraction of delivered nodes did the LLM actually use?</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">Response Grounding</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">How similar is the response to the used knowledge nodes?</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-2">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Topic Coverage</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">What fraction of session topics appear in the response?</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Budget Efficiency</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Ratio of used tokens vs total available budget.</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Composite score = utilization(35%) + grounding(30%) + coverage(20%) + efficiency(15%)
        </p>
      </div>

      {/* Sessions */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Sessions</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            In-memory sessions track the ongoing conversation state:
          </p>
          <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <li>Accumulated topics and concept clusters</li>
            <li>Conversation turn history</li>
            <li>Delivered node tracking (for feedback loop)</li>
            <li>Per-turn quality metrics</li>
            <li>Compression state (which turns are compressed)</li>
            <li>Session TTL (default 1 hour)</li>
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Knowledge Caching</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            The <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">compress</code> and <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">summarize</code> tools cache
            their results. Cache is automatically invalidated when nodes change in the same domain.
          </p>
          <div className="flex gap-3 mt-2">
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded p-2 flex-1">
              <p className="text-xs font-semibold text-green-700 dark:text-green-300">Cached (instant)</p>
              <p className="text-xs text-green-600 dark:text-green-400">Without task param</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2 flex-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Fresh (1 LLM call)</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">With task param</p>
            </div>
          </div>
        </div>
      </div>

      {/* Cross-Session Learning */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Cross-Session Learning</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Sessions are normally in-memory and lost when they expire. Cross-session learning persists the most
          valuable insights to the database, so new sessions can warm-start from past conversation patterns.
        </p>
        <CrossSessionDiagram />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">What Gets Persisted</p>
            <ul className="text-xs text-emerald-600 dark:text-emerald-400 space-y-0.5 mt-1">
              <li>Top 30 topics with weights</li>
              <li>Concept cluster terms</li>
              <li>Node usage (which nodes were helpful)</li>
              <li>Domain associations</li>
            </ul>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">How It Bootstraps</p>
            <ul className="text-xs text-sky-600 dark:text-sky-400 space-y-0.5 mt-1">
              <li>First turn loads matching insights</li>
              <li>Topics merged at 30% weight (dampened)</li>
              <li>Frequently-used nodes prioritized</li>
              <li>EMA weight merging across sessions</li>
            </ul>
          </div>
        </div>
        <div className="mt-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Configurable Parameters (<Link to="/help/config" className="underline decoration-amber-300 hover:text-amber-800 dark:hover:text-amber-200">Config Page</Link>)</p>
          <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-0.5 mt-1">
            <li><strong>Topic Weight Threshold</strong>  - min weight to persist (default 0.5)</li>
            <li><strong>EMA Retain/Incoming</strong>  - blend ratio for weight merging (0.7/0.3)</li>
            <li><strong>Dampening/Boost</strong>  - warm-start weight multipliers for new/existing topics</li>
            <li><strong>Max Insights/Node Usage</strong>  - how many items to load on warm-start</li>
            <li><strong>Node Usage Min</strong>  - minimum uses before a node qualifies for warm-start</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default ContextSection;
