/**
 * Synthesis engine and autonomous cycle REST API routes.
 *
 * Controls the synthesis engine (start/stop/status), manages autonomous
 * cycles (validation, questions, tensions, research, autorating, evm, voicing),
 * and provides synthesis history with pipeline statistics.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/synthesis
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

router.post('/synthesis/start', asyncHandler(async (req, res) => {
    const { runSynthesisEngine, getSynthesisStatus } = await import('../core.js');
    const status = getSynthesisStatus();

    if (status.running) {
        return res.json({ success: false, message: 'Already running' });
    }

    // Run in background (don't await)
    runSynthesisEngine(req.body).catch((err) => {
        console.error('Synthesis engine error:', err);
    });

    res.json({ success: true, message: 'Synthesis engine started' });
}));

router.post('/synthesis/stop', asyncHandler(async (_req, res) => {
    const { stopSynthesisEngine } = await import('../core.js');
    const result = stopSynthesisEngine();
    res.json(result);
}));

router.get('/synthesis/status', asyncHandler(async (_req, res) => {
    const { getSynthesisStatus, getDiscoveries } = await import('../core.js');
    const { config } = await import('../config.js');
    const status = getSynthesisStatus();
    const discoveries = getDiscoveries();
    res.json({
        ...status,
        enabled: config.synthesisEngine.enabled,
        pendingDiscoveries: discoveries.length,
        discoveries: discoveries.slice(0, 10), // Return latest 10
    });
}));

// Get pending discoveries (MCP mode)
router.get('/synthesis/discoveries', asyncHandler(async (_req, res) => {
    const { getDiscoveries } = await import('../core.js');
    res.json({ discoveries: getDiscoveries() });
}));

// Clear a discovery after processing
router.post('/synthesis/discoveries/clear', asyncHandler(async (req, res) => {
    const { clearDiscovery } = await import('../core.js');
    const { nodeAId, nodeBId } = req.body;
    const cleared = clearDiscovery(nodeAId, nodeBId);
    res.json({ success: cleared });
}));

// GET /synthesis/history — Recent synthesis cycles with details
router.get('/synthesis/history', asyncHandler(async (req, res) => {
    const { query: dbQuery } = await import('../db.js');
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 20, 50);

    const cycles = await dbQuery(`
        SELECT
            dc.id,
            dc.node_a_id,
            dc.node_b_id,
            na.content as node_a_content,
            nb.content as node_b_content,
            dc.resonance_score,
            dc.threshold_used,
            dc.created_child,
            dc.child_node_id,
            dc.child_trajectory,
            dc.rejection_reason,
            dc.parameters,
            dc.started_at,
            dc.completed_at,
            dc.domain
        FROM dream_cycles dc
        LEFT JOIN nodes na ON na.id = dc.node_a_id
        LEFT JOIN nodes nb ON nb.id = dc.node_b_id
        ORDER BY dc.started_at DESC
        LIMIT $1
    `, [limit]);

    // Compute 7-day pipeline stats (only count children that still exist)
    const pipelineStats = await dbQuery(`
        SELECT
            COUNT(*) as total,
            SUM(CASE WHEN dc.created_child = 1
                  AND dc.child_node_id IS NOT NULL
                  AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = dc.child_node_id AND n.archived = 0)
                THEN 1 ELSE 0 END) as passed,
            SUM(CASE WHEN dc.created_child = 0
                  OR dc.child_node_id IS NULL
                  OR NOT EXISTS (SELECT 1 FROM nodes n WHERE n.id = dc.child_node_id AND n.archived = 0)
                THEN 1 ELSE 0 END) as rejected
        FROM dream_cycles dc
        WHERE dc.started_at > datetime('now', '-7 days')
    `);

    const pipeline = pipelineStats[0] || { total: 0, passed: 0, rejected: 0 };

    // Rejection reason breakdown (7-day)
    const rejectionBreakdown = await dbQuery(`
        SELECT rejection_reason, COUNT(*) as count
        FROM dream_cycles
        WHERE started_at > datetime('now', '-7 days')
          AND created_child = 0
          AND rejection_reason IS NOT NULL
        GROUP BY rejection_reason
        ORDER BY count DESC
    `);

    res.json({
        cycles: cycles.map((c: any) => {
            let cycleType = null;
            let cycleParams = null;
            if (c.parameters) {
                try {
                    const params = JSON.parse(c.parameters);
                    cycleType = params.cycle_type || (params.validation_type ? 'validation' : null);
                    if (cycleType) {
                        cycleParams = {
                            seedsGenerated: params.seedsGenerated,
                            seedsAccepted: params.seedsAccepted,
                            seedsRejectedRelevance: params.seedsRejectedRelevance,
                            skipReason: params.skip_reason,
                            questionsGenerated: params.questionsGenerated,
                            questionsAccepted: params.questionsAccepted,
                            tensionsFound: params.tensionsFound,
                            tensionsProcessed: params.tensionsProcessed,
                            candidatesFound: params.candidatesFound,
                            candidatesValidated: params.candidatesValidated,
                            isBreakthrough: params.is_breakthrough,
                            composite: params.composite,
                        };
                    }
                } catch { /* ignore parse errors */ }
            }
            return {
                id: c.id,
                nodeA: c.node_a_content ? c.node_a_content.slice(0, 80) : null,
                nodeB: c.node_b_content ? c.node_b_content.slice(0, 80) : null,
                resonanceScore: c.resonance_score,
                threshold: c.threshold_used,
                createdChild: !!c.created_child,
                childTrajectory: c.child_trajectory,
                rejectionReason: c.rejection_reason,
                domain: c.domain,
                startedAt: c.started_at,
                cycleType,
                cycleParams,
            };
        }),
        pipeline: {
            total: parseInt(pipeline.total, 10) || 0,
            passed: parseInt(pipeline.passed, 10) || 0,
            rejected: parseInt(pipeline.rejected, 10) || 0,
            rejectionBreakdown: rejectionBreakdown.map((r: any) => ({
                reason: r.rejection_reason,
                count: parseInt(r.count, 10) || 0,
            })),
        },
    });
}));

