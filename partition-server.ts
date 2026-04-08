/**
 * Standalone partition pool server.
 *
 * Manages a system-level pool of knowledge partitions that projects can
 * recruit for temporary cross-pollination, then return (with new knowledge)
 * when the procreation period ends. Runs as a separate Express process
 * (default port 3002), managed by the orchestrator.
 *
 * Features: exclusive partition checkout, fitness scoring, generational
 * history tracking, integrity verification (Merkle + chain), periodic stale
 * reclaim for expired recruitments, and elite pool batch operations.
 *
 * @module partition-server
 */

import { interceptConsole } from './utils/logger.js';
interceptConsole();

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, VERSION } from './config.js';
import {
    addToPool,
    listPool,
    getPoolPartition,
    removeFromPool,
    createRecruitment,
    listRecruitments,
    getRecruitment,
    getPartitionHistory,
    getDashboardStats,
    getExpiredRecruitments,
    updateRecruitment,
    updateIntegrityStatus,
    checkinPartition,
    recordHistory,
    closePoolDb,
} from './db/pool-db.js';
import { verifyPartitionIntegrity } from './core/integrity.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = __dirname; // partition-server.ts lives at project root

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- Helpers ---

/**
 * Read the `data/projects.json` metadata file which tracks all projects
 * and the currently active project.
 * @returns Parsed projects metadata or default empty structure
 */
function readProjectsMeta(): Record<string, any> {
    const metaPath = path.join(projectRoot, 'data', 'projects.json');
    if (!fs.existsSync(metaPath)) return { currentProject: null, projects: {} };
    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
}

// --- Health ---

app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        service: 'partition-pool',
        version: VERSION,
        timestamp: new Date().toISOString(),
    });
});

// --- Pool: specific routes BEFORE wildcard (Express route ordering) ---

