import React from 'react';
import { Link } from 'react-router-dom';

function SynthesisCycleDiagram() {
  const steps = [
    { label: 'Sample', desc: 'Pick 2+ nodes', desc2: 'by salience', color: '#0ea5e9' },
    { label: 'Resonate', desc: 'Cosine similarity', desc2: 'in 0.3–0.85 band', color: '#8b5cf6' },
    { label: 'Gate', desc: 'Above threshold?', desc2: '(default 0.5)', color: '#f59e0b' },
    { label: 'Voice', desc: 'LLM synthesizes', desc2: 'connection', color: '#10b981' },
    { label: 'Quality', desc: '10 quality gates', desc2: 'filter bad output', color: '#ef4444' },
    { label: 'Create', desc: 'New child node', desc2: 'with parent edges', color: '#6366f1' },
  ];

  return (
    <svg viewBox="0 0 940 180" className="w-full mx-auto" role="img" aria-label="Synthesis cycle flow">
      <defs>
        <marker id="arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {steps.map((s, i) => {
        const x = 10 + i * 153;
        return (
          <g key={s.label}>
            <rect x={x} y="15" width="133" height="65" rx="8" fill={s.color} opacity="0.12" stroke={s.color} strokeWidth="1.5" />
            <text x={x + 67} y="36" textAnchor="middle" className="text-xs font-semibold" fill={s.color}>{s.label}</text>
            <text x={x + 67} y="52" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">{s.desc}</text>
            <text x={x + 67} y="65" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">{s.desc2}</text>
            {i < steps.length - 1 && (
              <line x1={x + 136} y1="47" x2={x + 150} y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow2)" />
            )}
          </g>
        );
      })}

      {/* Reject branch from Quality gate */}
      <line x1="689" y1="80" x2="689" y2="105" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
      <text x="689" y="118" textAnchor="middle" className="text-xs fill-red-400 dark:fill-red-500">reject</text>

      {/* Loop back arrow */}
      <path d="M 908 80 C 928 95, 928 142, 890 147 C 760 152, 120 152, 67 147 C 30 142, 20 112, 35 92" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow2)" />
      <text x="470" y="170" textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">Repeat (configurable cycle delay)</text>
    </svg>
  );
}

function ConsultantPipelineDiagram() {
  const steps = [
    { label: 'Sample', desc: 'Pick 2+ nodes', desc2: 'by salience', color: '#0ea5e9' },
    { label: 'Resonate', desc: 'Cosine similarity', desc2: 'in threshold band', color: '#8b5cf6' },
    { label: 'Voice', desc: 'LLM synthesizes', desc2: 'connection', color: '#10b981' },
    { label: 'Judge', desc: 'Consultant LLM', desc2: 'single-pass review', color: '#f59e0b' },
    { label: 'Filter', desc: 'Redundancy, dedup', desc2: 'junk, specificity', color: '#ef4444' },
    { label: 'Create', desc: 'New child node', desc2: 'with parent edges', color: '#6366f1' },
  ];

  return (
    <svg viewBox="0 0 940 180" className="w-full mx-auto" role="img" aria-label="Consultant pipeline flow">
      <defs>
        <marker id="arrow-cp" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {steps.map((s, i) => {
        const x = 10 + i * 153;
        return (
          <g key={s.label}>
            <rect x={x} y="15" width="133" height="65" rx="8" fill={s.color} opacity="0.12" stroke={s.color} strokeWidth="1.5" />
            <text x={x + 67} y="36" textAnchor="middle" className="text-xs font-semibold" fill={s.color}>{s.label}</text>
            <text x={x + 67} y="52" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">{s.desc}</text>
            <text x={x + 67} y="65" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">{s.desc2}</text>
            {i < steps.length - 1 && (
              <line x1={x + 136} y1="47" x2={x + 150} y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-cp)" />
            )}
          </g>
        );
      })}

      {/* Reject branch from Judge */}
      <line x1="536" y1="80" x2="536" y2="105" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 2" />
      <text x="536" y="118" textAnchor="middle" className="text-xs fill-amber-500 dark:fill-amber-400">reject</text>

      {/* Reject branch from Filter */}
      <line x1="689" y1="80" x2="689" y2="105" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
      <text x="689" y="118" textAnchor="middle" className="text-xs fill-red-400 dark:fill-red-500">reject</text>

      {/* Loop back arrow */}
      <path d="M 908 80 C 928 95, 928 142, 890 147 C 760 152, 120 152, 67 147 C 30 142, 20 112, 35 92" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-cp)" />
      <text x="470" y="170" textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">Repeat (configurable cycle delay)</text>
    </svg>
  );
}

function EvmPipelineDiagram() {
  const steps = [
    { label: 'Select', desc: 'Highest-weight', desc2: 'unverified node', color: '#8b5cf6' },
    { label: 'API Recon', desc: 'Pre-lab fact', desc2: 'checking', color: '#f59e0b' },
    { label: 'Extract Spec', desc: 'LLM reads claim', desc2: '(bias surface)', color: '#a855f7' },
    { label: 'Lab Submit', desc: 'HTTP to lab', desc2: 'server', color: '#0891b2' },
    { label: 'Lab Run', desc: 'Lab generates +', desc2: 'executes code', color: '#0891b2' },
    { label: 'Evaluate', desc: 'Data vs spec', desc2: 'criteria', color: '#10b981' },
    { label: 'Feedback', desc: 'Weight, taint', desc2: '& evidence', color: '#8b5cf6' },
  ];

  return (
    <svg viewBox="0 0 990 200" className="w-full mx-auto" role="img" aria-label="Lab verification pipeline with three-stage bias isolation">
      <defs>
        <marker id="evmArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Main pipeline boxes */}
      {steps.map((s, i) => {
        const x = 10 + i * 138;
        return (
          <g key={s.label}>
            <rect x={x} y="15" width="120" height="65" rx="8" fill={s.color} opacity="0.12" stroke={s.color} strokeWidth="1.5" />
            <text x={x + 60} y="36" textAnchor="middle" className="text-xs font-semibold" fill={s.color}>{s.label}</text>
            <text x={x + 60} y="52" textAnchor="middle" style={{ fontSize: '10px' }} className="fill-gray-500 dark:fill-gray-400">{s.desc}</text>
            <text x={x + 60} y="65" textAnchor="middle" style={{ fontSize: '10px' }} className="fill-gray-500 dark:fill-gray-400">{s.desc2}</text>
            {i < steps.length - 1 && (
              <line x1={x + 123} y1="47" x2={x + 135} y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#evmArrow)" />
            )}
          </g>
        );
      })}

      {/* "Not Reducible" branch from Extract Spec */}
      <line x1="356" y1="80" x2="356" y2="110" stroke="#ef4444" strokeWidth="1.2" markerEnd="url(#evmArrow)" />
      <rect x="296" y="115" width="120" height="30" rx="6" fill="#ef4444" opacity="0.1" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
      <text x="356" y="133" textAnchor="middle" style={{ fontSize: '10px', fontWeight: 600 }} fill="#ef4444">Not Reducible</text>
      <text x="356" y="158" textAnchor="middle" style={{ fontSize: '10px' }} className="fill-gray-400 dark:fill-gray-500">Tagged honestly — no fake verification</text>

      {/* Evaluate outcomes */}
      <line x1="830" y1="80" x2="830" y2="100" stroke="#94a3b8" strokeWidth="1" />
      <rect x="770" y="106" width="55" height="28" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="797" y="123" textAnchor="middle" style={{ fontSize: '10px', fontWeight: 600 }} fill="#10b981">Supported</text>
      <rect x="835" y="106" width="55" height="28" rx="6" fill="#ef4444" opacity="0.12" stroke="#ef4444" strokeWidth="1" />
      <text x="862" y="123" textAnchor="middle" style={{ fontSize: '10px', fontWeight: 600 }} fill="#ef4444">Refuted</text>
      <text x="830" y="150" textAnchor="middle" style={{ fontSize: '10px' }} className="fill-gray-400 dark:fill-gray-500">Confidence derived from data</text>

      {/* Stage labels */}
      <rect x="10" y="90" width="258" height="18" rx="4" fill="#a855f7" opacity="0.06" />
      <text x="139" y="102" textAnchor="middle" style={{ fontSize: '10px' }} fill="#a855f7">PODBIT (sees claim)</text>
      <rect x="424" y="90" width="258" height="18" rx="4" fill="#0891b2" opacity="0.06" />
      <text x="553" y="102" textAnchor="middle" style={{ fontSize: '10px' }} fill="#0891b2">LAB SERVER (never sees claim)</text>
      <rect x="700" y="90" width="280" height="18" rx="4" fill="#10b981" opacity="0.06" />
      <text x="840" y="102" textAnchor="middle" style={{ fontSize: '10px' }} fill="#10b981">PODBIT (never sees claim)</text>

      {/* Cycle loop */}
      <path d="M 963 47 C 985 55, 985 180, 945 185 C 870 190, 80 190, 40 185 C 15 180, 5 70, 20 50" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#evmArrow)" />
      <text x="490" y="195" textAnchor="middle" style={{ fontSize: '10px' }} className="fill-gray-400 dark:fill-gray-500">Next tick (intervalMs)</text>
    </svg>
  );
}

