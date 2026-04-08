/**
 * API key management and settings persistence.
 *
 * Manages provider-level API keys (OpenAI, Anthropic, etc.) in the system DB settings table.
 * Keys are loaded into an in-memory cache at startup and merged on update.
 * Also provides generic setting load/save helpers used by other modules.
 * @module models/api-keys
 */
import { systemQuery as query, systemQueryOne as queryOne } from '../db.js';

// In-memory API key cache
let apiKeyCache: Record<string, string> = {};

/**
 * Returns cached API key for a provider. Synchronous (reads from in-memory cache).
 * @param provider - Provider name (e.g. 'openai', 'anthropic')
 * @returns The API key string, or undefined if not configured
 */
export function getApiKey(provider: string): string | undefined {
    return apiKeyCache[provider] || undefined;
}

/** Loads API keys from settings (api.keys) into cache; env vars as fallback. */
export async function loadApiKeys(): Promise<void> {
    try {
        const saved = await loadSetting('api.keys');
        if (saved && typeof saved === 'object') {
            apiKeyCache = { ...saved };
        }
    } catch (e: any) {
        console.error('[models] Failed to load API keys from DB:', e.message);
    }
    console.log(`[models] API keys loaded: ${Object.keys(apiKeyCache).filter(k => !!apiKeyCache[k]).join(', ') || 'none'}`);
}

/**
 * Merges keys into the in-memory cache and persists to the settings table.
 * Empty string values delete the key for that provider.
 * @param keys - Record of provider -> API key (or '' to delete)
 */
export async function setApiKeys(keys: Record<string, string>): Promise<void> {
    // Merge — only overwrite keys that are explicitly provided
    for (const [provider, key] of Object.entries(keys)) {
        if (key === '') {
            delete apiKeyCache[provider];
        } else {
            apiKeyCache[provider] = key;
        }
    }
    await saveSetting('api.keys', apiKeyCache);
    console.log(`[models] API keys updated: ${Object.keys(apiKeyCache).filter(k => !!apiKeyCache[k]).join(', ') || 'none'}`);
}

/**
 * Returns masked key status for display in the GUI.
 * Shows first 4 and last 4 characters for keys longer than 12 chars.
 * @returns Record of provider -> masked key string or null if not configured
 */
export function getApiKeyStatus(): Record<string, string | null> {
    const status: Record<string, string | null> = {};
    for (const provider of ['openai', 'anthropic']) {
        const key = apiKeyCache[provider];
        if (key) {
            // Show first 4 and last 4 chars, mask the rest
            if (key.length > 12) {
                status[provider] = `${key.slice(0, 4)}...${key.slice(-4)}`;
            } else {
                status[provider] = '***configured***';
            }
        } else {
            status[provider] = null;
        }
    }
    return status;
}


/** Persists a key-value to system settings (JSON-serialized). */
export async function saveSetting(key: string, value: unknown): Promise<void> {
    try {
        await query(
            `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
            [key, JSON.stringify(value)]
        );
    } catch (e: any) {
        console.error(`[models] Failed to save setting ${key}:`, e.message);
    }
}

/** Loads a value from system settings by key (JSON-parsed). */
export async function loadSetting(key: string): Promise<any> {
    try {
        const row = await queryOne('SELECT value FROM settings WHERE key = $1', [key]);
        if (!row) return null;
        return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
    } catch (e: any) {
        console.error(`[models] Failed to load setting ${key}:`, e.message);
        return null;
    }
}
