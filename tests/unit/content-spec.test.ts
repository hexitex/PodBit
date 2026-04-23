/**
 * Unit tests for core/content-spec.ts — post-generation structural coherence gate.
 *
 * Covers:
 *  - JSON parsing (with and without markdown fences, malformed payloads)
 *  - Degenerate-field detection (short strings, filler phrases, empty values)
 *  - minValidFields gating (strict vs permissive thresholds)
 *  - gateSynthesisBirth / gateResearchSeed feature-flag short-circuits
 *  - readContentSpecFromMetadata (string JSON, parsed object, malformed input)
 *  - Pre-specced detection at the lab stage boundary
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ── Mocks ──────────────────────────────────────────────────────────────

const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>();
const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('prompt');

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));
jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

const configStore: any = {
    contentSpec: {
        enabled: true,
        birthEnabled: true,
        researchEnabled: true,
        trustPreSpecced: true,
        minValidFields: 3,
    },
};
jest.unstable_mockModule('../../config.js', () => ({
    config: configStore,
}));

const {
    extractContentSpecFromSynthesis,
    extractContentSpecFromResearch,
    gateSynthesisBirth,
    gateResearchSeed,
    readContentSpecFromMetadata,
} = await import('../../core/content-spec.js');

beforeEach(() => {
    mockCallSubsystemModel.mockReset();
    mockGetPrompt.mockClear();
    configStore.contentSpec = {
        enabled: true,
        birthEnabled: true,
        researchEnabled: true,
        trustPreSpecced: true,
        minValidFields: 3,
    };
});

// ── extractContentSpecFromSynthesis ────────────────────────────────────

describe('extractContentSpecFromSynthesis', () => {
    it('returns a valid spec when all four fields are populated', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: 'Hessian trace via finite-difference curvature',
            prediction: 'summed lambda_i drops ~15% when switching Adam→AdamW',
            falsifiability: 'no lambda_i reduction or SAM gain uncorrelated with lambda_i',
            novelty: 'links optimizer decoupling to SAM via measurable curvature',
        }));

        const spec = await extractContentSpecFromSynthesis('synth prose', ['parent A', 'parent B']);

        expect(spec).not.toBeNull();
        expect(spec!.valid).toBe(true);
        expect(spec!.emptyFields).toEqual([]);
        expect(spec!.source).toBe('synthesis');
        expect(spec!.mechanism).toContain('Hessian');
    });

    it('marks spec invalid when too many fields are empty', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: 'Berry phase',
            prediction: '',
            falsifiability: '',
            novelty: '',
        }));

        const spec = await extractContentSpecFromSynthesis('prose', []);

        expect(spec!.valid).toBe(false);
        expect(spec!.emptyFields.sort()).toEqual(['falsifiability', 'novelty', 'prediction']);
    });

    it('flags degenerate filler as empty (short strings, placeholder verbs)', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: 'N/A',                               // degenerate — placeholder token
            prediction: 'it would be observable',           // degenerate — vague might/would
            falsifiability: 'further research is needed',   // degenerate — future-research stall
            novelty: 'bridges the two parents via a shared mechanism of coupled dynamics',
        }));

        const spec = await extractContentSpecFromSynthesis('prose', []);

        expect(spec!.emptyFields).toContain('mechanism');
        expect(spec!.emptyFields).toContain('prediction');
        expect(spec!.emptyFields).toContain('falsifiability');
        expect(spec!.emptyFields).not.toContain('novelty');
        expect(spec!.valid).toBe(false);
    });

    it('strips markdown code fences before parsing JSON', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(
            '```json\n{"mechanism":"BCS gap equation","prediction":"Tc depends on DOS at Fermi level","falsifiability":"Tc unchanged by DOS variation","novelty":"applies BCS to exciton system"}\n```'
        );

        const spec = await extractContentSpecFromSynthesis('prose', []);

        expect(spec).not.toBeNull();
        expect(spec!.mechanism).toBe('BCS gap equation');
        expect(spec!.valid).toBe(true);
    });

    it('returns null when LLM output is unparseable', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce('this is not json at all');

        const spec = await extractContentSpecFromSynthesis('prose', []);

        expect(spec).toBeNull();
    });

    it('returns null when feature is disabled', async () => {
        configStore.contentSpec.enabled = false;

        const spec = await extractContentSpecFromSynthesis('prose', []);

        expect(spec).toBeNull();
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('respects a higher minValidFields threshold (strict mode)', async () => {
        configStore.contentSpec.minValidFields = 4;
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: 'named thing',
            prediction: 'measurable outcome with direction',
            falsifiability: 'what would disprove this claim',
            novelty: '',  // one empty
        }));

        const spec = await extractContentSpecFromSynthesis('prose', []);

        expect(spec!.valid).toBe(false); // 3 of 4 not enough when strict
    });

    it('returns null when LLM call throws', async () => {
        mockCallSubsystemModel.mockRejectedValueOnce(new Error('network fail'));

        const spec = await extractContentSpecFromSynthesis('prose', []);

        expect(spec).toBeNull();
    });
});

// ── extractContentSpecFromResearch ─────────────────────────────────────

describe('extractContentSpecFromResearch', () => {
    it('returns a valid spec with source=research', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: 'permutation group method of Rhin and Viola',
            prediction: 'irrationality measure of zeta(3) bounded above by 5.513',
            falsifiability: 'counter-example with lower bound would refute',
            novelty: 'provides a concrete irrationality bound',
        }));

        const spec = await extractContentSpecFromResearch('fact prose', 'numerical-analysis');

        expect(spec!.source).toBe('research');
        expect(spec!.valid).toBe(true);
    });

    it('marks bare-citation style facts as degenerate', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: '',
            prediction: '',
            falsifiability: '',
            novelty: '',
        }));

        const spec = await extractContentSpecFromResearch('Smith 2001 published a paper', 'domain');

        expect(spec!.valid).toBe(false);
        expect(spec!.emptyFields).toHaveLength(4);
    });

    it('returns null when researchEnabled is off', async () => {
        configStore.contentSpec.researchEnabled = false;
        const spec = await extractContentSpecFromResearch('fact', 'domain');
        expect(spec).toBeNull();
    });
});

// ── gateSynthesisBirth ─────────────────────────────────────────────────

describe('gateSynthesisBirth', () => {
    it('no-op when master toggle is off', async () => {
        configStore.contentSpec.enabled = false;
        const r = await gateSynthesisBirth('content', ['p1', 'p2']);
        expect(r.rejected).toBe(false);
        expect(r.spec).toBeNull();
        expect(r.metadataMerge).toEqual({});
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('no-op when birthEnabled is off', async () => {
        configStore.contentSpec.birthEnabled = false;
        const r = await gateSynthesisBirth('content', ['p1']);
        expect(r.rejected).toBe(false);
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('rejects when spec is degenerate', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: '',
            prediction: '',
            falsifiability: '',
            novelty: 'adds a vague connection',
        }));
        const r = await gateSynthesisBirth('content', ['p1']);
        expect(r.rejected).toBe(true);
        expect(r.reason).toContain('mechanism');
        expect(r.metadataMerge).toEqual({});
    });

    it('passes and attaches metadata when spec is valid', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: 'named equation X',
            prediction: 'measurable Y drops by 15 percent',
            falsifiability: 'observing Y unchanged refutes the claim',
            novelty: 'applies X to a new domain',
        }));
        const r = await gateSynthesisBirth('content', ['p1', 'p2']);
        expect(r.rejected).toBe(false);
        expect(r.metadataMerge).toHaveProperty('metadata.contentSpec');
        expect((r.metadataMerge as any).metadata.contentSpec.valid).toBe(true);
    });

    it('passes through when extraction itself fails (LLM error)', async () => {
        mockCallSubsystemModel.mockRejectedValueOnce(new Error('timeout'));
        const r = await gateSynthesisBirth('content', ['p1']);
        // Null spec → no rejection, no metadata → synthesis continues as before.
        expect(r.rejected).toBe(false);
        expect(r.spec).toBeNull();
        expect(r.metadataMerge).toEqual({});
    });
});

// ── gateResearchSeed ───────────────────────────────────────────────────

describe('gateResearchSeed', () => {
    it('rejects a bare-citation seed', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: '',
            prediction: '',
            falsifiability: '',
            novelty: '',
        }));
        const r = await gateResearchSeed('Smith 2001 published a paper', 'domain');
        expect(r.rejected).toBe(true);
    });

    it('passes a substantive claim', async () => {
        mockCallSubsystemModel.mockResolvedValueOnce(JSON.stringify({
            mechanism: 'named formula',
            prediction: 'bounded above by 5.513',
            falsifiability: 'a tighter counter-example refutes',
            novelty: 'concrete quantitative bound',
        }));
        const r = await gateResearchSeed('substantive fact', 'domain');
        expect(r.rejected).toBe(false);
        expect((r.metadataMerge as any).metadata.contentSpec.source).toBe('research');
    });
});

// ── readContentSpecFromMetadata ────────────────────────────────────────

describe('readContentSpecFromMetadata', () => {
    it('parses a JSON string metadata column', () => {
        const json = JSON.stringify({
            contentSpec: {
                mechanism: 'mech',
                prediction: 'pred',
                falsifiability: 'fals',
                novelty: 'nov',
                valid: true,
                emptyFields: [],
                extractedAt: '2026-04-22T00:00:00Z',
                source: 'synthesis',
            },
        });
        const cs = readContentSpecFromMetadata(json);
        expect(cs).not.toBeNull();
        expect(cs!.valid).toBe(true);
        expect(cs!.source).toBe('synthesis');
    });

    it('reads an already-parsed object', () => {
        const obj = {
            contentSpec: {
                mechanism: 'x', prediction: 'y', falsifiability: 'z', novelty: 'w',
                valid: false, emptyFields: ['novelty'], extractedAt: '', source: 'research',
            },
        };
        const cs = readContentSpecFromMetadata(obj);
        expect(cs!.valid).toBe(false);
        expect(cs!.source).toBe('research');
    });

    it('returns null for missing metadata', () => {
        expect(readContentSpecFromMetadata(null)).toBeNull();
        expect(readContentSpecFromMetadata(undefined)).toBeNull();
        expect(readContentSpecFromMetadata('')).toBeNull();
    });

    it('returns null for metadata without contentSpec key', () => {
        expect(readContentSpecFromMetadata('{"otherField": 1}')).toBeNull();
        expect(readContentSpecFromMetadata({ otherField: 1 })).toBeNull();
    });

    it('returns null for malformed JSON strings', () => {
        expect(readContentSpecFromMetadata('{not json')).toBeNull();
    });

    it('coerces unknown source to synthesis', () => {
        const obj = { contentSpec: { mechanism: 'x', prediction: '', falsifiability: '', novelty: '', valid: false, source: 'banana' } };
        const cs = readContentSpecFromMetadata(obj);
        expect(cs!.source).toBe('synthesis');
    });
});
