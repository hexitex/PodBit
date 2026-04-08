/**
 * Unit tests for handlers/scaffold-handlers.ts —
 * handleScaffoldTemplates, handleScaffoldDecompose, handleScaffoldGenerate.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockDecompose = jest.fn<() => Promise<any>>();
const mockScaffold = jest.fn<() => Promise<any>>();

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../scaffold.js', () => ({
    decompose: mockDecompose,
    scaffold: mockScaffold,
}));

const { handleScaffoldTemplates, handleScaffoldDecompose, handleScaffoldGenerate } =
    await import('../../handlers/scaffold-handlers.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockDecompose.mockResolvedValue({
        id: 'outline-1',
        taskType: 'research',
        templateId: 'tmpl-1',
        sections: [],
    });
    mockScaffold.mockResolvedValue({
        success: true,
        partial: false,
        jobId: 'job-1',
        document: { title: 'Research Brief' },
        outline: { sections: [] },
        failedSections: [],
        coherenceIssues: null,
    });
});

// =============================================================================
// handleScaffoldTemplates
// =============================================================================

describe('handleScaffoldTemplates', () => {
    it('returns empty list when no templates', async () => {
        mockQuery.mockResolvedValue([]);

        const result = await handleScaffoldTemplates({});

        expect(result.count).toBe(0);
        expect(result.templates).toHaveLength(0);
    });

    it('returns templates with parsed outline_schema sections', async () => {
        mockQuery.mockResolvedValue([
            {
                id: 't1', task_type: 'research', name: 'Research Brief',
                outline_schema: JSON.stringify({
                    sections: [
                        { id: 'background', title: 'Background' },
                        { id: 'findings', title: 'Findings' },
                    ],
                }),
            },
        ]);

        const result = await handleScaffoldTemplates({});

        expect(result.count).toBe(1);
        expect(result.templates[0].id).toBe('t1');
        expect(result.templates[0].taskType).toBe('research');
        expect(result.templates[0].sections).toEqual(['background', 'findings']);
    });

    it('handles outline_schema as object (not string)', async () => {
        mockQuery.mockResolvedValue([
            {
                id: 't2', task_type: 'analysis', name: 'Analysis Brief',
                outline_schema: {
                    sections: [{ id: 'intro', title: 'Introduction' }],
                },
            },
        ]);

        const result = await handleScaffoldTemplates({});

        expect(result.templates[0].sections).toEqual(['intro']);
    });

    it('filters by taskType when provided', async () => {
        await handleScaffoldTemplates({ taskType: 'analysis' });

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('task_type');
        expect(params).toContain('analysis');
    });

    it('does not add WHERE clause when taskType not provided', async () => {
        await handleScaffoldTemplates({});

        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).not.toContain('WHERE');
    });
});

// =============================================================================
// handleScaffoldDecompose
// =============================================================================

describe('handleScaffoldDecompose', () => {
    it('calls decompose with request and taskType', async () => {
        mockDecompose.mockResolvedValue({
            id: 'outline-1',
            taskType: 'research',
            templateId: 'tmpl-research',
            sections: [
                { id: 'background', title: 'Background', purpose: 'Context', length: 'medium' },
                { id: 'methods', title: 'Methods', purpose: 'Approach', length: 'short' },
            ],
        });

        const result = await handleScaffoldDecompose({
            request: 'Analyze AI safety trends',
            taskType: 'research',
        });

        expect(mockDecompose).toHaveBeenCalledWith('Analyze AI safety trends', 'research');
        expect(result.success).toBe(true);
        expect(result.outline.id).toBe('outline-1');
        expect(result.outline.sections).toHaveLength(2);
        expect(result.outline.sections[0].id).toBe('background');
    });

    it('returns error when decompose throws', async () => {
        mockDecompose.mockRejectedValue(new Error('No template found for taskType: unknown'));

        const result = await handleScaffoldDecompose({
            request: 'Something',
            taskType: 'unknown',
        });

        expect(result.error).toContain('No template found');
    });
});

// =============================================================================
// handleScaffoldGenerate
// =============================================================================

describe('handleScaffoldGenerate', () => {
    it('calls scaffold with request, taskType, and options', async () => {
        mockScaffold.mockResolvedValue({
            success: true,
            partial: false,
            jobId: 'job-abc',
            document: { sections: { background: 'Background content...' } },
            outline: {
                sections: [
                    { id: 'background', title: 'Background' },
                ],
            },
            failedSections: [],
            coherenceIssues: null,
        });

        const result = await handleScaffoldGenerate({
            request: 'Write a brief on AI trends',
            taskType: 'research',
            knowledgeQuery: 'artificial intelligence',
            domains: ['tech', 'science'],
        });

        expect(mockScaffold).toHaveBeenCalledWith(
            'Write a brief on AI trends',
            'research',
            { knowledgeQuery: 'artificial intelligence', domains: ['tech', 'science'] }
        );
        expect(result.success).toBe(true);
        expect(result.jobId).toBe('job-abc');
        expect(result.partial).toBe(false);
        expect(result.outline.sections).toHaveLength(1);
    });

    it('returns partial result when scaffold returns partial=true', async () => {
        mockScaffold.mockResolvedValue({
            success: false,
            partial: true,
            jobId: 'job-partial',
            document: null,
            outline: { sections: [] },
            failedSections: ['findings'],
            coherenceIssues: ['Section mismatch detected'],
        });

        const result = await handleScaffoldGenerate({ request: 'Brief', taskType: 'analysis' });

        expect(result.partial).toBe(true);
        expect(result.failedSections).toContain('findings');
        expect(result.coherenceIssues).toContain('Section mismatch detected');
    });

    it('returns error when scaffold throws', async () => {
        mockScaffold.mockRejectedValue(new Error('LLM service unavailable'));

        const result = await handleScaffoldGenerate({ request: 'Brief', taskType: 'research' });

        expect(result.error).toContain('LLM service unavailable');
    });
});
