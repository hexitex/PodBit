import fs from 'fs';
import path from 'path';
import { query, getProjectDir } from '../../db.js';
import { getPrompt } from '../../prompts.js';
import type { ProjectManifest } from '../../core/project-context.js';
import { setProjectSwitching, resetAbortController } from './meta.js';
import { stopAllBackgroundServices } from './services.js';
import { handleNew } from './crud.js';

// =============================================================================
// INTERVIEW-BASED PROJECT CREATION
// =============================================================================

interface InterviewState {
    interviewId: string;
    name: string;
    description?: string;
    turns: { role: 'assistant' | 'user'; content: string }[];
    createdAt: number;
}

/** In-memory interview sessions — short-lived, cleaned up after 30 minutes */
const interviewSessions = new Map<string, InterviewState>();
const INTERVIEW_TTL_MS = 30 * 60 * 1000;

/** Removes in-memory interview sessions older than 30 minutes. */
export function cleanupStaleInterviews(): void {
    const now = Date.now();
    for (const [id, state] of interviewSessions) {
        if (now - state.createdAt > INTERVIEW_TTL_MS) {
            interviewSessions.delete(id);
        }
    }
}

/**
 * Interview-based project creation.
 *
 * Flow:
 * 1. First call: `action: "interview", name: "my-project"` → starts interview, returns first question
 * 2. Continue: `action: "interview", interviewId: "...", response: "user's answer"` → returns next question
 * 3. When LLM has enough info, it returns the manifest and the project is created automatically
 *
 * The gold-standard LLM (chat subsystem) conducts the interview.
 */
export async function handleInterview(params: Record<string, any>) {
    const { name, interviewId, response } = params;

    cleanupStaleInterviews();

    // === Start new interview ===
    if (!interviewId) {
        if (!name || typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
            return { error: 'name is required to start an interview. Use alphanumeric, hyphens, underscores only.' };
        }

        const pDir = getProjectDir();
        if (fs.existsSync(path.join(pDir, `${name}.db`))) {
            return { error: `Project "${name}" already exists` };
        }

        const id = `interview-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        // Stop background services before starting the interview.
        // The interview uses the chat LLM — if the synthesis engine or
        // autonomous cycles are running on the same model (especially local
        // models that handle one request at a time), the interview call blocks.
        await stopAllBackgroundServices();
        setProjectSwitching(false);
        resetAbortController();

        // Resume the KB pipeline — stopAllBackgroundServices sets stopRequested=true
        // which permanently blocks KB processing until resume() is called.
        // The interview only needed to free the LLM, not permanently halt KB.
        try {
            const { processingPipeline } = await import('../../kb/pipeline.js');
            processingPipeline.resume();
        } catch { /* KB module may not be loaded */ }

        // Get the opening question from the LLM
        let question: string;
        try {
            const { callSubsystemModel } = await import('../../models.js');
            const prompt = await getPrompt('project.interview_start', { projectName: name });
            question = await callSubsystemModel('chat', prompt, {});
            question = question.trim();
        } catch (err: any) {
            return { error: `Failed to start interview: ${err.message}` };
        }

        const state: InterviewState = {
            interviewId: id,
            name,
            description: params.description,
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
        return { error: `Interview session "${interviewId}" not found or expired. Start a new one with action: "interview", name: "..."` };
    }

    if (!response || typeof response !== 'string') {
        return { error: 'response is required to continue the interview.' };
    }

    // Add user's response to history
    state.turns.push({ role: 'user', content: response });

    // Build conversation history for the LLM (all turns except the current user response,
    // which is passed separately as {{response}} in the prompt template)
    const historyLines = state.turns.slice(0, -1).map(t =>
        t.role === 'assistant' ? `Interviewer: ${t.content}` : `User: ${t.content}`
    );
    const history = historyLines.length > 0
        ? `Conversation so far:\n${historyLines.join('\n')}\n`
        : '';

    // Call the gold-standard LLM for the next question or manifest
    let llmResponse: string;
    try {
        const { callSubsystemModel } = await import('../../models.js');
        const prompt = await getPrompt('project.interview', {
            history,
            response,
        });
        llmResponse = await callSubsystemModel('chat', prompt, {});
        llmResponse = llmResponse.trim();
    } catch (err: any) {
        return { error: `Interview LLM call failed: ${err.message}` };
    }

    // Check if the LLM returned a completed manifest
    // Extract JSON robustly — find the outermost { } that contains both "complete" and "manifest"
    let jsonCandidate: string | null = null;
    const firstBrace = llmResponse.indexOf('{');
    if (firstBrace >= 0 && llmResponse.includes('"complete"') && llmResponse.includes('"manifest"')) {
        // Find matching closing brace by counting depth
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
        let parsed: { complete: boolean; manifest: ProjectManifest };
        try {
            parsed = JSON.parse(jsonCandidate);
        } catch {
            // LLM returned malformed JSON — ask it to try again
            state.turns.push({ role: 'assistant', content: 'Let me compile what I\'ve learned. Could you confirm: is there anything else important about this project I should know?' });
            return {
                interviewId,
                question: 'Let me compile what I\'ve learned. Could you confirm: is there anything else important about this project I should know?',
                step: Math.ceil(state.turns.length / 2),
                status: 'in_progress',
            };
        }

        if (parsed.complete && parsed.manifest) {
            // Clean up interview session
            interviewSessions.delete(interviewId);

            // Create the project using the manifest
            const manifest = parsed.manifest;
            const createResult = await handleNew({
                name: state.name,
                description: state.description || manifest.purpose,
                purpose: manifest.purpose,
                domains: manifest.domains,
                bridges: manifest.bridges,
                goals: manifest.goals,
                autoBridge: manifest.autoBridge,
            });

            if (createResult.error) {
                return { error: `Interview complete but project creation failed: ${createResult.error}`, manifest };
            }

            // Store the full manifest in settings (includes keyQuestions, constraints)
            try {
                await query(
                    `INSERT OR REPLACE INTO settings (key, value) VALUES ('project.manifest', $1)`,
                    [JSON.stringify(manifest)]
                );
            } catch (err: any) {
                console.error(`[interview] Failed to store manifest: ${err.message}`);
            }

            // Store interview transcript for reference
            try {
                await query(
                    `INSERT OR REPLACE INTO settings (key, value) VALUES ('project.interview_transcript', $1)`,
                    [JSON.stringify(state.turns)]
                );
            } catch (err: any) {
                console.error(`[interview] Failed to store transcript: ${err.message}`);
            }

            return {
                interviewId,
                status: 'complete',
                manifest,
                project: createResult,
            };
        }
    }

    // LLM asked another question — continue the interview
    state.turns.push({ role: 'assistant', content: llmResponse });

    return {
        interviewId,
        question: llmResponse,
        step: Math.ceil(state.turns.length / 2),
        status: 'in_progress',
    };
}
