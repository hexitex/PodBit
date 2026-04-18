/**
 * Config Assistant REST API routes.
 *
 * Interactive LLM-powered config tuning chat with 30-minute TTL conversations
 * stored in-memory. Each turn builds context from relevant config sections
 * (auto-detected from message keywords), system metrics, and conversation
 * history, then returns structured JSON suggestions with parameter changes.
 * Also provides a rule-based diagnostic endpoint for system health snapshots.
 * Mounted at /api via routes/api.ts.
 *
 * @module routes/config-assist
 */

import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { callSubsystemModel, getSubsystemAssignments } from '../models.js';
import { getSafeConfig } from '../config.js';
import { SECTION_METADATA } from '../config-sections.js';
import { query as dbQuery } from '../db/index.js';
import { withinDays } from '../db/sql.js';
import { getQuickMetrics, buildParamLookup, getNestedValue } from '../handlers/config-tune/helpers.js';

const router = Router();

// ─── In-memory conversation store ────────────────────────────────────────────

interface ConversationEntry {
    messages: Array<{ role: string; content: string }>;
    createdAt: number;
    lastAccess: number;
    detailedSections: Set<string>;
}

const conversations = new Map<string, ConversationEntry>();
const CONVERSATION_TTL = 30 * 60 * 1000; // 30 minutes

// Cleanup stale conversations every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of conversations) {
        if (now - entry.lastAccess > CONVERSATION_TTL) {
            conversations.delete(id);
        }
    }
}, 5 * 60 * 1000);

/** Generates a unique config-assist conversation id (ca-timestamp-random). */
function generateId(): string {
    return `ca-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Context builders ────────────────────────────────────────────────────────

/**
 * Build a compact one-liner index of all config sections for the LLM system prompt.
 *
 * @returns Markdown-formatted list with section title, ID, and parameter keys
 */
function buildSectionIndex(): string {
    const lines: string[] = [];
    for (const [id, section] of Object.entries(SECTION_METADATA)) {
        const paramKeys = section.parameters.map((p: any) => p.key).join(', ');
        lines.push(`- **${section.title}** [${id}] (${section.parameters.length} params): ${paramKeys}`);
    }
    return lines.join('\n');
}

/**
 * Build full detail for a single config section including behavior description
 * and a markdown table of all parameters with current/default values and ranges.
 *
 * @param sectionId - The config section identifier
 * @returns Markdown-formatted section detail, or null if section not found
 */
function buildSectionDetail(sectionId: string): string | null {
    const section = SECTION_METADATA[sectionId];
    if (!section) return null;

    const currentConfig = getSafeConfig() as any;
    const lines: string[] = [
        `### ${section.title} [${sectionId}]`,
        section.description,
        '',
        `**Behavior:** ${section.behavior}`,
        '',
        '| Parameter | Current | Default | Range | Description |',
        '|-----------|---------|---------|-------|-------------|',
    ];

    for (const param of section.parameters) {
        const current = getNestedValue(currentConfig, param.configPath) ?? param.default;
        const displayCurrent = typeof current === 'number' ? current : JSON.stringify(current);
        lines.push(`| ${param.label} (${param.key}) | ${displayCurrent} | ${param.default} | ${param.min}–${param.max} step ${param.step} | ${param.description} |`);
    }

    return lines.join('\n');
}

/**
 * Detect which config sections are relevant to a message by scanning for
 * section IDs, titles, parameter keys, and searchTerms in the text.
 *
 * @param text - The message text to scan for section references
 * @returns Array of matching section IDs
 */
function detectRelevantSections(text: string): string[] {
    if (!text) return [];
    const lower = text.toLowerCase();
    const matches: string[] = [];

    for (const [id, section] of Object.entries(SECTION_METADATA)) {
        // Check section ID
        if (lower.includes(id.toLowerCase())) { matches.push(id); continue; }
        // Check title
        if (lower.includes(section.title.toLowerCase())) { matches.push(id); continue; }
        // Check parameter keys
        const hasParamKey = section.parameters.some((p: any) => lower.includes(p.key.toLowerCase()));
        if (hasParamKey) { matches.push(id); continue; }
        // Check searchTerms
        if ((section as any).searchTerms) {
            const hasSearchTerm = (section as any).searchTerms.some((t: string) => lower.includes(t.toLowerCase()));
            if (hasSearchTerm) { matches.push(id); }
        }
    }

    return matches;
}

/**
 * Build a rule-based diagnostic snapshot of system health.
 * Queries dream_cycles for rejection breakdowns, computes success rate,
 * and classifies severity as healthy/warning/critical.
 *
 * @returns Diagnostic object with successRate, synthesisCycles, topRejections,
 *          severity, healthSummary, and graph metrics
 */
