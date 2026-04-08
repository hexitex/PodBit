

function StackDiagram() {
  return (
    <svg viewBox="0 0 930 340" className="w-full mx-auto" role="img" aria-label="Podbit stack and LLM requirements">
      <defs>
        <marker id="arrowGS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* LLM Providers - left side */}
      <rect x="20" y="20" width="280" height="300" rx="10" fill="#a855f7" opacity="0.08" stroke="#a855f7" strokeWidth="1.5" />
      <text x="160" y="46" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-sm font-bold">Models &amp; Services</text>

      {/* Local models */}
      <rect x="35" y="60" width="250" height="55" rx="6" fill="#a855f7" opacity="0.12" stroke="#a855f7" strokeWidth="1" />
      <text x="160" y="80" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-xs font-semibold">Local LLMs (small / embedding)</text>
      <text x="160" y="96" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400 text-xs">LM Studio, Ollama, vLLM, etc.</text>

      {/* Cloud / Frontier APIs */}
      <rect x="35" y="125" width="250" height="55" rx="6" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1" />
      <text x="160" y="145" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-xs font-semibold">Cloud LLMs (medium / frontier)</text>
      <text x="160" y="161" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">OpenAI, Anthropic, Z.AI, Groq, etc.</text>

      {/* Embedding model */}
      <rect x="35" y="190" width="250" height="45" rx="6" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" strokeWidth="1" />
      <text x="160" y="210" textAnchor="middle" className="fill-sky-700 dark:fill-sky-300 text-xs font-semibold">Embedding Model (local, fast on CPU)</text>
      <text x="160" y="224" textAnchor="middle" className="fill-sky-500 dark:fill-sky-400 text-xs">nomic-embed, bge-m3, mxbai, etc.</text>

      {/* External APIs - non-LLM */}
      <rect x="35" y="245" width="250" height="65" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="160" y="265" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">Data APIs (non-LLM, optional)</text>
      <text x="160" y="281" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">Wikimedia, PubChem, financial feeds</text>
      <text x="160" y="297" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">Confirmation &amp; enrichment sources</text>

      {/* Podbit core - center */}
      <rect x="370" y="50" width="220" height="240" rx="10" fill="#6366f1" opacity="0.1" stroke="#6366f1" strokeWidth="2" />
      <text x="480" y="78" textAnchor="middle" className="fill-indigo-700 dark:fill-indigo-300 text-sm font-bold">Podbit Server</text>

      <rect x="385" y="92" width="190" height="35" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="480" y="114" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">REST API</text>

      <rect x="385" y="135" width="190" height="35" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="480" y="157" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">GUI</text>

      <rect x="385" y="178" width="190" height="35" rx="5" fill="#f97316" opacity="0.12" stroke="#f97316" strokeWidth="1" />
      <text x="480" y="200" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400 text-xs">Knowledge Proxy (:11435)</text>

      <rect x="385" y="221" width="190" height="35" rx="5" fill="#a855f7" opacity="0.12" stroke="#a855f7" strokeWidth="1" />
      <text x="480" y="243" textAnchor="middle" className="fill-purple-600 dark:fill-purple-400 text-xs">Synthesis Engine + Cycles</text>

      <text x="480" y="278" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">MCP stdio (when invoked by agent)</text>

      {/* Consumers - right side */}
      <rect x="660" y="60" width="240" height="230" rx="10" fill="#f59e0b" opacity="0.08" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="780" y="86" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-sm font-bold">You</text>

      <rect x="672" y="98" width="216" height="40" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="780" y="122" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">GUI Dashboard + Chat</text>

      <rect x="672" y="148" width="216" height="40" rx="6" fill="#f97316" opacity="0.12" stroke="#f97316" strokeWidth="1" />
      <text x="780" y="172" textAnchor="middle" className="fill-orange-700 dark:fill-orange-300 text-xs font-semibold">Knowledge Proxy (any client)</text>

      <rect x="672" y="198" width="216" height="40" rx="6" fill="#8b5cf6" opacity="0.12" stroke="#8b5cf6" strokeWidth="1" />
      <text x="780" y="222" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-xs font-semibold">MCP Agent (IDE, Claude, etc.)</text>

      <rect x="672" y="248" width="216" height="30" rx="6" fill="#94a3b8" opacity="0.12" stroke="#94a3b8" strokeWidth="1" />
      <text x="780" y="268" textAnchor="middle" className="fill-gray-600 dark:fill-gray-400 text-xs font-medium">REST API (scripts, tools)</text>

      {/* Arrows: providers -> Podbit */}
      <path d="M 300 88 C 330 88, 350 100, 370 110" fill="none" stroke="#a855f7" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 300 150 C 330 145, 350 140, 370 140" fill="none" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 300 212 C 330 205, 350 195, 370 190" fill="none" stroke="#0ea5e9" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 300 278 C 330 270, 350 255, 370 250" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowGS)" />

      {/* Arrows: Podbit -> Consumers */}
      <path d="M 590 110 C 620 110, 645 115, 672 118" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 590 160 C 620 160, 645 165, 672 168" fill="none" stroke="#f97316" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 590 240 C 620 230, 645 225, 672 222" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowGS)" />
      <path d="M 590 200 C 620 220, 645 245, 672 258" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowGS)" />

      {/* Labels */}
      <text x="465" y="330" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">Solid lines = required / primary. Dashed = optional / secondary.</text>
    </svg>
  );
}

