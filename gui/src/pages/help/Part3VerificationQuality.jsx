

function QualityPipelineDiagram() {
  return (
    <svg viewBox="0 0 880 340" className="w-full mx-auto" role="img" aria-label="Two-pipeline architecture: Birth pipeline and Cull pipeline">
      <defs>
        <marker id="arrow-vq" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* === BIRTH PIPELINE (top) === */}
      <rect x="20" y="10" width="840" height="150" rx="10" fill="#a855f7" opacity="0.06" stroke="#a855f7" strokeWidth="1" />
      <text x="440" y="30" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-sm font-semibold">Birth Pipeline — Permissive Creation</text>

      {/* Input */}
      <rect x="40" y="55" width="90" height="50" rx="6" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1" />
      <text x="85" y="77" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300" style={{ fontSize: '10px', fontWeight: 600 }}>Node Pairs</text>
      <text x="85" y="92" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400" style={{ fontSize: '10px' }}>sampled</text>

      {/* Mechanical gates */}
      {[
        { x: 160, label: 'Resonance' },
        { x: 255, label: 'Structural' },
        { x: 350, label: 'Voicing' },
        { x: 445, label: 'Specificity' },
        { x: 540, label: 'Dedup' },
        { x: 615, label: 'Junk' },
      ].map((g, i) => (
        <g key={i}>
          <rect x={g.x} y="55" width={g.x === 615 ? 55 : 75} height="50" rx="6" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="0.8" />
          <text x={g.x + (g.x === 615 ? 27 : 37)} y="84" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400" style={{ fontSize: '10px' }}>{g.label}</text>
          {i < 5 && <path d={`M ${g.x + (g.x === 615 ? 55 : 75)} 80 L ${[255, 350, 445, 540, 615][i]} 80`} fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow-vq)" />}
        </g>
      ))}
      <path d="M 130 80 L 158 80" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow-vq)" />

      {/* Minitruth — LLM reviewer */}
      <rect x="695" y="45" width="90" height="65" rx="8" fill="#06b6d4" opacity="0.15" stroke="#06b6d4" strokeWidth="1.5" />
      <text x="740" y="68" textAnchor="middle" className="fill-cyan-700 dark:fill-cyan-300" style={{ fontSize: '11px', fontWeight: 600 }}>Minitruth</text>
      <text x="740" y="82" textAnchor="middle" className="fill-cyan-600 dark:fill-cyan-400" style={{ fontSize: '10px' }}>LLM Judge</text>
      <text x="740" y="98" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400" style={{ fontSize: '10px' }}>accept/rework/reject</text>
      <path d="M 670 80 L 693 80" fill="none" stroke="#94a3b8" strokeWidth="1" markerEnd="url(#arrow-vq)" />

      {/* Born */}
      <rect x="805" y="55" width="45" height="50" rx="6" fill="#10b981" opacity="0.2" stroke="#10b981" strokeWidth="1.5" />
      <text x="828" y="84" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300" style={{ fontSize: '11px', fontWeight: 700 }}>Born</text>
      <path d="M 785 80 L 803 80" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrow-vq)" />

      {/* Mechanical label */}
      <text x="400" y="130" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '10px' }}>Mechanical checks (no LLM) — fast, deterministic</text>
      <text x="740" y="130" textAnchor="middle" className="fill-cyan-400 dark:fill-cyan-500" style={{ fontSize: '10px' }}>Single LLM call</text>

      {/* === CULL PIPELINE (bottom) === */}
      <rect x="20" y="180" width="840" height="150" rx="10" fill="#f59e0b" opacity="0.06" stroke="#f59e0b" strokeWidth="1" />
      <text x="440" y="200" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-sm font-semibold">Cull Pipeline — Post-Birth Quality Sweep</text>

      {/* Graph */}
      <rect x="40" y="220" width="120" height="55" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="100" y="243" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300" style={{ fontSize: '10px', fontWeight: 600 }}>Living Graph</text>
      <text x="100" y="258" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400" style={{ fontSize: '10px' }}>nodes past grace</text>

      {/* Consultant evaluation */}
      <rect x="230" y="215" width="240" height="65" rx="8" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="350" y="238" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300" style={{ fontSize: '11px', fontWeight: 600 }}>Comprehensive Consultant</text>
      <text x="350" y="254" textAnchor="middle" className="fill-amber-600 dark:fill-amber-400" style={{ fontSize: '10px' }}>Single LLM evaluation per node</text>
      <text x="350" y="268" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400" style={{ fontSize: '10px' }}>Coherence | Grounding | Novelty | Specificity | Analogy</text>
      <path d="M 160 248 L 228 248" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-vq)" />

      {/* Outcomes */}
      <rect x="540" y="215" width="80" height="30" rx="5" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1" />
      <text x="580" y="234" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300" style={{ fontSize: '10px', fontWeight: 600 }}>Boost ↑</text>

      <rect x="640" y="215" width="80" height="30" rx="5" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1" />
      <text x="680" y="234" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300" style={{ fontSize: '10px', fontWeight: 600 }}>Demote ↓</text>

      <rect x="740" y="215" width="80" height="30" rx="5" fill="#ef4444" opacity="0.15" stroke="#ef4444" strokeWidth="1" />
      <text x="780" y="234" textAnchor="middle" className="fill-red-700 dark:fill-red-300" style={{ fontSize: '10px', fontWeight: 600 }}>Archive ✗</text>

      <path d="M 470 235 L 538 225" fill="none" stroke="#10b981" strokeWidth="1" markerEnd="url(#arrow-vq)" />
      <path d="M 470 248 L 638 235" fill="none" stroke="#f59e0b" strokeWidth="1" markerEnd="url(#arrow-vq)" />
      <path d="M 470 260 L 738 240" fill="none" stroke="#ef4444" strokeWidth="1" markerEnd="url(#arrow-vq)" />

      {/* Cull label */}
      <text x="660" y="272" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400" style={{ fontSize: '10px' }}>Score vs threshold → boost / demote / archive</text>

      {/* Timing labels */}
      <text x="440" y="310" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '10px' }}>Runs on configurable schedule (grace period before first evaluation)</text>
    </svg>
  );
}

