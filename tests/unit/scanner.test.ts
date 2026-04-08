/**
 * Tests for kb/scanner.ts — normalizePath and resolveDomain (pure functions).
 * normalizePath: backslash → forward slash; resolveDomain: folder + optional subfolder → domain slug.
 */
import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('minimatch', () => ({
    default: jest.fn(),
}));

const { normalizePath, resolveDomain } = await import('../../kb/scanner.js');

/** Path normalization for cross-platform KB scan paths. */
describe('normalizePath', () => {
    it('converts backslashes to forward slashes', () => {
        expect(normalizePath('C:\\Users\\test\\file.txt')).toBe('C:/Users/test/file.txt');
    });

    it('leaves forward slashes unchanged', () => {
        expect(normalizePath('/home/user/file.txt')).toBe('/home/user/file.txt');
    });

    it('handles mixed slashes', () => {
        expect(normalizePath('path\\to/some\\file.txt')).toBe('path/to/some/file.txt');
    });

    it('handles empty string', () => {
        expect(normalizePath('')).toBe('');
    });

    it('handles path with no slashes', () => {
        expect(normalizePath('file.txt')).toBe('file.txt');
    });

    it('handles multiple consecutive backslashes', () => {
        expect(normalizePath('path\\\\double')).toBe('path//double');
    });

    it('handles Windows UNC paths', () => {
        expect(normalizePath('\\\\server\\share\\file.txt')).toBe('//server/share/file.txt');
    });
});

/** Map (folderDomain, relativePath, autoSubfolderDomains) → domain string (e.g. domain:subfolder). */
describe('resolveDomain', () => {
    it('returns folderDomain when autoSubfolderDomains is false', () => {
        expect(resolveDomain('my-domain', 'subfolder/file.txt', false)).toBe('my-domain');
    });

    it('returns folderDomain for root-level files', () => {
        expect(resolveDomain('my-domain', 'file.txt', true)).toBe('my-domain');
    });

    it('appends subfolder as sub-domain', () => {
        expect(resolveDomain('my-domain', 'controllers/user.ts', true)).toBe('my-domain:controllers');
    });

    it('only uses the first subfolder level', () => {
        expect(resolveDomain('my-domain', 'deep/nested/path/file.ts', true)).toBe('my-domain:deep');
    });

    it('lowercases subfolder name', () => {
        expect(resolveDomain('my-domain', 'MyFolder/file.ts', true)).toBe('my-domain:myfolder');
    });

    it('replaces non-alphanumeric chars with hyphens', () => {
        expect(resolveDomain('my-domain', 'my folder (2)/file.ts', true)).toBe('my-domain:my-folder--2-');
    });

    it('handles subfolder with special characters', () => {
        expect(resolveDomain('code', 'src.utils/helpers.ts', true)).toBe('code:src-utils');
    });

    it('preserves existing hyphens', () => {
        expect(resolveDomain('project', 'my-module/index.ts', true)).toBe('project:my-module');
    });
});
