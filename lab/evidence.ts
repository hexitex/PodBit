/**
 * Lab Evidence Storage
 *
 * Fetches artifacts from lab servers and stores them in the lab_evidence table.
 * Small data goes inline. Large files get downloaded to data/evidence/.
 *
 * Evidence is queryable across the graph — multiple nodes can reference
 * the same measurement data (the empirical commons).
 *
 * @module lab/evidence
 */

import { query } from '../db/sqlite-backend.js';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'fs';
import { join } from 'path';
import type { Artifact, LabResultResponse, ExperimentSpec, LabRegistryEntry } from './types.js';
import { fetchArtifactZip, buildAuthHeadersFromRegistry } from './client.js';

const EVIDENCE_DIR = join(process.cwd(), 'data', 'evidence');

/** Size threshold — artifacts smaller than this go inline as base64 */
const INLINE_THRESHOLD = 64 * 1024; // 64KB

/**
 * Store experiment results and artifacts as evidence.
 *
 * @param experimentId - The lab_executions row ID
 * @param nodeId - Source node
 * @param domain - Node's domain
 * @param labResult - Raw lab result with results + artifacts
 * @param spec - The experiment spec (for labeling)
 * @param labBaseUrl - Lab server base URL for artifact fetching
 * @param authHeaders - Optional auth headers for artifact download
 */
