# Testing Guide

## Overview

Podbit uses **Jest** with **ts-jest** for unit and API integration testing, running under Node's `--experimental-vm-modules` flag for ESM support.

| Metric | Value |
|--------|-------|
| Test suites | 406 |
| Total tests | 12,800 |
| Statement coverage | 96.94% (19,481 / 20,095) |
| Branch coverage | 90.03% (10,545 / 11,712) |
| Function coverage | 95.21% (2,228 / 2,340) |
| Line coverage | 97.38% (17,911 / 18,392) |
| Source files covered | 257 |
| Files at 100% statements | 122 |

## Running Tests

```bash
# Full suite with coverage
npm test

# Single file
node --experimental-vm-modules node_modules/jest/bin/jest.js tests/unit/some-file.test.ts

# Pattern match
node --experimental-vm-modules node_modules/jest/bin/jest.js --testPathPattern="budget"

# Without coverage (faster)
node --experimental-vm-modules node_modules/jest/bin/jest.js --no-coverage

# Coverage with specific reporters
node --experimental-vm-modules node_modules/jest/bin/jest.js --coverage --coverageReporters=text

# Coverage gap analysis (sorted by uncovered statement count)
node scripts/coverage-gaps.cjs
```

## Test Structure

```
tests/
  unit/        # 372 files — unit tests for individual modules
  api/         # 34 files  — API integration tests (supertest against route handlers)
```

### Naming Conventions

| Pattern | Example | Purpose |
|---------|---------|---------|
| `<module>.test.ts` | `budget.test.ts` | Primary test file |
| `<module>-core.test.ts` | `scoring-core.test.ts` | Core function coverage |
| `<module>-extended.test.ts` | `budget-extended.test.ts` | Extended happy paths |
| `<module>-deep.test.ts` | `governance-deep.test.ts` | Edge cases, error paths, branch coverage |
| `<module>-max.test.ts` | `server-max.test.ts` | Maximum coverage push (wave 5) |
| `<module>-ultimate.test.ts` | `sqlite-backend-ultimate.test.ts` | Final coverage push (wave 6) |
| `route-<name>.test.ts` | `route-budget.test.ts` | Express route tests |
| `migrations-<name>.test.ts` | `migrations-core.test.ts` | DB migration tests |
| `coverage-*-batch.test.ts` | `coverage-max-batch.test.ts` | Multi-file coverage batches |

When a module has both a base and deep/extended file, the base covers primary functionality and the deep file targets remaining branches.

## Configuration

| File | Purpose |
|------|---------|
| `jest.config.js` | Jest config: test paths, ts-jest transform, ESM extensions, coverage settings |
| `tsconfig.test.json` | TypeScript config for test compilation |
| `scripts/coverage-gaps.cjs` | Sorts files by uncovered statement count for gap analysis |

Coverage reporters: `text-summary`, `lcov`, `clover`, `json-summary`. Output directory: `coverage/`.

### Coverage Exclusions

The following are excluded from coverage collection (configured in `jest.config.js`):

- `node_modules/`, `dist/`, `gui/`, `site/`, `data/`, `scripts/`, `tools/`
- Entry points: `seeds.ts`, `partition-server.ts`, `proxy-server.ts`, `orchestrator.ts`, `mcp-stdio.ts`, `mcp-stdio-remote.ts`

---

## Writing Tests

### ESM Mocking Pattern

All tests use ESM with top-level `await`. Mocks must be registered **before** the dynamic import:

```typescript
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// 1. Define mock functions at top level
const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);

// 2. Register mocks BEFORE importing the module under test
jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

// 3. Dynamic import AFTER mocks are registered
const { functionUnderTest } = await import('../../module-under-test.js');

// 4. Clear call history between tests (NOT resetAllMocks)
beforeEach(() => {
    jest.clearAllMocks();
});
```

### Key Rules

1. **`jest.unstable_mockModule()` + `await import()`** — the only way to mock ESM modules. CommonJS `jest.mock()` does not work.
2. **`jest.clearAllMocks()` in `beforeEach`** — clears call history. Never use `jest.resetAllMocks()` which destroys mock implementations.
3. **Never hardcode `maxTokens`** in `callSubsystemModel()` calls — token limits come from the model registry.
4. **Import paths use `.js` extensions** in source code (ESM convention). The `moduleNameMapper` in jest.config.js strips `.js` so ts-jest resolves `.ts` files.
5. **Dual-DB architecture** — mock both `query`/`queryOne` (project DB) and `systemQuery`/`systemQueryOne` (system DB) when needed.

### Express Route Tests

```typescript
import express from 'express';
import request from 'supertest';

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const router = (await import('../../routes/some-route.js')).default;

const app = express();
app.use(express.json());
app.use(router);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(err.status || 500).json({ error: err.message });
});
```

### HTTP Client Tests (fetch)