/** Help section: First ten minutes — stack diagram and quick start steps. */
function Part1FirstTenMinutes() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Your First Steps</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          This guide gets you from zero to your first synthesized insight. You need at least one LLM endpoint.
          By the end, you will have models registered, knowledge seeded, and the synthesis engine producing
          connections autonomously.
        </p>
      </div>

      <StackDiagram />

      {/* Step 1: Set Up Models */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-3">Step 1: Set Up Models</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          Podbit has <strong>25+ subsystems</strong>, each assignable to a different model. The minimum to start
          is two assignments: <code className="text-purple-700 dark:text-purple-300">embedding</code> (local recommended)
          and <code className="text-purple-700 dark:text-purple-300">synthesis</code> (cloud recommended). Everything
          talks the OpenAI-compatible API. Unassigned subsystems simply don't run — the system gracefully skips
          cycles without a model.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">Local Models — small, fast, cheap</p>
            <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
              Best for high-volume subsystems where throughput matters more than reasoning depth.
              Embeddings, autorating, keyword extraction, and domain classification run frequently and
              benefit from zero API cost.
            </p>
            <ul className="text-xs text-purple-500 dark:text-purple-400 space-y-1">
              <li><strong>LM Studio</strong> — GUI-based, easy setup, runs GGUF models</li>
              <li><strong>Ollama</strong> — CLI-based, auto-pulls models, lightweight</li>
              <li><strong>vLLM / text-generation-inference</strong> — high-throughput serving</li>
              <li>Any server with an OpenAI-compatible <code className="text-purple-700 dark:text-purple-300">/v1/chat/completions</code> endpoint</li>
            </ul>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">Cloud APIs — medium &amp; frontier quality</p>
            <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
              Synthesis, voicing, and research produce substantially better output with stronger models —
              cloud also gives you speed. A built-in budgeting system tracks spend and caps costs so
              you stay in control. Mix freely: cloud for quality-sensitive subsystems, local for volume.
            </p>
            <ul className="text-xs text-purple-500 dark:text-purple-400 space-y-1">
              <li><strong>OpenAI</strong> — GPT-4o, o1, o3-mini, etc.</li>
              <li><strong>Anthropic</strong> — Claude (via OpenAI-compatible wrapper)</li>
              <li><strong>Any OpenAI-compatible</strong> — Z.AI, Groq, Together, etc.</li>
              <li>Per-model API keys supported in the model registry</li>
            </ul>
          </div>
        </div>

        {/* Embeddings callout */}
        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-3">
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Embeddings: Run Locally</p>
          <p className="text-xs text-sky-600 dark:text-sky-400">
            Embeddings are the foundation — every node gets embedded for similarity search, synthesis pairing,
            dedup, and relevance scoring. A <strong>local embedding model performs well even on CPU</strong> and
            avoids per-call API costs that add up fast with thousands of nodes. Popular choices:{' '}
            <code className="text-sky-700 dark:text-sky-300">nomic-embed-text</code>,{' '}
            <code className="text-sky-700 dark:text-sky-300">bge-m3</code>,{' '}
            <code className="text-sky-700 dark:text-sky-300">mxbai-embed-large</code>.
          </p>
        </div>
      </div>

      {/* Step 2: Start Podbit */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-3">Step 2: Start Podbit</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3">
          The full stack includes the REST API, GUI, Knowledge Proxy, and synthesis engine.
          It can start in two ways:
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Direct start (recommended)</p>
            <pre className="text-xs text-indigo-600 dark:text-indigo-400 overflow-x-auto"><code>{`npm run start`}</code></pre>
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-2">
              Starts the server. Open the GUI in your browser and configure models, seed knowledge,
              and start synthesis from the Dashboard.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Via MCP (auto-starts)</p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400">
              If you configure Podbit as an MCP server in your IDE, the stack auto-starts when the
              agent first connects. No manual startup needed — the MCP entry point boots everything.
            </p>
          </div>
        </div>
        <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-3">
          Ports are configurable in <code className="text-indigo-700 dark:text-indigo-300">.env</code>.
          Requires <strong>Node.js 18+</strong>.
        </p>
      </div>

      {/* Step 3: Register Models */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-3">Step 3: Register Models</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          Open the Models page in the GUI. Register your LLM endpoints, then assign them to subsystems.
          For full details, see{' '}
          <a className="docs-link-internal underline decoration-amber-300" data-doc="configuration">Configuration</a>.
        </p>
        <ol className="text-xs text-amber-600 dark:text-amber-400 space-y-2 list-decimal list-inside">
          <li><strong>Register models</strong> — Add your local or cloud endpoints. Each model needs a name, base URL,
            model ID, and provider type. Test the connection to verify.</li>
          <li><strong>Assign embedding first</strong> — Assign your embedding model to the <code className="text-amber-700 dark:text-amber-300">embedding</code> subsystem.
            Without this, nodes can't be embedded and synthesis can't find pairs.</li>
          <li><strong>Assign synthesis</strong> — Assign an LLM to the <code className="text-amber-700 dark:text-amber-300">synthesis</code> subsystem.
            This is the model that produces insights from node pairs.</li>
          <li><strong>Optional extras</strong> — Assign models to <code className="text-amber-700 dark:text-amber-300">voice</code>,{' '}
            <code className="text-amber-700 dark:text-amber-300">research</code>,{' '}
            <code className="text-amber-700 dark:text-amber-300">chat</code>, and others as needed.
            Small local models for high-volume subsystems, frontier cloud models for quality-sensitive tasks.</li>
        </ol>
      </div>

      {/* Step 4: Add Knowledge & Start Synthesis */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-3">Step 4: Add Knowledge &amp; Start Synthesis</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          With models assigned, feed the graph and let Podbit think. For a deeper guide on seeding strategies,
          see{' '}
          <a className="docs-link-internal underline decoration-emerald-300" data-doc="adding-knowledge">Adding Knowledge</a>.
        </p>
        <ol className="text-xs text-emerald-600 dark:text-emerald-400 space-y-2 list-decimal list-inside">
          <li><strong>Add initial seeds</strong> — Use the GUI Chat, the Graph page, or{' '}
            <a className="docs-link-internal underline decoration-emerald-300" data-doc="adding-knowledge">Knowledge Base</a> folder
            ingestion to add your starting material. 10-20 seeds in a domain is enough to begin.</li>
          <li><strong>Start the synthesis engine</strong> — On the Dashboard, switch to <strong>API mode</strong> and
            click Start. The engine begins discovering connections between your seeds autonomously.</li>
          <li><strong>Enable autonomous cycles</strong> — Toggle on voicing, research, questions, tensions,
            validation, and autorating cycles as desired. Each runs independently on its own interval.</li>
          <li><strong>Watch the activity feed</strong> — The Dashboard shows real-time events as cycles run.
            You'll see pairings, rejections, new nodes, and quality gate decisions.</li>
          <li><strong>Review and curate</strong> — Browse the Graph page to see what the engine produced.
            Rate nodes, promote breakthroughs, remove junk, and add more seeds to guide the research.
            See{' '}
            <a className="docs-link-internal underline decoration-emerald-300" data-doc="growing-graph">Growing the Graph</a> for
            synthesis details.</li>
        </ol>
      </div>

      {/* Ways to Interact */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Ways to Interact</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Once running, Podbit has four interaction surfaces. The GUI is the primary way most people work
          with the system.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* GUI */}
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">GUI (Primary)</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
            The web GUI is the main interface. Dashboard for engine control, Chat for conversation,
            Graph for browsing, Models for configuration, Config for tuning, Costs for spend tracking.
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white dark:bg-gray-900 rounded p-2 border border-emerald-100 dark:border-emerald-700">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">Dashboard</p>
              <p className="text-emerald-500 dark:text-emerald-400">Engine control, activity feed, stats</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded p-2 border border-emerald-100 dark:border-emerald-700">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">Chat</p>
              <p className="text-emerald-500 dark:text-emerald-400">Knowledge-grounded conversations</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded p-2 border border-emerald-100 dark:border-emerald-700">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">Graph</p>
              <p className="text-emerald-500 dark:text-emerald-400">Browse, rate, promote, remove nodes</p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded p-2 border border-emerald-100 dark:border-emerald-700">
              <p className="font-medium text-emerald-700 dark:text-emerald-300">Models</p>
              <p className="text-emerald-500 dark:text-emerald-400">Register LLMs, assign subsystems</p>
            </div>
          </div>
        </div>

        {/* Knowledge Proxy */}
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
          <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Knowledge Proxy</h3>
          <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
            An OpenAI-compatible proxy at <code className="text-orange-700 dark:text-orange-300">localhost:11435</code>.
            Point any client that speaks the OpenAI API and every request is transparently enriched with
            graph knowledge before forwarding to the LLM. No code changes needed.
          </p>
          <pre className="text-xs text-orange-600 dark:text-orange-400 overflow-x-auto bg-white dark:bg-gray-900 rounded p-2 border border-orange-100 dark:border-orange-700"><code>{`client = OpenAI(
  base_url="http://localhost:11435/v1",
  api_key="not-needed"
)`}</code></pre>
        </div>

        {/* MCP */}
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">MCP Agent</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
            AI agents (Claude Code, Cursor, Windsurf, etc.) can interact with the graph via the Model Context
            Protocol. The MCP server provides 30+ tools for querying, proposing, compressing, and managing
            the knowledge graph programmatically. See{' '}
            <a className="docs-link-internal underline decoration-purple-300" data-doc="slash-commands">MCP Tools</a> for
            the full reference.
          </p>
          <pre className="text-xs text-purple-600 dark:text-purple-400 overflow-x-auto bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-800"><code>{`{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "/path/to/podbit/mcp-stdio.ts"]
    }
  }
}`}</code></pre>
        </div>

        {/* REST API */}
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">REST API</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            The same API that powers the GUI is available for scripts, automation, and custom integrations.
            Every GUI action maps to a REST endpoint.
          </p>
        </div>
      </div>

      {/* Optional: Data APIs */}
      <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
        <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">Optional: Data APIs for Confirmation &amp; Enrichment</h3>
        <p className="text-xs text-cyan-600 dark:text-cyan-400">
          These are <strong>not LLMs</strong> — they are external data services that provide factual confirmation
          and enrichment. The API Registry lets you register sources like Wikimedia, PubChem, financial feeds,
          and other domain-specific databases. The lab verification cycle calls these APIs to ground synthesized claims
          in real data. Entirely optional — Podbit works fine without external APIs.
        </p>
      </div>
    </div>
  );
}

export { StackDiagram };
export default Part1FirstTenMinutes;
