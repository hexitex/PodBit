/**
 * @module prompts/loader
 *
 * Loads prompt template content and gold standard responses from `.prompt`
 * files on disk. Called at import time by category modules to populate
 * `PromptDefinition.content` without embedding natural language in code.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname_loader = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname_loader, 'templates');
const GOLD_STANDARDS_DIR = path.join(__dirname_loader, 'gold-standards');

/**
 * Load a prompt template from `prompts/templates/{category}/{id}.prompt`.
 * @param category - Subdirectory under templates/ (e.g. 'core', 'evm')
 * @param id       - Prompt ID used as the filename (e.g. 'core.insight_synthesis')
 * @returns The raw template string with `{{variable}}` placeholders
 * @throws If the file does not exist — this is a packaging error, not a runtime condition
 */
export function loadTemplate(category: string, id: string): string {
    const filePath = path.join(TEMPLATES_DIR, category, `${id}.prompt`);
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (err: any) {
        throw new Error(
            `Missing prompt template: ${filePath} (prompt ID: ${id}). ` +
            `Create the file or restore the content inline.`
        );
    }
}

/**
 * Load a gold standard response from `prompts/gold-standards/{category}/{promptId}.tier{tier}.prompt`.
 * @param category - Subdirectory under gold-standards/ (e.g. 'core', 'evm')
 * @param promptId - The prompt ID this gold standard belongs to
 * @param tier     - Quality tier (1 = ideal, 2 = good, 3 = acceptable)
 * @returns The gold standard response text
 * @throws If the file does not exist
 */
export function loadGoldStandard(category: string, promptId: string, tier: number): string {
    const filePath = path.join(GOLD_STANDARDS_DIR, category, `${promptId}.tier${tier}.prompt`);
    try {
        return fs.readFileSync(filePath, 'utf-8');
    } catch (err: any) {
        throw new Error(
            `Missing gold standard: ${filePath} (prompt: ${promptId}, tier: ${tier}). ` +
            `Create the file or restore the content inline.`
        );
    }
}