function LabPipelineDiagram() {
  return (
    <svg viewBox="0 0 880 160" className="w-full mx-auto" role="img" aria-label="Lab verification: three-stage pipeline with bias isolation">
      <defs>
        <marker id="arrow-evm" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Stage 1: Podbit — Extraction */}
      <rect x="15" y="15" width="220" height="80" rx="8" fill="#a855f7" opacity="0.10" stroke="#a855f7" strokeWidth="1.5" />
      <text x="125" y="38" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300" style={{ fontSize: '11px', fontWeight: 700 }}>1. Extract + Review</text>
      <text x="125" y="55" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400" style={{ fontSize: '10px' }}>LLM reads claim (bias surface)</text>
      <text x="125" y="70" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400" style={{ fontSize: '10px' }}>Tautology + falsifiability check</text>
      <text x="125" y="85" textAnchor="middle" className="fill-purple-400 dark:fill-purple-500" style={{ fontSize: '10px' }}>PODBIT</text>

      <path d="M 235 55 L 293 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-evm)" />

      {/* Stage 2: Lab Server — Execution */}
      <rect x="305" y="15" width="250" height="80" rx="8" fill="#0891b2" opacity="0.10" stroke="#0891b2" strokeWidth="1.5" />
      <text x="430" y="38" textAnchor="middle" className="fill-cyan-700 dark:fill-cyan-300" style={{ fontSize: '11px', fontWeight: 700 }}>2. Lab Execution</text>
      <text x="430" y="55" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400" style={{ fontSize: '10px' }}>Lab generates code, runs experiment</text>
      <text x="430" y="70" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400" style={{ fontSize: '10px' }}>Returns raw data + artifacts</text>
      <text x="430" y="85" textAnchor="middle" className="fill-cyan-400 dark:fill-cyan-500" style={{ fontSize: '10px' }}>SEPARATE SERVER (HTTP)</text>

      <path d="M 555 55 L 623 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-evm)" />

      {/* Stage 3: Podbit — Evaluation */}
      <rect x="635" y="15" width="230" height="80" rx="8" fill="#10b981" opacity="0.10" stroke="#10b981" strokeWidth="1.5" />
      <text x="750" y="38" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300" style={{ fontSize: '11px', fontWeight: 700 }}>3. Data Evaluation</text>
      <text x="750" y="55" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400" style={{ fontSize: '10px' }}>Evaluates data vs spec criteria</text>
      <text x="750" y="70" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400" style={{ fontSize: '10px' }}>Data-driven confidence scoring</text>
      <text x="750" y="85" textAnchor="middle" className="fill-emerald-400 dark:fill-emerald-500" style={{ fontSize: '10px' }}>PODBIT</text>

      {/* Bias isolation labels */}
      <text x="125" y="115" textAnchor="middle" className="fill-purple-400 dark:fill-purple-500" style={{ fontSize: '10px' }}>Only stage that sees</text>
      <text x="125" y="128" textAnchor="middle" className="fill-purple-400 dark:fill-purple-500" style={{ fontSize: '10px' }}>the claim narrative</text>
      <text x="430" y="115" textAnchor="middle" className="fill-cyan-400 dark:fill-cyan-500" style={{ fontSize: '10px' }}>Never sees the claim —</text>
      <text x="430" y="128" textAnchor="middle" className="fill-cyan-400 dark:fill-cyan-500" style={{ fontSize: '10px' }}>receives specs, returns data</text>
      <text x="750" y="115" textAnchor="middle" className="fill-emerald-400 dark:fill-emerald-500" style={{ fontSize: '10px' }}>Never sees the claim —</text>
      <text x="750" y="128" textAnchor="middle" className="fill-emerald-400 dark:fill-emerald-500" style={{ fontSize: '10px' }}>evaluates data vs spec criteria</text>

      <text x="440" y="152" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '10px' }}>Each stage is blind to the others' context — bias can only enter at Stage 1 (auditable)</text>
    </svg>
  );
}

