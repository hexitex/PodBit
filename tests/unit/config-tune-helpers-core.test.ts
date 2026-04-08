/**
 * Unit tests for handlers/config-tune/helpers.ts
 *
 * Covers: getApiBaseUrl, securedFetch, generateUuid, buildParamLookup,
 *         getNestedValue, setNestedValue, getQuickMetrics.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/* ------------------------------------------------------------------ */
/* Mocks                                                              */
/* ------------------------------------------------------------------ */

const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);
const mockGetSecurityKey = jest.fn<() => Promise<string>>().mockResolvedValue('test-key-123');

jest.unstable_mockModule('../../core.js', () => ({
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../db/sql.js', () => ({
    withinDays: jest.fn((col: string, param: string) => `${col} >= ${param}`),
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        server: { host: '127.0.0.1', port: 3000 },
    },
}));

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: {
        quality: {
            parameters: [
                { configPath: ['quality', 'resonanceThreshold'], name: 'Resonance Threshold', min: 0, max: 1, step: 0.01, default: 0.55 },
                { configPath: ['quality', 'maxOutputWords'], name: 'Max Output Words', min: 5, max: 200, step: 1, default: 30 },
            ],
        },
        synthesis: {
            parameters: [
                { configPath: ['synthesis', 'enabled'], name: 'Enabled', min: 0, max: 1, step: 1, default: 1 },
            ],
        },
    },
}));

jest.unstable_mockModule('../../core/security.js', () => ({
    getSecurityKey: mockGetSecurityKey,
}));

const {
    getApiBaseUrl,
    securedFetch,
    generateUuid,
    buildParamLookup,
    getNestedValue,
    setNestedValue,
    getQuickMetrics,
} = await import('../../handlers/config-tune/helpers.js');

/* ------------------------------------------------------------------ */
/* Setup                                                              */
/* ------------------------------------------------------------------ */

// Mock global fetch
const mockFetch = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(
    new Response('ok', { status: 200 })
);
(globalThis as any).fetch = mockFetch;

beforeEach(() => {
    jest.resetAllMocks();
    mockQueryOne.mockResolvedValue(null);
    mockGetSecurityKey.mockResolvedValue('test-key-123');
    mockFetch.mockResolvedValue(new Response('ok', { status: 200 }));
});

/* ------------------------------------------------------------------ */
/* getApiBaseUrl                                                      */
/* ------------------------------------------------------------------ */

describe('getApiBaseUrl', () => {
    it('returns host:port from config', () => {
        expect(getApiBaseUrl()).toBe('http://127.0.0.1:3000');
    });
});

/* ------------------------------------------------------------------ */
/* securedFetch                                                       */
/* ------------------------------------------------------------------ */

describe('securedFetch', () => {
    it('injects x-podbit-key header', async () => {
        await securedFetch('http://localhost/api/test');
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0] as any[];
        expect(url).toBe('http://localhost/api/test');
        const headers = init.headers as Headers;
        expect(headers.get('x-podbit-key')).toBe('test-key-123');
    });

    it('sets content-type for non-GET methods when not already set', async () => {
        await securedFetch('http://localhost/api/test', { method: 'POST' });
        const [, init] = mockFetch.mock.calls[0] as any[];
        const headers = init.headers as Headers;
        expect(headers.get('content-type')).toBe('application/json');
    });

    it('does not override existing content-type', async () => {
        await securedFetch('http://localhost/api/test', {
            method: 'POST',
            headers: { 'content-type': 'text/plain' },
        });
        const [, init] = mockFetch.mock.calls[0] as any[];
        const headers = init.headers as Headers;
        expect(headers.get('content-type')).toBe('text/plain');
    });

    it('does not set content-type for GET', async () => {
        await securedFetch('http://localhost/api/test', { method: 'GET' });
        const [, init] = mockFetch.mock.calls[0] as any[];
        const headers = init.headers as Headers;
        expect(headers.has('content-type')).toBe(false);
    });

    it('does not set content-type when no method is specified', async () => {
        await securedFetch('http://localhost/api/test');
        const [, init] = mockFetch.mock.calls[0] as any[];
        const headers = init.headers as Headers;
        expect(headers.has('content-type')).toBe(false);
    });

    it('preserves existing headers alongside security key', async () => {
        await securedFetch('http://localhost/api/test', {
            method: 'POST',
            headers: { 'x-custom': 'value' },
        });
        const [, init] = mockFetch.mock.calls[0] as any[];
        const headers = init.headers as Headers;
        expect(headers.get('x-custom')).toBe('value');
        expect(headers.get('x-podbit-key')).toBe('test-key-123');
    });

    it('passes body through to fetch', async () => {
        const body = JSON.stringify({ key: 'value' });
        await securedFetch('http://localhost/api/test', { method: 'POST', body });
        const [, init] = mockFetch.mock.calls[0] as any[];
        expect(init.body).toBe(body);
    });
});

