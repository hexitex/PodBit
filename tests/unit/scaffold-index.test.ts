/**
 * Tests for scaffold/index.ts — the main scaffold() orchestration function.
 * Mocks: core.js (query/queryOne), decompose, generate, verify, assemble, knowledge handler.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mocks ----
const mockQuery = jest.fn<() => Promise<any>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const mockDecompose = jest.fn<() => Promise<any>>();
jest.unstable_mockModule('../../scaffold/decompose.js', () => ({
    decompose: mockDecompose,
}));

const mockGenerateSection = jest.fn<() => Promise<any>>();

// Real-enough KnowledgeAccumulator for testing
class MockKnowledgeAccumulator {
    private nodes = new Map<string, any>();
    add(nodes: any[]) {
        const fresh: any[] = [];
        for (const node of nodes) {
            if (!this.nodes.has(node.content)) {
                this.nodes.set(node.content, node);
                fresh.push(node);
            }
        }
        return fresh;
    }
    all() { return Array.from(this.nodes.values()); }
    get size() { return this.nodes.size; }
    format() { return this.all().map((n: any, i: number) => `[K${i + 1}] ${n.content}`).join('\n'); }
}

jest.unstable_mockModule('../../scaffold/generate.js', () => ({
    generateSection: mockGenerateSection,
    KnowledgeAccumulator: MockKnowledgeAccumulator,
}));

const mockCheckCoherence = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
jest.unstable_mockModule('../../scaffold/verify.js', () => ({
    verifySection: jest.fn(),
    checkCoherence: mockCheckCoherence,
}));

const mockAssemble = jest.fn<() => string>().mockReturnValue('# Assembled Document');
jest.unstable_mockModule('../../scaffold/assemble.js', () => ({
    assemble: mockAssemble,
}));

const mockFetchTopicNodes = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
jest.unstable_mockModule('../../handlers/knowledge.js', () => ({
    fetchTopicNodes: mockFetchTopicNodes,
}));

jest.unstable_mockModule('../../scaffold/templates.js', () => ({
    defaultTemplates: {},
    loadDefaultTemplates: jest.fn(),
}));

const { scaffold } = await import('../../scaffold/index.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    mockCheckCoherence.mockResolvedValue([]);
    mockAssemble.mockReturnValue('# Assembled Document');
    mockFetchTopicNodes.mockResolvedValue([]);

    // Default: decompose returns a 2-section outline
    mockDecompose.mockResolvedValue({
        id: 'outline-1',
        request: 'Test request',
        taskType: 'research_brief',
        templateId: null,
        sections: [
            { id: 'intro', title: 'Introduction' },
            { id: 'body', title: 'Body' },
        ],
        created_at: new Date(),
    });

    // Default: generateSection succeeds
    mockGenerateSection.mockResolvedValue({
        content: 'Generated section content.',
        failed: false,
        verification: { valid: true, failures: [], wordCount: 20 },
        attempts: 1,
    });
});

describe('scaffold', () => {
    it('returns success result with all sections completed', async () => {
        const result = await scaffold('Write about AI', 'research_brief');

        expect(result.success).toBe(true);
        expect(result.partial).toBe(false);
        expect(result.failedSections).toHaveLength(0);
        expect(result.document).toBe('# Assembled Document');
        expect(result).toHaveProperty('jobId');
        expect(result).toHaveProperty('outline');
        expect(result).toHaveProperty('sections');
        expect(result).toHaveProperty('coherenceIssues');
        expect(result).toHaveProperty('knowledgeNodesUsed');
    });

    it('calls decompose with request and taskType', async () => {
        await scaffold('Write about AI', 'research_brief');

        expect(mockDecompose).toHaveBeenCalledWith(
            'Write about AI',
            'research_brief',
            expect.objectContaining({ knowledgeSummary: null }),
        );
    });

    it('generates each section from the outline', async () => {
        await scaffold('Write about AI', 'research_brief');

        expect(mockGenerateSection).toHaveBeenCalledTimes(2);
        expect(mockGenerateSection).toHaveBeenCalledWith(
            expect.anything(),
            'intro',
            expect.objectContaining({
                precedingSections: expect.any(Object),
                terminology: expect.any(Object),
            }),
        );
        expect(mockGenerateSection).toHaveBeenCalledWith(
            expect.anything(),
            'body',
            expect.any(Object),
        );
    });

    it('creates scaffold job in DB', async () => {
        await scaffold('Write about AI', 'research_brief');

        const insertCall = mockQuery.mock.calls.find(
            (call: any) => (call[0] as string).includes('INSERT INTO scaffold_jobs')
        );
        expect(insertCall).toBeDefined();
    });

    it('persists each section after generation', async () => {
        await scaffold('Write about AI', 'research_brief');

        const updateCalls = mockQuery.mock.calls.filter(
            (call: any) => (call[0] as string).includes('UPDATE scaffold_jobs SET sections')
        );
        // At least 2 updates for sections + 1 final status update
        expect(updateCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('calls assemble with generated sections and outline', async () => {
        await scaffold('Write about AI', 'research_brief');

        expect(mockAssemble).toHaveBeenCalledWith(
            expect.objectContaining({
                intro: 'Generated section content.',
                body: 'Generated section content.',
            }),
            expect.objectContaining({
                sections: expect.arrayContaining([
                    expect.objectContaining({ id: 'intro' }),
                ]),
            }),
        );
    });

    it('handles failed sections gracefully with partial result', async () => {
        mockGenerateSection
            .mockResolvedValueOnce({
                content: 'Good content.',
                failed: false,
                verification: { valid: true, failures: [], wordCount: 20 },
                attempts: 1,
            })
            .mockResolvedValueOnce({
                content: null,
                failed: true,
                verification: { valid: false, failures: [{ message: 'Generation failed' }], wordCount: 0 },
                attempts: 3,
            });

        const result = await scaffold('Write about AI', 'research_brief');

        expect(result.success).toBe(false);
        expect(result.partial).toBe(true);
        expect(result.failedSections).toContain('body');
        expect(Object.keys(result.sections)).toContain('intro');
        expect(Object.keys(result.sections)).not.toContain('body');
    });

    it('returns failed status when all sections fail', async () => {
        mockGenerateSection.mockResolvedValue({
            content: null,
            failed: true,
            verification: { valid: false, failures: [{ message: 'Failed' }], wordCount: 0 },
            attempts: 3,
        });

        const result = await scaffold('Write about AI', 'research_brief');

        expect(result.success).toBe(false);
        expect(result.partial).toBe(false);
        expect(result.failedSections).toHaveLength(2);
    });

    it('runs coherence check when multiple sections completed', async () => {
        await scaffold('Write about AI', 'research_brief');

        expect(mockCheckCoherence).toHaveBeenCalledTimes(1);
    });

    it('skips coherence check with only one completed section', async () => {
        mockDecompose.mockResolvedValue({
            id: 'outline-1',
            request: 'Test',
            taskType: 'research_brief',
            templateId: null,
            sections: [{ id: 'intro', title: 'Introduction' }],
            created_at: new Date(),
        });

        await scaffold('Test', 'research_brief');

        expect(mockCheckCoherence).not.toHaveBeenCalled();
    });

    it('regenerates sections with coherence issues', async () => {
        mockCheckCoherence.mockResolvedValue([
            {
                type: 'conclusion_gap',
                message: 'Conclusion may not cover: Introduction',
                section: 'intro',
            },
        ]);

        await scaffold('Write about AI', 'research_brief');

        // 2 initial generations + 1 coherence fix
        expect(mockGenerateSection).toHaveBeenCalledTimes(3);
        // The coherence fix call should include the coherenceIssue
        const coherenceCall = mockGenerateSection.mock.calls[2];
        expect(coherenceCall[2]).toHaveProperty('coherenceIssue');
    });

    it('does not regenerate coherence issues for sections not in outline', async () => {
        mockCheckCoherence.mockResolvedValue([
            {
                type: 'terminology_inconsistency',
                message: 'Inconsistent terms',
                section: 'nonexistent_section',
            },
        ]);

        await scaffold('Write about AI', 'research_brief');

        // Only 2 initial generations, no coherence fix (section not found)
        expect(mockGenerateSection).toHaveBeenCalledTimes(2);
    });

    it('fetches knowledge nodes using request as default query', async () => {
        mockFetchTopicNodes.mockResolvedValue([
            { content: 'AI node 1', domain: 'tech' },
        ]);

        await scaffold('Write about AI', 'research_brief');

        expect(mockFetchTopicNodes).toHaveBeenCalledWith('Write about AI', null, 30, undefined);
    });

    it('uses explicit knowledgeQuery when provided', async () => {
        await scaffold('Write about AI', 'research_brief', {
            knowledgeQuery: 'artificial intelligence',
        });

        expect(mockFetchTopicNodes).toHaveBeenCalledWith('artificial intelligence', null, 30, undefined);
    });

    it('passes domains to fetchTopicNodes when provided', async () => {
        await scaffold('Write about AI', 'research_brief', {
            domains: ['tech', 'science'],
        });

        expect(mockFetchTopicNodes).toHaveBeenCalledWith('Write about AI', null, 30, ['tech', 'science']);
    });

    it('continues without knowledge when fetch fails', async () => {
        mockFetchTopicNodes.mockRejectedValue(new Error('DB unavailable'));

        const result = await scaffold('Write about AI', 'research_brief');

        expect(result.success).toBe(true);
        expect(result.knowledgeNodesUsed).toBe(0);
    });

    it('passes knowledge summary to decompose when nodes available', async () => {
        mockFetchTopicNodes.mockResolvedValue([
            { content: 'AI is transformative technology', domain: 'tech' },
        ]);

        await scaffold('Write about AI', 'research_brief');

        expect(mockDecompose).toHaveBeenCalledWith(
            'Write about AI',
            'research_brief',
            expect.objectContaining({
                knowledgeSummary: expect.stringContaining('AI is transformative'),
            }),
        );
    });

    it('passes null knowledge summary when no nodes fetched', async () => {
        mockFetchTopicNodes.mockResolvedValue([]);

        await scaffold('Write about AI', 'research_brief');

        expect(mockDecompose).toHaveBeenCalledWith(
            'Write about AI',
            'research_brief',
            expect.objectContaining({
                knowledgeSummary: null,
            }),
        );
    });

    describe('resume from existing job', () => {
        it('resumes a partially completed job', async () => {
            mockQueryOne.mockResolvedValue({
                id: 'existing-job-id',
                request: 'Existing request',
                task_type: 'research_brief',
                outline: JSON.stringify({
                    sections: [
                        { id: 'intro', title: 'Introduction' },
                        { id: 'body', title: 'Body' },
                    ],
                }),
                sections: JSON.stringify({ intro: 'Already done.' }),
                status: 'in_progress',
            });

            const result = await scaffold('Existing request', 'research_brief', {
                resumeJobId: 'existing-job-id',
            });

            expect(result.jobId).toBe('existing-job-id');
            // Should only generate the body section (intro already done)
            expect(mockGenerateSection).toHaveBeenCalledTimes(1);
            expect(mockGenerateSection).toHaveBeenCalledWith(
                expect.anything(),
                'body',
                expect.any(Object),
            );
            expect(mockDecompose).not.toHaveBeenCalled();
        });

        it('throws when resume job not found', async () => {
            mockQueryOne.mockResolvedValue(null);

            await expect(
                scaffold('Test', 'research_brief', { resumeJobId: 'nonexistent' })
            ).rejects.toThrow('Scaffold job not found: nonexistent');
        });

        it('handles outline stored as object (not string)', async () => {
            mockQueryOne.mockResolvedValue({
                id: 'job-obj',
                outline: {
                    sections: [{ id: 's1', title: 'S1' }],
                },
                sections: {},
            });

            const result = await scaffold('Test', 'research_brief', {
                resumeJobId: 'job-obj',
            });

            expect(result.jobId).toBe('job-obj');
            expect(mockGenerateSection).toHaveBeenCalledTimes(1);
        });

        it('handles sections stored as string (JSON)', async () => {
            mockQueryOne.mockResolvedValue({
                id: 'job-str',
                outline: JSON.stringify({
                    sections: [
                        { id: 'intro', title: 'Intro' },
                        { id: 'body', title: 'Body' },
                    ],
                }),
                sections: JSON.stringify({ intro: 'Done.', body: 'Also done.' }),
            });

            const result = await scaffold('Test', 'research_brief', {
                resumeJobId: 'job-str',
            });

            // Both sections already done, no generation needed
            expect(mockGenerateSection).not.toHaveBeenCalled();
        });
    });

    it('updates final job status to completed on success', async () => {
        await scaffold('Write about AI', 'research_brief');

        const finalUpdate = mockQuery.mock.calls.find(
            (call: any) => (call[0] as string).includes('UPDATE scaffold_jobs SET sections') &&
                           (call[1] as any[]).includes('completed')
        );
        expect(finalUpdate).toBeDefined();
    });

    it('updates final job status to partial when some sections fail', async () => {
        mockGenerateSection
            .mockResolvedValueOnce({
                content: 'OK.',
                failed: false,
                verification: { valid: true, failures: [], wordCount: 5 },
                attempts: 1,
            })
            .mockResolvedValueOnce({
                content: null,
                failed: true,
                verification: { valid: false, failures: [{ message: 'Fail' }], wordCount: 0 },
                attempts: 3,
            });

        await scaffold('Test', 'research_brief');

        const finalUpdate = mockQuery.mock.calls.find(
            (call: any) => (call[0] as string).includes('UPDATE scaffold_jobs SET sections') &&
                           (call[1] as any[]).includes('partial')
        );
        expect(finalUpdate).toBeDefined();
    });

    it('updates final job status to failed when all sections fail', async () => {
        mockGenerateSection.mockResolvedValue({
            content: null,
            failed: true,
            verification: { valid: false, failures: [{ message: 'Fail' }], wordCount: 0 },
            attempts: 3,
        });

        await scaffold('Test', 'research_brief');

        const finalUpdate = mockQuery.mock.calls.find(
            (call: any) => (call[0] as string).includes('UPDATE scaffold_jobs SET sections') &&
                           (call[1] as any[]).includes('failed')
        );
        expect(finalUpdate).toBeDefined();
    });

    it('does not regenerate failed sections during coherence fix', async () => {
        mockGenerateSection
            .mockResolvedValueOnce({
                content: 'Good.',
                failed: false,
                verification: { valid: true, failures: [], wordCount: 5 },
                attempts: 1,
            })
            .mockResolvedValueOnce({
                content: null,
                failed: true,
                verification: { valid: false, failures: [{ message: 'Fail' }], wordCount: 0 },
                attempts: 3,
            });

        mockCheckCoherence.mockResolvedValue([
            { type: 'conclusion_gap', section: 'body', message: 'Gap' },
        ]);

        await scaffold('Test', 'research_brief');

        // Only 2 calls (initial), not 3 — coherence fix skipped for failed section
        expect(mockGenerateSection).toHaveBeenCalledTimes(2);
    });

    it('passes terminology option through to generateSection', async () => {
        await scaffold('Test', 'research_brief', {
            terminology: { 'AI': 'Artificial Intelligence' },
        });

        expect(mockGenerateSection).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(String),
            expect.objectContaining({
                terminology: { 'AI': 'Artificial Intelligence' },
            }),
        );
    });

    it('passes domains to generateSection when provided', async () => {
        await scaffold('Test', 'research_brief', {
            domains: ['tech', 'science'],
        });

        expect(mockGenerateSection).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(String),
            expect.objectContaining({
                domains: ['tech', 'science'],
            }),
        );
    });

    it('does not pass domains to generateSection when not provided', async () => {
        await scaffold('Test', 'research_brief');

        expect(mockGenerateSection).toHaveBeenCalledWith(
            expect.anything(),
            expect.any(String),
            expect.objectContaining({
                domains: undefined,
            }),
        );
    });

    it('records error in DB when section fails', async () => {
        mockGenerateSection.mockResolvedValue({
            content: null,
            failed: true,
            verification: { valid: false, failures: [{ message: 'Model error' }], wordCount: 0 },
            attempts: 3,
        });

        await scaffold('Test', 'research_brief');

        const errorUpdate = mockQuery.mock.calls.find(
            (call: any) => (call[0] as string).includes('UPDATE scaffold_jobs SET error')
        );
        expect(errorUpdate).toBeDefined();
        expect((errorUpdate![1] as any[])[0]).toContain('Model error');
    });

    it('updates preceding sections for context in later generation', async () => {
        const callOrder: string[] = [];
        mockGenerateSection
            .mockImplementationOnce(async (_outline: any, sectionId: string, opts: any) => {
                callOrder.push(sectionId);
                expect(Object.keys(opts.precedingSections)).toHaveLength(0);
                return {
                    content: 'Intro content.',
                    failed: false,
                    verification: { valid: true, failures: [], wordCount: 10 },
                    attempts: 1,
                };
            })
            .mockImplementationOnce(async (_outline: any, sectionId: string, opts: any) => {
                callOrder.push(sectionId);
                // By the time body is generated, intro should be in preceding
                expect(opts.precedingSections).toHaveProperty('intro', 'Intro content.');
                return {
                    content: 'Body content.',
                    failed: false,
                    verification: { valid: true, failures: [], wordCount: 10 },
                    attempts: 1,
                };
            });

        await scaffold('Test', 'research_brief');

        expect(callOrder).toEqual(['intro', 'body']);
    });

    it('coherence fix updates the section content in final output', async () => {
        mockCheckCoherence.mockResolvedValue([
            { type: 'terminology_inconsistency', section: 'intro', message: 'Fix term' },
        ]);

        // Initial generation returns one content, coherence fix returns updated
        mockGenerateSection
            .mockResolvedValueOnce({
                content: 'Original intro.',
                failed: false,
                verification: { valid: true, failures: [], wordCount: 10 },
                attempts: 1,
            })
            .mockResolvedValueOnce({
                content: 'Original body.',
                failed: false,
                verification: { valid: true, failures: [], wordCount: 10 },
                attempts: 1,
            })
            .mockResolvedValueOnce({
                content: 'Fixed intro.',
                failed: false,
                verification: { valid: true, failures: [], wordCount: 10 },
                attempts: 1,
            });

        const result = await scaffold('Test', 'research_brief');

        expect(result.sections.intro).toBe('Fixed intro.');
        expect(result.sections.body).toBe('Original body.');
    });

    it('skips coherence fix if regeneration fails', async () => {
        mockCheckCoherence.mockResolvedValue([
            { type: 'conclusion_gap', section: 'intro', message: 'Gap' },
        ]);

        mockGenerateSection
            .mockResolvedValueOnce({
                content: 'Original intro.',
                failed: false,
                verification: { valid: true, failures: [], wordCount: 10 },
                attempts: 1,
            })
            .mockResolvedValueOnce({
                content: 'Original body.',
                failed: false,
                verification: { valid: true, failures: [], wordCount: 10 },
                attempts: 1,
            })
            .mockResolvedValueOnce({
                content: null,
                failed: true,
                verification: { valid: false, failures: [{ message: 'Fail' }], wordCount: 0 },
                attempts: 3,
            });

        const result = await scaffold('Test', 'research_brief');

        // Original content should be preserved since coherence fix failed
        expect(result.sections.intro).toBe('Original intro.');
    });

    it('coherence issues without a section field are skipped', async () => {
        mockCheckCoherence.mockResolvedValue([
            { type: 'terminology_inconsistency', message: 'Inconsistent terms' },
            // No .section field
        ]);

        await scaffold('Test', 'research_brief');

        // Only 2 initial generations, no coherence fix
        expect(mockGenerateSection).toHaveBeenCalledTimes(2);
    });
});
