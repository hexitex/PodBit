/**
 * Tests for proxy/knowledge.ts — injectKnowledge (re-implemented, pure).
 * Prepends or merges knowledge into system message; wrapper text differs by clientHasTools.
 */
import { describe, it, expect } from '@jest/globals';

/** Prepend knowledge to system message (or add new system); returns new messages array. */
function injectKnowledge(
    messages: Array<{ role: string; content: string }>,
    knowledgePrompt: string,
    clientHasTools = false,
): Array<{ role: string; content: string }> {
    const result = [...messages];

    const wrappedKnowledge = clientHasTools
        ? '<knowledge-context>\nThe following domain knowledge may be relevant to the current task. Use it alongside your other capabilities.\n\n' + knowledgePrompt + '\n</knowledge-context>\n\n---\n'
        : '[PRIORITY INSTRUCTION \u2014 READ THIS FIRST]\nYou have been given domain knowledge below. Answer the user\'s question using ONLY this knowledge and your training data. Do NOT use tools, read files, execute commands, or access external resources. Respond directly from the provided context.\n\n<knowledge-context>\n' + knowledgePrompt + '\n</knowledge-context>\n\n---\n';

    const systemIdx = result.findIndex(m => m.role === 'system');

    if (systemIdx >= 0) {
        result[systemIdx] = {
            ...result[systemIdx],
            content: wrappedKnowledge + result[systemIdx].content,
        };
    } else {
        result.unshift({
            role: 'system',
            content: wrappedKnowledge,
        });
    }

    return result;
}

const KNOWLEDGE = 'Domain knowledge: neural networks use backpropagation.';

describe('injectKnowledge — no existing system message', () => {
    it('prepends a new system message when none exists', () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result[0].role).toBe('system');
        expect(result[1].role).toBe('user');
        expect(result).toHaveLength(2);
    });

    it('includes the knowledge prompt in the injected system message', () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result[0].content).toContain(KNOWLEDGE);
    });

    it('uses restrictive wrapper when clientHasTools=false (default)', () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result[0].content).toContain('[PRIORITY INSTRUCTION');
        expect(result[0].content).toContain('Do NOT use tools');
    });

    it('uses passive wrapper when clientHasTools=true', () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        const result = injectKnowledge(messages, KNOWLEDGE, true);
        expect(result[0].content).toContain('<knowledge-context>');
        expect(result[0].content).toContain('alongside your other capabilities');
        expect(result[0].content).not.toContain('[PRIORITY INSTRUCTION');
    });
});

describe('injectKnowledge — with existing system message', () => {
    it('prepends knowledge BEFORE existing system content', () => {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Tell me about AI.' },
        ];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result[0].content).toContain(KNOWLEDGE);
        expect(result[0].content).toContain('You are a helpful assistant.');
        // Knowledge comes BEFORE client prompt
        const knowledgePos = result[0].content.indexOf(KNOWLEDGE);
        const clientPos = result[0].content.indexOf('You are a helpful assistant.');
        expect(knowledgePos).toBeLessThan(clientPos);
    });

    it('does not change the length of messages array', () => {
        const messages = [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Hello' },
        ];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result).toHaveLength(2);
    });

    it('preserves system message role', () => {
        const messages = [{ role: 'system', content: 'You are helpful.' }];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result[0].role).toBe('system');
    });

    it('uses restrictive wrapper for system injection', () => {
        const messages = [{ role: 'system', content: 'You are a helper.' }];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result[0].content).toContain('Do NOT use tools');
    });

    it('uses passive wrapper in system injection when clientHasTools=true', () => {
        const messages = [{ role: 'system', content: 'You are a helper.' }];
        const result = injectKnowledge(messages, KNOWLEDGE, true);
        expect(result[0].content).toContain('alongside your other capabilities');
        expect(result[0].content).not.toContain('Do NOT use tools');
    });
});

describe('injectKnowledge — immutability', () => {
    it('does not mutate the original messages array', () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        injectKnowledge(messages, KNOWLEDGE);
        expect(messages).toHaveLength(1);
        expect(messages[0].role).toBe('user');
    });

    it('does not mutate existing message objects', () => {
        const sysMsg = { role: 'system', content: 'Original.' };
        const messages = [sysMsg];
        injectKnowledge(messages, KNOWLEDGE);
        expect(sysMsg.content).toBe('Original.');
    });

    it('returns a new array reference', () => {
        const messages = [{ role: 'user', content: 'Hello' }];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result).not.toBe(messages);
    });
});

describe('injectKnowledge — multi-turn messages', () => {
    it('preserves all non-system messages in order', () => {
        const messages = [
            { role: 'user', content: 'Message 1' },
            { role: 'assistant', content: 'Reply 1' },
            { role: 'user', content: 'Message 2' },
        ];
        const result = injectKnowledge(messages, KNOWLEDGE);
        // System message prepended at index 0
        expect(result[0].role).toBe('system');
        expect(result[1].role).toBe('user');
        expect(result[2].role).toBe('assistant');
        expect(result[3].role).toBe('user');
    });

    it('injects into first system message only (system in middle scenario)', () => {
        // Unusual ordering but tests that only systemIdx is modified
        const messages = [
            { role: 'user', content: 'Pre-system user msg' },
            { role: 'system', content: 'Late system' },
        ];
        const result = injectKnowledge(messages, KNOWLEDGE);
        // findIndex returns the system message at index 1, which gets injected
        // No new message added, still length 2
        expect(result).toHaveLength(2);
        expect(result[1].content).toContain(KNOWLEDGE);
        expect(result[0].content).toBe('Pre-system user msg');
    });
});

describe('injectKnowledge — wrapper content', () => {
    it('wraps knowledge in knowledge-context tags', () => {
        const messages = [{ role: 'user', content: 'Q' }];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result[0].content).toContain('<knowledge-context>');
        expect(result[0].content).toContain('</knowledge-context>');
    });

    it('ends with separator line', () => {
        const messages = [{ role: 'user', content: 'Q' }];
        const result = injectKnowledge(messages, KNOWLEDGE);
        expect(result[0].content).toContain('---');
    });

    it('passive wrapper also includes knowledge-context tags', () => {
        const messages = [{ role: 'user', content: 'Q' }];
        const result = injectKnowledge(messages, KNOWLEDGE, true);
        expect(result[0].content).toContain('<knowledge-context>');
        expect(result[0].content).toContain('</knowledge-context>');
        expect(result[0].content).toContain(KNOWLEDGE);
    });
});
