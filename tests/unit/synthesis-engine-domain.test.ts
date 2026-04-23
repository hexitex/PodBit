/**
 * Unit tests for core/synthesis-engine-domain.ts —
 * isSystemDomain, getSystemDomains, sampleColdNode, selectDomainWithNiching, selectDomainPair.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetAccessibleDomains = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockGetPartitionForDomain = jest.fn<() => Promise<any>>().mockResolvedValue(null);
const mockGetPartitionTopNodes = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockGetTransientDomains = jest.fn<() => Promise<any>>().mockResolvedValue({ states: new Map() });

const mockSynthesisEngineConfig = {
    nichingEnabled: false,
    nichingLookbackCycles: 100,
    nichingMinShare: 0.1,
    domainDirectedLookbackDays: 7,
};

const mockEngineConfig = {
    salienceFloor: 0.1,
};

const mockAppConfig = {
    synthesisEngine: mockSynthesisEngineConfig,
};

jest.unstable_mockModule('../../db.js', () => ({ query: mockQuery, systemQuery: mockQuery, systemQueryOne: jest.fn() }));
jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));
jest.unstable_mockModule('../../core/engine-config.js', () => ({ config: mockEngineConfig }));
jest.unstable_mockModule('../../core/governance.js', () => ({
    getAccessibleDomains: mockGetAccessibleDomains,
    getPartitionForDomain: mockGetPartitionForDomain,
    getPartitionTopNodes: mockGetPartitionTopNodes,
    getTransientDomains: mockGetTransientDomains,
}));
jest.unstable_mockModule('../../db/sql.js', () => ({
    inverseWeightedRandom: (col: string) => `RANDOM() * ${col}`,
    withinDays: (col: string, days: number) => `${col} > datetime('now', '-${days} days')`,
    translate: (sql: string, params: unknown[] = []) => ({ sql, params }),
    weightedRandom: (col: string) => `RANDOM() * ${col}`,
    countFilter: (cond: string) => `SUM(CASE WHEN ${cond} THEN 1 ELSE 0 END)`,
    intervalAgo: (n: number, u: string) => `datetime('now', '-${n} ${u}')`,
    getLineageQuery: () => '',
    getPatternSiblingsQuery: () => '',
}));

const { isSystemDomain, getSystemDomains, sampleColdNode, selectDomainWithNiching, selectDomainPair } =
    await import('../../core/synthesis-engine-domain.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockGetAccessibleDomains.mockResolvedValue([]);
    mockGetTransientDomains.mockResolvedValue({ states: new Map() });
    mockSynthesisEngineConfig.nichingEnabled = false;
    mockSynthesisEngineConfig.nichingLookbackCycles = 100;
    mockSynthesisEngineConfig.nichingMinShare = 0.1;
    mockSynthesisEngineConfig.domainDirectedLookbackDays = 7;
    mockEngineConfig.salienceFloor = 0.1;
});

// =============================================================================
// isSystemDomain (pure function)
// =============================================================================

describe('isSystemDomain', () => {
    it('returns true when domain is in system domains list', () => {
        expect(isSystemDomain('tuning', ['tuning', 'system'])).toBe(true);
    });

    it('returns false when domain is not in system domains list', () => {
        expect(isSystemDomain('science', ['tuning'])).toBe(false);
    });

    it('returns false when domain is null', () => {
        expect(isSystemDomain(null, ['tuning'])).toBe(false);
    });

    it('returns false when system domains list is empty', () => {
        expect(isSystemDomain('tuning', [])).toBe(false);
    });
});

// =============================================================================
// getSystemDomains
// =============================================================================

describe('getSystemDomains', () => {
    // Use an absolute epoch far in the future — increases by 5 minutes per test
    // so the 60s TTL always expires between tests
    let fakeEpoch = 9_000_000_000_000;

    beforeEach(() => {
        fakeEpoch += 300_000; // advance 5 minutes per test, past TTL
        jest.useFakeTimers();
        jest.setSystemTime(new Date(fakeEpoch));
    });
    afterEach(() => { jest.useRealTimers(); });

    it('returns empty array when no system domains in DB', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await getSystemDomains();
        expect(result).toEqual([]);
    });

    it('returns domain names from system partitions', async () => {
        mockQuery.mockResolvedValue([{ domain: 'tuning' }, { domain: 'internal' }]);
        const result = await getSystemDomains();
        expect(result).toContain('tuning');
        expect(result).toContain('internal');
    });

    it('returns empty array when query throws', async () => {
        mockQuery.mockRejectedValue(new Error('DB error'));
        const result = await getSystemDomains();
        expect(result).toEqual([]);
    });
});

// =============================================================================
// sampleColdNode
// =============================================================================

describe('sampleColdNode', () => {
    it('returns null when no nodes found', async () => {
        mockQuery.mockResolvedValue([]);
        const result = await sampleColdNode('science');
        expect(result).toBeNull();
    });

    it('returns the first row from query', async () => {
        const node = { id: 'node-1', content: 'content', embedding: null, weight: 1.0, salience: 0.5, domain: 'science' };
        mockQuery.mockResolvedValue([node]);
        const result = await sampleColdNode('science');
        expect(result).toEqual(node);
    });

    it('queries nodes with domain filter', async () => {
        mockQuery.mockResolvedValue([]);
        await sampleColdNode('biology');
        const [_sql, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain('biology');
    });

    it('uses salienceFloor from config', async () => {
        mockEngineConfig.salienceFloor = 0.25;
        mockQuery.mockResolvedValue([]);
        await sampleColdNode('science');
        const [, params] = mockQuery.mock.calls[0] as any[];
        expect(params).toContain(0.25);
    });

    it('excludes raw and question node types', async () => {
        mockQuery.mockResolvedValue([]);
        await sampleColdNode('science');
        const [sql] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain("node_type NOT IN");
        expect(String(sql)).toContain('raw');
        expect(String(sql)).toContain('question');
    });
});

// =============================================================================
// selectDomainWithNiching
// =============================================================================

describe('selectDomainWithNiching', () => {
    it('returns null when niching is disabled', async () => {
        mockSynthesisEngineConfig.nichingEnabled = false;
        const result = await selectDomainWithNiching();
        expect(result).toBeNull();
    });

    it('returns null when fewer than 2 domains exist', async () => {
        mockSynthesisEngineConfig.nichingEnabled = true;
        mockGetTransientDomains.mockResolvedValue({ states: new Map() });
        // Discriminate by SQL: partition_domains = system domains, else = allDomains or cycles
        mockQuery.mockImplementation(async (sql: string) => {
            if (String(sql).includes('partition_domains')) return [];
            if (String(sql).includes('dream_cycles')) return [];
            return [{ domain: 'science', node_count: 10 }]; // only 1 domain
        });

        const result = await selectDomainWithNiching();
        expect(result).toBeNull();
    });

    it('returns null when not enough cycle data', async () => {
        mockSynthesisEngineConfig.nichingEnabled = true;
        mockSynthesisEngineConfig.nichingLookbackCycles = 100;
        mockGetTransientDomains.mockResolvedValue({ states: new Map() });
        mockQuery.mockImplementation(async (sql: string) => {
            if (String(sql).includes('partition_domains')) return [];
            if (String(sql).includes('dream_cycles')) return []; // no cycle data
            return [{ domain: 'science', node_count: 10 }, { domain: 'math', node_count: 8 }];
        });

        const result = await selectDomainWithNiching();
        expect(result).toBeNull(); // totalCycles (0) < lookback * 0.5 (50)
    });

    it('returns underrepresented domain when one exists', async () => {
        mockSynthesisEngineConfig.nichingEnabled = true;
        mockSynthesisEngineConfig.nichingLookbackCycles = 10;
        mockSynthesisEngineConfig.nichingMinShare = 0.1;
        mockGetTransientDomains.mockResolvedValue({ states: new Map() });
        mockQuery.mockImplementation(async (sql: string) => {
            if (String(sql).includes('partition_domains')) return [];
            if (String(sql).includes('dream_cycles')) return [
                { domain: 'science', child_count: 50 },
                { domain: 'math', child_count: 50 },
                // physics produced 0 children → underrepresented
            ];
            return [
                { domain: 'science', node_count: 10 },
                { domain: 'math', node_count: 8 },
                { domain: 'physics', node_count: 5 },
            ];
        });

        const result = await selectDomainWithNiching();
        // physics is underrepresented
        expect(result).toBe('physics');
    });
});

// =============================================================================
// selectDomainPair
// =============================================================================

describe('selectDomainPair', () => {
    it('returns null when fewer than 2 domains', async () => {
        mockGetTransientDomains.mockResolvedValue({ states: new Map() });
        mockQuery.mockImplementation(async (sql: string) => {
            if (String(sql).includes('partition_domains')) return [];
            if (String(sql).includes('dream_cycles')) return [];
            return [{ domain: 'science', node_count: 5 }]; // only 1 domain
        });

        const result = await selectDomainPair();
        expect(result).toBeNull();
    });

    it('returns null when no accessible domain pairs', async () => {
        mockGetTransientDomains.mockResolvedValue({ states: new Map() });
        mockGetAccessibleDomains.mockResolvedValue([]); // nothing accessible
        mockQuery.mockImplementation(async (sql: string) => {
            if (String(sql).includes('partition_domains')) return [];
            if (String(sql).includes('dream_cycles')) return [];
            return [{ domain: 'science', node_count: 5 }, { domain: 'math', node_count: 5 }];
        });

        const result = await selectDomainPair();
        expect(result).toBeNull();
    });

    it('returns a pair when domains are accessible to each other', async () => {
        mockGetTransientDomains.mockResolvedValue({ states: new Map() });
        mockGetAccessibleDomains.mockImplementation(async (domain: string) => {
            if (domain === 'science') return ['math'];
            return [];
        });
        mockQuery.mockImplementation(async (sql: string) => {
            if (String(sql).includes('partition_domains')) return [];
            if (String(sql).includes('dream_cycles')) return [];
            return [{ domain: 'science', node_count: 10 }, { domain: 'math', node_count: 8 }];
        });

        const result = await selectDomainPair();
        expect(result).not.toBeNull();
        expect(result!.domainA).toBe('science');
        expect(result!.domainB).toBe('math');
    });

    it('respects constraintDomain filter', async () => {
        mockGetTransientDomains.mockResolvedValue({ states: new Map() });
        mockGetAccessibleDomains.mockImplementation(async (domain: string) => {
            return ['science', 'math', 'biology'].filter(d => d !== domain);
        });
        mockQuery.mockImplementation(async (sql: string) => {
            if (String(sql).includes('partition_domains')) return [];
            if (String(sql).includes('dream_cycles')) return [];
            return [
                { domain: 'science', node_count: 10 },
                { domain: 'math', node_count: 8 },
                { domain: 'biology', node_count: 6 },
            ];
        });

        const result = await selectDomainPair('math');
        expect(result).not.toBeNull();
        // At least one of the domains must be 'math'
        expect(result!.domainA === 'math' || result!.domainB === 'math').toBe(true);
    });
});
