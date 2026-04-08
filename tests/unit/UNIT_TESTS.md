# Unit Tests — tests/unit

This document describes all unit test files in `tests/unit/`, grouped by area. Each file tests specific modules or pure logic; many re-implement private helpers in the test file to avoid DB/IO dependencies.

---

## Config & Tuning

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **config-tune-helpers.test.ts** | `handlers/config-tune/helpers.ts` (re-implemented) | `getNestedValue` (path lookup, edge cases), `setNestedValue` (nested set, intermediate creation), `generateUuid` (UUID v4 format, uniqueness). |
| **config-sections.test.ts** | `config-sections/index.js` | Section metadata: valid tiers/categories, non-empty title/description/behavior, parameters and presets arrays; parameter metadata; section uniqueness; preset metadata. |
| **config-defaults.test.ts** | Config defaults | Top-level sections, threshold ranges, EVM sandbox safety, number variables, autonomous cycles; `DEFAULT_TEMPERATURES`, `DEFAULT_REPEAT_PENALTIES`. |
| **non-tunable.test.ts** | NON_TUNABLE set | Infrastructure keys excluded from tuning; tunable keys not excluded; set semantics. |
| **cached-settings.test.ts** | Cached loader | `createCachedLoader` behavior (caching, invalidation). |

---

## Security & Auth

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **security.test.ts** | `core/security.ts` | `SENSITIVE_CONFIG_PATHS` (EVM security paths); `isSensitiveConfigPath` (exact match, prefix, keywords: apiKey, secret, password; case-insensitive; edge cases). |
| **admin-token.test.ts** | Admin token module | `issueAdminToken`, `validateAdminToken`, `clearAll`, token TTL behavior. |
| **api-key-masking.test.ts** | API key masking | `maskApiKey`, `getApiKeyStatus`. |

---

## Integrity & Provenance

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **integrity.test.ts** | `core/integrity.ts` | Merkle DAG provenance (pure, no DB): `computeContentHash`, `computeLogEntryHash`, `computeMerkleRoot`, `verifyMerkleRoot`, `verifyLogChain`, `verifyPartitionIntegrity`. |
| **provenance.test.ts** | `core/provenance.js` | `buildProvenanceTag` (seed/voiced/synthesis/question, generation, kb/human/research hints, verification), `formatNodeWithProvenance`, provenance guide constants. |
| **provenance-tags.test.ts** | Provenance tags | Same surface as above; alternate/overlapping coverage of `buildProvenanceTag`, `formatNodeWithProvenance`. |

---

## Core / Synthesis & Graph

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **compute-trajectory.test.ts** | `core/synthesis-engine.ts` (re-implemented) | `computeTrajectoryAndWeight`: trajectory (knowledge vs abstraction), base weight, fitness scoring. |
| **validate-synthesis-pair.test.ts** | Synthesis pair validation | `validateSynthesisPair`: valid pairs, anti-tautology gate, similarity ceiling, minimum vocabulary, combined specificity gate. |
| **specificity.test.ts** | Specificity module | `measureSpecificity`. |
| **word-overlap.test.ts** | `handlers/dedup.ts` (re-implemented) | `computeWordOverlap`: Jaccard-like word overlap, identical/partial/no-overlap cases, min word length. |
| **cluster-selection.test.ts** | Cluster selection | `computeClusterEnergy`, `randomSample`. |
| **compute-centroid.test.ts** | Centroid computation | `computeCentroid` (embedding math). |
| **tensions.test.ts** | Tensions detection | `detectTensionSignals`. |

---

## Node Ops & Domain

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **node-ops.test.ts** | `core/node-ops.ts` | `toDomainSlug`: lowercase kebab-case, special chars, truncation (30 chars), trimming. |
| **domain-predicates.test.ts** | Domain predicates | `isSystemDomain`, `isTransientDomain`, shared semantics. |
| **scanner.test.ts** | `kb/scanner.ts` | `normalizePath` (backslashes → forward, UNC), `resolveDomain` (folder domain, subfolder sub-domain, special chars). |

---

