import { Link } from 'react-router-dom';
import { Sparkles, Terminal, Server, SlidersHorizontal, Brain } from 'lucide-react';

function AiTuneFlowDiagram() {
  return (
    <svg viewBox="0 0 800 140" className="w-full mx-auto" role="img" aria-label="AI Tune flow">
      <defs>
        <marker id="arrow6" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Step 1: Click */}
      <rect x="10" y="20" width="130" height="55" rx="8" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1.5" />
      <text x="75" y="42" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-semibold">Click</text>
      <text x="75" y="55" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Sparkle icon</text>
      <text x="75" y="67" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">on any section</text>

      <line x1="145" y1="47" x2="165" y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow6)" />

      {/* Step 2: Describe */}
      <rect x="170" y="20" width="130" height="55" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="235" y="42" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Describe</text>
      <text x="235" y="55" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Type request or</text>
      <text x="235" y="67" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">pick a preset</text>

      <line x1="305" y1="47" x2="325" y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow6)" />

      {/* Step 3: LLM Analyzes */}
      <rect x="330" y="20" width="130" height="55" rx="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="395" y="42" textAnchor="middle" className="text-xs fill-amber-700 dark:fill-amber-400 font-semibold">LLM Analyzes</text>
      <text x="395" y="55" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">Current values +</text>
      <text x="395" y="67" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">your intent</text>

      <line x1="465" y1="47" x2="485" y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow6)" />

      {/* Step 4: Review */}
      <rect x="490" y="20" width="130" height="55" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="555" y="42" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-semibold">Review</text>
      <text x="555" y="55" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Accept / reject</text>
      <text x="555" y="67" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">each suggestion</text>

      <line x1="625" y1="47" x2="645" y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow6)" />

      {/* Step 5: Apply */}
      <rect x="650" y="20" width="130" height="55" rx="8" fill="#6366f1" opacity="0.15" stroke="#6366f1" strokeWidth="1.5" />
      <text x="715" y="42" textAnchor="middle" className="text-xs fill-indigo-700 dark:fill-indigo-400 font-semibold">Apply</text>
      <text x="715" y="55" textAnchor="middle" className="text-xs fill-indigo-600 dark:fill-indigo-400">Sliders update</text>
      <text x="715" y="67" textAnchor="middle" className="text-xs fill-indigo-600 dark:fill-indigo-400">then Save</text>

      {/* Bottom annotation */}
      <rect x="170" y="95" width="440" height="30" rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
      <text x="390" y="114" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">Changes are previewed in the dialog. Nothing is saved until you click "Save Changes".</text>
    </svg>
  );
}

