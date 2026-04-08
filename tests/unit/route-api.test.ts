/**
 * Unit tests for routes/api.ts —
 * Verifies that the main API router mounts all sub-route modules.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import express from 'express';

// =============================================================================
// Mocks — stub every sub-router with a minimal Router that registers a known path
// =============================================================================

function makeFakeRouter(tag: string) {
    const r = express.Router();
    r.get(`/__test_${tag}`, (_req: any, res: any) => res.json({ router: tag }));
    return r;
}

jest.unstable_mockModule('../../routes/health.js', () => ({ default: makeFakeRouter('health') }));
jest.unstable_mockModule('../../routes/resonance.js', () => ({ default: makeFakeRouter('resonance') }));
jest.unstable_mockModule('../../routes/scaffold.js', () => ({ default: makeFakeRouter('scaffold') }));
jest.unstable_mockModule('../../routes/config-routes.js', () => ({ default: makeFakeRouter('config') }));
jest.unstable_mockModule('../../routes/decisions.js', () => ({ default: makeFakeRouter('decisions') }));
jest.unstable_mockModule('../../routes/database.js', () => ({ default: makeFakeRouter('database') }));
jest.unstable_mockModule('../../routes/partitions.js', () => ({ default: makeFakeRouter('partitions') }));
jest.unstable_mockModule('../../routes/synthesis.js', () => ({ default: makeFakeRouter('synthesis') }));
jest.unstable_mockModule('../../routes/models.js', () => ({ default: makeFakeRouter('models') }));
jest.unstable_mockModule('../../routes/seeds.js', () => ({ default: makeFakeRouter('seeds') }));
jest.unstable_mockModule('../../routes/context.js', () => ({ default: makeFakeRouter('context') }));
jest.unstable_mockModule('../../routes/chat.js', () => ({ default: makeFakeRouter('chat') }));
jest.unstable_mockModule('../../routes/prompts.js', () => ({ default: makeFakeRouter('prompts') }));
jest.unstable_mockModule('../../routes/config-tune.js', () => ({ default: makeFakeRouter('configTune') }));
jest.unstable_mockModule('../../routes/feedback.js', () => ({ default: makeFakeRouter('feedback') }));
jest.unstable_mockModule('../../routes/breakthrough-registry.js', () => ({ default: makeFakeRouter('breakthroughRegistry') }));
jest.unstable_mockModule('../../routes/knowledge-base.js', () => ({ default: makeFakeRouter('knowledgeBase') }));
jest.unstable_mockModule('../../routes/keywords.js', () => ({ default: makeFakeRouter('keywords') }));
jest.unstable_mockModule('../../routes/activity.js', () => ({ default: makeFakeRouter('activity') }));
jest.unstable_mockModule('../../routes/autotune.js', () => ({ default: makeFakeRouter('autotune') }));
jest.unstable_mockModule('../../routes/budget.js', () => ({ default: makeFakeRouter('budget') }));
jest.unstable_mockModule('../../routes/evm.js', () => ({ default: makeFakeRouter('evm') }));
jest.unstable_mockModule('../../routes/elite.js', () => ({ default: makeFakeRouter('elite') }));
jest.unstable_mockModule('../../routes/api-registry.js', () => ({ default: makeFakeRouter('apiRegistry') }));
jest.unstable_mockModule('../../routes/config-assist.js', () => ({ default: makeFakeRouter('configAssist') }));
jest.unstable_mockModule('../../routes/mcp-dispatch.js', () => ({ default: makeFakeRouter('mcpDispatch') }));

const apiRouter = (await import('../../routes/api.js')).default;

// Build test app
import request from 'supertest';

const app = express();
app.use('/api', apiRouter);

beforeEach(() => {
    jest.clearAllMocks();
});

// =============================================================================
// Tests
// =============================================================================

describe('routes/api.ts — main router', () => {
    it('exports a Router as default', () => {
        expect(apiRouter).toBeDefined();
        expect(typeof apiRouter).toBe('function');
    });

    const mountedRouters = [
        'health', 'resonance', 'scaffold', 'config', 'decisions',
        'database', 'partitions', 'synthesis', 'models', 'seeds',
        'context', 'chat', 'prompts', 'configTune', 'feedback',
        'breakthroughRegistry', 'knowledgeBase', 'keywords', 'activity',
        'autotune', 'budget', 'evm', 'elite', 'apiRegistry',
        'configAssist', 'mcpDispatch',
    ];

    for (const tag of mountedRouters) {
        it(`mounts ${tag} sub-router`, async () => {
            const res = await request(app).get(`/api/__test_${tag}`);
            expect(res.status).toBe(200);
            expect(res.body.router).toBe(tag);
        });
    }
});
