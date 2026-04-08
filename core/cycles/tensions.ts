/**
 * @module core/cycles/tensions
 *
 * Autonomous Tension Cycle.
 *
 * Detects contradictions between node pairs (tensions), generates research
 * questions from them, and creates question nodes. Respects a cap on pending
 * unanswered questions to avoid backlog buildup.
 */

import { queryOne } from '../../db.js';
import { config as appConfig } from '../../config.js';
import { findTensions, generateQuestion, createQuestionNode } from '../tensions.js';
import { getExcludedDomainsForCycle } from '../governance.js';
import { emitActivity } from '../../services/event-bus.js';
import type { ResonanceNode } from '../types.js';

/**
 * One tick of the tension cycle: finds contradictions between node pairs,
 * generates research questions, and creates question nodes.
 *
 * Guards:
 * - Skips if pending unanswered questions exceed `maxPendingQuestions`
 * - Filters out tensions involving domains excluded from the tensions cycle
 * - Skips pairs that already have a question node linking them
 * - Stops after `maxQuestionsPerCycle` questions or when pending cap is reached
 *
 * @returns Resolves when the tick completes
 */
async function runTensionCycleSingle(): Promise<void> {
    const cfg = appConfig.autonomousCycles.tensions;

    // Check how many unanswered questions already exist — don't create more if backlogged.
    // A question is "answered" if it either has a voiced child node (edge-based) OR
    // has metadata.answered = true (set by the autonomous question-answering cycle).
    const maxPending = cfg.maxPendingQuestions ?? 10;
    const pendingCount = await queryOne(`
        SELECT COUNT(*) as cnt FROM nodes q
        LEFT JOIN edges e ON e.source_id = q.id AND e.edge_type = 'parent'
        LEFT JOIN nodes ans ON ans.id = e.target_id AND ans.node_type = 'voiced' AND ans.archived = FALSE
        WHERE q.archived = FALSE
          AND q.lab_status IS NULL
          AND q.node_type = 'question'
          AND ans.id IS NULL
          AND (q.metadata IS NULL OR json_extract(q.metadata, '$.answered') IS NOT 1)
    `);
    const pending = (pendingCount as any)?.cnt ?? 0;
    if (pending >= maxPending) {
        console.error(`[tensions] Skipping — ${pending} unanswered questions already pending (cap: ${maxPending})`);
        emitActivity('cycle', 'tensions_backlogged', `Tensions skipped: ${pending} questions pending (cap: ${maxPending})`, { pending, maxPending });
        return;
    }

    // Find tensions, then filter out any involving domains excluded from the tensions cycle
    const allTensions = await findTensions(cfg.maxQuestionsPerCycle * 3);
    const excludedDomains = await getExcludedDomainsForCycle('tensions');
    const tensions = excludedDomains.size > 0
        ? allTensions.filter(t =>
            !excludedDomains.has(t.nodeA.domain ?? '') &&
            !excludedDomains.has(t.nodeB.domain ?? ''))
        : allTensions;

    if (tensions.length === 0) return;

    let questionsCreated = 0;

    for (const tension of tensions) {
        if (questionsCreated >= cfg.maxQuestionsPerCycle) break;
        if (pending + questionsCreated >= maxPending) break;

        // Check if a question already exists for this pair
        const existingQuestion = await queryOne(`
            SELECT q.id FROM nodes q
            JOIN edges e1 ON e1.target_id = q.id AND e1.source_id = $1
            JOIN edges e2 ON e2.target_id = q.id AND e2.source_id = $2
            WHERE q.node_type = 'question' AND q.archived = FALSE
            LIMIT 1
        `, [tension.nodeA.id, tension.nodeB.id]);

        if (existingQuestion) continue;

        // Load full nodes for question generation
        const nodeA = await queryOne('SELECT * FROM nodes WHERE id = $1', [tension.nodeA.id]) as ResonanceNode;
        const nodeB = await queryOne('SELECT * FROM nodes WHERE id = $1', [tension.nodeB.id]) as ResonanceNode;
        if (!nodeA || !nodeB) continue;

        // Generate research question
        const question = await generateQuestion(nodeA, nodeB, tension.signals);

        // Create question node
        const questionNode = await createQuestionNode(nodeA, nodeB, question, {
            contributor: 'tension-cycle',
        });

        // Dedup gate may return null
        if (!questionNode) continue;

        questionsCreated++;
        console.error(`[tensions] → Created question ${questionNode.id.slice(0, 8)}: ${question.slice(0, 60)}`);
        emitActivity('cycle', 'tension_question', `New question from tension: "${question.slice(0, 60)}..."`, { questionId: questionNode.id, nodeAId: nodeA.id, nodeBId: nodeB.id });
    }

    if (questionsCreated > 0) {
        console.error(`[tensions] Created ${questionsCreated} research questions`);
        emitActivity('cycle', 'tensions_complete', `Created ${questionsCreated} research question(s)`, { count: questionsCreated });
    }
}

export { runTensionCycleSingle };
