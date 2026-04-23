import { Link } from 'react-router-dom';

function NodeTypesDiagram() {
  const types = [
    { label: 'Seed', color: '#10b981', desc: 'Foundational input', weight: '1.0' },
    { label: 'Synthesis', color: '#0ea5e9', desc: 'Auto-generated', weight: '1.0' },
    { label: 'Voiced', color: '#8b5cf6', desc: 'Human & AI-guided synthesis', weight: '1.0' },
    { label: 'Breakthrough', color: '#f59e0b', desc: 'Validated insight', weight: '≥1.5' },
    { label: 'Possible', color: '#14b8a6', desc: '3-gate validated', weight: '1.0' },
    { label: 'Elite', color: '#ca8a04', desc: 'Lab-verified finding', weight: '≥1.5' },
    { label: 'Question', color: '#ef4444', desc: 'Research gap', weight: '1.0' },
    { label: 'Raw', color: '#6b7280', desc: 'Uncurated RAG', weight: '1.0' },
  ];

  return (
    <svg viewBox="0 0 580 400" className="w-full max-w-2xl mx-auto" role="img" aria-label="Node types - 8 types in 3-column grid">
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
      {/* Promotion arrow: Possible -> Breakthrough */}
      <path d="M 244 180 L 146 180" fill="none" stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arrowPromote)" />
      <text x="195" y="173" textAnchor="middle" className="text-xs fill-teal-500 dark:fill-teal-400">promotes</text>
    </svg>
  );
}

function SalienceDiagram() {
  return (
    <svg viewBox="0 0 500 200" className="w-full max-w-lg mx-auto" role="img" aria-label="Salience dynamics">
      {/* Salience spectrum bar */}
      <defs>
        <linearGradient id="salienceGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.3" />
          <stop offset="40%" stopColor="#3b82f6" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
        </linearGradient>
      </defs>

      {/* Label */}
      <text x="250" y="18" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400 font-semibold">Salience Spectrum</text>

      {/* Track */}
      <rect x="40" y="28" width="420" height="36" rx="6" fill="#f1f5f9" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-600" />
      <rect x="44" y="32" width="412" height="28" rx="4" fill="url(#salienceGrad)" />

      {/* Scale markers */}
      <text x="50" y="82" className="text-xs fill-gray-400 font-medium">0.01 (Floor)</text>
      <text x="450" y="82" textAnchor="end" className="text-xs fill-purple-500 font-medium">1.0 (Ceiling)</text>

      {/* Low salience */}
      <text x="100" y="108" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">Low Salience</text>
      <text x="100" y="123" className="text-xs fill-gray-400 dark:fill-gray-500">Rarely sampled for synthesis</text>

      {/* High salience */}
      <text x="350" y="108" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">High Salience</text>
      <text x="350" y="123" className="text-xs fill-gray-400 dark:fill-gray-500">Frequently sampled</text>

      {/* Boost + Decay dynamics */}
      <rect x="40" y="145" width="195" height="42" rx="6" fill="#10b981" opacity="0.08" stroke="#10b981" strokeWidth="1" />
      <text x="137" y="164" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-medium">Boost: +0.1 on match</text>
      <text x="137" y="178" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-500">Increases sampling odds</text>

      <rect x="265" y="145" width="195" height="42" rx="6" fill="#ef4444" opacity="0.08" stroke="#ef4444" strokeWidth="1" />
      <text x="362" y="164" textAnchor="middle" className="text-xs fill-red-700 dark:fill-red-400 font-medium">Decay: x0.99 / N cycles</text>
      <text x="362" y="178" textAnchor="middle" className="text-xs fill-red-600 dark:fill-red-500">Prevents stale dominance</text>
    </svg>
  );
}

