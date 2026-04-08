/**
 * Unit tests for kb/readers/image-reader.ts — image file reader with LLM description.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockReadFileSync = jest.fn<(...args: any[]) => any>().mockReturnValue(Buffer.from(''));

jest.unstable_mockModule('fs', () => ({
    default: {
        readFileSync: mockReadFileSync,
    },
    readFileSync: mockReadFileSync,
}));

// Mock sharp
const mockToBuffer = jest.fn<() => Promise<Buffer>>().mockResolvedValue(Buffer.from('normalized'));
const mockJpeg = jest.fn<() => any>().mockReturnValue({ toBuffer: mockToBuffer });
const mockWebp = jest.fn<() => any>().mockReturnValue({ toBuffer: mockToBuffer });
const mockPng = jest.fn<() => any>().mockReturnValue({ toBuffer: mockToBuffer });
const mockResize = jest.fn<() => void>();
const mockMetadata = jest.fn<() => Promise<any>>().mockResolvedValue({ width: 800, height: 600 });

const mockSharpInstance = {
    metadata: mockMetadata,
    resize: mockResize,
    jpeg: mockJpeg,
    webp: mockWebp,
    png: mockPng,
};

const mockSharpFn = jest.fn<(...args: any[]) => any>().mockReturnValue(mockSharpInstance);

jest.unstable_mockModule('sharp', () => ({
    default: mockSharpFn,
}));

// Mock db
const mockSystemQueryOne = jest.fn<() => Promise<any>>().mockResolvedValue(null);

jest.unstable_mockModule('../../db.js', () => ({
    systemQueryOne: mockSystemQueryOne,
}));

// Mock models
const mockCallSubsystemModel = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('A photo of a cat');

jest.unstable_mockModule('../../models.js', () => ({
    callSubsystemModel: mockCallSubsystemModel,
}));

// Mock prompts
const mockGetPrompt = jest.fn<(...args: any[]) => Promise<string>>().mockResolvedValue('Describe this image');

jest.unstable_mockModule('../../prompts.js', () => ({
    getPrompt: mockGetPrompt,
}));

// Mock engine-config
jest.unstable_mockModule('../../core/engine-config.js', () => ({
    appConfig: {
        knowledgeBase: {
            curationMaxTokens: 2000,
        },
    },
}));

// Mock config.js — the image reader dynamically imports config to read curationMaxTokens.
// Without this mock, the real config/defaults.ts calls fs.readFileSync('package.json')
// which hits the fs mock above and returns Buffer.from('fake-image-data') instead of JSON.
jest.unstable_mockModule('../../config.js', () => ({
    config: {
        knowledgeBase: {
            curationMaxTokens: 2000,
        },
    },
}));

const { imageReader } = await import('../../kb/readers/image-reader.js');

beforeEach(() => {
    jest.resetAllMocks();
    mockReadFileSync.mockReturnValue(Buffer.from('fake-image-data'));
    mockMetadata.mockResolvedValue({ width: 800, height: 600 });
    mockSharpFn.mockReturnValue(mockSharpInstance);
    mockToBuffer.mockResolvedValue(Buffer.from('normalized'));
    mockJpeg.mockReturnValue({ toBuffer: mockToBuffer });
    mockWebp.mockReturnValue({ toBuffer: mockToBuffer });
    mockPng.mockReturnValue({ toBuffer: mockToBuffer });
    mockSystemQueryOne.mockResolvedValue(null);
    mockCallSubsystemModel.mockResolvedValue('A photo of a cat');
    mockGetPrompt.mockResolvedValue('Describe this image');
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

describe('imageReader metadata', () => {
    it('has correct id, name, and subsystem', () => {
        expect(imageReader.id).toBe('image');
        expect(imageReader.name).toBe('Image Describer');
        expect(imageReader.subsystem).toBe('reader_image');
    });

    it('requires an LLM', () => {
        expect(imageReader.requiresLLM).toBe(true);
    });

    it('supports common image extensions', () => {
        expect(imageReader.extensions).toContain('png');
        expect(imageReader.extensions).toContain('jpg');
        expect(imageReader.extensions).toContain('jpeg');
        expect(imageReader.extensions).toContain('gif');
        expect(imageReader.extensions).toContain('webp');
        expect(imageReader.extensions).toContain('svg');
    });

    it('has mimeTypes array', () => {
        expect(Array.isArray(imageReader.mimeTypes)).toBe(true);
        expect(imageReader.mimeTypes.length).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// read() — SVG files (text-based, no LLM needed)
// ---------------------------------------------------------------------------

describe('imageReader.read (SVG)', () => {
    it('reads SVG as text without calling LLM', async () => {
        const svgContent = '<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>';
        mockReadFileSync.mockReturnValue(svgContent);

        const result = await imageReader.read('/test/icon.svg');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].label).toBe('SVG content');
        expect(result.chunks[0].content).toContain('<svg');
        expect(result.chunks[0].metadata.format).toBe('svg');
        expect(result.metadata.encoding).toBe('utf-8');

        // Should NOT call the LLM
        expect(mockCallSubsystemModel).not.toHaveBeenCalled();
    });

    it('respects maxChunkSize for SVG', async () => {
        const svgContent = '<svg>' + 'x'.repeat(5000) + '</svg>';
        mockReadFileSync.mockReturnValue(svgContent);

        const result = await imageReader.read('/test/big.svg', { maxChunkSize: 100 });
        expect(result.chunks[0].content.length).toBeLessThanOrEqual(100);
    });
});

// ---------------------------------------------------------------------------
// read() — raster images (requires LLM)
// ---------------------------------------------------------------------------

describe('imageReader.read (raster)', () => {
    it('calls LLM and returns description as chunk content', async () => {
        mockCallSubsystemModel.mockResolvedValue('A photograph showing a sunset over mountains');

        const result = await imageReader.read('/test/photo.jpg');
        expect(result.chunks.length).toBe(1);
        expect(result.chunks[0].content).toBe('A photograph showing a sunset over mountains');
        expect(result.chunks[0].type).toBe('full');
        expect(result.chunks[0].label).toContain('photo.jpg');
        expect(result.chunks[0].metadata.format).toBe('jpg');
        expect(result.metadata.encoding).toBe('base64');
    });

    it('normalizes image via sharp before sending to LLM', async () => {
        await imageReader.read('/test/photo.png');
        expect(mockSharpFn).toHaveBeenCalled();
        expect(mockJpeg).toHaveBeenCalled(); // default format is jpeg
    });

    it('resizes image when dimensions exceed maxDimension', async () => {
        mockMetadata.mockResolvedValue({ width: 4000, height: 3000 });

        await imageReader.read('/test/big.png');
        expect(mockResize).toHaveBeenCalled();
    });

    it('does not resize when dimensions are within maxDimension', async () => {
        mockMetadata.mockResolvedValue({ width: 500, height: 400 });

        await imageReader.read('/test/small.png');
        expect(mockResize).not.toHaveBeenCalled();
    });

    it('sends base64-encoded image data to LLM', async () => {
        mockToBuffer.mockResolvedValue(Buffer.from('test-image'));

        await imageReader.read('/test/photo.jpg');
        expect(mockCallSubsystemModel).toHaveBeenCalledWith(
            'reader_image',
            expect.any(String),
            expect.objectContaining({
                images: expect.arrayContaining([
                    expect.objectContaining({
                        type: 'base64',
                        data: expect.any(String),
                    }),
                ]),
            }),
        );
    });

    it('uses kb.curate_image prompt with domain and filename', async () => {
        await imageReader.read('/test/photo.jpg', { domain: 'my-domain' });
        expect(mockGetPrompt).toHaveBeenCalledWith('kb.curate_image', {
            domain: 'my-domain',
            fileName: 'photo.jpg',
        });
    });

    it('records original and normalized sizes in metadata', async () => {
        const originalBuf = Buffer.from('a'.repeat(10000));
        mockReadFileSync.mockReturnValue(originalBuf);
        mockToBuffer.mockResolvedValue(Buffer.from('small'));

        const result = await imageReader.read('/test/photo.png');
        expect(result.chunks[0].metadata.originalSize).toBe(10000);
        expect(result.chunks[0].metadata.normalizedSize).toBe(5); // 'small'.length
    });

    it('throws when LLM call fails', async () => {
        mockCallSubsystemModel.mockRejectedValue(new Error('Model timeout'));

        await expect(imageReader.read('/test/photo.jpg')).rejects.toThrow('Vision model failed');
    });

    it('throws with image format error when both normalization and LLM fail', async () => {
        // Simulate normalization failure (sharp throws) by making sharp return
        // a failed normalization result
        mockSharpFn.mockImplementation(() => {
            throw new Error('Unsupported format');
        });
        mockCallSubsystemModel.mockRejectedValue(new Error('LLM failed'));

        await expect(imageReader.read('/test/photo.bmp')).rejects.toThrow('Image format not supported');
    });

    it('reads settings from DB when available', async () => {
        mockSystemQueryOne.mockResolvedValue({
            value: JSON.stringify({ maxDimension: 512, quality: 60, format: 'webp' }),
        });

        await imageReader.read('/test/photo.jpg');
        // Should use webp format from settings
        expect(mockWebp).toHaveBeenCalled();
    });

    it('uses defaults when DB settings are unavailable', async () => {
        mockSystemQueryOne.mockRejectedValue(new Error('DB not ready'));

        const result = await imageReader.read('/test/photo.jpg');
        // Should still succeed with defaults
        expect(result.chunks.length).toBe(1);
        expect(mockJpeg).toHaveBeenCalled(); // default format
    });

    it('handles non-string LLM response by stringifying', async () => {
        mockCallSubsystemModel.mockResolvedValue({ text: 'description' } as any);

        const result = await imageReader.read('/test/photo.jpg');
        expect(result.chunks[0].content).toContain('description');
    });
});
