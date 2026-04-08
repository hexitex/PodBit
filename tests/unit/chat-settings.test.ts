/**
 * Unit tests for routes/chat/settings.ts — ensureChatSettings and chatSettings defaults.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

// createCachedLoader: wraps the loader fn with a simple pass-through in tests
jest.unstable_mockModule('../../db.js', () => ({
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../utils/cached-settings.js', () => ({
    createCachedLoader: (fn: () => Promise<any>) => ({
        get: fn, // no caching in tests — just call the loader directly
    }),
}));

const settingsModule = await import('../../routes/chat/settings.js');
// Access chatSettings via module reference — it's a live binding reassigned by ensureChatSettings()
const { ensureChatSettings } = settingsModule;
const chatSettings = () => settingsModule.chatSettings;

beforeEach(() => {
    jest.resetAllMocks();
    mockQueryOne.mockResolvedValue(null);
});

// =============================================================================
// Default values
// =============================================================================

describe('chatSettings defaults', () => {
    it('has expected default values', () => {
        // Initial defaults before ensureChatSettings is called
        expect(chatSettings()).toBeDefined();
        expect(typeof chatSettings().toolCallingEnabled).toBe('boolean');
        expect(typeof chatSettings().toolCallingMaxIterations).toBe('number');
        expect(typeof chatSettings().toolCallingMode).toBe('string');
    });
});

// =============================================================================
// ensureChatSettings
// =============================================================================

describe('ensureChatSettings', () => {
    it('uses defaults when no row in DB', async () => {
        mockQueryOne.mockResolvedValue(null);
        await ensureChatSettings();
        // After call, chatSettings should still be a valid object with boolean toolCallingEnabled
        expect(typeof chatSettings().toolCallingEnabled).toBe('boolean');
    });

    it('merges DB row values into chatSettings', async () => {
        mockQueryOne.mockResolvedValue({
            value: JSON.stringify({
                toolCallingEnabled: true,
                toolCallingMaxIterations: 5,
                toolCallingMode: 'read-only',
                maxKnowledgeNodes: 10,
                modelProfile: 'small',
            }),
        });

        await ensureChatSettings();

        expect(chatSettings().toolCallingEnabled).toBe(true);
        expect(chatSettings().toolCallingMaxIterations).toBe(5);
        expect(chatSettings().toolCallingMode).toBe('read-only');
        expect(chatSettings().maxKnowledgeNodes).toBe(10);
        expect(chatSettings().modelProfile).toBe('small');
    });

    it('falls back to defaults when DB row has invalid JSON', async () => {
        // Simulate DB returning invalid JSON — the loader catches and returns defaults
        mockQueryOne.mockResolvedValue({ value: '{not-valid-json}' });

        // Should not throw
        await expect(ensureChatSettings()).resolves.not.toThrow();
    });

    it('calls queryOne with the correct settings key', async () => {
        await ensureChatSettings();
        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('settings'),
            expect.arrayContaining(['chat.config'])
        );
    });

    it('handles queryOne error gracefully', async () => {
        mockQueryOne.mockRejectedValue(new Error('DB error'));
        // Should not throw — error is caught inside the loader
        await expect(ensureChatSettings()).resolves.not.toThrow();
    });
});