```typescript
const originalFetch = globalThis.fetch;
globalThis.fetch = jest.fn<any>().mockResolvedValue({
    ok: true, status: 200,
    json: () => Promise.resolve({ data: 'ok' }),
    text: () => Promise.resolve('ok'),
}) as any;

try {
    const result = await callSomeApi();
    expect(result).toBeDefined();
} finally {
    globalThis.fetch = originalFetch;
}
```

### Migration Tests

```typescript
const mockDb = {
    exec: jest.fn(),
    prepare: jest.fn().mockReturnValue({
        run: jest.fn(), get: jest.fn(),
        all: jest.fn().mockReturnValue([]),
    }),
    pragma: jest.fn().mockReturnValue([]),
};
```

Test both "fresh DB" (table/column missing, triggers CREATE/ALTER) and "already migrated" (table/column exists, skips) paths.

---

## Known Limitations

### Transient Jest Worker Crashes

Jest parallel workers occasionally crash with `exitCode=0`, reporting suites as "failed" with zero actual test failures. Inherent to Jest's worker model. Causes ±1-2% coverage variance. All tests pass individually.

### ESM Re-export Chain

`db.ts` re-exports from `db/index.js`. When source modules import from `../db.js`, `jest.unstable_mockModule('../../db.js', ...)` sometimes fails to intercept the actual binding. Workaround: test observable behavior rather than asserting the mock was called.

### ts-jest and ESM Live Bindings

ts-jest does not preserve ESM live bindings for `export let` variables. Mutating an exported `let` from the test side does not affect the module's internal reference. This limits testing of cancellation flags and similar mutable exports.

### Untestable Files (0% coverage)

| File | Stmts | Reason |
|------|-------|--------|
| `proxy/index.ts` | 110 | Calls `app.listen()` at import time; no exported app object |
| `kb/watcher.ts` | 100 | Side-effect imports with chokidar watchers at module scope |

### Static Data Files (0% coverage, by design)

The `prompts/*.ts` files (20 files) export only string constants and template objects. They contain no executable logic. Their content is exercised indirectly by tests for the modules that consume them.

Similarly `mcp/schemas.ts`, `evm/api/types.ts`, `core/autotune/scoring.ts`, and `kb/pipeline/index.ts` are type/constant-only files with 0% coverage but 100% branch coverage (no branches to test).

---

## Source File Coverage

### Config Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `config/defaults.ts` | 100% | 96% | `config-defaults.test.ts` (38), `config-defaults-deep.test.ts` (171) |
| `config/loader.ts` | 96% | 87% | `config-loader.test.ts` (38), `config-loader-deep.test.ts` (28), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |
| `config-sections/advanced.ts` | 100% | 100% | `config-sections.test.ts` (16) |
| `config-sections/consultant-params.ts` | 100% | 100% | `config-sections.test.ts` |
| `config-sections/consultant-pipeline.ts` | 100% | 100% | `config-sections.test.ts` |
| `config-sections/cycles.ts` | 100% | 100% | `config-sections.test.ts` |
| `config-sections/features.ts` | 100% | 100% | `config-sections.test.ts` |
| `config-sections/gui-metadata.ts` | 100% | 83% | `config-sections.test.ts` |
| `config-sections/index.ts` | 100% | 83% | `config-sections.test.ts` |
| `config-sections/subsystem-params.ts` | 100% | 100% | `config-sections.test.ts` |
| `config-sections/synthesis.ts` | 100% | 100% | `config-sections.test.ts` |
| `config-sections/tier-quality-gates.ts` | 100% | 100% | `config-sections.test.ts` |