async function buildDiagnostic(): Promise<Record<string, any>> {
    const metrics = await getQuickMetrics();

    // Rejection breakdown from dream_cycles (7-day)
    let rejections: Array<{ reason: string; count: number }> = [];
    try {
        rejections = await dbQuery(`
            SELECT rejection_reason as reason, COUNT(*) as count
            FROM dream_cycles
            WHERE ${withinDays('started_at', '$1')}
              AND created_child = 0
              AND rejection_reason IS NOT NULL
            GROUP BY rejection_reason
            ORDER BY count DESC
            LIMIT 10
        `, [7]) as any[];
    } catch { /* table may not exist in test DBs */ }

    // Total synthesis cycles — uses same denominator (all cycles) as the metrics dashboard
    let synthesisCycles = { total: 0, withPartner: 0, children: 0 };
    try {
        const stats = await dbQuery(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN node_b_id IS NOT NULL THEN 1 ELSE 0 END) as with_partner,
                SUM(CASE WHEN created_child = 1
                      AND child_node_id IS NOT NULL
                      AND EXISTS (SELECT 1 FROM nodes n WHERE n.id = dc.child_node_id AND n.archived = 0)
                    THEN 1 ELSE 0 END) as children
            FROM dream_cycles dc
            WHERE ${withinDays('dc.started_at', '$1')}
        `, [7]) as any[];
        if (stats[0]) {
            synthesisCycles = {
                total: parseInt(stats[0].total, 10) || 0,
                withPartner: parseInt(stats[0].with_partner, 10) || 0,
                children: parseInt(stats[0].children, 10) || 0,
            };
        }
    } catch { /* ignore */ }

    const successRate = synthesisCycles.total > 0
        ? synthesisCycles.children / synthesisCycles.total
        : 0;

    // Format rejections as percentages
    const totalRejections = rejections.reduce((sum, r) => sum + (parseInt(r.count as any, 10) || 0), 0);
    const topRejections = rejections.slice(0, 5).map(r => ({
        reason: r.reason,
        count: parseInt(r.count as any, 10) || 0,
        pct: totalRejections > 0 ? Math.round(((parseInt(r.count as any, 10) || 0) / totalRejections) * 100) : 0,
    }));

    // Rule-based health summary
    let healthSummary: string;
    let severity: 'healthy' | 'warning' | 'critical';

    if (synthesisCycles.total === 0) {
        healthSummary = 'No synthesis cycles recorded in the last 7 days. The synthesis engine may not be running.';
        severity = 'critical';
    } else if (successRate < 0.02) {
        const topReason = topRejections[0]?.reason || 'unknown';
        const topPct = topRejections[0]?.pct || 0;
        healthSummary = `Synthesis is nearly stalled (${(successRate * 100).toFixed(1)}% success rate). The top rejection reason is "${topReason}" at ${topPct}% of rejections. Quality gates may be too strict for the current content.`;
        severity = 'critical';
    } else if (successRate < 0.05) {
        healthSummary = `Synthesis success rate is low (${(successRate * 100).toFixed(1)}%). Some quality gates may need adjustment.`;
        severity = 'warning';
    } else if (successRate < 0.15) {
        healthSummary = `System is reasonably calibrated (${(successRate * 100).toFixed(1)}% success rate). Fine-tuning individual gates may improve output quality.`;
        severity = 'healthy';
    } else {
        healthSummary = `Success rate is high (${(successRate * 100).toFixed(1)}%). Quality gates may be too permissive — consider tightening them to improve output quality.`;
        severity = 'warning';
    }

    return {
        successRate,
        synthesisCycles,
        topRejections,
        severity,
        healthSummary,
        metrics,
    };
}

/**
 * Build the full system prompt for the config assistant LLM call.
 * Includes system health diagnostics, a compact index of all sections,
 * detailed parameter tables for focused sections, and response format instructions.
 *
 * @param diagnostic - The diagnostic snapshot from {@link buildDiagnostic}
 * @param detailedSectionIds - Section IDs to include with full parameter detail
 * @returns Complete system prompt string
 */
async function buildSystemPrompt(diagnostic: Record<string, any>, detailedSectionIds: string[]): Promise<string> {
    const sectionIndex = buildSectionIndex();

    // Build detailed sections
    const detailedParts: string[] = [];
    for (const id of detailedSectionIds) {
        const detail = buildSectionDetail(id);
        if (detail) detailedParts.push(detail);
    }
    const detailedSections = detailedParts.length > 0
        ? detailedParts.join('\n\n')
        : '_No specific sections in focus yet. Ask the user what they want to tune, or diagnose from the metrics below._';

    // Format rejection breakdown
    const rejectionLines = (diagnostic.topRejections || [])
        .map((r: any) => `  - ${r.reason}: ${r.count} (${r.pct}%)`)
        .join('\n') || '  (no rejections)';

    const { getPrompt } = await import('../prompts.js');
    return getPrompt('config.assist_system', {
        successRate: (diagnostic.successRate * 100).toFixed(1),
        children: String(diagnostic.synthesisCycles?.children || 0),
        totalCycles: String(diagnostic.synthesisCycles?.total || 0),
        withPartner: String(diagnostic.synthesisCycles?.withPartner || 0),
        severity: diagnostic.severity,
        healthSummary: diagnostic.healthSummary,
        rejectionLines,
        totalNodes: String(diagnostic.metrics?.totalNodes || 'N/A'),
        avgWeight: diagnostic.metrics?.avgWeight?.toFixed(2) || 'N/A',
        avgSpecificity: diagnostic.metrics?.avgSpecificity?.toFixed(1) || 'N/A',
        sectionIndex,
        detailedSections,
    });
}

/**
 * Validate and push suggestion objects into the suggestions array.
 * Clamps values to parameter min/max, rounds to step precision,
 * and attaches metadata (label, range, sectionId).
 *
 * @param parsed - Raw suggestion objects from LLM JSON output
 * @param suggestions - Accumulator array to push validated suggestions into
 * @param paramLookup - Map of dotted config paths to parameter metadata
 */
function processSuggestionArray(parsed: any[], suggestions: any[], paramLookup: Record<string, any>): void {
    const currentConfig = getSafeConfig() as any;
    for (const s of parsed) {
        if (!s.key || !s.configPath || s.suggestedValue === undefined) continue;

        const pathStr = s.configPath.join('.');
        const meta = paramLookup[pathStr];
        if (!meta) continue;

        const clamped = Math.min(meta.max, Math.max(meta.min, s.suggestedValue));
        const stepPrecision = meta.step.toString().split('.')[1]?.length || 0;
        const rounded = parseFloat(clamped.toFixed(stepPrecision));
        const currentValue = getNestedValue(currentConfig, s.configPath) ?? meta.default;

        suggestions.push({
            key: s.key,
            label: meta.label,
            configPath: s.configPath,
            currentValue,
            suggestedValue: rounded,
            explanation: s.explanation || '',
            min: meta.min,
            max: meta.max,
            step: meta.step,
            sectionId: meta.sectionId,
        });
    }
}

/**
 * Extract suggestion blocks from an LLM response and validate them.
 *
 * Tries three extraction strategies in order:
 * 1. Proper \`\`\`suggestions\`\`\` fenced blocks
 * 2. \`\`\`json\`\`\` blocks whose contents look like suggestion arrays
 * 3. Prose extraction via {@link extractSuggestionsFromProse}
 *
 * @param response - Raw LLM response text
 * @returns Object with cleaned response text (suggestion blocks stripped) and validated suggestions array
 */
function parseSuggestions(response: string): { cleanedResponse: string; suggestions: any[] } {
    const suggestions: any[] = [];
    const paramLookup = buildParamLookup();

    // Primary: extract proper ```suggestions``` blocks
    let cleaned = response.replace(
        /```suggestions\s*\n?([\s\S]*?)```/g,
        (_match, content) => {
            try {
                const parsed = JSON.parse(content.trim());
                if (Array.isArray(parsed)) processSuggestionArray(parsed, suggestions, paramLookup);
            } catch { /* unparseable */ }
            return '';
        },
    );

    // Fallback: also catch ```json``` blocks that contain valid suggestion arrays
    // (LLM sometimes ignores the 'suggestions' language tag)
    if (suggestions.length === 0) {
        cleaned = cleaned.replace(
            /```(?:json)?\s*\n?(\[[\s\S]*?\])\s*```/g,
            (_match, content) => {
                try {
                    const parsed = JSON.parse(content.trim());
                    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.configPath) {
                        processSuggestionArray(parsed, suggestions, paramLookup);
                        return ''; // Strip it from the visible response
                    }
                } catch { /* not a suggestion array */ }
                return _match; // Leave non-suggestion JSON blocks intact
            },
        );
    }

    // Fallback 2: extract parameter changes from prose when LLM ignored format entirely
    if (suggestions.length === 0) {
        extractSuggestionsFromProse(cleaned, suggestions, paramLookup);
    }

    const cleanedResponse = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return { cleanedResponse, suggestions };
}

/**
 * Last-resort extraction: scan prose for parameter key/path references paired with numeric values.
 * Looks for patterns like "paramKey (currently X). Fix: Lower to Y" and extracts
 * directed values (to/reduce to/increase to/set to) from action lines.
 *
 * @param text - The LLM response prose to scan
 * @param suggestions - Accumulator array to push extracted suggestions into
 * @param paramLookup - Map of dotted config paths to parameter metadata
 */
function extractSuggestionsFromProse(text: string, suggestions: any[], paramLookup: Record<string, any>): void {
    const currentConfig = getSafeConfig() as any;

    // Build reverse lookups: key→meta, label→meta, dotted.path→meta
    // NOTE: configPath leaves are intentionally excluded — they are often common English words
    // (e.g., "embedding", "compress", "context") that false-match everywhere in prose.
    const byName = new Map<string, { meta: any; pathStr: string }>();
    for (const [pathStr, meta] of Object.entries(paramLookup)) {
        byName.set(meta.key.toLowerCase(), { meta, pathStr });
        byName.set(meta.label.toLowerCase(), { meta, pathStr });
        byName.set(pathStr.toLowerCase(), { meta, pathStr });
    }

    const found = new Set<string>();

    // Scan chunks — split on double-newline, numbered list items, and bullet points
    const chunks = text.split(/\n{2,}|\n(?=\d+\.\s)|\n(?=[-*●•]\s)/);

    // Directed-value regex used both for candidate extraction and line scoring
    const directedPattern = /(?:to|→|reduce(?:\s+it)?\s+to|lower(?:\s+(?:it|the\s+\w+))?\s+to|increase(?:\s+(?:it|the\s+\w+))?\s+to|raise(?:\s+(?:it|the\s+\w+))?\s+to|set\s+(?:it\s+)?to)\s*:?\s*(\d+\.?\d*)/i;

    for (const chunk of chunks) {
        // Further split chunk into individual lines for per-parameter explanation
        const lines = chunk.split('\n').filter(l => l.trim());

        for (const [name, { meta, pathStr }] of byName) {
            if (name.length < 6) continue; // Skip short names to avoid false matches
            if (found.has(pathStr)) continue;

            // Find lines mentioning this parameter — require the name to NOT be a substring
            // of a longer camelCase identifier (prevents "threshold" matching "embeddingSimilarityThreshold")
            const nameRe = new RegExp(`(?<![a-z])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![a-z])`, 'i');
            const matchingLines = lines.filter(l => nameRe.test(l));
            if (matchingLines.length === 0) continue;

            // Only consider lines that contain a directed value — skip pure listing lines
            // like "Parameters involved: X, Y, Z" which mention names but have no values
            const actionLines = matchingLines.filter(l => directedPattern.test(l));
            if (actionLines.length === 0) continue;

            // Use action lines (+ one following line for context) as the search scope
            const searchScope = actionLines.map(ml => {
                const idx = lines.indexOf(ml);
                const next = idx + 1 < lines.length ? ' ' + lines[idx + 1].trim() : '';
                return ml + next;
            }).join(' ');

            const currentValue = getNestedValue(currentConfig, meta.configPath) ?? meta.default;

            // Extract candidate suggested values — numbers preceded by directional words
            const candidates: number[] = [];

            const directedRegex = new RegExp(directedPattern.source, 'gi');
            let m;
            while ((m = directedRegex.exec(searchScope)) !== null) {
                const val = parseFloat(m[1]);
                if (!Number.isNaN(val)) candidates.push(val);
            }

            // "Fix: X" pattern (value on its own after "Fix:")
            const fixRegex = /fix:\s*(?:lower|raise|reduce|increase|set)?\s*(?:to|the\s+\w+\s+to)?\s*(\d+\.?\d*)/gi;
            while ((m = fixRegex.exec(searchScope)) !== null) {
                const val = parseFloat(m[1]);
                if (!Number.isNaN(val) && !candidates.includes(val)) candidates.push(val);
            }

            // Find a number that's different from current and within range
            const suggestedValue = candidates.find(n =>
                n !== currentValue && n >= meta.min && n <= meta.max
            );

            if (suggestedValue !== undefined) {
                const clamped = Math.min(meta.max, Math.max(meta.min, suggestedValue));
                const stepPrecision = meta.step.toString().split('.')[1]?.length || 0;
                const rounded = parseFloat(clamped.toFixed(stepPrecision));

                // Skip if rounding collapses to current value or reverses direction
                if (rounded === currentValue) continue;
                if ((suggestedValue > currentValue) !== (rounded > currentValue)) continue;

                // Use the action line for explanation
                const explanation = actionLines[0]
                    .replace(/^[\s\-*●•\d.]+/, '').trim()
                    .replace(/\*\*/g, '')  // strip markdown bold
                    .replace(/`([^`]+)`/g, '$1')  // strip inline code
                    .slice(0, 200);

                suggestions.push({
                    key: meta.key,
                    label: meta.label,
                    configPath: meta.configPath,
                    currentValue,
                    suggestedValue: rounded,
                    explanation,
                    min: meta.min,
                    max: meta.max,
                    step: meta.step,
                    sectionId: meta.sectionId,
                });

                found.add(pathStr);
            }
        }
    }
}

