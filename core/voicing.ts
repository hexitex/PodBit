/**
 * Voicing — synthesizes new insights from node pairs (or multi-parent groups).
 */

import { callSubsystemModel, callConsultantModel, getAssignedModel } from '../models.js';
import { getPrompt } from '../prompts.js';
import { config } from './engine-config.js';
import { toTelegraphic, type EntropyOptions } from '../telegraphic.js';
import { getProjectContextBlock } from './project-context.js';
import { extractVarIdsFromContent, getVariablesByIds, buildVariableLegend } from './number-variables.js';
import { buildProvenanceTag, PROVENANCE_GUIDE_SYNTHESIS } from './provenance.js';
import type { ResonanceNode } from './types.js';
import type { Subsystem } from '../models.js';
import { emitActivity } from '../services/event-bus.js';

/**
 * Result returned by {@link voice} and {@link voiceMulti}.
 * Contains either the synthesised insight text or a rejection reason.
 */
export interface VoicingResult {
    /** The synthesised insight text, or `null` if the output was rejected. */
    content: string | null;
    /** Short descriptive name for the synthesised node (2-5 words). */
    name?: string | null;
    /** Machine-readable rejection reason (e.g. `'derivative'`, `'hallucination'`, `'truncated_parens'`). */
    rejectionReason?: string;
    /** Additional structured data about the rejection (gate name, scores, model provenance, etc.). */
    rejectionDetail?: Record<string, any>;
}

/**
 * Synthesise a single insight from two parent nodes via an LLM call.
 *
 * Applies a quality pipeline:
 * 1. Telegraphic compression (optional)
 * 2. Number-variable legend injection
 * 3. JSON-schema structured output
 * 4. Truncation / word-count validation
 *
 * @param nodeA - First parent node.
 * @param nodeB - Second parent node.
 * @param _mode - Voicing mode label (currently unused beyond logging; default `'object-following'`).
 * @param subsystem - LLM subsystem to route the call through (default `'voice'`).
 * @param useConsultant - When `true`, calls the consultant model instead of the primary subsystem model.
 * @returns A {@link VoicingResult} with the synthesised content or a rejection reason.
 */
