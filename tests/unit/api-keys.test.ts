/**
 * Unit tests for models/api-keys.ts —
 * getApiKey, loadApiKeys, setApiKeys, getApiKeyStatus, saveSetting, loadSetting.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSystemQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: mockSystemQuery,
    systemQueryOne: mockSystemQueryOne,
}));

const {
    getApiKey,
    loadApiKeys,
    setApiKeys,
    getApiKeyStatus,
    saveSetting,
    loadSetting,
} = await import('../../models/api-keys.js');

beforeEach(async () => {
    jest.resetAllMocks();
    mockSystemQuery.mockResolvedValue([]);
    mockSystemQueryOne.mockResolvedValue(null);

    // Reset cache to empty state by loading with null DB response
    // setApiKeys with empty values deletes each key from the cache
    await setApiKeys({ openai: '', anthropic: '', ollama: '', local: '' });

    // Clear call history accumulated by the setup above so tests start clean
    mockSystemQuery.mockClear();
    mockSystemQueryOne.mockClear();
});

// =============================================================================
// getApiKey
// =============================================================================

describe('getApiKey', () => {
    it('returns undefined when key not in cache', () => {
        expect(getApiKey('openai')).toBeUndefined();
    });

    it('returns key after setApiKeys', async () => {
        await setApiKeys({ openai: 'sk-test-123' });
        expect(getApiKey('openai')).toBe('sk-test-123');
    });

    it('returns undefined for unknown provider', async () => {
        await setApiKeys({ openai: 'sk-test' });
        expect(getApiKey('anthropic')).toBeUndefined();
    });
});

// =============================================================================
// loadApiKeys
// =============================================================================

describe('loadApiKeys', () => {
    it('loads keys from DB into cache', async () => {
        mockSystemQueryOne.mockResolvedValueOnce({
            value: JSON.stringify({ openai: 'sk-loaded', anthropic: 'ant-loaded' }),
        });

        await loadApiKeys();

        expect(getApiKey('openai')).toBe('sk-loaded');
        expect(getApiKey('anthropic')).toBe('ant-loaded');
    });

    it('does not crash when DB returns null (no saved keys)', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        await expect(loadApiKeys()).resolves.toBeUndefined();
    });

    it('does not crash when loadSetting throws', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('DB down'));
        await expect(loadApiKeys()).resolves.toBeUndefined();
    });

    it('replaces cache when valid object is returned', async () => {
        // First, set a different key
        await setApiKeys({ anthropic: 'old-key' });
        expect(getApiKey('anthropic')).toBe('old-key');

        // loadApiKeys replaces the entire cache
        mockSystemQueryOne.mockResolvedValueOnce({
            value: JSON.stringify({ openai: 'new-openai' }),
        });
        await loadApiKeys();

        expect(getApiKey('openai')).toBe('new-openai');
    });
});

// =============================================================================
// setApiKeys
// =============================================================================

describe('setApiKeys', () => {
    it('adds keys to cache and persists to DB', async () => {
        await setApiKeys({ openai: 'sk-123' });

        expect(getApiKey('openai')).toBe('sk-123');
        expect(mockSystemQuery).toHaveBeenCalledTimes(1);
        const [sql, args] = (mockSystemQuery.mock.calls[0] as any[]);
        expect(sql).toContain('INSERT INTO settings');
        expect(args[0]).toBe('api.keys');
        const saved = JSON.parse(args[1]);
        expect(saved.openai).toBe('sk-123');
    });

    it('deletes key from cache when empty string provided', async () => {
        await setApiKeys({ openai: 'sk-123' });
        expect(getApiKey('openai')).toBe('sk-123');

        await setApiKeys({ openai: '' });
        expect(getApiKey('openai')).toBeUndefined();
    });

    it('merges with existing keys (does not clear other keys)', async () => {
        await setApiKeys({ openai: 'sk-a' });
        await setApiKeys({ anthropic: 'ant-b' });

        expect(getApiKey('openai')).toBe('sk-a');
        expect(getApiKey('anthropic')).toBe('ant-b');
    });
});

// =============================================================================
// getApiKeyStatus
// =============================================================================

describe('getApiKeyStatus', () => {
    it('returns null for unconfigured providers', () => {
        const status = getApiKeyStatus();
        expect(status.openai).toBeNull();
        expect(status.anthropic).toBeNull();
    });

    it('masks long keys (> 12 chars) with first/last 4', async () => {
        await setApiKeys({ openai: 'sk-test-abcdefghijklmnop' });
        const status = getApiKeyStatus();
        expect(status.openai).toMatch(/^sk-t\.\.\./);
        expect(status.openai).toMatch(/mnop$/);
    });

    it('shows ***configured*** for short keys (<= 12 chars)', async () => {
        await setApiKeys({ openai: 'short-key' }); // 9 chars
        const status = getApiKeyStatus();
        expect(status.openai).toBe('***configured***');
    });

    it('only returns openai and anthropic providers', async () => {
        await setApiKeys({ openai: 'sk-123456789012345', anthropic: 'ant-123456789012345' });
        const status = getApiKeyStatus();
        expect(Object.keys(status)).toEqual(['openai', 'anthropic']);
    });
});

// =============================================================================
// saveSetting
// =============================================================================

describe('saveSetting', () => {
    it('inserts with ON CONFLICT for a key-value pair', async () => {
        await saveSetting('my.setting', { foo: 'bar' });

        expect(mockSystemQuery).toHaveBeenCalledTimes(1);
        const [sql, args] = (mockSystemQuery.mock.calls[0] as any[]);
        expect(sql).toContain('INSERT INTO settings');
        expect(sql).toContain('ON CONFLICT');
        expect(args[0]).toBe('my.setting');
        expect(JSON.parse(args[1])).toEqual({ foo: 'bar' });
    });

    it('serializes primitive values as JSON', async () => {
        await saveSetting('count', 42);
        const args = (mockSystemQuery.mock.calls[0] as any[])[1] as any[];
        expect(JSON.parse(args[1])).toBe(42);
    });

    it('does not throw when DB fails', async () => {
        mockSystemQuery.mockRejectedValueOnce(new Error('write error'));
        await expect(saveSetting('k', 'v')).resolves.toBeUndefined();
    });
});

// =============================================================================
// loadSetting
// =============================================================================

describe('loadSetting', () => {
    it('returns null when key not found', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        const result = await loadSetting('missing.key');
        expect(result).toBeNull();
    });

    it('parses JSON string values', async () => {
        mockSystemQueryOne.mockResolvedValue({ value: '{"hello":"world"}' });
        const result = await loadSetting('my.key');
        expect(result).toEqual({ hello: 'world' });
    });

    it('returns already-parsed values as-is', async () => {
        mockSystemQueryOne.mockResolvedValue({ value: { already: 'parsed' } });
        const result = await loadSetting('my.key');
        expect(result).toEqual({ already: 'parsed' });
    });

    it('returns null and does not throw when DB fails', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('DB error'));
        const result = await loadSetting('any.key');
        expect(result).toBeNull();
    });

    it('queries settings table with the correct key', async () => {
        mockSystemQueryOne.mockResolvedValue(null);
        await loadSetting('proxy.config');
        const [sql, args] = (mockSystemQueryOne.mock.calls[0] as any[]);
        expect(sql).toContain('settings');
        expect(args[0]).toBe('proxy.config');
    });
});
