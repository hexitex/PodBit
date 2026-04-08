/**
 * MCP handler for graph journaling — timeline, pinning, rollback.
 *
 * Action-based dispatch following the standard handler pattern.
 *
 * @module handlers/journal
 */

import {
    createTimelineMarker,
    getTimeline,
    pinNodes,
    listPins,
    removePins,
    previewRollback,
    executeRollback,
    getJournalEntries,
    pruneJournal,
    getJournalStats,
} from '../core/journal.js';
import crypto from 'crypto';

/**
 * Handle podbit.journal MCP tool calls.
 */
export async function handleJournal(params: Record<string, any>): Promise<Record<string, any>> {
    const action = params.action;

    switch (action) {
        case 'timeline':
            return handleTimeline(params);
        case 'marker':
            return handleMarker(params);
        case 'pin':
            return handlePin(params);
        case 'pins':
            return handleListPins(params);
        case 'unpin':
            return handleUnpin(params);
        case 'preview':
            return handlePreview(params);
        case 'rollback':
            return handleRollback(params);
        case 'entries':
            return handleEntries(params);
        case 'prune':
            return handlePrune(params);
        case 'stats':
            return handleStats();
        default:
            return { error: `Unknown action: ${action}. Valid actions: timeline, marker, pin, pins, unpin, preview, rollback, entries, prune, stats` };
    }
}

// =============================================================================
// ACTION HANDLERS
// =============================================================================

async function handleTimeline(params: Record<string, any>) {
    const { limit, offset, since, until, eventType } = params;
    return getTimeline({ limit, offset, since, until, eventType });
}

async function handleMarker(params: Record<string, any>) {
    if (!params.label) return { error: 'label is required' };
    const id = await createTimelineMarker(
        params.eventType || 'manual',
        params.label,
        params.detail,
        params.contributor
    );
    return { id, message: 'Timeline marker created' };
}

async function handlePin(params: Record<string, any>) {
    if (!params.nodeIds || !Array.isArray(params.nodeIds) || params.nodeIds.length === 0) {
        return { error: 'nodeIds (array of node UUIDs) is required' };
    }
    const pinGroup = params.pinGroup || crypto.randomUUID();
    const result = await pinNodes(params.nodeIds, pinGroup);
    return {
        ...result,
        pinGroup,
        message: `Pinned ${result.pinned} nodes. Only voiced, synthesis, possible, elite, and breakthrough nodes can be pinned — seeds are captured as ancestors automatically.`,
    };
}

async function handleListPins(params: Record<string, any>) {
    if (!params.pinGroup) return { error: 'pinGroup is required' };
    const pins = await listPins(params.pinGroup);
    return { pins, count: pins.length };
}

async function handleUnpin(params: Record<string, any>) {
    if (!params.pinGroup) return { error: 'pinGroup is required' };
    await removePins(params.pinGroup, params.nodeIds);
    return { message: 'Pins removed' };
}

async function handlePreview(params: Record<string, any>) {
    if (!params.targetTimestamp) return { error: 'targetTimestamp (ISO 8601) is required' };
    return previewRollback(params.targetTimestamp);
}

async function handleRollback(params: Record<string, any>) {
    if (!params.targetTimestamp) return { error: 'targetTimestamp (ISO 8601) is required' };
    if (!params.confirm) {
        return {
            error: 'Rollback is destructive. Set confirm: true to proceed. Use preview first to see what will be affected.',
        };
    }
    return executeRollback(params.targetTimestamp, params.pinGroup);
}

async function handleEntries(params: Record<string, any>) {
    return getJournalEntries({
        tableName: params.tableName,
        since: params.since,
        until: params.until,
        operation: params.operation,
        limit: params.limit,
        offset: params.offset,
    });
}

async function handlePrune(params: Record<string, any>) {
    if (!params.olderThan) return { error: 'olderThan (ISO 8601 timestamp) is required' };
    return pruneJournal(params.olderThan);
}

async function handleStats() {
    return getJournalStats();
}
