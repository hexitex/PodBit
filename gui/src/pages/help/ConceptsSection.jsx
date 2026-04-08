import { Link } from 'react-router-dom';

function CycleEcosystemDiagram() {
  return (
    <svg viewBox="0 0 880 420" className="w-full mx-auto" role="img" aria-label="Autonomous cycle ecosystem">
      <defs>
        <marker id="arrow-cc" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
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
      <path d="M 225 80 C 280 120, 310 140, 330 160" fill="none" stroke="#a855f7" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Voicing - top right */}
      <rect x="615" y="20" width="195" height="80" rx="8" fill="#ec4899" opacity="0.15" stroke="#ec4899" strokeWidth="1.5" />
      <text x="712" y="48" textAnchor="middle" className="fill-pink-700 dark:fill-pink-300 text-xs font-semibold">Voicing Cycle</text>
      <text x="712" y="64" textAnchor="middle" className="fill-pink-500 dark:fill-pink-400 text-xs">Creative personas + loose pairing</text>
      <text x="712" y="78" textAnchor="middle" className="fill-pink-500 dark:fill-pink-400 text-xs">voiced nodes</text>
      <path d="M 615 80 C 560 120, 530 140, 510 160" fill="none" stroke="#ec4899" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Research - left */}
      <rect x="10" y="175" width="175" height="70" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="97" y="200" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">Research Cycle</text>
      <text x="97" y="216" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">LLM generates new seeds</text>
      <text x="97" y="230" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">for sparse domains</text>
      <path d="M 185 210 C 230 210, 280 210, 310 210" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Questions - right */}
      <rect x="655" y="175" width="175" height="70" rx="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="742" y="200" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-xs font-semibold">Question Cycle</text>
      <text x="742" y="216" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">Identifies knowledge gaps</text>
      <text x="742" y="230" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">question nodes</text>
      <path d="M 655 210 C 610 210, 560 210, 530 210" fill="none" stroke="#f59e0b" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Tensions - bottom left */}
      <rect x="50" y="310" width="175" height="70" rx="8" fill="#ef4444" opacity="0.15" stroke="#ef4444" strokeWidth="1.5" />
      <text x="137" y="335" textAnchor="middle" className="fill-red-700 dark:fill-red-300 text-xs font-semibold">Tensions Cycle</text>
      <text x="137" y="351" textAnchor="middle" className="fill-red-500 dark:fill-red-400 text-xs">Finds contradictions</text>
      <text x="137" y="365" textAnchor="middle" className="fill-red-500 dark:fill-red-400 text-xs">between similar nodes</text>
      <path d="M 225 330 C 280 300, 330 275, 350 260" fill="none" stroke="#ef4444" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Validation - bottom center */}
      <rect x="310" y="310" width="220" height="70" rx="8" fill="#6366f1" opacity="0.15" stroke="#6366f1" strokeWidth="1.5" />
      <text x="420" y="335" textAnchor="middle" className="fill-indigo-700 dark:fill-indigo-300 text-xs font-semibold">Validation + Autorating</text>
      <text x="420" y="351" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">Scores quality, promotes breakthroughs</text>
      <text x="420" y="365" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">Rates nodes for weight adjustment</text>
      <path d="M 420 310 C 420 290, 420 275, 420 260" fill="none" stroke="#6366f1" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Lab Verification - bottom right */}
      <rect x="615" y="310" width="195" height="70" rx="8" fill="#0891b2" opacity="0.15" stroke="#0891b2" strokeWidth="1.5" />
      <text x="712" y="335" textAnchor="middle" className="fill-cyan-700 dark:fill-cyan-300 text-xs font-semibold">Lab Verification</text>
      <text x="712" y="351" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400 text-xs">Submits to lab servers</text>
      <text x="712" y="365" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400 text-xs">for empirical testing</text>
      <path d="M 615 330 C 560 300, 510 275, 490 260" fill="none" stroke="#0891b2" strokeWidth="1.5" markerEnd="url(#arrow-cc)" />

      {/* Label */}
      <text x="420" y="410" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">All cycles run in parallel, each feeding back into the shared knowledge graph</text>
    </svg>
  );
}

