/**
 * @module autonomous-cycles
 *
 * Barrel re-export for all autonomous synthesis cycle functions.
 *
 * Each cycle runs as a single iteration (e.g., `runVoicingCycleSingle`) and
 * is orchestrated by the corresponding `start*Cycle` starters which handle
 * scheduling, concurrency, and error recovery.
 *
 * Cycle types:
 * - **Voicing** — synthesizes insights from node pairs via LLM.
 * - **Validation** — scores nodes for breakthrough promotion.
 * - **Questions** — generates research questions from node gaps.
 * - **Tensions** — detects contradictions between similar nodes.
 * - **Research** — generates new seed knowledge from research questions.
 * - **Autorating** — applies heuristic quality ratings to unrated nodes.
 * - **EVM** — runs empirical verification (code generation + execution).
 *
 * @see core/cycles/ — individual cycle implementations.
 */
export * from './cycles/index.js';
