/**
 * @module prompts/types
 *
 * Type definitions for the prompt management system.
 */

/** A registered prompt template with metadata and interpolation variables. */
export interface PromptDefinition {
    /** Unique prompt identifier (e.g. 'core.insight_synthesis'). */
    id: string;
    /** Category grouping (e.g. 'core', 'evm', 'chat', 'kb'). */
    category: string;
    /** Human-readable description of what this prompt does. */
    description: string;
    /** List of `{{variable}}` placeholder names used in the content template. */
    variables: string[];
    /** The prompt template content with `{{variable}}` placeholders. */
    content: string;
}

/** A single prompt override entry as stored in backup files. */
export interface PromptBackupEntry {
    /** Prompt identifier. */
    id: string;
    /** Locale code (e.g. 'en'). */
    locale: string;
    /** Category grouping. */
    category: string;
    /** The overridden prompt content. */
    content: string;
    /** Optional description override. */
    description: string | null;
    /** ISO timestamp of last update. */
    updated_at: string;
}

/** Structure of the prompts.bak JSON backup file. */
export interface PromptBackup {
    /** Backup format version. Currently always 1. */
    version: 1;
    /** ISO timestamp when the backup was created. */
    exported_at: string;
    /** Number of prompt entries in the backup. */
    count: number;
    /** Array of prompt override entries. */
    prompts: PromptBackupEntry[];
}
