/**
 * @module core/cycles/ground-rules
 *
 * Autonomous Ground Rules Cycle.
 *
 * Classifies unclassified nodes one-at-a-time for synthesizability using the
 * ground_rules subsystem. Runs via `runCycleLoop` like all other cycles —
 * one node per tick, paced by intervalMs. Non-synthesizable orphans are
 * removed; connected ones are archived.
 */

import { config as appConfig } from '../../config.js';
import { classifySingleNode } from '../synthesizability.js';

/**
 * Single-tick function for runCycleLoop.
 * Classifies one unclassified node per invocation.
 */
export async function runGroundRulesCycleSingle(): Promise<void> {
    if (!appConfig.groundRules.enabled) return;
    await classifySingleNode();
}
