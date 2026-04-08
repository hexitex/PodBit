/**
 * @module prompts
 *
 * Prompt management system for Podbit. Provides a layered prompt resolution
 * pipeline: in-memory cache -> database overrides -> hardcoded defaults.
 *
 * Re-exports prompt definitions, backup utilities, and the core CRUD API
 * for prompt templates with variable interpolation.
 */

export type { PromptDefinition, PromptBackupEntry, PromptBackup } from './types.js';
export type { DefaultGoldStandard } from './gold-standards.js';
export { DEFAULT_PROMPTS } from './defaults.js';
export { DEFAULT_GOLD_STANDARDS } from './gold-standards.js';
export { getPrompt, listPrompts, savePrompt, deletePromptOverride, previewPrompt } from './api.js';
export { backupPrompts, restorePrompts, getBackupInfo } from './backup.js';