/** Help section: config sections list and AI Tune flow. */
function ConfigSection() {
  const categoryList = [
    { name: 'Synthesis Band', desc: 'Resonance threshold, similarity ceiling, specificity, partner selection, domain-directed synthesis', icon: '🎯' },
    { name: 'Quality Gates', desc: 'Dedup, hallucination detection, claim provenance, redundancy ceiling, junk filter, node validation', icon: '🛡️' },
    { name: 'Output Shape', desc: 'Voicing word limits, compression, novelty check, prompt injection detection', icon: '📐' },
    { name: 'Node Evolution', desc: 'Salience/weight dynamics, decay rates, fitness scoring, GA features, node lifecycle', icon: '🧬' },
    { name: 'Autonomous Cycles', desc: 'Validation, questions, tensions, research, autorating, lab verification, voicing, and population control', icon: '🔄' },
    { name: 'Verification & Elite', desc: 'Lab framework (freeze, taint), verification outcomes, API reconnaissance, decomposition, elite pool', icon: '✅' },
    { name: 'Knowledge Delivery', desc: 'Proxy budget, context engine, intake defense, knowledge base ingestion', icon: '📚' },
    { name: 'Model Parameters', desc: 'Per-subsystem temperature, top_p, min_p, top_k, repeat penalty, and consultant settings', icon: '🤖' },
    { name: 'Word Lists & Patterns', desc: 'Telegraphic word lists, vocabulary, stop words, voicing cleanup, transient partitions', icon: '📋' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Configuration & AI Tuning</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Config page exposes <strong>400+ algorithm parameters</strong> across 9 behavioral categories that control
          the most impactful aspects of Podbit: <Link to="/help/synthesis" className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100">synthesis engine</Link> behavior, synthesis quality,
          compression, <Link to="/help/context" className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100">context engine</Link>, and <Link to="/help/proxy" className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100">proxy</Link> settings.
          A <strong>3-tier progressive disclosure</strong> system (Basic / Intermediate / Advanced) controls which parameters are visible,
          and each section has an <strong>AI Tune</strong> feature for LLM-powered parameter suggestions.
        </p>
      </div>

      {/* Birth / Cull Architecture */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-2">Birth / Cull Architecture</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          Synthesis uses a two-phase quality model. Birth runs mechanical checks (resonance, dedup, junk,
          specificity) plus <strong>Minitruth</strong>, an LLM reviewer that can accept, rework with
          feedback, or reject. The <strong>Population Control</strong> cycle then evaluates nodes after a grace
          period using a single comprehensive LLM call, demoting or archiving weak ones.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Birth (Mechanical + Minitruth)</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Mechanical: resonance, dedup, junk, specificity, structural, truncation, word count.
              Then minitruth: manifest-armed LLM reviewer (accept / rework / reject).
            </p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded p-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Cull (Single LLM Evaluation)</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              One comprehensive LLM call per node scores coherence, grounding, novelty, specificity,
              forced analogy, and incremental value. Outcome: boost, demote, or archive.
            </p>
          </div>
        </div>
      </div>

      {/* AI Tune Feature */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-3 flex items-center gap-2">
          <Sparkles size={16} />
          AI Tune  - How It Works
        </h3>
        <AiTuneFlowDiagram />
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-900 border border-purple-100 dark:border-purple-700 rounded p-3">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Quick Presets</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                Each section offers 2-3 preset buttons like "More Exploration", "Strict Quality",
                or "Knowledge-Heavy" that send a pre-written intent to the LLM. One click to get suggestions.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-purple-100 dark:border-purple-700 rounded p-3">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Custom Requests</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                Type any natural language request like "make the synthesis engine focus on my biology domain"
                or "I want more aggressive dedup to keep the graph clean". The LLM understands the section context.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-gray-900 border border-purple-100 dark:border-purple-700 rounded p-3">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Review & Select</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                Each suggestion shows the current value, proposed value, percent change, a visual range bar,
                and a plain-language explanation. Toggle individual suggestions on/off before applying.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-purple-100 dark:border-purple-700 rounded p-3">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Safe & Reversible</p>
              <p className="text-xs text-purple-600 dark:text-purple-400">
                Applied suggestions update the sliders but aren't saved until you click "Save Changes".
                Use "Reset" to revert all changes. Values are always clamped to valid ranges.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Category Overview */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Category Groups</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Parameters are organized into 9 behavioral categories. Each category contains multiple collapsible sections,
          each with a help badge and AI Tune button (sparkle icon).
        </p>
        <div className="grid grid-cols-3 gap-2">
          {categoryList.map(c => (
            <div key={c.name} className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tier System */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h3 className="font-semibold text-blue-700 dark:text-blue-300 text-sm mb-2">Progressive Disclosure (Tiers)</h3>
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
          A 3-level tier selector controls which parameters are visible. Each parameter has its own tier assignment,
          allowing fine-grained control over complexity. Sections with no visible parameters at the current tier are hidden entirely.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-700 rounded p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Basic</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              ~34 essential parameters: resonance threshold, similarity ceiling, word limits, cycle toggles,
              voice+chat temperatures. Enough for most users.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-700 rounded p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Intermediate</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Adds decay rates, fitness weights, dedup thresholds, cycle intervals, context engine budgets,
              and most subsystem temperatures. For experienced users tuning specific behaviors.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-700 rounded p-3">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Advanced</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              All 400+ parameters including magic numbers, tier-specific quality gate overrides,
              lab verification routing, consultant pipeline weights, and inference parameters (top_k, min_p).
            </p>
          </div>
        </div>
      </div>

      {/* Radar Chart */}
      <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
        <h3 className="font-semibold text-green-700 dark:text-green-300 text-sm mb-2">System Configuration Profile (Radar)</h3>
        <p className="text-xs text-green-600 dark:text-green-400 mb-3">
          An interactive 7-axis radar chart provides a high-level view of system behavior. Click an axis dot
          to see which parameters contribute. Drag dots to proportionally adjust all contributing parameters.
        </p>
        <div className="grid grid-cols-4 gap-2">
          {[
            ['Selectivity', 'How strict the synthesis filter is (threshold, dedup, gates)'],
            ['Reach', 'How aggressively the system explores (migration, multi-parent, weight ceiling)'],
            ['Tempo', 'How fast cycles run and nodes decay (cycle delay, decay rates)'],
            ['Turnover', 'How quickly the node population evolves (lifecycle, salience decay)'],
            ['Amplification', 'How much good nodes are boosted (parent boost, lab boost, weight ceiling)'],
            ['Verification', 'Depth of verification infrastructure (lab verification, provenance, counterfactual)'],
            ['Output Discipline', 'How constrained synthesis output is (word limits, compression, novelty)'],
          ].map(([axis, desc]) => (
            <div key={axis} className="bg-white dark:bg-gray-900 rounded p-2 border border-green-100 dark:border-green-700">
              <p className="text-xs font-medium text-green-700 dark:text-green-300">{axis}</p>
              <p className="text-xs text-green-600 dark:text-green-400">{desc}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-green-500 dark:text-green-400 mt-2">
          Dragging preferentially adjusts basic-tier parameters (full effect), slightly adjusts intermediate (30% effect),
          and never touches advanced parameters — protecting expert settings from accidental changes.
        </p>
      </div>

      {/* Diagnostics & Warnings */}
      <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
        <h3 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">Live Diagnostics & Soft Warnings</h3>
        <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-3">
          The Config page shows real-time computed diagnostics and soft warnings that update as you change parameters.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-cyan-100 dark:border-cyan-700 rounded p-3">
            <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mb-1">Diagnostics (8 computed values)</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">
              Synthesis band width, salience half-life, weight half-life, amplification range, gate strictness heatmap,
              estimated LLM calls/hour, quality pipeline summary, and context budget breakdown. Color-coded green/amber/red.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-cyan-100 dark:border-cyan-700 rounded p-3">
            <p className="text-xs font-semibold text-cyan-700 dark:text-cyan-300 mb-1">Soft Warnings (10 checks)</p>
            <p className="text-xs text-cyan-600 dark:text-cyan-400">
              Detects pathological configurations: narrow synthesis band, conflicting word limits and specificity,
              fast salience decay, junk filter poisoning risk, low amplification, consultant mode inactive gates, etc.
              Dismissible alerts — advisory only, won't block saves.
            </p>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Tips for Tuning</h3>
        <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1.5">
          <li><strong>Start with Basic tier</strong>  - the ~34 essential parameters cover the most impactful settings. Use the radar chart for quick adjustments.</li>
          <li><strong>Watch the diagnostics</strong>  - the 8-panel diagnostic grid shows the combined effect of your changes in real-time.</li>
          <li><strong>Address warnings</strong>  - soft warnings detect configurations that are technically valid but likely problematic.</li>
          <li><strong>Use presets</strong>  - they make sensible, coordinated changes across related parameters.</li>
          <li><strong>Tune one section at a time</strong>  - changing multiple sections simultaneously makes it hard to attribute behavior changes.</li>
          <li><strong>Changes are immediate</strong>  - once saved, new synthesis cycles and context engine calls use the updated values right away.</li>
        </ul>
      </div>

      {/* Self-Tuning via MCP */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-3 flex items-center gap-2">
          <Terminal size={16} />
          Self-Tuning via MCP  - <code className="text-xs bg-indigo-100 dark:bg-indigo-900/30 px-1 rounded">podbit.config</code>
        </h3>
        <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-3">
          Beyond the GUI, an MCP tool (<strong>podbit.config</strong>) gives AI agents programmatic control
          over all tunable parameters. This enables autonomous tuning workflows where an AI agent reads metrics,
          decides what to adjust, applies changes, and monitors the result  - all without human intervention.
          Frontier models are recommended for autonomous tuning due to the reasoning required.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700 rounded p-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Read & Analyze</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              <strong>get</strong>  - read current values for a section.{' '}
              <strong>sections</strong>  - list all tunable sections with metadata.{' '}
              <strong>metrics</strong>  - quality dashboard with synthesis stats, rejection breakdown, and overfitting detection.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700 rounded p-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Tune & Apply</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              <strong>tune</strong>  - LLM-powered suggestions from a natural language request.{' '}
              <strong>apply</strong>  - apply changes with validation, clamping, and audit trail.
              Values are checked against min/max/step and recorded in config_history.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700 rounded p-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Audit & Rollback</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              <strong>history</strong>  - query the config change audit log.{' '}
              <strong>snapshot</strong>  - save, list, or restore named config snapshots for easy rollback.
              Every change records who made it, the old/new values, and the reason.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700 rounded p-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">Reflect</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              <strong>reflect</strong>  - returns structured context about recent changes, overfitting state,
              and tuning domain nodes. The AI synthesizes a reflection and saves it to the knowledge graph
              for the synthesis engine to discover meta-patterns.
            </p>
          </div>
        </div>
      </div>

      {/* System Health & Overfitting Detection */}
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-3 flex items-center gap-2">
          <Server size={16} />
          System Health & Overfitting Detection
        </h3>
        <p className="text-xs text-red-700 dark:text-red-300 mb-3">
          The Config page includes an <strong>Overfitting Warnings</strong> panel (right column) that
          monitors synthesis engine health and detects when tuning has gone wrong. It polls the metrics
          endpoint every 30 seconds.
        </p>
        <div className="space-y-2">
          <div className="bg-white dark:bg-gray-900 border border-red-100 dark:border-red-700 rounded p-3">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Synthesis Stats</p>
            <p className="text-xs text-red-600 dark:text-red-400">
              Shows total synthesis cycles, nodes created, and success rate as a percentage.
              A healthy system typically has a 5-15% success rate  - most rejections are healthy quality filtering.
              Above 20% may indicate weak quality gates; below 3% may mean constraint conflicts.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-red-100 dark:border-red-700 rounded p-3">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Three Overfitting Signals</p>
            <p className="text-xs text-red-600 dark:text-red-400">
              <strong>Oscillation</strong> (red)  - the same parameter was changed 3+ times in the detection window,
              suggesting indecision.{' '}
              <strong>Plateau</strong> (yellow)  - over 70% of recent changes set the same value, indicating no real tuning.{' '}
              <strong>Collapse</strong> (yellow)  - success rate dropped more than 20% compared to the prior period.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-red-100 dark:border-red-700 rounded p-3">
            <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">Rejection Breakdown</p>
            <p className="text-xs text-red-600 dark:text-red-400">
              The top 5 reasons synthesis cycles were rejected, with percentage bars. Common reasons include
              low novelty, hallucination flags, redundancy ceiling, dedup matches, junk filter, and specificity gates.
              This helps identify which quality gate is the bottleneck.
            </p>
          </div>
        </div>
      </div>

      {/* Snapshots & History */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-3 flex items-center gap-2">
          <SlidersHorizontal size={16} />
          Config Snapshots & Change History
        </h3>
        <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-3">
          Two additional panels in the Config page right column provide audit and rollback capabilities.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-700 rounded p-3">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Snapshots</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Save the current config state with a descriptive label (e.g., "Before aggressive tuning").
              Restore any previous snapshot with one click  - a confirmation dialog prevents accidental restores.
              Snapshots capture all parameter values, not just the ones you changed.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-700 rounded p-3">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Change History</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              A filterable log of every config change (24h / 7 days / 30 days). Each entry shows the
              parameter path, old and new values, who made the change (human / system), and the reason.
              Polls every 15 seconds so you see changes from both GUI and MCP in real time.
            </p>
          </div>
        </div>
      </div>

      {/* Inference Parameters */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-3 flex items-center gap-2">
          <SlidersHorizontal size={16} />
          Per-Subsystem Inference Parameters
        </h3>
        <p className="text-xs text-orange-700 dark:text-orange-300 mb-3">
          Five inference parameters can be configured independently for each of the 14 subsystems (voice, chat, compress, proxy, context, docs, research, keyword, and the 6 KB readers).
          Parameters are only sent to the model when explicitly set  - otherwise the model uses its own defaults.
        </p>
        <div className="grid grid-cols-5 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-orange-700 rounded p-2">
            <p className="font-medium text-orange-700 dark:text-orange-300">Temperature</p>
            <p className="text-orange-500 dark:text-orange-400">Creativity vs determinism (0-1.5)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-orange-700 rounded p-2">
            <p className="font-medium text-orange-700 dark:text-orange-300">Top P</p>
            <p className="text-orange-500 dark:text-orange-400">Nucleus sampling cutoff (0-1)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-orange-700 rounded p-2">
            <p className="font-medium text-orange-700 dark:text-orange-300">Min P</p>
            <p className="text-orange-500 dark:text-orange-400">Min probability threshold (0-0.5)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-orange-700 rounded p-2">
            <p className="font-medium text-orange-700 dark:text-orange-300">Top K</p>
            <p className="text-orange-500 dark:text-orange-400">Token candidate limit (0-100)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-orange-700 rounded p-2">
            <p className="font-medium text-orange-700 dark:text-orange-300">Repeat Penalty</p>
            <p className="text-orange-500 dark:text-orange-400">Repetition suppression (1.0-2.0)</p>
          </div>
        </div>
      </div>

      {/* Auto-Tune */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-3 flex items-center gap-2">
          <Sparkles size={16} />
          Auto-Tune & Gold Standard Scoring
        </h3>
        <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
          The <strong>Auto-Tune</strong> button on the Models page launches an automated parameter search.
          When gold standards exist (generated by a tuning judge model from your customized prompts),
          scoring uses <strong>embedding cosine similarity</strong> against 3-tier reference responses.
          Without gold standards, heuristic scorers (JSON validity, word counts, etc.) are used as fallback.
          The search runs concurrently, respecting each model's maxConcurrency setting.
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          For comprehensive documentation of the tuning system including gold standard generation,
          parameter grid search, concurrent execution, aggregated multi-prompt scoring, and variance-weighted convergence, see the
          <Link to="/help/tuning" className="underline decoration-amber-300 ml-1 font-medium hover:text-amber-800 dark:hover:text-amber-200">Auto-Tune & Gold Standards</Link> section.
        </p>
      </div>

      {/* Know Thyself */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-3 flex items-center gap-2">
          <Brain size={16} />
          Know Thyself  - Auto-Seeded Tuning Knowledge
        </h3>
        <p className="text-xs text-sky-700 dark:text-sky-300 mb-3">
          When the system tunes its own parameters, it automatically seeds that tuning knowledge as nodes
          in the knowledge graph under a dedicated <strong>know-thyself</strong> partition. The synthesis engine
          can then discover meta-patterns about what tuning strategies actually work.
        </p>
        <div className="space-y-2">
          <div className="bg-white dark:bg-gray-900 border border-sky-100 dark:border-sky-700 rounded p-3">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">What Gets Auto-Seeded</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              <strong>Config changes</strong>  - when significant parameters are applied (changes &ge; 1% of range),
              a seed node records what changed, the old/new values, the reason, and current metrics.{' '}
              <strong>Overfitting events</strong>  - when the metrics action detects overfitting signals, a synthesis
              node records which signals fired and the recommendation.{' '}
              <strong>Snapshots</strong>  - save and restore events are seeded with labels and metrics context.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-sky-100 dark:border-sky-700 rounded p-3">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Quality Gates</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              Not every change creates a node. A significance filter skips trivial changes,
              a hash-based dedup guard prevents seeding identical overfitting states,
              and content length is validated (20-2000 chars). A metrics follow-up system
              links "before" and "after" seeds when the metrics action is called 5+ minutes after a tuning change.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-sky-100 dark:border-sky-700 rounded p-3">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Reflect Action</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              Use <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">podbit.config(action: "reflect")</code> to gather
              recent tuning activity into structured context. The AI reviews the context and synthesizes
              a reflection, which it saves as a synthesis node in the tuning domain. Over time, the synthesis engine
              discovers cross-domain connections between tuning events and system behavior.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConfigSection;
