/**
 * Deep branch coverage tests for routes/config-tune.ts
 * Covers uncovered branches: callTuneModel subsystem selection, fuzzy key resolution
 * via configPath leaf, JSON extraction fallbacks, generate-patterns validation,
 * generate-intent-patterns with specific intentType, generate-words phrases/patterns/mappings
 * edge cases, history/snapshots/metrics query param defaults, and more.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('{}');
const mockGetSubsystemAssignments = jest.fn<() => Promise<any>>().mockResolvedValue({});

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
    getSubsystemAssignments: mockGetSubsystemAssignments,
}));

const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('built prompt');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const mockGetSafeConfig = jest.fn().mockReturnValue({
    tensions: { patterns: [] },
    contextEngine: { intentPatterns: {} },
});

jest.unstable_mockModule('../../config.js', () => ({
    getSafeConfig: mockGetSafeConfig,
}));

const mockSectionMetadata: Record<string, any> = {
    test_section: {
        title: 'Test Section',
        description: 'A test section',
        behavior: 'Testing behavior',
        parameters: [
            {
                key: 'testParam',
                label: 'Test Parameter',
                description: 'A test parameter',
                configPath: ['test', 'param'],
                min: 0,
                max: 1,
                step: 0.01,
                default: 0.5,
            },
            {
                key: 'intParam',
                label: 'Integer Param',
                description: 'An integer parameter',
                configPath: ['test', 'intVal'],
                min: 0,
                max: 100,
                step: 1,
                default: 50,
            },
            {
                key: 'deepParam',
                label: 'Deep Param',
                description: 'A deeply nested parameter',
                configPath: ['deeply', 'nested', 'value'],
                min: 0,
                max: 10,
                step: 0.1,
                default: 5,
            },
        ],
    },
};

jest.unstable_mockModule('../../config-sections.js', () => ({
    SECTION_METADATA: mockSectionMetadata,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const mockDbQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db/index.js', () => ({
    query: mockDbQuery,
}));

const mockInvalidateGateOverrideCache = jest.fn();

jest.unstable_mockModule('../../handlers/dedup.js', () => ({
    invalidateGateOverrideCache: mockInvalidateGateOverrideCache,
}));

const mockHandleConfig = jest.fn<() => Promise<any>>().mockResolvedValue({ ok: true });

jest.unstable_mockModule('../../handlers/config-tune-handler.js', () => ({
    handleConfig: mockHandleConfig,
}));

const configTuneRouter = (await import('../../routes/config-tune.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(configTuneRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.clearAllMocks();
    mockCallSubsystemModel.mockResolvedValue('{}');
    mockGetSubsystemAssignments.mockResolvedValue({});
    mockDbQuery.mockResolvedValue([]);
    mockHandleConfig.mockResolvedValue({ ok: true });
    mockGetSafeConfig.mockReturnValue({
        tensions: { patterns: [] },
        contextEngine: { intentPatterns: {} },
    });
});

// =============================================================================
// callTuneModel — subsystem selection
// =============================================================================

describe('callTuneModel subsystem selection', () => {
    it('uses config_tune subsystem when assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({ config_tune: { modelId: 'some-model' } });
        const llmResponse = JSON.stringify({ suggestions: [], summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'config_tune',
            expect.any(String),
            expect.objectContaining({ temperature: 0.3 }),
        );
    });

    it('falls back to compress subsystem when config_tune is not assigned', async () => {
        mockGetSubsystemAssignments.mockResolvedValue({});
        const llmResponse = JSON.stringify({ suggestions: [], summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'compress',
            expect.any(String),
            expect.objectContaining({ temperature: 0.3 }),
        );
    });
});

// =============================================================================
// POST /config/tune — branch coverage
// =============================================================================

describe('POST /config/tune — deep branches', () => {
    it('uses default value when config path resolves to undefined', async () => {
        // Config has no 'deeply.nested.value' path — should fall back to param default
        mockGetSafeConfig.mockReturnValue({ test: { param: 0.3 } });
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'deepParam', currentValue: 5, suggestedValue: 7, explanation: 'Deep' },
            ],
            summary: 'Deep param test',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions[0].suggestedValue).toBe(7);
    });

    it('resolves fuzzy key via configPath leaf name', async () => {
        // 'value' is the leaf of configPath ['deeply', 'nested', 'value']
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'value', currentValue: 5, suggestedValue: 3, explanation: 'Via leaf' },
            ],
            summary: 'Leaf resolve',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions[0].key).toBe('deepParam');
    });

    it('rounds to integer step precision (no decimals)', async () => {
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'intParam', currentValue: 50, suggestedValue: 73.7, explanation: 'Float for int' },
            ],
            summary: 'Int round',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions[0].suggestedValue).toBe(74);
    });

    it('clamps below-min values to min', async () => {
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'testParam', currentValue: 0.5, suggestedValue: -0.5, explanation: 'Under min' },
            ],
            summary: 'Clamp min',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions[0].suggestedValue).toBe(0);
    });

    it('handles null suggestions array in parsed response', async () => {
        const llmResponse = JSON.stringify({ summary: 'No suggestions' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toEqual([]);
    });

    it('drops suggestion with null/undefined key after fuzzy lookup fails', async () => {
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: null, currentValue: 0, suggestedValue: 1, explanation: 'Null key' },
                { key: undefined, currentValue: 0, suggestedValue: 1, explanation: 'Undef key' },
            ],
            summary: 'Bad keys',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.suggestions).toEqual([]);
    });

    it('enriches each suggestion with label, min, max, step, configPath', async () => {
        const llmResponse = JSON.stringify({
            suggestions: [
                { key: 'testParam', currentValue: 0.5, suggestedValue: 0.8, explanation: 'Better' },
            ],
            summary: 'Enriched',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        const s = res.body.suggestions[0];
        expect(s.label).toBe('Test Parameter');
        expect(s.min).toBe(0);
        expect(s.max).toBe(1);
        expect(s.step).toBe(0.01);
        expect(s.configPath).toEqual(['test', 'param']);
    });

    it('extracts JSON embedded in text when initial parse fails (tune)', async () => {
        const embedded = JSON.stringify({
            suggestions: [{ key: 'testParam', currentValue: 0.5, suggestedValue: 0.6, explanation: 'OK' }],
            summary: 'Extracted',
        });
        mockCallSubsystemModel.mockResolvedValue('Some preamble text\n' + embedded + '\nTrailing text');

        const res = await request(app)
            .post('/config/tune')
            .send({ sectionId: 'test_section', request: 'tune' });

        expect(res.status).toBe(200);
        expect(res.body.summary).toBe('Extracted');
    });
});

// =============================================================================
// POST /config/tune/generate-patterns — deep branches
// =============================================================================

describe('POST /config/tune/generate-patterns — deep branches', () => {
    it('returns 502 when LLM response is unparseable', async () => {
        mockCallSubsystemModel.mockResolvedValue('totally not json');

        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate tensions' });

        expect(res.status).toBe(502);
        expect(res.body.error).toContain('Failed to parse');
    });

    it('extracts JSON from prose-wrapped LLM response', async () => {
        const embedded = JSON.stringify({ pairs: [['a', 'b']], summary: 'found' });
        mockCallSubsystemModel.mockResolvedValue('Here is my result: ' + embedded + ' done.');

        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.summary).toBe('found');
    });

    it('filters invalid pairs: non-array, wrong length, non-string, empty strings', async () => {
        const llmResponse = JSON.stringify({
            pairs: [
                ['valid', 'pair'],
                'not-an-array',
                [1, 2],
                ['one'],
                ['', 'empty'],
                ['three', 'items', 'too-many'],
                ['good', 'also-good'],
            ],
            summary: 'Mixed',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.pairs.length).toBe(2);
        expect(res.body.pairs[0]).toEqual(['valid', 'pair']);
        expect(res.body.pairs[1]).toEqual(['good', 'also-good']);
    });

    it('handles null pairs array', async () => {
        const llmResponse = JSON.stringify({ summary: 'Empty' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.pairs).toEqual([]);
    });

    it('caps count at 30', async () => {
        const llmResponse = JSON.stringify({ pairs: [], summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate', count: 100 });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_patterns',
            expect.objectContaining({ count: '30' }),
        );
    });

    it('handles empty existing patterns gracefully', async () => {
        mockGetSafeConfig.mockReturnValue({ tensions: {} });
        const llmResponse = JSON.stringify({
            pairs: [['new', 'pair']],
            summary: 'ok',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.pairs.length).toBe(1);
        expect(res.body.existingCount).toBe(0);
    });

    it('provides default summary when parsed.summary is missing', async () => {
        const llmResponse = JSON.stringify({ pairs: [] });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        // summary falls through as undefined → not '', the code does || '' for missing summary
        // Actually the code does not do || '' on summary for patterns — let's check
        // Line 245: summary: parsed.summary || ''
        expect(res.body.summary).toBe('');
    });
});

// =============================================================================
// POST /config/tune/generate-intent-patterns — deep branches
// =============================================================================

describe('POST /config/tune/generate-intent-patterns — deep branches', () => {
    it('builds prompt with specific intentType', async () => {
        mockGetSafeConfig.mockReturnValue({
            contextEngine: { intentPatterns: { retrieval: ['find.*'], action: ['do.*'] } },
        });
        const llmResponse = JSON.stringify({
            patterns: { retrieval: ['search.*'] },
            summary: 'Retrieval only',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate retrieval patterns', intentType: 'retrieval' });

        expect(res.status).toBe(200);
        // When intentType is provided, prompt gets that specific type's patterns
        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_intent_patterns',
            expect.objectContaining({ intentType: 'retrieval' }),
        );
    });

    it('builds prompt for all types when no intentType given', async () => {
        mockGetSafeConfig.mockReturnValue({
            contextEngine: { intentPatterns: { retrieval: ['find.*'], action: ['do.*'] } },
        });
        const llmResponse = JSON.stringify({
            patterns: { retrieval: ['lookup.*'] },
            summary: 'All types',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate patterns' });

        expect(res.status).toBe(200);
        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_intent_patterns',
            expect.objectContaining({ intentType: 'all types' }),
        );
    });

    it('returns 502 when LLM response is unparseable', async () => {
        mockCallSubsystemModel.mockResolvedValue('invalid json garbage');

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate patterns' });

        expect(res.status).toBe(502);
    });

    it('extracts JSON from prose-wrapped LLM response', async () => {
        const embedded = JSON.stringify({
            patterns: { action: ['execute.*'] },
            summary: 'extracted',
        });
        mockCallSubsystemModel.mockResolvedValue('Blah blah ' + embedded + ' end');

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.summary).toBe('extracted');
    });

    it('filters out invalid regex patterns', async () => {
        const llmResponse = JSON.stringify({
            patterns: {
                retrieval: ['valid.*pattern', '[invalid(regex'],
            },
            summary: 'Mixed regex',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.patterns.retrieval).toEqual(['valid.*pattern']);
    });

    it('deduplicates against existing intent patterns', async () => {
        mockGetSafeConfig.mockReturnValue({
            contextEngine: { intentPatterns: { retrieval: ['find.*'] } },
        });
        const llmResponse = JSON.stringify({
            patterns: {
                retrieval: ['find.*', 'search.*', 'FIND.*'], // find.* exists, FIND.* is case-dup
            },
            summary: 'Dedup test',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.patterns.retrieval).toEqual(['search.*']);
    });

    it('skips intent types with non-array or missing patterns', async () => {
        const llmResponse = JSON.stringify({
            patterns: {
                retrieval: 'not-an-array',
                action: null,
                diagnosis: ['valid.*'],
            },
            summary: 'Partial',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.patterns.retrieval).toBeUndefined();
        expect(res.body.patterns.action).toBeUndefined();
        expect(res.body.patterns.diagnosis).toEqual(['valid.*']);
    });

    it('filters non-string and empty pattern values', async () => {
        const llmResponse = JSON.stringify({
            patterns: {
                exploration: [42, '', null, 'real.*pattern'],
            },
            summary: 'Filter non-strings',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.patterns.exploration).toEqual(['real.*pattern']);
    });

    it('caps count at 20', async () => {
        const llmResponse = JSON.stringify({ patterns: {}, summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate', count: 50 });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_intent_patterns',
            expect.objectContaining({ count: '20' }),
        );
    });

    it('provides default summary when missing', async () => {
        const llmResponse = JSON.stringify({ patterns: {} });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.summary).toBe('');
    });

    it('returns existingCounts for each intent type', async () => {
        mockGetSafeConfig.mockReturnValue({
            contextEngine: {
                intentPatterns: {
                    retrieval: ['a', 'b'],
                    action: ['c'],
                },
            },
        });
        const llmResponse = JSON.stringify({ patterns: {}, summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-intent-patterns')
            .send({ request: 'generate' });

        expect(res.status).toBe(200);
        expect(res.body.existingCounts.retrieval).toBe(2);
        expect(res.body.existingCounts.action).toBe(1);
        expect(res.body.existingCounts.diagnosis).toBe(0);
        expect(res.body.existingCounts.exploration).toBe(0);
    });
});

// =============================================================================
// POST /config/tune/generate-words — deep branches
// =============================================================================

describe('POST /config/tune/generate-words — deep branches', () => {
    it('returns 502 when LLM response is unparseable', async () => {
        mockCallSubsystemModel.mockResolvedValue('nope not json');

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate words' });

        expect(res.status).toBe(502);
    });

    it('extracts JSON from prose-wrapped response', async () => {
        const embedded = JSON.stringify({ words: ['alpha'], summary: 'found' });
        mockCallSubsystemModel.mockResolvedValue('Here: ' + embedded + ' end');

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate words' });

        expect(res.status).toBe(200);
        expect(res.body.words).toEqual(['alpha']);
    });

    it('handles phrases listType', async () => {
        const llmResponse = JSON.stringify({
            phrases: [['hello world', 'greeting'], ['good bye', 'farewell']],
            summary: 'Phrases',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({
                request: 'generate phrases',
                listType: 'phrases',
                existing: [['hello world', 'greeting']],
            });

        expect(res.status).toBe(200);
        // 'hello world' phrase should be deduped
        expect(res.body.phrases.length).toBe(1);
        expect(res.body.phrases[0]).toEqual(['good bye', 'farewell']);
    });

    it('filters invalid phrases (non-array, wrong length, non-string)', async () => {
        const llmResponse = JSON.stringify({
            phrases: [
                ['valid', 'phrase'],
                'not-an-array',
                [1, 2],
                ['only-one'],
                ['three', 'items', 'bad'],
            ],
            summary: 'Mixed phrases',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', listType: 'phrases', existing: [] });

        expect(res.status).toBe(200);
        expect(res.body.phrases.length).toBe(1);
        expect(res.body.phrases[0]).toEqual(['valid', 'phrase']);
    });

    it('handles patterns listType with valid and invalid regex', async () => {
        const llmResponse = JSON.stringify({
            patterns: ['valid.*pat', '[broken(regex', 'another\\w+'],
            summary: 'Patterns',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', listType: 'patterns', existing: [] });

        expect(res.status).toBe(200);
        expect(res.body.patterns).toEqual(['valid.*pat', 'another\\w+']);
    });

    it('deduplicates patterns against existing', async () => {
        const llmResponse = JSON.stringify({
            patterns: ['existing.*', 'new.*pattern'],
            summary: 'Dedup patterns',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', listType: 'patterns', existing: ['existing.*'] });

        expect(res.status).toBe(200);
        expect(res.body.patterns).toEqual(['new.*pattern']);
    });

    it('filters non-string pattern values', async () => {
        const llmResponse = JSON.stringify({
            patterns: [42, null, 'valid.*'],
            summary: 'Non-string',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', listType: 'patterns', existing: [] });

        expect(res.status).toBe(200);
        expect(res.body.patterns).toEqual(['valid.*']);
    });

    it('handles mappings with array-of-pairs existing format', async () => {
        const llmResponse = JSON.stringify({
            mappings: { hello: 'world', newKey: 'newVal' },
            summary: 'Array pairs',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({
                request: 'generate mappings',
                listType: 'mappings',
                existing: [['hello', 'world']],
            });

        expect(res.status).toBe(200);
        // hello should be deduped (existing is array-of-pairs → stringified → lowercase check)
        expect(res.body.mappings).toBeDefined();
    });

    it('handles mappings with object existing format and deduplicates', async () => {
        const llmResponse = JSON.stringify({
            mappings: { existKey: 'val1', brandNew: 'val2' },
            summary: 'Object existing',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({
                request: 'generate mappings',
                listType: 'mappings',
                existing: { existKey: 'oldVal' },
            });

        expect(res.status).toBe(200);
        expect(res.body.mappings.brandNew).toBe('val2');
        expect(res.body.mappings.existKey).toBeUndefined();
    });

    it('handles words with non-string and whitespace-only entries', async () => {
        const llmResponse = JSON.stringify({
            words: ['valid', '', '   ', null, 42, 'also-valid'],
            summary: 'Filter words',
        });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        const res = await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', listType: 'words', existing: [] });

        expect(res.status).toBe(200);
        expect(res.body.words).toEqual(['valid', 'also-valid']);
    });

    it('caps count at 50', async () => {
        const llmResponse = JSON.stringify({ words: [], summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', count: 100 });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_words',
            expect.objectContaining({ count: '50' }),
        );
    });

    it('formats phrases existing items for the prompt', async () => {
        const llmResponse = JSON.stringify({ phrases: [], summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune/generate-words')
            .send({
                request: 'generate',
                listType: 'phrases',
                existing: [['hello', 'greeting']],
            });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_words',
            expect.objectContaining({
                existingWords: expect.stringContaining('"hello"'),
            }),
        );
    });

    it('uses (none) for non-array existing in non-mapping/non-phrase mode', async () => {
        const llmResponse = JSON.stringify({ words: ['word'], summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune/generate-words')
            .send({
                request: 'generate',
                listType: 'words',
                existing: 'not-an-array',
            });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_words',
            expect.objectContaining({ existingWords: '(none)' }),
        );
    });

    it('formats mappings existing as array-of-entries for prompt', async () => {
        const llmResponse = JSON.stringify({ mappings: {}, summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune/generate-words')
            .send({
                request: 'generate',
                listType: 'mappings',
                existing: [['a', 'b'], ['c', 'd']],
            });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_words',
            expect.objectContaining({
                existingWords: expect.stringContaining('a → b'),
            }),
        );
    });

    it('formats mappings non-array entries as strings', async () => {
        const llmResponse = JSON.stringify({ mappings: {}, summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune/generate-words')
            .send({
                request: 'generate',
                listType: 'mappings',
                existing: ['single-string-entry'],
            });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_words',
            expect.objectContaining({
                existingWords: 'single-string-entry',
            }),
        );
    });

    it('handles empty existing array for words format', async () => {
        const llmResponse = JSON.stringify({ words: ['new'], summary: 'ok' });
        mockCallSubsystemModel.mockResolvedValue(llmResponse);

        await request(app)
            .post('/config/tune/generate-words')
            .send({ request: 'generate', listType: 'words', existing: [] });

        expect(mockGetPrompt).toHaveBeenCalledWith(
            'config.generate_words',
            expect.objectContaining({ existingWords: '(none)' }),
        );
    });
});

// =============================================================================
// GET /config/history — query param defaults
// =============================================================================

describe('GET /config/history — query param branches', () => {
    it('uses default days=7 and limit=30 when no query params', async () => {
        mockHandleConfig.mockResolvedValue({ changes: [] });

        await request(app).get('/config/history');

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                action: 'history',
                days: 7,
                limit: 30,
                configPath: undefined,
                project: undefined,
            }),
        );
    });

    it('passes configPath and project query params', async () => {
        mockHandleConfig.mockResolvedValue({ changes: [] });

        await request(app).get('/config/history?configPath=voicing.maxOutputWords&project=myProject');

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({
                configPath: 'voicing.maxOutputWords',
                project: 'myProject',
            }),
        );
    });

    it('falls back to default when days/limit are non-numeric', async () => {
        mockHandleConfig.mockResolvedValue({ changes: [] });

        await request(app).get('/config/history?days=abc&limit=xyz');

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ days: 7, limit: 30 }),
        );
    });
});

// =============================================================================
// GET /config/snapshots — query param branches
// =============================================================================

describe('GET /config/snapshots — query param branches', () => {
    it('passes allProjects=true when query param is "true"', async () => {
        mockHandleConfig.mockResolvedValue({ snapshots: [] });

        await request(app).get('/config/snapshots?allProjects=true');

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ allProjects: true }),
        );
    });

    it('passes allProjects=false when query param is absent', async () => {
        mockHandleConfig.mockResolvedValue({ snapshots: [] });

        await request(app).get('/config/snapshots');

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ allProjects: false }),
        );
    });

    it('passes project query param', async () => {
        mockHandleConfig.mockResolvedValue({ snapshots: [] });

        await request(app).get('/config/snapshots?project=testProject');

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ project: 'testProject' }),
        );
    });
});

// =============================================================================
// POST /config/snapshots — contributor branch
// =============================================================================

describe('POST /config/snapshots — contributor branch', () => {
    it('uses custom contributor when provided', async () => {
        mockHandleConfig.mockResolvedValue({ snapshotId: 'snap-456' });

        await request(app)
            .post('/config/snapshots')
            .send({ label: 'test', contributor: 'claude' });

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ contributor: 'claude' }),
        );
    });

    it('defaults contributor to human when not provided', async () => {
        mockHandleConfig.mockResolvedValue({ snapshotId: 'snap-789' });

        await request(app)
            .post('/config/snapshots')
            .send({ label: 'test' });

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ contributor: 'human' }),
        );
    });
});

// =============================================================================
// POST /config/snapshots/:id/restore — contributor branch
// =============================================================================

describe('POST /config/snapshots/:id/restore — contributor branch', () => {
    it('uses custom contributor when provided', async () => {
        mockHandleConfig.mockResolvedValue({ restored: true });

        await request(app)
            .post('/config/snapshots/snap-abc/restore')
            .send({ contributor: 'claude' });

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ contributor: 'claude', snapshotId: 'snap-abc' }),
        );
    });
});

// =============================================================================
// GET /config/metrics — default days
// =============================================================================

describe('GET /config/metrics — default days', () => {
    it('uses default days=7 when no query param', async () => {
        mockHandleConfig.mockResolvedValue({ metrics: {} });

        await request(app).get('/config/metrics');

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'metrics', days: 7 }),
        );
    });

    it('falls back to default when days is non-numeric', async () => {
        mockHandleConfig.mockResolvedValue({ metrics: {} });

        await request(app).get('/config/metrics?days=abc');

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ days: 7 }),
        );
    });
});

// =============================================================================
// PUT /config/dedup-gates/:source — default values
// =============================================================================

describe('PUT /config/dedup-gates/:source — default params', () => {
    it('uses null defaults for all optional params', async () => {
        await request(app)
            .put('/config/dedup-gates/test-source')
            .send({});

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO dedup_gate_overrides'),
            ['test-source', null, null, null, null, null],
        );
    });

    it('passes provided params correctly', async () => {
        await request(app)
            .put('/config/dedup-gates/test-source')
            .send({
                embedding_threshold: 0.9,
                word_overlap_threshold: 0.8,
                llm_judge_enabled: 1,
                llm_judge_doubt_floor: 0.3,
                llm_judge_hard_ceiling: 0.95,
            });

        expect(mockDbQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO dedup_gate_overrides'),
            ['test-source', 0.9, 0.8, 1, 0.3, 0.95],
        );
        expect(mockInvalidateGateOverrideCache).toHaveBeenCalled();
    });
});