### Core Logic

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `core.ts` | 12% | 0% | `core-exports.test.ts` (15) — barrel re-export file |
| `core/abstract-patterns.ts` | 76% | 81% | `abstract-patterns-core.test.ts` (12), `abstract-patterns-handler.test.ts` (17), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |
| `core/autotune/combinatorics.ts` | 100% | 100% | `combinatorics.test.ts` (41) |
| `core/autotune/execution.ts` | 93% | 89% | `autotune-execution.test.ts` (19), `autotune-execution-deep.test.ts` (35), `autotune-execution-max.test.ts` (10), `autotune-execution-ultimate.test.ts` (24) |
| `core/autotune/gold-standards.ts` | 100% | 93% | `autotune-gold-standards.test.ts` (30) |
| `core/autotune/index.ts` | 94% | 86% | `autotune-index.test.ts` (9), `autotune-index-deep.test.ts` (29), `coverage-ultimate-small.test.ts` |
| `core/autotune/routing.ts` | 100% | 100% | `autotune-routing.test.ts` (17) |
| `core/autotune/scorers.ts` | 100% | 94% | `autotune-scorers.test.ts` (114), `autotune-scorers-deep.test.ts` (7) |
| `core/autotune/state.ts` | 100% | 100% | `autotune-state.test.ts` (13) |
| `core/autotune/test-vars.ts` | 94% | 70% | `autotune-test-vars.test.ts` (33) |
| `core/avatar-gen.ts` | 100% | 75% | `avatar-gen.test.ts` (8) |
| `core/cluster-selection.ts` | 96% | 72% | `cluster-selection-core.test.ts` (8), `cluster-selection.test.ts` (15) |
| `core/cycles/autorating.ts` | 91% | 85% | `cycle-autorating.test.ts` (12) |
| `core/cycles/evm.ts` | 100% | 83% | `cycle-evm.test.ts` (27), `cycles-evm-deep.test.ts` (19) |
| `core/cycles/questions.ts` | 97% | 68% | `cycle-questions.test.ts` (13) |
| `core/cycles/research.ts` | 97% | 84% | `cycle-research.test.ts` (22) |
| `core/cycles/starters.ts` | 98% | 95% | `cycle-starters.test.ts` (4), `cycle-starters-deep.test.ts` (7), `cycle-starters-autorating.test.ts` (13) |
| `core/cycles/tensions.ts` | 100% | 81% | `cycle-tensions.test.ts` (9) |
| `core/cycles/validation.ts` | 100% | 90% | `cycle-validation.test.ts` (14) |
| `core/cycles/voicing.ts` | 100% | 78% | `cycle-voicing.test.ts` (12) |
| `core/elite-pool-bridging.ts` | 100% | 100% | `elite-pool-bridging.test.ts` (11), `elite-bridging-deep.test.ts` (12) |
| `core/elite-pool-dedup.ts` | 97% | 94% | `elite-pool-dedup.test.ts` (19) |
| `core/elite-pool-generation.ts` | 98% | 88% | `elite-pool-generation.test.ts` (14) |
| `core/elite-pool-manifest.ts` | 100% | 83% | `elite-pool-manifest.test.ts` (21) |
| `core/elite-pool-promotion.ts` | 98% | 85% | `elite-pool-promotion.test.ts` (51) |
| `core/elite-pool-queries.ts` | 100% | 100% | `elite-pool-queries.test.ts` (14) |
| `core/engine-config.ts` | 100% | 100% | `engine-config.test.ts` (12), `engine-config-core.test.ts` (31) |
| `core/governance.ts` | 98% | 95% | `governance.test.ts` (41), `governance-core.test.ts` (21) |
| `core/integrity.ts` | 100% | 95% | `integrity.test.ts` (29), `integrity-core.test.ts` (19) |
| `core/keywords.ts` | 98% | 95% | `keywords.test.ts` (15), `keywords-core.test.ts` (40) |
| `core/lifecycle.ts` | 100% | 98% | `lifecycle.test.ts` (14), `lifecycle-core.test.ts` (17) |
| `core/node-ops.ts` | 98% | 90% | `node-ops.test.ts` (49), `node-ops-core.test.ts` (57), `node-ops-max.test.ts` (41), `node-ops-ultimate.test.ts` (44) |
| `core/number-variables.ts` | 97% | 95% | `number-variables.test.ts` (22), `number-variables-core.test.ts` (52) |
| `core/pending.ts` | 100% | 100% | `pending.test.ts` (11) |
| `core/pool-integration.ts` | 98% | 88% | `pool-integration.test.ts` (17), `pool-integration-core.test.ts` (17), `pool-integration-deep.test.ts` (27), `pool-integration-max.test.ts` (21), `pool-integration-ultimate.test.ts` (11) |
| `core/project-context.ts` | 100% | 100% | `project-context.test.ts` (14) |
| `core/provenance.ts` | 100% | 97% | `provenance.test.ts` (21), `provenance-tags.test.ts` (26) |
| `core/rate-limit.ts` | 97% | 87% | `rate-limit.test.ts` (12), `rate-limit-core.test.ts` (16), `rate-limit-parse.test.ts` (28) |
| `core/scoring.ts` | 99% | 97% | `scoring.test.ts` (29), `scoring-core.test.ts` (66) |
| `core/security.ts` | 95% | 96% | `security.test.ts` (13), `security-core.test.ts` (50), `security-extended.test.ts` (51), `security-deep.test.ts` (14), `coverage-ultimate-small.test.ts` |
| `core/specificity.ts` | 100% | 100% | `specificity.test.ts` (7) |
| `core/synthesis-engine.ts` | 98% | 79% | `synthesis-engine-core.test.ts` (50), `synthesis-engine-deep.test.ts` (55), `synthesis-engine-domain.test.ts` (20), `synthesis-engine-extended.test.ts` (25), `synthesis-engine-state.test.ts` (15), `synthesis-engine-max.test.ts` (35), `synthesis-engine-ultimate.test.ts` (72) |
| `core/tensions.ts` | 96% | 93% | `tensions.test.ts` (8), `tensions-core.test.ts` (24), `tensions-deep.test.ts` (33) |
| `core/tool-calling.ts` | 97% | 82% | `tool-calling.test.ts` (6), `tool-calling-core.test.ts` (20), `tool-calling-extended.test.ts` (24) |
| `core/validation.ts` | 96% | 80% | `validation.test.ts` (35) |
| `core/voicing.ts` | 100% | 85% | `voicing.test.ts` (32), `voicing-core.test.ts` (30) |

