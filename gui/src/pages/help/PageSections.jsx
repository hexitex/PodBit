/** Dashboard help: overview and quick links. */
function DashboardSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Dashboard</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Dashboard is the system home screen. It provides a real-time overview of graph health,
          synthesis engine status, context engine metrics, model connectivity, and a live activity feed
          showing every event as it happens.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Stat Cards</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
          Four cards at the top show headline metrics: <strong>Total Nodes</strong>, <strong>Breakthroughs</strong>,
          <strong> Avg Weight</strong>, and <strong>Avg Specificity</strong>. These refresh automatically.
        </p>
      </div>

      {/* Activity Feed */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Activity Feed</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
          A real-time event stream powered by <strong>Server-Sent Events (SSE)</strong>. The feed connects to
          <code className="mx-1 text-amber-700 dark:text-amber-300">/api/activity/stream</code> and receives events as they happen  -
          no polling, no refresh needed.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-purple-600 dark:text-purple-400">synthesis</p>
            <p className="text-amber-500 dark:text-amber-400">Synthesis cycles, node creation, similarity checks, quality gates</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-orange-600 dark:text-orange-400">proxy</p>
            <p className="text-amber-500 dark:text-amber-400">Knowledge proxy requests, enrichment, model routing</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-blue-600 dark:text-blue-400">mcp</p>
            <p className="text-amber-500 dark:text-amber-400">MCP tool calls from LLM IDE agent or other agents</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-emerald-600 dark:text-emerald-400">kb</p>
            <p className="text-amber-500 dark:text-amber-400">Knowledge Base file scans, ingestion, errors</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-pink-600 dark:text-pink-400">voicing</p>
            <p className="text-amber-500 dark:text-amber-400">LLM synthesis voicing outputs and scoring</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-yellow-600 dark:text-yellow-400">config</p>
            <p className="text-amber-500 dark:text-amber-400">Configuration changes, auto-tune events</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-gray-600 dark:text-gray-400">system</p>
            <p className="text-amber-500 dark:text-amber-400">Startup, shutdown, warnings, errors</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-cyan-600 dark:text-cyan-400">llm</p>
            <p className="text-amber-500 dark:text-amber-400">Raw LLM API calls, tokens, latency</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-yellow-600 dark:text-yellow-500">elite</p>
            <p className="text-amber-500 dark:text-amber-400">Elite pool promotions, manifest mapping, bridging attempts</p>
          </div>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          <strong>Controls:</strong> Category filter toggles (click to show/hide), pause/resume streaming,
          clear buffer. Click any event row to expand its detail payload. Events with similarity scores
          show an inline gauge bar. The feed auto-reconnects if the connection drops.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          <strong>Cross-process:</strong> MCP tool calls from the stdio process are forwarded to the HTTP
          server's event bus via an internal POST endpoint, so they appear in the same unified feed.
        </p>
      </div>

      {/* Panels Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Synthesis Engine Control</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            Start/stop the synthesis engine. Toggle between <strong>API mode</strong> (LLM voices directly)
            and <strong>MCP mode</strong> (queues discoveries for LLM IDE agent). Shows cycle count, pending
            discoveries, current run status, and the active <strong>pipeline mode</strong> (heuristic or consultant).
          </p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Context Engine Panel</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Active sessions, total turns, saved insights. Token budget allocation chart
            (knowledge/history/system/response). Per-turn quality scores and top topics across sessions.
          </p>
        </div>
        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Synthesis Stats & Pipeline</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400">
            Compact Sankey flow diagram shows synthesis gate flow with failures branching off.
            Adapts to the active <strong>pipeline mode</strong> — heuristic (10 gates) or consultant (9 gates).
            Link widths proportional to event counts. Born/rejected summary counts.
            Click &quot;Full View&quot; for the interactive Pipeline page with detail panels.
          </p>
        </div>
        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
          <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Feedback & Health</h3>
          <p className="text-xs text-orange-600 dark:text-orange-400">
            Feedback stats: total ratings, quality %, breakdown by source (human/agent/auto).
            Model health: provider online/offline status. Cost tracking: LLM calls, embedding calls,
            estimated cost. Service panel: start/stop orchestrator process.
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Graph Health</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Node lifecycle metabolism: counts per state (nascent, active, declining, composted), fertility rate,
            average generation depth, birth/compost rates. Phase distribution bar. Transient visitor status
            with state badges, cycle counts, and barren tracking.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Chat help: tool calling and slash commands. */
function ChatSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Chat Interface</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Chat page provides a multi-turn conversation interface with automatic <strong>knowledge injection</strong>
          from the graph. Each conversation is persisted and can be resumed later. A sidebar shows the
          context engine's decisions  - which knowledge nodes were injected and why.
        </p>
      </div>

      {/* Conversations */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Conversations</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400">
          The left sidebar lists all conversations with message count and last-updated time. Click to switch,
          or start a new chat. Conversations persist across sessions. Delete with confirmation.
        </p>
      </div>

      {/* Knowledge Injection */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Knowledge Injection</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
          Every message passes through the <strong>context engine</strong> before reaching the LLM. The engine
          selects relevant knowledge nodes, builds a system prompt, and manages token budgets. The right sidebar
          (Context Panel) shows:
        </p>
        <ul className="text-xs text-emerald-600 dark:text-emerald-400 list-disc list-inside space-y-1">
          <li><strong>Detected topics</strong>  - with weight scores showing how strongly each topic was identified</li>
          <li><strong>Identified domains</strong>  - which knowledge domains were activated</li>
          <li><strong>Injected nodes</strong>  - each node's domain, content preview, and relevance score</li>
          <li><strong>Token budget</strong>  - allocation breakdown (knowledge, history, response)</li>
        </ul>
      </div>

      {/* Modes & Commands */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Modes & Commands</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
          <strong>Mode chips</strong> above the input let you quickly switch context:
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs mb-2">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Research</p>
            <p className="text-purple-500 dark:text-purple-400">Ask knowledge questions</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Seed</p>
            <p className="text-purple-500 dark:text-purple-400">Paste text to add to graph</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Summarize</p>
            <p className="text-purple-500 dark:text-purple-400">Get domain summary</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Compress</p>
            <p className="text-purple-500 dark:text-purple-400">Dense meta-prompt output</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Connections</p>
            <p className="text-purple-500 dark:text-purple-400">Find cross-domain links</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Tensions</p>
            <p className="text-purple-500 dark:text-purple-400">Find contradictions</p>
          </div>
        </div>
        <p className="text-xs text-purple-600 dark:text-purple-400">
          <strong>Slash commands:</strong> Type <code className="text-purple-700 dark:text-purple-300">/</code> for autocomplete  -
          /stats, /synthesis, /research, /seed, /voice, /tensions, /summarize, /compress, /templates, /dedup.
        </p>
      </div>

      {/* Scope */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Domain Scoping</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400">
          The <strong>scope selector</strong> lets you filter knowledge injection by partition and specific domains.
          When scoped, only knowledge from the selected domains is injected into the conversation. The domain
          count badge shows how many domains are active. Follow-up suggestions are generated contextually
          after each response.
        </p>
      </div>
    </div>
  );
}

/** Breakthroughs help: validation and promotion. */
function BreakthroughsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Breakthroughs</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Breakthroughs are <strong>validated discoveries</strong>  - nodes that have been promoted after
          scoring well on synthesis quality, novelty, testability, and tension resolution. They represent
          the most significant insights in the knowledge graph.
        </p>
      </div>

      {/* Lifecycle */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Breakthrough Lifecycle</h3>
        <ol className="text-xs text-amber-600 dark:text-amber-400 list-decimal list-inside space-y-1">
          <li>A node is created through synthesis, seeding, or voicing</li>
          <li>The <strong>validation cycle</strong> (autonomous) or a human identifies it as significant</li>
          <li>Promising nodes may be marked as <strong>possible</strong> (pre-breakthrough candidate, weight 1.0)</li>
          <li>Validation scores are computed across 4 dimensions (each 0-10)</li>
          <li>If the composite score meets the threshold, the node is <strong>promoted to breakthrough</strong> (weight → 1.5)</li>
          <li>Breakthrough parents gain +0.15, grandparents +0.05  - rewarding productive lineages</li>
        </ol>
      </div>

      {/* Scoring */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Validation Scores</h3>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Synthesis (0-10)</p>
            <p className="text-purple-500 dark:text-purple-400">How well the insight combines its source ideas into something coherent</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Novelty (0-10)</p>
            <p className="text-purple-500 dark:text-purple-400">How much new understanding the insight adds beyond its sources</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Testability (0-10)</p>
            <p className="text-purple-500 dark:text-purple-400">Whether the insight makes a specific, verifiable claim</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Tension Resolution (0-10)</p>
            <p className="text-purple-500 dark:text-purple-400">How effectively it resolves a contradiction between its source nodes</p>
          </div>
        </div>
        <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
          Score quality is color-coded: <span className="text-green-600 font-medium">green (&ge;7)</span>,
          <span className="text-yellow-600 font-medium ml-1">yellow (&ge;5)</span>,
          <span className="text-red-600 font-medium ml-1">red (&lt;5)</span>.
        </p>
      </div>

      {/* Page Features */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Page Features</h3>
        <ul className="text-xs text-sky-600 dark:text-sky-400 list-disc list-inside space-y-1">
          <li><strong>Stat cards</strong>  - total breakthroughs, recent (30d), average composite score, manual vs autonomous count</li>
          <li><strong>Timeline chart</strong>  - bar chart of breakthroughs over time</li>
          <li><strong>Breakdown tables</strong>  - by project and by domain with counts and average scores</li>
          <li><strong>Filters</strong>  - by project, domain, promotion source (manual/autonomous), sort by date or score</li>
          <li><strong>Expandable cards</strong>  - each breakthrough shows its content, domain, scores, and source nodes</li>
        </ul>
      </div>
    </div>
  );
}

/** Prompts help: override and gold standards. */
function PromptsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Prompts</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Prompts page lets you view and customize every system prompt used by Podbit. Each subsystem
          (voicing, chat, compression, research, etc.) uses a named prompt template with variable placeholders.
          Overrides are stored in the database and persist across restarts.
        </p>
      </div>

      {/* How It Works */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">How Prompts Work</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
          Prompts are defined in code with sensible defaults. When a subsystem needs a prompt, it first
          checks for a database override, then falls back to the default. This means you can customize
          any prompt without touching code, and revert to defaults at any time.
        </p>
        <p className="text-xs text-sky-600 dark:text-sky-400">
          <strong>Variables</strong> like <code className="text-sky-700 dark:text-sky-300">{'{{content}}'}</code> and
          <code className="text-sky-700 dark:text-sky-300 ml-1">{'{{domain}}'}</code> are interpolated at runtime.
          The variables panel on each prompt shows which placeholders are available.
        </p>
      </div>

      {/* Categories */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Prompt Categories</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            ['system', 'Global system prompts'],
            ['core', 'Synthesis voicing & insight generation'],
            ['context', 'Context engine formatting & compression'],
            ['knowledge', 'Summarize, compress, domain digests'],
            ['docs', 'Document outline, section generation & escalation'],
            ['chat', 'Chat interface & auto-tune test prompts'],
            ['project', 'Interview-based project creation (start & follow-up)'],
            ['kb', 'KB curation & decomposition prompts (code, data, decompose, filter)'],
            ['evm', 'Lab verification spec extraction, falsifiability review & evaluation'],
          ].map(([cat, desc]) => (
            <div key={cat} className="bg-white dark:bg-gray-900 rounded p-2 border border-purple-100 dark:border-purple-700">
              <p className="font-medium text-purple-700 dark:text-purple-300">{cat}</p>
              <p className="text-purple-500 dark:text-purple-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Actions</h3>
        <ul className="text-xs text-emerald-600 dark:text-emerald-400 list-disc list-inside space-y-1">
          <li><strong>Search</strong>  - filter prompts by ID or description text</li>
          <li><strong>Category filter</strong>  - show only prompts in a specific category</li>
          <li><strong>Edit</strong>  - expand any prompt to view and modify its full text</li>
          <li><strong>Save Override</strong>  - persist your changes to the database</li>
          <li><strong>Revert to Default</strong>  - remove the override and restore the original prompt</li>
          <li><strong>Preview</strong>  - see the rendered prompt with variable placeholders highlighted</li>
        </ul>
      </div>
    </div>
  );
}

function DataSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Data Management</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Data page manages projects, partitions, number variables, journal rollback, and database operations.
        </p>
      </div>

      {/* Projects */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Projects</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
          Each project is a separate knowledge graph stored as an independent SQLite database. Switch between
          projects to maintain isolated knowledge for different topics. A dedicated <strong>Projects</strong> page
          is also available in the sidebar for quick access.
        </p>
        <ul className="text-xs text-sky-600 dark:text-sky-400 list-disc list-inside space-y-1">
          <li><strong>Save / Save As</strong>  - persist the current project or create a copy with a new name</li>
          <li><strong>New Project</strong>  - create a fresh empty graph with domains, goals, and bridges (auto-backs up current project first)</li>
          <li><strong>Load</strong>  - switch to a different project (shows node count, domains, file size)</li>
          <li><strong>Delete</strong>  - remove a saved project (with confirmation)</li>
        </ul>
      </div>

      {/* Interview-Based Creation */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Interview-Based Project Creation</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
          Instead of manually specifying domains and goals, you can use the <strong>interview flow</strong>  - a multi-turn
          LLM conversation that discovers your project's purpose, domains, and goals through Q&A.
        </p>
        <ol className="text-xs text-amber-600 dark:text-amber-400 list-decimal list-inside space-y-1">
          <li>Start an interview via MCP (<code className="text-amber-700 dark:text-amber-300">podbit.projects interview</code>) or the GUI</li>
          <li>The LLM asks questions about what you're building, your domain areas, and research goals</li>
          <li>When it has enough context, it auto-generates a project manifest with purpose, domains, goals, and key questions</li>
          <li>The project is created with all the inferred structure, including partitions and bridges</li>
        </ol>
      </div>

      {/* Project Manifest */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Project Manifest</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
          Every project has a <strong>manifest</strong> stored in the settings table. The manifest provides project context
          to all LLM subsystems  - voicing, research cycles, question generation, and validation all read the manifest
          to stay on-topic and avoid domain name misinterpretation.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-orange-100 dark:border-orange-700">
            <p className="font-medium text-orange-700 dark:text-orange-300">purpose</p>
            <p className="text-orange-500 dark:text-orange-400">What this project is for  - one sentence that grounds all LLM reasoning</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-orange-100 dark:border-orange-700">
            <p className="font-medium text-orange-700 dark:text-orange-300">domains</p>
            <p className="text-orange-500 dark:text-orange-400">List of knowledge domains with descriptions  - prevents LLMs from misinterpreting domain names</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-orange-100 dark:border-orange-700">
            <p className="font-medium text-orange-700 dark:text-orange-300">goals</p>
            <p className="text-orange-500 dark:text-orange-400">What you want to learn or achieve  - focuses research and synthesis cycles</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-orange-100 dark:border-orange-700">
            <p className="font-medium text-orange-700 dark:text-orange-300">keyQuestions</p>
            <p className="text-orange-500 dark:text-orange-400">Open questions to investigate  - drives the question generation cycle</p>
          </div>
        </div>
        <p className="text-xs text-orange-500 dark:text-orange-400 mt-2">
          Update via MCP (<code className="text-orange-700 dark:text-orange-300">podbit.projects updateManifest</code>) or the GUI. Changes are cached with 1-minute TTL.
        </p>
      </div>

      {/* Partitions */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Partitions & Domains</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
          Domains are grouped into partitions. Nodes in different partitions <strong>cannot synthesize together</strong>
          unless the partitions are explicitly bridged. This prevents cross-contamination.
        </p>
        <ul className="text-xs text-purple-600 dark:text-purple-400 list-disc list-inside space-y-1">
          <li><strong>Create/edit partitions</strong>  - name, description, and domain list</li>
          <li><strong>Add/remove/rename domains</strong>  - manage domains within a partition</li>
          <li><strong>Bridges</strong>  - create connections between partitions to allow cross-synthesis</li>
          <li><strong>Export/Import</strong>  - share partitions as .podbit.json files between instances</li>
          <li><strong>System partitions</strong>  - marked as <code className="text-purple-700 dark:text-purple-300">system=1</code>, synthesize internally only, cannot be bridged (e.g., know-thyself for config tuning knowledge)</li>
        </ul>
      </div>

      {/* Number Variables */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h3 className="font-semibold text-blue-700 dark:text-blue-300 text-sm mb-2">Number Variables</h3>
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
          The number variable system prevents the synthesis engine from universalizing domain-specific numbers.
          When a node is created, every number in its content is extracted, stored in a registry, and replaced
          with a <code className="text-blue-700 dark:text-blue-300">[[[PREFIX+nnn]]]</code> variable reference
          (e.g., <code className="text-blue-700 dark:text-blue-300">[[[SBKR42]]]</code>).
        </p>

        <h4 className="font-medium text-blue-700 dark:text-blue-300 text-xs mt-3 mb-1">How LLMs Receive Variables</h4>
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
          There are two paths depending on the LLM task:
        </p>
        <div className="grid grid-cols-1 gap-2 text-xs mb-3">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-blue-100 dark:border-blue-700">
            <p className="font-medium text-blue-700 dark:text-blue-300">Voicing / Synthesis</p>
            <p className="text-blue-500 dark:text-blue-400">
              The voicing prompt keeps variable refs in the content and attaches a <strong>variable legend</strong> block
              explaining each ref  - e.g., <code className="text-blue-700 dark:text-blue-300">[[[SBKR42]]] = 0.85 (skincare: optimal pH range)</code>.
              This lets the LLM see domain context and produce output that preserves the refs rather than hardcoding numbers.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-blue-100 dark:border-blue-700">
            <p className="font-medium text-blue-700 dark:text-blue-300">All Other LLM Paths</p>
            <p className="text-blue-500 dark:text-blue-400">
              For tasks like compression, summarization, chat, research, and lab verification, variable refs are
              resolved back to actual numbers via <code className="text-blue-700 dark:text-blue-300">resolveContent()</code> before
              the content reaches the LLM. The LLM sees clean text with real numbers.
            </p>
          </div>
        </div>

        <h4 className="font-medium text-blue-700 dark:text-blue-300 text-xs mt-3 mb-1">Variable Registry</h4>
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
          Each variable is stored in the <code className="text-blue-700 dark:text-blue-300">number_registry</code> table with:
        </p>
        <ul className="text-xs text-blue-600 dark:text-blue-400 list-disc list-inside space-y-1 mb-2">
          <li><strong>var_id</strong>  - globally unique: 4-letter installation prefix + sequential counter (e.g., SBKR42)</li>
          <li><strong>value</strong>  - the extracted numeric value (e.g., "0.85")</li>
          <li><strong>scope_text</strong>  - context words around the number for human readability</li>
          <li><strong>domain</strong>  - which knowledge domain this number belongs to</li>
          <li><strong>source_node_id</strong>  - the node this number was extracted from</li>
        </ul>
        <p className="text-xs text-blue-600 dark:text-blue-400">
          The Data page shows all registered variables with search (by ID, value, or scope text), domain filtering,
          edit/delete, and a <strong>Backfill</strong> button to retroactively extract variables from existing nodes.
          Enable the feature in Algorithm Parameters &rarr; Number Variables.
        </p>
      </div>

      {/* Journal */}
      <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-lg p-4">
        <h3 className="font-semibold text-rose-700 dark:text-rose-300 text-sm mb-2">Journal &amp; Rollback</h3>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          Every structural change to the knowledge graph is automatically recorded by SQLite triggers into an undo journal.
          Unlike traditional database rollback which is all-or-nothing, Podbit's journaling is purpose-built for
          knowledge graphs — it lets you roll back to any point in time while <strong>selectively preserving</strong> valuable
          nodes. Pin a breakthrough and its entire parent ancestry is automatically exported, the rollback executes,
          and the pinned lineage is reimported with original timestamps intact. This means you can undo a bad KB
          ingestion or runaway synthesis cycle without losing genuine insights that emerged from it.
        </p>

        <h4 className="font-medium text-rose-700 dark:text-rose-300 text-xs mt-3 mb-1">What Gets Journaled</h4>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          <strong>Structural changes only</strong> &mdash; node creation, deletion, content edits, type changes, domain moves,
          archive/junk status, verification results, and lab status. Scoring metadata (weight, salience, barren cycles,
          lifecycle state) is <strong>not</strong> journaled because it is recalculated by the synthesis engine and would
          generate thousands of noise entries per cycle.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs mb-3">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-rose-100 dark:border-rose-700">
            <p className="font-medium text-rose-700 dark:text-rose-300">Journaled Tables</p>
            <p className="text-rose-500 dark:text-rose-400">nodes, edges, domain_partitions, partition_domains, partition_bridges, number_registry, node_number_refs</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-rose-100 dark:border-rose-700">
            <p className="font-medium text-rose-700 dark:text-rose-300">Not Journaled</p>
            <p className="text-rose-500 dark:text-rose-400">activity_log, resonance_cycles, lab_executions, knowledge_cache, config_history, chat sessions, feedback events</p>
          </div>
        </div>

        <h4 className="font-medium text-rose-700 dark:text-rose-300 text-xs mt-3 mb-1">Timeline View</h4>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          The Journal section on the Data page shows journal entries grouped into time buckets. Each bucket displays
          human-readable descriptions: &ldquo;3 nodes created in Optimization Algorithms&rdquo;, &ldquo;2 edges added&rdquo;, etc.
          Click a bucket to expand individual entries. The stats bar shows the journal&rsquo;s time range and entry counts by table.
        </p>

        <h4 className="font-medium text-rose-700 dark:text-rose-300 text-xs mt-3 mb-1">Rollback</h4>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          Hover any time bucket and click <strong>Restore</strong> to preview what would be undone. The preview shows:
        </p>
        <ul className="text-xs text-rose-600 dark:text-rose-400 list-disc list-inside space-y-1 mb-2">
          <li>How many nodes will be <strong>removed</strong> (created after the restore point)</li>
          <li>How many nodes will be <strong>reverted</strong> to their earlier state</li>
          <li>How many nodes will be <strong>re-created</strong> (if any were deleted after the restore point)</li>
          <li>Breakdown by table (nodes, edges, partitions, number variables)</li>
        </ul>

        <h4 className="font-medium text-rose-700 dark:text-rose-300 text-xs mt-3 mb-1">Pinning</h4>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          Before confirming a rollback, the system shows all <strong>pinnable nodes</strong> created after the restore point &mdash;
          voiced, synthesis, possible, elite, and breakthrough nodes that represent valuable derived knowledge.
          Seeds are not pinnable because they are automatically captured as ancestors of pinned nodes.
        </p>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          Check the nodes you want to keep, then click <strong>Pin &amp; Restore</strong>. The system exports pinned nodes
          plus their full parent ancestry chain, executes the rollback, then reimports the pinned package using
          <code className="mx-1 text-rose-700 dark:text-rose-300">INSERT OR IGNORE</code> with original IDs and timestamps.
          Pinned nodes retain their original <code className="text-rose-700 dark:text-rose-300">created_at</code> and
          <code className="text-rose-700 dark:text-rose-300">updated_at</code> &mdash; they are not given fresh dates.
        </p>

        <h4 className="font-medium text-rose-700 dark:text-rose-300 text-xs mt-3 mb-1">Clipping</h4>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          The <strong>Clip</strong> button lets you trim the journal from the oldest end. This is the only way journal
          entries are removed &mdash; there is no automatic retention policy. If you load a project that has been dormant for
          months, its journal is preserved intact until you manually clip it.
        </p>

        <h4 className="font-medium text-rose-700 dark:text-rose-300 text-xs mt-3 mb-1">MCP Tool</h4>
        <p className="text-xs text-rose-600 dark:text-rose-400">
          All journal operations are also available via the MCP tool <code className="text-rose-700 dark:text-rose-300">podbit.journal</code>
          with actions: <code className="text-rose-700 dark:text-rose-300">timeline</code>,
          <code className="text-rose-700 dark:text-rose-300">pin</code>,
          <code className="text-rose-700 dark:text-rose-300">preview</code>,
          <code className="text-rose-700 dark:text-rose-300">rollback</code>,
          <code className="text-rose-700 dark:text-rose-300">entries</code>,
          <code className="text-rose-700 dark:text-rose-300">prune</code>,
          <code className="text-rose-700 dark:text-rose-300">stats</code>.
        </p>
      </div>

      {/* Database */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Database Management</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
          Direct database operations for maintenance and cleanup:
        </p>
        <ul className="text-xs text-emerald-600 dark:text-emerald-400 list-disc list-inside space-y-1">
          <li><strong>Backup & Restore</strong>  - create named backups, view backup list with size/date, restore any backup</li>
          <li><strong>Stats</strong>  - node count by type (seed, synthesis, voiced, breakthrough, question, raw) and by domain</li>
          <li><strong>Targeted cleanup</strong>  - delete nodes by type or by domain, clear research jobs, patterns, cache, decision log</li>
          <li><strong>Delete Everything</strong>  - nuclear option that wipes all data (with confirmation)</li>
        </ul>
      </div>
    </div>
  );
}

/** Resonance help: graph browser and lineage. */
function ResonanceSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Graph Browser</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Graph Browser is the primary interface for exploring, filtering, and interacting with knowledge nodes.
          Switch between a filterable list view and an interactive force-directed graph visualization.
          Deep-link to any node via URL parameter.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">View Modes</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400">
            <strong>List view</strong> shows node cards with content preview, metadata badges, weight/salience bars, and action buttons.
            <strong> Graph view</strong> renders an interactive D3 force-directed domain graph with color-coded node types,
            partition grouping, and click-to-inspect.
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Filters</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            Text search, partition and domain tag selectors, node type, trajectory (knowledge/abstraction),
            sort order (weight, recent, salience), minimum weight slider, and minimum validation score filter.
          </p>
        </div>
      </div>

      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Node Detail Panel</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
          Click any node to open a detail panel with:
        </p>
        <ul className="text-xs text-emerald-600 dark:text-emerald-400 list-disc list-inside space-y-1">
          <li><strong>Content</strong> — full text with inline edit capability</li>
          <li><strong>Metadata grid</strong> — domain, type, weight, salience, trajectory, contributor, timestamps</li>
          <li><strong>Lineage</strong> — parent and child nodes with navigation breadcrumbs</li>
          <li><strong>Lab history</strong> — verification results (supported/disproved/error) with confidence scores</li>
          <li><strong>Feedback</strong> — rate as useful, meh, or bad with optional notes</li>
          <li><strong>Actions</strong> — promote, demote, archive, view family tree modal</li>
        </ul>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Deep Linking</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Append <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">?node=UUID</code> to the URL to
          deep-link directly to a specific node. The node detail panel opens automatically.
          Other pages link here when referencing graph nodes.
        </p>
      </div>
    </div>
  );
}

function VerificationSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Verification Results</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Verification page shows results from the lab verification system — claims are submitted to
          external lab servers for empirical testing, labs return raw data, and Podbit evaluates the results against spec criteria.
          Also displays API-based verification results when API enrichment is enabled.
        </p>
      </div>

      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Stat Cards</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400">
          Nine summary cards: total verified, supported, disproved, bad code, errors, skipped,
          pending review, queue size, and average confidence. Time range selector (7d/30d/90d) with auto-refresh every 30 seconds.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Outcome Filters</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            Filter pills: Needs Attention, All, In Queue, Supported, Disproved, Bad Code, Error, Skipped.
            Text search across node content and code. Confidence range slider. Test category breakdown bar chart.
          </p>
        </div>
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Queue & Review</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Live queue panel shows pending verifications with cancel buttons.
            Bulk review actions let you approve or reject multiple nodes at once.
            Nodes flagged for human review appear in the "Needs Attention" filter.
          </p>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Detail Modal</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Click any verification result to see: the experiment spec, raw lab data, evaluation reasoning,
          confidence score, and the original node content. Failed verifications show suggested guidance for retry.
        </p>
      </div>

      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">API Verification Sub-View</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400">
          Toggle the purple "API" pill to view API-based verifications separately. Shows mode badges
          (Verify/Enrich/Both), enrichment counts, impact assessment, and API-specific stat cards
          (validations, refutations, enrichments, corrections).
        </p>
      </div>
    </div>
  );
}

/** API Registry help: external API verification. */
function ApiRegistrySection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">API Registry</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The API Registry manages external APIs that lab verification can use to verify or enrich knowledge claims.
          Each API has configurable prompts for query generation, result interpretation, and data extraction,
          along with rate limiting and authentication settings.
        </p>
      </div>

      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">API Modes</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Verify</p>
            <p className="text-sky-500 dark:text-sky-400">Fact-check claims against API data. Adjusts node weight based on match/mismatch.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Enrich</p>
            <p className="text-sky-500 dark:text-sky-400">Extract new knowledge from API responses and create child nodes in the graph.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-amber-700 dark:text-amber-300">Both</p>
            <p className="text-sky-500 dark:text-sky-400">Verify the claim first, then extract any new knowledge from the response.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">API Cards</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Each registered API shows a card with mode badge, enable/disable toggle, base URL, rate limits,
            and call statistics. Expand to preview the query, interpret, and extract prompts.
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Actions</h3>
          <ul className="text-xs text-purple-600 dark:text-purple-400 list-disc list-inside space-y-1">
            <li><strong>Edit</strong> — full configuration modal (URL, auth, rate limits, prompts, scope)</li>
            <li><strong>Test</strong> — connectivity check or end-to-end claim test</li>
            <li><strong>Prompt History</strong> — version tracking for prompt changes</li>
            <li><strong>Delete</strong> — remove API with confirmation</li>
          </ul>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Onboarding Interview</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Click <strong>Onboard API</strong> to start an LLM-guided multi-turn conversation that discovers the API's
          capabilities, generates appropriate prompts, and creates the registry entry automatically.
          The interview asks about endpoints, authentication, response format, and domain scope.
        </p>
      </div>
    </div>
  );
}

/** Scaffold help: research briefs. */
function ScaffoldSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Create Docs</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Create Docs page generates structured documents — research briefs, knowledge syntheses, and
          technical reports — grounded in your knowledge graph. Documents are built section-by-section with
          graph knowledge injected into each part.
        </p>
      </div>

      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Generator Form</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400">
          Enter a request description, select a document type (Research Brief, Knowledge Synthesis, or Technical Report),
          optionally specify a knowledge query and domain/partition scope. The system decomposes the request into sections,
          then generates each section with relevant graph knowledge.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Job Sidebar</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            All generation jobs are persisted. The sidebar shows job history with status badges. Resume partial
            or failed jobs — the system picks up where it left off, regenerating only incomplete sections.
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Result Panel</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            View completed documents in three modes: rendered markdown, raw text, or section-by-section with
            progress indicators. Coherence issues are flagged. Download the finished document as <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">.md</code>.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Activity log help: event stream. */
function ActivityLogSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Activity Log</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Activity Log provides a searchable, filterable view of all system events — synthesis cycles,
          MCP tool calls, proxy requests, KB ingestion, lab verification, and more. Events are polled
          from the server and displayed with color-coded category badges.
        </p>
      </div>

      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Event Categories</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400">
          12 color-coded category badges: synthesis, voicing, proxy, mcp, kb, evm, elite, config, chat, system, llm, research.
          Click any badge to toggle that category. Text search filters across event content.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Time Range & Refresh</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Select time window: 6 hours, 24 hours, or 48 hours. Events auto-refresh periodically.
            Pagination for browsing older events within the selected range.
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Event Details</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            Click any event row to expand its detail modal. Smart formatting: ID fields in monospace,
            confidence values as progress bars, boolean values color-coded (green/red).
          </p>
        </div>
      </div>
    </div>
  );
}

/** Pipeline help: KB processing status. */
function PipelineSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Pipeline Visualization</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Pipeline page shows a D3 Sankey flow diagram of the synthesis pipeline. The main flow enters
          from the left and passes through each quality gate. At each gate, failures branch off to
          rejection reason nodes — the link width is proportional to event count, so the flow visually
          narrows as events are filtered. Click any gate or reason node to see full event detail below.
          The diagram adapts to the active <strong>pipeline mode</strong> — showing different gate sets
          for heuristic and consultant modes. A compact version appears on the Dashboard.
        </p>
      </div>

      {/* Pipeline Modes */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Heuristic Mode (10 Gates)</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
            All mechanical quality gates are shown as individual pipeline stages:
          </p>
          <ol className="text-xs text-sky-600 dark:text-sky-400 list-decimal list-inside space-y-0.5">
            <li>Resonance (cosine similarity band)</li>
            <li>Structural validation (vocabulary checks)</li>
            <li>Voicing (LLM synthesis)</li>
            <li>Claim provenance (grounding check)</li>
            <li>Counterfactual independence</li>
            <li>Redundancy ceiling (embedding math)</li>
            <li>Dedup (similarity + word overlap)</li>
            <li>Junk filter (known-bad cosine match)</li>
            <li>Specificity scoring</li>
            <li>Node creation</li>
          </ol>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Consultant Mode (9 Gates)</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Five meaning-judgment gates are replaced by a single LLM consultant call:
          </p>
          <ol className="text-xs text-amber-600 dark:text-amber-400 list-decimal list-inside space-y-0.5">
            <li>Resonance (cosine similarity band)</li>
            <li>Structural validation (vocabulary checks)</li>
            <li>Voicing (LLM synthesis)</li>
            <li><strong>Consultant</strong> (single LLM: coherence, grounding, novelty, specificity, forced analogy)</li>
            <li>Redundancy ceiling (embedding math)</li>
            <li>Dedup (similarity + word overlap)</li>
            <li>Junk filter (known-bad cosine match)</li>
            <li>Specificity scoring</li>
            <li>Node creation</li>
          </ol>
        </div>
      </div>

      {/* Sankey Flow Interaction */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Sankey Flow</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
          Gates appear as purple nodes along the main flow (left to right). Failures branch off as red
          nodes — one per rejection reason. Green links show pass flow, red links show failure flow.
          Click any node to open the detail panel:
        </p>
        <ul className="text-xs text-purple-600 dark:text-purple-400 list-disc list-inside space-y-0.5">
          <li><strong>Click gate node</strong> — shows all events at that gate with rejection breakdown</li>
          <li><strong>Click reason node</strong> — filters to events with that specific rejection reason</li>
          <li><strong>Filter tabs</strong> — All, Passed, or Failed events with event cards below</li>
        </ul>
      </div>

      {/* Event Detail */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Event Detail</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
          Event cards show all available fields from the synthesis engine. Click the expand chevron to reveal
          the full detail section. Fields shown conditionally based on what the gate provides:
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs text-emerald-600 dark:text-emerald-400">
          <div>
            <p className="font-semibold mb-0.5">Always visible:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Pass/fail indicator and message</li>
              <li>Model provenance (cyan chip)</li>
              <li>Domain chips (purple)</li>
              <li>Similarity score and node link</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold mb-0.5">Expanded detail:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>Parent node links (clickable)</li>
              <li>Similarity bar with threshold marker</li>
              <li>Quality scores (specificity, weight, fitness)</li>
              <li>Grounding ratio (progress bar)</li>
              <li>Counterfactual domain counts</li>
              <li>Redundancy metrics (max/centroid similarity)</li>
              <li>Consultant scores and reasoning text</li>
              <li>Hallucination sub-reasons</li>
              <li>Dedup/junk match node links</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Playback & Mode */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Playback & Mode</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          VCR-style playback controls below the tree let you scrub through the timeline.
          The tree updates to show only events up to the cursor position. Keyboard shortcuts:
          <strong> Space</strong> (play/pause), <strong>Arrows</strong> (step), <strong>L</strong> (go live).
        </p>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          A chip in the page header shows the current pipeline mode — <strong>amber</strong> for consultant,
          <strong> sky blue</strong> for heuristic. The mode is a per-project setting controlled from the
          Config page toggle.
        </p>
      </div>
    </div>
  );
}

export { DashboardSection, ChatSection, BreakthroughsSection, PromptsSection, DataSection, ResonanceSection, VerificationSection, ApiRegistrySection, ScaffoldSection, ActivityLogSection, PipelineSection };
