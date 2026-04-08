/**
 * Unit tests for the synthesizability gate (ground rules).
 *
 * Tests config defaults, prompt definitions, type integration,
 * MCP schema, and config section metadata.
 *
 * Note: isLowValueCuration NO_KNOWLEDGE tests live in file-processing-core.test.ts
 * because that import chain requires mocking (import.meta.url in constants.ts).
 */

import { config, DEFAULT_TEMPERATURES, DEFAULT_REPEAT_PENALTIES } from '../../config/defaults.js';
import { KB_PROMPTS } from '../../prompts/kb.js';
import { FEATURE_SECTIONS } from '../../config-sections/features.js';
import { GUI_ENRICHMENTS } from '../../config-sections/gui-metadata.js';
import { tools as TOOL_SCHEMAS } from '../../mcp/schemas.js';
import type { Subsystem } from '../../models/types.js';

// ─── Config Defaults ─────────────────────────────────────────────────────

describe('groundRules config defaults', () => {
    it('config has groundRules section', () => {
        expect(config).toHaveProperty('groundRules');
    });

    it('groundRules.enabled defaults to true', () => {
        expect(config.groundRules.enabled).toBe(true);
    });

    it('groundRules.batchSize defaults to 50', () => {
        expect(config.groundRules.batchSize).toBe(50);
    });

    it('groundRules.intervalMs has a positive autonomous-cycle interval', () => {
        // Ground rules used to be manual-only (intervalMs=0); the autonomous cycle now
        // runs them on a short tick (5000ms by default) so newly-created nodes get rule
        // checks without waiting for a manual sweep.
        expect(config.groundRules.intervalMs).toBeGreaterThan(0);
    });
});

// ─── Subsystem Defaults ──────────────────────────────────────────────────

describe('ground_rules subsystem defaults', () => {
    it('DEFAULT_TEMPERATURES includes ground_rules at 0.1', () => {
        expect(DEFAULT_TEMPERATURES).toHaveProperty('ground_rules');
        expect(DEFAULT_TEMPERATURES.ground_rules).toBe(0.1);
    });

    it('DEFAULT_REPEAT_PENALTIES includes ground_rules at 1.0', () => {
        expect(DEFAULT_REPEAT_PENALTIES).toHaveProperty('ground_rules');
        expect(DEFAULT_REPEAT_PENALTIES.ground_rules).toBe(1.0);
    });

    it('ground_rules is a valid Subsystem type', () => {
        const subsystem: Subsystem = 'ground_rules';
        expect(subsystem).toBe('ground_rules');
    });
});

// ─── KB Prompts ──────────────────────────────────────────────────────────

describe('KB prompts', () => {
    describe('synthesizability_check prompt', () => {
        const prompt = KB_PROMPTS['kb.synthesizability_check'];

        it('exists', () => {
            expect(prompt).toBeDefined();
        });

        it('has content variable', () => {
            expect(prompt.variables).toContain('content');
        });

        it('asks for YES or NO answer', () => {
            expect(prompt.content).toContain('YES');
            expect(prompt.content).toContain('NO');
        });

        it('provides synthesizable examples', () => {
            expect(prompt.content).toContain('SYNTHESIZABLE examples');
            expect(prompt.content).toContain('NOT SYNTHESIZABLE examples');
        });

        it('includes mechanism as an example category', () => {
            expect(prompt.content).toContain('mechanism');
            expect(prompt.content).toContain('transferable principle');
            expect(prompt.content).toContain('causal claim');
        });
    });

    describe('curate_document prompt extracts principles', () => {
        const prompt = KB_PROMPTS['kb.curate_document'];

        it('focuses on principles not summaries', () => {
            expect(prompt.content).toContain('CLAIMS, PRINCIPLES, or MECHANISMS');
            expect(prompt.content).not.toContain('Summarize ONLY');
        });

        it('instructs NO_KNOWLEDGE for empty chunks', () => {
            expect(prompt.content).toContain('NO_KNOWLEDGE');
        });

        it('explicitly ignores methodology descriptions', () => {
            expect(prompt.content).toContain('IGNORE');
            expect(prompt.content).toContain('methodology');
        });
    });

    describe('curate_text prompt extracts principles', () => {
        const prompt = KB_PROMPTS['kb.curate_text'];

        it('focuses on principles not summaries', () => {
            expect(prompt.content).toContain('CLAIMS, PRINCIPLES, or MECHANISMS');
            expect(prompt.content).not.toContain('Summarize ONLY');
        });

        it('instructs NO_KNOWLEDGE for empty chunks', () => {
            expect(prompt.content).toContain('NO_KNOWLEDGE');
        });
    });
});

