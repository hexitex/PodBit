import { Link } from 'react-router-dom';

function OverviewDiagram() {
  return (
    <svg viewBox="0 0 880 370" className="w-full mx-auto" role="img" aria-label="Podbit system overview">
      {/* Background */}
      <rect x="0" y="0" width="880" height="370" rx="12" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />

      {/* Arrow marker */}
      <defs>
        <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
        <marker id="arrowSky" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0ea5e9" opacity="0.6" />
        </marker>
      </defs>

      {/* Knowledge Graph */}
      <rect x="30" y="40" width="180" height="95" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="120" y="68" textAnchor="middle" className="fill-sky-700 text-sm font-semibold">Knowledge</text>
      <text x="120" y="84" textAnchor="middle" className="fill-sky-700 text-sm font-semibold">Graph</text>
      <text x="120" y="108" textAnchor="middle" className="fill-sky-600 text-xs">Nodes, edges,</text>
      <text x="120" y="121" textAnchor="middle" className="fill-sky-600 text-xs">embeddings, domains</text>

      {/* Synthesis Engine */}
      <rect x="235" y="40" width="180" height="95" rx="8" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1.5" />
      <text x="325" y="68" textAnchor="middle" className="fill-purple-700 text-sm font-semibold">Synthesis</text>
      <text x="325" y="84" textAnchor="middle" className="fill-purple-700 text-sm font-semibold">Engine</text>
      <text x="325" y="108" textAnchor="middle" className="fill-purple-600 text-xs">Autonomous discovery,</text>
      <text x="325" y="121" textAnchor="middle" className="fill-purple-600 text-xs">synthesis, tensions</text>

      {/* Context Engine */}
      <rect x="440" y="40" width="180" height="95" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="530" y="68" textAnchor="middle" className="fill-emerald-700 text-sm font-semibold">Context</text>
      <text x="530" y="84" textAnchor="middle" className="fill-emerald-700 text-sm font-semibold">Engine</text>
      <text x="530" y="108" textAnchor="middle" className="fill-emerald-600 text-xs">Dynamic context for</text>
      <text x="530" y="121" textAnchor="middle" className="fill-emerald-600 text-xs">LLM conversations</text>

      {/* Knowledge Base */}
      <rect x="645" y="40" width="180" height="95" rx="8" fill="#f97316" opacity="0.15" stroke="#f97316" strokeWidth="1.5" />
      <text x="735" y="68" textAnchor="middle" className="fill-orange-700 text-sm font-semibold">Knowledge</text>
      <text x="735" y="84" textAnchor="middle" className="fill-orange-700 text-sm font-semibold">Base</text>
      <text x="735" y="108" textAnchor="middle" className="fill-orange-600 text-xs">Folder &amp; API ingestion,</text>
      <text x="735" y="121" textAnchor="middle" className="fill-orange-600 text-xs">readers, watchers</text>

      {/* Curved arrows between top-row systems */}
      <path d="M 210 87 C 218 87, 227 87, 235 87" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow)" />
      <path d="M 415 87 C 423 87, 432 87, 440 87" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow)" />
      {/* KB feeds into Knowledge Graph  - curved arc */}
      <path d="M 735 135 C 735 165, 120 165, 120 135" fill="none" stroke="#0ea5e9" strokeWidth="1" strokeDasharray="5 3" opacity="0.5" markerEnd="url(#arrowSky)" />
      <text x="430" y="172" textAnchor="middle" className="fill-sky-500 text-xs">ingests into graph</text>

      {/* MCP / API layer */}
      <rect x="30" y="195" width="795" height="50" rx="8" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="427" y="225" textAnchor="middle" className="fill-amber-700 text-sm font-semibold">MCP Tools + REST API</text>

      {/* Curved connections down to API layer */}
      <path d="M 120 135 C 120 155, 120 170, 120 195" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
      <path d="M 325 135 C 325 155, 325 170, 325 195" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
      <path d="M 530 135 C 530 155, 530 170, 530 195" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
      <path d="M 735 135 C 735 155, 735 170, 735 195" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />

      {/* Consumers */}
      <rect x="50" y="280" width="160" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="130" y="304" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">MCP Agents</text>

      <rect x="240" y="280" width="160" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="320" y="304" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">GUI Dashboard</text>

      <rect x="430" y="280" width="160" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="510" y="304" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">Chat Interface</text>

      <rect x="620" y="280" width="160" height="40" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="700" y="304" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">Knowledge Proxy</text>

      {/* Curved arrows from API to consumers */}
      <path d="M 130 245 C 130 255, 130 265, 130 280" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow)" />
      <path d="M 320 245 C 320 255, 320 265, 320 280" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow)" />
      <path d="M 510 245 C 510 255, 510 265, 510 280" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow)" />
      <path d="M 700 245 C 700 255, 700 265, 700 280" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow)" />

      {/* Label row */}
      <text x="427" y="350" textAnchor="middle" className="fill-gray-400 text-xs">All consumers access the system through the unified MCP + REST layer</text>
    </svg>
  );
}