### Database Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `db.ts` | 33% | 100% | — (barrel re-export) |
| `db/index.ts` | 100% | 100% | — (barrel re-export) |
| `db/pool-db.ts` | 100% | 89% | `pool-db-core.test.ts` (65) |
| `db/sql.ts` | 100% | 90% | `sql.test.ts` (29) |
| `db/sqlite-backend.ts` | 98% | 92% | `sqlite-backend-core.test.ts` (64), `sqlite-backend-deep.test.ts` (75), `sqlite-backend-diag.test.ts` (28), `sqlite-backend-returning.test.ts` (26), `sqlite-backend-max.test.ts` (51), `sqlite-backend-ultimate.test.ts` (26) |
| `db/migrations/api-verification.ts` | 100% | 100% | `migrations-api-verification.test.ts` (22) |
| `db/migrations/context.ts` | 100% | 100% | `migrations-context.test.ts` (17) |
| `db/migrations/core.ts` | 98% | 100% | `migrations-core.test.ts` (21) |
| `db/migrations/embeddings.ts` | 100% | 100% | `migrations-embeddings.test.ts` (13) |
| `db/migrations/evm.ts` | 100% | 100% | `migrations-evm.test.ts` (13) |
| `db/migrations/features.ts` | 98% | 92% | `migrations-features.test.ts` (53) |
| `db/migrations/governance.ts` | 100% | 100% | `migrations-governance.test.ts` (25) |
| `db/migrations/index.ts` | 100% | 100% | — (barrel) |
| `db/migrations/kb.ts` | 100% | 100% | `migrations-kb-deep.test.ts` (14) |
| `db/migrations/models.ts` | 96% | 100% | — (tested via startup) |
| `db/migrations/provenance.ts` | 100% | 100% | `migrations-provenance.test.ts` (14), `migrations-provenance-deep.test.ts` (13) |
| `db/migrations/system.ts` | 96% | 50% | `migrations-system.test.ts` (26) |

### Models Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `models/api-keys.ts` | 97% | 100% | `api-keys.test.ts` (22) |
| `models/assignments.ts` | 97% | 89% | `assignments.test.ts` (30), `assignments-core.test.ts` (92), `assignments-deep.test.ts` (4), `coverage-max-batch.test.ts` |
| `models/budget.ts` | 100% | 94% | `budget.test.ts` (17), `budget-core.test.ts` (12), `budget-error.test.ts` (17), `budget-extended.test.ts` (53), `budget-max.test.ts` (15), `budget-ultimate.test.ts` (17) |
| `models/cost.ts` | 100% | 95% | `cost.test.ts` (7), `cost-core.test.ts` (39) |
| `models/embedding.ts` | 100% | 90% | `model-embedding.test.ts` (12), `embedding-deep.test.ts` (30) |
| `models/health.ts` | 93% | 77% | `model-health.test.ts` (14) |
| `models/providers.ts` | 99% | 93% | `providers.test.ts` (9), `providers-core.test.ts` (51), `providers-extended.test.ts` (34), `providers-deep.test.ts` (66), `providers-max.test.ts` (10), `providers-ultimate.test.ts` (31) |
| `models/registry.ts` | 98% | 97% | `model-registry.test.ts` (14) |
| `models/semaphore.ts` | 100% | 83% | `semaphore.test.ts` (4), `coverage-max-batch.test.ts` |
| `models/startup.ts` | 100% | 100% | `model-startup.test.ts` (8) |
| `models/tuning-registry.ts` | 95% | 80% | `tuning-registry.test.ts` (12), `tuning-registry-deep.test.ts` (4) |
| `models/types.ts` | 100% | 100% | `model-types.test.ts` (31), `model-types-extended.test.ts` (15) |

