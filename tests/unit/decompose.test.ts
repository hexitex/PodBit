/**
 * Tests for scaffold/decompose.ts — extractJSON (private pure function).
 * Extracts JSON from LLM response: raw JSON, ```json code block, or first {...} in prose.
 */
import { describe, it, expect } from '@jest/globals';

/** Parse JSON from response string; prefers ```json block then first { ... }; throws on parse error. */
function extractJSON(response: string): any {
    let jsonString = response.trim();

    const codeBlockMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
        jsonString = codeBlockMatch[1];
    } else {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonString = jsonMatch[0];
        }
    }

    try {
        return JSON.parse(jsonString);
    } catch (parseError: any) {
        throw new Error(`JSON parse error: ${parseError.message}\n\nLLM returned:\n${response.slice(0, 200)}...`);
    }
}

describe('extractJSON', () => {
    it('parses raw JSON', () => {
        const result = extractJSON('{"key": "value", "num": 42}');
        expect(result).toEqual({ key: 'value', num: 42 });
    });

    it('extracts from markdown code block', () => {
        const result = extractJSON('Here is the JSON:\n```json\n{"sections": ["a", "b"]}\n```\nDone.');
        expect(result).toEqual({ sections: ['a', 'b'] });
    });

    it('extracts from code block without json tag', () => {
        const result = extractJSON('```\n{"data": true}\n```');
        expect(result).toEqual({ data: true });
    });

    it('extracts JSON embedded in prose', () => {
        const result = extractJSON('The outline is: {"title": "Research Brief", "count": 5} as shown.');
        expect(result).toEqual({ title: 'Research Brief', count: 5 });
    });

    it('handles nested objects', () => {
        const result = extractJSON('{"outer": {"inner": "value"}, "list": [1, 2]}');
        expect(result).toEqual({ outer: { inner: 'value' }, list: [1, 2] });
    });

    it('throws on invalid JSON', () => {
        expect(() => extractJSON('not json at all')).toThrow('JSON parse error');
    });

    it('throws on malformed JSON', () => {
        expect(() => extractJSON('{key: value}')).toThrow('JSON parse error');
    });

    it('throws with response preview in error', () => {
        try {
            extractJSON('garbage text that is not json');
            fail('should have thrown');
        } catch (e: any) {
            expect(e.message).toContain('LLM returned:');
        }
    });

    it('handles whitespace around JSON', () => {
        const result = extractJSON('   \n  {"key": "value"}  \n   ');
        expect(result).toEqual({ key: 'value' });
    });

    it('prefers code block over embedded JSON', () => {
        const response = '{"ignored": true}\n```json\n{"used": true}\n```';
        const result = extractJSON(response);
        expect(result).toEqual({ used: true });
    });

    it('handles JSON with string values containing braces', () => {
        const result = extractJSON('{"text": "hello {world}"}');
        expect(result).toEqual({ text: 'hello {world}' });
    });
});
