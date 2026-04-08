/**
 * @module context/topics
 *
 * Context engine topic extraction and semantic clustering.
 *
 * Extracts keywords and bigram phrases from messages, accumulates them as
 * weighted session topics with recency decay, detects graph domains via
 * synonym matching, and optionally clusters topics by embedding similarity
 * into semantic concept groups with centroid embeddings for improved
 * knowledge matching.
 */
import { getConfig } from './types.js';
import { getEmbedding } from '../models.js';
import {
    cosineSimilarity,
    findDomainsBySynonym,
} from '../core.js';

// =============================================================================
// KEYWORD & TOPIC EXTRACTION
// =============================================================================

/** Stop words from config (excluded from keyword extraction). */
function getStopWords(): Set<string> {
    return new Set(getConfig().stopWords);
}

/**
 * Extract keywords from text, filtering stop words and short tokens.
 *
 * Lowercases the text, strips non-alphanumeric characters, removes words
 * shorter than 3 characters and configured stop words, then counts frequencies.
 *
 * @param text - The input text to extract keywords from
 * @returns Array of `{ word, count }` sorted by frequency descending; empty array if text is falsy
 */
export function extractKeywords(text: string) {
    if (!text) return [];

    const words = text.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 2 && !getStopWords().has(w));

    // Count frequency
    const freq = new Map();
    for (const word of words) {
        freq.set(word, (freq.get(word) || 0) + 1);
    }

    // Return sorted by frequency
    return [...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([word, count]) => ({ word, count }));
}

/** Extracts bigram phrases from text (stop words excluded), returns phrase–count pairs sorted by count. */
function extractPhrases(text: string) {
    if (!text) return [];

    const words = text.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 2);

    const phrases = new Map();
    for (let i = 0; i < words.length - 1; i++) {
        const sw = getStopWords();
        if (sw.has(words[i]) || sw.has(words[i + 1])) continue;
        const phrase = `${words[i]} ${words[i + 1]}`;
        phrases.set(phrase, (phrases.get(phrase) || 0) + 1);
    }

    return [...phrases.entries()]
        .filter(([, count]) => count >= 1)
        .sort((a, b) => b[1] - a[1])
        .map(([phrase, count]) => ({ phrase, count }));
}

/**
 * Extract and update session topics from a message.
 *
 * Merges extracted keywords and bigram phrases into the session's topic list
 * with configurable weight boosts. Applies time-based decay to stale topics,
 * prunes topics below minimum weight, detects graph domains via synonym lookup,
 * and triggers semantic topic clustering.
 *
 * @param message - The message text to extract topics from
 * @param session - The session object (mutated: topics, domains, conceptClusters updated)
 * @returns Object with `keywords` (top 20 session topics) and `domains` (detected domain names)
 */
export async function extractTopics(message: string, session: any) {
    const keywords = extractKeywords(message);
    const phrases = extractPhrases(message);
    const now = Date.now();

    // Merge keywords into session topics
    const boosts = getConfig().topicBoosts;
    for (const { word, count } of keywords) {
        const existing = session.topics.find((t: any) => t.term === word);
        if (existing) {
            existing.weight += count * boosts.existingKeyword;
            existing.lastSeen = now;
        } else {
            session.topics.push({
                term: word,
                weight: count,
                firstSeen: now,
                lastSeen: now,
            });
        }
    }

    // Merge phrases (higher weight than individual words)
    for (const { phrase, count } of phrases) {
        const existing = session.topics.find((t: any) => t.term === phrase);
        if (existing) {
            existing.weight += count * boosts.existingPhrase;
            existing.lastSeen = now;
        } else {
            session.topics.push({
                term: phrase,
                weight: count * boosts.newPhrase,
                firstSeen: now,
                lastSeen: now,
            });
        }
    }

    // Decay old topics (reduce weight of topics not mentioned recently)
    const topicDecayAge = getConfig().topicDecayAgeMs;
    const topicDecayFactor = getConfig().topicDecayFactor;
    for (const topic of session.topics) {
        const age = now - topic.lastSeen;
        if (age > topicDecayAge) {
            topic.weight *= topicDecayFactor;
        }
    }

    // Remove topics with negligible weight
    session.topics = session.topics.filter((t: any) => t.weight > getConfig().topicMinWeight);

    // Sort by weight
    session.topics.sort((a: any, b: any) => b.weight - a.weight);

    // Detect domains from top topics
    const detectedDomains = new Set(session.domains);
    for (const topic of session.topics.slice(0, 10)) {
        const domains = await findDomainsBySynonym(topic.term);
        for (const d of domains) {
            detectedDomains.add(d);
        }
    }
    session.domains = [...detectedDomains];

    // Cluster topics semantically (if enabled)
    await clusterTopics(session);

    return {
        keywords: session.topics.slice(0, 20),
        domains: session.domains,
    };
}

// =============================================================================
// TOPIC CLUSTERING
// =============================================================================

/**
 * Cluster session topics by embedding similarity into semantic "concept clusters."
 * Each cluster has a centroid embedding for improved knowledge matching.
 * Caches topic embeddings on the topic objects to minimize embedding calls.
 */
async function clusterTopics(session: any) {
    const cfg = getConfig();
    const clusterCfg = cfg.topicClustering;
    if (!clusterCfg?.enabled) return;

    const topics = session.topics;
    if (topics.length < 3) return;

    // Skip if topics haven't changed since last clustering
    const topicHash = topics.map((t: any) => t.term).sort().join('|');
    if (session._topicHash === topicHash) return;

    const maxToEmbed = clusterCfg.maxTopicsToEmbed;
    const topTopics = topics.slice(0, maxToEmbed);

    // Embed topics (cache on topic objects)
    const embedded: { term: string; embedding: number[]; weight: number }[] = [];
    for (const topic of topTopics) {
        if (topic._embedding) {
            embedded.push({ term: topic.term, embedding: topic._embedding, weight: topic.weight });
            continue;
        }
        const emb = await getEmbedding(topic.term);
        if (emb) {
            topic._embedding = emb;
            embedded.push({ term: topic.term, embedding: emb, weight: topic.weight });
        }
    }

    if (embedded.length < 2) return;

    // Agglomerative clustering: merge pairs with similarity >= threshold
    const threshold = clusterCfg.threshold;
    const clusters: { terms: string[]; centroid: number[]; weight: number }[] = [];
    const assigned = new Set<string>();

    for (let i = 0; i < embedded.length; i++) {
        if (assigned.has(embedded[i].term)) continue;

        const cluster = {
            terms: [embedded[i].term],
            centroid: [...embedded[i].embedding],
            weight: embedded[i].weight,
        };
        assigned.add(embedded[i].term);

        for (let j = i + 1; j < embedded.length; j++) {
            if (assigned.has(embedded[j].term)) continue;
            const sim = cosineSimilarity(cluster.centroid, embedded[j].embedding);
            if (sim >= threshold) {
                cluster.terms.push(embedded[j].term);
                cluster.weight += embedded[j].weight;
                // Update centroid (running average)
                const n = cluster.terms.length;
                for (let k = 0; k < cluster.centroid.length; k++) {
                    cluster.centroid[k] = (cluster.centroid[k] * (n - 1) + embedded[j].embedding[k]) / n;
                }
                assigned.add(embedded[j].term);
            }
        }

        clusters.push(cluster);
    }

    session.conceptClusters = clusters;
    session._topicHash = topicHash;
}
