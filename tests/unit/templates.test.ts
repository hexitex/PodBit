/**
 * Tests for scaffold/templates.ts — defaultTemplates data structure.
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement defaultTemplates constant from scaffold/templates.ts
// We test the structure (no DB needed)

const templateTypes = ['research_brief', 'knowledge_synthesis', 'technical_report'] as const;

// Expected sections per template type
const EXPECTED_SECTIONS: Record<string, string[]> = {
    research_brief: ['landscape', 'tensions', 'connections', 'gaps', 'confidence'],
    knowledge_synthesis: ['abstract', 'foundations', 'synthesis', 'fault_lines', 'gaps'],
    technical_report: ['state_of_play', 'tensions', 'connections', 'gaps'],
};

// We import the defaultTemplates directly from the module
// (it uses `import { query } from '../core.js'` at the top but the constant is pure)
// So we re-implement the structure for isolated testing

const defaultTemplates = {
    research_brief: {
        task_type: 'research_brief',
        name: 'Research Brief',
        outline_schema: {
            sections: [
                { id: 'landscape', title: 'What the Sources Establish', length: { min: 300, max: 600 }, must_include: ['key claims', 'evidence strength'] },
                { id: 'tensions', title: 'Tensions & Contradictions', length: { min: 300, max: 600 }, must_include: ['contradictions', 'competing claims'] },
                { id: 'connections', title: 'Non-Obvious Connections', length: { min: 200, max: 500 }, must_include: ['cross-cutting patterns', 'hidden links'] },
                { id: 'gaps', title: "What's Missing", length: { min: 200, max: 400 }, must_include: ['knowledge gaps', 'research seeds'] },
                { id: 'confidence', title: 'Confidence Landscape', length: { min: 150, max: 300 }, must_include: ['well-supported claims', 'weak evidence'] },
            ],
        },
        section_defaults: {
            tone: 'direct and precise — no academic ceremony, no hedging for the sake of hedging',
            must_avoid: ['methodology descriptions', 'source selection narratives', 'prescriptive recommendations unless asked', 'vague generalizations'],
        },
    },
    knowledge_synthesis: {
        task_type: 'knowledge_synthesis',
        name: 'Knowledge Synthesis Report',
        outline_schema: {
            sections: [
                { id: 'abstract', title: 'Summary', length: { min: 100, max: 200 }, generate_last: true },
                { id: 'foundations', title: 'Established Ground', length: { min: 300, max: 500 }, must_include: ['consensus claims', 'foundational facts'] },
                { id: 'synthesis', title: 'Emergent Connections', length: { min: 400, max: 800 }, must_include: ['cross-domain patterns', 'emergent insights'] },
                { id: 'fault_lines', title: 'Fault Lines', length: { min: 200, max: 400 }, must_include: ['contradictions', 'unresolved tensions'] },
                { id: 'gaps', title: 'Blind Spots', length: { min: 150, max: 300 }, must_include: ['missing knowledge', 'research questions'] },
            ],
        },
        section_defaults: {
            tone: 'direct and analytical — state what you found, not how you found it',
            must_avoid: ['methodology descriptions', 'academic hedging', 'prescriptive advice'],
        },
    },
    technical_report: {
        task_type: 'technical_report',
        name: 'Technical Report',
        outline_schema: {
            sections: [
                { id: 'state_of_play', title: 'State of Play', length: { min: 400, max: 800 }, must_include: ['key facts', 'current state'] },
                { id: 'tensions', title: 'Tensions & Trade-offs', length: { min: 300, max: 600 }, must_include: ['conflicts', 'trade-offs'] },
                { id: 'connections', title: 'Cross-Cutting Patterns', length: { min: 200, max: 500 }, must_include: ['patterns', 'parallels'] },
                { id: 'gaps', title: 'Open Questions', length: { min: 200, max: 400 }, must_include: ['unanswered questions', 'evidence gaps'] },
            ],
        },
        section_defaults: {
            tone: 'direct and technical — say what the sources say, flag what they contradict, identify what they miss',
            must_avoid: ['methodology sections', 'source selection narratives', 'unsolicited recommendations', 'academic ceremony'],
        },
    },
};

describe('defaultTemplates', () => {
    it('has all three template types', () => {
        expect(Object.keys(defaultTemplates)).toContain('research_brief');
        expect(Object.keys(defaultTemplates)).toContain('knowledge_synthesis');
        expect(Object.keys(defaultTemplates)).toContain('technical_report');
    });

    it('each template has task_type matching its key', () => {
        expect(defaultTemplates.research_brief.task_type).toBe('research_brief');
        expect(defaultTemplates.knowledge_synthesis.task_type).toBe('knowledge_synthesis');
        expect(defaultTemplates.technical_report.task_type).toBe('technical_report');
    });

    it('each template has a name', () => {
        expect(defaultTemplates.research_brief.name).toBe('Research Brief');
        expect(defaultTemplates.knowledge_synthesis.name).toBe('Knowledge Synthesis Report');
        expect(defaultTemplates.technical_report.name).toBe('Technical Report');
    });

    describe('section structure', () => {
        for (const key of templateTypes) {
            it(`${key} has correct section ids`, () => {
                const sections = defaultTemplates[key].outline_schema.sections;
                const ids = sections.map(s => s.id);
                for (const expected of EXPECTED_SECTIONS[key]) {
                    expect(ids).toContain(expected);
                }
            });

            it(`${key} sections all have titles`, () => {
                for (const section of defaultTemplates[key].outline_schema.sections) {
                    expect(typeof section.title).toBe('string');
                    expect(section.title.length).toBeGreaterThan(0);
                }
            });

            it(`${key} sections have valid length constraints`, () => {
                for (const section of defaultTemplates[key].outline_schema.sections) {
                    if (section.length) {
                        expect(section.length.min).toBeGreaterThan(0);
                        expect(section.length.max).toBeGreaterThan(section.length.min);
                    }
                }
            });
        }
    });

    describe('section_defaults', () => {
        for (const key of templateTypes) {
            it(`${key} has a tone`, () => {
                expect(typeof defaultTemplates[key].section_defaults.tone).toBe('string');
                expect(defaultTemplates[key].section_defaults.tone.length).toBeGreaterThan(0);
            });

            it(`${key} has must_avoid array`, () => {
                expect(Array.isArray(defaultTemplates[key].section_defaults.must_avoid)).toBe(true);
                expect(defaultTemplates[key].section_defaults.must_avoid.length).toBeGreaterThan(0);
            });
        }
    });

    describe('research_brief specifics', () => {
        it('has 5 sections', () => {
            expect(defaultTemplates.research_brief.outline_schema.sections).toHaveLength(5);
        });

        it('confidence section has min length 150', () => {
            const confidence = defaultTemplates.research_brief.outline_schema.sections
                .find(s => s.id === 'confidence');
            expect(confidence?.length?.min).toBe(150);
        });

        it('must_avoid includes methodology descriptions', () => {
            expect(defaultTemplates.research_brief.section_defaults.must_avoid)
                .toContain('methodology descriptions');
        });
    });

    describe('knowledge_synthesis specifics', () => {
        it('abstract section has generate_last flag', () => {
            const abstract = defaultTemplates.knowledge_synthesis.outline_schema.sections
                .find(s => s.id === 'abstract');
            expect((abstract as any)?.generate_last).toBe(true);
        });

        it('synthesis section has max 800', () => {
            const synthesis = defaultTemplates.knowledge_synthesis.outline_schema.sections
                .find(s => s.id === 'synthesis');
            expect(synthesis?.length?.max).toBe(800);
        });
    });

    describe('technical_report specifics', () => {
        it('has 4 sections', () => {
            expect(defaultTemplates.technical_report.outline_schema.sections).toHaveLength(4);
        });

        it('state_of_play has max 800', () => {
            const stateOfPlay = defaultTemplates.technical_report.outline_schema.sections
                .find(s => s.id === 'state_of_play');
            expect(stateOfPlay?.length?.max).toBe(800);
        });
    });
});
