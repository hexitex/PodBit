

/** Help section: Reviewing and curating — graph browser, breakthroughs, rating. */
function Part2ReviewingCurating() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Reviewing &amp; Curating Your Graph</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          After the synthesis engine runs, you'll want to explore what it produced. The Graph Browser lets you browse,
          filter, rate, and curate every node. The Breakthroughs page tracks your most validated discoveries.
        </p>
      </div>

      {/* Graph Browser */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Graph Browser</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The Graph page is your primary interface for exploring and managing knowledge nodes. It offers two
          complementary views and a rich set of filtering and curation tools.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">List View</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            A sortable, filterable table of all nodes. Each row shows the node's content preview, type badge,
            domain, weight, and creation date. Click any row to open the detail panel. Best for scanning
            large numbers of nodes and bulk curation.
          </p>
        </div>

        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Graph Visualization</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            An interactive force-directed graph showing nodes as circles and edges as connecting lines.
            Nodes are colored by type or domain. Click any node to select it and open the detail panel.
            Best for exploring relationships and understanding graph topology.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Filters</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Both views share the same filter bar. Filters narrow the displayed nodes in real time:
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">Domain</p>
            <p className="text-gray-500 dark:text-gray-400">Select one or more domains to scope the view. Useful when your graph spans many topic areas.</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">Node Type</p>
            <p className="text-gray-500 dark:text-gray-400">Filter by seed, synthesis, voiced, breakthrough, question, or raw. See{' '}
              <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="node-types">Node Types</span> for details.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">Weight Range</p>
            <p className="text-gray-500 dark:text-gray-400">Slider to filter by minimum weight. Higher weight means the node has been rated well or promoted.</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">Search Text</p>
            <p className="text-gray-500 dark:text-gray-400">Full-text search across node content. Matches against the stored text of each node.</p>
          </div>
        </div>
      </div>

      {/* Node Detail Panel */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Node Detail Panel</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">
          Clicking a node (in either view) opens the detail panel, which shows everything about that node and
          provides all curation actions.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-sky-100 dark:border-sky-800">
            <p className="text-xs font-medium text-sky-700 dark:text-sky-300 mb-1">Content &amp; Metadata</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              Full node content, plus metadata: <strong>weight</strong> (quality signal, 0-1.5),{' '}
              <strong>salience</strong> (sampling priority), <strong>type</strong> (seed/synthesis/voiced/etc.),{' '}
              <strong>domain</strong>, <strong>trajectory</strong> (knowledge or abstraction),{' '}
              <strong>contributor</strong>, and timestamps.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-sky-100 dark:border-sky-800">
            <p className="text-xs font-medium text-sky-700 dark:text-sky-300 mb-1">Actions</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              <strong>Rate</strong> (thumbs up/down), <strong>Promote</strong> to breakthrough,{' '}
              <strong>Remove</strong> (archive or junk), <strong>Edit</strong> content text,{' '}
              and <strong>View lineage</strong> to see parent/child relationships.
            </p>
          </div>
        </div>
      </div>

      {/* Lineage Explorer */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Lineage Explorer</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Every node tracks parent-child relationships through edges. The knowledge graph lineage is a{' '}
          <strong>DAG</strong> (directed acyclic graph) — nodes can have multiple parents and many children.
          Lineage lets you trace how any insight was derived and what it contributed to.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Detail Panel (1-Hop)</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            The node detail panel shows direct lineage: <strong className="text-amber-700 dark:text-amber-300">parents</strong> (amber)
            and <strong className="text-emerald-700 dark:text-emerald-300">children</strong> (emerald) with type badges, content
            previews, and click-to-navigate links. This gives you immediate context about where a node came from
            and what it influenced.
          </p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Lineage Modal (Multi-Hop)</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            The <strong>Full Tree</strong> button opens a modal with collapsible generation sections — parents,
            grandparents, great-grandparents above; children, grandchildren below. Displays up to{' '}
            <strong>4 generations deep</strong> using recursive CTE queries. Each generation section is
            collapsible, with node content, type badges, and navigation links.
          </p>
        </div>
      </div>

      {/* Breakthroughs */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Breakthroughs</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Breakthroughs are your graph's most validated discoveries — nodes promoted after scoring well on
          synthesis quality, novelty, testability, and tension resolution. They represent the highest-confidence
          insights the system has produced.
        </p>
      </div>

      {/* Breakthrough Lifecycle */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Breakthrough Lifecycle</h3>
        <div className="space-y-2 text-xs text-indigo-600 dark:text-indigo-400">
          <div className="flex items-start gap-2">
            <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 font-bold">1</span>
            <p>Node created through synthesis, seeding, or voicing</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 font-bold">2</span>
            <p>Validation cycle or human identifies it as significant</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 font-bold">3</span>
            <p>May be marked as "possible" (pre-breakthrough candidate)</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 font-bold">4</span>
            <p>Validation scores computed across 4 dimensions (each 0-10)</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 font-bold">5</span>
            <p>If composite score meets threshold, promoted to breakthrough (weight set to 1.5)</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="bg-indigo-200 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-300 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 font-bold">6</span>
            <p>Parents gain <strong>+0.15</strong> weight, grandparents gain <strong>+0.05</strong> — rewarding the ideas that contributed to a breakthrough</p>
          </div>
        </div>
      </div>

      {/* Validation Scores */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Validation Scores</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Each breakthrough candidate is scored on four dimensions. Scores range from 0 to 10, with color coding:{' '}
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">green (7+)</span>,{' '}
          <span className="text-amber-600 dark:text-amber-400 font-medium">yellow (5-6)</span>,{' '}
          <span className="text-red-600 dark:text-red-400 font-medium">red (&lt;5)</span>.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Synthesis (0-10)</p>
            <p className="text-gray-500 dark:text-gray-400">
              How coherently are the source ideas combined? Does the output represent a genuine integration,
              or just a surface-level concatenation?
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Novelty (0-10)</p>
            <p className="text-gray-500 dark:text-gray-400">
              Does this produce new understanding beyond what the source nodes already say? A high novelty score
              means the synthesis revealed something neither parent contained alone.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Testability (0-10)</p>
            <p className="text-gray-500 dark:text-gray-400">
              Does the node make specific, verifiable claims? Vague philosophical observations score low.
              Concrete predictions or falsifiable statements score high.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Tension Resolution (0-10)</p>
            <p className="text-gray-500 dark:text-gray-400">
              Does the node resolve contradictions between its source nodes? Tension-resolving insights are
              especially valuable because they advance understanding in areas of genuine disagreement.
            </p>
          </div>
        </div>
      </div>

      {/* Breakthroughs Page */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Breakthroughs Page</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            The dedicated Breakthroughs page shows: <strong>stat cards</strong> (total breakthroughs, recent count,
            average scores), a <strong>timeline chart</strong> showing discovery rate over time,{' '}
            <strong>breakdown by project and domain</strong>, and <strong>expandable cards</strong> for each
            breakthrough with full content, validation scores, and source node lineage. Filters let you
            narrow by domain, score range, and date.
          </p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Breakthrough Registry</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            Breakthroughs are stored in a <strong>shared registry</strong> that persists across projects. The registry
            stores <strong>content snapshots</strong> (not references), so breakthroughs survive even if the
            source project is deleted or modified. This makes the registry a permanent record of your
            most significant discoveries across all projects.
          </p>
        </div>
      </div>

      {/* Activity Log */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Activity Log</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The Activity Log provides a full event stream of everything happening in the system — synthesis
          attempts, voicing results, cycle completions, configuration changes, and more.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Time Range Filters</p>
            <p className="text-gray-500 dark:text-gray-400">
              Filter events by time period — last hour, last day, last week, or custom range. Useful for
              reviewing what happened during an overnight synthesis run.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Category Badges</p>
            <p className="text-gray-500 dark:text-gray-400">
              Events are tagged with category badges: synthesis, voicing, proxy, mcp, kb, config, system,
              llm, elite. Filter by category to focus on specific subsystems.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Expandable Details</p>
            <p className="text-gray-500 dark:text-gray-400">
              Click any event to expand its detail object — full metadata including node IDs, model names,
              gate results, rejection reasons, scores, and timing information.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300 mb-1">Real-Time Streaming</p>
            <p className="text-gray-500 dark:text-gray-400">
              Events stream in via SSE (Server-Sent Events) in real time. You can watch synthesis attempts
              succeed or fail as they happen, without refreshing the page.
            </p>
          </div>
        </div>
      </div>

      {/* Feedback & Rating */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Feedback &amp; Rating</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Rating nodes is how you shape the graph's evolution. Your feedback directly influences which nodes
          get sampled for future synthesis and which fade into low priority.
        </p>
      </div>

      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <p className="font-medium text-emerald-700 dark:text-emerald-300 mb-1">Useful</p>
            <p className="text-emerald-600 dark:text-emerald-400">
              Thumbs up. Increases the node's weight, making it more likely to be sampled by synthesis
              and voicing. Signals that the insight is worth building on.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <p className="font-medium text-emerald-700 dark:text-emerald-300 mb-1">Not Useful</p>
            <p className="text-emerald-600 dark:text-emerald-400">
              Thumbs down. Decreases the node's weight, reducing its sampling priority. The node remains
              in the graph but participates less in future cycles.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <p className="font-medium text-emerald-700 dark:text-emerald-300 mb-1">Harmful</p>
            <p className="text-emerald-600 dark:text-emerald-400">
              Flags the node as actively misleading or incorrect. Significantly reduces weight and
              signals to the quality system that this content should not propagate.
            </p>
          </div>
        </div>
        <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-3">
          Feedback can come from three sources: <strong>human</strong> (your manual ratings), <strong>agent</strong> (MCP
          tools via{' '}
          <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="slash-commands">podbit.feedback</span>),
          or <strong>autorating</strong> (the{' '}
          <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="growing-graph">autorating cycle</span>).
          All three affect node weight and future sampling.
        </p>
      </div>

      {/* Curating Your Graph */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Curating Your Graph</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Active curation keeps your graph healthy. As the synthesis engine produces output, some nodes will be
          low-quality, redundant, or off-topic. Regular curation ensures the graph stays focused and useful.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <div className="space-y-4">
          <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-1">Remove Junk</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Archive</strong> removes a node from active participation but keeps it in the database for
              reference. <strong>Junk</strong> permanently filters the node and prevents similar content from
              being created in the future — the junk filter uses embedding similarity to block new nodes that
              resemble junked ones. Use junk only when you're certain the content is wrong or irrelevant, not
              just low-quality. Available in the GUI or via{' '}
              <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="slash-commands">podbit.remove</span>.
            </p>
          </div>

          <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-1">Dedup</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Find and archive duplicate or near-duplicate nodes. The dedup algorithm clusters nodes by embedding
              similarity and word overlap. <strong>Always run a dry-run first</strong> to review the clusters before
              archiving — nodes that look similar in truncated previews may describe different concepts. Available via{' '}
              <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="slash-commands">podbit.dedup</span>.
            </p>
          </div>

          <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-1">Promote</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Manually promote exceptional nodes to breakthrough status. This bypasses the validation cycle's
              automatic scoring — useful when you recognize an insight that the scoring system might not
              fully appreciate. Promoted nodes get weight 1.5 and their parents receive weight bonuses. Available via{' '}
              <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="slash-commands">podbit.promote</span>.
            </p>
          </div>

          <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-1">Edit</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Modify a node's content text directly. Useful for correcting minor errors, improving clarity,
              or removing irrelevant details from an otherwise good synthesis. Editing re-embeds the node
              automatically so similarity searches stay accurate.
            </p>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-1">Rate</h3>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Thumbs up or thumbs down on node cards to adjust weight signals. Quick ratings are the
              lowest-effort way to shape the graph — even a few ratings per session meaningfully influence
              which ideas propagate through future synthesis cycles.
            </p>
          </div>
        </div>
      </div>

      {/* Practical tips */}
      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Curation Tips</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
          <li>
            <strong>Review after synthesis runs.</strong> Check the{' '}
            <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="growing-graph">Activity Log</span>{' '}
            to see what was produced, then browse the Graph page filtered to recent nodes.
          </li>
          <li>
            <strong>Junk sparingly.</strong> The junk filter is powerful — it blocks similar future content via
            embedding similarity. Archive when unsure; junk only when certain.
          </li>
          <li>
            <strong>Use lineage to understand context.</strong> Before removing a node, check its children.
            A mediocre node might be the parent of a strong synthesis.
          </li>
          <li>
            <strong>Rate liberally.</strong> Even brief thumbs-up/down sessions help the autorating cycle
            calibrate and improve the quality of future synthesis.
          </li>
          <li>
            <strong>Check verification status.</strong> Nodes that have been{' '}
            <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="verification-quality">lab-verified</span>{' '}
            carry stronger quality signals. Prioritize reviewing unverified breakthroughs.
          </li>
        </ul>
      </div>
    </div>
  );
}

export default Part2ReviewingCurating;
