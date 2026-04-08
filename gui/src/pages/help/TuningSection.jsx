import { Link } from 'react-router-dom';
import { Zap, Award, Layers, RefreshCw, BarChart3, GitBranch, Cpu } from 'lucide-react';

function TuningFlowDiagram() {
  return (
    <svg viewBox="0 0 940 160" className="w-full mx-auto" role="img" aria-label="Auto-tune flow">
      <defs>
        <marker id="tuneArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Step 1: Edit Prompt */}
      <rect x="10" y="15" width="130" height="55" rx="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="75" y="37" textAnchor="middle" className="text-xs fill-amber-700 dark:fill-amber-400 font-semibold">Edit Prompt</text>
      <text x="75" y="50" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">Prompts page</text>
      <text x="75" y="62" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">saves override</text>

      <line x1="145" y1="42" x2="162" y2="42" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#tuneArrow)" />

      {/* Step 2: Judge Generates */}
      <rect x="167" y="15" width="130" height="55" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="232" y="33" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-semibold">Judge Model</text>
      <text x="232" y="46" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Generates 3-tier</text>
      <text x="232" y="58" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">gold standards</text>

      <line x1="302" y1="42" x2="319" y2="42" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#tuneArrow)" />

      {/* Step 3: Auto-Tune */}
      <rect x="324" y="15" width="130" height="55" rx="8" fill="#6366f1" opacity="0.15" stroke="#6366f1" strokeWidth="1.5" />
      <text x="389" y="33" textAnchor="middle" className="text-xs fill-indigo-700 dark:fill-indigo-400 font-semibold">Auto-Tune</text>
      <text x="389" y="46" textAnchor="middle" className="text-xs fill-indigo-600 dark:fill-indigo-400">Tests param combos</text>
      <text x="389" y="58" textAnchor="middle" className="text-xs fill-indigo-600 dark:fill-indigo-400">concurrently</text>

      <line x1="459" y1="42" x2="476" y2="42" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#tuneArrow)" />

      {/* Step 4: Score */}
      <rect x="481" y="15" width="130" height="55" rx="8" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1.5" />
      <text x="546" y="33" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-semibold">Score vs Gold</text>
      <text x="546" y="46" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Embedding cosine</text>
      <text x="546" y="58" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">similarity</text>

      <line x1="616" y1="42" x2="633" y2="42" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#tuneArrow)" />

      {/* Step 5: Select Best */}
      <rect x="638" y="15" width="130" height="55" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="703" y="33" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Select Best</text>
      <text x="703" y="46" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Variance-weighted</text>
      <text x="703" y="58" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">convergence</text>

      <line x1="773" y1="42" x2="790" y2="42" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#tuneArrow)" />

      {/* Step 6: Apply */}
      <rect x="795" y="15" width="130" height="55" rx="8" fill="#ef4444" opacity="0.15" stroke="#ef4444" strokeWidth="1.5" />
      <text x="860" y="33" textAnchor="middle" className="text-xs fill-red-700 dark:fill-red-400 font-semibold">Apply</text>
      <text x="860" y="46" textAnchor="middle" className="text-xs fill-red-600 dark:fill-red-400">Review &</text>
      <text x="860" y="58" textAnchor="middle" className="text-xs fill-red-600 dark:fill-red-400">accept changes</text>

      {/* Bottom: Heuristic fallback */}
      <rect x="300" y="95" width="340" height="40" rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
      <text x="470" y="113" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">No gold standards? Falls back to heuristic scoring</text>
      <text x="470" y="126" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">(JSON validity, word counts, term retention, stutter detection)</text>

      <line x1="389" y1="75" x2="389" y2="90" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#tuneArrow)" />
    </svg>
  );
}

