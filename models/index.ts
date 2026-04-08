/**
 * Model pool -- unified interface for calling different LLM providers and tiers.
 *
 * Re-exports from all sub-modules to maintain the original public API.
 * Consumers should import from 'models/index.js' rather than individual sub-modules.
 *
 * Sub-modules:
 * - **types** -- Core type definitions (ModelEntry, RegisteredModel, Subsystem, etc.)
 * - **api-keys** -- Provider API key management and settings persistence
 * - **providers** -- Provider-specific LLM calling (Anthropic, OpenAI, Ollama)
 * - **embedding** -- Text embedding generation across providers
 * - **cost** -- Usage logging and cost aggregation
 * - **registry** -- Model registry CRUD and context size detection
 * - **assignments** -- Subsystem-to-model mapping, callSubsystemModel, consultant escalation
 * - **health** -- Model connectivity checks and ensemble calling
 * - **budget** -- Spending limits with automatic service pause/resume
 * - **tuning-registry** -- Save/restore per-model inference params on assignment swap
 * - **semaphore** -- Per-model concurrency and rate control
 * - **startup** -- One-time initialization sequence
 * @module models
 */

// Types
export type { ModelEntry, ImageInput, CallOptions, CallWithMessagesOptions, CallWithMessagesResult, RegisteredModel, Subsystem, LlmUsage, LlmCallResult } from './types.js';
export { VALID_SUBSYSTEMS } from './types.js';

// API keys & config
export { getApiKey, loadApiKeys, setApiKeys, getApiKeyStatus } from './api-keys.js';

// Provider calling
export { callSingleModel, callWithMessages, setConversationalLogging, isConversationalLogging, extractTextContent, getUnsupportedParams, loadUnsupportedParamsCache } from './providers.js';

// Embeddings
export { getEmbeddingModelName, getEmbedding } from './embedding.js';

// Cost tracking
export { getCostSummary, getCostTimeSeries, getCostDetails, getCostExportRows, resetCostTracker, applyReasoningBonus, logUsage } from './cost.js';
export type { LogUsageParams, CostSummaryOptions, TimeSeriesOptions, CostDetailsOptions, Granularity } from './cost.js';

// Registry CRUD
export { getRegisteredModels, registerModel, updateRegisteredModel, deleteRegisteredModel, detectContextSize } from './registry.js';

// Assignments
export { getSubsystemAssignments, setSubsystemAssignment, setSubsystemNoThink, getNoThinkOverrides, getThinkingLevelOverrides, setSubsystemThinking, callSubsystemModel, hasConsultant, callConsultantModel, consultantReview, setConsultantAssignment, getConsultantAssignments, acquireModelSlot, getAssignedModel, isProjectOverride, getProjectOverrides, resetProjectAssignment, resetAllProjectAssignments } from './assignments.js';
export type { ConsultantReviewResult } from './assignments.js';

// Health
export { checkModelHealth, callEnsemble, healthCheck } from './health.js';

// Budget control
export { isBudgetExceeded, getBudgetStatus, initBudgetSystem, stopBudgetSystem, loadBudgetConfig, updateBudgetConfig, forceResume, computeRetryAfterSeconds } from './budget.js';
export type { BudgetConfig, BudgetStatus, BudgetPeriod, BudgetCosts } from './budget.js';

// Tuning Registry (subsystem inference params only)
export { saveToRegistry, restoreFromRegistry, deleteRegistryEntry, incrementTuningChanges } from './tuning-registry.js';

// Startup
export { loadSavedModels } from './startup.js';