function ElitePoolDiagram() {
  return (
    <svg viewBox="0 0 880 160" className="w-full mx-auto" role="img" aria-label="Elite pool generational synthesis">
      <defs>
        <marker id="arrow-ep" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Gen 0 */}
      <rect x="20" y="30" width="180" height="80" rx="8" fill="#0891b2" opacity="0.15" stroke="#0891b2" strokeWidth="1.5" />
      <text x="110" y="58" textAnchor="middle" className="fill-cyan-700 dark:fill-cyan-300 text-xs font-semibold">Gen 0 — Lab Verified</text>
      <text x="110" y="76" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400" style={{ fontSize: '10px' }}>Nodes that passed lab</text>
      <text x="110" y="90" textAnchor="middle" className="fill-cyan-500 dark:fill-cyan-400" style={{ fontSize: '10px' }}>verification with confidence</text>

      <path d="M 200 70 L 248 70" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-ep)" />

      {/* Gen 1 */}
      <rect x="260" y="30" width="170" height="80" rx="8" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1.5" />
      <text x="345" y="58" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-xs font-semibold">Gen 1 — Synthesis</text>
      <text x="345" y="76" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400" style={{ fontSize: '10px' }}>Synthesis of Gen 0 pairs</text>
      <text x="345" y="90" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400" style={{ fontSize: '10px' }}>Higher-order connections</text>

      <path d="M 430 70 L 478 70" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-ep)" />

      {/* Gen N */}
      <rect x="490" y="30" width="170" height="80" rx="8" fill="#6366f1" opacity="0.15" stroke="#6366f1" strokeWidth="1.5" />
      <text x="575" y="58" textAnchor="middle" className="fill-indigo-700 dark:fill-indigo-300 text-xs font-semibold">Gen N — Progressive</text>
      <text x="575" y="76" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400" style={{ fontSize: '10px' }}>Iterative refinement</text>
      <text x="575" y="90" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400" style={{ fontSize: '10px' }}>Deeper abstractions</text>

      <path d="M 660 70 L 718 70" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-ep)" />

      {/* Terminal */}
      <rect x="720" y="30" width="150" height="80" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="795" y="55" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">Terminal Findings</text>
      <text x="795" y="73" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400" style={{ fontSize: '10px' }}>Max generation reached</text>
      <text x="795" y="87" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400" style={{ fontSize: '10px' }}>Most distilled knowledge</text>

      <text x="440" y="145" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">Each generation synthesizes pairs from the previous — progressively refining verified knowledge</text>
    </svg>
  );
}

