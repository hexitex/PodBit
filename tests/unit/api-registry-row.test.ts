/**
 * Tests for evm/api/registry.ts — rowToEntry (re-implemented, private function).
 *
 * rowToEntry maps a snake_case DB row to camelCase ApiRegistryEntry.
 * Key behaviors: integer→boolean conversion, JSON parsing, mode defaulting.
 */
import { describe, it, expect } from '@jest/globals';

// Re-implement ApiRegistryRow shape
interface ApiRegistryRow {
    id: string;
    name: string;
    display_name: string;
    description: string | null;
    enabled: number;
    mode: string | null;
    base_url: string;
    test_url: string | null;
    auth_type: string;
    auth_key: string | null;
    auth_header: string | null;
    max_rpm: number;
    max_concurrent: number;
    timeout_ms: number;
    prompt_query: string | null;
    prompt_interpret: string | null;
    prompt_extract: string | null;
    prompt_notes: string | null;
    response_format: string;
    max_response_bytes: number;
    capabilities: string | null;
    domains: string | null;
    test_cases: string | null;
    onboarded_at: string | null;
    onboarded_by: string | null;
    total_calls: number;
    total_errors: number;
    created_at: string;
    updated_at: string;
}

// Re-implement rowToEntry from evm/api/registry.ts
function rowToEntry(row: ApiRegistryRow) {
    return {
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        description: row.description,
        enabled: row.enabled === 1,
        mode: (row.mode || 'verify') as 'verify' | 'enrich' | 'both',
        baseUrl: row.base_url,
        testUrl: row.test_url,
        authType: row.auth_type as 'none' | 'api_key' | 'bearer',
        authKey: row.auth_key,
        authHeader: row.auth_header,
        maxRpm: row.max_rpm,
        maxConcurrent: row.max_concurrent,
        timeoutMs: row.timeout_ms,
        promptQuery: row.prompt_query,
        promptInterpret: row.prompt_interpret,
        promptExtract: row.prompt_extract,
        promptNotes: row.prompt_notes,
        responseFormat: row.response_format as 'json' | 'xml' | 'text',
        maxResponseBytes: row.max_response_bytes,
        capabilities: row.capabilities ? JSON.parse(row.capabilities) : null,
        domains: row.domains ? JSON.parse(row.domains) : null,
        testCases: row.test_cases ? JSON.parse(row.test_cases) : null,
        onboardedAt: row.onboarded_at,
        onboardedBy: row.onboarded_by,
        totalCalls: row.total_calls,
        totalErrors: row.total_errors,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function makeBaseRow(overrides: Partial<ApiRegistryRow> = {}): ApiRegistryRow {
    return {
        id: 'api-uuid-123',
        name: 'pubchem',
        display_name: 'PubChem API',
        description: 'Checks chemical compound existence',
        enabled: 1,
        mode: 'verify',
        base_url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug',
        test_url: null,
        auth_type: 'none',
        auth_key: null,
        auth_header: null,
        max_rpm: 5,
        max_concurrent: 2,
        timeout_ms: 10000,
        prompt_query: 'Query template for {compound}',
        prompt_interpret: null,
        prompt_extract: null,
        prompt_notes: null,
        response_format: 'json',
        max_response_bytes: 50000,
        capabilities: null,
        domains: null,
        test_cases: null,
        onboarded_at: '2025-01-01T00:00:00Z',
        onboarded_by: 'claude',
        total_calls: 42,
        total_errors: 2,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-15T00:00:00Z',
        ...overrides,
    };
}

describe('rowToEntry — field mapping', () => {
    it('maps id correctly', () => {
        const entry = rowToEntry(makeBaseRow({ id: 'test-id-999' }));
        expect(entry.id).toBe('test-id-999');
    });

    it('maps name correctly', () => {
        const entry = rowToEntry(makeBaseRow({ name: 'crossref' }));
        expect(entry.name).toBe('crossref');
    });

    it('maps display_name → displayName', () => {
        const entry = rowToEntry(makeBaseRow({ display_name: 'CrossRef API' }));
        expect(entry.displayName).toBe('CrossRef API');
    });

    it('maps base_url → baseUrl', () => {
        const entry = rowToEntry(makeBaseRow({ base_url: 'https://api.crossref.org' }));
        expect(entry.baseUrl).toBe('https://api.crossref.org');
    });

    it('maps auth_type → authType', () => {
        const entry = rowToEntry(makeBaseRow({ auth_type: 'api_key' }));
        expect(entry.authType).toBe('api_key');
    });

    it('maps max_rpm → maxRpm', () => {
        const entry = rowToEntry(makeBaseRow({ max_rpm: 60 }));
        expect(entry.maxRpm).toBe(60);
    });

    it('maps max_concurrent → maxConcurrent', () => {
        const entry = rowToEntry(makeBaseRow({ max_concurrent: 5 }));
        expect(entry.maxConcurrent).toBe(5);
    });

    it('maps timeout_ms → timeoutMs', () => {
        const entry = rowToEntry(makeBaseRow({ timeout_ms: 30000 }));
        expect(entry.timeoutMs).toBe(30000);
    });

    it('maps total_calls → totalCalls and total_errors → totalErrors', () => {
        const entry = rowToEntry(makeBaseRow({ total_calls: 100, total_errors: 5 }));
        expect(entry.totalCalls).toBe(100);
        expect(entry.totalErrors).toBe(5);
    });

    it('maps created_at → createdAt and updated_at → updatedAt', () => {
        const entry = rowToEntry(makeBaseRow({
            created_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-06-01T00:00:00Z',
        }));
        expect(entry.createdAt).toBe('2025-01-01T00:00:00Z');
        expect(entry.updatedAt).toBe('2025-06-01T00:00:00Z');
    });

    it('maps onboarded_at → onboardedAt and onboarded_by → onboardedBy', () => {
        const entry = rowToEntry(makeBaseRow({ onboarded_at: '2025-03-01T00:00:00Z', onboarded_by: 'admin' }));
        expect(entry.onboardedAt).toBe('2025-03-01T00:00:00Z');
        expect(entry.onboardedBy).toBe('admin');
    });
});

describe('rowToEntry — integer→boolean conversion', () => {
    it('converts enabled=1 → true', () => {
        const entry = rowToEntry(makeBaseRow({ enabled: 1 }));
        expect(entry.enabled).toBe(true);
    });

    it('converts enabled=0 → false', () => {
        const entry = rowToEntry(makeBaseRow({ enabled: 0 }));
        expect(entry.enabled).toBe(false);
    });
});

describe('rowToEntry — mode defaulting', () => {
    it('uses mode from row when present', () => {
        const entry = rowToEntry(makeBaseRow({ mode: 'enrich' }));
        expect(entry.mode).toBe('enrich');
    });

    it('defaults mode to "verify" when null', () => {
        const entry = rowToEntry(makeBaseRow({ mode: null }));
        expect(entry.mode).toBe('verify');
    });

    it('defaults mode to "verify" when empty string', () => {
        const entry = rowToEntry(makeBaseRow({ mode: '' }));
        expect(entry.mode).toBe('verify');
    });

    it('preserves "both" mode', () => {
        const entry = rowToEntry(makeBaseRow({ mode: 'both' }));
        expect(entry.mode).toBe('both');
    });
});

describe('rowToEntry — JSON field parsing', () => {
    it('parses capabilities JSON array', () => {
        const entry = rowToEntry(makeBaseRow({ capabilities: '["compound_lookup","property_query"]' }));
        expect(entry.capabilities).toEqual(['compound_lookup', 'property_query']);
    });

    it('returns null for null capabilities', () => {
        const entry = rowToEntry(makeBaseRow({ capabilities: null }));
        expect(entry.capabilities).toBeNull();
    });

    it('parses domains JSON array', () => {
        const entry = rowToEntry(makeBaseRow({ domains: '["chemistry","biology"]' }));
        expect(entry.domains).toEqual(['chemistry', 'biology']);
    });

    it('returns null for null domains', () => {
        const entry = rowToEntry(makeBaseRow({ domains: null }));
        expect(entry.domains).toBeNull();
    });

    it('parses test_cases JSON array', () => {
        const testCases = [{ input: 'aspirin', expected: 'found' }];
        const entry = rowToEntry(makeBaseRow({ test_cases: JSON.stringify(testCases) }));
        expect(entry.testCases).toEqual(testCases);
    });

    it('returns null for null test_cases', () => {
        const entry = rowToEntry(makeBaseRow({ test_cases: null }));
        expect(entry.testCases).toBeNull();
    });
});

describe('rowToEntry — nullable fields', () => {
    it('passes through null test_url', () => {
        const entry = rowToEntry(makeBaseRow({ test_url: null }));
        expect(entry.testUrl).toBeNull();
    });

    it('passes through test_url when provided', () => {
        const entry = rowToEntry(makeBaseRow({ test_url: 'https://api.example.com/test' }));
        expect(entry.testUrl).toBe('https://api.example.com/test');
    });

    it('passes through null auth_key', () => {
        const entry = rowToEntry(makeBaseRow({ auth_key: null }));
        expect(entry.authKey).toBeNull();
    });

    it('passes through null auth_header', () => {
        const entry = rowToEntry(makeBaseRow({ auth_header: null }));
        expect(entry.authHeader).toBeNull();
    });

    it('passes through null description', () => {
        const entry = rowToEntry(makeBaseRow({ description: null }));
        expect(entry.description).toBeNull();
    });
});
