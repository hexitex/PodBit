/**
 * KNOWLEDGE BASE - FILE PROCESSING
 *
 * Core file processing logic: reads files via reader plugins, optionally
 * curates content with an LLM, creates graph nodes and edges, and records
 * chunk metadata. Also handles output cleaning, low-value detection,
 * node archival, and post-ingestion summary generation.
 */

import path from 'path';
import { config } from '../../config.js';
import { query as dbQuery } from '../../db.js';
import { getReaderForExtension } from '../readers/registry.js';
import { getPrompt } from '../../prompts.js';
import { emitActivity } from '../../services/event-bus.js';
import {
    queue,
    stopRequested,
    completedCount, setCompletedCount,
    failedCount, setFailedCount,
    skippedCount, setSkippedCount,
} from './queue.js';
import type { ProcessingJob } from '../types.js';

// =============================================================================
// CURATION PROMPT MAPPING
// =============================================================================

/** Maps reader ID to curation prompt ID (used for non-decomposition readers) */
const CURATION_PROMPTS: Record<string, string> = {
    code: 'kb.curate_code',
    sheet: 'kb.curate_data',
    // image reader already curates content during read — no post-curation needed
};

/**
 * Readers that use the two-stage decomposition pipeline instead of simple curation.
 * Stage 1 decomposes each section into atomic classified claims.
 * Stage 2 filters and formats claims for graph ingestion with weight assignment.
 * This produces much higher quality nodes from research papers and documents
 * than the old "extract principles in 1-3 sentences" approach.
 */
const DECOMPOSITION_READERS = new Set(['pdf', 'doc', 'text']);

// =============================================================================
// OUTPUT CLEANING
// =============================================================================

/**
 * Strip structured formatting from LLM curation output.
 * Small models often produce markdown, JSON, or key-value pairs despite prose instructions.
 * This converts structured output into plain text sentences by stripping code fences,
 * extracting JSON string values, removing markdown headers/bold/italic/lists/key-value
 * patterns, and collapsing whitespace.
 *
 * @param text - Raw LLM curation output
 * @returns Cleaned plain-text string
 */
export function cleanCurationOutput(text: string): string {
    // Strip code fences
    text = text.replace(/^```(?:\w*)\n?/gm, '').replace(/\n?```$/gm, '');

    // If the output looks like JSON, try to extract just the string values
    if (text.trimStart().startsWith('{') || text.trimStart().startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            // Extract all string values recursively
            const strings: string[] = [];
            const extract = (obj: any) => {
                if (typeof obj === 'string' && obj.length > 10) strings.push(obj);
                else if (Array.isArray(obj)) obj.forEach(extract);
                else if (obj && typeof obj === 'object') Object.values(obj).forEach(extract);
            };
            extract(parsed);
            if (strings.length > 0) {
                text = strings.join('. ');
            }
        } catch {
            // Not valid JSON — continue with text cleanup
        }
    }

    // Strip markdown headers (# ## ### etc)
    text = text.replace(/^#{1,6}\s+/gm, '');

    // Strip bold/italic markers
    text = text.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
    text = text.replace(/_{1,3}([^_]+)_{1,3}/g, '$1');

    // Convert bullet/list lines into sentences (- item, * item, 1. item)
    text = text.replace(/^\s*[-*•]\s+/gm, '');
    text = text.replace(/^\s*\d+\.\s+/gm, '');

    // Strip key-value patterns like "Type: value" or "**Key:** value" at line start
    // but preserve colons mid-sentence (e.g. "including: 2k textures" is fine)
    text = text.replace(/^\s*\*{0,2}[\w\s]{1,30}\*{0,2}:\s*/gm, '');

    // Collapse multiple newlines into single space (make it flow as prose)
    text = text.replace(/\n{2,}/g, ' ').replace(/\n/g, ' ');

    // Collapse multiple spaces
    text = text.replace(/\s{2,}/g, ' ');

    return text.trim();
}

/**
 * Detect low-value LLM curation output that should not become graph nodes.
 * Catches two failure modes:
 * 1. LLM refusals -- model says "I'm sorry" / "I can't" instead of curating
 * 2. Zero-value preamble -- model says "only contains imports" / "does not define any"
 *
 * Short texts (under 200 chars) with these patterns are filtered; longer texts
 * that merely mention these phrases are allowed through.
 *
 * @param text - Cleaned curation output to evaluate
 * @returns `true` if the curation should be discarded
 */
export function isLowValueCuration(text: string): boolean {
    const lower = text.toLowerCase();

    // NO_KNOWLEDGE signal — the curation prompt determined no synthesizable content exists
    if (lower.startsWith('no_knowledge') || lower === 'no knowledge') {
        return true;
    }

    // LLM refusal patterns (model failed to process the chunk)
    if (/^i'?m sorry\b/i.test(text) || /^i cannot\b/i.test(text) || /^i can'?t\b/i.test(text)) {
        return true;
    }
    if (lower.includes("i'm sorry") && (lower.includes("can't") || lower.includes('cannot') || lower.includes('not provided'))) {
        return true;
    }

    // Zero-value "only imports" patterns (chunk has no meaningful code)
    if (lower.includes('does not define any') || lower.includes('does not declare any')) {
        // Only filter if the chunk genuinely says nothing else useful
        // Check it's not a longer description that happens to mention this
        if (text.length < 200) return true;
    }
    if (/only (?:contains?|has|imports?) (?:import|require) statements?\b/i.test(text) && text.length < 200) {
        return true;
    }

    return false;
}