/** Help section: Verification and quality — birth/cull pipelines, lab verification, elite pool. */
function Part3VerificationQuality() {
  return (
    <div className="space-y-6">
      {/* Opening */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Verification and Quality</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit uses a two-pipeline architecture to balance creative freedom with quality control.
          The <strong>Birth pipeline</strong> is permissive — fast mechanical checks plus minitruth, a single LLM reviewer.
          The <strong>Cull pipeline</strong> runs periodically to evaluate existing nodes and prune weak ones.
          Beyond these, the Lab framework submits claims to external lab servers for empirical testing,
          and the elite pool distills the most validated knowledge through generational synthesis.
        </p>
      </div>

      {/* Two-Pipeline Architecture */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Two-Pipeline Architecture</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Every synthesis output passes through the birth pipeline before entering the graph. Once in the graph,
          nodes are periodically re-evaluated by the cull pipeline. This separation lets creative cross-domain
          connections form freely, while still maintaining graph quality over time.
        </p>
      </div>

      <QualityPipelineDiagram />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">
            Birth Pipeline
          </h3>
          <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
            Fast mechanical checks followed by minitruth, a single LLM reviewer. The mechanical
            gates are deterministic math/string operations — no LLM calls. Minitruth makes the final
            meaning judgment: accept, rework, or reject.
          </p>
          <ul className="text-xs text-purple-600 dark:text-purple-400 space-y-1 list-disc list-inside mb-2">
            <li><strong>Mechanical:</strong> Resonance, Structural, Voicing, Specificity, Dedup, Junk</li>
            <li><strong>Minitruth:</strong> Single LLM call — accept / rework (re-voice with feedback) / reject</li>
          </ul>
          <p className="text-xs text-purple-500 dark:text-purple-400">
            <strong>Design:</strong> Permissive creation — let creative connections through, judge meaning once.
          </p>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">
            Cull Pipeline
          </h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Periodically evaluates existing nodes using a single comprehensive LLM call per node. The
            consultant scores each node across five weighted dimensions and the composite score determines
            the outcome: boost, demote, or archive.
          </p>
          <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-1 list-disc list-inside mb-2">
            <li><strong>Coherence (30%)</strong> — does the node make logical sense?</li>
            <li><strong>Grounding (25%)</strong> — is it grounded in its parent nodes?</li>
            <li><strong>Novelty (20%)</strong> — does it say something new?</li>
            <li><strong>Derivation (15%)</strong> — are specific claims derived from reasoning, not just inherited?</li>
            <li><strong>Forced Analogy (10%)</strong> — is the connection genuine?</li>
          </ul>
          <p className="text-xs text-amber-500 dark:text-amber-400">
            <strong>Design:</strong> Strict quality sweep — nodes must prove their value to remain in the graph.
          </p>
        </div>
      </div>

      {/* Birth Pipeline Gates */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Birth Pipeline Gates</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The birth pipeline runs these gates in order. Mechanical gates are deterministic — no LLM involved.
          Minitruth is the only LLM call in the birth pipeline.
        </p>
      </div>

      {/* Mechanical gates */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Mechanical Gates</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Deterministic math and string operations. Every synthesis output must pass all of them before
          reaching minitruth.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Resonance Band</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Embedding similarity between parent nodes must fall within a tuned range. Too similar produces
              tautologies; too different produces nonsense.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Structural Validation</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Ensures the output is well-formed — proper length, not empty, meets format expectations.
              Catches malformed LLM responses before they enter the graph.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Voicing</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The LLM synthesis call itself — generating the insight from parent nodes. Includes
              hallucination heuristics, derivative checks, and truncation detection.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Specificity Scoring</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Measures concreteness — penalizes vague, generic language. A synthesis that says "these ideas
              are related" adds nothing. Specificity scoring demands substance.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Dedup</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Embedding similarity plus word overlap detection. Catches duplicates via rephrasing.
              Optional LLM judge for borderline cases in the doubt zone.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Junk Filter</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Compares against embeddings of previously junked nodes. Blocks content similar to known-bad
              output. Has 30-day decay to prevent permanent topic blocking.
            </p>
          </div>
        </div>
      </div>

      {/* Minitruth */}
      <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
        <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-3">
          Minitruth (LLM Reviewer)
        </h3>
        <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-3">
          After all mechanical gates pass, a single LLM call evaluates the synthesis. Armed
          with the project manifest for domain context, minitruth judges whether this content deserves
          to exist in the knowledge graph.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-cyan-100 dark:border-cyan-800">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">Accept</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">
              Content is valuable and well-formed. Proceeds to node creation.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-cyan-100 dark:border-cyan-800">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-1">Rework</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">
              Has potential but needs improvement. The feedback is sent back to voicing for a second attempt
              (max 1 rework). If rework still fails, the synthesis is rejected.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-cyan-100 dark:border-cyan-800">
            <p className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">Reject</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">
              Content is not worth keeping — hallucinated, derivative, or irrelevant. Discarded permanently.
            </p>
          </div>
        </div>
      </div>

      {/* Breakthrough Validation */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Breakthrough Validation Pipeline</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Nodes that survive synthesis quality gates can be further elevated to <strong>breakthrough</strong> status —
          the graph's highest tier of validated knowledge. Promotion goes through a dedicated 3-gate pipeline.
          View breakthroughs on the{' '}
          <button className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="reviewing-curating">
            Breakthrough page
          </button>.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Three Validation Gates</h3>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">1. Composite Scoring</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              Four dimensions scored: synthesis quality, novelty, testability, and tension resolution.
              The composite score must exceed a threshold for promotion.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">2. Novelty Gate</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              Is this insight genuinely new? Checks whether the knowledge already exists elsewhere in
              the graph at a higher quality level. Prevents promoting redundant breakthroughs.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
            <p className="text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-1">3. Lab Verification Gate</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              A final check against lab experiment results. If a lab has tested this claim
              and it was refuted, it cannot become a breakthrough regardless of other scores.
            </p>
          </div>
        </div>
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Post-Promotion Effects</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            When a node is promoted to breakthrough: its <strong>weight rises to 1.5</strong> (making it more likely to
            be sampled in future synthesis), its <strong>parent nodes get +0.15 weight</strong> (rewarding the ideas
            that led to the breakthrough), and <strong>grandparent nodes get +0.05</strong>. This creates a
            reinforcement signal that propagates backward through the graph — good ideas that produce
            breakthroughs are recognized automatically.
          </p>
        </div>
      </div>

      {/* Lab Verification */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Lab Verification</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Labs are Podbit's reality check. Claims are submitted to external lab servers for empirical testing —
          math computations, neural network training runs, parameter sweeps, simulations, or any experiment the
          lab can run. The three-stage pipeline isolates bias: only the spec extractor sees the claim narrative,
          the lab only sees experiment specifications (not the original claim), and the evaluator interprets raw
          data without narrative access. Claims that can't be reduced to testable experiments are honestly tagged
          as "not reducible" — no fake verification. Use{' '}
          <button className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="slash-commands">
            podbit.labVerify
          </button>{' '}
          MCP tools or the Verification page in the GUI.
        </p>
      </div>

      <LabPipelineDiagram />

      <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
        <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-3">Three-Stage Pipeline (Bias-Isolated)</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
              <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">1. Spec Extraction + Review (Podbit)</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                The ONE place that reads the claim narrative. An LLM extracts a structured experiment specification —
                what to compute, what to measure, what tolerance to use. Claims that can't be reduced to a
                testable spec are honestly tagged "not reducible." Prior rejection reasons are injected to
                prevent flip-flopping. The spec then passes a <strong>structural tautology check</strong> (rejects
                embedded code) and an optional <strong>adversarial falsifiability review</strong> (a second LLM checks
                for cherry-picked parameters). This is the auditable bias surface.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-cyan-200 dark:border-cyan-800">
              <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300 mb-1">2. Lab Execution (Separate Server)</p>
              <p className="text-xs text-cyan-600 dark:text-cyan-400">
                The lab receives a spec with experiment setup and measurements — never the claim. It generates
                code (using its own LLM), runs the experiment, and returns raw data plus any file artifacts
                (plots, logs, metrics). Labs are separate projects with their own config, models, and sandbox.
                Podbit talks to them over HTTP.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300 mb-1">3. Data Evaluation (Podbit)</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Evaluates lab results against the spec's evaluation criteria using the
                spec's evaluation criteria: numerical identity (within tolerance), convergence (series behaviour),
                threshold (above/below bound), trend (directional relationship), or boolean (pass/fail).
                Confidence is derived from data, not hallucinated by an LLM.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Node Freezing</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            When a node enters lab verification, it is <strong>frozen</strong> — excluded from synthesis pairing,
            decay, and lifecycle sweeps. This prevents the graph from building on unverified claims. The node is
            unfrozen when the experiment completes, regardless of outcome.
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Taint Propagation</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            When a claim is refuted, its downstream children can be <strong>tainted</strong> — marked as
            potentially unreliable because their foundation was disproved. Tainted nodes are excluded from synthesis
            until the taint expires (configurable decay) or is cleared by re-verification. Enable via config.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Lab Queue</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            Nodes can be enqueued for lab verification manually (via MCP or GUI) or automatically by the
            verification cycle. The queue worker freezes each node, submits the experiment spec to the lab
            server, polls for completion, then evaluates the raw data and applies graph consequences.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Each queue entry carries a template ID — different lab servers handle different experiment types.
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Evidence Commons</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            Lab results are stored as reusable evidence — not just verification logs. Computed values, metrics,
            and file artifacts (plots, logs, model weights) are stored in the evidence table and can be
            referenced by multiple nodes. A sparsity measurement from one experiment can be cited by any node
            discussing sparsity.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <strong>Decompose:</strong> Broad claims can be split into atomic facts for individual verification.
          </p>
        </div>
      </div>

      {/* Lab Architecture */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Lab Architecture</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Labs are separate projects — they run their own servers, have their own config, models, and sandbox
          rules. Podbit talks to them over HTTP. The quick-verify lab handles mathematical, computational, and
          claims. Other labs (NN training, simulation) handle different experiment types. Each lab implements
          the same 3-endpoint contract: submit, status, result.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Separation of Concerns</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-bold text-purple-700 dark:text-purple-300 mb-1">Podbit's Job</p>
            <ul className="text-xs text-purple-600 dark:text-purple-400 space-y-1 list-disc list-inside">
              <li>Decide whether to test (weight thresholds, queue)</li>
              <li>Extract experiment specs from claims (the bias surface)</li>
              <li>API reconnaissance (pre/post-lab fact checking)</li>
              <li>Evaluate lab data against spec criteria</li>
              <li>Apply graph consequences (weight, taint, archive)</li>
              <li>Store evidence in the empirical commons</li>
            </ul>
          </div>
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-3 border border-cyan-100 dark:border-cyan-800">
            <p className="text-xs font-bold text-cyan-700 dark:text-cyan-300 mb-1">Lab's Job</p>
            <ul className="text-xs text-cyan-600 dark:text-cyan-400 space-y-1 list-disc list-inside">
              <li>Generate code from experiment specs (own LLM, own language)</li>
              <li>Run experiments in sandbox (own security policy)</li>
              <li>Collect artifacts (plots, logs, metrics)</li>
              <li>Return raw data — not verdicts</li>
              <li>Handle retries internally</li>
              <li>Serve artifacts via HTTP</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Lab URL Configuration */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Lab URL Configuration</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Labs are reachable at HTTP URLs that the Podbit API needs to know. There are <strong>two
          kinds of labs</strong> and they store their URLs differently — built-in / co-located labs
          are config-driven so you can change ports without touching the database, while remote labs
          (added through the GUI) keep a literal URL in the registry because there's nowhere else to put it.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
            <h3 className="font-semibold text-sm text-emerald-700 dark:text-emerald-300 mb-2">Built-in / Co-located Labs</h3>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
              math-lab, nn-lab, critique-lab — they ship in the <code>podbit-labs/</code> sibling repo
              and run on the same machine. They declare a <strong>port key</strong> (e.g.
              <code className="bg-emerald-100 dark:bg-emerald-900/40 px-1 mx-0.5 rounded">mathLab</code>)
              that binds them to a slot in <code>config/port-defaults.json</code>.
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
              The registry stores the URL as a hint only — every read overlays the live URL from
              <code className="bg-emerald-100 dark:bg-emerald-900/40 px-1 mx-0.5 rounded">PORTS[port_key]</code>.
              Changing a port in <code>.env</code> propagates with <strong>no DB edits, no migrations</strong>.
            </p>
            <p className="text-xs text-emerald-500 dark:text-emerald-500">
              Set port_key when registering the lab via the Labs page — the URL field becomes a hint
              and is ignored.
            </p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-sm text-blue-700 dark:text-blue-300 mb-2">Remote / User-added Labs</h3>
            <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
              Labs you add via the Labs page that point at an external service — a colleague's
              cluster, a cloud VM, a CI runner. There's no config slot for them, so the URL you
              type into the form is the source of truth and is stored verbatim in the registry.
            </p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mb-2">
              Leave the <strong>Port Key</strong> field blank when registering. If the URL ever
              changes, edit it in the GUI — the registry row is the only place it lives.
            </p>
            <p className="text-xs text-blue-500 dark:text-blue-500">
              Auth (bearer token, API key, custom header) is also stored in the registry alongside
              the URL — only remote labs typically need it.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4 mb-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Canonical Port Block (4710-4716)</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            All Podbit + built-in lab services live in a contiguous block of ports chosen to
            sit outside Windows reserved/excluded ranges. Defaults are in
            <code className="bg-gray-100 dark:bg-gray-800 px-1 mx-0.5 rounded">config/port-defaults.json</code>;
            <code className="bg-gray-100 dark:bg-gray-800 px-1 mx-0.5 rounded">.env</code> overrides
            take priority at runtime.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left border-b dark:border-gray-700">
                  <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Port</th>
                  <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Service</th>
                  <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Env var</th>
                  <th className="py-1.5 font-medium text-gray-600 dark:text-gray-400">Configured in</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['4710', 'Podbit API server', 'API_PORT', '.env (Podbit)'],
                  ['4711', 'Orchestrator', 'ORCHESTRATOR_PORT', '.env (Podbit)'],
                  ['4712', 'GUI dev server', 'GUI_PORT', '.env (Podbit)'],
                  ['4713', 'Partition pool worker', 'PARTITION_SERVER_PORT', '.env (Podbit)'],
                  ['4714', 'math-lab', 'PORT', 'podbit-labs/math-lab/.env'],
                  ['4715', 'nn-lab', 'PORT', 'podbit-labs/nn-lab/.env'],
                  ['4716', 'critique-lab', 'PORT', 'podbit-labs/critique-lab/.env'],
                  ['11435', 'Knowledge proxy', 'PROXY_PORT', '.env (Podbit)'],
                ].map(([port, svc, env, where]) => (
                  <tr key={port} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{port}</td>
                    <td className="py-1.5 pr-3 text-gray-600 dark:text-gray-400">{svc}</td>
                    <td className="py-1.5 pr-3 font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap">{env}</td>
                    <td className="py-1.5 text-gray-500 dark:text-gray-400">{where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Changing Ports for an Installation</h3>
          <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
            <li>
              <strong>Podbit ports:</strong> Edit <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env</code>
              {' '}in the Podbit directory. Set <code>API_PORT=...</code>, <code>ORCHESTRATOR_PORT=...</code>, etc.
              Restart Podbit.
            </li>
            <li>
              <strong>Built-in lab ports:</strong> Edit each lab's own <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">.env</code>
              {' '}(e.g. <code>podbit-labs/math-lab/.env</code>). Set <code>PORT=...</code> and
              {' '}<code>PODBIT_URL=http://localhost:&lt;new API port&gt;</code> if Podbit also moved.
              Restart the lab.
            </li>
            <li>
              <strong>No DB action needed</strong> for built-in labs — the registry overlays the URL from
              {' '}<code>PORTS[port_key]</code> on every read, so the new port takes effect immediately.
            </li>
            <li>
              For <strong>remote labs</strong>, edit the URL in the Labs page. The registry row is the
              only source of truth.
            </li>
          </ol>
          <p className="text-xs text-gray-500 dark:text-gray-500 mt-3">
            <strong>Why this design?</strong> Earlier installations stored URLs in two places —
            <code>lab_registry</code> in the system DB and <code>lab_templates.execution_config</code> in
            the project DB. Port changes broke routing because only one of the two got migrated. The
            port_key overlay collapses the two sources into one config-driven flow for built-in labs,
            and DB-stored URLs are now reserved for cases where no config slot exists.
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4 mt-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Orchestrator-Managed Labs</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            The orchestrator can spawn the labs in <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">podbit-labs</code>
            {' '}as managed services — they appear in the Services page alongside the API server, GUI, proxy, and partition pool,
            with health checks and auto-restart for free.
          </p>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-disc list-inside">
            <li>
              <strong>Auto-detection:</strong> labs are discovered by checking
              {' '}<code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">PODBIT_LABS_ROOT/&lt;lab&gt;/package.json</code>
              {' '}(default root: <code>../podbit-labs</code>). Missing labs are silently skipped — installations
              without the labs sibling repo never see failed-health alerts for services they don't have.
            </li>
            <li>
              <strong>Per-lab autostart toggles</strong> in <code>.env</code>:
              {' '}<code>LAB_MATH_AUTOSTART</code>, <code>LAB_NN_AUTOSTART</code>, <code>LAB_CRITIQUE_AUTOSTART</code>.
              {' '}Default <code>false</code> — labs without the flag still appear on the Services page and
              can be started manually.
            </li>
            <li>
              <strong>Spawn command:</strong> <code>npm run dev</code> (tsx-driven, no build step).
              Edit lab source, restart from the Services page, no recompile.
            </li>
            <li>
              <strong>Override the labs root:</strong> set <code>PODBIT_LABS_ROOT=/absolute/path</code>
              {' '}in <code>.env</code> if your labs sibling repo lives somewhere unusual.
            </li>
          </ul>
        </div>
      </div>

      {/* API Verification & Enrichment */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">API Reconnaissance</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          External APIs provide real-world data for fact checking and enrichment. API reconnaissance runs
          in two phases: <strong>pre-lab</strong> (before spec extraction — corrects facts so the spec
          extractor works with verified data) and <strong>post-lab</strong> (after evaluation — enriches
          verified nodes with additional context from live data sources).
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1">Verify Mode</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Check claims against external data sources. The API response is compared to the node's
              claims — does the real data support or contradict the synthesis?
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-100 dark:border-amber-800">
            <p className="text-xs font-bold text-amber-700 dark:text-amber-300 mb-1">Enrich Mode</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Add context from external data. Doesn't check claims — instead augments the node with
              additional facts, statistics, or details from live data sources.
            </p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/20 rounded-lg p-3 border border-sky-100 dark:border-sky-800">
            <p className="text-xs font-bold text-sky-700 dark:text-sky-300 mb-1">Both Mode</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              Verify and enrich in one pass. Checks existing claims against external data while also
              adding new contextual information from the API response.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Results are stored as either <strong>inline edits</strong> (updating the node's content) or
          <strong> child nodes</strong> (creating new nodes linked to the original). Multi-claim iteration processes each
          claim in a node separately — a single node might have three claims verified against three different
          API calls.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Manage registered data sources on the API Registry page. APIs can include: scientific databases
          (PubChem, arXiv), financial feeds, weather services, public datasets, and any REST/JSON endpoint.
        </p>
      </div>

      {/* API Registry */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">API Registry</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The API Registry manages external data sources used for pre-lab and post-lab reconnaissance.
          Each API has configurable prompts for query generation, result interpretation, and data extraction,
          along with rate limiting and authentication settings.
        </p>
      </div>

      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">API Modes</h3>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-emerald-700 dark:text-emerald-300">Verify</p>
            <p className="text-sky-500 dark:text-sky-400">Fact-check claims against API data. Provides verification context to spec extraction and evaluation.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-purple-700 dark:text-purple-300">Enrich</p>
            <p className="text-sky-500 dark:text-sky-400">Extract new knowledge from API responses and create child nodes in the graph.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-sky-100 dark:border-sky-700">
            <p className="font-medium text-amber-700 dark:text-amber-300">Both</p>
            <p className="text-sky-500 dark:text-sky-400">Verify the claim first, then extract any new knowledge from the same response.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">API Cards</h3>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            Each registered API shows a card with mode badge, enable/disable toggle, base URL, rate limits,
            and call statistics. Expand to preview the query, interpret, and extract prompts.
          </p>
        </div>
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Actions</h3>
          <ul className="text-xs text-purple-600 dark:text-purple-400 list-disc list-inside space-y-1">
            <li><strong>Edit</strong> — full configuration modal (URL, auth, rate limits, prompts, scope)</li>
            <li><strong>Test</strong> — connectivity check or end-to-end claim test</li>
            <li><strong>Prompt History</strong> — version tracking for prompt changes</li>
            <li><strong>Delete</strong> — remove with confirmation</li>
          </ul>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Onboarding Interview</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Click <strong>Onboard API</strong> to start an LLM-guided multi-turn conversation that discovers the API's
          capabilities, generates appropriate prompts, and creates the registry entry automatically.
          The interview asks about endpoints, authentication, response format, and domain scope.
          Supported sources include scientific databases (PubChem, arXiv), financial feeds, weather services,
          and any REST/JSON endpoint.
        </p>
      </div>

      {/* Elite Pool */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Elite Verification Pool</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Lab-verified nodes enter the elite pool — a separate synthesis track that progressively refines
          verified knowledge through generational synthesis. This produces the graph's most distilled and
          validated insights. Access via{' '}
          <button className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="slash-commands">
            podbit.elite
          </button>{' '}
          MCP tools (stats, coverage, gaps, candidates, nodes, terminals, rescan, demote).
        </p>
      </div>

      <ElitePoolDiagram />

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Generational Synthesis</h3>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-3 border border-cyan-100 dark:border-cyan-800">
            <p className="text-xs font-medium text-cyan-700 dark:text-cyan-300 mb-1">Gen 0 — Entry</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">
              Nodes that passed lab verification with sufficient confidence. These are empirically tested
              claims — the strongest foundation for further synthesis.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">Gen 1+ — Refinement</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Pairs from the previous generation are synthesized into higher-order connections. Each
              generation builds on verified knowledge, producing progressively more abstract and refined
              insights.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Manifest Coverage</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              The <code className="text-gray-700 dark:text-gray-300">elite_mapping</code> subsystem maps elite nodes to your
              project goals (from the project manifest). Coverage reports show which goals have verified
              evidence and which remain unsupported — turning the elite pool into a project tracking tool.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Terminal Findings</p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Nodes at the maximum configured generation are <strong>terminal findings</strong> — the most
              synthesized and validated knowledge in the entire graph. These represent the deepest
              conclusions the system has reached, built on a chain of verified evidence.
            </p>
          </div>
        </div>
      </div>

      {/* Verification Page */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Verification Page</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The Verification page in the GUI provides a visual interface for the lab verification pipeline and its results.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Lab Experiment Results</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              View all lab experiments: which claim was tested, the experiment spec, raw data returned by the lab,
              supported/refuted verdict, and confidence scores. Filter by domain, status, or date range.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Pipeline Visualization</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              See where each claim is in the verification pipeline. Track progress from selection through
              evaluation. Identify bottlenecks (e.g., many claims stuck at spec extraction).
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Experiment Data and Output</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Inspect the experiment spec and raw data returned by the lab for any execution. Useful for
              understanding why a claim passed or failed — was the experiment reasonable? Did the lab produce valid data?
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Human Review Queue</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Borderline results (inconclusive, low confidence) surface for human review. You can
              override the lab's verdict, re-queue for testing with different parameters, or
              decompose the claim into more testable sub-claims.
            </p>
          </div>
        </div>
      </div>

      {/* Pipeline Page */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Pipeline Page</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The Pipeline page shows both pipelines. The birth pipeline appears as a D3 Sankey flow diagram —
          the main flow enters from the left and passes through each quality gate, with failures branching off
          to rejection reason nodes. Link width is proportional to event count. Below the Sankey, the cull
          pipeline shows summary stats: how many nodes were evaluated, boosted, demoted, and archived.
          A compact version of both appears on the Dashboard.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
          <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Birth Pipeline (Sankey Funnel)</h3>
          <ol className="text-xs text-purple-600 dark:text-purple-400 list-decimal list-inside space-y-0.5">
            <li>Research (autonomous seeding)</li>
            <li>Ground Rules (synthesizability)</li>
            <li>Resonance (cosine similarity band)</li>
            <li>Structural validation (vocabulary checks)</li>
            <li>Voicing (LLM synthesis)</li>
            <li>Specificity scoring</li>
            <li>Dedup (similarity + word overlap)</li>
            <li>Junk filter (known-bad cosine match)</li>
            <li>Minitruth (LLM reviewer)</li>
            <li>Node creation (Born)</li>
          </ol>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Cull Pipeline (Summary Stats)</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
            Shown below the birth Sankey as outcome counts:
          </p>
          <ul className="text-xs text-amber-600 dark:text-amber-400 list-disc list-inside space-y-0.5">
            <li><strong>Evaluated</strong> — total nodes assessed this window</li>
            <li><strong>Boosted</strong> — high-scoring nodes get weight increase</li>
            <li><strong>Demoted</strong> — mediocre nodes get weight decrease</li>
            <li><strong>Archived</strong> — low-scoring nodes removed from graph</li>
          </ul>
        </div>
      </div>

      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Sankey Flow Interaction</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
          Gates appear as purple nodes along the main flow. Failures branch off as red nodes — one per rejection reason.
          Green links show pass flow, red links show failure flow. Click any node to open the detail panel:
        </p>
        <ul className="text-xs text-purple-600 dark:text-purple-400 list-disc list-inside space-y-0.5">
          <li><strong>Click gate node</strong> — shows all events at that gate with rejection breakdown</li>
          <li><strong>Click reason node</strong> — filters to events with that specific rejection reason</li>
          <li><strong>Filter tabs</strong> — All, Passed, or Failed events with event cards below</li>
          <li><strong>VCR playback</strong> — Space (play/pause), Arrows (step), L (go live)</li>
        </ul>
      </div>

      {/* Intake Defense */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Intake Defense</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Beyond per-synthesis quality gates, Podbit has system-level defenses that protect the graph from
          structural problems.
        </p>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Domain Concentration Throttling</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Prevents any single domain from monopolizing synthesis cycles. If one domain is growing
              much faster than others, throttling kicks in to give other domains a chance. Prevents
              runaway feedback loops where one topic dominates the entire graph.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Contributor Exemptions</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              KB-ingested nodes, manual seeds, and human contributors are exempt from concentration
              checks. The throttle only protects against runaway autonomous cycles — not against
              intentional human or bulk-import activity.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border dark:border-gray-700">
            <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Junk Filter Decay</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Junk embeddings decay over 30 days. Without decay, junking a node permanently blocks
              all future content about the same topic — even good content. The decay ensures the
              junk filter protects against recent bad patterns without permanently poisoning topics.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          Tune intake defense parameters on the{' '}
          <button className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="configuration">
            Config page
          </button>.
          For details on the{' '}
          <button className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="growing-graph">
            synthesis cycle
          </button>{' '}
          that these defenses protect, see the Growing Your Graph section.
        </p>
      </div>
    </div>
  );
}

export default Part3VerificationQuality;
