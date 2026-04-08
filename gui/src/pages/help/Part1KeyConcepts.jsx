

export function CycleEcosystemDiagram() {
  return (
    <svg viewBox="0 0 920 420" className="w-full mx-auto" role="img" aria-label="Autonomous cycle ecosystem">
      <defs>
        <marker id="arrow-cc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Central knowledge graph */}
      <rect x="330" y="160" width="220" height="100" rx="12" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="2" />
      <text x="440" y="195" textAnchor="middle" className="fill-sky-700 dark:fill-sky-300 text-sm font-bold">Knowledge Graph</text>
      <text x="440" y="215" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs">Seeds, voiced, breakthroughs</text>
      <text x="440" y="232" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs">Nodes with embeddings &amp; edges</text>

      {/* Synthesis - top left */}
      <rect x="30" y="20" width="195" height="80" rx="8" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1.5" />
      <text x="127" y="48" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-xs font-semibold">Synthesis Engine</text>
      <text x="127" y="64" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400 text-xs">Precision pairing + gates</text>
      <text x="127" y="78" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400 text-xs">synthesis nodes</text>
      <path d="M 225 80 C 290 120, 330 140, 350 160" fill="none" stroke="#a855f7" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Voicing - top right */}
      <rect x="650" y="20" width="240" height="80" rx="8" fill="#ec4899" opacity="0.15" stroke="#ec4899" strokeWidth="1.5" />
      <text x="770" y="48" textAnchor="middle" className="fill-pink-700 dark:fill-pink-300 text-xs font-semibold">Voicing Cycle</text>
      <text x="770" y="64" textAnchor="middle" className="fill-pink-500 dark:fill-pink-400 text-xs">Creative personas + loose pairing</text>
      <text x="770" y="78" textAnchor="middle" className="fill-pink-500 dark:fill-pink-400 text-xs">voiced nodes</text>
      <path d="M 650 80 C 590 120, 555 140, 530 160" fill="none" stroke="#ec4899" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Research - left */}
      <rect x="10" y="175" width="190" height="70" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="105" y="200" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">Research Cycle</text>
      <text x="105" y="216" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">LLM generates new seeds</text>
      <text x="105" y="230" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">for sparse domains</text>
      <path d="M 200 210 C 245 210, 295 210, 330 210" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Questions - right */}
      <rect x="685" y="175" width="200" height="70" rx="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="785" y="200" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-xs font-semibold">Question Cycle</text>
      <text x="785" y="216" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">Identifies knowledge gaps</text>
      <text x="785" y="230" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">question nodes</text>
      <path d="M 685 210 C 630 210, 580 210, 550 210" fill="none" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Tensions - bottom left */}
      <rect x="50" y="310" width="175" height="70" rx="8" fill="#ef4444" opacity="0.15" stroke="#ef4444" strokeWidth="1.5" />
      <text x="137" y="335" textAnchor="middle" className="fill-red-700 dark:fill-red-300 text-xs font-semibold">Tensions Cycle</text>
      <text x="137" y="351" textAnchor="middle" className="fill-red-500 dark:fill-red-400 text-xs">Finds contradictions</text>
      <text x="137" y="365" textAnchor="middle" className="fill-red-500 dark:fill-red-400 text-xs">between similar nodes</text>
      <path d="M 225 330 C 290 300, 350 275, 370 260" fill="none" stroke="#ef4444" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Validation - bottom center */}
      <rect x="295" y="310" width="290" height="70" rx="8" fill="#6366f1" opacity="0.15" stroke="#6366f1" strokeWidth="1.5" />
      <text x="440" y="335" textAnchor="middle" className="fill-indigo-700 dark:fill-indigo-300 text-xs font-semibold">Validation + Autorating</text>
      <text x="440" y="351" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">Scores quality, promotes breakthroughs</text>
      <text x="440" y="365" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">Rates nodes for weight adjustment</text>
      <path d="M 440 310 C 440 290, 440 275, 440 260" fill="none" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Lab Verification - bottom right */}
      <rect x="660" y="310" width="195" height="70" rx="8" fill="#0891b2" opacity="0.15" stroke="#0891b2" strokeWidth="1.5" />
      <text x="757" y="335" textAnchor="middle" className="fill-cyan-700 dark:fill-cyan-300 text-xs font-semibold">Lab Verification</text>
      <text x="757" y="351" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400 text-xs">Submits claims to lab servers</text>
      <text x="757" y="365" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400 text-xs">for empirical testing</text>
      <path d="M 660 330 C 595 300, 535 275, 510 260" fill="none" stroke="#0891b2" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Label */}
      <text x="440" y="410" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">All cycles run in parallel, each feeding back into the shared knowledge graph</text>
    </svg>
  );
}

