/**
 * @module core/cycles/research
 *
 * Autonomous Research Cycle.
 *
 * Generates new seed nodes for under-populated domains by calling the LLM
 * with existing domain knowledge and open questions. Seeds are validated
 * against the domain centroid embedding and optional consultant review
 * before insertion. Includes exhaustion cooldown to avoid hammering
 * saturated domains and a manifest guard to prevent off-topic generation.
 */

import { query, queryOne } from '../../db.js';
import { config as appConfig } from '../../config.js';
import { getEmbedding, callSubsystemModel, consultantReview, getAssignedModel } from '../../models.js';
import { getPrompt } from '../../prompts.js';
import { getProjectContextBlock, getProjectManifest } from '../project-context.js';
import { cosineSimilarity, parseEmbedding } from '../scoring.js';
import { toTelegraphic } from '../../telegraphic.js';
import { emitActivity } from '../../services/event-bus.js';
import { resolveContent } from '../number-variables.js';
import { buildProvenanceTag } from '../provenance.js';
import { RC } from '../../config/constants.js';
import { getExcludedDomainsForCycle } from '../governance.js';

/**
 * One tick of the research cycle: selects the least-populated eligible domain,
 * gathers existing knowledge and open questions, calls the research subsystem
 * LLM to generate new seed facts, then validates and inserts them.
 *
 * Pipeline:
 * 1. Find candidate domains (filtered by node count, system/transient exclusion,
 *    cycle exclusion, manifest relevance, and exhaustion cooldown)
 * 2. Gather existing knowledge and open questions for the target domain
 * 3. Call the research LLM with project context to generate seed facts
 * 4. Parse line-by-line seeds, filtering citation-only lines
 * 5. Gate each seed by embedding similarity to domain centroid
 * 6. Optional consultant review for quality scoring
 * 7. Insert via `handlePropose` (which handles dedup, junk filter, etc.)
 * 8. Log audit trail in `dream_cycles`
 *
 * @returns Resolves when the tick completes
 */
async function logResearchSkip(reason: string, domain?: string, detail?: Record<string, any>): Promise<void> {
    const rejectionReason = `research:${reason}`;
    await queryOne(`
        INSERT INTO dream_cycles (
            resonance_score, threshold_used,
            created_child, rejection_reason, parameters, domain, completed_at
        ) VALUES (0, 0, 0, $1, $2, $3, datetime('now'))
    `, [rejectionReason, JSON.stringify({ cycle_type: 'research', skip_reason: reason, ...detail }), domain ?? null]);
}

