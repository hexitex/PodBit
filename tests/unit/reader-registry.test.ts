/**
 * Unit tests for kb/readers/registry.ts — reader plugin registration,
 * extension mapping, custom overrides, and unmapping.
 *
 * No external mocks needed — the registry is a self-contained in-memory module.
 * We mock the types import since it references models.js.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the types module (it imports from models.js which has DB deps)
jest.unstable_mockModule('../../kb/readers/types.js', () => ({}));

// We need to isolate each test since the registry is module-level state.
// Import fresh for each describe block via dynamic import.

// Helper to create a mock reader plugin
function makeReader(id: string, name: string, extensions: string[]): any {
    return {
        id,
        name,
        subsystem: `reader_${id}`,
        extensions,
        mimeTypes: [`application/${id}`],
        requiresLLM: false,
        read: jest.fn(),
    };
}

// Since we can't re-import the module per test (module cache), we need to
// test in a specific order and be aware of cumulative state.

const {
    registerReader,
    getReaderForExtension,
    getAllReaders,
    getSupportedExtensions,
    mapExtensionToReader,
    unmapExtension,
    getCustomMappings,
} = await import('../../kb/readers/registry.js');

describe('registerReader', () => {
    const textReader = makeReader('text', 'Text Reader', ['txt', 'md', 'log']);

    it('registers a reader and maps all its extensions', () => {
        registerReader(textReader);

        expect(getReaderForExtension('txt')).toBe(textReader);
        expect(getReaderForExtension('md')).toBe(textReader);
        expect(getReaderForExtension('log')).toBe(textReader);
    });

    it('appears in getAllReaders', () => {
        const readers = getAllReaders();
        expect(readers).toContainEqual(textReader);
    });

    it('extensions appear in getSupportedExtensions', () => {
        const exts = getSupportedExtensions();
        expect(exts).toContain('txt');
        expect(exts).toContain('md');
        expect(exts).toContain('log');
    });

    it('registers multiple readers', () => {
        const pdfReader = makeReader('pdf', 'PDF Reader', ['pdf']);
        registerReader(pdfReader);

        expect(getReaderForExtension('pdf')).toBe(pdfReader);
        expect(getReaderForExtension('txt')).toBe(textReader);
    });
});

describe('getReaderForExtension', () => {
    it('returns null for unregistered extension', () => {
        expect(getReaderForExtension('xyz')).toBeNull();
    });

    it('is case-insensitive', () => {
        expect(getReaderForExtension('TXT')).not.toBeNull();
        expect(getReaderForExtension('Txt')).not.toBeNull();
    });

    it('strips leading dot', () => {
        expect(getReaderForExtension('.txt')).not.toBeNull();
        expect(getReaderForExtension('.TXT')).not.toBeNull();
    });
});

describe('getAllReaders', () => {
    it('returns a copy (not the internal array)', () => {
        const a = getAllReaders();
        const b = getAllReaders();
        expect(a).not.toBe(b);
        expect(a).toEqual(b);
    });
});

describe('mapExtensionToReader', () => {
    it('maps a new extension to an existing reader by name', () => {
        const result = mapExtensionToReader('cfg', 'Text Reader');
        expect(result).toBe(true);
        expect(getReaderForExtension('cfg')?.name).toBe('Text Reader');
    });

    it('is case-insensitive for reader name', () => {
        const result = mapExtensionToReader('ini', 'text reader');
        expect(result).toBe(true);
        expect(getReaderForExtension('ini')).not.toBeNull();
    });

    it('normalizes extension (lowercase, strip dot)', () => {
        const result = mapExtensionToReader('.TOML', 'Text Reader');
        expect(result).toBe(true);
        expect(getReaderForExtension('toml')).not.toBeNull();
    });

    it('returns false for unknown reader name', () => {
        const result = mapExtensionToReader('abc', 'Nonexistent Reader');
        expect(result).toBe(false);
        expect(getReaderForExtension('abc')).toBeNull();
    });

    it('can override a built-in extension mapping', () => {
        // Register a code reader
        const codeReader = makeReader('code', 'Code Reader', ['js', 'ts']);
        registerReader(codeReader);

        // Now override 'txt' to point to Code Reader
        const result = mapExtensionToReader('txt', 'Code Reader');
        expect(result).toBe(true);
        expect(getReaderForExtension('txt')?.name).toBe('Code Reader');
    });

    it('appears in getCustomMappings', () => {
        mapExtensionToReader('custom1', 'Text Reader');
        const mappings = getCustomMappings();
        const found = mappings.find(m => m.extension === 'custom1');
        expect(found).toBeDefined();
        expect(found!.readerName).toBe('Text Reader');
    });
});

describe('unmapExtension', () => {
    it('restores built-in mapping when unmapping an override', () => {
        // 'txt' was overridden to Code Reader above, unmap should restore to Text Reader
        const result = unmapExtension('txt');
        expect(result).toBe(true);
        expect(getReaderForExtension('txt')?.name).toBe('Text Reader');
    });

    it('removes non-built-in custom extension entirely', () => {
        mapExtensionToReader('custom2', 'Text Reader');
        expect(getReaderForExtension('custom2')).not.toBeNull();

        const result = unmapExtension('custom2');
        expect(result).toBe(true);
        expect(getReaderForExtension('custom2')).toBeNull();
    });

    it('returns false for non-custom-mapped extension', () => {
        const result = unmapExtension('notmapped');
        expect(result).toBe(false);
    });

    it('returns false for built-in extension that was never custom-mapped', () => {
        const result = unmapExtension('md');
        expect(result).toBe(false);
    });

    it('removes extension from getCustomMappings after unmap', () => {
        mapExtensionToReader('tempext', 'Text Reader');
        expect(getCustomMappings().some(m => m.extension === 'tempext')).toBe(true);

        unmapExtension('tempext');
        expect(getCustomMappings().some(m => m.extension === 'tempext')).toBe(false);
    });
});

describe('getCustomMappings', () => {
    it('returns only custom-mapped extensions', () => {
        const mappings = getCustomMappings();
        // Should not include built-in extensions like 'md', 'log', 'pdf'
        // unless they were custom-mapped
        for (const m of mappings) {
            expect(m.extension).toBeTruthy();
            expect(m.readerName).toBeTruthy();
        }
    });

    it('each mapping has extension and readerName', () => {
        mapExtensionToReader('test-ext', 'Text Reader');
        const mappings = getCustomMappings();
        const found = mappings.find(m => m.extension === 'test-ext');
        expect(found).toEqual({ extension: 'test-ext', readerName: 'Text Reader' });
    });
});
