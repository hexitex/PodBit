/** Help section: installation, setup, and server configuration. */

function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 880 360" className="w-full mx-auto" role="img" aria-label="Podbit architecture overview">
      <defs>
        <marker id="arrowInst" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
        <marker id="arrowAmber" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
        </marker>
      </defs>

      {/* Orchestrator — top-level service manager */}
      <rect x="210" y="10" width="440" height="45" rx="8" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" className="dark:fill-amber-900/30 dark:stroke-amber-500" />
      <text x="430" y="30" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-xs font-semibold">Orchestrator :4711</text>
      <text x="430" y="44" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">Service manager — spawns, monitors, auto-restarts services</text>

      {/* Dashed arrows: Orchestrator spawns services */}
      <path d="M 320 55 L 160 80" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowAmber)" />
      <path d="M 430 55 L 430 80" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowAmber)" />
      <path d="M 540 55 L 710 80" fill="none" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowAmber)" />

      {/* API Server — main process */}
      <rect x="220" y="85" width="420" height="75" rx="8" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.5" className="dark:fill-emerald-900/30 dark:stroke-emerald-500" />
      <text x="430" y="105" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">API Server :4710</text>
      <text x="430" y="120" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">REST API + Static GUI + Synthesis Engine</text>
      <text x="430" y="135" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">Express — runs all graph operations and autonomous cycles</text>
      <text x="430" y="150" textAnchor="middle" className="fill-emerald-400 dark:fill-emerald-500 text-xs">(also npm start entry point)</text>

      {/* GUI */}
      <rect x="10" y="85" width="150" height="55" rx="8" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.5" className="dark:fill-blue-900/30 dark:stroke-blue-500" />
      <text x="85" y="101" textAnchor="middle" className="fill-blue-700 dark:fill-blue-300 text-xs font-semibold">GUI Dev Server</text>
      <text x="85" y="116" textAnchor="middle" className="fill-blue-400 dark:fill-blue-500 text-xs">:4712 — Vite (React)</text>
      <text x="85" y="131" textAnchor="middle" className="fill-blue-400 dark:fill-blue-500 text-xs">or static via API</text>

      {/* Arrow: GUI -> API */}
      <path d="M 160 112 L 215 112" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowInst)" />

      {/* Knowledge Proxy */}
      <rect x="650" y="85" width="220" height="55" rx="8" fill="#fff7ed" stroke="#f97316" strokeWidth="1.5" className="dark:fill-orange-900/30 dark:stroke-orange-500" />
      <text x="760" y="105" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400 text-xs font-semibold">Knowledge Proxy</text>
      <text x="760" y="121" textAnchor="middle" className="fill-orange-400 dark:fill-orange-500 text-xs">:11435 — OpenAI API</text>
      <text x="760" y="133" textAnchor="middle" className="fill-orange-400 dark:fill-orange-500 text-xs">enriches with graph knowledge</text>

      {/* Arrow: API -> DB */}
      <path d="M 430 160 L 430 185" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowInst)" />

      {/* Database */}
      <rect x="330" y="190" width="200" height="50" rx="8" fill="#f5f3ff" stroke="#8b5cf6" strokeWidth="1.5" className="dark:fill-violet-900/30 dark:stroke-violet-500" />
      <text x="430" y="211" textAnchor="middle" className="fill-violet-700 dark:fill-violet-300 text-xs font-semibold">SQLite</text>
      <text x="430" y="227" textAnchor="middle" className="fill-violet-500 dark:fill-violet-400 text-xs">system.db + project.db</text>

      {/* Proxy -> DB (reads graph for enrichment) */}
      <path d="M 650 130 L 535 200" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 3" markerEnd="url(#arrowInst)" />

      {/* MCP Local — same machine, direct DB access */}
      <rect x="10" y="190" width="155" height="50" rx="8" fill="#f0fdf4" stroke="#86efac" strokeWidth="1.5" className="dark:fill-green-900/30 dark:stroke-green-600" />
      <text x="87" y="208" textAnchor="middle" className="fill-green-700 dark:fill-green-300 text-xs font-semibold">MCP Local (stdio)</text>
      <text x="87" y="223" textAnchor="middle" className="fill-green-500 dark:fill-green-400 text-xs">same machine</text>
      <text x="87" y="235" textAnchor="middle" className="fill-green-500 dark:fill-green-400 text-xs">direct DB access</text>

      {/* MCP Local -> DB */}
      <path d="M 165 215 L 325 215" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowInst)" />

      {/* MCP Remote — client machine, forwards to API */}
      <rect x="10" y="250" width="155" height="50" rx="8" fill="#eff6ff" stroke="#93c5fd" strokeWidth="1.5" className="dark:fill-blue-900/30 dark:stroke-blue-600" />
      <text x="87" y="268" textAnchor="middle" className="fill-blue-700 dark:fill-blue-300 text-xs font-semibold">MCP Remote (stdio)</text>
      <text x="87" y="283" textAnchor="middle" className="fill-blue-500 dark:fill-blue-400 text-xs">client machine</text>
      <text x="87" y="295" textAnchor="middle" className="fill-blue-500 dark:fill-blue-400 text-xs">forwards via HTTP</text>

      {/* MCP Remote -> API Server */}
      <path d="M 165 270 L 200 270 L 220 160" fill="none" stroke="#93c5fd" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arrowInst)" />

      {/* LLM Providers */}
      <rect x="650" y="190" width="220" height="50" rx="8" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="760" y="211" textAnchor="middle" className="fill-gray-700 dark:fill-gray-300 text-xs font-semibold">LLM Providers</text>
      <text x="760" y="227" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">OpenAI / Anthropic / Local</text>

      {/* Proxy -> LLM */}
      <path d="M 760 140 L 760 185" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowInst)" />

      {/* API -> LLM (synthesis calls) */}
      <path d="M 640 140 L 660 190" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 3" markerEnd="url(#arrowInst)" />

      {/* Port labels */}
      <rect x="10" y="310" width="860" height="40" rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
      <text x="30" y="327" className="fill-gray-500 dark:fill-gray-400" style={{ fontSize: '10px', fontWeight: 600 }}>DEFAULT PORTS:</text>
      <text x="30" y="341" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '10px' }}>API: 4710  |  Orchestrator: 4711  |  GUI Dev: 4712  |  Partition: 4713  |  Labs: 4714-4716  |  Proxy: 11435  |  All configurable via .env</text>
    </svg>
  );
}

function InstallationSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Installation & Setup</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit runs as a Node.js server with an embedded SQLite database  -  no external database, Docker, or cloud services
          required. The server runs on Windows, macOS, and Linux — either locally on your machine or on a remote server accessible over the network.
        </p>
      </div>

      {/* Architecture Overview */}
      <ArchitectureDiagram />

      {/* Prerequisites */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Prerequisites</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Node.js 18+ (required)</div>
            <p className="text-gray-500 dark:text-gray-400">LTS version recommended. Check with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">node --version</code>.</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Git (required)</div>
            <p className="text-gray-500 dark:text-gray-400">To clone the repository. On Windows, Git Bash includes OpenSSL.</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">OpenSSL (optional)</div>
            <p className="text-gray-500 dark:text-gray-400">For TLS certificate generation. Only needed for remote access with HTTPS.</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">LLM API Key (optional)</div>
            <p className="text-gray-500 dark:text-gray-400">An API key for at least one LLM provider (OpenAI, Anthropic, local, etc). Configure in the Models page after setup.</p>
          </div>
        </div>
      </div>

      {/* Local Installation */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Local Installation (Quickstart)</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          The simplest setup  -  everything runs on your machine with zero security friction.
        </p>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden mb-3">
          <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`# 1. Clone and install
git clone https://github.com/anthropics/podbit.git
cd podbit
npm install

# 2. (Optional) Run the setup wizard to customize ports, data dir, API keys
npm run setup:local

# 3. Start all services
npm run orchestrate

# Orchestrator (:4711) spawns and manages:
#   API Server  → http://localhost:4710 (REST API, GUI, synthesis engine)
#   Proxy       → http://localhost:11435 (OpenAI-compatible knowledge proxy)
#   GUI Dev     → http://localhost:4712 (Vite dev server)
#
# Minimal alternative (API server only, no proxy or health monitoring):
#   npm start`}</code></pre>
        </div>
        <p className="text-xs text-emerald-500 dark:text-emerald-400 mb-2">
          Open <code className="bg-emerald-100 dark:bg-emerald-900/30 px-1 rounded">http://localhost:4710</code> in your browser. No password, no login  -
          the GUI authenticates automatically via a localhost key handshake.
        </p>
        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-700">
          <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">First Steps After Install</div>
          <ol className="text-xs text-emerald-600 dark:text-emerald-400 space-y-1 list-decimal list-inside">
            <li>Go to the <strong>Models</strong> page and register at least one LLM (add API key and assign subsystems)</li>
            <li>Seed your first knowledge via the <strong>Chat</strong> page or MCP tools</li>
            <li>Start the synthesis engine from the <strong>Dashboard</strong></li>
          </ol>
        </div>
      </div>

      {/* Remote Server Installation */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Remote Server Installation</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          For running Podbit on a remote machine, VM, or cloud server accessible over the network.
          This enables the full security stack: JWT auth, TLS, CORS lockdown, rate limiting.
          See <a href="#doc-security" className="docs-link-internal font-semibold" data-doc="security">Security & Remote Access</a> for full details on the auth system.
        </p>

        {/* Interactive Script */}
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden mb-3">
          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Option A: Interactive Setup Script (recommended)</span>
          </div>
          <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`git clone https://github.com/anthropics/podbit.git
cd podbit
npm install

# Interactive wizard — configures .env and generates TLS cert
npm run setup:remote

# Or use the unified setup (prompts for local vs remote)
# npm run setup

# Start all services (recommended for remote — includes health monitoring)
npm run orchestrate`}</code></pre>
        </div>
        <p className="text-xs text-amber-500 dark:text-amber-400 mb-3">
          The script prompts for host binding, ports, TLS certificate generation, and CORS origins.
          It writes a <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">.env</code> file and optionally generates a self-signed certificate.
        </p>

        {/* Manual Setup */}
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden mb-3">
          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Option B: Manual .env Configuration</span>
          </div>
          <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`git clone https://github.com/anthropics/podbit.git
cd podbit
npm install

# Create .env
cat > .env << 'EOF'
# Bind to all interfaces (triggers remote mode)
HOST=0.0.0.0

# Ports (defaults shown — change if needed)
API_PORT=4710
PROXY_PORT=11435

# TLS — strongly recommended for remote access
PODBIT_TLS_CERT=data/tls/podbit.cert
PODBIT_TLS_KEY=data/tls/podbit.key

# CORS — restrict which origins can access the API
# PODBIT_CORS_ORIGINS=https://my-app.example.com

# Database encryption (optional) — requires: npm install better-sqlite3-multiple-ciphers
# PODBIT_DB_KEY=your-secret-encryption-key
EOF

# Generate self-signed TLS certificate
npm run generate-cert -- your-hostname.local

# Start all services with health monitoring and auto-restart
npm run orchestrate`}</code></pre>
        </div>

        {/* Post-install steps */}
        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-amber-100 dark:border-amber-700">
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">After Starting in Remote Mode</div>
          <ol className="text-xs text-amber-600 dark:text-amber-400 space-y-1 list-decimal list-inside">
            <li>The orchestrator (:4711) spawns the API server (:4710), knowledge proxy (:11435), and GUI dev server (:4712)</li>
            <li>Open <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">https://your-hostname:4710</code> in your browser</li>
            <li>Accept the self-signed certificate warning (or import it into your trust store)</li>
            <li>Set your <strong>admin password</strong> on the first-visit setup screen</li>
            <li>Log in with your password to access the GUI</li>
            <li>Configure LLM models on the <strong>Models</strong> page</li>
            <li>For proxy API clients, use your <strong>security key</strong> (found in Settings) as the API key</li>
          </ol>
        </div>
      </div>

      {/* Environment Variables Reference */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Environment Variables</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          All settings are configured via a <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env</code> file in the project root.
          None are required for localhost operation  -  all have sensible defaults.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Variable</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Default</th>
                <th className="py-1.5 font-medium text-gray-600 dark:text-gray-400">Description</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['HOST', 'localhost', 'Bind address. Set to 0.0.0.0 to enable remote mode with full auth.'],
                ['API_PORT / PORT', '4710', 'API server (REST + GUI + synthesis engine).'],
                ['ORCHESTRATOR_PORT', '4711', 'Service manager orchestrator (health checks, process management).'],
                ['GUI_PORT', '4712', 'Vite dev server (development only — production serves the GUI through the API port).'],
                ['PARTITION_SERVER_PORT', '4713', 'Partition pool worker (background partition operations).'],
                ['MATH_LAB_PORT', '4714', 'Built-in math lab (computational verification). Set in podbit-labs/math-lab/.env as PORT.'],
                ['NN_LAB_PORT', '4715', 'Built-in neural network training lab. Set in podbit-labs/nn-lab/.env as PORT.'],
                ['CRITIQUE_LAB_PORT', '4716', 'Built-in LLM critique lab (manual node review). Set in podbit-labs/critique-lab/.env as PORT.'],
                ['PROXY_PORT', '11435', 'Knowledge proxy (OpenAI-compatible endpoint that enriches with graph context).'],
                ['PODBIT_DATA_DIR', 'data/', 'Data directory for databases, logs, TLS certs, backups. Absolute path.'],
                ['PODBIT_TLS_CERT', '—', 'Path to TLS certificate file. Enables HTTPS on API + proxy.'],
                ['PODBIT_TLS_KEY', '—', 'Path to TLS private key file.'],
                ['PODBIT_CORS_ORIGINS', '—', 'Comma-separated allowed CORS origins (remote mode only).'],
                ['LOG_LEVEL', 'info', 'Logging level: debug, info, warn, or error.'],
                ['LOG_RETENTION_DAYS', '7', 'Days to keep log files before auto-cleanup.'],
                ['PODBIT_DB_KEY', '—', 'Database encryption key (SQLCipher). Requires better-sqlite3-multiple-ciphers package.'],
                ['PODBIT_NO_AUTO_ORCHESTRATOR', '—', 'Set to 1 to prevent MCP server from auto-starting the orchestrator.'],
                ['PODBIT_NO_AUTO_OPEN', '—', 'Set to 1 to prevent auto-opening the browser when the server starts.'],
              ].map(([name, def, desc]) => (
                <tr key={name} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">{name}</td>
                  <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{def}</td>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Services & npm Scripts */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Services & Commands</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Podbit consists of several services. <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">npm start</code> launches the
          API server directly. <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">npm run orchestrate</code> starts the orchestrator,
          which spawns and monitors all services (API, proxy, GUI dev server) with health checks and auto-restart.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Command</th>
                <th className="py-1.5 font-medium text-gray-600 dark:text-gray-400">Purpose</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['npm start', 'Start the API server (serves GUI, REST API, synthesis engine)'],
                ['npm run orchestrate', 'Start orchestrator — spawns and manages all services with health checks'],
                ['npm run setup', 'Interactive setup wizard (choose local or remote)'],
                ['npm run setup:local', 'Local setup (ports, data dir, API keys)'],
                ['npm run setup:remote', 'Remote setup (TLS, auth, CORS, ports)'],
                ['npm run setup:client', 'Generate client config snippets (Python, cURL, IDE, MCP)'],
                ['npm run generate-cert', 'Generate self-signed TLS certificate'],
                ['npm run mcp', 'Start MCP stdio server (local, direct DB access)'],
                ['npm run mcp:remote', 'Start MCP remote server (forwards tool calls to API server)'],
                ['npm run build:site-docs', 'Rebuild static documentation'],
                ['npm test', 'Run test suite'],
                ['npm run typecheck', 'TypeScript type checking'],
              ].map(([cmd, purpose]) => (
                <tr key={cmd} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">{cmd}</td>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">{purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data Directory */}
      <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg p-4">
        <h3 className="font-semibold text-violet-700 dark:text-violet-300 text-sm mb-2">Data Directory</h3>
        <p className="text-xs text-violet-600 dark:text-violet-400 mb-3">
          All persistent data lives in <code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">data/</code>. This directory
          is created automatically on first run. Back it up to preserve your knowledge graph.
        </p>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
          <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`data/
├── system.db          # System database (models, prompts, config)
├── projects/
│   ├── projects.json  # Project index (active project, metadata)
│   └── default.db     # Default project database (nodes, edges, etc)
├── tls/               # TLS certificates (if generated)
│   ├── podbit.cert
│   └── podbit.key
├── logs/              # Application logs
└── backups/           # Database backups`}</code></pre>
        </div>
      </div>

      {/* MCP Integration */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">MCP (IDE) Integration</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">
          Podbit exposes an MCP server for integration with LLM IDE agents (Claude Code, Cursor, Continue, etc).
          Two modes are available depending on your deployment:
        </p>

        {/* Local MCP */}
        <div className="mb-3">
          <div className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Local Mode (same machine)</div>
          <p className="text-xs text-sky-500 dark:text-sky-400 mb-2">
            Uses <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">mcp-stdio.ts</code> — direct database access, no network needed.
          </p>
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <pre className="p-3 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto"><code>{`{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "mcp-stdio.ts"],
      "cwd": "/path/to/podbit"
    }
  }
}`}</code></pre>
          </div>
        </div>

        {/* Remote MCP */}
        <div className="mb-3">
          <div className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Remote Mode (server on another machine)</div>
          <p className="text-xs text-sky-500 dark:text-sky-400 mb-2">
            Uses <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">mcp-stdio-remote.ts</code> — forwards
            all tool calls to the remote API server over HTTP. Requires a Podbit clone on the client for the MCP SDK
            and script. Works on Linux, macOS, and Windows clients.
          </p>
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <pre className="p-3 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto"><code>{`{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "mcp-stdio-remote.ts"],
      "cwd": "/path/to/podbit",
      "env": {
        "PODBIT_API_URL": "https://your-server:4710",
        "PODBIT_API_KEY": "your-security-key"
      }
    }
  }
}`}</code></pre>
          </div>
          <p className="text-xs text-sky-500 dark:text-sky-400 mt-1">
            For self-signed TLS certs, add <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">{'"NODE_TLS_REJECT_UNAUTHORIZED": "0"'}</code> to
            the <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">env</code> block, or import the cert into the client OS trust store.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
          <p className="text-xs text-sky-600 dark:text-sky-400">
            <strong>Client setup:</strong> Clone the repo on the client machine, run <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">npm install</code>,
            then use <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">npm run setup:client</code> on the server to generate
            pre-filled config snippets with your server URL and key.
          </p>
        </div>
      </div>

      {/* Proxy Client Setup */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Knowledge Proxy Client Setup</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-3">
          The knowledge proxy enriches any OpenAI-compatible request with knowledge graph context.
          Point any client at the proxy URL and every request is automatically enriched.
          Run <code className="bg-orange-100 dark:bg-orange-900/30 px-1 rounded font-semibold">npm run setup:client</code> to
          generate ready-to-use config snippets for all platforms, pre-filled with your server settings.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Local Setup (no auth)</span>
            </div>
            <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`# Python
client = OpenAI(base_url="http://localhost:11435/v1", api_key="not-needed")

# IDE config
{ "apiBase": "http://localhost:11435/v1", "apiKey": "not-needed" }

# cURL
curl http://localhost:11435/v1/chat/completions -H "Content-Type: application/json" \\
  -d '{"model":"default","messages":[{"role":"user","content":"Hello"}]}'`}</code></pre>
          </div>
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Remote Setup (security key as API key)</span>
            </div>
            <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`# Python
client = OpenAI(
    base_url="https://your-server:11435/v1",
    api_key="YOUR_SECURITY_KEY"  # from Settings page
)

# IDE config
{ "apiBase": "https://your-server:11435/v1", "apiKey": "YOUR_SECURITY_KEY" }

# cURL
curl https://your-server:11435/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_SECURITY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"default","messages":[{"role":"user","content":"Hello"}]}'`}</code></pre>
          </div>
        </div>
      </div>

      {/* Troubleshooting */}
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">Common Issues</h3>
        <div className="space-y-3 text-xs">
          <div>
            <p className="font-medium text-red-700 dark:text-red-300">Port already in use (EADDRINUSE)</p>
            <p className="text-red-600 dark:text-red-400">
              Another process is using the port. Change it in <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">.env</code> (e.g., <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">API_PORT=4720</code>) or stop the conflicting process.
            </p>
          </div>
          <div>
            <p className="font-medium text-red-700 dark:text-red-300">Cannot connect to GUI</p>
            <p className="text-red-600 dark:text-red-400">
              Check that the server started successfully (look for the startup banner in terminal). If remote, ensure your firewall allows the API port.
            </p>
          </div>
          <div>
            <p className="font-medium text-red-700 dark:text-red-300">Self-signed certificate warning</p>
            <p className="text-red-600 dark:text-red-400">
              Expected with self-signed certs. Either accept the warning in your browser or import <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">data/tls/podbit.cert</code> into your OS/browser trust store.
            </p>
          </div>
          <div>
            <p className="font-medium text-red-700 dark:text-red-300">openssl not found</p>
            <p className="text-red-600 dark:text-red-400">
              Install OpenSSL: Windows (included with Git for Windows), macOS (<code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">brew install openssl</code>),
              Linux (<code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">apt install openssl</code>). Or provide your own cert files.
            </p>
          </div>
          <div>
            <p className="font-medium text-red-700 dark:text-red-300">Models page shows no models</p>
            <p className="text-red-600 dark:text-red-400">
              You need to register at least one LLM. Go to Models, click Add Model, and configure your provider's API key and endpoint.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InstallationSection;
