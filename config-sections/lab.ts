/**
 * Lab Framework config section metadata.
 *
 * Controls freeze and taint behavior for the lab experiment system.
 *
 * @module config-sections/lab
 */

import type { SectionMeta } from './types.js';

export const LAB_SECTIONS: Record<string, SectionMeta> = {
    lab: {
        id: 'lab',
        tier: 'intermediate',
        title: 'Lab Framework',
        description: 'Controls how nodes behave during lab experiments — freezing prevents synthesis on unverified claims, taint propagation marks downstream children when a claim is refuted.',
        behavior: 'When freeze is enabled, nodes are excluded from synthesis, decay, and lifecycle sweeps while under active experiment. When taint is enabled, refuted nodes propagate a taint marker to their children via BFS edge walk. Tainted nodes are excluded from synthesis until the taint expires.',
        parameters: [
            {
                key: 'labFreezeOnExperiment',
                label: 'Freeze on Experiment',
                description: 'Freeze nodes while under active lab experiment (prevents synthesis on unverified claims)',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['lab', 'freezeOnExperiment'],
                tier: 'basic',
            },
            {
                key: 'labTaintOnRefute',
                label: 'Taint on Refute',
                description: 'Propagate taint to downstream children when a claim is refuted',
                min: 0, max: 1, step: 1, default: 0,
                configPath: ['lab', 'taintOnRefute'],
                tier: 'intermediate',
            },
            {
                key: 'labTaintMaxDepth',
                label: 'Taint Max Depth',
                description: 'Maximum BFS depth for taint propagation (how many generations of children to taint)',
                min: 1, max: 20, step: 1, default: 5,
                configPath: ['lab', 'taintMaxDepth'],
            },
            {
                key: 'labTaintDecayDays',
                label: 'Taint Decay (days)',
                description: 'Auto-clear taint after this many days. Set to 0 to disable decay.',
                min: 0, max: 365, step: 1, default: 30,
                configPath: ['lab', 'taintDecayDays'],
            },
            {
                key: 'labMathLabPort',
                label: 'Math Lab Server Port',
                description: 'Port for the math-lab server (computational verification)',
                min: 1024, max: 65535, step: 1, default: 4714,
                configPath: ['lab', 'mathLabPort'],
                tier: 'advanced',
            },
            {
                key: 'labHealthCheckIntervalMs',
                label: 'Health Check Interval (ms)',
                description: 'How often to health-check registered lab servers',
                min: 10000, max: 600000, step: 5000, default: 60000,
                configPath: ['lab', 'healthCheckIntervalMs'],
                tier: 'advanced',
            },
            {
                key: 'labRoutingEnabled',
                label: 'LLM Lab Routing',
                description: 'Use an LLM to pick the best lab when multiple labs support a spec type. When off, uses priority + queue depth.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['lab', 'routingEnabled'],
                tier: 'intermediate',
            },
            {
                key: 'labFreezeTimeoutMs',
                label: 'Freeze Timeout (ms)',
                description: 'Maximum time a node stays frozen waiting for lab results. After this, the node is unfrozen and the entry fails.',
                min: 60000, max: 3600000, step: 60000, default: 600000,
                configPath: ['lab', 'freezeTimeoutMs'],
                tier: 'advanced',
            },
            {
                key: 'labChainingEnabled',
                label: 'Lab Chaining',
                description: 'Auto-forward experiment results to a critique lab for methodology review before applying graph consequences. Requires a registered lab supporting the experiment_review spec type.',
                min: 0, max: 1, step: 1, default: 0,
                configPath: ['lab', 'chaining', 'enabled'],
                tier: 'basic',
            },
            {
                key: 'labChainingMaxDepth',
                label: 'Chain Max Depth',
                description: 'Maximum chain depth (original=0, critique=1, retest=2, final critique=3). Prevents infinite critique-retest loops.',
                min: 1, max: 5, step: 1, default: 3,
                configPath: ['lab', 'chaining', 'maxChainDepth'],
                tier: 'basic',
            },
            {
                key: 'labChainingDeferConsequences',
                label: 'Defer Consequences',
                description: 'Hold weight/taint/archive changes until the critique lab confirms or corrects the verdict. When off, consequences apply immediately and critique only records an advisory.',
                min: 0, max: 1, step: 1, default: 1,
                configPath: ['lab', 'chaining', 'deferConsequences'],
                tier: 'basic',
            },
        ],
        presets: [
            { label: 'Protective', intent: 'Enable freeze and taint with conservative decay (freeze on, taint on, 30-day decay, depth 5)' },
            { label: 'Freeze Only', intent: 'Freeze during experiments but no taint propagation (freeze on, taint off)' },
            { label: 'Permissive', intent: 'No freeze and no taint — nodes remain available during experiments (both off)' },
            { label: 'Default', intent: 'Reset to default lab settings (freeze on, taint off, 30-day decay, depth 5)' },
            { label: 'Chained Verification', intent: 'Enable lab chaining with deferred consequences — all verdicts are reviewed by a critique lab before weight changes apply (chaining on, defer on, depth 3)' },
        ],
    },
};
