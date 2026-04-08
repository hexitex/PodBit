/**
 * PODBIT v0.5 - RESEARCH BRIEF FRAMEWORK
 *
 * Research brief generation through decomposition and verification.
 * Produces structured knowledge synthesis reports from graph data.
 */

import { query, queryOne } from '../core.js';
import * as crypto from 'crypto';

import { decompose } from './decompose.js';
import { generateSection, KnowledgeAccumulator } from './generate.js';
import { checkCoherence } from './verify.js';
import { assemble } from './assemble.js';

// Re-export all sub-modules
export { defaultTemplates, loadDefaultTemplates } from './templates.js';
export { decompose } from './decompose.js';
export { generateSection, KnowledgeAccumulator } from './generate.js';
export { verifySection, checkCoherence } from './verify.js';
export { assemble } from './assemble.js';

// =============================================================================
// MAIN SCAFFOLD FUNCTION
// =============================================================================

/**
 * Generate a complete research brief document.
 *
 * End-to-end pipeline:
 * 1. Fetch seed knowledge from the graph using the request or explicit query
 * 2. Decompose the request into a structured outline (template-based or LLM-generated)
 * 3. Generate each section via iterative LLM research and writing with verification
 * 4. Check cross-section coherence (terminology consistency, contradictions, conclusion coverage)
 * 5. Assemble sections into a final markdown document
 *
 * Supports resuming from a saved job ID (skips already-completed sections).
 * Progress is persisted to `scaffold_jobs` table after each section.
 *
 * @param request - The research request/question to address
 * @param taskType - Template type key (e.g., 'research_brief', 'knowledge_synthesis', 'technical_report')
 * @param options - Generation options
 * @param options.knowledgeQuery - Explicit query for initial knowledge fetch (defaults to request)
 * @param options.domains - Restrict knowledge search to specific domains
 * @param options.terminology - Term definitions for consistent usage across sections
 * @param options.resumeJobId - Job ID to resume from (skips completed sections)
 * @param options.tier - Model tier override (reserved for future use)
 * @returns Object with success/partial status, jobId, assembled document, outline, sections,
 *          failed sections, coherence issues, and total knowledge nodes used
 */
