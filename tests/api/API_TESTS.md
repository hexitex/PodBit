# API Tests — tests/api

Supertest integration tests for every Express route handler. Each file builds a minimal Express app with the router under test, mocks all dependencies with `jest.unstable_mockModule`, and fires HTTP requests to assert status codes, response shapes, input validation, and delegate call arguments.

---

## Auth & Security

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **security.test.ts** | `GET /security/handshake`, `POST /security/regenerate`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /security/admin/status`, `POST /security/admin/setup`, `POST /security/admin/verify`, `POST /security/admin/change`, `POST /security/admin/remove` | Localhost-only handshake (403 non-localhost via `trust proxy` + `X-Forwarded-For`), key regeneration auth, login rate-limiting/403-no-password/401-wrong/200-success, refresh rotation, logout revocation, admin setup (409 conflict, 400 short password, 200), verify (401/200), change (401 wrong current, 400 short new, 200), remove. |

---

## Chat

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **chat-index.test.ts** | `POST /chat`, `POST /chat/conversations/:id/messages` | 400 missing message, response from `handleChatMessage`, mode defaulting to `'api'`, 404 conv not found, auto-title from first message, `scope_domains` JSON parsing. |
| **chat-conversations.test.ts** | `GET /chat/conversations`, `POST /chat/conversations`, `GET /chat/conversations/:id`, `PUT /chat/conversations/:id`, `DELETE /chat/conversations/:id` | Conversation CRUD: maps DB rows, parses messages/scope_domains JSON, UUID generation, default title/actionMode, 404 not found, 400 no update fields, soft-delete (archived=1). |

---

## Config & Tuning

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **config.test.ts** | `GET /config`, `PUT /config`, `GET /config/sections`, etc. | Config read/write delegation to `handleConfig`. |
| **config-tune.test.ts** | `POST /config/tune`, `POST /config/tune/generate-patterns`, `POST /config/tune/generate-intent-patterns`, `POST /config/tune/generate-words`, `GET /config/sections`, `GET /config/defaults/:sectionId`, `GET /config/history`, `GET /config/snapshots`, `POST /config/snapshots`, `POST /config/snapshots/:id/restore`, `GET /config/metrics`, `GET /config/dedup-gates`, `PUT /config/dedup-gates/:source`, `DELETE /config/dedup-gates/:source` | 400 missing params, 400 unknown section, 200 valid tune, 502 on unparseable LLM output, clamping suggestedValue to param max, 400 invalid intentType/listType, dedup-gate upsert/delete, cache invalidation on gate change. Mock note: dedup-gate queries use `../../db/index.js` not `../../db.js`. |
| **config-assist.test.ts** | `POST /config/assist`, `GET /config/assist/diagnostic`, `POST /config/assist/interview` | 400 missing/non-string message, conversationId issued, diagnostic on first response, conversation continuity, suggestions extracted from LLM `\`\`\`suggestions\`\`\`` block, diagnostic severity (critical when 0 synthesis cycles), interview 400 invalid domain/material/stance, 200 with profile.label containing domain+stance. |
| **autotune.test.ts** | `POST /models/autotune/start`, `POST /models/autotune/cancel`, `POST /models/autotune/reset`, `GET /models/autotune/progress`, `POST /models/autotune/apply` | 409 already running, param passing, defaults, 400 missing/non-array changes, `'c:'` prefix routing to consultantTemperatures. Requires mocking `../../handlers/config-tune/know-thyself.js` to prevent fire-and-forget IIFE hang. |

---

## Graph / Resonance

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **resonance.test.ts** | Node CRUD, query, lineage, promote, voice, patterns, etc. | Core graph operations via `handleGraphQuery` / `handlePropose` / etc. |
| **seeds.test.ts** | Seed ingestion routes | Seed submission, validation. |
| **synthesis.test.ts** | Synthesis trigger routes | Synthesis cycle dispatch. |
| **breakthroughs.test.ts** | Breakthrough registry routes | List, get, promote validation. |
| **elite.test.ts** | Elite pool routes | Elite node management. |
| **decisions.test.ts** | Decision log routes | Decision CRUD and filtering. |