// =============================================================================
// AUTONOMOUS CYCLE CONTROL ENDPOINTS
// =============================================================================

const VALID_CYCLE_TYPES = ['synthesis', 'validation', 'questions', 'tensions', 'research', 'autorating', 'evm', 'voicing', 'ground_rules', 'population_control'];

/**
 * Start an autonomous cycle. Checks budget first (429 if exceeded). Persists
 * enabled=true in config so the cycle survives server restarts, then starts
 * the background loop. Synthesis uses a separate engine entrypoint.
 */
router.post('/cycles/:type/start', asyncHandler(async (req, res) => {
    const cycleType = req.params.type;
    if (!VALID_CYCLE_TYPES.includes(cycleType)) {
        return res.status(400).json({ success: false, message: `Invalid cycle type: ${cycleType}` });
    }

    // Block starts when budget is exceeded
    try {
        const { isBudgetExceeded } = await import('../models/budget.js');
        if (isBudgetExceeded()) {
            return res.status(429).json({ success: false, message: 'Budget exceeded — cannot start services while budget is paused.' });
        }
    } catch { /* budget module not loaded */ }

    if (cycleType === 'synthesis') {
        // Reuse existing synthesis engine start
        const { runSynthesisEngine, getSynthesisStatus } = await import('../core.js');
        const status = getSynthesisStatus();
        if (status.running) {
            return res.json({ success: false, message: 'Already running' });
        }
        const { updateConfig: updateCfg } = await import('../config.js');
        await updateCfg({ synthesisEngine: { enabled: true } } as any);
        runSynthesisEngine(req.body).catch((err) => {
            console.error('Synthesis engine error:', err);
        });
        return res.json({ success: true, message: 'Synthesis engine started' });
    }

    // Autonomous cycles — persist enabled=true so it survives restarts
    const { startValidationCycle, startQuestionCycle, startTensionCycle, startResearchCycle, startAutoratingCycle, startEvmCycle, startVoicingCycle, startGroundRulesCycle, startPopulationControlCycle } = await import('../core.js');
    const { updateConfig } = await import('../config.js');
    const CYCLE_CONFIG_KEY: Record<string, string> = {
        validation: 'validation', questions: 'questions',
        tensions: 'tensions', research: 'research', autorating: 'autorating', evm: 'evm', voicing: 'voicing',
    };
    const configKey = CYCLE_CONFIG_KEY[cycleType];
    if (configKey) {
        await updateConfig({ autonomousCycles: { [configKey]: { enabled: true } } } as any);
    } else if (cycleType === 'ground_rules') {
        await updateConfig({ groundRules: { enabled: true } } as any);
    } else if (cycleType === 'population_control') {
        await updateConfig({ populationControl: { enabled: true } } as any);
    }

    let result;
    switch (cycleType) {
        case 'validation': result = await startValidationCycle(); break;
        case 'questions': result = await startQuestionCycle(); break;
        case 'tensions': result = await startTensionCycle(); break;
        case 'research': result = await startResearchCycle(); break;
        case 'autorating': result = await startAutoratingCycle(); break;
        case 'evm': result = await startEvmCycle(); break;
        case 'voicing': result = await startVoicingCycle(); break;
        case 'ground_rules': result = await startGroundRulesCycle(); break;
        case 'population_control': result = await startPopulationControlCycle(); break;
    }
    res.json(result);
}));

