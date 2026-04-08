import { Link } from 'react-router-dom';

function StackDiagram() {
  return (
    <svg viewBox="0 0 880 340" className="w-full mx-auto" role="img" aria-label="Podbit stack and LLM requirements">
      <defs>
        <marker id="arrowGS" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* LLM Providers - left side */}
      <rect x="20" y="20" width="240" height="300" rx="10" fill="#a855f7" opacity="0.08" stroke="#a855f7" strokeWidth="1.5" />
      <text x="140" y="46" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-sm font-bold">Models &amp; Services</text>

      {/* Local models */}
      <rect x="35" y="60" width="210" height="55" rx="6" fill="#a855f7" opacity="0.12" stroke="#a855f7" strokeWidth="1" />
      <text x="140" y="80" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-xs font-semibold">Local LLMs (small / embedding)</text>
      <text x="140" y="96" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400 text-xs">LM Studio, Ollama, vLLM, etc.</text>

      {/* Cloud / Frontier APIs */}
      <rect x="35" y="125" width="210" height="55" rx="6" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1" />
      <text x="140" y="145" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-xs font-semibold">Cloud LLMs (medium / frontier)</text>
      <text x="140" y="161" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">OpenAI, Anthropic, Z.AI, Groq, etc.</text>

      {/* Embedding model */}
      <rect x="35" y="190" width="210" height="45" rx="6" fill="#0ea5e9" opacity="0.12" stroke="#0ea5e9" strokeWidth="1" />
      <text x="140" y="210" textAnchor="middle" className="fill-sky-700 dark:fill-sky-300 text-xs font-semibold">Embedding Model (local, fast on CPU)</text>
      <text x="140" y="224" textAnchor="middle" className="fill-sky-500 dark:fill-sky-400 text-xs">nomic-embed, bge-m3, mxbai, etc.</text>

      {/* External APIs — non-LLM */}
      <rect x="35" y="245" width="210" height="65" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="140" y="265" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">Data APIs (non-LLM, optional)</text>
      <text x="140" y="281" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">Wikimedia, PubChem, financial feeds</text>
      <text x="140" y="297" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">Confirmation &amp; enrichment sources</text>

      {/* Podbit core - center */}
      <rect x="330" y="50" width="220" height="240" rx="10" fill="#6366f1" opacity="0.1" stroke="#6366f1" strokeWidth="2" />
      <text x="440" y="78" textAnchor="middle" className="fill-indigo-700 dark:fill-indigo-300 text-sm font-bold">Podbit Server</text>

      <rect x="345" y="92" width="190" height="35" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="440" y="114" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">REST API</text>

      <rect x="345" y="135" width="190" height="35" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="440" y="157" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">GUI</text>

      <rect x="345" y="178" width="190" height="35" rx="5" fill="#f97316" opacity="0.12" stroke="#f97316" strokeWidth="1" />
      <text x="440" y="200" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400 text-xs">Knowledge Proxy (:11435)</text>

      <rect x="345" y="221" width="190" height="35" rx="5" fill="#a855f7" opacity="0.12" stroke="#a855f7" strokeWidth="1" />
      <text x="440" y="243" textAnchor="middle" className="fill-purple-600 dark:fill-purple-400 text-xs">Synthesis Engine + Cycles</text>

      <text x="440" y="278" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">MCP stdio (when invoked by agent)</text>

      {/* Arrows: providers -> Podbit */}
      <path d="M 260 88 C 290 88, 310 100, 330 110" fill="none" stroke="#a855f7" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 260 150 C 290 145, 310 140, 330 140" fill="none" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 260 212 C 290 205, 310 195, 330 190" fill="none" stroke="#0ea5e9" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 260 278 C 290 270, 310 255, 330 250" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowGS)" />

      {/* Consumers - right side */}
      <rect x="620" y="60" width="230" height="230" rx="10" fill="#f59e0b" opacity="0.08" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="735" y="86" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-sm font-bold">You</text>

      <rect x="635" y="98" width="200" height="40" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="735" y="122" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">GUI Dashboard + Chat</text>

      <rect x="635" y="148" width="200" height="40" rx="6" fill="#f97316" opacity="0.12" stroke="#f97316" strokeWidth="1" />
      <text x="735" y="172" textAnchor="middle" className="fill-orange-700 dark:fill-orange-300 text-xs font-semibold">Knowledge Proxy (any client)</text>

      <rect x="635" y="198" width="200" height="40" rx="6" fill="#8b5cf6" opacity="0.12" stroke="#8b5cf6" strokeWidth="1" />
      <text x="735" y="222" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-xs font-semibold">MCP Agent (IDE, Claude, etc.)</text>

      <rect x="635" y="248" width="200" height="30" rx="6" fill="#94a3b8" opacity="0.12" stroke="#94a3b8" strokeWidth="1" />
      <text x="735" y="268" textAnchor="middle" className="fill-gray-600 dark:fill-gray-400 text-xs font-medium">REST API (scripts, tools)</text>

      {/* Arrows: Podbit -> Consumers */}
      <path d="M 550 110 C 580 110, 610 115, 635 118" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 550 160 C 580 160, 610 165, 635 168" fill="none" stroke="#f97316" strokeWidth="1.5" markerEnd="url(#arrowGS)" />
      <path d="M 550 240 C 580 230, 610 225, 635 222" fill="none" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowGS)" />
      <path d="M 550 200 C 580 220, 610 245, 635 258" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrowGS)" />

      {/* Labels */}
      <text x="440" y="330" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">Solid lines = required / primary. Dashed = optional / secondary.</text>
    </svg>
  );
}

