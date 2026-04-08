/**
 * API tests for routes/config-routes.ts
 *
 * Tests: GET /config (returns safe config),
 *        POST /config/clamp-nodes (validation: missing bounds, missing scope)
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockGetSafeConfig = jest.fn<() => any>().mockReturnValue({ synthesisEngine: { enabled: true } });
const mockUpdateConfig = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockIsSensitiveConfigPath = jest.fn<() => boolean>().mockReturnValue(false);
const mockIsAdminPasswordSet = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockVerifyAdminPassword = jest.fn<() => Promise<boolean>>().mockResolvedValue(false);
const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockSystemQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockHandleConfig = jest.fn<() => Promise<any>>().mockResolvedValue({ success: true });
const mockReadProjectsMeta = jest.fn<() => any>().mockReturnValue({ currentProject: 'default' });

jest.unstable_mockModule('../../config.js', () => ({
    getSafeConfig: mockGetSafeConfig,
    updateConfig: mockUpdateConfig,
    config: { synthesisEngine: { enabled: true } },
}));

jest.unstable_mockModule('../../core/security.js', () => ({
    isSensitiveConfigPath: mockIsSensitiveConfigPath,
    isAdminPasswordSet: mockIsAdminPasswordSet,
    verifyAdminPassword: mockVerifyAdminPassword,
    getSecurityKey: jest.fn<() => Promise<string>>().mockResolvedValue('test-key'),
}));

jest.unstable_mockModule('../../db.js', () => ({
    query: mockQuery,
    queryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
    systemQuery: mockSystemQuery,
    systemQueryOne: jest.fn<() => Promise<any>>().mockResolvedValue(null),
}));

jest.unstable_mockModule('../../handlers/config-tune-handler.js', () => ({
    handleConfig: mockHandleConfig,
}));

jest.unstable_mockModule('../../handlers/projects/meta.js', () => ({
    readProjectsMeta: mockReadProjectsMeta,
}));

jest.unstable_mockModule('../../routes/security.js', () => ({
    validateAdminTokenExport: jest.fn<() => boolean>().mockReturnValue(false),
    requireKey: (_req: any, _res: any, next: any) => next(),
    requireAdmin: (_req: any, _res: any, next: any) => next(),
    default: { get: () => {}, post: () => {}, put: () => {}, delete: () => {} },
}));

jest.unstable_mockModule('../../utils/async-handler.js', () => ({
    asyncHandler: (fn: any) => fn,
}));

const express = (await import('express')).default;
const request = (await import('supertest')).default;
const { default: configRouter } = await import('../../routes/config-routes.js');

/** Express app with config router; no trust proxy. */
function buildApp() {
    const app = express();
    app.use(express.json());
    app.use('/', configRouter);
    return app;
}

beforeEach(() => {
    jest.clearAllMocks();
    mockGetSafeConfig.mockReturnValue({ synthesisEngine: { enabled: true } });
    mockUpdateConfig.mockResolvedValue([]);
    mockIsSensitiveConfigPath.mockReturnValue(false);
    mockIsAdminPasswordSet.mockResolvedValue(false);
    mockQuery.mockResolvedValue([]);
    mockSystemQuery.mockResolvedValue([]);
});

// =============================================================================
// GET /config
// =============================================================================

describe('GET /config', () => {
    it('returns safe config', async () => {
        const res = await request(buildApp()).get('/config');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('synthesisEngine');
        expect(mockGetSafeConfig).toHaveBeenCalled();
    });
});

// =============================================================================
// PUT /config
// =============================================================================

describe('PUT /config', () => {
    it('updates config and returns new config', async () => {
        mockUpdateConfig.mockResolvedValue([]);
        const res = await request(buildApp())
            .put('/config')
            .send({ synthesisEngine: { enabled: false } });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body).toHaveProperty('config');
        expect(mockUpdateConfig).toHaveBeenCalled();
    });

    it('returns 403 for sensitive path when admin password set and no token', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(true);
        mockIsAdminPasswordSet.mockResolvedValue(true);
        const res = await request(buildApp())
            .put('/config')
            .send({ security: { someKey: 'value' } });
        expect(res.status).toBe(403);
        expect(res.body.adminRequired).toBe(true);
        expect(Array.isArray(res.body.sensitivePaths)).toBe(true);
    });

    it('allows non-sensitive config changes without admin', async () => {
        mockIsSensitiveConfigPath.mockReturnValue(false);
        const res = await request(buildApp())
            .put('/config')
            .send({ synthesisEngine: { enabled: false } });
        expect(res.status).toBe(200);
    });
});

// =============================================================================
// POST /config/clamp-nodes
// =============================================================================

describe('POST /config/clamp-nodes', () => {
    it('returns 400 when no bounds are specified', async () => {
        const res = await request(buildApp())
            .post('/config/clamp-nodes')
            .send({ partitions: ['p1'] });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/at least one bound/i);
    });

    it('returns 400 when no partition scope is specified', async () => {
        const res = await request(buildApp())
            .post('/config/clamp-nodes')
            .send({ weightCeiling: 2.0 });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/at least one partition/i);
    });

    it('runs in preview mode and returns counts without modifying', async () => {
        mockQuery.mockResolvedValue([{ count: 5 }]);
        const res = await request(buildApp())
            .post('/config/clamp-nodes')
            .send({
                weightCeiling: 2.0,
                partitions: ['p1'],
                preview: true,
            });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('counts');
        expect(res.body.preview).toBe(true);
    });

    it('accepts includeUnpartitioned as scope', async () => {
        mockQuery.mockResolvedValue([{ count: 0 }]);
        const res = await request(buildApp())
            .post('/config/clamp-nodes')
            .send({
                weightCeiling: 2.0,
                includeUnpartitioned: true,
                preview: true,
            });
        expect(res.status).toBe(200);
    });
});
