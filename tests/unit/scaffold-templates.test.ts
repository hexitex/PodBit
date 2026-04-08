/**
 * Tests for scaffold/templates.ts — defaultTemplates constant and loadDefaultTemplates function.
 * defaultTemplates is pure data; loadDefaultTemplates writes to DB so we mock core.js query.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
}));

const { defaultTemplates, loadDefaultTemplates } = await import('../../scaffold/templates.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
});

const templateTypes = ['research_brief', 'knowledge_synthesis', 'technical_report'] as const;

const EXPECTED_SECTIONS: Record<string, string[]> = {
    research_brief: ['landscape', 'tensions', 'connections', 'gaps', 'confidence'],
    knowledge_synthesis: ['abstract', 'foundations', 'synthesis', 'fault_lines', 'gaps'],
    technical_report: ['state_of_play', 'tensions', 'connections', 'gaps'],
};

describe('defaultTemplates', () => {
    it('has all three template types', () => {
        expect(Object.keys(defaultTemplates)).toContain('research_brief');
        expect(Object.keys(defaultTemplates)).toContain('knowledge_synthesis');
        expect(Object.keys(defaultTemplates)).toContain('technical_report');
    });

    it('each template has task_type matching its key', () => {
        for (const key of templateTypes) {
            expect(defaultTemplates[key].task_type).toBe(key);
        }
    });

    it('each template has a name', () => {
        for (const key of templateTypes) {
            expect(typeof defaultTemplates[key].name).toBe('string');
            expect(defaultTemplates[key].name.length).toBeGreaterThan(0);
        }
    });

    it('each template has sections with ids and titles', () => {
        for (const key of templateTypes) {
            const sections = defaultTemplates[key].outline_schema.sections;
            expect(sections.length).toBeGreaterThan(0);
            for (const section of sections) {
                expect(typeof section.id).toBe('string');
                expect(typeof section.title).toBe('string');
            }
        }
    });

    it('each template has section_defaults with tone and must_avoid', () => {
        for (const key of templateTypes) {
            expect(typeof defaultTemplates[key].section_defaults.tone).toBe('string');
            expect(Array.isArray(defaultTemplates[key].section_defaults.must_avoid)).toBe(true);
            expect(defaultTemplates[key].section_defaults.must_avoid.length).toBeGreaterThan(0);
        }
    });

    describe('section structure', () => {
        for (const key of templateTypes) {
            it(`${key} has correct section ids`, () => {
                const ids = defaultTemplates[key].outline_schema.sections.map((s: any) => s.id);
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

    it('research_brief has 5 sections', () => {
        expect(defaultTemplates.research_brief.outline_schema.sections).toHaveLength(5);
    });

    it('knowledge_synthesis abstract has generate_last', () => {
        const abstract = defaultTemplates.knowledge_synthesis.outline_schema.sections
            .find((s: any) => s.id === 'abstract');
        expect(abstract?.generate_last).toBe(true);
    });

    it('technical_report has 4 sections', () => {
        expect(defaultTemplates.technical_report.outline_schema.sections).toHaveLength(4);
    });

    it('research_brief must_avoid includes methodology descriptions', () => {
        expect(defaultTemplates.research_brief.section_defaults.must_avoid)
            .toContain('methodology descriptions');
    });

    it('knowledge_synthesis synthesis section has max 800 words', () => {
        const synthesis = defaultTemplates.knowledge_synthesis.outline_schema.sections
            .find((s: any) => s.id === 'synthesis');
        expect(synthesis?.length?.max).toBe(800);
    });

    it('research_brief confidence section has min 150 words', () => {
        const confidence = defaultTemplates.research_brief.outline_schema.sections
            .find((s: any) => s.id === 'confidence');
        expect(confidence?.length?.min).toBe(150);
    });

    it('all must_include arrays contain strings', () => {
        for (const key of templateTypes) {
            for (const section of defaultTemplates[key].outline_schema.sections) {
                if (section.must_include) {
                    expect(Array.isArray(section.must_include)).toBe(true);
                    for (const term of section.must_include) {
                        expect(typeof term).toBe('string');
                    }
                }
            }
        }
    });
});

describe('loadDefaultTemplates', () => {
    it('inserts all three templates into the database', async () => {
        await loadDefaultTemplates();
        expect(mockQuery).toHaveBeenCalledTimes(3);
    });

    it('uses INSERT ... ON CONFLICT DO UPDATE for each template', async () => {
        await loadDefaultTemplates();

        for (const call of mockQuery.mock.calls) {
            const sql = call[0] as string;
            expect(sql).toContain('INSERT INTO templates');
            expect(sql).toContain('ON CONFLICT');
        }
    });

    it('passes correct task_type parameters', async () => {
        await loadDefaultTemplates();

        const taskTypes = mockQuery.mock.calls.map((call: any) => call[1][0]);
        expect(taskTypes).toContain('research_brief');
        expect(taskTypes).toContain('knowledge_synthesis');
        expect(taskTypes).toContain('technical_report');
    });

    it('serializes outline_schema and section_defaults as JSON strings', async () => {
        await loadDefaultTemplates();

        for (const call of mockQuery.mock.calls) {
            const params = call[1] as any[];
            // params[2] is outline_schema, params[3] is section_defaults
            expect(() => JSON.parse(params[2] as string)).not.toThrow();
            expect(() => JSON.parse(params[3] as string)).not.toThrow();
        }
    });

    it('passes empty verifiers JSON for templates without verifiers', async () => {
        await loadDefaultTemplates();

        for (const call of mockQuery.mock.calls) {
            const params = call[1] as any[];
            // params[4] is verifiers
            expect(params[4]).toBe('{}');
        }
    });

    it('passes template name as second parameter', async () => {
        await loadDefaultTemplates();

        const names = mockQuery.mock.calls.map((call: any) => call[1][1]);
        expect(names).toContain('Research Brief');
        expect(names).toContain('Knowledge Synthesis Report');
        expect(names).toContain('Technical Report');
    });
});
