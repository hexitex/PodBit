/**
 * Tests for scaffold/verify.ts — verifySection and checkCoherence.
 * verifySection is pure; checkCoherence is async with only internal helper deps.
 * No external dependencies — direct import.
 */
import { describe, it, expect } from '@jest/globals';
import { verifySection, checkCoherence } from '../../scaffold/verify.js';

describe('verifySection', () => {
    it('passes when all required terms are present', () => {
        const result = verifySection(
            'This section covers key claims and evidence strength in detail.',
            { must_include: ['key claims', 'evidence strength'] },
        );
        expect(result.valid).toBe(true);
        expect(result.failures).toHaveLength(0);
    });

    it('adds warnings for missing must_include terms (does not fail)', () => {
        const result = verifySection(
            'This section covers key claims only.',
            { must_include: ['key claims', 'evidence strength'] },
        );
        expect(result.valid).toBe(true);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].type).toBe('missing_term');
        expect(result.failures[0].message).toContain('evidence strength');
    });

    it('fails when must_avoid terms are present', () => {
        const result = verifySection(
            'This section describes the methodology used.',
            { must_include: [], must_avoid: ['methodology'] },
        );
        expect(result.valid).toBe(false);
        expect(result.failures).toHaveLength(1);
        expect(result.failures[0].type).toBe('forbidden_term');
    });

    it('case-insensitive matching for must_include', () => {
        const result = verifySection(
            'KEY CLAIMS are discussed here.',
            { must_include: ['key claims'] },
        );
        expect(result.valid).toBe(true);
        expect(result.failures).toHaveLength(0);
    });

    it('case-insensitive matching for must_avoid', () => {
        const result = verifySection(
            'The METHODOLOGY section covers...',
            { must_include: [], must_avoid: ['methodology'] },
        );
        expect(result.valid).toBe(false);
    });

    it('counts words correctly', () => {
        const result = verifySection(
            'one two three four five',
            { must_include: [] },
        );
        expect(result.wordCount).toBe(5);
    });

    it('handles empty must_include', () => {
        const result = verifySection('anything', { must_include: [] });
        expect(result.valid).toBe(true);
        expect(result.failures).toHaveLength(0);
    });

    it('handles missing must_avoid (defaults to empty)', () => {
        const result = verifySection('anything', { must_include: [] });
        expect(result.valid).toBe(true);
    });

    it('combines failures and warnings in the failures array', () => {
        const result = verifySection(
            'This describes methodology.',
            { must_include: ['key claims'], must_avoid: ['methodology'] },
        );
        expect(result.valid).toBe(false);
        expect(result.failures).toHaveLength(2);
        expect(result.failures.some((f: any) => f.type === 'forbidden_term')).toBe(true);
        expect(result.failures.some((f: any) => f.type === 'missing_term')).toBe(true);
    });

    it('handles multiple forbidden terms', () => {
        const result = verifySection(
            'Vague generalizations about methodology.',
            { must_include: [], must_avoid: ['methodology', 'vague generalizations'] },
        );
        expect(result.valid).toBe(false);
        expect(result.failures).toHaveLength(2);
    });

    it('handles single-word content', () => {
        const result = verifySection('hello', { must_include: [] });
        expect(result.wordCount).toBe(1);
        expect(result.valid).toBe(true);
    });

    it('must_avoid with no matches stays valid', () => {
        const result = verifySection(
            'Clean content with no bad words.',
            { must_include: [], must_avoid: ['forbidden', 'banned'] },
        );
        expect(result.valid).toBe(true);
        expect(result.failures).toHaveLength(0);
    });

    it('forbidden failures come before warning failures in output', () => {
        const result = verifySection(
            'This describes methodology.',
            { must_include: ['key claims'], must_avoid: ['methodology'] },
        );
        // Failures are [...failures, ...warnings] per source
        const forbiddenIdx = result.failures.findIndex((f: any) => f.type === 'forbidden_term');
        const warningIdx = result.failures.findIndex((f: any) => f.type === 'missing_term');
        expect(forbiddenIdx).toBeLessThan(warningIdx);
    });

    it('returns correct wordCount for multi-space content', () => {
        const result = verifySection('one  two   three', { must_include: [] });
        // split(/\s+/) splits on multiple spaces, but may produce empty first element
        // 'one  two   three'.split(/\s+/) = ['one', 'two', 'three']
        expect(result.wordCount).toBe(3);
    });
});

