/**
 * Unit tests for kb/hasher.ts
 *
 * Tests SHA-256 hashing for both files (streaming) and strings.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCreateHash = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('crypto', () => ({
    createHash: mockCreateHash,
}));

const mockCreateReadStream = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('fs', () => ({
    default: { createReadStream: mockCreateReadStream },
    createReadStream: mockCreateReadStream,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { hashFile, hashString } = await import('../../kb/hasher.js');

describe('kb/hasher', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    // -----------------------------------------------------------------------
    // hashString
    // -----------------------------------------------------------------------
    describe('hashString', () => {
        it('should create a sha256 hash and return hex digest', () => {
            const mockDigest = jest.fn<(...a: any[]) => any>().mockReturnValue('abc123hex');
            const mockUpdate = jest.fn<(...a: any[]) => any>().mockReturnValue({ digest: mockDigest });
            mockCreateHash.mockReturnValue({ update: mockUpdate, digest: mockDigest });

            const result = hashString('hello world');

            expect(mockCreateHash).toHaveBeenCalledWith('sha256');
            expect(mockUpdate).toHaveBeenCalledWith('hello world', 'utf-8');
            expect(mockDigest).toHaveBeenCalledWith('hex');
            expect(result).toBe('abc123hex');
        });

        it('should handle empty string', () => {
            const mockDigest = jest.fn<(...a: any[]) => any>().mockReturnValue('e3b0c44298');
            const mockUpdate = jest.fn<(...a: any[]) => any>().mockReturnValue({ digest: mockDigest });
            mockCreateHash.mockReturnValue({ update: mockUpdate, digest: mockDigest });

            const result = hashString('');

            expect(mockUpdate).toHaveBeenCalledWith('', 'utf-8');
            expect(result).toBe('e3b0c44298');
        });
    });

    // -----------------------------------------------------------------------
    // hashFile
    // -----------------------------------------------------------------------
    describe('hashFile', () => {
        it('should stream file contents and return sha256 hex digest', async () => {
            const mockDigest = jest.fn<(...a: any[]) => any>().mockReturnValue('deadbeef');
            const mockUpdate = jest.fn<(...a: any[]) => any>();
            mockCreateHash.mockReturnValue({ update: mockUpdate, digest: mockDigest });

            const stream = new EventEmitter();
            mockCreateReadStream.mockReturnValue(stream);

            const promise = hashFile('/some/file.txt');

            // Simulate data events
            stream.emit('data', Buffer.from('chunk1'));
            stream.emit('data', Buffer.from('chunk2'));
            stream.emit('end');

            const result = await promise;

            expect(mockCreateReadStream).toHaveBeenCalledWith('/some/file.txt');
            expect(mockUpdate).toHaveBeenCalledTimes(2);
            expect(mockUpdate).toHaveBeenCalledWith(Buffer.from('chunk1'));
            expect(mockUpdate).toHaveBeenCalledWith(Buffer.from('chunk2'));
            expect(mockDigest).toHaveBeenCalledWith('hex');
            expect(result).toBe('deadbeef');
        });

        it('should reject when stream emits error', async () => {
            const mockDigest = jest.fn<(...a: any[]) => any>();
            const mockUpdate = jest.fn<(...a: any[]) => any>();
            mockCreateHash.mockReturnValue({ update: mockUpdate, digest: mockDigest });

            const stream = new EventEmitter();
            mockCreateReadStream.mockReturnValue(stream);

            const promise = hashFile('/missing/file.txt');

            const error = new Error('ENOENT: no such file');
            stream.emit('error', error);

            await expect(promise).rejects.toThrow('ENOENT: no such file');
        });

        it('should handle single chunk file', async () => {
            const mockDigest = jest.fn<(...a: any[]) => any>().mockReturnValue('aabb');
            const mockUpdate = jest.fn<(...a: any[]) => any>();
            mockCreateHash.mockReturnValue({ update: mockUpdate, digest: mockDigest });

            const stream = new EventEmitter();
            mockCreateReadStream.mockReturnValue(stream);

            const promise = hashFile('/one-chunk.bin');
            stream.emit('data', Buffer.from('only'));
            stream.emit('end');

            const result = await promise;
            expect(mockUpdate).toHaveBeenCalledTimes(1);
            expect(result).toBe('aabb');
        });
    });
});