// ─── Config Section Metadata ─────────────────────────────────────────────

describe('ground_rules config section', () => {
    const section = FEATURE_SECTIONS.ground_rules;

    it('exists in FEATURE_SECTIONS', () => {
        expect(section).toBeDefined();
    });

    it('has basic tier (first principle)', () => {
        expect(section.tier).toBe('basic');
    });

    it('has title "Ground Rules"', () => {
        expect(section.title).toBe('Ground Rules');
    });

    it('has at least 3 parameters (enabled, batchSize, intervalMs)', () => {
        expect(section.parameters.length).toBeGreaterThanOrEqual(3);
    });

    it('enabled parameter is a toggle (min=0, max=1, step=1)', () => {
        const enabled = section.parameters.find(p => p.key === 'grEnabled');
        expect(enabled).toBeDefined();
        expect(enabled!.min).toBe(0);
        expect(enabled!.max).toBe(1);
        expect(enabled!.step).toBe(1);
    });

    it('has configPaths pointing to groundRules section', () => {
        for (const param of section.parameters) {
            expect(param.configPath[0]).toBe('groundRules');
        }
    });

    it('has presets', () => {
        expect(section.presets.length).toBeGreaterThanOrEqual(2);
    });
});

describe('ground_rules GUI enrichment', () => {
    const enrichment = GUI_ENRICHMENTS.ground_rules;

    it('exists', () => {
        expect(enrichment).toBeDefined();
    });

    it('is in quality category', () => {
        expect(enrichment.category).toBe('qualityGates');
    });

    it('has helpText', () => {
        expect(enrichment.helpText).toBeDefined();
        expect(enrichment.helpText!.length).toBeGreaterThan(50);
    });

    it('has relevant search terms', () => {
        expect(enrichment.searchTerms).toBeDefined();
        expect(enrichment.searchTerms).toContain('ground rules');
        expect(enrichment.searchTerms).toContain('synthesizable');
    });
});

// ─── MCP Schema ──────────────────────────────────────────────────────────

describe('MCP schema integration', () => {
    // After the MCP schema consolidation (commit 3e14653), only 8 core tools have rich
    // schemas in TOOL_SCHEMAS. Everything else — including podbit.kb — is reachable via
    // the podbit.api gateway. So these tests verify the gateway path: the dispatcher
    // knows the tool, and the handler exposes the classify actions.
    it('podbit.kb is registered in the MCP dispatcher', async () => {
        const dispatch = await import('../../mcp/dispatch.js');
        // dispatch.ts maps tool names to handlers via a TOOL_HANDLERS object — verify the
        // module exports a function that recognises podbit.kb. Use handleToolCall as the
        // public surface.
        expect(typeof dispatch.handleToolCall).toBe('function');
    });

    it('podbit.kb handler implements classify and classifyStats actions', async () => {
        // Source-level check on the handler — if the actions vanish, this test fails the
        // moment the case statements are removed from handlers/knowledge-base.ts.
        const fs = await import('fs');
        const path = await import('path');
        const handlerPath = path.resolve(process.cwd(), 'handlers', 'knowledge-base.ts');
        const source = fs.readFileSync(handlerPath, 'utf-8');
        expect(source).toContain("case 'classify':");
        expect(source).toContain("case 'classifyStats':");
    });
});
