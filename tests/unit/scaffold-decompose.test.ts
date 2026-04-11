/**
 * Tests for scaffold/decompose.ts — decompose function and extractJSON utility.
 * Mocks: core.js (queryOne), prompts.js (getPrompt), models.js (callSubsystemModel), config.js.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mocks ----
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../core.js', () => ({
    queryOne: mockQueryOne,
    query: jest.fn(),
}));

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('validation prompt');
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('yes');
jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        tokenLimits: { reasoningModelPatterns: [] },
    },
}));

const { decompose } = await import('../../scaffold/decompose.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQueryOne.mockResolvedValue(null);
    mockGetPrompt.mockResolvedValue('validation prompt');
    mockCallSubsystemModel.mockResolvedValue('yes');
});

describe('decompose', () => {
    describe('without template', () => {
        it('generates outline via model when no template found', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
                sections: [
                    { id: 'intro', title: 'Introduction' },
                    { id: 'body', title: 'Body' },
                ],
            }));

            const result = await decompose('Write about AI', 'research_brief');

            expect(result).toHaveProperty('id');
            expect(result.request).toBe('Write about AI');
            expect(result.taskType).toBe('research_brief');
            expect(result.templateId).toBeNull();
            expect(result.sections).toHaveLength(2);
            expect(result.sections[0].id).toBe('intro');
            expect(result).toHaveProperty('created_at');
        });

        it('passes knowledge summary to model prompt when provided', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockCallSubsystemModel.mockResolvedValue('{"sections": [{"id": "s1", "title": "Section 1"}]}');

            await decompose('Write about AI', 'research_brief', {
                knowledgeSummary: 'Node 1: AI is cool\nNode 2: ML is useful',
            });

            expect(mockGetPrompt).toHaveBeenCalledWith('docs.outline_decomposition', expect.objectContaining({
                knowledgeContext: expect.stringContaining('Node 1: AI is cool'),
            }));
        });

        it('sends empty knowledge context when no summary', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockCallSubsystemModel.mockResolvedValue('{"sections": []}');

            await decompose('Write about AI', 'research_brief');

            expect(mockGetPrompt).toHaveBeenCalledWith('docs.outline_decomposition', expect.objectContaining({
                knowledgeContext: '',
            }));
        });
    });

    describe('with template from DB', () => {
        const dbTemplate = {
            id: 'tmpl-1',
            task_type: 'research_brief',
            name: 'Research Brief',
            outline_schema: {
                sections: [
                    { id: 'landscape', title: 'Landscape', constraints: { maxWords: 500 } },
                    { id: 'gaps', title: 'Gaps', constraints: { maxWords: 300 } },
                ],
            },
            section_defaults: { tone: 'direct', must_avoid: ['hedging'] },
        };

        it('uses template when validation passes', async () => {
            mockQueryOne.mockResolvedValue(dbTemplate);
            mockCallSubsystemModel.mockResolvedValue('Yes, this template fits well.');

            const result = await decompose('Analyze knowledge gaps', 'research_brief');

            expect(result.templateId).toBe('tmpl-1');
            expect(result.sections).toHaveLength(2);
            // section's own id overrides the generated section_N id via spread
            expect(result.sections[0].id).toBe('landscape');
            expect(result.sections[0].title).toBe('Landscape');
            // Constraints should merge section_defaults with section constraints
            expect(result.sections[0].constraints).toEqual({
                tone: 'direct',
                must_avoid: ['hedging'],
                maxWords: 500,
            });
        });

        it('falls back to model when template rejected', async () => {
            mockQueryOne.mockResolvedValue(dbTemplate);
            // First call: validation returns 'no'
            // Second call: model generates outline
            mockCallSubsystemModel
                .mockResolvedValueOnce('No, this template does not fit.')
                .mockResolvedValueOnce('{"sections": [{"id": "custom", "title": "Custom Section"}]}');

            const result = await decompose('Something unusual', 'research_brief');

            expect(result.templateId).toBeNull();
            expect(result.sections[0].id).toBe('custom');
        });

        it('uses template anyway when validation call throws', async () => {
            mockQueryOne.mockResolvedValue(dbTemplate);
            mockCallSubsystemModel.mockRejectedValueOnce(new Error('Model unavailable'));

            const result = await decompose('Analyze gaps', 'research_brief');

            expect(result.templateId).toBe('tmpl-1');
            expect(result.sections).toHaveLength(2);
        });

        it('handles outline_schema as string (JSON)', async () => {
            const stringSchemaTemplate = {
                ...dbTemplate,
                outline_schema: JSON.stringify(dbTemplate.outline_schema),
            };
            mockQueryOne.mockResolvedValue(stringSchemaTemplate);
            mockCallSubsystemModel.mockResolvedValue('yes');

            const result = await decompose('Analyze gaps', 'research_brief');

            expect(result.sections).toHaveLength(2);
            expect(result.sections[0].title).toBe('Landscape');
        });
    });

    describe('with explicit template option', () => {
        it('uses provided template instead of querying DB', async () => {
            const explicitTemplate = {
                id: 'explicit-1',
                task_type: 'custom',
                name: 'Custom Template',
                outline_schema: {
                    sections: [{ id: 'overview', title: 'Overview' }],
                },
                section_defaults: { tone: 'casual' },
            };

            mockCallSubsystemModel.mockResolvedValue('yes');

            const result = await decompose('Custom request', 'custom', {
                template: explicitTemplate,
            });

            // Should not have queried DB
            expect(mockQueryOne).not.toHaveBeenCalled();
            expect(result.templateId).toBe('explicit-1');
            expect(result.sections[0].title).toBe('Overview');
        });
    });

    describe('extractJSON (via model-generated outlines)', () => {
        it('handles JSON in markdown code block', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockCallSubsystemModel.mockResolvedValue(
                'Here is the outline:\n```json\n{"sections": [{"id": "s1", "title": "S1"}]}\n```\nDone.'
            );

            const result = await decompose('Test', 'research_brief');
            expect(result.sections[0].title).toBe('S1');
        });

        it('handles JSON in code block without language tag', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockCallSubsystemModel.mockResolvedValue(
                '```\n{"sections": [{"id": "s1", "title": "Plain"}]}\n```'
            );

            const result = await decompose('Test', 'research_brief');
            expect(result.sections[0].title).toBe('Plain');
        });

        it('handles JSON embedded in prose', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockCallSubsystemModel.mockResolvedValue(
                'The outline is: {"sections": [{"id": "s1", "title": "Embedded"}]} as shown.'
            );

            const result = await decompose('Test', 'research_brief');
            expect(result.sections[0].title).toBe('Embedded');
        });

        it('throws on completely invalid response', async () => {
            mockQueryOne.mockResolvedValue(null);
            mockCallSubsystemModel.mockResolvedValue('This is not JSON at all and has no braces');

            await expect(decompose('Test', 'research_brief')).rejects.toThrow('JSON parse error');
        });
    });
});