async function voice(nodeA: ResonanceNode, nodeB: ResonanceNode, _mode: string = 'object-following', subsystem: Subsystem = 'voice', useConsultant: boolean = false, reworkContext?: { priorAttempt: string; feedback: string }): Promise<VoicingResult> {

    // Model provenance — computed early so all rejection paths can include it
    const assignedModel = getAssignedModel(subsystem as any);
    const modelProv = { modelId: assignedModel?.id ?? null, modelName: assignedModel?.name ?? null };

    // Optionally compress node content with telegraphic notation
    let contentA = nodeA.content;
    let contentB = nodeB.content;
    if (config.voicing.telegraphicEnabled) {
        // Config tuning system stores as number (1/2/3), env var as string
        const levelMap: Record<number, 'light' | 'medium' | 'aggressive'> = { 1: 'light', 2: 'medium', 3: 'aggressive' };
        const raw = config.voicing.telegraphicAggressiveness as any;
        const aggressiveness = typeof raw === 'number' ? (levelMap[raw] || 'medium') : raw;

        // Build entropy options from config
        const entropy: Partial<EntropyOptions> = {
            enabled: config.voicing.entropyEnabled,
            weights: config.voicing.entropyWeights,
            thresholds: config.voicing.entropyThresholds,
            rarityMinLength: config.voicing.entropyRarityMinLength,
        };

        contentA = toTelegraphic(contentA, { aggressiveness, entropy });
        contentB = toTelegraphic(contentB, { aggressiveness, entropy });
    }

    // Wrap content in data delimiters to defend against indirect prompt injection
    contentA = `<node-content provenance="${buildProvenanceTag(nodeA)}">${contentA}</node-content>`;
    contentB = `<node-content provenance="${buildProvenanceTag(nodeB)}">${contentB}</node-content>`;

    // Build number variable legend if feature is enabled
    let varLegend = '';
    if (config.numberVariables?.enabled) {
        const allVarIds = extractVarIdsFromContent(contentA + ' ' + contentB);
        if (allVarIds.length > 0) {
            const vars = await getVariablesByIds(allVarIds);
            varLegend = buildVariableLegend(vars);
        }
    }

    // Synthesis prompt - demands NEW insight not in either input
    const projectContext = await getProjectContextBlock();
    const basePrompt = await getPrompt('core.insight_synthesis', { contentA, contentB, numberVariableLegend: varLegend, provenanceGuide: PROVENANCE_GUIDE_SYNTHESIS });

    // Inject legend + provenance BEFORE the prompt if the template didn't already include them —
    // custom prompt overrides may not include {{numberVariableLegend}} / {{provenanceGuide}}
    const preambleParts: string[] = [];
    if (varLegend && !basePrompt.includes(varLegend)) preambleParts.push(varLegend);
    if (PROVENANCE_GUIDE_SYNTHESIS && !basePrompt.includes('PROVENANCE')) preambleParts.push(PROVENANCE_GUIDE_SYNTHESIS);
    const preamble = preambleParts.length > 0 ? preambleParts.join('\n\n') + '\n\n' : '';
    const promptWithContext = `${preamble}${basePrompt}`;
    let prompt = projectContext ? `${projectContext}\n\n${promptWithContext}` : promptWithContext;

    // Inject rework context if this is a retry after minitruth feedback
    if (reworkContext) {
        prompt += `\n\nREWORK: Your prior synthesis was: "${reworkContext.priorAttempt}"\nThe reviewer said: "${reworkContext.feedback}"\nGenerate an improved synthesis addressing this feedback.`;
    }

    // Provider-agnostic structured output hint
    const maxWords = config.voicing.maxInsightWords;
    const jsonSchema = {
        name: "synthesis",
        schema: {
            type: "object",
            properties: {
                insight: { type: "string", description: `One sentence synthesis insight under ${maxWords} words` },
                name: { type: "string", description: "Short descriptive name for this insight (2-5 words)" }
            },
            required: ["insight", "name"],
            additionalProperties: false
        }
    };

    const modelCaller = useConsultant ? callConsultantModel : callSubsystemModel;
    const response = await modelCaller(subsystem, prompt, {
        jsonSchema,
    });

    // Parse JSON response
    let cleaned;
    let parsedName: string | null = null;
    try {
        const parsed = JSON.parse(response);
        cleaned = parsed.insight || response;
        if (parsed.name && typeof parsed.name === 'string') parsedName = parsed.name.trim().slice(0, 200) || null;
    } catch {
        // Fallback: try to extract JSON from response
        const jsonMatch = response.match(/\{[\s\S]*"insight"\s*:\s*"([^"]+)"[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[1];
        } else {
            // Last resort: clean up raw text
            cleaned = response;
            for (const pat of config.voicing.responseCleanupPatterns) {
                cleaned = cleaned.replace(new RegExp(pat, 'i'), '');
            }
            cleaned = cleaned.trim();
        }
    }

    // Reject NO_VALID_SYNTHESIS — the LLM determined no genuine connection exists
    if (cleaned === 'NO_VALID_SYNTHESIS' || cleaned.includes('NO_VALID_SYNTHESIS')) {
        const msg = 'No valid structural connection between parents';
        console.error(`  Voice output rejected (${msg})`);
        emitActivity('voicing', 'rejected', msg, { gate: 'forced_analogy', ...modelProv });
        return { content: null, rejectionReason: 'no_valid_connection', rejectionDetail: { gate: 'forced_analogy', ...modelProv } };
    }

    // Reject outputs starting with stray colon (common LLM artifact)
    if (cleaned.startsWith(':')) {
        cleaned = cleaned.replace(/^:\s*/, '');
    }

    // Reject incomplete output (configurable truncation checks)
    const trimmed = cleaned.trim();
    if (config.voicing.rejectUnclosedParens) {
        const openParens = (trimmed.match(/\(/g) || []).length;
        const closeParens = (trimmed.match(/\)/g) || []).length;
        if (openParens > closeParens) {
            const msg = 'Truncated: unclosed parentheses';
            console.error(`  Voice output rejected (${msg})`);
            emitActivity('voicing', 'rejected', msg, { gate: 'truncation', ...modelProv });
            return { content: null, rejectionReason: 'truncated_parens', rejectionDetail: { gate: 'truncation', ...modelProv } };
        }
        if (!/[.!?]$/.test(trimmed) && /[,(]$/.test(trimmed)) {
            const msg = 'Truncated: ends with comma or open paren';
            console.error(`  Voice output rejected (${msg})`);
            emitActivity('voicing', 'rejected', msg, { gate: 'truncation', ...modelProv });
            return { content: null, rejectionReason: 'truncated_trailing', rejectionDetail: { gate: 'truncation', ...modelProv } };
        }
    }
    if (config.voicing.rejectNoSentenceEnding) {
        if (!/[.!?]$/.test(trimmed)) {
            const msg = 'Truncated: no sentence-ending punctuation';
            console.error(`  Voice output rejected (${msg})`);
            emitActivity('voicing', 'rejected', msg, { gate: 'truncation', ...modelProv });
            return { content: null, rejectionReason: 'truncated_no_ending', rejectionDetail: { gate: 'truncation', ...modelProv } };
        }
    }

    // Reject or truncate if too long
    const maxOutput = config.voicing.maxOutputWords;
    const wordCount = cleaned.split(/\s+/).length;
    if (wordCount > maxOutput) {
        // If grossly over limit (>2x), the LLM ignored constraints — reject entirely
        if (wordCount > maxOutput * 2) {
            const msg = `Too long: ${wordCount} words, limit ${maxOutput} — LLM ignored length constraint`;
            console.error(`  Voice output rejected (${msg})`);
            emitActivity('voicing', 'rejected', msg, { gate: 'word_count', wordCount, maxOutput, ...modelProv });
            return { content: null, rejectionReason: 'too_long', rejectionDetail: { gate: 'word_count', wordCount, maxOutput, ...modelProv } };
        }
        const firstSentence = cleaned.match(/^[^.!?]+[.!?]/);
        if (firstSentence) {
            cleaned = firstSentence[0].trim();
        } else {
            cleaned = cleaned.split(/\s+/).slice(0, config.voicing.truncatedWords).join(' ') + '...';
        }
    }

    // Strip any echoed [[[NXnnn]]] variable refs from output — synthesis should produce raw numbers
    // (the output gets its own fresh variable refs when stored via handlePropose)
    cleaned = cleaned.replace(/\[\[\[[A-Z]+\d+\]\]\]/g, '').replace(/\s{2,}/g, ' ').trim();

    return { content: cleaned, name: parsedName };
}

