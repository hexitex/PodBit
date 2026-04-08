

function OverviewDiagram() {
  return (
    <svg viewBox="0 0 880 370" className="w-full mx-auto" role="img" aria-label="Podbit system overview">
      <rect x="0" y="0" width="880" height="370" rx="12" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
        <marker id="arrowSky" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" opacity="0.6" />
        </marker>
      </defs>
      <rect x="30" y="40" width="180" height="95" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="120" y="68" textAnchor="middle" className="fill-sky-700 text-sm font-semibold">Knowledge</text>
      <text x="120" y="84" textAnchor="middle" className="fill-sky-700 text-sm font-semibold">Graph</text>
      <text x="120" y="108" textAnchor="middle" className="fill-sky-600 text-xs">Nodes, edges,</text>
      <text x="120" y="121" textAnchor="middle" className="fill-sky-600 text-xs">embeddings, domains</text>
      <rect x="235" y="40" width="180" height="95" rx="8" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1.5" />
      <text x="325" y="68" textAnchor="middle" className="fill-purple-700 text-sm font-semibold">Synthesis</text>
      <text x="325" y="84" textAnchor="middle" className="fill-purple-700 text-sm font-semibold">Engine</text>
      <text x="325" y="108" textAnchor="middle" className="fill-purple-600 text-xs">Autonomous discovery,</text>
      <text x="325" y="121" textAnchor="middle" className="fill-purple-600 text-xs">synthesis, tensions</text>
      <rect x="440" y="40" width="180" height="95" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="530" y="68" textAnchor="middle" className="fill-emerald-700 text-sm font-semibold">Context</text>
      <text x="530" y="84" textAnchor="middle" className="fill-emerald-700 text-sm font-semibold">Engine</text>
      <text x="530" y="108" textAnchor="middle" className="fill-emerald-600 text-xs">Dynamic context for</text>
      <text x="530" y="121" textAnchor="middle" className="fill-emerald-600 text-xs">LLM conversations</text>
      <rect x="645" y="40" width="180" height="95" rx="8" fill="#f97316" opacity="0.15" stroke="#f97316" strokeWidth="1.5" />
      <text x="735" y="68" textAnchor="middle" className="fill-orange-700 text-sm font-semibold">Knowledge</text>
      <text x="735" y="84" textAnchor="middle" className="fill-orange-700 text-sm font-semibold">Base</text>
      <text x="735" y="108" textAnchor="middle" className="fill-orange-600 text-xs">Folder &amp; API ingestion,</text>
      <text x="735" y="121" textAnchor="middle" className="fill-orange-600 text-xs">readers, watchers</text>
      <path d="M 210 87 C 218 87, 227 87, 235 87" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <path d="M 415 87 C 423 87, 432 87, 440 87" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <path d="M 735 135 C 735 165, 120 165, 120 135" fill="none" stroke="#0ea5e9" strokeWidth="1" strokeDasharray="5 3" opacity="0.5" markerEnd="url(#arrowSky)" />
      <text x="430" y="172" textAnchor="middle" className="fill-sky-500 text-xs">ingests into graph</text>
      <rect x="30" y="195" width="795" height="50" rx="8" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="427" y="225" textAnchor="middle" className="fill-amber-700 text-sm font-semibold">GUI + REST API + Knowledge Proxy</text>
      <path d="M 120 135 C 120 155, 120 170, 120 195" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
      <path d="M 325 135 C 325 155, 325 170, 325 195" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
      <path d="M 530 135 C 530 155, 530 170, 530 195" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
      <path d="M 735 135 C 735 155, 735 170, 735 195" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
      <rect x="50" y="280" width="160" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="130" y="304" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">GUI Dashboard</text>
      <rect x="240" y="280" width="160" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="320" y="304" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">Chat Interface</text>
      <rect x="430" y="280" width="160" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="510" y="304" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">Knowledge Proxy</text>
      <rect x="620" y="280" width="160" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="700" y="304" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">IDE Agents (MCP)</text>
      <path d="M 130 245 C 130 255, 130 265, 130 280" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow)" />
      <path d="M 320 245 C 320 255, 320 265, 320 280" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow)" />
      <path d="M 510 245 C 510 255, 510 265, 510 280" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow)" />
      <path d="M 700 245 C 700 255, 700 265, 700 280" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow)" />
      <text x="427" y="350" textAnchor="middle" className="fill-gray-400 text-xs">Use the GUI directly, or connect any tool via the REST API and knowledge proxy</text>
    </svg>
  );
}

