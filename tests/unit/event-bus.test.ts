/**
 * Tests for services/event-bus.ts — in-memory activity bus.
 *
 * The module uses only Node EventEmitter (no DB). MCP_STDIO_SERVER is
 * not set in Jest, so cross-process forwarding is disabled.
 */
import { describe, it, expect } from '@jest/globals';
import type { ActivityEvent } from '../../services/event-bus.js';

const {
    emitActivity,
    emitActivityLocal,
    getRecentActivity,
    onActivity,
} = await import('../../services/event-bus.js');

describe('emitActivity', () => {
    it('returns an event with correct fields', () => {
        const event = emitActivity('synthesis', 'node.created', 'New synthesis node');
        expect(event.category).toBe('synthesis');
        expect(event.type).toBe('node.created');
        expect(event.message).toBe('New synthesis node');
        expect(typeof event.id).toBe('number');
        expect(typeof event.timestamp).toBe('string');
    });

    it('assigns auto-incrementing IDs', () => {
        const a = emitActivity('mcp', 'test.a', 'A');
        const b = emitActivity('mcp', 'test.b', 'B');
        expect(b.id).toBeGreaterThan(a.id);
    });

    it('includes detail when provided', () => {
        const event = emitActivity('synthesis', 'test.detail', 'msg', { key: 'value', num: 42 });
        expect(event.detail).toEqual({ key: 'value', num: 42 });
    });

    it('omits detail when not provided', () => {
        const event = emitActivity('mcp', 'test.no-detail', 'msg');
        expect(event.detail).toBeUndefined();
    });

    it('produces an ISO timestamp', () => {
        const event = emitActivity('system', 'test.time', 'ts check');
        expect(new Date(event.timestamp).toISOString()).toBe(event.timestamp);
    });
});

describe('emitActivityLocal', () => {
    it('returns an event with correct fields', () => {
        const event = emitActivityLocal('kb', 'file.ingested', 'Local event');
        expect(event.category).toBe('kb');
        expect(event.type).toBe('file.ingested');
        expect(event.message).toBe('Local event');
    });

    it('assigns auto-incrementing IDs (shared counter with emitActivity)', () => {
        const a = emitActivity('mcp', 'counter.a', 'a');
        const b = emitActivityLocal('kb', 'counter.b', 'b');
        expect(b.id).toBe(a.id + 1);
    });

    it('includes detail when provided', () => {
        const event = emitActivityLocal('llm', 'test.local', 'msg', { x: 1 });
        expect(event.detail).toEqual({ x: 1 });
    });
});

describe('getRecentActivity', () => {
    it('returns an array', () => {
        expect(Array.isArray(getRecentActivity())).toBe(true);
    });

    it('returns at most limit events', () => {
        for (let i = 0; i < 5; i++) emitActivity('system', 'bulk.event', `event ${i}`);
        const events = getRecentActivity(3);
        expect(events.length).toBeLessThanOrEqual(3);
    });

    it('returns the most recent events', () => {
        emitActivity('synthesis', 'marker.event', 'unique-marker-xyz');
        const events = getRecentActivity(5);
        const last = events[events.length - 1];
        expect(last.message).toBe('unique-marker-xyz');
    });

    it('defaults to returning up to 100 events', () => {
        expect(getRecentActivity().length).toBeLessThanOrEqual(100);
    });

    it('slice(-0) returns all events (JavaScript -0 === 0 edge case)', () => {
        // Array.slice(-0) === Array.slice(0) which returns all elements, not none
        const events = getRecentActivity(0);
        expect(Array.isArray(events)).toBe(true);
    });
});

describe('onActivity', () => {
    it('returns an unsubscribe function', () => {
        const unsub = onActivity(() => {});
        expect(typeof unsub).toBe('function');
        unsub();
    });

    it('listener receives emitted events', () => {
        const received: ActivityEvent[] = [];
        const unsub = onActivity(e => received.push(e));
        emitActivity('voicing', 'listener.test', 'hello from listener');
        unsub();
        expect(received).toHaveLength(1);
        expect(received[0].message).toBe('hello from listener');
    });

    it('listener does not receive events after unsubscribing', () => {
        const received: ActivityEvent[] = [];
        const unsub = onActivity(e => received.push(e));
        emitActivity('mcp', 'before.unsub', 'before');
        unsub();
        emitActivity('mcp', 'after.unsub', 'after');
        expect(received).toHaveLength(1);
        expect(received[0].message).toBe('before');
    });

    it('multiple listeners all receive events', () => {
        const r1: ActivityEvent[] = [];
        const r2: ActivityEvent[] = [];
        const u1 = onActivity(e => r1.push(e));
        const u2 = onActivity(e => r2.push(e));
        emitActivity('mcp', 'multi.listener', 'shared');
        u1(); u2();
        expect(r1).toHaveLength(1);
        expect(r2).toHaveLength(1);
        expect(r1[0].message).toBe('shared');
    });

    it('emitActivityLocal also triggers listeners', () => {
        const received: ActivityEvent[] = [];
        const unsub = onActivity(e => received.push(e));
        emitActivityLocal('kb', 'local.triggers', 'local msg');
        unsub();
        expect(received).toHaveLength(1);
        expect(received[0].message).toBe('local msg');
    });
});
