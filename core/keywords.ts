/**
 * Keyword and synonym generation — LLM-enriched search discoverability.
 *
 * All generation functions are designed to be fire-and-forget:
 * they silently skip if no model is assigned to the 'keyword' subsystem.
 */

import { query } from '../db.js';
import { getPrompt } from '../prompts.js';
import { callSubsystemModel, getSubsystemAssignments } from '../models.js';
import { RC } from '../config/constants.js';

/**
 * Robust JSON array extraction — handles common LLM JSON quirks:
 * missing commas, trailing commas, single quotes, unquoted strings.
 *
 * Tries strict JSON.parse first, then falls back to regex-based extraction
 * of quoted strings from the array body.
 *
 * @param text - The raw LLM response text containing JSON.
 * @param key - The JSON key whose value is the target array (e.g. 'keywords', 'synonyms').
 * @returns An array of extracted strings, or null if the key/array is not found.
 */
function extractStringArray(text: string, key: string): string[] | null {
    // Try strict JSON parse first
    const jsonPattern = new RegExp(`\\{[\\s\\S]*"${key}"\\s*:\\s*\\[[\\s\\S]*?\\][\\s\\S]*?\\}`);
    const match = text.match(jsonPattern);
    if (match) {
        try {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed[key])) return parsed[key];
        } catch {
            // Fall through to lenient extraction
        }
    }

    // Lenient: find the array contents and extract quoted strings
    const arrayPattern = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`);
    const arrayMatch = text.match(arrayPattern);
    if (!arrayMatch) return null;

    const items = arrayMatch[1].match(/["']([^"']+)["']/g);
    if (!items || items.length === 0) return null;

    return items.map(s => s.replace(/^["']|["']$/g, ''));
}

// In-flight tracking to prevent duplicate concurrent generation
const inFlightNodes = new Set<string>();
const inFlightDomains = new Set<string>();

/**
 * Check if the 'keyword' subsystem has an assigned model.
 *
 * @returns `true` if a model is assigned to the 'keyword' subsystem, `false` otherwise.
 */
async function isKeywordSubsystemAvailable(): Promise<boolean> {
    try {
        const assignments = await getSubsystemAssignments();
        return (assignments as any).keyword != null;
    } catch {
        return false;
    }
}

/**
 * Generate LLM-enriched domain synonyms.
 * Called after rule-based synonyms are inserted for a new domain.
 * Falls back silently if no model is assigned to the 'keyword' subsystem.
 *
 * Uses in-flight tracking to prevent duplicate concurrent generation for the same domain.
 *
 * @param domain - The domain name to generate synonyms for.
 * @returns An array of newly generated synonym strings (may be empty on skip or failure).
 */
async function generateLLMDomainSynonyms(domain: string): Promise<string[]> {
    if (inFlightDomains.has(domain)) return [];
    inFlightDomains.add(domain);

    try {
        if (!await isKeywordSubsystemAvailable()) return [];

        // Get existing rule-based synonyms to avoid duplication
        const existing = await query(
            'SELECT synonym FROM domain_synonyms WHERE domain = $1',
            [domain]
        );
        const existingList = existing.map((r: any) => r.synonym).join(', ');

        const prompt = await getPrompt('keyword.domain_synonyms', {
            domain,
            existingSynonyms: existingList || '(none)',
        });

        const response = await callSubsystemModel('keyword', prompt, {
            temperature: RC.misc.keywordTemperature,
        });

        // Parse response — robust extraction handles malformed JSON
        const rawSynonyms = extractStringArray(response, 'synonyms');
        if (!rawSynonyms) return [];

        const synonyms = rawSynonyms
            .map((s: any) => String(s).toLowerCase().trim())
            .filter((s: string) => s.length > 1 && s.length < 50);

        // Store with source='llm'
        for (const synonym of synonyms) {
            try {
                await query(
                    `INSERT INTO domain_synonyms (domain, synonym, source) VALUES ($1, $2, 'llm') ON CONFLICT DO NOTHING`,
                    [domain, synonym]
                );
            } catch { /* ignore duplicates */ }
        }

        console.error(`[keywords] Generated ${synonyms.length} LLM synonyms for domain "${domain}"`);
        return synonyms;
    } catch (err: any) {
        console.error(`[keywords] LLM synonym generation failed for "${domain}": ${err.message}`);
        return [];
    } finally {
        inFlightDomains.delete(domain);
    }
}

/**
 * Generate keywords for a node via LLM and store them in `node_keywords`.
 * Non-blocking — intended to be called fire-and-forget.
 *
 * Uses in-flight tracking to prevent duplicate concurrent generation for the same node.
 * Content is truncated to 500 chars for prompt efficiency.
 *
 * @param nodeId - The UUID of the node to generate keywords for.
 * @param content - The node's text content.
 * @param domain - The node's domain (passed to the LLM for context).
 * @returns An array of generated keyword strings (may be empty on skip or failure).
 */
async function generateNodeKeywords(nodeId: string, content: string, domain: string): Promise<string[]> {
    if (inFlightNodes.has(nodeId)) return [];
    inFlightNodes.add(nodeId);

    try {
        if (!await isKeywordSubsystemAvailable()) return [];

        const prompt = await getPrompt('keyword.node_keywords', {
            content: content.slice(0, RC.contentLimits.keywordContentChars), // Truncate for prompt efficiency
            domain: domain || 'general',
        });

        const response = await callSubsystemModel('keyword', prompt, {
            temperature: RC.misc.keywordTemperature,
        });

        // Parse response — robust extraction handles malformed JSON
        const rawKeywords = extractStringArray(response, 'keywords');
        if (!rawKeywords) return [];

        const keywords = rawKeywords
            .map((k: any) => String(k).toLowerCase().trim())
            .filter((k: string) => k.length > 1 && k.length < 50);

        for (const keyword of keywords) {
            try {
                await query(
                    `INSERT INTO node_keywords (node_id, keyword, source) VALUES ($1, $2, 'llm') ON CONFLICT DO NOTHING`,
                    [nodeId, keyword]
                );
            } catch { /* ignore duplicates */ }
        }

        // Extract and store the node name if the LLM returned one
        // Suffix with first 3 chars of node ID (uppercase) for disambiguation
        try {
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (parsed.name && typeof parsed.name === 'string') {
                    const baseName = parsed.name.trim().slice(0, 195);
                    if (baseName.length > 0) {
                        const suffix = nodeId.replace(/-/g, '').slice(0, 3).toUpperCase();
                        const name = `${baseName}-${suffix}`;
                        await query('UPDATE nodes SET name = $1 WHERE id = $2 AND name IS NULL', [name, nodeId]);
                    }
                }
            }
        } catch { /* non-fatal — name extraction is best-effort */ }

        // Feed keywords into the specificity dictionary so future nodes in
        // this domain benefit from a richer technical terms list.
        if (keywords.length > 0) {
            try {
                const { addLearnedTerms } = await import('./specificity.js');
                addLearnedTerms(domain, keywords);
            } catch { /* non-fatal */ }
        }

        return keywords;
    } catch (err: any) {
        console.error(`[keywords] Node keyword generation failed for ${nodeId.slice(0, 8)}: ${err.message}`);
        return [];
    } finally {
        inFlightNodes.delete(nodeId);
    }
}

/**
 * Retrieve stored keywords for a node from the `node_keywords` table.
 *
 * @param nodeId - The UUID of the node.
 * @returns An array of keyword strings (may be empty if none exist).
 */
async function getNodeKeywords(nodeId: string): Promise<string[]> {
    const rows = await query(
        'SELECT keyword FROM node_keywords WHERE node_id = $1',
        [nodeId]
    );
    return rows.map((r: any) => r.keyword);
}

/**
 * Backfill: generate LLM synonyms for all active domains that only have rule-based ones.
 * Iterates all distinct domains in the graph and calls {@link generateLLMDomainSynonyms}
 * for each domain lacking `source='llm'` synonyms.
 *
 * @returns Counts of domains processed and total synonyms generated.
 */
async function backfillDomainSynonyms(): Promise<{ processed: number; generated: number }> {
    const domains = await query(
        'SELECT DISTINCT domain FROM nodes WHERE archived = FALSE AND domain IS NOT NULL'
    );

    let processed = 0;
    let generated = 0;
    for (const row of domains) {
        const hasLLM = await query(
            `SELECT 1 FROM domain_synonyms WHERE domain = $1 AND source = 'llm' LIMIT 1`,
            [(row as any).domain]
        );
        if (hasLLM.length === 0) {
            const synonyms = await generateLLMDomainSynonyms((row as any).domain);
            generated += synonyms.length;
            processed++;
        }
    }
    return { processed, generated };
}

/**
 * Backfill: generate keywords (and names) for nodes missing keywords or names.
 * Picks up nodes with no keywords AND nodes that have keywords but no name.
 * Processes in batches to avoid overwhelming the LLM. Nodes are ordered by
 * weight descending so higher-value nodes are processed first.
 *
 * @param batchSize - Maximum number of nodes to process in this run (default 20).
 * @returns Counts of nodes processed and total keywords generated.
 */
async function backfillNodeKeywords(batchSize: number = 20): Promise<{ processed: number; generated: number }> {
    const nodes = await query(
        `SELECT n.id, n.content, n.domain FROM nodes n
         LEFT JOIN node_keywords nk ON nk.node_id = n.id
         WHERE n.archived = FALSE AND (nk.node_id IS NULL OR n.name IS NULL)
         GROUP BY n.id
         ORDER BY n.weight DESC
         LIMIT $1`,
        [batchSize]
    );

    let processed = 0;
    let generated = 0;
    for (const node of nodes as any[]) {
        const keywords = await generateNodeKeywords(node.id, node.content, node.domain);
        generated += keywords.length;
        processed++;
    }
    return { processed, generated };
}

export {
    generateLLMDomainSynonyms,
    generateNodeKeywords,
    getNodeKeywords,
    backfillDomainSynonyms,
    backfillNodeKeywords,
    isKeywordSubsystemAvailable,
};
