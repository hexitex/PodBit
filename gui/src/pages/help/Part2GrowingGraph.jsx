

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
    <svg viewBox="0 0 980 180" className="w-full mx-auto" role="img" aria-label="Synthesis cycle flow">
      <defs>
        <marker id="arrow-gg-sc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      {steps.map((s, i) => {
        const x = 10 + i * 160;
        return (
          <g key={s.label}>
            <rect x={x} y="15" width="140" height="65" rx="8" fill={s.color} opacity="0.12" stroke={s.color} strokeWidth="1.5" />
            <text x={x + 70} y="36" textAnchor="middle" className="text-xs font-semibold" fill={s.color}>{s.label}</text>
            <text x={x + 70} y="52" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">{s.desc}</text>
            <text x={x + 70} y="65" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">{s.desc2}</text>
            {i < steps.length - 1 && (
              <line x1={x + 143} y1="47" x2={x + 157} y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-gg-sc)" />
            )}
          </g>
        );
      })}
      <line x1="720" y1="80" x2="720" y2="105" stroke="#ef4444" strokeWidth="1" strokeDasharray="3 2" />
      <text x="720" y="118" textAnchor="middle" className="text-xs fill-red-400 dark:fill-red-500">reject</text>
      <path d="M 948 80 C 968 95, 968 142, 930 147 C 800 152, 120 152, 67 147 C 30 142, 20 112, 35 92" fill="none" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-gg-sc)" />
      <text x="490" y="170" textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">Repeat (configurable cycle delay)</text>
    </svg>
  );
}

function CycleEcosystemDiagram() {
  return (
    <svg viewBox="0 0 880 420" className="w-full mx-auto" role="img" aria-label="Autonomous cycle ecosystem">
      <defs>
        <marker id="arrow-gg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Central knowledge graph */}
      <rect x="310" y="160" width="220" height="100" rx="12" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="2" />
      <text x="420" y="195" textAnchor="middle" className="fill-sky-700 dark:fill-sky-300 text-sm font-bold">Knowledge Graph</text>
      <text x="420" y="215" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs">Seeds, voiced, breakthroughs</text>
      <text x="420" y="232" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs">Nodes with embeddings & edges</text>

      {/* Synthesis - top left */}
      <rect x="30" y="20" width="195" height="80" rx="8" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1.5" />
      <text x="127" y="48" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-xs font-semibold">Synthesis Engine</text>
      <text x="127" y="64" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400 text-xs">Precision pairing + gates</text>
      <text x="127" y="78" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400 text-xs">synthesis nodes</text>
      <path d="M 225 80 C 280 120, 310 140, 330 160" fill="none" stroke="#a855f7" strokeWidth="1.5" markerEnd="url(#arrow-gg)" />

      {/* Voicing - top right */}
      <rect x="615" y="20" width="195" height="80" rx="8" fill="#ec4899" opacity="0.15" stroke="#ec4899" strokeWidth="1.5" />
      <text x="712" y="48" textAnchor="middle" className="fill-pink-700 dark:fill-pink-300 text-xs font-semibold">Voicing Cycle</text>
      <text x="712" y="64" textAnchor="middle" className="fill-pink-500 dark:fill-pink-400 text-xs">Creative personas</text>
      <text x="712" y="78" textAnchor="middle" className="fill-pink-500 dark:fill-pink-400 text-xs">+ loose pairing → voiced</text>
      <path d="M 615 80 C 560 120, 530 140, 510 160" fill="none" stroke="#ec4899" strokeWidth="1.5" markerEnd="url(#arrow-gg)" />

      {/* Research - left */}
      <rect x="10" y="175" width="175" height="70" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="97" y="200" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">Research Cycle</text>
      <text x="97" y="216" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">LLM generates new seeds</text>
      <text x="97" y="230" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">for sparse domains</text>
      <path d="M 185 210 C 230 210, 280 210, 310 210" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrow-gg)" />

      {/* Questions - right */}
      <rect x="640" y="175" width="195" height="70" rx="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="737" y="200" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-xs font-semibold">Question Cycle</text>
      <text x="737" y="216" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">Identifies knowledge gaps</text>
      <text x="737" y="230" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">question nodes</text>
      <path d="M 640 210 C 600 210, 560 210, 530 210" fill="none" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arrow-gg)" />

      {/* Tensions - bottom left */}
      <rect x="50" y="310" width="175" height="70" rx="8" fill="#ef4444" opacity="0.15" stroke="#ef4444" strokeWidth="1.5" />
      <text x="137" y="335" textAnchor="middle" className="fill-red-700 dark:fill-red-300 text-xs font-semibold">Tensions Cycle</text>
      <text x="137" y="351" textAnchor="middle" className="fill-red-500 dark:fill-red-400 text-xs">Finds contradictions</text>
      <text x="137" y="365" textAnchor="middle" className="fill-red-500 dark:fill-red-400 text-xs">between similar nodes</text>
      <path d="M 225 330 C 280 300, 330 275, 350 260" fill="none" stroke="#ef4444" strokeWidth="1.5" markerEnd="url(#arrow-gg)" />

      {/* Validation - bottom center */}
      <rect x="280" y="310" width="280" height="70" rx="8" fill="#6366f1" opacity="0.15" stroke="#6366f1" strokeWidth="1.5" />
      <text x="420" y="335" textAnchor="middle" className="fill-indigo-700 dark:fill-indigo-300 text-xs font-semibold">Validation + Autorating</text>
      <text x="420" y="351" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">Scores quality, promotes breakthroughs</text>
      <text x="420" y="365" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">Rates nodes for weight adjustment</text>
      <path d="M 420 310 C 420 290, 420 275, 420 260" fill="none" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arrow-gg)" />

      {/* Lab Verification - bottom right */}
      <rect x="615" y="310" width="195" height="70" rx="8" fill="#0891b2" opacity="0.15" stroke="#0891b2" strokeWidth="1.5" />
      <text x="712" y="335" textAnchor="middle" className="fill-cyan-700 dark:fill-cyan-300 text-xs font-semibold">Lab Verification</text>
      <text x="712" y="351" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400 text-xs">Submits claims to lab servers</text>
      <text x="712" y="365" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400 text-xs">for empirical testing</text>
      <path d="M 615 330 C 560 300, 510 275, 490 260" fill="none" stroke="#0891b2" strokeWidth="1.5" markerEnd="url(#arrow-gg)" />

      {/* Label */}
      <text x="420" y="410" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">All cycles run in parallel, each feeding back into the shared knowledge graph</text>
    </svg>
  );
}

