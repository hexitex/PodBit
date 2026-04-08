import { Link } from 'react-router-dom';

function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 880 420" className="w-full mx-auto" role="img" aria-label="System architecture  - 4-tier layered view">
      <defs>
        <marker id="arrow4" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Tier labels */}
      <text x="12" y="52" className="text-xs fill-gray-400 dark:fill-gray-500 font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Clients</text>
      <text x="12" y="148" className="text-xs fill-gray-400 dark:fill-gray-500 font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Interface</text>
      <text x="12" y="258" className="text-xs fill-gray-400 dark:fill-gray-500 font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Core</text>
      <text x="12" y="352" className="text-xs fill-gray-400 dark:fill-gray-500 font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Infra</text>

      {/* Tier separator lines */}
      <line x1="75" y1="90" x2="860" y2="90" stroke="#e2e8f0" strokeWidth="0.5" className="dark:stroke-gray-700" />
      <line x1="75" y1="200" x2="860" y2="200" stroke="#e2e8f0" strokeWidth="0.5" className="dark:stroke-gray-700" />
      <line x1="75" y1="310" x2="860" y2="310" stroke="#e2e8f0" strokeWidth="0.5" className="dark:stroke-gray-700" />

      {/* === CLIENTS === */}
      <rect x="80" y="25" width="170" height="48" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="165" y="46" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">AI Agent</text>
      <text x="165" y="62" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">IDE / MCP client</text>

      <rect x="275" y="25" width="170" height="48" rx="6" fill="#8b5cf6" opacity="0.12" stroke="#8b5cf6" strokeWidth="1.5" />
      <text x="360" y="46" textAnchor="middle" className="text-xs font-semibold fill-purple-700 dark:fill-purple-400">GUI Dashboard</text>
      <text x="360" y="62" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">React + Vite</text>

      <rect x="470" y="25" width="375" height="48" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="658" y="46" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Any OpenAI-Compatible Client</text>
      <text x="658" y="62" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">Chat apps, agents, scripts</text>

      {/* Client → Interface arrows */}
      <line x1="165" y1="73" x2="165" y2="108" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow4)" />
      <text x="180" y="95" className="text-xs fill-gray-400 dark:fill-gray-500">stdio</text>
      <line x1="360" y1="73" x2="360" y2="108" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow4)" />
      <text x="375" y="95" className="text-xs fill-gray-400 dark:fill-gray-500">HTTP</text>
      <line x1="658" y1="73" x2="658" y2="108" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow4)" />
      <text x="673" y="95" className="text-xs fill-gray-400 dark:fill-gray-500">HTTP</text>

      {/* === INTERFACE === */}
      <rect x="80" y="108" width="170" height="68" rx="6" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="165" y="130" textAnchor="middle" className="text-xs font-semibold fill-amber-700 dark:fill-amber-400">MCP Server</text>
      <text x="165" y="145" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">mcp-stdio.ts</text>
      <text x="165" y="160" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">30+ tools via stdio</text>

      <rect x="275" y="108" width="170" height="68" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1.5" />
      <text x="360" y="128" textAnchor="middle" className="text-xs font-semibold fill-emerald-700 dark:fill-emerald-400">REST API</text>
      <text x="360" y="143" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">server.ts + orchestrator.ts</text>
      <text x="360" y="158" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Express (:4710)</text>

      <rect x="470" y="108" width="375" height="68" rx="6" fill="#f97316" opacity="0.12" stroke="#f97316" strokeWidth="1.5" />
      <text x="658" y="128" textAnchor="middle" className="text-xs font-semibold fill-orange-700 dark:fill-orange-400">Knowledge Proxy</text>
      <text x="658" y="143" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">proxy-server.ts (:11435)</text>
      <text x="658" y="158" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">OpenAI-compatible + tools</text>

      {/* MCP → REST horizontal link */}
      <line x1="250" y1="140" x2="275" y2="140" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" markerEnd="url(#arrow4)" />

      {/* Interface → Core arrows */}
      <line x1="165" y1="176" x2="165" y2="218" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow4)" />
      <line x1="360" y1="176" x2="360" y2="218" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow4)" />
      <line x1="658" y1="176" x2="658" y2="218" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow4)" />

      {/* === CORE ENGINE === */}
      <rect x="80" y="218" width="765" height="72" rx="8" fill="#0ea5e9" opacity="0.08" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="462" y="237" textAnchor="middle" className="text-xs font-semibold fill-sky-700 dark:fill-sky-400">Core Engine</text>
      <text x="462" y="250" textAnchor="middle" className="text-xs fill-sky-500 dark:fill-sky-400">core/*.ts · handlers/*.ts · models.ts</text>

      {/* Core module chips */}
      {['Synthesis', 'Voicing', 'Scoring', 'Context', 'Models', 'Config', 'Lab', 'KB'].map((name, i) => {
        const chipX = 110 + i * 90;
        return (
          <g key={name}>
            <rect x={chipX} y="258" width="80" height="20" rx="4" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="0.5" />
            <text x={chipX + 40} y="272" textAnchor="middle" className="text-xs font-medium fill-sky-600 dark:fill-sky-400">{name}</text>
          </g>
        );
      })}

      {/* Core → Infra arrows */}
      <line x1="160" y1="290" x2="160" y2="328" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow4)" />
      <line x1="340" y1="290" x2="340" y2="328" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow4)" />
      <line x1="530" y1="290" x2="530" y2="328" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow4)" />
      <line x1="720" y1="290" x2="720" y2="328" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow4)" />

      {/* === INFRASTRUCTURE === */}
      <rect x="80" y="328" width="160" height="48" rx="6" fill="#ef4444" opacity="0.1" stroke="#ef4444" strokeWidth="1.5" />
      <text x="160" y="350" textAnchor="middle" className="text-xs font-semibold fill-red-700 dark:fill-red-400">SQLite</text>
      <text x="160" y="365" textAnchor="middle" className="text-xs fill-red-600 dark:fill-red-400">better-sqlite3</text>

      <rect x="260" y="328" width="160" height="48" rx="6" fill="#f59e0b" opacity="0.1" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="340" y="350" textAnchor="middle" className="text-xs font-semibold fill-amber-700 dark:fill-amber-400">Embeddings</text>
      <text x="340" y="365" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">Ollama / LM Studio</text>

      <rect x="440" y="328" width="180" height="48" rx="6" fill="#8b5cf6" opacity="0.1" stroke="#8b5cf6" strokeWidth="1.5" />
      <text x="530" y="350" textAnchor="middle" className="text-xs font-semibold fill-purple-700 dark:fill-purple-400">LLM Providers</text>
      <text x="530" y="365" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">OpenAI Compat / Local / Z.AI</text>

      <rect x="640" y="328" width="200" height="48" rx="6" fill="#f97316" opacity="0.12" stroke="#f97316" strokeWidth="1.5" />
      <text x="740" y="350" textAnchor="middle" className="text-xs font-semibold fill-orange-700 dark:fill-orange-400">File System</text>
      <text x="740" y="365" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">Watched folders</text>

      {/* Footer */}
      <text x="462" y="408" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">All services auto-started by the orchestrator on MCP client connect</text>
    </svg>
  );
}

