/**
 * Unit tests for core/cycles/starters.ts — startAutoratingCycle.
 *
 * The autorating cycle has custom loop logic (not using runCycleLoop),
 * so it needs separate testing: state management, batch processing,
 * error handling, AbortError, sleep-on-drain, and shouldStop guard.
 *
 * Mocks: config.js, synthesis-engine.js, event-bus.js, autorating.js, and other cycle modules.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockRunCycleLoop = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ success: true });
const mockEmitActivity = jest.fn();
const mockRunAutoratingBatch = jest.fn<() => Promise<number>>().mockResolvedValue(0);

function makeCycleState() {
    return {
        running: false,
        shouldStop: false,
        cycleCount: 0,
        errorCount: 0,
        startedAt: null as string | null,
        lastCycleAt: null as string | null,
        lastError: null as string | null,
    };
}

const mockCycleStates: Record<string, ReturnType<typeof makeCycleState>> = {
    validation: makeCycleState(),
    questions: makeCycleState(),
    tensions: makeCycleState(),
    research: makeCycleState(),
    autorating: makeCycleState(),
    evm: makeCycleState(),
    voicing: makeCycleState(),
};

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        autonomousCycles: {
            validation: { intervalMs: 1000 },
            questions: { intervalMs: 1000 },
            tensions: { intervalMs: 1000 },
            research: { intervalMs: 1000 },
            autorating: { intervalMs: 50 }, // short for tests
            evm: { intervalMs: 1000 },
            voicing: { intervalMs: 1000 },
        },
    },
}));

jest.unstable_mockModule('../../core/synthesis-engine.js', () => ({
    runCycleLoop: mockRunCycleLoop,
    cycleStates: mockCycleStates,
}));

jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8),
    emitActivity: mockEmitActivity,
}));

jest.unstable_mockModule('../../core/cycles/validation.js', () => ({
    runValidationCycleSingle: jest.fn(),
}));
jest.unstable_mockModule('../../core/cycles/questions.js', () => ({
    runQuestionCycleSingle: jest.fn(),
}));
jest.unstable_mockModule('../../core/cycles/tensions.js', () => ({
    runTensionCycleSingle: jest.fn(),
}));
jest.unstable_mockModule('../../core/cycles/research.js', () => ({
    runResearchCycleSingle: jest.fn(),
}));
jest.unstable_mockModule('../../core/cycles/autorating.js', () => ({
    runAutoratingBatch: mockRunAutoratingBatch,
}));
jest.unstable_mockModule('../../core/cycles/evm.js', () => ({
    runEvmCycleSingle: jest.fn(),
}));
jest.unstable_mockModule('../../core/cycles/voicing.js', () => ({
    runVoicingCycleSingle: jest.fn(),
}));

const { startAutoratingCycle } = await import('../../core/cycles/starters.js');

beforeEach(() => {
    jest.clearAllMocks();
    for (const key of Object.keys(mockCycleStates)) {
        Object.assign(mockCycleStates[key], makeCycleState());
    }
    mockRunAutoratingBatch.mockResolvedValue(0);
});

describe('startAutoratingCycle', () => {
    it('returns success when not already running', async () => {
        const result = await startAutoratingCycle(1);
        expect(result.success).toBe(true);
        expect(result.message).toContain('started');
    });

    it('returns failure when already running', async () => {
        mockCycleStates.autorating.running = true;
        const result = await startAutoratingCycle();
        expect(result.success).toBe(false);
        expect(result.message).toContain('already running');
    });

    it('sets running state to true when started', async () => {
        mockRunAutoratingBatch.mockImplementation(async () => {
            // Verify state while inside the loop
            expect(mockCycleStates.autorating.running).toBe(true);
            expect(mockCycleStates.autorating.startedAt).not.toBeNull();
            return 0;
        });

        await startAutoratingCycle(1);
        // Wait for the background loop
        await new Promise(r => setTimeout(r, 200));
    });

    it('resets running state after loop completes', async () => {
        mockRunAutoratingBatch.mockResolvedValue(0);
        await startAutoratingCycle(1);
        // Wait for the loop + setTimeout to complete
        await new Promise(r => setTimeout(r, 300));
        expect(mockCycleStates.autorating.running).toBe(false);
        expect(mockCycleStates.autorating.shouldStop).toBe(false);
    });

    it('increments cycleCount with max(1, processed)', async () => {
        mockRunAutoratingBatch.mockResolvedValueOnce(5);
        await startAutoratingCycle(5);
        await new Promise(r => setTimeout(r, 200));
        expect(mockCycleStates.autorating.cycleCount).toBeGreaterThanOrEqual(5);
    });

    it('records errors without crashing', async () => {
        mockRunAutoratingBatch.mockRejectedValueOnce(new Error('batch failed'));
        await startAutoratingCycle(1);
        await new Promise(r => setTimeout(r, 300));
        expect(mockCycleStates.autorating.errorCount).toBeGreaterThanOrEqual(1);
    });

    it('clears lastError after a successful batch', async () => {
        // First call fails, second succeeds
        mockRunAutoratingBatch
            .mockRejectedValueOnce(new Error('fail'))
            .mockResolvedValueOnce(0);
        await startAutoratingCycle(2);
        await new Promise(r => setTimeout(r, 300));
        expect(mockCycleStates.autorating.lastError).toBeNull();
    });

    it('stops on AbortError (project switch)', async () => {
        const abortErr = new Error('abort');
        abortErr.name = 'AbortError';
        mockRunAutoratingBatch.mockRejectedValueOnce(abortErr);
        await startAutoratingCycle(10);
        await new Promise(r => setTimeout(r, 200));
        // Should have called batch only once
        expect(mockRunAutoratingBatch).toHaveBeenCalledTimes(1);
    });

    it('respects shouldStop flag', async () => {
        let callCount = 0;
        mockRunAutoratingBatch.mockImplementation(async () => {
            callCount++;
            if (callCount === 1) {
                mockCycleStates.autorating.shouldStop = true;
            }
            return 0;
        });
        await startAutoratingCycle(100);
        await new Promise(r => setTimeout(r, 300));
        // Should stop after shouldStop is set
        expect(callCount).toBeLessThanOrEqual(2);
    });

    it('emits activity events for start and stop', async () => {
        mockRunAutoratingBatch.mockResolvedValueOnce(0);
        await startAutoratingCycle(1);
        await new Promise(r => setTimeout(r, 300));

        const calls = mockEmitActivity.mock.calls;
        const startCall = calls.find((c: any) => c[1] === 'autorating_start');
        const stopCall = calls.find((c: any) => c[1] === 'autorating_stop');
        expect(startCall).toBeDefined();
        expect(stopCall).toBeDefined();
    });

    it('emits autorating_error event on batch error', async () => {
        mockRunAutoratingBatch
            .mockRejectedValueOnce(new Error('db error'))
            .mockResolvedValueOnce(0);
        await startAutoratingCycle(2);
        await new Promise(r => setTimeout(r, 300));

        const errorCall = mockEmitActivity.mock.calls.find((c: any) => c[1] === 'autorating_error');
        expect(errorCall).toBeDefined();
    });

    it('does not call runCycleLoop (uses custom loop)', async () => {
        await startAutoratingCycle(1);
        await new Promise(r => setTimeout(r, 200));
        // runCycleLoop should NOT be called for autorating
        expect(mockRunCycleLoop).not.toHaveBeenCalled();
    });

    it('updates lastCycleAt after each batch', async () => {
        mockRunAutoratingBatch.mockResolvedValueOnce(0);
        await startAutoratingCycle(1);
        await new Promise(r => setTimeout(r, 300));
        expect(mockCycleStates.autorating.lastCycleAt).not.toBeNull();
    });
});
