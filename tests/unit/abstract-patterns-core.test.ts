/**
 * Tests for core/abstract-patterns.ts — pattern CRUD and discovery.
 * Covers createOrGetPattern, linkNodeToPattern, getNodePatterns,
 * findPatternSiblings, searchPatterns, getPatternStats.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>();
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>();
const mockGetEmbedding = jest.fn<(...args: any[]) => Promise<number[] | null>>();
const mockGetPatternSiblingsQuery = jest.fn<() => string>();

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    getPatternSiblingsQuery: mockGetPatternSiblingsQuery,
}));

jest.unstable_mockModule('../../models.js', () => ({
    getEmbedding: mockGetEmbedding,
}));

const {
    createOrGetPattern,
    linkNodeToPattern,
    getNodePatterns,
    findPatternSiblings,
    searchPatterns,
    getPatternStats,
} = await import('../../core/abstract-patterns.js');

describe('abstract-patterns', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    // -----------------------------------------------------------------------
    // createOrGetPattern
    // -----------------------------------------------------------------------
    describe('createOrGetPattern', () => {
        it('returns existing pattern if name already exists', async () => {
            const existing = { id: 'p-1', name: 'structure-vs-process-gap', description: 'A gap' };
            mockQueryOne.mockResolvedValueOnce(existing);

            const result = await createOrGetPattern('Structure vs Process Gap', 'A gap');
            expect(result).toBe(existing);
            // Should normalize to kebab-case
            expect(mockQueryOne).toHaveBeenCalledWith(
                expect.any(String),
                ['structure-vs-process-gap']
            );
            // Should NOT call getEmbedding or INSERT
            expect(mockGetEmbedding).not.toHaveBeenCalled();
        });

        it('creates new pattern with embedding when not found', async () => {
            mockQueryOne
                .mockResolvedValueOnce(null)           // SELECT returns null
                .mockResolvedValueOnce({ id: 'p-2', name: 'new-pattern' }); // INSERT RETURNING
            mockGetEmbedding.mockResolvedValueOnce([0.1, 0.2, 0.3]);

            const result = await createOrGetPattern('New Pattern!', 'Description here', 'alice');
            expect(result).toEqual({ id: 'p-2', name: 'new-pattern' });
            expect(mockGetEmbedding).toHaveBeenCalledWith('new-pattern: Description here');
            // INSERT call should include embedding JSON and contributor
            const insertCall = mockQueryOne.mock.calls[1];
            expect(insertCall[1]).toEqual([
                'new-pattern',
                'Description here',
                JSON.stringify([0.1, 0.2, 0.3]),
                'alice',
            ]);
        });

        it('normalizes name: strips special chars, lowercases, replaces spaces', async () => {
            mockQueryOne.mockResolvedValueOnce({ id: 'p-3', name: 'hello-world' });

            await createOrGetPattern('Hello World!!!', 'desc');
            expect(mockQueryOne).toHaveBeenCalledWith(
                expect.any(String),
                ['hello-world']
            );
        });

        it('handles null embedding gracefully', async () => {
            mockQueryOne
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce({ id: 'p-4', name: 'no-embed' });
            mockGetEmbedding.mockResolvedValueOnce(null);

            await createOrGetPattern('No Embed', 'desc');
            const insertCall = mockQueryOne.mock.calls[1];
            expect(insertCall[1]![2]).toBeNull(); // embedding param is null
        });
    });

    // -----------------------------------------------------------------------
    // linkNodeToPattern
    // -----------------------------------------------------------------------
    describe('linkNodeToPattern', () => {
        it('inserts link with default strength and contributor', async () => {
            mockQueryOne.mockResolvedValueOnce({ node_id: 'n-1', pattern_id: 'p-1', strength: 1.0 });

            const result = await linkNodeToPattern('n-1', 'p-1');
            expect(result).toEqual({ node_id: 'n-1', pattern_id: 'p-1', strength: 1.0 });
            expect(mockQueryOne).toHaveBeenCalledWith(
                expect.stringContaining('INSERT INTO node_abstract_patterns'),
                ['n-1', 'p-1', 1.0, 'claude']
            );
        });

        it('passes custom strength and contributor', async () => {
            mockQueryOne.mockResolvedValueOnce({ node_id: 'n-2', pattern_id: 'p-2', strength: 0.7 });

            await linkNodeToPattern('n-2', 'p-2', 0.7, 'bob');
            expect(mockQueryOne).toHaveBeenCalledWith(
                expect.any(String),
                ['n-2', 'p-2', 0.7, 'bob']
            );
        });
    });

    // -----------------------------------------------------------------------
    // getNodePatterns
    // -----------------------------------------------------------------------
    describe('getNodePatterns', () => {
        it('queries patterns for a node', async () => {
            const patterns = [
                { id: 'p-1', name: 'gap', strength: 1.0 },
                { id: 'p-2', name: 'feedback', strength: 0.8 },
            ];
            mockQuery.mockResolvedValueOnce(patterns);

            const result = await getNodePatterns('node-abc');
            expect(result).toEqual(patterns);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('node_abstract_patterns'),
                ['node-abc']
            );
        });
    });

    // -----------------------------------------------------------------------
    // findPatternSiblings
    // -----------------------------------------------------------------------
    describe('findPatternSiblings', () => {
        it('delegates to getPatternSiblingsQuery with defaults', async () => {
            mockGetPatternSiblingsQuery.mockReturnValue('SELECT siblings_query');
            mockQuery.mockResolvedValueOnce([{ id: 'sib-1' }]);

            const result = await findPatternSiblings('n-1');
            expect(mockGetPatternSiblingsQuery).toHaveBeenCalled();
            expect(mockQuery).toHaveBeenCalledWith('SELECT siblings_query', ['n-1', true, 20]);
            expect(result).toEqual([{ id: 'sib-1' }]);
        });

        it('passes custom excludeSameDomain and limit', async () => {
            mockGetPatternSiblingsQuery.mockReturnValue('Q');
            mockQuery.mockResolvedValueOnce([]);

            await findPatternSiblings('n-2', false, 5);
            expect(mockQuery).toHaveBeenCalledWith('Q', ['n-2', false, 5]);
        });
    });

    // -----------------------------------------------------------------------
    // searchPatterns
    // -----------------------------------------------------------------------
    describe('searchPatterns', () => {
        it('searches by ILIKE with wrapped text', async () => {
            mockQuery.mockResolvedValueOnce([{ id: 'p-1', name: 'feedback-loop' }]);

            const result = await searchPatterns('feedback');
            expect(result).toEqual([{ id: 'p-1', name: 'feedback-loop' }]);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining('ILIKE'),
                ['%feedback%', 10]
            );
        });

        it('respects custom limit', async () => {
            mockQuery.mockResolvedValueOnce([]);
            await searchPatterns('test', 3);
            expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['%test%', 3]);
        });
    });

    // -----------------------------------------------------------------------
    // getPatternStats
    // -----------------------------------------------------------------------
    describe('getPatternStats', () => {
        it('queries the v_pattern_stats view', async () => {
            const stats = [{ name: 'gap', node_count: 5 }];
            mockQuery.mockResolvedValueOnce(stats);

            const result = await getPatternStats();
            expect(result).toEqual(stats);
            expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM v_pattern_stats');
        });
    });
});