/** Help section: Key concepts — cycle ecosystem diagram and core terms. */
function Part1KeyConcepts() {
  return (
    <div className="space-y-6">

      {/* Opening */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Key Concepts</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit organizes everything as nodes in a knowledge graph. Seven autonomous cycles run in
          parallel — some create new knowledge, some evaluate it, some destroy it. Understanding these
          building blocks helps you get the most out of the system.
        </p>
      </div>

      {/* Cycle Ecosystem Diagram */}
      <CycleEcosystemDiagram />

      {/* Nodes */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Nodes</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Everything in Podbit is a <strong>node</strong> in the knowledge graph. Each node carries content (the
          actual knowledge), a type, a domain label, a weight (importance), salience (attention priority),
          and an embedding vector for semantic similarity search.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-sky-50 dark:bg-sky-900/30 rounded-lg p-3 border border-sky-200 dark:border-sky-700">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">seed</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">Raw input from you, the research cycle, or KB ingestion. The starting material for everything.</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 rounded-lg p-3 border border-purple-200 dark:border-purple-700">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">synthesis</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">Auto-generated connections between ideas, created by the synthesis engine via precision pairing.</p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-900/30 rounded-lg p-3 border border-pink-200 dark:border-pink-700">
            <p className="text-xs font-semibold text-pink-700 dark:text-pink-300 mb-1">voiced</p>
            <p className="text-xs text-pink-600 dark:text-pink-400">Perspective-driven insights from the voicing cycle. Five persona modes: sincere, cynic, pragmatist, child, object-following.</p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-lg p-3 border border-indigo-200 dark:border-indigo-700">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">breakthrough</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">Validated discoveries that passed scoring on synthesis quality, novelty, testability, and tension resolution.</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 rounded-lg p-3 border border-amber-200 dark:border-amber-700">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">question</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">Knowledge gaps identified by the question cycle. Guides future research and investigation.</p>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-3 border border-gray-300 dark:border-gray-600">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">raw</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">Verbatim file content from KB ingestion. Searchable reference material, excluded from synthesis.</p>
          </div>
          <div className="bg-cyan-50 dark:bg-cyan-900/30 rounded-lg p-3 border border-cyan-200 dark:border-cyan-700 col-span-2">
            <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mb-1">elite_verification</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">Lab experiment results — verification data and supported/refuted status attached to the claims they tested.</p>
          </div>
        </div>

        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          For the full node type reference including weight mechanics and lifecycle details, see{' '}
          <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="node-types">Node Types &amp; Lifecycle</a>.
        </p>
      </div>

      {/* The Seven Cycles */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">The Seven Cycles</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Each cycle has a distinct role. Three create new knowledge, four evaluate and stress-test
          what already exists, and one verifies claims empirically.
        </p>
      </div>

      {/* Creators */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Creators — Make New Knowledge</h3>
        <div className="space-y-3">
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
            <h4 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Synthesis Engine</h4>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Finds hidden connections by pairing nodes in a tuned similarity band and running them through quality gates. Produces <code className="text-purple-700 dark:text-purple-300">synthesis</code> nodes.
            </p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700 rounded-lg p-4">
            <h4 className="font-semibold text-pink-700 dark:text-pink-300 text-sm mb-2">Voicing Cycle</h4>
            <p className="text-xs text-pink-600 dark:text-pink-400">
              Explores ideas through five persona modes (sincere, cynic, pragmatist, child, object-following) using loose, random pairing. Produces <code className="text-pink-700 dark:text-pink-300">voiced</code> nodes.
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
            <h4 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Research Cycle</h4>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Fills knowledge gaps in sparse domains by generating new <code className="text-emerald-700 dark:text-emerald-300">seed</code> nodes, filtered through an embedding relevance gate to stay on-topic.
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400">
        For a detailed comparison of how these creators differ, see{' '}
        <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="growing-graph">Growing Your Graph</a>.
      </p>

      {/* Evaluators */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Evaluators — Judge Existing Knowledge</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
            <h4 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Validation</h4>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              Scores high-weight nodes on synthesis quality, novelty, and testability, promoting the best to <strong>breakthrough</strong> status.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
            <h4 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Autorating</h4>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              Automatically adjusts node weights by quality, creating natural selection pressure where good ideas propagate and weak ones fade.
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
            <h4 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">Tensions</h4>
            <p className="text-xs text-red-600 dark:text-red-400">
              Finds pairs of highly similar nodes that make opposing claims, surfacing contradictions where unknown knowledge hides.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
            <h4 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Questions</h4>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Generates specific, answerable research questions from node pairs, making knowledge gaps explicit and actionable.
            </p>
          </div>
        </div>
      </div>

      {/* Verifier */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Verifier — Test Claims Empirically</h3>
        <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
          <h4 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">Lab Verification</h4>
          <p className="text-xs text-cyan-600 dark:text-cyan-400">
            Extracts experiment specs from claims and submits them to external lab servers. Labs run experiments
            and return raw data. Podbit evaluates the returned data against spec criteria. Nodes are frozen during verification
            and tainted downstream if refuted. The only cycle that tests claims empirically — the system's reality check.
            See{' '}
            <a href="#" className="docs-link-internal underline" data-doc="verification-quality">Verification &amp; Quality</a> for details.
          </p>
        </div>
      </div>

      {/* Domains & Partitions */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Domains &amp; Partitions</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Knowledge is organized by <strong>domains</strong> — labels like "biology", "architecture", or
          "synthesis-design" that group related nodes. Domains are then grouped into <strong>partitions</strong>,
          which control isolation boundaries.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Isolation</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Nodes in different partitions cannot synthesize together unless the partitions are explicitly
              bridged. This prevents unrelated topics from producing nonsensical cross-domain synthesis.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Bridging</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              When two partitions <em>should</em> cross-pollinate, you create a bridge. Bridged partitions allow
              synthesis to pair nodes from different domains — this is where cross-domain insights emerge.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">System partitions</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Some partitions (e.g., know-thyself) are marked as system-internal. They synthesize only within
              themselves and cannot be bridged to user partitions.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Dynamic</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Domains and partitions are created as needed. When you seed knowledge to a new domain, a
              partition is auto-created. You manage them on the Graph page.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          For full details on managing domains, partitions, and bridges, see{' '}
          <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="projects-domains">Projects &amp; Domains</a>.
        </p>
      </div>

      {/* Weight & Salience */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Weight &amp; Salience</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Two scores determine how nodes participate in the graph over time:
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Weight = Importance</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Starts at 1.0. Breakthroughs get boosted to 1.5. Parent nodes gain weight when their children
              are created. Autorating adjusts weight up or down based on quality scoring. Higher-weight nodes
              are sampled more often for synthesis.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-4 border dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Salience = Attention</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Gets a +0.1 boost when a node is matched in a query or synthesis. Decays by x0.99 each cycle.
              Determines how frequently a node is selected for pairing — recently active and relevant nodes
              bubble up, while stale ones fade.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          For full weight and salience mechanics, see{' '}
          <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="node-types">Node Types &amp; Lifecycle</a>.
        </p>
      </div>

      {/* How They Work Together */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">How They Work Together</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          The cycles form a self-reinforcing ecosystem. Each step feeds into the next:
        </p>
        <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
          <li>You <strong>seed</strong> initial knowledge (manually, via KB, or via Chat)</li>
          <li><strong>Research</strong> fills gaps in sparse domains so synthesis has enough material</li>
          <li><strong>Synthesis</strong> finds precise, validated connections between ideas</li>
          <li><strong>Voicing</strong> explores the same ideas through creative, adversarial, and naive perspectives</li>
          <li><strong>Questions</strong> identify what's still unknown, guiding future research and seeding</li>
          <li><strong>Tensions</strong> surface contradictions — the most productive areas to investigate</li>
          <li><strong>Autorating</strong> adjusts node weights so the best ideas propagate through future synthesis</li>
          <li><strong>Validation</strong> promotes the highest-quality insights to breakthrough status</li>
          <li><strong>Lab verification</strong> empirically tests claims via external lab servers, adding verification scores that feed back into quality</li>
        </ol>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          All cycles run in parallel on configurable intervals. For details on cycle configuration and the
          synthesis pipeline, see{' '}
          <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="growing-graph">Growing Your Graph</a>.
          For input paths and how to add knowledge, see{' '}
          <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="adding-knowledge">Adding Knowledge</a>.
        </p>
      </div>
    </div>
  );
}

export default Part1KeyConcepts;
