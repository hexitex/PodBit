/**
 * @module core/cycles/questions
 *
 * Autonomous Question-Answering Cycle.
 *
 * Finds unanswered question nodes, gathers relevant context via embedding
 * similarity, calls the LLM to generate answers, and creates `voiced` answer
 * nodes linked back to the question and context sources.
 */

import { query, } from '../../db.js';
import { config as appConfig } from '../../config.js';
import { config } from '../engine-config.js';
import { createNode, createEdge } from '../node-ops.js';
import { getEmbedding, callSubsystemModel, getAssignedModel } from '../../models.js';
import { getPrompt } from '../../prompts.js';
import { getProjectContextBlock } from '../project-context.js';
import { cosineSimilarity, parseEmbedding } from '../scoring.js';
import { recordBirth } from '../lifecycle.js';
import { emitActivity } from '../../services/event-bus.js';
import { resolveContent } from '../number-variables.js';
import { buildProvenanceTag } from '../provenance.js';
import { getExcludedDomainsForCycle } from '../governance.js';
import type { ResonanceNode } from '../types.js';

/**
 * One tick of the question cycle: picks unanswered questions, finds relevant
 * context nodes via embedding similarity, generates voiced answers via LLM,
 * and creates answer nodes linked to the question and context sources.
 *
 * For each question in the batch:
 * 1. Loads tension source nodes (parents that spawned the question)
 * 2. Finds additional context nodes by embedding similarity
 * 3. Builds a context string with resolved number-variable placeholders
 * 4. Calls the voice subsystem with the question-answering prompt
 * 5. Creates a voiced answer node with parent edges and records birth
 * 6. Updates the question's metadata with answer details
 *
 * Questions with no context or failed LLM calls are deprioritized by
 * reducing their weight (bounded by `weightFloor`).
 *
 * @returns Resolves when all questions in the batch have been processed
 */
