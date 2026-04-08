/**
 * Unit tests for core/cycles/starters.ts — cycle launcher functions.
 *
 * Each starter checks if already running, launches a background loop, returns immediately.
 * Mocks: config.js, synthesis-engine.js, event-bus.js, and all cycle implementations.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockRunCycleLoop = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue({ success: true });
const mockCycleStates: Record<string, any> = {
    validation: { running: false, shouldStop: false },
    questions: { running: false, shouldStop: false },
    tensions: { running: false, shouldStop: false },
    research: { running: false, shouldStop: false },
    autorating: { running: false, shouldStop: false, cycleCount: 0, errorCount: 0, startedAt: null, lastError: null, lastCycleAt: null },
    evm: { running: false, shouldStop: false },
    voicing: { running: false, shouldStop: false },
};

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        autonomousCycles: {
            validation: { intervalMs: 1000 },
            questions: { intervalMs: 1000 },
            tensions: { intervalMs: 1000 },
            research: { intervalMs: 1000 },
            autorating: { intervalMs: 1000, batchSize: 5, gracePeriodMinutes: 30 },
            evm: { intervalMs: 1000 },
            voicing: { intervalMs: 1000 },
        },
    },
}));
jest.unstable_mockModule('../../core/synthesis-engine.js', () => ({
    runCycleLoop: mockRunCycleLoop,
    cycleStates: mockCycleStates,
}));
jest.unstable_mockModule('../../services/event-bus.js', () => ({
    emitActivity: jest.fn(),
}));
jest.unstable_mockModule('../../core/cycles/validation.js', () => ({
    runValidationCycleSingle: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../core/cycles/questions.js', () => ({
    runQuestionCycleSingle: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../core/cycles/tensions.js', () => ({
    runTensionCycleSingle: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../core/cycles/research.js', () => ({
    runResearchCycleSingle: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../core/cycles/autorating.js', () => ({
    runAutoratingBatch: jest.fn().mockResolvedValue(0),
}));
jest.unstable_mockModule('../../core/cycles/evm.js', () => ({
    runEvmCycleSingle: jest.fn().mockResolvedValue(undefined),
}));
jest.unstable_mockModule('../../core/cycles/voicing.js', () => ({
    runVoicingCycleSingle: jest.fn().mockResolvedValue(undefined),
}));

const {
    startValidationCycle,
    startQuestionCycle,
    startTensionCycle,
    startResearchCycle,
    startEvmCycle,
    startVoicingCycle,
} = await import('../../core/cycles/starters.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockRunCycleLoop.mockResolvedValue({ success: true });
    // Reset all cycle states
    for (const key of Object.keys(mockCycleStates)) {
        mockCycleStates[key].running = false;
        mockCycleStates[key].shouldStop = false;
    }
});

const cycleFunctions = [
    { name: 'validation', fn: startValidationCycle, stateKey: 'validation' },
    { name: 'questions', fn: startQuestionCycle, stateKey: 'questions' },
    { name: 'tensions', fn: startTensionCycle, stateKey: 'tensions' },
    { name: 'research', fn: startResearchCycle, stateKey: 'research' },
    { name: 'evm', fn: startEvmCycle, stateKey: 'evm' },
    { name: 'voicing', fn: startVoicingCycle, stateKey: 'voicing' },
];

for (const { name, fn, stateKey } of cycleFunctions) {
    describe(`start${name.charAt(0).toUpperCase() + name.slice(1)}Cycle`, () => {
        it('returns success when not already running', async () => {
            const result = await fn();
            expect(result.success).toBe(true);
        });

        it('returns failure when already running', async () => {
            mockCycleStates[stateKey].running = true;

            const result = await fn();

            expect(result.success).toBe(false);
            expect(result.message).toContain('already running');
        });

        it('calls runCycleLoop with correct cycle name', async () => {
            await fn();

            expect(mockRunCycleLoop).toHaveBeenCalledWith(
                stateKey,
                expect.any(Function),
                expect.any(Number),
                expect.any(Number),
            );
        });

        it('passes maxCycles parameter', async () => {
            await fn(42);

            expect(mockRunCycleLoop).toHaveBeenCalledWith(
                stateKey,
                expect.any(Function),
                expect.any(Number),
                42,
            );
        });
    });
}