/**
 * Conversational config assistant. Creates or resumes an in-memory conversation
 * (30m TTL, auto-cleaned). Builds context from auto-detected relevant config
 * sections, system metrics (synthesis pipeline stats, EVM pass rate, cycle counts),
 * and conversation history. Returns structured JSON with suggestions array and
 * a conversational summary.
 */
router.post('/config/assist', asyncHandler(async (req, res) => {
    const { message, conversationId: existingId } = req.body;

    if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'message is required' });
    }

    // Get or create conversation
    const conversationId = existingId && conversations.has(existingId)
        ? existingId
        : generateId();

    let conversation = conversations.get(conversationId);
    if (!conversation) {
        conversation = {
            messages: [],
            createdAt: Date.now(),
            lastAccess: Date.now(),
            detailedSections: new Set(),
        };
        conversations.set(conversationId, conversation);
    }
    conversation.lastAccess = Date.now();

    // Detect which sections are relevant from user message + previous LLM responses
    const previousLlmText = conversation.messages
        .filter(m => m.role === 'assistant')
        .map(m => m.content)
        .join(' ');
    const newRelevantSections = detectRelevantSections(message + ' ' + previousLlmText);
    for (const id of newRelevantSections) {
        conversation.detailedSections.add(id);
    }

    // If this is the first message and no sections detected, add all pipeline-related sections
    // so the LLM can diagnose comprehensively across all gates
    if (conversation.messages.length === 0 && conversation.detailedSections.size === 0) {
        const pipelineSections = [
            'voicing_constraints', 'synthesis_quality_gates', 'hallucination_detection',
            'resonance_specificity', 'synthesis_validation', 'dedup_settings',
            'claim_provenance', 'redundancy_ceiling', 'counterfactual_independence',
        ];
        for (const id of pipelineSections) {
            if (SECTION_METADATA[id]) conversation.detailedSections.add(id);
        }
    }

    // Build diagnostic + system prompt
    const diagnostic = await buildDiagnostic();
    const systemPrompt = await buildSystemPrompt(diagnostic, [...conversation.detailedSections]);

    // Add user message to history
    conversation.messages.push({ role: 'user', content: message });

    // Trim conversation history to prevent context overflow (keep last 8 turns)
    const MAX_TURNS = 16; // 8 user + 8 assistant
    if (conversation.messages.length > MAX_TURNS) {
        conversation.messages = conversation.messages.slice(-MAX_TURNS);
    }

    // Build single prompt string from system prompt + conversation history
    // callSubsystemModel takes a string, so we format the conversation as text
    const historyText = conversation.messages
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n\n---\n\n');

    const fullPrompt = `${systemPrompt}\n\n---\n\n## Conversation\n\n${historyText}\n\n---\n\nAssistant:`;

    // Call LLM
    const assignments = await getSubsystemAssignments();
    const subsystem = assignments.config_tune ? 'config_tune' : 'compress';

    const response = await callSubsystemModel(subsystem, fullPrompt, {});

    // Parse response for embedded suggestions
    const { cleanedResponse, suggestions } = parseSuggestions(response);

    // Store assistant response in conversation
    conversation.messages.push({ role: 'assistant', content: response });

    res.json({
        conversationId,
        response: cleanedResponse,
        suggestions: suggestions.length > 0 ? suggestions : undefined,
        diagnostic: conversation.messages.length <= 2 ? diagnostic : undefined, // Include on first response
    });
}));

