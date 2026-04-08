/**
 * Unit tests for routes/prompts.ts —
 * List, get, put, delete prompts; backup/restore; gold standards.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockListPrompts = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSavePrompt = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockDeletePromptOverride = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockPreviewPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('rendered text');
const mockBackupPrompts = jest.fn<() => Promise<any>>().mockResolvedValue({ file: 'prompts.bak' });
const mockRestorePrompts = jest.fn<() => Promise<any>>().mockResolvedValue({ restored: 3 });
const mockGetBackupInfo = jest.fn<() => any>().mockReturnValue({ exists: true, file: 'prompts.bak' });

jest.unstable_mockModule('../../prompts.js', () => ({
    listPrompts: mockListPrompts,
    savePrompt: mockSavePrompt,
    deletePromptOverride: mockDeletePromptOverride,
    previewPrompt: mockPreviewPrompt,
    backupPrompts: mockBackupPrompts,
    restorePrompts: mockRestorePrompts,
    getBackupInfo: mockGetBackupInfo,
    DEFAULT_PROMPTS: [],
    DEFAULT_GOLD_STANDARDS: [
        { promptId: 'core.synthesis', tier: 1, content: 'default gold standard 1' },
        { promptId: 'core.synthesis', tier: 2, content: 'default gold standard 2' },
    ],
}));

const mockGenerateGoldStandards = jest.fn<() => Promise<any>>().mockResolvedValue({ generated: 0 });
const mockGetGoldStandards = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockDeleteGoldStandards = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
const mockListGoldStandardPrompts = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockUpdateGoldStandard = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);

jest.unstable_mockModule('../../core/autotune.js', () => ({
    generateGoldStandards: mockGenerateGoldStandards,
    getGoldStandards: mockGetGoldStandards,
    deleteGoldStandards: mockDeleteGoldStandards,
    listGoldStandardPrompts: mockListGoldStandardPrompts,
    updateGoldStandard: mockUpdateGoldStandard,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const promptsRouter = (await import('../../routes/prompts.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(promptsRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockListPrompts.mockResolvedValue([]);
    mockSavePrompt.mockResolvedValue(undefined);
    mockDeletePromptOverride.mockResolvedValue(undefined);
    mockPreviewPrompt.mockResolvedValue('rendered text');
    mockBackupPrompts.mockResolvedValue({ file: 'prompts.bak' });
    mockRestorePrompts.mockResolvedValue({ restored: 3 });
    mockGetBackupInfo.mockReturnValue({ exists: true });
    mockGenerateGoldStandards.mockResolvedValue({ generated: 0 });
    mockGetGoldStandards.mockResolvedValue([]);
    mockDeleteGoldStandards.mockResolvedValue(undefined);
    mockListGoldStandardPrompts.mockResolvedValue([]);
    mockUpdateGoldStandard.mockResolvedValue(undefined);
});

// =============================================================================
// GET /prompts
// =============================================================================

describe('GET /prompts', () => {
    it('returns all prompts', async () => {
        mockListPrompts.mockResolvedValue([
            { id: 'core.synthesis', category: 'core', content: 'Synthesize this' },
            { id: 'core.voice', category: 'core', content: 'Voice this' },
        ]);

        const res = await request(app).get('/prompts');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2);
    });

    it('filters by category', async () => {
        mockListPrompts.mockResolvedValue([
            { id: 'core.synthesis', category: 'core', content: 'A' },
            { id: 'docs.overview', category: 'docs', content: 'B' },
        ]);

        const res = await request(app).get('/prompts?category=docs');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe('docs.overview');
    });

    it('passes locale to listPrompts', async () => {
        await request(app).get('/prompts?locale=fr');

        expect(mockListPrompts).toHaveBeenCalledWith('fr');
    });

    it('defaults locale to en', async () => {
        await request(app).get('/prompts');

        expect(mockListPrompts).toHaveBeenCalledWith('en');
    });
});

// =============================================================================
// GET /prompts/backup
// =============================================================================

describe('GET /prompts/backup', () => {
    it('returns backup info', async () => {
        mockGetBackupInfo.mockReturnValue({ exists: true, path: '/data/prompts.bak', size: 1024 });

        const res = await request(app).get('/prompts/backup');

        expect(res.status).toBe(200);
        expect(res.body.exists).toBe(true);
    });
});

// =============================================================================
// POST /prompts/backup
// =============================================================================

describe('POST /prompts/backup', () => {
    it('calls backupPrompts and returns success', async () => {
        mockBackupPrompts.mockResolvedValue({ file: 'prompts.bak', count: 5 });

        const res = await request(app).post('/prompts/backup');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.count).toBe(5);
        expect(mockBackupPrompts).toHaveBeenCalled();
    });
});

// =============================================================================
// POST /prompts/restore
// =============================================================================

describe('POST /prompts/restore', () => {
    it('calls restorePrompts and returns success', async () => {
        mockRestorePrompts.mockResolvedValue({ restored: 7 });

        const res = await request(app).post('/prompts/restore');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.restored).toBe(7);
    });
});

// =============================================================================
// GET /prompts/gold-standards
// =============================================================================

describe('GET /prompts/gold-standards', () => {
    it('returns merged list of DB prompts and defaults', async () => {
        mockListGoldStandardPrompts.mockResolvedValue([
            { prompt_id: 'core.voice', count: 3, generated_at: '2024-01-01' },
        ]);

        const res = await request(app).get('/prompts/gold-standards');

        expect(res.status).toBe(200);
        // DB entry (core.voice) + default entry (core.synthesis not in DB)
        expect(res.body.length).toBeGreaterThanOrEqual(2);
    });

    it('adds default-only entries with source=default', async () => {
        mockListGoldStandardPrompts.mockResolvedValue([]); // no DB entries

        const res = await request(app).get('/prompts/gold-standards');

        expect(res.body.some((e: any) => e.source === 'default')).toBe(true);
        expect(res.body.some((e: any) => e.prompt_id === 'core.synthesis')).toBe(true);
    });
});

// =============================================================================
// GET /prompts/:id
// =============================================================================

describe('GET /prompts/:id', () => {
    it('returns 404 when prompt not found', async () => {
        mockListPrompts.mockResolvedValue([{ id: 'core.synthesis', category: 'core' }]);

        const res = await request(app).get('/prompts/nonexistent.prompt');

        expect(res.status).toBe(404);
        expect(res.body.error).toContain('not found');
    });

    it('returns matching prompt', async () => {
        mockListPrompts.mockResolvedValue([
            { id: 'core.synthesis', category: 'core', content: 'Synthesize' },
        ]);

        const res = await request(app).get('/prompts/core.synthesis');

        expect(res.status).toBe(200);
        expect(res.body.id).toBe('core.synthesis');
    });
});

// =============================================================================
// PUT /prompts/:id
// =============================================================================

describe('PUT /prompts/:id', () => {
    it('returns 400 when content is missing', async () => {
        const res = await request(app).put('/prompts/core.synthesis').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('content is required');
    });

    it('saves prompt and returns success', async () => {
        const res = await request(app).put('/prompts/core.synthesis').send({
            content: 'New content',
            locale: 'en',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.id).toBe('core.synthesis');
        expect(mockSavePrompt).toHaveBeenCalledWith('core.synthesis', 'en', 'New content', undefined);
    });

    it('defaults locale to en', async () => {
        await request(app).put('/prompts/core.synthesis').send({ content: 'text' });

        expect(mockSavePrompt).toHaveBeenCalledWith('core.synthesis', 'en', 'text', undefined);
    });
});

// =============================================================================
// DELETE /prompts/:id
// =============================================================================

describe('DELETE /prompts/:id', () => {
    it('deletes override and returns success', async () => {
        const res = await request(app).delete('/prompts/core.synthesis');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.reverted).toBe(true);
        expect(mockDeletePromptOverride).toHaveBeenCalledWith('core.synthesis', 'en');
    });

    it('passes locale query param to deletePromptOverride', async () => {
        await request(app).delete('/prompts/core.synthesis?locale=fr');

        expect(mockDeletePromptOverride).toHaveBeenCalledWith('core.synthesis', 'fr');
    });
});

// =============================================================================
// POST /prompts/preview
// =============================================================================

describe('POST /prompts/preview', () => {
    it('returns 400 when id is missing', async () => {
        const res = await request(app).post('/prompts/preview').send({});

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('id is required');
    });

    it('returns rendered prompt', async () => {
        mockPreviewPrompt.mockResolvedValue('Rendered: hello world');

        const res = await request(app).post('/prompts/preview').send({
            id: 'core.synthesis',
            variables: { topic: 'world' },
        });

        expect(res.status).toBe(200);
        expect(res.body.rendered).toBe('Rendered: hello world');
        expect(res.body.id).toBe('core.synthesis');
    });
});

// =============================================================================
// GET /prompts/:id/gold-standards
// =============================================================================

describe('GET /prompts/:id/gold-standards', () => {
    it('returns DB gold standards when available', async () => {
        mockGetGoldStandards.mockResolvedValue([
            { id: 'gs1', prompt_id: 'core.synthesis', tier: 1, content: 'gs content',
              test_input: null, model_used: 'claude', locked: 0, generated_at: '2024-01-01', embedding: null },
        ]);

        const res = await request(app).get('/prompts/core.synthesis/gold-standards');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(1);
        expect(res.body[0].id).toBe('gs1');
        expect(res.body[0].has_embedding).toBe(false);
        expect(res.body[0]).not.toHaveProperty('embedding'); // stripped
    });

    it('returns default gold standards when no DB standards', async () => {
        mockGetGoldStandards.mockResolvedValue([]);

        const res = await request(app).get('/prompts/core.synthesis/gold-standards');

        expect(res.status).toBe(200);
        expect(res.body).toHaveLength(2); // 2 defaults for core.synthesis in mock
        expect(res.body[0].source).toBe('default');
    });

    it('returns empty array when no DB and no defaults', async () => {
        mockGetGoldStandards.mockResolvedValue([]);

        const res = await request(app).get('/prompts/unknown.prompt/gold-standards');

        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});

// =============================================================================
// PUT /prompts/:id/gold-standards/:gsId
// =============================================================================

describe('PUT /prompts/:id/gold-standards/:gsId', () => {
    it('returns 400 when neither content nor locked provided', async () => {
        const res = await request(app).put('/prompts/core.synthesis/gold-standards/gs1').send({});

        expect(res.status).toBe(400);
    });

    it('updates gold standard with content', async () => {
        const res = await request(app).put('/prompts/core.synthesis/gold-standards/gs1').send({
            content: 'updated content',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockUpdateGoldStandard).toHaveBeenCalledWith('gs1', { content: 'updated content', locked: undefined });
    });
});

// =============================================================================
// POST /prompts/:id/gold-standards/generate
// =============================================================================

describe('POST /prompts/:id/gold-standards/generate', () => {
    it('returns immediately with generating status', async () => {
        const res = await request(app).post('/prompts/core.synthesis/gold-standards/generate');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('generating');
        expect(res.body.prompt_id).toBe('core.synthesis');
    });
});

// =============================================================================
// DELETE /prompts/:id/gold-standards
// =============================================================================

describe('DELETE /prompts/:id/gold-standards', () => {
    it('calls deleteGoldStandards and returns success', async () => {
        const res = await request(app).delete('/prompts/core.synthesis/gold-standards');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockDeleteGoldStandards).toHaveBeenCalledWith('core.synthesis');
    });
});