## EVM (Verification, Sandbox, Codegen)

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **sandbox.test.ts** | `evm/sandbox.ts` (re-implemented) | `buildPreamble`: claim text injection, triple-quote escaping, `preflight_check`, `SYMMETRY_ALGEBRAIC_MAP`. |
| **codegen.test.ts** | `evm/codegen.ts` | Via `generateVerificationCode`: parseAndValidateCodegen (JSON/markdown), checkCodeSecurity (blocked modules/builtins), checkCodeQuality. |
| **evaluator.test.ts** | EVM evaluator | `evaluateResult`: sandbox failures, vacuous pass, boolean/numerical/convergence/pattern modes, assertion polarity, structured boolean fallback, unknown mode. |
| **analyser-registry.test.ts** | `evm/analysers/registry.ts` (re-implemented) | Registry: `registerAnalyser`, `getAnalyser`, `listAnalysers`; analyser interface (`getPromptContext`, `interpretResult`). |
| **triage.test.ts** | Triage | `normalizeTestCategory`, `routeTriage`. |
| **verify.test.ts** | Verify flow | `verifySection`. |

---

## Tool Calling & API

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **tool-calling.test.ts** | `core/tool-calling.js` | `estimateToolTokens`, `getToolDefinitions` (structure, read-only vs read-write). |
| **api-onboard-validation.test.ts** | `evm/api/onboard.ts` (re-implemented) | `validateApiName` (alphanumeric, hyphens, underscores); `cleanupStaleInterviews` (TTL-based cleanup). |
| **api-registry-row.test.ts** | API registry row mapping | `rowToEntry`: field mapping, integer→boolean, mode defaulting, JSON parsing, nullable fields. |

---

## Models & Registry

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **registry-row.test.ts** | `models/registry.ts` (re-implemented) | `rowToRegisteredModel`: id/name, provider normalization (ollama→local), tier/defaults, booleans (enabled, supportsTools, noThink), nullables. |
| **model-types.test.ts** | `models/types.ts` (re-implemented) | `normalizeProvider`, `getModelProvider`, `resolveProviderEndpoint`, `generateUuid`. |
| **model-resolution.test.ts** | Model resolution | `profileFromContextSize`, `estimateTokens`, `resolveSessionId`, `registeredToModelEntry`. |
| **providers.test.ts** | Providers | `extractTextContent`, `getUnsupportedParams`. |

---

## Context Engine & Knowledge

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **context-topics.test.ts** | `context/topics.ts` | `extractKeywords`. |
| **context-types.test.ts** | Context types | `estimateTokens`, `getBudgets`, `getModelProfiles`. |
| **extract-phrases.test.ts** | `context/topics.ts` (re-implemented) | `extractPhrases`: bigrams, stop words, frequency sort, lowercasing, non-alphanumeric strip. |
| **inject-knowledge.test.ts** | Knowledge injection | `injectKnowledge`: no existing system message, with existing, immutability, multi-turn, wrapper content. |
| **knowledge.test.ts** | Knowledge module | `injectKnowledge`. |

---

## Autotune & Reeval Progress

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **autotune-state.test.ts** | Autotune state | `setCancelFlag`, `getAutoTuneProgress`, `setTuneState`, `cancelAutoTune`, `resetAutoTune`. |
| **reeval-progress.test.ts** | `evm/feedback-progress.ts` (re-implemented) | Reeval state: idle/running/done; `getInMemoryProgress`, `reconcileInterrupted`, `resetProgress`; counters and timestamps. |

---

## Scoring, Embeddings, Cache

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **scoring.test.ts** | `core/scoring.js` | `parseEmbedding`, `l2Normalize`, embedding buffer roundtrip, `dotProduct`, `cosineSimilarity`, `detectInjection`. |
| **embedding-cache.test.ts** | Embedding cache | `EmbeddingCache` (get/set, eviction, keying). |
| **parse-embedding-field.test.ts** | Embedding field parsing | `parseEmbeddingField`. |

---

## DB & SQL

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **sql.test.ts** | `db/sql.js` | `translate` ($1→?, booleans, NOW/LEAST/GREATEST/ILIKE), `countFilter`, `withinDays`, `intervalAgo`, `weightedRandom`, `inverseWeightedRandom`, `getLineageQuery`, `getPatternSiblingsQuery`. |
| **sqlite-backend-returning.test.ts** | SQLite backend | `countPlaceholders`. |
| **pool-integration.test.ts** | Pool integration | `filterGenerationalReturn`. |
| **fitness.test.ts** | `db/pool-db.ts` (re-implemented) | `computeFitness` (breakthroughs, nodes, avgWeight, timesRecruited); `shouldReturn` (time_expired, max_cycles, cycle_exhaustion). |

---

## Number Variables

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **number-variables.test.ts** | `core/number-variables.ts` | `extractNumbers`, `extractScopeContext`, `extractVarIdsFromContent`, `buildVariableLegend`, `stripVariableNotation`. |