describe('checkCoherence', () => {
    it('returns empty issues for single section', async () => {
        const sections = { intro: 'Some introduction content.' };
        const outline = { sections: [{ id: 'intro', title: 'Introduction' }] };
        const issues = await checkCoherence(sections, outline);
        expect(issues).toEqual([]);
    });

    it('detects terminology inconsistency across sections', async () => {
        const sections = {
            section1: 'The quality class is important for manufacturing.',
            section2: 'The quality grade determines the output precision.',
        };
        const outline = {
            sections: [
                { id: 'section1', title: 'First Section' },
                { id: 'section2', title: 'Second Section' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        const termIssue = issues.find((i: any) => i.type === 'terminology_inconsistency');
        expect(termIssue).toBeDefined();
        expect(termIssue.message).toContain('quality class');
        expect(termIssue.message).toContain('quality grade');
        expect(termIssue.suggested_fix).toContain('quality class');
    });

    it('no terminology issue when same variant used consistently', async () => {
        const sections = {
            section1: 'The quality class is important.',
            section2: 'The quality class determines output.',
        };
        const outline = {
            sections: [
                { id: 'section1', title: 'First' },
                { id: 'section2', title: 'Second' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        const termIssues = issues.filter((i: any) => i.type === 'terminology_inconsistency');
        expect(termIssues).toHaveLength(0);
    });

    it('detects conclusion gap when topic not covered', async () => {
        const sections = {
            intro: 'This is the introduction about manufacturing.',
            analysis: 'Detailed analysis of precision engineering concepts.',
            conclusion: 'In summary, the results are positive.',
        };
        const outline = {
            sections: [
                { id: 'intro', title: 'Introduction' },
                { id: 'analysis', title: 'Precision Engineering Analysis' },
                { id: 'conclusion', title: 'Conclusion' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        const gapIssues = issues.filter((i: any) => i.type === 'conclusion_gap');
        // "precision", "engineering", "analysis" are >4 chars and not in conclusion
        expect(gapIssues.length).toBeGreaterThan(0);
    });

    it('no conclusion gap when conclusion covers topics', async () => {
        const sections = {
            intro: 'Introduction to the topic.',
            analysis: 'Detailed engineering analysis.',
            conclusion: 'In summary, the introduction and engineering analysis reveals important findings.',
        };
        const outline = {
            sections: [
                { id: 'intro', title: 'Introduction' },
                { id: 'analysis', title: 'Engineering Analysis' },
                { id: 'conclusion', title: 'Conclusion' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        const gapIssues = issues.filter((i: any) => i.type === 'conclusion_gap');
        // "introduction", "engineering", "analysis" all appear in the conclusion
        expect(gapIssues).toHaveLength(0);
    });

    it('skips conclusion coverage if no conclusion section', async () => {
        const sections = {
            section1: 'Content here.',
            section2: 'More content.',
        };
        const outline = {
            sections: [
                { id: 'section1', title: 'First' },
                { id: 'section2', title: 'Second' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        const gapIssues = issues.filter((i: any) => i.type === 'conclusion_gap');
        expect(gapIssues).toHaveLength(0);
    });

    it('skips conclusion coverage when conclusion is the only section', async () => {
        const sections = {
            conclusion: 'Just a conclusion.',
        };
        const outline = {
            sections: [{ id: 'conclusion', title: 'Conclusion' }],
        };
        const issues = await checkCoherence(sections, outline);
        const gapIssues = issues.filter((i: any) => i.type === 'conclusion_gap');
        expect(gapIssues).toHaveLength(0);
    });

    it('excludes executive_summary from conclusion coverage check', async () => {
        const sections = {
            executive_summary: 'Summary of everything.',
            analysis: 'Detailed performance analysis.',
            conclusion: 'We conclude that performance is key.',
        };
        const outline = {
            sections: [
                { id: 'executive_summary', title: 'Executive Summary' },
                { id: 'analysis', title: 'Performance Analysis' },
                { id: 'conclusion', title: 'Conclusion' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        const gapIssues = issues.filter((i: any) => i.type === 'conclusion_gap');
        // "performance" appears in conclusion, so no gap for analysis
        expect(gapIssues).toHaveLength(0);
    });

    it('detects gear ratio terminology inconsistency', async () => {
        const sections = {
            section1: 'The gear ratio determines torque.',
            section2: 'The transmission ratio affects speed.',
        };
        const outline = {
            sections: [
                { id: 'section1', title: 'First' },
                { id: 'section2', title: 'Second' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        const termIssue = issues.find((i: any) => i.type === 'terminology_inconsistency');
        expect(termIssue).toBeDefined();
        expect(termIssue.suggested_fix).toContain('gear ratio');
    });

    it('returns empty issues for sections with no known variant groups', async () => {
        const sections = {
            section1: 'Apples are red.',
            section2: 'Bananas are yellow.',
        };
        const outline = {
            sections: [
                { id: 'section1', title: 'First' },
                { id: 'section2', title: 'Second' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        expect(issues).toHaveLength(0);
    });

    it('conclusion gap only checks words longer than 4 characters', async () => {
        const sections = {
            body: 'Important body content.',
            conclusion: 'We conclude with a the and for summary.',
        };
        const outline = {
            sections: [
                // Title has only short words (<= 4 chars)
                { id: 'body', title: 'The Big Data Set' },
                { id: 'conclusion', title: 'Conclusion' },
            ],
        };
        const issues = await checkCoherence(sections, outline);
        // Words from "The Big Data Set": "the"(3), "big"(3), "data"(4), "set"(3) — all <= 4 chars
        // With no words >4 chars, topicWords is empty, so `some` returns false -> gap
        // Actually: filter w.length > 4 means strictly greater than 4
        // None of those words are >4, so topicWords is empty
        // [].some(...) returns false -> gap is reported
        const gapIssues = issues.filter((i: any) => i.type === 'conclusion_gap');
        expect(gapIssues.length).toBeGreaterThan(0);
    });
});