/** Help section: system overview diagram and high-level concepts. */
function OverviewSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">What is Podbit?</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit is an <strong>autonomous research engine</strong>. You feed it knowledge  - papers, notes, code, raw ideas  - and
          it runs a continuous cycle of <strong>synthesis, verification, and discovery</strong> to find connections you didn't
          know existed. The synthesis engine pairs nodes by embedding similarity and uses LLMs to voice new insights.
          The <strong>lab verification</strong> system empirically tests synthesized claims. Seven autonomous cycles
          (synthesis, validation, questions, tensions, research, autorating, lab verification) run in parallel, each exploring a different
          facet of your knowledge.
        </p>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mt-2">
          Supporting infrastructure includes a <strong>Knowledge Base</strong> pipeline (6 reader plugins for ingesting local files),
          a <strong>context engine</strong> with cross-session learning (enriches LLM conversations with graph knowledge),
          a <strong>knowledge proxy</strong> (OpenAI-compatible endpoint that injects graph context transparently),
          <strong> Merkle DAG integrity</strong> (cryptographic provenance), <strong>number variable isolation</strong> (prevents
          universalizing domain-specific numbers), <strong>node lifecycle management</strong>, and multiple <strong>projects</strong> for
          maintaining separate research graphs.
        </p>
      </div>

      <OverviewDiagram />

      <div className="grid grid-cols-2 gap-4">
        <Link to="/help/concepts" className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg p-4 col-span-2 hover:border-violet-400 dark:hover:border-violet-500 transition-colors">
          <h3 className="font-semibold text-violet-700 dark:text-violet-300 text-sm mb-2">Core Concepts: How Podbit Thinks &rarr;</h3>
          <p className="text-xs text-violet-600 dark:text-violet-400">
            Understand the 7 autonomous cycles — synthesis vs voicing vs research, why each exists, how they work together, and what they produce. Start here.
          </p>
        </Link>
        <Link to="/help/graph" className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4 hover:border-sky-400 dark:hover:border-sky-500 transition-colors">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Knowledge Graph &rarr;</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400">
            The research substrate. Ideas stored as typed, weighted, embedded nodes organized into domain partitions with parent-child lineage.
          </p>
        </Link>
        <Link to="/help/synthesis" className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4 hover:border-purple-400 dark:hover:border-purple-500 transition-colors">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Synthesis Engine &rarr;</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            The core research loop. 7 autonomous cycles discover connections, generate questions, explore tensions, verify claims, and rate quality.
          </p>
        </Link>
        <Link to="/help/context" className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Context Engine &rarr;</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Feeds research knowledge into LLM conversations. Session-aware, cross-session learning, adapts to model size.
          </p>
        </Link>
        <Link to="/help/proxy" className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4 hover:border-orange-400 dark:hover:border-orange-500 transition-colors">
          <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Knowledge Proxy &rarr;</h3>
          <p className="text-xs text-orange-600 dark:text-orange-400">
            OpenAI-compatible endpoint (:11435) that enriches any LLM request with research knowledge. Point your IDE, scripts, or agents at it.
          </p>
        </Link>
        <Link to="/help/kb" className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4 col-span-2 hover:border-red-400 dark:hover:border-red-500 transition-colors">
          <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">Knowledge Base &rarr;</h3>
          <p className="text-xs text-red-600 dark:text-red-400">
            Ingest research material  - papers, documents, code, data  - via 6 reader plugins with file watching, change detection, and smart chunking.
          </p>
        </Link>
      </div>

      <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mt-2">GUI Pages</h3>
      <div className="grid grid-cols-3 gap-3">
        <Link to="/help/dashboard" className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3 hover:border-amber-400 dark:hover:border-amber-500 transition-colors">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-xs mb-1">Dashboard &rarr;</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400">Activity feed, synthesis controls, stats, model health</p>
        </Link>
        <Link to="/help/chat" className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-3 hover:border-teal-400 dark:hover:border-teal-500 transition-colors">
          <h3 className="font-semibold text-teal-700 dark:text-teal-300 text-xs mb-1">Chat &rarr;</h3>
          <p className="text-xs text-teal-600 dark:text-teal-400">Conversations with knowledge injection, modes, scoping</p>
        </Link>
        <Link to="/help/graph" className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-3 hover:border-sky-400 dark:hover:border-sky-500 transition-colors">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-xs mb-1">Graph &rarr;</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400">Browse, filter, and interact with knowledge nodes</p>
        </Link>
        <Link to="/help/breakthroughs" className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3 hover:border-yellow-400 dark:hover:border-yellow-500 transition-colors">
          <h3 className="font-semibold text-yellow-700 dark:text-yellow-300 text-xs mb-1">Breakthroughs &rarr;</h3>
          <p className="text-xs text-yellow-600 dark:text-yellow-400">Validated discoveries, scores, promotion lifecycle</p>
        </Link>
        <Link to="/help/kb" className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-3 hover:border-orange-400 dark:hover:border-orange-500 transition-colors">
          <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-xs mb-1">Knowledge Base &rarr;</h3>
          <p className="text-xs text-orange-600 dark:text-orange-400">Folder ingestion, readers, file watching, raw mode</p>
        </Link>
        <Link to="/help/models" className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-xs mb-1">Models &rarr;</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">LLM registry, subsystem assignment, auto-tune</p>
        </Link>
        <Link to="/help/costs" className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-3 hover:border-emerald-400 dark:hover:border-emerald-500 transition-colors">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-xs mb-1">Costs &rarr;</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">API spend tracking, time-series charts, CSV export</p>
        </Link>
        <Link to="/help/verification" className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3 hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
          <h3 className="font-semibold text-blue-700 dark:text-blue-300 text-xs mb-1">Verification &rarr;</h3>
          <p className="text-xs text-blue-600 dark:text-blue-400">Lab verification results, claim testing, experiment pipeline</p>
        </Link>
        <Link to="/help/prompts" className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-lg p-3 hover:border-rose-400 dark:hover:border-rose-500 transition-colors">
          <h3 className="font-semibold text-rose-700 dark:text-rose-300 text-xs mb-1">Prompts &rarr;</h3>
          <p className="text-xs text-rose-600 dark:text-rose-400">View and customize system prompt templates</p>
        </Link>
        <Link to="/help/config" className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg p-3 hover:border-violet-400 dark:hover:border-violet-500 transition-colors">
          <h3 className="font-semibold text-violet-700 dark:text-violet-300 text-xs mb-1">Config &rarr;</h3>
          <p className="text-xs text-violet-600 dark:text-violet-400">Algorithm parameters, AI tune, snapshots, inference</p>
        </Link>
        <Link to="/help/data" className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-3 hover:border-cyan-400 dark:hover:border-cyan-500 transition-colors">
          <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-xs mb-1">Data &rarr;</h3>
          <p className="text-xs text-cyan-600 dark:text-cyan-400">Projects, partitions, backups, database management</p>
        </Link>
        <Link to="/help/resonance" className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-3 hover:border-sky-400 dark:hover:border-sky-500 transition-colors">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-xs mb-1">Graph Browser &rarr;</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400">List/graph views, filters, node detail, lineage, deep linking</p>
        </Link>
        <Link to="/help/api-registry" className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-3 hover:border-teal-400 dark:hover:border-teal-500 transition-colors">
          <h3 className="font-semibold text-teal-700 dark:text-teal-300 text-xs mb-1">API Registry &rarr;</h3>
          <p className="text-xs text-teal-600 dark:text-teal-400">External APIs for verification & enrichment, onboarding interview</p>
        </Link>
        <Link to="/help/scaffold" className="bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700 rounded-lg p-3 hover:border-pink-400 dark:hover:border-pink-500 transition-colors">
          <h3 className="font-semibold text-pink-700 dark:text-pink-300 text-xs mb-1">Create Docs &rarr;</h3>
          <p className="text-xs text-pink-600 dark:text-pink-400">Research briefs, knowledge synthesis, technical reports</p>
        </Link>
        <Link to="/help/activity" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-xs mb-1">Activity Log &rarr;</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Real-time event stream, category badges, time range filters</p>
        </Link>
      </div>

      <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mt-2">Reference</h3>
      <div className="grid grid-cols-3 gap-3">
        <Link to="/help/architecture" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-xs mb-1">Architecture &rarr;</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">System layers, tech stack, key files, service startup</p>
        </Link>
        <Link to="/help/tools" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-xs mb-1">MCP Tools &rarr;</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Complete tool reference for all MCP operations</p>
        </Link>
        <Link to="/help/config" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-xs mb-1">Tuning &rarr;</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Algorithm parameters, self-tuning, snapshots</p>
        </Link>
        <Link to="/help/database" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-xs mb-1">Database &rarr;</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">SQLite design, scaling, Merkle DAG integrity</p>
        </Link>
        <Link to="/help/context" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-xs mb-1">Context Engine &rarr;</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">Dynamic knowledge delivery, session learning, budgets</p>
        </Link>
        <Link to="/help/proxy" className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-xs mb-1">Knowledge Proxy &rarr;</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">OpenAI-compatible endpoint, streaming, integration</p>
        </Link>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Research Workflow</h3>
        <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-2 list-decimal list-inside">
          <li><strong>Seed your research</strong>  - Add initial knowledge: papers, hypotheses, raw observations via MCP, chat, or GUI</li>
          <li><strong>Ingest source material</strong>  - Use the Knowledge Base to bulk-import documents, code, data files, and PDFs</li>
          <li><strong>Run autonomous cycles</strong>  - Synthesis discovers connections, tensions finds contradictions, research generates new seeds, labs verify claims empirically</li>
          <li><strong>Explore discoveries</strong>  - Review synthesized insights, breakthroughs, and research questions the engine has generated</li>
          <li><strong>Verify claims</strong>  - Lab servers run experiments to test claims — Podbit extracts specs, labs return data, evaluator checks data against spec criteria</li>
          <li><strong>Find contradictions</strong>  - Tensions surface opposing claims with high similarity  - these are where unknown knowledge hides</li>
          <li><strong>Generate research briefs</strong>  - Structured analysis reports synthesizing graph knowledge on any topic</li>
          <li><strong>Separate research tracks</strong>  - Use projects to maintain independent knowledge graphs for different research areas</li>
        </ol>
      </div>
    </div>
  );
}

export { OverviewDiagram };
export default OverviewSection;
