/**
 * Global singleton EventEmitter for live activity streaming.
 *
 * Components emit events here; the SSE endpoint in `routes/activity.ts`
 * subscribes and streams them to GUI clients. A 100-event ring buffer
 * serves late joiners and REST fallback requests.
 *
 * When running inside the MCP stdio process (detected via `MCP_STDIO_SERVER`
 * env var), events are forwarded to the HTTP server via POST so they appear
 * in the GUI activity feed even though the MCP process has no SSE listeners.
 *
 * @module services/event-bus
 */

import { EventEmitter } from 'events';
import { PORTS, localUrl } from '../config/ports.js';

// --- Types ---

/**
 * Classification axis for the activity feed. Each event belongs to exactly
 * one category, which the GUI uses for filtering and colour-coding.
 * New categories must be added here and will automatically appear in the
 * activity feed UI.
 */
export type ActivityCategory = 'synthesis' | 'proxy' | 'mcp' | 'kb' | 'voicing' | 'config' | 'system' | 'llm' | 'cycle' | 'lifecycle' | 'elite' | 'api' | 'lab';

/**
 * Shape consumed by SSE clients (GUI activity feed) and persisted to
 * the `activity_log` table. The `detail` bag carries structured metadata
 * whose schema varies per category/type — consumers should treat it as
 * opaque unless they know the specific event type.
 */
export interface ActivityEvent {
    id: number;
    category: ActivityCategory;
    type: string;
    message: string;
    detail?: Record<string, any>;
    timestamp: string;
}

// --- Cross-process forwarding ---
// When running in the MCP stdio process, emitActivity calls from handlers
// (node-ops, voicing, etc.) go to a local EventEmitter nobody listens to.
// Forward them to the HTTP server so the GUI activity feed sees them.

const isMcpProcess = process.env.MCP_STDIO_SERVER === '1';

const forwardUrl = isMcpProcess
    ? `${localUrl(PORTS.api)}/api/activity/emit`
    : null;

// Lazy-loaded security key for MCP → HTTP forwarding
let _forwardKey: string | null = null;
/** Resolves the security key used to authenticate MCP→HTTP activity forwarding. */
async function getForwardKey(): Promise<string> {
    if (_forwardKey) return _forwardKey;
    try {
        const { getSecurityKey } = await import('../core/security.js');
        _forwardKey = await getSecurityKey();
    } catch {
        _forwardKey = '';
    }
    return _forwardKey;
}

/**
 * Forward an activity event to the HTTP server via POST.
 * Only active when running in the MCP stdio process; silently ignores failures.
 *
 * @param category - Activity category (e.g. "synthesis", "kb")
 * @param type - Event type within the category
 * @param message - Human-readable event message
 * @param detail - Optional structured metadata
 */
function forwardToHttpServer(category: string, type: string, message: string, detail?: Record<string, any>) {
    if (!forwardUrl) return;
    getForwardKey().then(key => {
        fetch(forwardUrl!, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-podbit-key': key },
            body: JSON.stringify({ category, type, message, detail }),
            signal: AbortSignal.timeout(2000),
        }).catch(() => {}); // silently ignore if HTTP server is down
    }).catch(() => {});
}

// --- Helpers ---

/**
 * Format a node reference for activity log messages.
 * Returns `"abcd1234 'first few words...'"` instead of a bare hex prefix.
 * Content is optional -- falls back to just the truncated ID when unavailable.
 */
export function nodeLabel(nodeId: string, content?: string | null, maxWords = 6): string {
    const short = nodeId.slice(0, 8);
    if (!content) return short;
    const words = content.replace(/\s+/g, ' ').trim().split(' ').slice(0, maxWords).join(' ');
    const ellipsis = content.split(/\s+/).length > maxWords ? '...' : '';
    return `${short} "${words}${ellipsis}"`;
}

// --- Singleton ---

const bus = new EventEmitter();
bus.setMaxListeners(50); // allow many SSE clients

let nextId = 1;
const BUFFER_SIZE = 100;
const buffer: ActivityEvent[] = [];

/**
 * Emit an activity event to all SSE subscribers and buffer it for late joiners.
 * In the MCP stdio process, also forwards to the HTTP server via POST.
 *
 * @param category - Activity category (e.g. "synthesis", "kb", "proxy")
 * @param type - Event type within the category
 * @param message - Human-readable event message
 * @param detail - Optional structured metadata attached to the event
 * @returns The created {@link ActivityEvent} with assigned ID and timestamp
 */
export function emitActivity(
    category: ActivityCategory,
    type: string,
    message: string,
    detail?: Record<string, any>,
): ActivityEvent {
    const event: ActivityEvent = {
        id: nextId++,
        category,
        type,
        message,
        detail,
        timestamp: new Date().toISOString(),
    };

    buffer.push(event);
    if (buffer.length > BUFFER_SIZE) {
        buffer.shift();
    }

    bus.emit('activity', event);

    // Forward to HTTP server if we're in the MCP process
    if (isMcpProcess) {
        forwardToHttpServer(category, type, message, detail);
    }

    return event;
}

/**
 * Emit a locally-sourced activity event without cross-process forwarding.
 * Used by the POST /activity/emit endpoint to prevent infinite forwarding loops
 * (MCP -> HTTP -> MCP -> ...).
 *
 * @param category - Activity category
 * @param type - Event type within the category
 * @param message - Human-readable event message
 * @param detail - Optional structured metadata
 * @returns The created {@link ActivityEvent}
 */
export function emitActivityLocal(
    category: ActivityCategory,
    type: string,
    message: string,
    detail?: Record<string, any>,
): ActivityEvent {
    const event: ActivityEvent = {
        id: nextId++,
        category,
        type,
        message,
        detail,
        timestamp: new Date().toISOString(),
    };

    buffer.push(event);
    if (buffer.length > BUFFER_SIZE) {
        buffer.shift();
    }

    bus.emit('activity', event);
    return event;
}

/**
 * Get buffered recent activity events for initial page load or REST fallback.
 *
 * @param limit - Maximum number of events to return (default 100)
 * @returns Array of the most recent {@link ActivityEvent} objects
 */
export function getRecentActivity(limit = 100): ActivityEvent[] {
    return buffer.slice(-limit);
}

/**
 * Subscribe to live activity events via the internal EventEmitter.
 *
 * @param listener - Callback invoked for each new {@link ActivityEvent}
 * @returns Unsubscribe function — call it to stop receiving events
 */
export function onActivity(listener: (event: ActivityEvent) => void): () => void {
    bus.on('activity', listener);
    return () => bus.off('activity', listener);
}