/**
 * Multi-parent voicing — GA-inspired recombination from 3-4 parent nodes.
 *
 * Uses a specialised prompt (`core.multi_insight_synthesis`) that demands insight
 * from the COMBINATION of all inputs. Applies the same quality gates as
 * {@link voice} (truncation, novelty, hallucination, consultant review).
 *
 * @param nodes - Array of 3-4 parent nodes to synthesise from.
 * @param _mode - Voicing mode label (currently unused; default `'object-following'`).
 * @param subsystem - LLM subsystem to route the call through (default `'synthesis'`).
 * @param useConsultant - When `true`, calls the consultant model instead of the primary.
 * @returns A {@link VoicingResult} with the synthesised content or a rejection reason.
 */
async function voiceMulti(nodes: ResonanceNode[], _mode: string = 'object-following', subsystem: Subsystem = 'synthesis', useConsultant: boolean = false, reworkContext?: { priorAttempt: string; feedback: string }): Promise<VoicingResult> {

    // Model provenance — computed early so all rejection paths can include it
    const assignedModel = getAssignedModel(subsystem as any);
    const modelProv = { modelId: assignedModel?.id ?? null, modelName: assignedModel?.name ?? null };

    // Compress all parent contents with telegraphic notation if enabled
    const processedContents = nodes.map((n, i) => {
        let content = n.content;
        if (config.voicing.telegraphicEnabled) {
            const levelMap: Record<number, 'light' | 'medium' | 'aggressive'> = { 1: 'light', 2: 'medium', 3: 'aggressive' };
            const raw = config.voicing.telegraphicAggressiveness as any;
            const aggressiveness = typeof raw === 'number' ? (levelMap[raw] || 'medium') : raw;
            const entropy: Partial<EntropyOptions> = {
                enabled: config.voicing.entropyEnabled,
                weights: config.voicing.entropyWeights,
                thresholds: config.voicing.entropyThresholds,
                rarityMinLength: config.voicing.entropyRarityMinLength,
            };
            content = toTelegraphic(content, { aggressiveness, entropy });
        }
        return `<node-content provenance="${buildProvenanceTag(n)}">${content}</node-content>`;
    });
    const contents = processedContents.join('\n\n');

    // Build number variable legend for multi-parent synthesis
    let multiVarLegend = '';
    if (config.numberVariables?.enabled) {
        const allVarIds = extractVarIdsFromContent(contents);
        if (allVarIds.length > 0) {
            const vars = await getVariablesByIds(allVarIds);
            multiVarLegend = buildVariableLegend(vars);
        }
    }

    const multiProjectContext = await getProjectContextBlock();
    const multiBasePrompt = await getPrompt('core.multi_insight_synthesis', { contents, numberVariableLegend: multiVarLegend, provenanceGuide: PROVENANCE_GUIDE_SYNTHESIS });

    // Inject legend + provenance BEFORE the prompt if the template didn't already include them
    const multiPreambleParts: string[] = [];
    if (multiVarLegend && !multiBasePrompt.includes(multiVarLegend)) multiPreambleParts.push(multiVarLegend);
    if (PROVENANCE_GUIDE_SYNTHESIS && !multiBasePrompt.includes('PROVENANCE')) multiPreambleParts.push(PROVENANCE_GUIDE_SYNTHESIS);
    const multiPreamble = multiPreambleParts.length > 0 ? multiPreambleParts.join('\n\n') + '\n\n' : '';
    const multiPromptWithContext = `${multiPreamble}${multiBasePrompt}`;
    let prompt = multiProjectContext ? `${multiProjectContext}\n\n${multiPromptWithContext}` : multiPromptWithContext;

    // Inject rework context if this is a retry after minitruth feedback
    if (reworkContext) {
        prompt += `\n\nREWORK: Your prior synthesis was: "${reworkContext.priorAttempt}"\nThe reviewer said: "${reworkContext.feedback}"\nGenerate an improved synthesis addressing this feedback.`;
    }

    const maxWords = config.voicing.maxInsightWords;
    const jsonSchema = {
        name: "synthesis",
        schema: {
            type: "object",
            properties: {
                insight: { type: "string", description: `One sentence synthesis insight under ${maxWords} words` },
                name: { type: "string", description: "Short descriptive name for this insight (2-5 words)" }
            },
            required: ["insight", "name"],
            additionalProperties: false
        }
    };

    const modelCaller = useConsultant ? callConsultantModel : callSubsystemModel;
    const response = await modelCaller(subsystem, prompt, {
        jsonSchema,
    });

    // Parse JSON response (same logic as voice())
    let cleaned;
    let parsedName: string | null = null;
    try {
        const parsed = JSON.parse(response);
        cleaned = parsed.insight || response;
        if (parsed.name && typeof parsed.name === 'string') parsedName = parsed.name.trim().slice(0, 200) || null;
    } catch {
        const jsonMatch = response.match(/\{[\s\S]*"insight"\s*:\s*"([^"]+)"[\s\S]*\}/);
        if (jsonMatch) {
            cleaned = jsonMatch[1];
        } else {
            cleaned = response;
            for (const pat of config.voicing.responseCleanupPatterns) {
                cleaned = cleaned.replace(new RegExp(pat, 'i'), '');
            }
            cleaned = cleaned.trim();
        }
    }

    // Reject NO_VALID_SYNTHESIS
    if (cleaned === 'NO_VALID_SYNTHESIS' || cleaned.includes('NO_VALID_SYNTHESIS')) {
        const msg = 'No valid structural connection between parents';
        console.error(`  VoiceMulti output rejected (${msg})`);
        emitActivity('voicing', 'rejected', msg, { gate: 'forced_analogy', ...modelProv });
        return { content: null, rejectionReason: 'no_valid_connection', rejectionDetail: { gate: 'forced_analogy', ...modelProv } };
    }

    // Strip stray leading colon
    if (cleaned.startsWith(':')) {
        cleaned = cleaned.replace(/^:\s*/, '');
    }

    // Reject incomplete output
    const trimmed = cleaned.trim();
    if (config.voicing.rejectUnclosedParens) {
        const openParens = (trimmed.match(/\(/g) || []).length;
        const closeParens = (trimmed.match(/\)/g) || []).length;
        if (openParens > closeParens) {
            const msg = 'Truncated: unclosed parentheses';
            console.error(`  VoiceMulti output rejected (${msg})`);
            emitActivity('voicing', 'rejected', msg, { gate: 'truncation', ...modelProv });
            return { content: null, rejectionReason: 'truncated_parens', rejectionDetail: { gate: 'truncation', ...modelProv } };
        }
        if (!/[.!?]$/.test(trimmed) && /[,(]$/.test(trimmed)) {
            const msg = 'Truncated: ends with comma or open paren';
            console.error(`  VoiceMulti output rejected (${msg})`);
            emitActivity('voicing', 'rejected', msg, { gate: 'truncation', ...modelProv });
            return { content: null, rejectionReason: 'truncated_trailing', rejectionDetail: { gate: 'truncation', ...modelProv } };
        }
    }
    if (config.voicing.rejectNoSentenceEnding) {
        if (!/[.!?]$/.test(trimmed)) {
            const msg = 'Truncated: no sentence-ending punctuation';
            console.error(`  VoiceMulti output rejected (${msg})`);
            emitActivity('voicing', 'rejected', msg, { gate: 'truncation', ...modelProv });
            return { content: null, rejectionReason: 'truncated_no_ending', rejectionDetail: { gate: 'truncation', ...modelProv } };
        }
    }

    // Reject or truncate if too long
    const maxOutput = config.voicing.maxOutputWords;
    const wordCount = cleaned.split(/\s+/).length;
    if (wordCount > maxOutput) {
        // If grossly over limit (>2x), the LLM ignored constraints — reject entirely
        if (wordCount > maxOutput * 2) {
            const msg = `Too long: ${wordCount} words, limit ${maxOutput} — LLM ignored length constraint`;
            console.error(`  VoiceMulti output rejected (${msg})`);
            emitActivity('voicing', 'rejected', msg, { gate: 'word_count', wordCount, maxOutput, ...modelProv });
            return { content: null, rejectionReason: 'too_long', rejectionDetail: { gate: 'word_count', wordCount, maxOutput, ...modelProv } };
        }
        const firstSentence = cleaned.match(/^[^.!?]+[.!?]/);
        if (firstSentence) {
            cleaned = firstSentence[0].trim();
        } else {
            cleaned = cleaned.split(/\s+/).slice(0, config.voicing.truncatedWords).join(' ') + '...';
        }
    }

    // Strip any echoed [[[NXnnn]]] variable refs from multi-parent output
    cleaned = cleaned.replace(/\[\[\[[A-Z]+\d+\]\]\]/g, '').replace(/\s{2,}/g, ' ').trim();

    return { content: cleaned, name: parsedName };
}

export { voice, voiceMulti };