async function runQuestionCycleSingle(): Promise<void> {
    const cfg = appConfig.autonomousCycles.questions;

    // Find unanswered question nodes (no voiced children AND not already answered in metadata)
    const allQuestions = await query(`
        SELECT q.id, q.content, q.weight, q.domain, q.node_type, q.specificity, q.embedding, q.metadata
        FROM nodes q
        LEFT JOIN edges e ON e.source_id = q.id AND e.edge_type = 'parent'
        LEFT JOIN nodes ans ON ans.id = e.target_id AND ans.node_type = 'voiced' AND ans.archived = FALSE
        WHERE q.archived = FALSE
          AND q.lab_status IS NULL
          AND q.node_type = 'question'
          AND ans.id IS NULL
          AND (q.metadata IS NULL OR json_extract(q.metadata, '$.answered') IS NOT 1)
        ORDER BY q.weight DESC
        LIMIT $1
    `, [cfg.batchSize]);

    // Filter out questions in domains excluded from the questions cycle
    const excludedDomains = await getExcludedDomainsForCycle('questions');
    const questions = excludedDomains.size > 0
        ? allQuestions.filter((q: any) => !q.domain || !excludedDomains.has(q.domain))
        : allQuestions;

    if (questions.length === 0) return;

    console.error(`[questions] Answering ${questions.length} questions`);
    emitActivity('cycle', 'questions_batch', `Answering ${questions.length} question(s)`, { count: questions.length });

    for (const question of questions as ResonanceNode[]) {
        // 1. Get the question's tension source nodes (parents that spawned it)
        const tensionSources = await query(`
            SELECT n.id, n.content, n.weight, n.domain, n.node_type, n.specificity, n.embedding,
                   n.generation, n.contributor, n.origin, n.verification_status, n.verification_score
            FROM edges e JOIN nodes n ON n.id = e.source_id
            WHERE e.target_id = $1 AND n.archived = FALSE AND n.lab_status IS NULL
        `, [question.id]) as ResonanceNode[];

        // 2. Find additional relevant context nodes via embedding similarity
        const contextNodes: ResonanceNode[] = [...tensionSources];
        const contextIds = new Set(tensionSources.map(n => n.id));
        contextIds.add(question.id); // exclude the question itself

        if (question.embedding) {
            // Get candidate nodes from the same domain (or all if no domain)
            const domainClause = question.domain ? `AND n.domain = $1` : '';
            const domainParams = question.domain ? [question.domain] : [];
            const candidates = await query(`
                SELECT n.id, n.content, n.weight, n.domain, n.node_type, n.specificity, n.embedding,
                       n.generation, n.contributor, n.origin, n.verification_status, n.verification_score
                FROM nodes n
                WHERE n.archived = FALSE
                  AND n.lab_status IS NULL
                  AND n.embedding IS NOT NULL
                  AND n.node_type NOT IN ('question', 'raw')
                  ${domainClause}
                ORDER BY n.weight DESC
                LIMIT ${Math.floor(cfg.candidatePoolSize)}
            `, domainParams) as ResonanceNode[];

            // Score by embedding similarity to the question and take top relevant
            // Pre-parse question embedding once to avoid re-parsing per candidate
            const questionEmb = parseEmbedding(question.embedding);
            const scored: { node: ResonanceNode; similarity: number }[] = [];
            for (const candidate of candidates) {
                if (contextIds.has(candidate.id)) continue;
                const candEmb = parseEmbedding(candidate.embedding);
                const similarity = (questionEmb && candEmb)
                    ? cosineSimilarity(questionEmb, candEmb)
                    : 0;
                if (similarity > cfg.contextMinSimilarity) {
                    scored.push({ node: candidate, similarity });
                }
            }
            scored.sort((a, b) => b.similarity - a.similarity);

            // Take top N context nodes (plus tension sources already included)
            for (const { node } of scored.slice(0, cfg.contextTopN)) {
                if (!contextIds.has(node.id)) {
                    contextNodes.push(node);
                    contextIds.add(node.id);
                }
            }
        }

        if (contextNodes.length === 0) {
            console.error(`[questions] No context found for question ${question.id.slice(0, 8)}, deprioritizing`);
            await query(`UPDATE nodes SET weight = MAX(${appConfig.engine.weightFloor ?? 0.05}, weight - ${cfg.weightPenalty}) WHERE id = $1`, [question.id]);
            continue;
        }

        // 3. Build context string from gathered nodes — resolve variable placeholders
        const resolvedContextNodes = await Promise.all(
            contextNodes.map(n => resolveContent(n.content))
        );
        const contextStr = resolvedContextNodes
            .map((content, i) => `${i + 1}. ${buildProvenanceTag(contextNodes[i])} ${content}`)
            .join('\n');

        // 4. Call LLM with the question-answering prompt (enriched with project context)
        const resolvedQuestion = await resolveContent(question.content);
        const projectContext = await getProjectContextBlock();
        const baseQaPrompt = await getPrompt('core.question_answer', {
            question: resolvedQuestion,
            context: contextStr,
        });
        const prompt = projectContext ? `${projectContext}\n\n${baseQaPrompt}` : baseQaPrompt;

        const answerJsonSchema = {
            name: "question_answer",
            schema: {
                type: "object",
                properties: {
                    answer: { type: "string", description: "Answer to the research question in 50-100 words" },
                    answerable: { type: "boolean", description: "true if the knowledge is sufficient to answer, false if not" }
                },
                required: ["answer", "answerable"],
                additionalProperties: false
            }
        };

        let answerText: string;
        let answerable = true;
        try {
            const response = await callSubsystemModel('voice', prompt, {
                jsonSchema: answerJsonSchema,
            });

            // Parse JSON response
            try {
                const parsed = JSON.parse(response);
                answerText = parsed.answer || response;
                answerable = parsed.answerable !== false;
            } catch {
                // Fallback: use raw text
                answerText = response.replace(/^["']|["']$/g, '').trim();
            }
        } catch (err: any) {
            if (err.name === 'AbortError') throw err; // propagate to runCycleLoop
            console.error(`[questions] LLM call failed for question ${question.id.slice(0, 8)}: ${err.message}`);
            await query(`UPDATE nodes SET weight = MAX(${appConfig.engine.weightFloor ?? 0.05}, weight - ${cfg.weightPenalty}) WHERE id = $1`, [question.id]);
            continue;
        }

        // Unanswerable — archive the question so it's removed from the active graph
        if (!answerable) {
            console.error(`[questions] Unanswerable: ${question.id.slice(0, 8)} — archiving`);
            await query(`UPDATE nodes SET archived = 1 WHERE id = $1`, [question.id]);
            emitActivity('cycle', 'questions_archived', `Question unanswerable — archived: ${question.content.slice(0, 80)}`, { questionId: question.id, reason: 'unanswerable' });
            continue;
        }

        if (!answerText || answerText.length < 10) {
            console.error(`[questions] Empty/too-short answer for question ${question.id.slice(0, 8)}, deprioritizing`);
            await query(`UPDATE nodes SET weight = MAX(${appConfig.engine.weightFloor ?? 0.05}, weight - ${cfg.weightPenalty}) WHERE id = $1`, [question.id]);
            continue;
        }

        // 5. Create a voiced answer node
        const answerEmbedding = await getEmbedding(answerText);
        const voiceModel = getAssignedModel('voice' as any);
        const answer = await createNode(answerText, 'voiced', 'question-cycle', {
            domain: question.domain,
            contributor: 'question-cycle',
            embedding: answerEmbedding,
            weight: config.nodes.defaultWeight,
            modelId: voiceModel?.id ?? null,
            modelName: voiceModel?.name ?? null,
        });

        // Dedup gate may return null — deprioritize so other questions get a chance
        if (!answer) {
            console.error(`[questions] Answer deduplicated for question ${question.id.slice(0, 8)}, deprioritizing`);
            await query(`UPDATE nodes SET weight = MAX(${appConfig.engine.weightFloor ?? 0.05}, weight - ${cfg.weightPenalty}) WHERE id = $1`, [question.id]);
            continue;
        }

        // 6. Link answer to question and all context sources
        await createEdge(question.id, answer.id, 'parent', 1.0);
        for (const ctx of contextNodes) {
            await createEdge(ctx.id, answer.id, 'parent', 0.5);
        }

        // 6b. Record birth so lifecycle tracks the answer as a child of the question
        const allParentIds = [question.id, ...contextNodes.map(c => c.id)];
        await recordBirth(answer.id, allParentIds);

        // 7. Mark the question as answered (metadata + validation fields for visibility)
        const existingMeta = question.metadata ? (typeof question.metadata === 'string' ? JSON.parse(question.metadata) : question.metadata) : {};
        const updatedMeta = {
            ...existingMeta,
            answered: true,
            answerId: answer.id,
            answeredAt: new Date().toISOString(),
            answerPreview: answerText.slice(0, 200),
            contextNodeCount: contextNodes.length,
        };
        await query(`UPDATE nodes SET metadata = $1 WHERE id = $2`, [JSON.stringify(updatedMeta), question.id]);

        console.error(`[questions] → Answered ${question.id.slice(0, 8)} using ${contextNodes.length} context nodes: ${answerText.slice(0, 80)}...`);
        emitActivity('cycle', 'question_answered', `Answered ${question.id.slice(0, 8)}: "${answerText.slice(0, 60)}..."`, {
            questionId: question.id,
            answerId: answer.id,
            contextNodes: contextNodes.length,
            domain: question.domain,
            modelId: voiceModel?.id ?? null,
            modelName: voiceModel?.name ?? null,
            answerLength: answerText.length,
            questionPreview: (question.content || '').slice(0, 100),
        });
    }
}

export { runQuestionCycleSingle };
