/**
 * Telegraphic Text Compressor
 *
 * Converts natural English prose into compressed telegraphic notation.
 * Uses NLP parsing for semantic-aware compression.
 *
 * Supports two modes:
 * - Rule-based (default): Static word lists determine removal
 * - Entropy-aware: POS tags and entity detection score information density
 */

import nlp from 'compromise';
import { config as appConfig } from './config.js';

/** Compression intensity level controlling which word lists are applied. */
export type Aggressiveness = 'light' | 'medium' | 'aggressive';

/**
 * Per-signal weights for entropy-aware token scoring.
 * Higher weight means the signal contributes more to a token's information
 * density score (tokens scoring above the aggressiveness threshold are preserved).
 */
export interface EntropyWeights {
    /** Named entities (people, places, orgs) — highest default weight. */
    entity: number;
    /** Numeric content (numbers, money, percentages) — second-highest. */
    number: number;
    /** Proper nouns detected by NLP. */
    properNoun: number;
    /** All-caps abbreviations (2-6 characters). */
    acronym: number;
    /** Long/rare words (length >= rarityMinLength). */
    rarity: number;
}

/**
 * Per-aggressiveness-level entropy score thresholds.
 * Tokens with an entropy score below the threshold for the current
 * aggressiveness level are candidates for removal.
 */
export interface EntropyThresholds {
    /** Threshold for light aggressiveness (most permissive). */
    light: number;
    /** Threshold for medium aggressiveness. */
    medium: number;
    /** Threshold for aggressive compression (strictest). */
    aggressive: number;
}

/**
 * Full configuration for the entropy-aware compression mode.
 * When enabled, NLP-derived signals (entities, numbers, POS tags) score each
 * token's information density; low-entropy tokens are removal candidates.
 */
export interface EntropyOptions {
    enabled: boolean;
    weights: EntropyWeights;
    thresholds: EntropyThresholds;
    rarityMinLength: number;
}

/**
 * Production defaults for entropy-aware compression.
 * Entity and number signals dominate scoring (0.40 and 0.35 respectively)
 * because they carry the highest information density in typical knowledge
 * graph content. Disabled by default — rule-based mode is the standard path.
 */
export const DEFAULT_ENTROPY_OPTIONS: EntropyOptions = {
    enabled: false,
    weights: {
        entity: 0.40,
        number: 0.35,
        properNoun: 0.30,
        acronym: 0.25,
        rarity: 0.15,
    },
    thresholds: {
        light: 0.20,
        medium: 0.35,
        aggressive: 0.50,
    },
    rarityMinLength: 8,
};

// Token analysis result
interface TokenAnalysis {
    text: string;
    lower: string;
    isWord: boolean;
    isEntity: boolean;
    isNumber: boolean;
    isProperNoun: boolean;
    isAcronym: boolean;
    isRareWord: boolean;
    entropyScore: number;
}

interface CompressorOptions {
    aggressiveness?: Aggressiveness;
    preserveProperNouns?: boolean;
    useSymbols?: boolean;
    entropy?: Partial<EntropyOptions>;
}

interface CompressionStats {
    originalWords: number;
    compressedWords: number;
    wordReduction: string;
    originalChars: number;
    compressedChars: number;
    charReduction: string;
}

// All word lists loaded from config.telegraphic — configurable at runtime.
// These are functions (not constants) so they always read the latest config values.

/** @returns Multi-word phrase-to-symbol mappings from config. */
function getPhrases(): [string, string][] { return appConfig.telegraphic.phrases; }
/** @returns Single-word replacement mappings from config. */
function getWords(): Record<string, string> { return appConfig.telegraphic.words; }
/** @returns Words removed at all aggressiveness levels. */
function getRemoveAlways(): Set<string> { return new Set(appConfig.telegraphic.removeAlways); }
/** @returns Words removed at medium and aggressive levels. */
function getRemoveMedium(): Set<string> { return new Set(appConfig.telegraphic.removeMedium); }
/** @returns Words removed only at aggressive level. */
function getRemoveAggressive(): Set<string> { return new Set(appConfig.telegraphic.removeAggressive); }
/** @returns Words that are never removed regardless of aggressiveness. */
function getPreserve(): Set<string> { return new Set(appConfig.telegraphic.preserve); }

/**
 * Determine whether a word should be removed based on the aggressiveness level
 * and the configured removal word lists.
 * @param word - Lowercase word to check
 * @param aggressiveness - Current compression level
 * @returns True if the word should be removed
 */