// ─── GET /config/assist/diagnostic ───────────────────────────────────────────

router.get('/config/assist/diagnostic', asyncHandler(async (_req, res) => {
    const diagnostic = await buildDiagnostic();
    res.json({ diagnostic });
}));

// ─── POST /config/assist/interview ──────────────────────────────────────────
//
// Structured interview → deterministic config profile. No LLM call needed.

type Domain = 'hard_science' | 'formal_math' | 'applied_technical' | 'social_science' | 'humanities' | 'speculative' | 'mixed';
type Material = 'quantitative' | 'qualitative' | 'balanced';
type Stance = 'conservative' | 'balanced' | 'exploratory';
type Verification = 'high' | 'moderate' | 'low';
type Maturity = 'fresh' | 'growing' | 'mature';
type Budget = 'minimal' | 'moderate' | 'generous';

interface InterviewAnswers {
    domain: Domain;
    material: Material;
    stance: Stance;
    verification: Verification;
    maturity: Maturity;
    budget: Budget;
}

interface RawSuggestion {
    key: string;
    configPath: string[];
    suggestedValue: any;
    explanation: string;
}

/**
 * Maps structured interview answers to a deterministic list of config suggestions.
 * No LLM call required -- uses lookup tables to map domain, material, stance,
 * verification priority, maturity, and budget to concrete parameter values.
 *
 * @param answers - Validated interview answers covering 6 dimensions
 * @returns Object with raw suggestions array and a human-readable profile label/description
 */