/** Help section: cycle ecosystem and core concepts. */
function ConceptsSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">How Podbit Thinks</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit doesn't just store knowledge — it actively works on it. Seven autonomous cycles run in parallel,
          each with a distinct purpose. Some create new knowledge, some evaluate it, some destroy it.
          Understanding what each cycle does (and why it exists separately) is key to getting the most out of the system.
        </p>
      </div>

      {/* Where Knowledge Comes From */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Where Knowledge Comes From</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Before cycles can synthesize, they need raw material. Knowledge enters the graph through six distinct
          input paths, each suited to a different source type.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Manual Seeding</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
            The most direct path. You add knowledge via MCP (<code className="text-sky-700 dark:text-sky-300">podbit.propose</code>),
            the GUI Chat, or the Graph page. Seeds carry your domain expertise, hypotheses, observations,
            and curated facts. This is the only input path where you control exactly what enters the graph.
          </p>
          <p className="text-xs text-sky-500 dark:text-sky-400">
            <strong>Creates:</strong> <code className="text-sky-700 dark:text-sky-300">seed</code> nodes.
            <strong> Contributors:</strong> <code className="text-sky-700 dark:text-sky-300">human:*</code>, <code className="text-sky-700 dark:text-sky-300">claude</code>
          </p>
        </div>

        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
          <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Knowledge Base (File Ingestion)</h3>
          <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
            Bulk import from local folders — papers, documents, code, spreadsheets, images. Six reader plugins
            (text, PDF, doc, image, sheet, code) process files and create nodes. <strong>Curated mode</strong> uses
            LLMs to generate descriptions as <code className="text-orange-700 dark:text-orange-300">seed</code> nodes.{' '}
            <strong>Raw mode</strong> ingests verbatim as <code className="text-orange-700 dark:text-orange-300">raw</code> nodes
            (searchable, but excluded from synthesis).
          </p>
          <p className="text-xs text-orange-500 dark:text-orange-400">
            <strong>Creates:</strong> <code className="text-orange-700 dark:text-orange-300">seed</code> or <code className="text-orange-700 dark:text-orange-300">raw</code> nodes.
            <strong> Contributors:</strong> <code className="text-orange-700 dark:text-orange-300">kb:*</code>.
            See <Link to="/help/kb" className="underline">Knowledge Base</Link>.
          </p>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Research Cycle (LLM Knowledge)</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
            The research cycle asks an LLM to generate factual seeds for under-populated domains, drawing on
            the model's training knowledge. This is how the LLM's broad knowledge about a topic enters the
            graph — filtered through relevance gates so only on-topic content makes it in.
          </p>
          <p className="text-xs text-emerald-500 dark:text-emerald-400">
            <strong>Creates:</strong> <code className="text-emerald-700 dark:text-emerald-300">seed</code> nodes.
            <strong> Contributors:</strong> <code className="text-emerald-700 dark:text-emerald-300">research-cycle</code>
          </p>
        </div>

        <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
          <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">API Enrichment (External Data)</h3>
          <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-2">
            Registered external APIs (weather services, scientific databases, financial data, etc.) are called
            during lab verification. The API response is parsed by an LLM into discrete facts, and each
            fact becomes a new node. This is how real-world data enters the graph — not from the LLM's
            training, but from live data sources.
          </p>
          <p className="text-xs text-cyan-500 dark:text-cyan-400">
            <strong>Creates:</strong> <code className="text-cyan-700 dark:text-cyan-300">seed</code> nodes.
            <strong> Contributors:</strong> <code className="text-cyan-700 dark:text-cyan-300">api-enrichment:*</code>.
            See <Link to="/help/api-registry" className="underline">API Registry</Link>.
          </p>
        </div>

        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Synthesis &amp; Voicing (Derived Knowledge)</h3>
          <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
            Not technically an "input" — these cycles recombine existing knowledge into new insights. But
            their output feeds back into the graph and becomes input for future cycles. A synthesis node
            can be paired with a seed to produce a second-generation synthesis, and so on. This is how
            the graph deepens over time.
          </p>
          <p className="text-xs text-purple-500 dark:text-purple-400">
            <strong>Creates:</strong> <code className="text-purple-700 dark:text-purple-300">synthesis</code> and <code className="text-purple-700 dark:text-purple-300">voiced</code> nodes.
            <strong> Contributors:</strong> <code className="text-purple-700 dark:text-purple-300">synthesis</code>, <code className="text-purple-700 dark:text-purple-300">voicing-cycle</code>
          </p>
        </div>

        <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
          <h3 className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-2">Chat &amp; Proxy (Conversational)</h3>
          <p className="text-xs text-teal-600 dark:text-teal-400 mb-2">
            The GUI Chat and Knowledge Proxy can seed knowledge from conversations. When a chat response
            contains useful information, it can be proposed to the graph. The proxy enriches LLM
            calls with graph context, and the resulting conversation can feed discoveries back.
          </p>
          <p className="text-xs text-teal-500 dark:text-teal-400">
            <strong>Creates:</strong> <code className="text-teal-700 dark:text-teal-300">seed</code> nodes.
            See <Link to="/help/chat" className="underline">Chat</Link> and <Link to="/help/proxy" className="underline">Knowledge Proxy</Link>.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">The Input Spectrum</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Each input path occupies a different position on the precision-vs-scale spectrum:
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">High precision, low volume</span>
          <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-orange-400 opacity-40" />
          <span className="font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Low precision, high volume</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
          <span>Manual seeding</span>
          <span>Chat / Proxy</span>
          <span>Research cycle</span>
          <span>API enrichment</span>
          <span>KB ingestion</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          A healthy graph uses multiple input paths. Manual seeds provide curated expertise. KB ingestion
          brings in source material at scale. Research fills gaps with LLM knowledge. API enrichment
          grounds claims in real data. The quality gates in synthesis and the autorating cycle handle
          the varying quality levels — higher-quality inputs naturally rise in weight.
        </p>
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

      {/* The Evaluators */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">The Evaluators</h2>
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

      {/* Lab */}
      <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
        <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">
          Lab Verification Cycle
        </h3>
        <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-2">
          The most unusual cycle. It extracts experiment specifications from claims and <strong>submits them
          to external lab servers for empirical testing</strong>. Labs run the experiments and return raw data.
          Podbit evaluates the data against spec criteria — no LLM, just data comparison — and updates the node's
          verification status and weight.
        </p>
        <p className="text-xs text-cyan-500 dark:text-cyan-400">
          <strong>Why:</strong> LLMs can sound confident about things that are wrong. Lab verification is the system's
          reality check — the only cycle that tests claims against something other than other claims. Not every
          claim is reducible to an experiment, but for those that are, empirical data is the strongest signal.
        </p>
      </div>

      {/* How they work together */}
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
          <li><strong>Lab verification</strong> empirically tests claims, adding verification scores that feed back into quality</li>
        </ol>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          All cycles run in parallel on configurable intervals. Each has its own LLM subsystem assignment
          and can be independently enabled, disabled, or tuned on the{' '}
          <Link to="/help/config" className="text-podbit-500 hover:text-podbit-400 underline">Config page</Link>.
          For a technical deep-dive into the synthesis pipeline, quality gates, and pipeline modes, see the{' '}
          <Link to="/help/synthesis" className="text-podbit-500 hover:text-podbit-400 underline">Synthesis Engine</Link> docs.
        </p>
      </div>

      {/* Node Lifecycle */}
      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">The Lifecycle of a Node</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Understanding node types clarifies what each cycle produces and consumes:
        </p>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">seed</p>
            <p className="text-gray-500 dark:text-gray-400">Raw input from humans, research cycle, or KB ingestion. The starting material for everything.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">synthesis</p>
            <p className="text-gray-500 dark:text-gray-400">Created by the synthesis engine. Precision-matched pairs, analytically derived. Has parent edges linking to the source nodes.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">voiced</p>
            <p className="text-gray-500 dark:text-gray-400">Created by the voicing cycle. Persona-driven perspectives on node pairs — creative, adversarial, or naive interpretations.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">breakthrough</p>
            <p className="text-gray-500 dark:text-gray-400">Promoted by validation. The graph's highest-quality insights — survived synthesis, quality gates, and scoring.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">question</p>
            <p className="text-gray-500 dark:text-gray-400">Generated by the question cycle. Represents a knowledge gap. Guides research and human investigation.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">raw</p>
            <p className="text-gray-500 dark:text-gray-400">Verbatim KB ingestion (raw mode). Searchable reference material, excluded from synthesis cycles.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <p className="font-medium text-gray-700 dark:text-gray-300">elite_verification</p>
            <p className="text-gray-500 dark:text-gray-400">Lab verification results — experiment data, output, and pass/fail status attached to the claim they tested.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConceptsSection;