function shouldRemove(word: string, aggressiveness: Aggressiveness): boolean {
    if (getRemoveAlways().has(word)) return true;
    if (aggressiveness === 'light') return false;
    if (getRemoveMedium().has(word)) return true;
    if (aggressiveness === 'aggressive') {
        if (getRemoveAggressive().has(word)) return true;
    }
    return false;
}

// ============================================================================
// Entropy-Aware Token Scoring
// ============================================================================

/**
 * Analyze tokens using NLP to extract entropy signals.
 * Returns analysis for each token including POS tags and entity detection.
 */
function analyzeTokensForEntropy(
    text: string,
    options: EntropyOptions
): Map<string, TokenAnalysis> {
    const analyses = new Map<string, TokenAnalysis>();

    try {
        const doc = nlp(text);

        // Collect named entities
        const entities = new Set<string>();
        doc.people().forEach((m: any) => entities.add(m.text().toLowerCase()));
        doc.places().forEach((m: any) => entities.add(m.text().toLowerCase()));
        doc.organizations().forEach((m: any) => entities.add(m.text().toLowerCase()));

        // Collect numbers
        const numbers = new Set<string>();
        doc.numbers().forEach((m: any) => numbers.add(m.text().toLowerCase()));
        doc.money().forEach((m: any) => numbers.add(m.text().toLowerCase()));
        doc.percentages().forEach((m: any) => numbers.add(m.text().toLowerCase()));

        // Collect proper nouns
        const properNouns = new Set<string>();
        doc.match('#ProperNoun').forEach((m: any) => properNouns.add(m.text().toLowerCase()));

        // Process each term
        doc.terms().forEach((term: any) => {
            const termText = term.text();
            const lower = termText.toLowerCase();

            if (!termText || analyses.has(lower)) return;

            const isWord = /^[a-z]+$/i.test(termText);
            const isEntity = entities.has(lower);
            const isNumber = numbers.has(lower) || /\d/.test(termText);
            const isProperNoun = properNouns.has(lower);
            const isAcronym = /^[A-Z]{2,6}$/.test(termText);
            const isRareWord = termText.length >= options.rarityMinLength;

            // Compute entropy score
            const entropyScore = computeEntropyScore(
                { isEntity, isNumber, isProperNoun, isAcronym, isRareWord },
                options.weights
            );

            analyses.set(lower, {
                text: termText,
                lower,
                isWord,
                isEntity,
                isNumber,
                isProperNoun,
                isAcronym,
                isRareWord,
                entropyScore,
            });
        });
    } catch {
        // NLP parsing failed — return empty map, will fall back to rule-based
    }

    return analyses;
}

/**
 * Compute entropy score from token signals.
 * Higher score = more information-dense, should be preserved.
 */
function computeEntropyScore(
    signals: {
        isEntity: boolean;
        isNumber: boolean;
        isProperNoun: boolean;
        isAcronym: boolean;
        isRareWord: boolean;
    },
    weights: EntropyWeights
): number {
    let score = 0;

    if (signals.isEntity) score += weights.entity;
    if (signals.isNumber) score += weights.number;
    if (signals.isProperNoun) score += weights.properNoun;
    if (signals.isAcronym) score += weights.acronym;
    if (signals.isRareWord) score += weights.rarity;

    // Normalize to 0-1 range (max possible is sum of all weights)
    const maxScore = weights.entity + weights.number + weights.properNoun + weights.acronym + weights.rarity;
    return Math.min(1, score / maxScore);
}

/**
 * Determine if a token should be removed using entropy scoring.
 * Tokens with entropy below the aggressiveness threshold are removed.
 */
function shouldRemoveEntropy(
    token: string,
    analysis: TokenAnalysis | undefined,
    aggressiveness: Aggressiveness,
    thresholds: EntropyThresholds
): boolean {
    // If no analysis available, fall back to rule-based
    if (!analysis) {
        return shouldRemove(token.toLowerCase(), aggressiveness);
    }

    // Never remove preserved words
    if (getPreserve().has(analysis.lower)) {
        return false;
    }

    // High-entropy tokens are always preserved
    const threshold = thresholds[aggressiveness];
    if (analysis.entropyScore >= threshold) {
        return false;
    }

    // Low-entropy tokens: check against rule-based removal
    // This ensures we don't remove content words just because they're common
    const lower = analysis.lower;

    // Always remove these regardless of entropy
    if (getRemoveAlways().has(lower)) return true;

    // For medium/aggressive: also check medium removal list
    if (aggressiveness !== 'light' && getRemoveMedium().has(lower)) return true;

    // For aggressive: also check aggressive removal list
    if (aggressiveness === 'aggressive' && getRemoveAggressive().has(lower)) return true;

    // Don't remove — entropy is low but it's not in any removal list
    return false;
}

