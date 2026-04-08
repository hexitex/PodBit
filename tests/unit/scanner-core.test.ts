/**
 * Unit tests for kb/scanner.ts — scanFolder function.
 *
 * Mocks: fs (readdirSync, statSync), path, minimatch.
 * Tests: recursive scanning, include/exclude patterns, file filtering, size limits.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockReaddirSync = jest.fn<(...args: any[]) => any[]>();
const mockStatSync = jest.fn<(...args: any[]) => any>();
const mockMinimatch = jest.fn<(...args: any[]) => boolean>();

jest.unstable_mockModule('fs', () => ({
    default: {
        readdirSync: mockReaddirSync,
        statSync: mockStatSync,
    },
}));

jest.unstable_mockModule('minimatch', () => ({
    default: mockMinimatch,
}));

const { scanFolder, normalizePath, resolveDomain } = await import('../../kb/scanner.js');

/* ── helpers ──────────────────────────────────────────────────────────── */

function makeDirent(name: string, isDir = false, isFile = true) {
    return {
        name,
        isDirectory: () => isDir,
        isFile: () => isFile,
    };
}

function makeStats(size = 100, mtime = new Date('2024-01-01')) {
    return { size, mtime };
}

beforeEach(() => {
    jest.clearAllMocks();
    mockReaddirSync.mockReturnValue([]);
    mockStatSync.mockReturnValue(makeStats());
    mockMinimatch.mockReturnValue(true);
});

// =============================================================================
// scanFolder — basic file discovery
// =============================================================================

describe('scanFolder — basic discovery', () => {
    it('returns empty array for empty directory', () => {
        mockReaddirSync.mockReturnValue([]);
        const result = scanFolder('/test/folder');
        expect(result).toEqual([]);
    });

    it('returns files with correct metadata', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('readme.txt'),
        ]);
        mockStatSync.mockReturnValue(makeStats(500, new Date('2024-06-15')));

        const result = scanFolder('/test/folder');

        expect(result.length).toBe(1);
        expect(result[0].fileName).toBe('readme.txt');
        expect(result[0].extension).toBe('txt');
        expect(result[0].size).toBe(500);
        expect(result[0].relativePath).toBeDefined();
    });

    it('normalizes relative paths with forward slashes', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('readme.txt'),
        ]);

        const result = scanFolder('/test/folder');
        // The relative path should use forward slashes
        expect(result[0].relativePath).not.toContain('\\');
    });

    it('returns multiple files', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('file1.ts'),
            makeDirent('file2.js'),
            makeDirent('file3.py'),
        ]);

        const result = scanFolder('/test/folder');
        expect(result.length).toBe(3);
    });
});

// =============================================================================
// scanFolder — file filtering
// =============================================================================

describe('scanFolder — filtering', () => {
    it('skips dotfiles', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('.hidden'),
            makeDirent('.gitignore'),
            makeDirent('visible.ts'),
        ]);

        const result = scanFolder('/test/folder');
        expect(result.length).toBe(1);
        expect(result[0].fileName).toBe('visible.ts');
    });

    it('skips files without extensions', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('Makefile'),
            makeDirent('Dockerfile'),
            makeDirent('script.sh'),
        ]);

        const result = scanFolder('/test/folder');
        expect(result.length).toBe(1);
        expect(result[0].fileName).toBe('script.sh');
    });

    it('skips log, lock, db, db-shm, db-wal files', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('app.log'),
            makeDirent('package.lock'),
            makeDirent('data.db'),
            makeDirent('data.db-shm'),
            makeDirent('data.db-wal'),
            makeDirent('good.ts'),
        ]);

        const result = scanFolder('/test/folder');
        expect(result.length).toBe(1);
        expect(result[0].fileName).toBe('good.ts');
    });

    it('skips empty files (size 0)', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('empty.ts'),
        ]);
        mockStatSync.mockReturnValue(makeStats(0));

        const result = scanFolder('/test/folder');
        expect(result.length).toBe(0);
    });

    it('skips files larger than skipLargeFiles', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('big.bin'),
        ]);
        mockStatSync.mockReturnValue(makeStats(10_000_000));

        const result = scanFolder('/test/folder', true, null, null, 1_000_000);
        expect(result.length).toBe(0);
    });

    it('includes files under skipLargeFiles limit', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('small.ts'),
        ]);
        mockStatSync.mockReturnValue(makeStats(500));

        const result = scanFolder('/test/folder', true, null, null, 1_000_000);
        expect(result.length).toBe(1);
    });

    it('skips non-file entries (symlinks, etc.)', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('link', false, false), // not file, not dir
        ]);

        const result = scanFolder('/test/folder');
        expect(result.length).toBe(0);
    });
});

