/**
 * @module scaffold/templates
 *
 * Default research brief templates and database loading.
 *
 * Defines three built-in templates: research_brief, knowledge_synthesis, and
 * technical_report. Each template specifies section structure (title, purpose,
 * length constraints, required/forbidden content) and section defaults (tone,
 * must_avoid). Templates are upserted into the `templates` DB table on startup.
 */
import { query } from '../core.js';

/** Built-in research brief templates keyed by task type. */
export const defaultTemplates = {
    research_brief: {
        task_type: 'research_brief',
        name: 'Research Brief',
        outline_schema: {
            sections: [
                {
                    id: 'landscape',
                    title: 'What the Sources Establish',
                    purpose: 'Extract the core claims and key facts across all sources — what do we actually know?',
                    length: { min: 300, max: 600 },
                    must_include: ['key claims', 'evidence strength']
                },
                {
                    id: 'tensions',
                    title: 'Tensions & Contradictions',
                    purpose: 'Where do the sources disagree or create tension? These contradictions are where unknown knowledge hides.',
                    length: { min: 300, max: 600 },
                    must_include: ['contradictions', 'competing claims']
                },
                {
                    id: 'connections',
                    title: 'Non-Obvious Connections',
                    purpose: 'What is the strongest connection between any two sources that is not immediately apparent? Cross-domain patterns, shared structures, unexpected bridges.',
                    length: { min: 200, max: 500 },
                    must_include: ['cross-cutting patterns', 'hidden links']
                },
                {
                    id: 'gaps',
                    title: 'What\'s Missing',
                    purpose: 'What would one more source need to cover to fill the gaps? Identify the absent knowledge that would change the picture. Each gap is a potential research seed.',
                    length: { min: 200, max: 400 },
                    must_include: ['knowledge gaps', 'research seeds']
                },
                {
                    id: 'confidence',
                    title: 'Confidence Landscape',
                    purpose: 'Which claims are well-supported by multiple sources vs. thinly evidenced or inferred? Where should trust be high vs. low?',
                    length: { min: 150, max: 300 },
                    must_include: ['well-supported claims', 'weak evidence']
                }
            ]
        },
        section_defaults: {
            tone: 'direct and precise — no academic ceremony, no hedging for the sake of hedging',
            must_avoid: ['methodology descriptions', 'source selection narratives', 'prescriptive recommendations unless asked', 'vague generalizations']
        }
    },

    knowledge_synthesis: {
        task_type: 'knowledge_synthesis',
        name: 'Knowledge Synthesis Report',
        outline_schema: {
            sections: [
                {
                    id: 'abstract',
                    title: 'Summary',
                    purpose: 'Dense summary: what was found, what conflicts, what is missing',
                    length: { min: 100, max: 200 },
                    generate_last: true
                },
                {
                    id: 'foundations',
                    title: 'Established Ground',
                    purpose: 'Core facts and claims that the sources agree on — the solid ground to build from',
                    length: { min: 300, max: 500 },
                    must_include: ['consensus claims', 'foundational facts']
                },
                {
                    id: 'synthesis',
                    title: 'Emergent Connections',
                    purpose: 'Novel connections and patterns that emerge from reading the sources together — things no single source says but the combination reveals',
                    length: { min: 400, max: 800 },
                    must_include: ['cross-domain patterns', 'emergent insights']
                },
                {
                    id: 'fault_lines',
                    title: 'Fault Lines',
                    purpose: 'Where the synthesis breaks down — contradictions between sources, unresolved tensions, claims that cannot both be true',
                    length: { min: 200, max: 400 },
                    must_include: ['contradictions', 'unresolved tensions']
                },
                {
                    id: 'gaps',
                    title: 'Blind Spots',
                    purpose: 'What the sources collectively fail to address. Each blind spot is a research seed — a question the graph should pursue.',
                    length: { min: 150, max: 300 },
                    must_include: ['missing knowledge', 'research questions']
                }
            ]
        },
        section_defaults: {
            tone: 'direct and analytical — state what you found, not how you found it',
            must_avoid: ['methodology descriptions', 'academic hedging', 'prescriptive advice']
        }
    },

    technical_report: {
        task_type: 'technical_report',
        name: 'Technical Report',
        outline_schema: {
            sections: [
                {
                    id: 'state_of_play',
                    title: 'State of Play',
                    purpose: 'What do the sources collectively establish about this topic? Core facts, current understanding, key mechanisms.',
                    length: { min: 400, max: 800 },
                    must_include: ['key facts', 'current state']
                },
                {
                    id: 'tensions',
                    title: 'Tensions & Trade-offs',
                    purpose: 'Where do sources conflict or describe inherent trade-offs? What competing approaches or claims exist?',
                    length: { min: 300, max: 600 },
                    must_include: ['conflicts', 'trade-offs']
                },
                {
                    id: 'connections',
                    title: 'Cross-Cutting Patterns',
                    purpose: 'Patterns that appear across multiple sources or domains. Shared structures, analogies, unexpected parallels.',
                    length: { min: 200, max: 500 },
                    must_include: ['patterns', 'parallels']
                },
                {
                    id: 'gaps',
                    title: 'Open Questions',
                    purpose: 'What the sources do not answer. Gaps in coverage, untested assumptions, areas where evidence is thin. Each gap is a research seed.',
                    length: { min: 200, max: 400 },
                    must_include: ['unanswered questions', 'evidence gaps']
                }
            ]
        },
        section_defaults: {
            tone: 'direct and technical — say what the sources say, flag what they contradict, identify what they miss',
            must_avoid: ['methodology sections', 'source selection narratives', 'unsolicited recommendations', 'academic ceremony']
        }
    }
};

/**
 * Load default research brief templates into the database.
 *
 * Upserts each template from `defaultTemplates` into the `templates` table.
 * Uses `ON CONFLICT` to update existing entries, preserving any custom verifiers.
 */
export async function loadDefaultTemplates() {
    for (const [_key, template] of Object.entries(defaultTemplates)) {
        await query(`
            INSERT INTO templates (task_type, name, outline_schema, section_defaults, verifiers)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (task_type) DO UPDATE SET
                name = $2,
                outline_schema = $3,
                section_defaults = $4
        `, [
            template.task_type,
            template.name,
            JSON.stringify(template.outline_schema),
            JSON.stringify(template.section_defaults),
            JSON.stringify((template as any).verifiers || {})
        ]);
    }
    console.error('Loaded default templates');
}
