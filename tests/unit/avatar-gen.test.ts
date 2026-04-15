/**
 * Unit tests for core/avatar-gen.ts — generateAvatar.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockQuery = jest.fn<() => Promise<any[]>>().mockResolvedValue([]);
const mockEmitActivity = jest.fn<() => void>();
const mockCreateAvatar = jest.fn<() => any>();

const mockAppConfig = {
    avatars: { enabled: true, style: 'rings' },
};

// Mock @dicebear/core and @dicebear/collection
const mockToString = jest.fn<() => string>().mockReturnValue('<svg>test</svg>');
mockCreateAvatar.mockReturnValue({ toString: mockToString });

jest.unstable_mockModule('../../db.js', () => ({ query: mockQuery }));
jest.unstable_mockModule('../../config.js', () => ({ config: mockAppConfig }));
jest.unstable_mockModule('../../services/event-bus.js', () => ({ nodeLabel: (id, c) => c ? `${id.slice(0,8)} "${c.slice(0,30)}"` : id.slice(0,8), emitActivity: mockEmitActivity }));
jest.unstable_mockModule('@dicebear/core', () => ({ createAvatar: mockCreateAvatar }));
jest.unstable_mockModule('@dicebear/collection', () => ({
    rings: { id: 'rings' },
    thumbs: { id: 'thumbs' },
    lorelei: { id: 'lorelei' },
}));

const { generateAvatar } = await import('../../core/avatar-gen.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockQuery.mockResolvedValue([]);
    mockEmitActivity.mockReturnValue(undefined);
    mockToString.mockReturnValue('<svg>test</svg>');
    mockCreateAvatar.mockReturnValue({ toString: mockToString });
    mockAppConfig.avatars.enabled = true;
    mockAppConfig.avatars.style = 'rings';
});

// =============================================================================
// generateAvatar
// =============================================================================

describe('generateAvatar', () => {
    it('returns null when avatars are disabled', async () => {
        mockAppConfig.avatars.enabled = false;
        const result = await generateAvatar('node-1', 'content', 'seed', 'science');
        expect(result).toBeNull();
        expect(mockQuery).not.toHaveBeenCalled();
        expect(mockCreateAvatar).not.toHaveBeenCalled();
    });

    it('returns a data URI starting with data:image/svg+xml;base64,', async () => {
        const result = await generateAvatar('node-1', 'content', 'seed', 'science');
        expect(result).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('generates avatar using nodeId as seed', async () => {
        await generateAvatar('node-abc', 'content', 'seed', 'science');
        expect(mockCreateAvatar).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ seed: 'node-abc' }),
        );
    });

    it('uses configured style from appConfig.avatars.style', async () => {
        mockAppConfig.avatars.style = 'rings';
        await generateAvatar('node-1', 'content', 'seed', 'science');
        // The style passed to createAvatar should be the rings style object
        const styleArg = mockCreateAvatar.mock.calls[0][0];
        expect(styleArg).toEqual({ id: 'rings' });
    });

    it('falls back to rings style when configured style does not exist', async () => {
        mockAppConfig.avatars.style = 'nonexistent-style';
        await generateAvatar('node-1', 'content', 'seed', 'science');
        const styleArg = mockCreateAvatar.mock.calls[0][0];
        expect(styleArg).toEqual({ id: 'rings' }); // fallback
    });

    it('stores avatar URL in DB via UPDATE nodes', async () => {
        await generateAvatar('node-xyz', 'content', 'seed', 'science');

        const [sql, params] = mockQuery.mock.calls[0] as any[];
        expect(String(sql)).toContain('UPDATE nodes SET avatar_url');
        expect(params[1]).toBe('node-xyz');
        expect(params[0]).toMatch(/^data:image\/svg\+xml;base64,/);
    });

    it('emits avatar_set activity event', async () => {
        await generateAvatar('node-abc12345', 'content', 'seed', 'math');

        expect(mockEmitActivity).toHaveBeenCalledWith(
            'lifecycle',
            'avatar_set',
            expect.stringContaining('node-abc'),
            expect.objectContaining({ nodeId: 'node-abc12345', domain: 'math' }),
        );
    });

    it('returns the generated data URI', async () => {
        mockToString.mockReturnValue('<svg>custom</svg>');
        const result = await generateAvatar('node-1', 'content', 'seed', 'science');
        expect(typeof result).toBe('string');
        // Base64 of '<svg>custom</svg>' should be in the result
        const expected = Buffer.from('<svg>custom</svg>').toString('base64');
        expect(result).toContain(expected);
    });
});