/** Help section: Growing your graph — synthesis cycle, consultant pipeline, ecosystem. */
function Part2GrowingGraph() {
  return (
    <div className="space-y-6">
      {/* Opening */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Growing the Graph</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Once you've seeded knowledge, Podbit's autonomous cycles take over. They run in parallel, each discovering
          a different facet of your research: connections, contradictions, gaps, and quality signals.
        </p>
      </div>

      {/* Starting the Engine */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Starting the Engine</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The synthesis engine and its cycles are controlled from the Dashboard. Once started, they run continuously
          on configurable intervals until you stop them.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Two Operating Modes</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            <strong>API mode</strong> — the engine calls LLMs directly to generate synthesis, voicing, and research
            output. Fully autonomous. <strong>MCP mode</strong> — the engine queues discoveries as pending requests
            for your IDE agent (Claude, Cursor, etc.) to process. Use MCP mode when you want human-in-the-loop
            control or when your IDE agent has better model access.
          </p>
        </div>

        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Pipeline Mode</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            <strong>Heuristic</strong> — all mechanical quality gates active (100+ tunable parameters). Maximum control,
            predictable behavior. <strong>Consultant</strong> — a single comprehensive LLM call replaces five
            meaning-judgment gates (claim provenance, hallucination detection, counterfactual independence, derivative
            check, fitness grading). Simpler, but depends on model quality.
          </p>
        </div>

        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Cycle Controls</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            Each cycle can be independently toggled on or off. Start with synthesis and voicing enabled, then add
            research, questions, tensions, validation, and lab verification as your graph grows. Cycles that need sparse domains
            (research) or high-quality nodes (validation) benefit from waiting until there's enough material.
          </p>
        </div>

        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Activity Feed</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            The Dashboard shows a real-time activity stream via Server-Sent Events. Every synthesis attempt, gate
            rejection, voicing result, and cycle event appears as it happens. Filter by category (synthesis, voicing,
            kb, proxy, etc.) to focus on what matters.
          </p>
        </div>
      </div>

      {/* MCP Mode expanded */}
      <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
        <h3 className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-2">MCP Mode — Human-in-the-Loop Synthesis</h3>
        <p className="text-xs text-teal-600 dark:text-teal-400 mb-3">
          In MCP mode, the engine finds resonating node pairs but does <strong>not</strong> call an LLM itself. Instead,
          it queues discoveries for your IDE agent (Claude Code, Cursor, Windsurf, etc.) to process. This lets you
          choose which model voices each insight and review results before they enter the graph.
        </p>
        <ol className="text-xs text-teal-600 dark:text-teal-400 space-y-1.5 list-decimal list-inside mb-3">
          <li>Engine runs — samples pairs, computes similarity, queues matches above threshold</li>
          <li>Check for discoveries: <code className="bg-teal-100 dark:bg-teal-900/50 px-1 rounded">podbit.pending</code></li>
          <li>For each pair, call <code className="bg-teal-100 dark:bg-teal-900/50 px-1 rounded">podbit.voice(nodeId)</code> to get voicing context</li>
          <li>Read both nodes, synthesize an insight connecting them</li>
          <li>Save: <code className="bg-teal-100 dark:bg-teal-900/50 px-1 rounded">podbit.propose(content, nodeType: "voiced", parentIds: [...])</code></li>
          <li>Mark complete: <code className="bg-teal-100 dark:bg-teal-900/50 px-1 rounded">podbit.complete(requestId, result)</code></li>
        </ol>
        <div>
          <p className="text-xs font-medium text-teal-700 dark:text-teal-300 mb-2">AI Research Supervisor Pattern</p>
          <p className="text-xs text-teal-600 dark:text-teal-400 mb-3">
            Any MCP-compatible agent (Claude Code, Cursor, Windsurf, VS Code agents) can act as a <strong>research supervisor</strong> —
            orchestrating synthesis, validating outputs, tuning parameters, and curating the knowledge graph.
            Frontier models are recommended for supervisory roles.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-900 border border-teal-100 dark:border-teal-700 rounded p-3">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1">Supervised Synthesis</p>
              <p className="text-xs text-teal-600 dark:text-teal-400">
                Run the engine in MCP mode and let the AI agent voice discoveries. Review proposed nodes before
                they enter the graph. Reject or refine low-quality outputs with the agent's help. This produces
                higher-quality synthesis than fully autonomous API mode.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-teal-100 dark:border-teal-700 rounded p-3">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1">Autonomous Tuning</p>
              <p className="text-xs text-teal-600 dark:text-teal-400">
                Ask the agent to read metrics (<code className="bg-teal-100 dark:bg-teal-900/50 px-1 rounded">podbit.config(action: "metrics")</code>),
                diagnose issues, tune parameters, and monitor results. The agent can run
                observe-hypothesize-tune-verify loops across the full config surface.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-teal-100 dark:border-teal-700 rounded p-3">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1">Graph Curation</p>
              <p className="text-xs text-teal-600 dark:text-teal-400">
                Have the agent find tensions (<code className="bg-teal-100 dark:bg-teal-900/50 px-1 rounded">podbit.tensions</code>),
                generate research questions, validate breakthrough candidates, dedup the graph,
                and provide feedback on node quality — all through MCP tools.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-teal-100 dark:border-teal-700 rounded p-3">
              <p className="text-xs font-semibold text-teal-700 dark:text-teal-300 mb-1">Cross-Domain Discovery</p>
              <p className="text-xs text-teal-600 dark:text-teal-400">
                Use <code className="bg-teal-100 dark:bg-teal-900/50 px-1 rounded">podbit.patterns</code> to find abstract
                connections across domains. The agent can identify structural patterns that bridge unrelated knowledge
                areas, tag nodes, and synthesize cross-domain insights.
              </p>
            </div>
          </div>
        </div>
      </div>

      <CycleEcosystemDiagram />

      {/* The Three Creators */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">The Three Knowledge Creators</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Three cycles generate new nodes. Each answers a fundamentally different question about your knowledge.
        </p>
      </div>

      {/* Synthesis Engine */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">
          Synthesis Engine — "What connections exist between these ideas?"
        </h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          The main engine. It's the most rigorous cycle and produces the highest-quality output because it's
          the most selective about what it combines and the most aggressive about filtering bad results.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">How it pairs nodes</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Samples a node by <strong>salience</strong> (a score combining weight, recency, and randomness), then uses
              <strong> embedding similarity</strong> to find the best partner within a tuned resonance band — not too similar
              (would produce tautologies), not too different (no meaningful connection). This is a precision match.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Quality gates (6+)</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              After the LLM voices the connection, output passes through: <strong>claim provenance</strong> (is it grounded
              in the parents?), <strong>hallucination detection</strong>, <strong>counterfactual independence</strong> (do both
              parents genuinely contribute?), <strong>redundancy ceiling</strong>, <strong>dedup</strong>, <strong>specificity scoring</strong>,
              and <strong>fitness grading</strong>. Most synthesis attempts are rejected.
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
          <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Why it exists</p>
          <p className="text-xs text-purple-600 dark:text-purple-400">
            Synthesis is the core value proposition of Podbit — finding non-obvious connections between ideas that
            a human wouldn't think to put together. The strict quality pipeline ensures these connections are
            <strong> genuinely meaningful</strong>, not just superficially related. It always uses the <strong>object-following</strong> persona
            (neutral, analytical) because the goal is to discover what's actually there, not impose a perspective.
          </p>
        </div>
      </div>

      {/* Pipeline flow diagram */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h4 className="font-semibold text-sky-700 dark:text-sky-300 text-xs mb-2">Birth Pipeline — Mechanical Gates + Minitruth</h4>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">
          Every synthesis output passes through fast mechanical checks (resonance, structural, specificity, dedup, junk)
          followed by minitruth, a single LLM reviewer that accepts, reworks, or rejects.
          The cull pipeline runs separately to evaluate existing nodes via a comprehensive LLM consultant.
        </p>
        <SynthesisCycleDiagram />
      </div>

      {/* Voicing Cycle */}
      <div className="bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700 rounded-lg p-4">
        <h3 className="font-semibold text-pink-700 dark:text-pink-300 text-sm mb-2">
          Voicing Cycle — "What would a different perspective see in these ideas?"
        </h3>
        <p className="text-xs text-pink-600 dark:text-pink-400 mb-3">
          The creative complement to synthesis. Where synthesis asks "what's objectively connected?",
          voicing asks "what would a cynic/pragmatist/child notice that the analyst missed?"
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-pink-100 dark:border-pink-800">
            <p className="text-xs font-medium text-pink-700 dark:text-pink-300 mb-1">How it pairs nodes</p>
            <p className="text-xs text-pink-600 dark:text-pink-400">
              Deliberately <strong>loose</strong>. Picks a high-weight node, then grabs a partner from its parents or random
              high-weight nodes. No embedding similarity search, no resonance band. This randomness is intentional —
              unexpected pairings produce unexpected insights.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-pink-100 dark:border-pink-800">
            <p className="text-xs font-medium text-pink-700 dark:text-pink-300 mb-1">Persona modes</p>
            <p className="text-xs text-pink-600 dark:text-pink-400">
              Each run picks a random persona: <strong>sincere</strong> (empathetic, values-driven), <strong>cynic</strong> (adversarial,
              finds weaknesses), <strong>pragmatist</strong> (practical, implementation-focused), <strong>child</strong> (naive, asks
              obvious questions), <strong>object-following</strong> (neutral, analytical). Each sees different things in the
              same pair of ideas.
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-pink-100 dark:border-pink-800">
          <p className="text-xs font-medium text-pink-700 dark:text-pink-300 mb-1">Why it exists separately from synthesis</p>
          <p className="text-xs text-pink-600 dark:text-pink-400">
            Synthesis optimizes for <strong>correctness</strong> — rigorously validated, analytically neutral connections.
            But research breakthroughs often come from asking a dumb question, playing devil's advocate, or looking at
            something from a completely different angle. The voicing cycle provides this diversity of thought.
            It has <strong>fewer quality gates</strong> (no claim provenance, no counterfactual check, no fitness grading)
            because creative perspectives shouldn't be held to the same standard as analytical derivations.
            The graph benefits from both: precise connections <em>and</em> wild ideas.
          </p>
        </div>
      </div>

      {/* Research Cycle */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">
          Research Cycle — "What's missing from this domain?"
        </h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          Unlike synthesis and voicing which recombine existing knowledge, research <strong>adds entirely new information</strong>.
          It targets under-populated domains and asks an LLM to generate factual seeds that fill gaps.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Domain targeting</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Finds the domain with the <strong>fewest nodes</strong> (most in need of research). Validates it against the
              project manifest to prevent off-topic generation. Skips exhausted domains where recent cycles
              produced nothing new — domains naturally saturate.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Relevance filtering</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Each generated seed is embedded and compared to the <strong>domain centroid</strong> (average embedding of
              existing nodes). Off-topic seeds are rejected. This prevents the LLM from drifting into
              tangentially related territory.
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Why it exists</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Synthesis and voicing can only recombine what's already in the graph. If a domain has 5 nodes,
            there are limited pairings. Research bootstraps sparse domains so synthesis has enough
            material to work with. It also brings in knowledge the human may not have thought to seed — the
            LLM fills blind spots. Research creates <strong>seed</strong> nodes (raw input), not <strong>voiced</strong> nodes
            (synthesized output), so they enter the graph at the ground level and participate in future synthesis.
          </p>
        </div>
      </div>

      {/* Comparison table */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Creator Cycles at a Glance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 pr-3 text-gray-500 dark:text-gray-400 font-medium"></th>
                <th className="text-left py-2 px-3 text-purple-600 dark:text-purple-400 font-medium">Synthesis</th>
                <th className="text-left py-2 px-3 text-pink-600 dark:text-pink-400 font-medium">Voicing</th>
                <th className="text-left py-2 px-3 text-emerald-600 dark:text-emerald-400 font-medium">Research</th>
              </tr>
            </thead>
            <tbody className="text-gray-600 dark:text-gray-400">
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Strategy</td>
                <td className="py-2 px-3">Find hidden connections</td>
                <td className="py-2 px-3">Explore diverse perspectives</td>
                <td className="py-2 px-3">Fill knowledge gaps</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Input</td>
                <td className="py-2 px-3">2+ existing nodes (embedding-matched)</td>
                <td className="py-2 px-3">2 existing nodes (loosely paired)</td>
                <td className="py-2 px-3">Domain context + open questions</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Output</td>
                <td className="py-2 px-3"><code className="text-purple-600 dark:text-purple-400">synthesis</code> node</td>
                <td className="py-2 px-3"><code className="text-pink-600 dark:text-pink-400">voiced</code> node</td>
                <td className="py-2 px-3"><code className="text-emerald-600 dark:text-emerald-400">seed</code> nodes</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Persona</td>
                <td className="py-2 px-3">Always object-following</td>
                <td className="py-2 px-3">Random (5 modes)</td>
                <td className="py-2 px-3">N/A (generates facts)</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Quality gates</td>
                <td className="py-2 px-3">6+ post-voicing gates</td>
                <td className="py-2 px-3">Voice-internal gates only</td>
                <td className="py-2 px-3">Embedding relevance + dedup</td>
              </tr>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">Selectivity</td>
                <td className="py-2 px-3">High (most attempts rejected)</td>
                <td className="py-2 px-3">Medium</td>
                <td className="py-2 px-3">Medium (relevance gated)</td>
              </tr>
              <tr>
                <td className="py-2 pr-3 font-medium text-gray-700 dark:text-gray-300">LLM subsystem</td>
                <td className="py-2 px-3"><code className="text-purple-600 dark:text-purple-400">synthesis</code></td>
                <td className="py-2 px-3"><code className="text-pink-600 dark:text-pink-400">voice</code></td>
                <td className="py-2 px-3"><code className="text-emerald-600 dark:text-emerald-400">research</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* The Four Evaluators */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">The Four Evaluators</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Four cycles don't create new knowledge — they evaluate, score, and stress-test what's already there.
          Without them, the graph would fill with untested claims and unresolved contradictions.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Validation */}
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Validation Cycle</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2">
            Evaluates high-weight nodes for promotion to <strong>breakthrough</strong> status. Scores them on synthesis
            quality, novelty, testability, and tension resolution. Breakthroughs are the graph's most
            validated insights — they've survived synthesis, quality gates, and explicit validation.
          </p>
          <p className="text-xs text-indigo-500 dark:text-indigo-400">
            <strong>Why:</strong> Not all synthesized nodes are equal. Validation separates genuinely novel insights from
            competent-but-ordinary connections.
          </p>
        </div>

        {/* Autorating */}
        <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
          <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Autorating Cycle</h3>
          <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-2">
            Automatically scores nodes on quality, adjusting their <strong>weight</strong>. Higher-weight nodes get
            sampled more often by synthesis and voicing. Lower-weight nodes gradually fade. This creates
            a natural selection pressure where good ideas propagate and weak ones don't.
          </p>
          <p className="text-xs text-indigo-500 dark:text-indigo-400">
            <strong>Why:</strong> Manual rating doesn't scale. Autorating lets the graph self-organize by quality without
            requiring human attention on every node.
          </p>
        </div>

        {/* Tensions */}
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">Tensions Cycle</h3>
          <p className="text-xs text-red-600 dark:text-red-400 mb-2">
            Finds pairs of nodes that are <strong>highly similar but make opposing claims</strong>. These contradictions
            are where unknown knowledge hides — if two well-supported ideas disagree, resolving the tension
            often produces a genuine insight.
          </p>
          <p className="text-xs text-red-500 dark:text-red-400">
            <strong>Why:</strong> Contradictions are invisible in a flat list. The tensions cycle surfaces them automatically,
            turning the graph into a research tool that points you at the most productive questions.
          </p>
        </div>

        {/* Questions */}
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Question Cycle</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Examines node pairs and generates <strong>research questions</strong> — specific, answerable questions that
            neither node addresses. These <code className="text-amber-700 dark:text-amber-300">question</code> nodes guide the
            research cycle and help you identify what to investigate next.
          </p>
          <p className="text-xs text-amber-500 dark:text-amber-400">
            <strong>Why:</strong> Knowing what you don't know is half the battle. The question cycle makes knowledge gaps
            explicit and actionable, rather than leaving them as vague feelings of incompleteness.
          </p>
        </div>
      </div>

      {/* Lab Verification */}
      <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
        <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">
          Lab Verification
        </h3>
        <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-2">
          Extracts experiment specifications from claims and <strong>submits them to external lab servers for
          empirical testing</strong>. Labs design experiments, run code, and return raw data. Podbit evaluates
          the data against the experiment spec's evaluation criteria — no LLM, just data comparison — and updates the node's verification status.
        </p>
        <p className="text-xs text-cyan-500 dark:text-cyan-400 mb-2">
          Lab verification is the system's reality check — the only cycle that tests claims against something
          other than other claims. Nodes are frozen during verification and tainted downstream if refuted. Not every
          claim is reducible to an experiment, but for those that are, empirical data is the strongest signal.
        </p>
        <p className="text-xs text-cyan-500 dark:text-cyan-400">
          For a deep dive into verification methodology, code generation, and quality scoring, see{' '}
          <span className="docs-link-internal text-cyan-600 dark:text-cyan-300 underline cursor-pointer" data-doc="verification-quality">
            Verification &amp; Quality
          </span>.
        </p>
      </div>

      {/* Cycle Types Reference */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">All Cycle Types at a Glance</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Eight cycle types run in parallel. Each serves a distinct role in the knowledge lifecycle and can be
          independently enabled, disabled, and tuned.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-2">
            <p className="font-semibold text-sky-700 dark:text-sky-300 mb-1">Synthesis</p>
            <p className="text-sky-600 dark:text-sky-400">Pairs nodes by embedding similarity, voices connections, creates child synthesis nodes. The primary knowledge generation cycle.</p>
          </div>
          <div className="bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-700 rounded p-2">
            <p className="font-semibold text-pink-700 dark:text-pink-300 mb-1">Autonomous Voicing</p>
            <p className="text-pink-600 dark:text-pink-400">Persona-driven synthesis across 5 modes (object-following, sincere, cynic, pragmatist, child). Loosely paired, creative complement to analytical synthesis.</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-2">
            <p className="font-semibold text-purple-700 dark:text-purple-300 mb-1">Validation</p>
            <p className="text-purple-600 dark:text-purple-400">3-gate breakthrough pipeline: composite scoring → novelty gate (frontier model) → lab verification check. All gates fail-open.</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded p-2">
            <p className="font-semibold text-red-700 dark:text-red-300 mb-1">Tensions</p>
            <p className="text-red-600 dark:text-red-400">Finds contradicting node pairs with high similarity but opposing claims. Seeds research questions.</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="font-semibold text-amber-700 dark:text-amber-300 mb-1">Questions</p>
            <p className="text-amber-600 dark:text-amber-400">Generates research questions from tension pairs and knowledge gaps. Creates <code className="bg-amber-100 dark:bg-amber-900/50 px-0.5 rounded">question</code>-type nodes.</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Research</p>
            <p className="text-emerald-600 dark:text-emerald-400">Autonomously generates foundational domain knowledge. Requires a project manifest. Embedding relevance gates reject off-topic seeds.</p>
          </div>
          <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded p-2">
            <p className="font-semibold text-teal-700 dark:text-teal-300 mb-1">Autorating</p>
            <p className="text-teal-600 dark:text-teal-400">Autonomous quality scoring on intake. Adjusts node weights to feed natural selection through the synthesis cycle.</p>
          </div>
          <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded p-2">
            <p className="font-semibold text-violet-700 dark:text-violet-300 mb-1">Lab Verification</p>
            <p className="text-violet-600 dark:text-violet-400">Extracts experiment specs from claims and submits to external lab servers. Labs run experiments and return raw data. Podbit evaluates the returned data against spec criteria and adjusts node weight.</p>
          </div>
        </div>
      </div>

      {/* The Ecosystem */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">How They Work Together</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          The cycles form a self-reinforcing ecosystem. Each serves a role that the others can't fill:
        </p>
        <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
          <li>You <strong>seed</strong> initial knowledge (manually, via KB ingestion, or via the GUI Chat)</li>
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
          All cycles run in parallel on configurable intervals. Each has its own LLM subsystem assignment
          and can be independently enabled, disabled, or tuned in{' '}
          <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="configuration">
            Configuration
          </span>.
        </p>
      </div>

      {/* Dashboard Controls */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Dashboard at a Glance</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The Dashboard is your control center for the running engine and the health of your graph.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Stat Cards</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Top-level metrics: <strong>Total Nodes</strong>, <strong>Breakthroughs</strong>, <strong>Average Weight</strong>,
            and <strong>Average Specificity</strong>. These give you a quick read on graph size, quality, and how well
            the autorating cycle is differentiating strong nodes from weak ones.
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Activity Feed</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Real-time Server-Sent Events stream showing every engine event as it happens. Category filters
            (synthesis, voicing, kb, proxy, validation, etc.) let you focus on specific cycle activity. Each event
            includes model provenance, gate pass/fail details, and node metadata.
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Synthesis Stats</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            A Sankey flow diagram showing how many synthesis attempts passed or failed at each quality gate.
            This reveals bottlenecks — if 90% fail at claim provenance, your seeds may need more specificity.
            If most fail at redundancy, your graph is saturating and needs new input domains.
          </p>
        </div>

        <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Graph Health</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Node lifecycle metabolism — creation vs. archival rates, domain balance, weight distribution.
            A healthy graph has a steady flow of new nodes and a natural decay of low-quality ones. Stagnation
            means the engine needs fresh seeds or tuning adjustments.
          </p>
        </div>
      </div>

      {/* Cross-section links */}
      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Related Sections</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <li>
            <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="verification-quality">
              Verification &amp; Quality
            </span>{' '}
            — Lab verification, quality gates, scoring methodology
          </li>
          <li>
            <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="configuration">
              Configuration
            </span>{' '}
            — Tune cycle intervals, gate thresholds, pipeline mode, and 100+ parameters
          </li>
          <li>
            <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="reviewing-curating">
              Reviewing &amp; Curating
            </span>{' '}
            — How to review, filter, and manage what the cycles produce
          </li>
          <li>
            <span className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline cursor-pointer" data-doc="key-concepts">
              Key Concepts
            </span>{' '}
            — Node types, domains, partitions, and graph structure reference
          </li>
        </ul>
      </div>
    </div>
  );
}

export default Part2GrowingGraph;