### Handlers Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `handlers/abstract-patterns.ts` | 100% | 100% | `abstract-patterns-handler.test.ts` (17) |
| `handlers/api-registry.ts` | 98% | 95% | `handler-api-registry.test.ts` (34), `api-registry-crud.test.ts` (25), `api-registry-handler.test.ts` (37), `api-registry-row.test.ts` (28) |
| `handlers/breakthrough-registry.ts` | 98% | 96% | `handler-breakthrough-registry.test.ts` (25), `breakthrough-registry.test.ts` (21), `breakthrough-registry-deep.test.ts` (28) |
| `handlers/config-tune/analysis.ts` | 97% | 95% | `config-tune-analysis.test.ts` (48), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |
| `handlers/config-tune/handler.ts` | 99% | 96% | `config-tune-handler.test.ts` (88), `config-tune-handler-deep.test.ts` (34) |
| `handlers/config-tune/helpers.ts` | 100% | 100% | `config-tune-helpers.test.ts` (25), `config-tune-helpers-core.test.ts` (36) |
| `handlers/config-tune/know-thyself.ts` | 98% | 97% | `config-tune-know-thyself.test.ts` (48) |
| `handlers/config-tune/types.ts` | 100% | 100% | — (type definitions) |
| `handlers/dedup.ts` | 97% | 83% | `dedup.test.ts` (12), `handler-dedup.test.ts` (15), `dedup-core.test.ts` (23), `dedup-deep.test.ts` (27), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |
| `handlers/discovery.ts` | 100% | 100% | `handler-discovery.test.ts` (20), `discovery.test.ts` (15) |
| `handlers/elevation.ts` | 93% | 83% | `handler-elevation.test.ts` (25), `elevation.test.ts` (18), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |
| `handlers/elite.ts` | 100% | 93% | `elite-handler.test.ts` (19) |
| `handlers/evm.ts` | 99% | 89% | `evm-handler.test.ts` (37), `evm-handler-core.test.ts` (78), `evm-handler-deep.test.ts` (6) |
| `handlers/feedback.ts` | 99% | 88% | `feedback-handler.test.ts` (32), `feedback.test.ts` (14) |
| `handlers/governance.ts` | 100% | 98% | `governance.test.ts` (41), `handler-governance.test.ts` (14), `governance-core.test.ts` (21), `governance-handler-core.test.ts` (67), `governance-deep.test.ts` (58) |
| `handlers/graph/modify.ts` | 96% | 90% | `graph-read-modify.test.ts` (49) |
| `handlers/graph/propose.ts` | 100% | 97% | `graph-propose.test.ts` (34), `graph-propose-deep.test.ts` (29) |
| `handlers/graph/query.ts` | 100% | 98% | `graph-query.test.ts` (25), `graph-query-deep.test.ts` (33) |
| `handlers/graph/read.ts` | 88% | 97% | `graph-read-modify.test.ts` (49) |
| `handlers/graph/validate.ts` | 100% | 96% | `graph-validate.test.ts` (16) |
| `handlers/knowledge-base.ts` | 99% | 86% | `knowledge-base-handler.test.ts` (37) |
| `handlers/knowledge.ts` | 98% | 97% | `knowledge.test.ts` (6), `handler-knowledge.test.ts` (63), `knowledge-deep.test.ts` (39) |
| `handlers/projects/bootstrap.ts` | 98% | 93% | `handlers-projects-bootstrap.test.ts` (30) |
| `handlers/projects/crud.ts` | 96% | 96% | `projects-crud.test.ts` (25), `projects-crud-deep.test.ts` (29), `coverage-ultimate-small.test.ts` |
| `handlers/projects/index.ts` | 100% | 100% | `handler-projects-index.test.ts` (12) |
| `handlers/projects/interview.ts` | 96% | 90% | `project-interview.test.ts` (16) |
| `handlers/projects/manifest.ts` | 100% | 100% | `handlers-projects-manifest.test.ts` (18) |
| `handlers/projects/meta.ts` | 100% | 100% | `handlers-projects-meta.test.ts` (17) |
| `handlers/projects/services.ts` | 92% | 80% | `handlers-projects-services.test.ts` (23) |
| `handlers/scaffold-handlers.ts` | 100% | 72% | `scaffold-handlers.test.ts` (10) |

### Routes Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `routes/activity.ts` | 94% | 100% | `route-activity.test.ts` (20) |
| `routes/api.ts` | 100% | 100% | `route-api.test.ts` (2) |
| `routes/api-registry.ts` | 95% | 85% | `route-api-registry-core.test.ts` (35), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |
| `routes/autotune.ts` | 100% | 100% | `route-autotune.test.ts` (15), `route-autotune-deep.test.ts` (12) |
| `routes/breakthrough-registry.ts` | 100% | 87% | — (tested via handler tests) |
| `routes/budget.ts` | 100% | 100% | `route-budget.test.ts` (24) |
| `routes/chat/crud.ts` | 95% | 81% | `route-chat-crud.test.ts` (17) |
| `routes/chat/index.ts` | 100% | 96% | `route-chat-index.test.ts` (12), `route-chat-index-deep.test.ts` (17) |
| `routes/chat/intents.ts` | 98% | 96% | `route-chat-intents.test.ts` (38), `route-chat-intents-deep.test.ts` (65), `chat-intents.test.ts` (22) |
| `routes/chat/settings.ts` | 100% | 100% | `chat-settings.test.ts` (6) |
| `routes/chat/tools.ts` | 100% | 92% | `chat-tools.test.ts` (13), `route-chat-tools-deep.test.ts` (29) |
| `routes/config-assist.ts` | 94% | 84% | `config-assist.test.ts` (35), `route-config-assist.test.ts` (50), `config-assist-max.test.ts` (55), `config-assist-ultimate.test.ts` (28) |
| `routes/config-routes.ts` | 100% | 95% | `route-config-routes.test.ts` (23) |
| `routes/config-tune.ts` | 100% | 97% | `route-config-tune-core.test.ts` (31), `route-config-tune-deep.test.ts` (57) |
| `routes/context.ts` | 100% | 85% | `route-context.test.ts` (21) |
| `routes/database.ts` | 100% | 74% | `route-database.test.ts` (28), `route-database-deep.test.ts` (45) |
| `routes/decisions.ts` | 100% | 100% | `route-decisions.test.ts` (14) |
| `routes/elite.ts` | 100% | 100% | `route-elite.test.ts` (15) |
| `routes/evm.ts` | 99% | 100% | `route-evm.test.ts` (47), `route-evm-deep.test.ts` (27) |
| `routes/feedback.ts` | 100% | 100% | `route-feedback.test.ts` (10) |
| `routes/health.ts` | 100% | 100% | `route-health.test.ts` (7) |
| `routes/keywords.ts` | 100% | 100% | `route-keywords.test.ts` (11) |
| `routes/knowledge-base.ts` | 100% | 100% | `route-knowledge-base.test.ts` (35), `route-kb-deep.test.ts` (15) |
| `routes/mcp-dispatch.ts` | 100% | 100% | `route-mcp-dispatch.test.ts` (6) |
| `routes/models.ts` | 98% | 99% | `route-models.test.ts` (23), `route-models-core.test.ts` (44), `route-models-deep.test.ts` (71) |
| `routes/partitions/crud.ts` | 96% | 81% | `route-partitions-crud.test.ts` (43) |
| `routes/partitions/exchange.ts` | 98% | 98% | `route-partitions-exchange.test.ts` (32), `partition-exchange.test.ts` (26), `route-exchange.test.ts` (17) |
| `routes/partitions/index.ts` | 100% | 100% | — (barrel) |
| `routes/partitions/transient.ts` | 99% | 95% | `route-partitions-transient.test.ts` (51), `partition-transient.test.ts` (30) |
| `routes/prompts.ts` | 98% | 96% | `route-prompts.test.ts` (25), `route-prompts-deep.test.ts` (17) |
| `routes/resonance.ts` | 97% | 82% | `route-resonance.test.ts` (34) |
| `routes/scaffold.ts` | 100% | 100% | `route-scaffold.test.ts` (13) |
| `routes/security.ts` | 99% | 82% | `route-security-core.test.ts` (44), `route-security-deep.test.ts` (19) |
| `routes/seeds.ts` | 100% | 100% | `route-seeds.test.ts` (11) |
| `routes/synthesis.ts` | 100% | 94% | `route-synthesis.test.ts` (33), `route-synthesis-deep.test.ts` (7) |

