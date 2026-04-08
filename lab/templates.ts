/**
 * Lab Template Registry
 *
 * CRUD operations for the `lab_templates` table. Templates define how lab
 * experiments are submitted, polled, interpreted, and how their results
 * affect the knowledge graph.
 *
 * System templates (math-lab, nn-training) are seeded on startup and
 * cannot be deleted by users.
 *
 * @module lab/templates
 */

import { query, queryOne } from '../db/sqlite-backend.js';
import type { LabTemplate, LabTemplateRow, ExecutionConfig, PollConfig, OutcomeConfig } from './types.js';

// =============================================================================
// ROW ↔ OBJECT CONVERSION
// =============================================================================

function rowToTemplate(row: LabTemplateRow): LabTemplate {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        systemTemplate: row.system_template === 1,
        executionConfig: row.execution_config ? JSON.parse(row.execution_config) : { url: '' },
        triageConfig: row.triage_config ? JSON.parse(row.triage_config) : null,
        pollConfig: row.poll_config ? JSON.parse(row.poll_config) : { strategy: 'none' },
        interpretConfig: row.interpret_config ? JSON.parse(row.interpret_config) : null,
        outcomeConfig: row.outcome_config ? JSON.parse(row.outcome_config) : {},
        evidenceSchema: row.evidence_schema ? JSON.parse(row.evidence_schema) : null,
        budgetConfig: row.budget_config ? JSON.parse(row.budget_config) : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

// =============================================================================
// CRUD
// =============================================================================

/** Get a template by ID. Returns null if not found. */
export async function getTemplate(id: string): Promise<LabTemplate | null> {
    const row = await queryOne('SELECT * FROM lab_templates WHERE id = $1', [id]) as LabTemplateRow | null;
    return row ? rowToTemplate(row) : null;
}

/**
 * Find a template that handles a given specType.
 * Searches `spec_types` JSON column for a match. Falls back to 'math-lab'.
 */
export async function getTemplateForSpecType(specType: string): Promise<LabTemplate> {
    // Find templates where spec_types JSON array contains this specType
    const rows = await query(
        `SELECT * FROM lab_templates
         WHERE spec_types IS NOT NULL
           AND spec_types LIKE $1
         ORDER BY system_template ASC
         LIMIT 1`,
        [`%"${specType}"%`]
    ) as LabTemplateRow[];

    if (rows.length > 0) {
        return rowToTemplate(rows[0]);
    }

    // Fallback to math-lab
    const fallback = await getTemplate('math-lab');
    if (fallback) return fallback;

    throw new Error(`No lab template found for specType "${specType}" and no math-lab fallback`);
}

/** List all templates. */
export async function listTemplates(): Promise<LabTemplate[]> {
    const rows = await query('SELECT * FROM lab_templates ORDER BY system_template DESC, name ASC') as LabTemplateRow[];
    return rows.map(rowToTemplate);
}

/** Create a new template. Returns the created template. */
export async function createTemplate(t: {
    id: string;
    name: string;
    description?: string;
    systemTemplate?: boolean;
    executionConfig: ExecutionConfig;
    triageConfig?: LabTemplate['triageConfig'];
    pollConfig: PollConfig;
    interpretConfig?: LabTemplate['interpretConfig'];
    outcomeConfig?: OutcomeConfig;
    evidenceSchema?: LabTemplate['evidenceSchema'];
    budgetConfig?: LabTemplate['budgetConfig'];
}): Promise<LabTemplate> {
    await query(
        `INSERT INTO lab_templates (id, name, description, system_template, execution_config, triage_config, poll_config, interpret_config, outcome_config, evidence_schema, budget_config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
            t.id,
            t.name,
            t.description ?? null,
            t.systemTemplate ? 1 : 0,
            JSON.stringify(t.executionConfig),
            t.triageConfig ? JSON.stringify(t.triageConfig) : null,
            JSON.stringify(t.pollConfig),
            t.interpretConfig ? JSON.stringify(t.interpretConfig) : null,
            t.outcomeConfig ? JSON.stringify(t.outcomeConfig) : JSON.stringify({}),
            t.evidenceSchema ? JSON.stringify(t.evidenceSchema) : null,
            t.budgetConfig ? JSON.stringify(t.budgetConfig) : null,
        ]
    );
    const created = await getTemplate(t.id);
    return created!;
}

/** Update a template. Only provided fields are changed. System templates can be updated. */
export async function updateTemplate(id: string, changes: Partial<{
    name: string;
    description: string;
    executionConfig: ExecutionConfig;
    triageConfig: LabTemplate['triageConfig'];
    pollConfig: PollConfig;
    interpretConfig: LabTemplate['interpretConfig'];
    outcomeConfig: OutcomeConfig;
    evidenceSchema: LabTemplate['evidenceSchema'];
    budgetConfig: LabTemplate['budgetConfig'];
}>): Promise<void> {
    const sets: string[] = [];
    const params: any[] = [];
    let n = 1;

    if (changes.name !== undefined) { sets.push(`name = $${n++}`); params.push(changes.name); }
    if (changes.description !== undefined) { sets.push(`description = $${n++}`); params.push(changes.description); }
    if (changes.executionConfig !== undefined) { sets.push(`execution_config = $${n++}`); params.push(JSON.stringify(changes.executionConfig)); }
    if (changes.triageConfig !== undefined) { sets.push(`triage_config = $${n++}`); params.push(changes.triageConfig ? JSON.stringify(changes.triageConfig) : null); }
    if (changes.pollConfig !== undefined) { sets.push(`poll_config = $${n++}`); params.push(JSON.stringify(changes.pollConfig)); }
    if (changes.interpretConfig !== undefined) { sets.push(`interpret_config = $${n++}`); params.push(changes.interpretConfig ? JSON.stringify(changes.interpretConfig) : null); }
    if (changes.outcomeConfig !== undefined) { sets.push(`outcome_config = $${n++}`); params.push(JSON.stringify(changes.outcomeConfig)); }
    if (changes.evidenceSchema !== undefined) { sets.push(`evidence_schema = $${n++}`); params.push(changes.evidenceSchema ? JSON.stringify(changes.evidenceSchema) : null); }
    if (changes.budgetConfig !== undefined) { sets.push(`budget_config = $${n++}`); params.push(changes.budgetConfig ? JSON.stringify(changes.budgetConfig) : null); }

    if (sets.length === 0) return;

    sets.push("updated_at = datetime('now')");
    params.push(id);
    await query(`UPDATE lab_templates SET ${sets.join(', ')} WHERE id = $${n}`, params);
}

/** Delete a template. System templates cannot be deleted. */
export async function deleteTemplate(id: string): Promise<boolean> {
    const row = await queryOne('SELECT system_template FROM lab_templates WHERE id = $1', [id]) as { system_template: number } | null;
    if (!row) return false;
    if (row.system_template === 1) {
        throw new Error(`Cannot delete system template "${id}"`);
    }
    await query('DELETE FROM lab_templates WHERE id = $1', [id]);
    return true;
}
