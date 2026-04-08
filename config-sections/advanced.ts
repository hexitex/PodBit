/**
 * Tunable parameter metadata for advanced and experimental config sections.
 *
 * Contains sections for features that are either computationally expensive,
 * require careful calibration, or are considered experimental:
 * fitness_modifier, ga_features, node_validation, cluster_selection,
 * prompt_injection_detection, knowledge_proxy, context_engine, domain_directed,
 * knowledge_base, intake_defense, and magic_numbers. Each section auto-renders
 * in the GUI config page and is addressable via
 * `podbit.config(action: "tune", sectionId: "...")`.
 *
 * @module config-sections/advanced
 */

import type { SectionMeta, SectionTier } from './types.js';

export const ADVANCED_SECTIONS: Record<string, SectionMeta> = {

    // -------------------------------------------------------------------------
    // Node Defaults (6 params)
    // -------------------------------------------------------------------------
    node_defaults: {
        id: 'node_defaults',
        tier: 'basic' as SectionTier,
        title: 'Node Defaults',
        description: 'Starting weight and salience for new nodes, plus breakthrough/promote bonuses',
        behavior: `Every new node enters the graph with a default weight and salience. Weight determines selection priority and survival — nodes earn higher weight through successful synthesis (producing children). Salience controls sampling probability in synthesis cycles. Setting these high means new nodes immediately compete with proven nodes; setting them low means new nodes must earn their place. Breakthrough and promote weights are assigned to manually promoted or lab-verified nodes. Warm thresholds define when a node is considered "warm" (recently active) for display purposes.`,
        parameters: [
            {
                key: 'defaultWeight',
                label: 'Default Weight',
                description: 'Starting weight for all new nodes (seeds, synthesis, voiced). At 1.0 (default), new nodes start equal to the knowledgeWeight (also 1.0) — they are immediately competitive in sampling. At 0.5, new nodes start at half weight and must earn boosts through successful synthesis to compete. At 1.5, new nodes dominate from birth, which is useful for small graphs (<50 nodes) that need every node participating. In large graphs (500+), lower values prevent new seeds from diluting the quality signal of established nodes.',
                min: 0.1, max: 3, step: 0.05, default: 1.0,
                configPath: ['nodes', 'defaultWeight'],
                tier: 'basic',
            },
            {
                key: 'defaultSalience',
                label: 'Default Salience',
                description: 'Starting salience for new nodes. At 1.0 (default), new nodes are immediately eligible for synthesis sampling at maximum initial probability. At 0.5, new nodes start at half the default — still above the salience floor (0.01) so they are sampled, just less frequently. Combined with salienceDecay, this determines how quickly new content gets its first synthesis pairing. Lower values mean new seeds may sit idle for several cycles before being selected.',
                min: 0.05, max: 2, step: 0.05, default: 1.0,
                configPath: ['nodes', 'defaultSalience'],
                tier: 'basic',
            },
            {
                key: 'breakthroughWeight',
                label: 'Breakthrough Weight',
                description: 'Weight assigned to nodes promoted to breakthrough status. At 1.5 (default), breakthroughs get 1.5x the default weight — a modest advantage that makes them ~50% more likely to be selected as synthesis parents. At 3.0 (the weight ceiling default), breakthroughs dominate selection. This matters because breakthrough parents tend to produce higher-quality children, so giving them more sampling weight compounds quality over time.',
                min: 1, max: 5, step: 0.1, default: 1.5,
                configPath: ['nodes', 'breakthroughWeight'],
                tier: 'basic',
            },
            {
                key: 'promoteWeight',
                label: 'Promote Weight',
                description: 'Weight assigned to manually promoted nodes. Slide right → promoted nodes strongly dominate selection. Slide left → promotion gives a modest boost. Safe range: 1.5–3.0.',
                min: 1, max: 5, step: 0.1, default: 1.5,
                configPath: ['nodes', 'promoteWeight'],
                tier: 'intermediate',
            },
            {
                key: 'warmThreshold',
                label: 'Warm Salience Threshold',
                description: 'Salience above this value marks a node as "warm" (recently active). Slide right → fewer nodes qualify as warm. Slide left → more nodes show as warm. Safe range: 0.3–0.8.',
                min: 0.1, max: 1.5, step: 0.05, default: 0.5,
                configPath: ['nodes', 'warmThreshold'],
                tier: 'advanced',
            },
            {
                key: 'warmWeightThreshold',
                label: 'Warm Weight Threshold',
                description: 'Weight above this value marks a node as "warm" for display purposes. Slide right → fewer nodes qualify as warm. Slide left → more nodes show as warm. Safe range: 0.8–1.5.',
                min: 0.5, max: 3, step: 0.05, default: 1.2,
                configPath: ['nodes', 'warmWeightThreshold'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Earn Your Place', intent: 'Low defaults — new nodes start cold and must prove their value through synthesis. Favors quality over quantity.' },
            { label: 'Warm Start', intent: 'Higher defaults — new nodes start competitive immediately. Good for small graphs needing initial momentum.' },
            { label: 'Default', intent: 'Reset to balanced defaults that work for most graph sizes.' },
        ],
    },

    // -------------------------------------------------------------------------
    // Feedback Weights (4 params)
    // -------------------------------------------------------------------------
    feedback_weights: {
        id: 'feedback_weights',
        tier: 'basic' as SectionTier,
        title: 'Feedback Weights',
        description: 'How much user and autorater feedback affects node weight',
        behavior: `When a node receives feedback (useful, not useful, or harmful), its weight is adjusted by these amounts. The asymmetry between positive and negative feedback determines whether junk accumulates or decays. If notUsefulWeight is too weak relative to usefulWeight, even frequently downvoted nodes maintain positive net weight. The weight floor prevents nodes from going to zero — they can always be rediscovered. Harmful weight should be significantly stronger than not-useful to quickly suppress toxic or misleading content.`,
        parameters: [
            {
                key: 'usefulWeight',
                label: 'Useful Feedback Boost',
                description: 'Weight added when a node is marked useful (by user or autorater). At 0.2 (default), a single "useful" rating adds 20% to the base weight — a node at 1.0 becomes 1.2. Five "useful" ratings push it to 2.0. At 0.1, feedback is gentler — takes 10 positive ratings to double weight. The asymmetry with notUsefulWeight (-0.1 default) means one "useful" cancels two "not useful" ratings, creating a bias toward keeping content.',
                min: 0.01, max: 1, step: 0.01, default: 0.2,
                configPath: ['feedback', 'usefulWeight'],
                tier: 'intermediate',
            },
            {
                key: 'notUsefulWeight',
                label: 'Not Useful Penalty',
                description: 'Weight subtracted when a node is marked not useful. At -0.1 (default), a single "not useful" rating drops weight by 0.1 — a node at 1.0 becomes 0.9. Takes 9 "not useful" ratings to push a default-weight node to the weight floor (0.1). At -0.2, nodes sink twice as fast — 4 ratings drops weight from 1.0 to 0.2. If junk accumulates in your graph faster than it decays, make this more negative.',
                min: -1, max: -0.01, step: 0.01, default: -0.1,
                configPath: ['feedback', 'notUsefulWeight'],
                tier: 'intermediate',
            },
            {
                key: 'harmfulWeight',
                label: 'Harmful Penalty',
                description: 'Weight subtracted when a node is marked harmful. Slide right (toward 0) → gentler harmful penalty. Slide left → severe penalty, harmful nodes sink immediately. Safe range: -0.5 to -0.2.',
                min: -2, max: -0.1, step: 0.05, default: -0.3,
                configPath: ['feedback', 'harmfulWeight'],
                tier: 'advanced',
            },
            {
                key: 'weightFloor',
                label: 'Weight Floor',
                description: 'Minimum weight a node can reach. Slide right → nodes retain more weight even after heavy downvoting. Slide left → nodes can sink closer to zero. Safe range: 0.05–0.2.',
                min: 0, max: 0.5, step: 0.01, default: 0.1,
                configPath: ['feedback', 'weightFloor'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Aggressive Cleanup', intent: 'Strong negative weights so bad nodes decay fast. Not-useful at -0.25, harmful at -0.5. Low weight floor.' },
            { label: 'Balanced', intent: 'Moderate asymmetry between positive and negative feedback. Default values.' },
            { label: 'Forgiving', intent: 'Weak penalties — nodes rarely lose weight from feedback. Useful in early graph stages where everything is exploratory.' },
        ],
    },

    // -------------------------------------------------------------------------
    // 15. Fitness Modifier (6 params)
    // -------------------------------------------------------------------------
    fitness_modifier: {
        id: 'fitness_modifier',
        tier: 'intermediate',
        title: 'Fitness Modifier',
        description: 'Grades synthesis output quality to modulate initial weight',
        behavior: `Instead of assigning a flat initial weight to all synthesis nodes, the fitness modifier computes a proxy quality score from three signals already in the pipeline: (1) parent dissimilarity — how far apart the parent nodes were (more distant = harder synthesis = higher reward), (2) novelty — how unlike the child is from existing nodes in the domain (via inverted dedup similarity), (3) specificity enrichment — whether the child is more specific than its parents. The composite score is mapped to a range (default 0.85–1.15) and multiplied against the base weight. This creates natural weight variation without new LLM calls.`,
        parameters: [
            {
                key: 'fitnessEnabled',
                label: 'Enable Fitness',
                description: 'Toggle quality-based weight variation for new synthesis nodes. 1 = on (better synthesis gets higher initial weight). 0 = off (all synthesis gets flat trajectory weight).',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['engine', 'fitnessEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'dissimilarityWeight',
                label: 'Dissimilarity Weight',
                description: 'How much the fitness score rewards synthesis that bridges distant parent nodes. At 0.40 (default), dissimilarity is the strongest fitness signal — cross-domain synthesis that successfully connects distant ideas gets the highest weight bonus. At 0.1, bridging distance barely affects initial weight. The three fitness weights (dissimilarity 0.40, novelty 0.35, specificity 0.25) should sum to ~1.0 for balanced scoring. Raise this if your graph has good cross-domain content that gets underweighted.',
                min: 0, max: 1.0, step: 0.05, default: 0.4,
                configPath: ['engine', 'fitnessWeights', 'dissimilarity'],
                tier: 'advanced',
            },
            {
                key: 'noveltyWeight',
                label: 'Novelty Weight',
                description: 'How much to reward synthesis unlike anything already in the graph. Slide right → truly unique content gets higher weight. Slide left → novelty matters less for quality scoring. Safe range: 0.1–0.4.',
                min: 0, max: 1.0, step: 0.05, default: 0.35,
                configPath: ['engine', 'fitnessWeights', 'novelty'],
                tier: 'advanced',
            },
            {
                key: 'specificityWeight',
                label: 'Specificity Weight',
                description: 'How much to reward synthesis that is more specific than its parents. Slide right → concrete, detailed output gets higher weight. Slide left → specificity matters less for quality scoring. Safe range: 0.1–0.4.',
                min: 0, max: 1.0, step: 0.05, default: 0.25,
                configPath: ['engine', 'fitnessWeights', 'specificity'],
                tier: 'advanced',
            },
            {
                key: 'fitnessRangeMin',
                label: 'Range Min',
                description: 'Minimum fitness multiplier for the lowest-scoring synthesis. At 0.85 (default), the worst possible synthesis gets 85% of its trajectory weight — e.g., a knowledge node at weight 1.0 starts at 0.85 instead. The fitness range [0.85, 1.15] creates a ±15% weight variation based on quality. At 0.75, the penalty is harsher — 25% weight loss for poor synthesis. At 0.95, the range narrows to ±5%, making fitness nearly irrelevant.',
                min: 0.5, max: 1.0, step: 0.05, default: 0.85,
                configPath: ['engine', 'fitnessRange', 'min'],
                tier: 'advanced',
            },
            {
                key: 'fitnessRangeMax',
                label: 'Range Max',
                description: 'Maximum fitness multiplier for the best-scoring synthesis. At 1.15 (default), the best synthesis gets 115% of its trajectory weight — a knowledge node starts at 1.15 instead of 1.0. Combined with rangeMin (0.85), the quality spread is 0.30 (30% weight difference between best and worst). At 1.25, the spread widens to 0.40 — stronger differentiation. At 1.05, fitness barely matters and all synthesis starts near-equal.',
                min: 1.0, max: 1.5, step: 0.05, default: 1.15,
                configPath: ['engine', 'fitnessRange', 'max'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable Fitness', intent: 'Enable the fitness modifier with balanced default weights' },
            { label: 'Favor Novelty', intent: 'Weight novelty signal highest so truly unique synthesis gets the most weight' },
            { label: 'Favor Bridging', intent: 'Weight dissimilarity signal highest so cross-domain connections get rewarded more' },
            { label: 'Disable', intent: 'Turn off the fitness modifier and use flat trajectory-based weights' },
        ],
    },

    // -------------------------------------------------------------------------
    // 12. GA-Inspired Features (4 params — toggles only)
    // -------------------------------------------------------------------------
    ga_features: {
        id: 'ga_features',
        tier: 'advanced',
        title: 'GA-Inspired Features',
        description: 'Genetic algorithm improvements: niching, migration, multi-parent, synthesis decay',
        behavior: `Four features inspired by Holland's Genetic Algorithm framework. All default to enabled for quality synthesis. (1) Synthesis Decay: unused synthesis nodes decay faster after a grace period. (2) Niching: biases synthesis sampling toward underrepresented domains. (3) Migration: seeks partners from foreign partitions for cross-pollination. (4) Multi-Parent: synthesizes from 3+ parents for combinatorial insight. Rates and counts for migration/multi-parent use sensible hardcoded defaults when enabled.`,
        parameters: [
            {
                key: 'synthesisDecayEnabled',
                label: 'Synthesis Decay',
                description: 'Apply extra weight decay to synthesis nodes that are never referenced in conversations (after grace period). Useful content survives; unused synthesis gradually sinks. 1 = on, 0 = off.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['engine', 'synthesisDecayEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'synthesisDecayMultiplier',
                label: 'Synthesis Decay Rate',
                description: 'Extra weight decay multiplier applied to unreferenced synthesis nodes (on top of normal weightDecay). At 0.95 (default), unreferenced nodes lose an additional 5% weight per decay pass — combined with normal decay (0.999), these nodes decay ~50x faster than referenced ones. A synthesis node at weight 1.0 that is never referenced in chat or cited in other synthesis drops to ~0.35 after one day (with decay every 5 min). At 0.99, the extra penalty is gentle (1% per pass). At 0.90, unreferenced nodes are aggressively culled — drops to ~0.10 in about 12 hours.',
                min: 0.8, max: 0.999, step: 0.005, default: 0.95,
                configPath: ['engine', 'synthesisDecayMultiplier'],
                tier: 'advanced',
            },
            {
                key: 'synthesisDecayGraceDays',
                label: 'Synthesis Decay Grace Period (days)',
                description: 'Days after creation before the extra synthesis decay kicks in. At 7 days (default), new synthesis has a full week to be discovered by users or referenced in chat before the penalty applies. At 3 days, the window is tight — nodes that are not engaged with quickly start losing weight. At 14 days, very lenient — useful if you review graph content weekly. This grace period does NOT affect normal weight decay, only the extra synthesis decay multiplier.',
                min: 1, max: 30, step: 1, default: 7,
                configPath: ['engine', 'synthesisDecayGraceDays'],
                tier: 'advanced',
            },
            {
                key: 'nichingEnabled',
                label: 'Domain Niching',
                description: 'Bias synthesis sampling toward domains with fewer recent synthesis events, preventing dominant domains from starving smaller ones. 1 = on, 0 = off.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['synthesisEngine', 'nichingEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'migrationEnabled',
                label: 'Partition Migration',
                description: 'Occasionally seek synthesis partners from foreign (non-bridged) partitions for cross-pollination of ideas across isolated domains. 1 = on, 0 = off.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['synthesisEngine', 'migrationEnabled'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Enable All', intent: 'Turn on all GA features for balanced evolutionary behavior' },
            { label: 'Diversity Focus', intent: 'Enable niching and migration for maximum diversity' },
            { label: 'Disable All', intent: 'Turn off all GA-inspired features for standard synthesis engine behavior' },
        ],
    },

    // -------------------------------------------------------------------------
    // 12. Node Validation (4 params)
    // -------------------------------------------------------------------------
    node_validation: {
        id: 'node_validation',
        tier: 'intermediate',
        title: 'Node Validation',
        description: 'Controls generic/vague content detection when proposing nodes',
        behavior: `When a node is proposed, its content is checked for generic language. Generic start patterns detect vague openings ("this is", "we need"). Generic filler patterns detect overused qualifiers ("very important", "crucial"). If generic hits / word count exceeds the ratio threshold AND the content is below the minimum word count, the node is rejected. Longer content gets more leeway.`,
        parameters: [
            {
                key: 'genericRatioThreshold',
                label: 'Generic Ratio Threshold',
                description: 'Maximum ratio of generic/filler phrases to total words before content is rejected. Slide right → more tolerant of vague language. Slide left → stricter, rejects content with even moderate amounts of filler phrases like "very important" or "we need to". Safe range: 0.2–0.5.',
                min: 0.1, max: 0.8, step: 0.05, default: 0.3,
                configPath: ['nodeValidation', 'genericRatioThreshold'],
                tier: 'advanced',
            },
            {
                key: 'genericMinWordCount',
                label: 'Generic Min Word Count',
                description: 'Generic language check only applies to short content below this word count — longer content gets a pass. Slide right → more content is subject to generic language checks. Slide left → only very short content is checked. Safe range: 15–30.',
                min: 5, max: 50, step: 5, default: 20,
                configPath: ['nodeValidation', 'genericMinWordCount'],
                tier: 'advanced',
            },
            {
                key: 'genericStartPatterns',
                label: 'Generic Start Patterns',
                description: 'Regex patterns that detect vague/generic openings in proposed content (e.g., "^this is", "^we need to"). Each match counts toward the generic ratio.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['nodeValidation', 'genericStartPatterns'],
                controlType: 'patternList' as any,
                listDescription: 'Regex patterns that match generic/vague sentence openings in proposed content',
                presetSuggestions: ['Generic openings', 'Vague starters'],
                tier: 'advanced',
            },
            {
                key: 'genericFillerPatterns',
                label: 'Generic Filler Patterns',
                description: 'Regex patterns that detect overused qualifiers and filler phrases (e.g., "very important", "crucial", "significant"). Each match counts toward the generic ratio.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['nodeValidation', 'genericFillerPatterns'],
                controlType: 'patternList' as any,
                listDescription: 'Regex patterns that match filler/qualifier phrases in proposed content',
                presetSuggestions: ['Filler qualifiers', 'Buzzword patterns'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Strict Validation', intent: 'Lower thresholds to reject more vague content' },
            { label: 'Permissive Validation', intent: 'Raise thresholds to allow more generic phrasing through' },
            { label: 'Default', intent: 'Reset node validation parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // 14. Cluster Selection (7 params)
    // -------------------------------------------------------------------------
    cluster_selection: {
        id: 'cluster_selection',
        tier: 'intermediate',
        title: 'Cluster Selection',
        description: 'Quantum-inspired simulated annealing to find optimal multi-node clusters for synthesis',
        behavior: `When enabled, a fraction of synthesis cycles use simulated annealing to find optimal clusters of 3+ nodes instead of sequential pairwise sampling. The annealing process explores the combinatorial space of possible node groupings, accepting worse solutions probabilistically at high temperature (exploration) and converging at low temperature (exploitation). The energy function balances coherence (embedding similarity in the productive band), cross-domain diversity, node quality (weight), and target cluster size. Clusters that pass validation are fed to the multi-parent voicing pipeline. This replaces the directed-search partner-finding stages 1-4 for those cycles.`,
        parameters: [
            {
                key: 'enabled',
                label: 'Enable Cluster Selection',
                description: 'Toggle cluster-based multi-node synthesis. When on, a fraction of synthesis cycles group 3+ nodes via simulated annealing instead of pairing two. 1 = on, 0 = off (all cycles use standard pairwise).',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['clusterSelection', 'enabled'],
                tier: 'intermediate',
            },
            {
                key: 'targetSize',
                label: 'Target Cluster Size',
                description: 'Nodes per cluster. At 3 (default), clusters contain 3 nodes — the LLM synthesizes connections across a triangle of ideas. At 4, combinatorial complexity increases (6 pairwise relationships) — richer potential insights but the LLM may produce vague generalizations trying to connect too many threads. At 5, the synthesis rarely coheres. Stick with 3 unless your graph has very dense, closely related domains where 4-way connections are natural.',
                min: 3, max: 5, step: 1, default: 3,
                configPath: ['clusterSelection', 'targetSize'],
                tier: 'advanced',
            },
            {
                key: 'clusterCycleRate',
                label: 'Cluster Cycle Rate',
                description: 'Fraction of synthesis cycles that use cluster mode vs standard pairwise. At 0.30 (default), 30% of cycles attempt cluster synthesis and 70% use standard 2-node pairing. Cluster synthesis is more expensive (annealing computation + potentially harder voicing) but can find multi-domain connections that pairwise misses. At 0.15, clusters are rare treats. At 0.50, half of all synthesis is cluster-based — good for highly interconnected graphs with many bridged domains.',
                min: 0.05, max: 1.0, step: 0.05, default: 0.3,
                configPath: ['clusterSelection', 'clusterCycleRate'],
                tier: 'advanced',
            },
            {
                key: 'coherenceWeight',
                label: 'Coherence Weight',
                description: 'How much the annealing energy function values semantic relatedness. Slide right → clusters prefer nodes that are topically related. Slide left → relaxes coherence requirement, allows more scattered clusters. Safe range: 0.5–1.5.',
                min: 0.1, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['clusterSelection', 'coherenceWeight'],
                tier: 'advanced',
            },
            {
                key: 'diversityWeight',
                label: 'Diversity Weight',
                description: 'How much the annealing energy function values cross-domain mixing. Slide right → clusters prefer nodes from different domains. Slide left → domain diversity matters less, allows single-domain clusters. Safe range: 0.4–1.2.',
                min: 0.0, max: 2.0, step: 0.1, default: 0.8,
                configPath: ['clusterSelection', 'diversityWeight'],
                tier: 'advanced',
            },
            {
                key: 'maxIterations',
                label: 'Max Iterations',
                description: 'Maximum annealing iterations per cluster search. Slide right → better solutions found but takes longer per cycle. Slide left → faster but may settle on suboptimal clusters. Safe range: 300–1000.',
                min: 100, max: 2000, step: 100, default: 500,
                configPath: ['clusterSelection', 'maxIterations'],
                tier: 'advanced',
            },
            {
                key: 'coolingRate',
                label: 'Cooling Rate',
                description: 'How fast the annealing temperature drops per iteration. At 0.995 (default) with 500 iterations, the temperature drops to ~8% of initial — thorough exploration before converging. At 0.998, temperature stays high longer (37% after 500 iterations) — very exploratory, good for large graphs with many candidates. At 0.990, temperature drops to 0.7% after 500 iterations — fast convergence, may settle on the first decent cluster found.',
                min: 0.97, max: 0.999, step: 0.001, default: 0.995,
                configPath: ['clusterSelection', 'coolingRate'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable Default', intent: 'Enable cluster selection with balanced default parameters' },
            { label: 'Cross-Domain Focus', intent: 'Enable with high diversity weight to maximize cross-domain synthesis' },
            { label: 'Fast Convergence', intent: 'Enable with faster cooling and fewer iterations for quick cluster finding' },
            { label: 'Disable', intent: 'Turn off cluster selection — all cycles use standard pairwise synthesis' },
        ],
    },

    // -------------------------------------------------------------------------
    // Prompt Injection Detection
    // -------------------------------------------------------------------------
    prompt_injection_detection: {
        id: 'prompt_injection_detection',
        tier: 'intermediate',
        title: 'Prompt Injection Detection',
        description: 'Pattern-based detection of prompt injection attempts in proposed node content',
        behavior: `When content is proposed to the graph, it is scanned for patterns commonly used in prompt injection attacks. Each pattern group has a weight — instruction overrides and prompt structure markers score 2 points, role overrides and system prompt markers score 1. If the total score meets or exceeds the threshold, injection is detected. For auto-generated content (voiced, synthesis), injection triggers hard rejection. For seeds and human contributions, content is flagged with warnings but allowed through to avoid false positives on legitimate technical content about prompt engineering.`,
        parameters: [
            {
                key: 'scoreThreshold',
                label: 'Score Threshold',
                description: 'Minimum cumulative score from pattern matches to flag content as injection. Slide right → less sensitive, needs multiple strong signals. Slide left → more sensitive, a single suspicious pattern triggers detection. Safe range: 1–3.',
                min: 1, max: 6, step: 1, default: 1,
                configPath: ['injection', 'scoreThreshold'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Sensitive', intent: 'Lower the score threshold to catch more potential injection attempts' },
            { label: 'Permissive', intent: 'Raise the score threshold to only flag content with multiple strong injection signals' },
            { label: 'Default', intent: 'Reset injection detection to default sensitivity' },
        ],
    },

    // -------------------------------------------------------------------------
    // 15. Knowledge Proxy (2 params)
    // -------------------------------------------------------------------------
    knowledge_proxy: {
        id: 'knowledge_proxy',
        title: 'Knowledge Proxy',
        tier: 'basic',
        description: 'Controls how much context window the proxy reserves for knowledge graph content',
        behavior: `The knowledge proxy sits between the client and the LLM, enriching requests with relevant graph knowledge. knowledgeReserve sets the maximum fraction of the context window allocated to knowledge (e.g. 0.15 = 15%). knowledgeMinReserve sets the minimum floor — even short conversations get at least this much knowledge. For a 10K context model: 0.15 reserve = up to 1,500 tokens for knowledge (~5-8 graph nodes). 0.05 min reserve = at least 500 tokens. These fractions scale automatically with context window size, so the defaults work well for any model.`,
        parameters: [
            {
                key: 'knowledgeReserve',
                label: 'Knowledge Reserve (max)',
                description: 'Maximum fraction of context window allocated to graph knowledge injection. At 0.15 (default), for a 10K context model, up to 1,500 tokens (~5-8 graph nodes) are injected. For a 32K model, up to 4,800 tokens (~15-25 nodes). At 0.25, knowledge gets more room but long conversations may feel truncated. At 0.05 (the minimum reserve), only 1-3 nodes fit in a 10K context — bare minimum grounding.',
                min: 0.01, max: 0.50, step: 0.01, default: 0.15,
                configPath: ['proxy', 'knowledgeReserve'],
                tier: 'basic',
            },
            {
                key: 'knowledgeMinReserve',
                label: 'Knowledge Min Reserve',
                description: 'Minimum guaranteed knowledge allocation even when conversation history is long. At 0.05 (default), at least 5% of the context window is reserved for graph knowledge — for a 10K model, that is 500 tokens (~2-3 nodes) even in a 50-turn conversation. At 0.10, more knowledge is guaranteed but long conversations lose history. At 0.03, almost all context can go to conversation history, leaving knowledge nearly empty.',
                min: 0.01, max: 0.30, step: 0.01, default: 0.05,
                configPath: ['proxy', 'knowledgeMinReserve'],
                tier: 'basic',
            },
        ],
        presets: [
            { label: 'More Knowledge', intent: 'Increase knowledge reserve to inject more graph context into conversations' },
            { label: 'Less Knowledge', intent: 'Reduce knowledge reserve to leave more room for conversation context' },
            { label: 'Default', intent: 'Reset proxy knowledge reserves to defaults (15% max, 5% min)' },
        ],
    },

    // -------------------------------------------------------------------------
    // 16. Context Engine (14 params)
    // -------------------------------------------------------------------------
    context_engine: {
        id: 'context_engine',
        title: 'Context Engine',
        tier: 'intermediate',
        description: 'Dynamic context selection and delivery for LLM conversations',
        behavior: `The context engine enriches LLM conversations with relevant knowledge graph content. It selects nodes by a weighted relevance score (embedding similarity, topic match, node weight, recency), manages token budgets across knowledge/history/system prompt/response reserves, and compresses history when budgets are exceeded. For a 10K context model: set totalBudget to 6000-8000 (must be LESS than your context window minus max_tokens for the response), maxKnowledgeNodes to 5-8, and knowledge allocation to 0.35-0.40. The feedback loop detects which delivered knowledge the model actually used and boosts those nodes. Cross-session learning persists topic weights and node usage across conversations.`,
        parameters: [
            {
                key: 'totalBudget',
                label: 'Total Budget',
                description: 'Total token budget shared across knowledge, history, system prompt, and response reserve. Must be LESS than your model\'s context window minus max_tokens. Slide right → more context capacity (needs larger context window). Slide left → fits smaller models but less knowledge/history. Safe range: 6000–32000 — depends on your model\'s context window.',
                min: 2000, max: 128000, step: 1000, default: 16000,
                configPath: ['contextEngine', 'totalBudget'],
                tier: 'basic',
            },
            {
                key: 'allocationKnowledge',
                label: 'Knowledge Allocation',
                description: 'Fraction of total budget for knowledge graph nodes. Slide right → more graph knowledge in context, better grounding. Slide left → less knowledge, more room for history/response. Safe range: 0.25–0.50.',
                min: 0.05, max: 0.80, step: 0.05, default: 0.40,
                configPath: ['contextEngine', 'allocation', 'knowledge'],
                tier: 'intermediate',
            },
            {
                key: 'allocationHistory',
                label: 'History Allocation',
                description: 'Fraction of total budget for conversation history. Slide right → more conversation context preserved, better continuity. Slide left → less history, more room for knowledge. Safe range: 0.20–0.40.',
                min: 0.05, max: 0.80, step: 0.05, default: 0.30,
                configPath: ['contextEngine', 'allocation', 'history'],
                tier: 'intermediate',
            },
            {
                key: 'allocationSystemPrompt',
                label: 'System Prompt Allocation',
                description: 'Fraction of total budget for the system prompt. Slide right → more room for system instructions. Slide left → smaller system prompt, more room for content. Safe range: 0.05–0.15.',
                min: 0.05, max: 0.40, step: 0.05, default: 0.10,
                configPath: ['contextEngine', 'allocation', 'systemPrompt'],
                tier: 'intermediate',
            },
            {
                key: 'allocationResponse',
                label: 'Response Allocation',
                description: 'Fraction of total budget reserved for the model\'s response. Slide right → allows longer responses. Slide left → shorter responses but more input context. Safe range: 0.15–0.30.',
                min: 0.05, max: 0.50, step: 0.05, default: 0.20,
                configPath: ['contextEngine', 'allocation', 'response'],
                tier: 'intermediate',
            },
            {
                key: 'maxKnowledgeNodes',
                label: 'Max Knowledge Nodes',
                description: 'Maximum graph nodes to include in context (~50-200 tokens each). Slide right → more knowledge nodes, better coverage but uses more budget. Slide left → fewer nodes, saves tokens for history. Safe range: 5–20 — scale with your context window.',
                min: 1, max: 50, step: 1, default: 15,
                configPath: ['contextEngine', 'maxKnowledgeNodes'],
                tier: 'basic',
            },
            {
                key: 'minRelevanceScore',
                label: 'Min Relevance Score',
                description: 'Minimum relevance score for a node to be included in context. Slide right → only highly relevant nodes pass, fewer but better-targeted. Slide left → more nodes pass, broader coverage but may include marginally relevant content. Safe range: 0.15–0.40.',
                min: 0.0, max: 1.0, step: 0.05, default: 0.25,
                configPath: ['contextEngine', 'minRelevanceScore'],
                tier: 'intermediate',
            },
            {
                key: 'weightEmbedding',
                label: 'Embedding Weight',
                description: 'How much semantic similarity (embeddings) matters for node selection. Slide right → nodes matching the message meaning are strongly preferred. Slide left → other signals (topic, weight, recency) matter more. Safe range: 0.25–0.55.',
                min: 0.0, max: 1.0, step: 0.05, default: 0.40,
                configPath: ['contextEngine', 'relevanceWeights', 'embedding'],
                tier: 'intermediate',
            },
            {
                key: 'weightTopicMatch',
                label: 'Topic Match Weight',
                description: 'How much topic keyword matching matters for node selection. Slide right → nodes matching accumulated conversation topics are strongly preferred. Slide left → topic keywords matter less. Safe range: 0.15–0.45.',
                min: 0.0, max: 1.0, step: 0.05, default: 0.30,
                configPath: ['contextEngine', 'relevanceWeights', 'topicMatch'],
                tier: 'intermediate',
            },
            {
                key: 'weightNodeWeight',
                label: 'Node Weight Weight',
                description: 'How much a node\'s graph weight (accumulated importance) matters for selection. Slide right → high-weight (well-established) nodes are strongly preferred. Slide left → node weight matters less, newer/lighter nodes get equal chance. Safe range: 0.10–0.30.',
                min: 0.0, max: 1.0, step: 0.05, default: 0.20,
                configPath: ['contextEngine', 'relevanceWeights', 'nodeWeight'],
                tier: 'intermediate',
            },
            {
                key: 'weightRecency',
                label: 'Recency Weight',
                description: 'How much node freshness matters for selection. Slide right → recently created/updated nodes are strongly preferred. Slide left → old and new nodes compete equally. Safe range: 0.05–0.20.',
                min: 0.0, max: 1.0, step: 0.05, default: 0.10,
                configPath: ['contextEngine', 'relevanceWeights', 'recency'],
                tier: 'intermediate',
            },
            {
                key: 'compressionThreshold',
                label: 'Compression Threshold',
                description: 'When conversation history exceeds this fraction of its budget, older turns are compressed into summaries. Slide right (toward 1.0) → compresses later, keeps more raw history but risks hitting budget limits. Slide left → compresses sooner, keeps history compact. Safe range: 0.70–0.90.',
                min: 0.50, max: 1.0, step: 0.05, default: 0.80,
                configPath: ['contextEngine', 'compressionThreshold'],
                tier: 'advanced',
            },
            {
                key: 'feedbackWeightBoost',
                label: 'Feedback Weight Boost',
                description: 'How much to boost a node\'s graph weight when the model actually uses it in a response. Slide right → stronger feedback loop, frequently-used knowledge gains weight faster. Slide left → weaker feedback, usage has less impact on node importance. Safe range: 0.02–0.10.',
                min: 0.0, max: 0.5, step: 0.01, default: 0.05,
                configPath: ['contextEngine', 'feedback', 'weightBoost'],
                tier: 'intermediate',
            },
            {
                key: 'maxSessionHistory',
                label: 'Max Session History',
                description: 'Maximum conversation turns to keep in session history. Slide right → longer memory, more context for the model. Slide left → shorter memory, less token usage per turn. Safe range: 20–100.',
                min: 5, max: 200, step: 5, default: 50,
                configPath: ['contextEngine', 'maxSessionHistory'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: '10K Context', intent: 'Optimize for a 10,000 token context window: totalBudget=7000, maxKnowledgeNodes=6, knowledge allocation=0.35, history=0.35, systemPrompt=0.10, response=0.20, maxSessionHistory=20, compressionThreshold=0.70' },
            { label: 'Knowledge Heavy', intent: 'Maximize knowledge injection — more graph nodes, higher knowledge allocation, lower history' },
            { label: 'Conversation Heavy', intent: 'Prioritize conversation history — more history allocation, fewer knowledge nodes' },
            { label: 'Minimal Context', intent: 'Reduce total budget and node count for small models with limited context windows' },
            { label: 'Default', intent: 'Reset all context engine parameters to their defaults' },
        ],
    },

    // =========================================================================
    // AUTONOMOUS CYCLES
    // =========================================================================

    domain_directed: {
        id: 'domain_directed',
        title: 'Domain-Directed Synthesis',
        tier: 'intermediate',
        description: 'Top-down synthesis that identifies underserved domain pairs and samples cold nodes',
        behavior: `Domain-directed synthesis inverts the normal sampling strategy. Instead of picking hot/heavy nodes and hoping for cross-domain pairing, it first identifies which bridged domain pairs have had the least recent synthesis activity, then samples cold (low-salience) nodes from those domains. domainDirectedCycleRate controls what fraction of synthesis cycles use this mode vs standard pairwise/cluster. domainDirectedLookbackDays sets the window for measuring recent synthesis coverage per domain pair.`,
        parameters: [
            {
                key: 'domainDirectedEnabled',
                label: 'Enabled',
                description: 'Enable top-down synthesis that targets underserved domain pairs with cold nodes. Complements standard bottom-up sampling. 1 = on, 0 = off.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['synthesisEngine', 'domainDirectedEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'domainDirectedCycleRate',
                label: 'Cycle Rate',
                description: 'Fraction of synthesis cycles that use domain-directed mode. Slide right → more cycles target underserved domains. Slide left → fewer domain-directed cycles, mostly standard sampling. 0.2 = 20%. Safe range: 0.10–0.40.',
                min: 0.05, max: 0.8, step: 0.05, default: 0.2,
                configPath: ['synthesisEngine', 'domainDirectedCycleRate'],
                tier: 'intermediate',
            },
            {
                key: 'domainDirectedLookbackDays',
                label: 'Lookback Days',
                description: 'Days to look back when measuring which domain pairs have had recent synthesis. Slide right → longer memory, domains need sustained neglect to be targeted. Slide left → shorter memory, quickly targets domains that haven\'t had recent activity. Safe range: 3–14.',
                min: 1, max: 30, step: 1, default: 7,
                configPath: ['synthesisEngine', 'domainDirectedLookbackDays'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Turn on domain-directed synthesis with default 20% cycle rate' },
            { label: 'Aggressive', intent: 'Increase domain-directed cycle rate to explore cold domains faster' },
            { label: 'Default', intent: 'Reset domain-directed synthesis parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // Knowledge Base Ingestion (4 params)
    // -------------------------------------------------------------------------
    knowledge_base: {
        id: 'knowledge_base',
        tier: 'basic',
        title: 'Knowledge Base Ingestion',
        description: 'Controls file ingestion, chunking, decomposition pipeline, and folder watching for the KB system',
        behavior: `The Knowledge Base system watches folders and ingests files into the knowledge graph. Document readers (PDF, Doc, Text) use a two-stage decomposition pipeline: Stage 1 decomposes sections into atomic classified claims, Stage 2 aggressively filters and assigns weights. Code and Sheet readers use simple single-prompt curation. MaxNodesPerFile is a hard cap that prevents any single document from flooding the graph — the LLM filter's top picks by weight survive. MinChunkLength skips tiny content fragments that produce low-quality nodes. MaxConcurrency controls parallel file processing. Token limits come from the model registry (assigned model's maxTokens) — not hardcoded here.`,
        parameters: [
            {
                key: 'maxNodesPerFile',
                label: 'Max Nodes Per File',
                description: 'Hard cap on nodes created from a single file by the decomposition pipeline. If the LLM filter keeps more than this, only the top N by weight survive. Slide right → more nodes per document but higher noise risk. Slide left → stricter quality gate. Safe range: 5–20.',
                min: 1, max: 30, step: 1, default: 12,
                configPath: ['knowledgeBase', 'maxNodesPerFile'],
                tier: 'basic',
            },
            {
                key: 'curationMaxTokens',
                label: 'Curation Max Tokens',
                description: 'Max tokens for KB curation/decomposition LLM calls. Thinking models consume most tokens on chain-of-thought, so this needs to be high. Safe range: 8000–32000.',
                min: 2000, max: 32000, step: 500, default: 16000,
                configPath: ['knowledgeBase', 'curationMaxTokens'],
                tier: 'intermediate',
            },
            {
                key: 'maxClaimsPerFile',
                label: 'Max Claims Per File',
                description: 'Max claims from Stage 1 (decomposition) passed to Stage 2 (filter). Dense papers can produce 100+ raw claims — the filter LLM degrades when asked to judge that many. Claims are sorted by type priority (EMPIRICAL > METHODOLOGICAL > others) before trimming. Safe range: 20–60.',
                min: 10, max: 100, step: 5, default: 40,
                configPath: ['knowledgeBase', 'maxClaimsPerFile'],
                tier: 'basic',
            },
            {
                key: 'maxConcurrency',
                label: 'Max Concurrency',
                description: 'Files processed in parallel during KB ingestion. Slide right → faster bulk import but more simultaneous API/LLM calls. Slide left → slower, sequential processing, lower resource usage. Safe range: 1–4.',
                min: 1, max: 10, step: 1, default: 2,
                configPath: ['knowledgeBase', 'maxConcurrency'],
                tier: 'intermediate',
            },
            {
                key: 'maxChunkSize',
                label: 'Max Chunk Size (chars)',
                description: 'Maximum characters per knowledge chunk (~4000 chars = ~1000 tokens). Slide right → bigger chunks, fewer nodes per file but more context per node. Slide left → smaller chunks, more granular nodes but less context each. Safe range: 2000–8000.',
                min: 500, max: 16000, step: 500, default: 4000,
                configPath: ['knowledgeBase', 'maxChunkSize'],
                tier: 'intermediate',
            },
            {
                key: 'minChunkLength',
                label: 'Min Chunk Length (chars)',
                description: 'Chunks shorter than this are skipped entirely. Prevents creating nodes from tiny fragments like headers, captions, or page numbers. Safe range: 30–200.',
                min: 10, max: 500, step: 10, default: 50,
                configPath: ['knowledgeBase', 'minChunkLength'],
                tier: 'intermediate',
            },
            {
                key: 'watcherPollInterval',
                label: 'Watcher Poll Interval (ms)',
                description: 'How often folder watchers check for file changes (milliseconds). Slide right → less frequent checks, lower I/O. Slide left → faster change detection but more disk reads. Safe range: 1000–5000.',
                min: 500, max: 10000, step: 500, default: 1000,
                configPath: ['knowledgeBase', 'watcherPollInterval'],
                tier: 'intermediate',
            },
            {
                key: 'skipLargeFiles',
                label: 'Skip Large Files (bytes)',
                description: 'Files larger than this (bytes) are skipped entirely. Slide right → processes larger files (may use lots of memory). Slide left → skips files sooner, safer for memory. 0 = no limit. Safe range: 10MB–100MB (10485760–104857600).',
                min: 0, max: 524288000, step: 1048576, default: 52428800,
                configPath: ['knowledgeBase', 'skipLargeFiles'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Strict', intent: 'Max 5 nodes per file, small chunks (2000), strict quality gate' },
            { label: 'Balanced', intent: 'Default settings: 12 nodes per file, 4000 char chunks, 50MB limit' },
            { label: 'Permissive', intent: 'Max 20 nodes per file, larger chunks (8000), higher throughput for bulk import' },
        ],
    },

    // -------------------------------------------------------------------------
    // Intake Defense (4 params)
    // -------------------------------------------------------------------------
    intake_defense: {
        id: 'intake_defense',
        tier: 'advanced',
        title: 'Intake Defense',
        description: 'Domain concentration monitoring to prevent fitness landscape manipulation',
        behavior: 'Monitors the ratio of recent proposals from each domain within a sliding time window. When a single domain exceeds the concentration threshold, a warning is logged. When it exceeds the throttle threshold, new proposals for that domain are rejected. This prevents adversarial flooding where legitimate-looking content gradually shifts the knowledge landscape. The minimum proposals threshold ensures the check only activates once the graph has enough recent activity to be meaningful.',
        parameters: [
            {
                key: 'windowHours',
                label: 'Window (hours)',
                description: 'Hours to look back when counting proposals per domain. Slide right → evaluates concentration over longer periods (more tolerant of bursts). Slide left → shorter window, reacts faster to sudden flooding. Safe range: 12–72.',
                min: 1, max: 168, step: 1, default: 24,
                configPath: ['intakeDefense', 'windowHours'],
                tier: 'advanced',
            },
            {
                key: 'concentrationThreshold',
                label: 'Warning Threshold',
                description: 'Warn when a single domain exceeds this fraction of recent proposals. Slide right → more tolerant, warns only at high concentration. Slide left → warns sooner, catches potential flooding earlier. Safe range: 0.3–0.6.',
                min: 0.1, max: 0.9, step: 0.05, default: 0.4,
                configPath: ['intakeDefense', 'concentrationThreshold'],
                tier: 'advanced',
            },
            {
                key: 'throttleThreshold',
                label: 'Throttle Threshold',
                description: 'Hard reject proposals when a single domain exceeds this fraction of recent proposals. Slide right → more tolerant, only blocks extreme concentration. Slide left → blocks sooner, stricter anti-flooding. Safe range: 0.5–0.8.',
                min: 0.2, max: 1.0, step: 0.05, default: 0.7,
                configPath: ['intakeDefense', 'throttleThreshold'],
                tier: 'advanced',
            },
            {
                key: 'minProposalsForCheck',
                label: 'Min Proposals',
                description: 'Minimum recent proposals before concentration checks activate. Slide right → needs more activity before monitoring kicks in (avoids false positives on small graphs). Slide left → monitoring activates with less activity. Safe range: 5–30.',
                min: 1, max: 100, step: 1, default: 10,
                configPath: ['intakeDefense', 'minProposalsForCheck'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Strict', intent: 'Lower thresholds: warn at 30%, throttle at 50%. Good for public-facing instances.' },
            { label: 'Permissive', intent: 'Higher thresholds: warn at 60%, throttle at 90%. Good for single-user instances.' },
            { label: 'Default', intent: 'Reset to default: warn at 40%, throttle at 70%.' },
        ],
    },

    // =========================================================================
    // 24. MAGIC NUMBERS — previously hardcoded values now exposed for tuning
    // =========================================================================
    magic_numbers: {
        id: 'magic_numbers',
        tier: 'advanced' as SectionTier,
        title: 'Magic Numbers',
        description: 'Internal thresholds and limits that were previously hardcoded. These control junk filtering, domain inference, salience rescue timing, question-answering behavior, and research seeding. Change with care — most defaults were chosen empirically.',
        behavior: `These parameters were originally buried as literal values in the synthesis engine, question-answering cycle, research cycle, and node operations code. They interact across subsystems: the junk filter limit controls how thoroughly new synthesis is vetted against known-bad content. Domain inference threshold determines how aggressively undeclared nodes get auto-classified. Salience rescue days prevent the "death spiral" where nodes in sparse partitions decay below sampling threshold permanently. Question cycle parameters control how the system finds context, answers questions, and deprioritizes failed questions. Research cycle parameters control domain targeting, context gathering, and seed quality filtering.`,
        parameters: [
            // --- General ---
            {
                key: 'junkFilterLimit',
                label: 'Junk Filter Limit',
                description: 'Maximum number of recently junked nodes to compare against when checking if new synthesis resembles known-bad content. Slide right → compares against more junk exemplars (better filtering, slightly slower). Slide left → compares against fewer (faster, but might miss similar junk). Safe range: 100–300.',
                min: 10, max: 200, step: 10, default: 50,
                configPath: ['magicNumbers', 'junkFilterLimit'],
                tier: 'advanced',
            },
            {
                key: 'domainInferenceThreshold',
                label: 'Domain Inference Threshold',
                description: 'Minimum embedding similarity required for automatic domain assignment when a node has no explicit domain. Slide right → requires stronger match before assigning a domain (more nodes left unassigned). Slide left → assigns domains with weaker evidence (more nodes get domains, but some may be misclassified). Safe range: 0.4–0.7.',
                min: 0.3, max: 0.9, step: 0.05, default: 0.55,
                configPath: ['magicNumbers', 'domainInferenceThreshold'],
                tier: 'advanced',
            },
            {
                key: 'salienceRescueDays',
                label: 'Salience Rescue Days',
                description: 'How many days a node must be stuck at near-zero salience before the rescue mechanism bumps it back up. Prevents nodes from permanently disappearing due to salience decay. Slide right → nodes must languish longer before rescue (stricter, keeps selection pressure). Slide left → rescues sooner (more forgiving, more diversity in selection). Safe range: 3–14.',
                min: 1, max: 30, step: 1, default: 7,
                configPath: ['magicNumbers', 'salienceRescueDays'],
                tier: 'advanced',
            },
            // --- Question Cycle ---
            {
                key: 'questionCandidatePoolSize',
                label: 'Question Candidate Pool',
                description: 'Number of top-weight nodes to fetch as candidate context when answering a research question. Slide right → draws from a larger pool of nodes (better chance of finding relevant context, uses more memory). Slide left → smaller pool (faster, but may miss useful context). Safe range: 30–100.',
                min: 10, max: 200, step: 10, default: 50,
                configPath: ['autonomousCycles', 'questions', 'candidatePoolSize'],
                tier: 'advanced',
            },
            {
                key: 'questionContextMinSimilarity',
                label: 'Question Context Min Similarity',
                description: 'Minimum embedding similarity for a candidate node to qualify as context for answering a question. Slide right → only highly relevant nodes are used as context (focused but sparse). Slide left → loosely related nodes are included (broader context, but more noise). Safe range: 0.2–0.5.',
                min: 0.1, max: 0.7, step: 0.05, default: 0.3,
                configPath: ['autonomousCycles', 'questions', 'contextMinSimilarity'],
                tier: 'advanced',
            },
            {
                key: 'questionContextTopN',
                label: 'Question Context Top-N',
                description: 'Maximum number of context nodes passed to the LLM when answering a research question. Slide right → more context nodes (richer answers, uses more tokens). Slide left → fewer context nodes (cheaper, more focused answers). Safe range: 3–10.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['autonomousCycles', 'questions', 'contextTopN'],
                tier: 'advanced',
            },
            {
                key: 'questionWeightPenalty',
                label: 'Question Weight Penalty',
                description: 'How much weight to subtract from a question node when it fails to get answered (no context found, LLM error, or empty answer). Slide right → harsher penalty per failure, questions sink faster. Slide left → gentler penalty, questions get more retry attempts before being deprioritized. Safe range: 0.1–0.3.',
                min: 0.01, max: 0.5, step: 0.01, default: 0.15,
                configPath: ['autonomousCycles', 'questions', 'weightPenalty'],
                tier: 'advanced',
            },
            {
                key: 'questionWeightFloor',
                label: 'Question Weight Floor',
                description: 'Minimum weight a question can be penalized down to — prevents questions from being effectively deleted by repeated failures. Slide right → questions retain more weight even after many failures. Slide left → questions can sink closer to zero (stronger selection pressure). Safe range: 0.05–0.2.',
                min: 0.01, max: 0.5, step: 0.01, default: 0.1,
                configPath: ['autonomousCycles', 'questions', 'weightFloor'],
                tier: 'advanced',
            },
            // --- Research Cycle ---
            {
                key: 'researchDomainSelectionLimit',
                label: 'Research Domain Limit',
                description: 'Maximum number of under-populated domains to consider for research seeding each cycle. The domain with fewest nodes is selected. Slide right → evaluates more domains (better targeting, slightly more DB work). Slide left → only considers the most obvious candidates. Safe range: 3–10.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['autonomousCycles', 'research', 'domainSelectionLimit'],
                tier: 'advanced',
            },
            {
                key: 'researchKnowledgeContextLimit',
                label: 'Research Knowledge Context',
                description: 'How many existing high-weight nodes from the target domain are included as context for the research LLM. Slide right → more existing knowledge provided (better-informed seeding, more tokens). Slide left → less context (cheaper, but LLM may generate redundant knowledge). Safe range: 10–30.',
                min: 5, max: 50, step: 5, default: 15,
                configPath: ['autonomousCycles', 'research', 'knowledgeContextLimit'],
                tier: 'advanced',
            },
            {
                key: 'researchOpenQuestionsLimit',
                label: 'Research Open Questions',
                description: 'How many open question nodes from the target domain to include in the research prompt. Slide right → more questions guide the LLM (more targeted seeds). Slide left → fewer questions (broader, less directed seeding). Safe range: 3–10.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['autonomousCycles', 'research', 'openQuestionsLimit'],
                tier: 'advanced',
            },
            {
                key: 'researchSeedMinLength',
                label: 'Seed Min Length (chars)',
                description: 'Minimum character length for a research seed to be accepted. Lines shorter than this from the LLM response are discarded as fragments. Slide right → requires longer, more substantive seeds. Slide left → accepts shorter seeds (more seeds survive, but some may be low-quality fragments). Safe range: 15–50.',
                min: 5, max: 100, step: 5, default: 20,
                configPath: ['autonomousCycles', 'research', 'seedMinLength'],
                tier: 'advanced',
            },
            {
                key: 'researchSeedMaxLength',
                label: 'Seed Max Length (chars)',
                description: 'Maximum character length for a research seed. Lines longer than this are discarded as rambling or multi-point outputs. Slide right → accepts longer seeds (allows detailed facts). Slide left → enforces brevity (forces atomic, single-idea seeds). Safe range: 200–800.',
                min: 100, max: 2000, step: 50, default: 500,
                configPath: ['autonomousCycles', 'research', 'seedMaxLength'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Conservative', intent: 'Tighter limits: smaller candidate pools, higher similarity thresholds, stricter seed length filtering. Fewer but higher-quality outputs.' },
            { label: 'Exploratory', intent: 'Larger pools, lower similarity floors, more context nodes. Generates more diverse outputs at the cost of some noise.' },
            { label: 'Default', intent: 'Reset all magic numbers to their empirically-chosen defaults.' },
        ],
    },
};