/**
 * Post-compression cleanup: normalizes whitespace, fixes symbol spacing,
 * repairs common contractions, removes orphan punctuation, and deduplicates
 * consecutive punctuation marks.
 * @param text - Raw compressed text to clean up
 * @returns Cleaned text
 */
function cleanup(text: string): string {
    return text
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        // Fix spacing around symbols
        .replace(/\s*(→|↔|∴|∵|≡|≠|≥|≤|>|<)\s*/g, ' $1 ')
        // + and / can be tighter
        .replace(/\s*\+\s*/g, ' + ')
        .replace(/\s*\/\s*/g, '/')
        // Fix w/ and w/o
        .replace(/w\s*\/\s*o/g, 'w/o')
        .replace(/w\s*\/([^o])/g, 'w/ $1')
        // Fix e.g. and i.e.
        .replace(/e\.\s*g\./g, 'e.g.')
        .replace(/i\.\s*e\./g, 'i.e.')
        // Fix re:
        .replace(/re\s*:\s*/g, 're:')
        // Remove space before punctuation
        .replace(/\s+([.,;:!?])/g, '$1')
        // Add space after punctuation before letters
        .replace(/([.,;:!?])([a-zA-Z])/g, '$1 $2')
        // Remove orphan punctuation at start
        .replace(/^[\s.,;:]+/, '')
        // Remove duplicate punctuation
        .replace(/([.,;:!?])\1+/g, '$1')
        // Clean up orphaned contractions
        .replace(/\s+'[a-z]+\b/gi, '')
        .replace(/^'[a-z]+\s*/gi, '')
        // Final whitespace cleanup
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Extract structured content (code blocks, XML tags, JSON, tool schemas) into
 * placeholders so telegraphic compression only affects natural language prose.
 * Returns the sanitized text and a restore function.
 */
function extractStructuredContent(text: string): { sanitized: string; restore: (compressed: string) => string } {
    const placeholders: Map<string, string> = new Map();
    let counter = 0;

    function placeholder(content: string): string {
        const key = `\x00PH${counter++}\x00`;
        placeholders.set(key, content);
        return key;
    }

    let result = text;

    // 1. Fenced code blocks (```...```)
    result = result.replace(/```[\s\S]*?```/g, m => placeholder(m));

    // 2. Inline code (`...`)
    result = result.replace(/`[^`\n]+`/g, m => placeholder(m));

    // 3. XML/HTML-style tags with content (<tag>...</tag> and self-closing <tag/>)
    //    Preserve the tags themselves but compress text between them
    result = result.replace(/<\/?[a-zA-Z][\w-]*(?:\s[^>]*)?\s*\/?>/g, m => placeholder(m));

    // 4. JSON-like blocks ({...} spanning multiple lines)
    result = result.replace(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, m => {
        // Only protect multi-line or complex JSON, not simple prose in braces
        if (m.includes('\n') || m.includes('"') || m.includes(':')) {
            return placeholder(m);
        }
        return m;
    });

    // 5. URLs
    result = result.replace(/https?:\/\/\S+/g, m => placeholder(m));

    // 6. File paths (Unix and Windows style)
    result = result.replace(/(?:\/[\w.-]+){2,}|[A-Z]:\\[\w\\.-]+/g, m => placeholder(m));

    return {
        sanitized: result,
        restore: (compressed: string) => {
            let restored = compressed;
            for (const [key, original] of placeholders) {
                restored = restored.replace(key, original);
            }
            return restored;
        },
    };
}

/**
 * Compress natural English prose into telegraphic notation for context economy.
 * Structured content (code blocks, XML tags, JSON, URLs, file paths) is
 * extracted into placeholders and restored after compression so only natural
 * language prose is affected.
 *
 * Supports two modes:
 * - **Rule-based** (default): Static word lists determine removal/substitution.
 * - **Entropy-aware**: NLP-based POS tags and entity detection score information
 *   density; low-entropy tokens are candidates for removal.
 *
 * @param text - Input text to compress
 * @param options - Compression options (aggressiveness, proper noun preservation, symbols, entropy)
 * @returns Compressed telegraphic text
 */
export function toTelegraphic(text: string, options: CompressorOptions = {}): string {
    if (!text || typeof text !== 'string') return '';

    const aggressiveness = options.aggressiveness || 'medium';
    const preserveProperNouns = options.preserveProperNouns ?? true;
    const useSymbols = options.useSymbols ?? true;

    // Extract structured content (code, XML, JSON, URLs) into placeholders
    // so compression only affects natural language prose
    const { sanitized, restore } = extractStructuredContent(text);

    // Merge entropy options with defaults
    const entropyEnabled = options.entropy?.enabled ?? DEFAULT_ENTROPY_OPTIONS.enabled;
    const entropyOptions: EntropyOptions = entropyEnabled ? {
        enabled: true,
        weights: { ...DEFAULT_ENTROPY_OPTIONS.weights, ...options.entropy?.weights },
        thresholds: { ...DEFAULT_ENTROPY_OPTIONS.thresholds, ...options.entropy?.thresholds },
        rarityMinLength: options.entropy?.rarityMinLength ?? DEFAULT_ENTROPY_OPTIONS.rarityMinLength,
    } : DEFAULT_ENTROPY_OPTIONS;

    // Analyze tokens for entropy if enabled (on sanitized text only)
    let tokenAnalyses: Map<string, TokenAnalysis> | null = null;
    if (entropyEnabled) {
        tokenAnalyses = analyzeTokensForEntropy(sanitized, entropyOptions);
    }

    // Parse for proper noun detection (fallback when entropy disabled)
    const entities = new Set<string>();
    if (preserveProperNouns && !entropyEnabled) {
        try {
            const doc = nlp(sanitized);
            doc.match('#ProperNoun+').forEach((m: any) => entities.add(m.text().toLowerCase()));
        } catch {
            // NLP parsing failed — continue without proper noun protection
        }
    }

    let result = sanitized;

    // Step 1: Replace multi-word phrases
    for (const [phrase, symbol] of getPhrases()) {
        const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
        result = result.replace(regex, ` ${symbol} `);
    }

    // Step 2: Process word by word
    const tokens = result.split(/\b/);
    const output: string[] = [];

    for (const token of tokens) {
        const lower = token.toLowerCase();
        const isWord = /^[a-z]+$/i.test(token);

        if (!isWord) {
            output.push(token);
            continue;
        }

        // Get token analysis if entropy mode is enabled
        const analysis = tokenAnalyses?.get(lower);

        // Entropy-aware path
        if (entropyEnabled) {
            // Never remove preserved words
            if (getPreserve().has(lower)) {
                output.push(token);
                continue;
            }

            // Check for word replacement (symbols still apply)
            if (useSymbols && getWords()[lower]) {
                output.push(getWords()[lower]);
                continue;
            }

            // Use entropy-based removal decision
            if (shouldRemoveEntropy(token, analysis, aggressiveness, entropyOptions.thresholds)) {
                continue;
            }

            // Keep the word
            output.push(token);
            continue;
        }

        // Rule-based path (original behavior)
        // Preserve proper nouns
        if (preserveProperNouns && entities.has(lower)) {
            output.push(token);
            continue;
        }

        // Never remove preserved words
        if (getPreserve().has(lower)) {
            output.push(token);
            continue;
        }

        // Check for word replacement
        if (useSymbols && getWords()[lower]) {
            output.push(getWords()[lower]);
            continue;
        }

        // Check if should remove
        if (shouldRemove(lower, aggressiveness)) {
            continue;
        }

        // Keep the word
        output.push(token);
    }

    result = output.join('');

    // Step 3: Clean up
    result = cleanup(result);

    // Step 4: Restore structured content (code blocks, XML tags, JSON, URLs, paths)
    result = restore(result);

    return result;
}

/**
 * Calculate compression statistics comparing original and compressed text.
 * @param original - The original uncompressed text
 * @param compressed - The compressed telegraphic text
 * @returns Word/character counts and reduction percentages
 */
export function getCompressionStats(original: string, compressed: string): CompressionStats {
    const oWords = original.split(/\s+/).filter(Boolean).length;
    const cWords = compressed.split(/\s+/).filter(Boolean).length;
    const oChars = original.length;
    const cChars = compressed.length;

    return {
        originalWords: oWords,
        compressedWords: cWords,
        wordReduction: `${((1 - cWords / oWords) * 100).toFixed(0)}%`,
        originalChars: oChars,
        compressedChars: cChars,
        charReduction: `${((1 - cChars / oChars) * 100).toFixed(0)}%`,
    };
}
