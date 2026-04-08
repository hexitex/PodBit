import { Link } from 'react-router-dom';

function ScalingDiagram() {
  const projects = [
    { label: 'Skincare', detail: '3.2K nodes' },
    { label: 'Codebase', detail: '2.0K nodes' },
    { label: 'Research', detail: '800 nodes' },
    { label: 'Recipes', detail: '450 nodes' },
    { label: 'Legal', detail: '1.1K nodes' },
    { label: 'ML Models', detail: '650 nodes' },
    { label: 'Client A', detail: '300 nodes' },
    { label: 'New...', detail: '0 nodes' },
  ];

  const cw = 130, ch = 52, gx = 16, gy = 16, cols = 4;
  const gw = cols * cw + (cols - 1) * gx;
  const vw = 650;
  const sx = Math.round((vw - gw) / 2);
  const r1 = 148, r2 = r1 + ch + gy;
  const colX = (c) => sx + c * (cw + gx);
  const colCX = (c) => colX(c) + cw / 2;

  return (
    <svg viewBox={`0 0 ${vw} ${r2 + ch + 28}`} className="w-full max-w-2xl mx-auto" role="img"
      aria-label="Project sharding  - each project is an independent SQLite file">
      <defs>
        <marker id="arrow-loaded" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
        </marker>
      </defs>

      {/* Title */}
      <text x={vw / 2} y="20" textAnchor="middle"
        className="text-sm font-bold fill-gray-700 dark:fill-gray-300">
        Project Sharding  - Load &amp; Switch
      </text>

      {/* Server box */}
      <rect x="200" y="36" width="250" height="44" rx="8"
        fill="#10b981" fillOpacity="0.1" stroke="#10b981" strokeWidth="1.5" />
      <text x={vw / 2} y="55" textAnchor="middle"
        className="text-xs font-semibold fill-emerald-700 dark:fill-emerald-400">
        Podbit Server
      </text>
      <text x={vw / 2} y="70" textAnchor="middle"
        className="text-xs fill-emerald-600 dark:fill-emerald-500" opacity="0.8">
        One project loaded at a time
      </text>

      {/* Arrow from server to active project */}
      <path
        d={`M ${vw / 2 - 60} 80 C ${vw / 2 - 60} 116, ${colCX(0)} 116, ${colCX(0)} ${r1 - 4}`}
        stroke="#10b981" strokeWidth="2" fill="none" markerEnd="url(#arrow-loaded)"
      />

      {/* Project cards  - 2 rows of 4 */}
      {projects.map((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = colX(col);
        const y = row === 0 ? r1 : r2;
        const cx = colCX(col);
        const active = i === 0;

        return (
          <g key={i} opacity={active ? 1 : 0.6}>
            <rect x={x} y={y} width={cw} height={ch} rx="6"
              fill={active ? '#10b981' : '#94a3b8'} fillOpacity={active ? 0.15 : 0.04}
              stroke={active ? '#10b981' : '#cbd5e1'} strokeWidth={active ? 2.5 : 0.8}
              className={active ? '' : 'dark:stroke-gray-600'}
            />
            {active && <circle cx={x + 14} cy={y + 14} r="4" fill="#10b981" />}
            <text x={cx} y={y + 18} textAnchor="middle"
              className={`text-xs font-semibold ${active
                ? 'fill-emerald-700 dark:fill-emerald-400'
                : 'fill-gray-600 dark:fill-gray-400'}`}>
              {p.label}
            </text>
            <text x={cx} y={y + 33} textAnchor="middle"
              className="text-xs fill-gray-500 dark:fill-gray-400">
              {p.detail}
            </text>
            <text x={cx} y={y + 46} textAnchor="middle"
              className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '9px' }}>
              .db file
            </text>
          </g>
        );
      })}

      {/* Footer */}
      <text x={vw / 2} y={r2 + ch + 18} textAnchor="middle"
        className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '10px' }}>
        data/projects/  - each project is a separate database file on disk
      </text>
    </svg>
  );
}

