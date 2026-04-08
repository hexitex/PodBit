/**
 * Health check and database diagnostics REST API routes.
 *
 * GET /health returns system health status (database connectivity, uptime,
 * query stats). Diagnostics endpoints expose active operations, slow queries,
 * percentile latencies, and support stats window reset.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/health
 */

import { Router } from 'express';
import { healthCheck as dbHealthCheck, getDbDiagnostics, resetDbDiagnostics } from '../db.js';

const router = Router();

// Health at /health for clients that use BASE = .../api (e.g. MCP integration tests)
router.get('/health', async (_req, res) => {
    const dbOk = await dbHealthCheck();
    const diag = getDbDiagnostics();
    res.json({
        status: dbOk ? 'healthy' : 'degraded',
        database: dbOk ? 'connected' : 'disconnected',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        requests: 0,
        db_stats: {
            queries: diag.stats.totalReads,
            mutations: diag.stats.totalWrites,
            slow: diag.stats.slowCount,
            contention: diag.stats.contentionEvents,
            p99_ms: diag.stats.p99Ms,
            active: diag.activeOps.length,
        },
    });
});

// Full diagnostics — active ops, slow queries, percentiles
router.get('/diagnostics/db', (_req, res) => {
    res.json(getDbDiagnostics());
});

// Reset stats window
router.post('/diagnostics/db/reset', (_req, res) => {
    resetDbDiagnostics();
    res.json({ reset: true, timestamp: new Date().toISOString() });
});

export default router;
