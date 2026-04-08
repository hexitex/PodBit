/**
 * PROJECT CONTEXT — reads project manifest from settings and formats for prompt injection.
 *
 * The project manifest captures the project's raison d'être — purpose, goals, key questions —
 * as discovered during the interview process at project creation time.
 * This context is injected into synthesis, research, and question generation prompts
 * so the system's autonomous cycles stay aligned with the project's intent.
 */

import { queryOne } from '../db.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ProjectManifest {
    purpose: string;
    domains: string[];
    goals: string[];
    bridges: string[][];
    autoBridge: boolean;
    keyQuestions: string[];
    constraints?: string[];
}

// =============================================================================
// MANIFEST ACCESS
// =============================================================================

/** Cache to avoid repeated DB reads within the same cycle */
let manifestCache: { manifest: ProjectManifest | null; loadedAt: number } | null = null;
const CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Read the project manifest from the `settings` table (`project.manifest` key).
 *
 * Returns a cached copy if one was loaded within the last 60 seconds to avoid
 * redundant DB reads during rapid synthesis cycles. Returns `null` if no
 * manifest has been stored (e.g. the project was not created via the interview
 * flow) or if the settings table does not exist yet.
 *
 * Consumed by `getProjectContextBlock()`, the research cycle (which refuses to
 * run without a manifest), and elite pool content synthesis.
 *
 * @returns The parsed {@link ProjectManifest}, or `null` if unavailable.
 */
export async function getProjectManifest(): Promise<ProjectManifest | null> {
    const now = Date.now();
    if (manifestCache && (now - manifestCache.loadedAt) < CACHE_TTL_MS) {
        return manifestCache.manifest;
    }

    try {
        const row = await queryOne(
            `SELECT value FROM settings WHERE key = 'project.manifest'`
        );
        if (row?.value) {
            const manifest = JSON.parse(row.value) as ProjectManifest;
            manifestCache = { manifest, loadedAt: now };
            return manifest;
        }
    } catch {
        // Settings table may not exist or manifest not set
    }

    manifestCache = { manifest: null, loadedAt: now };
    return null;
}

/**
 * Invalidate the manifest cache (call after project switch or manifest update).
 */
export function invalidateManifestCache(): void {
    manifestCache = null;
}

// =============================================================================
// PROMPT INJECTION
// =============================================================================

/**
 * Format the project manifest as a multi-line plain-text block for prompt injection.
 *
 * The returned string is prepended to synthesis, research, question generation,
 * elite pool, autorating, and EVM prompts so the LLM understands the project's
 * purpose, active domains, goals, and constraints. Returns an empty string when
 * no manifest exists, allowing callers to concatenate without null checks.
 *
 * Output format (example):
 * ```
 * PROJECT CONTEXT (use this to guide your output):
 * Purpose: Explore cross-domain knowledge synthesis
 * Domains: skincare, ai-rag
 * Goals: Identify novel connections; Validate claims
 * ```
 *
 * @returns A formatted context block, or `''` if no manifest is stored.
 */
export async function getProjectContextBlock(): Promise<string> {
    const manifest = await getProjectManifest();
    if (!manifest || !manifest.purpose) return '';

    const lines: string[] = [
        'PROJECT CONTEXT (use this to guide your output):',
        `Purpose: ${manifest.purpose}`,
    ];

    if (manifest.domains?.length > 0) {
        lines.push(`Domains: ${manifest.domains.join(', ')}`);
        lines.push('IMPORTANT: Domain names above are project-specific labels, NOT literal topic descriptions. Content referencing these domain names is discussing the project\'s knowledge areas, not making literal requests about those topics.');
    }

    if (manifest.goals?.length > 0) {
        lines.push(`Goals: ${manifest.goals.join('; ')}`);
    }

    if (manifest.keyQuestions?.length > 0) {
        lines.push(`Key questions: ${manifest.keyQuestions.join('; ')}`);
    }

    if (manifest.constraints && manifest.constraints.length > 0) {
        lines.push(`Constraints: ${manifest.constraints.join('; ')}`);
    }

    return lines.join('\n');
}