function NodeDiagram() {
  const fields = [
    { label: 'id', value: 'a3f7c...', color: '#6b7280' },
    { label: 'content', value: '"Transfer learn..."', color: '#0ea5e9' },
    { label: 'type', value: 'synthesis', color: '#8b5cf6' },
    { label: 'domain', value: 'context-design', color: '#10b981' },
    { label: 'weight', value: '1.42', color: '#f59e0b' },
    { label: 'salience', value: '0.87', color: '#f59e0b' },
    { label: 'embedding', value: 'Float32[768]', color: '#ef4444' },
  ];

  const mainX = 15, mainY = 34, mainW = 260, mainH = 195;
  const rightX = 400, rightW = 235;

  return (
    <svg viewBox="0 0 650 400" className="w-full max-w-2xl mx-auto" role="img"
      aria-label="Node anatomy  - how nodes connect via edges and embedding similarity">
      <defs>
        <marker id="arrow-parent" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
        </marker>
        <marker id="arrow-child" viewBox="0 0 10 10" refX="9" refY="5"
          markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
        </marker>
      </defs>

      {/* Title */}
      <text x="325" y="20" textAnchor="middle"
        className="text-sm font-bold fill-gray-700 dark:fill-gray-300">
        Node Anatomy &amp; Linking
      </text>

      {/* Main node card */}
      <rect x={mainX} y={mainY} width={mainW} height={mainH} rx="8"
        fill="#0ea5e9" fillOpacity="0.06" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x={mainX + mainW / 2} y={mainY + 18} textAnchor="middle"
        className="text-xs font-bold fill-sky-700 dark:fill-sky-400">
        Node
      </text>

      {/* Node fields */}
      {fields.map((f, i) => (
        <g key={f.label}>
          <text x={mainX + 18} y={mainY + 40 + i * 22}
            className="text-xs font-mono font-semibold" fill={f.color}>
            {f.label}
          </text>
          <text x={mainX + 115} y={mainY + 40 + i * 22}
            className="text-xs font-mono fill-gray-500 dark:fill-gray-400">
            {f.value}
          </text>
        </g>
      ))}

      {/* Parent node (top-right) */}
      <rect x={rightX} y="34" width={rightW} height="62" rx="6"
        fill="#8b5cf6" fillOpacity="0.1" stroke="#8b5cf6" strokeWidth="1" />
      <text x={rightX + rightW / 2} y="52" textAnchor="middle"
        className="text-xs font-bold fill-purple-700 dark:fill-purple-400">
        Parent Node
      </text>
      <text x={rightX + 12} y="68"
        className="text-xs fill-gray-500 dark:fill-gray-400 font-mono">
        &quot;RAG hallucination...&quot;
      </text>
      <text x={rightX + 12} y="82"
        className="text-xs fill-gray-500 dark:fill-gray-400 font-mono">
        weight: 1.88
      </text>

      {/* Edge: parent → main */}
      <line x1={rightX} y1="65" x2={mainX + mainW} y2="90"
        stroke="#8b5cf6" strokeWidth="1.5" markerEnd="url(#arrow-parent)" />
      <text x={(rightX + mainX + mainW) / 2} y="66" textAnchor="middle"
        className="text-xs font-semibold fill-purple-600 dark:fill-purple-400">
        edge
      </text>

      {/* Child node (mid-right) */}
      <rect x={rightX} y="132" width={rightW} height="62" rx="6"
        fill="#10b981" fillOpacity="0.1" stroke="#10b981" strokeWidth="1" />
      <text x={rightX + rightW / 2} y="150" textAnchor="middle"
        className="text-xs font-bold fill-emerald-700 dark:fill-emerald-400">
        Child Node (voiced)
      </text>
      <text x={rightX + 12} y="166"
        className="text-xs fill-gray-500 dark:fill-gray-400 font-mono">
        &quot;Combining LoRA...&quot;
      </text>
      <text x={rightX + 12} y="180"
        className="text-xs fill-gray-500 dark:fill-gray-400 font-mono">
        weight: 0.95
      </text>

      {/* Edge: main → child */}
      <line x1={mainX + mainW} y1="158" x2={rightX} y2="158"
        stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrow-child)" />
      <text x={(rightX + mainX + mainW) / 2} y="150" textAnchor="middle"
        className="text-xs font-semibold fill-emerald-600 dark:fill-emerald-400">
        edge
      </text>

      {/* Similar node  - embedding only, no stored edge */}
      <rect x={rightX} y="250" width={rightW} height="48" rx="6"
        fill="#f59e0b" fillOpacity="0.1" stroke="#f59e0b" strokeWidth="1" strokeDasharray="4 3" />
      <text x={rightX + rightW / 2} y="270" textAnchor="middle"
        className="text-xs font-bold fill-amber-700 dark:fill-amber-400">
        Similar Node (no edge)
      </text>
      <text x={rightX + 12} y="286"
        className="text-xs fill-gray-500 dark:fill-gray-400 font-mono">
        cosine similarity: 0.82
      </text>

      {/* Dashed similarity line */}
      <line x1={mainX + mainW - 15} y1={mainY + mainH} x2={rightX} y2="270"
        stroke="#f59e0b" strokeWidth="1" strokeDasharray="5 3" />
      <text x={(rightX + mainX + mainW - 15) / 2} y="242" textAnchor="middle"
        className="text-xs fill-amber-600 dark:fill-amber-400">
        similarity
      </text>

      {/* Legend */}
      <rect x="15" y="322" width="620" height="68" rx="6" fill="none"
        stroke="#e2e8f0" strokeWidth="0.5" className="dark:stroke-gray-700" />
      <text x="30" y="340"
        className="text-xs font-bold fill-gray-600 dark:fill-gray-400">
        Two ways nodes connect:
      </text>

      <line x1="30" y1="356" x2="62" y2="356" stroke="#8b5cf6" strokeWidth="2"
        markerEnd="url(#arrow-parent)" />
      <text x="72" y="360"
        className="text-xs fill-gray-600 dark:fill-gray-400">
        Explicit edge  - stored in edges table, created by synthesis. Depth-1 only.
      </text>

      <line x1="30" y1="376" x2="62" y2="376" stroke="#f59e0b" strokeWidth="2"
        strokeDasharray="5 3" />
      <text x="72" y="380"
        className="text-xs fill-gray-600 dark:fill-gray-400">
        Embedding similarity  - cosine distance at runtime. No stored edge.
      </text>
    </svg>
  );
}

