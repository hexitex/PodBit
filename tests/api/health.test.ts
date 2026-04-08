/**
 * API tests for routes/health.ts
 *
 * Tests: GET /health, GET /diagnostics/db, POST /diagnostics/db/reset
 */
import { jest, describe, it, expect } from '@jest/globals';

const mockHealthCheck = jest.fn<() => Promise<boolean>>().mockResolvedValue(true);
const mockGetDbDiagnostics = jest.fn<() => any>().mockReturnValue({
    stats: {
        totalReads: 100,
        totalWrites: 50,
        slowCount: 2,
        contentionEvents: 0,
        p99Ms: 15,
    },
    activeOps: [],
});
const mockResetDbDiagnostics = jest.fn<() => void>();

jest.unstable_mockModule('../../db.js', () => ({
    healthCheck: mockHealthCheck,
    getDbDiagnostics: mockGetDbDiagnostics,
    resetDbDiagnostics: mockResetDbDiagnostics,
    query: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    queryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    systemQuery: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: healthRouter } = await import('../../routes/health.js');

/** Express app with health router. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', healthRouter);
    return app;
}

// =============================================================================
// GET /health
// =============================================================================

describe('GET /health', () => {
    it('returns healthy status when DB is connected', async () => {
        mockHealthCheck.mockResolvedValue(true);
        const res = await request(buildApp()).get('/health');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('healthy');
        expect(res.body.database).toBe('connected');
    });

    it('returns degraded when DB is down', async () => {
        mockHealthCheck.mockResolvedValue(false);
        const res = await request(buildApp()).get('/health');
        expect(res.status).toBe(200); // Still 200 — health endpoint always returns
        expect(res.body.status).toBe('degraded');
        expect(res.body.database).toBe('disconnected');
    });

    it('includes timestamp and uptime fields', async () => {
        const res = await request(buildApp()).get('/health');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('uptime');
        expect(typeof res.body.uptime).toBe('number');
    });

    it('includes db_stats object', async () => {
        const res = await request(buildApp()).get('/health');
        expect(res.body).toHaveProperty('db_stats');
        const stats = res.body.db_stats;
        expect(stats).toHaveProperty('queries');
        expect(stats).toHaveProperty('mutations');
        expect(stats).toHaveProperty('slow');
        expect(stats).toHaveProperty('p99_ms');
    });
});

// =============================================================================
// GET /diagnostics/db
// =============================================================================

describe('GET /diagnostics/db', () => {
    it('returns diagnostics object from db module', async () => {
        const res = await request(buildApp()).get('/diagnostics/db');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('stats');
        expect(res.body).toHaveProperty('activeOps');
        expect(mockGetDbDiagnostics).toHaveBeenCalled();
    });

    it('returns active ops as array', async () => {
        mockGetDbDiagnostics.mockReturnValue({
            stats: { totalReads: 5, totalWrites: 2, slowCount: 0, contentionEvents: 0, p99Ms: 5 },
            activeOps: [{ id: 'op-1', query: 'SELECT 1' }],
        });
        const res = await request(buildApp()).get('/diagnostics/db');
        expect(Array.isArray(res.body.activeOps)).toBe(true);
        expect(res.body.activeOps.length).toBe(1);
    });
});

// =============================================================================
// POST /diagnostics/db/reset
// =============================================================================

describe('POST /diagnostics/db/reset', () => {
    it('resets diagnostics and returns reset:true', async () => {
        const res = await request(buildApp()).post('/diagnostics/db/reset');
        expect(res.status).toBe(200);
        expect(res.body.reset).toBe(true);
        expect(res.body).toHaveProperty('timestamp');
        expect(mockResetDbDiagnostics).toHaveBeenCalled();
    });

    it('timestamp is an ISO string', async () => {
        const res = await request(buildApp()).post('/diagnostics/db/reset');
        const ts = new Date(res.body.timestamp);
        expect(Number.isNaN(ts.getTime())).toBe(false);
    });
});
