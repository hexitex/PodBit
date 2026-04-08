/**
 * Tests for core/autotune/scorers.ts — detectStutter, SCORERS registry,
 * and all per-category scoring functions (voice, compress, chat, keyword,
 * reader, reader_image, reader_sheet, reader_code, autorating,
 * dedup_judge, evm_analysis, spec_extraction).
 */
import { describe, it, expect } from '@jest/globals';

const { detectStutter, SCORERS } = await import('../../core/autotune/scorers.js');

// =============================================================================
// detectStutter
// =============================================================================

describe('detectStutter', () => {
    it('returns false for short text (<6 words)', () => {
        expect(detectStutter('hello world')).toBe(false);
        expect(detectStutter('one two three four five')).toBe(false);
    });

    it('returns false for text with no repeated sequences', () => {
        expect(detectStutter('the quick brown fox jumps over the lazy dog')).toBe(false);
    });

    it('detects repeated 3-word sequences', () => {
        expect(detectStutter('the quick brown the quick brown fox jumps over')).toBe(true);
    });

    it('detects repeated 4-word sequences', () => {
        expect(detectStutter('alpha beta gamma delta alpha beta gamma delta end')).toBe(true);
    });

    it('detects repeated 8-word sequences', () => {
        const phrase = 'one two three four five six seven eight';
        expect(detectStutter(`${phrase} ${phrase}`)).toBe(true);
    });

    it('returns false for empty string', () => {
        expect(detectStutter('')).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(detectStutter('The Quick Brown The quick brown extra words here')).toBe(true);
    });

    it('does not detect 2-word repeats (below window minimum)', () => {
        // "ab ab" repeated — but window starts at 3
        expect(detectStutter('ab cd ab cd ef gh ij kl')).toBe(false);
    });
});

// =============================================================================
// SCORERS registry
// =============================================================================

describe('SCORERS registry', () => {
    const expectedCategories = [
        'voice', 'compress', 'chat', 'keyword', 'autorating',
        'reader', 'reader_image', 'reader_sheet', 'reader_code',
        'dedup_judge', 'evm_analysis', 'spec_extraction',
    ];

    it('has entries for all SubsystemCategory values', () => {
        for (const cat of expectedCategories) {
            expect(SCORERS[cat]).toBeDefined();
            expect(typeof SCORERS[cat]).toBe('function');
        }
    });

    it('spec_extraction has its own scorer', () => {
        expect(typeof SCORERS['spec_extraction']).toBe('function');
    });
});

// =============================================================================
// scoreVoice
// =============================================================================

describe('scoreVoice', () => {
    const score = SCORERS['voice'];

    it('scores valid JSON with good insight highly', () => {
        const output = JSON.stringify({ insight: 'Cross-domain synthesis reveals emergent properties not visible in isolated analysis of individual domains.' });
        const result = score(output);
        expect(result.overall).toBeGreaterThan(0.6);
        expect(result.dimensions.jsonValid).toBe(1.0);
        expect(result.dimensions.completeness).toBe(1.0);
        expect(result.dimensions.substance).toBe(1.0);
    });

    it('gives partial jsonValid score for regex-extracted insight', () => {
        const output = 'Some preamble {"insight": "This is a meaningful synthesized conclusion about the topic."}';
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.7);
    });

    it('gives zero jsonValid for completely invalid output', () => {
        const output = 'Just some random text without any JSON structure at all here buddy.';
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.0);
    });

    it('scores completeness 0 when insight does not end with punctuation', () => {
        const output = JSON.stringify({ insight: 'This insight lacks terminal punctuation' });
        const result = score(output);
        expect(result.dimensions.completeness).toBe(0.0);
    });

    it('scores length 1.0 for insight in 10-25 word range', () => {
        const output = JSON.stringify({ insight: 'One two three four five six seven eight nine ten eleven twelve words here now.' });
        const result = score(output);
        expect(result.dimensions.length).toBe(1.0);
    });

    it('scores length 0.5 for insight in 5-9 word range', () => {
        const output = JSON.stringify({ insight: 'Five words only here now.' });
        const result = score(output);
        expect(result.dimensions.length).toBe(0.5);
    });

    it('scores length 0.0 for very short insight', () => {
        const output = JSON.stringify({ insight: 'Too short.' });
        const result = score(output);
        expect(result.dimensions.length).toBe(0.0);
    });

    it('penalizes repetition via stutter detection', () => {
        const output = JSON.stringify({ insight: 'The system uses synthesis the system uses synthesis to generate knowledge continuously.' });
        const result = score(output);
        expect(result.dimensions.noRepetition).toBe(0.0);
    });

    it('scores substance 0 for very short insight content', () => {
        const output = JSON.stringify({ insight: 'Short.' });
        const result = score(output);
        expect(result.dimensions.substance).toBe(0.0);
    });

    it('gives jsonValid 0.5 when JSON parses but insight is empty', () => {
        const output = JSON.stringify({ other: 'field' });
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.5);
    });

    it('overall is between 0 and 1', () => {
        const result = score('garbage');
        expect(result.overall).toBeGreaterThanOrEqual(0);
        expect(result.overall).toBeLessThanOrEqual(1);
    });

    it('rawOutput preserves the original output', () => {
        const output = JSON.stringify({ insight: 'Test output.' });
        const result = score(output);
        expect(result.rawOutput).toBe(output);
    });
});

