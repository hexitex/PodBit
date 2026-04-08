/**
 * Specificity measurement for node content.
 *
 * Scores how concrete/specific a piece of text is by counting numbers,
 * technical terms, concrete nouns, and measurement units. Used during
 * node creation to populate the `specificity` column.
 *
 * The technical terms dictionary grows automatically: when the keyword
 * subsystem extracts keywords from a newly seeded node, those keywords
 * are added to the domain's term list via `addLearnedTerms`. On startup,
 * `loadLearnedTerms` hydrates the in-memory cache from the `node_keywords`
 * table so terms survive restarts.
 */

import { config } from './engine-config.js';

// In-memory learned terms — populated from node_keywords on startup,
// updated live as new nodes are created and keywords extracted.
const learnedTerms: Map<string, Set<string>> = new Map();

/**
 * Add keywords as learned technical terms for a domain.
 * Called by the keyword generator after extracting keywords from new nodes.
 * Terms are deduplicated against existing config terms and prior learned terms.
 *
 * @param domain - The domain to add terms for.
 * @param terms - Array of keyword strings to add.
 */
function addLearnedTerms(domain: string, terms: string[]): void {
    if (!domain || !terms.length) return;
    const maxPerDomain = config.specificity.maxLearnedTermsPerDomain ?? 500;
    let domainSet = learnedTerms.get(domain);
    if (!domainSet) {
        domainSet = new Set();
        learnedTerms.set(domain, domainSet);
    }
    // Get config terms for this domain to avoid duplicating
    const configTerms = new Set(
        (config.specificity.technicalTerms[domain] || []).map(t => t.toLowerCase()),
    );
    for (const term of terms) {
        const lower = term.toLowerCase().trim();
        if (lower.length < 2 || lower.length > 60) continue;
        if (configTerms.has(lower)) continue;
        if (domainSet.size >= maxPerDomain) break;
        domainSet.add(lower);
    }
}

/**
 * Load learned terms from the node_keywords table, grouped by domain.
 * Called once at startup to hydrate the in-memory cache so that terms
 * discovered in previous sessions are available for specificity scoring.
 */
async function loadLearnedTerms(): Promise<void> {
    try {
        const { query } = await import('../db.js');
        const rows: any[] = await query(
            `SELECT nk.keyword, n.domain
             FROM node_keywords nk
             JOIN nodes n ON n.id = nk.node_id
             WHERE n.archived = FALSE AND n.domain IS NOT NULL
             GROUP BY nk.keyword, n.domain`,
        );
        let count = 0;
        for (const row of rows) {
            addLearnedTerms(row.domain, [row.keyword]);
            count++;
        }
        if (count > 0) {
            const domains = learnedTerms.size;
            console.log(`  ✓ Loaded ${count} learned technical terms across ${domains} domain(s)`);
        }
    } catch (err: any) {
        console.error(`[specificity] Failed to load learned terms: ${err.message}`);
    }
}

/** Get the current count of learned terms (for diagnostics). */
function getLearnedTermsCount(): { total: number; byDomain: Record<string, number> } {
    let total = 0;
    const byDomain: Record<string, number> = {};
    for (const [domain, terms] of learnedTerms) {
        byDomain[domain] = terms.size;
        total += terms.size;
    }
    return { total, byDomain };
}

/**
 * Retrieve the merged technical term dictionaries — config defaults + learned.
 *
 * Config terms are the static defaults (mechanical, software, biology, etc.).
 * Learned terms come from the keyword subsystem extracting keywords from
 * seeded nodes. The merge is done per-domain: if a domain exists only in
 * learned terms (not in config), it appears as a new domain in the result.
 *
 * @returns A record mapping domain names to arrays of technical term strings.
 */
function getTechnicalTerms(): Record<string, string[]> {
    const configTerms = config.specificity.technicalTerms;
    if (learnedTerms.size === 0) return configTerms;

    // Merge: config terms + learned terms per domain
    const merged: Record<string, string[]> = { ...configTerms };
    for (const [domain, terms] of learnedTerms) {
        const existing = merged[domain] || [];
        const existingSet = new Set(existing.map(t => t.toLowerCase()));
        const newTerms = [...terms].filter(t => !existingSet.has(t));
        merged[domain] = [...existing, ...newTerms];
    }
    return merged;
}

/**
 * Score how concrete/specific a piece of content is.
 *
 * Computes a weighted sum of four signals:
 * 1. **Numbers** — decimals, percentages, fractions (weight: `numberWeight`).
 * 2. **Technical terms** — domain-specific or cross-domain terms from config (weight: `techTermWeight`).
 * 3. **Concrete nouns** — capitalized words not at sentence start (heuristic) (weight: `concreteNounWeight`).
 * 4. **Units** — measurement units matching `unitPattern` from config (weight: `unitWeight`).
 *
 * @param content - The text to measure.
 * @param domain - Optional domain name; when provided, only that domain's technical terms are checked
 *   instead of all domains' terms.
 * @returns A per-word specificity density (higher = more specific, typically 0-1).
 */
function measureSpecificity(content: string, domain: string | null = null): number {
    const text = content.toLowerCase();

    // Count numbers (including decimals, percentages, fractions)
    const numbers = (text.match(/\d+\.?\d*%?/g) || []).length;

    // Count technical terms
    let techTermCount = 0;
    const terms = getTechnicalTerms();
    const allTerms = domain && terms[domain]
        ? terms[domain]
        : Object.values(terms).flat();

    for (const term of allTerms) {
        // Use word boundary matching to avoid false positives (e.g., "din" in "understanding")
        const escaped = term.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp(`\\b${escaped}\\b`, 'i');
        if (re.test(text)) {
            techTermCount++;
        }
    }

    // Count concrete nouns — capitalized words mid-sentence (proper nouns, named entities).
    // Matches any capitalized word (3+ chars) preceded by lowercase text.
    // Common sentence connectors are excluded to reduce false positives.
    const COMMON_CAPS = new Set([
        'the', 'this', 'that', 'these', 'those', 'however', 'therefore',
        'moreover', 'furthermore', 'although', 'because', 'while', 'when',
        'where', 'which', 'both', 'each', 'every', 'such', 'other',
    ]);
    const capsMatches = content.match(/(?<=\b[a-z]+\s+)[A-Z][a-z]{2,}/g) || [];
    const adjustedConcreteNouns = capsMatches.filter(w => !COMMON_CAPS.has(w.toLowerCase())).length;

    // Count specific units (pattern from config)
    const unitRe = new RegExp(config.specificity.unitPattern, 'gi');
    const units = (text.match(unitRe) || []).length;

    // Weighted sum using config values, normalized by word count
    const weights = config.specificity;
    const rawScore = numbers * weights.numberWeight +
           techTermCount * weights.techTermWeight +
           adjustedConcreteNouns * weights.concreteNounWeight +
           units * weights.unitWeight;

    // Normalize to per-word density so score is bounded and comparable
    // across different content lengths
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    return wordCount > 0 ? rawScore / wordCount : 0;
}

export { measureSpecificity, addLearnedTerms, loadLearnedTerms, getLearnedTermsCount };
