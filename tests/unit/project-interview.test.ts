/**
 * Unit tests for handlers/projects/interview.ts — handleInterview multi-turn flow.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetProjectDir = jest.fn<() => string>().mockReturnValue('/projects');
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('What is the purpose?');
const mockSetProjectSwitching = jest.fn<() => void>();
const mockResetAbortController = jest.fn<() => void>();
const mockStopAllBackgroundServices = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockHandleNew = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true, name: 'test-project', message: 'Created' });
const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('What is the purpose?');

const mockExistsSync = jest.fn<(p: string) => boolean>().mockReturnValue(false);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    getProjectDir: mockGetProjectDir,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    setProjectSwitching: mockSetProjectSwitching,
    resetAbortController: mockResetAbortController,
}));

jest.unstable_mockModule('../../handlers/projects/services.js', () => ({
    stopAllBackgroundServices: mockStopAllBackgroundServices,
}));

jest.unstable_mockModule('../../handlers/projects/crud.js', () => ({
    handleNew: mockHandleNew,
}));

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

jest.unstable_mockModule('fs', () => ({
    default: {
        existsSync: mockExistsSync,
    },
    existsSync: mockExistsSync,
}));

const { handleInterview } = await import('../../handlers/projects/interview.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetProjectDir.mockReturnValue('/projects');
    mockGetPrompt.mockResolvedValue('What is the purpose?');
    mockSetProjectSwitching.mockReturnValue(undefined);
    mockResetAbortController.mockReturnValue(undefined);
    mockStopAllBackgroundServices.mockResolvedValue(undefined);
    mockHandleNew.mockResolvedValue({ success: true, name: 'test-project', message: 'Created' });
    mockCallSubsystemModel.mockResolvedValue('What is the purpose?');
    mockExistsSync.mockReturnValue(false);
});

// =============================================================================
// Start new interview — validation
// =============================================================================

describe('handleInterview — start new interview', () => {
    it('returns error when name is missing', async () => {
        const result = await handleInterview({});
        expect(result.error).toContain('name is required');
    });

    it('returns error when name has invalid characters', async () => {
        const result = await handleInterview({ name: 'bad name!!' });
        expect(result.error).toContain('name is required');
    });

    it('returns error when project already exists', async () => {
        mockExistsSync.mockReturnValue(true);
        const result = await handleInterview({ name: 'existing-project' });
        expect(result.error).toContain('already exists');
    });

    it('returns error when LLM call fails', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM offline'));
        const result = await handleInterview({ name: 'my-project' });
        expect(result.error).toContain('Failed to start interview');
        expect(result.error).toContain('LLM offline');
    });

    it('returns in_progress with interviewId and question on success', async () => {
        mockCallSubsystemModel.mockResolvedValue('  What is the purpose of this project?  ');
        const result = await handleInterview({ name: 'my-project' });
        expect(result.status).toBe('in_progress');
        expect(result.interviewId).toBeDefined();
        expect(result.question).toBe('What is the purpose of this project?'); // trimmed
        expect(result.step).toBe(1);
    });

    it('stops background services and resets abort controller on start', async () => {
        await handleInterview({ name: 'my-project' });
        expect(mockStopAllBackgroundServices).toHaveBeenCalled();
        expect(mockResetAbortController).toHaveBeenCalled();
    });

    it('calls getPrompt with project.interview_start and projectName', async () => {
        await handleInterview({ name: 'alpha-project' });
        expect(mockGetPrompt).toHaveBeenCalledWith('project.interview_start', { projectName: 'alpha-project' });
    });
});

// =============================================================================
// Continue interview — invalid state
// =============================================================================

describe('handleInterview — continue invalid state', () => {
    it('returns error when interviewId not found', async () => {
        const result = await handleInterview({ interviewId: 'ghost-session' });
        expect(result.error).toContain('not found or expired');
    });

    it('returns error when response is missing', async () => {
        const start = await handleInterview({ name: 'my-project' });
        const result = await handleInterview({ interviewId: start.interviewId });
        expect(result.error).toContain('response is required');
    });
});

// =============================================================================
// Continue interview — LLM asks another question
// =============================================================================

describe('handleInterview — next question', () => {
    it('returns in_progress when LLM asks another question', async () => {
        const start = await handleInterview({ name: 'my-project' });
        const interviewId = start.interviewId;

        mockCallSubsystemModel.mockResolvedValue('What domains will this project cover?');

        const result = await handleInterview({ interviewId, response: 'Research into AI safety' });
        expect(result.status).toBe('in_progress');
        expect(result.question).toBe('What domains will this project cover?');
        expect(result.step).toBeGreaterThan(1);
    });

    it('returns error when LLM call fails during continue', async () => {
        const start = await handleInterview({ name: 'my-project' });

        mockCallSubsystemModel.mockRejectedValue(new Error('Connection refused'));

        const result = await handleInterview({ interviewId: start.interviewId, response: 'some answer' });
        expect(result.error).toContain('Interview LLM call failed');
        expect(result.error).toContain('Connection refused');
    });
});

// =============================================================================
// Continue interview — malformed JSON (balanced braces but invalid)
// =============================================================================

describe('handleInterview — malformed JSON from LLM', () => {
    it('returns in_progress with retry question when JSON fails to parse', async () => {
        const start = await handleInterview({ name: 'my-project' });

        // Balanced braces but invalid JSON — triggers catch path
        mockCallSubsystemModel.mockResolvedValue('{"complete": true, "manifest": {bad: val} }');

        const result = await handleInterview({ interviewId: start.interviewId, response: 'done' });
        expect(result.status).toBe('in_progress');
        expect(result.question).toContain('compile what I\'ve learned');
    });
});

// =============================================================================
// Continue interview — complete JSON response
// =============================================================================

describe('handleInterview — complete manifest response', () => {
    const manifest = {
        name: 'my-project',
        purpose: 'Research AI safety',
        domains: ['ai-safety', 'alignment'],
        bridges: [['ai-safety', 'alignment']],
        goals: ['Understand risks'],
        autoBridge: true,
        keyQuestions: ['Is AGI safe?'],
        constraints: ['Focus on alignment'],
    };

    const completeJson = JSON.stringify({
        complete: true,
        manifest,
    });

    it('creates project and returns complete status', async () => {
        const start = await handleInterview({ name: 'my-project' });

        mockCallSubsystemModel.mockResolvedValue(completeJson);
        mockHandleNew.mockResolvedValue({ success: true, name: 'my-project', message: 'Created' });

        const result = await handleInterview({ interviewId: start.interviewId, response: 'Yes, done.' });
        expect(result.status).toBe('complete');
        expect(result.manifest).toEqual(manifest);
        expect(result.project.success).toBe(true);
        expect(mockHandleNew).toHaveBeenCalledWith(expect.objectContaining({
            name: 'my-project',
            purpose: manifest.purpose,
            domains: manifest.domains,
        }));
    });

    it('stores manifest and transcript in DB settings', async () => {
        const start = await handleInterview({ name: 'my-project' });

        mockCallSubsystemModel.mockResolvedValue(completeJson);
        mockHandleNew.mockResolvedValue({ success: true, name: 'my-project' });

        await handleInterview({ interviewId: start.interviewId, response: 'Done.' });

        const insertCalls = mockQuery.mock.calls as any[];
        const manifestInsert = insertCalls.find(([sql]: any[]) => String(sql).includes('project.manifest'));
        const transcriptInsert = insertCalls.find(([sql]: any[]) => String(sql).includes('project.interview_transcript'));

        expect(manifestInsert).toBeDefined();
        expect(transcriptInsert).toBeDefined();
    });

    it('returns error when handleNew fails', async () => {
        const start = await handleInterview({ name: 'my-project' });

        mockCallSubsystemModel.mockResolvedValue(completeJson);
        mockHandleNew.mockResolvedValue({ error: 'Project already exists' });

        const result = await handleInterview({ interviewId: start.interviewId, response: 'Done.' });
        expect(result.error).toContain('project creation failed');
        expect(result.error).toContain('Project already exists');
        expect(result.manifest).toEqual(manifest);
    });

    it('cleans up session after completion', async () => {
        const start = await handleInterview({ name: 'my-project' });
        const interviewId = start.interviewId;

        mockCallSubsystemModel.mockResolvedValue(completeJson);
        mockHandleNew.mockResolvedValue({ success: true, name: 'my-project' });

        await handleInterview({ interviewId, response: 'Done.' });

        // Session should be gone — any follow-up with same ID should fail
        const followUp = await handleInterview({ interviewId, response: 'More?' });
        expect(followUp.error).toContain('not found or expired');
    });
});
