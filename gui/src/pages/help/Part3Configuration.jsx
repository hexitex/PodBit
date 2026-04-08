

function AiTuneFlowDiagram() {
  return (
    <svg viewBox="0 0 800 140" className="w-full mx-auto" role="img" aria-label="AI Tune flow">
      <defs>
        <marker id="arrow6" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      <rect x="10" y="20" width="130" height="55" rx="8" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1.5" />
      <text x="75" y="42" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-semibold">Click</text>
      <text x="75" y="55" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Sparkle icon</text>
      <text x="75" y="67" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">on any section</text>
      <line x1="145" y1="47" x2="165" y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow6)" />
      <rect x="170" y="20" width="130" height="55" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="235" y="42" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Describe</text>
      <text x="235" y="55" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Type request or</text>
      <text x="235" y="67" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">pick a preset</text>
      <line x1="305" y1="47" x2="325" y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow6)" />
      <rect x="330" y="20" width="130" height="55" rx="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="395" y="42" textAnchor="middle" className="text-xs fill-amber-700 dark:fill-amber-400 font-semibold">LLM Analyzes</text>
      <text x="395" y="55" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">Current values +</text>
      <text x="395" y="67" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">your intent</text>
      <line x1="465" y1="47" x2="485" y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow6)" />
      <rect x="490" y="20" width="130" height="55" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="555" y="42" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-semibold">Review</text>
      <text x="555" y="55" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Accept / reject</text>
      <text x="555" y="67" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">each suggestion</text>
      <line x1="625" y1="47" x2="645" y2="47" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow6)" />
      <rect x="650" y="20" width="130" height="55" rx="8" fill="#6366f1" opacity="0.15" stroke="#6366f1" strokeWidth="1.5" />
      <text x="715" y="42" textAnchor="middle" className="text-xs fill-indigo-700 dark:fill-indigo-400 font-semibold">Apply</text>
      <text x="715" y="55" textAnchor="middle" className="text-xs fill-indigo-600 dark:fill-indigo-400">Sliders update</text>
      <text x="715" y="67" textAnchor="middle" className="text-xs fill-indigo-600 dark:fill-indigo-400">then Save</text>
      <rect x="90" y="95" width="620" height="30" rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
      <text x="400" y="114" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">Changes are previewed in the dialog. Nothing is saved until you click "Save Changes".</text>
    </svg>
  );
}

