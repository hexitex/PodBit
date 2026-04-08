/**
 * @module scaffold/assemble
 *
 * Final document assembly from generated sections.
 */

// =============================================================================
// ASSEMBLY
// =============================================================================

/**
 * Assemble section contents into a final document following the outline order.
 *
 * Iterates through the outline's section definitions in order, appending each
 * section's content with appropriate headings. Sections that were not generated
 * (missing from the sections map) are silently skipped.
 *
 * @param sections - Map of section ID to generated content text
 * @param outline - The document outline with title and ordered sections array
 * @param options - Assembly options
 * @param options.format - Output format: 'markdown' (default) uses `#`/`##` headings
 * @returns The assembled document as a single string
 */
export function assemble(sections: Record<string, any>, outline: any, options: Record<string, any> = {}) {
    const { format = 'markdown' } = options;

    let document = '';

    // Title
    if (outline.title) {
        document += format === 'markdown' ? `# ${outline.title}\n\n` : `${outline.title}\n\n`;
    }

    // Sections in order
    for (const sectionDef of outline.sections) {
        const content = sections[sectionDef.id];
        if (!content) continue;

        if (format === 'markdown') {
            document += `## ${sectionDef.title}\n\n`;
            document += content + '\n\n';
        } else {
            document += `${sectionDef.title}\n\n`;
            document += content + '\n\n';
        }
    }

    return document;
}