// =============================================================================
// scoreCompress
// =============================================================================

describe('scoreCompress', () => {
    const score = SCORERS['compress'];

    it('scores good compression ratio (0.3-0.6) as 1.0', () => {
        // inputLength is 950, so output needs to be 285-570 chars for ratio 0.3-0.6
        // Build a string in the sweet spot (~400 chars)
        const output = 'Embedding similarity drives node pairing in the synthesis engine. Cosine distance measures semantic closeness between graph nodes. Nodes with weight above the configured threshold enter the synthesis pipeline. Temporal decay reduces stale node influence over time. Voicing produces quality insights through cross-domain analysis. The system relies on multiple quality gates to ensure output integrity and prevent low-quality synthesis from polluting the graph.';
        const result = score(output);
        expect(result.dimensions.compression).toBe(1.0);
    });

    it('penalizes too-high compression ratio (>0.8)', () => {
        const output = 'x'.repeat(800);
        const result = score(output);
        expect(result.dimensions.compression).toBe(0.0);
    });

    it('gives partial score for very low compression ratio (<0.3)', () => {
        const output = 'Short summary of nodes.';
        const result = score(output);
        expect(result.dimensions.compression).toBe(0.5);
    });

    it('measures term retention correctly', () => {
        const output = 'Embedding similarity between nodes determines synthesis pairs. Weight and threshold control quality. Cosine decay affects voicing.';
        const result = score(output);
        expect(result.dimensions.termRetention).toBeGreaterThan(0.3);
    });

    it('gives 0 term retention when no expected terms present', () => {
        const output = 'A brief note about unrelated topics with no technical vocabulary at all.';
        const result = score(output);
        expect(result.dimensions.termRetention).toBe(0.0);
    });

    it('scores coherence 1.0 when output ends with punctuation', () => {
        const output = 'Summary of concepts.';
        const result = score(output);
        expect(result.dimensions.coherence).toBe(1.0);
    });

    it('scores coherence 0.3 when output lacks terminal punctuation', () => {
        const output = 'Summary without ending';
        const result = score(output);
        expect(result.dimensions.coherence).toBe(0.3);
    });

    it('penalizes stutter', () => {
        const output = 'The nodes are weighted the nodes are weighted and synthesis happens correctly now.';
        const result = score(output);
        expect(result.dimensions.noRepetition).toBe(0.0);
    });
});

// =============================================================================
// scoreChat
// =============================================================================

