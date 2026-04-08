/**
 * Partition management REST API routes.
 *
 * Assembles CRUD, exchange (export/import), and transient partition routes.
 * Route registration order matters: bridge and transient routes are registered
 * before parameterized :id wildcard routes to avoid premature matching.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/partitions
 */

import { Router } from 'express';
import { registerCrudRoutes } from './crud.js';
import { registerExchangeRoutes } from './exchange.js';
import { registerTransientRoutes } from './transient.js';

const router = Router();

// Order matters: bridge routes and transient routes MUST come before :id wildcard routes
// registerCrudRoutes registers bridge routes first, then transient routes are next,
// then the :id wildcard routes come after
registerTransientRoutes(router);
registerCrudRoutes(router);
registerExchangeRoutes(router);

export default router;

export { exportPartition, importPartition } from './exchange.js';
export { importTransient, approveTransient, departTransient, getVisitHistory } from './transient.js';