### EVM Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `evm/analysers/convergence-rate.ts` | 86% | 91% | `evm-analysers-impl.test.ts` (21) |
| `evm/analysers/curve-shape.ts` | 84% | 85% | `evm-analysers-impl.test.ts` |
| `evm/analysers/numerical-identity.ts` | 100% | 100% | `evm-analysers-impl.test.ts` |
| `evm/analysers/registry.ts` | 100% | 100% | `analyser-registry.test.ts` (9) |
| `evm/analysers/structural-mapping.ts` | 84% | 85% | `evm-analysers-impl.test.ts` |
| `evm/analysers/symbolic-identity.ts` | 100% | 100% | `evm-analysers-impl.test.ts` |
| `evm/analysers/threshold-behaviour.ts` | 84% | 85% | `evm-analysers-impl.test.ts` |
| `evm/analysis.ts` | 93% | 76% | `evm-analysis.test.ts` (16) |
| `evm/api/audit.ts` | 100% | 93% | `api-audit.test.ts` (14) |
| `evm/api/caller.ts` | 98% | 97% | `evm-caller.test.ts` (26), `evm-caller-deep.test.ts` (13), `api-caller.test.ts` (20), `evm-caller-max.test.ts` (4), `evm-caller-ultimate.test.ts` (22) |
| `evm/api/corrections.ts` | 100% | 88% | `api-corrections.test.ts` (15) |
| `evm/api/decision.ts` | 100% | 82% | `api-decision.test.ts` (21) |
| `evm/api/enrichment.ts` | 98% | 89% | `api-enrichment.test.ts` (24) |
| `evm/api/interpreter.ts` | 100% | 75% | `api-interpreter.test.ts` (14) |
| `evm/api/onboard.ts` | 97% | 90% | `api-onboard.test.ts` (16), `api-onboard-validation.test.ts` (24) |
| `evm/api/orchestrator.ts` | 97% | 82% | `api-orchestrator.test.ts` (15) |
| `evm/api/query-formulator.ts` | 100% | 92% | `api-query-formulator.test.ts` (9) |
| `evm/api/registry.ts` | 93% | 82% | `registry-core.test.ts` (39), `registry-row.test.ts` (18) |
| `evm/codegen.ts` | 96% | 85% | `codegen.test.ts` (30), `codegen-extended.test.ts` (54), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |
| `evm/evaluator.ts` | 98% | 92% | `evaluator.test.ts` (36) |
| `evm/feedback-progress.ts` | 90% | 66% | `feedback-progress-real.test.ts` (9), `reeval-progress.test.ts` (14) |
| `evm/feedback-query.ts` | 99% | 93% | `feedback-query.test.ts` (36) |
| `evm/feedback-reeval.ts` | 98% | 79% | `feedback-reeval.test.ts` (13), `feedback-reeval-core.test.ts` (17) |
| `evm/feedback-review.ts` | 97% | 96% | `feedback-review.test.ts` (12) |
| `evm/feedback.ts` | 93% | 71% | `feedback.test.ts` (14) |
| `evm/index.ts` | 99% | 92% | `evm-index.test.ts` (81), `evm-index-deep.test.ts` (18) |
| `evm/llm-eval.ts` | 95% | 76% | `llm-eval.test.ts` (13) |
| `evm/queue-worker.ts` | 98% | 83% | `evm-queue-worker.test.ts` (38) |
| `evm/queue.ts` | 100% | 93% | `evm-queue.test.ts` (27) |
| `evm/sandbox.ts` | 100% | 80% | `sandbox.test.ts` (9), `sandbox-core.test.ts` (28) |
| `evm/triage.ts` | 98% | 85% | `triage.test.ts` (17), `triage-core.test.ts` (36), `triage-extended.test.ts` (39), `triage-deep.test.ts` (32) |