/** Help section: project DB, system DB, backups, and scaling. */
export default function DatabaseSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Database & Scaling</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit uses SQLite as its storage engine  - not a dedicated graph database. This is a deliberate
          architectural choice that trades theoretical graph query power for simplicity, portability, and
          zero-ops deployment. Understanding the design helps you work with (not against) the system's strengths.
        </p>
      </div>

      <ScalingDiagram />

      {/* Node anatomy diagram */}
      <NodeDiagram />

      {/* What it is */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">What You Actually Have</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">
          A <strong>document store with an adjacency list</strong>. The <code className="mx-0.5 text-sky-700 dark:text-sky-300">nodes</code> table
          holds content and embeddings. The <code className="mx-0.5 text-sky-700 dark:text-sky-300">edges</code> table holds
          relationships (<code className="mx-0.5 text-sky-700 dark:text-sky-300">source_id, target_id, edge_type</code>).
          Graph operations are expressed as SQL JOINs, not native graph traversals.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Nodes table</p>
            <p className="text-sky-500 dark:text-sky-400">Content, embeddings (Float32Array BLOB), weight, salience, domain, type, keywords</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Edges table</p>
            <p className="text-sky-500 dark:text-sky-400">Parent/child relationships, tension sources. Queried via single self-join (depth 1)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Embeddings</p>
            <p className="text-sky-500 dark:text-sky-400">Stored as binary BLOBs (~4x smaller than JSON). Cosine similarity computed in JavaScript, not SQL</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-sky-700 dark:text-sky-300">Partitions & Bridges</p>
            <p className="text-sky-500 dark:text-sky-400">Domain isolation via partition tables. Bridges allow cross-domain synthesis between specific partitions</p>
          </div>
        </div>
      </div>

      {/* Project Sharding */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Project Sharding</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          Each project is a <strong>completely separate SQLite database file</strong> in <code className="mx-0.5 text-emerald-700 dark:text-emerald-300">data/projects/</code>.
          When you switch projects, the server closes the current DB connection and opens a new one. This is the
          primary scaling mechanism  - node counts, embedding comparisons, and all O(n²) operations are
          scoped to a single project.
        </p>
        <div className="space-y-2 text-xs text-emerald-600 dark:text-emerald-400">
          <div className="flex items-start gap-2">
            <span className="font-bold text-emerald-700 dark:text-emerald-300 mt-px">Isolation:</span>
            <span>Projects share nothing. Different nodes, different domains, different partitions, different synthesis history. A project about skincare formulations has zero interaction with one about software architecture.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-emerald-700 dark:text-emerald-300 mt-px">Portability:</span>
            <span>Each project is a single <code className="mx-0.5 text-emerald-700 dark:text-emerald-300">.db</code> file. Copy it, back it up, move it to another machine. The partition export/import system also allows sharing individual domain partitions between projects.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-emerald-700 dark:text-emerald-300 mt-px">Working directory mapping:</span>
            <span>Projects can be mapped to filesystem paths. The <code className="mx-0.5 text-emerald-700 dark:text-emerald-300">podbit.projects(action: "ensure")</code> MCP tool auto-detects and switches to the correct project based on your working directory  - zero manual switching.</span>
          </div>
        </div>
      </div>

      {/* Why not a real graph DB */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Why Not a Real Graph Database?</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          A dedicated graph database (Neo4j, DGraph, etc.) would add expressive query power but introduces
          significant operational complexity that doesn't pay for itself at Podbit's scale and workload pattern.
        </p>
        <div className="space-y-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-amber-700 dark:text-amber-300">Deployment complexity</p>
            <p className="text-amber-500 dark:text-amber-400">
              SQLite is embedded  - zero setup, zero daemon, zero network. A graph DB requires a separate server
              process, configuration, auth, connection pooling, and monitoring. Podbit is designed to run from
              a single <code className="mx-0.5 text-amber-700 dark:text-amber-300">npm start</code>.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-amber-700 dark:text-amber-300">Project sharding doesn't map</p>
            <p className="text-amber-500 dark:text-amber-400">
              Podbit's per-project isolation model means "switch project = swap DB file". With a graph DB, you'd
              need named graphs or multi-tenancy within a single instance  - more code, more config, harder to
              backup and restore individual projects.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-amber-700 dark:text-amber-300">Graph queries we don't need</p>
            <p className="text-amber-500 dark:text-amber-400">
              Synthesis doesn't traverse the graph  - it samples random pairs by salience weight. Tensions
              compare embedding similarity, not graph structure. The most "graph-like" operation is lineage
              (parent/child), which is a single self-join. Multi-hop traversal ("what chain of ideas led to
              this breakthrough") would be nice but isn't core to how the system works.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-700">
            <p className="font-medium text-amber-700 dark:text-amber-300">The bottleneck is LLM calls, not queries</p>
            <p className="text-amber-500 dark:text-amber-400">
              A synthesis cycle spends 2-10 seconds waiting for LLM responses and ~5ms on database queries.
              Even with O(n²) tension detection at 200 candidates (~20K comparisons), the cosine similarity
              loop takes under 100ms. Making queries faster would shave milliseconds off operations dominated
              by seconds of LLM latency.
            </p>
          </div>
        </div>
      </div>

      {/* What we lack */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">What a Graph DB Would Add</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          These are genuine capabilities missing from the current SQLite-based model. They're "nice to have"
          at current scale, but would become meaningful at 50K+ nodes per project.
        </p>
        <div className="space-y-1.5 text-xs text-purple-600 dark:text-purple-400">
          <div className="flex items-start gap-2">
            <span className="font-bold text-purple-700 dark:text-purple-300 shrink-0">Multi-hop lineage:</span>
            <span>Currently depth-1 only (direct parents/children). A graph DB could trace "show me the full synthesis ancestry chain of this breakthrough" in a single query. Currently requires application-level recursion.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-purple-700 dark:text-purple-300 shrink-0">Path discovery:</span>
            <span>"What connects concept A to concept B through intermediate syntheses?"  - shortest path queries are native to graph DBs, impossible in flat SQL without recursive CTEs.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-purple-700 dark:text-purple-300 shrink-0">Pattern traversal:</span>
            <span>Abstract pattern siblings currently finds 2-hop connections (node → pattern → sibling). Deeper chains (A shares P1 with B, B shares P2 with C) can't be queried.</span>
          </div>
        </div>
      </div>

      {/* Why not sqlite-vec */}
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">Why Not sqlite-vec?</h3>
        <p className="text-xs text-red-600 dark:text-red-400 mb-3">
          <strong>sqlite-vec</strong> is a native C extension that adds vector similarity indexing to SQLite.
          It would replace the brute-force cosine similarity loop with ANN (approximate nearest neighbor)
          search. We don't use it because:
        </p>
        <div className="space-y-1.5 text-xs text-red-600 dark:text-red-400">
          <div className="flex items-start gap-2">
            <span className="font-bold text-red-700 dark:text-red-300 shrink-0">Windows DLL loading:</span>
            <span>
              The pre-compiled <code className="mx-0.5 text-red-700 dark:text-red-300">vec0.dll</code> fails to load on Windows 11 with
              "The specified module could not be found" errors due to compiler mismatches between the SQLite
              build in better-sqlite3 and the separately-compiled extension. Since Podbit targets Windows as a
              primary platform, an extension that fails on Windows is a non-starter.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-red-700 dark:text-red-300 shrink-0">Not yet needed:</span>
            <span>
              At current node counts (low thousands per project), brute-force cosine similarity across 200
              candidates takes under 100ms. The ceiling where ANN indexing becomes necessary is around
              50K+ nodes per project, which project sharding makes unlikely to reach.
            </span>
          </div>
        </div>
      </div>

      {/* Scaling numbers */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Scaling Numbers</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Operations fall into three scaling classes. The O(n²) operations use capped candidate pools  - they
          never see more than the configured limit regardless of total node count.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                <th className="py-1.5 pr-3 font-semibold text-gray-700 dark:text-gray-300">Operation</th>
                <th className="py-1.5 pr-3 font-semibold text-gray-700 dark:text-gray-300">Complexity</th>
                <th className="py-1.5 pr-3 font-semibold text-gray-700 dark:text-gray-300">Candidate Cap</th>
                <th className="py-1.5 font-semibold text-gray-700 dark:text-gray-300">Notes</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-400">
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3">Node CRUD, config, prompts</td>
                <td className="py-1.5 pr-3 font-mono">O(1)</td>
                <td className="py-1.5 pr-3"> -</td>
                <td className="py-1.5">Unlimited</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3">Knowledge queries, compress, context</td>
                <td className="py-1.5 pr-3 font-mono">O(n)</td>
                <td className="py-1.5 pr-3"> -</td>
                <td className="py-1.5">Indexed queries, fast at 100K+</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3">Synthesis node sampling</td>
                <td className="py-1.5 pr-3 font-mono">O(n)</td>
                <td className="py-1.5 pr-3">200</td>
                <td className="py-1.5">Salience-weighted random, single query</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3">Tension detection</td>
                <td className="py-1.5 pr-3 font-mono">O(n²)</td>
                <td className="py-1.5 pr-3">200</td>
                <td className="py-1.5">~20K pairwise comparisons = ~100ms</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3">Dedup clustering</td>
                <td className="py-1.5 pr-3 font-mono">O(n²)</td>
                <td className="py-1.5 pr-3">200/domain</td>
                <td className="py-1.5">Union-find in JavaScript, per-domain</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3">LLM synthesis call</td>
                <td className="py-1.5 pr-3 font-mono">O(1)</td>
                <td className="py-1.5 pr-3"> -</td>
                <td className="py-1.5 font-semibold text-amber-600 dark:text-amber-400">2-10s per call  - the real bottleneck</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Capacity table */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Per-Project Capacity</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Because projects shard into separate databases, these limits are per project, not global.
          You can have dozens of projects at any size with zero cross-project interference.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left border-b border-gray-200 dark:border-gray-700">
                <th className="py-1.5 pr-3 font-semibold text-gray-700 dark:text-gray-300">Nodes Per Project</th>
                <th className="py-1.5 pr-3 font-semibold text-gray-700 dark:text-gray-300">Status</th>
                <th className="py-1.5 font-semibold text-gray-700 dark:text-gray-300">Notes</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-400">
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3 font-semibold">&lt; 5,000</td>
                <td className="py-1.5 pr-3"><span className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded text-xs">Comfortable</span></td>
                <td className="py-1.5">Everything works as designed. Default candidate limits are optimal.</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3 font-semibold">5,000 – 20,000</td>
                <td className="py-1.5 pr-3"><span className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded text-xs">Fine with tuning</span></td>
                <td className="py-1.5">Raise candidate limits to 500-1000 for better tension/dedup coverage. O(n²) still under 3s.</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-700">
                <td className="py-1.5 pr-3 font-semibold">20,000 – 50,000</td>
                <td className="py-1.5 pr-3"><span className="px-1.5 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded text-xs">Needs care</span></td>
                <td className="py-1.5">Higher candidate limits start adding seconds. Consider domain pre-filtering or project splitting.</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 font-semibold">50,000+</td>
                <td className="py-1.5 pr-3"><span className="px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded text-xs">Needs vector index</span></td>
                <td className="py-1.5">Brute-force cosine becomes impractical. Would need ANN indexing or significant architectural changes.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Domain-scoped thinking */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Why These Numbers Work</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3">
          The candidate limits sound small (200 out of thousands) but they make sense because of how the system is designed:
        </p>
        <div className="space-y-2 text-xs text-indigo-600 dark:text-indigo-400">
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-700 dark:text-indigo-300 shrink-0">Domain partitioning:</span>
            <span>
              Nodes are organized into domains, which are grouped into partitions. Synthesis, tensions, and dedup
              operate within partition boundaries. If your project has 5 domains averaging 400 nodes each, the
              effective working set for O(n²) operations is 400  - well within the candidate cap.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-700 dark:text-indigo-300 shrink-0">Weight ordering:</span>
            <span>
              Candidate pools are sorted by weight DESC before capping. High-weight nodes (frequently validated,
              highly connected) are always included. Low-weight nodes that haven't proven valuable are the ones
              dropped  - exactly the ones least likely to produce useful tensions or be worth deduplicating.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-700 dark:text-indigo-300 shrink-0">Salience decay:</span>
            <span>
              Nodes that have already been synthesized have their salience reduced, making them less likely to be
              sampled again. This naturally rotates the candidate pool through the full graph over time, even with
              a small per-cycle cap.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-indigo-700 dark:text-indigo-300 shrink-0">LLM cost dominates:</span>
            <span>
              Each synthesis cycle makes 1-3 LLM calls costing $0.001–$0.05 and taking 2-10 seconds. Doubling
              the candidate pool from 200 to 400 adds ~60ms of comparison time but zero additional LLM cost.
              The bottleneck is always the model, never the database.
            </span>
          </div>
        </div>
      </div>

      {/* Storage */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Storage Per Node</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Each node consumes approximately 6-10 KB of database storage depending on content length and embedding dimensions.
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-gray-100 dark:border-gray-700 text-center">
            <p className="font-semibold text-gray-700 dark:text-gray-300">Content + metadata</p>
            <p className="text-gray-500 dark:text-gray-400">~1-2 KB</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-gray-100 dark:border-gray-700 text-center">
            <p className="font-semibold text-gray-700 dark:text-gray-300">Embedding BLOB</p>
            <p className="text-gray-500 dark:text-gray-400">~3-6 KB</p>
            <p className="text-gray-400 dark:text-gray-500">(768-1536 × 4 bytes)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-gray-100 dark:border-gray-700 text-center">
            <p className="font-semibold text-gray-700 dark:text-gray-300">10K nodes</p>
            <p className="text-gray-500 dark:text-gray-400">~60-100 MB</p>
            <p className="text-gray-400 dark:text-gray-500">(trivial on disk)</p>
          </div>
        </div>
      </div>

      {/* O(n²) Pitfalls */}
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">What Happens When You Exceed the Limits</h3>
        <p className="text-xs text-red-600 dark:text-red-400 mb-3">
          The candidate caps (default 200) are safety valves. Here's what goes wrong if you raise them too
          aggressively or accumulate too many nodes in a single domain:
        </p>
        <div className="space-y-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-red-100 dark:border-red-700">
            <p className="font-medium text-red-700 dark:text-red-300">Tension detection freezes the UI</p>
            <p className="text-red-500 dark:text-red-400">
              At 1,000 candidates: ~500K pairwise comparisons (~2-3 seconds). At 5,000: ~12.5M comparisons (~30-60 seconds).
              The tension scan runs synchronously in the request handler  - during this time, the API is unresponsive.
              Users clicking "Find Tensions" in the GUI will see a spinning loader that never resolves if the candidate
              pool is too large.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-red-100 dark:border-red-700">
            <p className="font-medium text-red-700 dark:text-red-300">Dedup becomes unreliable</p>
            <p className="text-red-500 dark:text-red-400">
              With a 200-node cap on a 10K-node domain, dedup only sees 2% of the graph per run. Duplicates
              outside the top-200 by weight are invisible. You'll see duplicate content persist across runs
              because the candidates rotate slowly. The fix is to run dedup multiple times or raise the limit,
              but raising it hits the O(n²) wall.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-red-100 dark:border-red-700">
            <p className="font-medium text-red-700 dark:text-red-300">Memory pressure from embedding loading</p>
            <p className="text-red-500 dark:text-red-400">
              Each candidate loads its embedding vector into memory (~3-6 KB per node). At 5,000 candidates
              that's ~15-30 MB of Float32Arrays held simultaneously during comparison. Not catastrophic, but
              combined with the O(n²) loop, it creates sustained memory and CPU pressure that can slow other
              operations running concurrently (synthesis cycles, proxy requests).
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-red-100 dark:border-red-700">
            <p className="font-medium text-red-700 dark:text-red-300">Synthesis quality doesn't improve</p>
            <p className="text-red-500 dark:text-red-400">
              The synthesis engine only picks 2 nodes per cycle. A larger candidate pool doesn't produce
              better pairs  - the salience-weighted random sampling already favours high-value nodes. The pool
              just needs to be large enough to avoid repeatedly pairing the same nodes. For most domains,
              200 provides enough diversity.
            </p>
          </div>
        </div>
      </div>

      {/* Partition Export & Sharing */}
      <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg p-4">
        <h3 className="font-semibold text-violet-700 dark:text-violet-300 text-sm mb-2">Partition Export, Import & Sharing</h3>
        <p className="text-xs text-violet-600 dark:text-violet-400 mb-3">
          Partitions are the portable unit of knowledge. While projects are complete databases, partitions
          can be <strong>exported and imported individually</strong>  - making them the mechanism for sharing
          domain knowledge between projects or between users.
        </p>
        <div className="space-y-2 text-xs text-violet-600 dark:text-violet-400">
          <div className="flex items-start gap-2">
            <span className="font-bold text-violet-700 dark:text-violet-300 shrink-0">Export:</span>
            <span>
              <code className="mx-0.5 text-violet-700 dark:text-violet-300">podbit.partitions(action: "export", id: "...", owner: "rob")</code>  -
              Serializes a partition with all its domains, active nodes (without embeddings), edges, and bridge
              configuration into a portable JSON structure. The owner tag prefixes the partition ID on import
              to prevent naming collisions.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-violet-700 dark:text-violet-300 shrink-0">Import:</span>
            <span>
              <code className="mx-0.5 text-violet-700 dark:text-violet-300">podbit.partitions(action: "import", data: &#123;...&#125;)</code>  -
              Ingests an exported partition into the current project. Nodes get fresh embeddings generated
              on import. Use <code className="mx-0.5 text-violet-700 dark:text-violet-300">overwrite: true</code> to
              replace an existing partition with the same name.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-violet-700 dark:text-violet-300 shrink-0">Use cases:</span>
            <span>
              Share curated domain knowledge across teams. Build a "skincare ingredients" partition once,
              export it, and import it into multiple product-specific projects. Each project gets an independent
              copy that can diverge through its own synthesis cycles.
            </span>
          </div>
        </div>
      </div>

      {/* Central Repository Vision */}
      <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
        <h3 className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-2">Future: Central Partition Repository</h3>
        <p className="text-xs text-teal-600 dark:text-teal-400 mb-3">
          The partition export/import system is the foundation for a larger capability: a <strong>shared
          knowledge marketplace</strong> where curated partitions can be published, discovered, and imported
          by any Podbit instance.
        </p>
        <div className="space-y-2 text-xs text-teal-600 dark:text-teal-400">
          <div className="flex items-start gap-2">
            <span className="font-bold text-teal-700 dark:text-teal-300 shrink-0">Central repo:</span>
            <span>
              A shared registry of partition exports  - like npm for knowledge. Teams publish curated domains
              ("skincare-ingredients-v3", "react-patterns-2026", "pharmaceutical-regulations"). Other instances
              pull and import them as starting points for their own projects.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-teal-700 dark:text-teal-300 shrink-0">Versioning:</span>
            <span>
              Partition exports are snapshots. A central repo could track versions  - re-export after a round
              of synthesis and publish v2 with new insights. Consumers choose when to update, and imports
              create independent copies so local changes are never overwritten.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-teal-700 dark:text-teal-300 shrink-0">Larger model context:</span>
            <span>
              Larger AI tools and orchestration platforms could consume partition exports as structured domain
              knowledge  - pre-built expert context that bootstraps any LLM with curated, weighted, and
              synthesis-validated knowledge about a specific domain. The <code className="mx-0.5 text-teal-700 dark:text-teal-300">podbit.compress</code> output
              is already designed for this: a dense system prompt distilled from graph knowledge.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-bold text-teal-700 dark:text-teal-300 shrink-0">Cross-instance synthesis:</span>
            <span>
              Two teams working on related domains could bridge their partitions via export/import, run
              synthesis cycles independently, and periodically re-share their partitions. Each instance evolves
              the shared knowledge in its own direction, and the best insights propagate through re-imports.
            </span>
          </div>
        </div>
      </div>

      {/* Merkle DAG Integrity */}
      <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
        <h3 className="font-semibold text-green-700 dark:text-green-300 text-sm mb-2">Merkle DAG Integrity</h3>
        <p className="text-xs text-green-600 dark:text-green-400 mb-3">
          Every node has a <strong>content hash</strong> (SHA-256) computed from its immutable identity fields:
          content, node_type, contributor, created_at, and sorted parent hashes. This creates a
          Merkle DAG &mdash; any change to a node or its ancestry chain changes the hash, making
          tampering detectable.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 border border-green-100 dark:border-green-700 rounded p-3">
            <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">Integrity Log</p>
            <p className="text-xs text-green-600 dark:text-green-400">
              A tamper-evident hash chain records every node lifecycle event (created, parents_linked, edited,
              promoted, archived, junked). Each entry includes a <code className="bg-green-100 dark:bg-green-900/30 px-1 rounded">prev_log_hash</code>,
              making the log itself immutable &mdash; inserting or deleting entries breaks the chain.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-green-100 dark:border-green-700 rounded p-3">
            <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1">Merkle Root & Export</p>
            <p className="text-xs text-green-600 dark:text-green-400">
              Each partition has a <code className="bg-green-100 dark:bg-green-900/30 px-1 rounded">merkle_root</code> computed
              at export time from all active node hashes. Import verifies the root and warns on mismatch (but does
              not reject &mdash; interoperability over strictness). Partition exports include format version 1.1
              with integrity metadata.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 border border-green-100 dark:border-green-700 rounded p-2 text-center">
            <p className="font-semibold text-green-700 dark:text-green-300">IntegrityBadge</p>
            <p className="text-green-600 dark:text-green-400">GUI shows green (verified), yellow (no hash), red (mismatch), gray (loading)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-green-100 dark:border-green-700 rounded p-2 text-center">
            <p className="font-semibold text-green-700 dark:text-green-300">Two-Phase Hashing</p>
            <p className="text-green-600 dark:text-green-400">Nodes created without parents first, hash recomputed after edges are linked</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-green-100 dark:border-green-700 rounded p-2 text-center">
            <p className="font-semibold text-green-700 dark:text-green-300">Immutable Fields Only</p>
            <p className="text-green-600 dark:text-green-400">Weight, salience, domain, lifecycle_state are NOT hashed &mdash; they change legitimately</p>
          </div>
        </div>
      </div>

      {/* Related pages */}
      <div className="text-xs text-gray-500 dark:text-gray-400 pt-2 border-t border-gray-200 dark:border-gray-700">
        <p className="font-semibold mb-1">Related:</p>
        <div className="flex gap-3">
          <Link to="/help/architecture" className="text-podbit-600 dark:text-podbit-400 hover:underline">Architecture</Link>
          <Link to="/help/graph" className="text-podbit-600 dark:text-podbit-400 hover:underline">Knowledge Graph</Link>
          <Link to="/help/synthesis" className="text-podbit-600 dark:text-podbit-400 hover:underline">Synthesis Engine</Link>
          <Link to="/help/data" className="text-podbit-600 dark:text-podbit-400 hover:underline">Data Management</Link>
          <Link to="/help/config" className="text-podbit-600 dark:text-podbit-400 hover:underline">Configuration</Link>
        </div>
      </div>
    </div>
  );
}
