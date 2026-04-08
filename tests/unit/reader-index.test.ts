/**
 * Unit tests for kb/readers/index.ts —
 * Auto-registration of built-in and advanced readers, re-exports.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks
// =============================================================================

const mockRegisterReader = jest.fn();
const mockGetReaderForExtension = jest.fn();
const mockGetAllReaders = jest.fn().mockReturnValue([]);
const mockGetSupportedExtensions = jest.fn().mockReturnValue([]);

jest.unstable_mockModule('../../kb/readers/registry.js', () => ({
    registerReader: mockRegisterReader,
    getReaderForExtension: mockGetReaderForExtension,
    getAllReaders: mockGetAllReaders,
    getSupportedExtensions: mockGetSupportedExtensions,
}));

const fakeTextReader = { id: 'text', name: 'Text', extensions: ['txt', 'md'] };
jest.unstable_mockModule('../../kb/readers/text-reader.js', () => ({
    textReader: fakeTextReader,
}));

const fakeCodeReader = { id: 'code', name: 'Code', extensions: ['ts', 'js'] };
jest.unstable_mockModule('../../kb/readers/code-reader.js', () => ({
    codeReader: fakeCodeReader,
}));

const fakePdfReader = { id: 'pdf', name: 'PDF', extensions: ['pdf'] };
jest.unstable_mockModule('../../kb/readers/pdf-reader.js', () => ({
    pdfReader: fakePdfReader,
}));

const fakeDocReader = { id: 'doc', name: 'Doc', extensions: ['docx'] };
jest.unstable_mockModule('../../kb/readers/doc-reader.js', () => ({
    docReader: fakeDocReader,
}));

const fakeSheetReader = { id: 'sheet', name: 'Sheet', extensions: ['xlsx'] };
jest.unstable_mockModule('../../kb/readers/sheet-reader.js', () => ({
    sheetReader: fakeSheetReader,
}));

const fakeImageReader = { id: 'image', name: 'Image', extensions: ['png'] };
jest.unstable_mockModule('../../kb/readers/image-reader.js', () => ({
    imageReader: fakeImageReader,
}));

// =============================================================================
// Tests
// =============================================================================

describe('kb/readers/index', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('registers text and code readers synchronously, plus advanced readers', async () => {
        const mod = await import('../../kb/readers/index.js');

        // Wait for advanced readers to finish
        await mod.readersReady;

        // Built-in readers registered synchronously
        expect(mockRegisterReader).toHaveBeenCalledWith(fakeTextReader);
        expect(mockRegisterReader).toHaveBeenCalledWith(fakeCodeReader);

        // Advanced readers registered asynchronously
        expect(mockRegisterReader).toHaveBeenCalledWith(fakePdfReader);
        expect(mockRegisterReader).toHaveBeenCalledWith(fakeDocReader);
        expect(mockRegisterReader).toHaveBeenCalledWith(fakeSheetReader);
        expect(mockRegisterReader).toHaveBeenCalledWith(fakeImageReader);

        // Total: 6 readers
        expect(mockRegisterReader).toHaveBeenCalledTimes(6);
    });

    it('re-exports registry functions', async () => {
        const mod = await import('../../kb/readers/index.js');
        // These are re-exported from registry
        expect(mod.registerReader).toBeDefined();
        expect(mod.getReaderForExtension).toBeDefined();
        expect(mod.getAllReaders).toBeDefined();
        expect(mod.getSupportedExtensions).toBeDefined();
    });

    it('readersReady resolves even if all advanced readers succeed', async () => {
        const mod = await import('../../kb/readers/index.js');
        await expect(mod.readersReady).resolves.toBeUndefined();
    });
});
