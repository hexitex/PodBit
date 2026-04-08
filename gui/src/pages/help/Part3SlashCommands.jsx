

/** Help section: Slash commands and MCP tool reference. */
function Part3SlashCommands() {
  const slashCommands = [
    { name: '/stats', desc: 'Graph statistics' },
    { name: '/synthesis', desc: 'Trigger synthesis' },
    { name: '/research', desc: 'Run research cycle' },
    { name: '/seed', desc: 'Add knowledge to graph' },
    { name: '/voice', desc: 'Voice a node pair' },
    { name: '/tensions', desc: 'Find contradictions' },
    { name: '/summarize', desc: 'Domain summary' },
    { name: '/compress', desc: 'Compressed meta-prompt' },
    { name: '/templates', desc: 'List document templates' },
    { name: '/dedup', desc: 'Find duplicates' },
  ];

  const toolGroups = [
    {
      name: 'Graph Operations',
      color: 'sky',
      tools: [
        { name: 'podbit.query', desc: 'Search nodes by text, domain, type, weight, salience' },
        { name: 'podbit.get', desc: 'Get a specific node by UUID' },
        { name: 'podbit.lineage', desc: 'Get parent/child relationships' },
        { name: 'podbit.propose', desc: 'Add new knowledge (seed, synthesis, breakthrough, question, raw)' },
        { name: 'podbit.edit', desc: 'Edit a node\'s content text and/or toggle brief exclusion' },
        { name: 'podbit.remove', desc: 'Archive or delete a node (junk, archive, hard)' },
        { name: 'podbit.promote', desc: 'Elevate to breakthrough with validation scores' },
        { name: 'podbit.voice', desc: 'Get voicing context for LLM synthesis' },
        { name: 'podbit.validate', desc: 'Get validation context for potential breakthroughs' },
        { name: 'podbit.dedup', desc: 'Find and archive duplicate nodes (dry-run supported)' },
        { name: 'podbit.stats', desc: 'Graph health statistics' },
      ],
    },
    {
      name: 'Knowledge Extraction',
      color: 'purple',
      tools: [
        { name: 'podbit.compress', desc: 'Generate compressed meta-prompt from graph knowledge (cached)' },
        { name: 'podbit.summarize', desc: 'Structured topic summary with key insights (cached)' },
        { name: 'podbit.tensions', desc: 'Find contradicting node pairs' },
        { name: 'podbit.patterns', desc: 'Cross-domain abstract pattern discovery' },
        { name: 'podbit.question', desc: 'Generate research questions from node pairs' },
      ],
    },
    {
      name: 'Context Engine',
      color: 'emerald',
      tools: [
        { name: 'podbit.context prepare', desc: 'Get enriched context with intent detection, dynamic budget' },
        { name: 'podbit.context update', desc: 'Track response, run feedback loop, compute quality metrics' },
        { name: 'podbit.context session', desc: 'Inspect session state, topics, clusters' },
        { name: 'podbit.context metrics', desc: 'Per-turn quality scores' },
        { name: 'podbit.context budgets', desc: 'View token budget configuration' },
        { name: 'podbit.context insights', desc: 'Cross-session learning insights' },
      ],
    },
    {
      name: 'Create Docs',
      color: 'amber',
      tools: [
        { name: 'docs.templates', desc: 'List available document templates' },
        { name: 'docs.decompose', desc: 'Break a request into structured outline' },
        { name: 'docs.generate', desc: 'Generate a complete document' },
      ],
    },
    {
      name: 'Synthesis Engine',
      color: 'red',
      tools: [
        { name: 'podbit.synthesis status', desc: 'Get engine state' },
        { name: 'podbit.synthesis start/stop', desc: 'Start or stop the engine (api or mcp mode)' },
        { name: 'podbit.synthesis discoveries', desc: 'Get pending resonating pairs from MCP mode' },
        { name: 'podbit.synthesis history', desc: 'Recent cycle results' },
        { name: 'podbit.synthesis cycle_start', desc: 'Start an autonomous cycle (synthesis, validation, questions, tensions, research, autorating, lab verification)' },
        { name: 'podbit.synthesis cycle_stop', desc: 'Stop a running cycle' },
        { name: 'podbit.synthesis cycle_status', desc: 'Get status of all cycles' },
      ],
    },
    {
      name: 'Config Tuning',
      color: 'gray',
      tools: [
        { name: 'podbit.config', desc: 'Read, tune, apply, snapshot, and audit algorithm parameters' },
      ],
    },
    {
      name: 'Domain Management',
      color: 'red',
      tools: [
        { name: 'podbit.partitions', desc: 'Create/manage domain partitions and bridges' },
      ],
    },
    {
      name: 'Feedback',
      color: 'emerald',
      tools: [
        { name: 'podbit.feedback', desc: 'Record feedback on node quality' },
      ],
    },
    {
      name: 'Knowledge Base',
      color: 'amber',
      tools: [
        { name: 'podbit.kb folders', desc: 'List watched folders' },
        { name: 'podbit.kb add/remove', desc: 'Manage folders' },
        { name: 'podbit.kb scan', desc: 'Trigger folder scan' },
        { name: 'podbit.kb files/file', desc: 'Browse files and chunks' },
        { name: 'podbit.kb reprocess/retry', desc: 'Re-read or retry failed' },
        { name: 'podbit.kb readers/stats', desc: 'Plugin list and statistics' },
      ],
    },
    {
      name: 'Lab Verification',
      color: 'red',
      tools: [
        { name: 'podbit.labVerify verify', desc: 'Extract spec, submit to lab, evaluate results' },
        { name: 'podbit.labVerify history', desc: 'Past verification results' },
        { name: 'podbit.labVerify stats', desc: 'Aggregate statistics' },
        { name: 'podbit.labVerify recent', desc: 'Recent executions with filters' },
        { name: 'podbit.labVerify analyse', desc: 'Post-rejection analysis' },
        { name: 'podbit.labVerify reviews', desc: 'Nodes awaiting human review' },
        { name: 'podbit.labVerify review', desc: 'Approve or reject' },
        { name: 'podbit.labVerify reevaluate', desc: 'Re-run evaluator on stored outputs' },
        { name: 'podbit.labVerify suggest', desc: 'Diagnose failure and suggest guidance' },
        { name: 'podbit.labVerify decompose', desc: 'Split broad claim into atomic facts' },
        { name: 'podbit.labVerify decompose_apply', desc: 'Create nodes from decomposition' },
        { name: 'podbit.labVerify enqueue', desc: 'Add to verification queue' },
        { name: 'podbit.labVerify queue', desc: 'List queue entries' },
        { name: 'podbit.labVerify cancel', desc: 'Cancel pending entry' },
        { name: 'podbit.labVerify queue_stats', desc: 'Queue statistics' },
      ],
    },
    {
      name: 'Elite Pool',
      color: 'amber',
      tools: [
        { name: 'podbit.elite stats', desc: 'Pool statistics' },
        { name: 'podbit.elite coverage', desc: 'Manifest coverage report' },
        { name: 'podbit.elite gaps', desc: 'Uncovered targets' },
        { name: 'podbit.elite candidates', desc: 'Bridging pair candidates' },
        { name: 'podbit.elite nodes', desc: 'Query elite nodes' },
        { name: 'podbit.elite terminals', desc: 'Terminal findings' },
        { name: 'podbit.elite rescan', desc: 'Trigger backfill scan' },
        { name: 'podbit.elite demote', desc: 'Demote elite node' },
      ],
    },
    {
      name: 'Project Management',
      color: 'purple',
      tools: [
        { name: 'podbit.projects list', desc: 'List all projects' },
        { name: 'podbit.projects current', desc: 'Get active project' },
        { name: 'podbit.projects new', desc: 'Create new project' },
        { name: 'podbit.projects load/save', desc: 'Switch or save' },
        { name: 'podbit.projects ensure', desc: 'Auto-detect from working directory' },
        { name: 'podbit.projects interview', desc: 'LLM-conducted interview' },
        { name: 'podbit.projects manifest', desc: 'Read manifest' },
        { name: 'podbit.projects updateManifest', desc: 'Update manifest' },
      ],
    },
    {
      name: 'Governance',
      color: 'gray',
      tools: [
        { name: 'podbit.pending', desc: 'Get queued requests from GUI' },
        { name: 'podbit.complete', desc: 'Mark request as done' },
      ],
    },
  ];

  const colorMap = {
    sky: { bg: 'bg-sky-50 dark:bg-sky-900/30', border: 'border-sky-200 dark:border-sky-700', title: 'text-sky-700 dark:text-sky-300', code: 'text-sky-800 dark:text-sky-300', desc: 'text-sky-600 dark:text-sky-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/30', border: 'border-purple-200 dark:border-purple-700', title: 'text-purple-700 dark:text-purple-300', code: 'text-purple-800 dark:text-purple-300', desc: 'text-purple-600 dark:text-purple-400' },
    emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-700', title: 'text-emerald-700 dark:text-emerald-300', code: 'text-emerald-800 dark:text-emerald-300', desc: 'text-emerald-600 dark:text-emerald-400' },
    amber: { bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-700', title: 'text-amber-700 dark:text-amber-300', code: 'text-amber-800 dark:text-amber-300', desc: 'text-amber-600 dark:text-amber-400' },
    red: { bg: 'bg-red-50 dark:bg-red-900/30', border: 'border-red-200 dark:border-red-700', title: 'text-red-700 dark:text-red-300', code: 'text-red-800 dark:text-red-300', desc: 'text-red-600 dark:text-red-400' },
    gray: { bg: 'bg-gray-50 dark:bg-gray-800', border: 'border-gray-200 dark:border-gray-700', title: 'text-gray-700 dark:text-gray-300', code: 'text-gray-800 dark:text-gray-300', desc: 'text-gray-600 dark:text-gray-400' },
  };

  return (
    <div className="space-y-6">
      {/* Introduction */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Tools & Slash Commands</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit&apos;s GUI Chat supports slash commands for quick actions. For IDE agents, Podbit also
          exposes 80+ tools via the Model Context Protocol (MCP). This is the complete reference.
        </p>
      </div>

      {/* Chat Slash Commands */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Chat Slash Commands</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Type <code className="text-xs font-mono bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">/</code> in
          the <span className="docs-link-internal cursor-pointer text-blue-600 dark:text-blue-400 hover:underline" data-doc="chat">chat input</span> for
          autocomplete. Available commands:
        </p>
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-2">
            {slashCommands.map(cmd => (
              <div key={cmd.name} className="flex gap-3 items-baseline">
                <code className="text-xs font-mono font-semibold text-indigo-700 dark:text-indigo-300 whitespace-nowrap">{cmd.name}</code>
                <span className="text-xs text-gray-600 dark:text-gray-400">{cmd.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MCP Tool Reference */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">MCP Tool Reference (IDE Agents)</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          If you use Podbit from an IDE agent (Claude Code, Cursor, Windsurf, etc.), these are the tools
          available via the MCP server. Most users interact through the GUI — this section is for
          agent-based workflows.
        </p>

        <div className="space-y-4">
          {toolGroups.map(group => {
            const c = colorMap[group.color];
            return (
              <div key={group.name} className={`${c.bg} border ${c.border} rounded-lg p-4`}>
                <h4 className={`font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200 ${c.title}`}>{group.name}</h4>
                <div className="space-y-2">
                  {group.tools.map(tool => (
                    <div key={tool.name} className="flex gap-3 items-baseline">
                      <code className={`text-xs font-mono font-semibold ${c.code} whitespace-nowrap`}>{tool.name}</code>
                      <span className={`text-xs ${c.desc}`}>{tool.desc}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MCP Cycle Management */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">MCP Cycle Management</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          The <span className="docs-link-internal cursor-pointer text-blue-600 dark:text-blue-400 hover:underline" data-doc="synthesis">synthesis engine</span> supports
          individual cycle control through MCP tools:
        </p>
        <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
          <div>
            <code className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">cycle_start</code>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Start individual cycles: synthesis, validation, questions, tensions, research, autorating, lab verification.
              Each runs independently with its own interval and concurrency.
            </p>
          </div>
          <div>
            <code className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">cycle_stop</code>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Stop a running cycle without affecting others. The cycle completes its current iteration before stopping.
            </p>
          </div>
          <div>
            <code className="text-xs font-mono font-semibold text-gray-800 dark:text-gray-200">cycle_status</code>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              Get status of all cycles: running state, iteration count, last run time, errors.
            </p>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">MCP Mode Workflow</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              In MCP mode, the engine discovers resonating pairs and queues them for the IDE agent.
              The agent retrieves discoveries, voices them into new insights, and proposes results
              back to the graph. This keeps synthesis under agent control rather than fully autonomous.
            </p>
          </div>
        </div>
      </div>

      {/* Create Docs Page */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Create Docs Page</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          The Create Docs page (GUI sidebar) generates structured documents — research briefs, knowledge syntheses,
          and technical reports — grounded in your knowledge graph.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-3">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Generator Form</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              Enter a request description, select a document type (Research Brief, Knowledge Synthesis, Technical Report),
              optionally specify a knowledge query and domain scope. The system decomposes the request into sections,
              then generates each with relevant graph knowledge.
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-3">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Job Sidebar</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              All generation jobs are persisted. The sidebar shows job history with status badges. Resume partial
              or failed jobs — the system picks up where it left off, regenerating only incomplete sections.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-3">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Result Panel</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              View completed documents as rendered markdown, raw text, or section-by-section with progress indicators.
              Coherence issues are flagged. Download as <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">.md</code>.
            </p>
          </div>
        </div>
      </div>

      {/* MCP Configuration */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">MCP Configuration</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Add Podbit to your IDE&apos;s MCP configuration:
        </p>
        <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
          <pre className="text-xs font-mono text-green-400 whitespace-pre">{`{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "/path/to/podbit/mcp-stdio.ts"]
    }
  }
}`}</pre>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
          Replace <code className="font-mono">/path/to/podbit/</code> with the absolute path to your Podbit installation.
          The MCP server communicates over stdio and is compatible with VS Code, Cursor, Windsurf, and other MCP clients.
        </p>
      </div>
    </div>
  );
}

export default Part3SlashCommands;