function computeInterviewSuggestions(answers: InterviewAnswers): { suggestions: RawSuggestion[]; profile: { label: string; description: string } } {
    const s: RawSuggestion[] = [];

    // ── Q1 + Q2: Domain + Material → provenance, hallucination, specificity ──

    // Fabricated number check: on for quantitative/hard-science, off for conceptual
    const numbersOn = answers.material === 'quantitative'
        || (answers.material === 'balanced' && ['hard_science', 'formal_math', 'social_science'].includes(answers.domain));
    s.push({
        key: 'fabricatedNumberCheck',
        configPath: ['hallucination', 'fabricatedNumberCheck'],
        suggestedValue: numbersOn ? 1 : 0,
        explanation: numbersOn
            ? 'Quantitative material — flag numbers not traceable to parent nodes'
            : 'Conceptual material — disable strict number checking to avoid false positives on illustrative figures',
    });

    // Novel ratio threshold (hallucination detector)
    const novelBase: Record<Domain, number> = {
        hard_science: 0.60, formal_math: 0.65, applied_technical: 0.65,
        social_science: 0.70, humanities: 0.80, speculative: 0.85, mixed: 0.72,
    };
    s.push({
        key: 'novelRatioThreshold',
        configPath: ['hallucination', 'novelRatioThreshold'],
        suggestedValue: novelBase[answers.domain],
        explanation: `Novel word ratio before flagging — ${novelBase[answers.domain] >= 0.8 ? 'high tolerance for new vocabulary' : 'flags high-novelty output for review'}`,
    });

    // Min red flags
    const redFlagMap: Record<Domain, number> = {
        hard_science: 1, formal_math: 1, applied_technical: 2,
        social_science: 2, humanities: 3, speculative: 3, mixed: 2,
    };
    s.push({
        key: 'minRedFlags',
        configPath: ['hallucination', 'minRedFlags'],
        suggestedValue: redFlagMap[answers.domain],
        explanation: `Red flags needed to reject — ${redFlagMap[answers.domain] === 1 ? 'strict: single flag rejects' : 'requires multiple flags before rejection'}`,
    });

    // Min specificity for synthesis output
    const specMap: Record<Material, number> = { quantitative: 2.5, balanced: 2.0, qualitative: 1.5 };
    s.push({
        key: 'minSpecificity',
        configPath: ['engine', 'minSpecificity'],
        suggestedValue: specMap[answers.material],
        explanation: `${answers.material} material — ${specMap[answers.material] >= 2.5 ? 'high specificity required (numbers, units, concrete details)' : 'lower specificity accepts conceptual synthesis'}`,
    });

    // Min novel words in voicing output
    const novelWordsMap: Record<Material, number> = { quantitative: 5, balanced: 4, qualitative: 3 };
    s.push({
        key: 'minNovelWords',
        configPath: ['voicing', 'minNovelWords'],
        suggestedValue: novelWordsMap[answers.material],
        explanation: `Voicing must introduce at least ${novelWordsMap[answers.material]} novel words to pass`,
    });

    // ── Q3: Synthesis stance → similarity, dedup, redundancy ──

    const thresholdMap: Record<Stance, number> = { conservative: 0.55, balanced: 0.50, exploratory: 0.42 };
    s.push({
        key: 'similarityThreshold',
        configPath: ['engine', 'threshold'],
        suggestedValue: thresholdMap[answers.stance],
        explanation: `${answers.stance} stance — ${answers.stance === 'exploratory' ? 'lower similarity threshold allows more distant connections' : 'higher threshold keeps synthesis close to source material'}`,
    });

    const dedupEmbMap: Record<Stance, number> = { conservative: 0.80, balanced: 0.82, exploratory: 0.86 };
    s.push({
        key: 'dedupEmbedding',
        configPath: ['dedup', 'embeddingSimilarityThreshold'],
        suggestedValue: dedupEmbMap[answers.stance],
        explanation: `Dedup embedding threshold — ${answers.stance === 'exploratory' ? 'higher threshold: only reject near-identical content' : 'standard duplicate detection'}`,
    });

    const dedupWordMap: Record<Stance, number> = { conservative: 0.65, balanced: 0.70, exploratory: 0.78 };
    s.push({
        key: 'dedupWordOverlap',
        configPath: ['dedup', 'wordOverlapThreshold'],
        suggestedValue: dedupWordMap[answers.stance],
        explanation: `Word overlap threshold for dedup — ${answers.stance === 'exploratory' ? 'allows more overlapping language' : 'stricter overlap rejection'}`,
    });

    // ── Q4: Verification priority → EVM, autorating, breakthrough gates ──

    s.push({
        key: 'evmEnabled',
        configPath: ['labVerify', 'enabled'],
        suggestedValue: answers.verification === 'high' ? 1 : 0,
        explanation: answers.verification === 'high'
            ? 'High verification — enable code-based claim verification (EVM)'
            : 'Verification priority not high — EVM disabled to save compute',
    });

    s.push({
        key: 'evmCycleEnabled',
        configPath: ['autonomousCycles', 'evm', 'enabled'],
        suggestedValue: answers.verification === 'high' ? 1 : 0,
        explanation: answers.verification === 'high'
            ? 'Enable autonomous EVM verification cycle'
            : 'EVM cycle off — manual verification when needed',
    });

    s.push({
        key: 'noveltyGateEnabled',
        configPath: ['validation', 'noveltyGateEnabled'],
        suggestedValue: answers.verification !== 'low' ? 1 : 0,
        explanation: answers.verification === 'low'
            ? 'Low verification — skip novelty gate for breakthroughs'
            : 'Novelty gate enabled — frontier model checks breakthrough candidates',
    });

    s.push({
        key: 'evmGateEnabled',
        configPath: ['validation', 'evmGateEnabled'],
        suggestedValue: answers.verification === 'high' ? 1 : 0,
        explanation: answers.verification === 'high'
            ? 'EVM hallucination gate enabled for breakthrough validation'
            : 'EVM gate off — rely on composite scoring for breakthroughs',
    });

    s.push({
        key: 'autoratingEnabled',
        configPath: ['autonomousCycles', 'autorating', 'enabled'],
        suggestedValue: answers.verification !== 'low' ? 1 : 0,
        explanation: answers.verification === 'low'
            ? 'Autorating cycle off — minimal gating'
            : 'Autorating enabled — LLM-based quality scoring on new nodes',
    });

    s.push({
        key: 'autoratingInlineEnabled',
        configPath: ['autonomousCycles', 'autorating', 'inlineEnabled'],
        suggestedValue: answers.verification !== 'low' ? 1 : 0,
        explanation: answers.verification === 'low'
            ? 'Inline rating off'
            : 'Rate new nodes immediately at creation',
    });

    // ── Q5: Graph maturity → quality gate permissiveness ──

    // Maturity adjustments: fresh graphs need looser gates to bootstrap
    if (answers.maturity === 'fresh') {
        // Loosen several gates for bootstrapping
        const freshOverrides: RawSuggestion[] = [
            { key: 'minRedFlags', configPath: ['hallucination', 'minRedFlags'], suggestedValue: Math.max((s.find(x => x.key === 'minRedFlags')?.suggestedValue ?? 2) + 1, 3), explanation: 'Fresh graph — extra lenient hallucination detection during bootstrap' },
            { key: 'dedupEmbedding', configPath: ['dedup', 'embeddingSimilarityThreshold'], suggestedValue: Math.min((s.find(x => x.key === 'dedupEmbedding')?.suggestedValue ?? 0.82) + 0.04, 0.95), explanation: 'Fresh graph — raise dedup threshold to allow more content in' },
        ];
        for (const override of freshOverrides) {
            const idx = s.findIndex(x => x.key === override.key);
            if (idx >= 0) s[idx] = override; else s.push(override);
        }
    } else if (answers.maturity === 'mature') {
        // Tighten for mature graphs to reduce noise
        const matureOverrides: RawSuggestion[] = [
            { key: 'minRedFlags', configPath: ['hallucination', 'minRedFlags'], suggestedValue: Math.max((s.find(x => x.key === 'minRedFlags')?.suggestedValue ?? 2) - 1, 1), explanation: 'Mature graph — stricter hallucination detection to reduce noise' },
            { key: 'dedupEmbedding', configPath: ['dedup', 'embeddingSimilarityThreshold'], suggestedValue: Math.max((s.find(x => x.key === 'dedupEmbedding')?.suggestedValue ?? 0.82) - 0.02, 0.78), explanation: 'Mature graph — lower dedup threshold catches more near-duplicates' },
        ];
        for (const override of matureOverrides) {
            const idx = s.findIndex(x => x.key === override.key);
            if (idx >= 0) s[idx] = override; else s.push(override);
        }
    }

    // ── Q6: Resource budget → cycle timings and enables ──

    const intervalMap: Record<Budget, number> = { minimal: 120000, moderate: 45000, generous: 15000 };
    const synthIntervalMap: Record<Budget, number> = { minimal: 5000, moderate: 2000, generous: 500 };

    s.push({
        key: 'validationInterval',
        configPath: ['autonomousCycles', 'validation', 'intervalMs'],
        suggestedValue: answers.budget === 'minimal' ? 300000 : answers.budget === 'moderate' ? 60000 : 30000,
        explanation: `Breakthrough scanner interval — ${answers.budget} budget`,
    });
    s.push({
        key: 'questionsInterval',
        configPath: ['autonomousCycles', 'questions', 'intervalMs'],
        suggestedValue: intervalMap[answers.budget],
        explanation: `Question answering interval — ${answers.budget} budget`,
    });
    s.push({
        key: 'tensionsInterval',
        configPath: ['autonomousCycles', 'tensions', 'intervalMs'],
        suggestedValue: intervalMap[answers.budget],
        explanation: `Tension exploration interval — ${answers.budget} budget`,
    });
    s.push({
        key: 'researchInterval',
        configPath: ['autonomousCycles', 'research', 'intervalMs'],
        suggestedValue: intervalMap[answers.budget],
        explanation: `Research cycle interval — ${answers.budget} budget`,
    });
    s.push({
        key: 'autoratingInterval',
        configPath: ['autonomousCycles', 'autorating', 'intervalMs'],
        suggestedValue: intervalMap[answers.budget],
        explanation: `Autorating idle interval — ${answers.budget} budget`,
    });
    s.push({
        key: 'synthesisInterval',
        configPath: ['engine', 'synthesisIntervalMs'],
        suggestedValue: synthIntervalMap[answers.budget],
        explanation: `Core synthesis loop speed — ${answers.budget} budget`,
    });

    // Enable/disable optional cycles based on budget
    if (answers.budget === 'minimal') {
        s.push({ key: 'questionsEnabled', configPath: ['autonomousCycles', 'questions', 'enabled'], suggestedValue: 0, explanation: 'Minimal budget — disable question cycle to save LLM calls' });
        s.push({ key: 'tensionsEnabled', configPath: ['autonomousCycles', 'tensions', 'enabled'], suggestedValue: 0, explanation: 'Minimal budget — disable tension cycle' });
        s.push({ key: 'researchEnabled', configPath: ['autonomousCycles', 'research', 'enabled'], suggestedValue: 0, explanation: 'Minimal budget — disable research cycle' });
    } else if (answers.budget === 'generous') {
        s.push({ key: 'questionsEnabled', configPath: ['autonomousCycles', 'questions', 'enabled'], suggestedValue: 1, explanation: 'Generous budget — enable question answering' });
        s.push({ key: 'tensionsEnabled', configPath: ['autonomousCycles', 'tensions', 'enabled'], suggestedValue: 1, explanation: 'Generous budget — enable tension exploration' });
        s.push({ key: 'researchEnabled', configPath: ['autonomousCycles', 'research', 'enabled'], suggestedValue: 1, explanation: 'Generous budget — enable domain research' });
        s.push({ key: 'validationEnabled', configPath: ['autonomousCycles', 'validation', 'enabled'], suggestedValue: 1, explanation: 'Generous budget — enable breakthrough scanner' });
    }

    // Build profile label
    const domainLabels: Record<Domain, string> = {
        hard_science: 'Hard Science', formal_math: 'Formal/Mathematical', applied_technical: 'Applied/Technical',
        social_science: 'Social Science', humanities: 'Humanities/Philosophy', speculative: 'Speculative/Exploratory', mixed: 'Interdisciplinary',
    };
    const stanceLabels: Record<Stance, string> = { conservative: 'Conservative', balanced: 'Balanced', exploratory: 'Exploratory' };

    return {
        suggestions: s,
        profile: {
            label: `${domainLabels[answers.domain]} / ${stanceLabels[answers.stance]}`,
            description: `${domainLabels[answers.domain]} research with ${answers.material} source material, ${answers.stance} synthesis stance, ${answers.verification} verification priority, ${answers.maturity} graph, ${answers.budget} budget.`,
        },
    };
}