### KB (Knowledge Base) Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `kb/hasher.ts` | 100% | 100% | `hasher.test.ts` (6), `kb-hasher.test.ts` (11) |
| `kb/pipeline/admin.ts` | 100% | 100% | `kb-admin.test.ts` (35) |
| `kb/pipeline/file-processing.ts` | 97% | 92% | `file-processing-core.test.ts` (58), `file-processing-deep.test.ts` (53), `kb-file-processing.test.ts` (46), `coverage-ultimate-small.test.ts` |
| `kb/pipeline/folder.ts` | 100% | 89% | `kb-folder.test.ts` (24) |
| `kb/pipeline/index.ts` | 0% | 100% | — (barrel re-export) |
| `kb/pipeline/queue.ts` | 96% | 80% | `kb-queue.test.ts` (17) |
| `kb/readers/code-reader.ts` | 100% | 100% | `code-reader.test.ts` (17) |
| `kb/readers/doc-reader.ts` | 85% | 93% | `doc-reader.test.ts` (16), `doc-reader-deep.test.ts` (10) |
| `kb/readers/image-reader.ts` | 93% | 72% | `image-reader.test.ts` (18) |
| `kb/readers/index.ts` | 100% | 100% | `reader-index.test.ts` (3) |
| `kb/readers/pdf-reader.ts` | 95% | 84% | `pdf-reader.test.ts` (20) |
| `kb/readers/registry.ts` | 100% | 100% | `reader-registry.test.ts` (21) |
| `kb/readers/sheet-reader.ts` | 96% | 84% | `sheet-reader.test.ts` (14), `sheet-reader-deep.test.ts` (17) |
| `kb/readers/text-reader.ts` | 95% | 93% | `text-reader.test.ts` (16), `text-reader-deep.test.ts` (12) |
| `kb/scanner.ts` | 100% | 100% | `scanner.test.ts` (15), `scanner-core.test.ts` (22) |
| `kb/watcher.ts` | 0% | 0% | — (untestable: side-effect imports) |

### Context Engine

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `context/api.ts` | 100% | 95% | `context-api.test.ts` (23), `context-api-deep.test.ts` (30) |
| `context/feedback.ts` | 100% | 90% | `context-feedback.test.ts` (55) |
| `context/knowledge.ts` | 98% | 93% | `context-knowledge.test.ts` (55) |
| `context/session.ts` | 100% | 100% | `context-session.test.ts` (22) |
| `context/topics.ts` | 96% | 84% | `context-topics.test.ts` (10), `context-topics-core.test.ts` (16), `context-topics-cluster.test.ts` (12), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |
| `context/types.ts` | 100% | 78% | `context-types.test.ts` (25) |

### Proxy Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `proxy/handler.ts` | 98% | 92% | `proxy-handler.test.ts` (56), `proxy-core.test.ts` (44) |
| `proxy/index.ts` | 0% | 0% | — (untestable: `app.listen()` at import) |
| `proxy/knowledge.ts` | 100% | 100% | `proxy-knowledge.test.ts` (15), `inject-knowledge.test.ts` (17) |
| `proxy/model-resolution.ts` | 100% | 100% | `proxy-model-resolution.test.ts` (42), `model-resolution.test.ts` (18) |

### Scaffold Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `scaffold/assemble.ts` | 100% | 100% | `scaffold-assemble.test.ts` (15), `assemble.test.ts` (10) |
| `scaffold/decompose.ts` | 100% | 89% | `scaffold-decompose.test.ts` (12), `decompose.test.ts` (11) |
| `scaffold/generate.ts` | 97% | 92% | `scaffold-generate.test.ts` (25) |
| `scaffold/index.ts` | 100% | 95% | `scaffold-index.test.ts` (34) |
| `scaffold/templates.ts` | 100% | 100% | `scaffold-templates.test.ts` (21) |
| `scaffold/verify.ts` | 100% | 93% | `scaffold-verify.test.ts` (27) |

