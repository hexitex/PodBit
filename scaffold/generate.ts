/**
 * @module scaffold/generate
 *
 * Section content generation for research briefs.
 *
 * Each section goes through a research phase (LLM iteratively proposes queries,
 * system fetches knowledge nodes) followed by a generation phase (LLM writes
 * the section content with verification and retry). A shared KnowledgeAccumulator
 * deduplicates nodes across sections.
 */
import { getPrompt } from '../prompts.js';
import { buildProvenanceTag } from '../core/provenance.js';
import { verifySection } from './verify.js';

/** Document-level knowledge accumulator — deduplicates across all sections. */
export class KnowledgeAccumulator {
    private nodesByContent = new Map<string, any>();

    /** Add nodes, returning only the newly added ones (deduped). */
    add(nodes: any[]): any[] {
        const fresh: any[] = [];
        for (const node of nodes) {
            if (!this.nodesByContent.has(node.content)) {
                this.nodesByContent.set(node.content, node);
                fresh.push(node);
            }
        }
        return fresh;
    }

    /** All accumulated nodes. */
    all(): any[] {
        return Array.from(this.nodesByContent.values());
    }

    /** Format all nodes with K-labels and provenance. */
    format(): string {
        return this.all().map((n, i) => {
            const label = `[K${i + 1}]`;
            return `${label} ${buildProvenanceTag(n)} ${n.content}`;
        }).join('\n');
    }

    get size(): number {
        return this.nodesByContent.size;
    }
}

/**
 * Run the iterative research phase for a section.
 *
 * The LLM examines what knowledge is currently available and proposes search
 * queries to fill gaps. Each round executes up to 5 queries, adds new nodes
 * to the accumulator, and repeats until the LLM signals it has enough data,
 * no new nodes are found, or maxRounds is reached.
 *
 * @param section - The section definition (title, purpose, must_include)
 * @param accumulator - Shared knowledge accumulator (nodes added in place)
 * @param options - Research options
 * @param options.domains - Restrict knowledge queries to specific domains
 * @param options.maxRounds - Maximum research iterations (default: 5)
 */
async function researchForSection(
    section: any,
    accumulator: KnowledgeAccumulator,
    options: { domains?: string[]; maxRounds?: number },
): Promise<void> {
    const { domains, maxRounds = 5 } = options;
    const { callSubsystemModel } = await import('../models.js');
    const { fetchTopicNodes } = await import('../handlers/knowledge.js');
    const { getPrompt: gp } = await import('../prompts.js');

    const mustInclude = (section.must_include || []).join(', ');

    for (let round = 0; round < maxRounds; round++) {
        // Show what we have so far
        const currentKnowledge = accumulator.size > 0
            ? `You currently have ${accumulator.size} knowledge nodes. Here are the topics covered:\n${accumulator.all().map((n, i) => `  [K${i + 1}] ${n.domain || '?'}: ${n.content.slice(0, 80)}...`).join('\n')}`
            : 'You have no knowledge nodes yet.';

        const researchPrompt = await gp('docs.section_research', {
            sectionTitle: section.title,
            purpose: section.purpose || '',
            mustInclude: mustInclude || 'none specified',
            currentKnowledge,
            round: String(round + 1),
            maxRounds: String(maxRounds),
        });

        let raw: string;
        try {
            raw = await callSubsystemModel('docs', researchPrompt);
        } catch (err: any) {
            console.error(`  Research round ${round + 1} LLM call failed: ${err.message}`);
            break;
        }

        // Parse response: expect JSON with { queries: string[] } or { done: true }
        let parsed: any;
        try {
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { done: true };
        } catch {
            console.error(`  Research round ${round + 1}: could not parse LLM response as JSON, stopping research`);
            break;
        }

        if (parsed.done || !parsed.queries || parsed.queries.length === 0) {
            console.error(`  Research complete after ${round + 1} round(s) — LLM has enough knowledge`);
            break;
        }

        // Execute each query
        let totalNew = 0;
        for (const q of parsed.queries.slice(0, 5)) {  // cap at 5 queries per round
            try {
                const nodes = await fetchTopicNodes(q, section.purpose || section.title, 15, domains);
                const fresh = accumulator.add(nodes);
                totalNew += fresh.length;
            } catch (err: any) {
                console.error(`  Query "${q}" failed: ${err.message}`);
            }
        }

        console.error(`  Research round ${round + 1}: ${parsed.queries.length} queries → +${totalNew} new nodes (${accumulator.size} total)`);

        // If no new nodes were found, no point continuing
        if (totalNew === 0) {
            console.error(`  No new nodes found, ending research`);
            break;
        }
    }
}

/**
 * Generate one section's content via LLM from the outline and accumulated knowledge.
 *
 * Runs the research phase to gather knowledge, builds section constraints from
 * the outline definition and context, then generates content with a retry loop
 * (up to maxAttempts). Each attempt is verified against constraints; failures
 * are fed back to the LLM for correction.
 *
 * @param outline - The full document outline (used to find the section definition)
 * @param sectionId - The section ID to generate
 * @param options - Generation options
 * @param options.precedingSections - Content of already-generated sections for context
 * @param options.knowledgeNodes - Fallback knowledge nodes (used only if no accumulator)
 * @param options.terminology - Term definitions for consistent usage
 * @param options.domains - Domain filter for knowledge queries
 * @param options.accumulator - Shared KnowledgeAccumulator (created if not provided)
 * @param options.maxAttempts - Maximum generation attempts (default: 3)
 * @param options.coherenceIssue - Coherence issue to fix (for re-generation passes)
 * @returns Object with sectionId, content, verification result, attempts count, and optional failed flag
 * @throws Error if the section ID is not found in the outline
 */