/** Help section: Configuration — AI Tune flow and config sections. */
function Part3Configuration() {
  const categoryList = [
    { name: 'Synthesis Band', desc: 'Resonance threshold, similarity ceiling, specificity, partner selection' },
    { name: 'Quality Gates', desc: 'Dedup, hallucination, provenance, redundancy, junk filter, validation' },
    { name: 'Output Shape', desc: 'Voicing word limits, compression, novelty, injection detection' },
    { name: 'Node Evolution', desc: 'Salience/weight dynamics, fitness, GA features, node lifecycle' },
    { name: 'Autonomous Cycles', desc: 'Validation, questions, tensions, research, autorating, lab verification, voicing, population control' },
    { name: 'Verification & Elite', desc: 'Lab framework, freeze/taint, decomposition, elite pool management' },
    { name: 'Knowledge Delivery', desc: 'Proxy budget, context engine, intake defense, KB ingestion' },
    { name: 'Model Parameters', desc: 'Per-subsystem temperature, top_p, min_p, top_k, repeat penalty' },
    { name: 'Word Lists & Patterns', desc: 'Telegraphic word lists, vocabulary, stop words, cleanup, partitions' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Configuration</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit has 400+ tunable parameters organized into 9 behavioral categories with a 3-tier progressive
          disclosure system (Basic / Intermediate / Advanced). An interactive radar chart provides a high-level
          profile view, live diagnostics show the combined effect of your settings, and AI Tune suggests
          optimal parameter changes in natural language.
        </p>
      </div>

      {/* Category Groups */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Category Groups</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Parameters are organized into 9 behavioral categories. Each contains multiple collapsible sections
          with sliders, toggles, word list editors, and pattern editors. Changes take effect immediately.
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
        <h3 className="font-semibold text-blue-700 dark:text-blue-300 text-sm mb-2">Tier System</h3>
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
          Each parameter has its own tier level. The tier selector at the top controls visibility:
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-blue-100 dark:border-blue-800">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Basic (~34 params)</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Essential controls: thresholds, word limits, cycle toggles, voice+chat temperatures.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-blue-100 dark:border-blue-800">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Intermediate</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Decay rates, fitness, dedup, context engine, most subsystem temperatures.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-blue-100 dark:border-blue-800">
            <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Advanced (400+ params)</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">
              Everything: magic numbers, tier overrides, lab verification routing, consultant weights, min_p/top_k.
            </p>
          </div>
        </div>
      </div>

      {/* Radar + Diagnostics */}
      <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-lg p-4">
        <h3 className="font-semibold text-green-700 dark:text-green-300 text-sm mb-2">Radar Chart & Live Diagnostics</h3>
        <p className="text-xs text-green-600 dark:text-green-400 mb-3">
          A 7-axis radar chart shows your system profile at a glance: Selectivity, Reach, Tempo, Turnover,
          Amplification, Verification, and Output Discipline. Click dots to see contributing parameters;
          drag to adjust proportionally (basic-tier params get full effect, advanced are protected).
        </p>
        <p className="text-xs text-green-600 dark:text-green-400">
          Below the radar, 8 diagnostic panels show computed values in real-time: synthesis band width,
          salience/weight half-lives, amplification range, gate strictness heatmap, LLM calls/hour estimate,
          pipeline mode, and context budget breakdown. Soft warnings (10 checks) alert you to pathological
          configurations like narrow synthesis bands or conflicting gate settings.
        </p>
      </div>

      {/* Birth/Cull Architecture */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Birth / Cull Architecture</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          Synthesis uses a two-phase quality model: permissive birth + periodic culling. This separates
          creative mixing (which needs freedom to explore) from quality enforcement (which needs to be strict).
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Birth (Mechanical + Minitruth)</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Mechanical gates run first: resonance threshold, similarity ceiling, structural validation,
              truncation, word count, dedup, junk filter, specificity. Then minitruth
              evaluates the synthesis (accept / rework with feedback / reject) before the node enters the graph.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-purple-100 dark:border-purple-800">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Cull (Single LLM Evaluation)</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              The Population Control cycle evaluates nodes after a grace period using a single comprehensive
              LLM call that scores coherence, grounding, novelty, specificity, and incremental value.
              Nodes that fail are demoted or archived.
            </p>
          </div>
        </div>
        <p className="text-xs text-purple-500 dark:text-purple-400 mt-2">
          See{' '}
          <span className="docs-link-internal text-purple-600 dark:text-purple-300 underline cursor-pointer" data-doc="verification-quality">
            Verification & Quality
          </span>{' '}
          for full gate details.
        </p>
      </div>

      {/* Population Control */}
      <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-lg p-4">
        <h3 className="font-semibold text-rose-700 dark:text-rose-300 text-sm mb-2">Population Control Cycle</h3>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-3">
          An autonomous cycle that runs in the background, evaluating recently-synthesized nodes using a
          single comprehensive LLM call that scores coherence, grounding, novelty, specificity, and value.
        </p>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-rose-100 dark:border-rose-800">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">Grace Period</p>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Nodes get a configurable grace period (default 2 hours) after creation before facing evaluation.
              This lets new nodes participate in synthesis before being judged.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-rose-100 dark:border-rose-800">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">Single LLM Evaluation</p>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              One comprehensive LLM call per node scores 6 dimensions (coherence, grounding, novelty, specificity,
              forced analogy, incremental value). The weighted composite determines the outcome.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-rose-100 dark:border-rose-800">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">Outcomes</p>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              <strong>Boost</strong> (score &ge; threshold): weight increased. <strong>Demote</strong> (between thresholds):
              weight halved. <strong>Archive</strong> (below archive threshold): removed from active graph.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-rose-100 dark:border-rose-800">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">Key Parameters</p>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              Pass threshold (default 4.0), archive threshold (default 2.0), grace period (2h), batch size (5),
              cycle interval (120s), boost weight (1.1x), demote weight (0.5x).
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-rose-100 dark:border-rose-800">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300 mb-1">Presets</p>
            <p className="text-xs text-rose-600 dark:text-rose-400">
              <strong>Strict Culling</strong> — threshold 6, archive 3, harsh demotion. <strong>Permissive</strong> —
              threshold 3, archive 1, gentle demotion. <strong>Default</strong> — balanced settings.
            </p>
          </div>
        </div>
      </div>

      {/* AI Tune */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">AI Tune</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">
          Describe what you want in plain language — "make synthesis more selective", "reduce junk output",
          "optimize for speed" — and an LLM analyzes your current parameters and suggests changes.
        </p>
        <AiTuneFlowDiagram />
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-sky-100 dark:border-sky-800">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Presets</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              Common configurations available as one-click presets. Each section can have its own presets
              tailored to specific tuning goals.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-sky-100 dark:border-sky-800">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Safe & Reversible</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              Changes are previewed before applying. A snapshot is auto-created before each AI Tune operation.
              Full audit log tracks every change with timestamps, old/new values, and reasons.
            </p>
          </div>
        </div>
      </div>

      {/* Snapshots & History */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Snapshots & Change History</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-amber-100 dark:border-amber-800">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Snapshots</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Save named snapshots of all parameters. Restore any snapshot to revert to a known-good state.
              Auto-snapshots before AI Tune operations.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-amber-100 dark:border-amber-800">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-1">Audit Log</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Every parameter change recorded with: timestamp, old value, new value, reason, contributor.
              Filter by section or parameter path.
            </p>
          </div>
        </div>
      </div>

      {/* System Health */}
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">System Health & Overfitting Detection</h3>
        <p className="text-xs text-red-600 dark:text-red-400">
          The quality dashboard monitors for tuning problems:
        </p>
        <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside space-y-1 mt-2">
          <li><strong>Oscillation</strong> — parameters flip-flopping between values across tune cycles</li>
          <li><strong>Plateau</strong> — tuning no longer improving quality metrics</li>
          <li><strong>Collapse</strong> — all output being rejected, indicating gates are too strict</li>
        </ul>
      </div>

      {/* Models & Subsystems */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">Models & Subsystems</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3">
          The Models page manages LLM registration, subsystem assignment, and provider health. Each subsystem
          can use a different model with independent inference parameters (temperature, top_p, min_p, top_k, repeat_penalty).
        </p>

        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800 mb-3">
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">Model Registry</p>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">Identity</p>
              <p className="text-indigo-500 dark:text-indigo-400">Display name, model ID, provider</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">Connection</p>
              <p className="text-indigo-500 dark:text-indigo-400">Endpoint URL, API key, concurrency</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">Limits</p>
              <p className="text-indigo-500 dark:text-indigo-400">Max tokens, context size, cost/1K</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">Subsystem Assignments by Tier</p>
          <div className="grid grid-cols-4 gap-2 text-xs">
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">Frontier</p>
              <p className="text-indigo-500 dark:text-indigo-400">voice, chat, research, docs, tuning_judge, breakthrough_check</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">Medium</p>
              <p className="text-indigo-500 dark:text-indigo-400">synthesis, compress, config_tune, autorating, spec_extraction, spec_review, evm_analysis, elite_mapping, reader_*</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">Small</p>
              <p className="text-indigo-500 dark:text-indigo-400">context, keyword, dedup_judge, proxy</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">Dedicated</p>
              <p className="text-indigo-500 dark:text-indigo-400">embedding</p>
            </div>
          </div>
        </div>
      </div>

      {/* Auto-Tune & Gold Standards */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Auto-Tune & Gold Standards</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          Automated parameter optimization using reference outputs and grid search.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Gold Standard System</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Three tiers of reference outputs: <strong>ideal</strong> (100% weight), <strong>good</strong> (85%),
              <strong> acceptable</strong> (65%). Scoring: max(similarity x tierWeight) across all tiers.
              Register gold standards for any of the 29 tunable prompts.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Parameter Grid Search</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              405 parameter combinations via Latin Hypercube Sampling. Three strategies: <strong>Full</strong> (broad),
              <strong> Refined</strong> (narrow around best), <strong>Inherited</strong> (start from last best).
              Concurrent execution with worker pool.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">29 Tunable Prompts</p>
          <div className="grid grid-cols-4 gap-2 text-xs mt-2">
            {['system', 'core', 'context', 'knowledge', 'docs', 'chat', 'project', 'kb'].map(cat => (
              <div key={cat} className="bg-gray-50 dark:bg-gray-800 rounded p-1.5">
                <p className="font-medium text-emerald-700 dark:text-emerald-300">{cat}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Prompts */}
      <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-lg p-4">
        <h3 className="font-semibold text-rose-700 dark:text-rose-300 text-sm mb-2">Prompt Customization</h3>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          View and customize every system prompt on the Prompts page. Prompts have sensible defaults in code.
          Database overrides persist across restarts. Variables like <code className="text-rose-700 dark:text-rose-300">{'{{content}}'}</code> and{' '}
          <code className="text-rose-700 dark:text-rose-300">{'{{domain}}'}</code> are interpolated at runtime.
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {[
            ['system', 'Global system prompts'],
            ['core', 'Synthesis voicing & insight generation'],
            ['context', 'Context engine formatting'],
            ['knowledge', 'Summarize, compress, domain digests'],
            ['docs', 'Document outline & generation'],
            ['chat', 'Chat interface & auto-tune test'],
            ['project', 'Interview-based project creation'],
            ['kb', 'KB curation & decomposition prompts'],
            ['evm', 'Lab verification spec extraction, falsifiability review & evaluation'],
          ].map(([cat, desc]) => (
            <div key={cat} className="bg-white dark:bg-gray-900 rounded p-2 border border-rose-100 dark:border-rose-700">
              <p className="font-medium text-rose-700 dark:text-rose-300">{cat}</p>
              <p className="text-rose-500 dark:text-rose-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Cost Analytics */}
      <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
        <h3 className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-2">Cost Analytics</h3>
        <p className="text-xs text-teal-600 dark:text-teal-400 mb-2">
          Track API spending across all subsystems. The Costs page provides:
        </p>
        <ul className="text-xs text-teal-600 dark:text-teal-400 list-disc list-inside space-y-1">
          <li><strong>Summary cards</strong> — total cost, calls, tokens, avg cost per call</li>
          <li><strong>Time controls</strong> — filter by time range and subsystem</li>
          <li><strong>Cost chart</strong> — spend over time visualization</li>
          <li><strong>Breakdown tables</strong> — per-subsystem and per-model cost breakdown</li>
          <li><strong>Call log</strong> — individual LLM call details with input/output tokens</li>
          <li><strong>CSV export</strong> — download cost data for external analysis</li>
        </ul>
      </div>

      {/* Knowledge Proxy Config */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Knowledge Proxy Settings</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
          The proxy has its own configuration section for fine-tuning knowledge injection behavior.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-orange-100 dark:border-orange-800">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Knowledge Budget</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              <strong>knowledgeReserve</strong> (default 15%) — maximum context budget allocated to knowledge.{' '}
              <strong>knowledgeMinReserve</strong> (default 5%) — minimum floor. Dynamic allocation between these bounds.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-orange-100 dark:border-orange-800">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Supported Parameters</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              model, messages, temperature, max_tokens, top_p, stream, stop, presence_penalty,
              frequency_penalty, logit_bias, user, n, tools, tool_choice, response_format
            </p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-orange-100 dark:border-orange-800">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Session Management</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              4-tier priority: explicit header, user field, conversation_id, auto-generated.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-orange-100 dark:border-orange-800">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Model Resolution</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              5-tier: exact match, alias, proxy subsystem, default model, first available.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-3 border border-orange-100 dark:border-orange-800">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Compression</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Rule-based telegraphic compression with optional entropy-aware mode using NLP analysis.
            </p>
          </div>
        </div>
      </div>

      {/* Context Engine — config parameters */}
      <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Context Engine Settings</h3>
        <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-3">
          14 tunable parameters control session lifecycle, token budgets, cross-session learning, and model profile defaults.
          How the context engine works — the prepare/update loop, intent detection, scoring signals, and quality metrics — is covered in{' '}
          <button className="docs-link-internal underline cursor-pointer" data-doc="chat-questions">Chat &amp; Knowledge Proxy</button>.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Session TTL', 'How long inactive sessions persist in memory before being flushed to DB'],
            ['Max Nodes', 'Maximum knowledge nodes to inject per turn (overrideable per request)'],
            ['Model Profile', 'Default profile for context budget scaling (micro / small / medium / large / xl)'],
            ['Knowledge Budget', 'Fraction of context window reserved for knowledge (min + max bounds)'],
            ['Cross-Session Decay', 'EMA decay rate when merging past session insights into new sessions'],
            ['Cluster Threshold', 'Minimum similarity for grouping topics into concept clusters'],
          ].map(([name, desc]) => (
            <div key={name} className="bg-white dark:bg-gray-900 rounded p-2 border border-emerald-100 dark:border-emerald-800">
              <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{name}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* MCP Config Tools */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">MCP Config Tools</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          All configuration operations available via{' '}
          <span className="docs-link-internal text-gray-700 dark:text-gray-300 underline cursor-pointer" data-doc="slash-commands">
            podbit.config
          </span>:
        </p>
        <div className="grid grid-cols-4 gap-2 text-xs">
          {[
            ['get', 'Read current config'],
            ['sections', 'List all tunable sections'],
            ['metrics', 'Quality dashboard'],
            ['tune', 'AI suggestions'],
            ['apply', 'Apply changes'],
            ['history', 'Audit log'],
            ['snapshot', 'Save/restore'],
          ].map(([action, desc]) => (
            <div key={action} className="bg-white dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
              <code className="text-xs font-mono text-gray-700 dark:text-gray-300">{action}</code>
              <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export { AiTuneFlowDiagram };
export default Part3Configuration;