/** Help section: What is Podbit — overview diagram and high-level intro. */
function Part1WhatIsPodbit() {
  return (
    <div className="space-y-6">

      {/* Opening */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">What is Podbit?</h2>
        <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed">
          Feed Podbit your research — papers, notes, code, raw ideas — and it discovers connections you
          didn't know existed. It pairs your knowledge, synthesizes new insights autonomously, verifies
          claims via external lab servers, and surfaces contradictions where breakthroughs hide. Everything
          lives in a persistent knowledge graph that grows smarter with every cycle.
        </p>
      </div>

      {/* System Overview Diagram */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">System Overview</h3>
        <OverviewDiagram />
      </div>

      {/* What You Get */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">What You Get</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

          <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Discover Hidden Connections</h4>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              The synthesis engine pairs your ideas and finds non-obvious links across domains — connections you would never search for manually.
            </p>
          </div>

          <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Verify Claims Computationally</h4>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Lab servers run experiments to test whether synthesized claims hold up — Podbit submits specs, labs return data.
            </p>
          </div>

          <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Find Contradictions</h4>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Tensions surface opposing claims in your knowledge — the boundary zones where unknown knowledge hides.
            </p>
          </div>

          <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Enrich Any LLM</h4>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              The knowledge proxy injects graph context into any OpenAI-compatible client — your LLM gets domain expertise automatically.
            </p>
          </div>

          <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Ingest Anything</h4>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Six reader plugins handle papers (PDF), documents, code, images, spreadsheets, and plain text — all ingested into the graph.
            </p>
          </div>

          <div className="rounded-lg border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-5 h-5 text-sky-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <h4 className="text-sm font-semibold text-sky-800 dark:text-sky-300">Separate Research Tracks</h4>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Projects maintain independent knowledge graphs. Switch between research tracks without cross-contamination.
            </p>
          </div>

        </div>
      </div>

      {/* Research Workflow */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Typical Research Workflow</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center">1</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Seed Your Research</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Add ideas, hypotheses, and raw notes as seed nodes in the graph.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center">2</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Ingest Source Material</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Point folders of papers, docs, or code at the Knowledge Base for automatic ingestion.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center">3</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Run Autonomous Cycles</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The synthesis engine pairs nodes and generates new insights while you focus on other work.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center">4</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Explore Discoveries</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Browse synthesized nodes, follow lineage trees, and explore domain connections in the dashboard.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center">5</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Verify Claims</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Lab servers run experiments to test synthesized claims — Podbit extracts specs, labs return data.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center">6</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Find Contradictions</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Tensions analysis reveals opposing claims — the most productive territory for new research.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center">7</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Generate Research Briefs</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Compress graph knowledge into structured briefs for writing, presentations, or further analysis.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3">
            <span className="flex-shrink-0 w-7 h-7 rounded-full bg-sky-500 text-white text-sm font-bold flex items-center justify-center">8</span>
            <div>
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Separate Research Tracks</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Create projects for independent knowledge graphs — switch freely without cross-contamination.</p>
            </div>
          </div>

        </div>
      </div>

      {/* Navigation Cards */}
      <div>
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">Where to Go Next</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">

          <button
            className="docs-link-internal text-left rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-800 p-4 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer"
            data-doc="first-steps"
          >
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">Your First Steps</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">A guided walkthrough to get your first knowledge graph running.</p>
          </button>

          <button
            className="docs-link-internal text-left rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-800 p-4 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer"
            data-doc="key-concepts"
          >
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">Key Concepts</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Understand nodes, domains, partitions, synthesis, and the core mental model.</p>
          </button>

          <button
            className="docs-link-internal text-left rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-800 p-4 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer"
            data-doc="adding-knowledge"
          >
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">Adding Knowledge</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">How to seed ideas, ingest files, and populate your graph.</p>
          </button>

          <button
            className="docs-link-internal text-left rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-800 p-4 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer"
            data-doc="growing-graph"
          >
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">Growing Your Graph</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Run synthesis cycles, review output, and let the graph evolve.</p>
          </button>

          <button
            className="docs-link-internal text-left rounded-lg border border-sky-200 dark:border-sky-800 bg-white dark:bg-gray-800 p-4 hover:bg-sky-50 dark:hover:bg-sky-900/20 transition-colors cursor-pointer"
            data-doc="chat-questions"
          >
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-400">Chat & Asking Questions</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Use the chat interface and knowledge proxy to query your graph conversationally.</p>
          </button>

        </div>
      </div>

    </div>
  );
}

export { OverviewDiagram };
export default Part1WhatIsPodbit;
