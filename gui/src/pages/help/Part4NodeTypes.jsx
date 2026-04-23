

export function NodeTypesDiagram() {
  const types = [
    { label: 'Seed', color: '#10b981', desc: 'Foundational input', weight: '1.0' },
    { label: 'Synthesis', color: '#0ea5e9', desc: 'Auto-generated', weight: '1.0' },
    { label: 'Voiced', color: '#8b5cf6', desc: 'Human & AI-guided synthesis', weight: '1.0' },
    { label: 'Breakthrough', color: '#f59e0b', desc: 'Validated insight', weight: '1.5' },
    { label: 'Possible', color: '#14b8a6', desc: '3-gate validated', weight: '1.0' },
    { label: 'Elite', color: '#ca8a04', desc: 'Lab-verified finding', weight: '1.5' },
    { label: 'Question', color: '#ef4444', desc: 'Research gap', weight: '1.0' },
    { label: 'Raw', color: '#6b7280', desc: 'Uncurated RAG', weight: '1.0' },
  ];
  return (
    <svg viewBox="0 0 580 400" className="w-full max-w-2xl mx-auto" role="img" aria-label="Node types">
      <defs>
        <marker id="arrowPromote" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#14b8a6" />
        </marker>
      </defs>
      {types.map((t, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const x = 100 + col * 190;
        const y = 50 + row * 130;
        const r = 20 + parseFloat(t.weight) * 8;
        return (
          <g key={t.label}>
            <circle cx={x} cy={y} r={r} fill={t.color} opacity="0.15" stroke={t.color} strokeWidth="2" />
            <circle cx={x} cy={y} r={4} fill={t.color} />
            <text x={x} y={y + r + 16} textAnchor="middle" className="text-xs font-semibold" fill={t.color}>{t.label}</text>
            <text x={x} y={y + r + 29} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">{t.desc}</text>
            <text x={x} y={y + r + 41} textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">w: {t.weight}</text>
          </g>
        );
      })}
      <path d="M 244 180 L 146 180" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowPromote)" />
      <text x="195" y="173" textAnchor="middle" className="text-xs fill-teal-500 dark:fill-teal-400">promotes</text>
    </svg>
  );
}

export function SalienceDiagram() {
  return (
    <svg viewBox="0 0 500 200" className="w-full max-w-lg mx-auto" role="img" aria-label="Salience dynamics">
      <defs>
        <linearGradient id="salienceGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.3" />
          <stop offset="40%" stopColor="#3b82f6" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <text x="250" y="18" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400 font-semibold">Salience Spectrum</text>
      <rect x="40" y="28" width="420" height="36" rx="6" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-600" />
      <rect x="44" y="32" width="412" height="28" rx="4" fill="url(#salienceGrad)" />
      <text x="50" y="82" className="text-xs fill-gray-400 font-medium">0.01 (Floor)</text>
      <text x="450" y="82" textAnchor="end" className="text-xs fill-purple-500 font-medium">1.0 (Ceiling)</text>
      <text x="100" y="108" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">Low Salience</text>
      <text x="100" y="123" className="text-xs fill-gray-400 dark:fill-gray-500">Rarely sampled for synthesis</text>
      <text x="350" y="108" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">High Salience</text>
      <text x="350" y="123" className="text-xs fill-gray-400 dark:fill-gray-500">Frequently sampled</text>
      <rect x="40" y="145" width="195" height="42" rx="6" fill="#10b981" opacity="0.08" stroke="#10b981" strokeWidth="1" />
      <text x="137" y="164" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-medium">Boost: +0.1 on match</text>
      <text x="137" y="178" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-500">Increases sampling odds</text>
      <rect x="265" y="145" width="195" height="42" rx="6" fill="#ef4444" opacity="0.08" stroke="#ef4444" strokeWidth="1" />
      <text x="362" y="164" textAnchor="middle" className="text-xs fill-red-700 dark:fill-red-400 font-medium">Decay: x0.99 / N cycles</text>
      <text x="362" y="178" textAnchor="middle" className="text-xs fill-red-600 dark:fill-red-500">Prevents stale dominance</text>
    </svg>
  );
}