/** Help section: node types, salience, weight, and graph concepts. */
function GraphSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Knowledge Graph</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The knowledge graph is the research substrate -every piece of knowledge lives here as a <strong>node</strong>
          connected by parent-child <strong>edges</strong>. Seed nodes are raw inputs; synthesis and voicing create derived
          insights; breakthroughs are verified discoveries. Each node has an embedding (configurable-dimensional vector,
          768 default), weight, salience, domain, and type.
          Similarity search is computed in-memory (no vector database), which is efficient up to ~10K nodes.
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Node Types</h3>
        <NodeTypesDiagram />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Weight (Importance)</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            Weight represents accumulated importance. Higher weight means a node is sampled more often for synthesis and has more influence in the graph. All weights are clamped between the global <strong>weight floor</strong> (default 0.05) and <strong>weight ceiling</strong> (default 3.0).
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            Weight and salience are independent signals with different timescales. Salience decays quickly (half-life ~35 min) and controls short-term sampling probability. Weight decays slowly (half-life ~2.4 days) and controls long-term importance.
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Salience (Attention)</h3>
          <SalienceDiagram />
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Weight Dynamics - All Modification Pathways</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          12 independent systems modify node weight at different lifecycle stages. A node's weight at any moment is the cumulative result of all pathways that have acted on it. All config parameters are tunable via the Algorithm Parameters page.
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">1. Initial Weight</p>
            <p className="text-emerald-600 dark:text-emerald-400">Set at creation. Knowledge nodes: 1.0, abstraction: 0.1, seeds: 1.0, breakthroughs: 1.5</p>
            <p className="text-emerald-500 dark:text-emerald-500 mt-1">Config: Weight Dynamics</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">2. Fitness Modifier</p>
            <p className="text-emerald-600 dark:text-emerald-400">At creation: weight x0.85-1.15 based on dissimilarity, novelty, and specificity scores</p>
            <p className="text-emerald-500 dark:text-emerald-500 mt-1">Config: Fitness Modifier</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">3. Parent Boost</p>
            <p className="text-emerald-600 dark:text-emerald-400">When a knowledge child is created: parent weight +0.05 (default). Rewards productive nodes</p>
            <p className="text-emerald-500 dark:text-emerald-500 mt-1">Config: Weight Dynamics</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-2">
            <p className="font-semibold text-red-700 dark:text-red-300 mb-1">4. Weight Decay</p>
            <p className="text-red-600 dark:text-red-400">Every 10 cycles: weight x0.9999. Prevents permanent dominance. Half-life ~2.4 days</p>
            <p className="text-red-500 dark:text-red-500 mt-1">Config: Weight Dynamics</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-2">
            <p className="font-semibold text-red-700 dark:text-red-300 mb-1">5. Synthesis Decay</p>
            <p className="text-red-600 dark:text-red-400">After 7-day grace: nodes with no chat references AND no surviving children get extra x0.95 decay per pass (~50x faster)</p>
            <p className="text-red-500 dark:text-red-500 mt-1">Config: GA Features</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded p-2">
            <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">6. User Feedback</p>
            <p className="text-blue-600 dark:text-blue-400">Useful: +0.2, not useful: -0.1, harmful: -0.3. Asymmetric to favor positive signal</p>
            <p className="text-blue-500 dark:text-blue-500 mt-1">Config: Feedback Weights</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded p-2">
            <p className="font-semibold text-purple-700 dark:text-purple-300 mb-1">7. Population Control</p>
            <p className="text-purple-600 dark:text-purple-400">Every 120s: LLM or embedding eval scores nodes. Boost (x1.1), demote (x0.5), or archive</p>
            <p className="text-purple-500 dark:text-purple-500 mt-1">Config: Population Control / Embedding Eval</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="font-semibold text-amber-700 dark:text-amber-300 mb-1">8. Lab Verification</p>
            <p className="text-amber-600 dark:text-amber-400">Supported: +0.15. Refuted: -0.05 + salience cap. Disproved with high confidence: archive</p>
            <p className="text-amber-500 dark:text-amber-500 mt-1">Config: Lab Verification</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">9. Breakthrough Promotion</p>
            <p className="text-emerald-600 dark:text-emerald-400">Validated nodes promoted to weight 1.5. Parents +0.293, grandparents +0.177</p>
            <p className="text-emerald-500 dark:text-emerald-500 mt-1">Config: Validation</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-2">
            <p className="font-semibold text-red-700 dark:text-red-300 mb-1">10. Question Degradation</p>
            <p className="text-red-600 dark:text-red-400">Unanswered questions lose -0.25 per failed attempt, clamped to the global weight floor</p>
            <p className="text-red-500 dark:text-red-500 mt-1">Config: Question Cycle</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-2">
            <p className="font-semibold text-red-700 dark:text-red-300 mb-1">11. Dedup Attractor Decay</p>
            <p className="text-red-600 dark:text-red-400">Nodes repeatedly matched as duplicate targets: -0.02 per match. Prevents generic gravity wells</p>
            <p className="text-red-500 dark:text-red-500 mt-1">Config: Dedup Settings</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-2">
            <p className="font-semibold text-red-700 dark:text-red-300 mb-1">12. Lab Decompose</p>
            <p className="text-red-600 dark:text-red-400">When a claim is decomposed into facts + questions: original node -0.20 weight downgrade</p>
            <p className="text-red-500 dark:text-red-500 mt-1">Config: Lab Verification</p>
          </div>
        </div>
        <div className="mt-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded p-2">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong>Global bounds:</strong> All weight modifications are clamped to the <strong>weight floor</strong> (default 0.05, configurable in Weight Dynamics) and <strong>weight ceiling</strong> (default 3.0). No node can go below the floor or above the ceiling regardless of which pathway modifies it.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Domains & Partitions</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              <strong>Domains</strong> are string labels on nodes (e.g. "biology", "alignment", "architecture").
              They organize knowledge into logical groups.
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              <strong>Partitions</strong> group domains into isolated sets. Domains in different partitions never
              interact during synthesis cycles unless explicitly bridged. Cross-partition synthesis
              nodes get provenance domain naming showing which partitions were involved (e.g. "podbit&lt;x&gt;biology").
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              <strong>System partitions</strong> (marked with <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">system=1</code>) are
              internally isolated. They synthesize among their own nodes but cannot be bridged to user domains.
              Excluded from research cycles and health check warnings.
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Trajectory Classification</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Every <Link to="/help/synthesis" className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100">synthesis</Link> node is classified as <strong>knowledge</strong> (specific, factual) or <strong>abstraction</strong> (general, philosophical).
        </p>
        <div className="flex gap-4">
          <div className="flex-1 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded p-3">
            <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">Knowledge trajectory</p>
            <p className="text-xs text-green-600 dark:text-green-400">Contains numbers, technical terms (configurable per domain), specific details. Parents get weight boost.</p>
          </div>
          <div className="flex-1 bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded p-3">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Abstraction trajectory</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">General, philosophical content. Lower initial weight to prevent vague drift.</p>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h3 className="font-semibold text-blue-700 dark:text-blue-300 text-sm mb-2">Lineage Explorer</h3>
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
          Every node tracks its parent-child relationships through edges.
          The <strong>Lineage Explorer</strong> in the node detail panel shows immediate parents and children
          with one-click navigation. For deeper exploration, the <strong>Full Tree</strong> button opens a
          modal showing the complete ancestry and descent chain up to 4 generations deep.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Detail Panel (1-hop)</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              The sidebar Lineage Explorer shows direct parents (amber) and children (emerald) with
              type badges, content previews, and click-to-navigate. Available on every selected node.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-800 rounded p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Lineage Modal (multi-hop)</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Click the tree icon on any node card or the <strong>Full Tree</strong> link in the detail panel.
              The modal shows collapsible generation sections &mdash; parents, grandparents, great-grandparents
              above the trigger node, and children, grandchildren below. Sections with many nodes
              auto-collapse. Uses recursive CTE queries for efficient multi-depth traversal.
            </p>
          </div>
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-400">
          Knowledge graph lineage is a <strong>DAG</strong> (directed acyclic graph), not a tree &mdash; nodes
          can have multiple parents and many children. The lineage modal handles this with flat,
          section-based layout and deduplication by node ID across generations.
        </p>
      </div>

      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-700 dark:text-yellow-300 text-sm mb-2">Elite Verification Pool</h3>
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-2">
          Nodes that pass lab verification enter the <strong>elite pool</strong> &mdash; a curated
          set of high-confidence knowledge that undergoes <strong>generational synthesis</strong>. Elite nodes
          are paired with each other to produce progressively more refined and validated insights.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-800 rounded p-3">
            <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-1">Generational Progression</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              <strong>Gen 0:</strong> Lab-verified nodes entering the pool. <strong>Gen 1:</strong> Synthesis of two Gen 0
              nodes. <strong>Gen N:</strong> Synthesis of nodes from prior generations. Each generation produces increasingly
              distilled knowledge. The <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">elite_mapping</code> subsystem
              handles both content synthesis and manifest mapping LLM calls.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-800 rounded p-3">
            <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-1">Manifest Coverage</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              Elite nodes are mapped against the project manifest goals. The coverage report shows which research
              goals have verified evidence and which remain uncovered gaps. Terminal findings &mdash; nodes at the
              maximum generation &mdash; represent the most synthesized and validated knowledge in the graph.
            </p>
          </div>
        </div>
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
          View elite pool statistics, coverage reports, and gap analysis via the{' '}
          <Link to="/help/verification" className="underline decoration-yellow-300 hover:text-yellow-800 dark:hover:text-yellow-200">Verification</Link> page
          or the <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">podbit.elite</code> MCP tools
          (stats, coverage, gaps, candidates, nodes, terminals, rescan, demote).
        </p>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Breakthrough Registry</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
          Every breakthrough -whether promoted manually via MCP/GUI or discovered autonomously by the
          synthesis engine -is recorded in a <strong>shared registry</strong> that persists across project switches.
          This provides a permanent record of system performance regardless of which project is active.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-2">
          <div className="bg-white dark:bg-gray-900 border border-amber-100 dark:border-amber-800 rounded p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Dual Storage</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Breakthroughs live in both the project-specific <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">nodes</code> table
              and the shared <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">breakthrough_registry</code> table.
              The registry stores content snapshots (not references), so it is fully self-contained.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-amber-100 dark:border-amber-800 rounded p-3">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">What Gets Recorded</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Content snapshot, domain, partition, trajectory, all four validation scores (synthesis, novelty,
              testability, tension resolution), composite score, promotion source (manual/autonomous),
              parent node contents, project name, and promoter identity.
            </p>
          </div>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          View the registry via the <strong>Breakthroughs</strong> page in the sidebar. It shows global stats,
          a timeline chart, breakdowns by project and domain, and filterable breakthrough cards with expandable
          source material. The Dashboard also shows a global breakthrough count alongside the project count.
        </p>
      </div>
    </div>
  );
}

export default GraphSection;
