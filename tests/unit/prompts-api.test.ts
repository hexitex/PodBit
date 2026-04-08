/**
 * Tests for prompts/api.ts — getPrompt, listPrompts, savePrompt,
 * deletePromptOverride, invalidateCache, previewPrompt.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQuery = jest.fn<(...args: any[]) => any>();
const mockQueryOne = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
    systemQuery: mockQuery,
    systemQueryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../prompts/defaults.js', () => ({
    DEFAULT_PROMPTS: {
        'core.test_prompt': {
            id: 'core.test_prompt',
            category: 'core',
            description: 'A test prompt',
            variables: ['name', 'topic'],
            content: 'Hello {{name}}, welcome to {{topic}}.',
        },
        'core.no_vars': {
            id: 'core.no_vars',
            category: 'core',
            description: 'No variables',
            variables: [],
            content: 'Static content here.',
        },
    } as Record<string, any>,
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

let getPrompt: typeof import('../../prompts/api.js').getPrompt;
let listPrompts: typeof import('../../prompts/api.js').listPrompts;
let savePrompt: typeof import('../../prompts/api.js').savePrompt;
let deletePromptOverride: typeof import('../../prompts/api.js').deletePromptOverride;
let invalidateCache: typeof import('../../prompts/api.js').invalidateCache;
let previewPrompt: typeof import('../../prompts/api.js').previewPrompt;

beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await import('../../prompts/api.js');
    getPrompt = mod.getPrompt;
    listPrompts = mod.listPrompts;
    savePrompt = mod.savePrompt;
    deletePromptOverride = mod.deletePromptOverride;
    invalidateCache = mod.invalidateCache;
    previewPrompt = mod.previewPrompt;
    // Clear the in-memory prompt cache to avoid cross-test interference
    // invalidateCache requires (id, locale) — clear known test IDs
    invalidateCache('core.test_prompt', 'en');
    invalidateCache('core.no_vars', 'en');
    invalidateCache('nonexistent.prompt', 'en');
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('prompts/api', () => {
    describe('getPrompt', () => {
        it('returns default prompt with interpolated variables', async () => {
            mockQueryOne.mockResolvedValue(null);
            const result = await getPrompt('core.test_prompt', { name: 'Alice', topic: 'testing' });
            expect(result).toBe('Hello Alice, welcome to testing.');
        });

        it('replaces missing variables with empty string', async () => {
            mockQueryOne.mockResolvedValue(null);
            const result = await getPrompt('core.test_prompt', { name: 'Bob' });
            expect(result).toBe('Hello Bob, welcome to .');
        });

        it('returns DB override when present', async () => {
            mockQueryOne.mockResolvedValue({ content: 'DB override: {{name}}' });
            const result = await getPrompt('core.test_prompt', { name: 'Carol' });
            expect(result).toBe('DB override: Carol');
        });

        it('throws for unknown prompt ID when no DB override', async () => {
            mockQueryOne.mockResolvedValue(null);
            await expect(getPrompt('nonexistent.prompt')).rejects.toThrow('Unknown prompt ID: nonexistent.prompt');
        });

        it('falls back to default when DB query throws', async () => {
            mockQueryOne.mockRejectedValue(new Error('table not found'));
            const result = await getPrompt('core.no_vars');
            expect(result).toBe('Static content here.');
        });

        it('returns prompt with no variables unchanged', async () => {
            mockQueryOne.mockResolvedValue(null);
            const result = await getPrompt('core.no_vars');
            expect(result).toBe('Static content here.');
        });
    });

    describe('invalidateCache', () => {
        it('forces re-fetch after invalidation', async () => {
            mockQueryOne.mockResolvedValue(null);
            await getPrompt('core.no_vars');
            mockQueryOne.mockClear();
            mockQueryOne.mockResolvedValue(null);
            invalidateCache('core.no_vars', 'en');
            await getPrompt('core.no_vars');
            expect(mockQueryOne).toHaveBeenCalledTimes(1);
        });
    });

    describe('listPrompts', () => {
        it('returns defaults with override=false when no DB overrides', async () => {
            mockQuery.mockResolvedValue([]);
            const result = await listPrompts();
            expect(result.length).toBe(2);
            expect(result.every(r => r.override === false)).toBe(true);
        });

        it('merges DB overrides and marks them', async () => {
            mockQuery.mockResolvedValue([
                { id: 'core.test_prompt', content: 'overridden content', description: 'new desc' },
            ]);
            const result = await listPrompts();
            const overridden = result.find(r => r.id === 'core.test_prompt');
            expect(overridden?.content).toBe('overridden content');
            expect(overridden?.description).toBe('new desc');
            expect(overridden?.override).toBe(true);
        });

        it('merges override without description leaving original', async () => {
            mockQuery.mockResolvedValue([
                { id: 'core.test_prompt', content: 'overridden', description: null },
            ]);
            const result = await listPrompts();
            const overridden = result.find(r => r.id === 'core.test_prompt');
            expect(overridden?.content).toBe('overridden');
            // description not overwritten because row.description is falsy
            expect(overridden?.description).toBe('A test prompt');
        });

        it('handles DB query failure gracefully', async () => {
            mockQuery.mockRejectedValue(new Error('no table'));
            const result = await listPrompts();
            expect(result.length).toBe(2);
        });

        it('ignores overrides for IDs not in defaults', async () => {
            mockQuery.mockResolvedValue([
                { id: 'nonexistent.id', content: 'x', description: null },
            ]);
            const result = await listPrompts();
            expect(result.length).toBe(2);
            expect(result.find(r => r.id === 'nonexistent.id')).toBeUndefined();
        });
    });

    describe('savePrompt', () => {
        it('calls query with correct params for known prompt', async () => {
            mockQuery.mockResolvedValue([]);
            await savePrompt('core.test_prompt', 'en', 'new content', 'desc');
            expect(mockQuery).toHaveBeenCalledTimes(1);
            const args = mockQuery.mock.calls[0];
            expect(args[1]).toEqual(['core.test_prompt', 'core', 'en', 'new content', 'desc']);
        });

        it('uses "custom" category for unknown prompt ID', async () => {
            mockQuery.mockResolvedValue([]);
            await savePrompt('unknown.prompt', 'en', 'content');
            const args = mockQuery.mock.calls[0];
            expect(args[1][1]).toBe('custom');
        });

        it('passes null for undefined description', async () => {
            mockQuery.mockResolvedValue([]);
            await savePrompt('core.test_prompt', 'en', 'c');
            const args = mockQuery.mock.calls[0];
            expect(args[1][4]).toBeNull();
        });
    });

    describe('deletePromptOverride', () => {
        it('deletes from DB', async () => {
            mockQuery.mockResolvedValue([]);
            await deletePromptOverride('core.test_prompt', 'en');
            expect(mockQuery).toHaveBeenCalledTimes(1);
            expect(mockQuery.mock.calls[0][1]).toEqual(['core.test_prompt', 'en']);
        });

        it('uses default locale en', async () => {
            mockQuery.mockResolvedValue([]);
            await deletePromptOverride('core.test_prompt');
            expect(mockQuery.mock.calls[0][1]).toEqual(['core.test_prompt', 'en']);
        });
    });

    describe('previewPrompt', () => {
        it('delegates to getPrompt with vars', async () => {
            mockQueryOne.mockResolvedValue(null);
            const result = await previewPrompt('core.test_prompt', 'en', { name: 'Test', topic: 'preview' });
            expect(result).toBe('Hello Test, welcome to preview.');
        });
    });
});
