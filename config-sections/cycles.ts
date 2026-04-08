/**
 * @module config-sections/cycles
 *
 * Config section metadata for all autonomous cycles: timing intervals,
 * enable/disable toggles, and per-cycle parameters. Each cycle runs
 * independently on its own timer and can be hot-reloaded without restart.
 *
 * Sections: cycle_timing, cycle_validation, cycle_questions,
 * cycle_tensions, cycle_research, cycle_autorating, cycle_evm, cycle_voicing
 */

import type { SectionMeta, SectionTier } from './types.js';

/** Autonomous cycle config section definitions. */
export const CYCLE_SECTIONS: Record<string, SectionMeta> = {

    // -------------------------------------------------------------------------
    // 4b. Autonomous Cycle Timing (6 params — one interval per cycle type)
    // -------------------------------------------------------------------------
    cycle_timing: {
        id: 'cycle_timing',
        tier: 'basic',
        title: 'Autonomous Cycle Timing',
        description: 'Interval controls for all autonomous cycles — how fast each cycle runs',
        behavior: 'Each autonomous cycle runs independently on its own timer. Intervals control how long to sleep between ticks. Lower = faster throughput but more LLM calls. Changes hot-reload — take effect on the next tick without restarting. The enable/disable toggles start or stop each cycle entirely.',
        parameters: [
            { key: 'validationInterval', label: 'Validation Interval (ms)', description: 'Milliseconds between breakthrough scanner ticks. Slide right → slower scanning, fewer LLM calls. Slide left → faster scanning, more responsive but higher cost. Safe range: 30000–120000.', min: 5000, max: 300000, step: 5000, default: 60000, configPath: ['autonomousCycles', 'validation', 'intervalMs'], tier: 'intermediate' },
            { key: 'questionsInterval', label: 'Questions Interval (ms)', description: 'Milliseconds between question-answering ticks. Slide right → slower answering, fewer LLM calls. Slide left → faster answering, clears backlog quicker. Safe range: 15000–60000.', min: 5000, max: 120000, step: 5000, default: 30000, configPath: ['autonomousCycles', 'questions', 'intervalMs'], tier: 'intermediate' },
            { key: 'tensionsInterval', label: 'Tensions Interval (ms)', description: 'Milliseconds between tension exploration ticks. Slide right → slower exploration, fewer LLM calls. Slide left → faster tension discovery. Safe range: 30000–120000.', min: 10000, max: 300000, step: 5000, default: 45000, configPath: ['autonomousCycles', 'tensions', 'intervalMs'], tier: 'intermediate' },
            { key: 'researchInterval', label: 'Research Interval (ms)', description: 'Milliseconds between research seeding ticks. Slide right → slower research, fewer LLM calls. Slide left → faster domain growth. Safe range: 15000–60000.', min: 5000, max: 300000, step: 5000, default: 30000, configPath: ['autonomousCycles', 'research', 'intervalMs'], tier: 'intermediate' },
            { key: 'autoratingInterval', label: 'Autorating Interval (ms)', description: 'Milliseconds to sleep when no unrated nodes remain (idle state). While a backlog exists, all unrated nodes fire in parallel back-to-back with only a 1s pause. Slide right → checks less often when idle. Slide left → polls for new nodes more frequently. Safe range: 30000–120000.', min: 5000, max: 300000, step: 5000, default: 45000, configPath: ['autonomousCycles', 'autorating', 'intervalMs'], tier: 'intermediate' },
            { key: 'evmInterval', label: 'Verification Interval (ms)', description: 'Milliseconds between lab verification ticks. Slide right → slower verification. Slide left → faster throughput. Safe range: 30000–120000.', min: 10000, max: 600000, step: 10000, default: 60000, configPath: ['autonomousCycles', 'evm', 'intervalMs'], tier: 'intermediate' },
            { key: 'voicingInterval', label: 'Voicing Interval (ms)', description: 'Milliseconds between autonomous voicing ticks. Slide right → slower voicing, fewer LLM calls. Slide left → faster insight generation. Safe range: 15000–60000.', min: 10000, max: 300000, step: 5000, default: 30000, configPath: ['autonomousCycles', 'voicing', 'intervalMs'], tier: 'intermediate' },
        ],
        presets: [
            { label: 'Fast Discovery', intent: 'Set all cycle intervals to their minimum for maximum throughput' },
            { label: 'Balanced', intent: 'Reset all cycle intervals to their defaults for balanced performance and cost' },
            { label: 'Slow / Cheap', intent: 'Set all cycle intervals to 5 minutes (300000ms) to minimize LLM calls and cost' },
        ],
    },

    // -------------------------------------------------------------------------
    // Breakthrough Scanner
    // -------------------------------------------------------------------------
    cycle_validation: {
        id: 'cycle_validation',
        title: 'Breakthrough Scanner',
        tier: 'intermediate',
        description: 'Autonomous cycle that identifies and validates potential breakthrough candidates',
        behavior: `The breakthrough scanner automatically evaluates high-weight synthesis/voiced nodes for breakthrough potential. It uses a 3-gate pipeline: Gate 1 scores nodes on 4 dimensions (synthesis, novelty, testability, tension resolution) — candidates must pass the composite threshold. Gate 2 (Novelty Gate) uses a frontier model to skeptically check whether the insight is genuinely novel or just well-known material. Gate 3 (Lab Gate) runs code-based hallucination verification to detect fabricated claims. Only candidates that pass all active gates are marked as "possible" breakthroughs. Both gates are fail-open: if subsystems are unassigned, models error, or verification can't test the claims, the gate is skipped. intervalMs controls how often the cycle runs. minWeightThreshold filters which nodes are evaluated. minCompositeForPromotion sets the Gate 1 threshold.`,
        parameters: [
            {
                key: 'validationEnabled',
                label: 'Enabled',
                description: 'Enable the autonomous breakthrough validation cycle.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['autonomousCycles', 'validation', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'validationMinWeight',
                label: 'Min Weight Threshold',
                description: 'Only evaluate nodes with weight above this threshold. At 0.9 (default), only nodes that have gained weight through successful synthesis (above the 1.0 default weight minus some decay) are considered — this filters out new untested nodes and declining ones. At 0.7, nodes at default weight qualify too, casting a wider net but costing more LLM calls. At 1.5, only high-performing nodes that have accumulated significant parent boosts are evaluated — very selective.',
                min: 0.3, max: 2.0, step: 0.1, default: 0.9,
                configPath: ['autonomousCycles', 'validation', 'minWeightThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'validationMinComposite',
                label: 'Min Composite for Promotion',
                description: 'Minimum composite score (0-10) from 4-dimension scoring (synthesis quality, novelty, testability, tension resolution) to flag as a "possible" breakthrough. At 7 (default), candidates need to score well across most dimensions — typically ~5-10% of evaluated nodes pass. At 6, ~15-25% pass — more candidates for the novelty gate to filter. At 8, only exceptional nodes are flagged — may miss breakthroughs that score unevenly across dimensions.',
                min: 4, max: 9, step: 1, default: 7,
                configPath: ['autonomousCycles', 'validation', 'minCompositeForPromotion'],
                tier: 'intermediate',
            },
            {
                key: 'noveltyGateEnabled',
                label: 'Novelty Gate',
                description: 'Enable the frontier-model novelty gate. When enabled, candidates that pass composite scoring are checked by the breakthrough_check subsystem (a skeptical frontier model) to verify the insight is genuinely novel and not just well-known textbook material. Requires a model assigned to the "Breakthrough Check" subsystem. Fail-open: if no model is assigned, the gate is skipped.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['validation', 'noveltyGateEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'evmGateEnabled',
                label: 'Lab Hallucination Gate',
                description: 'Enable the lab hallucination gate. When enabled, candidates that pass the novelty gate are checked via code-based verification to detect fabricated claims. Only blocks promotion if verification explicitly refutes the claims (verified=false). Requires lab verification to be globally enabled and evm_codegen subsystem assigned. Fail-open: skipped errors, code failures, and untestable claims all pass through.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['validation', 'evmGateEnabled'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Turn on breakthrough scanner with default settings' },
            { label: 'Selective', intent: 'Increase thresholds to only flag the most promising candidates' },
            { label: 'Gates Off', intent: 'Disable both novelty gate and lab gate, relying only on composite scoring' },
            { label: 'Default', intent: 'Reset breakthrough scanner parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // Question Answerer
    // -------------------------------------------------------------------------
    cycle_questions: {
        id: 'cycle_questions',
        title: 'Question Answerer',
        tier: 'intermediate',
        description: 'Autonomous cycle that voices answers to question-type nodes',
        behavior: `The question answerer automatically finds unanswered question nodes and generates voiced answers using the voicing pipeline. It pairs each question with a relevant partner node for context, then synthesizes an answer. intervalMs controls cycle frequency. batchSize sets how many questions to answer per cycle.`,
        parameters: [
            {
                key: 'questionsEnabled',
                label: 'Enabled',
                description: 'Enable the autonomous question-answering cycle.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['autonomousCycles', 'questions', 'enabled'],
                tier: 'basic',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Turn on question answerer with default settings' },
            { label: 'Default', intent: 'Reset question answerer parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // Tension Explorer
    // -------------------------------------------------------------------------
    cycle_tensions: {
        id: 'cycle_tensions',
        title: 'Tension Explorer',
        tier: 'intermediate',
        description: 'Autonomous cycle that detects tensions and generates research questions',
        behavior: `The tension explorer automatically scans for contradicting node pairs and generates research questions from them. It finds nodes with high embedding similarity but opposing claims, then uses an LLM to formulate questions that could resolve the contradiction. intervalMs controls cycle frequency. maxQuestionsPerCycle limits how many new research questions are created per cycle. maxPendingQuestions caps how many unanswered questions can exist — when the backlog reaches this limit, the tension cycle pauses question creation until the Question Answerer catches up. Questions that repeatedly fail to be answered get their weight reduced so they sink in priority.`,
        parameters: [
            {
                key: 'tensionsEnabled',
                label: 'Enabled',
                description: 'Enable the autonomous tension exploration cycle.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['autonomousCycles', 'tensions', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'tensionsMaxQuestionsPerCycle',
                label: 'Max Questions / Cycle',
                description: 'Maximum new research questions created per tension cycle. At 2 (default), each cycle can produce up to 2 questions from the most promising tension pairs found. At 1, one question per cycle — deliberate, focused exploration. At 5, rapid question generation that may overwhelm the Question Answerer if it can\'t keep up (see maxPendingQuestions).',
                min: 1, max: 10, step: 1, default: 2,
                configPath: ['autonomousCycles', 'tensions', 'maxQuestionsPerCycle'],
                tier: 'intermediate',
            },
            {
                key: 'tensionsMaxPendingQuestions',
                label: 'Max Pending Questions',
                description: 'Maximum unanswered questions before the tension cycle pauses question creation. At 10 (default), up to 10 unanswered questions can accumulate before the tension cycle stops creating new ones — this backpressure prevents question overflow when the Question Answerer is slower than the Tension Explorer. At 5, tighter cap — fewer unanswered questions pile up. At 20, allows a larger backlog, useful when you want to batch-generate many questions for later answering.',
                min: 1, max: 50, step: 1, default: 10,
                configPath: ['autonomousCycles', 'tensions', 'maxPendingQuestions'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Turn on tension explorer with default settings' },
            { label: 'Default', intent: 'Reset tension explorer parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // Domain Researcher (5 params)
    // -------------------------------------------------------------------------
    cycle_research: {
        id: 'cycle_research',
        title: 'Domain Researcher',
        tier: 'intermediate',
        description: 'Autonomous cycle that researches underserved domains and seeds new knowledge',
        behavior: `The domain researcher targets domains with the fewest nodes (between min and max thresholds) and uses an LLM to generate new seed knowledge. It builds context from existing nodes and open questions, then proposes new seeds through the standard quality gates (dedup, injection, intake defense). Lower interval = more frequent research cycles, but each cycle makes 1 LLM call + up to maxSeedsPerCycle embedding calls. The min/max domain node thresholds control which domains are eligible for research — domains with too few nodes lack context, while domains with too many are already well-covered.`,
        parameters: [
            {
                key: 'researchEnabled',
                label: 'Enabled',
                description: 'Enable the autonomous domain research cycle.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['autonomousCycles', 'research', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'researchMaxSeedsPerCycle',
                label: 'Max Seeds / Cycle',
                description: 'Maximum seeds proposed per research cycle. At 5 (default), each research tick generates up to 5 new seeds for the target domain — each seed goes through dedup, injection detection, and intake defense before entering the graph. At 2, conservative growth. At 10, aggressive seeding that may produce lower-quality seeds as the LLM stretches to fill the quota. Each seed costs one embedding call for dedup checking.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['autonomousCycles', 'research', 'maxSeedsPerCycle'],
                tier: 'intermediate',
            },
            {
                key: 'researchMinDomainNodes',
                label: 'Min Domain Nodes',
                description: 'Minimum nodes a domain must have before it qualifies for research. At 3 (default), a domain needs at least 3 existing nodes for the LLM to have enough context to generate relevant research seeds. At 1, even brand-new domains with a single seed get researched — the LLM has very little context and may produce generic or off-topic seeds. At 10, domains need substantial content before research kicks in — better seeds but slower domain growth.',
                min: 1, max: 50, step: 1, default: 3,
                configPath: ['autonomousCycles', 'research', 'minDomainNodes'],
                tier: 'intermediate',
            },
            {
                key: 'researchMaxDomainNodes',
                label: 'Max Domain Nodes',
                description: 'Maximum nodes a domain can have before it is excluded from research (considered well-covered). At 200 (default), domains with 200+ nodes are considered saturated — research focuses on smaller domains that need growth. At 100, domains saturate faster, shifting research attention sooner. At 500, even large domains keep getting researched — useful when domains have broad scope that warrants continued exploration.',
                min: 50, max: 1000, step: 50, default: 200,
                configPath: ['autonomousCycles', 'research', 'maxDomainNodes'],
                tier: 'intermediate',
            },
            {
                key: 'researchRelevanceThreshold',
                label: 'Seed Relevance Threshold',
                description: 'Min cosine similarity of a generated seed to the domain centroid. Seeds below this are rejected as off-topic. At 0.2 (default), allows novel cross-domain connections while filtering obvious garbage. At 0.1, very permissive — almost anything passes. At 0.4, strict — only seeds closely matching existing domain content are accepted, which limits novelty.',
                min: 0.05, max: 0.6, step: 0.05, default: 0.2,
                configPath: ['autonomousCycles', 'research', 'relevanceThreshold'],
                tier: 'advanced',
            },
            {
                key: 'researchDomainRelevanceThreshold',
                label: 'Domain Relevance Threshold',
                description: 'Min cosine similarity of a domain centroid to the project purpose. Domains below this are skipped entirely for research. At 0.1 (default), only catches blatant cross-project contamination — trusts that user-curated domains belong in the graph. At 0.05, almost never skips a domain. At 0.3, aggressively filters domains that are tangentially related to the project purpose, which prevents novel cross-domain exploration.',
                min: 0.0, max: 0.5, step: 0.05, default: 0.1,
                configPath: ['autonomousCycles', 'research', 'domainRelevanceThreshold'],
                tier: 'advanced',
            },
            {
                key: 'researchExhaustionStreak',
                label: 'Exhaustion Streak',
                description: 'Consecutive research cycles producing 0 new seeds (all rejected by quality gates) before a domain is considered exhausted and put on cooldown. At 3 (default), 3 barren cycles in a row triggers exhaustion — the researcher moves on to other domains. At 1, gives up after a single barren cycle — fast rotation but may abandon domains that had a temporary quality gate issue. At 5, keeps trying longer, which costs more LLM calls on potentially saturated domains.',
                min: 1, max: 10, step: 1, default: 3,
                configPath: ['autonomousCycles', 'research', 'exhaustionStreak'],
                tier: 'advanced',
            },
            {
                key: 'researchExhaustionCooldownMs',
                label: 'Exhaustion Cooldown (ms)',
                description: 'How long an exhausted domain is skipped before being retried. At 3600000 (default, 1 hour), exhausted domains get a 1-hour cooldown before the researcher tries again — during this time, new synthesis or user seeds may create fresh context that unblocks research. At 1800000 (30 min), shorter cooldown, more frequent retries. At 7200000 (2 hours), longer cooldown. At 86400000 (24 hours), effectively once-a-day retry.',
                min: 300000, max: 86400000, step: 300000, default: 3600000,
                configPath: ['autonomousCycles', 'research', 'exhaustionCooldownMs'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Turn on domain researcher with default settings' },
            { label: 'Default', intent: 'Reset domain researcher parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // Autorating Cycle (3 params)
    // -------------------------------------------------------------------------
    cycle_autorating: {
        id: 'cycle_autorating',
        title: 'Quality Autorator',
        tier: 'intermediate' as SectionTier,
        description: 'Autonomous cycle that rates node quality using an LLM judge',
        behavior: `The autorator evaluates nodes for quality, assigning useful (1), not useful (0), or harmful (-1). Ratings adjust weights: useful +0.2, not useful -0.1, harmful -0.3. Two modes: the **cycle** processes backlogs in parallel batches (up to concurrency limit simultaneously); **inline** rates every new node immediately at creation time (fire-and-forget, does not block creation). Both can be enabled independently — inline provides instant feedback, the cycle catches anything inline missed. When a backlog exists, the cycle fires batches back-to-back with only 1s pause. When idle, it sleeps for the configured interval before checking for new nodes.`,
        parameters: [
            {
                key: 'autoratingEnabled',
                label: 'Cycle Enabled',
                description: 'Enable the periodic autorating cycle that scans for unrated nodes.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['autonomousCycles', 'autorating', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'autoratingInlineEnabled',
                label: 'Inline Enabled',
                description: 'Rate every new node immediately at creation time (fire-and-forget). Does not block node creation. Independent of the periodic cycle.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['autonomousCycles', 'autorating', 'inlineEnabled'],
                tier: 'advanced',
            },
            {
                key: 'autoratingGracePeriodMinutes',
                label: 'Grace Period (minutes)',
                description: 'Minutes after node creation before the periodic cycle considers it for rating. Does not affect inline rating (which fires immediately). At 30 minutes (default), nodes have time to participate in a few synthesis cycles before being judged — the autorator can see whether the node has been productive. At 15 min, faster rating but less context. At 60 min, more context but delayed feedback. The grace period prevents rating nodes that are about to be modified by ongoing synthesis.',
                min: 1, max: 120, step: 1, default: 30,
                configPath: ['autonomousCycles', 'autorating', 'gracePeriodMinutes'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable Both', intent: 'Turn on both cycle and inline autorating' },
            { label: 'Inline Only', intent: 'Enable inline rating, disable periodic cycle' },
            { label: 'Cycle Only', intent: 'Enable periodic cycle, disable inline rating' },
            { label: 'Default', intent: 'Reset autorating parameters to defaults (inline on, cycle off)' },
        ],
    },

    // -------------------------------------------------------------------------
    // Lab Verification Cycle (7 params)
    // -------------------------------------------------------------------------
    cycle_evm: {
        id: 'cycle_evm',
        title: 'Lab Verification Cycle',
        tier: 'intermediate' as SectionTier,
        description: 'Autonomous cycle that selects unverified nodes and submits them to the lab verification pipeline',
        behavior: 'Scans high-weight nodes that lack verification, extracts experiment specs, submits to lab servers, and applies graph consequences (weight changes, taint, evidence storage). The cycle selects one candidate per tick. Requires both the verification master switch and the cycle switch to be enabled.',
        parameters: [
            {
                key: 'evmCycleEnabled',
                label: 'Cycle Enabled',
                description: 'Enable the autonomous lab verification cycle. Also requires the verification master switch (evm.enabled) to be on.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['autonomousCycles', 'evm', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'evmCycleMinWeight',
                label: 'Min Node Weight',
                description: 'Only verify nodes above this weight threshold. At 0.7 (default), healthy nodes are verified. At 0.5, even declining nodes. At 1.0, only nodes that gained weight through synthesis.',
                min: 0.1, max: 2.0, step: 0.1, default: 0.7,
                configPath: ['autonomousCycles', 'evm', 'minWeightThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'evmCycleMaxRetries',
                label: 'Max Retries',
                description: 'Maximum lab submission attempts per node before giving up.',
                min: 0, max: 5, step: 1, default: 2,
                configPath: ['autonomousCycles', 'evm', 'maxRetriesPerNode'],
                tier: 'advanced',
            },
            {
                key: 'evmCycleRetryBackoff',
                label: 'Retry Backoff (ms)',
                description: 'Minimum wait time before retrying a failed node.',
                min: 60000, max: 3600000, step: 60000, default: 300000,
                configPath: ['autonomousCycles', 'evm', 'retryBackoffMs'],
                tier: 'advanced',
            },
            {
                key: 'evmNumericalPrecision',
                label: 'Default Precision (digits)',
                description: 'Default precision hint passed to labs in experiment specs. Labs can override.',
                min: 50, max: 2000, step: 50, default: 500,
                configPath: ['labVerify', 'numericalPrecision'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Enable verification cycle with defaults' },
            { label: 'Aggressive', intent: 'Low weight threshold (0.4), higher retry limit (4) — verify broadly' },
            { label: 'Conservative', intent: 'High weight threshold (1.2), low retries (1) — verify only the best' },
            { label: 'Default', intent: 'Reset cycle parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // Autonomous Voicing Cycle (3 params)
    // -------------------------------------------------------------------------
    cycle_voicing: {
        id: 'cycle_voicing',
        title: 'Autonomous Voicing',
        tier: 'intermediate' as SectionTier,
        description: 'Autonomous cycle that generates persona-driven voiced insights from high-weight nodes',
        behavior: 'The voicing cycle picks a high-weight node, pairs it with a related partner (parent or random accessible-domain node), selects a random persona mode (object-following, sincere, cynic, pragmatist, child), and synthesizes a voiced insight via the voicing pipeline. Unlike the synthesis engine which uses one mode and strict logical derivation, the voicing cycle produces diverse perspectives across 5 personas. Each voiced node records which persona mode was used. The cycle uses the same quality gates as manual voicing — novelty check, hallucination filter, telegraphic compression, and consultant review.',
        parameters: [
            {
                key: 'voicingEnabled',
                label: 'Enabled',
                description: 'Enable the autonomous voicing cycle.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['autonomousCycles', 'voicing', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'voicingMinWeight',
                label: 'Min Node Weight',
                description: 'Only voice nodes above this weight threshold. At 0.8 (default), nodes need to be near-default weight or higher — excludes recently demoted nodes and nodes that failed to produce offspring. At 1.2, only nodes that have earned weight through synthesis success are voiced — selective, ensures voicing input is proven content. At 0.5, even declining nodes can be voiced — broader coverage but the source material may be lower quality.',
                min: 0.3, max: 2.0, step: 0.1, default: 0.8,
                configPath: ['autonomousCycles', 'voicing', 'minWeightThreshold'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Turn on autonomous voicing with default settings' },
            { label: 'Selective', intent: 'Enable voicing with high weight threshold (1.2) — only the best nodes get voiced' },
            { label: 'Default', intent: 'Reset voicing cycle parameters to defaults' },
        ],
    },
};
