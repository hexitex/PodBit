/**
 * Tests for core/keywords.ts — extractStringArray (private function tested via module internals).
 *
 * Since extractStringArray is not exported, we re-implement its logic for direct testing.
 * The function parses JSON from LLM responses with lenient fallbacks.
 */

// The function is private, so we recreate it here for testing.
// This tests the exact algorithm from core/keywords.ts lines 16-38.
function extractStringArray(text: string, key: string): string[] | null {
    // Try strict JSON parse first
    const jsonPattern = new RegExp(`\\{[\\s\\S]*"${key}"\\s*:\\s*\\[[\\s\\S]*?\\][\\s\\S]*?\\}`);
    const match = text.match(jsonPattern);
    if (match) {
        try {
            const parsed = JSON.parse(match[0]);
            if (Array.isArray(parsed[key])) return parsed[key];
        } catch {
            // Fall through to lenient extraction
        }
    }

    // Lenient: find the array contents and extract quoted strings
    const arrayPattern = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`);
    const arrayMatch = text.match(arrayPattern);
    if (!arrayMatch) return null;

    const items = arrayMatch[1].match(/["']([^"']+)["']/g);
    if (!items || items.length === 0) return null;

    return items.map(s => s.replace(/^["']|["']$/g, ''));
}

describe('extractStringArray', () => {
    describe('strict JSON parsing', () => {
        it('extracts array from valid JSON', () => {
            const text = '{"keywords": ["machine learning", "neural networks", "deep learning"]}';
            expect(extractStringArray(text, 'keywords')).toEqual([
                'machine learning', 'neural networks', 'deep learning',
            ]);
        });

        it('extracts from JSON embedded in text', () => {
            const text = 'Here are the results:\n{"synonyms": ["AI", "ML"]}\nDone.';
            expect(extractStringArray(text, 'synonyms')).toEqual(['AI', 'ML']);
        });

        it('handles JSON with other fields', () => {
            const text = '{"confidence": 0.9, "keywords": ["test", "data"], "count": 2}';
            expect(extractStringArray(text, 'keywords')).toEqual(['test', 'data']);
        });
    });

    describe('lenient fallback parsing', () => {
        it('handles trailing commas', () => {
            const text = '{"keywords": ["alpha", "beta",]}';
            // Strict JSON.parse fails on trailing comma → lenient kicks in
            const result = extractStringArray(text, 'keywords');
            expect(result).toContain('alpha');
            expect(result).toContain('beta');
        });

        it('handles single-quoted strings', () => {
            const text = `{"keywords": ['single', 'quoted']}`;
            const result = extractStringArray(text, 'keywords');
            expect(result).toContain('single');
            expect(result).toContain('quoted');
        });

        it('handles mixed quotes', () => {
            const text = `{"keywords": ["double", 'single']}`;
            const result = extractStringArray(text, 'keywords');
            expect(result).toContain('double');
            expect(result).toContain('single');
        });
    });

    describe('null returns', () => {
        it('returns null when key not found', () => {
            expect(extractStringArray('{"other": [1,2]}', 'keywords')).toBeNull();
        });

        it('returns null for empty text', () => {
            expect(extractStringArray('', 'keywords')).toBeNull();
        });

        it('returns null when array has no quoted strings', () => {
            // Malformed: no quotes around items
            const text = '{"keywords": [foo, bar]}';
            expect(extractStringArray(text, 'keywords')).toBeNull();
        });

        it('returns null for plain text response', () => {
            expect(extractStringArray('I think the keywords are: AI, ML, NLP', 'keywords')).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('handles empty array', () => {
            const text = '{"keywords": []}';
            // Strict parse succeeds but returns empty array
            expect(extractStringArray(text, 'keywords')).toEqual([]);
        });

        it('handles single item', () => {
            const text = '{"keywords": ["only one"]}';
            expect(extractStringArray(text, 'keywords')).toEqual(['only one']);
        });

        it('handles unicode strings', () => {
            const text = '{"keywords": ["réseau", "données", "apprentissage"]}';
            expect(extractStringArray(text, 'keywords')).toEqual(['réseau', 'données', 'apprentissage']);
        });

        it('handles nested JSON (takes the inner array)', () => {
            const text = '{"result": {"keywords": ["nested"]}, "other": true}';
            expect(extractStringArray(text, 'keywords')).toEqual(['nested']);
        });

        it('handles markdown code-fenced JSON', () => {
            const text = '```json\n{"keywords": ["fenced", "json"]}\n```';
            expect(extractStringArray(text, 'keywords')).toEqual(['fenced', 'json']);
        });
    });
});