// =============================================================================
// JSON PARSING
// =============================================================================

/**
 * Robustly extract a JSON array from an LLM response.
 * Handles common LLM output quirks: code fences, preamble text before the JSON,
 * trailing commas, and markdown formatting around the JSON block.
 *
 * @param text - Raw LLM output that should contain a JSON array
 * @returns Parsed array, or null if extraction fails
 */
export function parseJsonFromLLM(text: string): any[] | null {
    if (!text || typeof text !== 'string') return null;

    let cleaned = text.trim();

    // Strip code fences (```json ... ``` or ``` ... ```)
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```\s*$/i, '');
    cleaned = cleaned.trim();

    // If there's preamble text before the JSON array, find the first '['
    const firstBracket = cleaned.indexOf('[');
    if (firstBracket > 0) {
        cleaned = cleaned.slice(firstBracket);
    }

    // Find the matching closing bracket
    const lastBracket = cleaned.lastIndexOf(']');
    if (lastBracket > 0) {
        cleaned = cleaned.slice(0, lastBracket + 1);
    }

    // Try parsing as-is
    try {
        const parsed = JSON.parse(cleaned);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        // Try fixing trailing commas (common LLM mistake)
        try {
            const fixed = cleaned.replace(/,\s*([\]}])/g, '$1');
            const parsed = JSON.parse(fixed);
            return Array.isArray(parsed) ? parsed : null;
        } catch {
            return null;
        }
    }
}

// =============================================================================
// TWO-STAGE DECOMPOSITION PIPELINE
// =============================================================================

/**
 * Extracted claim from Stage 1 decomposition, reindexed globally across all chunks.
 */
interface DecomposedClaim {
    index: number;
    originalIndex: number;
    claim: string;
    type: string;
    evidence_strength?: string;
    source_location: string;
    depends_on: number[];
    confidence_signals: string[];
}

/**
 * Ingestion decision from Stage 2 filtering.
 */
interface IngestionDecision {
    index: number;
    action: 'seed' | 'context' | 'hypothesis' | 'discard';
    weight?: number;
    discard_reason?: string;
    ingestion_content?: string;
    claim_type?: string;
    evidence_strength?: string;
    source_location?: string;
    confidence_signals?: string[];
    depends_on?: number[];
}

/**
 * Process a document through the two-stage decomposition pipeline.
 *
 * **Stage 1** runs per chunk: decomposes each section into atomic classified claims
 * (EMPIRICAL, RESTATEMENT, METHODOLOGICAL, SPECULATIVE, DEFINITIONAL).
 *
 * **Stage 2** runs once per file on combined Stage 1 output: filters claims
 * (aggressive discard of noise), assigns weights and actions (seed/context/hypothesis),
 * and formats content for graph ingestion.
 *
 * This replaces the old "extract principles in 1-3 sentences" curation for document
 * readers (pdf, doc, text), producing higher-quality, more specific nodes that preserve
 * quantitative results, evidence classifications, and provenance metadata.
 *
 * @returns Created node count, first node ID, and all node IDs for edge linking
 */
async function processWithDecomposition(
    job: ProcessingJob,
    reader: { id: string; subsystem: string },
    chunks: Array<{ index: number; content: string; label?: string; type?: string; metadata?: any }>,
    createNode: Function,
    createEdge: Function,
    callSubsystemModel: Function,
    getPromptFn: Function,
): Promise<{ chunkCount: number; firstNodeId: string | null; chunkNodeIds: string[] }> {
    const { fileId, filePath, domain, extension } = job;
    const fileName = path.basename(filePath);
    const minChunkLength = config.knowledgeBase?.minChunkLength || 50;

    // =========================================================================
    // STAGE 1: Decompose each chunk into classified claims
    // =========================================================================

    const allClaims: DecomposedClaim[] = [];
    let globalIndex = 1;

    for (const chunk of chunks) {
        if (stopRequested) break;
        if (!chunk.content || chunk.content.trim().length < minChunkLength) continue;

        const vars: Record<string, string> = {
            content: chunk.content,
            label: chunk.label || `chunk-${chunk.index}`,
            domain: domain || '',
            filePath: fileName,
        };

        let response: string;
        try {
            const prompt = await getPromptFn('kb.decompose_claims', vars);
            const curationTokens = config.knowledgeBase?.curationMaxTokens || 0;
            response = await callSubsystemModel(reader.subsystem, prompt, {
                temperature: 0.3,
                ...(curationTokens > 0 ? { maxTokens: curationTokens } : {}),
            });
        } catch (err: any) {
            console.error(`[kb-decompose] Stage 1 failed for ${fileName}:${chunk.label}: ${err.message}`);
            continue;
        }

        const rawResponse = typeof response === 'string' ? response.trim() : String(response).trim();

        // Empty section — no claims
        if (rawResponse === '[]') continue;

        const claims = parseJsonFromLLM(rawResponse);
        if (!claims || claims.length === 0) {
            console.warn(`[kb-decompose] Stage 1 returned no parseable claims for ${fileName}:${chunk.label}`);
            continue;
        }

        // Reindex claims globally across all chunks and track original indices
        const baseIndex = globalIndex;
        for (const claim of claims) {
            const reindexed: DecomposedClaim = {
                index: globalIndex,
                originalIndex: claim.index ?? 0,
                claim: claim.claim || '',
                type: claim.type || 'METHODOLOGICAL',
                evidence_strength: claim.evidence_strength,
                source_location: claim.source_location || vars.label,
                depends_on: [],
                confidence_signals: claim.confidence_signals || [],
            };

            // Remap depends_on from chunk-local to global indices
            if (Array.isArray(claim.depends_on)) {
                reindexed.depends_on = claim.depends_on
                    .map((localIdx: number) => {
                        // Convert chunk-local index to global index
                        const offset = localIdx - (claim.index - (globalIndex - baseIndex));
                        return baseIndex + (localIdx - 1);
                    })
                    .filter((idx: number) => idx >= baseIndex && idx < globalIndex + 1);
            }

            allClaims.push(reindexed);
            globalIndex++;
        }
    }

    if (allClaims.length === 0) {
        console.log(`[kb-decompose] ${fileName}: Stage 1 extracted 0 claims — nothing to filter`);
        return { chunkCount: 0, firstNodeId: null, chunkNodeIds: [] };
    }

    // Cap claims sent to Stage 2 — LLMs degrade badly when asked to filter 100+ items.
    // Keep EMPIRICAL claims (the paper's actual results) and trim the rest.
    const maxClaimsForFilter = config.knowledgeBase?.maxClaimsPerFile || 40;
    if (allClaims.length > maxClaimsForFilter) {
        const before = allClaims.length;
        // Prioritize: EMPIRICAL first, then METHODOLOGICAL, then others
        const priority: Record<string, number> = { EMPIRICAL: 3, METHODOLOGICAL: 2, SPECULATIVE: 1, RESTATEMENT: 0, DEFINITIONAL: 0 };
        allClaims.sort((a, b) => (priority[b.type] ?? 0) - (priority[a.type] ?? 0));
        allClaims.length = maxClaimsForFilter;
        console.warn(`[kb-decompose] ${fileName}: Capped Stage 1 claims ${before} → ${maxClaimsForFilter} (kept EMPIRICAL/METHODOLOGICAL first)`);
    }

    console.log(`[kb-decompose] ${fileName}: Stage 1 extracted ${allClaims.length} claims across ${chunks.length} sections`);

    // =========================================================================
    // STAGE 2: Filter and format for ingestion
    // =========================================================================

    // Fetch existing domain nodes for dedup context (up to 20)
    let existingNodesBlock = '';
    if (domain) {
        try {
            const existing = await dbQuery(
                `SELECT content FROM nodes WHERE domain = $1 AND archived = 0 AND node_type NOT IN ('raw', 'question')
                 ORDER BY weight DESC LIMIT 20`,
                [domain]
            );
            if (existing.length > 0) {
                const summaries = existing
                    .map((n: any, i: number) => `${i + 1}. ${(n.content as string).slice(0, 150)}`)
                    .join('\n');
                existingNodesBlock =
                    `The graph already contains these nodes in the "${domain}" domain. ` +
                    `Use this to identify restatements that duplicate existing knowledge:\n${summaries}`;
            }
        } catch {
            // Non-fatal — proceed without existing nodes context
        }
    }

    // Extract paper metadata from filename (best-effort)
    const stem = path.basename(filePath, path.extname(filePath));
    const paperTitle = stem.replace(/[-_]/g, ' ');

    const filterVars: Record<string, string> = {
        paperTitle,
        paperAuthors: 'unknown',
        paperYear: 'unknown',
        filePath: fileName,
        domain: domain || '',
        existingNodesBlock,
        claims: JSON.stringify(allClaims, null, 2),
    };

    let filterResponse: string;
    try {
        const filterPrompt = await getPromptFn('kb.filter_claims', filterVars);
        const filterTokens = config.knowledgeBase?.curationMaxTokens || 0;
        filterResponse = await callSubsystemModel(reader.subsystem, filterPrompt, {
            temperature: 0.3,
            ...(filterTokens > 0 ? { maxTokens: filterTokens } : {}),
        });
    } catch (err: any) {
        console.error(`[kb-decompose] Stage 2 failed for ${fileName}: ${err.message}`);
        return { chunkCount: 0, firstNodeId: null, chunkNodeIds: [] };
    }

    const rawFilterResponse = typeof filterResponse === 'string' ? filterResponse.trim() : String(filterResponse).trim();
    const decisions = parseJsonFromLLM(rawFilterResponse) as IngestionDecision[] | null;
    if (!decisions) {
        console.error(`[kb-decompose] Stage 2 returned unparseable output for ${fileName}`);
        return { chunkCount: 0, firstNodeId: null, chunkNodeIds: [] };
    }

    // =========================================================================
    // Create nodes from ingestion decisions
    // =========================================================================

    let ingested = decisions.filter(d => d.action && d.action !== 'discard');
    const discardCount = decisions.length - ingested.length;

    // Hard cap: never ingest more than maxNodesPerFile from a single document.
    // If the LLM didn't filter aggressively enough, take the highest-weighted ones.
    const maxNodesPerFile = config.knowledgeBase?.maxNodesPerFile || 12;
    if (ingested.length > maxNodesPerFile) {
        const before = ingested.length;
        ingested = ingested
            .sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1))
            .slice(0, maxNodesPerFile);
        console.warn(`[kb-decompose] ${fileName}: Hard cap applied — ${before} → ${maxNodesPerFile} (top by weight)`);
    }

    console.log(`[kb-decompose] ${fileName}: Stage 2 kept ${ingested.length}, discarded ${discardCount} (of ${allClaims.length} Stage 1 claims)`);

    let chunkCount = 0;
    let firstNodeId: string | null = null;
    const chunkNodeIds: string[] = [];
    const indexToNodeId = new Map<number, string>();

    for (const decision of ingested) {
        if (stopRequested) break;

        const content = decision.ingestion_content || '';
        if (!content || content.length < 20) continue;

        // Run low-value detection — catch generic LLM filler that survived Stage 2
        if (isLowValueCuration(content)) {
            console.log(`[kb-decompose] ${fileName}: Filtered low-value claim: "${content.slice(0, 60)}..."`);
            continue;
        }

        const weight = typeof decision.weight === 'number'
            ? Math.max(0.1, Math.min(2.0, decision.weight))  // Clamp to safe range
            : 1.0;

        try {
            const node = await createNode(content, 'seed', reader.subsystem || `reader_${reader.id}`, {
                domain,
                contributor: `kb:${reader.id}`,
                decidedByTier: 'system',
                skipDedup: true,
                weight,
                metadata: {
                    source: {
                        file: filePath,
                        fileName,
                        reader: reader.id,
                        chunk: decision.source_location || '',
                        extension,
                    },
                    claim: {
                        action: decision.action,
                        type: decision.claim_type || null,
                        evidenceStrength: decision.evidence_strength || null,
                        confidenceSignals: decision.confidence_signals || [],
                    },
                },
            });

            if (node) {
                if (!firstNodeId) firstNodeId = node.id;
                chunkNodeIds.push(node.id);
                indexToNodeId.set(decision.index, node.id);

                // Filename-derived keywords for searchability
                const fileKeywords = new Set<string>();
                fileKeywords.add(fileName.toLowerCase());
                const fileStem = path.basename(filePath, path.extname(filePath));
                fileKeywords.add(fileStem.toLowerCase());
                for (const part of fileStem.split(/[-_.]+/).filter(p => p.length >= 2)) {
                    fileKeywords.add(part.toLowerCase());
                }
                for (const part of fileStem.split(/(?<=[a-z])(?=[A-Z])/).filter(p => p.length >= 2)) {
                    fileKeywords.add(part.toLowerCase());
                }
                if (extension) fileKeywords.add(extension.toLowerCase());
                for (const kw of fileKeywords) {
                    await dbQuery(
                        `INSERT INTO node_keywords (node_id, keyword, source) VALUES ($1, $2, 'rule') ON CONFLICT DO NOTHING`,
                        [node.id, kw]
                    ).catch(() => {}); // non-fatal
                }

                // Record as chunk for archival tracking (archiveFileNodes uses kb_chunks.node_id)
                await dbQuery(
                    `INSERT INTO kb_chunks (file_id, chunk_index, chunk_type, chunk_label, content, content_length, node_id, metadata)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                     ON CONFLICT (file_id, chunk_index) DO UPDATE SET
                         chunk_type = $3, chunk_label = $4, content = $5, content_length = $6, node_id = $7, metadata = $8`,
                    [fileId, chunkCount, 'claim', decision.source_location || `claim-${decision.index}`,
                     content, content.length, node.id, JSON.stringify({
                         action: decision.action,
                         claimType: decision.claim_type,
                         evidenceStrength: decision.evidence_strength,
                         weight,
                         claimIndex: decision.index,
                     })]
                );
                chunkCount++;
            }
        } catch (err: any) {
            console.error(`[kb-decompose] Node creation failed for claim ${decision.index} in ${fileName}: ${err.message}`);
        }
    }

    // Create dependency edges between ingested nodes (from Stage 2 depends_on)
    for (const decision of ingested) {
        const nodeId = indexToNodeId.get(decision.index);
        if (!nodeId || !decision.depends_on || !Array.isArray(decision.depends_on)) continue;
        for (const depIndex of decision.depends_on) {
            const parentNodeId = indexToNodeId.get(depIndex);
            if (parentNodeId && parentNodeId !== nodeId) {
                try {
                    await createEdge(parentNodeId, nodeId, 'parent');
                } catch {
                    // Non-fatal — dependency edge is nice-to-have
                }
            }
        }
    }

    return { chunkCount, firstNodeId, chunkNodeIds };
}

// =============================================================================
// NODE CLEANUP
// =============================================================================

/**
 * Archive all graph nodes created from a file's chunks.
 * Called before reprocessing or when a file is deleted/changed.
 * Collects node IDs from both kb_chunks and the file-level node_id,
 * deduplicates them, and sets `archived = 1` on the nodes table.
 *
 * @param fileId - UUID of the kb_files row whose nodes should be archived
 * @returns Number of unique nodes archived
 */
export async function archiveFileNodes(fileId: string): Promise<number> {
    // Get all node IDs from this file's chunks
    const chunkNodes = await dbQuery(
        `SELECT node_id FROM kb_chunks WHERE file_id = $1 AND node_id IS NOT NULL`,
        [fileId]
    );

    // Also get the file-level node_id
    const fileRow = await dbQuery(
        `SELECT node_id FROM kb_files WHERE id = $1 AND node_id IS NOT NULL`,
        [fileId]
    );

    const nodeIds = [
        ...chunkNodes.map((r: any) => r.node_id),
        ...(fileRow?.[0] as any)?.node_id ? [(fileRow[0] as any).node_id] : [],
    ].filter(Boolean);

    // Deduplicate (file node_id is typically the first chunk's node)
    const unique = [...new Set(nodeIds)];

    if (unique.length > 0) {
        const placeholders = unique.map((_, i) => `$${i + 1}`).join(',');
        await dbQuery(
            `UPDATE nodes SET archived = 1 WHERE id IN (${placeholders}) AND archived = 0`,
            unique
        );

        // Also archive synthesis children — nodes whose parents are the KB nodes we just archived.
        // These are synthesis/voiced nodes derived from junk input and are themselves junk.
        // Use a recursive CTE to catch multi-generation descendants (max 3 hops to avoid runaway).
        try {
            const result = await dbQuery(
                `WITH RECURSIVE descendants(id, depth) AS (
                    SELECT child_id, 1 FROM edges WHERE parent_id IN (${placeholders})
                    UNION ALL
                    SELECT e.child_id, d.depth + 1
                    FROM edges e JOIN descendants d ON e.parent_id = d.id
                    WHERE d.depth < 3
                )
                UPDATE nodes SET archived = 1
                WHERE id IN (SELECT id FROM descendants) AND archived = 0 AND node_type NOT IN ('seed', 'raw')
                RETURNING id`,
                unique
            );
            const childCount = result?.length || 0;
            if (childCount > 0) {
                console.log(`[kb-pipeline] Archived ${childCount} synthesis children for file ${fileId}`);
            }
        } catch { /* non-fatal — children may not exist */ }

        console.log(`[kb-pipeline] Archived ${unique.length} KB nodes for file ${fileId}`);
    }

    return unique.length;
}

// =============================================================================
// CORE FILE PROCESSING
// =============================================================================

/**
 * Process a single file through the KB pipeline: read via the appropriate
 * reader plugin, optionally curate each chunk with an LLM (unless raw mode),
 * create graph nodes, link chunk nodes as siblings under the first node,
 * and record chunk metadata in kb_chunks. On completion or error, updates
 * the kb_files status and calls {@link maybeFinishFolderProcessing}.
 *
 * @param job - The processing job with file path, domain, reader extension, etc.
 */
export async function processFile(job: ProcessingJob): Promise<void> {
    const { fileId, filePath, domain, extension, rawMode } = job;

    try {
        // Mark as processing
        await dbQuery(
            `UPDATE kb_files SET status = 'processing', updated_at = datetime('now') WHERE id = $1`,
            [fileId]
        );
        emitActivity('kb', 'file_processing', `Processing${rawMode ? ' (raw)' : ''}: ${path.basename(filePath)}`, { fileId, path: filePath, extension, rawMode });

        // Get the reader
        const reader = getReaderForExtension(extension);
        if (!reader) {
            await dbQuery(
                `UPDATE kb_files SET status = 'skipped', error_message = 'No reader for extension: ${extension}', updated_at = datetime('now') WHERE id = $1`,
                [fileId]
            );
            setSkippedCount(skippedCount + 1);
            return; // finally block calls maybeFinishFolderProcessing
        }

        // Check model assignment — raw mode skips curation LLM but LLM-dependent readers (e.g. images) still need their model
        if (!rawMode || reader.requiresLLM) {
            try {
                const { getSubsystemAssignments } = await import('../../models.js');
                const assignments = await getSubsystemAssignments();
                const assignment = assignments[reader.subsystem as keyof typeof assignments];
                if (!assignment) {
                    await dbQuery(
                        `UPDATE kb_files SET status = 'skipped', error_message = 'No model assigned to ${reader.subsystem} — assign a model in Models page', updated_at = datetime('now') WHERE id = $1`,
                        [fileId]
                    );
                    setSkippedCount(skippedCount + 1);
                    return; // finally block calls maybeFinishFolderProcessing
                }
            } catch {
                // If we can't check, proceed anyway
            }
        }

        // Read and chunk the file
        const maxChunkSize = config.knowledgeBase?.maxChunkSize || 4000;
        const result = await reader.read(filePath, { maxChunkSize, domain });

        if (!result.chunks || result.chunks.length === 0) {
            await dbQuery(
                `UPDATE kb_files SET status = 'skipped', error_message = 'No content extracted', updated_at = datetime('now') WHERE id = $1`,
                [fileId]
            );
            setSkippedCount(skippedCount + 1);
            return; // finally block calls maybeFinishFolderProcessing
        }

        // Dynamically import core functions to avoid circular deps
        const { createNode, createEdge } = await import('../../core.js');
        const { callSubsystemModel } = await import('../../models.js');
        const { getPrompt } = await import('../../prompts.js');

        // --- Two-stage decomposition for document readers (pdf, doc, text) ---
        // Replaces the old "extract principles in 1-3 sentences" curation with
        // atomic claim extraction → aggressive filtering → weighted ingestion.
        if (!rawMode && DECOMPOSITION_READERS.has(reader.id)) {
            const { chunkCount, firstNodeId, chunkNodeIds } = await processWithDecomposition(
                job, reader, result.chunks, createNode, createEdge, callSubsystemModel, getPrompt,
            );

            // Link all claim nodes as siblings under the first (file-level grouping)
            if (chunkNodeIds.length > 1) {
                for (let i = 1; i < chunkNodeIds.length; i++) {
                    await createEdge(chunkNodeIds[0], chunkNodeIds[i], 'parent');
                }
            }

            await dbQuery(
                `UPDATE kb_files SET status = 'completed', chunk_count = $2, node_id = $3, processed_at = datetime('now'), updated_at = datetime('now')
                 WHERE id = $1`,
                [fileId, chunkCount, firstNodeId]
            );
            setCompletedCount(completedCount + 1);
            emitActivity('kb', 'file_complete',
                `Completed (decomposed): ${path.basename(filePath)} (${chunkCount} claims ingested)`,
                { fileId, chunks: chunkCount, nodes: chunkNodeIds.length, domain, pipeline: 'decomposition' });
            return; // finally block still runs (maybeFinishFolderProcessing)
        }

        // --- Standard per-chunk curation for code, sheet, image readers ---
        const minChunkLength = config.knowledgeBase?.minChunkLength || 50;
        const curationPromptId = rawMode ? null : CURATION_PROMPTS[reader.id];
        const nodeType = rawMode ? 'raw' : 'seed';

        // Create chunk nodes (with LLM curation for seed, as-is for raw)
        let chunkCount = 0;
        let firstNodeId: string | null = null;
        const chunkNodeIds: string[] = [];

        for (const chunk of result.chunks) {
            if (stopRequested) {
                console.log(`[kb-pipeline] Stop requested — aborting ${path.basename(filePath)}`);
                break;
            }
            if (!chunk.content || chunk.content.trim().length < minChunkLength) continue;

            try {
                // Determine node content — raw mode stores as-is, otherwise curate via LLM
                let nodeContent: string;

                if (curationPromptId) {
                    // LLM curation: send raw content to reader's subsystem model
                    const vars: Record<string, string> = {
                        content: chunk.content,
                        label: chunk.label || '',
                        domain: domain || '',
                        filePath: path.basename(filePath),
                    };

                    // Code reader gets extra language variable
                    if (reader.id === 'code' && chunk.metadata?.language) {
                        vars.language = chunk.metadata.language;
                    }

                    const prompt = await getPrompt(curationPromptId, vars);
                    const cTokens = config.knowledgeBase?.curationMaxTokens || 0;
                    const curated = await callSubsystemModel(reader.subsystem, prompt, {
                        temperature: 0.3,
                        ...(cTokens > 0 ? { maxTokens: cTokens } : {}),
                    });

                    nodeContent = typeof curated === 'string' ? curated.trim() : String(curated).trim();

                    // Strip structured formatting that small models produce despite prose instructions
                    nodeContent = cleanCurationOutput(nodeContent);

                    // Skip LLM refusals stored as knowledge ("I'm sorry but I can't...")
                    // and zero-value responses ("does not define any variables, only imports")
                    if (nodeContent && isLowValueCuration(nodeContent)) {
                        console.warn(`[kb-pipeline] Low-value curation filtered for ${path.basename(filePath)}:${chunk.index}, skipping`);
                        continue;
                    }

                    // Skip if LLM returned empty or trivially short response
                    if (!nodeContent || nodeContent.length < 20) {
                        console.warn(`[kb-pipeline] LLM returned empty/short curation for ${filePath}:${chunk.index}, skipping`);
                        continue;
                    }

                    // Guard against content inflation for text/document curation.
                    // Code descriptions are naturally longer than the source, so skip this for code.
                    if (reader.id !== 'code') {
                        const rawLen = chunk.content.length;
                        if (nodeContent.length > rawLen) {
                            console.warn(`[kb-pipeline] Curation inflated content (${rawLen} → ${nodeContent.length} chars) for ${path.basename(filePath)}:${chunk.index}, truncating`);
                            const truncated = nodeContent.substring(0, rawLen);
                            const lastSentence = truncated.lastIndexOf('. ');
                            nodeContent = lastSentence > rawLen * 0.5 ? truncated.substring(0, lastSentence + 1) : truncated;
                        }
                    }
                } else {
                    // Raw mode — prepend filename so the embedding model sees it as context
                    const fileName = path.basename(filePath);
                    nodeContent = `[${fileName}] ${chunk.content}`;
                }

                const chunkNode = await createNode(nodeContent, nodeType, reader.subsystem || `reader_${reader.id}`, {
                    domain,
                    contributor: `kb:${reader.id}`,
                    decidedByTier: 'system',
                    skipDedup: true, // KB scanner handles dedup via content hashing — don't reject similar chunks from different files
                    metadata: {
                        source: {
                            file: filePath,
                            fileName: path.basename(filePath),
                            reader: reader.id,
                            chunk: chunk.label || `chunk-${chunk.index}`,
                            extension,
                        },
                    },
                });

                if (chunkNode) {
                    if (!firstNodeId) firstNodeId = chunkNode.id;
                    chunkNodeIds.push(chunkNode.id);

                    // Add filename-derived keywords so nodes are searchable by file name
                    const fileName = path.basename(filePath);
                    const stem = path.basename(filePath, path.extname(filePath));
                    const fileKeywords = new Set<string>();
                    fileKeywords.add(fileName.toLowerCase());
                    fileKeywords.add(stem.toLowerCase());
                    // Split on common separators (-, _, ., camelCase)
                    for (const part of stem.split(/[-_.]+/).filter(p => p.length >= 2)) {
                        fileKeywords.add(part.toLowerCase());
                    }
                    // CamelCase split (e.g. "MyComponent" → "my", "component")
                    for (const part of stem.split(/(?<=[a-z])(?=[A-Z])/).filter(p => p.length >= 2)) {
                        fileKeywords.add(part.toLowerCase());
                    }
                    if (extension) fileKeywords.add(extension.toLowerCase());
                    for (const kw of fileKeywords) {
                        await dbQuery(
                            `INSERT INTO node_keywords (node_id, keyword, source) VALUES ($1, $2, 'rule') ON CONFLICT DO NOTHING`,
                            [chunkNode.id, kw]
                        ).catch(() => {}); // non-fatal
                    }

                    // Record chunk in DB (raw content preserved for reference/reprocessing)
                    // ON CONFLICT handles race conditions where the same file is queued twice concurrently
                    await dbQuery(
                        `INSERT INTO kb_chunks (file_id, chunk_index, chunk_type, chunk_label, content, content_length, node_id, metadata)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                         ON CONFLICT (file_id, chunk_index) DO UPDATE SET
                             chunk_type = $3, chunk_label = $4, content = $5, content_length = $6, node_id = $7, metadata = $8`,
                        [fileId, chunk.index, chunk.type, chunk.label, chunk.content, chunk.content.length,
                         chunkNode.id, JSON.stringify(chunk.metadata || {})]
                    );
                    chunkCount++;
                }
            } catch (chunkErr: any) {
                console.error(`[kb-pipeline] Chunk ${chunk.index} failed for ${path.basename(filePath)}: ${chunkErr.message}`);
                // Continue to next chunk — don't let one bad chunk kill the file
            }
        }

        // Link chunks as siblings under the first chunk (file-level node).
        // Previous code chained them sequentially (1→2→3→4) creating misleadingly
        // deep lineage trees. Flat fan-out is correct — chunks are peers, not ancestors.
        if (chunkNodeIds.length > 1) {
            for (let i = 1; i < chunkNodeIds.length; i++) {
                await createEdge(chunkNodeIds[0], chunkNodeIds[i], 'parent');
            }
        }

        // Update file record — use first chunk's node_id for tracking
        await dbQuery(
            `UPDATE kb_files SET status = 'completed', chunk_count = $2, node_id = $3, processed_at = datetime('now'), updated_at = datetime('now')
             WHERE id = $1`,
            [fileId, chunkCount, firstNodeId]
        );
        setCompletedCount(completedCount + 1);
        emitActivity('kb', 'file_complete', `Completed: ${path.basename(filePath)} (${chunkCount} chunks, ${chunkNodeIds.length} nodes)`, { fileId, chunks: chunkCount, nodes: chunkNodeIds.length, domain });

    } catch (err: any) {
        console.error(`[kb-pipeline] Error processing ${filePath}: ${err.message}`);
        emitActivity('kb', 'file_error', `Failed: ${path.basename(filePath)} — ${err.message?.slice(0, 100)}`, { fileId, error: err.message?.slice(0, 200) });
        await dbQuery(
            `UPDATE kb_files SET status = 'error', error_message = $2, updated_at = datetime('now') WHERE id = $1`,
            [fileId, err.message?.slice(0, 500)]
        ).catch(() => {});
        setFailedCount(failedCount + 1);
    } finally {
        // ALWAYS check if folder is done — even on early returns (skipped files)
        // Without this, folders get stuck in 'processing' forever when the last
        // file in the queue is skipped (no reader, no model, no content).
        await maybeFinishFolderProcessing(job.folderId).catch((e: any) => {
            console.error(`[kb-pipeline] maybeFinishFolderProcessing failed: ${e.message}`);
        });
    }
}

/**
 * Check if a folder has finished processing all queued files.
 * If no pending/processing files remain in the database and no jobs for
 * the folder are in the in-memory queue, transitions the folder status
 * from 'processing' to 'watching' (if watch_enabled) or 'idle'.
 * For curated (non-raw) folders, triggers post-ingestion summary generation.
 *
 * @param folderId - UUID of the kb_folders row to check
 */
export async function maybeFinishFolderProcessing(folderId: string): Promise<void> {
    try {
        const remaining = await dbQuery(
            `SELECT COUNT(*) as cnt FROM kb_files WHERE folder_id = $1 AND status IN ('pending', 'processing')`,
            [folderId]
        );
        const count = parseInt((remaining[0] as any)?.cnt ?? '0', 10);
        if (count > 0) return; // Still has work to do

        // Also check if any jobs for this folder are still in the queue
        if (queue.some(j => j.folderId === folderId)) return;

        // All done — update folder status
        const folderRow = await dbQuery('SELECT watch_enabled, status, domain, raw_mode FROM kb_folders WHERE id = $1', [folderId]);
        if (!folderRow || folderRow.length === 0) return;
        const f = folderRow[0] as any;
        if (f.status !== 'processing') return; // Only transition from 'processing'

        const newStatus = f.watch_enabled ? 'watching' : 'idle';
        await dbQuery(
            `UPDATE kb_folders SET status = $1, updated_at = datetime('now') WHERE id = $2`,
            [newStatus, folderId]
        );
        console.error(`[kb-pipeline] Folder ${folderId.slice(0, 8)} finished processing → ${newStatus}`);

        // Post-ingestion: generate conceptual summaries for curated (non-raw) folders
        if (!f.raw_mode && config.knowledgeBase?.postIngestionSummary !== false) {
            generatePostIngestionSummaries(folderId, f.domain).catch((err: any) => {
                console.error(`[kb-pipeline] Post-ingestion summary failed: ${err.message}`);
            });
        }
    } catch {
        // Non-fatal — status will be stale but not broken
    }
}

/**
 * After KB ingestion completes, generate high-level architectural/conceptual
 * seed nodes from the ingested material. This bridges the gap between
 * mechanical code descriptions ("function X does Y") and conceptual knowledge
 * that the synthesis engine can meaningfully combine.
 *
 * Samples the top nodes by specificity/weight, sends them to the 'compress'
 * subsystem model, and proposes the resulting summaries as seed nodes.
 * Requires at least {@link MIN_NODES_FOR_SUMMARY} nodes to run.
 *
 * @param folderId - UUID of the kb_folders row that finished processing
 * @param domain - The domain to propose summary seeds into
 */
async function generatePostIngestionSummaries(folderId: string, domain: string): Promise<void> {
    const MIN_NODES_FOR_SUMMARY = 20;
    const SAMPLE_SIZE = 30;
    const MAX_SUMMARIES = 5;

    // Count how many nodes were created for this folder
    const countRow = await dbQuery(
        `SELECT COUNT(*) as cnt FROM kb_chunks c
         JOIN kb_files f ON f.id = c.file_id
         WHERE f.folder_id = $1 AND c.node_id IS NOT NULL`,
        [folderId]
    );
    const nodeCount = parseInt((countRow[0] as any)?.cnt ?? '0', 10);
    if (nodeCount < MIN_NODES_FOR_SUMMARY) {
        console.error(`[kb-pipeline] Skipping post-ingestion summary: only ${nodeCount} nodes (need ${MIN_NODES_FOR_SUMMARY})`);
        return;
    }

    // Sample the most specific/heavy nodes for context
    const sampleNodes = await dbQuery(`
        SELECT n.content FROM nodes n
        JOIN kb_chunks c ON c.node_id = n.id
        JOIN kb_files f ON f.id = c.file_id
        WHERE f.folder_id = $1 AND n.archived = FALSE
        ORDER BY n.specificity DESC, n.weight DESC
        LIMIT $2
    `, [folderId, SAMPLE_SIZE]);

    if (sampleNodes.length === 0) return;

    const sampleContent = sampleNodes
        .map((n: any, i: number) => `${i + 1}. ${n.content.slice(0, 250)}`)
        .join('\n');

    // Build the prompt — domain-agnostic (works for code, docs, research, any content)
    const prompt = await getPrompt('kb.post_ingestion_insights', {
        nodeCount: String(sampleNodes.length),
        domain,
        maxSummaries: String(MAX_SUMMARIES),
        sampleContent,
    });

    let response: string;
    try {
        const { callSubsystemModel } = await import('../../models.js');
        response = await callSubsystemModel('compress', prompt, {});
    } catch (err: any) {
        console.error(`[kb-pipeline] Post-ingestion LLM call failed: ${err.message}`);
        return;
    }

    // Parse and propose each summary as a seed
    const summaries = response
        .split('\n')
        .map(line => line.replace(/^[-*•\d.)\s]+/, '').trim())
        .filter(line => line.length > 30 && line.length < 1000);

    if (summaries.length === 0) {
        console.error(`[kb-pipeline] No valid summaries parsed from LLM response`);
        return;
    }

    const { handlePropose } = await import('../../handlers/graph.js');
    let added = 0;
    for (const summary of summaries.slice(0, MAX_SUMMARIES)) {
        try {
            const result = await handlePropose({
                content: summary,
                nodeType: 'seed',
                domain,
                contributor: 'kb:summary',
            }) as any;
            if (result.success) added++;
        } catch (err: any) {
            console.error(`[kb-pipeline] Summary proposal failed: ${err.message}`);
        }
    }

    if (added > 0) {
        emitActivity('kb', 'post_ingestion_summary',
            `Generated ${added} architectural summaries for "${domain}" from ${nodeCount} ingested nodes`,
            { folderId, domain, generated: summaries.length, accepted: added }
        );
        console.error(`[kb-pipeline] Post-ingestion: ${added}/${summaries.length} architectural summaries added to "${domain}"`);
    }
}
