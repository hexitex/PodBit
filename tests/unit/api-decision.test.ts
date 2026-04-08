/**
 * Unit tests for evm/api/decision.ts — decideApis.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('[]');
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('prompt text');

jest.unstable_mockModule('../../models/assignments.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const { decideApis } = await import('../../evm/api/decision.js');

function makeApi(overrides: Record<string, any> = {}) {
    return {
        id: 'api-1',
        name: 'test-api',
        displayName: 'Test API',
        description: 'A general-purpose test API',
        mode: 'verify' as const,
        capabilities: ['fact-check'],
        domains: ['science'],
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockGetPrompt.mockResolvedValue('prompt text');
    mockCallSubsystemModel.mockResolvedValue('[]');
});

// =============================================================================
// Early exit
// =============================================================================

describe('decideApis — early exit', () => {
    it('returns empty array when no APIs are provided', async () => {
        const result = await decideApis('some content', 'science', [], []);
        expect(result).toHaveLength(0);
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });
});

// =============================================================================
// JSON parsing
// =============================================================================

describe('decideApis — JSON parsing', () => {
    it('returns empty array when LLM returns empty array JSON', async () => {
        mockCallSubsystemModel.mockResolvedValue('[]');
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result).toHaveLength(0);
    });

    it('returns empty array when LLM returns non-JSON', async () => {
        mockCallSubsystemModel.mockResolvedValue('Sorry, I cannot decide.');
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result).toHaveLength(0);
    });

    it('handles markdown-fenced JSON response', async () => {
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Relevant', confidence: 0.8, mode: 'verify' },
        ]);
        mockCallSubsystemModel.mockResolvedValue('```json\n' + decisions + '\n```');
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result).toHaveLength(1);
        expect(result[0].apiId).toBe('api-1');
    });

    it('handles plain backtick-fenced response', async () => {
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Relevant', confidence: 0.8, mode: 'verify' },
        ]);
        mockCallSubsystemModel.mockResolvedValue('```\n' + decisions + '\n```');
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result).toHaveLength(1);
    });

    it('returns empty array when LLM returns a non-array JSON value', async () => {
        mockCallSubsystemModel.mockResolvedValue('{"error": "could not decide"}');
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result).toHaveLength(0);
    });
});

// =============================================================================
// Decision filtering and validation
// =============================================================================

describe('decideApis — filtering', () => {
    it('filters out decisions with zero or negative confidence', async () => {
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Relevant', confidence: 0, mode: 'verify' },
            { apiId: 'api-1', apiName: 'test-api', reason: 'Other', confidence: -0.5, mode: 'verify' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result).toHaveLength(0);
    });

    it('filters out decisions missing apiId or apiName', async () => {
        const decisions = JSON.stringify([
            { reason: 'No ID', confidence: 0.8, mode: 'verify' },
            { apiId: 'api-1', reason: 'No name', confidence: 0.8, mode: 'verify' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result).toHaveLength(0);
    });

    it('clamps confidence to 0-1 range', async () => {
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'High', confidence: 2.5, mode: 'verify' },
            { apiId: 'api-1', apiName: 'test-api', reason: 'Neg', confidence: -1, mode: 'verify' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [makeApi()], []);
        // Second one is filtered (confidence <= 0 after clamp filter), first passes
        expect(result).toHaveLength(1);
        expect(result[0].confidence).toBe(1); // clamped from 2.5
    });

    it('defaults mode to verify when invalid mode provided', async () => {
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Relevant', confidence: 0.8, mode: 'invalid-mode' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result[0].mode).toBe('verify');
    });

    it('defaults relevantVarIds to empty array when missing', async () => {
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Relevant', confidence: 0.8, mode: 'verify' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result[0].relevantVarIds).toEqual([]);
    });

    it('preserves provided relevantVarIds', async () => {
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Relevant', confidence: 0.8, mode: 'verify', relevantVarIds: ['VAR001', 'VAR002'] },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [makeApi()], []);
        expect(result[0].relevantVarIds).toEqual(['VAR001', 'VAR002']);
    });
});

// =============================================================================
// Mode constraint enforcement
// =============================================================================

describe('decideApis — mode constraints', () => {
    it('downscales enrich → verify for verify-only API', async () => {
        const api = makeApi({ mode: 'verify' });
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Test', confidence: 0.8, mode: 'enrich' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [api], []);
        expect(result[0].mode).toBe('verify');
    });

    it('upgrades verify → enrich for enrich-only API', async () => {
        const api = makeApi({ mode: 'enrich' });
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Test', confidence: 0.8, mode: 'verify' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [api], []);
        expect(result[0].mode).toBe('enrich');
    });

    it('downscales both → verify for verify-only API', async () => {
        const api = makeApi({ mode: 'verify' });
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Test', confidence: 0.8, mode: 'both' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [api], []);
        expect(result[0].mode).toBe('verify');
    });

    it('downscales both → enrich for enrich-only API', async () => {
        const api = makeApi({ mode: 'enrich' });
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Test', confidence: 0.8, mode: 'both' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [api], []);
        expect(result[0].mode).toBe('enrich');
    });

    it('allows both mode when API is configured as both', async () => {
        const api = makeApi({ mode: 'both' });
        const decisions = JSON.stringify([
            { apiId: 'api-1', apiName: 'test-api', reason: 'Test', confidence: 0.8, mode: 'both' },
        ]);
        mockCallSubsystemModel.mockResolvedValue(decisions);
        const result = await decideApis('content', 'science', [api], []);
        expect(result[0].mode).toBe('both');
    });
});

// =============================================================================
// Prompt construction
// =============================================================================

describe('decideApis — prompt construction', () => {
    it('calls getPrompt with api.decision and correct params', async () => {
        mockCallSubsystemModel.mockResolvedValue('[]');
        await decideApis('my claim', 'biology', [makeApi()], []);

        expect(mockGetPrompt).toHaveBeenCalledWith('api.decision', expect.objectContaining({
            nodeContent: 'my claim',
            domain: 'biology',
        }));
    });

    it('includes variable context description when vars provided', async () => {
        mockCallSubsystemModel.mockResolvedValue('[]');
        const vars = [{ varId: 'VAR001', value: '42', scopeText: 'activation density', domain: 'neuroscience' }];
        await decideApis('content', 'science', [makeApi()], vars);

        const promptParams = (mockGetPrompt.mock.calls[0] as any[])[1];
        expect(promptParams.variableContext).toContain('VAR001');
        expect(promptParams.variableContext).toContain('42');
    });

    it('includes no-vars message when no variable context', async () => {
        mockCallSubsystemModel.mockResolvedValue('[]');
        await decideApis('content', 'science', [makeApi()], []);

        const promptParams = (mockGetPrompt.mock.calls[0] as any[])[1];
        expect(promptParams.variableContext).toContain('No number variables');
    });

    it('includes API descriptions in prompt', async () => {
        mockCallSubsystemModel.mockResolvedValue('[]');
        await decideApis('content', 'science', [makeApi({ description: 'My special API' })], []);

        const promptParams = (mockGetPrompt.mock.calls[0] as any[])[1];
        expect(promptParams.availableApis).toContain('My special API');
    });
});
