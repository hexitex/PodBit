/**
 * Deep unit tests for routes/prompts.ts —
 * Covers uncovered paths: PUT with description, gold standards with embedding,
 * gold-standards merge when DB overlaps defaults, fire-and-forget error paths,
 * locked=true update, gold standard generation fire-and-forget logging.
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
        { promptId: 'core.synthesis', tier: 1, content: 'default gs 1' },
        { promptId: 'core.synthesis', tier: 2, content: 'default gs 2' },
        { promptId: 'core.voice', tier: 1, content: 'default voice gs' },
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
    jest.clearAllMocks();
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
// PUT /prompts/:id — with description
// =============================================================================

describe('PUT /prompts/:id — with description', () => {
    it('passes description to savePrompt', async () => {
        const res = await request(app).put('/prompts/core.synthesis').send({
            content: 'New content',
            locale: 'en',
            description: 'Updated for testing',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockSavePrompt).toHaveBeenCalledWith(
            'core.synthesis', 'en', 'New content', 'Updated for testing'
        );
    });
});

// =============================================================================
// PUT /prompts/:id — fire-and-forget backup failure
// =============================================================================

describe('PUT /prompts/:id — fire-and-forget paths', () => {
    it('does not fail when backup throws', async () => {
        mockBackupPrompts.mockRejectedValue(new Error('disk full'));

        const res = await request(app).put('/prompts/core.synthesis').send({
            content: 'New content',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('does not fail when gold standard generation throws', async () => {
        mockGenerateGoldStandards.mockRejectedValue(new Error('LLM unavailable'));

        const res = await request(app).put('/prompts/core.synthesis').send({
            content: 'New content',
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('logs when gold standards are generated', async () => {
        mockGenerateGoldStandards.mockResolvedValue({ generated: 3 });
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const res = await request(app).put('/prompts/core.synthesis').send({
            content: 'New content',
        });

        expect(res.status).toBe(200);
        // Wait for fire-and-forget promises
        await new Promise(r => setTimeout(r, 50));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Generated 3 gold standards'));
        logSpy.mockRestore();
    });

    it('warns when gold standards return error', async () => {
        mockGenerateGoldStandards.mockResolvedValue({ generated: 0, error: 'No model assigned' });
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await request(app).put('/prompts/core.synthesis').send({
            content: 'New content',
        });

        expect(res.status).toBe(200);
        await new Promise(r => setTimeout(r, 50));
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('No model assigned'));
        warnSpy.mockRestore();
    });
});

// =============================================================================
// DELETE /prompts/:id — fire-and-forget paths
// =============================================================================

describe('DELETE /prompts/:id — fire-and-forget paths', () => {
    it('does not fail when backup throws', async () => {
        mockBackupPrompts.mockRejectedValue(new Error('disk full'));

        const res = await request(app).delete('/prompts/core.synthesis');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('does not fail when gold standard regeneration throws', async () => {
        mockGenerateGoldStandards.mockRejectedValue(new Error('LLM down'));

        const res = await request(app).delete('/prompts/core.synthesis');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    it('logs when gold standards are regenerated on revert', async () => {
        mockGenerateGoldStandards.mockResolvedValue({ generated: 2 });
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const res = await request(app).delete('/prompts/core.synthesis');

        expect(res.status).toBe(200);
        await new Promise(r => setTimeout(r, 50));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Regenerated 2 gold standards'));
        logSpy.mockRestore();
    });
});

// =============================================================================
// GET /prompts/:id/gold-standards — embedding field handling
// =============================================================================

describe('GET /prompts/:id/gold-standards — embedding handling', () => {
    it('sets has_embedding=true when embedding is present', async () => {
        mockGetGoldStandards.mockResolvedValue([
            {
                id: 'gs1', prompt_id: 'core.synthesis', tier: 1,
                content: 'gold standard content', test_input: 'test input data',
                model_used: 'claude-3', locked: 1, generated_at: '2024-06-01',
                embedding: Buffer.from('binary-data'),
            },
        ]);

        const res = await request(app).get('/prompts/core.synthesis/gold-standards');

        expect(res.status).toBe(200);
        expect(res.body[0].has_embedding).toBe(true);
        expect(res.body[0].locked).toBe(true);
        expect(res.body[0].source).toBe('generated');
        expect(res.body[0]).not.toHaveProperty('embedding');
    });

    it('strips embedding and preserves test_input', async () => {
        mockGetGoldStandards.mockResolvedValue([
            {
                id: 'gs2', prompt_id: 'core.synthesis', tier: 2,
                content: 'another standard', test_input: 'scenario B',
                model_used: 'gpt-4', locked: 0, generated_at: '2024-05-01',
                embedding: null,
            },
        ]);

        const res = await request(app).get('/prompts/core.synthesis/gold-standards');

        expect(res.status).toBe(200);
        expect(res.body[0].test_input).toBe('scenario B');
        expect(res.body[0].has_embedding).toBe(false);
        expect(res.body[0].locked).toBe(false);
    });
});

// =============================================================================
// GET /prompts/gold-standards — merge when DB overlaps defaults
// =============================================================================

describe('GET /prompts/gold-standards — merge behavior', () => {
    it('does not duplicate when DB already has a default prompt_id', async () => {
        mockListGoldStandardPrompts.mockResolvedValue([
            { prompt_id: 'core.synthesis', count: 5, generated_at: '2024-01-01' },
            { prompt_id: 'core.voice', count: 2, generated_at: '2024-02-01' },
        ]);

        const res = await request(app).get('/prompts/gold-standards');

        expect(res.status).toBe(200);
        // Both core.synthesis and core.voice are in DB, so no default-only entries needed
        const ids = res.body.map((e: any) => e.prompt_id);
        const synthCount = ids.filter((id: string) => id === 'core.synthesis').length;
        const voiceCount = ids.filter((id: string) => id === 'core.voice').length;
        expect(synthCount).toBe(1);
        expect(voiceCount).toBe(1);
    });

    it('adds default entries only for prompts not in DB', async () => {
        mockListGoldStandardPrompts.mockResolvedValue([
            { prompt_id: 'core.synthesis', count: 3, generated_at: '2024-01-01' },
        ]);

        const res = await request(app).get('/prompts/gold-standards');

        expect(res.status).toBe(200);
        // core.synthesis from DB + core.voice from defaults
        expect(res.body.length).toBe(2);
        const defaultEntries = res.body.filter((e: any) => e.source === 'default');
        expect(defaultEntries.length).toBe(1);
        expect(defaultEntries[0].prompt_id).toBe('core.voice');
        expect(defaultEntries[0].count).toBe(1); // 1 default for core.voice
    });
});

// =============================================================================
// PUT /prompts/:id/gold-standards/:gsId — locked only
// =============================================================================

describe('PUT /prompts/:id/gold-standards/:gsId — locked only', () => {
    it('updates locked without content', async () => {
        const res = await request(app)
            .put('/prompts/core.synthesis/gold-standards/gs1')
            .send({ locked: true });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockUpdateGoldStandard).toHaveBeenCalledWith('gs1', { content: undefined, locked: true });
    });
});

// =============================================================================
// POST /prompts/preview — with locale
// =============================================================================

describe('POST /prompts/preview — locale handling', () => {
    it('passes custom locale to previewPrompt', async () => {
        mockPreviewPrompt.mockResolvedValue('Rendu: bonjour');

        const res = await request(app).post('/prompts/preview').send({
            id: 'core.synthesis',
            locale: 'fr',
            variables: { topic: 'monde' },
        });

        expect(res.status).toBe(200);
        expect(res.body.locale).toBe('fr');
        expect(mockPreviewPrompt).toHaveBeenCalledWith('core.synthesis', 'fr', { topic: 'monde' });
    });

    it('defaults locale to en when not provided', async () => {
        const res = await request(app).post('/prompts/preview').send({
            id: 'core.synthesis',
        });

        expect(res.status).toBe(200);
        expect(res.body.locale).toBe('en');
        expect(mockPreviewPrompt).toHaveBeenCalledWith('core.synthesis', 'en', {});
    });
});

// =============================================================================
// POST /prompts/:id/gold-standards/generate — fire-and-forget logging
// =============================================================================

describe('POST /prompts/:id/gold-standards/generate — logging', () => {
    it('logs when generation produces 0 with no error', async () => {
        mockGenerateGoldStandards.mockResolvedValue({ generated: 0 });
        const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await request(app).post('/prompts/core.synthesis/gold-standards/generate');

        expect(res.status).toBe(200);
        await new Promise(r => setTimeout(r, 50));
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('generated 0')
        );
        warnSpy.mockRestore();
    });

    it('logs error when generation fails', async () => {
        mockGenerateGoldStandards.mockRejectedValue(new Error('model error'));
        const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        const res = await request(app).post('/prompts/core.synthesis/gold-standards/generate');

        expect(res.status).toBe(200);
        await new Promise(r => setTimeout(r, 50));
        expect(errorSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to generate gold standards')
        );
        errorSpy.mockRestore();
    });
});
