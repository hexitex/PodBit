/**
 * Budget control REST API routes.
 *
 * Manages LLM spending limits (hourly/daily/weekly/monthly). When any limit
 * is exceeded, all autonomous cycles and LLM calls are paused until the
 * period rolls over or a manual force-resume is issued (force-resume sets a
 * temporary budget floor above current spend). Provides status with real-time
 * utilization percentages and warning thresholds.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/budget
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// GET /budget/status — Full status for GUI (config + costs + utilization + warnings)
router.get('/budget/status', asyncHandler(async (_req, res) => {
    const { getBudgetStatus } = await import('../models/budget.js');
    res.json(await getBudgetStatus());
}));

// GET /budget/config — Config only
router.get('/budget/config', asyncHandler(async (_req, res) => {
    const { loadBudgetConfig } = await import('../models/budget.js');
    res.json(await loadBudgetConfig());
}));

// PUT /budget/config — Update budget configuration
router.put('/budget/config', asyncHandler(async (req, res) => {
    const { updateBudgetConfig } = await import('../models/budget.js');
    const updates = req.body;

    // Validate
    if (updates.warningThreshold !== undefined) {
        const wt = Number(updates.warningThreshold);
        if (Number.isNaN(wt) || wt < 0.5 || wt > 0.99) {
            return res.status(400).json({ error: 'warningThreshold must be between 0.5 and 0.99' });
        }
        updates.warningThreshold = wt;
    }

    if (updates.forceResumeBudget !== undefined) {
        const frb = Number(updates.forceResumeBudget);
        if (Number.isNaN(frb) || frb <= 0) {
            return res.status(400).json({ error: 'forceResumeBudget must be a positive number' });
        }
        updates.forceResumeBudget = frb;
    }

    if (updates.limits) {
        for (const period of ['hourly', 'daily', 'weekly', 'monthly'] as const) {
            const val = updates.limits[period];
            if (val !== undefined && val !== null) {
                const num = Number(val);
                if (Number.isNaN(num) || num <= 0) {
                    return res.status(400).json({ error: `limits.${period} must be a positive number or null` });
                }
                updates.limits[period] = num;
            }
        }
    }

    const result = await updateBudgetConfig(updates);
    res.json(result);
}));

// POST /budget/resume — Manual force-resume
router.post('/budget/resume', asyncHandler(async (_req, res) => {
    const { forceResume } = await import('../models/budget.js');
    res.json(await forceResume());
}));

export default router;
