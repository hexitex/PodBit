/**
 * @module scaffold/verify
 *
 * Section verification and cross-section coherence checking for research briefs.
 *
 * Verifies individual sections against their constraints (forbidden terms as hard
 * failures, required terms as soft warnings). Checks cross-section coherence for
 * terminology consistency, contradictions, and conclusion coverage of body topics.
 */

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify a section's content against its outline constraints.
 *
 * Checks:
 * - **must_avoid** terms: hard failures (content contains forbidden terms)
 * - **must_include** terms: soft warnings only (passed to LLM on retry as hints,
 *   never cause rejection, since substring matching is too brittle)
 *
 * @param content - The generated section content text
 * @param constraints - Constraint object with must_include and must_avoid arrays
 * @returns Object with `valid` boolean, `failures` array (includes both failures and
 *          warnings), and `wordCount`
 */
export function verifySection(content: string, constraints: any) {
    const failures: any[] = [];
    const warnings: any[] = [];

    const wordCount = content.split(/\s+/).length;

    // must_include: soft warnings only. These get passed to the model on retry
    // as hints but never cause rejection. Substring matching is too brittle to
    // gate generation on — a perfect conclusion shouldn't be rejected because it
    // says "in closing" instead of "final summary".
    const contentLower = content.toLowerCase();
    for (const term of constraints.must_include) {
        if (!contentLower.includes(term.toLowerCase())) {
            warnings.push({
                type: 'missing_term',
                message: `Consider including: ${term}`
            });
        }
    }

    // must_avoid: hard failures. Forbidden content is a real quality signal.
    for (const term of constraints.must_avoid || []) {
        if (contentLower.includes(term.toLowerCase())) {
            failures.push({
                type: 'forbidden_term',
                message: `Contains forbidden term: ${term}`
            });
        }
    }

    return {
        valid: failures.length === 0,
        failures: [...failures, ...warnings],
        wordCount
    };
}

// =============================================================================
// COHERENCE CHECKING
// =============================================================================

/**
 * Check cross-section coherence of the generated document.
 *
 * Performs three checks:
 * 1. **Terminology consistency** - detects variant terms across sections
 * 2. **Contradictions** - placeholder for LLM-based contradiction detection
 * 3. **Conclusion coverage** - verifies the conclusion addresses body section topics
 *
 * @param sections - Map of section ID to generated content
 * @param outline - The document outline with section definitions
 * @returns Array of issue objects with type, message, sections, and suggested fixes
 */
export async function checkCoherence(sections: Record<string, any>, outline: any) {
    const issues: any[] = [];

    // Check terminology consistency across sections
    const _allContent = Object.values(sections).join(' ');
    const terminologyIssues = checkTerminologyConsistency(sections);
    issues.push(...terminologyIssues);

    // Check for contradictions
    const contradictions = await checkContradictions(sections);
    issues.push(...contradictions);

    // Check that conclusion reflects body
    if (sections.conclusion && Object.keys(sections).length > 1) {
        const coverageIssues = checkConclusionCoverage(sections, outline);
        issues.push(...coverageIssues);
    }

    return issues;
}

/**
 * Check for inconsistent terminology usage across sections.
 *
 * Scans for known variant groups (e.g., "quality class" vs "quality grade" vs
 * "quality level") and reports when multiple variants appear across sections.
 *
 * @param sections - Map of section ID to content text
 * @returns Array of terminology_inconsistency issues with affected sections and suggested canonical term
 */
function checkTerminologyConsistency(sections: Record<string, any>) {
    const issues: any[] = [];
    const termVariants: Record<string, any[]> = {};

    // Common term variants to check
    const variantGroups = [
        ['quality class', 'quality grade', 'quality level'],
        ['gear ratio', 'ratio', 'transmission ratio'],
        // Add more as needed
    ];

    for (const [sectionId, content] of Object.entries(sections)) {
        const contentLower = (content as string).toLowerCase();

        for (const group of variantGroups) {
            for (const variant of group) {
                if (contentLower.includes(variant)) {
                    if (!termVariants[group[0]]) {
                        termVariants[group[0]] = [];
                    }
                    termVariants[group[0]].push({ section: sectionId, variant });
                }
            }
        }
    }

    // Check for inconsistencies
    for (const [canonical, usages] of Object.entries(termVariants)) {
        const uniqueVariants = [...new Set((usages as any[]).map((u: any) => u.variant))];
        if (uniqueVariants.length > 1) {
            issues.push({
                type: 'terminology_inconsistency',
                message: `Inconsistent terminology: "${uniqueVariants.join('" vs "')}"`,
                sections: (usages as any[]).map((u: any) => u.section),
                suggested_fix: `Standardize to "${canonical}"`
            });
        }
    }

    return issues;
}

/**
 * Check for contradictions between sections (placeholder implementation).
 *
 * @param _sections - Map of section ID to content (unused in current implementation)
 * @returns Empty array (implement with LLM call for real contradiction detection)
 */
async function checkContradictions(_sections: Record<string, any>) {
    // This would ideally use a model to detect contradictions
    // For now, return empty - implement with model call if needed
    return [];
}

/**
 * Check that the conclusion section references key topics from body sections.
 *
 * Extracts words longer than 4 characters from each body section's title and
 * checks whether at least one appears in the conclusion text. Reports a
 * `conclusion_gap` for each body topic not covered.
 *
 * @param sections - Map of section ID to content (must include 'conclusion')
 * @param outline - The document outline with section definitions
 * @returns Array of conclusion_gap issues for uncovered body topics
 */
function checkConclusionCoverage(sections: Record<string, any>, outline: any) {
    const issues: any[] = [];

    // Get key topics from body sections
    const bodyTopics = outline.sections
        .filter((s: any) => s.id !== 'conclusion' && s.id !== 'executive_summary')
        .map((s: any) => s.title.toLowerCase());

    const conclusionLower = (sections.conclusion || '').toLowerCase();

    for (const topic of bodyTopics) {
        // Simple check - could be more sophisticated
        const topicWords = topic.split(/\s+/).filter((w: string) => w.length > 4);
        const covered = topicWords.some((w: string) => conclusionLower.includes(w));

        if (!covered) {
            issues.push({
                type: 'conclusion_gap',
                message: `Conclusion may not cover: ${topic}`,
                section: 'conclusion'
            });
        }
    }

    return issues;
}
