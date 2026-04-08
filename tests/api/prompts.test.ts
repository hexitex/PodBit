/**
 * API tests for routes/prompts.ts
 *
 * Tests: GET /prompts, GET /prompts/:id (404), PUT /prompts/:id (validation),
 *        DELETE /prompts/:id, POST /prompts/preview (validation),
 *        GET /prompts/backup, POST /prompts/backup,
 *        PUT /prompts/:id/gold-standards/:gsId (validation)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockListPrompts = jest.fn<() => Promise<any[]>>();
const mockSavePrompt = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDeletePromptOverride = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockPreviewPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('rendered text');
const mockBackupPrompts = jest.fn<() => Promise<any>>().mockResolvedValue({ count: 5 });
const mockRestorePrompts = jest.fn<() => Promise<any>>().mockResolvedValue({ count: 5 });
const mockGetBackupInfo = jest.fn<() => any>().mockReturnValue({ exists: false });
const mockGetGoldStandards = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockListGoldStandardPrompts = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockUpdateGoldStandard = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDeleteGoldStandards = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockGenerateGoldStandards = jest.fn<() => Promise<any>>().mockResolvedValue({ generated: 0 });

jest.unstable_mockModule('../../prompts.js', () => ({
    listPrompts: mockListPrompts,
    savePrompt: mockSavePrompt,
    deletePromptOverride: mockDeletePromptOverride,
    previewPrompt: mockPreviewPrompt,
    backupPrompts: mockBackupPrompts,
    restorePrompts: mockRestorePrompts,
    getBackupInfo: mockGetBackupInfo,
    DEFAULT_PROMPTS: {},
    DEFAULT_GOLD_STANDARDS: [],
}));

jest.unstable_mockModule('../../core/autotune.js', () => ({
    generateGoldStandards: mockGenerateGoldStandards,
    getGoldStandards: mockGetGoldStandards,
    deleteGoldStandards: mockDeleteGoldStandards,
    listGoldStandardPrompts: mockListGoldStandardPrompts,
    updateGoldStandard: mockUpdateGoldStandard,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: promptsRouter } = await import('../../routes/prompts.js');

/** Express app with prompts router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', promptsRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockListPrompts.mockResolvedValue([
        { id: 'core.insight_synthesis', category: 'core', content: 'prompt text' },
        { id: 'evm.verifier', category: 'evm', content: 'other prompt' },
    ]);
    mockGetGoldStandards.mockResolvedValue([]);
    mockListGoldStandardPrompts.mockResolvedValue([]);
});

// =============================================================================
// GET /prompts
// =============================================================================

describe('GET /prompts', () => {
    it('returns all prompts', async () => {
        const res = await request(buildApp()).get('/prompts');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBe(2);
    });

    it('filters by category', async () => {
        mockListPrompts.mockResolvedValue([
            { id: 'core.insight_synthesis', category: 'core', content: 'text' },
        ]);
        const res = await request(buildApp()).get('/prompts?category=core');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('filters out non-matching categories', async () => {
        // listPrompts returns all; route filters to category=evm
        mockListPrompts.mockResolvedValue([
            { id: 'core.synthesis', category: 'core', content: 'x' },
            { id: 'evm.verifier', category: 'evm', content: 'y' },
        ]);
        const res = await request(buildApp()).get('/prompts?category=evm');
        expect(res.status).toBe(200);
        expect(res.body.every((p: any) => p.category === 'evm')).toBe(true);
    });
});

// =============================================================================
// GET /prompts/backup
// =============================================================================

describe('GET /prompts/backup', () => {
    it('returns backup info', async () => {
        mockGetBackupInfo.mockReturnValue({ exists: true, path: '/data/prompts.bak' });
        const res = await request(buildApp()).get('/prompts/backup');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('exists');
    });
});

// =============================================================================
// POST /prompts/backup
// =============================================================================

describe('POST /prompts/backup', () => {
    it('triggers backup and returns success', async () => {
        const res = await request(buildApp()).post('/prompts/backup');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockBackupPrompts).toHaveBeenCalled();
    });
});

// =============================================================================
// POST /prompts/restore
// =============================================================================

describe('POST /prompts/restore', () => {
    it('restores from backup and returns success', async () => {
        const res = await request(buildApp()).post('/prompts/restore');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockRestorePrompts).toHaveBeenCalled();
    });
});

// =============================================================================
// GET /prompts/:id
// =============================================================================

describe('GET /prompts/:id', () => {
    it('returns prompt when found', async () => {
        const res = await request(buildApp()).get('/prompts/core.insight_synthesis');
        expect(res.status).toBe(200);
        expect(res.body.id).toBe('core.insight_synthesis');
    });

    it('returns 404 when prompt not found', async () => {
        const res = await request(buildApp()).get('/prompts/nonexistent.prompt');
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });
});

// =============================================================================
// PUT /prompts/:id
// =============================================================================

describe('PUT /prompts/:id', () => {
    it('returns 400 when content is missing', async () => {
        const res = await request(buildApp())
            .put('/prompts/core.insight_synthesis')
            .send({ locale: 'en' });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/content/i);
    });

    it('saves prompt and returns success', async () => {
        const res = await request(buildApp())
            .put('/prompts/core.insight_synthesis')
            .send({ content: 'New prompt text' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.id).toBe('core.insight_synthesis');
        expect(mockSavePrompt).toHaveBeenCalledWith(
            'core.insight_synthesis', 'en', 'New prompt text', undefined
        );
    });

    it('uses default locale en when not specified', async () => {
        await request(buildApp())
            .put('/prompts/some.prompt')
            .send({ content: 'text' });
        expect(mockSavePrompt).toHaveBeenCalledWith('some.prompt', 'en', 'text', undefined);
    });

    it('passes description when provided', async () => {
        await request(buildApp())
            .put('/prompts/some.prompt')
            .send({ content: 'text', description: 'My description' });
        expect(mockSavePrompt).toHaveBeenCalledWith('some.prompt', 'en', 'text', 'My description');
    });
});

// =============================================================================
// DELETE /prompts/:id
// =============================================================================

describe('DELETE /prompts/:id', () => {
    it('reverts prompt to default', async () => {
        const res = await request(buildApp()).delete('/prompts/core.insight_synthesis');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.reverted).toBe(true);
        expect(mockDeletePromptOverride).toHaveBeenCalled();
    });
});

// =============================================================================
// POST /prompts/preview
// =============================================================================

describe('POST /prompts/preview', () => {
    it('returns 400 when id is missing', async () => {
        const res = await request(buildApp())
            .post('/prompts/preview')
            .send({ variables: {} });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/id/i);
    });

    it('renders prompt and returns result', async () => {
        mockPreviewPrompt.mockResolvedValue('Hello World');
        const res = await request(buildApp())
            .post('/prompts/preview')
            .send({ id: 'core.synthesis', variables: { name: 'test' } });
        expect(res.status).toBe(200);
        expect(res.body.rendered).toBe('Hello World');
        expect(res.body.id).toBe('core.synthesis');
    });
});

// =============================================================================
// PUT /prompts/:id/gold-standards/:gsId
// =============================================================================

describe('PUT /prompts/:id/gold-standards/:gsId', () => {
    it('returns 400 when neither content nor locked is provided', async () => {
        const res = await request(buildApp())
            .put('/prompts/core.synthesis/gold-standards/gs-1')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/content or locked/i);
    });

    it('updates gold standard with content', async () => {
        const res = await request(buildApp())
            .put('/prompts/core.synthesis/gold-standards/gs-1')
            .send({ content: 'Updated gold standard' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockUpdateGoldStandard).toHaveBeenCalledWith('gs-1', { content: 'Updated gold standard', locked: undefined });
    });

    it('updates gold standard with locked flag only', async () => {
        const res = await request(buildApp())
            .put('/prompts/core.synthesis/gold-standards/gs-1')
            .send({ locked: true });
        expect(res.status).toBe(200);
        expect(mockUpdateGoldStandard).toHaveBeenCalledWith('gs-1', { content: undefined, locked: true });
    });
});

// =============================================================================
// POST /prompts/:id/gold-standards/generate
// =============================================================================

describe('POST /prompts/:id/gold-standards/generate', () => {
    it('returns success immediately (fire-and-forget)', async () => {
        const res = await request(buildApp())
            .post('/prompts/core.synthesis/gold-standards/generate');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('generating');
        expect(res.body.prompt_id).toBe('core.synthesis');
    });
});

// =============================================================================
// DELETE /prompts/:id/gold-standards
// =============================================================================

describe('DELETE /prompts/:id/gold-standards', () => {
    it('deletes gold standards for prompt', async () => {
        const res = await request(buildApp())
            .delete('/prompts/core.synthesis/gold-standards');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.prompt_id).toBe('core.synthesis');
        expect(mockDeleteGoldStandards).toHaveBeenCalledWith('core.synthesis');
    });
});