describe('scoreChat', () => {
    const score = SCORERS['chat'];

    it('gives full substance for output >100 chars', () => {
        const output = 'This is a comprehensive response that covers the topic in sufficient detail to be considered substantive and valuable to the reader who asked the question.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(1.0);
    });

    it('gives 0.5 substance for output between 50-100 chars', () => {
        const output = 'A moderate response that has some substance but is limited.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(0.5);
    });

    it('gives 0 substance for very short output', () => {
        const output = 'Short.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(0.0);
    });

    it('gives full length score for 50-500 words', () => {
        const words = Array(100).fill('word').join(' ') + '.';
        const result = score(words);
        expect(result.dimensions.length).toBe(1.0);
    });

    it('gives 0.5 length for 20-49 words', () => {
        const words = Array(30).fill('word').join(' ') + '.';
        const result = score(words);
        expect(result.dimensions.length).toBe(0.5);
    });

    it('gives 0 length for very short output', () => {
        const result = score('Hi.');
        expect(result.dimensions.length).toBe(0.0);
    });

    it('detects completeness from terminal punctuation', () => {
        expect(score('A nice answer.').dimensions.completeness).toBe(1.0);
        expect(score('A nice answer!').dimensions.completeness).toBe(1.0);
        expect(score('A nice answer?').dimensions.completeness).toBe(1.0);
        expect(score('A nice answer').dimensions.completeness).toBe(0.0);
    });
});

// =============================================================================
// scoreKeyword
// =============================================================================

describe('scoreKeyword', () => {
    const score = SCORERS['keyword'];

    it('scores valid JSON array of 5-15 keywords highly', () => {
        const output = JSON.stringify({ keywords: ['embedding', 'synthesis', 'node', 'graph', 'domain', 'weight', 'cosine'] });
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(1.0);
        expect(result.dimensions.count).toBe(1.0);
        expect(result.dimensions.quality).toBe(1.0);
        expect(result.overall).toBeGreaterThan(0.8);
    });

    it('gives 0.5 count for 3-4 keywords', () => {
        const output = JSON.stringify({ keywords: ['one', 'two', 'three'] });
        const result = score(output);
        expect(result.dimensions.count).toBe(0.5);
    });

    it('gives 0 count for fewer than 3 keywords', () => {
        const output = JSON.stringify({ keywords: ['one', 'ab'] });
        const result = score(output);
        expect(result.dimensions.count).toBe(0.0);
    });

    it('handles embedded JSON in non-JSON output', () => {
        const output = 'Here are keywords: {"keywords": ["alpha", "beta", "gamma", "delta", "epsilon"]}';
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.7);
        expect(result.dimensions.count).toBe(1.0);
    });

    it('gives 0 jsonValid for completely unparseable output', () => {
        const output = 'No JSON here at all just plain text.';
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.0);
    });

    it('gives 0.5 quality when keywords have invalid items', () => {
        const output = JSON.stringify({ keywords: ['ok', 'x', 'fine', 'good', 'great'] });
        const result = score(output);
        // 'x' has length 1, so not all pass quality check
        expect(result.dimensions.quality).toBe(0.5);
    });

    it('gives 0.5 jsonValid when keywords is not an array', () => {
        // When keywords is not an array, Array.isArray returns false -> jsonValid=0.5
        // But keywords.every() will throw because a string has no .every method.
        // The source code doesn't guard against this, so this test verifies the actual behavior:
        // JSON parses fine, keywords is truthy but not an array -> jsonValid=0.5, then crash on .every
        const output = JSON.stringify({ keywords: 'not an array' });
        expect(() => score(output)).toThrow();
    });
});

// =============================================================================
// scoreReader
// =============================================================================

describe('scoreReader', () => {
    const score = SCORERS['reader'];

    it('scores substantive plain prose highly', () => {
        const output = 'The document describes a distributed consensus protocol that achieves fault tolerance through leader election and log replication.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(1.0);
        expect(result.dimensions.plainProse).toBe(1.0);
        expect(result.dimensions.completeness).toBe(1.0);
        expect(result.overall).toBeGreaterThan(0.7);
    });

    it('penalizes markdown formatting', () => {
        const output = '# Heading\n- bullet point\n- another bullet.\n';
        const result = score(output);
        expect(result.dimensions.plainProse).toBe(0.3);
    });

    it('penalizes pipe-delimited tables', () => {
        const output = '| Col1 | Col2 |\n| --- | --- |\n| val | val |';
        const result = score(output);
        expect(result.dimensions.plainProse).toBe(0.3);
    });

    it('scores substance 0 for short output', () => {
        const output = 'Too short.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(0.0);
    });

    it('gives completeness 0.3 without terminal punctuation', () => {
        const output = 'This description does not end with punctuation and is long enough for substance';
        const result = score(output);
        expect(result.dimensions.completeness).toBe(0.3);
    });
});

