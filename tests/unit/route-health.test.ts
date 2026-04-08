/**
 * Unit tests for routes/health.ts —
 * GET /health, GET /diagnostics/db, POST /diagnostics/db/reset
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockHealthCheck = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockGetDbDiagnostics = jest.fn<() => any>().mockReturnValue({
    stats: {
        totalReads: 100,
        totalWrites: 50,
        slowCount: 2,
        contentionEvents: 1,
        p99Ms: 45,
    },
    activeOps: [],
});
const mockResetDbDiagnostics = jest.fn<() => void>();

jest.unstable_mockModule('../../db.js', () => ({
    healthCheck: mockHealthCheck,
    getDbDiagnostics: mockGetDbDiagnostics,
    resetDbDiagnostics: mockResetDbDiagnostics,
}));

const healthRouter = (await import('../../routes/health.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(healthRouter);

beforeEach(() => {
    jest.resetAllMocks();
    mockHealthCheck.mockResolvedValue(true);
    mockGetDbDiagnostics.mockReturnValue({
        stats: {
            totalReads: 100,
            totalWrites: 50,
            slowCount: 2,
            contentionEvents: 1,
            p99Ms: 45,
        },
        activeOps: [],
    });
});

// =============================================================================
// GET /health
// =============================================================================

describe('GET /health', () => {
    it('returns status=healthy when DB is ok', async () => {
        mockHealthCheck.mockResolvedValue(true);

        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('healthy');
        expect(res.body.database).toBe('connected');
    });

    it('returns status=degraded when DB is down', async () => {
        mockHealthCheck.mockResolvedValue(false);

        const res = await request(app).get('/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('degraded');
        expect(res.body.database).toBe('disconnected');
    });

    it('includes db_stats with query and mutation counts', async () => {
        const res = await request(app).get('/health');

        expect(res.body.db_stats.queries).toBe(100);
        expect(res.body.db_stats.mutations).toBe(50);
        expect(res.body.db_stats.slow).toBe(2);
        expect(res.body.db_stats.contention).toBe(1);
        expect(res.body.db_stats.p99_ms).toBe(45);
    });

    it('includes timestamp and uptime', async () => {
        const res = await request(app).get('/health');

        expect(res.body.timestamp).toBeDefined();
        expect(typeof res.body.uptime).toBe('number');
    });

    it('includes active operations count from diagnostics', async () => {
        mockGetDbDiagnostics.mockReturnValue({
            stats: { totalReads: 0, totalWrites: 0, slowCount: 0, contentionEvents: 0, p99Ms: 0 },
            activeOps: [{ id: 'op1' }, { id: 'op2' }],
        });

        const res = await request(app).get('/health');

        expect(res.body.db_stats.active).toBe(2);
    });
});

// =============================================================================
// GET /diagnostics/db
// =============================================================================

describe('GET /diagnostics/db', () => {
    it('returns full diagnostics object', async () => {
        const diagnostics = {
            stats: { totalReads: 200, totalWrites: 75, slowCount: 5, contentionEvents: 3, p99Ms: 120 },
            activeOps: [{ id: 'op1', query: 'SELECT ...', startMs: 1000 }],
        };
        mockGetDbDiagnostics.mockReturnValue(diagnostics);

        const res = await request(app).get('/diagnostics/db');

        expect(res.status).toBe(200);
        expect(res.body.stats.totalReads).toBe(200);
        expect(res.body.activeOps).toHaveLength(1);
    });
});

// =============================================================================
// POST /diagnostics/db/reset
// =============================================================================

describe('POST /diagnostics/db/reset', () => {
    it('calls resetDbDiagnostics and returns reset=true', async () => {
        const res = await request(app).post('/diagnostics/db/reset');

        expect(res.status).toBe(200);
        expect(res.body.reset).toBe(true);
        expect(res.body.timestamp).toBeDefined();
        expect(mockResetDbDiagnostics).toHaveBeenCalled();
    });
});