---

## Knowledge Base

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **knowledge-base.test.ts** | `GET/POST /kb/folders`, `PUT/DELETE /kb/folders/:id`, `POST /kb/folders/:id/scan`, `GET /kb/files`, `GET /kb/files/:id`, `POST /kb/files/:id/reprocess`, `POST /kb/files/retry-failed`, `GET /kb/status`, `GET /kb/readers`, `GET /kb/stats`, `POST /kb/extensions/map`, `DELETE /kb/extensions/:ext`, `POST /kb/open-path` | Folder CRUD (201 on create, 400 on handler error), deleteNodes param, scan 400 on error, file pagination params, extension mapping/unmapping, 400 missing filePath. All via `handleKnowledgeBase` delegation. |
| **keywords.test.ts** | `POST /keywords/backfill-domains`, `POST /keywords/backfill-nodes`, `GET /keywords/node/:id` | Success counts, limit query param (defaults to 20), 500 on error, correct node-id query param. |

---

## EVM & API Registry

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **evm.test.ts** | EVM verification routes | Trigger, status, results. |
| **api-registry.test.ts** | `GET /api-registry/stats`, `GET /api-registry/verifications`, `POST /api-registry/onboard`, full CRUD, `POST /api-registry/:id/enable`, `POST /api-registry/:id/disable`, `POST /api-registry/:id/test`, `GET /api-registry/:id/prompt-history` | Stats days param, filter params, 400 on onboard error, 404 get/put/delete not found, 201 create, enable/disable call `setApiEnabled(true/false)`, test 404/2xx-success/5xx-failure/throw-failure. |

---

## Models

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **models.test.ts** | Model registry CRUD, subsystem assignments, health | Add/update/delete models, assignment routing, health checks. |

---

## Partitions

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **partitions.test.ts** | Partition CRUD, bridge management | Create/update/delete partitions, add/remove domains, bridge creation. |
| **partitions-exchange.test.ts** | `GET /partitions/:id/export`, `POST /partitions/import` | 400 missing owner, 404 partition not found, export with no-domains short-circuit, export with domains (bridges included), Content-Disposition header, systemVersion field, import VALIDATION errors (missing fields), CONFLICT on duplicate, 200 success (imported.partitionId, domains), overwrite=true, bridge skipping when target doesn't exist, cache invalidation per domain. |
| **partitions-transient.test.ts** | `POST /partitions/transient/import`, `POST /partitions/:id/approve`, `POST /partitions/:id/depart`, `GET /partitions/:id/visits` | VALIDATION errors (missing fields), LIMIT errors (max partitions = 3, max nodes = 500 from real defaults), success with partitionId format `transient/owner/id`, approve 400 (not found, not transient, wrong state), approve success (no-node scan, bridgeTo), depart 400 (not found, not transient, already departed), depart success (exportData wrapping, cycles), visits list/empty/correct query. |

---

## Context Engine

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **context.test.ts** | `POST /context/prepare`, `POST /context/update`, `GET /context/session/:id`, `GET /context/sessions`, `DELETE /context/session/:id`, `GET /context/budgets`, `GET /context/metrics/:id`, `GET /context/insights`, `DELETE /context/insights`, `GET /context/aggregate` | `handleContext` delegation with correct action/params, insights DB queries (cluster_terms JSON parsing, totalInsights/totalNodeUsage counts), DELETE clears both tables, aggregate active sessions + totalTurns. |

---

## Scaffold & Docs

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **scaffold.test.ts** | `POST /docs/decompose`, `POST /docs/generate`, `POST /docs/resume/:jobId`, `GET /docs/jobs`, `GET /docs/jobs/:jobId`, `DELETE /docs/jobs/:jobId`, `GET /docs/templates` | decompose/scaffold dispatch, options pass-through, 404 job not found, resumeJobId injection, status filter in SQL, JSON parsing of outline/sections, already-parsed objects, 200 delete. |

---

