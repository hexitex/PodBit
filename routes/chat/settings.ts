/**
 * @module routes/chat/settings
 *
 * Cached chat configuration loader.  Reads `chat.config` from the settings
 * table once, then serves the in-memory snapshot until the cache expires
 * (TTL controlled by {@link createCachedLoader}).
 */

import { queryOne } from '../../db.js';
import { createCachedLoader } from '../../utils/cached-settings.js';

/**
 * In-memory chat settings.  Updated by {@link ensureChatSettings} on each
 * request that needs them.
 */
export let chatSettings = {
    toolCallingEnabled: false,
    toolCallingMaxIterations: 3,
    toolCallingMode: 'read-write' as 'read-only' | 'read-write',
    maxKnowledgeNodes: 0, // 0 = use context engine profile default
    modelProfile: '' as string, // '' = use context engine default (medium)
};

const chatSettingsLoader = createCachedLoader(async () => {
    try {
        const row: any = await queryOne(`SELECT value FROM settings WHERE key = $1`, ['chat.config']);
        if (row?.value) return { ...chatSettings, ...JSON.parse(row.value) };
    } catch { /* Use defaults */ }
    return { ...chatSettings };
});

/** Loads chat config from settings into the in-memory chatSettings object (tool calling, profile, etc.). */
export async function ensureChatSettings(): Promise<void> {
    chatSettings = await chatSettingsLoader.get();
}
