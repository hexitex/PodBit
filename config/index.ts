/**
 * @module config
 *
 * Configuration barrel — re-exports from defaults, loader, and types.
 * All existing imports from `'../config.js'` continue to work through this file.
 *
 * @see {@link ./types.ts} for the full PodbitConfig interface
 * @see {@link ./defaults.ts} for default values and VERSION
 * @see {@link ./loader.ts} for runtime config updates and persistence
 */
export type { PodbitConfig } from './types.js';
export { VERSION, config } from './defaults.js';
export { getSafeConfig, loadSavedConfig, updateConfig, resetSubsystemParams } from './loader.js';
export { config as default } from './defaults.js';
