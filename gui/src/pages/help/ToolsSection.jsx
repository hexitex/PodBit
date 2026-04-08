

/** Help section: MCP tools and API overview. */
function ToolsSection() {
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
        { name: 'podbit.dedup', desc: 'Find and archive duplicate nodes (dry-run supported, parent-child pairs auto-excluded)' },
        { name: 'podbit.stats', desc: 'Graph health statistics' },
      ],
    },
    {
      name: 'Knowledge Extraction',
      color: 'purple',
      tools: [
        { name: 'podbit.compress', desc: 'Generate compressed meta-prompt from graph knowledge (cached)' },
        { name: 'podbit.summarize', desc: 'Structured topic summary with key insights (cached)' },
        { name: 'podbit.tensions', desc: 'Find contradicting node pairs (high similarity, opposing claims)' },
        { name: 'podbit.patterns', desc: 'Cross-domain abstract pattern discovery' },
        { name: 'podbit.question', desc: 'Generate research questions from node pairs' },
      ],
    },
    {
      name: 'Context Engine',
      color: 'emerald',
      tools: [
        { name: 'podbit.context prepare', desc: 'Get enriched context with intent detection, dynamic budget, model-aware formatting' },
        { name: 'podbit.context update', desc: 'Track response, run feedback loop, compute quality metrics' },
        { name: 'podbit.context session', desc: 'Inspect session state, topics, clusters, and feedback data' },
        { name: 'podbit.context metrics', desc: 'Per-turn quality scores: utilization, grounding, coverage, efficiency' },
        { name: 'podbit.context budgets', desc: 'View current token budget configuration and allocation' },
        { name: 'podbit.context insights', desc: 'View cross-session learning insights persisted from past sessions' },
      ],
    },
    {
      name: 'Create Docs',
      color: 'amber',
      tools: [
        { name: 'docs.templates', desc: 'List available document templates' },
        { name: 'docs.decompose', desc: 'Break a request into structured document outline' },
        { name: 'docs.generate', desc: 'Generate a complete document (research brief, knowledge synthesis, or technical report)' },
      ],
    },
    {
      name: 'Synthesis Engine',
      color: 'red',
      tools: [
        { name: 'podbit.synthesis status', desc: 'Get engine state (running, mode, cycle count)' },
        { name: 'podbit.synthesis start/stop', desc: 'Start or stop the synthesis engine (api or mcp mode)' },
        { name: 'podbit.synthesis discoveries', desc: 'Get pending resonating pairs from MCP mode' },
        { name: 'podbit.synthesis history', desc: 'Recent synthesis cycle results' },
        { name: 'podbit.synthesis cycle_start', desc: 'Start an autonomous cycle (synthesis, validation, questions, tensions, research, autorating, lab verification)' },
        { name: 'podbit.synthesis cycle_stop', desc: 'Stop a running autonomous cycle' },
        { name: 'podbit.synthesis cycle_status', desc: 'Get status of all autonomous cycles' },
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
        { name: 'podbit.feedback', desc: 'Record human or agent feedback on node quality (useful, not useful, harmful)' },
      ],
    },
    {
      name: 'Knowledge Base',
      color: 'amber',
      tools: [
        { name: 'podbit.kb folders', desc: 'List watched folders' },
        { name: 'podbit.kb add/remove', desc: 'Add or remove a folder from ingestion' },
        { name: 'podbit.kb scan', desc: 'Trigger a folder scan (discovers and processes files)' },
        { name: 'podbit.kb files/file', desc: 'Browse ingested files, view chunks and metadata' },
        { name: 'podbit.kb reprocess/retry', desc: 'Re-read a file or retry all failed files' },
        { name: 'podbit.kb readers/stats', desc: 'List available reader plugins and ingestion statistics' },
      ],
    },
    {
      name: 'Lab Verification',
      color: 'red',
      tools: [
        { name: 'podbit.labVerify verify', desc: 'Extract spec, submit to lab server, evaluate results, adjust weight' },
        { name: 'podbit.labVerify history', desc: 'Get past verification results for a node' },
        { name: 'podbit.labVerify stats', desc: 'Aggregate verification statistics (verified/failed/error counts, avg confidence)' },
        { name: 'podbit.labVerify recent', desc: 'List recent executions across all nodes with filters' },
        { name: 'podbit.labVerify analyse', desc: 'Run post-rejection analysis on a failed verification' },
        { name: 'podbit.labVerify reviews', desc: 'Get nodes awaiting human review' },
        { name: 'podbit.labVerify review', desc: 'Approve or reject a reviewed node' },
        { name: 'podbit.labVerify reevaluate', desc: 'Re-run evaluator on stored outputs (fix verdicts without re-running experiment)' },
        { name: 'podbit.labVerify suggest', desc: 'LLM diagnoses a failed verification and suggests guidance for retry' },
        { name: 'podbit.labVerify decompose', desc: 'Split a broad claim into atomic facts and research questions' },
        { name: 'podbit.labVerify decompose_apply', desc: 'Create nodes from a reviewed decomposition' },
        { name: 'podbit.labVerify enqueue', desc: 'Add node(s) to persistent verification queue' },
        { name: 'podbit.labVerify queue', desc: 'List queue entries with filters' },
        { name: 'podbit.labVerify cancel', desc: 'Cancel pending queue entry' },
        { name: 'podbit.labVerify queue_stats', desc: 'Queue statistics by status' },
      ],
    },
    {
      name: 'Elite Verification Pool',
      color: 'amber',
      tools: [
        { name: 'podbit.elite stats', desc: 'Pool statistics and generation distribution' },
        { name: 'podbit.elite coverage', desc: 'Manifest coverage report (which goals are covered)' },
        { name: 'podbit.elite gaps', desc: 'Uncovered manifest targets' },
        { name: 'podbit.elite candidates', desc: 'Elite bridging pair candidates for next-generation synthesis' },
        { name: 'podbit.elite nodes', desc: 'Query elite nodes with domain, generation, and limit filters' },
        { name: 'podbit.elite terminals', desc: 'Terminal findings at max generation' },
        { name: 'podbit.elite rescan', desc: 'Trigger backfill scan for newly verified nodes' },
        { name: 'podbit.elite demote', desc: 'Demote an elite node back to synthesis status' },
      ],
    },
    {
      name: 'Project Management',
      color: 'purple',
      tools: [
        { name: 'podbit.projects list', desc: 'List all projects with metadata and file sizes' },
        { name: 'podbit.projects current', desc: 'Get the active project name and info' },
        { name: 'podbit.projects new', desc: 'Create a new project with domains, goals, and bridges' },
        { name: 'podbit.projects load/save', desc: 'Switch between projects or save current state' },
        { name: 'podbit.projects ensure', desc: 'Auto-detect project from working directory and switch if needed' },
        { name: 'podbit.projects interview', desc: 'LLM-conducted interview to discover project purpose, domains, and goals' },
        { name: 'podbit.projects manifest', desc: 'Read the stored project manifest (purpose, domains, goals, key questions)' },
        { name: 'podbit.projects updateManifest', desc: 'Update fields in the project manifest' },
      ],
    },
    {
      name: 'Governance',
      color: 'gray',
      tools: [
        { name: 'podbit.pending', desc: 'Get queued requests from GUI chat' },
        { name: 'podbit.complete', desc: 'Mark a pending request as done' },
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
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">MCP Tools Reference</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit exposes tools via the Model Context Protocol (MCP). These tools are available
          to any MCP-compatible client (IDE agents, AI assistants, custom scripts).
        </p>
      </div>

      <div className="space-y-4">
        {toolGroups.map(group => {
          const c = colorMap[group.color];
          return (
            <div key={group.name} className={`${c.bg} border ${c.border} rounded-lg p-4`}>
              <h3 className={`font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200 ${c.title}`}>{group.name}</h3>
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
  );
}

export default ToolsSection;
