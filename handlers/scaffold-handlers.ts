/**
 * Scaffold handlers — research brief templates, decomposition, and generation.
 * @module handlers/scaffold-handlers
 */

import { query } from '../core.js';

/**
 * List available research brief templates, optionally filtered by task type.
 *
 * @param params - Object with optional `taskType` filter.
 * @returns `{ count, templates }` with section summaries.
 */
async function handleScaffoldTemplates(params: Record<string, any>) {
    const { taskType } = params;

    let sql = 'SELECT id, task_type, name, outline_schema FROM templates';
    const sqlParams = [];

    if (taskType) {
        sql += ' WHERE task_type = $1';
        sqlParams.push(taskType);
    }

    sql += ' ORDER BY name';

    const templates = await query(sql, sqlParams);

    return {
        count: templates.length,
        templates: templates.map(t => ({
            id: t.id,
            taskType: t.task_type,
            name: t.name,
            sections: typeof t.outline_schema === 'string'
                ? JSON.parse(t.outline_schema).sections?.map((s: any) => s.id || s.title)
                : t.outline_schema?.sections?.map((s: any) => s.id || s.title),
        })),
    };
}

/**
 * Break a request into a structured outline via scaffold decomposition.
 *
 * @param params - Object with `request` (text) and `taskType` (both required).
 * @returns `{ success, outline }` with section ids/titles/purposes, or `{ error }`.
 */
async function handleScaffoldDecompose(params: Record<string, any>) {
    const { request, taskType } = params;

    try {
        const { decompose } = await import('../scaffold.js');
        const outline = await decompose(request, taskType);

        return {
            success: true,
            outline: {
                id: outline.id,
                taskType: outline.taskType,
                templateId: outline.templateId,
                sections: outline.sections.map((s: any) => ({
                    id: s.id,
                    title: s.title,
                    purpose: s.purpose,
                    length: s.length,
                })),
            },
        };
    } catch (err: any) {
        return { error: err.message };
    }
}

/**
 * Generate a full research brief from a request using graph knowledge.
 *
 * Supports resuming partial jobs via `resumeJobId`. Enriches sections
 * with knowledge graph content when `knowledgeQuery`/`domains` are provided.
 *
 * @param params - Object with `request`, `taskType` (both required), optional
 *   `knowledgeQuery`, `domains`, `resumeJobId`.
 * @returns `{ success, partial, jobId, document, outline, failedSections, coherenceIssues }` or `{ error }`.
 */
async function handleScaffoldGenerate(params: Record<string, any>) {
    const { request, taskType, knowledgeQuery, domains, resumeJobId } = params;

    try {
        const { scaffold } = await import('../scaffold.js');
        const result = await scaffold(request, taskType, {
            knowledgeQuery,
            domains,
            resumeJobId,
        });

        return {
            success: result.success,
            partial: result.partial || false,
            jobId: result.jobId,
            document: result.document,
            outline: {
                sections: result.outline.sections.map((s: any) => ({
                    id: s.id,
                    title: s.title,
                })),
            },
            failedSections: result.failedSections || [],
            coherenceIssues: result.coherenceIssues,
        };
    } catch (err: any) {
        return { error: err.message };
    }
}

export { handleScaffoldTemplates, handleScaffoldDecompose, handleScaffoldGenerate };