## Database Management

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **database.test.ts** | `GET /database/info`, `GET /database/stats`, `DELETE /database/nodes/type/:type` (confirm gate, type validation, valid types, 0-count), `DELETE /database/nodes/domain/:domain` (unset domain IS NULL path), `DELETE /database/nodes`, `DELETE /database/patterns`, `DELETE /database/templates`, `DELETE /database/doc-jobs`, `DELETE /database/knowledge-cache`, `DELETE /database/decisions`, `DELETE /database/all` (DELETE_EVERYTHING gate), `GET/POST /database/backups`, `POST /database/restore` (confirm + filename required), `GET /database/embeddings/status` (counts, byModel, needsReEmbed), `GET/POST /database/projects`, `POST /database/projects/load` (LOAD_PROJECT), `POST /database/projects/new` (NEW_PROJECT → 201), `POST /database/projects/interview`, `GET/PUT /database/projects/manifest`, `DELETE/PUT /database/projects/:name`, `POST /database/number-variables/backfill` (annotated/totalVars counts), `GET /database/number-variables` (list, total), `POST /database/number-variables/resolve` (empty, missing, resolved, 50-ID cap), `PUT /database/number-variables/:varId` (404/400/200), `DELETE /database/number-variables/:varId` (404/200). Mock note: dynamic imports (`models.js`, `vector/embedding-cache.js`, `config.js`, `core/number-variables.js`, `core/integrity.js`) must be declared before router import so they intercept dynamic `import()` calls inside handler bodies. |

---

## MCP Dispatch

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **mcp-dispatch.test.ts** | `GET /mcp/tools`, `POST /mcp/tool` | Tool schema list returned as-is, 400 missing/non-string name, dispatch to `handleToolCall` with correct args, empty params default to `{}`. |

---

## Feedback, Activity, Budget, Health

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **feedback.test.ts** | `POST /nodes/:id/feedback`, `GET /nodes/:id/feedback`, `GET /feedback/stats`, `GET /feedback/unrated` | Rate delegation, 400 on error, feedback array + count, stats domain/days/limit params, unrated filter params. |
| **activity.test.ts** | Activity log routes | Pagination, filtering. |
| **budget.test.ts** | Budget status routes | Budget evaluation and retry-after. |
| **health.test.ts** | `GET /health` | 200 OK, version field. |

---

## Prompts

| File | Routes Covered | What It Tests |
|------|---------------|---------------|
| **prompts.test.ts** | Prompt CRUD, gold standard generation | List/get/update prompts, tuning-judge generation. |

---

## Integration Flows

Multi-step tests where data from one HTTP response feeds into the next request. All flow tests are prefixed `flow-`.

| File | What It Tests |
|------|---------------|
| **flow-chat.test.ts** | Chat lifecycle: `POST /chat/conversations` → capture `id` → `GET /chat/conversations/:id` → `PUT` (title rename) → `DELETE` (soft-delete) → `GET` (404). Also: `scope_domains` JSON roundtrip via list. |
| **flow-auth.test.ts** | JWT token chain: `POST /security/admin/setup` → `POST /auth/login` (capture `accessToken` + `refreshToken`) → `POST /auth/refresh` (exchange `refreshToken`, get rotated pair) → `POST /auth/logout` (revoke rotated token). Also: invalid refresh → 401, accessToken shape. |
| **flow-partition-exchange.test.ts** | Export → import roundtrip: `GET /partitions/:id/export?owner=rob` returns JSON payload → `POST /partitions/import` receives exact payload → `imported.partitionId = 'rob/<id>'`. Also: no-domains early-return path; CONFLICT on duplicate without overwrite. |
| **flow-config-assist.test.ts** | Conversation continuity: turn-1 `POST /config/assist` issues `conversationId` + `diagnostic`; turn-2 with same `conversationId` returns no `diagnostic` (in-memory Map persists). Also: unknown ID starts fresh, `\`\`\`suggestions\`\`\`` block extraction, 400 missing message. |

---

## Running API Tests

From the project root:

