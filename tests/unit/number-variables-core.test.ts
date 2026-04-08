/**
 * Comprehensive unit tests for core/number-variables.ts — covers DB-dependent functions:
 * registerNodeVariables, getNodeVariables, getVariablesByIds, resolveContent,
 * linkExistingVarRefs, getNextVarId, getInstallationPrefix, clearInstallationPrefixCache,
 * backfillNumberVariables.
 *
 * Also covers pure functions more thoroughly where the existing test file has gaps.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---- Mock setup ----

const mockQuery = jest.fn<(...args: any[]) => Promise<any[]>>().mockResolvedValue([]);
const mockQueryOne = jest.fn<(...args: any[]) => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: mockQueryOne,
}));

jest.unstable_mockModule('../../config.js', () => ({
    config: {
        numberVariables: {
            enabled: true,
            maxVarsPerNode: 50,
            contextWindowSize: 5,
        },
    },
}));

const {
    extractNumbers,
    extractScopeContext,
    extractVarIdsFromContent,
    registerNodeVariables,
    getNodeVariables,
    getVariablesByIds,
    resolveContent,
    buildVariableLegend,
    stripVariableNotation,
    linkExistingVarRefs,
    getNextVarId,
    getInstallationPrefix,
    clearInstallationPrefixCache,
    backfillNumberVariables,
} = await import('../../core/number-variables.js');

type NumberVariable = import('../../core/number-variables.js').NumberVariable;

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockQueryOne.mockResolvedValue(null);
    clearInstallationPrefixCache();
});

// =============================================================================
// getInstallationPrefix
// =============================================================================

describe('getInstallationPrefix', () => {
    it('creates and stores a new installation ID when none exists', async () => {
        // First call: no existing installation ID
        mockQueryOne.mockResolvedValueOnce(null);
        // INSERT succeeds
        mockQuery.mockResolvedValueOnce([]);

        const prefix = await getInstallationPrefix();

        // Should be 4 uppercase letters
        expect(prefix).toMatch(/^[A-Z]{4}$/);

        // Should have queried for existing ID
        expect(mockQueryOne).toHaveBeenCalledWith(
            expect.stringContaining('installation.id')
        );

        // Should have inserted a new UUID
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.arrayContaining([expect.any(String)])
        );
    });

    it('reuses existing installation ID from settings', async () => {
        mockQueryOne.mockResolvedValueOnce({ value: 'test-uuid-1234' });

        const prefix = await getInstallationPrefix();
        expect(prefix).toMatch(/^[A-Z]{4}$/);

        // Should NOT have inserted
        expect(mockQuery).not.toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO settings'),
            expect.anything()
        );
    });

    it('caches the prefix after first call', async () => {
        mockQueryOne.mockResolvedValueOnce({ value: 'cached-uuid' });

        const first = await getInstallationPrefix();
        const second = await getInstallationPrefix();

        expect(first).toBe(second);
        // queryOne should only be called once (cached on second call)
        expect(mockQueryOne).toHaveBeenCalledTimes(1);
    });

    it('produces deterministic prefix from same UUID', async () => {
        const uuid = 'deterministic-test-uuid';
        mockQueryOne.mockResolvedValueOnce({ value: uuid });
        const prefix1 = await getInstallationPrefix();

        clearInstallationPrefixCache();
        mockQueryOne.mockResolvedValueOnce({ value: uuid });
        const prefix2 = await getInstallationPrefix();

        expect(prefix1).toBe(prefix2);
    });
});

// =============================================================================
// clearInstallationPrefixCache
// =============================================================================

describe('clearInstallationPrefixCache', () => {
    it('forces re-fetch of prefix on next call', async () => {
        mockQueryOne.mockResolvedValueOnce({ value: 'uuid-a' });
        await getInstallationPrefix();

        clearInstallationPrefixCache();

        mockQueryOne.mockResolvedValueOnce({ value: 'uuid-b' });
        const prefix = await getInstallationPrefix();

        // Should have called queryOne twice (once for each getInstallationPrefix)
        expect(mockQueryOne).toHaveBeenCalledTimes(2);
        expect(prefix).toMatch(/^[A-Z]{4}$/);
    });
});

// =============================================================================
// getNextVarId
// =============================================================================

describe('getNextVarId', () => {
    it('returns prefix + counter from DB', async () => {
        // getInstallationPrefix: existing ID
        mockQueryOne.mockResolvedValueOnce({ value: 'test-uuid-for-counter' });
        // ensureCounterLoaded: max existing counter = 5
        mockQueryOne.mockResolvedValueOnce({ max_id: '5' });

        const varId = await getNextVarId();

        // Should be PREFIX + 6 (next after max 5)
        expect(varId).toMatch(/^[A-Z]{4}6$/);
    });

    it('starts at 1 when registry is empty', async () => {
        mockQueryOne.mockResolvedValueOnce({ value: 'fresh-uuid' });
        // ensureCounterLoaded: no existing entries
        mockQueryOne.mockResolvedValueOnce({ max_id: '0' });

        const varId = await getNextVarId();
        expect(varId).toMatch(/^[A-Z]{4}1$/);
    });

    it('caches counter after first load', async () => {
        mockQueryOne.mockResolvedValueOnce({ value: 'counter-cache-uuid' });
        mockQueryOne.mockResolvedValueOnce({ max_id: '10' });

        const first = await getNextVarId();
        const second = await getNextVarId();

        // Counter should be loaded only once from DB
        // (2 queryOne calls: 1 for prefix, 1 for counter)
        expect(mockQueryOne).toHaveBeenCalledTimes(2);
        // But the var IDs should be the same (counter not incremented by getNextVarId alone)
        expect(first).toMatch(/^[A-Z]{4}11$/);
    });
});

// =============================================================================
// registerNodeVariables
// =============================================================================

describe('registerNodeVariables', () => {
    beforeEach(() => {
        // Setup prefix and counter for all registerNodeVariables tests
        mockQueryOne.mockResolvedValueOnce({ value: 'register-uuid' }); // installation prefix
        mockQueryOne.mockResolvedValueOnce({ max_id: '0' });            // counter = 0 → next = 1
    });

    it('returns unmodified content when no numbers present', async () => {
        const result = await registerNodeVariables('node1', 'no numbers here', 'test-domain');

        expect(result.annotatedContent).toBe('no numbers here');
        expect(result.varIds).toHaveLength(0);
    });

    it('replaces numbers with variable refs and inserts into DB', async () => {
        const result = await registerNodeVariables(
            'node1',
            'The rate is 42 percent',
            'biology'
        );

        expect(result.varIds).toHaveLength(1);
        expect(result.annotatedContent).toContain('[[[');
        expect(result.annotatedContent).toContain(']]]');
        expect(result.annotatedContent).not.toContain(' 42 ');

        // Should have inserted into number_registry
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO number_registry'),
            expect.arrayContaining(['42', 'node1', 'biology'])
        );

        // Should have inserted into node_number_refs
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT OR IGNORE INTO node_number_refs'),
            expect.arrayContaining(['node1'])
        );
    });

    it('handles multiple numbers in content', async () => {
        const result = await registerNodeVariables(
            'node2',
            'Between 10 and 20 percent with 3.5 ratio',
            'stats'
        );

        expect(result.varIds).toHaveLength(3);
        // All numbers should be replaced
        expect(result.annotatedContent).not.toMatch(/\b10\b(?!\]\]\])/);
        expect(result.annotatedContent).not.toMatch(/\b20\b(?!\]\]\])/);
        expect(result.annotatedContent).not.toMatch(/\b3\.5\b/);

        // 3 inserts to number_registry + 3 to node_number_refs = 6 total
        const registryInserts = mockQuery.mock.calls.filter(
            c => typeof c[0] === 'string' && c[0].includes('INSERT INTO number_registry')
        );
        expect(registryInserts).toHaveLength(3);
    });

    it('preserves non-numeric content unchanged', async () => {
        const result = await registerNodeVariables(
            'node3',
            'The concept of 99 items is crucial',
            'domain'
        );

        // Should keep surrounding text
        expect(result.annotatedContent).toContain('The concept of');
        expect(result.annotatedContent).toContain('items is crucial');
    });

    it('increments counter for each variable', async () => {
        const result = await registerNodeVariables(
            'node4',
            'Values 1 and 2 and 3',
            'domain'
        );

        expect(result.varIds).toHaveLength(3);
        // Each varId should have a different counter suffix
        const counters = result.varIds.map(id => parseInt(id.replace(/^[A-Z]+/, ''), 10));
        const uniqueCounters = new Set(counters);
        expect(uniqueCounters.size).toBe(3);
    });

    it('does not re-extract numbers inside existing variable refs', async () => {
        const content = 'Value [[[ABCD5]]] and 100 here';
        const result = await registerNodeVariables('node5', content, 'domain');

        // Should only create a ref for 100, not for 5 inside [[[ABCD5]]]
        expect(result.varIds).toHaveLength(1);

        // The existing ref should still be present
        expect(result.annotatedContent).toContain('[[[ABCD5]]]');
    });
});

// =============================================================================
// getNodeVariables
// =============================================================================

describe('getNodeVariables', () => {
    it('returns mapped variables from DB rows', async () => {
        mockQuery.mockResolvedValueOnce([
            { var_id: 'ABCD1', value: '42', scope_text: 'the answer', source_node_id: 'n1', domain: 'math' },
            { var_id: 'ABCD2', value: '3.14', scope_text: 'pi value', source_node_id: 'n1', domain: 'math' },
        ]);

        const vars = await getNodeVariables('n1');

        expect(vars).toHaveLength(2);
        expect(vars[0]).toEqual({
            varId: 'ABCD1',
            value: '42',
            scopeText: 'the answer',
            sourceNodeId: 'n1',
            domain: 'math',
        });
        expect(vars[1].varId).toBe('ABCD2');
    });

    it('returns empty array when node has no variables', async () => {
        mockQuery.mockResolvedValueOnce([]);

        const vars = await getNodeVariables('empty-node');
        expect(vars).toHaveLength(0);
    });

    it('queries with the correct node ID', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await getNodeVariables('specific-node-id');

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('ref.node_id = $1'),
            ['specific-node-id']
        );
    });
});

// =============================================================================
// getVariablesByIds
// =============================================================================

describe('getVariablesByIds', () => {
    it('returns empty array for empty input', async () => {
        const result = await getVariablesByIds([]);
        expect(result).toHaveLength(0);
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('returns variables for given IDs', async () => {
        mockQuery.mockResolvedValueOnce([
            { var_id: 'XX1', value: '10', scope_text: 'ctx', source_node_id: 'n1', domain: 'd1' },
        ]);

        const result = await getVariablesByIds(['XX1']);

        expect(result).toHaveLength(1);
        expect(result[0].varId).toBe('XX1');
        expect(result[0].value).toBe('10');
    });

    it('builds correct IN clause for multiple IDs', async () => {
        mockQuery.mockResolvedValueOnce([]);

        await getVariablesByIds(['A1', 'B2', 'C3']);

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('$1, $2, $3'),
            ['A1', 'B2', 'C3']
        );
    });
});

// =============================================================================
// resolveContent
// =============================================================================

describe('resolveContent', () => {
    it('returns content unchanged when no variable refs present', async () => {
        const result = await resolveContent('plain text with no refs');
        expect(result).toBe('plain text with no refs');
    });

    it('replaces variable refs with their values from DB', async () => {
        mockQuery.mockResolvedValueOnce([
            { var_id: 'ABCD1', value: '42', scope_text: 'ctx', source_node_id: 'n1', domain: 'd1' },
        ]);

        const result = await resolveContent('The answer is [[[ABCD1]]].');
        expect(result).toBe('The answer is 42.');
    });

    it('handles multiple variable refs', async () => {
        mockQuery.mockResolvedValueOnce([
            { var_id: 'XX1', value: '10', scope_text: '', source_node_id: 'n1', domain: 'd1' },
            { var_id: 'YY2', value: '20', scope_text: '', source_node_id: 'n2', domain: 'd2' },
        ]);

        const result = await resolveContent('[[[XX1]]] plus [[[YY2]]]');
        expect(result).toBe('10 plus 20');
    });

    it('leaves unresolvable refs intact', async () => {
        mockQuery.mockResolvedValueOnce([]);

        const result = await resolveContent('Value [[[UNKNOWN1]]] here');
        expect(result).toBe('Value [[[UNKNOWN1]]] here');
    });

    it('resolves some refs and leaves others', async () => {
        mockQuery.mockResolvedValueOnce([
            { var_id: 'FOUND1', value: '99', scope_text: '', source_node_id: 'n1', domain: 'd1' },
        ]);

        const result = await resolveContent('[[[FOUND1]]] and [[[MISSING1]]]');
        expect(result).toBe('99 and [[[MISSING1]]]');
    });
});

// =============================================================================
// linkExistingVarRefs
// =============================================================================

describe('linkExistingVarRefs', () => {
    it('creates node_number_refs links for variable refs in content', async () => {
        await linkExistingVarRefs('new-node', 'Content with [[[ABCD1]]] and [[[EFGH2]]]');

        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT OR IGNORE INTO node_number_refs'),
            ['new-node', 'ABCD1']
        );
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT OR IGNORE INTO node_number_refs'),
            ['new-node', 'EFGH2']
        );
    });

    it('does nothing when content has no variable refs', async () => {
        await linkExistingVarRefs('node-id', 'no refs here');
        expect(mockQuery).not.toHaveBeenCalled();
    });

    it('deduplicates refs before linking', async () => {
        await linkExistingVarRefs('node-id', '[[[ABCD1]]] and [[[ABCD1]]] again');

        // Should only insert once for ABCD1
        const insertCalls = mockQuery.mock.calls.filter(
            c => typeof c[0] === 'string' && c[0].includes('INSERT OR IGNORE')
        );
        expect(insertCalls).toHaveLength(1);
    });
});

// =============================================================================
// backfillNumberVariables
// =============================================================================

describe('backfillNumberVariables', () => {
    it('returns zeros when numberVariables is disabled', async () => {
        // Override config to disabled
        const configMod = await import('../../config.js');
        const origEnabled = (configMod.config as any).numberVariables.enabled;
        (configMod.config as any).numberVariables.enabled = false;

        const result = await backfillNumberVariables();
        expect(result).toEqual({ processed: 0, skipped: 0 });

        // Restore
        (configMod.config as any).numberVariables.enabled = origEnabled;
    });

    it('returns zeros when backfill already ran', async () => {
        // backfill flag exists
        mockQueryOne.mockResolvedValueOnce({ value: 'done' });

        const result = await backfillNumberVariables();
        expect(result).toEqual({ processed: 0, skipped: 0 });
    });

    it('marks backfill as done even with no candidates', async () => {
        // No backfill flag
        mockQueryOne.mockResolvedValueOnce(null);
        // No candidate nodes
        mockQuery.mockResolvedValueOnce([]);

        const result = await backfillNumberVariables();
        expect(result).toEqual({ processed: 0, skipped: 0 });

        // Should insert the flag
        expect(mockQuery).toHaveBeenCalledWith(
            expect.stringContaining("numvar_backfill_v2")
        );
    });

    it('processes candidate nodes with numbers', async () => {
        // No backfill flag
        mockQueryOne
            .mockResolvedValueOnce(null)     // backfill flag check
            .mockResolvedValueOnce({ value: 'backfill-uuid' })  // getInstallationPrefix
            .mockResolvedValueOnce({ max_id: '0' });            // ensureCounterLoaded

        // Candidate nodes returned
        mockQuery.mockResolvedValueOnce([
            { id: 'node-a', content: 'Value is 42', domain: 'test' },
        ]);

        // Subsequent calls for registerNodeVariables inserts + UPDATE + flag
        mockQuery.mockResolvedValue([]);

        const result = await backfillNumberVariables();
        expect(result.processed).toBe(1);
        expect(result.skipped).toBe(0);

        // Should have updated the node content
        const updateCalls = mockQuery.mock.calls.filter(
            c => typeof c[0] === 'string' && c[0].includes('UPDATE nodes SET content')
        );
        expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('skips nodes with no extractable numbers', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null)     // backfill flag check
            .mockResolvedValueOnce({ value: 'backfill-uuid-2' })
            .mockResolvedValueOnce({ max_id: '0' });

        // Node has digits in content (matched by SQL GLOB) but they might
        // be inside existing refs — we simulate a node that extractNumbers returns []
        mockQuery.mockResolvedValueOnce([
            { id: 'node-b', content: 'already [[[ABCD1]]]', domain: 'test' },
        ]);
        mockQuery.mockResolvedValue([]);

        const result = await backfillNumberVariables();
        // The node has [[[ABCD1]]] which contains "1", but extractNumbers skips it
        expect(result.skipped).toBe(1);
        expect(result.processed).toBe(0);
    });

    it('handles errors in individual nodes gracefully', async () => {
        mockQueryOne
            .mockResolvedValueOnce(null)     // backfill flag check
            .mockResolvedValueOnce({ value: 'backfill-uuid-3' })
            .mockResolvedValueOnce({ max_id: '0' });

        mockQuery.mockResolvedValueOnce([
            { id: 'node-ok', content: 'Value 100', domain: 'test' },
            { id: 'node-fail', content: 'Value 200', domain: 'test' },
        ]);

        // First node succeeds, second node's INSERT fails
        let insertCount = 0;
        mockQuery.mockImplementation(async (sql: any, ..._args: any[]) => {
            if (typeof sql === 'string' && sql.includes('INSERT INTO number_registry')) {
                insertCount++;
                if (insertCount > 2) {
                    // Fail on second node's registry insert
                    throw new Error('DB constraint violation');
                }
            }
            return [];
        });

        const result = await backfillNumberVariables();
        // First node processed, second skipped due to error
        expect(result.processed + result.skipped).toBe(2);
    });
});

// =============================================================================
// extractNumbers — additional edge cases
// =============================================================================

describe('extractNumbers (additional)', () => {
    it('handles empty string', () => {
        expect(extractNumbers('')).toHaveLength(0);
    });

    it('extracts large numbers', () => {
        const result = extractNumbers('Population is 1000000');
        expect(result).toHaveLength(1);
        expect(result[0].rawValue).toBe('1000000');
    });

    it('extracts numbers with trailing decimal point', () => {
        // "5." — regex captures "5" since \.? is optional and \d* matches empty
        const result = extractNumbers('About 5. items');
        expect(result.length).toBeGreaterThanOrEqual(1);
        expect(result[0].rawValue).toBe('5');
    });

    it('handles content that is just a number', () => {
        const result = extractNumbers('42');
        expect(result).toHaveLength(1);
        expect(result[0].rawValue).toBe('42');
        expect(result[0].offset).toBe(0);
    });

    it('handles consecutive numbers', () => {
        const result = extractNumbers('10 20 30');
        expect(result).toHaveLength(3);
    });
});

// =============================================================================
// extractScopeContext — additional edge cases
// =============================================================================

describe('extractScopeContext (additional)', () => {
    it('handles empty content', () => {
        const result = extractScopeContext('', 0, 0);
        expect(typeof result).toBe('string');
    });

    it('handles content with fewer words than window size', () => {
        const content = 'A 5 B';
        const offset = 2; // position of '5'
        const result = extractScopeContext(content, offset, 1);
        expect(result).toContain('A');
        expect(result).toContain('B');
    });

    it('returns trimmed result', () => {
        const content = '  spaces  42  around  ';
        const offset = content.indexOf('42');
        const result = extractScopeContext(content, offset, 2);
        expect(result).toBe(result.trim());
    });
});

// =============================================================================
// extractVarIdsFromContent — additional edge cases
// =============================================================================

describe('extractVarIdsFromContent (additional)', () => {
    it('handles malformed refs (missing brackets)', () => {
        const content = '[[ABCD1]] and [ABCD2]';
        const ids = extractVarIdsFromContent(content);
        expect(ids).toHaveLength(0);
    });

    it('handles refs with long prefix', () => {
        const content = '[[[ABCDEF123]]]';
        const ids = extractVarIdsFromContent(content);
        expect(ids).toHaveLength(1);
        expect(ids[0]).toBe('ABCDEF123');
    });

    it('does not match lowercase prefixes', () => {
        const content = '[[[abcd1]]]';
        const ids = extractVarIdsFromContent(content);
        expect(ids).toHaveLength(0);
    });
});

// =============================================================================
// buildVariableLegend — additional edge cases
// =============================================================================

describe('buildVariableLegend (additional)', () => {
    it('handles single variable', () => {
        const vars: NumberVariable[] = [
            { varId: 'XX1', value: '42', scopeText: 'answer', sourceNodeId: 'n1', domain: 'life' },
        ];
        const legend = buildVariableLegend(vars);
        expect(legend).toContain('NUMBER VARIABLES');
        expect(legend).toContain('[[[XX1]]] = 42');
        expect(legend).toContain('life:');
    });

    it('handles variables from same domain', () => {
        const vars: NumberVariable[] = [
            { varId: 'A1', value: '1', scopeText: 'first', sourceNodeId: 'n1', domain: 'dom' },
            { varId: 'A2', value: '2', scopeText: 'second', sourceNodeId: 'n1', domain: 'dom' },
        ];
        const legend = buildVariableLegend(vars);
        const lines = legend.split('\n');
        // Header + 2 variable lines
        expect(lines.length).toBeGreaterThanOrEqual(3);
    });
});

// =============================================================================
// stripVariableNotation — additional edge cases
// =============================================================================

describe('stripVariableNotation (additional)', () => {
    it('handles empty content', () => {
        const result = stripVariableNotation('', new Map());
        expect(result).toBe('');
    });

    it('handles content with no refs', () => {
        const result = stripVariableNotation('plain text', new Map([['A1', '10']]));
        expect(result).toBe('plain text');
    });

    it('replaces ref at start of content', () => {
        const result = stripVariableNotation('[[[A1]]] items', new Map([['A1', '5']]));
        expect(result).toBe('5 items');
    });

    it('replaces ref at end of content', () => {
        const result = stripVariableNotation('count: [[[A1]]]', new Map([['A1', '99']]));
        expect(result).toBe('count: 99');
    });
});