---

## Rate Limiting & Budget

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **rate-limit.test.ts** | Rate limiter | `RateLimiter` behavior. |
| **rate-limit-parse.test.ts** | Rate limit parsing | `isRateLimitError`, `parseRateLimitWaitMs` (minutes+seconds, minutes-only, seconds-only, no parseable time, ceiling). |
| **budget.test.ts** | Budget logic | `evaluateStatus`, `computeRetryAfterSeconds`. |
| **budget-error.test.ts** | Budget errors | `isBudgetError`. |

---

## Cost & Semaphore

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **cost.test.ts** | Cost model | `applyReasoningBonus`. |
| **semaphore.test.ts** | Semaphore | `acquireModelSlot`, `getModelConcurrencyInfo`. |

---

## Event Bus, Logger, Session

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **event-bus.test.ts** | Event bus | `emitActivity`, `emitActivityLocal`, `getRecentActivity`, `onActivity`. |
| **logger.test.ts** | Logger | `getLogFileName`, `shouldLog`, `formatLine`, `isEpipeMessage`. |
| **session-mgmt.test.ts** | Session management | `createSession`, `getSession`, `getOrCreateSession`, `clearAllSessions`. |

---

## Handlers & Projects

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **project-switching.test.ts** | `handlers/projects/meta.ts` (re-implemented) | `isProjectSwitching`, `setProjectSwitching`, `getProjectAbortSignal`, `resetAbortController`, project switch workflow. |
| **async-handler.test.ts** | Async handler wrapper | `asyncHandler` (error handling, async flow). |

---

## Scaffold (Research Briefs)

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **assemble.test.ts** | `scaffold/assemble.ts` (re-implemented) | `assemble`: sections in outline order, markdown vs plain, missing sections. |
| **decompose.test.ts** | `scaffold/decompose.ts` (re-implemented) | `extractJSON`: raw JSON, markdown code block, embedded in prose, nested objects, errors. |
| **templates.test.ts** | Templates | `defaultTemplates`. |

---

## Cycle State & Telegraphic

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **cycle-state.test.ts** | Cycle state | `makeCycleState`, `getCycleStatus`, `getAllCycleStatuses`, `abortableSleep`. |
| **telegraphic.test.ts** | Telegraphic compression | `computeEntropyScore`, `cleanup`, `extractStructuredContent`, `getCompressionStats`. |

---

## Utilities & Helpers

| File | Module Under Test | What It Tests |
|------|-------------------|---------------|
| **combinatorics.test.ts** | Combinatorics helpers | `clamp`, `round2`, `uniqueSorted`, `dedup`, `constrainGrid`, `generateCombos`, `generateRefinementCombos`, `groupByModel`, `consolidateReaders`. |
| **deep-merge.test.ts** | Deep merge | Primitives, nested objects, arrays, null/falsy, mutates target, real-world config example. |
| **priority-queue.test.ts** | Priority queue | Enqueue (empty, by priority, no input mutation, ordering stability). |
| **hasher.test.ts** | `kb/hasher.ts` | `hashString`: 64-char hex, deterministic, empty string, unicode, whitespace sensitivity. |
| **keywords.test.ts** | Keywords | `extractStringArray`. |
| **pattern-normalize.test.ts** | Pattern normalization | `normalizePatternName`, `isTransientDomain`. |

---

## Running Unit Tests

From the project root:

```bash
npm test -- tests/unit
```

Or a single file:

```bash
npm test -- tests/unit/security.test.ts
```

---

## Conventions

- **Re-implemented logic**: Many tests re-implement private or DB-dependent logic in the test file so they run without DB/mocks. The doc comments in each file usually state the source (e.g. `handlers/config-tune/helpers.ts`).
- **Mocks**: Files that import real modules use `jest.unstable_mockModule` for `db.js`, `config.js`, event-bus, etc., then dynamic `import()` after mocks.
- **Pure-first**: Preference for testing pure functions (hashing, path/normalization, scoring formulas, SQL translation) in isolation.

## In-code documentation

Unit test files are documented with:
- **File-level JSDoc**: Module under test, what is covered, and whether logic is re-implemented or imported.
- **Helper JSDoc**: Re-implemented functions and test helpers have `@param`/`@returns` or one-line purpose comments.
- **Describe-level comments**: Non-obvious describe blocks have a short comment above them (e.g. integrity hashes, provenance tag format).