/** Help section: Node types and weight reference — type diagram, salience, trajectory. */
export default function Part4NodeTypes() {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Node Types & Weight Reference</h2>
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Every piece of knowledge in Podbit is a node. This reference covers all node types, how weight and salience work, and what trajectory classification means.
        </p>
      </div>

      {/* Node Types Diagram */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Node Types at a Glance</h3>
        <NodeTypesDiagram />
      </div>

      {/* Detailed Node Types */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Detailed Node Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Seed */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block"></span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">seed</span>
              <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded">w: 1.0</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Raw input from humans, research cycle, or KB ingestion. The starting material for all synthesis.
              Seeds are the foundation of the knowledge graph &mdash; everything builds on them.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Contributors: <code className="text-xs">human:*</code>, <code className="text-xs">claude</code>, <code className="text-xs">research-cycle</code>, <code className="text-xs">kb:*</code>
            </p>
          </div>

          {/* Synthesis */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-sky-500 inline-block"></span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">synthesis</span>
              <span className="text-xs bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded">w: 1.0</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Created by the synthesis engine. Precision-matched pairs of nodes are analytically combined to produce new insight.
              Has parent edges linking back to source nodes.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Subsystem: <code className="text-xs">synthesis</code>
            </p>
          </div>

          {/* Voiced */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-violet-500 inline-block"></span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">voiced</span>
              <span className="text-xs bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded">w: 1.0</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Created by the voicing cycle. Persona-driven perspectives bring creative angles to node pairs.
              Modes include object-following, sincere, cynic, pragmatist, and child.
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Subsystem: <code className="text-xs">voice</code>
            </p>
          </div>

          {/* Breakthrough */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-amber-500 inline-block"></span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">breakthrough</span>
              <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">w: 1.5</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Promoted by validation. The graph's most validated insights &mdash; survived synthesis, quality gates, and scoring.
              Highest-quality nodes. Parent nodes get +0.15 weight, grandparents +0.05.
            </p>
          </div>

          {/* Possible */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-teal-500 inline-block"></span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">possible</span>
              <span className="text-xs bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 px-1.5 py-0.5 rounded">w: 1.0</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Pre-breakthrough candidate. Passed 3-gate validation but not yet promoted.
              Represents strong candidates awaiting final validation scoring to become breakthroughs.
            </p>
          </div>

          {/* Elite */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-yellow-600 inline-block"></span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">elite_verification</span>
              <span className="text-xs bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300 px-1.5 py-0.5 rounded">w: 1.5</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Lab verification results. Contains experiment data, output, and pass/fail status attached to tested claims.
              Empirically verified findings represent the most rigorous knowledge in the graph.
            </p>
          </div>

          {/* Question */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-red-500 inline-block"></span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">question</span>
              <span className="text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded">w: 1.0</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Generated by the question cycle. Represents knowledge gaps identified by the system.
              Guides research and investigation toward areas the graph has not yet explored.
            </p>
          </div>

          {/* Raw */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full bg-gray-500 inline-block"></span>
              <span className="text-sm font-bold text-gray-900 dark:text-white">raw</span>
              <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">w: 1.0</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              Verbatim KB ingestion in raw mode. Searchable reference material only.
              Excluded from synthesis, compress, dedup, and all autonomous cycles.
            </p>
          </div>
        </div>
      </div>

      {/* Weight Mechanics */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Weight Mechanics</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
          Weight is adjusted additively or subtractively by multiple signals — ratings, filters, LLM judges, and cycle-based decay.
          Nodes start at <strong>1.0</strong>. All weights are clamped between a global <strong>weight floor</strong> (default 0.05) and <strong>weight ceiling</strong> (default 3.0), configurable in Weight Dynamics.
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 w-36 shrink-0 font-medium">+0.1 synthesis boost</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">Parent nodes gain +0.1 each time one of their children is created via synthesis</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 w-36 shrink-0 font-medium">+0.15 / +0.05 ancestry</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">When a descendant becomes breakthrough: parent +0.15, grandparent +0.05</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 w-36 shrink-0 font-medium">+0.2 / &minus;0.1 / &minus;0.3 feedback</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">Human or agent ratings: useful <strong>+0.2</strong>, not useful <strong>&minus;0.1</strong>, harmful <strong>&minus;0.3</strong></span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 w-36 shrink-0 font-medium">+0.05 context usage</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">Nodes the LLM actually references in a chat response get a small weight boost per turn</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 w-36 shrink-0 font-medium">&plusmn; lab confidence</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">Lab verification adjusts weight by <strong>+0.15 &times; confidence</strong> (verified) or <strong>&minus;0.15 &times; confidence</strong> (disproved)</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-emerald-600 dark:text-emerald-400 w-36 shrink-0 font-medium">&plusmn; autorating</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">Autonomous LLM judge scores quality and applies a delta — rewards specific, grounded content; penalises vague output</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-red-500 dark:text-red-400 w-36 shrink-0 font-medium">&times;0.999 periodic decay</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">All weights multiplied by the decay factor every N cycles — prevents old content from dominating indefinitely</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-red-500 dark:text-red-400 w-36 shrink-0 font-medium">&times; extra synthesis decay</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">After a grace period, synthesis and voiced nodes that fail BOTH usefulness signals get extra decay - never referenced in chat AND no surviving children. Productive parents are exempt.</span>
          </div>
        </div>
      </div>

      {/* Salience Mechanics */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Salience Mechanics</h3>
        <SalienceDiagram />
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-600 dark:text-gray-300">
            Salience is an attention score ranging from <strong>0.01</strong> (floor) to <strong>1.0</strong> (ceiling) that controls how often a node is sampled for synthesis pairing.
          </p>
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 w-36 shrink-0 font-medium">Boost on match</span>
            <span className="text-xs text-gray-700 dark:text-gray-300"><strong>+0.1</strong> when a node is selected and paired during synthesis</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 w-36 shrink-0 font-medium">Decay per cycle</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">Multiplied by <strong>0.99</strong> per N cycles to prevent stale dominance</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 w-36 shrink-0 font-medium">High salience</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">Frequently sampled for synthesis pairing</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-xs text-gray-400 dark:text-gray-500 w-36 shrink-0 font-medium">Low salience</span>
            <span className="text-xs text-gray-700 dark:text-gray-300">Rarely sampled, giving room for fresh nodes to participate</span>
          </div>
        </div>
      </div>

      {/* Trajectory Classification */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Trajectory Classification</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
          Every synthesis node is classified into one of two trajectories based on automatic content analysis.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 p-3">
            <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 mb-1">Knowledge</h4>
            <p className="text-xs text-blue-700 dark:text-blue-400">
              Specific, factual content containing numbers, technical terms, and concrete claims.
              Parents of knowledge-trajectory breakthroughs receive weight boosts.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 p-3">
            <h4 className="text-sm font-bold text-purple-800 dark:text-purple-300 mb-1">Abstraction</h4>
            <p className="text-xs text-purple-700 dark:text-purple-400">
              General, philosophical content. Receives lower initial weight to prevent vague drift
              and keep the graph grounded in concrete knowledge.
            </p>
          </div>
        </div>
      </div>

      {/* Embeddings */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-3">Embeddings</h3>
        <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
          Every node is represented as a vector embedding &mdash; a high-dimensional numeric representation of its content.
        </p>
        <ul className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Configurable dimensions (<strong>768</strong> default)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Computed by the <strong>embedding</strong> subsystem (local models recommended for speed and cost)</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>Used for: similarity search, synthesis pairing, dedup detection, relevance scoring</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5">&#8226;</span>
            <span>In-memory computation, efficient up to ~10K nodes</span>
          </li>
        </ul>
      </div>

      {/* Cross-section links */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Related Sections</h4>
        <div className="flex flex-wrap gap-2">
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="key-concepts">Key Concepts</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="growing-graph">Growing Your Graph</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="verification-quality">Verification & Quality</button>
          <button className="docs-link-internal text-xs text-blue-600 dark:text-blue-400 hover:underline" data-doc="reviewing-curating">Reviewing & Curating</button>
        </div>
      </div>
    </div>
  );
}
