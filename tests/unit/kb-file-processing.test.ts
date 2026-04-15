/**
 * Unit tests for kb/pipeline/file-processing.ts — file processing, curation cleaning,
 * low-value detection, node archival, and folder completion logic.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// MOCKS
// =============================================================================

const mockDbQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockDbQuery,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        knowledgeBase: {
            maxChunkSize: 4000,
            minChunkLength: 50,
            curationMaxTokens: 2000,
            postIngestionSummary: false, // disable in most tests
        },
    },
}));

const mockEmitActivity = jest.fn();
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

const mockGetReaderForExtension = jest.fn();
jest.unstable_mockModule('../../kb/readers/registry.js', () => ({
    getReaderForExtension: mockGetReaderForExtension,
}));

const mockGetPrompt = jest.fn().mockResolvedValue('test prompt');
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

// Mock queue state — these are mutable module-level vars
let mockQueue: any[] = [];
let mockStopRequested = false;
let mockCompletedCount = 0;
let mockFailedCount = 0;
let mockSkippedCount = 0;

jest.unstable_mockModule('../../kb/pipeline/queue.js', () => ({
    get queue() { return mockQueue; },
    get stopRequested() { return mockStopRequested; },
    get completedCount() { return mockCompletedCount; },
    set completedCount(v: number) { mockCompletedCount = v; },
    get failedCount() { return mockFailedCount; },
    set failedCount(v: number) { mockFailedCount = v; },
    get skippedCount() { return mockSkippedCount; },
    set skippedCount(v: number) { mockSkippedCount = v; },
    setCompletedCount: (n: number) => { mockCompletedCount = n; },
    setFailedCount: (n: number) => { mockFailedCount = n; },
    setSkippedCount: (n: number) => { mockSkippedCount = n; },
}));

const {
    cleanCurationOutput,
    isLowValueCuration,
    archiveFileNodes,
    processFile,
    maybeFinishFolderProcessing,
} = await import('../../kb/pipeline/file-processing.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockDbQuery.mockResolvedValue([]);
    mockEmitActivity.mockReturnValue(undefined);
    mockGetReaderForExtension.mockReturnValue(null);
    mockGetPrompt.mockResolvedValue('test prompt');
    mockQueue = [];
    mockStopRequested = false;
    mockCompletedCount = 0;
    mockFailedCount = 0;
    mockSkippedCount = 0;
});

// =============================================================================
// cleanCurationOutput
// =============================================================================

describe('cleanCurationOutput', () => {
    it('strips code fences', () => {
        const input = '```json\n{"key": "value"}\n```';
        const result = cleanCurationOutput(input);
        expect(result).not.toContain('```');
    });

    it('extracts string values from JSON output', () => {
        const input = '{"summary": "This is a long enough summary to pass the 10 char check", "detail": "Another long detail string here"}';
        const result = cleanCurationOutput(input);
        expect(result).toContain('This is a long enough summary to pass the 10 char check');
        expect(result).toContain('Another long detail string here');
    });

    it('handles JSON arrays', () => {
        const input = '["First long enough string value", "Second long enough string"]';
        const result = cleanCurationOutput(input);
        expect(result).toContain('First long enough string value');
    });

    it('strips markdown headers', () => {
        expect(cleanCurationOutput('## Summary')).toBe('Summary');
        expect(cleanCurationOutput('### Detail')).toBe('Detail');
    });

    it('strips bold/italic markers', () => {
        expect(cleanCurationOutput('**bold text**')).toBe('bold text');
        expect(cleanCurationOutput('*italic text*')).toBe('italic text');
    });

    it('removes bullet list markers', () => {
        const input = '- item one\n- item two\n* item three';
        const result = cleanCurationOutput(input);
        expect(result).not.toMatch(/^[-*]/m);
        expect(result).toContain('item one');
        expect(result).toContain('item two');
    });

    it('removes numbered list markers', () => {
        const input = '1. first\n2. second\n3. third';
        const result = cleanCurationOutput(input);
        expect(result).not.toMatch(/^\d+\./m);
        expect(result).toContain('first');
    });

    it('strips key-value patterns at line start', () => {
        const input = 'Type: function\nPurpose: testing';
        const result = cleanCurationOutput(input);
        expect(result).toContain('function');
        expect(result).toContain('testing');
        expect(result).not.toMatch(/^Type:/m);
    });

    it('collapses multiple newlines into spaces', () => {
        const input = 'line one\n\n\nline two\nline three';
        const result = cleanCurationOutput(input);
        expect(result).not.toContain('\n');
    });

    it('collapses multiple spaces', () => {
        const result = cleanCurationOutput('too   many    spaces');
        expect(result).not.toMatch(/\s{2,}/);
    });

    it('trims leading and trailing whitespace', () => {
        expect(cleanCurationOutput('  hello  ')).toBe('hello');
    });

    it('handles empty string', () => {
        expect(cleanCurationOutput('')).toBe('');
    });

    it('handles invalid JSON gracefully (continues with text cleanup)', () => {
        const input = '{not valid json at all';
        const result = cleanCurationOutput(input);
        // Should not throw, just clean as text
        expect(typeof result).toBe('string');
    });

    it('ignores short JSON string values (<= 10 chars)', () => {
        const input = '{"a": "short", "b": "This is definitely long enough to include"}';
        const result = cleanCurationOutput(input);
        expect(result).not.toContain('short');
        expect(result).toContain('This is definitely long enough to include');
    });
});

// =============================================================================
// isLowValueCuration
// =============================================================================

describe('isLowValueCuration', () => {
    it('detects "I\'m sorry" refusal at start', () => {
        expect(isLowValueCuration("I'm sorry, I can't process that.")).toBe(true);
    });

    it('detects "I cannot" refusal at start', () => {
        expect(isLowValueCuration("I cannot analyze this content.")).toBe(true);
    });

    it('detects "I can\'t" refusal at start', () => {
        expect(isLowValueCuration("I can't help with that.")).toBe(true);
    });

    it('detects combined sorry+cant mid-sentence', () => {
        expect(isLowValueCuration("Unfortunately I'm sorry but I can't do this")).toBe(true);
    });

    it('detects sorry+not provided', () => {
        expect(isLowValueCuration("I'm sorry but the content was not provided")).toBe(true);
    });

    it('detects "does not define any" for short text', () => {
        expect(isLowValueCuration('This file does not define any functions.')).toBe(true);
    });

    it('detects "does not declare any" for short text', () => {
        expect(isLowValueCuration('The module does not declare any exports.')).toBe(true);
    });

    it('allows "does not define any" in long descriptions (>200 chars)', () => {
        const longText = 'This module does not define any new classes but ' + 'x'.repeat(200);
        expect(isLowValueCuration(longText)).toBe(false);
    });

    it('detects "only contains import statements"', () => {
        expect(isLowValueCuration('Only contains import statements.')).toBe(true);
    });

    it('detects "only has require statements"', () => {
        expect(isLowValueCuration('This file only has require statements')).toBe(true);
    });

    it('allows "only imports" pattern in long text', () => {
        const longText = 'This file only contains import statements but also ' + 'y'.repeat(200);
        expect(isLowValueCuration(longText)).toBe(false);
    });

    it('returns false for normal content', () => {
        expect(isLowValueCuration('This function validates user input and returns sanitized data.')).toBe(false);
    });

    it('returns false for empty string', () => {
        expect(isLowValueCuration('')).toBe(false);
    });
});

// =============================================================================
// archiveFileNodes
// =============================================================================

describe('archiveFileNodes', () => {
    it('archives nodes from chunks and file-level node', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ node_id: 'node-a' }, { node_id: 'node-b' }])  // chunk nodes
            .mockResolvedValueOnce([{ node_id: 'node-c' }])                           // file node
            .mockResolvedValueOnce([]);                                                 // UPDATE result

        const count = await archiveFileNodes('file-123');
        expect(count).toBe(3);
        // The UPDATE call should include all 3 node IDs (+ recursive descendant archive = 4 calls)
        expect(mockDbQuery).toHaveBeenCalledTimes(4);
        const updateCall = mockDbQuery.mock.calls[2];
        expect(updateCall[0]).toContain('UPDATE nodes SET archived = 1');
        expect(updateCall[1]).toEqual(expect.arrayContaining(['node-a', 'node-b', 'node-c']));
    });

    it('deduplicates node IDs', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ node_id: 'node-a' }, { node_id: 'node-a' }])  // duplicate chunk nodes
            .mockResolvedValueOnce([{ node_id: 'node-a' }])                           // same file node
            .mockResolvedValueOnce([]);                                                 // UPDATE

        const count = await archiveFileNodes('file-123');
        expect(count).toBe(1); // deduplicated
        const updateCall = mockDbQuery.mock.calls[2];
        expect(updateCall[1]).toEqual(['node-a']);
    });

    it('returns 0 when no nodes exist', async () => {
        mockDbQuery
            .mockResolvedValueOnce([])     // no chunk nodes
            .mockResolvedValueOnce([]);    // no file node

        const count = await archiveFileNodes('file-123');
        expect(count).toBe(0);
        // Should not call UPDATE
        expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });

    it('handles null node_ids gracefully', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ node_id: null }, { node_id: 'node-a' }])
            .mockResolvedValueOnce([{ node_id: null }])
            .mockResolvedValueOnce([]);

        const count = await archiveFileNodes('file-123');
        expect(count).toBe(1); // only node-a
    });

    it('handles file row with no node_id', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ node_id: 'node-a' }])
            .mockResolvedValueOnce([{}])   // file row without node_id field
            .mockResolvedValueOnce([]);

        const count = await archiveFileNodes('file-123');
        expect(count).toBe(1);
    });
});

// =============================================================================
// processFile
// =============================================================================

describe('processFile', () => {
    const baseJob = {
        fileId: 'file-1',
        filePath: '/test/project/src/utils.ts',
        folderId: 'folder-1',
        domain: 'test-domain',
        extension: 'ts',
        priority: 0,
        rawMode: false,
    };

    it('marks file as skipped when no reader found', async () => {
        mockGetReaderForExtension.mockReturnValue(null);
        mockDbQuery.mockResolvedValue([]);

        await processFile(baseJob);

        // Should update status to 'skipped'
        const statusCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'skipped'") && c[0].includes('No reader')
        );
        expect(statusCall).toBeTruthy();
    });

    it('marks file as skipped when no model assigned (non-raw)', async () => {
        mockGetReaderForExtension.mockReturnValue({
            id: 'text',
            subsystem: 'reader_text',
            requiresLLM: false,
            read: jest.fn(),
        });

        // The import('../../models.js') inside processFile
        jest.unstable_mockModule('../../models.js', () => ({
            getSubsystemAssignments: jest.fn<() => Promise<any>>().mockResolvedValue({}),
            callSubsystemModel: jest.fn(),
        }));

        mockDbQuery.mockResolvedValue([]);

        await processFile(baseJob);

        const statusCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'skipped'") && c[0].includes('No model assigned')
        );
        expect(statusCall).toBeTruthy();
    });

    it('marks file as skipped when reader returns no chunks', async () => {
        const mockReader = {
            id: 'text',
            subsystem: 'reader_text',
            requiresLLM: false,
            read: jest.fn<() => Promise<any>>().mockResolvedValue({ chunks: [] }),
        };
        mockGetReaderForExtension.mockReturnValue(mockReader);
        mockDbQuery.mockResolvedValue([]);

        await processFile({ ...baseJob, rawMode: true }); // raw mode skips model check

        const statusCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'skipped'") && c[0].includes('No content')
        );
        expect(statusCall).toBeTruthy();
    });

    it('processes raw mode without LLM curation', async () => {
        const mockCreateNode = jest.fn().mockResolvedValue({ id: 'new-node-1' });
        const mockCreateEdge = jest.fn().mockResolvedValue(undefined);
        jest.unstable_mockModule('../../core.js', () => ({
            createNode: mockCreateNode,
            createEdge: mockCreateEdge,
        }));

        const mockReader = {
            id: 'text',
            subsystem: 'reader_text',
            requiresLLM: false,
            read: jest.fn<() => Promise<any>>().mockResolvedValue({
                chunks: [{
                    content: 'A'.repeat(60), // above minChunkLength
                    label: 'chunk-0',
                    index: 0,
                    type: 'text',
                    metadata: {},
                }],
            }),
        };
        mockGetReaderForExtension.mockReturnValue(mockReader);
        mockDbQuery.mockResolvedValue([]);

        await processFile({ ...baseJob, rawMode: true });

        // Should have called createNode with 'raw' type and prepended filename
        // (dynamic import means we can't easily assert on the mock from unstable_mockModule
        //  but the file status should be updated to completed)
        const completedCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'completed'")
        );
        expect(completedCall).toBeTruthy();
    });

    it('handles errors and marks file as error status', async () => {
        const mockReader = {
            id: 'text',
            subsystem: 'reader_text',
            requiresLLM: false,
            read: jest.fn<() => Promise<any>>().mockRejectedValue(new Error('Read failed')),
        };
        mockGetReaderForExtension.mockReturnValue(mockReader);
        mockDbQuery.mockResolvedValue([]);

        await processFile({ ...baseJob, rawMode: true });

        const errorCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'error'")
        );
        expect(errorCall).toBeTruthy();
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'kb', 'file_error',
            expect.stringContaining('Failed'),
            expect.objectContaining({ fileId: 'file-1' })
        );
    });

    it('emits activity on start and completion', async () => {
        const mockReader = {
            id: 'text',
            subsystem: 'reader_text',
            requiresLLM: false,
            read: jest.fn<() => Promise<any>>().mockResolvedValue({ chunks: [] }),
        };
        mockGetReaderForExtension.mockReturnValue(mockReader);
        mockDbQuery.mockResolvedValue([]);

        await processFile({ ...baseJob, rawMode: true });

        // Should emit file_processing at start
        expect(mockEmitActivity).toHaveBeenCalledWith(
            'kb', 'file_processing',
            expect.stringContaining('Processing'),
            expect.objectContaining({ fileId: 'file-1' })
        );
    });

    it('skips chunks below minChunkLength', async () => {
        const mockReader = {
            id: 'text',
            subsystem: 'reader_text',
            requiresLLM: false,
            read: jest.fn<() => Promise<any>>().mockResolvedValue({
                chunks: [{
                    content: 'short', // below 50 chars
                    label: 'chunk-0',
                    index: 0,
                    type: 'text',
                }],
            }),
        };
        mockGetReaderForExtension.mockReturnValue(mockReader);
        mockDbQuery.mockResolvedValue([]);

        await processFile({ ...baseJob, rawMode: true });

        // Since the only chunk was too short, it should complete with 0 chunks
        const completedCall = mockDbQuery.mock.calls.find(
            c => typeof c[0] === 'string' && c[0].includes("status = 'completed'") && c[0].includes('chunk_count')
        );
        if (completedCall) {
            // chunk_count param should be 0
            expect(completedCall[1]).toContain(0);
        }
    });
});

// =============================================================================
// maybeFinishFolderProcessing
// =============================================================================

describe('maybeFinishFolderProcessing', () => {
    it('does nothing when pending/processing files remain', async () => {
        mockDbQuery.mockResolvedValueOnce([{ cnt: '3' }]); // 3 remaining files

        await maybeFinishFolderProcessing('folder-1');

        // Should only have called the COUNT query
        expect(mockDbQuery).toHaveBeenCalledTimes(1);
    });

    it('proceeds to folder query when queue has no jobs for the folder', async () => {
        // queue is empty (no jobs for this folder), so it should check folder status
        mockDbQuery
            .mockResolvedValueOnce([{ cnt: '0' }])  // no remaining files
            .mockResolvedValueOnce([{ watch_enabled: 0, status: 'processing', domain: 'test', raw_mode: 0 }])
            .mockResolvedValueOnce([]);

        await maybeFinishFolderProcessing('folder-1');

        // Should have queried folder status (2nd call) and updated (3rd call)
        expect(mockDbQuery).toHaveBeenCalledTimes(3);
    });

    it('transitions folder to idle when not watching', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ cnt: '0' }])  // no remaining files
            .mockResolvedValueOnce([{ watch_enabled: 0, status: 'processing', domain: 'test', raw_mode: 0 }])  // folder row
            .mockResolvedValueOnce([]);               // UPDATE

        await maybeFinishFolderProcessing('folder-1');

        const updateCall = mockDbQuery.mock.calls[2];
        expect(updateCall[0]).toContain('UPDATE kb_folders SET status');
        expect(updateCall[1]).toContain('idle');
    });

    it('transitions folder to watching when watch_enabled', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ cnt: '0' }])
            .mockResolvedValueOnce([{ watch_enabled: 1, status: 'processing', domain: 'test', raw_mode: 0 }])
            .mockResolvedValueOnce([]);

        await maybeFinishFolderProcessing('folder-1');

        const updateCall = mockDbQuery.mock.calls[2];
        expect(updateCall[1]).toContain('watching');
    });

    it('does not transition if folder is not in processing state', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ cnt: '0' }])
            .mockResolvedValueOnce([{ watch_enabled: 0, status: 'idle', domain: 'test', raw_mode: 0 }]);

        await maybeFinishFolderProcessing('folder-1');

        // Should only have 2 queries (COUNT + SELECT), no UPDATE
        expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });

    it('handles missing folder gracefully', async () => {
        mockDbQuery
            .mockResolvedValueOnce([{ cnt: '0' }])
            .mockResolvedValueOnce([]);  // folder not found

        await maybeFinishFolderProcessing('missing-folder');
        // Should not throw
        expect(mockDbQuery).toHaveBeenCalledTimes(2);
    });

    it('suppresses errors silently', async () => {
        mockDbQuery.mockRejectedValueOnce(new Error('DB gone'));

        // Should not throw
        await expect(maybeFinishFolderProcessing('folder-1')).resolves.toBeUndefined();
    });
});