```bash
npm test -- tests/api
```

Or a single file:

```bash
npm test -- tests/api/security.test.ts
```

Or flow tests only:

```bash
npm test -- tests/api/flow-
```

---

## Conventions

### Mock setup pattern

All mocks must be registered with `jest.unstable_mockModule()` **before** the `await import()` of the router:

```typescript
jest.unstable_mockModule('../../some/dep.js', () => ({ fn: mockFn }));

const { default: myRouter } = await import('../../routes/my-route.js');
```

### `asyncHandler` is always identity-mocked

```typescript
jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));
```

### Routes that register via function (not default export)

Some route files export `registerXxxRoutes(router)` instead of a default router. Mount them manually:

```typescript
const { registerExchangeRoutes } = await import('../../routes/partitions/exchange.js');

function buildApp() {
    const app = express();
    app.use(express.json());
    const router = express.Router();
    registerExchangeRoutes(router);
    app.use('/', router);
    return app;
}
```

### `clearAllMocks` vs `resetAllMocks`

**Use `jest.resetAllMocks()` when tests use `mockResolvedValueOnce`.**

`jest.clearAllMocks()` only clears call history — it does **not** clear queued `once` values. If a test fails before consuming all its `mockResolvedValueOnce` entries, those values bleed into subsequent tests with wrong results. `jest.resetAllMocks()` clears both call history and the once-queue. Always re-set default implementations after reset:

```typescript
beforeEach(() => {
    jest.resetAllMocks();         // clears history + once-queues
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
});
```

### Module re-export chains and `process.env`

When a route imports from a thin re-exporter (e.g. `config.ts` → `config/index.ts` → `config/defaults.ts`), `jest.unstable_mockModule` on the top-level re-exporter may not intercept values that are computed at module-init time in the underlying module (e.g. `enabled: process.env.FLAG === 'true'`).

**Fix:** Set the relevant env variable **before** any `await import()` call at the top of the test file. In jest ESM, each test file gets its own module registry, so modules are re-evaluated fresh and will see the env value:

```typescript
// Before any jest.unstable_mockModule or await import():
process.env.TRANSIENT_ENABLED = 'true';
```

### Mock paths are relative to the test file

`jest.unstable_mockModule` paths resolve relative to the **test file**, not the module under test. The path must match the resolved absolute path of the module being imported by the route:

```
tests/api/my.test.ts         → mock '../../core/foo.js'  → resolves to core/foo.js ✓
routes/partitions/my.ts      → imports '../../core/foo.js' → resolves to core/foo.js ✓
```

### Fire-and-forget IIFE hangs

Some route handlers launch background work in an IIFE (`(async () => { ... })()`). If the IIFE dynamically imports an unmocked module that itself imports an unmocked DB module, the unresolved import can hang the test's 5-second timeout. Always mock any module that a fire-and-forget IIFE might import. Example from autotune:

```typescript
// The apply route fires a background IIFE that imports know-thyself.js
jest.unstable_mockModule('../../handlers/config-tune/know-thyself.js', () => ({
    seedTuningKnowledge: jest.fn().mockResolvedValue(undefined),
}));
```

### DB mock paths vary by route

Most routes import `query`/`queryOne` from `../../db.js`. A few use `../../db/index.js` (e.g. `routes/config-tune.ts` for dedup-gate queries). Check the actual import statement in the route file and mock the correct path.

---

## In-code documentation

API test files are documented with:

- **File-level JSDoc**: Route module under test, which endpoints and behaviors are covered, and which mocks are used (e.g. `db`, `handlers/evm`). Special setup (e.g. `TRANSIENT_ENABLED`, `trust proxy`, `resetAllMocks`) is noted where relevant.
- **buildApp() JSDoc**: Each test file defines a `buildApp()` (or equivalent) that returns an Express app with the router under test; a one-line comment describes what is mounted (and any error handler or options like `trustProxy`).
- **Section comments**: `// ========== POST /path ==========` blocks already separate route groups; file-level docs summarize what each group asserts so the index (this file) and the code stay aligned.
