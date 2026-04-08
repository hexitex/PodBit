/**
 * API Onboarding Interview — multi-turn LLM conversation to configure a new API.
 *
 * Follows the same pattern as handlers/projects/interview.ts:
 * - In-memory Map with 30-min TTL
 * - Uses `chat` subsystem for the LLM
 * - LLM returns JSON with `complete: true` when done
 * - On completion, creates the api_registry entry + saves generated prompts
 */

import { getPrompt } from '../../prompts.js';
import { createApi, savePromptVersion } from './registry.js';
import type { ApiRegistryEntry, OnboardInterviewState } from './types.js';

// =============================================================================
// IN-MEMORY INTERVIEW SESSIONS
// =============================================================================

const interviewSessions = new Map<string, OnboardInterviewState>();
const INTERVIEW_TTL_MS = 30 * 60 * 1000;

/**
 * Removes interview sessions older than 30 minutes from the in-memory map.
 * Called before each interview operation to prevent memory leaks.
 */
function cleanupStaleInterviews(): void {
    const now = Date.now();
    for (const [id, state] of interviewSessions) {
        if (now - state.createdAt > INTERVIEW_TTL_MS) {
            interviewSessions.delete(id);
        }
    }
}

// =============================================================================
// INTERVIEW HANDLER
// =============================================================================

/**
 * Multi-turn LLM interview to configure a new API.
 *
 * Start a new interview by providing `name` (no interviewId).
 * Continue an existing interview by providing `interviewId` and `response`.
 * The LLM asks questions about the API (base URL, auth, response format, etc.)
 * and returns a completed config JSON when it has enough information.
 * On completion, creates the api_registry entry and saves generated prompts.
 *
 * @param params - Interview parameters:
 *   - name: API name (required to start; alphanumeric, hyphens, underscores only)
 *   - interviewId: Session ID to continue an existing interview
 *   - response: User's answer to the last question
 * @returns Interview state with question/step (in_progress), created API (complete), or error
 */
