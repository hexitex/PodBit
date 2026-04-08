/**
 * API Verification Registry — REST Routes
 *
 * CRUD for external API configurations + verification log browsing.
 * Wraps functions from evm/api/registry.ts and evm/api/audit.ts.
 *
 * GET    /api/api-registry/stats          — aggregate verification stats
 * GET    /api/api-registry/verifications   — filtered verification log
 * GET    /api/api-registry                 — list all APIs
 * GET    /api/api-registry/:id             — get single API
 * POST   /api/api-registry                 — create API
 * PUT    /api/api-registry/:id             — update API
 * DELETE /api/api-registry/:id             — delete API
 * POST   /api/api-registry/:id/enable      — enable API
 * POST   /api/api-registry/:id/disable     — disable API
 * POST   /api/api-registry/:id/test        — test API connectivity
 * GET    /api/api-registry/:id/prompt-history — prompt version history
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';

const router = Router();

// =========================================================================
// Static paths BEFORE parameterized routes
// =========================================================================

router.get('/api-registry/stats', asyncHandler(async (req: any, res: any) => {
    const { getApiVerificationStats } = await import('../evm/api/audit.js');
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 7;
    const stats = await getApiVerificationStats(days);
    res.json(stats);
}));

router.get('/api-registry/verifications', asyncHandler(async (req: any, res: any) => {
    const { getFilteredApiVerifications } = await import('../evm/api/audit.js');
    const result = await getFilteredApiVerifications({
        apiId: req.query.apiId || undefined,
        nodeId: req.query.nodeId || undefined,
        impact: req.query.impact || undefined,
        status: req.query.status || undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : 0,
    });
    res.json(result);
}));

router.post('/api-registry/onboard', asyncHandler(async (req: any, res: any) => {
    const { handleOnboard } = await import('../evm/api/onboard.js');
    const result = await handleOnboard({
        name: req.body.name,
        interviewId: req.body.interviewId,
        response: req.body.response,
    });
    if (result.status === 'error') return res.status(400).json(result);
    res.json(result);
}));

// =========================================================================
// CRUD
// =========================================================================

router.get('/api-registry', asyncHandler(async (_req: any, res: any) => {
    const { listApis } = await import('../evm/api/registry.js');
    const apis = await listApis();
    res.json(apis);
}));

router.post('/api-registry', asyncHandler(async (req: any, res: any) => {
    const { createApi } = await import('../evm/api/registry.js');
    const api = await createApi(req.body);
    res.status(201).json(api);
}));

router.get('/api-registry/:id', asyncHandler(async (req: any, res: any) => {
    const { getApi } = await import('../evm/api/registry.js');
    const api = await getApi(req.params.id);
    if (!api) return res.status(404).json({ error: 'API not found' });
    res.json(api);
}));

router.put('/api-registry/:id', asyncHandler(async (req: any, res: any) => {
    const { updateApi } = await import('../evm/api/registry.js');
    const { savePromptVersion } = await import('../evm/api/registry.js');

    // Track prompt changes for version history
    if (req.body.promptQuery !== undefined || req.body.promptInterpret !== undefined || req.body.promptExtract !== undefined) {
        const { getApi } = await import('../evm/api/registry.js');
        const existing = await getApi(req.params.id);
        if (existing) {
            if (req.body.promptQuery !== undefined && req.body.promptQuery !== existing.promptQuery) {
                await savePromptVersion(req.params.id, 'prompt_query', req.body.promptQuery, 'Updated via GUI', 'gui:user');
            }
            if (req.body.promptInterpret !== undefined && req.body.promptInterpret !== existing.promptInterpret) {
                await savePromptVersion(req.params.id, 'prompt_interpret', req.body.promptInterpret, 'Updated via GUI', 'gui:user');
            }
            if (req.body.promptExtract !== undefined && req.body.promptExtract !== existing.promptExtract) {
                await savePromptVersion(req.params.id, 'prompt_extract', req.body.promptExtract, 'Updated via GUI', 'gui:user');
            }
        }
    }

    const updated = await updateApi(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'API not found' });
    res.json(updated);
}));

router.delete('/api-registry/:id', asyncHandler(async (req: any, res: any) => {
    const { deleteApi } = await import('../evm/api/registry.js');
    const deleted = await deleteApi(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'API not found' });
    res.json({ success: true });
}));

// =========================================================================
// Actions
// =========================================================================

router.post('/api-registry/:id/enable', asyncHandler(async (req: any, res: any) => {
    const { setApiEnabled } = await import('../evm/api/registry.js');
    const ok = await setApiEnabled(req.params.id, true);
    if (!ok) return res.status(404).json({ error: 'API not found' });
    res.json({ success: true });
}));

router.post('/api-registry/:id/disable', asyncHandler(async (req: any, res: any) => {
    const { setApiEnabled } = await import('../evm/api/registry.js');
    const ok = await setApiEnabled(req.params.id, false);
    if (!ok) return res.status(404).json({ error: 'API not found' });
    res.json({ success: true });
}));

router.post('/api-registry/:id/test', asyncHandler(async (req: any, res: any) => {
    const { getApi } = await import('../evm/api/registry.js');
    const { callApi } = await import('../evm/api/caller.js');

    const apiEntry = await getApi(req.params.id);
    if (!apiEntry) return res.status(404).json({ error: 'API not found' });

    // Use testUrl if configured, otherwise fall back to baseUrl
    const testUrl = apiEntry.testUrl || apiEntry.baseUrl;

    try {
        const result = await callApi(apiEntry, {
            method: 'GET',
            url: testUrl,
            headers: {},
        });
        // Reachable = any non-5xx response (4xx means the server responded)
        const reachable = result.status < 500;
        res.json({
            success: reachable,
            status: result.status,
            responseTimeMs: result.responseTimeMs,
            bodyPreview: result.body.slice(0, 500),
            truncated: result.truncated,
            testUrl,
            note: !reachable ? 'Server error — API may be down' :
                  result.status >= 400 ? `Reachable (HTTP ${result.status}). Set a Test URL with a known-good endpoint for better validation.` : undefined,
        });
    } catch (err: any) {
        res.json({
            success: false,
            error: err.message,
            testUrl,
        });
    }
}));

router.post('/api-registry/:id/test-claim', asyncHandler(async (req: any, res: any) => {
    const { getApi } = await import('../evm/api/registry.js');
    const { formulateQuery } = await import('../evm/api/query-formulator.js');
    const { callApi } = await import('../evm/api/caller.js');
    const { interpretResult } = await import('../evm/api/interpreter.js');

    const apiEntry = await getApi(req.params.id);
    if (!apiEntry) return res.status(404).json({ error: 'API not found' });

    const { claim } = req.body;
    if (!claim) return res.status(400).json({ error: 'claim is required' });

    const decision = {
        apiId: apiEntry.id,
        apiName: apiEntry.name,
        reason: 'Manual test claim from GUI',
        confidence: 1.0,
        relevantVarIds: [] as string[],
        mode: 'verify' as const,
    };

    const steps: Record<string, any> = {};

    try {
        // Step 1: Formulate query
        const apiQuery = await formulateQuery(apiEntry, decision, claim, []);
        steps.query = apiQuery;

        // Step 2: Call API
        const callResult = await callApi(apiEntry, apiQuery);
        steps.call = {
            status: callResult.status,
            responseTimeMs: callResult.responseTimeMs,
            bodyPreview: callResult.body.slice(0, 2000),
            truncated: callResult.truncated,
        };

        if (callResult.status < 200 || callResult.status >= 300) {
            return res.json({
                success: false,
                error: `API returned HTTP ${callResult.status}`,
                steps,
            });
        }

        // Step 3: Interpret result
        const interpretation = await interpretResult(apiEntry, decision, claim, callResult.body, []);
        steps.interpretation = interpretation;

        res.json({
            success: true,
            impact: interpretation.impact,
            confidence: interpretation.confidence,
            evidenceSummary: interpretation.evidenceSummary,
            corrections: interpretation.corrections,
            steps,
        });
    } catch (err: any) {
        res.json({
            success: false,
            error: err.message,
            steps,
        });
    }
}));

router.post('/api-registry/:id/test-enrichment', asyncHandler(async (req: any, res: any) => {
    const { getApi } = await import('../evm/api/registry.js');
    const { formulateQuery } = await import('../evm/api/query-formulator.js');
    const { callApi } = await import('../evm/api/caller.js');
    const { extractEnrichments } = await import('../evm/api/enrichment.js');

    const apiEntry = await getApi(req.params.id);
    if (!apiEntry) return res.status(404).json({ error: 'API not found' });
    if (apiEntry.mode === 'verify') return res.status(400).json({ error: 'API is in verify-only mode' });

    const { claim, domain } = req.body;
    if (!claim) return res.status(400).json({ error: 'claim is required' });

    const decision = {
        apiId: apiEntry.id,
        apiName: apiEntry.name,
        reason: 'Manual enrichment test from GUI',
        confidence: 1.0,
        relevantVarIds: [] as string[],
        mode: 'enrich' as const,
    };

    try {
        const apiQuery = await formulateQuery(apiEntry, decision, claim, []);
        const callResult = await callApi(apiEntry, apiQuery);

        if (callResult.status < 200 || callResult.status >= 300) {
            return res.json({ success: false, error: `HTTP ${callResult.status}` });
        }

        // Extract but do NOT create nodes — dry run
        const facts = await extractEnrichments(
            apiEntry, decision, claim, callResult.body, domain || 'test',
        );

        res.json({
            success: true,
            facts,
            factCount: facts.length,
            responsePreview: callResult.body.slice(0, 1000),
        });
    } catch (err: any) {
        res.json({ success: false, error: err.message });
    }
}));

router.get('/api-registry/:id/prompt-history', asyncHandler(async (req: any, res: any) => {
    const { getPromptHistory } = await import('../evm/api/registry.js');
    const history = await getPromptHistory(req.params.id, req.query.field || undefined);
    res.json(history);
}));

export default router;
