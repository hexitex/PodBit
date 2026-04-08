/**
 * Unit tests for evm/api/orchestrator.ts — runApiVerification pipeline.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockAppConfig = {
    labVerify: {
        apiVerification: {
            maxApisPerNode: 3,
            minCorrectionConfidence: 0.7,
            enrichmentEnabled: true,
            enrichmentMode: 'children',
        },
    },
};

const mockEmitActivity = jest.fn<() => void>();
const mockResolveContent = jest.fn<(s: string) => Promise<string>>().mockImplementation(async (s) => s + '_resolved');
const mockGetNodeVariables = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetEnabledApis = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetApi = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockRecordApiCall = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDecideApis = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockFormulateQuery = jest.fn<() => Promise<any>>();
const mockCallApi = jest.fn<() => Promise<any>>();
const mockClassifyError = jest.fn<(status?: number, err?: any) => string>().mockReturnValue('http_error');
const mockInterpretResult = jest.fn<() => Promise<any>>();
const mockApplyCorrections = jest.fn<() => Promise<any>>().mockResolvedValue({ applied: 0 });
const mockApplyVerificationImpact = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockRecordApiVerification = jest.fn<() => Promise<string>>().mockResolvedValue('audit-id');

// Enrichment (dynamic import)
const mockExtractEnrichments = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockCreateEnrichmentNodes = jest.fn<() => Promise<any>>().mockResolvedValue({ nodeIds: [], mode: 'children' });
const mockAppendEnrichmentToNode = jest.fn<() => Promise<any>>().mockResolvedValue({ facts: [], mode: 'inline' });

jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ emitActivity: mockEmitActivity }));
jest.unstable_mockModule('../../core/number-variables.js', () => ({
    resolveContent: mockResolveContent,
    getNodeVariables: mockGetNodeVariables,
}));
jest.unstable_mockModule('../../core.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../../evm/api/registry.js', () => ({
    getEnabledApis: mockGetEnabledApis,
    getApi: mockGetApi,
    recordApiCall: mockRecordApiCall,
}));
jest.unstable_mockModule('../../evm/api/decision.js', () => ({ decideApis: mockDecideApis }));
jest.unstable_mockModule('../../evm/api/query-formulator.js', () => ({ formulateQuery: mockFormulateQuery }));
jest.unstable_mockModule('../../evm/api/caller.js', () => ({
    callApi: mockCallApi,
    classifyError: mockClassifyError,
}));
jest.unstable_mockModule('../../evm/api/interpreter.js', () => ({ interpretResult: mockInterpretResult }));
jest.unstable_mockModule('../../evm/api/corrections.js', () => ({
    applyCorrections: mockApplyCorrections,
    applyVerificationImpact: mockApplyVerificationImpact,
}));
jest.unstable_mockModule('../../evm/api/audit.js', () => ({ recordApiVerification: mockRecordApiVerification }));
jest.unstable_mockModule('../../evm/api/enrichment.js', () => ({
    extractEnrichments: mockExtractEnrichments,
    createEnrichmentNodes: mockCreateEnrichmentNodes,
    appendEnrichmentToNode: mockAppendEnrichmentToNode,
}));

const { runApiVerification } = await import('../../evm/api/orchestrator.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApi(overrides: Record<string, any> = {}) {
    return {
        id: 'api-1',
        name: 'test-api',
        displayName: 'Test API',
        enabled: true,
        mode: 'verify',
        baseUrl: 'https://example.com',
        ...overrides,
    };
}

function makeDecision(overrides: Record<string, any> = {}) {
    return {
        apiId: 'api-1',
        apiName: 'test-api',
        mode: 'verify',
        reason: 'Content mentions verifiable facts',
        confidence: 0.8,
        ...overrides,
    };
}

beforeEach(() => {
    jest.resetAllMocks();
    mockResolveContent.mockImplementation(async (s) => s + '_resolved');
    mockGetNodeVariables.mockResolvedValue([]);
    mockGetEnabledApis.mockResolvedValue([]);
    mockGetApi.mockResolvedValue(null);
    mockRecordApiCall.mockResolvedValue(undefined);
    mockDecideApis.mockResolvedValue([]);
    mockApplyCorrections.mockResolvedValue({ applied: 0 });
    mockApplyVerificationImpact.mockResolvedValue(undefined);
    mockRecordApiVerification.mockResolvedValue('audit-id');
    mockExtractEnrichments.mockResolvedValue([]);
    mockCreateEnrichmentNodes.mockResolvedValue({ nodeIds: [], mode: 'children' });
    mockAppendEnrichmentToNode.mockResolvedValue({ facts: [], mode: 'inline' });
    mockClassifyError.mockReturnValue('http_error');
    mockEmitActivity.mockReturnValue(undefined);
    // Reset config values
    mockAppConfig.labVerify.apiVerification.maxApisPerNode = 3;
    mockAppConfig.labVerify.apiVerification.minCorrectionConfidence = 0.7;
    mockAppConfig.labVerify.apiVerification.enrichmentEnabled = true;
    mockAppConfig.labVerify.apiVerification.enrichmentMode = 'children';
});

// =============================================================================
// No enabled APIs
// =============================================================================

describe('runApiVerification — no enabled APIs', () => {
    it('returns empty results when no APIs are enabled', async () => {
        mockGetEnabledApis.mockResolvedValue([]);
        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results).toHaveLength(0);
        expect(result.totalCorrections).toBe(0);
        expect(result.overallImpact).toBeNull();
        expect(result.resolvedContent).toBe('raw content_resolved');
    });
});

// =============================================================================
// Decision engine errors
// =============================================================================

describe('runApiVerification — decision engine error', () => {
    it('returns empty results when decideApis throws', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockRejectedValue(new Error('Decision engine failed'));

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results).toHaveLength(0);
        expect(result.overallImpact).toBeNull();
        expect(mockEmitActivity).toHaveBeenCalledWith('api', 'api_decision_error', expect.any(String), expect.any(Object));
    });
});

// =============================================================================
// No decisions returned
// =============================================================================

describe('runApiVerification — no decisions', () => {
    it('returns empty results when decideApis returns empty array', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([]);

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results).toHaveLength(0);
        expect(result.overallImpact).toBeNull();
    });
});

// =============================================================================
// API not found / disabled
// =============================================================================

describe('runApiVerification — API not found or disabled', () => {
    it('pushes skipped result when getApi returns null', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision()]);
        mockGetApi.mockResolvedValue(null);

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results).toHaveLength(1);
        expect(result.results[0].status).toBe('skipped');
        expect(result.results[0].error).toContain('not found or disabled');
    });

    it('pushes skipped result when api is disabled', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision()]);
        mockGetApi.mockResolvedValue(makeApi({ enabled: false }));

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results[0].status).toBe('skipped');
    });
});

// =============================================================================
// API call HTTP error
// =============================================================================

describe('runApiVerification — HTTP error from API', () => {
    it('records api_error result when HTTP status >= 300', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision()]);
        mockGetApi.mockResolvedValue(makeApi());
        mockFormulateQuery.mockResolvedValue({ method: 'GET', url: 'https://example.com' });
        mockCallApi.mockResolvedValue({ status: 503, body: 'Service unavailable', responseTimeMs: 200 });
        mockClassifyError.mockReturnValue('server_error');

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results).toHaveLength(1);
        expect(result.results[0].status).toBe('api_error');
        expect(result.results[0].error).toContain('503');
        expect(mockRecordApiCall).toHaveBeenCalledWith('api-1', false);
        expect(mockInterpretResult).not.toHaveBeenCalled();
    });

    it('sets status to timeout when classifyError returns timeout', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision()]);
        mockGetApi.mockResolvedValue(makeApi());
        mockFormulateQuery.mockResolvedValue({ method: 'GET', url: 'https://example.com' });
        mockCallApi.mockResolvedValue({ status: 408, body: '', responseTimeMs: 30000 });
        mockClassifyError.mockReturnValue('timeout');

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results[0].status).toBe('timeout');
    });
});

// =============================================================================
// Successful verify call — structural_validation
// =============================================================================

describe('runApiVerification — successful verify, structural_validation', () => {
    it('returns validation result and sets overall impact', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision({ mode: 'verify' })]);
        mockGetApi.mockResolvedValue(makeApi());
        mockFormulateQuery.mockResolvedValue({ method: 'GET', url: 'https://example.com' });
        mockCallApi.mockResolvedValue({ status: 200, body: '{"data":true}', responseTimeMs: 100 });
        mockInterpretResult.mockResolvedValue({
            impact: 'structural_validation',
            confidence: 0.9,
            evidenceSummary: 'Data confirmed',
            corrections: [],
        });

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results[0].status).toBe('success');
        expect(result.overallImpact).toBe('structural_validation');
        expect(result.totalCorrections).toBe(0);
        expect(mockRecordApiCall).toHaveBeenCalledWith('api-1', true);
        expect(mockApplyVerificationImpact).toHaveBeenCalledWith('node-1', 'structural_validation', 0);
    });
});

// =============================================================================
// Successful verify call — value_correction
// =============================================================================

describe('runApiVerification — value_correction', () => {
    it('applies corrections and counts them', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision({ mode: 'verify' })]);
        mockGetApi.mockResolvedValue(makeApi());
        mockFormulateQuery.mockResolvedValue({ method: 'GET', url: 'https://example.com' });
        mockCallApi.mockResolvedValue({ status: 200, body: '{}', responseTimeMs: 80 });
        mockInterpretResult.mockResolvedValue({
            impact: 'value_correction',
            confidence: 0.85,
            evidenceSummary: '2 values differ',
            corrections: [
                { varId: 'VAR001', correctedValue: '42' },
                { varId: 'VAR002', correctedValue: '3.14' },
            ],
        });
        mockApplyCorrections.mockResolvedValue({ applied: 2 });

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.totalCorrections).toBe(2);
        expect(result.overallImpact).toBe('value_correction');
        expect(mockApplyCorrections).toHaveBeenCalledWith('node-1', expect.any(Array), 0.7);
    });
});

// =============================================================================
// Worst-case impact priority
// =============================================================================

describe('runApiVerification — worst-case impact across multiple APIs', () => {
    it('worst-case wins: structural_refutation beats structural_validation', async () => {
        const api1 = makeApi({ id: 'api-1', name: 'api-one' });
        const api2 = makeApi({ id: 'api-2', name: 'api-two' });
        mockGetEnabledApis.mockResolvedValue([api1, api2]);
        mockDecideApis.mockResolvedValue([
            makeDecision({ apiId: 'api-1', apiName: 'api-one', mode: 'verify' }),
            makeDecision({ apiId: 'api-2', apiName: 'api-two', mode: 'verify' }),
        ]);
        mockGetApi
            .mockResolvedValueOnce(api1)
            .mockResolvedValueOnce(api2);
        mockFormulateQuery
            .mockResolvedValueOnce({ method: 'GET', url: 'https://api1.example.com' })
            .mockResolvedValueOnce({ method: 'GET', url: 'https://api2.example.com' });
        mockCallApi.mockResolvedValue({ status: 200, body: '{}', responseTimeMs: 50 });
        mockInterpretResult
            .mockResolvedValueOnce({
                impact: 'structural_validation',
                confidence: 0.9,
                evidenceSummary: 'OK',
                corrections: [],
            })
            .mockResolvedValueOnce({
                impact: 'structural_refutation',
                confidence: 0.95,
                evidenceSummary: 'Contradicted',
                corrections: [],
            });

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.overallImpact).toBe('structural_refutation');
        expect(result.results).toHaveLength(2);
    });
});

// =============================================================================
// maxApisPerNode cap
// =============================================================================

describe('runApiVerification — maxApisPerNode cap', () => {
    it('caps the number of APIs called', async () => {
        mockAppConfig.labVerify.apiVerification.maxApisPerNode = 2;
        const enabledApis = [
            makeApi({ id: 'api-1' }),
            makeApi({ id: 'api-2' }),
            makeApi({ id: 'api-3' }),
        ];
        mockGetEnabledApis.mockResolvedValue(enabledApis);
        mockDecideApis.mockResolvedValue([
            makeDecision({ apiId: 'api-1', apiName: 'api-one' }),
            makeDecision({ apiId: 'api-2', apiName: 'api-two' }),
            makeDecision({ apiId: 'api-3', apiName: 'api-three' }),
        ]);
        mockGetApi.mockResolvedValue(null); // all skipped — just need count

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results).toHaveLength(2); // only 2 decisions executed
    });
});

// =============================================================================
// Enrichment mode — children
// =============================================================================

describe('runApiVerification — enrichment mode: children', () => {
    it('calls createEnrichmentNodes when enrichmentMode is children', async () => {
        mockAppConfig.labVerify.apiVerification.enrichmentMode = 'children';
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision({ mode: 'enrich' })]);
        mockGetApi.mockResolvedValue(makeApi({ mode: 'enrich' }));
        mockFormulateQuery.mockResolvedValue({ method: 'GET', url: 'https://example.com' });
        mockCallApi.mockResolvedValue({ status: 200, body: '{"facts":[]}', responseTimeMs: 60 });
        mockExtractEnrichments.mockResolvedValue([{ content: 'Fact 1', confidence: 0.9 }]);
        mockCreateEnrichmentNodes.mockResolvedValue({ nodeIds: ['child-1'], mode: 'children' });

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(mockCreateEnrichmentNodes).toHaveBeenCalled();
        expect(result.totalEnrichments).toBe(1);
        expect(result.enrichmentNodeIds).toContain('child-1');
    });
});

// =============================================================================
// Enrichment mode — inline
// =============================================================================

describe('runApiVerification — enrichment mode: inline', () => {
    it('calls appendEnrichmentToNode when enrichmentMode is inline', async () => {
        mockAppConfig.labVerify.apiVerification.enrichmentMode = 'inline';
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision({ mode: 'enrich' })]);
        mockGetApi.mockResolvedValue(makeApi({ mode: 'enrich' }));
        mockFormulateQuery.mockResolvedValue({ method: 'GET', url: 'https://example.com' });
        mockCallApi.mockResolvedValue({ status: 200, body: '{}', responseTimeMs: 60 });
        mockExtractEnrichments.mockResolvedValue([{ content: 'Fact A', confidence: 0.8 }]);
        mockAppendEnrichmentToNode.mockResolvedValue({ facts: ['Fact A'], mode: 'inline' });

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(mockAppendEnrichmentToNode).toHaveBeenCalled();
        expect(result.totalEnrichments).toBe(1);
    });
});

// =============================================================================
// Unexpected exception during API call
// =============================================================================

describe('runApiVerification — exception in API call', () => {
    it('catches exception and marks result as api_error', async () => {
        mockGetEnabledApis.mockResolvedValue([makeApi()]);
        mockDecideApis.mockResolvedValue([makeDecision()]);
        mockGetApi.mockResolvedValue(makeApi());
        mockFormulateQuery.mockRejectedValue(new Error('Network error'));
        mockClassifyError.mockReturnValue('network');

        const result = await runApiVerification('node-1', 'raw content', 'science');

        expect(result.results[0].status).toBe('api_error');
        expect(result.results[0].error).toContain('Network error');
        expect(mockRecordApiCall).toHaveBeenCalledWith('api-1', false);
    });
});

// =============================================================================
// resolvedContent uses final re-resolved content
// =============================================================================

describe('runApiVerification — resolved content', () => {
    it('returns re-resolved content after corrections', async () => {
        mockGetEnabledApis.mockResolvedValue([]);
        mockResolveContent.mockResolvedValue('final-resolved-content');

        const result = await runApiVerification('node-1', 'raw', 'science');

        expect(result.resolvedContent).toBe('final-resolved-content');
    });
});