export async function storeEvidence(
    experimentId: string | null,
    nodeId: string,
    domain: string,
    labResult: LabResultResponse,
    spec: ExperimentSpec,
    labBaseUrl: string,
    authHeaders?: Record<string, string>,
): Promise<number> {
    let stored = 0;

    // Store the lab verdict as evidence.
    //
    // `details` MUST stay a plain prose string — anything richer goes in
    // `structuredDetails` so the GUI can render it as fields rather than a wall
    // of escaped JSON. If a lab accidentally hands us a JSON-shaped string in
    // `details`, lift it into `structuredDetails` here so existing GUI consumers
    // get the structured form regardless of which lab produced it.
    let detailsField: string | undefined = labResult.details;
    let structured: Record<string, unknown> | undefined = labResult.structuredDetails;
    if (!structured && typeof detailsField === 'string') {
        const trimmed = detailsField.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try {
                const parsed = JSON.parse(detailsField);
                if (parsed && typeof parsed === 'object') {
                    structured = parsed as Record<string, unknown>;
                    // Keep a short prose summary in `details` if the structured payload
                    // exposes one — otherwise drop it (the GUI will use structured).
                    const proseHint = (parsed as any).summary
                        ?? (parsed as any).critique
                        ?? (parsed as any).rewrittenClaim;
                    detailsField = typeof proseHint === 'string' ? proseHint : undefined;
                }
            } catch { /* leave details as-is — not actually JSON */ }
        }
    }
    const verdictData = JSON.stringify({
        verdict: labResult.verdict,
        confidence: labResult.confidence,
        hypothesis: labResult.hypothesis,
        testCategory: labResult.testCategory,
        details: detailsField,
        structuredDetails: structured,
    });
    await query(
        `INSERT INTO lab_evidence (id, experiment_id, node_id, label, type, mime_type, data_inline, domain, size_bytes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [generateId(), experimentId, nodeId, 'verdict', 'json', 'application/json', verdictData, domain, verdictData.length]
    );
    stored++;

    // Fetch and store artifacts
    for (const artifact of labResult.artifacts) {
        try {
            const id = generateId();
            const url = artifact.url.startsWith('http')
                ? artifact.url
                : `${labBaseUrl.replace(/\/+$/, '')}${artifact.url}`;

            // Small artifacts or text → fetch and store inline
            // Large binary artifacts → download to disk
            if (artifact.sizeBytes && artifact.sizeBytes > INLINE_THRESHOLD) {
                const filePath = await downloadArtifact(url, id, artifact, authHeaders);
                await query(
                    `INSERT INTO lab_evidence (id, experiment_id, node_id, label, type, mime_type, data_path, domain, size_bytes)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [id, experimentId, nodeId, artifact.label, artifactCategory(artifact.type), artifact.type, filePath, domain, artifact.sizeBytes]
                );
            } else {
                const data = await fetchArtifactInline(url, artifact, authHeaders);
                await query(
                    `INSERT INTO lab_evidence (id, experiment_id, node_id, label, type, mime_type, data_inline, domain, size_bytes)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                    [id, experimentId, nodeId, artifact.label, artifactCategory(artifact.type), artifact.type, data, domain, data.length]
                );
            }
            stored++;
        } catch (err: any) {
            console.error(`[evidence] Failed to store artifact "${artifact.label}": ${err.message}`);
        }
    }

    return stored;
}

// =============================================================================
// HELPERS
// =============================================================================

async function downloadArtifact(
    url: string,
    id: string,
    artifact: Artifact,
    authHeaders?: Record<string, string>,
): Promise<string> {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

    const ext = mimeToExtension(artifact.type);
    const filename = `${id}${ext}`;
    const filePath = join(EVIDENCE_DIR, filename);

    const headers: Record<string, string> = { ...authHeaders };
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`Artifact download failed (${response.status})`);

    const buffer = Buffer.from(await response.arrayBuffer());
    writeFileSync(filePath, buffer);

    return `evidence/${filename}`;
}

async function fetchArtifactInline(
    url: string,
    artifact: Artifact,
    authHeaders?: Record<string, string>,
): Promise<string> {
    const headers: Record<string, string> = { ...authHeaders };
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) throw new Error(`Artifact fetch failed (${response.status})`);

    if (artifact.type.startsWith('text/') || artifact.type === 'application/json') {
        return await response.text();
    }

    // Binary → base64
    const buffer = Buffer.from(await response.arrayBuffer());
    return `data:${artifact.type};base64,${buffer.toString('base64')}`;
}

function artifactCategory(mimeType: string): string {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'text/csv' || mimeType === 'text/tab-separated-values') return 'csv';
    if (mimeType === 'application/json') return 'json';
    if (mimeType.startsWith('text/')) return 'text';
    return 'file';
}

function mimeToExtension(mimeType: string): string {
    const map: Record<string, string> = {
        'image/png': '.png', 'image/jpeg': '.jpg', 'image/svg+xml': '.svg',
        'text/csv': '.csv', 'application/json': '.json', 'text/plain': '.txt',
        'application/pdf': '.pdf', 'application/octet-stream': '.bin',
    };
    return map[mimeType] || '.bin';
}

function generateId(): string {
    return randomUUID();
}

// Inline the import to avoid circular deps
function randomUUID(): string {
    return crypto.randomUUID();
}

// =============================================================================
// ARTIFACT ZIP PULL + TEMP EXTRACTION
// =============================================================================

const TEMP_ARTIFACTS_DIR = join(process.cwd(), 'data', 'temp', 'artifacts');

/**
 * Pull all artifacts from a lab as a zip and store in lab_evidence.
 *
 * @returns The evidence row ID of the stored zip.
 */
export async function pullArtifactZip(
    lab: LabRegistryEntry,
    jobId: string,
    nodeId: string,
    domain: string,
    experimentId: string | null,
): Promise<string> {
    const authHeaders = buildAuthHeadersFromRegistry(lab);
    const zipBuffer = await fetchArtifactZip(lab.url, jobId, authHeaders);

    const id = randomUUID();

    // Store zip: inline if small, disk if large
    if (zipBuffer.length <= INLINE_THRESHOLD) {
        const base64 = `data:application/zip;base64,${zipBuffer.toString('base64')}`;
        await query(
            `INSERT INTO lab_evidence (id, experiment_id, node_id, label, type, mime_type, data_inline, domain, size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, experimentId, nodeId, 'artifacts_zip', 'archive', 'application/zip', base64, domain, zipBuffer.length]
        );
    } else {
        if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
        const filename = `${id}.zip`;
        const filePath = join(EVIDENCE_DIR, filename);
        writeFileSync(filePath, zipBuffer);
        await query(
            `INSERT INTO lab_evidence (id, experiment_id, node_id, label, type, mime_type, data_path, domain, size_bytes)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [id, experimentId, nodeId, 'artifacts_zip', 'archive', 'application/zip', `evidence/${filename}`, domain, zipBuffer.length]
        );
    }

    return id;
}

/**
 * Extract a stored artifact zip to a temp directory for HTTP serving.
 * Returns the temp directory path. Uses lazy extraction — if already extracted, returns cached path.
 */
export async function extractArtifactsToTemp(evidenceId: string): Promise<string> {
    const tempDir = join(TEMP_ARTIFACTS_DIR, evidenceId);

    // Already extracted — return cached
    if (existsSync(tempDir) && readdirSync(tempDir).length > 0) {
        return tempDir;
    }

    // Fetch zip data from DB
    const row = await query(
        'SELECT data_inline, data_path FROM lab_evidence WHERE id = $1',
        [evidenceId]
    ) as any[];

    if (!row || row.length === 0) throw new Error(`Evidence ${evidenceId} not found`);

    const evidence = row[0];
    let zipBuffer: Buffer;

    if (evidence.data_path) {
        const fullPath = join(process.cwd(), 'data', evidence.data_path);
        if (!existsSync(fullPath)) throw new Error(`Evidence file not found: ${evidence.data_path}`);
        zipBuffer = readFileSync(fullPath);
    } else if (evidence.data_inline) {
        const inline: string = evidence.data_inline;
        if (inline.startsWith('data:')) {
            const base64 = inline.split(',')[1];
            zipBuffer = Buffer.from(base64, 'base64');
        } else {
            zipBuffer = Buffer.from(inline, 'base64');
        }
    } else {
        throw new Error(`Evidence ${evidenceId} has no data`);
    }

    // Extract zip using Node's built-in approach (write zip, use archiver to extract)
    // We use a simple approach: write zip to temp, extract with decompress
    mkdirSync(tempDir, { recursive: true });

    try {
        // Use yauzl-promise or similar for extraction — but since we may not have it,
        // use a simple approach: write zip file then use node-stream-zip
        const { default: StreamZip } = await import('node-stream-zip');
        const zipPath = join(tempDir, '__archive.zip');
        writeFileSync(zipPath, zipBuffer);

        const zip = new StreamZip.async({ file: zipPath });
        await zip.extract(null, tempDir);
        await zip.close();

        // Remove the temp zip file
        try { unlinkSync(zipPath); } catch { /* non-fatal */ }
    } catch {
        // Fallback: just store the raw zip — the GUI can download it directly
        writeFileSync(join(tempDir, 'artifacts.zip'), zipBuffer);
    }

    return tempDir;
}

/**
 * List files in an extracted temp artifact directory.
 */
export function listTempArtifacts(tempDir: string): Array<{ filename: string; size: number; type: string }> {
    if (!existsSync(tempDir)) return [];

    const results: Array<{ filename: string; size: number; type: string }> = [];
    const mimeMap: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
        '.csv': 'text/csv', '.json': 'application/json', '.txt': 'text/plain',
        '.py': 'text/x-python', '.log': 'text/plain', '.pdf': 'application/pdf',
        '.zip': 'application/zip',
    };

    const scanDir = (dir: string, prefix: string) => {
        for (const entry of readdirSync(dir)) {
            const fullPath = join(dir, entry);
            const relPath = prefix ? `${prefix}/${entry}` : entry;
            const stat = statSync(fullPath);
            if (stat.isDirectory()) {
                scanDir(fullPath, relPath);
            } else if (stat.isFile()) {
                const ext = entry.substring(entry.lastIndexOf('.')).toLowerCase();
                results.push({
                    filename: relPath,
                    size: stat.size,
                    type: mimeMap[ext] || 'application/octet-stream',
                });
            }
        }
    };

    scanDir(tempDir, '');
    return results;
}

/**
 * Clean up old temp artifact directories.
 */
export function cleanupTempArtifacts(maxAgeMs: number = 3600_000): number {
    if (!existsSync(TEMP_ARTIFACTS_DIR)) return 0;

    let cleaned = 0;
    const now = Date.now();

    for (const entry of readdirSync(TEMP_ARTIFACTS_DIR)) {
        const dir = join(TEMP_ARTIFACTS_DIR, entry);
        try {
            const stat = statSync(dir);
            if (stat.isDirectory() && (now - stat.mtimeMs) > maxAgeMs) {
                rmRecursive(dir);
                cleaned++;
            }
        } catch { /* non-fatal */ }
    }

    return cleaned;
}

function rmRecursive(dir: string): void {
    for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry);
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
            rmRecursive(fullPath);
        } else {
            unlinkSync(fullPath);
        }
    }
    rmdirSync(dir);
}
