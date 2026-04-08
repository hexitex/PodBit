/**
 * Unit tests for handlers/projects/bootstrap.ts —
 * bootstrapProject and generateBootstrapSeeds.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// =============================================================================
// Mocks for static imports
// =============================================================================

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetPrompt = jest.fn<() => Promise<string>>().mockResolvedValue('Bootstrap prompt text');

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
}));

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

// =============================================================================
// Mocks for dynamic imports inside functions
// =============================================================================

const mockHandlePartitions = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });

jest.unstable_mockModule('../../handlers/governance.js', () => ({
    handlePartitions: mockHandlePartitions,
}));

const mockCallSubsystemModel = jest.fn<() => Promise<string>>().mockResolvedValue('');

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

const mockHandlePropose = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });

jest.unstable_mockModule('../../handlers/graph.js', () => ({
    handlePropose: mockHandlePropose,
}));

const { bootstrapProject, generateBootstrapSeeds } =
    await import('../../handlers/projects/bootstrap.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetPrompt.mockResolvedValue('Bootstrap prompt text');
    mockHandlePartitions.mockResolvedValue({ success: true });
    mockCallSubsystemModel.mockResolvedValue('');
    mockHandlePropose.mockResolvedValue({ success: true });
});

// =============================================================================
// bootstrapProject — settings storage
// =============================================================================

describe('bootstrapProject — settings storage', () => {
    it('returns zero counts when no domains are provided', async () => {
        const result = await bootstrapProject({ name: 'test' });
        expect(result).toEqual({ partitions: 0, bridges: 0, seeded: 0 });
    });

    it('returns zero counts when domains array is empty', async () => {
        const result = await bootstrapProject({ name: 'test', domains: [] });
        expect(result).toEqual({ partitions: 0, bridges: 0, seeded: 0 });
    });

    it('stores purpose in settings when provided', async () => {
        await bootstrapProject({ name: 'test', purpose: 'My project purpose' });

        const purposeCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("'project.purpose'")
        );
        expect(purposeCall).toBeDefined();
        expect(purposeCall[1]).toContain('My project purpose');
    });

    it('does not store purpose when not provided', async () => {
        await bootstrapProject({ name: 'test' });

        const purposeCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("'project.purpose'")
        );
        expect(purposeCall).toBeUndefined();
    });

    it('stores goals in settings when provided', async () => {
        const goals = ['goal one', 'goal two'];
        await bootstrapProject({ name: 'test', goals });

        const goalsCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("'project.goals'")
        );
        expect(goalsCall).toBeDefined();
        expect(JSON.parse(goalsCall[1][0])).toEqual(goals);
    });

    it('stores autoBridge=true in settings', async () => {
        await bootstrapProject({ name: 'test', autoBridge: true });

        const abCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("'project.autoBridge'")
        );
        expect(abCall).toBeDefined();
        expect(abCall[1]).toContain('true');
    });

    it('stores autoBridge=false in settings', async () => {
        await bootstrapProject({ name: 'test', autoBridge: false });

        const abCall = (mockQuery.mock.calls as any[]).find(([sql]) =>
            String(sql).includes("'project.autoBridge'")
        );
        expect(abCall).toBeDefined();
        expect(abCall[1]).toContain('false');
    });

});

// =============================================================================
// bootstrapProject — partition creation
// =============================================================================

describe('bootstrapProject — partition creation', () => {
    it('creates a partition for each domain', async () => {
        mockCallSubsystemModel.mockResolvedValue(''); // no seeds

        const result = await bootstrapProject({
            name: 'test',
            domains: ['science', 'math'],
        });

        expect(result.partitions).toBe(2);
        expect(mockHandlePartitions).toHaveBeenCalledWith(expect.objectContaining({
            action: 'create',
            id: 'science',
            domains: ['science'],
        }));
        expect(mockHandlePartitions).toHaveBeenCalledWith(expect.objectContaining({
            action: 'create',
            id: 'math',
            domains: ['math'],
        }));
    });

    it('converts domain names with spaces to lowercase hyphen IDs', async () => {
        mockCallSubsystemModel.mockResolvedValue('');

        await bootstrapProject({ name: 'test', domains: ['Data Science'] });

        expect(mockHandlePartitions).toHaveBeenCalledWith(expect.objectContaining({
            action: 'create',
            id: 'data-science',
        }));
    });

    it('handles partition creation errors gracefully and still counts successes', async () => {
        mockCallSubsystemModel.mockResolvedValue('');
        mockHandlePartitions
            .mockResolvedValueOnce({ success: true })  // 'science' succeeds
            .mockRejectedValueOnce(new Error('Duplicate')) // 'math' fails
            .mockResolvedValue({ success: true });     // createBridge if any

        const result = await bootstrapProject({
            name: 'test',
            domains: ['science', 'math'],
        });

        expect(result.partitions).toBe(1);
    });

    it('includes purpose in partition description when provided', async () => {
        mockCallSubsystemModel.mockResolvedValue('');

        await bootstrapProject({ name: 'test', purpose: 'test purpose', domains: ['physics'] });

        expect(mockHandlePartitions).toHaveBeenCalledWith(expect.objectContaining({
            description: expect.stringContaining('test purpose'),
        }));
    });
});

// =============================================================================
// bootstrapProject — bridge creation
// =============================================================================

describe('bootstrapProject — bridge creation', () => {
    it('creates bridges between specified domain pairs', async () => {
        mockCallSubsystemModel.mockResolvedValue('');

        const result = await bootstrapProject({
            name: 'test',
            domains: ['science', 'math'],
            bridges: [['science', 'math']],
        });

        expect(result.bridges).toBe(1);
        expect(mockHandlePartitions).toHaveBeenCalledWith(expect.objectContaining({
            action: 'createBridge',
            id: 'science',
            targetPartitionId: 'math',
        }));
    });

    it('handles bridge creation errors gracefully', async () => {
        mockCallSubsystemModel.mockResolvedValue('');

        // First 2 calls are partition creates; bridge create fails
        mockHandlePartitions
            .mockResolvedValueOnce({ success: true }) // science partition
            .mockResolvedValueOnce({ success: true }) // math partition
            .mockRejectedValueOnce(new Error('Bridge error')); // bridge fails

        const result = await bootstrapProject({
            name: 'test',
            domains: ['science', 'math'],
            bridges: [['science', 'math']],
        });

        expect(result.bridges).toBe(0); // bridge failed
        expect(result.partitions).toBe(2); // partitions succeeded
    });

    it('returns zero bridges when none are specified', async () => {
        mockCallSubsystemModel.mockResolvedValue('');

        const result = await bootstrapProject({
            name: 'test',
            domains: ['science'],
        });

        expect(result.bridges).toBe(0);
    });
});

// =============================================================================
// bootstrapProject — seed generation integration
// =============================================================================

describe('bootstrapProject — seed generation', () => {
    it('does not call generateBootstrapSeeds when purpose is absent', async () => {
        const result = await bootstrapProject({
            name: 'test',
            domains: ['science'],
        });

        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
        expect(result.seeded).toBe(0);
    });

    it('calls seed generation when purpose is provided', async () => {
        mockCallSubsystemModel.mockResolvedValue('[science] This is a foundational concept about science.');
        mockHandlePropose.mockResolvedValue({ success: true });

        const result = await bootstrapProject({
            name: 'test',
            purpose: 'Study science',
            domains: ['science'],
        });

        expect(mockCallSubsystemModel).toHaveBeenCalled();
        expect(result.seeded).toBe(1);
    });
});

// =============================================================================
// generateBootstrapSeeds
// =============================================================================

describe('generateBootstrapSeeds', () => {
    it('returns 0 when LLM call throws', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM unavailable'));

        const count = await generateBootstrapSeeds('test purpose', ['science']);

        expect(count).toBe(0);
        expect(mockHandlePropose).not.toHaveBeenCalled();
    });

    it('returns 0 when LLM response has no [domain] lines', async () => {
        mockCallSubsystemModel.mockResolvedValue('No bracket lines here\nJust plain text');

        const count = await generateBootstrapSeeds('test purpose', ['science']);

        expect(count).toBe(0);
    });

    it('parses [domain] prefix lines and proposes seeds', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '[science] A foundational fact about the nature of scientific inquiry.\n' +
            '[math] Mathematics provides the formal language for quantitative reasoning.'
        );

        const count = await generateBootstrapSeeds('test purpose', ['science', 'math']);

        expect(count).toBe(2);
        expect(mockHandlePropose).toHaveBeenCalledTimes(2);
    });

    it('skips lines whose domain is not in the provided domains list', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '[science] A valid seed about scientific methods and empirical observation.\n' +
            '[unknown_domain] This domain is not in the list and should be skipped.'
        );

        const count = await generateBootstrapSeeds('test purpose', ['science']);

        expect(count).toBe(1);
    });

    it('skips content shorter than 20 characters', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '[science] Too short.\n' +  // < 20 chars
            '[science] This is long enough content to pass the minimum length check.'
        );

        const count = await generateBootstrapSeeds('test purpose', ['science']);

        expect(count).toBe(1);
    });

    it('proposes seeds with correct node type, domain, and contributor', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '[science] A comprehensive seed about scientific methodology and inquiry.'
        );

        await generateBootstrapSeeds('test purpose', ['science']);

        expect(mockHandlePropose).toHaveBeenCalledWith(expect.objectContaining({
            nodeType: 'seed',
            domain: 'science',
            contributor: 'bootstrap',
        }));
    });

    it('only counts proposals that return success: true', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '[science] First successful seed about empirical scientific observation.\n' +
            '[math] Second seed about formal mathematical reasoning and proof theory.'
        );
        mockHandlePropose
            .mockResolvedValueOnce({ success: true })
            .mockResolvedValueOnce({ success: false });

        const count = await generateBootstrapSeeds('test purpose', ['science', 'math']);

        expect(count).toBe(1);
    });

    it('handles handlePropose throwing gracefully', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '[science] A seed that will cause a proposal error when processed.\n' +
            '[math] A seed that will succeed and be counted in the total.'
        );
        mockHandlePropose
            .mockRejectedValueOnce(new Error('DB error'))
            .mockResolvedValueOnce({ success: true });

        const count = await generateBootstrapSeeds('test purpose', ['science', 'math']);

        expect(count).toBe(1); // second seed succeeds
    });

    it('calls getPrompt with bootstrap_seeds key and interpolation data', async () => {
        mockCallSubsystemModel.mockResolvedValue('');

        await generateBootstrapSeeds('My purpose', ['alpha', 'beta'], ['goal 1']);

        expect(mockGetPrompt).toHaveBeenCalledWith('project.bootstrap_seeds', expect.objectContaining({
            purpose: 'My purpose',
            domainList: 'alpha, beta',
        }));
    });

    it('includes goals text in prompt interpolation when goals are provided', async () => {
        mockCallSubsystemModel.mockResolvedValue('');

        await generateBootstrapSeeds('My purpose', ['science'], ['goal A', 'goal B']);

        const [, args] = mockGetPrompt.mock.calls[0] as any[];
        expect(args.goalsText).toContain('goal A');
        expect(args.goalsText).toContain('goal B');
    });

    it('passes empty goalsText when no goals are provided', async () => {
        mockCallSubsystemModel.mockResolvedValue('');

        await generateBootstrapSeeds('My purpose', ['science']);

        const [, args] = mockGetPrompt.mock.calls[0] as any[];
        expect(args.goalsText).toBe('');
    });

    it('does case-insensitive domain matching', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '[SCIENCE] A valid seed about empirical observation and the scientific method.'
        );

        const count = await generateBootstrapSeeds('test purpose', ['science']);

        expect(count).toBe(1);
    });

    it('matches domains with hyphen/underscore/space equivalence', async () => {
        mockCallSubsystemModel.mockResolvedValue(
            '[data science] A valid seed about data analysis and machine learning methods.'
        );

        const count = await generateBootstrapSeeds('test purpose', ['data-science']);

        expect(count).toBe(1);
    });
});