/** Help section: stack diagram and first-steps (LLMs, embedding, proxy, MCP). */
function GettingStartedSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Getting Started</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit needs LLMs to think and embeddings to compare. Everything else — the GUI, proxy, MCP — is
          just ways of interacting with it. This page walks through what you need, how to set it up, and
          the typical first session.
        </p>
      </div>

      <StackDiagram />

      {/* Step 1: Models */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-3">Step 1: Set Up LLM Providers</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          Podbit has <strong>25+ subsystems</strong>, each assignable to a different model. The recommended setup is a
          <strong> mix</strong>: small local models for high-volume, low-stakes work (embeddings, autorating, domain classification)
          and medium-to-frontier cloud models for quality-sensitive tasks (synthesis, voicing, research, chat). Most people
          can't run frontier models locally — cloud APIs give substantially better results for the subsystems that matter most.
          Everything talks the OpenAI-compatible API.
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

        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
          <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-2">Minimum to start</p>
          <div className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="font-medium text-purple-700 dark:text-purple-300">Required</p>
              <ul className="text-purple-500 dark:text-purple-400 space-y-0.5 mt-1">
                <li><code className="text-purple-700 dark:text-purple-300">embedding</code> — local recommended (fast, free)</li>
                <li><code className="text-purple-700 dark:text-purple-300">synthesis</code> — frontier/medium cloud recommended</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-purple-700 dark:text-purple-300">Recommended</p>
              <ul className="text-purple-500 dark:text-purple-400 space-y-0.5 mt-1">
                <li><code className="text-purple-700 dark:text-purple-300">voice</code> — cloud for quality insights</li>
                <li><code className="text-purple-700 dark:text-purple-300">research</code> — cloud for domain knowledge</li>
                <li><code className="text-purple-700 dark:text-purple-300">chat</code> — cloud or local depending on use</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-purple-700 dark:text-purple-300">Optional (local works well)</p>
              <ul className="text-purple-500 dark:text-purple-400 space-y-0.5 mt-1">
                <li><code className="text-purple-700 dark:text-purple-300">spec_extraction</code> — experiment spec extraction</li>
                <li><code className="text-purple-700 dark:text-purple-300">spec_review</code> — adversarial falsifiability check</li>
                <li><code className="text-purple-700 dark:text-purple-300">autorating</code> — quality scoring</li>
                <li><code className="text-purple-700 dark:text-purple-300">config_tune</code> — AI tune suggestions</li>
                <li>+ 18 more (see <Link to="/help/models" className="underline">Models</Link>)</li>
              </ul>
            </div>
          </div>
          <p className="text-xs text-purple-500 dark:text-purple-400 mt-2">
            Unassigned subsystems simply don't run — the system gracefully skips cycles without a model.
          </p>
        </div>
      </div>

      {/* Embeddings callout */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Embeddings: Run Locally</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
          Embeddings are the foundation — every node gets embedded for similarity search, synthesis pairing,
          dedup, and relevance scoring. A <strong>local embedding model performs well even on CPU</strong> and
          avoids per-call API costs that add up fast with thousands of nodes.
        </p>
        <p className="text-xs text-sky-600 dark:text-sky-400">
          Configure on the <Link to="/help/models" className="underline decoration-sky-300">Models page</Link> or set{' '}
          <code className="bg-sky-100 dark:bg-sky-900/50 px-1 rounded text-sky-700 dark:text-sky-300">EMBEDDING_MODEL</code> in{' '}
          <code className="bg-sky-100 dark:bg-sky-900/50 px-1 rounded text-sky-700 dark:text-sky-300">.env</code>.
          Popular choices: <code className="text-sky-700 dark:text-sky-300">nomic-embed-text</code>,{' '}
          <code className="text-sky-700 dark:text-sky-300">bge-m3</code>,{' '}
          <code className="text-sky-700 dark:text-sky-300">mxbai-embed-large</code>.
        </p>
      </div>

      {/* Step 2: Start the stack */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-3">Step 2: Start the Stack</h3>
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

      {/* Step 3: Configure models */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-3">Step 3: Register Models &amp; Assign Subsystems</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          Open the <Link to="/help/models" className="underline decoration-amber-300">Models page</Link> in the GUI.
          Register your LLM endpoints, then assign them to subsystems.
        </p>
        <ol className="text-xs text-amber-600 dark:text-amber-400 space-y-2 list-decimal list-inside">
          <li><strong>Register models</strong> — Add your local or cloud endpoints. Each model needs a name, base URL,
            model ID, and provider type. Test the connection to verify.</li>
          <li><strong>Assign embedding</strong> — Assign your embedding model to the <code className="text-amber-700 dark:text-amber-300">embedding</code> subsystem.
            Without this, nodes can't be embedded and synthesis can't find pairs.</li>
          <li><strong>Assign synthesis</strong> — Assign an LLM to the <code className="text-amber-700 dark:text-amber-300">synthesis</code> subsystem.
            This is the model that produces insights from node pairs.</li>
          <li><strong>Assign more (optional)</strong> — Assign models to <code className="text-amber-700 dark:text-amber-300">voice</code>,{' '}
            <code className="text-amber-700 dark:text-amber-300">research</code>,{' '}
            <code className="text-amber-700 dark:text-amber-300">chat</code>, and others as needed.
            The sweet spot: small local models for high-volume subsystems (autorating, keywords, domain classification),
            frontier or medium cloud models for quality-sensitive tasks (synthesis, voicing, research, chat).</li>
        </ol>
      </div>

      {/* Step 4: Seed & Run */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-3">Step 4: Seed Knowledge &amp; Run Synthesis</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          With models assigned, you're ready to feed the graph and let Podbit think.
        </p>
        <ol className="text-xs text-emerald-600 dark:text-emerald-400 space-y-2 list-decimal list-inside">
          <li><strong>Add initial seeds</strong> — Use the GUI Chat, the Graph page, or{' '}
            <Link to="/help/kb" className="underline decoration-emerald-300">Knowledge Base</Link> folder
            ingestion to add your starting material. 10-20 seeds in a domain is enough to begin.</li>
          <li><strong>Start the synthesis engine</strong> — On the Dashboard, switch to <strong>API mode</strong> and
            click Start. The engine begins discovering connections between your seeds autonomously.</li>
          <li><strong>Enable autonomous cycles</strong> — Toggle on voicing, research, questions, tensions,
            validation, and autorating cycles as desired. Each runs independently on its own interval.</li>
          <li><strong>Watch the activity feed</strong> — The Dashboard shows real-time events as cycles run.
            You'll see pairings, rejections, new nodes, and quality gate decisions.</li>
          <li><strong>Review and curate</strong> — Browse the Graph page to see what the engine produced.
            Rate nodes, promote breakthroughs, remove junk, and add more seeds to guide the research.</li>
        </ol>
      </div>

      {/* Optional: Data APIs for verification */}
      <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
        <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">Optional: Data APIs for Confirmation &amp; Enrichment</h3>
        <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-2">
          These are <strong>not LLMs</strong> — they are external data services that provide factual confirmation
          and enrichment. The <Link to="/help/api-registry" className="underline decoration-cyan-300">API Registry</Link> lets
          you register sources like Wikimedia, PubChem, financial feeds, weather services, and other domain-specific databases.
          The lab verification cycle calls these APIs to ground synthesized claims in real data, and the enrichment
          pipeline extracts facts from API responses into new graph nodes.
        </p>
        <p className="text-xs text-cyan-500 dark:text-cyan-400">
          Entirely optional — Podbit works fine without external APIs. But when your research touches
          domains with authoritative data sources, these integrations add a reality-check dimension
          that pure LLM reasoning can't provide.
        </p>
      </div>

      {/* Integration surfaces */}
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
          <p className="text-xs text-orange-500 dark:text-orange-400 mt-2">
            See <Link to="/help/proxy" className="underline decoration-orange-300">Knowledge Proxy</Link> for full reference.
          </p>
        </div>

        {/* MCP */}
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">MCP Agent</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
            AI agents (Claude Code, Cursor, Windsurf, etc.) can interact with the graph via the Model Context
            Protocol. The MCP server provides 30+ tools for querying, proposing, compressing, and managing
            the knowledge graph programmatically.
          </p>
          <pre className="text-xs text-purple-600 dark:text-purple-400 overflow-x-auto bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-800"><code>{`{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "/path/to/podbit/mcp-stdio.ts"]
    }
  }
}`}</code></pre>
          <p className="text-xs text-purple-500 dark:text-purple-400 mt-2">
            See <Link to="/help/tools" className="underline decoration-purple-300">MCP Tools</Link> for the full tool reference.
          </p>
        </div>

        {/* REST API */}
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">REST API</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            The same API that powers the GUI is available for scripts, automation, and custom integrations.
            Every GUI action maps to a REST endpoint.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            See <Link to="/help/architecture" className="underline">Architecture</Link> for endpoint documentation.
          </p>
        </div>
      </div>

      {/* Model assignment detail */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Subsystem Model Assignments</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Each subsystem can use a different model with independent inference parameters
          (temperature, top_p, min_p, top_k, repeat_penalty). The recommended mix: small local models
          for high-volume subsystems, frontier/medium cloud models for quality and speed on the tasks
          that matter most. A built-in <strong>budgeting system</strong> tracks and caps cloud API spend
          so costs stay predictable — see the <Link to="/help/costs" className="underline">Costs</Link> page.
        </p>
        <div className="grid grid-cols-4 gap-2 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">synthesis</p>
            <p className="text-gray-500 dark:text-gray-400">Main synthesis LLM</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">voice</p>
            <p className="text-gray-500 dark:text-gray-400">Voicing cycle LLM</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">research</p>
            <p className="text-gray-500 dark:text-gray-400">Domain research</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">chat</p>
            <p className="text-gray-500 dark:text-gray-400">GUI Chat LLM</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">embedding</p>
            <p className="text-gray-500 dark:text-gray-400">Vector embeddings</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">autorating</p>
            <p className="text-gray-500 dark:text-gray-400">Quality scoring</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">spec_extraction</p>
            <p className="text-gray-500 dark:text-gray-400">Experiment spec extraction</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">spec_review</p>
            <p className="text-gray-500 dark:text-gray-400">Falsifiability check</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">+ 17 more</p>
            <p className="text-gray-500 dark:text-gray-400">See <Link to="/help/models" className="underline">Models</Link></p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Use <strong>Auto-Tune</strong> on the Models page to automatically find optimal inference parameters
          for each subsystem. See <Link to="/help/tuning" className="underline">Auto-Tune &amp; Gold Standards</Link>.
        </p>
      </div>
    </div>
  );
}

export default GettingStartedSection;