app.get('/pool/dashboard', (_req, res) => {
    try {
        const stats = getDashboardStats();
        res.json({
            ...stats,
            config: {
                minPoolNodes: config.partitionServer.minPoolNodes,
                staleGraceHours: config.partitionServer.staleGraceHours,
            },
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/pool/config', (_req, res) => {
    res.json({
        minPoolNodes: config.partitionServer.minPoolNodes,
        staleGraceHours: config.partitionServer.staleGraceHours,
        staleCheckIntervalMs: config.partitionServer.staleCheckIntervalMs,
        returnCheckIntervalMs: config.partitionServer.returnCheckIntervalMs,
    });
});

// --- Pool Partitions ---

app.get('/pool', (_req, res) => {
    try {
        const partitions = listPool();
        res.json({ partitions });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/pool/:id(*)/history', (req: any, res: any) => {
    try {
        const id = req.params.id || req.params[0];
        const partition = getPoolPartition(id);
        if (!partition) return res.status(404).json({ error: 'Not found' });
        const history = getPartitionHistory(id);
        res.json({ partitionId: id, history });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/pool/:id(*)/verify', (req: any, res: any) => {
    try {
        const id = req.params.id || req.params[0];
        const partition = getPoolPartition(id);
        if (!partition) return res.status(404).json({ error: 'Not found' });

        // Parse stored export data and run full verification
        const exportData = JSON.parse(partition.export_data);
        const result = verifyPartitionIntegrity(exportData);

        // Update integrity status based on result
        const status = (result.merkleValid && result.chainValid) ? 'verified'
            : (result.nodesWithHashes === 0 && result.chainVerified === 0) ? 'none'
            : 'broken';
        updateIntegrityStatus(id, status, result.merkleComputed || undefined);

        res.json({
            partitionId: id,
            status,
            merkle: {
                valid: result.merkleValid,
                computed: result.merkleComputed,
                nodesWithHashes: result.nodesWithHashes,
                nodesTotal: result.nodesTotal,
            },
            chain: {
                valid: result.chainValid,
                verified: result.chainVerified,
                brokenAt: result.chainBrokenAt,
                reason: result.chainReason,
            },
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/pool/:id(*)', (req: any, res: any) => {
    try {
        const id = req.params.id || req.params[0];
        const partition = getPoolPartition(id);
        if (!partition) return res.status(404).json({ error: 'Not found' });

        // Parse export_data for summary (don't send full blob by default)
        let summary: any = {};
        try {
            const data = JSON.parse(partition.export_data);
            const nodes = data.nodes || [];
            const typeCounts: Record<string, number> = {};
            for (const n of nodes) {
                typeCounts[n.node_type] = (typeCounts[n.node_type] || 0) + 1;
            }
            summary = {
                nodeTypes: typeCounts,
                domainList: (data.domains || []).map((d: any) => d.domain || d),
                bridgeCount: (data.bridges || []).length,
                exportVersion: data.podbitExport,
            };
        } catch { /* malformed export data */ }

        // Include recent history
        const history = getPartitionHistory(id).slice(-3);

        const { export_data, ...meta } = partition;
        res.json({ ...meta, summary, recentHistory: history });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/pool', (req, res) => {
    try {
        const result = addToPool(req.body);
        res.status(201).json({ success: true, ...result });
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
});

app.delete('/pool/:id(*)', (req: any, res: any) => {
    try {
        const id = req.params.id || req.params[0];
        const existing = getPoolPartition(id);
        if (!existing) return res.status(404).json({ error: 'Not found' });
        if (existing.checked_out) return res.status(409).json({ error: 'Cannot remove: partition is currently checked out' });
        removeFromPool(id);
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// --- Recruitment ---

app.post('/pool/:id(*)/recruit', (req: any, res: any) => {
    try {
        const poolPartitionId = req.params.id || req.params[0];
        const { project, procreationHours, bridges, minCycles, maxCycles, exhaustionThreshold } = req.body;

        if (!project) return res.status(400).json({ error: 'project is required' });
        if (!procreationHours || procreationHours <= 0) {
            return res.status(400).json({ error: 'procreationHours must be positive' });
        }

        // Validate pool partition exists
        const partition = getPoolPartition(poolPartitionId);
        if (!partition) return res.status(404).json({ error: 'Pool partition not found' });

        // Check exclusive checkout
        if (partition.checked_out) {
            return res.status(409).json({ error: 'Partition is currently checked out by another project' });
        }

        // Validate target project exists
        const meta = readProjectsMeta();
        if (!meta.projects?.[project]) {
            return res.status(400).json({ error: `Project "${project}" not found` });
        }

        const result = createRecruitment({
            poolPartitionId,
            targetProject: project,
            procreationHours,
            minCycles: minCycles ?? 5,
            maxCycles: maxCycles ?? 100,
            exhaustionThreshold: exhaustionThreshold ?? 10,
            bridgesConfig: bridges || undefined,
        });

        res.status(201).json({ success: true, recruitmentId: result.id });
    } catch (err: any) {
        // createRecruitment throws on checked_out — return 409
        if (err.message?.includes('checked out')) {
            return res.status(409).json({ error: err.message });
        }
        res.status(500).json({ error: err.message });
    }
});

app.get('/recruitments', (req, res) => {
    try {
        const { status, project } = req.query as { status?: string; project?: string };
        const recruitments = listRecruitments({ status, project });
        res.json({ recruitments });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/recruitments/:id', (req, res) => {
    try {
        const recruitment = getRecruitment(req.params.id);
        if (!recruitment) return res.status(404).json({ error: 'Not found' });
        res.json(recruitment);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// --- Projects list (for GUI convenience) ---

app.get('/projects', (_req, res) => {
    try {
        const meta = readProjectsMeta();
        const projects = Object.entries(meta.projects || {}).map(([name, info]: [string, any]) => ({
            name,
            description: info.description || '',
            nodeCount: info.nodeCount || 0,
            domains: info.domains || [],
            isCurrent: name === meta.currentProject,
        }));
        res.json({ projects });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// --- Stale Reclaim ---

let staleCheckInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the periodic stale reclaim timer. Checks for expired recruitments
 * (past grace period) and reclaims them by updating status to 'expired',
 * checking in the partition, and recording history.
 */
function startStaleReclaim(): void {
    if (staleCheckInterval) return;
    const intervalMs = config.partitionServer.staleCheckIntervalMs;
    const graceHours = config.partitionServer.staleGraceHours;

    console.log(`[pool] Stale reclaim: checking every ${intervalMs / 1000}s, grace period ${graceHours}h`);

    staleCheckInterval = setInterval(() => {
        try {
            const expired = getExpiredRecruitments(graceHours);
            for (const r of expired) {
                updateRecruitment(r.id, { status: 'expired' });
                checkinPartition(r.pool_partition_id);
                recordHistory({
                    poolPartitionId: r.pool_partition_id,
                    recruitmentId: r.id,
                    eventType: 'expired',
                    project: r.target_project,
                    nodeCount: r.node_count_at_recruit || 0,
                    avgWeight: r.avg_weight_at_recruit || 0,
                    breakthroughCount: r.breakthroughs_at_recruit || 0,
                    cyclesRun: r.current_cycles || 0,
                });
                console.log(`[pool] Stale-reclaimed recruitment ${r.id} (${r.target_project})`);
            }
        } catch (err: any) {
            console.error(`[pool] Stale reclaim error: ${err.message}`);
        }
    }, intervalMs);
}

// --- Shutdown ---

app.post('/api/shutdown', async (_req, res) => {
    res.json({ message: 'Pool server shutdown initiated' });
    setTimeout(() => gracefulShutdown('API'), 100);
});

/**
 * Graceful shutdown: stops the stale reclaim timer, closes the pool
 * database, and exits the process.
 * @param signal - Signal name for logging (e.g. 'SIGINT', 'API')
 */
function gracefulShutdown(signal: string) {
    console.log(`[pool] Shutting down (${signal})...`);
    if (staleCheckInterval) {
        clearInterval(staleCheckInterval);
        staleCheckInterval = null;
    }
    closePoolDb();
    process.exit(0);
}

process.removeAllListeners('SIGINT');
process.removeAllListeners('SIGTERM');
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// --- Start ---

const PORT = config.partitionServer.port;
const HOST = config.server.host;

app.listen(PORT, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════╗');
    console.log(`║       PODBIT v${VERSION} - PARTITION POOL`.padEnd(56) + '║');
    console.log('╠═══════════════════════════════════════════════════════╣');
    console.log(`║  Pool server on http://${HOST}:${PORT}`.padEnd(56) + '║');
    console.log(`║  Pool:         GET /pool`.padEnd(56) + '║');
    console.log(`║  Dashboard:    GET /pool/dashboard`.padEnd(56) + '║');
    console.log(`║  Recruitments: GET /recruitments`.padEnd(56) + '║');
    console.log('╚═══════════════════════════════════════════════════════╝');
    console.log('');

    startStaleReclaim();
});
