/**
 * @module prompts/api
 *
 * Core prompt resolution and CRUD API. Implements a three-layer lookup:
 * 1. In-memory cache (instant)
 * 2. Database overrides (system DB `prompts` table)
 * 3. Hardcoded defaults (from `defaults.ts`)
 *
 * Variable interpolation replaces `{{key}}` placeholders with provided values.
 * Cache is invalidated on save/delete operations.
 */

import { systemQuery as query, systemQueryOne as queryOne } from '../db.js';
import { DEFAULT_PROMPTS } from './defaults.js';
import type { PromptDefinition } from './types.js';

// =============================================================================
// CACHE
// =============================================================================

/** In-memory prompt content cache, keyed by `${id}::${locale}`. */
const cache = new Map<string, string>();

/**
 * Builds a composite cache key from prompt id and locale.
 * @param id - The prompt identifier
 * @param locale - The locale code
 * @returns Composite cache key string
 */
function cacheKey(id: string, locale: string): string {
    return `${id}::${locale}`;
}

/**
 * Clears the in-memory prompt cache for a specific prompt/locale combination.
 * The next `getPrompt` call for this id/locale will re-read from the DB.
 * @param id - The prompt identifier to invalidate
 * @param locale - The locale code to invalidate
 */
export function invalidateCache(id: string, locale: string) {
    cache.delete(cacheKey(id, locale));
}

// =============================================================================
// CORE API
// =============================================================================

/**
 * Resolve a prompt by ID, with variable interpolation.
 * Checks: cache -> DB override -> hardcoded default.
 *
 * @param id      Prompt ID (e.g. 'core.insight_synthesis')
 * @param vars    Variables to interpolate into {{placeholders}}
 * @param locale  Locale code (default 'en')
 * @returns       The interpolated prompt string
 */
export async function getPrompt(id: string, vars: Record<string, string> = {}, locale: string = 'en'): Promise<string> {
    const ck = cacheKey(id, locale);

    // 1. Check in-memory cache
    let template = cache.get(ck);

    // 2. Check DB override
    if (template === undefined) {
        try {
            const row = await queryOne(
                'SELECT content FROM prompts WHERE id = $1 AND locale = $2',
                [id, locale]
            );
            if (row?.content) {
                const content: string = row.content;
                template = content;
                cache.set(ck, content);
            }
        } catch {
            // Table may not exist yet during bootstrap
        }
    }

    // 3. Fall back to hardcoded default
    if (template === undefined) {
        const def = DEFAULT_PROMPTS[id];
        if (!def) {
            throw new Error(`Unknown prompt ID: ${id}`);
        }
        template = def.content;
        cache.set(ck, template);
    }

    // 4. Interpolate variables
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

/**
 * List all prompts, merging hardcoded defaults with any DB overrides.
 * Each entry includes an `override` flag indicating whether the content
 * has been customized in the database.
 * @param locale - Locale code to filter overrides (default 'en')
 * @returns Array of prompt definitions with override status
 */
export async function listPrompts(locale: string = 'en'): Promise<Array<PromptDefinition & { override?: boolean }>> {
    // Start with defaults
    const result: Array<PromptDefinition & { override?: boolean }> = Object.values(DEFAULT_PROMPTS).map(d => ({
        ...d,
        override: false,
    }));

    // Overlay DB overrides
    try {
        const overrides = await query(
            'SELECT id, content, description FROM prompts WHERE locale = $1',
            [locale]
        );
        for (const row of overrides) {
            const existing = result.find(r => r.id === row.id);
            if (existing) {
                existing.content = row.content;
                if (row.description) existing.description = row.description;
                existing.override = true;
            }
        }
    } catch {
        // Table may not exist yet
    }

    return result;
}

/**
 * Save a prompt override to the database. Upserts the content and invalidates
 * the in-memory cache so subsequent reads pick up the new version.
 * @param id - Prompt identifier to override
 * @param locale - Locale code for the override
 * @param content - New prompt template content
 * @param description - Optional description override (null preserves existing)
 */
export async function savePrompt(id: string, locale: string, content: string, description?: string): Promise<void> {
    const def = DEFAULT_PROMPTS[id];
    const category = def?.category || 'custom';

    await query(
        `INSERT INTO prompts (id, category, locale, content, description, updated_at)
         VALUES ($1, $2, $3, $4, $5, datetime('now'))
         ON CONFLICT (id, locale) DO UPDATE SET
             content = $4,
             description = COALESCE($5, prompts.description),
             updated_at = datetime('now')`,
        [id, category, locale, content, description || null]
    );

    invalidateCache(id, locale);
}

/**
 * Delete a prompt override from the database, reverting to the hardcoded default.
 * @param id - Prompt identifier to revert
 * @param locale - Locale code (default 'en')
 */
export async function deletePromptOverride(id: string, locale: string = 'en'): Promise<void> {
    await query(
        'DELETE FROM prompts WHERE id = $1 AND locale = $2',
        [id, locale]
    );
    invalidateCache(id, locale);
}

/**
 * Preview a prompt with test variables. Resolves the prompt through the
 * normal lookup chain (cache -> DB -> default) and interpolates the
 * provided variables.
 * @param id - Prompt identifier to preview
 * @param locale - Locale code
 * @param vars - Variables to interpolate into `{{placeholder}}` slots
 * @returns The fully interpolated prompt string
 */
export async function previewPrompt(id: string, locale: string, vars: Record<string, string>): Promise<string> {
    return getPrompt(id, vars, locale);
}
