/**
 * Avatar generation — deterministic DiceBear SVGs generated locally.
 *
 * No external requests. SVGs are generated on the server using @dicebear/core
 * and stored as data URIs directly in the node's avatar_url column.
 * Generated once per node, served from DB forever.
 */

import { query } from '../db.js';
import { config as appConfig } from '../config.js';
import { emitActivity } from '../services/event-bus.js';
import { createAvatar } from '@dicebear/core';
import * as collection from '@dicebear/collection';

/**
 * Get the DiceBear style module from the collection.
 */
function getStyle(): any {
    const styleName = appConfig.avatars.style || 'rings';
    const style = (collection as any)[styleName];
    if (!style) return collection.rings;
    return style;
}

/**
 * Generate an SVG data URI for a given seed.
 */
function buildDataUri(seed: string): string {
    const avatar = createAvatar(getStyle(), { seed });
    const svg = avatar.toString();
    const b64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${b64}`;
}

/**
 * Generate an avatar for a node and store it in the database.
 * Returns the data URI, or null if avatars are disabled.
 */
export async function generateAvatar(
    nodeId: string,
    _content: string,
    _nodeType: string,
    domain: string,
): Promise<string | null> {
    if (!appConfig.avatars.enabled) return null;

    const avatarUrl = buildDataUri(nodeId);
    await query('UPDATE nodes SET avatar_url = $1 WHERE id = $2', [avatarUrl, nodeId]);

    emitActivity('lifecycle', 'avatar_set', `Avatar set for ${nodeId.slice(0, 8)}`, {
        nodeId,
        domain,
    });

    return avatarUrl;
}