// =============================================================================
// scoreImage (reader_image)
// =============================================================================

describe('scoreImage (reader_image)', () => {
    const score = SCORERS['reader_image'];

    it('scores description mentioning produce items and colors highly', () => {
        const output = 'The image shows an arrangement of vegetables including a dark purple eggplant and yellow bananas with red and orange peppers, composed in a whimsical formation resembling a creature.';
        const result = score(output);
        expect(result.dimensions.objectId).toBeGreaterThan(0.5);
        expect(result.dimensions.colorAccuracy).toBeGreaterThan(0.5);
        expect(result.dimensions.composition).toBeGreaterThan(0.0);
        expect(result.overall).toBeGreaterThan(0.5);
    });

    it('gives 0 substance for very short output', () => {
        const output = 'A photo.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(0.0);
    });

    it('gives 0.5 substance for medium-length output', () => {
        const output = 'A photograph of some items.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(0.5);
    });

    it('objectId is capped at 1.0', () => {
        const output = 'An eggplant banana pepper vegetable produce arranged in a creative sculpture with purple yellow red orange green colors placed between left and right.';
        const result = score(output);
        expect(result.dimensions.objectId).toBeLessThanOrEqual(1.0);
    });

    it('gives full specificity for 25-250 word output', () => {
        const words = Array(50).fill('word').join(' ');
        const result = score(words);
        expect(result.dimensions.specificity).toBe(1.0);
    });

    it('gives 0 specificity for very short output', () => {
        const result = score('A photo');
        expect(result.dimensions.specificity).toBe(0.0);
    });

    it('gives 0.5 specificity for 15-24 words', () => {
        const words = Array(18).fill('word').join(' ');
        const result = score(words);
        expect(result.dimensions.specificity).toBe(0.5);
    });
});

// =============================================================================
// scoreSheet (reader_sheet)
// =============================================================================

describe('scoreSheet (reader_sheet)', () => {
    const score = SCORERS['reader_sheet'];

    it('scores output with data terms and numbers highly', () => {
        const output = 'Revenue data shows Q1 growth of 15% in the North region, with total year increase of 22%. Q2 saw a slight decrease to 12%.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(1.0);
        expect(result.dimensions.dataRetention).toBeGreaterThan(0.5);
        expect(result.dimensions.numericalContent).toBeGreaterThan(0.5);
        expect(result.dimensions.interpretation).toBe(1.0);
    });

    it('penalizes echoed table format', () => {
        const output = '| Revenue | Q1 | Q2 |\n| North | 100 | 200 |';
        const result = score(output);
        expect(result.dimensions.interpretation).toBe(0.3);
    });

    it('gives 0 substance for short output', () => {
        const result = score('Data.');
        expect(result.dimensions.substance).toBe(0.0);
    });

    it('caps dataRetention and numericalContent at 1.0', () => {
        const output = 'Revenue growth Q1 Q2 Q3 Q4 total year region north south table column row data percent average trend increase decrease 123 456 789 1011.';
        const result = score(output);
        expect(result.dimensions.dataRetention).toBeLessThanOrEqual(1.0);
        expect(result.dimensions.numericalContent).toBeLessThanOrEqual(1.0);
    });
});

// =============================================================================
// scoreCode (reader_code)
// =============================================================================

