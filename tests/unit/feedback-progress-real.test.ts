/**
 * Unit tests for evm/feedback-progress.ts — real module with mocked DB.
 */
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../core.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

const {
    _reevalProgress,
    _markDirty,
    getReevalProgress,
    resetReevalProgress,
} = await import('../../evm/feedback-progress.js');

beforeEach(async () => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    // Reset progress to idle state before each test
    await resetReevalProgress();
    jest.resetAllMocks(); // reset after resetReevalProgress's own query calls
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});

afterEach(() => {
    // Ensure fake timers are cleaned up
    jest.useRealTimers();
});

// =============================================================================
// getReevalProgress — in-memory state when running
// =============================================================================

describe('getReevalProgress', () => {
    it('returns in-memory state without DB query when status is running', async () => {
        _reevalProgress.status = 'running';
        _reevalProgress.total = 50;
        _reevalProgress.autoApproved = 10;

        const result = await getReevalProgress();

        expect(result.status).toBe('running');
        expect(result.total).toBe(50);
        expect(result.autoApproved).toBe(10);
        // Should NOT call queryOne when running (uses in-memory state)
        expect(mockQueryOne).not.toHaveBeenCalled();

        // Reset
        _reevalProgress.status = 'idle';
        _reevalProgress.total = 0;
        _reevalProgress.autoApproved = 0;
    });

    it('loads from DB when status is idle', async () => {
        mockQueryOne.mockResolvedValue({
            value: JSON.stringify({
                status: 'done',
                phase: 2,
                total: 100,
                autoApproved: 80,
                phase2Total: 20,
                phase2Processed: 20,
                phase2AutoApproved: 15,
                unchanged: 5,
                errors: 2,
                startedAt: '2024-01-01T00:00:00Z',
                finishedAt: '2024-01-01T01:00:00Z',
            }),
        });

        const result = await getReevalProgress();

        expect(result.status).toBe('done');
        expect(result.total).toBe(100);
        expect(result.autoApproved).toBe(80);
        expect(mockQueryOne).toHaveBeenCalled();
    });

    it('returns default idle state when DB has no row', async () => {
        mockQueryOne.mockResolvedValue(null);

        const result = await getReevalProgress();

        expect(result.status).toBe('idle');
        expect(result.total).toBe(0);
    });

    it('returns default idle state when DB query fails', async () => {
        mockQueryOne.mockRejectedValue(new Error('DB not ready'));

        const result = await getReevalProgress();

        expect(result.status).toBe('idle');
    });

    it('corrects interrupted run: DB running + not in-memory → marks as error', async () => {
        // In-memory status is idle (not running)
        // DB says running → interrupted by restart
        mockQueryOne.mockResolvedValue({
            value: JSON.stringify({
                status: 'running',
                phase: 1,
                total: 50,
                autoApproved: 25,
                phase2Total: 0,
                phase2Processed: 0,
                phase2AutoApproved: 0,
                unchanged: 0,
                errors: 0,
                startedAt: '2024-01-01T00:00:00Z',
                finishedAt: null,
            }),
        });

        const result = await getReevalProgress();

        expect(result.status).toBe('error');
        expect(result.errorMessage).toContain('Interrupted by server restart');
        expect(result.finishedAt).not.toBeNull();

        // Should persist the corrected status to DB
        expect(mockQuery).toHaveBeenCalled();
    });
});

// =============================================================================
// resetReevalProgress
// =============================================================================

describe('resetReevalProgress', () => {
    it('resets all progress fields to idle defaults', async () => {
        // Set non-zero values
        _reevalProgress.status = 'done';
        _reevalProgress.total = 100;
        _reevalProgress.phase = 2;
        _reevalProgress.autoApproved = 80;
        _reevalProgress.errors = 3;
        _reevalProgress.startedAt = '2024-01-01T00:00:00Z';
        _reevalProgress.finishedAt = '2024-01-01T01:00:00Z';
        _reevalProgress.errorMessage = 'something went wrong';

        await resetReevalProgress();

        expect(_reevalProgress.status).toBe('idle');
        expect(_reevalProgress.total).toBe(0);
        expect(_reevalProgress.phase).toBe(0);
        expect(_reevalProgress.autoApproved).toBe(0);
        expect(_reevalProgress.errors).toBe(0);
        expect(_reevalProgress.startedAt).toBeNull();
        expect(_reevalProgress.finishedAt).toBeNull();
        expect(_reevalProgress.errorMessage).toBeUndefined();
    });

    it('persists reset state to DB', async () => {
        await resetReevalProgress();

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('settings'),
            expect.arrayContaining(['evm.reeval_progress'])
        );
    });
});

// =============================================================================
// _markDirty — timer scheduling
// =============================================================================

describe('_markDirty', () => {
    it('schedules a flush timer that writes to DB when running', async () => {
        jest.useFakeTimers();
        _reevalProgress.status = 'running';

        _markDirty();

        // Advance past the 2s flush interval
        await jest.advanceTimersByTimeAsync(2100);

        expect(mockQuery).toHaveBeenCalled();

        // Reset state for cleanup
        _reevalProgress.status = 'idle';
        jest.useRealTimers();
    });

    it('stops timer when status changes to non-running', async () => {
        jest.useFakeTimers();
        _reevalProgress.status = 'running';
        _markDirty();

        // Advance to trigger first flush (while running)
        _reevalProgress.status = 'done'; // switch to done
        await jest.advanceTimersByTimeAsync(2100);

        // After the interval fires with status != 'running', timer should be cleared
        const callsAfterFirst = mockQuery.mock.calls.length;
        await jest.advanceTimersByTimeAsync(4000); // advance more — timer should be gone

        // Call count shouldn't increase after timer clears
        expect(mockQuery.mock.calls.length).toBe(callsAfterFirst);
        jest.useRealTimers();
    });
});
