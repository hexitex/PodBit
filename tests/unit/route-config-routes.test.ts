/**
 * Unit tests for routes/config-routes.ts —
 * GET /config, PUT /config, POST /config/clamp-nodes
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';
import request from 'supertest';

// =============================================================================
// Mocks
// =============================================================================

const mockGetSafeConfig = jest.fn().mockReturnValue({ theme: 'dark' });
const mockUpdateConfig = jest.fn<() => Promise<string[]>>().mockResolvedValue([]);
const mockRawConfig: Record<string, any> = {};

jest.unstable_mockModule('../../config.js', () => ({
    getSafeConfig: mockGetSafeConfig,
    updateConfig: mockUpdateConfig,
    config: mockRawConfig,
}));

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    systemQuery: mockSystemQuery,
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: Function) => (req: any, res: any, next: any) =>
        Promise.resolve(fn(req, res, next)).catch(next),
}));

const mockIsSensitiveConfigPath = jest.fn<() => boolean>().mockReturnValue(false);
const mockIsAdminPasswordSet = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockVerifyAdminPassword = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);

jest.unstable_mockModule('../../core/security.js', () => ({
    isSensitiveConfigPath: mockIsSensitiveConfigPath,
    isAdminPasswordSet: mockIsAdminPasswordSet,
    verifyAdminPassword: mockVerifyAdminPassword,
}));

const mockValidateAdminTokenExport = jest.fn<() => boolean>().mockReturnValue(false);

jest.unstable_mockModule('../../routes/security.js', () => ({
    validateAdminTokenExport: mockValidateAdminTokenExport,
}));

const mockHandleConfig = jest.fn<() => Promise<any>>().mockResolvedValue({});

jest.unstable_mockModule('../../handlers/config-tune-handler.js', () => ({
    handleConfig: mockHandleConfig,
}));

const mockReadProjectsMeta = jest.fn().mockReturnValue({ currentProject: 'test-project' });

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    readProjectsMeta: mockReadProjectsMeta,
}));

const configRouter = (await import('../../routes/config-routes.js')).default;

// Build test app
const app = express();
app.use(express.json());
app.use(configRouter);
app.use((err: any, _req: any, res: any, _next: any) => {
    res.status(500).json({ error: err.message });
});

beforeEach(() => {
    jest.resetAllMocks();
    mockGetSafeConfig.mockReturnValue({ theme: 'dark' });
    mockUpdateConfig.mockResolvedValue([]);
    mockIsSensitiveConfigPath.mockReturnValue(false);
    mockIsAdminPasswordSet.mockResolvedValue(false);
    mockVerifyAdminPassword.mockResolvedValue(false);
    mockValidateAdminTokenExport.mockReturnValue(false);
    mockHandleConfig.mockResolvedValue({});
    mockReadProjectsMeta.mockReturnValue({ currentProject: 'test-project' });
    mockQuery.mockResolvedValue([]);
    mockSystemQuery.mockResolvedValue([]);
    // Reset rawConfig state between tests
    for (const key of Object.keys(mockRawConfig)) {
        delete mockRawConfig[key];
    }
});

// =============================================================================
// GET /config
// =============================================================================

describe('GET /config', () => {
    it('returns safe config', async () => {
        mockGetSafeConfig.mockReturnValue({ foo: 'bar', nested: { x: 1 } });

        const res = await request(app).get('/config');

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ foo: 'bar', nested: { x: 1 } });
    });

    it('calls getSafeConfig', async () => {
        await request(app).get('/config');

        expect(mockGetSafeConfig).toHaveBeenCalled();
    });
});

// =============================================================================
// PUT /config
// =============================================================================

describe('PUT /config', () => {
    it('updates config and returns safe config with warnings', async () => {
        mockUpdateConfig.mockResolvedValue(['warn1']);
        mockGetSafeConfig.mockReturnValue({ updated: true });

        const res = await request(app).put('/config').send({ theme: 'light' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.config).toEqual({ updated: true });
        expect(res.body.warnings).toEqual(['warn1']);
    });

    it('calls updateConfig with the request body', async () => {
        await request(app).put('/config').send({ myKey: 'myValue' });

        expect(mockUpdateConfig).toHaveBeenCalledWith({ myKey: 'myValue' });
    });

    it('saves auto-snapshot before applying changes', async () => {
        await request(app).put('/config').send({ x: 1 });

        expect(mockHandleConfig).toHaveBeenCalledWith(
            expect.objectContaining({ action: 'snapshot', snapshotAction: 'save' })
        );
    });

    it('allows update when no sensitive paths changed', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(false);

        const res = await request(app).put('/config').send({ theme: 'light' });

        expect(res.status).toBe(200);
    });

    it('allows update when sensitive path changed but no admin password is set', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(false);

        const res = await request(app).put('/config').send({ apiKey: 'abc' });

        expect(res.status).toBe(200);
    });

    it('returns 403 when sensitive path changed, admin password set, and no auth provided', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockValidateAdminTokenExport.mockReturnValue(false);
        mockVerifyAdminPassword.mockResolvedValue(false);

        const res = await request(app).put('/config').send({ apiKey: 'abc' });

        expect(res.status).toBe(403);
        expect(res.body.adminRequired).toBe(true);
        expect(res.body.sensitivePaths).toBeInstanceOf(Array);
    });

    it('allows update with valid admin token header', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockValidateAdminTokenExport.mockReturnValue(true);

        const res = await request(app)
            .put('/config')
            .set('x-admin-token', 'valid-token')
            .send({ apiKey: 'abc' });

        expect(res.status).toBe(200);
    });

    it('allows update with valid admin password header', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(true);
        mockVerifyAdminPassword.mockResolvedValue(true);

        const res = await request(app)
            .put('/config')
            .set('x-admin-password', 'correct-password')
            .send({ apiKey: 'abc' });

        expect(res.status).toBe(200);
    });

    it('skips sensitive-path check when value is unchanged from current config', async () => {
        // rawConfig already has this value — collectChanged won't flag it
        mockRawConfig.apiKey = 'same-value';

        const res = await request(app).put('/config').send({ apiKey: 'same-value' });

        expect(mockIsSensitiveConfigPath).not.toHaveBeenCalled();
        expect(res.status).toBe(200);
    });

    it('writes config history entry for changed values', async () => {
        // updateConfig mutates rawConfig so old (undefined) !== new ('light')
        mockUpdateConfig.mockImplementation(async (body: any) => {
            Object.assign(mockRawConfig, body);
            return [];
        });

        await request(app).put('/config').send({ theme: 'light' });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO config_history'),
            expect.arrayContaining(['theme', '"light"'])
        );
    });

    it('does not write config history when value is unchanged', async () => {
        mockRawConfig.theme = 'dark';
        // updateConfig doesn't change rawConfig, so before === after
        mockUpdateConfig.mockResolvedValue([]);

        await request(app).put('/config').send({ theme: 'dark' });

        const historyCalls = mockSystemQuery.mock.calls.filter(
            ([sql]) => String(sql).includes('config_history')
        );
        expect(historyCalls).toHaveLength(0);
    });

    it('reads project name for history scoping', async () => {
        mockReadProjectsMeta.mockReturnValue({ currentProject: 'my-project' });
        mockUpdateConfig.mockImplementation(async (body: any) => {
            Object.assign(mockRawConfig, body);
            return [];
        });

        await request(app).put('/config').send({ key: 'val' });

        expect(mockSystemQuery).toHaveBeenCalledWith(
            expect.stringContaining('INSERT INTO config_history'),
            expect.arrayContaining(['my-project'])
        );
    });
});

// =============================================================================
// POST /config/clamp-nodes
// =============================================================================

describe('POST /config/clamp-nodes', () => {
    it('returns 400 when no bounds provided', async () => {
        const res = await request(app)
            .post('/config/clamp-nodes')
            .send({ includeUnpartitioned: true });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('bound');
    });

    it('returns 400 when no partitions selected and includeUnpartitioned is false', async () => {
        const res = await request(app)
            .post('/config/clamp-nodes')
            .send({ weightCeiling: 0.9 });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('partition');
    });

    it('preview mode counts nodes but does not run UPDATE', async () => {
        mockQuery.mockResolvedValueOnce([{ cnt: 5 }]);

        const res = await request(app)
            .post('/config/clamp-nodes')
            .send({ weightCeiling: 0.9, includeUnpartitioned: true, preview: true });

        expect(res.status).toBe(200);
        expect(res.body.preview).toBe(true);
        expect(res.body.counts.weightCeiling).toBe(5);

        const updateCalls = mockQuery.mock.calls.filter(([sql]) =>
            String(sql).toUpperCase().startsWith('UPDATE')
        );
        expect(updateCalls).toHaveLength(0);
    });

    it('apply mode updates nodes when count > 0', async () => {
        mockQuery
            .mockResolvedValueOnce([{ cnt: 3 }]) // COUNT
            .mockResolvedValueOnce([]);            // UPDATE

        const res = await request(app)
            .post('/config/clamp-nodes')
            .send({ weightCeiling: 0.9, includeUnpartitioned: true });

        expect(res.status).toBe(200);
        expect(res.body.applied).toBe(true);
        expect(res.body.clamped.weightCeiling).toBe(3);

        const updateCalls = mockQuery.mock.calls.filter(([sql]) =>
            String(sql).toUpperCase().startsWith('UPDATE')
        );
        expect(updateCalls).toHaveLength(1);
    });

    it('apply mode skips UPDATE when count is 0', async () => {
        mockQuery.mockResolvedValueOnce([{ cnt: 0 }]);

        const res = await request(app)
            .post('/config/clamp-nodes')
            .send({ weightCeiling: 0.9, includeUnpartitioned: true });

        expect(res.status).toBe(200);

        const updateCalls = mockQuery.mock.calls.filter(([sql]) =>
            String(sql).toUpperCase().startsWith('UPDATE')
        );
        expect(updateCalls).toHaveLength(0);
    });

    it('handles all three bounds in a single request', async () => {
        mockQuery
            .mockResolvedValueOnce([{ cnt: 2 }])  // weightCeiling COUNT
            .mockResolvedValueOnce([])              // weightCeiling UPDATE
            .mockResolvedValueOnce([{ cnt: 1 }])  // salienceCeiling COUNT
            .mockResolvedValueOnce([])              // salienceCeiling UPDATE
            .mockResolvedValueOnce([{ cnt: 3 }])  // salienceFloor COUNT
            .mockResolvedValueOnce([]);             // salienceFloor UPDATE

        const res = await request(app)
            .post('/config/clamp-nodes')
            .send({
                weightCeiling: 0.9,
                salienceCeiling: 0.8,
                salienceFloor: 0.1,
                includeUnpartitioned: true,
            });

        expect(res.status).toBe(200);
        expect(res.body.clamped.weightCeiling).toBe(2);
        expect(res.body.clamped.salienceCeiling).toBe(1);
        expect(res.body.clamped.salienceFloor).toBe(3);
        expect(res.body.total).toBe(6);
    });

    it('queries partition_domains to resolve domains for selected partitions', async () => {
        mockQuery
            .mockResolvedValueOnce([{ domain: 'physics' }, { domain: 'math' }]) // partition_domains
            .mockResolvedValueOnce([{ cnt: 0 }]);                                // COUNT

        await request(app)
            .post('/config/clamp-nodes')
            .send({ weightCeiling: 0.9, partitions: ['p1'], preview: true });

        const [domainSql, domainParams] = mockQuery.mock.calls[0] as any[];
        expect(String(domainSql)).toContain('partition_domains');
        expect(domainParams).toContain('p1');
    });

    it('uses domain IN clause in COUNT query when domains are found', async () => {
        mockQuery
            .mockResolvedValueOnce([{ domain: 'physics' }]) // partition_domains
            .mockResolvedValueOnce([{ cnt: 0 }]);            // COUNT

        await request(app)
            .post('/config/clamp-nodes')
            .send({ weightCeiling: 0.9, partitions: ['p1'], preview: true });

        const [countSql] = mockQuery.mock.calls[1] as any[];
        expect(String(countSql)).toContain('domain IN');
    });

    it('returns total as sum of all bound counts', async () => {
        mockQuery
            .mockResolvedValueOnce([{ cnt: 4 }]) // weightCeiling COUNT (no update, preview)
            .mockResolvedValueOnce([{ cnt: 6 }]); // salienceCeiling COUNT (no update, preview)

        const res = await request(app)
            .post('/config/clamp-nodes')
            .send({
                weightCeiling: 0.9,
                salienceCeiling: 0.7,
                includeUnpartitioned: true,
                preview: true,
            });

        expect(res.body.total).toBe(10);
    });
});