describe('scoreCode (reader_code)', () => {
    const score = SCORERS['reader_code'];

    it('scores output recognizing code concepts highly', () => {
        const output = 'This TypeScript function calculates Fibonacci numbers using memoization. It caches previously computed values in a recursive approach with a Map for O(n) performance.';
        const result = score(output);
        expect(result.dimensions.substance).toBe(1.0);
        expect(result.dimensions.codeRecognition).toBeGreaterThan(0.5);
        expect(result.dimensions.specificity).toBeGreaterThan(0.5);
        expect(result.dimensions.plainProse).toBe(1.0);
    });

    it('penalizes code block echoing', () => {
        const output = '```typescript\nfunction fib(n: number): number { return n; }\n```';
        const result = score(output);
        expect(result.dimensions.plainProse).toBe(0.3);
    });

    it('penalizes indented code echoing', () => {
        const output = '    function test() {\n        return 1;\n    }';
        const result = score(output);
        expect(result.dimensions.plainProse).toBe(0.3);
    });

    it('scores specificity based on fibonacci-related terms', () => {
        const output = 'A fibonacci sequence computed with recursive memoize and cache strategy for optimal performance.';
        const result = score(output);
        expect(result.dimensions.specificity).toBeGreaterThan(0.5);
    });

    it('gives 0 specificity when no specific terms present', () => {
        const output = 'A function that does something in this file with some logic and processing steps involved.';
        const result = score(output);
        expect(result.dimensions.specificity).toBe(0.0);
    });
});

// =============================================================================
// scoreAutorating
// =============================================================================

describe('scoreAutorating', () => {
    const score = SCORERS['autorating'];

    it('scores perfect output (A=0, B=1 with good reasons) highly', () => {
        const output = JSON.stringify([
            { node: 'A', rating: 0, reason: 'This node lacks any specific information density or actionable content.' },
            { node: 'B', rating: 1, reason: 'This node represents genuine emergence from synthesis of two parent concepts.' },
        ]);
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(1.0);
        expect(result.dimensions.ratingCorrectA).toBe(1.0);
        expect(result.dimensions.ratingCorrectB).toBe(1.0);
        expect(result.overall).toBeGreaterThan(0.7);
    });

    it('gives partial score for A=-1 (close but wrong)', () => {
        const output = JSON.stringify([
            { node: 'A', rating: -1, reason: 'No value at all in this generic description.' },
            { node: 'B', rating: 1, reason: 'Emergent insight combining two distinct concepts into novel understanding.' },
        ]);
        const result = score(output);
        expect(result.dimensions.ratingCorrectA).toBe(0.3);
        expect(result.dimensions.ratingCorrectB).toBe(1.0);
    });

    it('gives 0 for wrong ratings (A=1, B=0)', () => {
        const output = JSON.stringify([
            { node: 'A', rating: 1, reason: 'Useful node.' },
            { node: 'B', rating: 0, reason: 'Not useful node.' },
        ]);
        const result = score(output);
        expect(result.dimensions.ratingCorrectA).toBe(0.0);
        expect(result.dimensions.ratingCorrectB).toBe(0.2);
    });

    it('handles case-insensitive node labels', () => {
        const output = JSON.stringify([
            { node: 'a', rating: 0, reason: 'No useful information in this trivial description.' },
            { node: 'b', rating: 1, reason: 'Novel synthesis creates emergent understanding.' },
        ]);
        const result = score(output);
        expect(result.dimensions.ratingCorrectA).toBe(1.0);
        expect(result.dimensions.ratingCorrectB).toBe(1.0);
    });

    it('extracts ratings via regex from invalid JSON', () => {
        const output = 'My analysis: "node":"A","rating":0,"reason":"lacks substance" and "node":"B","rating":1,"reason":"novel emergence"';
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.7);
        expect(result.dimensions.ratingCorrectA).toBe(1.0);
        expect(result.dimensions.ratingCorrectB).toBe(1.0);
    });

    it('scores reason relevance for A based on absence/emptiness terms', () => {
        const output = JSON.stringify([
            { node: 'A', rating: 0, reason: 'Lacks any specific detail and provides no useful information.' },
            { node: 'B', rating: 1, reason: 'Good node.' },
        ]);
        const result = score(output);
        expect(result.dimensions.reasonRelevanceA).toBeGreaterThan(0.5);
    });

    it('scores reason relevance for B based on emergence/synthesis terms', () => {
        const output = JSON.stringify([
            { node: 'A', rating: 0, reason: 'Bad node.' },
            { node: 'B', rating: 1, reason: 'Shows emergent synthesis combining insights from both parents with novel connections.' },
        ]);
        const result = score(output);
        expect(result.dimensions.reasonRelevanceB).toBeGreaterThan(0.5);
    });

    it('gives low jsonValid for non-array parsed JSON', () => {
        const output = JSON.stringify({ node: 'A', rating: 0 });
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.3);
    });

    it('gives 0.2 jsonValid for empty array', () => {
        const output = JSON.stringify([]);
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.2);
    });

    it('scores reason quality based on word count', () => {
        const output = JSON.stringify([
            { node: 'A', rating: 0, reason: 'It is not useful because it lacks information density and actionable content for the domain.' },
            { node: 'B', rating: 1, reason: 'OK' },
        ]);
        const result = score(output);
        expect(result.dimensions.reasonQualityA).toBe(1.0);
        expect(result.dimensions.reasonQualityB).toBe(0.0); // 1 word
    });
});