/* ------------------------------------------------------------------ */
/* generateUuid                                                       */
/* ------------------------------------------------------------------ */

describe('generateUuid', () => {
    it('matches UUID v4 format', () => {
        const uuid = generateUuid();
        expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('generates unique values', () => {
        const uuids = new Set(Array.from({ length: 50 }, () => generateUuid()));
        expect(uuids.size).toBe(50);
    });

    it('version nibble is always 4', () => {
        for (let i = 0; i < 20; i++) {
            expect(generateUuid()[14]).toBe('4');
        }
    });

    it('variant nibble is 8, 9, a, or b', () => {
        for (let i = 0; i < 20; i++) {
            expect(['8', '9', 'a', 'b']).toContain(generateUuid()[19]);
        }
    });

    it('returns a string of length 36', () => {
        expect(generateUuid()).toHaveLength(36);
    });
});

/* ------------------------------------------------------------------ */
/* buildParamLookup                                                   */
/* ------------------------------------------------------------------ */

describe('buildParamLookup', () => {
    it('maps dotted config paths to parameter metadata', () => {
        const lookup = buildParamLookup();
        expect(lookup['quality.resonanceThreshold']).toBeDefined();
        expect(lookup['quality.resonanceThreshold'].name).toBe('Resonance Threshold');
        expect(lookup['quality.resonanceThreshold'].sectionId).toBe('quality');
    });

    it('includes parameters from all sections', () => {
        const lookup = buildParamLookup();
        expect(Object.keys(lookup)).toHaveLength(3);
        expect(lookup['synthesis.enabled']).toBeDefined();
        expect(lookup['synthesis.enabled'].sectionId).toBe('synthesis');
    });

    it('preserves all original parameter fields', () => {
        const lookup = buildParamLookup();
        const param = lookup['quality.maxOutputWords'];
        expect(param.min).toBe(5);
        expect(param.max).toBe(200);
        expect(param.step).toBe(1);
        expect(param.default).toBe(30);
    });
});

/* ------------------------------------------------------------------ */
/* getNestedValue                                                     */
/* ------------------------------------------------------------------ */

describe('getNestedValue', () => {
    const obj = { a: { b: { c: 42 } }, top: 'value' };

    it('gets top-level value', () => {
        expect(getNestedValue(obj, ['top'])).toBe('value');
    });

    it('gets deeply nested value', () => {
        expect(getNestedValue(obj, ['a', 'b', 'c'])).toBe(42);
    });

    it('returns undefined for missing key', () => {
        expect(getNestedValue(obj, ['missing'])).toBeUndefined();
    });

    it('returns undefined for missing nested key', () => {
        expect(getNestedValue(obj, ['a', 'missing', 'c'])).toBeUndefined();
    });

    it('handles null at intermediate path', () => {
        expect(getNestedValue({ a: null }, ['a', 'b'])).toBeUndefined();
    });

    it('handles undefined root', () => {
        expect(getNestedValue(undefined, ['a'])).toBeUndefined();
    });

    it('handles empty path', () => {
        expect(getNestedValue(obj, [])).toBe(obj);
    });

    it('gets falsy values (0, false, empty string)', () => {
        expect(getNestedValue({ a: 0 }, ['a'])).toBe(0);
        expect(getNestedValue({ a: false }, ['a'])).toBe(false);
        expect(getNestedValue({ a: '' }, ['a'])).toBe('');
    });
});

/* ------------------------------------------------------------------ */
/* setNestedValue                                                     */
/* ------------------------------------------------------------------ */

describe('setNestedValue', () => {
    it('sets top-level value', () => {
        const obj: any = {};
        setNestedValue(obj, ['key'], 'val');
        expect(obj.key).toBe('val');
    });

    it('sets nested value', () => {
        const obj: any = { a: { b: 1 } };
        setNestedValue(obj, ['a', 'b'], 99);
        expect(obj.a.b).toBe(99);
    });

    it('creates intermediate objects', () => {
        const obj: any = {};
        setNestedValue(obj, ['a', 'b', 'c'], 'deep');
        expect(obj.a.b.c).toBe('deep');
    });

    it('overwrites non-object intermediates', () => {
        const obj: any = { a: 'string' };
        setNestedValue(obj, ['a', 'b'], 42);
        expect(obj.a.b).toBe(42);
    });

    it('preserves sibling keys', () => {
        const obj: any = { a: { b: 1, c: 2 } };
        setNestedValue(obj, ['a', 'd'], 3);
        expect(obj.a).toEqual({ b: 1, c: 2, d: 3 });
    });

    it('sets null and false values', () => {
        const obj: any = { a: 'x' };
        setNestedValue(obj, ['a'], null);
        expect(obj.a).toBeNull();
        setNestedValue(obj, ['a'], false);
        expect(obj.a).toBe(false);
    });

    it('sets array values', () => {
        const obj: any = {};
        setNestedValue(obj, ['items'], [1, 2, 3]);
        expect(obj.items).toEqual([1, 2, 3]);
    });
});

/* ------------------------------------------------------------------ */
/* getQuickMetrics                                                    */
/* ------------------------------------------------------------------ */

describe('getQuickMetrics', () => {
    it('returns metrics from DB queries', async () => {
        let callCount = 0;
        mockQueryOne.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return { total_cycles: '100', children_created: '25', avg_resonance: '0.45' };
            }
            return { total: '500', avg_weight: '1.2', avg_specificity: '3.5' };
        });

        const metrics = await getQuickMetrics();
        expect(metrics.synthesisSuccessRate).toBe(0.25);
        expect(metrics.avgResonance).toBe(0.45);
        expect(metrics.totalNodes).toBe(500);
        expect(metrics.avgWeight).toBe(1.2);
        expect(metrics.avgSpecificity).toBe(3.5);
        expect(metrics.capturedAt).toBeDefined();
    });

    it('returns null for rates when total_cycles is 0', async () => {
        let callCount = 0;
        mockQueryOne.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return { total_cycles: '0', children_created: '0', avg_resonance: null };
            }
            return { total: '10', avg_weight: '1.0', avg_specificity: '2.0' };
        });

        const metrics = await getQuickMetrics();
        expect(metrics.synthesisSuccessRate).toBeNull();
        expect(metrics.avgResonance).toBeNull();
    });

    it('handles null query results', async () => {
        mockQueryOne.mockResolvedValue(null);
        const metrics = await getQuickMetrics();
        expect(metrics.synthesisSuccessRate).toBeNull();
        expect(metrics.totalNodes).toBe(0);
        expect(metrics.avgWeight).toBeNull();
    });

    it('returns error object when DB throws', async () => {
        mockQueryOne.mockRejectedValue(new Error('DB unavailable'));
        const metrics = await getQuickMetrics();
        expect(metrics.error).toBe('metrics unavailable');
        expect(metrics.capturedAt).toBeDefined();
    });

    it('rounds success rate to 3 decimal places', async () => {
        let callCount = 0;
        mockQueryOne.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                return { total_cycles: '3', children_created: '1', avg_resonance: '0.5' };
            }
            return { total: '10', avg_weight: '1.0', avg_specificity: '2.0' };
        });

        const metrics = await getQuickMetrics();
        expect(metrics.synthesisSuccessRate).toBe(0.333);
    });
});
