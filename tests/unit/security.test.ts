/**
 * Tests for core/security.ts — isSensitiveConfigPath (pure function).
 * Ensures config paths containing EVM safety or secrets (apiKey, password, etc.) are
 * flagged so the GUI and tune handlers can mask or restrict them.
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../db.js', () => ({
    systemQuery: jest.fn(),
    systemQueryOne: jest.fn(),
}));

const { isSensitiveConfigPath, SENSITIVE_CONFIG_PATHS } = await import('../../core/security.js');

describe('SENSITIVE_CONFIG_PATHS', () => {
    it('contains EVM security paths', () => {
        expect(SENSITIVE_CONFIG_PATHS.has('evm.allowedModules')).toBe(true);
        expect(SENSITIVE_CONFIG_PATHS.has('evm.blockedBuiltins')).toBe(true);
        expect(SENSITIVE_CONFIG_PATHS.has('evm.blockedAttributes')).toBe(true);
        expect(SENSITIVE_CONFIG_PATHS.has('evm.blockedCalls')).toBe(true);
        expect(SENSITIVE_CONFIG_PATHS.has('evm.networkKillSwitch')).toBe(true);
        expect(SENSITIVE_CONFIG_PATHS.has('evm.runtimePatching')).toBe(true);
    });
});

describe('isSensitiveConfigPath', () => {
    describe('exact matches', () => {
        it('matches exact sensitive paths', () => {
            expect(isSensitiveConfigPath(['evm', 'allowedModules'])).toBe(true);
            expect(isSensitiveConfigPath(['evm', 'blockedBuiltins'])).toBe(true);
            expect(isSensitiveConfigPath(['evm', 'networkKillSwitch'])).toBe(true);
        });

        it('rejects non-sensitive paths', () => {
            expect(isSensitiveConfigPath(['resonance', 'threshold'])).toBe(false);
            expect(isSensitiveConfigPath(['proxy', 'port'])).toBe(false);
            expect(isSensitiveConfigPath(['voicing', 'maxOutputWords'])).toBe(false);
        });
    });

    describe('prefix matching', () => {
        it('matches parent of sensitive path (changing parent object)', () => {
            // ['evm'] → 'evm' is a prefix of 'evm.allowedModules'
            expect(isSensitiveConfigPath(['evm'])).toBe(true);
        });

        it('matches child of sensitive path', () => {
            // ['evm', 'allowedModules', 'some_detail'] → child of sensitive path
            expect(isSensitiveConfigPath(['evm', 'allowedModules', 'some_detail'])).toBe(true);
        });
    });

    describe('keyword matching', () => {
        it('detects apiKey in path', () => {
            expect(isSensitiveConfigPath(['services', 'apiKey'])).toBe(true);
            expect(isSensitiveConfigPath(['openai', 'apiKey'])).toBe(true);
        });

        it('detects api_key in path', () => {
            expect(isSensitiveConfigPath(['provider', 'api_key'])).toBe(true);
        });

        it('detects secret in path', () => {
            expect(isSensitiveConfigPath(['auth', 'secret'])).toBe(true);
            expect(isSensitiveConfigPath(['client_secret'])).toBe(true);
        });

        it('detects password in path', () => {
            expect(isSensitiveConfigPath(['admin', 'password'])).toBe(true);
            expect(isSensitiveConfigPath(['db_password'])).toBe(true);
        });

        it('is case-insensitive for keywords', () => {
            expect(isSensitiveConfigPath(['services', 'ApiKey'])).toBe(true);
            expect(isSensitiveConfigPath(['auth', 'SECRET'])).toBe(true);
            expect(isSensitiveConfigPath(['admin', 'PASSWORD'])).toBe(true);
        });
    });

    describe('edge cases', () => {
        it('handles empty path', () => {
            expect(isSensitiveConfigPath([])).toBe(false);
        });

        it('handles single segment path', () => {
            expect(isSensitiveConfigPath(['evm'])).toBe(true);  // prefix of sensitive
            expect(isSensitiveConfigPath(['proxy'])).toBe(false);
        });

        it('handles deeply nested path with keyword', () => {
            expect(isSensitiveConfigPath(['a', 'b', 'c', 'apiKey', 'd'])).toBe(true);
        });
    });
});
