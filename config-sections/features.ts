/**
 * Tunable parameter metadata for feature-toggle config sections.
 *
 * Each section here represents an opt-in feature that can be enabled/disabled
 * independently: lab verification, post_rejection, evm_decompose,
 * transient_partitions, node_lifecycle, number_variables, consultant_review,
 * and elite_pool. Sections auto-render in the GUI config page and are
 * addressable via `podbit.config(action: "tune", sectionId: "...")`.
 *
 * @module config-sections/features
 */

import type { SectionMeta, SectionTier } from './types.js';

export const FEATURE_SECTIONS: Record<string, SectionMeta> = {

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // Lab Outcomes — graph consequences of lab experiment results
    // -------------------------------------------------------------------------
    labVerify: {
        id: 'labVerify',
        tier: 'intermediate',
        title: 'Lab Outcomes',
        description: 'How the graph responds to lab experiment results - weight changes, auto-archiving, salience caps',
        behavior: `Lab servers run experiments on claims and return raw data. Podbit evaluates that data and applies graph consequences here. Supported claims get a weight boost (scaled by confidence), making them more likely to be selected as synthesis parents. Refuted claims get a weight penalty and can be auto-archived. Nodes that fail verification have their salience capped so they don't dominate parent selection. Nodes reach the lab via the Lab Verification Cycle, which selects candidates based on weight threshold - this ensures only nodes that have earned their weight through synthesis are submitted.`,
        parameters: [
            {
                key: 'evmEnabled',
                label: 'Enable Verification',
                description: 'Master toggle. When disabled, all verification requests return "skipped".',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['labVerify', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'weightBoostOnVerified',
                label: 'Verified Weight Boost',
                description: 'Weight added to nodes that pass verification, scaled by confidence. At 0.15 with confidence 0.8, the actual boost is 0.12.',
                min: 0, max: 0.5, step: 0.05, default: 0.15,
                configPath: ['labVerify', 'weightBoostOnVerified'],
                tier: 'intermediate',
            },
            {
                key: 'weightPenaltyOnFailed',
                label: 'Refuted Weight Penalty',
                description: 'Weight subtracted from refuted nodes, scaled by confidence. The asymmetry with boost reflects that refuted != wrong — experiments can fail for many reasons.',
                min: -0.3, max: 0, step: 0.05, default: -0.05,
                configPath: ['labVerify', 'weightPenaltyOnFailed'],
                tier: 'intermediate',
            },
            {
                key: 'autoArchiveOnDisproved',
                label: 'Auto-Archive Refuted Nodes',
                description: 'Automatically archive nodes that labs refute with sufficient confidence. Seeds, human contributions, and KB nodes are exempt.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['labVerify', 'autoArchiveOnDisproved'],
                tier: 'intermediate',
            },
            {
                key: 'autoArchiveConfidence',
                label: 'Auto-Archive Confidence Threshold',
                description: 'Minimum confidence required to auto-archive a refuted node. Higher = only archive when the lab result is very clear.',
                min: 0.1, max: 1.0, step: 0.05, default: 0.6,
                configPath: ['labVerify', 'autoArchiveConfidence'],
                tier: 'intermediate',
            },
            {
                key: 'failedSalienceCap',
                label: 'Failed Salience Cap',
                description: 'Maximum effective salience for refuted/skipped nodes. Caps their selection probability as synthesis parents.',
                min: 0.1, max: 1.0, step: 0.05, default: 0.5,
                configPath: ['labVerify', 'failedSalienceCap'],
                tier: 'intermediate',
            },
            {
                key: 'numericalPrecision',
                label: 'Default Precision Hint',
                description: 'Default decimal precision passed to labs in experiment specs (e.g., mpmath.dps). Labs can override this.',
                min: 15, max: 1000, step: 50, default: 500,
                configPath: ['labVerify', 'numericalPrecision'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Enable lab outcomes - moderate weight boost for verified nodes, mild penalty for refuted' },
            { label: 'Aggressive', intent: 'Strong boost for verified nodes (0.3) and stronger penalty for failures (-0.15), auto-archive on refute' },
            { label: 'Lenient', intent: 'Small boost (0.1), no penalty, no auto-archive - lab results inform but do not punish' },
            { label: 'Disable', intent: 'Turn off lab outcomes entirely - lab results are recorded but do not affect graph weights' },
        ],
    },

    // -------------------------------------------------------------------------
    // -------------------------------------------------------------------------
    // Post-Rejection Analysis (4 params)
    // -------------------------------------------------------------------------
    post_rejection: {
        id: 'post_rejection',
        title: 'Post-Rejection Analysis',
        tier: 'advanced' as SectionTier,
        description: 'When a claim is disproved by lab verification, optionally run a deeper analysis to discover what was actually produced and whether it reveals something interesting',
        behavior: 'After a completed-but-rejected verification, the post-rejection pipeline dispatches to a claim-type-specific analyser (e.g., numerical_identity → mpmath.identify() for PSLQ constant recognition). The analyser generates investigative Python code, runs it in the sandbox, and interprets findings. If the findings are "interesting" (e.g., the actual value is a recognized constant or the deviation reveals a systematic pattern), a recovery synthesis node is proposed as a child of the failed node. The architecture is extensible — new analysers register by claim type.',
        parameters: [
            {
                key: 'postRejectionEnabled',
                label: 'Analysis Enabled',
                description: 'Enable post-rejection analysis pipeline. When a claim is disproved, run a deeper investigation to discover what was actually produced.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['labVerify', 'postRejection', 'enabled'],
                tier: 'intermediate',
            },
            {
                key: 'postRejectionProposalEnabled',
                label: 'Recovery Proposals',
                description: 'When analysis finds something interesting, automatically propose a recovery synthesis node as a child of the failed node.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['labVerify', 'postRejection', 'proposalEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'postRejectionTimeoutMs',
                label: 'Analysis Timeout (ms)',
                description: 'Maximum time for the analysis sandbox execution. Mathematical proofs at high precision (mp.dps=500+) may need more time than standard verification. Slide right → longer analysis allowed. Slide left → faster timeout. Safe range: 30000–120000.',
                min: 10000, max: 300000, step: 5000, default: 120000,
                configPath: ['labVerify', 'postRejection', 'analysisTimeoutMs'],
                tier: 'advanced',
            },
            {
                key: 'postRejectionMaxCodeLength',
                label: 'Max Code Length',
                description: 'Maximum character length for generated analysis code. Analysis code is typically longer than verification code due to multi-step investigation. Slide right → allow longer, more complex analysis scripts. Slide left → constrain code size, faster but less thorough. Safe range: 3000–10000.',
                min: 4000, max: 32000, step: 1000, default: 16000,
                configPath: ['labVerify', 'postRejection', 'maxAnalysisCodeLength'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Enable post-rejection analysis with recovery proposals — investigate disproved claims for interesting patterns' },
            { label: 'Analysis Only', intent: 'Enable analysis but disable recovery proposals — investigate but do not auto-propose new nodes' },
            { label: 'Disable', intent: 'Disable post-rejection analysis entirely' },
        ],
    },

    // -------------------------------------------------------------------------
    // Spec Review — Adversarial Falsifiability Check (2 params)
    // -------------------------------------------------------------------------
    spec_review: {
        id: 'spec_review',
        title: 'Spec Review (Falsifiability)',
        tier: 'intermediate' as SectionTier,
        description: 'Adversarial LLM review of extracted experiment specs — detects cherry-picked parameters that guarantee a predetermined outcome',
        behavior: 'After spec extraction succeeds and passes the structural check, a second LLM call reviews the spec for falsifiability. It asks: "Could this setup plausibly produce a result contradicting the hypothesis?" If the reviewer determines the parameters are so extreme or constrained that only one outcome is possible (e.g., 10000:1 curvature ratio forcing one optimizer to dominate), the spec is rejected. This catches the class of tautological tests that pass structural checks because they are technically declarative but are adversarially parameterized. Requires the spec_review subsystem to be assigned to a model. When unassigned, this check is skipped (same as disabled).',
        parameters: [
            {
                key: 'specReviewEnabled',
                label: 'Enable Falsifiability Review',
                description: 'Run an adversarial LLM review on each extracted spec before submission to the lab. Catches cherry-picked parameters that guarantee the claimed result.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['labVerify', 'specReview', 'enabled'],
                tier: 'intermediate',
            },
            {
                key: 'specReviewMinConfidence',
                label: 'Min Confidence to Reject',
                description: 'The reviewer must be at least this confident that the spec is rigged before rejecting it. Higher values = more permissive (only reject obvious cases). Lower values = more aggressive (reject borderline specs).',
                min: 0.3, max: 1.0, step: 0.05, default: 0.7,
                configPath: ['labVerify', 'specReview', 'minConfidence'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Enable falsifiability review — reject specs where cherry-picked parameters guarantee the outcome' },
            { label: 'Strict', intent: 'Enable with low confidence threshold (0.5) — aggressively reject borderline specs' },
            { label: 'Permissive', intent: 'Enable with high confidence threshold (0.9) — only reject obviously rigged specs' },
            { label: 'Disable', intent: 'Disable falsifiability review — specs go straight to the lab after structural checks' },
        ],
    },

    // -------------------------------------------------------------------------
    // 26. Lab Claim Decomposition (5 params)
    // -------------------------------------------------------------------------
    evm_decompose: {
        id: 'evm_decompose',
        title: 'Lab Claim Decomposition',
        tier: 'advanced' as SectionTier,
        description: 'Split broad claims into verifiable atomic facts and research questions — divide-and-conquer for knowledge verification',
        behavior: 'When a claim is too broad or complex to verify as a whole, decomposition uses the most capable LLM (evm_guidance subsystem) to split it into atomic known facts and unknown research questions. Each fact becomes a seed node that can be independently verified by the lab verification pipeline. Each question becomes a question node that serves as a research prompt. The original node is weight-downgraded (not deleted) since its content is now represented by more specific children. The synthesis engine naturally recombines verified atomic knowledge — simple facts verify trivially, and simple questions get answered easily, where the original monolithic claim would have failed.',
        parameters: [
            {
                key: 'decomposeMaxFacts',
                label: 'Max Facts',
                description: 'Maximum number of known facts the LLM can extract from a single claim. Slide right → more granular decomposition, more nodes created. Slide left → fewer facts, coarser decomposition. Safe range: 3–10.',
                min: 1, max: 20, step: 1, default: 10,
                configPath: ['labVerify', 'decompose', 'maxFacts'],
                tier: 'advanced',
            },
            {
                key: 'decomposeMaxQuestions',
                label: 'Max Questions',
                description: 'Maximum number of research questions to extract. These become question nodes linked as children of the original. Slide right → more research prompts generated. Slide left → fewer questions, less graph expansion. Safe range: 2–5.',
                min: 0, max: 10, step: 1, default: 5,
                configPath: ['labVerify', 'decompose', 'maxQuestions'],
                tier: 'advanced',
            },
            {
                key: 'decomposeWeightDowngrade',
                label: 'Original Weight Downgrade',
                description: 'How much to reduce the original node weight after decomposition (negative value). The original is superseded by its children but not removed. Slide right (toward 0) → original retains more influence. Slide left → original demoted more aggressively. Safe range: -0.5 to -0.1.',
                min: -0.5, max: 0, step: 0.05, default: -0.20,
                configPath: ['labVerify', 'decompose', 'weightDowngrade'],
                tier: 'advanced',
            },
            {
                key: 'decomposeFactInitialWeight',
                label: 'Fact Initial Weight',
                description: 'Starting weight for each created fact (seed) node. Slide right → facts start more influential in synthesis and ranking. Slide left → facts start quieter, must earn influence. Safe range: 0.5–1.5.',
                min: 0.3, max: 1.5, step: 0.1, default: 0.8,
                configPath: ['labVerify', 'decompose', 'factInitialWeight'],
                tier: 'advanced',
            },
            {
                key: 'decomposeQuestionInitialWeight',
                label: 'Question Initial Weight',
                description: 'Starting weight for each created question node. Questions are excluded from synthesis but weight affects search ranking. Slide right → questions rank higher in search results. Slide left → questions start less prominent. Safe range: 0.3–1.0.',
                min: 0.5, max: 2.0, step: 0.1, default: 1.0,
                configPath: ['labVerify', 'decompose', 'questionInitialWeight'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Conservative', intent: 'Fewer decomposed nodes, minimal graph impact. Only extract facts with high confidence and questions for genuinely unknown aspects.' },
            { label: 'Thorough', intent: 'Maximum decomposition granularity. Extract every distinct sub-claim as a separate fact and formulate precise research questions for all uncertain aspects.' },
        ],
    },

    // -------------------------------------------------------------------------
    // 27. Transient Partitions (11 params)
    // -------------------------------------------------------------------------
    transient_partitions: {
        id: 'transient_partitions',
        tier: 'advanced',
        title: 'Transient Partitions',
        description: 'Visitor partition lifecycle — import, quarantine, synthesis, and departure',
        behavior: `Transient partitions are knowledge collections imported from external Podbit instances for temporary synthesis. They arrive in quarantine state and undergo injection scanning before approval. Once approved, they are bridged to host partitions and participate in synthesis cycles. After reaching exhaustion (too many barren cycles) or max cycles, they depart — returning enriched with any children they helped produce. Limits control how many transient partitions can be active, how many nodes each can bring, and what fraction of the total graph can be transient. The quarantine scan checks for prompt injection patterns and rejects partitions that exceed the failure threshold.`,
        parameters: [
            {
                key: 'transientEnabled',
                label: 'Transient Enabled',
                description: 'Master toggle for the transient partition system. When off, imports are rejected.',
                min: 0, max: 1, step: 1, default: 0,
                configPath: ['transient', 'enabled'],
                tier: 'advanced',
            },
            {
                key: 'maxTransientPartitions',
                label: 'Max Transient Partitions',
                description: 'Maximum number of transient partitions that can be active simultaneously. Slide right → more visitors allowed. Slide left → more restrictive. Safe range: 1–5.',
                min: 1, max: 10, step: 1, default: 3,
                configPath: ['transient', 'maxTransientPartitions'],
                tier: 'advanced',
            },
            {
                key: 'maxNodesPerImport',
                label: 'Max Nodes Per Import',
                description: 'Maximum number of nodes allowed in a single transient import. Slide right → accept larger imports. Slide left → tighter size limit. Safe range: 200–1000.',
                min: 50, max: 2000, step: 50, default: 500,
                configPath: ['transient', 'maxNodesPerImport'],
                tier: 'advanced',
            },
            {
                key: 'maxTransientNodeRatio',
                label: 'Max Node Ratio',
                description: 'Maximum fraction of total graph nodes that can be transient. Prevents visitors from overwhelming the host graph. Slide right → allow more transient content. Slide left → protect host graph dominance. Safe range: 0.1–0.3.',
                min: 0.05, max: 0.50, step: 0.05, default: 0.20,
                configPath: ['transient', 'maxTransientNodeRatio'],
                tier: 'advanced',
            },
            {
                key: 'minCycles',
                label: 'Min Cycles',
                description: 'Minimum synthesis cycles before a transient partition can be returned. Slide right → visitors guaranteed more cycles. Slide left → allow earlier departure. Safe range: 5–20.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['transient', 'minCycles'],
                tier: 'advanced',
            },
            {
                key: 'maxCycles',
                label: 'Max Cycles',
                description: 'Maximum synthesis cycles before forced departure. Slide right → longer visits allowed. Slide left → shorter stays, faster turnover. Safe range: 50–200.',
                min: 20, max: 500, step: 10, default: 100,
                configPath: ['transient', 'maxCycles'],
                tier: 'advanced',
            },
            {
                key: 'exhaustionThreshold',
                label: 'Exhaustion Threshold',
                description: 'Consecutive barren cycles (no children) before a partition is considered exhausted and returned. Only applies after minCycles. Slide right → more patience for unproductive visitors. Slide left → faster eviction of barren partitions. Safe range: 5–15.',
                min: 3, max: 30, step: 1, default: 10,
                configPath: ['transient', 'exhaustionThreshold'],
                tier: 'advanced',
            },
            {
                key: 'autoApproveKnownSigners',
                label: 'Auto-Approve Known Signers',
                description: 'Automatically approve transient partitions from known/trusted signers without manual review.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['transient', 'quarantine', 'autoApproveKnownSigners'],
                tier: 'advanced',
            },
            {
                key: 'scanFailThreshold',
                label: 'Scan Fail Threshold',
                description: 'Maximum fraction of nodes that can fail injection scanning before the import is rejected. Slide right → more permissive, tolerate more flagged nodes. Slide left → stricter, reject imports with fewer flagged nodes. Safe range: 0.1–0.3.',
                min: 0.05, max: 0.50, step: 0.05, default: 0.30,
                configPath: ['transient', 'quarantine', 'scanFailThreshold'],
                tier: 'advanced',
            },
            {
                key: 'sandboxCycles',
                label: 'Sandbox Cycles',
                description: 'Number of initial cycles in a restricted sandbox phase after approval, with stricter failure tolerance. Slide right → longer probationary period. Slide left → shorter sandbox, faster full access. Safe range: 3–10.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['transient', 'quarantine', 'sandboxCycles'],
                tier: 'advanced',
            },
            {
                key: 'sandboxFailThreshold',
                label: 'Sandbox Fail Threshold',
                description: 'Failure threshold during the sandbox phase. Partitions exceeding this during sandbox are auto-rejected. Slide right → more permissive sandbox. Slide left → stricter, reject faster during probation. Safe range: 0.3–0.6.',
                min: 0.10, max: 0.80, step: 0.05, default: 0.50,
                configPath: ['transient', 'quarantine', 'sandboxFailThreshold'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Enable transient partitions with default safety limits — max 3 visitors, 500 nodes each, 20% ratio cap, quarantine scanning' },
            { label: 'Open', intent: 'Enable with relaxed limits — max 5 visitors, 1000 nodes each, 30% ratio, auto-approve known signers' },
            { label: 'Strict', intent: 'Enable with tight limits — max 2 visitors, 200 nodes each, 10% ratio, low scan threshold (0.15), no auto-approve' },
            { label: 'Disable', intent: 'Disable transient partitions entirely — no imports accepted' },
        ],
    },

    // -------------------------------------------------------------------------
    // 27. Node Lifecycle (6 params)
    // -------------------------------------------------------------------------
    node_lifecycle: {
        id: 'node_lifecycle',
        tier: 'intermediate',
        title: 'Node Lifecycle',
        description: 'Fertility-driven state machine: nascent → active → declining → composted',
        behavior: `Every node progresses through lifecycle states based on fertility (offspring production), not age or weight. Newly created nodes start as nascent. When a node produces its first child via synthesis, it transitions to active. If an active node goes barrenThreshold cycles without producing children, it enters declining. If it remains barren for compostAfter total cycles, it gets composted — archived to a stub that preserves lineage metadata but frees graph space. Nascent nodes that never produce children are stillborn after maxCycles. Declining nodes can be revived if they produce a new child. The sweep runs every sweepInterval synthesis cycles. Breakthroughs can optionally be preserved from composting.`,
        parameters: [
            {
                key: 'lifecycleEnabled',
                label: 'Lifecycle Enabled',
                description: 'Master toggle for the lifecycle system. When off, no state transitions occur — all nodes remain in their current state indefinitely.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['lifecycle', 'enabled'],
                tier: 'intermediate',
            },
            {
                key: 'barrenThreshold',
                label: 'Barren Threshold (cycles)',
                description: 'Consecutive barren cycles (no children produced) before an active node enters declining state. At 15 (default) with 30s synthesis cycles, a node has ~7.5 minutes of barren cycles before declining. But cycles where the node is not sampled also count as barren — in a graph of 500 nodes, any given node is sampled infrequently, so 15 cycles may pass in minutes. At 5, nodes decline quickly — aggressive pruning. At 25, very patient — nodes get many chances to find a compatible partner.',
                min: 3, max: 50, step: 1, default: 15,
                configPath: ['lifecycle', 'barrenThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'compostAfter',
                label: 'Compost After (cycles)',
                description: 'Total barren cycles before a declining node is composted (archived to a stub that preserves lineage metadata). At 30 (default) with barrenThreshold=15, a node has 15 additional cycles in "declining" before composting — a second chance window where producing even one child revives it to "active". At 20, the decline-to-compost window is only 5 cycles (20-15=5). At 60, very lenient — nodes linger for a long time before cleanup. Must be > barrenThreshold.',
                min: 10, max: 100, step: 1, default: 30,
                configPath: ['lifecycle', 'compostAfter'],
                tier: 'intermediate',
            },
            {
                key: 'nascentMaxCycles',
                label: 'Nascent Max Cycles',
                description: 'Maximum cycles a nascent node can go without producing any children before being stillborn. Slide right → more chances. Slide left → faster culling of dead-end nodes. Safe range: 5–15.',
                min: 5, max: 50, step: 1, default: 20,
                configPath: ['lifecycle', 'nascent', 'maxCycles'],
                tier: 'advanced',
            },
            {
                key: 'preserveBreakthroughs',
                label: 'Preserve Breakthroughs',
                description: 'Exempt breakthrough nodes from composting. When on, breakthroughs are never archived regardless of fertility.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['lifecycle', 'composting', 'preserveBreakthroughs'],
                tier: 'advanced',
            },
            {
                key: 'sweepInterval',
                label: 'Sweep Interval (cycles)',
                description: 'Run lifecycle state transitions every N synthesis cycles. Slide right → less frequent sweeps (batch transitions). Slide left → more responsive state changes. Safe range: 5–20.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['lifecycle', 'sweepInterval'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Enable lifecycle with default thresholds — barren 15, compost 30, nascent 20, preserve breakthroughs' },
            { label: 'Aggressive Pruning', intent: 'Enable lifecycle with fast culling — barren 8, compost 15, nascent 10, sweep every 3 cycles. Quickly composting unproductive nodes.' },
            { label: 'Patient', intent: 'Enable lifecycle with generous thresholds — barren 25, compost 60, nascent 35. Give nodes more time to prove fertility.' },
            { label: 'Disable', intent: 'Disable the lifecycle system entirely — no nodes will be composted or transitioned' },
        ],
    },

    // -------------------------------------------------------------------------
    // 28. Number Variables (3 params)
    // -------------------------------------------------------------------------
    number_variables: {
        id: 'number_variables',
        tier: 'intermediate',
        title: 'Number Variables',
        description: 'Extracts all numbers from node content and replaces them with installation-scoped variable references',
        behavior: `When enabled, every newly proposed node has all its numbers extracted into a registry. Each number becomes a domain-scoped variable with a globally-unique ID (installation prefix + counter, e.g., [[[MRKQ42]]]). The original number in the content is replaced with the variable reference — units and surrounding text stay as-is. During synthesis, a legend block is injected into the prompt explaining each variable's value, domain, and scope, preventing the LLM from universalizing domain-specific numbers across contexts. Variable IDs are stable across exports, pool round-trips, and transient partitions — no remapping needed because each installation has a unique prefix.`,
        parameters: [
            {
                key: 'numberVariablesEnabled',
                label: 'Enabled',
                description: 'Master toggle for the number variable system. When disabled, numbers are stored as-is in node content with no extraction or annotation.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['numberVariables', 'enabled'],
                tier: 'advanced',
            },
            {
                key: 'contextWindowSize',
                label: 'Context Window (words)',
                description: 'Number of words captured before and after each number to describe its scope in the registry. Slide right → more context per variable. Slide left → shorter scope descriptions. Safe range: 5–15.',
                min: 3, max: 20, step: 1, default: 8,
                configPath: ['numberVariables', 'contextWindowSize'],
                tier: 'advanced',
            },
            {
                key: 'maxVarsPerNode',
                label: 'Max Variables Per Node',
                description: 'Safety limit on how many numbers can be extracted from a single node. Slide right → allow more variables per node. Slide left → cap extraction earlier, less overhead. Safe range: 10–50.',
                min: 5, max: 50, step: 5, default: 20,
                configPath: ['numberVariables', 'maxVarsPerNode'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Enable number variable extraction with default settings — 8-word context window, max 20 variables per node' },
            { label: 'Disable', intent: 'Disable number variables — store numbers as-is in content' },
        ],
    },

    // -------------------------------------------------------------------------
    // 29. Consultant Review (11 params)
    // -------------------------------------------------------------------------
    consultant_review: {
        id: 'consultant_review',
        tier: 'advanced',
        title: 'Consultant Review',
        description: 'Low-confidence escalation — when the primary model produces uncertain output, the consultant model reviews and scores it',
        behavior: `When a subsystem's primary model produces low-confidence output, the consultant model (if assigned) reviews the output and returns a score (0-10). Each subsystem has its own confidence threshold below which review triggers. For lab verification subsystems (evaluator, triage, expert, structural), the threshold is a confidence value (0-1) — review triggers when confidence falls below. For synthesis subsystems (voice, synthesis), the threshold is a quality score (0-10) — review always runs and the output is rejected if the consultant scores below this threshold. For dedup_judge, the threshold is a similarity zone (0-1) — review triggers when the dedup similarity falls in the doubt zone around this value. For research, the threshold is a quality score (0-10) — research seeds below this score are rejected. The consultant can optionally provide its own revised output if it believes it can do better. All review decisions are logged to the node audit trail.`,
        parameters: [
            {
                key: 'consultantReviewEnabled',
                label: 'Enabled',
                description: 'Master toggle for consultant review. When disabled, no low-confidence escalation happens even if consultant models are assigned.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['consultantReview', 'enabled'],
                tier: 'intermediate',
            },
            {
                key: 'crSpecExtraction',
                label: 'Spec Extraction Threshold',
                description: 'Confidence threshold below which spec extraction output is sent for consultant review. At 0.4, extractions where the LLM is less than 40% confident are escalated.',
                min: 0.1, max: 0.8, step: 0.05, default: 0.4,
                configPath: ['consultantReview', 'thresholds', 'spec_extraction'],
                tier: 'advanced',
            },
            {
                key: 'crVoice',
                label: 'Voicing Quality Threshold',
                description: 'Minimum consultant score (0-10) for voicing output to be accepted. Unlike lab verification thresholds, this always runs — every voiced synthesis gets consultant review. At 5 (default), ~50-60% of voiced output passes — the consultant is moderately selective. At 7, only ~20-30% passes — very strict, only the best synthesis survives the voicing pipeline. At 3, ~80-90% passes — minimal filtering.',
                min: 1, max: 9, step: 1, default: 5,
                configPath: ['consultantReview', 'thresholds', 'voice'],
                tier: 'intermediate',
            },
            {
                key: 'crSynthesis',
                label: 'Synthesis Quality Threshold',
                description: 'Minimum consultant score (0-10) for synthesis output to be accepted. Consultant always reviews synthesis output and rejects anything below this threshold. At 5 (default), roughly half of synthesis passes — a moderate quality bar. At 7, very strict — most synthesis is rejected, only genuinely novel and well-grounded connections survive. At 3, almost everything passes, relying on downstream population control for quality filtering.',
                min: 1, max: 9, step: 1, default: 5,
                configPath: ['consultantReview', 'thresholds', 'synthesis'],
                tier: 'intermediate',
            },
            {
                key: 'crDedupJudge',
                label: 'Dedup Doubt Zone',
                description: 'Center of the doubt zone where dedup verdicts get a consultant second opinion. Review triggers when similarity falls in ±0.075 of this value. At 0.75 (default), the doubt zone is [0.675, 0.825] — this is the gray area where automated dedup is uncertain and an LLM judge adds value. At 0.85, the doubt zone shifts to [0.775, 0.925] — reviews trigger on more similar pairs. At 0.65, reviews trigger on less similar pairs that are more likely to be distinct.',
                min: 0.5, max: 0.95, step: 0.05, default: 0.75,
                configPath: ['consultantReview', 'thresholds', 'dedup_judge'],
                tier: 'advanced',
            },
            {
                key: 'crResearch',
                label: 'Research Seed Threshold',
                description: 'Minimum consultant score (0-10) for research seeds to be accepted. At 4 (default), the bar is set below the voicing/synthesis thresholds because research seeds are intentionally exploratory — they don\'t need to be as polished as synthesis output. At 6, research seeds need to be well-crafted to enter the graph. At 2, almost all research output passes, letting the graph grow rapidly at the cost of quality.',
                min: 1, max: 8, step: 1, default: 4,
                configPath: ['consultantReview', 'thresholds', 'research'],
                tier: 'advanced',
            },
            {
                key: 'crConfigTune',
                label: 'Config Tune Threshold',
                description: 'Minimum consultant score (0-10) for config tuning suggestions to be accepted. Below this score, tuning suggestions are rejected. Slide right → stricter, fewer tuning suggestions accepted. Slide left → more permissive. Safe range: 4–7.',
                min: 1, max: 9, step: 1, default: 5,
                configPath: ['consultantReview', 'thresholds', 'config_tune'],
                tier: 'advanced',
            },
            {
                key: 'crTuningJudge',
                label: 'Tuning Judge Threshold',
                description: 'Minimum consultant score (0-10) for tuning judge evaluations to be accepted. Below this score, the tuning judgment is sent back for review. Slide right → stricter, fewer judgments accepted. Slide left → more permissive. Safe range: 4–7.',
                min: 1, max: 9, step: 1, default: 5,
                configPath: ['consultantReview', 'thresholds', 'tuning_judge'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Strict', intent: 'Enable with high thresholds — more reviews trigger, stricter quality gates. Lab thresholds 0.5-0.6, quality thresholds 6-7.' },
            { label: 'Default', intent: 'Enable with balanced thresholds — lab 0.4-0.5, voice/synthesis 5, research 4, dedup 0.75' },
            { label: 'Permissive', intent: 'Enable with low thresholds — only review very uncertain outputs. Lab 0.2-0.3, quality thresholds 3-4.' },
            { label: 'Disable', intent: 'Disable consultant review entirely — no low-confidence escalation' },
        ],
    },

    // -------------------------------------------------------------------------
    // API Verification Registry (6 params)
    // -------------------------------------------------------------------------
    api_verification: {
        id: 'api_verification',
        tier: 'advanced',
        title: 'API Data & Enrichment',
        description: 'External API queries as pre-codegen context — triage decides which APIs to call, data feeds into codegen and LLM evaluation',
        behavior: `API data is gathered as part of pre-codegen context, driven by triage. When triage identifies that external data would help verify a claim, it specifies which APIs to query. The data is fetched, interpreted, and injected into the codegen prompt alongside web research data. This gives the generated Python code real reference values instead of approximations. The triage prompt receives the list of available APIs (name, description, capabilities, domains) so it can make informed routing decisions. Enrichment extracts additional knowledge from API responses: inline mode (default) appends facts to the source node preserving synthesis context; children mode creates separate child seed nodes.`,
        parameters: [
            {
                key: 'apiVerificationEnabled',
                label: 'Enabled',
                description: 'Master toggle for API data gathering. When enabled, triage can request API calls as pre-codegen context. When disabled, no API calls are made.',
                min: 0, max: 1, step: 1, default: 0,
                configPath: ['labVerify', 'apiVerification', 'enabled'],
                tier: 'advanced',
            },
            {
                key: 'apiMaxApisPerNode',
                label: 'Max APIs Per Node',
                description: 'Maximum number of different APIs that can be queried for a single node. Slide right → more API calls per node, richer context. Slide left → fewer calls, lower cost. Safe range: 1–5.',
                min: 1, max: 10, step: 1, default: 3,
                configPath: ['labVerify', 'apiVerification', 'maxApisPerNode'],
                tier: 'advanced',
            },
            {
                key: 'apiEnrichmentEnabled',
                label: 'Enrichment Enabled',
                description: 'Enable enrichment extraction from API responses. In inline mode (default), facts are appended to the source node. In children mode, facts become separate child seed nodes.',
                min: 0, max: 1, step: 1, default: 0,
                configPath: ['labVerify', 'apiVerification', 'enrichmentEnabled'],
                tier: 'advanced',
            },
            {
                key: 'apiEnrichmentMinConfidence',
                label: 'Enrichment Min Confidence',
                description: 'Minimum confidence (0-1) for an extracted fact to be used. Facts below this threshold are logged but discarded. Slide right → stricter, only high-confidence facts kept. Slide left → more permissive, more facts retained. Safe range: 0.5–0.8.',
                min: 0.3, max: 1.0, step: 0.05, default: 0.7,
                configPath: ['labVerify', 'apiVerification', 'enrichmentMinConfidence'],
                tier: 'advanced',
            },
            {
                key: 'apiEnrichmentMaxWords',
                label: 'Inline Enrichment Max Words',
                description: 'Maximum total word count for a node after inline enrichment. Falls back to children mode if exceeded. Slide right → allow longer enriched nodes. Slide left → tighter limit, more children-mode fallbacks. Safe range: 100–500.',
                min: 100, max: 2000, step: 50, default: 500,
                configPath: ['labVerify', 'apiVerification', 'enrichmentMaxContentWords'],
                tier: 'advanced',
            },
            {
                key: 'apiEnrichmentMaxNodes',
                label: 'Max Enrichment Nodes Per Call',
                description: 'Maximum number of child nodes created from a single API response. Only applies in children mode (or fallback). Slide right → more child nodes per response. Slide left → fewer nodes, less graph expansion. Safe range: 3–10.',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['labVerify', 'apiVerification', 'enrichmentMaxNodesPerCall'],
                tier: 'advanced',
            },
            {
                key: 'apiEnrichmentWeight',
                label: 'Enrichment Child Node Weight',
                description: 'Initial weight for enrichment-created child nodes. Lower than default seed weight since these are machine-extracted. Slide right → enrichment nodes start more influential. Slide left → enrichment nodes start quieter. Safe range: 0.3–0.8.',
                min: 0.1, max: 1.5, step: 0.1, default: 0.6,
                configPath: ['labVerify', 'apiVerification', 'enrichmentInitialWeight'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Enable', intent: 'Enable API data gathering for triage-driven pre-codegen context. Enrichment OFF.' },
            { label: 'Enable + Inline Enrich', intent: 'Enable API data AND inline enrichment. Facts appended to source node. enrichmentMinConfidence=0.7.' },
            { label: 'Enable + Children Enrich', intent: 'Enable API data AND enrichment in children mode. Creates separate child seed nodes from API facts.' },
            { label: 'Disable', intent: 'Disable API data gathering entirely.' },
        ],
    },

    // -------------------------------------------------------------------------
    // 46. Elite Verification Pool (13 params)
    // -------------------------------------------------------------------------
    elite_pool: {
        id: 'elite_pool',
        tier: 'advanced',
        title: 'Elite Verification Pool',
        description: 'Controls how lab-verified nodes are promoted to the elite pool, deduplication gates, manifest mapping, and cross-elite bridging for higher-generation synthesis.',
        behavior: `When a node passes lab verification with sufficient confidence, it is promoted to the elite pool as a new elite_verification node. Three dedup gates prevent redundancy: variable overlap (nodes sharing the same quantitative claims), parent lineage (nodes derived from the same sources), and semantic similarity (checked only against the elite pool). Elite nodes are mapped to project manifest targets (goals, questions, bridges) to track discovery progress. Elite-to-elite bridging creates higher-generation nodes by synthesizing pairs of verified nodes from different domains. Generation numbers track synthesis depth, with a configurable ceiling beyond which nodes become terminal findings ready for empirical validation.`,
        parameters: [
            {
                key: 'epEnabled',
                label: 'Enabled',
                description: 'Master switch for the elite verification pool. When disabled, lab results are not promoted to the elite pool.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['elitePool', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'epPromotionThreshold',
                label: 'Promotion Threshold',
                description: 'Minimum lab evaluation confidence (0-1) for a verified node to qualify for elite promotion. At 0.95 (default), only very high-confidence verifications produce elite nodes — the lab must be nearly certain the claim is correct. This means ~5-15% of successfully verified nodes enter the elite pool. At 0.80, ~30-50% of verified nodes qualify — faster elite growth but lower quality floor. At 0.70, most verified nodes enter the pool, which risks diluting the elite signal.',
                min: 0.5, max: 1.0, step: 0.05, default: 0.95,
                configPath: ['elitePool', 'promotionThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'epMaxGeneration',
                label: 'Max Generation',
                description: 'Maximum generation depth for elite nodes. Gen 0=seeds, Gen 1=synthesis, Gen 2=verified elite, Gen 3=elite-to-elite synthesis, Gen 4=verified elite synthesis. Slide right → deeper synthesis chains allowed. Slide left → shallower, nodes reach terminal status sooner. Safe range: 2–5.',
                min: 2, max: 10, step: 1, default: 4,
                configPath: ['elitePool', 'maxGeneration'],
                tier: 'advanced',
            },
            {
                key: 'epEnableBridging',
                label: 'Enable Elite Bridging',
                description: 'Allow elite-to-elite bridging for higher-generation synthesis. When two verified elite nodes are bridged, the result goes through the standard pipeline and must independently earn elite status.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['elitePool', 'enableEliteBridging'],
                tier: 'intermediate',
            },
            {
                key: 'epMaxBridgingAttemptsPerPair',
                label: 'Max Bridging Attempts Per Pair',
                description: 'Maximum number of times two specific elite nodes can be bridged before being excluded from candidate selection. Slide right → more attempts per pair. Slide left → fewer retries, faster exclusion of unproductive pairs. Safe range: 1–3.',
                min: 1, max: 5, step: 1, default: 2,
                configPath: ['elitePool', 'maxBridgingAttemptsPerPair'],
                tier: 'advanced',
            },
            {
                key: 'epLogicalApprovalEnabled',
                label: 'Logical Approval Enabled',
                description: 'When enabled, elite promotions require a minimum logical approval score in addition to the lab confidence threshold.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['elitePool', 'logicalApprovalEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'epLogicalApprovalThreshold',
                label: 'Logical Approval Threshold',
                description: 'Minimum logical approval score (0-10) for elite promotion when logical approval is enabled. Slide right → stricter logical gate, fewer promotions. Slide left → more permissive logical approval. Safe range: 6–9.',
                min: 3, max: 10, step: 1, default: 8,
                configPath: ['elitePool', 'logicalApprovalThreshold'],
                tier: 'intermediate',
            },
            {
                key: 'epDedupEnabled',
                label: 'Dedup Enabled',
                description: 'Enable three-gate deduplication against the elite pool. Gate 1: variable overlap (same quantitative claims). Gate 2: parent lineage (same source node). Gate 3: semantic similarity (embedding cosine).',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['elitePool', 'dedup', 'enabled'],
                tier: 'intermediate',
            },
            {
                key: 'epDedupSemantic',
                label: 'Semantic Similarity Threshold',
                description: 'Gate 3: embedding cosine similarity above which two elite nodes are considered duplicates. Slide right → stricter, only near-identical nodes are deduped. Slide left → more aggressive dedup, catches broader similarity. Safe range: 0.88–0.95.',
                min: 0.80, max: 0.98, step: 0.01, default: 0.92,
                configPath: ['elitePool', 'dedup', 'semanticThreshold'],
                tier: 'advanced',
            },
            {
                key: 'epDedupVariableOverlap',
                label: 'Check Variable Overlap',
                description: 'Gate 1: when enabled, checks if a candidate shares identical number variable IDs with an existing elite node in the same domain. Identical variable sets indicate duplicate quantitative claims.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['elitePool', 'dedup', 'checkVariableOverlap'],
                tier: 'advanced',
            },
            {
                key: 'epDedupParentLineage',
                label: 'Check Parent Lineage',
                description: 'Gate 2: when enabled, checks if a candidate shares the same parent synthesis node as an existing elite node. Two verifications of the same synthesis are almost certainly duplicates.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['elitePool', 'dedup', 'checkParentLineage'],
                tier: 'advanced',
            },
            {
                key: 'epManifestEnabled',
                label: 'Manifest Mapping Enabled',
                description: 'Map elite nodes to project manifest targets (goals, key questions, bridges) to track discovery progress and identify coverage gaps.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['elitePool', 'manifestMapping', 'enabled'],
                tier: 'advanced',
            },
            {
                key: 'epManifestMinRelevance',
                label: 'Min Manifest Relevance',
                description: 'Minimum relevance score (0.0-1.0) for an elite node to count as covering a manifest target. Slide right → stricter alignment required for coverage credit. Slide left → broader coverage, more nodes count as relevant. Safe range: 0.3–0.6.',
                min: 0.1, max: 0.8, step: 0.05, default: 0.4,
                configPath: ['elitePool', 'manifestMapping', 'minRelevanceScore'],
                tier: 'advanced',
            },
            {
                key: 'epBridgingRate',
                label: 'Bridging Rate',
                description: 'Probability (0.0-1.0) per synthesis cycle that elite bridging is attempted instead of regular pair selection. Slide right → more elite-to-elite synthesis attempts. Slide left → fewer bridging attempts, more regular synthesis. Safe range: 0.1–0.3.',
                min: 0.0, max: 1.0, step: 0.05, default: 0.2,
                configPath: ['elitePool', 'bridgingRate'],
                tier: 'advanced',
            },
            {
                key: 'epEliteWeight',
                label: 'Elite Node Weight',
                description: 'Initial weight assigned to newly promoted elite nodes. Slide right → elite nodes start more influential in queries and sampling. Slide left → elite nodes start quieter, must earn prominence. Safe range: 1.5–3.0.',
                min: 0.5, max: 3.0, step: 0.1, default: 1.5,
                configPath: ['elitePool', 'eliteWeight'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Strict', intent: 'High quality gate: promotionThreshold 0.98, logicalApprovalThreshold 9, strict semantic dedup 0.95. Only the most confident verifications enter the elite pool.' },
            { label: 'Default', intent: 'Balanced defaults: promotionThreshold 0.95, logicalApprovalThreshold 8, semantic 0.92. Good balance of quality and throughput.' },
            { label: 'Permissive', intent: 'Lower barrier: promotionThreshold 0.80, logicalApprovalThreshold 6, semantic 0.88. Good for bootstrapping the elite pool with more initial entries.' },
        ],
    },

    // -------------------------------------------------------------------------
    // Ground Rules Gate
    // -------------------------------------------------------------------------
    ground_rules: {
        id: 'ground_rules',
        tier: 'basic' as SectionTier,
        title: 'Ground Rules',
        description: 'First-principle gate: classifies whether nodes contain synthesizable knowledge before they enter the synthesis pipeline',
        behavior: `The ground rules gate is the very first check in the synthesis pipeline. It uses a dedicated LLM subsystem (ground_rules) to classify each node as synthesizable or not. Synthesizable nodes contain causal claims, transferable principles, mechanisms, or theoretical insights. Non-synthesizable nodes are procedural descriptions, bare results, or methodology summaries. Nodes classified as non-synthesizable (synthesizable=0) are permanently excluded from synthesis partner selection. Unclassified nodes (synthesizable=NULL) are allowed through until classified. Background batch classification processes unclassified nodes on a configurable interval.`,
        parameters: [
            {
                key: 'grEnabled',
                label: 'Enable Ground Rules',
                description: 'Master toggle for the ground rules gate. When disabled, all nodes are eligible for synthesis regardless of content type.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['groundRules', 'enabled'],
                tier: 'advanced',
            },
            {
                key: 'grBatchSize',
                label: 'Classification Batch Size',
                description: 'How many unclassified nodes to process per background classification batch. Slide right → larger batches, faster classification but more LLM calls at once. Slide left → smaller batches, gentler on resources. Safe range: 20–100.',
                min: 10, max: 200, step: 10, default: 50,
                configPath: ['groundRules', 'batchSize'],
                tier: 'advanced',
            },
            {
                key: 'grIntervalMs',
                label: 'Background Interval (ms)',
                description: 'Time between automatic background classification batches. 0 = manual only (via podbit.kb classify action). Slide right → longer intervals between batches, less resource usage. Slide left → more frequent batches, faster classification. Safe range: 60000–300000 — or 0 for manual only.',
                min: 0, max: 600000, step: 30000, default: 0,
                configPath: ['groundRules', 'intervalMs'],
                tier: 'advanced',
            },
        ],
        presets: [
            { label: 'Manual Only', intent: 'Disable background classification. Classification happens only when manually triggered via podbit.kb(action:"classify"). intervalMs = 0.' },
            { label: 'Background Active', intent: 'Enable automatic background classification at 5-minute intervals. intervalMs = 300000, batchSize = 50.' },
            { label: 'Aggressive Cleanup', intent: 'Fast background classification with large batches. intervalMs = 60000, batchSize = 200. Good for initial cleanup of an existing graph.' },
        ],
    },
};
