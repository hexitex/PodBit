/**
 * Graph validate — pre-creation quality gates for proposed nodes.
 * @module handlers/graph/validate
 */

import { RC } from '../../config/constants.js';
import { query, measureSpecificity } from '../../core.js';
import { config as appConfig } from '../../config.js';

/**
 * Validate a proposal before accepting it into the graph.
 *
 * Checks (in order):
 * 1. Minimum content length (5 words) and maximum (200 words)
 * 2. Generic/filler phrase ratio against configurable patterns
 * 3. Exact and high-overlap duplicate detection within the domain
 * 4. Junk filter — rejects content similar to previously junked nodes (70% threshold)
 * 5. Specificity check for synthesis/breakthrough node types
 *
 * @param content - The proposed node content text.
 * @param domain - Target domain (null for unscoped proposals).
 * @param nodeType - The proposed node type ('seed', 'synthesis', 'breakthrough', etc.).
 * @returns Object with `accepted: boolean`, and on rejection: `reason`, `scores`, `suggestion`.
 */
async function validateProposal(content: string, domain: string | null, nodeType: string) {
    const scores: Record<string, any> = {};

    // 1. Minimum content quality — reject empty, too short, or too generic
    const wordCount = content.trim().split(/\s+/).length;
    scores.wordCount = wordCount;

    if (wordCount < 5) {
        return { accepted: false, reason: 'Content too short (minimum 5 words)', scores, suggestion: 'Provide a more detailed claim or insight.' };
    }

    if (wordCount > RC.contentLimits.maxNodeWords) {
        return { accepted: false, reason: `Content too long (maximum ${RC.contentLimits.maxNodeWords} words). Nodes should be atomic insights.`, scores, suggestion: 'Break this into multiple smaller, focused nodes.' };
    }

    // 2. Generic/filler detection — reject content that's all vague hand-waving
    const nv = appConfig.nodeValidation;
    const genericPatterns = [
        ...nv.genericStartPatterns.map(p => new RegExp(p, 'i')),
        ...nv.genericFillerPatterns.map(p => new RegExp(p, 'gi')),
    ];
    let genericHits = 0;
    for (const pattern of genericPatterns) {
        const matches = content.match(pattern);
        if (matches) genericHits += matches.length;
    }
    const genericRatio = genericHits / wordCount;
    scores.genericRatio = Math.round(genericRatio * 100) / 100;

    if (genericRatio > nv.genericRatioThreshold && wordCount < nv.genericMinWordCount) {
        return { accepted: false, reason: 'Content is too generic/vague. Nodes should contain specific claims, mechanisms, or predictions.', scores, suggestion: 'Add specific details, numbers, or testable claims.' };
    }

    // 3. Duplicate detection — check for near-exact matches in the same domain
    if (domain) {
        const existing = await query(`
            SELECT id, content FROM nodes
            WHERE archived = FALSE AND domain = $1
            ORDER BY weight DESC
            LIMIT 50
        `, [domain]);

        const contentLower = content.toLowerCase().trim();
        for (const node of existing) {
            const nodeLower = node.content.toLowerCase().trim();
            // Exact match
            if (contentLower === nodeLower) {
                return { accepted: false, reason: 'Exact duplicate already exists in this domain.', scores: { ...scores, duplicateOf: node.id } };
            }
            // High substring overlap (>80% of words match)
            const contentWords = new Set(contentLower.split(/\s+/).filter((w: string) => w.length > 3));
            const nodeWords = new Set(nodeLower.split(/\s+/).filter((w: string) => w.length > 3));
            if (contentWords.size > 0 && nodeWords.size > 0) {
                const overlap = [...contentWords].filter((w: string) => nodeWords.has(w)).length;
                const overlapRatio = overlap / Math.min(contentWords.size, nodeWords.size);
                if (overlapRatio > 0.85) {
                    return { accepted: false, reason: `Very similar to existing node (${Math.round(overlapRatio * 100)}% word overlap).`, scores: { ...scores, similarTo: node.id, overlapRatio }, suggestion: 'Rephrase with novel insight or propose as a child of the existing node.' };
                }
            }
        }
    }

    // 3b. Junk filter — check against nodes previously marked as junk
    //     Prioritize same-domain junk (most relevant), then cross-domain.
    const junkLimit = appConfig.magicNumbers?.junkFilterLimit || RC.queryLimits.junkFilterPoolSize;
    const junkNodes = await query(`
        SELECT id, content, domain FROM nodes
        WHERE junk = 1
        ORDER BY CASE WHEN domain = $1 THEN 0 ELSE 1 END, created_at DESC
        LIMIT $2
    `, [domain || '', junkLimit]);

    if (junkNodes.length > 0) {
        const contentLower = content.toLowerCase().trim();
        const contentWords = new Set(contentLower.split(/\s+/).filter((w: string) => w.length > 3));

        for (const junk of junkNodes) {
            const junkLower = junk.content.toLowerCase().trim();

            // Exact match against junk
            if (contentLower === junkLower) {
                return { accepted: false, reason: 'Content matches a previously junked node.', scores: { ...scores, matchesJunk: junk.id }, suggestion: 'This content was previously rejected as low quality.' };
            }

            // Lower threshold (70%) for junk similarity — be more aggressive
            const junkWords = new Set(junkLower.split(/\s+/).filter((w: string) => w.length > 3));
            if (contentWords.size > 0 && junkWords.size > 0) {
                const overlap = [...contentWords].filter(w => junkWords.has(w)).length;
                const overlapRatio = overlap / Math.min(contentWords.size, junkWords.size);
                if (overlapRatio > 0.70) {
                    return { accepted: false, reason: `Too similar to a junked node (${Math.round(overlapRatio * 100)}% overlap with junk ${junk.id.slice(0, 8)}).`, scores: { ...scores, matchesJunk: junk.id, junkOverlap: overlapRatio }, suggestion: 'This is similar to content previously marked as low quality. Substantially rework the idea.' };
                }
            }
        }
    }

    // 4. Specificity check for synthesis/breakthrough — require substance
    if (nodeType === 'breakthrough' || nodeType === 'synthesis') {
        const specificity = measureSpecificity(content, domain);
        scores.specificity = specificity;

        if (nodeType === 'breakthrough' && specificity < 0.10) {
            return { accepted: false, reason: 'Breakthroughs require higher specificity (concrete terms, numbers, mechanisms). Score: ' + specificity.toFixed(3), scores, suggestion: 'Add specific predictions, measurements, or mechanisms. Use "synthesis" for general insights.' };
        }
    }

    return { accepted: true, scores };
}

export { validateProposal };