export async function handleOnboard(params: {
    name?: string;
    interviewId?: string;
    response?: string;
}): Promise<{
    interviewId?: string;
    question?: string;
    step?: number;
    status: 'in_progress' | 'complete' | 'error';
    api?: ApiRegistryEntry;
    error?: string;
}> {
    const { name, interviewId, response } = params;

    cleanupStaleInterviews();

    // === Start new interview ===
    if (!interviewId) {
        if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
            return { status: 'error', error: 'name is required. Use alphanumeric, hyphens, underscores only.' };
        }

        // Check if API already exists
        const { getApiByName } = await import('./registry.js');
        const existing = await getApiByName(name);
        if (existing) {
            return { status: 'error', error: `API "${name}" already exists (id: ${existing.id})` };
        }

        const id = `api-onboard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Get opening question from the LLM
        let question: string;
        try {
            const { callSubsystemModel } = await import('../../models.js');
            const prompt = await getPrompt('api.onboard_start', { apiName: name });
            question = await callSubsystemModel('chat', prompt, {});
            question = question.trim();
        } catch (err: any) {
            return { status: 'error', error: `Failed to start interview: ${err.message}` };
        }

        const state: OnboardInterviewState = {
            interviewId: id,
            name,
            turns: [{ role: 'assistant', content: question }],
            createdAt: Date.now(),
        };
        interviewSessions.set(id, state);

        return {
            interviewId: id,
            question,
            step: 1,
            status: 'in_progress',
        };
    }

    // === Continue existing interview ===
    const state = interviewSessions.get(interviewId);
    if (!state) {
        return { status: 'error', error: `Interview session "${interviewId}" not found or expired.` };
    }

    if (!response || typeof response !== 'string') {
        return { status: 'error', error: 'response is required to continue the interview.' };
    }

    // Add user's response to history
    state.turns.push({ role: 'user', content: response });

    // Build conversation history
    const historyLines = state.turns.slice(0, -1).map(t =>
        t.role === 'assistant' ? `Interviewer: ${t.content}` : `User: ${t.content}`
    );
    const history = historyLines.length > 0
        ? `Conversation so far:\n${historyLines.join('\n')}\n`
        : '';

    // Call LLM for next question or completed config
    let llmResponse: string;
    try {
        const { callSubsystemModel } = await import('../../models.js');
        const prompt = await getPrompt('api.onboard_continue', { history, response });
        llmResponse = await callSubsystemModel('chat', prompt, {});
        llmResponse = llmResponse.trim();
    } catch (err: any) {
        return { status: 'error', error: `Interview LLM call failed: ${err.message}` };
    }

    // Check if LLM returned a completed config
    let jsonCandidate: string | null = null;
    const firstBrace = llmResponse.indexOf('{');
    if (firstBrace >= 0 && llmResponse.includes('"complete"') && llmResponse.includes('"config"')) {
        let depth = 0;
        for (let i = firstBrace; i < llmResponse.length; i++) {
            if (llmResponse[i] === '{') depth++;
            else if (llmResponse[i] === '}') depth--;
            if (depth === 0) {
                jsonCandidate = llmResponse.slice(firstBrace, i + 1);
                break;
            }
        }
    }

    if (jsonCandidate) {
        let parsed: {
            complete: boolean;
            config: Record<string, any>;
            prompts?: { query?: string; interpret?: string; extract?: string };
            testCases?: any[];
        };
        try {
            parsed = JSON.parse(jsonCandidate);
        } catch {
            // Malformed JSON — ask to clarify
            const retryMsg = 'I need a bit more detail to finalize the configuration. Could you confirm the base URL and response format?';
            state.turns.push({ role: 'assistant', content: retryMsg });
            return {
                interviewId,
                question: retryMsg,
                step: Math.ceil(state.turns.length / 2),
                status: 'in_progress',
            };
        }

        if (parsed.complete && parsed.config) {
            // Clean up interview session
            interviewSessions.delete(interviewId);

            const cfg = parsed.config;
            const prompts = parsed.prompts ?? {};

            // Create the registry entry
            try {
                // Derive testUrl: prefer explicit cfg.testUrl, fall back to first test case URL
                const testUrl = cfg.testUrl ?? parsed.testCases?.[0]?.url ?? undefined;

                // Validate mode from interview — default to 'verify' if invalid
                const validModes = ['verify', 'enrich', 'both'] as const;
                const interviewMode = validModes.includes(cfg.mode) ? cfg.mode : 'verify';

                const api = await createApi({
                    name: cfg.name || state.name,
                    displayName: cfg.displayName || cfg.name || state.name,
                    description: cfg.description ?? null,
                    baseUrl: cfg.baseUrl,
                    testUrl,
                    authType: cfg.authType ?? 'none',
                    authKey: cfg.authKey ?? null,
                    authHeader: cfg.authHeader ?? null,
                    maxRpm: cfg.maxRpm ?? 5,
                    maxConcurrent: cfg.maxConcurrent ?? 1,
                    timeoutMs: cfg.timeoutMs ?? 30000,
                    responseFormat: cfg.responseFormat ?? 'json',
                    mode: interviewMode,
                    promptQuery: prompts.query ?? undefined,
                    promptInterpret: prompts.interpret ?? undefined,
                    promptExtract: prompts.extract ?? undefined,
                    promptNotes: `Onboarded via interview. Capabilities: ${(cfg.capabilities || []).join(', ')}`,
                    capabilities: cfg.capabilities ?? [],
                    domains: cfg.domains ?? [],
                    testCases: parsed.testCases ?? [],
                    onboardedBy: 'interview',
                });

                // Save initial prompt versions for history tracking
                if (prompts.query) {
                    await savePromptVersion(api.id, 'prompt_query', prompts.query, 'onboarding', 'interview');
                }
                if (prompts.interpret) {
                    await savePromptVersion(api.id, 'prompt_interpret', prompts.interpret, 'onboarding', 'interview');
                }
                if (prompts.extract) {
                    await savePromptVersion(api.id, 'prompt_extract', prompts.extract, 'onboarding', 'interview');
                }

                return {
                    interviewId,
                    status: 'complete',
                    api,
                };
            } catch (err: any) {
                return {
                    status: 'error',
                    error: `Interview complete but API creation failed: ${err.message}`,
                };
            }
        }
    }

    // LLM asked another question — continue
    state.turns.push({ role: 'assistant', content: llmResponse });

    return {
        interviewId,
        question: llmResponse,
        step: Math.ceil(state.turns.length / 2),
        status: 'in_progress',
    };
}