### Server & Services

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `server.ts` | 93% | 78% | `server-core.test.ts` (31), `server-extended.test.ts` (28), `server-deep.test.ts` (47), `server-max.test.ts` (59), `server-ultimate.test.ts` (31) |
| `services/event-bus.ts` | 97% | 91% | `event-bus.test.ts` (18), `event-bus-deep.test.ts` (8) |
| `telegraphic.ts` | 98% | 98% | `telegraphic.test.ts` (63), `coverage-max-batch.test.ts`, `coverage-ultimate-small.test.ts` |

### MCP Layer

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `mcp/dispatch.ts` | 100% | 100% | `mcp-dispatch.test.ts` (23) |
| `mcp/schemas.ts` | 0% | 100% | — (schema definitions only) |

### Utils

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `utils/async-handler.ts` | 100% | 100% | `async-handler.test.ts` (8) |
| `utils/cached-settings.ts` | 100% | 100% | `cached-settings.test.ts` (8) |
| `utils/logger.ts` | 86% | 78% | `logger.test.ts` (95), `logger-core.test.ts` (71), `logger-max.test.ts` (29), `logger-ultimate.test.ts` (18) |

### Prompts (Static Data)

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `prompts/api.ts` | 100% | 100% | `prompts-api.test.ts` (18) |
| `prompts/backup.ts` | 94% | 75% | `prompts-backup.test.ts` (9) |
| `prompts/*.ts` (20 files) | 0% | 100% | — (string constants, no logic) |

### Other

| Source File | Stmts | Branches | Test Files |
|-------------|-------|----------|------------|
| `vector/embedding-cache.ts` | 100% | 100% | `embedding-cache.test.ts` (16), `embedding-cache-core.test.ts` (40) |

---

## API Integration Tests

The `tests/api/` directory contains 34 test files that test route handlers via supertest against assembled Express apps. These complement the unit tests by testing request/response contracts end-to-end through middleware chains.

| Test File | Tests | Coverage Area |
|-----------|-------|---------------|
| `activity.test.ts` | 10 | Activity feed endpoints |
| `api-registry.test.ts` | 23 | External API registry CRUD |
| `autotune.test.ts` | 12 | Auto-tune start/cancel/progress/apply |
| `breakthroughs.test.ts` | 9 | Breakthrough registry queries |
| `budget.test.ts` | 15 | Budget status/config/resume |
| `chat-conversations.test.ts` | 13 | Chat conversation CRUD |
| `chat-index.test.ts` | 9 | Chat message handling |
| `config-assist.test.ts` | 14 | Config assistant conversation |
| `config-tune.test.ts` | 26 | Config tuning suggestions/apply/snapshots |
| `config.test.ts` | 8 | Config get/save |
| `context.test.ts` | 12 | Context engine prepare/update/sessions |
| `database.test.ts` | 53 | Database admin operations |
| `decisions.test.ts` | 11 | Decision log queries |
| `elite.test.ts` | 13 | Elite pool stats/nodes/gaps |
| `evm.test.ts` | 20 | EVM verify/queue/history/reviews |
| `feedback.test.ts` | 12 | EVM feedback submission/stats |
| `flow-auth.test.ts` | 5 | Auth flow integration |
| `flow-chat.test.ts` | 2 | Chat flow integration |
| `flow-config-assist.test.ts` | 4 | Config assist flow |
| `flow-partition-exchange.test.ts` | 3 | Partition export/import flow |
| `health.test.ts` | 8 | Health check endpoint |
| `keywords.test.ts` | 11 | Keyword extraction |
| `knowledge-base.test.ts` | 26 | KB folder/file management |
| `mcp-dispatch.test.ts` | 8 | MCP tool dispatch |
| `models.test.ts` | 38 | Model registry/assignments/health |
| `partitions-exchange.test.ts` | 16 | Partition export/import |
| `partitions-transient.test.ts` | 20 | Transient partition lifecycle |
| `partitions.test.ts` | 25 | Partition CRUD/bridges |
| `prompts.test.ts` | 20 | Prompt template CRUD |
| `resonance.test.ts` | 33 | Graph query/propose/lineage |
| `scaffold.test.ts` | 15 | Research brief generation |
| `security.test.ts` | 30 | Auth tokens/admin/key management |
| `seeds.test.ts` | 18 | Seed node operations |
| `synthesis.test.ts` | 18 | Synthesis engine control |

---

## Coverage Exclusion Rationale

### Files intentionally at 0%

| Category | Files | Reason |
|----------|-------|--------|
| **Side-effect imports** | `proxy/index.ts`, `kb/watcher.ts` | Execute `app.listen()` or start watchers at import time. Cannot be imported in test without side effects. Would require refactoring to extract testable logic. |
| **Prompt templates** | 20 files in `prompts/` | Pure data exports (string templates, objects). No executable logic. 100% branch coverage (no branches). Content tested indirectly via consumer tests. |
| **Type/constant files** | `evm/api/types.ts`, `mcp/schemas.ts`, `core/autotune/scoring.ts`, `kb/pipeline/index.ts` | Type definitions, Zod schemas, or barrel re-exports. No runtime logic to test. |
| **Barrel re-exports** | `core.ts`, `db.ts`, `db/index.ts` | Re-export other modules. The actual implementations are tested directly. |
