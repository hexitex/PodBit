/**
 * Unit tests for evm/api/query-formulator.ts — formulateQuery.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('{}');

jest.unstable_mockModule('../../models/assignments.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

const { formulateQuery } = await import('../../evm/api/query-formulator.js');

function makeApi(overrides: Record<string, any> = {}) {
    return {
        id: 'api-1',
        name: 'test-api',
        displayName: 'Test API',
        baseUrl: 'https://api.example.com',
        promptQuery: 'Search this API for the claim.',
        ...overrides,
    };
}

function makeDecision(overrides: Record<string, any> = {}) {
    return {
        apiId: 'api-1',
        apiName: 'test-api',
        reason: 'Content has verifiable claims',
        confidence: 0.8,
        mode: 'verify' as const,
        relevantVarIds: [],
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
        method: 'GET',
        url: 'https://api.example.com/search?q=test',
        body: null,
        headers: {},
    }));
});

// =============================================================================
// No promptQuery — error
// =============================================================================

describe('formulateQuery — no promptQuery', () => {
    it('throws when api has no promptQuery', async () => {
        const api = makeApi({ promptQuery: null });
        await expect(formulateQuery(api, makeDecision(), 'claim', [])).rejects.toThrow('no query formulation prompt');
    });
});

// =============================================================================
// GET request
// =============================================================================

describe('formulateQuery — GET request', () => {
    it('returns GET method and URL from LLM response', async () => {
        const result = await formulateQuery(makeApi(), makeDecision(), 'some claim', []);
        expect(result.method).toBe('GET');
        expect(result.url).toBe('https://api.example.com/search?q=test');
    });

    it('handles markdown-fenced JSON response', async () => {
        mockCallSubsystemModel.mockResolvedValue('```json\n' + JSON.stringify({
            method: 'GET',
            url: 'https://api.example.com/data',
            body: null,
            headers: {},
        }) + '\n```');

        const result = await formulateQuery(makeApi(), makeDecision(), 'claim', []);
        expect(result.method).toBe('GET');
        expect(result.url).toBe('https://api.example.com/data');
    });
});

// =============================================================================
// POST request
// =============================================================================

describe('formulateQuery — POST request', () => {
    it('returns POST method with body and headers', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            method: 'POST',
            url: 'https://api.example.com/query',
            body: '{"q":"test"}',
            headers: { 'Content-Type': 'application/json' },
        }));

        const result = await formulateQuery(makeApi(), makeDecision(), 'some claim', []);
        expect(result.method).toBe('POST');
        expect(result.body).toBe('{"q":"test"}');
        expect(result.headers?.['Content-Type']).toBe('application/json');
    });

    it('defaults to GET when method is not POST', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            method: 'PUT',
            url: 'https://api.example.com/data',
            body: null,
            headers: {},
        }));

        const result = await formulateQuery(makeApi(), makeDecision(), 'claim', []);
        expect(result.method).toBe('GET');
    });
});

// =============================================================================
// Variable context
// =============================================================================

describe('formulateQuery — variable context', () => {
    it('includes all vars in prompt when relevantVarIds is empty', async () => {
        const vars = [
            { varId: 'VAR001', value: '42', scopeText: 'density', domain: 'bio' },
            { varId: 'VAR002', value: '3.14', scopeText: 'ratio', domain: 'math' },
        ];

        await formulateQuery(makeApi(), makeDecision({ relevantVarIds: [] }), 'claim', vars);

        const prompt = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(prompt).toContain('VAR001');
        expect(prompt).toContain('VAR002');
    });

    it('filters vars to relevantVarIds when specified', async () => {
        const vars = [
            { varId: 'VAR001', value: '42', scopeText: 'density', domain: 'bio' },
            { varId: 'VAR002', value: '3.14', scopeText: 'ratio', domain: 'math' },
        ];

        await formulateQuery(makeApi(), makeDecision({ relevantVarIds: ['VAR001'] }), 'claim', vars);

        const prompt = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(prompt).toContain('VAR001');
        expect(prompt).not.toContain('VAR002');
    });

    it('shows no-values message when no vars provided', async () => {
        await formulateQuery(makeApi(), makeDecision(), 'claim', []);

        const prompt = mockCallSubsystemModel.mock.calls[0][1] as string;
        expect(prompt).toContain('No specific values identified');
    });
});

// =============================================================================
// Parse error
// =============================================================================

describe('formulateQuery — parse error', () => {
    it('throws when LLM returns non-parseable JSON', async () => {
        mockCallSubsystemModel.mockResolvedValue('Not valid JSON at all');
        await expect(formulateQuery(makeApi(), makeDecision(), 'claim', [])).rejects.toThrow();
    });
});
