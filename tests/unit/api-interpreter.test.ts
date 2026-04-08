/**
 * Unit tests for evm/api/interpreter.ts — interpretResult.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('{}');
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('prompt');

jest.unstable_mockModule('../../models/assignments.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const { interpretResult } = await import('../../evm/api/interpreter.js');

function makeApi(overrides: Record<string, any> = {}) {
    return {
        id: 'api-1',
        name: 'test-api',
        displayName: 'Test API',
        promptInterpret: 'Look for numeric discrepancies.',
        ...overrides,
    };
}

function makeDecision(overrides: Record<string, any> = {}) {
    return {
        apiId: 'api-1',
        apiName: 'test-api',
        reason: 'Content has numbers',
        confidence: 0.8,
        mode: 'verify' as const,
        relevantVarIds: [],
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockGetPrompt.mockResolvedValue('prompt');
    mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
        impact: 'structural_validation',
        corrections: [],
        evidenceSummary: 'Data confirmed',
        confidence: 0.9,
    }));
});

// =============================================================================
// Basic parsing
// =============================================================================

describe('interpretResult — basic parsing', () => {
    it('returns valid interpretation from well-formed JSON', async () => {
        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{"data":true}', []);
        expect(result.impact).toBe('structural_validation');
        expect(result.corrections).toHaveLength(0);
        expect(result.evidenceSummary).toBe('Data confirmed');
        expect(result.confidence).toBe(0.9);
    });

    it('handles markdown-fenced JSON response', async () => {
        mockCallSubsystemModel.mockResolvedValue('```json\n' + JSON.stringify({
            impact: 'structural_refutation',
            corrections: [],
            evidenceSummary: 'Entity not found',
            confidence: 0.95,
        }) + '\n```');

        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{"found":false}', []);
        expect(result.impact).toBe('structural_refutation');
    });

    it('returns inconclusive on JSON parse error', async () => {
        mockCallSubsystemModel.mockResolvedValue('not valid json at all');

        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{}', []);
        expect(result.impact).toBe('inconclusive');
        expect(result.confidence).toBe(0);
        expect(result.evidenceSummary).toContain('Failed to parse');
    });
});

// =============================================================================
// Impact validation
// =============================================================================

describe('interpretResult — impact validation', () => {
    const validImpacts = ['value_correction', 'structural_validation', 'structural_refutation', 'inconclusive'];

    for (const impact of validImpacts) {
        it(`accepts valid impact: ${impact}`, async () => {
            mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
                impact, corrections: [], evidenceSummary: 'OK', confidence: 0.8,
            }));
            const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{}', []);
            expect(result.impact).toBe(impact);
        });
    }

    it('defaults to inconclusive for invalid impact value', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            impact: 'unknown_impact', corrections: [], evidenceSummary: 'Hmm', confidence: 0.5,
        }));
        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{}', []);
        expect(result.impact).toBe('inconclusive');
    });
});

// =============================================================================
// Confidence clamping
// =============================================================================

describe('interpretResult — confidence clamping', () => {
    it('clamps confidence above 1 to 1', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            impact: 'structural_validation', corrections: [], evidenceSummary: 'OK', confidence: 3.5,
        }));
        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{}', []);
        expect(result.confidence).toBe(1);
    });

    it('clamps confidence below 0 to 0', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            impact: 'structural_validation', corrections: [], evidenceSummary: 'OK', confidence: -0.5,
        }));
        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{}', []);
        expect(result.confidence).toBe(0);
    });

    it('defaults confidence to 0.5 when not provided', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            impact: 'structural_validation', corrections: [], evidenceSummary: 'OK',
        }));
        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{}', []);
        expect(result.confidence).toBe(0.5);
    });
});

// =============================================================================
// Corrections validation
// =============================================================================

describe('interpretResult — corrections', () => {
    it('validates and normalizes corrections array', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            impact: 'value_correction',
            corrections: [
                { varId: 'VAR001', oldValue: '42', newValue: '43', confidence: 0.95, source: 'API response' },
            ],
            evidenceSummary: 'Value mismatch',
            confidence: 0.9,
        }));

        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{}', []);
        expect(result.corrections).toHaveLength(1);
        expect(result.corrections[0].varId).toBe('VAR001');
        expect(result.corrections[0].confidence).toBe(0.95);
    });

    it('returns empty corrections when not an array', async () => {
        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            impact: 'structural_validation',
            corrections: 'not-an-array',
            evidenceSummary: 'OK',
            confidence: 0.8,
        }));

        const result = await interpretResult(makeApi(), makeDecision(), 'claim', '{}', []);
        expect(result.corrections).toEqual([]);
    });
});

// =============================================================================
// Variable context filtering
// =============================================================================

describe('interpretResult — variable context filtering', () => {
    it('filters vars to relevantVarIds when specified', async () => {
        const vars = [
            { varId: 'VAR001', value: '42', scopeText: 'density', domain: 'bio' },
            { varId: 'VAR002', value: '3.14', scopeText: 'ratio', domain: 'math' },
        ];
        const decision = makeDecision({ relevantVarIds: ['VAR001'] });

        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            impact: 'structural_validation', corrections: [], evidenceSummary: 'OK', confidence: 0.8,
        }));

        await interpretResult(makeApi(), decision, 'claim', '{}', vars);

        // variableContext is passed to getPrompt('api.interpret', ...) — check there
        const interpretCall = (mockGetPrompt.mock.calls as any[]).find(([key]: any) => key === 'api.interpret');
        expect(interpretCall[1].variableContext).toContain('VAR001');
        expect(interpretCall[1].variableContext).not.toContain('VAR002');
    });

    it('includes all vars when relevantVarIds is empty', async () => {
        const vars = [
            { varId: 'VAR001', value: '42', scopeText: 'density', domain: 'bio' },
            { varId: 'VAR002', value: '3.14', scopeText: 'ratio', domain: 'math' },
        ];

        mockCallSubsystemModel.mockResolvedValue(JSON.stringify({
            impact: 'structural_validation', corrections: [], evidenceSummary: 'OK', confidence: 0.8,
        }));

        await interpretResult(makeApi(), makeDecision({ relevantVarIds: [] }), 'claim', '{}', vars);

        const interpretCall = (mockGetPrompt.mock.calls as any[]).find(([key]: any) => key === 'api.interpret');
        expect(interpretCall[1].variableContext).toContain('VAR001');
        expect(interpretCall[1].variableContext).toContain('VAR002');
    });
});

// =============================================================================
// Prompt construction
// =============================================================================

describe('interpretResult — prompt construction', () => {
    it('calls getPrompt for interpreter_system and interpret prompts', async () => {
        await interpretResult(makeApi(), makeDecision(), 'my claim', '{"result":"ok"}', []);

        expect(mockGetPrompt).toHaveBeenCalledWith('api.interpreter_system', {});
        expect(mockGetPrompt).toHaveBeenCalledWith('api.interpret', expect.objectContaining({
            nodeContent: 'my claim',
        }));
    });

    it('uses default interpretation guide when promptInterpret not set', async () => {
        await interpretResult(makeApi({ promptInterpret: null }), makeDecision(), 'claim', '{}', []);

        const interpretArgs = (mockGetPrompt.mock.calls as any[]).find(([key]: any) => key === 'api.interpret');
        expect(interpretArgs[1].perApiPrompt).toContain('No API-specific interpretation guide');
    });
});
