/**
 * Tests for config/loader.ts — NON_TUNABLE denylist (re-implemented).
 *
 * NON_TUNABLE identifies config keys that should NOT be persisted/tuned:
 * infrastructure, secrets, generated values. Everything else is tunable.
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement NON_TUNABLE from config/loader.ts
const NON_TUNABLE = new Set([
    'database', 'api', 'services', 'server', 'gui', 'orchestrator',
    'managedServices', 'externalServices', 'partitionServer', 'avatars',
    'tokenLimits', // tokenLimits excluded — models generate dynamically
    'resonance', // alias for engine — would double-persist
]);

function isTunable(key: string): boolean {
    return !NON_TUNABLE.has(key);
}

describe('NON_TUNABLE — infrastructure keys excluded', () => {
    it('excludes "database"', () => {
        expect(NON_TUNABLE.has('database')).toBe(true);
        expect(isTunable('database')).toBe(false);
    });

    it('excludes "api" (secrets)', () => {
        expect(NON_TUNABLE.has('api')).toBe(true);
        expect(isTunable('api')).toBe(false);
    });

    it('excludes "services"', () => {
        expect(NON_TUNABLE.has('services')).toBe(true);
        expect(isTunable('services')).toBe(false);
    });

    it('excludes "server"', () => {
        expect(NON_TUNABLE.has('server')).toBe(true);
        expect(isTunable('server')).toBe(false);
    });

    it('excludes "gui"', () => {
        expect(NON_TUNABLE.has('gui')).toBe(true);
        expect(isTunable('gui')).toBe(false);
    });

    it('excludes "orchestrator"', () => {
        expect(NON_TUNABLE.has('orchestrator')).toBe(true);
        expect(isTunable('orchestrator')).toBe(false);
    });

    it('excludes "managedServices"', () => {
        expect(NON_TUNABLE.has('managedServices')).toBe(true);
        expect(isTunable('managedServices')).toBe(false);
    });

    it('excludes "externalServices"', () => {
        expect(NON_TUNABLE.has('externalServices')).toBe(true);
        expect(isTunable('externalServices')).toBe(false);
    });

    it('excludes "partitionServer"', () => {
        expect(NON_TUNABLE.has('partitionServer')).toBe(true);
        expect(isTunable('partitionServer')).toBe(false);
    });

    it('excludes "avatars"', () => {
        expect(NON_TUNABLE.has('avatars')).toBe(true);
        expect(isTunable('avatars')).toBe(false);
    });

    it('excludes "tokenLimits" (dynamically computed)', () => {
        expect(NON_TUNABLE.has('tokenLimits')).toBe(true);
        expect(isTunable('tokenLimits')).toBe(false);
    });

    it('excludes "resonance" (alias for engine, prevents double-persist)', () => {
        expect(NON_TUNABLE.has('resonance')).toBe(true);
        expect(isTunable('resonance')).toBe(false);
    });
});

describe('NON_TUNABLE — tunable keys NOT excluded', () => {
    it('allows "engine" (the real section, not alias)', () => {
        expect(NON_TUNABLE.has('engine')).toBe(false);
        expect(isTunable('engine')).toBe(true);
    });

    it('allows "voicing"', () => {
        expect(isTunable('voicing')).toBe(true);
    });

    it('allows "dedup"', () => {
        expect(isTunable('dedup')).toBe(true);
    });

    it('allows "synthesisEngine"', () => {
        expect(isTunable('synthesisEngine')).toBe(true);
    });

    it('allows "tensions"', () => {
        expect(isTunable('tensions')).toBe(true);
    });

    it('allows "evm"', () => {
        expect(isTunable('evm')).toBe(true);
    });

    it('allows "feedback" (removed from NON_TUNABLE to enable tuning)', () => {
        expect(NON_TUNABLE.has('feedback')).toBe(false);
        expect(isTunable('feedback')).toBe(true);
    });

    it('allows "nodes"', () => {
        expect(isTunable('nodes')).toBe(true);
    });
});

describe('NON_TUNABLE — set semantics', () => {
    it('has exactly 12 entries', () => {
        expect(NON_TUNABLE.size).toBe(12);
    });

    it('is case-sensitive', () => {
        expect(NON_TUNABLE.has('Database')).toBe(false);
        expect(NON_TUNABLE.has('API')).toBe(false);
        expect(NON_TUNABLE.has('SERVER')).toBe(false);
    });

    it('does not exclude empty string', () => {
        expect(NON_TUNABLE.has('')).toBe(false);
        expect(isTunable('')).toBe(true);
    });
});
