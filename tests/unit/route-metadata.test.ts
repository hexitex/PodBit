/**
 * Unit tests for routes/route-metadata.ts
 *
 * Tests: metadata structure, required fields, no duplicates.
 */
import { describe, it, expect } from '@jest/globals';

const { getRouteMetadata } = await import('../../routes/route-metadata.js');

describe('getRouteMetadata', () => {
    const routes = getRouteMetadata();

    it('returns a non-empty array', () => {
        expect(Array.isArray(routes)).toBe(true);
        expect(routes.length).toBeGreaterThan(50);
    });

    it('every route has method, path, and description', () => {
        for (const route of routes) {
            expect(route.method).toBeDefined();
            expect(route.path).toBeDefined();
            expect(route.description).toBeDefined();
            expect(typeof route.method).toBe('string');
            expect(typeof route.path).toBe('string');
            expect(typeof route.description).toBe('string');
        }
    });

    it('all methods are valid HTTP methods', () => {
        const valid = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);
        for (const route of routes) {
            expect(valid.has(route.method)).toBe(true);
        }
    });

    it('all paths start with /', () => {
        for (const route of routes) {
            expect(route.path.startsWith('/')).toBe(true);
        }
    });

    it('no duplicate method+path combinations', () => {
        const seen = new Set<string>();
        for (const route of routes) {
            const key = `${route.method} ${route.path}`;
            expect(seen.has(key)).toBe(false);
            seen.add(key);
        }
    });

    it('includes core endpoints', () => {
        const keys = routes.map(r => `${r.method} ${r.path}`);
        expect(keys).toContain('GET /health');
        expect(keys).toContain('GET /resonance/nodes');
        expect(keys).toContain('POST /resonance/nodes');
        expect(keys).toContain('GET /models/registry');
        expect(keys).toContain('POST /mcp/tool');
    });
});
