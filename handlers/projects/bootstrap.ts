import { query } from '../../db.js';
import { getPrompt } from '../../prompts.js';

// =============================================================================
// PROJECT BOOTSTRAPPING
// =============================================================================

/**
 * Bootstrap a new project with partitions, bridges, and foundational seed nodes.
 * All params are optional — if nothing is provided, returns immediately (backward compatible).
 */
export async function bootstrapProject(opts: {
    purpose?: string;
    domains?: string[];
    bridges?: string[][];
    goals?: string[];
    autoBridge?: boolean;
    name: string;
}): Promise<{ partitions: number; bridges: number; seeded: number }> {
    const { purpose, domains, bridges, goals, autoBridge, name } = opts;
    let partitionCount = 0;
    let bridgeCount = 0;
    let seedCount = 0;

    // Store project-level settings in the DB settings table
    if (purpose) {
        await query(`INSERT OR REPLACE INTO settings (key, value) VALUES ('project.purpose', $1)`, [purpose]);
    }
    if (goals && goals.length > 0) {
        await query(`INSERT OR REPLACE INTO settings (key, value) VALUES ('project.goals', $1)`, [JSON.stringify(goals)]);
    }
    if (autoBridge !== undefined) {
        await query(`INSERT OR REPLACE INTO settings (key, value) VALUES ('project.autoBridge', $1)`, [autoBridge ? 'true' : 'false']);
    }
    // Nothing else to do if no domains specified
    if (!domains || domains.length === 0) return { partitions: 0, bridges: 0, seeded: 0 };

    // Create partitions for each domain
    const { handlePartitions } = await import('../governance.js');
    for (const domain of domains) {
        const partitionId = domain.toLowerCase().replace(/\s+/g, '-');
        try {
            await handlePartitions({
                action: 'create',
                id: partitionId,
                name: domain.split(/[-_]/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
                description: purpose ? `Domain for: ${purpose}` : `Domain: ${domain}`,
                domains: [domain],
            });
            partitionCount++;
        } catch (e: any) {
            console.error(`[bootstrap] Partition creation failed for "${domain}": ${e.message}`);
        }
    }

    // Create bridges between specified domain pairs
    if (bridges && bridges.length > 0) {
        for (const [domainA, domainB] of bridges) {
            const partA = domainA.toLowerCase().replace(/\s+/g, '-');
            const partB = domainB.toLowerCase().replace(/\s+/g, '-');
            try {
                await handlePartitions({
                    action: 'createBridge',
                    id: partA,
                    targetPartitionId: partB,
                });
                bridgeCount++;
            } catch (e: any) {
                console.error(`[bootstrap] Bridge creation failed for "${domainA}" <-> "${domainB}": ${e.message}`);
            }
        }
    }

    // Generate foundational seed nodes if purpose is provided
    if (purpose) {
        seedCount = await generateBootstrapSeeds(purpose, domains, goals);
    }

    if (partitionCount > 0 || seedCount > 0) {
        console.error(`[bootstrap] Project "${name}" bootstrapped: ${partitionCount} partitions, ${bridgeCount} bridges, ${seedCount} seeds`);
    }

    return { partitions: partitionCount, bridges: bridgeCount, seeded: seedCount };
}

/**
 * Generate foundational seed nodes for each domain based on project purpose and goals.
 * Uses the compress subsystem LLM to produce high-level conceptual knowledge.
 */
export async function generateBootstrapSeeds(purpose: string, domains: string[], goals?: string[]): Promise<number> {
    const SEEDS_PER_DOMAIN = 3;
    let totalSeeded = 0;

    const goalsText = goals && goals.length > 0
        ? `\nGoals:\n${goals.map((g, i) => `${i + 1}. ${g}`).join('\n')}`
        : '';

    const domainList = domains.join(', ');

    const prompt = await getPrompt('project.bootstrap_seeds', {
        purpose,
        domainList,
        goalsText,
        seedsPerDomain: String(SEEDS_PER_DOMAIN),
    });

    let response: string;
    try {
        const { callSubsystemModel } = await import('../../models.js');
        response = await callSubsystemModel('compress', prompt, {});
    } catch (err: any) {
        console.error(`[bootstrap] LLM call for seed generation failed: ${err.message}`);
        return 0;
    }

    // Parse [domain] prefix lines
    const { handlePropose } = await import('../graph.js');
    const lines = response.split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('['));

    for (const line of lines) {
        const match = line.match(/^\[([^\]]+)\]\s*(.+)$/);
        if (!match) continue;

        const [, rawDomain, content] = match;
        // Find the closest matching domain from the provided list
        const domain = domains.find(d =>
            d.toLowerCase() === rawDomain.toLowerCase() ||
            d.toLowerCase().replace(/[-_]/g, ' ') === rawDomain.toLowerCase().replace(/[-_]/g, ' ')
        );
        if (!domain || content.length < 20) continue;

        try {
            const result = await handlePropose({
                content,
                nodeType: 'seed',
                domain,
                contributor: 'bootstrap',
            }) as any;
            if (result.success) totalSeeded++;
        } catch (err: any) {
            console.error(`[bootstrap] Seed proposal failed: ${err.message}`);
        }
    }

    return totalSeeded;
}
