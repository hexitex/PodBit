/**
 * Tests for prompts/backup.ts — backupPrompts, restorePrompts, getBackupInfo.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQuery = jest.fn<(...args: any[]) => any>();

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn(),
    systemQuery: mockQuery,
    systemQueryOne: jest.fn(),
}));

const mockInvalidateCache = jest.fn();
jest.unstable_mockModule('../../prompts/api.js', () => ({
    invalidateCache: mockInvalidateCache,
}));

// In-memory fake filesystem
let fakeFiles: Record<string, string> = {};
let backupPathUsed = '';

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: jest.fn((p: string) => p in fakeFiles),
        mkdirSync: jest.fn(),
        writeFileSync: jest.fn((p: string, data: string) => {
            backupPathUsed = p;
            fakeFiles[p] = data;
        }),
        readFileSync: jest.fn((p: string) => {
            if (!(p in fakeFiles)) throw new Error('ENOENT');
            return fakeFiles[p];
        }),
    },
    existsSync: jest.fn((p: string) => p in fakeFiles),
    mkdirSync: jest.fn(),
    writeFileSync: jest.fn((p: string, data: string) => {
        backupPathUsed = p;
        fakeFiles[p] = data;
    }),
    readFileSync: jest.fn((p: string) => {
        if (!(p in fakeFiles)) throw new Error('ENOENT');
        return fakeFiles[p];
    }),
}));

// ---------------------------------------------------------------------------
// Import SUT after mocks
// ---------------------------------------------------------------------------

let backupPrompts: typeof import('../../prompts/backup.js').backupPrompts;
let restorePrompts: typeof import('../../prompts/backup.js').restorePrompts;
let getBackupInfo: typeof import('../../prompts/backup.js').getBackupInfo;

beforeEach(async () => {
    jest.clearAllMocks();
    fakeFiles = {};
    backupPathUsed = '';
    const mod = await import('../../prompts/backup.js');
    backupPrompts = mod.backupPrompts;
    restorePrompts = mod.restorePrompts;
    getBackupInfo = mod.getBackupInfo;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('prompts/backup', () => {
    describe('backupPrompts', () => {
        it('exports prompts from DB and writes file', async () => {
            const rows = [
                { id: 'core.x', locale: 'en', category: 'core', content: 'hello', description: 'desc', updated_at: '2024-01-01' },
            ];
            mockQuery.mockResolvedValue(rows);

            const result = await backupPrompts();
            expect(result.count).toBe(1);
            expect(result.path).toBeTruthy();
            // Verify writeFileSync was called
            const fs = (await import('fs'));
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('handles empty DB gracefully', async () => {
            mockQuery.mockResolvedValue([]);
            const result = await backupPrompts();
            expect(result.count).toBe(0);
        });

        it('handles DB query error gracefully', async () => {
            mockQuery.mockRejectedValue(new Error('no table'));
            const result = await backupPrompts();
            expect(result.count).toBe(0);
        });

        it('creates directory if it does not exist', async () => {
            mockQuery.mockResolvedValue([]);
            const fs = (await import('fs'));
            (fs.existsSync as jest.Mock<any>).mockReturnValue(false);

            await backupPrompts();
            expect(fs.mkdirSync).toHaveBeenCalled();
        });
    });

    describe('restorePrompts', () => {
        it('throws when no backup file exists', async () => {
            const fs = (await import('fs'));
            (fs.existsSync as jest.Mock<any>).mockReturnValue(false);

            await expect(restorePrompts()).rejects.toThrow('No backup file found');
        });

        it('throws on unsupported version', async () => {
            const fs = (await import('fs'));
            (fs.existsSync as jest.Mock<any>).mockReturnValue(true);
            (fs.readFileSync as jest.Mock<any>).mockReturnValue(JSON.stringify({
                version: 99,
                exported_at: '2024-01-01',
                count: 0,
                prompts: [],
            }));

            await expect(restorePrompts()).rejects.toThrow('Unsupported backup version: 99');
        });

        it('restores prompts from valid backup', async () => {
            const backup = {
                version: 1,
                exported_at: '2024-01-01',
                count: 2,
                prompts: [
                    { id: 'a', locale: 'en', category: 'core', content: 'x', description: null, updated_at: '2024-01-01' },
                    { id: 'b', locale: 'en', category: 'core', content: 'y', description: 'd', updated_at: '2024-01-01' },
                ],
            };
            const fs = (await import('fs'));
            (fs.existsSync as jest.Mock<any>).mockReturnValue(true);
            (fs.readFileSync as jest.Mock<any>).mockReturnValue(JSON.stringify(backup));
            mockQuery.mockResolvedValue([]);

            const result = await restorePrompts();
            expect(result.restored).toBe(2);
            expect(result.skipped).toBe(0);
            expect(mockInvalidateCache).toHaveBeenCalledTimes(2);
            expect(mockInvalidateCache).toHaveBeenCalledWith('a', 'en');
            expect(mockInvalidateCache).toHaveBeenCalledWith('b', 'en');
        });

        it('counts skipped entries on DB error', async () => {
            const backup = {
                version: 1,
                exported_at: '2024-01-01',
                count: 1,
                prompts: [
                    { id: 'fail', locale: 'en', category: 'core', content: 'x', description: null, updated_at: '2024-01-01' },
                ],
            };
            const fs = (await import('fs'));
            (fs.existsSync as jest.Mock<any>).mockReturnValue(true);
            (fs.readFileSync as jest.Mock<any>).mockReturnValue(JSON.stringify(backup));
            mockQuery.mockRejectedValue(new Error('constraint'));

            const result = await restorePrompts();
            expect(result.restored).toBe(0);
            expect(result.skipped).toBe(1);
        });
    });

    describe('getBackupInfo', () => {
        it('returns an object with exists and path properties', () => {
            const info = getBackupInfo();
            expect(info).toHaveProperty('exists');
            expect(info).toHaveProperty('path');
            expect(typeof info.exists).toBe('boolean');
            expect(typeof info.path).toBe('string');
        });
    });
});