export async function generateSection(outline: any, sectionId: string, options: Record<string, any> = {}) {
    const {
        precedingSections = {},
        knowledgeNodes = [],
        terminology = {},
        domains,
        accumulator,
        maxAttempts = 3,
    } = options;

    const section = outline.sections.find((s: any) => s.id === sectionId);
    if (!section) {
        throw new Error(`Section not found: ${sectionId}`);
    }

    // Use shared accumulator (seeded with global nodes by caller)
    const acc: KnowledgeAccumulator = accumulator || new KnowledgeAccumulator();
    if (!accumulator) {
        // Fallback: seed with whatever was passed directly
        acc.add(knowledgeNodes);
    }

    // Research phase: LLM iteratively queries for what it needs
    await researchForSection(section, acc, { domains });

    // Build constraints with all accumulated knowledge
    const constraints = buildSectionConstraints(section, {
        precedingSections,
        knowledgeNodes: acc.all(),
        terminology
    });

    // Generate with retry loop
    let content: any;
    let verification: any;
    let attempt = 0;

    while (attempt < maxAttempts) {
        attempt++;

        try {
            content = await generateSectionContent(section, constraints, {
                attempt,
                previousFailures: verification?.failures || [],
            });
        } catch (err: any) {
            console.error(`Section ${sectionId} attempt ${attempt} model call failed: ${err.message}`);
            return {
                sectionId,
                content: null,
                verification: { valid: false, failures: [{ type: 'model_failure', message: err.message }], wordCount: 0 },
                attempts: attempt,
                failed: true
            };
        }

        verification = verifySection(content, constraints);

        if (verification.valid) {
            break;
        }

        console.error(`Section ${sectionId} attempt ${attempt} failed verification:`, verification.failures);
    }

    return {
        sectionId,
        content,
        verification,
        attempts: attempt
    };
}

/**
 * Build the constraint object for section generation from section definition and context.
 *
 * @param section - Section definition (purpose, length, must_include, must_avoid, tone)
 * @param context - Context with precedingSections, knowledgeNodes, and terminology
 * @returns Constraint object with all fields needed by the generation prompt
 */
function buildSectionConstraints(section: any, context: any) {
    const { precedingSections, knowledgeNodes, terminology } = context;

    // Format knowledge nodes with labels, domain, and type for citation
    const formattedKnowledge = knowledgeNodes.map((n: any, i: number) => {
        const label = `[K${i + 1}]`;
        return `${label} ${buildProvenanceTag(n)} ${n.content}`;
    }).join('\n');

    return {
        // From section definition
        purpose: section.purpose,
        length: section.length || { min: 600, max: 1500 },
        must_include: section.must_include || [],
        must_avoid: section.must_avoid || [],
        tone: section.tone || 'professional',

        // From context
        preceding_content: Object.entries(precedingSections)
            .map(([id, content]) => `[${id}]: ${(content as string).slice(0, 200)}...`)
            .join('\n'),
        knowledge: formattedKnowledge,
        knowledgeCount: knowledgeNodes.length,
        terminology
    };
}

/**
 * Generate section content via a single LLM call using the 'docs' subsystem.
 *
 * Builds the prompt from the section definition, constraints, knowledge sources,
 * preceding section context, terminology definitions, and any previous failure
 * feedback for retry attempts.
 *
 * @param section - Section definition (title)
 * @param constraints - Built constraints (purpose, length, must_include, knowledge, etc.)
 * @param options - Generation state
 * @param options.attempt - Current attempt number (for retry feedback)
 * @param options.previousFailures - Array of failure objects from prior attempts
 * @returns Raw LLM response text (the section content)
 */
async function generateSectionContent(section: any, constraints: any, options: Record<string, any> = {}) {
    const { attempt, previousFailures } = options;
    const { callSubsystemModel } = await import('../models.js');

    // Build conditional blocks as variables
    let knowledgeBlock = '';
    if (constraints.knowledge) {
        knowledgeBlock = `\n--- KNOWLEDGE SOURCES (${constraints.knowledgeCount} nodes) ---\n${constraints.knowledge}\n--- END SOURCES ---\n`;
    } else {
        knowledgeBlock = `\n--- NO KNOWLEDGE SOURCES PROVIDED ---\nNo graph knowledge was provided for this section. State clearly when making claims that are not grounded in provided sources.\n`;
    }

    let precedingBlock = '';
    if (constraints.preceding_content) {
        precedingBlock = `\nContext from previous sections:\n${constraints.preceding_content}\n`;
    }

    let terminologyBlock = '';
    if (Object.keys(constraints.terminology).length > 0) {
        terminologyBlock = `\nTerminology to use consistently:\n`;
        for (const [term, def] of Object.entries(constraints.terminology)) {
            terminologyBlock += `- ${term}: ${def}\n`;
        }
    }

    let failureBlock = '';
    if (attempt > 1 && previousFailures.length > 0) {
        failureBlock = `\nPrevious attempt failed. Fix these issues:\n`;
        for (const failure of previousFailures) {
            failureBlock += `- ${failure.type}: ${failure.message}\n`;
        }
    }

    const prompt = await getPrompt('docs.section_generation', {
        sectionTitle: section.title,
        purpose: constraints.purpose,
        lengthMin: String(constraints.length.min),
        lengthMax: String(constraints.length.max),
        mustInclude: constraints.must_include.join(', ') || 'none specified',
        tone: constraints.tone,
        knowledgeBlock,
        precedingBlock,
        terminologyBlock,
        failureBlock,
    });

    const raw = await callSubsystemModel('docs', prompt);
    return raw;
}