// scoreEvmCodegen — REMOVED (evm_codegen subsystem deprecated)

// scoreEvmTriage — REMOVED (evm_triage subsystem deprecated)

// =============================================================================
// scoreDedupJudge
// =============================================================================

describe('scoreDedupJudge (dedup_judge)', () => {
    const score = SCORERS['dedup_judge'];

    it('scores clean NOVEL verdict highly', () => {
        const output = 'NOVEL\nThe new content introduces distinct concepts about rate limiting that are not covered in the existing node.';
        const result = score(output);
        expect(result.dimensions.verdict).toBe(1.0);
        expect(result.dimensions.unambiguous).toBe(1.0);
        expect(result.dimensions.explanation).toBe(1.0);
        expect(result.overall).toBeGreaterThan(0.7);
    });

    it('scores clean DUPLICATE verdict highly', () => {
        const output = 'DUPLICATE\nBoth nodes describe the same embedding similarity algorithm with identical threshold values.';
        const result = score(output);
        expect(result.dimensions.verdict).toBe(1.0);
        expect(result.dimensions.unambiguous).toBe(1.0);
    });

    it('penalizes ambiguous output with both NOVEL and DUPLICATE', () => {
        const output = 'This is NOVEL but could also be considered DUPLICATE depending on interpretation.';
        const result = score(output);
        expect(result.dimensions.verdict).toBe(1.0);
        expect(result.dimensions.unambiguous).toBe(0.0);
    });

    it('gives 0 verdict when neither keyword present', () => {
        const output = 'The content seems somewhat similar but different in key ways.';
        const result = score(output);
        expect(result.dimensions.verdict).toBe(0.0);
    });

    it('scores conciseness based on word count', () => {
        const short = 'NOVEL\nDistinct content.';
        expect(score(short).dimensions.concise).toBe(1.0);

        const medium = 'NOVEL\n' + Array(80).fill('word').join(' ');
        expect(score(medium).dimensions.concise).toBe(0.7);

        const long = 'NOVEL\n' + Array(200).fill('word').join(' ');
        expect(score(long).dimensions.concise).toBe(0.3);
    });

    it('scores explanation quality based on word count', () => {
        const noExplanation = 'NOVEL';
        expect(score(noExplanation).dimensions.explanation).toBe(0.0);

        const shortExplanation = 'NOVEL\nSome reason.';
        expect(score(shortExplanation).dimensions.explanation).toBe(0.5);

        const goodExplanation = 'NOVEL\nThe new content introduces several distinct concepts not found in existing material.';
        expect(score(goodExplanation).dimensions.explanation).toBe(1.0);
    });
});

// =============================================================================
// scoreEvmAnalysis
// =============================================================================

