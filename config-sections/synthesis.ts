/**
 * Tunable parameter metadata for the synthesis engine config section.
 *
 * Defines section IDs, tiers, titles, descriptions, behavioral explanations,
 * parameter ranges, and preset suggestions for all synthesis-related settings:
 * temperature_dynamics, weight_dynamics, resonance_specificity,
 * synthesis_timing, synthesis_quality_gates, voicing_constraints,
 * synthesis_validation, hallucination_detection, and dedup_settings.
 * Each section auto-renders in the GUI config page and is
 * addressable via `podbit.config(action: "tune", sectionId: "...")`.
 *
 * @module config-sections/synthesis
 */

import type { SectionMeta } from './types.js';

export const SYNTHESIS_SECTIONS: Record<string, SectionMeta> = {

    // -------------------------------------------------------------------------
    // 1. Salience Dynamics
    // -------------------------------------------------------------------------
    temperature_dynamics: {
        id: 'temperature_dynamics',
        tier: 'basic',
        title: 'Salience Dynamics',
        description: 'Controls how nodes compete for selection in synthesis cycles',
        behavior: `Salience determines a node's probability of being sampled in synthesis cycles. When a node participates in a matching event (its pair produces a child), its salience increases by the boost amount. Between cycles, all salience values decay multiplicatively. The ceiling prevents runaway amplification of frequently-selected nodes, while the floor effectively excludes low-salience nodes from the sampling pool. Higher boost + slower decay = nodes stay salient longer and get resampled more (exploitation). Lower boost + faster decay = more turnover in which nodes get sampled (exploration).`,
        parameters: [
            {
                key: 'salienceBoost',
                label: 'Salience Boost',
                description: 'Amount salience increases when a node participates in a successful synthesis match. At 0.10 (default) with 0.99 decay, a single match gives a node ~10 cycles of elevated sampling probability before it decays back to baseline. At 0.20, nodes stay hot twice as long — good for deep exploitation of productive pairs, but risks the same nodes monopolizing synthesis. At 0.05, nodes barely heat up per match, forcing the engine to rotate through the full pool (more exploration). The sweet spot depends on graph size: small graphs (<200 nodes) benefit from lower boost to avoid sampling the same pairs repeatedly.',
                min: 0.01, max: 0.5, step: 0.01, default: 0.1,
                configPath: ['engine', 'salienceBoost'],
                tier: 'basic',
            },
            {
                key: 'salienceDecay',
                label: 'Salience Decay',
                description: 'Multiplicative decay applied to all salience values each cycle. At 0.99 (default) with 30s cycles, a node that stops matching loses half its salience in ~35 minutes (69 cycles). At 0.999, half-life is ~5.7 hours — nodes stay hot almost all day. At 0.98, half-life is ~17 minutes — aggressive turnover, constantly rotating which nodes get sampled. If your graph feels "stuck" pairing the same nodes, lower this. If interesting threads die too quickly before being explored, raise it.',
                min: 0.9, max: 0.999, step: 0.001, default: 0.99,
                configPath: ['engine', 'salienceDecay'],
                tier: 'basic',
            },
            {
                key: 'salienceCeiling',
                label: 'Salience Ceiling',
                description: 'Maximum salience any node can reach. At 1.0 (default), the most active node has at most 10x the sampling probability of a node at the 0.1 floor. At 2.0, the gap widens to 20x — a single hot node can dominate selection. At 0.8, the ceiling is close to the default salience (1.0), compressing the range and making sampling more uniform. Lower this if a few "hub" nodes are monopolizing all synthesis pairings.',
                min: 0.5, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['engine', 'salienceCeiling'],
                tier: 'intermediate',
            },
            {
                key: 'salienceFloor',
                label: 'Salience Floor',
                description: 'Nodes below this salience are excluded from synthesis sampling entirely. At 0.01 (default), a node at default salience (1.0) would need to decay for ~460 cycles (~3.8 hours at 30s cycles) before falling below the floor. Raising to 0.05 shrinks the active pool to only recently-matched nodes — forces concentration on hot leads. Lowering to 0.005 lets even very cold nodes occasionally appear in sampling, increasing diversity but potentially pairing stale content.',
                min: 0.001, max: 0.1, step: 0.001, default: 0.01,
                configPath: ['engine', 'salienceFloor'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'More Exploration', intent: 'Increase exploration by making nodes gain less salience and decay faster, so more different nodes get sampled over time' },
            { label: 'More Exploitation', intent: 'Increase exploitation by making active nodes stay salient longer so promising connections get explored deeply' },
            { label: 'Balanced', intent: 'Reset to balanced defaults for salience dynamics' },
        ],
    },

    // -------------------------------------------------------------------------
    // 2. Weight Dynamics
    // -------------------------------------------------------------------------
    weight_dynamics: {
        id: 'weight_dynamics',
        tier: 'basic',
        title: 'Weight Dynamics',
        description: 'Controls how nodes accumulate importance over time',
        behavior: `Weight represents accumulated importance and persists much longer than salience. When a synthesis cycle produces a child classified as "knowledge" trajectory, the parent nodes receive a weight boost (parentBoost), capped at the weightCeiling. The knowledgeWeight and abstractionWeight set the initial weight for new child nodes based on their trajectory. High knowledgeWeight + high parentBoost = system strongly rewards concrete, specific discoveries. High abstractionWeight = system gives more credit to philosophical/general connections. Weight decay applies every N cycles (see Synthesis Timing), preventing permanent dominance by old nodes. The weightCeiling prevents runaway feedback loops where highly productive nodes accumulate unbounded weight.`,
        parameters: [
            {
                key: 'knowledgeWeight',
                label: 'Knowledge Weight',
                description: 'Initial weight assigned to new synthesis classified as "knowledge" trajectory (concrete, specific content). At 1.0 (default), knowledge nodes start at the same weight as seeds. The 10:1 ratio over abstractionWeight (0.1 default) strongly favors concrete discoveries — knowledge nodes are immediately competitive in sampling while abstractions must earn their place through parent boosts. Raising to 1.5 makes knowledge nodes dominant from birth; lowering to 0.5 forces even concrete content to prove itself.',
                min: 0.5, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['engine', 'knowledgeWeight'],
                tier: 'intermediate',
            },
            {
                key: 'abstractionWeight',
                label: 'Abstraction Weight',
                description: 'Initial weight for synthesis classified as "abstraction" trajectory (philosophical, general connections). At 0.1 (default), abstractions start at 1/10th the weight of knowledge nodes — they must earn their place by producing successful children (parent boosts) to gain weight. This prevents vague "both exhibit X" generalizations from competing with concrete discoveries. Raising to 0.3 gives abstract thinking more room to grow; raising above 0.5 risks the graph filling with hand-wavy generalizations that crowd out specific content.',
                min: 0.01, max: 0.5, step: 0.01, default: 0.1,
                configPath: ['engine', 'abstractionWeight'],
                tier: 'advanced',
            },
            {
                key: 'parentBoost',
                label: 'Parent Boost',
                description: 'Weight bonus given to parent nodes when their child is classified as knowledge trajectory. At 0.1 (default), a node that produces 5 knowledge children reaches weight 1.5 (from default 1.0). This creates positive feedback — productive parents get sampled more, producing more children. At 0.2, the same 5 children push weight to 2.0, creating stronger feedback loops. At 0.05, the loop is weaker — weight ceiling (default 3.0) takes ~20 successful children to reach. Only knowledge-trajectory children trigger this boost; abstraction children do not.',
                min: 0.01, max: 0.5, step: 0.01, default: 0.1,
                configPath: ['engine', 'parentBoost'],
                tier: 'basic',
            },
            {
                key: 'weightCeiling',
                label: 'Weight Ceiling',
                description: 'Maximum weight any node can reach. At 3.0 (default), the most productive node is 3x heavier than a default-weight node — significant but not overwhelming. At 5.0, a heavy node gets 5x the sampling probability advantage. At 2.0, the gap is smaller, preventing any node from dominating. This interacts with parentBoost: at parentBoost 0.1 and ceiling 3.0, a node needs ~20 successful knowledge children to hit the cap. Lower the ceiling if your graph has a few "hub" nodes attracting all synthesis pairings.',
                min: 1.0, max: 10.0, step: 0.5, default: 3.0,
                configPath: ['engine', 'weightCeiling'],
                tier: 'intermediate',
            },
            {
                key: 'weightDecay',
                label: 'Weight Decay',
                description: 'Per-decay-pass multiplier for node weight. At 0.999 (default) with decay every 10 cycles at 30s per cycle (one pass every 5 minutes), weight half-life is ~2.4 days — a node at weight 3.0 takes about 5 days to decay to 1.0 without any new children. At 0.9999, half-life is ~24 days (near-permanent). At 0.995, half-life is ~11.5 hours — aggressive turnover that forces continuous productivity. If old seed nodes are blocking newer content, lower this. If your graph forgets productive nodes too quickly, raise it.',
                min: 0.99, max: 0.9999, step: 0.0001, default: 0.999,
                configPath: ['engine', 'weightDecay'],
                tier: 'advanced',
            },
            {
                key: 'weightFloor',
                label: 'Weight Floor',
                description: 'Global minimum weight any node can have. All weight modifications (decay, feedback, population control, lab verification, question degradation) clamp to this floor. At 0.05 (default), nodes can sink very low but never reach zero - they retain a small chance of being rediscovered. At 0.1, nodes retain more presence even after heavy penalties. At 0.01, near-zero weights are allowed - effectively removing penalized nodes from sampling without archiving them. This is the single weight floor used across all subsystems.',
                min: 0.01, max: 0.5, step: 0.01, default: 0.05,
                configPath: ['engine', 'weightFloor'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Favor Concrete', intent: 'Strongly reward knowledge-trajectory content by increasing knowledge weight and parent boost while reducing abstraction weight' },
            { label: 'Favor Abstract', intent: 'Allow more abstract and philosophical thinking by increasing abstraction weight relative to knowledge weight' },
            { label: 'Balanced', intent: 'Balance knowledge and abstraction weights for general-purpose discovery' },
        ],
    },

    // -------------------------------------------------------------------------
    // 3. Similarity & Specificity
    // -------------------------------------------------------------------------
    resonance_specificity: {
        id: 'resonance_specificity',
        tier: 'basic',
        title: 'Similarity & Specificity',
        description: 'Controls child creation thresholds and trajectory classification',
        behavior: `The similarity threshold is the minimum embedding cosine similarity between two sampled nodes for the synthesis engine to attempt synthesis. Higher threshold = only very similar nodes connect (fewer but potentially more meaningful connections). Lower threshold = more distant nodes can combine (more creative but potentially lower quality). The specificityRatio determines trajectory classification: a child's specificity score must be >= (average parent specificity * ratio) to be classified as "knowledge." The minSpecificity sets a hard floor — voiced content below this score triggers regeneration.`,
        parameters: [
            {
                key: 'threshold',
                label: 'Similarity Threshold',
                description: 'Minimum embedding cosine similarity between two nodes before the engine attempts synthesis. Embedding similarity typically ranges from 0.20 (unrelated topics) to 0.95 (near-identical). At 0.50 (default), nodes need moderate topical overlap — this produces a mix of within-domain deepening and cross-domain bridging. At 0.60, only closely related nodes pair — deeper but narrower insights, lower rejection rates. At 0.35, distant nodes can combine — more creative leaps but the LLM often produces forced analogies that fail quality gates. Works with similarityCeiling to define the productive band: [threshold, ceiling].',
                min: 0.1, max: 0.9, step: 0.05, default: 0.5,
                configPath: ['engine', 'threshold'],
                tier: 'basic',
            },
            {
                key: 'specificityRatio',
                label: 'Specificity Ratio',
                description: 'Child specificity must be >= (parent avg specificity × this ratio) to be classified as "knowledge" trajectory and receive knowledgeWeight instead of abstractionWeight. At 0.9 (default), the child must be at least 90% as specific as its parents — easy to achieve for concrete synthesis, hard for vague generalizations. At 1.0, the child must be as specific or more specific than its parents. At 0.7, almost everything qualifies as knowledge, reducing the abstraction category to only the most generic content. This directly controls the knowledge-vs-abstraction balance in your graph.',
                min: 0.5, max: 1.0, step: 0.05, default: 0.9,
                configPath: ['engine', 'specificityRatio'],
                tier: 'intermediate',
            },
            {
                key: 'minSpecificity',
                label: 'Min Specificity',
                description: 'Minimum per-word specificity density for voiced content — below this, the output is rejected. Also serves as the post-voicing quality floor in the Synthesis Quality Gates section. Specificity is a weighted count of concrete markers (numbers, technical terms, named entities, units) divided by word count. At 0.05 (default), content needs at least a few concrete markers per paragraph. At 0.15, content needs roughly one specific term every 6-7 words — only highly technical output passes. At 0.30, extremely strict — only dense technical writing survives.',
                min: 0, max: 0.5, step: 0.01, default: 0.05,
                configPath: ['engine', 'minSpecificity'],
                tier: 'basic',
            },
        ],
        presets: [
            { label: 'Stricter Connections', intent: 'Increase the similarity threshold and specificity requirements so only high-quality, closely related connections are made' },
            { label: 'More Connections', intent: 'Lower the similarity threshold to allow more distant and creative connections between nodes' },
            { label: 'Default', intent: 'Reset similarity and specificity parameters to their defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // 4. Synthesis Engine Timing
    // -------------------------------------------------------------------------
    synthesis_timing: {
        id: 'synthesis_timing',
        tier: 'basic',
        title: 'Synthesis Engine Timing',
        description: 'Controls the pace of autonomous exploration',
        behavior: `The synthesis engine runs in a loop, attempting one synthesis per cycle. cycleDelayMs is the pause between cycles — lower values mean faster exploration but more LLM calls and higher cost. decayEveryNCycles controls how often salience and weight decay is applied. Faster cycles = more discoveries per hour but higher compute cost.`,
        parameters: [
            {
                key: 'cycleDelayMs',
                label: 'Cycle Delay (ms)',
                description: 'Milliseconds between synthesis cycles. Slide right → slower pace, fewer LLM calls, lower cost. Slide left → faster exploration, more discoveries per hour but higher compute cost. Hot-reloads — changes take effect immediately. Safe range: 10000–60000.',
                min: 100, max: 300000, step: 1000, default: 30000,
                configPath: ['engine', 'cycleDelayMs'],
                tier: 'basic',
            },
            {
                key: 'decayEveryNCycles',
                label: 'Decay Every N Cycles',
                description: 'Apply salience/weight decay every N cycles instead of every cycle. Slide right → decay happens less often, nodes retain their salience/weight longer. Slide left → decay happens more frequently, faster turnover of which nodes are active. Safe range: 5–20.',
                min: 1, max: 100, step: 1, default: 10,
                configPath: ['engine', 'decayEveryNCycles'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Faster Discovery', intent: 'Speed up the synthesis engine with shorter cycle delays for rapid exploration' },
            { label: 'Slower / Cheaper', intent: 'Slow down the synthesis engine to reduce LLM calls and compute cost' },
            { label: 'Default', intent: 'Reset synthesis engine timing to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // 5. Synthesis Quality Gates
    // -------------------------------------------------------------------------
    synthesis_quality_gates: {
        id: 'synthesis_quality_gates',
        tier: 'basic',
        title: 'Synthesis Quality Gates',
        description: 'Filters that prevent low-quality synthesis engine output',
        behavior: `After the synthesis engine voices a synthesis, it must pass quality gates before becoming a node. The junk filter compares the voiced content against previously junked nodes — if similarity exceeds the threshold, the output is rejected. The minimum specificity floor is controlled by the Min Specificity parameter in the Similarity & Specificity section. Higher junk threshold = more permissive.`,
        parameters: [
            {
                key: 'synthesisJunkThreshold',
                label: 'Junk Filter Threshold',
                description: 'Cosine similarity threshold for the junk filter — if synthesis output is this similar to a previously junked node, it is rejected. At 0.80 (default), content must be very close to known junk to be blocked — paraphrases of junk pass, only near-clones are caught. At 0.90, only almost-identical junk is blocked (very permissive). At 0.70, even content that is topically similar to junk gets blocked — this risks false positives where legitimate content about the same topic as previously junked content gets rejected. WARNING: setting below 0.75 can cause "junk filter self-poisoning" where one bad junked node blocks an entire topic area permanently.',
                min: 0.5, max: 0.95, step: 0.05, default: 0.80,
                configPath: ['engine', 'junkThreshold'],
                tier: 'basic',
            },
        ],
        presets: [
            { label: 'Strict Quality', intent: 'Enforce strict quality gates by lowering the junk threshold and increasing minimum specificity' },
            { label: 'Permissive', intent: 'Relax quality gates to allow more synthesis output through' },
            { label: 'Default', intent: 'Reset synthesis quality gate parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // 6. Voicing Constraints
    // -------------------------------------------------------------------------
    voicing_constraints: {
        id: 'voicing_constraints',
        tier: 'basic',
        title: 'Voicing Constraints',
        description: 'Controls word limits, novelty, and compression for synthesis',
        behavior: `When the synthesis engine voices a connection between two nodes, the output is constrained by these parameters. maxInsightWords sets the target word limit in the LLM instruction. maxOutputWords is the hard truncation trigger. minNovelWords is the minimum number of new words (not from either parent) required — outputs below this are rejected as "too derivative." The telegraphic and entropy toggles control compression: telegraphic removes filler words using rules, entropy mode uses NLP to intelligently preserve high-information tokens (names, numbers, technical terms). Both reduce token usage to fit more content into small context windows.`,
        parameters: [
            {
                key: 'maxInsightWords',
                label: 'Max Insight Words',
                description: 'Target word limit included in the LLM prompt instruction. At 25 (default), the LLM is asked for "one insight in 25 words or fewer" — producing dense, pithy synthesis. At 15, output is extremely compressed (a single sentence). At 40, output can develop an idea across 2-3 sentences with more nuance. The LLM often exceeds this target slightly — maxOutputWords is the hard truncation trigger. This also controls the context window efficiency: shorter synthesis = more nodes fit in future LLM contexts.',
                min: 10, max: 100, step: 5, default: 25,
                configPath: ['voicing', 'maxInsightWords'],
                tier: 'basic',
            },
            {
                key: 'maxOutputWords',
                label: 'Max Output Words',
                description: 'Hard word limit — outputs longer than this are truncated to the last complete sentence. At 35 (default) with maxInsightWords=25, there is 10 words of breathing room for the LLM to slightly overshoot. Setting this too close to maxInsightWords causes most synthesis to be truncated mid-sentence. Setting much higher (60+) allows verbose output through. IMPORTANT: must be less than hallucination maxVerboseWords (default 45) or the verbosity red flag triggers before truncation does.',
                min: 15, max: 150, step: 5, default: 35,
                configPath: ['voicing', 'maxOutputWords'],
                tier: 'basic',
            },
            {
                key: 'minNovelWords',
                label: 'Min Novel Words',
                description: 'Minimum new words (not in either parent) the synthesis must contain. At 3 (default) with ~25-word output, the synthesis needs ~12% novel vocabulary — low bar that catches only pure copy-paste rearrangements. At 5, the synthesis needs ~20% new words, catching more derivative output but potentially rejecting synthesis that makes a valid new connection using parent vocabulary. At 1, almost anything passes. This is a crude pre-filter for derivative content; the consultant pipeline handles deeper quality assessment.',
                min: 1, max: 10, step: 1, default: 3,
                configPath: ['voicing', 'minNovelWords'],
                tier: 'intermediate',
            },
            {
                key: 'rejectNoSentenceEnding',
                label: 'Reject Incomplete Sentences',
                description: 'Reject synthesis output that doesn\'t end with sentence-ending punctuation (. ! ?). This catches outputs truncated mid-sentence due to token limits. Slide right (1) → strict, rejects truncated output. Slide left (0) → permissive, allows truncated output and trims to last complete sentence.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['voicing', 'rejectNoSentenceEnding'],
                tier: 'intermediate',
            },
            {
                key: 'rejectUnclosedParens',
                label: 'Reject Unclosed Parentheses',
                description: 'Reject synthesis output that has unclosed parentheses (truncated mid-parenthetical). Slide right (1) → strict. Slide left (0) → permissive.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['voicing', 'rejectUnclosedParens'],
                tier: 'intermediate',
            },
            {
                key: 'telegraphicEnabled',
                label: 'Telegraphic Compression',
                description: 'Strip filler words and use symbols (→, &, w/) before sending node content to the LLM. Reduces token usage so more content fits in the context window. 1 = on, 0 = off.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['voicing', 'telegraphicEnabled'],
                tier: 'basic',
            },
            {
                key: 'telegraphicAggressiveness',
                label: 'Telegraphic Aggressiveness',
                description: 'Compression level when telegraphic is enabled. 1 = light (removes "the", "a", "an" only). 2 = medium (also removes modals, pronouns). 3 = aggressive (also removes prepositions). Slide right → more tokens saved but less readable. Slide left → more natural text, fewer savings.',
                min: 1, max: 3, step: 1, default: 2,
                configPath: ['voicing', 'telegraphicAggressiveness'],
                tier: 'intermediate',
            },
            {
                key: 'entropyEnabled',
                label: 'Entropy-Aware Mode',
                description: 'Use NLP to detect high-information tokens (names, numbers, acronyms, technical terms) and protect them from telegraphic compression. Requires telegraphic to be enabled. 1 = on, 0 = off.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['voicing', 'entropyEnabled'],
                tier: 'intermediate',
            },
        ],
        presets: [
            { label: 'Concise Output', intent: 'Make synthesis output very concise by lowering word limits to produce tight, pithy insights' },
            { label: 'Detailed Output', intent: 'Allow longer synthesis output with higher word limits for more detailed connections' },
            { label: 'Strict Novelty', intent: 'Increase novelty requirements to reject derivative output and only keep genuinely new insights' },
            { label: 'Entropy Mode', intent: 'Enable entropy-aware compression for smarter token preservation based on information density' },
        ],
    },

    // -------------------------------------------------------------------------
    // 7. Synthesis Engine Validation
    // -------------------------------------------------------------------------
    synthesis_validation: {
        id: 'synthesis_validation',
        tier: 'intermediate',
        title: 'Synthesis Engine Validation',
        description: 'Structural validation checks for synthesis cycle node pairs',
        behavior: `Before the synthesis engine voices a synthesis, it validates the paired nodes. subsetOverlapThreshold rejects pairs where one node's words are mostly a subset of the other (tautology detection). similarityCeiling rejects pairs with extremely high embedding similarity (near-duplicates that won't produce novel output). The valid similarity band is [engine.threshold, similarityCeiling]. Other validation parameters (vocabulary minimums, specificity floors, candidate limits) are hardcoded with sensible defaults.`,
        parameters: [
            {
                key: 'subsetOverlapThreshold',
                label: 'Subset Overlap Threshold',
                description: 'Maximum word overlap ratio between two nodes before they are rejected as near-tautologies. At 0.80 (default), if 80% of one node\'s words appear in the other, the pair is rejected — these would only produce restatements. At 0.70, even nodes sharing 70% vocabulary are rejected, forcing more diverse pairings but potentially missing legitimate deepening within a topic. At 0.90, only near-identical word sets are caught. This is a cheap pre-filter (no LLM call) that prevents wasting voicing calls on pairs that would produce derivative output.',
                min: 0.5, max: 1.0, step: 0.05, default: 0.8,
                configPath: ['synthesisEngine', 'subsetOverlapThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'similarityCeiling',
                label: 'Similarity Ceiling',
                description: 'Maximum embedding similarity between paired nodes — pairs above this are rejected as too similar to produce novel output. At 0.83 (default), nodes sharing >83% semantic similarity are blocked from pairing, which prevents echo-chamber synthesis where near-identical nodes produce restatements. The productive synthesis band is [threshold, ceiling] — at defaults [0.50, 0.83], moderate relatedness is allowed while high-overlap pairs are excluded. Raising toward 0.90+ risks paraphrase loops where the engine recombines similar material into repetitive output. Lowering below 0.78 may over-restrict pairing and reduce birth rate.',
                min: 0.70, max: 0.99, step: 0.01, default: 0.83,
                configPath: ['synthesisEngine', 'similarityCeiling'],
                tier: 'basic',
            },
            {
                key: 'minCombinedSpecificity',
                label: 'Min Avg Specificity',
                description: 'Minimum average per-word specificity for a synthesis pair — if the mean of both nodes\' specificity scores falls below this, the pair is rejected as too generic. Specificity is a per-word density of concrete markers (numbers, technical terms, named entities, units). At 0.05 (default), pairs where both nodes are vague platitudes are rejected, but any node with a few concrete terms passes. At 0.20, both nodes need moderate technical density — good for preventing watery synthesis but may over-filter in conceptual domains. At 0.40, only pairs with strong technical content pass — appropriate for data-heavy domains but will starve synthesis in theoretical/conceptual areas. The graph average specificity is typically 0.3–0.5, so thresholds above 0.5 will block most pairs.',
                min: 0, max: 1.0, step: 0.01, default: 0.05,
                configPath: ['synthesisEngine', 'minCombinedSpecificity'],
                tier: 'basic',
            },
        ],
        presets: [
            { label: 'Strict Pairs', intent: 'Tighten validation to only allow high-quality, diverse pairs' },
            { label: 'Permissive Pairs', intent: 'Relax validation to allow more creative and distant pairings' },
            { label: 'Default', intent: 'Reset synthesis validation parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // 8. Hallucination Detection
    // -------------------------------------------------------------------------
    hallucination_detection: {
        id: 'hallucination_detection',
        tier: 'intermediate',
        title: 'Hallucination Detection',
        description: 'Heuristics that catch fabricated content in voiced synthesis',
        behavior: `After synthesis, the output is checked against multiple heuristics. Each failed check is a "red flag." If the number of red flags meets minRedFlags, the output is rejected. Key checks: excessive novel vocabulary (novelRatioThreshold), suspicious verbosity (maxVerboseWords), fabricated numbers, future year predictions. IMPORTANT: maxVerboseWords must be well above voicing.maxInsightWords to avoid constraint conflicts where the model can't satisfy both limits.`,
        parameters: [
            {
                key: 'minRedFlags',
                label: 'Min Red Flags',
                description: 'Number of red flags required before output is rejected as hallucinated. Red flags include: excessive novel vocabulary, suspicious verbosity, fabricated numbers, future year predictions. At 2 (default), output needs two independent suspicious signals to be rejected — this filters genuine hallucinations while tolerating synthesis that legitimately introduces new vocabulary. At 1, a single flag (e.g., just having many novel words) triggers rejection — very strict, catches more but also rejects creative-but-legitimate synthesis. At 3, only heavily suspicious output is caught.',
                min: 1, max: 5, step: 1, default: 2,
                configPath: ['hallucination', 'minRedFlags'],
                tier: 'intermediate',
            },
            {
                key: 'novelRatioThreshold',
                label: 'Novel Ratio Threshold',
                description: 'Flags a red flag if more than this fraction of output words are entirely new (not from either parent). At 0.75 (default), output where >75% of words are novel (not from parents) gets flagged. Typical good synthesis reuses 40-60% of parent vocabulary (novel ratio 0.40-0.60). Pure hallucination tends to score 0.85+ (almost entirely invented). At 0.60, even moderately creative synthesis triggers the flag — too strict for frontier models that synthesize creatively. At 0.85, only extreme hallucination is caught. Words in the synthesisVocabulary exempt list (e.g., "therefore", "suggests") are excluded from the novel count.',
                min: 0.5, max: 1.0, step: 0.05, default: 0.75,
                configPath: ['hallucination', 'novelRatioThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'maxVerboseWords',
                label: 'Max Verbose Words',
                description: 'Word count that triggers a "suspiciously verbose" red flag. At 45 (default) with maxInsightWords=25, output must be ~80% over the target to trigger this flag. Hallucinating models often produce long, rambling output filled with chain-of-thought leakage. CRITICAL: must be well above maxOutputWords (default 35) or every synthesis will trigger this flag alongside the truncation. At 80, only extremely verbose output is caught. At 35, anything slightly over the target is flagged — too aggressive unless you also lower minRedFlags.',
                min: 20, max: 200, step: 10, default: 45,
                configPath: ['hallucination', 'maxVerboseWords'],
                tier: 'intermediate',
            },
            {
                key: 'novelWordMinLength',
                label: 'Novel Word Min Length',
                description: 'Minimum character length for a word to count in the novel ratio check. Slide right → only long words count as "novel," short common words are ignored. Slide left → shorter words also count, making the novel ratio check more sensitive to any new vocabulary. Safe range: 3–5.',
                min: 2, max: 8, step: 1, default: 4,
                configPath: ['hallucination', 'novelWordMinLength'],
                tier: 'advanced',
            },
            {
                key: 'fabricatedNumberCheck',
                label: 'Fabricated Number Check',
                description: 'Flag numbers in synthesis output that do not appear in parent nodes. Useful for catching weak models that invent precise statistics. Disable for frontier models that can legitimately derive numbers through reasoning (e.g., 0.25 from 1/4, ratios, percentages).',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['hallucination', 'fabricatedNumberCheck'],
                tier: 'intermediate',
            },
            {
                key: 'largeNumberThreshold',
                label: 'Large Number Threshold',
                description: 'When fabricated number check is on, numbers larger than this are flagged if they do not appear in parent nodes. Slide right → allows larger numbers without flagging. Slide left → flags smaller numbers as suspicious. Safe range: 50–500.',
                min: 10, max: 10000, step: 10, default: 100,
                configPath: ['hallucination', 'largeNumberThreshold'],
                tier: 'advanced',
            },
            {
                key: 'crossDomainNumberCheck',
                label: 'Cross-Domain Number Check',
                description: 'When enabled, rejects synthesis that transplants specific numbers from one source domain into a cross-domain claim. Prevents a number like "1-5%" from biology being universalized as a constant across engineering, ecology, etc.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['hallucination', 'crossDomainNumberCheck'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Strict Detection', intent: 'Make hallucination detection stricter by lowering thresholds to catch more fabricated content' },
            { label: 'Permissive Detection', intent: 'Relax hallucination detection to allow more creative synthesis through' },
            { label: 'Default', intent: 'Reset hallucination detection parameters to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // 9. Dedup Settings
    // -------------------------------------------------------------------------
    dedup_settings: {
        id: 'dedup_settings',
        tier: 'intermediate',
        title: 'Dedup Settings',
        description: 'Controls duplicate detection during synthesis',
        behavior: `Before a synthesis becomes a node, it's checked against existing nodes for duplication. Embedding cosine similarity is the primary signal; word overlap ratio is secondary. When an LLM judge is enabled and assigned, borderline cases in the "doubt zone" (between doubt floor and hard ceiling) are sent to the dedup_judge subsystem for a novelty check. Lower thresholds = more aggressive dedup. Higher thresholds = more permissive. Per-source overrides can be configured via the gate overrides table.`,
        parameters: [
            {
                key: 'embeddingSimilarityThreshold',
                label: 'Embedding Similarity Threshold',
                description: 'Cosine similarity threshold above which new synthesis is flagged as duplicate of an existing node. At 0.85 (default), two nodes must share >85% semantic similarity to be flagged — this catches paraphrases and near-restatements while letting topically related but distinct nodes through. Typical score distribution: same-topic-different-angle pairs score 0.75-0.85, genuine paraphrases score 0.88-0.95, unrelated content scores below 0.60. Works in tandem with similarityCeiling — the ceiling prevents echo pairs from being synthesized, while this threshold catches echoes that slip through post-birth. At 0.80, aggressively flags "similar but different" content — may starve the graph. At 0.92, only near-identical content is caught — graph may accumulate redundant nodes.',
                min: 0.7, max: 0.99, step: 0.01, default: 0.85,
                configPath: ['dedup', 'embeddingSimilarityThreshold'],
                tier: 'basic',
            },
            {
                key: 'wordOverlapThreshold',
                label: 'Word Overlap Threshold',
                description: 'Secondary dedup check: fraction of words two nodes share. Both embedding AND word overlap must exceed their respective thresholds to flag a duplicate. At 0.78 (default), 78% of words must overlap — catches copy-paste and light paraphrases but not content that uses similar vocabulary to make different points. At 0.70, even moderate word sharing triggers a flag (when combined with high embedding similarity). At 0.85, only near-identical wording is caught. This is cheaper than embedding comparison and catches cases where semantics differ but wording is recycled.',
                min: 0.5, max: 0.99, step: 0.01, default: 0.78,
                configPath: ['dedup', 'wordOverlapThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'llmJudgeEnabled',
                label: 'LLM Judge Enabled',
                description: 'When enabled and a model is assigned to the dedup_judge subsystem, borderline duplicates (in the doubt zone between floor and ceiling) are sent to an LLM to judge whether the new content adds genuine novelty. 1 = on, 0 = off.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['dedup', 'llmJudgeEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'llmJudgeDoubtFloor',
                label: 'LLM Judge Doubt Floor',
                description: 'Lower boundary of the LLM judge doubt zone. Content with similarity between this and the hard ceiling gets sent to the LLM judge for a novelty verdict. Below this floor = always passes (clearly distinct). At 0.88 (default) with ceiling 0.96, the doubt zone is [0.88, 0.96] — borderline content in this range gets an LLM judgment. At 0.85, the zone widens to [0.85, 0.96], catching more edge cases but costing more LLM calls. At 0.92, the zone shrinks to [0.92, 0.96], letting more borderline content through unchecked.',
                min: 0.7, max: 0.99, step: 0.01, default: 0.88,
                configPath: ['dedup', 'llmJudgeDoubtFloor'],
                tier: 'advanced',
            },
            {
                key: 'llmJudgeHardCeiling',
                label: 'LLM Judge Hard Ceiling',
                description: 'Upper boundary of the doubt zone — content above this similarity is auto-rejected as duplicate without consulting the LLM (too similar to bother checking). At 0.96 (default), only content with >96% similarity is auto-rejected — at this level, nodes are near-identical and no LLM judge can justify keeping both. At 0.93, more content is auto-rejected without review, saving LLM calls but potentially discarding legitimate "similar but adds something" content. At 0.98, only verbatim copies are auto-rejected.',
                min: 0.8, max: 0.99, step: 0.01, default: 0.96,
                configPath: ['dedup', 'llmJudgeHardCeiling'],
                tier: 'advanced',
            },
            {
                key: 'attractorThreshold',
                label: 'Attractor Threshold',
                description: 'After a node matches as the "duplicate target" this many times, it is excluded from future dedup checks. This prevents generic "gravity well" nodes from blocking all new synthesis in a domain — e.g., a broad summary node that matches everything about its topic. At 30 (default), a node can block 30 new syntheses before being excluded. At 15, gravity wells are detected sooner — better for small domains where 15 blocks is already a significant fraction of attempts. At 50, more patient. Set to 0 to disable (gravity wells block indefinitely).',
                min: 0, max: 200, step: 5, default: 30,
                configPath: ['dedup', 'attractorThreshold'],
                tier: 'advanced',
            },
            {
                key: 'attractorWeightDecay',
                label: 'Attractor Weight Decay',
                description: 'Weight penalty subtracted each time a node is the dedup match target. Generic nodes that match everything gradually lose weight, eventually falling out of the top-N candidate set for dedup comparison. At 0.01 (default), a node that matches 30 times loses 0.30 weight — enough to noticeably reduce its influence. At 0.02, 15 matches costs 0.30 weight. At 0.005, the decay is very gentle. This works alongside the attractor threshold — both mechanisms combat gravity wells, but weight decay is gradual while the threshold is a hard cutoff.',
                min: 0, max: 0.1, step: 0.005, default: 0.01,
                configPath: ['dedup', 'attractorWeightDecay'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Aggressive Dedup', intent: 'Lower both thresholds to aggressively remove near-duplicate content' },
            { label: 'Permissive Dedup', intent: 'Raise thresholds to allow more similar-but-distinct content' },
            { label: 'LLM Judge Mode', intent: 'Set doubt floor to 0.85 and hard ceiling to 0.96 for maximum LLM judge coverage' },
            { label: 'Default', intent: 'Reset dedup thresholds to defaults' },
        ],
    },

    // -------------------------------------------------------------------------
    // 10. Telegraphic Word Lists (6 list params)
    // -------------------------------------------------------------------------
    telegraphic_word_lists: {
        id: 'telegraphic_word_lists',
        tier: 'intermediate',
        title: 'Telegraphic Word Lists',
        description: 'Controls which words get removed or replaced during telegraphic compression',
        behavior: `Phrase mappings are applied first (multi-word → symbol), then single-word mappings, then removal lists by aggressiveness level. Preserved words are never removed regardless of aggressiveness setting. The three removal tiers (always, medium, aggressive) correspond to the telegraphicAggressiveness levels 1/2/3 in voicing constraints.`,
        parameters: [
            {
                key: 'phrases',
                label: 'Phrase Mappings',
                description: 'Multi-word phrases mapped to shorter symbols (e.g., "such as" → "eg", "in order to" → "to"). Applied first before single-word processing.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['telegraphic', 'phrases'],
                controlType: 'phraseMap' as any,
                listDescription: 'Multi-word phrases to replace with shorter symbols during telegraphic compression',
                presetSuggestions: ['Academic phrases', 'Filler phrases'],
                tier: 'intermediate',
            },
            {
                key: 'words',
                label: 'Word Substitutions',
                description: 'Single words mapped to shorter symbols (e.g., "and" → "&", "with" → "w/", "through" → "→"). Applied after phrase mappings.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['telegraphic', 'words'],
                controlType: 'wordMap' as any,
                listDescription: 'Single words to replace with shorter symbols during telegraphic compression',
                presetSuggestions: ['Common conjunctions', 'Preposition symbols'],
                tier: 'intermediate',
            },
            {
                key: 'removeAlways',
                label: 'Remove Always (Level 1+)',
                description: 'Words removed at all aggressiveness levels. Typically articles and the most dispensable function words.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['telegraphic', 'removeAlways'],
                controlType: 'wordList' as any,
                listDescription: 'Words to always remove during telegraphic compression (lightest level)',
                presetSuggestions: ['Articles', 'Filler words'],
                tier: 'intermediate',
            },
            {
                key: 'removeMedium',
                label: 'Remove Medium (Level 2+)',
                description: 'Words removed at medium and aggressive levels. Typically modals, pronouns, and common adverbs.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['telegraphic', 'removeMedium'],
                controlType: 'wordList' as any,
                listDescription: 'Words to remove at medium compression aggressiveness',
                presetSuggestions: ['Modals', 'Common pronouns'],
                tier: 'intermediate',
            },
            {
                key: 'removeAggressive',
                label: 'Remove Aggressive (Level 3)',
                description: 'Words removed only at maximum aggressiveness. Typically prepositions and auxiliary verbs.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['telegraphic', 'removeAggressive'],
                controlType: 'wordList' as any,
                listDescription: 'Words to remove at aggressive compression (most savings, least readable)',
                presetSuggestions: ['Prepositions', 'Auxiliary verbs'],
                tier: 'intermediate',
            },
            {
                key: 'preserve',
                label: 'Preserve Always',
                description: 'Words that are never removed regardless of aggressiveness level. Protects domain-critical terms from compression.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['telegraphic', 'preserve'],
                controlType: 'wordList' as any,
                listDescription: 'Words that must never be removed during telegraphic compression',
                presetSuggestions: ['Technical terms', 'Domain keywords'],
                tier: 'intermediate',
            },
        ],
        presets: [],
    },

    // -------------------------------------------------------------------------
    // 11. Synthesis Vocabulary (1 word list)
    // -------------------------------------------------------------------------
    synthesis_vocabulary: {
        id: 'synthesis_vocabulary',
        tier: 'intermediate',
        title: 'Synthesis Vocabulary',
        description: 'Analytical/connective words that should not count as "novel" in hallucination detection',
        behavior: `The hallucination detector checks what fraction of words in synthesis output are novel (not from either parent). Without this exempt list, the detector penalizes the very vocabulary that synthesis naturally uses — words like "therefore", "suggests", "enables", "interaction". Words on this list are excluded from the novel word count.`,
        parameters: [
            {
                key: 'synthesisVocabulary',
                label: 'Synthesis Vocabulary',
                description: 'Analytical and connective words that synthesis naturally uses. These are excluded from the novel ratio hallucination check.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['hallucination', 'synthesisVocabulary'],
                controlType: 'wordList' as any,
                listDescription: 'Analytical/connective words that synthesis naturally produces and should not trigger hallucination detection',
                presetSuggestions: ['Connective words', 'Analytical verbs', 'Synthesis language'],
                tier: 'intermediate',
            },
        ],
        presets: [],
    },

    // -------------------------------------------------------------------------
    // 12. Context Stop Words (1 word list)
    // -------------------------------------------------------------------------
    context_stop_words: {
        id: 'context_stop_words',
        tier: 'intermediate',
        title: 'Context Stop Words',
        description: 'Common words filtered out during context engine keyword extraction',
        behavior: `The context engine extracts keywords from user messages to find relevant knowledge nodes. These common words are filtered out to improve match quality and prevent every message from matching the same high-frequency nodes.`,
        parameters: [
            {
                key: 'stopWords',
                label: 'Stop Words',
                description: 'Common words filtered out during context engine keyword extraction to improve search relevance.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['contextEngine', 'stopWords'],
                controlType: 'wordList' as any,
                listDescription: 'Common/generic words to exclude from context engine keyword extraction',
                presetSuggestions: ['Common English words', 'Generic verbs'],
                tier: 'intermediate',
            },
        ],
        presets: [],
    },

    // -------------------------------------------------------------------------
    // 13. Voicing Cleanup Patterns (1 pattern list)
    // -------------------------------------------------------------------------
    voicing_cleanup: {
        id: 'voicing_cleanup',
        tier: 'intermediate',
        title: 'Voicing Cleanup',
        description: 'Regex patterns that remove LLM preamble from voiced synthesis output',
        behavior: `LLMs sometimes prefix their synthesis with preamble like "The new insight is:", "Combining these ideas:", or "Based on the connection:". These regex patterns are applied to strip such prefixes from voiced output, leaving only the actual synthesis content.`,
        parameters: [
            {
                key: 'responseCleanupPatterns',
                label: 'Cleanup Patterns',
                description: 'Regex patterns matched against the start of voiced output. Matching prefixes are stripped. Patterns are applied in order — first match wins.',
                min: 0, max: 0, step: 0, default: 0,
                configPath: ['voicing', 'responseCleanupPatterns'],
                controlType: 'patternList' as any,
                listDescription: 'Regex patterns to strip from the beginning of LLM synthesis output (removes preamble)',
                presetSuggestions: ['LLM preamble patterns', 'Meta-commentary patterns'],
                tier: 'intermediate',
            },
        ],
        presets: [],
    },
};