export async function scaffold(request: string, taskType: string, options: Record<string, any> = {}) {
    const { knowledgeQuery = null, domains = null, terminology = {}, resumeJobId = null, tier = null } = options;

    console.error('Scaffolding:', taskType);
    console.error('Request:', request.slice(0, 100) + '...');

    // Check for resume: load existing job if resuming
    let jobId: string;
    let outline: any;
    const sections: Record<string, any> = {};
    const precedingSections: Record<string, any> = {};
    const failedSections: string[] = [];

    // 2. Seed the shared knowledge accumulator with an initial broad fetch
    //    Each section's research phase will add more nodes iteratively
    const accumulator = new KnowledgeAccumulator();
    let knowledgeNodes: any[] = [];
    const effectiveQuery = knowledgeQuery || request;
    const hasDomains = domains && domains.length > 0;
    try {
        const { fetchTopicNodes } = await import('../handlers/knowledge.js');
        knowledgeNodes = await fetchTopicNodes(effectiveQuery, null, 30, hasDomains ? domains : undefined);
        accumulator.add(knowledgeNodes);
        console.error(`Seeded accumulator with ${accumulator.size} nodes (query: ${knowledgeQuery ? 'explicit' : 'from request'}${hasDomains ? `, domains: ${domains.join(', ')}` : ', inferred domains'})`);
    } catch (err: any) {
        console.warn(`Knowledge fetch failed: ${err.message} — proceeding without graph data`);
    }

    if (resumeJobId) {
        const existing = await queryOne('SELECT * FROM scaffold_jobs WHERE id = $1', [resumeJobId]);
        if (!existing) {
            throw new Error(`Scaffold job not found: ${resumeJobId}`);
        }
        jobId = existing.id;
        outline = typeof existing.outline === 'string' ? JSON.parse(existing.outline) : existing.outline;
        const savedSections = typeof existing.sections === 'string' ? JSON.parse(existing.sections) : existing.sections;
        Object.assign(sections, savedSections);
        Object.assign(precedingSections, savedSections);
        console.error(`Resuming job ${jobId} with ${Object.keys(sections).length} completed sections`);
    } else {
        // 1. Decompose (with knowledge summary so outline matches available data)
        console.error('Decomposing...');
        const seedNodes = accumulator.all();
        const knowledgeSummary = seedNodes.length > 0
            ? seedNodes.map((n: any) => `- [${n.domain || 'unknown'}] ${n.content.slice(0, 120)}`).join('\n')
            : null;
        outline = await decompose(request, taskType, { knowledgeSummary });
        console.error(`Created outline with ${outline.sections.length} sections`);

        // Create the job record
        jobId = crypto.randomUUID();
        await query(
            `INSERT INTO scaffold_jobs (id, request, task_type, outline, sections, status)
             VALUES ($1, $2, $3, $4, '{}', 'in_progress')`,
            [jobId, request, taskType, JSON.stringify(outline)]
        );
        console.error(`Created scaffold job: ${jobId}`);
    }

    // 3. Generate each section (skip already-completed ones on resume)
    for (const sectionDef of outline.sections) {
        if (sections[sectionDef.id]) {
            console.error(`Skipping already-completed section: ${sectionDef.title}`);
            continue;
        }

        console.error(`Generating section: ${sectionDef.title}`);

        const result = await generateSection(outline, sectionDef.id, {
            precedingSections,
            terminology,
            domains: hasDomains ? domains : undefined,
            accumulator,
        });

        if (result.failed) {
            console.error(`  ✗ Section "${sectionDef.title}" failed`);
            failedSections.push(sectionDef.id);
            // Persist the failure status but continue with remaining sections
            await query(
                `UPDATE scaffold_jobs SET error = $1, updated_at = datetime('now') WHERE id = $2`,
                [`Section "${sectionDef.title}" failed: ${result.verification.failures[0]?.message}`, jobId]
            );
            continue;
        }

        sections[sectionDef.id] = result.content;
        precedingSections[sectionDef.id] = result.content;

        // Persist this section immediately
        await query(
            `UPDATE scaffold_jobs SET sections = $1, updated_at = datetime('now') WHERE id = $2`,
            [JSON.stringify(sections), jobId]
        );

        console.error(`  ✓ ${result.verification.wordCount} words, ${result.attempts} attempts (saved to db)`);
    }

    // 4. Coherence check (only on completed sections)
    const completedSections = Object.fromEntries(
        Object.entries(sections).filter(([id]) => !failedSections.includes(id))
    );

    let issues: any[] = [];
    if (Object.keys(completedSections).length > 1) {
        console.error('Checking coherence...');
        issues = await checkCoherence(completedSections, outline);

        if (issues.length > 0) {
            console.error(`Found ${issues.length} coherence issues, fixing...`);

            for (const issue of issues) {
                if (issue.section && !failedSections.includes(issue.section)) {
                    const sectionDef = outline.sections.find((s: any) => s.id === issue.section);
                    if (sectionDef) {
                        const result = await generateSection(outline, issue.section, {
                            precedingSections,
                            terminology,
                            domains: hasDomains ? domains : undefined,
                            accumulator,
                            coherenceIssue: issue,
                        });
                        if (!result.failed) {
                            sections[issue.section] = result.content;
                            // Persist coherence fix
                            await query(
                                `UPDATE scaffold_jobs SET sections = $1, updated_at = datetime('now') WHERE id = $2`,
                                [JSON.stringify(sections), jobId]
                            );
                        }
                    }
                }
            }
        }
    }

    // 5. Assemble
    console.error('Assembling document...');
    const document = assemble(sections, outline);

    // 6. Update job status
    const finalStatus = failedSections.length === 0 ? 'completed'
        : Object.keys(sections).length > 0 ? 'partial'
        : 'failed';

    await query(
        `UPDATE scaffold_jobs SET sections = $1, status = $2, updated_at = datetime('now') WHERE id = $3`,
        [JSON.stringify(sections), finalStatus, jobId]
    );

    console.error(`Scaffold job ${jobId} finished with status: ${finalStatus} (${accumulator.size} total knowledge nodes used)`);

    return {
        success: failedSections.length === 0,
        partial: failedSections.length > 0 && Object.keys(sections).length > 0,
        jobId,
        document,
        outline,
        sections,
        failedSections,
        coherenceIssues: issues,
        knowledgeNodesUsed: accumulator.size,
    };
}