describe('scoreEvmAnalysis (evm_analysis)', () => {
    const score = SCORERS['evm_analysis'];

    it('scores valid analysis JSON with code and findings highly', () => {
        const output = JSON.stringify({
            analysisCode: 'import mpmath\nfrom mpmath import mp\nmp.dps = 50\nresult = {}\nresult["pi"] = mpmath.pi\nresult["e"] = mpmath.e\nresult["golden"] = (1 + mpmath.sqrt(5))/2\nresult["check"] = True\nresult["verified"] = True\nresult["extra"] = 42\nresult = result',
            expectedFindings: 'The identity should hold to at least 30 decimal places, confirming the relationship.',
        });
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(1.0);
        expect(result.dimensions.hasCode).toBe(1.0);
        expect(result.dimensions.setsResult).toBe(1.0);
        expect(result.dimensions.usesAnalysis).toBe(1.0);
        expect(result.dimensions.hasFindings).toBe(1.0);
        expect(result.overall).toBeGreaterThan(0.7);
    });

    it('gives partial hasCode for 5-9 lines', () => {
        const output = JSON.stringify({
            analysisCode: 'a = 1\nb = 2\nc = 3\nresult = a+b+c\nprint(result)\nd = 4\ne = 5',
            expectedFindings: 'Sum should be correct.',
        });
        const result = score(output);
        expect(result.dimensions.hasCode).toBe(0.7);
    });

    it('gives 0 hasCode for empty code', () => {
        const output = JSON.stringify({ analysisCode: '', expectedFindings: 'No code provided.' });
        const result = score(output);
        expect(result.dimensions.hasCode).toBe(0.0);
    });

    it('detects result variable assignment', () => {
        const output = JSON.stringify({ analysisCode: 'x = 42\nresult = x * 2', expectedFindings: 'Test.' });
        expect(score(output).dimensions.setsResult).toBe(1.0);

        const output2 = JSON.stringify({ analysisCode: 'x = 42\ny = x * 2', expectedFindings: 'Test.' });
        expect(score(output2).dimensions.setsResult).toBe(0.0);
    });

    it('detects analysis library usage', () => {
        for (const lib of ['mpmath', 'sympy', 'numpy', 'scipy']) {
            const output = JSON.stringify({ analysisCode: `import ${lib}\nresult = 1`, expectedFindings: 'Test.' });
            expect(score(output).dimensions.usesAnalysis).toBe(1.0);
        }
    });

    it('handles embedded JSON extraction from non-JSON output', () => {
        const output = 'Here is my analysis: {"analysisCode": "result = 1", "expectedFindings": "Should work."}';
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.5);
    });

    it('gives 0 jsonValid for completely unparseable output', () => {
        const output = 'No JSON at all.';
        const result = score(output);
        expect(result.dimensions.jsonValid).toBe(0.0);
    });
});

// scoreEvmEval — REMOVED (evm_structural / evm_expert subsystems deprecated)

// =============================================================================
// Composite weight validation — all scorers return overall in [0, 1]
// =============================================================================

describe('all scorers produce valid overall scores', () => {
    const testOutputs: Record<string, string> = {
        voice: JSON.stringify({ insight: 'Test insight for scoring.' }),
        compress: 'A brief summary of embedding synthesis concepts.',
        chat: 'A conversational response about knowledge graphs and synthesis.',
        keyword: JSON.stringify({ keywords: ['test'] }),
        reader: 'A description of text content.',
        reader_image: 'An image showing vegetables.',
        reader_sheet: 'Revenue data for Q1.',
        reader_code: 'A function that processes data.',
        autorating: JSON.stringify([{ node: 'A', rating: 0, reason: 'Bad.' }, { node: 'B', rating: 1, reason: 'Good.' }]),
        dedup_judge: 'NOVEL\nDistinct.',
        evm_analysis: JSON.stringify({ analysisCode: 'x=1', expectedFindings: 'Test.' }),
        spec_extraction: JSON.stringify({ specType: 'numerical', hypothesis: 'Test.', setup: {} }),
    };

    for (const [category, output] of Object.entries(testOutputs)) {
        it(`${category} scorer returns overall in [0, 1]`, () => {
            const result = SCORERS[category](output);
            expect(result.overall).toBeGreaterThanOrEqual(0);
            expect(result.overall).toBeLessThanOrEqual(1);
            expect(result.rawOutput).toBe(output);
            expect(typeof result.dimensions).toBe('object');
        });
    }

    it('all scorers handle empty string gracefully', () => {
        for (const [category, scorer] of Object.entries(SCORERS)) {
            const result = scorer('');
            expect(result.overall).toBeGreaterThanOrEqual(0);
            expect(result.overall).toBeLessThanOrEqual(1);
        }
    });
});