/** Help section: self-tuning, Know Thyself, and parameter reflection. */
function TuningSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Auto-Tune & Gold Standard System</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The tuning system automatically finds optimal inference parameters (temperature, top_p, min_p, top_k, repeat_penalty)
          for each subsystem's assigned model. When you customize prompts, a <strong>tuning judge</strong> model generates
          reference responses that become the scoring benchmark during auto-tune  - replacing brittle heuristics with
          semantic comparison against known-good outputs.
        </p>
      </div>

      {/* Flow Diagram */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <TuningFlowDiagram />
      </div>

      {/* Gold Standard Reference System */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-3 flex items-center gap-2">
          <Award size={16} />
          Gold Standard Reference System
        </h3>
        <p className="text-xs text-emerald-700 dark:text-emerald-300 mb-3">
          Gold standards are generated automatically when you save a prompt override on the <Link to="/help/prompts" className="underline decoration-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-100">Prompts page</Link> (if
          a <strong>tuning_judge</strong> model is assigned). You can also manually generate or regenerate them via the
          <strong> Gold Standards</strong> panel and its <strong>Generate</strong> button on each tunable prompt.
          The judge produces 3 tiered reference responses that define "what a good answer looks like" for that prompt.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-700 rounded p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Tier 1: Ideal</p>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              The best possible response  - precise, complete, perfectly structured. Matching this scores <strong>100%</strong>.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-700 rounded p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Tier 2: Good</p>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Correct but less detailed  - covers key points, may miss nuances. Matching this scores <strong>85%</strong>.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-700 rounded p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Tier 3: Acceptable</p>
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Minimally acceptable  - correct core facts only, brief. Matching this scores <strong>65%</strong>.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border border-emerald-100 dark:border-emerald-700 rounded p-3">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">How Scoring Works</p>
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            During auto-tune, each model output is embedded and compared to all 3 tier embeddings via <strong>cosine similarity</strong>.
            The final score is the best match across tiers:{' '}
            <code className="bg-emerald-100 dark:bg-emerald-900/30 px-1 rounded text-emerald-700 dark:text-emerald-300">
              max(sim(output, tier1) × 1.0, sim(output, tier2) × 0.85, sim(output, tier3) × 0.65)
            </code>.
            This means an output can score well by being thorough (matching tier 1) or by being concise but correct (matching tier 3).
          </p>
        </div>
      </div>

      {/* Prompt Coverage */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-3 flex items-center gap-2">
          <Layers size={16} />
          29 Tunable Prompts Across All Subsystems
        </h3>
        <p className="text-xs text-purple-700 dark:text-purple-300 mb-3">
          Gold standards can be generated for prompts across every subsystem category.
          Each prompt maps to test variables that fill its template placeholders, producing the same composed prompt
          for both gold standard generation and auto-tune testing.
        </p>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Voice / Synthesis', 'insight_synthesis, multi_insight, breakthrough_validation, question_generation, question_answer', 5],
            ['Compress / Context', 'compress, compress_task, summarize, summarize_task, history_compression', 5],
            ['Chat / Research', 'default_response, research_seeds, summarize, compress, voice_connection, research_cycle', 6],
            ['Create Docs', 'outline_decomposition, section_generation, section_escalation', 3],
            ['Keyword', 'node_keywords, domain_synonyms', 2],
            ['KB Readers', 'curate_code, curate_data, decompose_claims, filter_claims', 4],
            ['Verification', 'spec_extraction, spec_review, evm_analysis', 3],
            ['Autorating / Validation', 'autorating_score, novelty_gate', 2],
          ].map(([group, prompts, count]) => (
            <div key={group} className="bg-white dark:bg-gray-900 border border-purple-100 dark:border-purple-700 rounded p-2.5">
              <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">{group} <span className="text-purple-400 font-normal">({count})</span></p>
              <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">{prompts}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-purple-600 dark:text-purple-400 mt-2">
          When auto-tune runs, it tests against <strong>all</strong> gold standard prompts in the subsystem's category,
          not just one. This ensures parameters work well across the full range of tasks the subsystem handles.
        </p>
      </div>

      {/* Grid Search Strategy */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-3 flex items-center gap-2">
          <BarChart3 size={16} />
          Parameter Grid Search
        </h3>
        <p className="text-xs text-indigo-700 dark:text-indigo-300 mb-3">
          The search space covers 5 parameters with a total of 405 possible combinations.
          Latin Hypercube Sampling selects a representative subset (configurable, default 25 combos)
          that ensures coverage across all parameter dimensions.
        </p>
        <div className="grid grid-cols-5 gap-2 text-xs mb-3">
          {[
            ['Temperature', '0.1 – 1.5', '5 levels'],
            ['Top P', '0.5 – 1.0', '3 levels'],
            ['Min P', '0.0 – 0.2', '3 levels'],
            ['Top K', '0 – 100', '3 levels'],
            ['Repeat Penalty', '1.0 – 1.5', '3 levels'],
          ].map(([name, range, levels]) => (
            <div key={name} className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700 rounded p-2">
              <p className="font-medium text-indigo-700 dark:text-indigo-300">{name}</p>
              <p className="text-indigo-500 dark:text-indigo-400">{range}</p>
              <p className="text-xs text-indigo-400 dark:text-indigo-500">{levels}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700 rounded p-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
              <span className="bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 px-1.5 rounded text-xs mr-1">Full</span>
              First in Model Group
            </p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              Latin Hypercube Sampling from the 405-combo grid. The first subsystem assigned to each model
              gets a full parameter search  - this is the most thorough and slowest phase.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700 rounded p-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
              <span className="bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-400 px-1.5 rounded text-xs mr-1">Refined</span>
              Subsequent Subsystems
            </p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              Generates a narrow grid around the best result from the full search. Much faster  - typically
              finds better results for the specific subsystem while staying close to what works for the model.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-indigo-100 dark:border-indigo-700 rounded p-3">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-1">
              <span className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 rounded text-xs mr-1">Inherited</span>
              Reader Consolidation
            </p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              Text readers (text, PDF, doc) process extracted text identically  - only one is tuned,
              results are inherited by the others. Sheet, code, and image readers are tuned independently.
            </p>
          </div>
        </div>
      </div>

      {/* Concurrent Execution */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-3 flex items-center gap-2">
          <Cpu size={16} />
          Concurrent Execution
        </h3>
        <p className="text-xs text-sky-700 dark:text-sky-300 mb-3">
          Auto-tune dispatches LLM calls through a <strong>concurrent worker pool</strong> that respects each model's
          <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded mx-1">maxConcurrency</code> setting from the model registry.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-sky-100 dark:border-sky-700 rounded p-3">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Worker Pool</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              All combo/run pairs are pre-built into a flat task list. N workers (where N = model's maxConcurrency)
              pull tasks from the shared queue simultaneously. A model with concurrency 5 has 5 LLM calls in flight at once.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-sky-100 dark:border-sky-700 rounded p-3">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Double Safety</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              The per-model semaphore in <code className="text-sky-700 dark:text-sky-300">callSubsystemModel</code> provides
              a second concurrency gate. This means the system never exceeds the model's configured limit,
              even if multiple subsystems tune simultaneously.
            </p>
          </div>
        </div>
      </div>

      {/* Aggregated Scoring */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-3 flex items-center gap-2">
          <RefreshCw size={16} />
          Aggregated Multi-Prompt Scoring
        </h3>
        <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
          Each parameter combo is tested against <strong>every gold standard prompt</strong> in the subsystem's category
          using round-robin rotation. This prevents parameter overfitting to a single task.
        </p>
        <div className="bg-white dark:bg-gray-900 border border-amber-100 dark:border-amber-700 rounded p-3 mb-3">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            <strong>Example:</strong> The "voice" category has 5 mapped prompts (insight_synthesis, multi_insight_synthesis,
            breakthrough_validation, question_generation, question_answer). If 3 of those have gold standards in the DB,
            each combo runs at least 3 tests (one per prompt). If <code className="text-amber-700 dark:text-amber-300">runsPerCombo</code> is
            higher (e.g. 5), the extra 2 runs rotate back through the prompts for variance sampling.
            The final combo score is the average across all runs.
          </p>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          <strong>Fallback:</strong> When no gold standards exist for a category (no prompts have been customized,
          or no tuning_judge model is assigned), auto-tune falls back to heuristic scorers  - JSON validity, word counts,
          term retention, stutter detection, compression ratios, etc.
        </p>
      </div>

      {/* Convergence & Selection */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-3 flex items-center gap-2">
          <GitBranch size={16} />
          Variance-Weighted Convergence
        </h3>
        <p className="text-xs text-orange-700 dark:text-orange-300 mb-3">
          When the top 3 parameter combos score within 5% of each other (flat optimum), the system uses <strong>variance-weighted
          selection</strong> rather than defaulting to conservative parameters.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-orange-700 rounded p-3">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">How It Works</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              For each top combo, the standard deviation across its runs is computed. The combo with the
              <strong> lowest variance</strong> (most consistent) is selected. If variance is tied (within 1%),
              the higher-scoring combo wins.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border border-orange-100 dark:border-orange-700 rounded p-3">
            <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Why Not Conservative?</p>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Exotic parameter combos that consistently produce good results deserve to win. A combo scoring
              0.82 ± 0.01 is better than one scoring 0.83 ± 0.10, because the high-variance combo might just
              have gotten lucky on one run. Consistency signals genuine quality.
            </p>
          </div>
        </div>
      </div>

      {/* Setup Requirements */}
      <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-300 text-sm mb-3 flex items-center gap-2">
          <Zap size={16} />
          Setup & Requirements
        </h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-start gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3">
            <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold text-xs px-2 py-0.5 rounded shrink-0 mt-0.5">1</span>
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Assign a tuning_judge model</p>
              <p className="text-gray-500 dark:text-gray-400">
                Go to <Link to="/models" className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100">Models</Link> and
                assign a capable model to the <strong>tuning_judge</strong> subsystem. This model generates gold standard
                reference responses. Use your best available model  - gold standard quality directly determines scoring accuracy.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3">
            <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold text-xs px-2 py-0.5 rounded shrink-0 mt-0.5">2</span>
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Customize prompts (optional)</p>
              <p className="text-gray-500 dark:text-gray-400">
                Edit any tunable prompt on the <Link to="/prompts" className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100">Prompts page</Link>.
                Gold standards are generated automatically on save when a tuning_judge model is assigned. You can also
                manually trigger generation via the <strong>Gold Standards</strong> panel on each prompt. Auto-tune works
                without gold standards (heuristic fallback) but scoring is more accurate with them.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-3">
            <span className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-bold text-xs px-2 py-0.5 rounded shrink-0 mt-0.5">3</span>
            <div>
              <p className="font-medium text-gray-700 dark:text-gray-300">Run Auto-Tune</p>
              <p className="text-gray-500 dark:text-gray-400">
                Click the <strong>Auto-Tune</strong> button on the <Link to="/models" className="underline decoration-gray-400 hover:text-gray-900 dark:hover:text-gray-100">Models page</Link>.
                Select subsystems, configure runs per combo and max combos, then start.
                Results appear live  - you can apply improvements incrementally while other subsystems are still tuning.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Tips</h3>
        <ul className="text-xs text-amber-700 dark:text-amber-300 space-y-1.5">
          <li><strong>Set model concurrency</strong>  - if your model endpoint handles parallel requests, set maxConcurrency &gt; 1 in the model registry for dramatically faster auto-tune runs.</li>
          <li><strong>Use your best model as judge</strong>  - gold standard quality is the ceiling for scoring accuracy. A weak judge produces weak references.</li>
          <li><strong>More runs = more reliable</strong>  - increasing runs per combo (3-5) produces more stable scores, especially important for high-variance models.</li>
          <li><strong>Generate gold standards first</strong>  - run auto-tune after gold standards exist for your customized prompts. Without them, only heuristic scoring is used.</li>
          <li><strong>Watch the Dashboard</strong>  - after applying tuned parameters, observe the synthesis engine and other subsystems to verify real-world improvement.</li>
        </ul>
      </div>
    </div>
  );
}

export default TuningSection;
