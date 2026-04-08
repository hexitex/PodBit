/**
 * PODBIT v0.5 - API ROUTES
 *
 * Thin orchestrator that mounts all sub-route modules.
 * Each sub-router defines its own paths (e.g. /health, /resonance/nodes, /chat).
 * This router is mounted at /api in server.js.
 */

import { Router } from 'express';

import healthRouter from './health.js';
import resonanceRouter from './resonance.js';
import scaffoldRouter from './scaffold.js';
import configRouter from './config-routes.js';
import decisionsRouter from './decisions.js';
import databaseRouter from './database.js';
import partitionsRouter from './partitions.js';
import synthesisRouter from './synthesis.js';
import modelsRouter from './models.js';
import seedsRouter from './seeds.js';
import contextRouter from './context.js';
import chatRouter from './chat.js';
import promptsRouter from './prompts.js';
import configTuneRouter from './config-tune.js';
import feedbackRouter from './feedback.js';
import breakthroughRegistryRouter from './breakthrough-registry.js';
import knowledgeBaseRouter from './knowledge-base.js';
import keywordsRouter from './keywords.js';
import activityRouter from './activity.js';
import autotuneRouter from './autotune.js';
import budgetRouter from './budget.js';
import evmRouter from './evm.js';
import eliteRouter from './elite.js';
import apiRegistryRouter from './api-registry.js';
import configAssistRouter from './config-assist.js';
import labRegistryRouter from './lab-registry.js';
import journalRouter from './journal.js';
import mcpDispatchRouter from './mcp-dispatch.js';

const router = Router();

router.use(activityRouter);
router.use(autotuneRouter);
router.use(healthRouter);
router.use(resonanceRouter);
router.use(scaffoldRouter);
router.use(configRouter);
router.use(configTuneRouter);
router.use(decisionsRouter);
router.use(databaseRouter);
router.use(partitionsRouter);
router.use(synthesisRouter);
router.use(modelsRouter);
router.use(seedsRouter);
router.use(contextRouter);
router.use(chatRouter);
router.use(promptsRouter);
router.use(feedbackRouter);
router.use(breakthroughRegistryRouter);
router.use(knowledgeBaseRouter);
router.use(keywordsRouter);
router.use(budgetRouter);
router.use(evmRouter);
router.use(eliteRouter);
router.use(apiRegistryRouter);
router.use(labRegistryRouter);
router.use(journalRouter);
router.use(configAssistRouter);
router.use(mcpDispatchRouter);

export default router;