/** Help section: synthesis engine, cycles, consultant pipeline, lab verification. */
function SynthesisSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Synthesis Engine</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The synthesis engine is the core research loop. It runs autonomously, sampling pairs of knowledge nodes and
          using LLMs to discover connections, generate hypotheses, and surface contradictions.
          It operates in cycles, each following the same flow. <Link to="/help/graph" className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100">Partition</Link> boundaries are enforced  - nodes in
          different partitions never pair unless their partitions are bridged. Inspired by Genetic Algorithm
          theory, the engine supports <strong>multi-parent recombination</strong> (3-4 parents),{' '}
          <strong>niching</strong> (domain diversity protection), <strong>partition migration</strong>{' '}
          (island model cross-pollination), <strong>usage-based synthesis decay</strong> (fitness pressure),
          and <strong>quantum-inspired cluster selection</strong> (simulated annealing for optimal node groupings).
        </p>
      </div>

      {/* Pipeline Modes */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Pipeline Modes</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The synthesis pipeline has two modes, selectable per project. Both modes use the same pair selection
          and embedding-math gates. They differ in how <strong>meaning-judgment</strong> quality gates work.
        </p>
      </div>

      {/* Consultant Mode */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Consultant Mode (LLM-Judged)</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          A single comprehensive LLM call replaces 5 heuristic gates: claim provenance, hallucination detection,
          counterfactual independence, derivative check, and fitness grading. The consultant evaluates
          <strong> coherence</strong> (30%), <strong>grounding</strong> (25%), <strong>novelty</strong> (20%),
          <strong> specificity</strong> (15%), and <strong>forced analogy detection</strong> (10%) in one pass.
        </p>
        <ConsultantPipelineDiagram />
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
          <strong>Best for:</strong> Projects using a capable API model (Claude, GPT-4, DeepSeek-V3).
          Fewer tunable parameters, relies on model judgment for meaning-based quality decisions.
        </p>
      </div>

      {/* Heuristic Mode */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Heuristic Mode (Mechanical Gates)</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">
          All quality gates run as individual checks: novelty word counts, hallucination red-flag scoring,
          clause-level claim provenance, counterfactual domain independence, and fitness modifiers.
          100+ configurable parameters give full deterministic control.
        </p>
        <SynthesisCycleDiagram />
        <p className="text-xs text-sky-600 dark:text-sky-400 mt-3">
          <strong>Best for:</strong> Projects using local/weaker models, or when you want deterministic control
          over every quality decision. Each gate can be individually tuned and disabled.
        </p>
      </div>

      {/* Shared gates */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Gates Active in Both Modes</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400">
          These gates use pure math/embedding operations where an LLM adds no value:
          <strong> resonance band</strong> (cosine similarity),
          <strong> structural validation</strong> (vocabulary checks),
          <strong> truncation/word limits</strong> (string validation),
          <strong> redundancy ceiling</strong> (embedding distance to parents),
          <strong> dedup</strong> (embedding similarity to existing nodes),
          <strong> junk filter</strong> (similarity to known-bad content),
          <strong> specificity scoring</strong> (number/term counting),
          and <strong>compression</strong> (word substitution).
        </p>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Synthesis Cycle Flow</h3>
        <SynthesisCycleDiagram />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Two Modes</h3>
          <div className="space-y-3">
            <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-3">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">API Mode</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Calls LLMs directly to voice connections. Fully autonomous synthesis.
                Requires a local LLM (LM Studio / Ollama) or API key.
              </p>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded p-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">MCP Mode</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Queues discoveries for an AI agent to voice. The MCP tool podbit.pending
                returns queued pairs. The agent synthesizes and proposes the result.
              </p>
            </div>
          </div>
        </div>

        {/* MCP Mode Operations */}
        <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
          <h3 className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-2">MCP Mode Workflow</h3>
          <p className="text-xs text-teal-600 dark:text-teal-400 mb-3">
            In MCP mode, the synthesis engine finds resonating node pairs but does <strong>not</strong> call an LLM itself.
            Instead, it queues discoveries for an external AI agent (any MCP-compatible client) to process
            with full reasoning capabilities. Frontier models are recommended for best voicing quality.
            This gives you more control over synthesis and lets you choose which model voices each insight.
          </p>
          <ol className="text-xs text-teal-600 dark:text-teal-400 space-y-1.5 list-decimal list-inside mb-3">
            <li>Start the engine: <code className="bg-teal-100 dark:bg-teal-900/30 px-1 rounded">podbit.synthesis(action: "start", mode: "mcp")</code></li>
            <li>The engine samples node pairs, computes similarity, and queues matches above threshold</li>
            <li>Check for discoveries: <code className="bg-teal-100 dark:bg-teal-900/30 px-1 rounded">podbit.synthesis(action: "discoveries")</code></li>
            <li>For each pair, call <code className="bg-teal-100 dark:bg-teal-900/30 px-1 rounded">podbit.voice(nodeId)</code> to get voicing context</li>
            <li>Read both nodes, synthesize an insight connecting them</li>
            <li>Save: <code className="bg-teal-100 dark:bg-teal-900/30 px-1 rounded">podbit.propose(content, nodeType: "voiced", parentIds: [...])</code></li>
            <li>Clear processed pair: <code className="bg-teal-100 dark:bg-teal-900/30 px-1 rounded">podbit.synthesis(action: "clear", nodeAId, nodeBId)</code></li>
          </ol>
        </div>

        {/* MCP Cycle Management */}
        <div className="col-span-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <h3 className="font-semibold text-blue-700 dark:text-blue-300 text-sm mb-2">MCP Cycle Management</h3>
          <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
            All autonomous cycles (synthesis, validation, questions, tensions, research, autorating, lab verification) can be controlled
            via the <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">podbit.synthesis</code> MCP tool using
            the <strong>cycle_start</strong>, <strong>cycle_stop</strong>, and <strong>cycle_status</strong> actions.
            This allows any MCP-compatible AI agent to start, stop, and monitor all cycle types programmatically.
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div className="bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 rounded p-2">
              <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">Start a Cycle</p>
              <code className="text-[10px] text-blue-600 dark:text-blue-400 block">podbit.synthesis(action: "cycle_start", cycleType: "evm")</code>
              <p className="text-blue-500 dark:text-blue-500 mt-1">Persists enabled=true so the cycle survives server restarts.</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 rounded p-2">
              <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">Stop a Cycle</p>
              <code className="text-[10px] text-blue-600 dark:text-blue-400 block">podbit.synthesis(action: "cycle_stop", cycleType: "evm")</code>
              <p className="text-blue-500 dark:text-blue-500 mt-1">Persists enabled=false so the cycle stays stopped on restart.</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-blue-200 dark:border-blue-700 rounded p-2">
              <p className="font-semibold text-blue-700 dark:text-blue-300 mb-1">Cycle Status</p>
              <code className="text-[10px] text-blue-600 dark:text-blue-400 block">podbit.synthesis(action: "cycle_status")</code>
              <p className="text-blue-500 dark:text-blue-500 mt-1">Returns running state, cycle count, error count, and enabled flag for all cycles.</p>
            </div>
          </div>
          <p className="text-xs text-blue-500 dark:text-blue-500">
            Valid cycle types: <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">synthesis</code>,{' '}
            <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">validation</code>,{' '}
            <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">questions</code>,{' '}
            <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">tensions</code>,{' '}
            <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">research</code>,{' '}
            <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">autorating</code>,{' '}
            <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">evm</code>.
            The original synthesis engine actions (<code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">start</code>,{' '}
            <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">stop</code>,{' '}
            <code className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">status</code>) continue to work for the core synthesis engine only.
          </p>
        </div>

        {/* Research Supervisor Pattern */}
        <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
          <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">AI Research Supervisor Pattern</h3>
          <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-3">
            Any MCP-compatible AI tool (Cursor, Windsurf, VS Code agents, etc.) can act as a <strong>research supervisor</strong>  -
            orchestrating synthesis, validating outputs, tuning parameters, and curating the knowledge graph.
            Frontier models are recommended for supervisory roles. This gives you human-in-the-loop control
            while leveraging AI reasoning for the heavy lifting.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-900 border border-cyan-100 dark:border-cyan-700 rounded p-3">
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mb-1">Supervised Synthesis</p>
              <p className="text-xs text-cyan-600 dark:text-cyan-400">
                Run the engine in MCP mode and let the AI agent voice discoveries.
                Review the proposed nodes before they enter the graph. Reject or refine low-quality outputs
                with the agent's help. This produces higher-quality synthesis than fully autonomous API mode.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-cyan-100 dark:border-cyan-700 rounded p-3">
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mb-1">Autonomous Tuning</p>
              <p className="text-xs text-cyan-600 dark:text-cyan-400">
                Ask the agent to read metrics (<code className="bg-cyan-100 dark:bg-cyan-900/30 px-1 rounded">podbit.config(action: "metrics")</code>),
                diagnose issues, tune parameters, and monitor results. The agent can run
                observe-hypothesize-tune-verify loops across the full config surface.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-cyan-100 dark:border-cyan-700 rounded p-3">
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mb-1">Graph Curation</p>
              <p className="text-xs text-cyan-600 dark:text-cyan-400">
                Have the agent find tensions (<code className="bg-cyan-100 dark:bg-cyan-900/30 px-1 rounded">podbit.tensions</code>),
                generate research questions, validate breakthrough candidates, dedup the graph,
                and provide feedback on node quality  - all through MCP tools.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-cyan-100 dark:border-cyan-700 rounded p-3">
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mb-1">Cross-Domain Discovery</p>
              <p className="text-xs text-cyan-600 dark:text-cyan-400">
                Use <code className="bg-cyan-100 dark:bg-cyan-900/30 px-1 rounded">podbit.patterns</code> to find abstract
                connections across domains. The agent can identify structural patterns (e.g., "structure-vs-process gap")
                that bridge unrelated knowledge areas, tag nodes, and synthesize cross-domain insights.
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Tension Detection</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            Tensions are pairs of nodes with <strong>high embedding similarity</strong> but <strong>opposing claims</strong>.
            These contradictions often point to unknown knowledge or stale assumptions.
          </p>
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-3 mt-2">
            <p className="text-xs text-red-600 dark:text-red-400">
              Example: One node says "RLHF improves alignment" while another with similar
              embedding says "RLHF creates deceptive alignment". This tension generates a
              research question probing the contradiction.
            </p>
          </div>
        </div>
      </div>

      {/* Autonomous Cycle Types */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Autonomous Cycle Types</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          The engine runs eight different cycle types, each serving a distinct purpose in the knowledge lifecycle.
          Cycle scheduling is configurable per type.
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-2">
            <p className="font-semibold text-sky-700 dark:text-sky-300">Synthesis</p>
            <p className="text-sky-600 dark:text-sky-400">Sample node pairs, compute similarity, voice connections, create child nodes. The primary knowledge generation cycle.</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-2">
            <p className="font-semibold text-purple-700 dark:text-purple-300">Validation</p>
            <p className="text-purple-600 dark:text-purple-400">3-gate breakthrough pipeline: (1) composite scoring on synthesis/novelty/testability/tension, (2) frontier-model novelty gate checks if the insight is genuinely unknown, (3) lab verification gate checks claims against empirical data. All gates are fail-open.</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-2">
            <p className="font-semibold text-red-700 dark:text-red-300">Tensions</p>
            <p className="text-red-600 dark:text-red-400">Detect contradicting node pairs with high similarity but opposing claims. Seeds research questions.</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="font-semibold text-emerald-700 dark:text-emerald-300">Questions</p>
            <p className="text-emerald-600 dark:text-emerald-400">Generate research questions from tension pairs and knowledge gaps. Creates question-type nodes.</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="font-semibold text-amber-700 dark:text-amber-300">Research</p>
            <p className="text-amber-600 dark:text-amber-400">Autonomously generate foundational domain knowledge. Requires a project manifest. Embedding relevance gates reject off-topic seeds.</p>
          </div>
          <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded p-2">
            <p className="font-semibold text-teal-700 dark:text-teal-300">Autorating</p>
            <p className="text-teal-600 dark:text-teal-400">Autonomous quality scoring of new nodes on intake. Generates structured JSON ratings without human intervention. Uses the autorating subsystem.</p>
          </div>
          <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded p-2">
            <p className="font-semibold text-violet-700 dark:text-violet-300">Lab Verification</p>
            <p className="text-violet-600 dark:text-violet-400">Empirical verification via external lab servers. Podbit extracts experiment specs from claims, submits them to labs via HTTP, and evaluates returned data against spec criteria. Spec extraction classifies claims by testability. All testable categories run through the full pipeline automatically  - human review is post-hoc. Adjusts node weight based on results.</p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700 rounded p-2">
            <p className="font-semibold text-pink-700 dark:text-pink-300">Autonomous Voicing</p>
            <p className="text-pink-600 dark:text-pink-400">Persona-driven synthesis across 5 modes (object-following, sincere, cynic, pragmatist, child). Picks high-weight nodes, pairs them with related partners, and generates diverse voiced insights. Each node records which persona mode was used (<code className="bg-pink-100 dark:bg-pink-900/30 px-1 rounded">voice_mode</code>).</p>
          </div>
        </div>
      </div>

      {/* Breakthrough Validation Pipeline */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Breakthrough Validation Pipeline (3-Gate)</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          Before a node is marked as a "possible" breakthrough, it must pass three sequential gates.
          Each gate is <strong>fail-open</strong>: if the required subsystem is unassigned, the model errors,
          or the check can't run, the gate is skipped and the node proceeds. Only explicit rejection blocks promotion.
        </p>
        <div className="space-y-2">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-200 dark:bg-purple-800 border border-purple-400 dark:border-purple-600 flex items-center justify-center text-xs font-bold text-purple-700 dark:text-purple-300 flex-shrink-0 mt-0.5">1</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Composite Scoring (voice subsystem)</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                Scores the node on four dimensions: synthesis quality, novelty, testability, and tension resolution.
                A weighted composite score must exceed the <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">minCompositeForPromotion</code> threshold
                (default 6.5). This is the primary filter that most candidates fail.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-red-200 dark:bg-red-800 border border-red-400 dark:border-red-600 flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-300 flex-shrink-0 mt-0.5">2</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">Novelty Gate (breakthrough_check subsystem)</p>
              <p className="text-xs text-red-600 dark:text-red-400">
                A <strong>frontier-tier model</strong> configured as skeptical by default: "your DEFAULT position is that any claim is
                ALREADY WELL-KNOWN unless proven otherwise." Checks whether the insight is genuinely novel or just well-known
                textbook material being restated. Returns <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">novel: true/false</code> with
                confidence and reasoning. Assign a frontier model (Claude Opus, GPT-4o, DeepSeek R1, etc.) to the{' '}
                <strong>Breakthrough Check</strong> subsystem on the <Link to="/models" className="underline decoration-red-300 hover:text-red-800 dark:hover:text-red-200">Models page</Link>.
                Toggle: <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">validation.noveltyGateEnabled</code>.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-violet-200 dark:bg-violet-800 border border-violet-400 dark:border-violet-600 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-300 flex-shrink-0 mt-0.5">3</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Lab Verification Gate (spec_extraction subsystem)</p>
              <p className="text-xs text-violet-600 dark:text-violet-400">
                Runs the full lab verification pipeline on the candidate to detect fabricated claims.
                Only blocks if verification explicitly <strong>refutes</strong> the claims (<code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">verified: false</code>).
                Untestable claims, code errors, and skipped verifications all pass through  - only proven falsehoods block.
                Requires verification to be globally enabled and <code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">spec_extraction</code> assigned.
                Toggle: <code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">validation.evmGateEnabled</code>.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-3 bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-700 rounded p-3">
          <p className="text-xs text-purple-600 dark:text-purple-400">
            <strong>Audit trail:</strong> Each gate result is logged in <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">resonance_cycles.parameters</code> as JSON,
            including <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">noveltyGate</code> and <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">evmGate</code> fields.
            Blocked candidates show <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">blocked_by: 'novelty_gate'</code> or{' '}
            <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">blocked_by: 'evm_gate'</code>.
            Both gates can be toggled in <Link to="/config" className="underline decoration-purple-300 hover:text-purple-800 dark:hover:text-purple-200">Config</Link> → Breakthrough Scanner.
          </p>
        </div>
      </div>

      {/* Lab Verification Process */}
      <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg p-4">
        <h3 className="font-semibold text-violet-700 dark:text-violet-300 text-sm mb-2">Lab Verification Process</h3>
        <p className="text-xs text-violet-600 dark:text-violet-400 mb-3">
          The lab verification system autonomously submits claims to external lab servers for empirical testing.
          Each cycle tick processes one node through a multi-stage pipeline. The master switch (<code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">evm.enabled</code>)
          and the cycle switch (<code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">autonomousCycles.evm.enabled</code>) must both be on.
        </p>

        <div className="mb-4">
          <h4 className="text-xs font-semibold text-violet-600 dark:text-violet-400 mb-2">Pipeline Flow</h4>
          <EvmPipelineDiagram />
        </div>

        <div className="space-y-2 mb-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-violet-200 dark:bg-violet-800 border border-violet-400 dark:border-violet-600 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-300 flex-shrink-0 mt-0.5">1</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Candidate Selection</p>
              <p className="text-xs text-violet-600 dark:text-violet-400">
                Selects the highest-weight unverified node that: is above the weight threshold (default 0.7),
                is not a raw or question node, has no successful verification, has not exhausted retry attempts,
                and has not been attempted within the retry backoff window (default 5 min).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-violet-200 dark:bg-violet-800 border border-violet-400 dark:border-violet-600 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-300 flex-shrink-0 mt-0.5">2</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Spec Extraction, Tautology Check &amp; Falsifiability Review</p>
              <p className="text-xs text-violet-600 dark:text-violet-400">
                The <strong>spec_extraction</strong> subsystem reads the claim and lab capabilities to produce an experiment spec.
                Claim types are open-ended (labs define their own, e.g. numerical_identity, convergence_rate, training_performance, model_behavior).
                Claims that can't be reduced to an experiment spec are tagged "not reducible." Prior rejection reasons are
                injected to prevent flip-flopping. The spec then passes a <strong>structural tautology check</strong> (rejects
                specs with embedded code) and an optional <strong>adversarial falsifiability review</strong> (<code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">spec_review</code> subsystem —
                a second LLM checks for cherry-picked parameters).
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-orange-200 dark:bg-orange-800 border border-orange-400 dark:border-orange-600 flex items-center justify-center text-xs font-bold text-orange-700 dark:text-orange-300 flex-shrink-0 mt-0.5">3</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-300">API Reconnaissance (pre-lab)</p>
              <p className="text-xs text-orange-600 dark:text-orange-400">
                External APIs are checked before spec extraction  - correcting facts and validating entities so the spec
                extractor works with verified data, not hallucinated numbers. Post-lab API enrichment adds context to verified nodes.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-violet-200 dark:bg-violet-800 border border-violet-400 dark:border-violet-600 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-300 flex-shrink-0 mt-0.5">4</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Lab Execution (separate server)</p>
              <p className="text-xs text-violet-600 dark:text-violet-400">
                The experiment spec is submitted to an external lab server via HTTP. The lab generates code (using its own LLM
                and language), runs the experiment, and returns raw data plus file artifacts. The lab never sees the claim narrative.
                Nodes are frozen during lab execution  - excluded from synthesis, decay, and lifecycle sweeps.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-violet-200 dark:bg-violet-800 border border-violet-400 dark:border-violet-600 flex items-center justify-center text-xs font-bold text-violet-700 dark:text-violet-300 flex-shrink-0 mt-0.5">5</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">Data Evaluation & Weight Adjustment</p>
              <p className="text-xs text-violet-600 dark:text-violet-400">
                Raw data from the lab is evaluated against the spec's evaluation criteria. Confidence is derived
                from the data (e.g., relative difference vs tolerance). Supported nodes get a weight boost (default +0.15 x confidence).
                Refuted nodes get a penalty (default -0.05) and can be auto-archived. Results and evidence are stored for audit.
              </p>
            </div>
          </div>
        </div>

        {/* API Verification Pre-Step */}
        <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-3 mb-3">
          <h4 className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-2">API Verification &amp; Enrichment (Pre-Lab Step)</h4>
          <p className="text-xs text-teal-600 dark:text-teal-400 mb-2">
            When <code className="bg-teal-100 dark:bg-teal-900/30 px-1 rounded">evm.apiVerification.enabled</code> is on,
            external APIs (PubChem, UniProt, CrossRef, etc.) are queried <strong>before</strong> spec extraction.
            Each API has a <strong>mode</strong> that determines what happens with the response:
          </p>

          {/* Mode descriptions */}
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 text-center">
              <p className="font-semibold text-gray-700 dark:text-gray-300">Verify</p>
              <p className="text-gray-600 dark:text-gray-400">Fact-check claims against API data. Classify as correction, validation, or refutation.</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-2 text-center">
              <p className="font-semibold text-blue-700 dark:text-blue-300">Enrich</p>
              <p className="text-blue-600 dark:text-blue-400">Extract <strong>new knowledge</strong> from responses — synthesis routes, related compounds, properties — as new graph nodes.</p>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-2 text-center">
              <p className="font-semibold text-purple-700 dark:text-purple-300">Both</p>
              <p className="text-purple-600 dark:text-purple-400">Verify <strong>and</strong> enrich from the same API response — one HTTP call, two outputs.</p>
            </div>
          </div>

          {/* Verification impacts */}
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1.5">Verification Impacts</p>
          <div className="grid grid-cols-3 gap-2 text-xs mb-2">
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded p-2 text-center">
              <p className="font-semibold text-green-700 dark:text-green-300">Value Correction</p>
              <p className="text-green-600 dark:text-green-400">Number wrong, structure sound. Fix placeholder, small penalty, breeds normally.</p>
            </div>
            <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-2 text-center">
              <p className="font-semibold text-blue-700 dark:text-blue-300">Structural Validation</p>
              <p className="text-blue-600 dark:text-blue-400">Entities exist, reactions work. Fitness boost, breeds with confidence.</p>
            </div>
            <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-2 text-center">
              <p className="font-semibold text-red-700 dark:text-red-300">Structural Refutation</p>
              <p className="text-red-600 dark:text-red-400">Entity fabricated. Node marked non-breedable, skipped as synthesis parent.</p>
            </div>
          </div>

          {/* Enrichment detail */}
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded p-2 text-xs mb-2">
            <p className="font-semibold text-purple-700 dark:text-purple-300 mb-1">Enrichment Pipeline</p>
            <p className="text-purple-600 dark:text-purple-400 mb-2">
              When mode is <strong>enrich</strong> or <strong>both</strong> and{' '}
              <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">enrichmentEnabled</code> is on,
              an LLM extracts discrete factual claims from the API response. Enrichment is non-fatal: errors are logged but don't block verification.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-700 rounded p-2">
                <p className="font-semibold text-purple-700 dark:text-purple-300 mb-0.5">Inline Mode (default)</p>
                <p className="text-purple-600 dark:text-purple-400">
                  API-verified facts are <strong>appended to the source node</strong> as tagged lines:{' '}
                  <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">[API-verified via name]: fact</code>.
                  This preserves synthesis context  - the enriched node's embedding is regenerated to include the new knowledge,
                  keeping it in the same synthesis neighborhood. Falls back to children mode if content exceeds{' '}
                  <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">enrichmentMaxContentWords</code>.
                </p>
              </div>
              <div className="bg-white dark:bg-gray-900 border border-purple-200 dark:border-purple-700 rounded p-2">
                <p className="font-semibold text-purple-700 dark:text-purple-300 mb-0.5">Children Mode (legacy)</p>
                <p className="text-purple-600 dark:text-purple-400">
                  Each fact becomes a separate <strong>seed node</strong> linked as a child of the source.
                  Set <code className="bg-purple-100 dark:bg-purple-900/30 px-1 rounded">enrichmentMode: "children"</code> to use this.
                  Child nodes rely on embedding similarity alone for synthesis pairing  - they may lose the parent's synthesis context.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-teal-600 dark:text-teal-400">
            <strong>Pipeline:</strong> Decision Engine (with mode) → Query Formulation → API Call → Interpretation (verify path) + Extraction (enrich path) → Corrections + New Nodes → Lab Verification.
            Structural refutations skip lab verification entirely. Value corrections update number variables before spec extraction runs.
            API failures are non-fatal — lab verification proceeds with original values. Manage APIs via the{' '}
            <Link to="/api-registry" className="underline decoration-teal-300 hover:text-teal-800 dark:hover:text-teal-200">API Registry</Link> page.
            Configure in <Link to="/config" className="underline decoration-teal-300 hover:text-teal-800 dark:hover:text-teal-200">Config</Link> → API Verification (10 parameters).
          </p>
        </div>

        {/* Multi-Claim Iteration */}
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3 mb-3">
          <h4 className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">Multi-Claim Iteration</h4>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2">
            When <code className="bg-indigo-100 dark:bg-indigo-900/30 px-1 rounded">maxClaimsPerNode</code> is greater than 1,
            the lab verification iterates through multiple testable claims in a single node. After testing one claim, spec extraction is called again
            with guidance listing previously tested hypotheses, asking for a different claim. This continues until all claims
            are tested, the LLM signals "exhausted", or the maximum is reached.
          </p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded p-2">
              <p className="font-semibold text-indigo-700 dark:text-indigo-300">Why Multi-Claim?</p>
              <p className="text-indigo-600 dark:text-indigo-400">
                Synthesis nodes often contain multiple interrelated claims. Single-claim verification
                only tests one. Decomposing the node into children loses synthesis context. Multi-claim
                keeps the node intact while testing all its claims.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded p-2">
              <p className="font-semibold text-indigo-700 dark:text-indigo-300">Aggregation</p>
              <p className="text-indigo-600 dark:text-indigo-400">
                If <strong>any</strong> claim is disproved, the node is disproved.
                If <strong>all</strong> claims are supported, the node is supported.
                Confidence = minimum across supported claims (conservative).
                Weight is adjusted once based on the aggregate result.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-indigo-200 dark:border-indigo-700 rounded p-2">
              <p className="font-semibold text-indigo-700 dark:text-indigo-300">Partial Progress</p>
              <p className="text-indigo-600 dark:text-indigo-400">
                Each claim is recorded individually in <code className="bg-indigo-100 dark:bg-indigo-900/30 px-1 rounded">evm_executions</code>.
                If budget runs out mid-iteration, completed claims are preserved.
                The per-MCP call <code className="bg-indigo-100 dark:bg-indigo-900/30 px-1 rounded">maxClaims</code> parameter overrides config.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-700 rounded p-2">
            <p className="font-semibold text-violet-700 dark:text-violet-300">Lab Verification Cycle</p>
            <p className="text-violet-600 dark:text-violet-400">The sole path to lab verification. Nodes must earn weight through synthesis rating before the cycle picks them up. Uses spec extraction to filter non-testable claims. Handles retries with configurable backoff. One node per tick to avoid starving other cycles.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-violet-200 dark:border-violet-700 rounded p-2">
            <p className="font-semibold text-violet-700 dark:text-violet-300">Lab Outcomes</p>
            <p className="text-violet-600 dark:text-violet-400">Controls how the graph responds to lab results. Supported claims get weight boosts, refuted claims get penalties and can be auto-archived. Separate from the cycle - outcomes define consequences, the cycle defines selection.</p>
          </div>
        </div>
      </div>

      {/* Autonomous Voicing Cycle */}
      <div className="bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700 rounded-lg p-4">
        <h3 className="font-semibold text-pink-700 dark:text-pink-300 text-sm mb-2">Autonomous Voicing Cycle</h3>
        <p className="text-xs text-pink-600 dark:text-pink-400 mb-3">
          The voicing cycle generates persona-driven insights by pairing high-weight nodes with related partners
          and synthesizing through one of 5 different perspective modes. Unlike the synthesis engine which uses
          strict logical derivation with a single prompt, the voicing cycle produces diverse viewpoints — a cynic
          challenges assumptions, a child asks naive questions, a pragmatist focuses on practical implications.
        </p>

        <div className="mb-3">
          <h4 className="text-xs font-semibold text-pink-600 dark:text-pink-400 mb-2">Pipeline (per tick)</h4>
          <div className="flex items-center gap-1 text-xs flex-wrap">
            {['Select Node', 'Find Partner', 'Pick Persona', 'Voice (LLM)', 'Quality Gates', 'Create Node', 'Set voice_mode', 'Link Parents'].map((step, i) => (
              <span key={i} className="flex items-center gap-1">
                {i > 0 && <span className="text-pink-400 dark:text-pink-500">&rarr;</span>}
                <span className="bg-white dark:bg-gray-900 border border-pink-200 dark:border-pink-700 rounded px-1.5 py-0.5">{step}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 border border-pink-200 dark:border-pink-700 rounded p-2">
            <p className="font-semibold text-pink-700 dark:text-pink-300">5 Persona Modes</p>
            <p className="text-pink-600 dark:text-pink-400">
              <strong>Object-following:</strong> strict logical derivation.{' '}
              <strong>Sincere:</strong> genuine curiosity.{' '}
              <strong>Cynic:</strong> challenges assumptions.{' '}
              <strong>Pragmatist:</strong> practical implications.{' '}
              <strong>Child:</strong> naive "why" questions.
              A random mode is chosen each tick from the configured list.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-pink-200 dark:border-pink-700 rounded p-2">
            <p className="font-semibold text-pink-700 dark:text-pink-300">Node Selection</p>
            <p className="text-pink-600 dark:text-pink-400">
              Selects nodes with <code className="bg-pink-100 dark:bg-pink-900/30 px-1 rounded">weight &ge; minWeightThreshold</code>,
              excluding raw, question, and elite_verification types. Nodes recently voiced (within 1 hour) are skipped.
              Partners are chosen from parent nodes first, falling back to random high-weight accessible-domain nodes.
            </p>
          </div>
        </div>

        <p className="text-xs text-pink-600 dark:text-pink-400 mt-2">
          Each voiced node stores the persona used in the <code className="bg-pink-100 dark:bg-pink-900/30 px-1 rounded">voice_mode</code> column.
          The same quality gates apply as manual voicing — novelty check, hallucination filter, telegraphic compression, and consultant review.
          Configure in <Link to="/config" className="underline decoration-pink-300 hover:text-pink-800 dark:hover:text-pink-200">Config</Link> &rarr; Autonomous Voicing.
        </p>
      </div>

      {/* Elite Pool Downstream */}
      <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-3">
        <h3 className="font-semibold text-yellow-700 dark:text-yellow-300 text-sm mb-1">Elite Verification Pool</h3>
        <p className="text-xs text-yellow-600 dark:text-yellow-400">
          Nodes that pass lab verification with sufficient confidence enter the <strong>elite pool</strong> for
          generational synthesis. Elite nodes are paired exclusively with other elite nodes to produce
          progressively refined knowledge (Gen 0 → Gen 1 → Gen N). Each generation is mapped against the
          project manifest goals, producing a <strong>coverage report</strong> showing which research questions
          have verified evidence. Terminal findings at the max generation represent the most distilled knowledge.
          See <Link to="/help/graph" className="underline decoration-yellow-300 hover:text-yellow-800 dark:hover:text-yellow-200">Knowledge Graph → Elite Pool</Link> for details,
          or use the <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">podbit.elite</code> MCP tools.
        </p>
      </div>

      {/* Intake Defense */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-3">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-1">Intake Defense</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400">
          Domain concentration throttling prevents any single domain from overwhelming the graph during autonomous cycles.
          When a domain exceeds its concentration threshold, new synthesis proposals for that domain are rate-limited.
          KB-ingested nodes and human contributions are exempt from concentration counts and throttling  - the defense
          targets runaway autonomous cycles only.
        </p>
      </div>

      {/* Cluster Selection */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-1">Quantum-Inspired Cluster Selection</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400">
          When <strong>cluster selection</strong> is enabled (Config → Cluster Selection), a fraction of synthesis cycles use{' '}
          <strong>simulated annealing</strong> to find optimal multi-node clusters instead of sequential pairwise sampling.
          The energy function balances coherence (embedding similarity in the productive band), cross-domain diversity,
          node weight, and target cluster size. The annealing process accepts worse solutions probabilistically at
          high temperature (exploration) and converges at low temperature (exploitation). Clusters feed directly into
          the multi-parent voicing pipeline. Disabled by default  - enable via <code className="bg-indigo-100 dark:bg-indigo-900/30 px-1 rounded">clusterSelection.enabled</code>.
        </p>
      </div>

      {/* Input Optimization */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-3">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-1">Input Optimization: Telegraphic Compression</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400">
          When <strong>telegraphicEnabled</strong> is on (<Link to="/help/config" className="underline decoration-purple-300 hover:text-purple-800 dark:hover:text-purple-200">Config</Link> → Voicing Constraints), node content is compressed before sending to the LLM.
          This removes filler words and uses symbols (→ ∴ ∵ ~), fitting more semantic content into limited context windows.
          The optional <strong>entropy-aware mode</strong> uses NLP to protect high-information tokens (names, numbers, acronyms) from removal.
          See also <Link to="/help/proxy" className="underline decoration-purple-300 hover:text-purple-800 dark:hover:text-purple-200">Knowledge Proxy</Link> for how compression applies to proxy requests.
        </p>
      </div>

      {/* Number Variables */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Number Variables (Domain-Scoped Numeric Isolation)</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          Node content stores <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">[[[PREFIX+nnn]]]</code> variable
          placeholders instead of raw numbers. <strong>These are intentional, not corruption.</strong> The system prevents the
          synthesis engine from universalizing domain-specific numbers across unrelated domains (e.g., "1-5% activation density"
          from biology becoming a universal constant in physics).
        </p>

        <div className="space-y-2 mb-3">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-800 border border-amber-400 dark:border-amber-600 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5">1</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Extraction</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                When a node is created, all numeric values are extracted. Each becomes a domain-scoped variable with a
                globally-unique ID (installation prefix + counter, e.g., <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">[[[MRKQ42]]]</code>).
                The 4-letter prefix is derived from a per-installation UUID, making IDs unique across instances.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-800 border border-amber-400 dark:border-amber-600 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5">2</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Placeholder Storage</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Numbers in node content are replaced with variable references. Actual values live in
                the <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">number_registry</code> table with
                domain, source node, and surrounding context (±N words). Units and surrounding text stay as-is.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-800 border border-amber-400 dark:border-amber-600 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5">3</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Resolution Before LLM Calls</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Every code path that sends node content to an LLM calls <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">resolveContent()</code> first,
                converting placeholders back to actual values. This includes lab verification, validation cycles, QA cycles,
                research cycles, and tension exploration.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-amber-200 dark:bg-amber-800 border border-amber-400 dark:border-amber-600 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5">4</div>
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Voicing Exception</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Voicing does <strong>not</strong> resolve placeholders. Instead, a <strong>variable legend</strong> is injected
                into the prompt showing each variable's value, domain, and scope. The LLM outputs raw numbers, and
                the output gets fresh variable refs when stored. This preserves full provenance context during synthesis.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="font-semibold text-amber-700 dark:text-amber-300">API Verification Corrections</p>
            <p className="text-amber-600 dark:text-amber-400">
              When API Verification finds a <strong>value_correction</strong>, it updates the actual value in
              the <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">number_registry</code> directly.
              The placeholder stays the same — downstream lab verification resolves the corrected value automatically.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="font-semibold text-amber-700 dark:text-amber-300">Configuration</p>
            <p className="text-amber-600 dark:text-amber-400">
              Master toggle: <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">numberVariables.enabled</code>.
              Context window size (words captured around each number) and max variables per node are configurable in{' '}
              <Link to="/config" className="underline decoration-amber-300 hover:text-amber-800 dark:hover:text-amber-200">Config</Link> → Number Variables.
            </p>
          </div>
        </div>
      </div>

      {/* Quality Gates */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Quality Gates Pipeline (Heuristic Mode)</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          In heuristic mode, synthesis output passes through multiple individual quality gates before becoming a node.
          Each gate can reject the output, preventing low-quality content from entering the graph.
          In consultant mode, gates 3-4.5 are replaced by a single LLM judgment call.
        </p>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 border border-gray-400 dark:border-gray-500 flex items-center justify-center text-xs font-bold text-gray-700 dark:text-gray-300 flex-shrink-0">0</div>
            <div className="flex-1 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Prompt Injection Detection (all proposals)</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">Pattern-based detection of instruction overrides, role hijacking, prompt structure markers, and template injection. Runs on ALL proposals including seeds. Auto-generated content (voiced, synthesis) is hard-rejected; seeds/human content is flagged but allowed through.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-sky-100 dark:bg-sky-900/30 border border-sky-300 dark:border-sky-700 flex items-center justify-center text-xs font-bold text-sky-700 dark:text-sky-300 flex-shrink-0">1</div>
            <div className="flex-1 bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-2">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">Structural Validation (before LLM call)</p>
              <p className="text-xs text-sky-600 dark:text-sky-400">Rejects near-tautologies (&gt;80% word overlap), near-duplicates (&gt;0.92 similarity), low-vocabulary pairs (&lt;5 significant words), and low-specificity pairs. Applied before voicing to avoid wasting LLM calls.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/30 border border-cyan-300 dark:border-cyan-700 flex items-center justify-center text-xs font-bold text-cyan-700 dark:text-cyan-300 flex-shrink-0">2</div>
            <div className="flex-1 bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded p-2">
              <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300">Truncation Guards (after LLM call)</p>
              <p className="text-xs text-cyan-600 dark:text-cyan-400">Rejects output with unclosed parentheses or missing sentence-ending punctuation (.!?), which indicate the LLM ran out of tokens mid-thought. Both checks are configurable toggles (enabled by default).</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-300 dark:border-indigo-700 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 flex-shrink-0">3</div>
            <div className="flex-1 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded p-2">
              <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Novelty Gate</p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400">Requires at least 4 substantial new words (words &gt;4 chars not present in either parent node). Rejects outputs that merely regurgitate the inputs.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-rose-100 dark:bg-rose-900/30 border border-rose-300 dark:border-rose-700 flex items-center justify-center text-xs font-bold text-rose-700 dark:text-rose-300 flex-shrink-0">4</div>
            <div className="flex-1 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded p-2">
              <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Hallucination Detection</p>
              <p className="text-xs text-rose-600 dark:text-rose-400">Six heuristics check for: fabricated precise numbers, future predictions with specific years, extreme multipliers (100x, 50x), ungrounded financial claims, &gt;70% novel words, and excessive verbosity (&gt;35 words). Rejects if 1+ red flags trigger.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-6 rounded-full bg-teal-100 dark:bg-teal-900/30 border border-teal-300 dark:border-teal-700 flex items-center justify-center text-[10px] font-bold text-teal-700 dark:text-teal-300 flex-shrink-0">4.5</div>
            <div className="flex-1 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded p-2">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-300">Claim Provenance</p>
              <p className="text-xs text-teal-600 dark:text-teal-400">Extracts propositional clauses and checks each against parent node embeddings. Orphaned clauses (below provenance threshold) indicate ungrounded claims. Rejects if orphan ratio exceeds max (default 0.40). Causal claims ("because", "governed by") are weighted 1.5x harsher than analogies.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700 flex items-center justify-center text-[9px] font-bold text-emerald-700 dark:text-emerald-300 flex-shrink-0">4.75</div>
            <div className="flex-1 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded p-2">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Redundancy Ceiling</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">Computes cosine similarity between the voiced output embedding and each individual parent embedding. Rejects if the output is too similar to any single parent (default threshold 0.85), detecting pure summaries that add no cross-pollination. Skipped when fewer parents than minParentsForCheck (default 2).</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 border border-purple-300 dark:border-purple-700 flex items-center justify-center text-xs font-bold text-purple-700 dark:text-purple-300 flex-shrink-0">5</div>
            <div className="flex-1 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-2">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Dedup Gate</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">Compares voiced content embedding to existing nodes. Rejects if cosine similarity &ge; dedup threshold (default 0.82).</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 flex items-center justify-center text-xs font-bold text-red-700 dark:text-red-300 flex-shrink-0">6</div>
            <div className="flex-1 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-2">
              <p className="text-xs font-semibold text-red-700 dark:text-red-300">Junk Filter</p>
              <p className="text-xs text-red-600 dark:text-red-400">Compares voiced content to the 50 most recent junk nodes. Rejects if similar to previously junked content (threshold 0.85). Skipped for seeds, human contributions, and KB-ingested content. Junk embeddings decay after 30 days to prevent topic poisoning.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700 flex items-center justify-center text-xs font-bold text-amber-700 dark:text-amber-300 flex-shrink-0">7</div>
            <div className="flex-1 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2">
              <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Specificity Enforcement</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Rejects if voiced content specificity score is below minimum (default 0.6). Specificity scoring uses configurable per-domain technical term dictionaries (mechanical, software, biology, etc.).</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Configurable Parameters</h3>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">Cycle Delay</p>
            <p className="text-gray-500 dark:text-gray-400">Time between cycles (default 30s)</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">Similarity Threshold</p>
            <p className="text-gray-500 dark:text-gray-400">Min similarity for synthesis (0.5)</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">Decay Interval</p>
            <p className="text-gray-500 dark:text-gray-400">Apply decay every N cycles (10)</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">Junk Filter Threshold</p>
            <p className="text-gray-500 dark:text-gray-400">Reject if similar to junk (0.85)</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">Min Synthesis Specificity</p>
            <p className="text-gray-500 dark:text-gray-400">Reject vague output (&lt; 0.6)</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">Dedup Threshold</p>
            <p className="text-gray-500 dark:text-gray-400">Reject duplicates (&ge; 0.82)</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">Provenance Threshold</p>
            <p className="text-gray-500 dark:text-gray-400">Min parent similarity for grounded clause (0.35)</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">Max Orphan Ratio</p>
            <p className="text-gray-500 dark:text-gray-400">Max ungrounded clause proportion (0.40)</p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">All parameters can be tuned on the <Link to="/help/config" className="text-podbit-500 hover:text-podbit-400 underline">Config page</Link>.</p>
      </div>

      {/* Node Lifecycle */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Node Lifecycle</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          Every node progresses through lifecycle states based on <strong>fertility</strong> (offspring production),
          not age or weight. The lifecycle system tracks which nodes are actively contributing to synthesis
          and composts unproductive ones to keep the graph focused. Enable via Config → Node Lifecycle.
        </p>
        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-2 text-center">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Nascent</p>
            <p className="text-blue-600 dark:text-blue-400">Newly created, no children yet</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded p-2 text-center">
            <p className="font-semibold text-green-700 dark:text-green-300">Active</p>
            <p className="text-green-600 dark:text-green-400">Has produced children, still fertile</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2 text-center">
            <p className="font-semibold text-amber-700 dark:text-amber-300">Declining</p>
            <p className="text-amber-600 dark:text-amber-400">Barren too long, can revive</p>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 text-center">
            <p className="font-semibold text-gray-700 dark:text-gray-300">Composted</p>
            <p className="text-gray-500 dark:text-gray-400">Archived to stub, lineage preserved</p>
          </div>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          <strong>Transitions:</strong> nascent → active (first child born), active → declining (barren too many cycles),
          declining → composted (still barren after compost threshold), declining → active (revival via new child).
          Nascent nodes that never produce children are <strong>stillborn</strong>.
          Breakthroughs can optionally be preserved from composting.
          The lifecycle sweep runs every N synthesis cycles. Metabolism metrics appear on the Dashboard.
        </p>
      </div>

      {/* Elite Verification Pool */}
      <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-700 dark:text-yellow-300 text-sm mb-2">Elite Verification Pool</h3>
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-3">
          The Elite Pool accumulates high-confidence verified knowledge. When lab verification proves a claim with
          sufficient confidence (default &ge; 0.95), a <strong>new node</strong> of type <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">elite_verification</code> is
          created from the verification output. Elite nodes are first-class graph citizens that participate
          in higher-generation synthesis, building a growing collection of proven findings mapped to the project manifest.
        </p>

        {/* Generation System */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-2">Generation Tracking</p>
          <div className="grid grid-cols-5 gap-2 text-xs mb-2">
            <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2 text-center">
              <p className="font-semibold text-yellow-700 dark:text-yellow-300">Gen 0</p>
              <p className="text-yellow-500 dark:text-yellow-400">Seeds, KB nodes</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2 text-center">
              <p className="font-semibold text-yellow-700 dark:text-yellow-300">Gen 1</p>
              <p className="text-yellow-500 dark:text-yellow-400">Synthesis output</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2 text-center">
              <p className="font-semibold text-yellow-700 dark:text-yellow-300">Gen 2</p>
              <p className="text-yellow-500 dark:text-yellow-400">Verified elite</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2 text-center">
              <p className="font-semibold text-yellow-700 dark:text-yellow-300">Gen 3</p>
              <p className="text-yellow-500 dark:text-yellow-400">Elite bridged</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2 text-center">
              <p className="font-semibold text-yellow-700 dark:text-yellow-300">Gen 4</p>
              <p className="text-yellow-500 dark:text-yellow-400">Terminal finding</p>
            </div>
          </div>
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            Generation = <code className="bg-yellow-100 dark:bg-yellow-900/30 px-1 rounded">max(parent generations) + 1</code>.
            Set once at creation, never changed. Nodes at <strong>maxGeneration</strong> (default 4)
            are terminal findings ready for empirical validation.
          </p>
        </div>

        {/* Promotion Pipeline */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-2">Promotion Pipeline</p>
          <div className="flex items-center gap-1 text-xs mb-2 flex-wrap">
            {['Lab Passes', 'Threshold Check', 'Generation Check', 'Elite Dedup', 'Create Node', 'Variable Registry', 'Manifest Map', 'Emit Events'].map((step, i) => (
              <React.Fragment key={step}>
                <div className="bg-white dark:bg-gray-900 border border-yellow-200 dark:border-yellow-700 rounded px-2 py-1 text-yellow-700 dark:text-yellow-300 whitespace-nowrap">
                  {step}
                </div>
                {i < 7 && <span className="text-yellow-400">&rarr;</span>}
              </React.Fragment>
            ))}
          </div>
          <p className="text-xs text-yellow-600 dark:text-yellow-400">
            After lab verification confirms a claim, the pipeline checks confidence &ge; threshold, ensures generation
            is below the ceiling, runs 3-gate dedup against the existing elite pool, creates a new node
            with parent edges, registers number variables, maps to the project manifest, and emits activity events.
          </p>
        </div>

        {/* Three-Gate Dedup */}
        <div className="mb-3">
          <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-2">Three-Gate Elite Dedup</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2">
              <p className="font-medium text-yellow-700 dark:text-yellow-300">Gate 1: Variable Overlap</p>
              <p className="text-yellow-500 dark:text-yellow-400">Fast exact check — compares number variable ID sets. Catches duplicate formulas.</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2">
              <p className="font-medium text-yellow-700 dark:text-yellow-300">Gate 2: Parent Lineage</p>
              <p className="text-yellow-500 dark:text-yellow-400">Fast exact check — shared parent synthesis node implies same derivation.</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2">
              <p className="font-medium text-yellow-700 dark:text-yellow-300">Gate 3: Semantic Similarity</p>
              <p className="text-yellow-500 dark:text-yellow-400">Embedding cosine against elite pool. Catches paraphrased duplicates (&ge; 0.92).</p>
            </div>
          </div>
        </div>

        {/* Manifest & Bridging */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2">
            <p className="font-medium text-yellow-700 dark:text-yellow-300">Manifest Integration</p>
            <p className="text-yellow-500 dark:text-yellow-400">
              Each elite node is mapped to project goals, key questions, and bridges via LLM analysis.
              Coverage reports track which manifest targets have verified evidence and which remain uncovered.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-yellow-100 dark:border-yellow-700 rounded p-2">
            <p className="font-medium text-yellow-700 dark:text-yellow-300">Elite-to-Elite Bridging</p>
            <p className="text-yellow-500 dark:text-yellow-400">
              Pairs of elite nodes can be synthesized together for higher-generation insights.
              Priority modes: <strong>cross_domain</strong> (different domains), <strong>highest_confidence</strong>,
              or <strong>lowest_generation</strong>. Max attempts tracked per pair.
            </p>
          </div>
        </div>
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-2">
          Configure thresholds, dedup gates, and bridging in <Link to="/config" className="underline decoration-yellow-300 hover:text-yellow-800 dark:hover:text-yellow-200">Config</Link> → Elite Verification Pool (13 parameters).
        </p>
      </div>

      {/* Transient Partitions */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Transient Partitions (Visitor System)</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3">
          Transient partitions are knowledge collections imported from external Podbit instances for
          temporary cross-pollination. They arrive in <strong>quarantine</strong>, undergo injection scanning,
          and if approved are <strong>bridged</strong> to host partitions for synthesis. After reaching cycle
          limits or exhaustion, they <strong>depart</strong>  - returning enriched with any children they helped produce.
        </p>
        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2 text-center">
            <p className="font-semibold text-amber-700 dark:text-amber-300">Quarantine</p>
            <p className="text-amber-600 dark:text-amber-400">Imported, awaiting scan + approval</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded p-2 text-center">
            <p className="font-semibold text-green-700 dark:text-green-300">Active</p>
            <p className="text-green-600 dark:text-green-400">Bridged, participating in synthesis</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded p-2 text-center">
            <p className="font-semibold text-blue-700 dark:text-blue-300">Departing</p>
            <p className="text-blue-600 dark:text-blue-400">Exporting, creating stubs</p>
          </div>
          <div className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2 text-center">
            <p className="font-semibold text-gray-700 dark:text-gray-300">Departed</p>
            <p className="text-gray-500 dark:text-gray-400">Gone, stubs remain for lineage</p>
          </div>
        </div>
        <p className="text-xs text-indigo-600 dark:text-indigo-400">
          <strong>Safety:</strong> Injection scanning rejects imports with too many flagged nodes (configurable threshold).
          Weight and salience are reset on import. Node stubs preserve lineage after departure.
          Manage visitors in the <Link to="/config/partitions" className="underline decoration-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200">Partition Management</Link> page.
          Configure limits in <Link to="/config" className="underline decoration-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-200">Config</Link> → Transient Partitions.
        </p>
      </div>
    </div>
  );
}

export default SynthesisSection;