/**
 * Stop an autonomous cycle. Persists enabled=false in config (stays stopped
 * across restarts) AND stops the running background loop immediately.
 */
router.post('/cycles/:type/stop', asyncHandler(async (req, res) => {
    const cycleType = req.params.type;
    if (!VALID_CYCLE_TYPES.includes(cycleType)) {
        return res.status(400).json({ success: false, message: `Invalid cycle type: ${cycleType}` });
    }

    if (cycleType === 'synthesis') {
        const { stopSynthesisEngine } = await import('../core.js');
        const { updateConfig: updateCfg } = await import('../config.js');
        await updateCfg({ synthesisEngine: { enabled: false } } as any);
        return res.json(stopSynthesisEngine());
    }

    // Stop the running loop AND persist enabled=false so it stays stopped across restarts
    const { stopCycle } = await import('../core.js');
    const { updateConfig } = await import('../config.js');
    const CYCLE_CONFIG_KEY: Record<string, string> = {
        validation: 'validation', questions: 'questions',
        tensions: 'tensions', research: 'research', autorating: 'autorating', evm: 'evm', voicing: 'voicing',
    };
    const configKey = CYCLE_CONFIG_KEY[cycleType];
    if (configKey) {
        await updateConfig({ autonomousCycles: { [configKey]: { enabled: false } } } as any);
    } else if (cycleType === 'ground_rules') {
        await updateConfig({ groundRules: { enabled: false } } as any);
    } else if (cycleType === 'population_control') {
        await updateConfig({ populationControl: { enabled: false } } as any);
    }

    const result = stopCycle(cycleType as any);
    res.json(result);
}));

// GET /cycles/status — Get all cycle statuses
router.get('/cycles/status', asyncHandler(async (_req, res) => {
    const { getAllCycleStatuses, getSynthesisStatus, getDiscoveries } = await import('../core.js');
    const { config } = await import('../config.js');

    const cycleStatuses = getAllCycleStatuses();
    const synthesisStatus = getSynthesisStatus();
    const discoveries = getDiscoveries();

    res.json({
        synthesis: {
            ...synthesisStatus,
            enabled: config.synthesisEngine.enabled,
            pendingDiscoveries: discoveries.length,
        },
        validation: {
            ...cycleStatuses.validation,
            enabled: config.autonomousCycles.validation.enabled,
        },
        questions: {
            ...cycleStatuses.questions,
            enabled: config.autonomousCycles.questions.enabled,
        },
        tensions: {
            ...cycleStatuses.tensions,
            enabled: config.autonomousCycles.tensions.enabled,
        },
        research: {
            ...cycleStatuses.research,
            enabled: config.autonomousCycles.research.enabled,
        },
        autorating: {
            ...cycleStatuses.autorating,
            enabled: config.autonomousCycles.autorating.enabled,
        },
        evm: {
            ...cycleStatuses.evm,
            enabled: config.autonomousCycles.evm.enabled,
        },
        voicing: {
            ...cycleStatuses.voicing,
            enabled: config.autonomousCycles.voicing.enabled,
        },
        ground_rules: {
            ...cycleStatuses.ground_rules,
            enabled: config.groundRules.enabled,
        },
        population_control: {
            ...cycleStatuses.population_control,
            enabled: config.populationControl.enabled,
        },
    });
}));

export default router;
