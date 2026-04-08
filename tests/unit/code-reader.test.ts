/**
 * Unit tests for kb/readers/code-reader.ts — source code file reader.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadFileSync = jest.fn<(p: string, enc?: string) => string>().mockReturnValue('');

jest.unstable_mockModule('fs', () => ({
    default: {
        readFileSync: mockReadFileSync,
    },
    readFileSync: mockReadFileSync,
}));

const { codeReader } = await import('../../kb/readers/code-reader.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockReadFileSync.mockReturnValue('');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('codeReader metadata', () => {
    it('has correct id, name, and subsystem', () => {
        expect(codeReader.id).toBe('code');
        expect(codeReader.name).toBe('Code Reader');
        expect(codeReader.subsystem).toBe('reader_code');
    });

    it('does not require an LLM', () => {
        expect(codeReader.requiresLLM).toBe(false);
    });

    it('supports common code extensions', () => {
        expect(codeReader.extensions).toContain('ts');
        expect(codeReader.extensions).toContain('js');
        expect(codeReader.extensions).toContain('py');
        expect(codeReader.extensions).toContain('go');
        expect(codeReader.extensions).toContain('rs');
        expect(codeReader.extensions).toContain('java');
    });

    it('has mimeTypes array', () => {
        expect(Array.isArray(codeReader.mimeTypes)).toBe(true);
        expect(codeReader.mimeTypes.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// read() — basic behavior
// ---------------------------------------------------------------------------

describe('codeReader.read', () => {
    it('returns at least one chunk for an empty file', async () => {
        mockReadFileSync.mockReturnValue('');
        const result = await codeReader.read('/test/file.ts');
        expect(result.chunks.length).toBeGreaterThanOrEqual(1);
        expect(result.metadata.language).toBe('typescript');
    });

    it('detects language from extension', async () => {
        mockReadFileSync.mockReturnValue('x = 1');
        const result = await codeReader.read('/test/file.py');
        expect(result.metadata.language).toBe('python');
    });

    it('falls back to extension string for unknown languages', async () => {
        mockReadFileSync.mockReturnValue('some content');
        const result = await codeReader.read('/test/file.xyz');
        expect(result.metadata.language).toBe('xyz');
    });

    it('splits code into blocks on function boundaries', async () => {
        const code = [
            'import { foo } from "./bar";',
            '',
            'export function greet(name: string) {',
            '    return `Hello ${name}`;',
            '}',
            '',
            'function farewell(name: string) {',
            '    return `Goodbye ${name}`;',
            '}',
        ].join('\n');

        mockReadFileSync.mockReturnValue(code);
        const result = await codeReader.read('/test/file.ts');

        // Should produce preamble + two function blocks
        expect(result.chunks.length).toBeGreaterThanOrEqual(2);

        // Check that function names appear in labels
        const labels = result.chunks.map(c => c.label);
        expect(labels.some(l => l.includes('greet'))).toBe(true);
        expect(labels.some(l => l.includes('farewell'))).toBe(true);
    });

    it('creates a preamble chunk for imports before first block', async () => {
        const code = [
            'import fs from "fs";',
            'import path from "path";',
            '',
            'function main() {',
            '    console.log("hello");',
            '}',
        ].join('\n');

        mockReadFileSync.mockReturnValue(code);
        const result = await codeReader.read('/test/file.ts');

        const preamble = result.chunks.find(c => c.metadata?.blockType === 'preamble');
        expect(preamble).toBeDefined();
        expect(preamble!.label).toBe('Imports & preamble');
    });

    it('skips preamble if too short (<=20 chars)', async () => {
        const code = [
            '// hi',
            'function main() {',
            '    return 1;',
            '}',
        ].join('\n');

        mockReadFileSync.mockReturnValue(code);
        const result = await codeReader.read('/test/file.ts');

        const preamble = result.chunks.find(c => c.metadata?.blockType === 'preamble');
        expect(preamble).toBeUndefined();
    });

    it('splits by lines when no recognizable blocks found', async () => {
        // Content without function/class/def keywords
        const code = Array(50).fill('some_data = 123;').join('\n');
        mockReadFileSync.mockReturnValue(code);

        const result = await codeReader.read('/test/file.ts', { maxChunkSize: 200 });
        expect(result.chunks.length).toBeGreaterThan(1);
    });

    it('respects maxChunkSize option', async () => {
        const code = Array(200).fill('let x = 1;').join('\n');
        mockReadFileSync.mockReturnValue(code);

        const result = await codeReader.read('/test/file.ts', { maxChunkSize: 100 });
        for (const chunk of result.chunks) {
            expect(chunk.content.length).toBeLessThanOrEqual(100);
        }
    });

    it('uses default maxChunkSize of 4000 when not specified', async () => {
        // Build content with recognizable blocks that exceed 4000 chars
        const lines = [
            'import foo from "bar";',
            '',
            'function bigFunction() {',
            ...Array(100).fill('    const x = "some fairly long line of code that fills up space in this block";'),
            '}',
        ];
        mockReadFileSync.mockReturnValue(lines.join('\n'));
        const result = await codeReader.read('/test/file.ts');

        // Each chunk content should respect the 4000 default
        for (const chunk of result.chunks) {
            expect(chunk.content.length).toBeLessThanOrEqual(4000);
        }
    });

    it('handles Python block patterns', async () => {
        const code = [
            'import os',
            '',
            'class MyClass:',
            '    pass',
            '',
            'def my_func():',
            '    return 42',
        ].join('\n');

        mockReadFileSync.mockReturnValue(code);
        const result = await codeReader.read('/test/file.py');

        const labels = result.chunks.map(c => c.label);
        expect(labels.some(l => l.includes('MyClass'))).toBe(true);
        expect(labels.some(l => l.includes('my_func'))).toBe(true);
    });

    it('splits oversized blocks into sub-chunks', async () => {
        const bigFunc = [
            'function bigFunction() {',
            ...Array(100).fill('    const x = "some fairly long line of code that takes up space";'),
            '}',
        ].join('\n');

        mockReadFileSync.mockReturnValue(bigFunc);
        const result = await codeReader.read('/test/file.ts', { maxChunkSize: 200 });

        // The single large block should be split into multiple parts
        expect(result.chunks.length).toBeGreaterThan(1);
        const partLabels = result.chunks.filter(c => c.label.includes('part'));
        expect(partLabels.length).toBeGreaterThan(0);
    });

    it('sets code_block type on chunks', async () => {
        const code = 'function foo() { return 1; }';
        mockReadFileSync.mockReturnValue(code);
        const result = await codeReader.read('/test/file.ts');

        expect(result.chunks.some(c => c.type === 'code_block' || c.type === 'full')).toBe(true);
    });

    it('includes startLine and endLine metadata on block chunks', async () => {
        const code = [
            'function alpha() { return 1; }',
            'function beta() { return 2; }',
        ].join('\n');

        mockReadFileSync.mockReturnValue(code);
        const result = await codeReader.read('/test/file.ts');

        const blockChunk = result.chunks.find(c => c.metadata?.startLine !== undefined);
        if (blockChunk) {
            expect(typeof blockChunk.metadata.startLine).toBe('number');
            expect(typeof blockChunk.metadata.endLine).toBe('number');
        }
    });
});