/** Help section: server architecture and component diagram. */
function ArchitectureSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">System Architecture</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit consists of several interconnected services. The MCP stdio server provides direct AI integration,
          while the REST API server powers the GUI dashboard and chat interface.
        </p>
      </div>

      <ArchitectureDiagram />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Technology Stack</h3>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
            <li><strong>Runtime:</strong> Node.js 18+ with tsx (TypeScript, no build)</li>
            <li><strong>Backend:</strong> TypeScript, Express.js</li>
            <li><strong>Frontend:</strong> React, Tailwind CSS, React Query, Vite</li>
            <li><strong>Database:</strong> SQLite (better-sqlite3, WAL mode)</li>
            <li><strong>Embeddings:</strong> Ollama / LM Studio (set EMBEDDING_MODEL in .env)</li>
            <li><strong>LLM:</strong> Any OpenAI-compatible API (per-subsystem assignment)</li>
            <li><strong>Proxy:</strong> OpenAI-compatible knowledge proxy (:11435)</li>
            <li><strong>Protocol:</strong> MCP via @modelcontextprotocol/sdk</li>
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Key Files</h3>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">mcp-stdio.ts</code>  - MCP entry point (auto-starts orchestrator)</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">mcp-server.ts</code>  - Tool definitions + dispatch</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">handlers/*.ts</code>  - Tool implementations</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">core/*.ts</code>  - Synthesis engine, voicing, scoring, cluster selection</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">context-engine.ts</code>  - Context selection + compression</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">kb/*.ts</code>  - Knowledge Base pipeline, scanner, readers, watcher</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">models.ts</code>  - LLM provider abstraction + model registry</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">server.ts</code>  - Express REST API</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">proxy-server.ts</code>  - Knowledge proxy (:11435)</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">orchestrator.ts</code>  - Service lifecycle</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">evm/</code>  - Verification pipeline (spec extraction, lab client, data evaluation)</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">lab/</code>  - Lab framework (freeze, taint, templates, evidence, HTTP client)</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">core/elite-pool.ts</code>  - Elite verification pool & generational synthesis</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">core/integrity.ts</code>  - Merkle DAG content hashing & integrity log</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">core/number-variables.ts</code>  - Domain-scoped numeric isolation</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">gui/src/</code>  - React SPA</li>
          </ul>
        </div>
      </div>

      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Knowledge Proxy</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400">
          The proxy server (<code className="bg-orange-100 dark:bg-orange-900/30 px-1 rounded">proxy-server.ts</code>, port 11435) is an OpenAI-compatible
          endpoint that any application can use. It intercepts chat completion requests, enriches them with knowledge
          graph context via the context engine, forwards to the configured LLM, and returns standard OpenAI-compatible responses.
          All standard parameters are forwarded (tools, response_format, logprobs, streaming, etc.).
          Streaming requests are converted to SSE (Server-Sent Events) format.
          See <Link to="/help/proxy" className="font-semibold underline decoration-orange-300 hover:text-orange-800 dark:hover:text-orange-200">Knowledge Proxy</Link> for setup guides and integration details.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Service Startup</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          When an MCP client starts the MCP server, it automatically ensures the full stack is running:
        </p>
        <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
          <li>MCP stdio server checks if orchestrator is running (health check on :4711)</li>
          <li>If not running, spawns orchestrator as a detached process</li>
          <li>Orchestrator starts the REST API server, knowledge proxy, and GUI dev server</li>
          <li>MCP server optionally opens browser to GUI dashboard</li>
          <li>MCP stdio transport connects, tools become available</li>
        </ol>
      </div>

      <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
        <h3 className="font-semibold text-green-700 dark:text-green-300 text-sm mb-2">Database Backup & Restore</h3>
        <p className="text-xs text-green-600 dark:text-green-400 mb-2">
          The Data page provides backup and restore functionality for the SQLite database. Backups use the{' '}
          <strong>better-sqlite3 online backup API</strong>, which is safe to run while the database is open in WAL mode.
        </p>
        <ul className="text-xs text-green-600 dark:text-green-400 space-y-1">
          <li><strong>Backup Now</strong>  - creates a timestamped snapshot in <code className="bg-green-100 dark:bg-green-900/30 px-1 rounded">data/backups/</code> with auto-generated label (podbit-YYYY-MM-DD-HHmm)</li>
          <li><strong>Restore</strong>  - validates the SQLite header, closes the connection, replaces the database file, and reopens with full migration</li>
          <li><strong>REST API</strong>  - <code className="bg-green-100 dark:bg-green-900/30 px-1 rounded">GET /database/backups</code>, <code className="bg-green-100 dark:bg-green-900/30 px-1 rounded">POST /database/backup</code>, <code className="bg-green-100 dark:bg-green-900/30 px-1 rounded">POST /database/restore</code></li>
        </ul>
      </div>

      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Project Management</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2">
          Podbit supports <strong>multiple projects</strong>, each with its own SQLite database containing separate nodes,
          edges, embeddings, and configuration. Projects are managed from the <strong>Projects</strong> page in the sidebar.
        </p>
        <ul className="text-xs text-indigo-600 dark:text-indigo-400 space-y-1">
          <li><strong>Create</strong>  - start a fresh project with an empty knowledge graph</li>
          <li><strong>Save As</strong>  - snapshot the current project to a new name (copies the database)</li>
          <li><strong>Switch</strong>  - load a different project, swapping the active database</li>
          <li><strong>Delete</strong>  - remove a project and its database file</li>
        </ul>
        <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2">
          The <Link to="/help/graph" className="font-semibold underline decoration-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200">Breakthrough Registry</Link> is shared across all projects, providing a global record
          of validated discoveries regardless of which project is active.
        </p>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2">Version</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          System version is read from <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">package.json</code> and exported as{' '}
          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">VERSION</code> from config.ts. All services expose it via{' '}
          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/health</code> endpoints. The Dashboard displays it as a badge.
          Partition exports include a <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">systemVersion</code> field for provenance tracking.
        </p>
      </div>
    </div>
  );
}

export default ArchitectureSection;