async function runResearchCycleSingle(): Promise<void> {
    const cfg = appConfig.autonomousCycles.research;

    // 1. Find domains sorted by node count, between min and max thresholds
    //    Exclude system partition domains — they are auto-populated and should never be targeted by research.
    const allDomains = await query(`
        SELECT domain, COUNT(*) as cnt FROM nodes
        WHERE archived = FALSE AND lab_status IS NULL AND domain IS NOT NULL
          AND node_type NOT IN ('question', 'raw', 'elite_verification')
          AND domain NOT IN (
              SELECT pd.domain FROM partition_domains pd
              JOIN domain_partitions dp ON dp.id = pd.partition_id
              WHERE dp.system = 1 OR dp.transient = 1
          )
        GROUP BY domain
        HAVING cnt >= $1 AND cnt <= $2
        ORDER BY cnt ASC
        LIMIT ${Math.floor(cfg.domainSelectionLimit)}
    `, [cfg.minDomainNodes, cfg.maxDomainNodes]);

    // Filter out domains excluded from the research cycle via allowed_cycles
    const excludedDomains = await getExcludedDomainsForCycle('research');
    const domains = excludedDomains.size > 0
        ? allDomains.filter((d: any) => !excludedDomains.has(d.domain))
        : allDomains;

    if (domains.length === 0) {
        await logResearchSkip('no_candidate_domains', undefined, {
            allDomainsCount: allDomains.length,
            excludedCount: excludedDomains.size,
            minDomainNodes: cfg.minDomainNodes,
            maxDomainNodes: cfg.maxDomainNodes,
        });
        return;
    }

    // Guard: validate candidate domains against the project manifest.
    // Contaminated domains (e.g., "proxy-design" in a limescale project) get created by
    // cross-project leaks and then self-reinforce via the research cycle. Check that
    // the domain's existing content is semantically related to the manifest purpose.
    const earlyManifest = await getProjectManifest();
    let validDomains = domains as any[];
    if (earlyManifest?.purpose) {
        try {
            const purposeEmbedding = await getEmbedding(earlyManifest.purpose);
            const validated: any[] = [];
            for (const d of validDomains) {
                // Get domain centroid
                // Anchor centroid to seed/breakthrough nodes only — prevents centroid drift
                // when voiced/synthesis nodes converge to ML-native vocabulary
                const domainEmbeddings = await query(`
                    SELECT embedding FROM nodes
                    WHERE archived = FALSE AND lab_status IS NULL AND domain = $1 AND embedding IS NOT NULL
                      AND node_type IN ('seed', 'breakthrough')
                    ORDER BY weight DESC LIMIT ${RC.queryLimits.researchContextLimit}
                `, [d.domain]);
                const vectors = domainEmbeddings
                    .map((row: any) => parseEmbedding(row.embedding))
                    .filter((v: number[] | null): v is number[] => v !== null);
                if (vectors.length === 0) { validated.push(d); continue; }
                const dim = vectors[0].length;
                const centroid = new Array(dim).fill(0);
                for (const vec of vectors) {
                    for (let i = 0; i < dim; i++) centroid[i] += vec[i] / vectors.length;
                }
                if (!purposeEmbedding) { validated.push(d); continue; }

                // Debug: log dimensions on first domain to catch embedding model mismatches
                if (validated.length === 0 && d === validDomains[0]) {
                    console.error(`[research] Purpose embedding: ${purposeEmbedding.length} dims, centroid: ${centroid.length} dims`);
                }

                const sim = cosineSimilarity(purposeEmbedding, centroid);
                const domainThreshold = cfg.domainRelevanceThreshold ?? 0.1;
                if (sim >= domainThreshold) {
                    validated.push(d);
                } else {
                    console.error(`[research] Skipping domain "${d.domain}" — low relevance to project purpose (${sim.toFixed(3)} < ${domainThreshold})`);
                    emitActivity('cycle', 'research_domain_skip', `Skipping "${d.domain}" — off-topic (sim ${sim.toFixed(3)})`, { domain: d.domain, similarity: sim });
                }
            }
            validDomains = validated;
        } catch (err: any) {
            console.error(`[research] Manifest relevance check failed, using all domains: ${err.message}`);
        }
    }

    if (validDomains.length === 0) {
        await logResearchSkip('all_domains_off_topic', undefined, {
            candidateCount: domains.length,
            relevanceThreshold: cfg.domainRelevanceThreshold ?? 0.1,
        });
        return;
    }

    // Exhaustion cooldown: skip domains where the last N research cycles produced 0 new seeds.
    // This prevents the cycle from hammering a saturated domain forever.
    const exhaustionStreak = cfg.exhaustionStreak ?? 3;  // consecutive 0-seed cycles to trigger cooldown
    const exhaustionCooldownMs = cfg.exhaustionCooldownMs ?? 3600000;  // 1 hour cooldown
    const cooldownCutoff = new Date(Date.now() - exhaustionCooldownMs).toISOString();

    const nonExhausted: typeof validDomains = [];
    for (const d of validDomains) {
        const recentCycles = await query(`
            SELECT created_child FROM dream_cycles
            WHERE domain = $1
              AND parameters LIKE '%"cycle_type":"research"%'
              AND completed_at > $2
            ORDER BY completed_at DESC
            LIMIT $3
        `, [d.domain, cooldownCutoff, exhaustionStreak]);

        // Skip if we have enough recent cycles AND all produced 0 seeds
        if (recentCycles.length >= exhaustionStreak &&
            recentCycles.every((c: any) => c.created_child === 0)) {
            console.error(`[research] Skipping exhausted domain "${d.domain}" (${exhaustionStreak} consecutive zero-seed cycles)`);
            emitActivity('cycle', 'research_domain_exhausted',
                `Skipping "${d.domain}" — exhausted (${exhaustionStreak} consecutive zero-seed cycles)`,
                { domain: d.domain, streak: exhaustionStreak });
            continue;
        }
        nonExhausted.push(d);
    }

    if (nonExhausted.length === 0) {
        console.error('[research] All candidate domains exhausted — waiting for cooldown');
        emitActivity('cycle', 'research_all_exhausted', 'All candidate domains exhausted — waiting for cooldown', { cooldownMs: cfg.exhaustionCooldownMs });
        await logResearchSkip('all_domains_exhausted', undefined, {
            validDomainCount: validDomains.length,
            exhaustionStreak,
            cooldownMs: exhaustionCooldownMs,
        });
        return;
    }

    // Pick the domain with fewest nodes (most in need of research)
    const targetDomain = nonExhausted[0].domain;
    const nodeCount = nonExhausted[0].cnt;

    console.error(`[research] Targeting domain "${targetDomain}" (${nodeCount} nodes)`);
    emitActivity('cycle', 'research_targeting', `Research targeting "${targetDomain}" (${nodeCount} nodes)`, { domain: targetDomain, nodeCount });

    // 2. Get existing knowledge for context (top seeds/voiced by weight)
    const existing = await query(`
        SELECT content, node_type, generation, contributor, origin, verification_status, verification_score
        FROM nodes
        WHERE archived = FALSE AND lab_status IS NULL AND domain = $1
          AND node_type IN ('seed', 'voiced', 'breakthrough')
        ORDER BY weight DESC LIMIT ${Math.floor(cfg.knowledgeContextLimit)}
    `, [targetDomain]);

    // Resolve number variable placeholders so the LLM sees actual values, not [[[SBKR...]]] tokens
    const resolvedExisting = await Promise.all(
        existing.map((n: any) => resolveContent(n.content))
    );
    const rawKnowledge = resolvedExisting.length > 0
        ? resolvedExisting.map((content: string, i: number) => `${i + 1}. ${buildProvenanceTag(existing[i])} ${content.slice(0, 200)}`).join('\n')
        : 'No existing knowledge yet.';
    let existingKnowledge = rawKnowledge;
    try {
        if (existing.length > 0) {
            existingKnowledge = toTelegraphic(rawKnowledge, { aggressiveness: 'aggressive' });
        }
    } catch (err: any) {
        console.error(`[research] Telegraphic compression failed for knowledge, using raw: ${err.message}`);
    }

    // 3. Get open questions in this domain
    const questions = await query(`
        SELECT content FROM nodes
        WHERE archived = FALSE AND lab_status IS NULL AND domain = $1 AND node_type = 'question'
        ORDER BY weight DESC LIMIT ${Math.floor(cfg.openQuestionsLimit)}
    `, [targetDomain]);

    const resolvedQuestions = await Promise.all(
        questions.map((q: any) => resolveContent(q.content))
    );
    const rawQuestions = resolvedQuestions.length > 0
        ? resolvedQuestions.map((content: string, i: number) => `${i + 1}. ${content}`).join('\n')
        : 'No specific questions — generate broadly useful facts.';
    let openQuestions = rawQuestions;
    try {
        if (questions.length > 0) {
            openQuestions = toTelegraphic(rawQuestions, { aggressiveness: 'aggressive' });
        }
    } catch (err: any) {
        console.error(`[research] Telegraphic compression failed for questions, using raw: ${err.message}`);
    }

    // 4. Guard: require project manifest — without it the LLM has no way to know
    //    what domain names mean in this project and will interpret them literally
    //    (e.g., "synthesis-design" → chemical synthesis, "architecture" → buildings).
    const researchProjectContext = await getProjectContextBlock();
    const manifest = await getProjectManifest();
    if (!manifest) {
        console.error(`[research] Skipping — no project manifest. Create one via project interview or manual setup.`);
        await logResearchSkip('no_manifest', targetDomain);
        return;
    }

    // 5. Build prompt and call LLM (enriched with project context)
    let prompt: string;
    try {
        const baseResearchPrompt = await getPrompt('core.research_cycle', {
            domain: targetDomain,
            existingKnowledge,
            openQuestions,
        });
        prompt = researchProjectContext ? `${researchProjectContext}\n\n${baseResearchPrompt}` : baseResearchPrompt;
    } catch (err: any) {
        console.error(`[research] getPrompt failed: ${err.message}`);
        await logResearchSkip('prompt_error', targetDomain, { error: err.message });
        return;
    }

    let response: string;
    try {
        response = await callSubsystemModel('research', prompt, {});
    } catch (err: any) {
        if (err.name === 'AbortError') throw err; // propagate to runCycleLoop
        console.error(`[research] LLM call failed: ${err.message}`);
        await logResearchSkip('llm_error', targetDomain, { error: err.message });
        return;
    }

    // 6. Parse line-by-line seeds
    const seeds = response
        .split('\n')
        .map(line => line.replace(/^[-*\u2022]\s*/, '').trim())
        .filter(line => line.length > cfg.seedMinLength && line.length < cfg.seedMaxLength)
        .filter(line => {
            // Reject citation-only seeds — bare references with no substantive claim
            // Matches lines that are predominantly a paper citation with no knowledge content
            const citationOnly = /^\*?(?:Source:?\s*)?[A-Z][a-z]+(?:,?\s+(?:[A-Z]\.?\s*)+(?:&|,|and)\s+)*[A-Z][a-z]+.*?\(\d{4}\).*?[""\u201C\u201D].+?[""\u201C\u201D].*$/i;
            if (citationOnly.test(line)) {
                // Check if there's substantive content beyond the citation
                // Strip the citation part and see what's left
                const stripped = line
                    .replace(/\*?Source:?\s*/gi, '')
                    .replace(/\([^)]*\d{4}[^)]*\)/g, '')      // (Author, 2001)
                    .replace(/[""\u201C\u201D][^""\u201C\u201D]*[""\u201C\u201D]/g, '')  // "paper title"
                    .replace(/[A-Z][a-z]+(?:,?\s+[A-Z]\.?\s*)+/g, '') // Author names
                    .replace(/(?:Acta|Journal|Proceedings|Annals|Trans\.|Rev\.)\s+\w+/gi, '') // Journal names
                    .replace(/\d+,?\s*\d+-\d+/g, '')           // page numbers like 97, 369-379
                    .replace(/[.,;:\s*_-]+/g, ' ')
                    .trim();
                if (stripped.length < 40) {
                    console.error(`[research] Rejected citation-only seed: "${line.slice(0, 80)}..."`);
                    return false;
                }
            }
            return true;
        });

    if (seeds.length === 0) {
        const rawLineCount = response.split('\n').filter(l => l.trim().length > 0).length;
        console.error(`[research] No valid seeds parsed from LLM response (${rawLineCount} raw lines)`);
        await logResearchSkip('no_valid_seeds', targetDomain, {
            rawLineCount,
            seedMinLength: cfg.seedMinLength,
            seedMaxLength: cfg.seedMaxLength,
            responseLengthChars: response.length,
        });
        return;
    }

    // 7. Embedding-based relevance gate — reject seeds that are off-topic for this domain.
    //    Compute domain centroid (average embedding), then check each seed against it.
    const relevanceThreshold = cfg.relevanceThreshold ?? 0.3;
    let domainCentroid: number[] | null = null;

    if (existing.length > 0) {
        try {
            // Anchor centroid to seed/breakthrough nodes only — prevents centroid drift
            // when voiced/synthesis nodes converge to ML-native vocabulary
            const embeddings = await query(`
                SELECT embedding FROM nodes
                WHERE archived = FALSE AND lab_status IS NULL AND domain = $1
                  AND node_type IN ('seed', 'breakthrough')
                  AND embedding IS NOT NULL
                ORDER BY weight DESC LIMIT ${Math.floor(cfg.knowledgeContextLimit)}
            `, [targetDomain]);

            const vectors = embeddings
                .map((row: any) => parseEmbedding(row.embedding))
                .filter((v: number[] | null): v is number[] => v !== null);

            if (vectors.length > 0) {
                // Average the vectors to get centroid
                const dim = vectors[0].length;
                domainCentroid = new Array(dim).fill(0);
                for (const vec of vectors) {
                    for (let i = 0; i < dim; i++) {
                        domainCentroid[i] += vec[i] / vectors.length;
                    }
                }
            }
        } catch (err: any) {
            console.error(`[research] Failed to compute domain centroid: ${err.message}`);
        }
    }

    const { handlePropose } = await import('../../handlers/graph.js');

    let added = 0;
    let rejected = 0;
    for (const seed of seeds.slice(0, cfg.maxSeedsPerCycle)) {
        // Check relevance against domain centroid
        if (domainCentroid) {
            try {
                const seedEmbedding = await getEmbedding(seed);
                const similarity = cosineSimilarity(seedEmbedding, domainCentroid);
                if (similarity < relevanceThreshold) {
                    rejected++;
                    console.error(`[research] Rejected off-topic seed (similarity ${similarity.toFixed(3)} < ${relevanceThreshold}): "${seed.slice(0, 80)}..."`);
                    continue;
                }
            } catch (err: any) {
                console.error(`[research] Relevance check failed, allowing seed: ${err.message}`);
            }
        }

        // Consultant review of research seed quality (before insertion)
        if (appConfig.consultantReview?.enabled) {
            try {
                const review = await consultantReview('research', seed, {
                    claim: seed,
                    domain: targetDomain,
                    parentContext: existingKnowledge.slice(0, 500),
                    subsystemTask: `Score this research seed for relevance and quality in the "${targetDomain}" domain`,
                });
                if (review && review.score < (appConfig.consultantReview.thresholds?.research ?? 4)) {
                    rejected++;
                    console.error(`[research] Consultant rejected seed (score ${review.score}): "${seed.slice(0, 80)}..."`);
                    continue;
                }
            } catch { /* consultant review is non-fatal */ }
        }

        try {
            const result = await handlePropose({
                content: seed,
                nodeType: 'seed',
                domain: targetDomain,
                contributor: 'research-cycle',
            }) as any;
            if (result.success) added++;
        } catch (err: any) {
            console.error(`[research] Propose failed: ${err.message}`);
        }
    }

    if (rejected > 0) {
        console.error(`[research] Relevance gate rejected ${rejected}/${seeds.length} off-topic seeds`);
        emitActivity('cycle', 'research_relevance', `Relevance gate rejected ${rejected}/${seeds.length} off-topic seeds`, { rejected, total: seeds.length, domain: targetDomain });
    }

    // 8. Log audit trail in dream_cycles
    await queryOne(`
        INSERT INTO dream_cycles (
            resonance_score, threshold_used,
            created_child, parameters, domain, completed_at
        ) VALUES ($1, $2, $3, $4, $5, datetime('now'))
    `, [0, 0, added > 0 ? 1 : 0, JSON.stringify({
        cycle_type: 'research',
        domain: targetDomain,
        seedsGenerated: seeds.length,
        seedsRejectedRelevance: rejected,
        seedsAccepted: added,
    }), targetDomain]);

    if (added > 0) {
        console.error(`[research] Added ${added}/${seeds.length} new seeds to "${targetDomain}"`);
        const researchModel = getAssignedModel('research' as any);
        emitActivity('cycle', 'research_complete', `Research added ${added}/${seeds.length} seeds to "${targetDomain}"`, { added, total: seeds.length, rejected, domain: targetDomain, modelId: researchModel?.id ?? null, modelName: researchModel?.name ?? null });
    } else {
        console.error(`[research] 0/${seeds.length} seeds accepted for "${targetDomain}" (all duplicates or rejected)`);
        emitActivity('cycle', 'research_complete', `Research: 0/${seeds.length} seeds accepted for "${targetDomain}"`, { added: 0, total: seeds.length, rejected, domain: targetDomain });
    }
}

export { runResearchCycleSingle };
