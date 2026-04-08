/**
 * KNOWLEDGE BASE - IMAGE READER
 *
 * Describes images using a multimodal LLM assigned to the reader_image subsystem.
 * Normalizes images (resize + compress) before sending to reduce token cost.
 * REQUIRES a vision-capable model assigned to the 'reader_image' subsystem.
 */

import fs from 'fs';
import path from 'path';
import type { ReaderPlugin, ReaderResult, ReaderOptions } from './types.js';

const MIME_MAP: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    svg: 'image/svg+xml',
};

/** Output format → MIME type for normalized images */
const FORMAT_MIME: Record<string, string> = {
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    png: 'image/png',
};

/**
 * Normalize an image: resize to max dimension and compress.
 * Falls back to the original buffer if sharp is not installed or fails.
 * Attempts lenient decode on first failure (helps with truncated/unusual images).
 *
 * @param buffer - Raw image file buffer
 * @param opts - Normalization options (maxDimension, quality, format)
 * @param opts.maxDimension - Maximum width or height in pixels
 * @param opts.quality - JPEG/WebP quality (1-100)
 * @param opts.format - Output format ('jpeg', 'webp', or 'png')
 * @param originalMimeType - MIME type of the original image (used as fallback)
 * @returns Object with normalized buffer, mimeType, and optional `failed` error message
 */
async function normalizeImage(
    buffer: Buffer,
    opts: { maxDimension: number; quality: number; format: 'jpeg' | 'webp' | 'png' },
    originalMimeType?: string,
): Promise<{ buffer: Buffer; mimeType: string; failed?: string }> {
    try {
        const sharp = (await import('sharp')).default;

        // First attempt: normal decode
        let image = sharp(buffer);
        let metadata;
        try {
            metadata = await image.metadata();
        } catch (firstErr: any) {
            // Second attempt: lenient decode (helps with truncated/unusual images)
            console.warn(`[kb-image] Standard decode failed (${firstErr.message}), trying lenient mode...`);
            image = sharp(buffer, { failOn: 'none' } as any);
            metadata = await image.metadata();
        }

        const width = metadata.width || 0;
        const height = metadata.height || 0;
        const maxDim = Math.max(width, height);

        // Only resize if exceeds max dimension
        if (maxDim > opts.maxDimension) {
            image.resize({
                width: width >= height ? opts.maxDimension : undefined,
                height: height > width ? opts.maxDimension : undefined,
                fit: 'inside',
                withoutEnlargement: true,
            });
        }

        // Convert and compress
        let output: Buffer;
        if (opts.format === 'jpeg') {
            output = await image.jpeg({ quality: opts.quality }).toBuffer();
        } else if (opts.format === 'webp') {
            output = await image.webp({ quality: opts.quality }).toBuffer();
        } else {
            output = await image.png({ compressionLevel: 6 }).toBuffer();
        }

        const mimeType = FORMAT_MIME[opts.format] || 'image/jpeg';
        const savings = ((1 - output.length / buffer.length) * 100).toFixed(0);
        console.log(`[kb-image] Normalized: ${width}x${height} → ${opts.maxDimension}px max, ${(buffer.length / 1024).toFixed(0)}KB → ${(output.length / 1024).toFixed(0)}KB (${savings}% smaller)`);

        return { buffer: output, mimeType };
    } catch (err: any) {
        console.warn(`[kb-image] Normalization failed: ${err.message}`);
        // Return original buffer but flag the failure — if the LLM also rejects it,
        // the caller can report the actual decoding error instead of a cryptic LLM error
        return { buffer, mimeType: originalMimeType || 'image/png', failed: err.message };
    }
}

/**
 * Image reader that generates text descriptions via a multimodal LLM.
 *
 * Raster images (PNG, JPEG, GIF, WebP, BMP, TIFF) are normalized using `sharp`
 * (resize to max dimension + compress) before being sent as base64 to the
 * vision-capable model assigned to the `reader_image` subsystem. SVG files are
 * read as plain text without LLM involvement.
 *
 * This is the **only reader that requires an LLM** -- all other readers are
 * pure text extraction. Requires a vision model assigned to `reader_image`.
 */
export const imageReader: ReaderPlugin = {
    id: 'image',
    name: 'Image Describer',
    subsystem: 'reader_image',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'svg'],
    mimeTypes: Object.values(MIME_MAP),
    requiresLLM: true,

    async read(filePath: string, options?: ReaderOptions): Promise<ReaderResult> {
        const ext = path.extname(filePath).replace(/^\./, '').toLowerCase();
        const mimeType = MIME_MAP[ext] || 'image/png';

        // SVG files can be read as text directly
        if (ext === 'svg') {
            const svgContent = fs.readFileSync(filePath, 'utf-8');
            return {
                chunks: [{
                    index: 0,
                    type: 'full',
                    label: 'SVG content',
                    content: svgContent.slice(0, options?.maxChunkSize || 4000),
                    metadata: { format: 'svg', mimeType },
                }],
                metadata: { encoding: 'utf-8' },
            };
        }

        // Read file and normalize using DB-stored settings
        const rawBuffer = fs.readFileSync(filePath);

        const imgSettings = { maxDimension: 1024, quality: 80, format: 'jpeg' as 'jpeg' | 'webp' | 'png' };
        try {
            const { systemQueryOne: queryOne } = await import('../../db.js');
            const row: any = await queryOne(`SELECT value FROM settings WHERE key = 'reader_image.config'`);
            if (row?.value) {
                const saved = JSON.parse(row.value);
                if (saved.maxDimension) imgSettings.maxDimension = saved.maxDimension;
                if (saved.quality) imgSettings.quality = saved.quality;
                if (saved.format) imgSettings.format = saved.format;
            }
        } catch {
            // Use defaults if settings table not available
        }

        const normalized = await normalizeImage(rawBuffer, imgSettings, mimeType);

        const base64 = normalized.buffer.toString('base64');

        // Call the LLM to describe the image
        let description: string;
        try {
            const { callSubsystemModel } = await import('../../models.js');
            const { getPrompt } = await import('../../prompts.js');
            const prompt = await getPrompt('kb.curate_image', {
                domain: options?.domain || '',
                fileName: path.basename(filePath),
            });

            const { config: appConfig } = await import('../../config.js');
            const imgTokens = appConfig.knowledgeBase?.curationMaxTokens || 0;
            const response = await callSubsystemModel('reader_image', prompt, {
                images: [{ type: 'base64', media_type: normalized.mimeType, data: base64 }],
                ...(imgTokens > 0 ? { maxTokens: imgTokens } : {}),
            });

            description = typeof response === 'string' ? response : JSON.stringify(response);
        } catch (err: any) {
            // If normalization also failed, the image format is incompatible with both
            // sharp and the vision model — throw so the pipeline marks it as error
            if (normalized.failed) {
                throw new Error(`Image format not supported: ${normalized.failed}`);
            }
            // LLM call failed for other reasons (model error, timeout, etc.)
            throw new Error(`Vision model failed: ${err.message}`);
        }

        return {
            chunks: [{
                index: 0,
                type: 'full',
                label: `Image: ${path.basename(filePath)}`,
                content: description,
                metadata: {
                    format: ext,
                    mimeType: normalized.mimeType,
                    originalSize: rawBuffer.length,
                    normalizedSize: normalized.buffer.length,
                },
            }],
            metadata: { encoding: 'base64' },
        };
    },
};