// =============================================================================
// scanFolder — directory handling
// =============================================================================

describe('scanFolder — directories', () => {
    it('skips common non-content directories', () => {
        const skippedDirs = ['.git', 'node_modules', '__pycache__', '.venv',
            'dist', 'build', 'coverage', '.cache'];

        for (const dirName of skippedDirs) {
            mockReaddirSync.mockReturnValue([
                makeDirent(dirName, true, false),
            ]);
            const result = scanFolder('/test/folder');
            expect(result.length).toBe(0);
        }
    });

    it('recurses into non-skipped directories when recursive=true', () => {
        // Root has a subdirectory
        mockReaddirSync
            .mockReturnValueOnce([makeDirent('src', true, false)])
            .mockReturnValueOnce([makeDirent('index.ts')]);

        const result = scanFolder('/test/folder', true);
        expect(result.length).toBe(1);
        expect(mockReaddirSync).toHaveBeenCalledTimes(2);
    });

    it('does not recurse when recursive=false', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('src', true, false),
            makeDirent('main.ts'),
        ]);

        const result = scanFolder('/test/folder', false);
        expect(result.length).toBe(1);
        expect(mockReaddirSync).toHaveBeenCalledTimes(1);
    });

    it('handles readdirSync errors gracefully', () => {
        mockReaddirSync.mockImplementation(() => {
            throw new Error('Permission denied');
        });

        // Should not throw
        const result = scanFolder('/test/folder');
        expect(result).toEqual([]);
    });
});

// =============================================================================
// scanFolder — include/exclude patterns
// =============================================================================

describe('scanFolder — include/exclude patterns', () => {
    it('applies include patterns via minimatch', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('file.ts'),
            makeDirent('file.js'),
        ]);
        // Only match the first call
        mockMinimatch
            .mockReturnValueOnce(true)   // file.ts matches *.ts
            .mockReturnValueOnce(false); // file.js does not

        const result = scanFolder('/test/folder', true, ['*.ts']);
        expect(result.length).toBe(1);
        expect(result[0].fileName).toBe('file.ts');
    });

    it('applies exclude patterns via minimatch', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('keep.ts'),
            makeDirent('exclude.test.ts'),
        ]);
        // Include: all match
        // Exclude: first no, second yes
        mockMinimatch
            .mockReturnValueOnce(false)   // keep.ts not excluded
            .mockReturnValueOnce(true);   // exclude.test.ts excluded

        const result = scanFolder('/test/folder', true, null, ['*.test.ts']);
        expect(result.length).toBe(1);
        expect(result[0].fileName).toBe('keep.ts');
    });

    it('skips pattern matching when no patterns provided', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('file.ts'),
        ]);

        scanFolder('/test/folder', true, null, null);
        // minimatch should not be called
        expect(mockMinimatch).not.toHaveBeenCalled();
    });

    it('handles statSync errors gracefully (file deleted between readdir and stat)', () => {
        mockReaddirSync.mockReturnValue([
            makeDirent('deleted.ts'),
            makeDirent('exists.ts'),
        ]);
        mockStatSync
            .mockImplementationOnce(() => { throw new Error('ENOENT'); })
            .mockReturnValueOnce(makeStats(100));

        const result = scanFolder('/test/folder');
        expect(result.length).toBe(1);
        expect(result[0].fileName).toBe('exists.ts');
    });
});

// =============================================================================
// resolveDomain (additional coverage beyond scanner.test.ts)
// =============================================================================

describe('resolveDomain — additional cases', () => {
    it('handles empty relativePath', () => {
        // Single part (empty before split) — returns folderDomain
        const result = resolveDomain('domain', '', true);
        expect(result).toBe('domain');
    });

    it('handles path with only filename', () => {
        expect(resolveDomain('dom', 'file.ts', true)).toBe('dom');
    });

    it('sanitizes subfolder with numbers', () => {
        expect(resolveDomain('dom', '123abc/file.ts', true)).toBe('dom:123abc');
    });
});
