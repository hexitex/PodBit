/**
 * @module proxy/knowledge
 *
 * Proxy knowledge injection and settings management. Loads proxy-specific
 * configuration from the DB (telegraphic compression, entropy settings, tool
 * calling mode, knowledge budgets) and provides the `injectKnowledge()` function
 * that prepends graph knowledge into the message array's system message.
 */
import { config } from '../config.js';
import { systemQueryOne as queryOne } from '../db.js';
import { createCachedLoader } from '../utils/cached-settings.js';
import { type Aggressiveness, DEFAULT_ENTROPY_OPTIONS } from '../telegraphic.js';

// Proxy settings (loaded from DB on startup, falls back to config.ts)
export let proxySettings = {
    knowledgeReserve: config.proxy.knowledgeReserve,
    knowledgeMinReserve: config.proxy.knowledgeMinReserve,
    telegraphicEnabled: false,
    telegraphicAggressiveness: 'medium' as Aggressiveness,
    compressClientPrompt: false, // compress the client's system prompt too
    // Fallback model profile when context size is unknown
    defaultModelProfile: 'medium' as string,
    // Entropy-aware compression (off by default)
    entropyEnabled: false,
    entropyWeights: { ...DEFAULT_ENTROPY_OPTIONS.weights },
    entropyThresholds: { ...DEFAULT_ENTROPY_OPTIONS.thresholds },
    entropyRarityMinLength: DEFAULT_ENTROPY_OPTIONS.rarityMinLength,
    // Knowledge node limit (0 = use profile default)
    maxKnowledgeNodes: 0,
    // Tool calling (off by default)
    toolCallingEnabled: false,
    toolCallingMode: 'read-only' as 'read-only' | 'read-write',
    toolCallingMaxIterations: 5,
    toolCallingStrategy: 'complement' as 'complement' | 'replace',
};

const proxySettingsLoader = createCachedLoader(async () => {
    try {
        const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, ['proxy.config']);
        if (row) {
            const saved = JSON.parse(row.value);
            return { ...proxySettings, ...saved };
        }
    } catch (err: any) {
        console.warn(`  \u26a0 Proxy settings: using defaults (${err.message})`);
    }
    return { ...proxySettings };
});

/** Loads proxy config from DB (settings.proxy.config) into proxySettings; used before each completions request. */
export async function ensureProxySettings(): Promise<void> {
    proxySettings = await proxySettingsLoader.get();
}

// =============================================================================
// KNOWLEDGE INJECTION
// =============================================================================

/**
 * Inject knowledge context into the message array's system message.
 *
 * When the client provides its own tools (e.g., Roo Code, Cursor), uses a
 * passive wrapper (`<knowledge-context>`) that doesn't conflict with tool-calling
 * instructions. Otherwise, uses a restrictive wrapper that prioritizes the
 * knowledge context and discourages tool use.
 *
 * Knowledge is prepended before the client's existing system prompt so that
 * smaller models see it first.
 *
 * @param messages - The original message array (not mutated; a shallow copy is returned)
 * @param knowledgePrompt - The formatted knowledge text to inject
 * @param clientHasTools - Whether the client request includes tool definitions (default: false)
 * @returns New message array with knowledge injected into the system message
 */
export function injectKnowledge(messages: Array<{ role: string; content: string }>, knowledgePrompt: string, clientHasTools = false): Array<{ role: string; content: string }> {
    const result = [...messages];

    // When the client provides its own tools (e.g. Roo Code, Cursor, etc.), use a passive
    // wrapper that doesn't conflict with tool-calling instructions. The restrictive wrapper
    // tells the model "do NOT use tools" which directly sabotages coding assistants.
    const wrappedKnowledge = clientHasTools
        ? '<knowledge-context>\nThe following domain knowledge may be relevant to the current task. Use it alongside your other capabilities.\n\n' + knowledgePrompt + '\n</knowledge-context>\n\n---\n'
        : '[PRIORITY INSTRUCTION \u2014 READ THIS FIRST]\nYou have been given domain knowledge below. Answer the user\'s question using ONLY this knowledge and your training data. Do NOT use tools, read files, execute commands, or access external resources. Respond directly from the provided context.\n\n<knowledge-context>\n' + knowledgePrompt + '\n</knowledge-context>\n\n---\n';

    // Find existing system message
    const systemIdx = result.findIndex(m => m.role === 'system');

    if (systemIdx >= 0) {
        // PREPEND knowledge before client's system prompt so it takes priority with small models
        result[systemIdx] = {
            ...result[systemIdx],
            content: wrappedKnowledge + result[systemIdx].content,
        };
    } else {
        // Prepend a new system message
        result.unshift({
            role: 'system',
            content: wrappedKnowledge,
        });
    }

    return result;
}
