/**
 * @module scaffold/decompose
 *
 * Request decomposition into structured outlines for research brief generation.
 *
 * Supports two modes: template-based (validates fit via LLM, then maps template
 * sections) and model-generated (LLM creates a custom outline from scratch).
 * Templates are looked up from the `templates` DB table by task type.
 */
import { queryOne } from '../core.js';
import { getPrompt } from '../prompts.js';
import * as crypto from 'crypto';

// =============================================================================
// JSON EXTRACTION UTILITY
// =============================================================================

/**
 * Extract and parse JSON from an LLM response string.
 *
 * Handles common formatting: markdown code blocks (` ```json ... ``` `),
 * raw JSON objects with surrounding text, and plain JSON. Falls back to
 * greedy extraction from first `{` to last `}`.
 *
 * @param response - Raw LLM response text potentially containing JSON
 * @returns Parsed JSON object
 * @throws Error if no valid JSON can be extracted or parsed
 */
function extractJSON(response: string): any {
    let jsonString = response.trim();

    // Try to extract from markdown code block first
    const codeBlockMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
    } else {
        // Fall back to regex extraction (greedy match from first { to last })
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonString = jsonMatch[0];
        }
    }

    try {
        return JSON.parse(jsonString);
    } catch (parseError: any) {
        console.error('Failed to parse JSON from LLM response');
        console.error('Raw response:', response.slice(0, 500));
        console.error('Extracted string:', jsonString.slice(0, 500));
        throw new Error(`JSON parse error: ${parseError.message}\n\nLLM returned:\n${response.slice(0, 200)}...`);
    }
}

// =============================================================================
// DECOMPOSITION
// =============================================================================

/**
 * Decompose a research request into a structured outline.
 *
 * Attempts to find a matching template for the task type. If found, validates
 * the template's fit via an LLM call; if validated, uses the template's section
 * structure. If no template exists or the template is rejected, generates a
 * custom outline via LLM.
 *
 * @param request - The research request/question to decompose
 * @param taskType - Template type key for template lookup
 * @param options - Decomposition options
 * @param options.template - Explicit template object (bypasses DB lookup)
 * @param options.knowledgeSummary - Summary of available graph knowledge to inform outline structure
 * @returns Outline object with id, request, taskType, templateId, sections array, and created_at
 */
export async function decompose(request: string, taskType: string, options: Record<string, any> = {}) {
    const { template = null, knowledgeSummary = null } = options;
    const { callSubsystemModel } = await import('../models.js');
    const { config } = await import('../config.js');

    // Try to find a template for this task type
    let templateData = template;
    if (!templateData) {
        templateData = await queryOne(`
            SELECT * FROM templates WHERE task_type = $1 LIMIT 1
        `, [taskType]);
    }

    // Validate template fits request using LLM
    if (templateData) {
        console.error(`Found template: ${templateData.name}, validating fit...`);

        const validationPrompt = await getPrompt('docs.template_validation', {
            request,
            taskType,
            templateName: templateData.name,
            templateSections: JSON.stringify(templateData.outline_schema?.sections?.map((s: any) => s.title || s.id) || []),
        });

        try {
            const validation = await callSubsystemModel('docs', validationPrompt, {});
            const isValid = validation.toLowerCase().includes('yes');

            if (isValid) {
                console.error('Template validated, using template');
                return decomposeWithTemplate(request, templateData);
            } else {
                console.error('Template rejected, generating custom outline');
            }
        } catch (_err: any) {
            console.warn('Template validation failed, using template anyway');
            return decomposeWithTemplate(request, templateData);
        }
    }

    // Generate outline with model (either no template or template rejected)
    return decomposeWithModel(request, taskType, knowledgeSummary);
}

/**
 * Build an outline from a validated template's section schema.
 *
 * @param request - The original research request
 * @param template - Template with outline_schema and section_defaults
 * @returns Outline object with sections mapped from the template schema
 */
async function decomposeWithTemplate(request: string, template: any) {
    const schema = typeof template.outline_schema === 'string'
        ? JSON.parse(template.outline_schema)
        : template.outline_schema;

    const sections = schema.sections.map((section: any, idx: number) => ({
        id: `section_${idx + 1}`,
        ...section,
        // Merge with template defaults
        constraints: {
            ...template.section_defaults,
            ...section.constraints
        }
    }));

    return {
        id: crypto.randomUUID(),
        request,
        taskType: template.task_type,
        templateId: template.id,
        sections,
        created_at: new Date()
    };
}

/**
 * Generate a custom outline via LLM when no template is available or suitable.
 *
 * @param request - The research request/question
 * @param taskType - The task type label for the prompt
 * @param knowledgeSummary - Optional summary of available graph knowledge for context
 * @returns Outline object with LLM-generated sections
 */
async function decomposeWithModel(request: string, taskType: string, knowledgeSummary: string | null = null) {
    const { callSubsystemModel } = await import('../models.js');

    const knowledgeContext = knowledgeSummary
        ? `\nAvailable knowledge from the graph (${knowledgeSummary.split('\n').length} nodes):\n${knowledgeSummary}\n`
        : '';

    const prompt = await getPrompt('docs.outline_decomposition', {
        taskType,
        request,
        knowledgeContext,
    });

    const raw = await callSubsystemModel('docs', prompt);
    const outline = extractJSON(raw);

    return {
        id: crypto.randomUUID(),
        request,
        taskType,
        templateId: null,
        sections: outline.sections,
        created_at: new Date()
    };
}
