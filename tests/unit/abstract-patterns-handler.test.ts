/**
 * Unit tests for handlers/abstract-patterns.ts — handleAbstractPatterns.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCreateOrGetPattern = jest.fn<() => Promise<any>>();
const mockLinkNodeToPattern = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetNodePatterns = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockFindPatternSiblings = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSearchPatterns = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetPatternStats = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../core.js', () => ({
    queryOne: mockQueryOne,
    createOrGetPattern: mockCreateOrGetPattern,
    linkNodeToPattern: mockLinkNodeToPattern,
    getNodePatterns: mockGetNodePatterns,
    findPatternSiblings: mockFindPatternSiblings,
    searchPatterns: mockSearchPatterns,
    getPatternStats: mockGetPatternStats,
}));

const { handleAbstractPatterns } = await import('../../handlers/abstract-patterns.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQueryOne.mockResolvedValue(null);
    mockCreateOrGetPattern.mockResolvedValue({ id: 'pat-1', name: 'test-pattern', description: 'A test pattern' });
    mockLinkNodeToPattern.mockResolvedValue(undefined);
    mockGetNodePatterns.mockResolvedValue([]);
    mockFindPatternSiblings.mockResolvedValue([]);
    mockSearchPatterns.mockResolvedValue([]);
    mockGetPatternStats.mockResolvedValue([]);
});

// =============================================================================
// action: search
// =============================================================================

describe("action: 'search'", () => {
    it('returns error when query param missing', async () => {
        const result = await handleAbstractPatterns({ action: 'search' });
        expect(result.error).toContain('query parameter');
    });

    it('returns patterns from searchPatterns', async () => {
        mockSearchPatterns.mockResolvedValue([
            { id: 'p1', name: 'feedback-loop', description: 'A reinforcing cycle', similarity: 0.923 },
            { id: 'p2', name: 'emergence', description: 'Bottom-up complexity', similarity: 0.874 },
        ]);

        const result = await handleAbstractPatterns({ action: 'search', query: 'reinforcing' });

        expect(result.action).toBe('search');
        expect(result.query).toBe('reinforcing');
        expect(result.count).toBe(2);
        expect(result.patterns[0].id).toBe('p1');
        expect(result.patterns[0].similarity).toBe(0.92); // rounded to 2 decimal places
    });

    it('calls searchPatterns with the query and limit', async () => {
        await handleAbstractPatterns({ action: 'search', query: 'cycles', limit: 5 });

        expect(mockSearchPatterns).toHaveBeenCalledWith('cycles', 5);
    });

    it('returns null similarity when pattern has no similarity field', async () => {
        mockSearchPatterns.mockResolvedValue([
            { id: 'p1', name: 'convergence', description: 'Narrowing possibilities', similarity: null },
        ]);

        const result = await handleAbstractPatterns({ action: 'search', query: 'narrow' });

        expect(result.patterns[0].similarity).toBeNull();
    });

    it('returns empty patterns list when none found', async () => {
        mockSearchPatterns.mockResolvedValue([]);

        const result = await handleAbstractPatterns({ action: 'search', query: 'unknown-topic' });

        expect(result.count).toBe(0);
        expect(result.patterns).toHaveLength(0);
    });
});

// =============================================================================
// action: siblings
// =============================================================================

describe("action: 'siblings'", () => {
    it('returns error when nodeId missing', async () => {
        const result = await handleAbstractPatterns({ action: 'siblings' });
        expect(result.error).toContain('nodeId');
    });

    it('returns message when node has no patterns tagged', async () => {
        mockGetNodePatterns.mockResolvedValue([]);

        const result = await handleAbstractPatterns({ action: 'siblings', nodeId: 'node-1' });

        expect(result.action).toBe('siblings');
        expect(result.message).toContain('no patterns tagged');
        expect(result.patterns).toHaveLength(0);
        expect(result.siblings).toHaveLength(0);
        expect(mockFindPatternSiblings).not.toHaveBeenCalled();
    });

    it('returns siblings when node has patterns', async () => {
        mockGetNodePatterns.mockResolvedValue([
            { name: 'feedback-loop', description: 'Reinforcing cycle', strength: 0.9 },
        ]);
        mockFindPatternSiblings.mockResolvedValue([
            { node_id: 'sibling-1', content: 'Sibling content', domain: 'biology', pattern_name: 'feedback-loop', pattern_strength: 0.85 },
        ]);

        const result = await handleAbstractPatterns({
            action: 'siblings', nodeId: 'node-1', excludeSameDomain: true, limit: 10,
        });

        expect(result.action).toBe('siblings');
        expect(result.nodeId).toBe('node-1');
        expect(result.nodePatterns).toHaveLength(1);
        expect(result.count).toBe(1);
        expect(result.siblings[0].nodeId).toBe('sibling-1');
        expect(result.siblings[0].sharedPattern).toBe('feedback-loop');
        expect(result.excludeSameDomain).toBe(true);
    });

    it('passes excludeSameDomain param to findPatternSiblings', async () => {
        mockGetNodePatterns.mockResolvedValue([
            { name: 'pattern', description: 'desc', strength: 1.0 },
        ]);

        await handleAbstractPatterns({ action: 'siblings', nodeId: 'node-1', excludeSameDomain: false });

        expect(mockFindPatternSiblings).toHaveBeenCalledWith('node-1', false, 10);
    });
});

// =============================================================================
// action: tag
// =============================================================================

describe("action: 'tag'", () => {
    it('returns error when nodeId or patternName missing', async () => {
        const r1 = await handleAbstractPatterns({ action: 'tag', nodeId: 'node-1' });
        expect(r1.error).toContain('patternName');

        const r2 = await handleAbstractPatterns({ action: 'tag', patternName: 'cycle' });
        expect(r2.error).toContain('nodeId');
    });

    it('creates or gets pattern and links node', async () => {
        mockCreateOrGetPattern.mockResolvedValue({
            id: 'pat-1', name: 'feedback-loop', description: 'Custom description',
        });
        mockQueryOne.mockResolvedValue({ content: 'Node content', domain: 'science' });

        const result = await handleAbstractPatterns({
            action: 'tag',
            nodeId: 'node-1',
            patternName: 'feedback-loop',
            patternDescription: 'Custom description',
            strength: 0.8,
            contributor: 'human',
        });

        expect(mockCreateOrGetPattern).toHaveBeenCalledWith('feedback-loop', 'Custom description', 'human');
        expect(mockLinkNodeToPattern).toHaveBeenCalledWith('node-1', 'pat-1', 0.8, 'human');
        expect(result.success).toBe(true);
        expect(result.pattern.id).toBe('pat-1');
        expect(result.strength).toBe(0.8);
    });

    it('uses default description when patternDescription not provided', async () => {
        mockQueryOne.mockResolvedValue({ content: 'Node content', domain: 'tech' });

        await handleAbstractPatterns({
            action: 'tag',
            nodeId: 'node-1',
            patternName: 'emergence',
        });

        expect(mockCreateOrGetPattern).toHaveBeenCalledWith(
            'emergence',
            'Abstract pattern: emergence',
            'claude'
        );
    });

    it('includes node content preview in result', async () => {
        mockCreateOrGetPattern.mockResolvedValue({ id: 'p1', name: 'cycle', description: 'A cycle' });
        mockQueryOne.mockResolvedValue({ content: 'Node with specific content here', domain: 'physics' });

        const result = await handleAbstractPatterns({
            action: 'tag', nodeId: 'node-1', patternName: 'cycle',
        });

        expect(result.node.id).toBe('node-1');
        expect(result.node.domain).toBe('physics');
        expect(typeof result.node.content).toBe('string');
    });

    it('defaults strength to 1.0', async () => {
        mockQueryOne.mockResolvedValue({ content: 'Content', domain: 'science' });

        await handleAbstractPatterns({
            action: 'tag', nodeId: 'node-1', patternName: 'emergence',
        });

        expect(mockLinkNodeToPattern).toHaveBeenCalledWith('node-1', expect.any(String), 1.0, 'claude');
    });
});

// =============================================================================
// action: stats
// =============================================================================

describe("action: 'stats'", () => {
    it('returns pattern stats with counts', async () => {
        mockGetPatternStats.mockResolvedValue([
            { id: 'p1', name: 'feedback-loop', description: 'Reinforcing', node_count: '15', domain_count: '4', domains: 'biology,physics,economics,ai' },
            { id: 'p2', name: 'emergence', description: 'Bottom-up', node_count: '8', domain_count: '3', domains: 'biology,physics,ai' },
        ]);

        const result = await handleAbstractPatterns({ action: 'stats' });

        expect(result.action).toBe('stats');
        expect(result.count).toBe(2);
        expect(result.patterns[0].id).toBe('p1');
        expect(result.patterns[0].nodeCount).toBe(15);
        expect(result.patterns[0].domainCount).toBe(4);
    });

    it('returns empty stats when no patterns', async () => {
        mockGetPatternStats.mockResolvedValue([]);

        const result = await handleAbstractPatterns({ action: 'stats' });

        expect(result.count).toBe(0);
        expect(result.patterns).toHaveLength(0);
    });
});

// =============================================================================
// Unknown action
// =============================================================================

describe('unknown action', () => {
    it('returns error for unrecognized action', async () => {
        const result = await handleAbstractPatterns({ action: 'invalid-action' });
        expect(result.error).toContain('Unknown action');
        expect(result.error).toContain('invalid-action');
    });
});