router.post('/config/assist/interview', asyncHandler(async (req, res) => {
    const { answers } = req.body;
    if (!answers || typeof answers !== 'object') {
        return res.status(400).json({ error: 'answers object is required' });
    }

    const validDomains: Domain[] = ['hard_science', 'formal_math', 'applied_technical', 'social_science', 'humanities', 'speculative', 'mixed'];
    const validMaterials: Material[] = ['quantitative', 'qualitative', 'balanced'];
    const validStances: Stance[] = ['conservative', 'balanced', 'exploratory'];
    const validVerification: Verification[] = ['high', 'moderate', 'low'];
    const validMaturity: Maturity[] = ['fresh', 'growing', 'mature'];
    const validBudgets: Budget[] = ['minimal', 'moderate', 'generous'];

    if (!validDomains.includes(answers.domain)) return res.status(400).json({ error: `Invalid domain. Must be one of: ${validDomains.join(', ')}` });
    if (!validMaterials.includes(answers.material)) return res.status(400).json({ error: `Invalid material. Must be one of: ${validMaterials.join(', ')}` });
    if (!validStances.includes(answers.stance)) return res.status(400).json({ error: `Invalid stance. Must be one of: ${validStances.join(', ')}` });
    if (!validVerification.includes(answers.verification)) return res.status(400).json({ error: `Invalid verification. Must be one of: ${validVerification.join(', ')}` });
    if (!validMaturity.includes(answers.maturity)) return res.status(400).json({ error: `Invalid maturity. Must be one of: ${validMaturity.join(', ')}` });
    if (!validBudgets.includes(answers.budget)) return res.status(400).json({ error: `Invalid budget. Must be one of: ${validBudgets.join(', ')}` });

    const { suggestions: rawSuggestions, profile } = computeInterviewSuggestions(answers as InterviewAnswers);

    // Validate through the same param lookup pipeline as the LLM suggestions
    const paramLookup = buildParamLookup();
    const validated: any[] = [];
    const currentConfig = getSafeConfig() as any;

    for (const raw of rawSuggestions) {
        const pathStr = raw.configPath.join('.');
        const meta = paramLookup[pathStr];
        if (!meta) continue;

        const currentValue = getNestedValue(currentConfig, raw.configPath) ?? meta.default;

        // Skip suggestions that wouldn't change anything
        if (currentValue === raw.suggestedValue) continue;

        const clamped = typeof raw.suggestedValue === 'number'
            ? Math.min(meta.max, Math.max(meta.min, raw.suggestedValue))
            : raw.suggestedValue;
        const stepPrecision = meta.step?.toString().split('.')[1]?.length || 0;
        const rounded = typeof clamped === 'number' ? parseFloat(clamped.toFixed(stepPrecision)) : clamped;

        validated.push({
            key: raw.key,
            label: meta.label,
            configPath: raw.configPath,
            currentValue,
            suggestedValue: rounded,
            explanation: raw.explanation,
            min: meta.min,
            max: meta.max,
            step: meta.step,
            sectionId: meta.sectionId,
        });
    }

    res.json({ suggestions: validated, profile });
}));

export default router;
