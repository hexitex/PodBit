/**
 * @module engine-config
 *
 * Shared engine configuration derived from app config.
 * Used by all `core/` sub-modules (synthesis-engine, voicing, scoring, etc.).
 *
 * **All properties are ES6 getters** so that runtime config changes (via
 * `podbit.config(action: "apply")`) are immediately visible without a
 * server restart. Modules should import `config` from here rather than
 * reading `appConfig` directly, so the getter indirection is guaranteed.
 *
 * @see config.ts — the canonical config object (`appConfig`) that this proxies.
 */

import { config as appConfig } from '../config.js';

/**
 * Live-getter proxy over {@link appConfig}.
 *
 * Every property is a getter that delegates to the corresponding `appConfig`
 * field, ensuring hot-reloaded config values propagate without restart.
 */
const config = {
    // ── Similarity threshold ──────────────────────────────────────────
    /** Minimum cosine similarity for a node pair to enter synthesis. */
    get resonanceThreshold() { return appConfig.engine.threshold; },

    // ── Salience dynamics ─────────────────────────────────────────────
    /** Additive salience boost applied when a node participates in synthesis. */
    get salienceBoost() { return appConfig.engine.salienceBoost; },
    /** Multiplicative decay factor applied to salience each decay cycle. */
    get salienceDecay() { return appConfig.engine.salienceDecay; },
    /** Maximum salience value a node can reach. */
    get salienceCeiling() { return appConfig.engine.salienceCeiling; },
    /** Minimum salience value — nodes never decay below this floor. */
    get salienceFloor() { return appConfig.engine.salienceFloor; },

    // ── Weight dynamics ───────────────────────────────────────────────
    /** Multiplicative decay factor applied to node weight each decay cycle. */
    get weightDecay() { return appConfig.engine.weightDecay; },
    /** Additive weight boost given to parent nodes when their children synthesize. */
    get parentBoost() { return appConfig.engine.parentBoost; },
    /** Maximum weight value a node can reach. */
    get weightCeiling() { return appConfig.engine.weightCeiling; },
    /** Global minimum weight any node can have. */
    get weightFloor() { return appConfig.engine.weightFloor; },

    // ── Cycle timing ──────────────────────────────────────────────────
    /** Delay in milliseconds between synthesis cycles. */
    get cycleDelayMs() { return appConfig.engine.cycleDelayMs; },
    /** Number of synthesis cycles between decay passes. */
    get decayEveryNCycles() { return appConfig.engine.decayEveryNCycles; },

    // ── Object sections ───────────────────────────────────────────────
    // Live getters to survive both mutation-in-place and full replacement
    // of the underlying config objects.

    /** Specificity scoring configuration. */
    get specificity() { return appConfig.specificity; },
    /** Node constraints (max content length, etc.). */
    get nodes() { return appConfig.nodes; },
    /** Voicing/synthesis prompt and quality configuration. */
    get voicing() { return appConfig.voicing; },
    /** Synthesis engine parameters (sampling, gating, pipeline settings). */
    get synthesisEngine() { return appConfig.synthesisEngine; },
    /** Hallucination detection gate configuration. */
    get hallucination() { return appConfig.hallucination; },
    /** Tension detection cycle configuration. */
    get tensions() { return appConfig.tensions; },
    /** Validation/breakthrough scoring configuration. */
    get validation() { return appConfig.validation; },
    /** Embedding cache size and eviction settings. */
    get embeddingCache() { return appConfig.embeddingCache; },
    /** Number variable extraction and registry settings. */
    get numberVariables() { return appConfig.numberVariables; },
    /** Elite pool promotion and content synthesis settings. */
    get elitePool() { return appConfig.elitePool; },
    /** Consultant pipeline thresholds and scoring weights. */
    get consultantPipeline() { return appConfig.consultantPipeline; },
};

export { config, appConfig };
