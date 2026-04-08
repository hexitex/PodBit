/**
 * Unit tests for evm/api/onboard.ts — handleOnboard multi-turn interview flow.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('What is the base URL?');
const mockCreateApi = jest.fn<() => Promise<any>>();
const mockSavePromptVersion = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGetApiByName = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('What is the base URL?');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

// Both static and dynamic imports from registry.js are intercepted here
jest.unstable_mockModule('../../evm/api/registry.js', () => ({
    createApi: mockCreateApi,
    savePromptVersion: mockSavePromptVersion,
    getApiByName: mockGetApiByName,
}));

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

const { handleOnboard } = await import('../../evm/api/onboard.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockGetPrompt.mockResolvedValue('What is the base URL?');
    mockGetApiByName.mockResolvedValue(null);
    mockCallSubsystemModel.mockResolvedValue('What is the base URL?');
    mockCreateApi.mockResolvedValue({ id: 'new-api-id', name: 'my-api' });
    mockSavePromptVersion.mockResolvedValue(undefined);
});

// =============================================================================
// Start new interview — validation
// =============================================================================

describe('handleOnboard — start new interview', () => {
    it('returns error when name is missing', async () => {
        const result = await handleOnboard({});
        expect(result.status).toBe('error');
        expect(result.error).toContain('name is required');
    });

    it('returns error when name has invalid characters', async () => {
        const result = await handleOnboard({ name: 'invalid name!' });
        expect(result.status).toBe('error');
        expect(result.error).toContain('name is required');
    });

    it('returns error when API already exists', async () => {
        mockGetApiByName.mockResolvedValue({ id: 'existing-id', name: 'my-api' });
        const result = await handleOnboard({ name: 'my-api' });
        expect(result.status).toBe('error');
        expect(result.error).toContain('already exists');
        expect(result.error).toContain('existing-id');
    });

    it('returns error when LLM call fails during start', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM unavailable'));
        const result = await handleOnboard({ name: 'my-api' });
        expect(result.status).toBe('error');
        expect(result.error).toContain('Failed to start interview');
        expect(result.error).toContain('LLM unavailable');
    });

    it('returns in_progress with interviewId and question on success', async () => {
        mockCallSubsystemModel.mockResolvedValue('  What is the base URL?  ');
        const result = await handleOnboard({ name: 'my-api' });
        expect(result.status).toBe('in_progress');
        expect(result.interviewId).toBeDefined();
        expect(result.question).toBe('What is the base URL?'); // trimmed
        expect(result.step).toBe(1);
    });

    it('calls getPrompt with api.onboard_start and apiName', async () => {
        await handleOnboard({ name: 'test-api' });
        expect(mockGetPrompt).toHaveBeenCalledWith('api.onboard_start', { apiName: 'test-api' });
    });
});

// =============================================================================
// Continue existing interview — session not found / missing response
// =============================================================================

describe('handleOnboard — continue interview, invalid state', () => {
    it('returns error when interviewId not found', async () => {
        const result = await handleOnboard({ interviewId: 'nonexistent-session' });
        expect(result.status).toBe('error');
        expect(result.error).toContain('not found or expired');
    });

    it('returns error when response is missing', async () => {
        // Start a real session first
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        const result = await handleOnboard({ interviewId });
        expect(result.status).toBe('error');
        expect(result.error).toContain('response is required');
    });
});

// =============================================================================
// Continue interview — LLM asks another question
// =============================================================================

describe('handleOnboard — continue interview, next question', () => {
    it('returns in_progress when LLM asks another question', async () => {
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        mockCallSubsystemModel.mockResolvedValue('What auth type does this API use?');

        const result = await handleOnboard({ interviewId, response: 'https://api.example.com' });
        expect(result.status).toBe('in_progress');
        expect(result.question).toBe('What auth type does this API use?');
        expect(result.step).toBeGreaterThan(1);
    });

    it('returns error when LLM call fails during continue', async () => {
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        mockCallSubsystemModel.mockRejectedValue(new Error('Timeout'));

        const result = await handleOnboard({ interviewId, response: 'some-answer' });
        expect(result.status).toBe('error');
        expect(result.error).toContain('Interview LLM call failed');
        expect(result.error).toContain('Timeout');
    });
});

// =============================================================================
// Continue interview — malformed JSON from LLM
// =============================================================================

describe('handleOnboard — malformed JSON response', () => {
    it('returns in_progress with retry message when JSON is malformed', async () => {
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        // LLM returns balanced braces but invalid JSON — triggers the parse catch path
        mockCallSubsystemModel.mockResolvedValue('{"complete": true, "config": {bad: val} }');

        const result = await handleOnboard({ interviewId, response: 'some-answer' });
        expect(result.status).toBe('in_progress');
        expect(result.question).toContain('more detail');
    });
});

// =============================================================================
// Continue interview — complete JSON response
// =============================================================================

describe('handleOnboard — complete JSON response', () => {
    const completeJson = JSON.stringify({
        complete: true,
        config: {
            name: 'my-api',
            displayName: 'My API',
            description: 'Test API',
            baseUrl: 'https://api.example.com',
            authType: 'bearer',
            authKey: 'API_KEY',
            capabilities: ['fact-check'],
            domains: ['science'],
            mode: 'verify',
        },
        prompts: {
            query: 'Query prompt text',
            interpret: 'Interpret prompt text',
        },
        testCases: [{ url: 'https://api.example.com/test', expected: 'ok' }],
    });

    it('creates API and returns complete status', async () => {
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        mockCallSubsystemModel.mockResolvedValue(completeJson);
        const api = { id: 'created-api', name: 'my-api' };
        mockCreateApi.mockResolvedValue(api);

        const result = await handleOnboard({ interviewId, response: 'Yes, all looks good.' });
        expect(result.status).toBe('complete');
        expect(result.api).toEqual(api);
        expect(mockCreateApi).toHaveBeenCalledWith(expect.objectContaining({
            name: 'my-api',
            baseUrl: 'https://api.example.com',
            authType: 'bearer',
        }));
    });

    it('saves prompt versions for query and interpret', async () => {
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        mockCallSubsystemModel.mockResolvedValue(completeJson);
        mockCreateApi.mockResolvedValue({ id: 'api-x', name: 'my-api' });

        await handleOnboard({ interviewId, response: 'Done.' });

        expect(mockSavePromptVersion).toHaveBeenCalledWith('api-x', 'prompt_query', 'Query prompt text', 'onboarding', 'interview');
        expect(mockSavePromptVersion).toHaveBeenCalledWith('api-x', 'prompt_interpret', 'Interpret prompt text', 'onboarding', 'interview');
    });

    it('returns error when createApi throws', async () => {
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        mockCallSubsystemModel.mockResolvedValue(completeJson);
        mockCreateApi.mockRejectedValue(new Error('Duplicate name'));

        const result = await handleOnboard({ interviewId, response: 'Done.' });
        expect(result.status).toBe('error');
        expect(result.error).toContain('API creation failed');
        expect(result.error).toContain('Duplicate name');
    });

    it('uses fallback testUrl from testCases when cfg.testUrl not present', async () => {
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        mockCallSubsystemModel.mockResolvedValue(completeJson);
        mockCreateApi.mockResolvedValue({ id: 'api-x', name: 'my-api' });

        await handleOnboard({ interviewId, response: 'Done.' });

        expect(mockCreateApi).toHaveBeenCalledWith(expect.objectContaining({
            testUrl: 'https://api.example.com/test',
        }));
    });

    it('defaults mode to verify when config provides invalid mode', async () => {
        const start = await handleOnboard({ name: 'my-api' });
        const interviewId = start.interviewId!;

        const badModeJson = JSON.stringify({
            complete: true,
            config: {
                name: 'my-api',
                baseUrl: 'https://api.example.com',
                mode: 'invalid-mode',
            },
            prompts: {},
        });
        mockCallSubsystemModel.mockResolvedValue(badModeJson);
        mockCreateApi.mockResolvedValue({ id: 'api-x', name: 'my-api' });

        await handleOnboard({ interviewId, response: 'Done.' });

        expect(mockCreateApi).toHaveBeenCalledWith(expect.objectContaining({ mode: 'verify' }));
    });
});
