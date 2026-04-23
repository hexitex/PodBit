/**
 * @module config/defaults
 *
 * Default configuration values, VERSION export, and per-subsystem inference parameter defaults.
 *
 * This module defines the singleton `config` object with all default values.
 * Runtime mutations are applied directly to this object by {@link ./loader.ts}.
 * The object is exported by reference — all consumers share the same instance.
 *
 * @see {@link ./types.ts} for the PodbitConfig interface
 * @see {@link ./loader.ts} for updateConfig and persistence
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { PodbitConfig } from './types.js';

dotenv.config();

// Port resolution (env var → fallback) lives in exactly one place. Do NOT inline
// port literals anywhere in this file — read them from PORTS.
import { PORTS, localUrl } from './ports.js';

// Repo root derived from this file's location (config/defaults.ts → repo root is
// one directory up). Stable regardless of process.cwd(), which varies depending on
// how the process is spawned (CLI vs MCP server vs Cursor extension).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8'));
export const VERSION: string = pkg.version;

// Build tsx command for service spawning — uses npx tsx which works across Node versions.
const tsxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const tsxArgs = (script: string) => ['tsx', script];

// ── LAB ROOT RESOLUTION ─────────────────────────────────────────────────────
// Path to the podbit-labs sibling repo. Override with PODBIT_LABS_ROOT in .env
// for non-standard installs. Default is `../podbit-labs` relative to the Podbit
// working directory, which matches the conventional layout.
const labsRoot: string = process.env.PODBIT_LABS_ROOT
    ? path.resolve(process.env.PODBIT_LABS_ROOT)
    : path.resolve(REPO_ROOT, '..', 'podbit-labs');

const labCwd = (name: string): string => path.join(labsRoot, name);
const labExists = (name: string): boolean => {
    try { return fs.existsSync(path.join(labCwd(name), 'package.json')); }
    catch { return false; }
};

// Per-lab autostart toggles. Default OFF — labs are opt-in so a user without
// the podbit-labs repo (or who only wants math-lab) doesn't get failed health
// checks for services they don't run. Flip these in .env to enable.
//
// Spawn via `npm run dev` (tsx) rather than `npm start` (compiled dist/index.js)
// so labs run from source without a build step — same model as Podbit itself.
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const labNpmDev = ['run', 'dev'];
const flag = (name: string): boolean => process.env[name] === 'true' || process.env[name] === '1';

/**
 * Build a managed-service entry for a lab if its directory exists. Returns
 * undefined when the lab dir is missing (prevents the orchestrator from
 * trying to start something that isn't installed).
 */
function labService(opts: {
    name: string;
    dir: string;
    port: number;
    autoStartEnv: string;
}): Record<string, any> | undefined {
    if (!labExists(opts.dir)) return undefined;
    return {
        name: opts.name,
        command: npmCommand,
        args: labNpmDev,
        cwd: labCwd(opts.dir),
        healthEndpoint: localUrl(opts.port, '/health'),
        required: false,
        autoStart: flag(opts.autoStartEnv),
        autoRestart: true,
        maxRestarts: 3,
        restartCooldownMs: 10000,
    };
}

// Build the labs map ONCE so each labService() call only runs once. Entries
// whose lab dir is missing are filtered out — the resulting object only
// contains keys for labs that actually exist on disk.
const labServiceCandidates: Array<[string, Record<string, any> | undefined]> = [
    ['mathLab',     labService({ name: 'Math Lab',     dir: 'math-lab',     port: PORTS.mathLab,     autoStartEnv: 'LAB_MATH_AUTOSTART' })],
    ['nnLab',       labService({ name: 'NN Lab',       dir: 'nn-lab',       port: PORTS.nnLab,       autoStartEnv: 'LAB_NN_AUTOSTART' })],
    ['critiqueLab', labService({ name: 'Critique Lab', dir: 'critique-lab', port: PORTS.critiqueLab, autoStartEnv: 'LAB_CRITIQUE_AUTOSTART' })],
];
const labServices: Record<string, Record<string, any>> = Object.fromEntries(
    labServiceCandidates.filter(([, svc]) => svc !== undefined) as Array<[string, Record<string, any>]>
);

// Default inference parameters per subsystem — used for initial config AND reset-on-model-change
export const DEFAULT_TEMPERATURES: Record<string, number> = {
  voice: 0.7, chat: 0.7, synthesis: 0.7, research: 0.7, docs: 0.7, proxy: 0.7, image_gen: 0.7,
  compress: 0.3, context: 0.3, keyword: 0.3, elite_mapping: 0.3, evm_analysis: 0.3, evm_guidance: 0.3, config_tune: 0.3,
  autorating: 0.15, spec_extraction: 0.1, spec_review: 0.15, api_verification: 0.2, breakthrough_check: 0.2,
  ground_rules: 0.1, population_control: 0.15, lab_routing: 0.15, dedup_judge: 0.15, tuning_judge: 0.15,
  reader_text: 0.3, reader_pdf: 0.3, reader_doc: 0.3,
  reader_image: 0.4, reader_sheet: 0.3, reader_code: 0.3,
};

export const DEFAULT_REPEAT_PENALTIES: Record<string, number> = {
  voice: 1.0, chat: 1.0, synthesis: 1.0, research: 1.0, docs: 1.0, proxy: 1.0, image_gen: 1.0,
  compress: 1.0, context: 1.0, keyword: 1.0, elite_mapping: 1.0, evm_analysis: 1.0, evm_guidance: 1.0, config_tune: 1.0,
  autorating: 1.0, spec_extraction: 1.0, spec_review: 1.0, api_verification: 1.0, breakthrough_check: 1.0,
  ground_rules: 1.0, population_control: 1.0, lab_routing: 1.0, dedup_judge: 1.0, tuning_judge: 1.0,
  reader_text: 1.0, reader_pdf: 1.0, reader_doc: 1.0,
  reader_image: 1.2, reader_sheet: 1.0, reader_code: 1.0,
};



export const config: PodbitConfig = {
  database: {
    path: 'data/resonance.db',
  },

  api: {
    openai: undefined as string | undefined,
    anthropic: undefined as string | undefined,
  },

  services: {
    embeddings: {
      endpoint: process.env.EMBEDDING_ENDPOINT || null,
      model: process.env.EMBEDDING_MODEL || '',
      timeout: parseInt(process.env.SERVICE_TIMEOUT!, 10) || 5000,
    },
    llm: {
      endpoint: process.env.LLM_ENDPOINT || null,
      models: [
        process.env.SMALL_MODEL_ONE,
        process.env.SMALL_MODEL_TWO,
        process.env.SMALL_MODEL_THREE,
      ].filter(Boolean) as string[],
      timeout: parseInt(process.env.SERVICE_TIMEOUT!, 10) || 5000,
    },
  },

  orchestrator: {
    port: PORTS.orchestrator,
    heartbeatIntervalMs: parseInt(process.env.HEARTBEAT_INTERVAL!, 10) || 10000,
    autoRestartEnabled: process.env.AUTO_RESTART_ENABLED !== 'false',
    startupGracePeriodMs: parseInt(process.env.STARTUP_GRACE_PERIOD!, 10) || 30000,
  },

  proxy: {
    port: parseInt(process.env.PROXY_PORT!, 10) || 11435,
    enabled: process.env.PROXY_ENABLED !== 'false',
    modelProfile: (process.env.PROXY_MODEL_PROFILE || 'small') as 'small' | 'medium' | 'large' | 'xl',
    knowledgeReserve: parseFloat(process.env.PROXY_KNOWLEDGE_RESERVE!) || 0.15,
    knowledgeMinReserve: parseFloat(process.env.PROXY_KNOWLEDGE_MIN_RESERVE!) || 0.05,
  },

  managedServices: {
    podbit: {
      name: 'Podbit API',
      command: tsxCommand,
      args: tsxArgs('server.ts'),
      cwd: REPO_ROOT,
      healthEndpoint: localUrl(PORTS.api, '/health'),
      required: true,
      autoStart: true,
      autoRestart: true,
      maxRestarts: 5,
      restartCooldownMs: 30000,
    },
    gui: {
      name: 'GUI Dev Server',
      command: 'npm',
      args: ['run', 'dev'],
      cwd: path.join(REPO_ROOT, 'gui'),
      healthEndpoint: localUrl(PORTS.gui),
      required: false,
      autoStart: true,
      autoRestart: false,
    },
    proxy: {
      name: 'Knowledge Proxy',
      command: tsxCommand,
      args: tsxArgs('proxy-server.ts'),
      cwd: REPO_ROOT,
      healthEndpoint: `http://${process.env.HOST || 'localhost'}:${parseInt(process.env.PROXY_PORT!, 10) || 11435}/health`,
      required: false,
      autoStart: true,
      autoRestart: true,
      maxRestarts: 3,
      restartCooldownMs: 5000,
    },
    partitionServer: {
      name: 'Partition Pool',
      command: tsxCommand,
      args: tsxArgs('partition-server.ts'),
      cwd: REPO_ROOT,
      healthEndpoint: localUrl(PORTS.partitionServer, '/health'),
      required: false,
      autoStart: false,
      autoRestart: true,
      maxRestarts: 3,
      restartCooldownMs: 5000,
    },

    // Built-in labs — see `labServices` below the config object. Each lab is
    // conditionally added if its directory exists at PODBIT_LABS_ROOT (default
    // `../podbit-labs`). autoStart is per-lab via LAB_*_AUTOSTART env vars so
    // users opt in to whichever labs they actually run. The orchestrator
    // treats them as regular managed services — health check, auto-restart,
    // start/stop from the GUI Services page, all free.
    ...labServices,
  },

  externalServices: {
    mcp: {
      name: 'MCP Server',
      required: false,
      ideManaged: true,
    },
    database: {
      name: 'DB',
      required: true,
    },
    embeddings: {
      name: 'Embeddings Server',
      endpoint: process.env.EMBEDDING_ENDPOINT || null,
      model: process.env.EMBEDDING_MODEL || '',
      timeout: parseInt(process.env.SERVICE_TIMEOUT!, 10) || 5000,
      required: true,
    },
    llm: {
      name: 'LLM Server',
      endpoint: process.env.LLM_ENDPOINT || null,
      models: [
        process.env.SMALL_MODEL_ONE,
        process.env.SMALL_MODEL_TWO,
        process.env.SMALL_MODEL_THREE,
      ].filter(Boolean),
      timeout: parseInt(process.env.SERVICE_TIMEOUT!, 10) || 5000,
      required: false,
    },
  },

  engine: {
    threshold: parseFloat(process.env.PODBIT_THRESHOLD || process.env.RESONANCE_THRESHOLD!) || 0.5,
    salienceBoost: parseFloat(process.env.TEMPERATURE_BOOST!) || 0.2,
    salienceDecay: parseFloat(process.env.TEMPERATURE_DECAY!) || 0.994,
    salienceCeiling: parseFloat(process.env.TEMPERATURE_CEILING!) || 1.0,
    salienceFloor: parseFloat(process.env.TEMPERATURE_FLOOR!) || 0.01,
    specificityRatio: parseFloat(process.env.SPECIFICITY_RATIO!) || 0.9,
    knowledgeWeight: parseFloat(process.env.KNOWLEDGE_WEIGHT!) || 1.0,
    abstractionWeight: parseFloat(process.env.ABSTRACTION_WEIGHT!) || 0.1,
    weightDecay: parseFloat(process.env.WEIGHT_DECAY!) || 0.9999,
    parentBoost: parseFloat(process.env.PARENT_BOOST!) || 0.05,
    weightCeiling: parseFloat(process.env.WEIGHT_CEILING!) || 3.0,
    weightFloor: parseFloat(process.env.WEIGHT_FLOOR!) || 0.05,
    cycleDelayMs: parseInt(process.env.CYCLE_DELAY_MS!, 10) || 2100,
    decayEveryNCycles: parseInt(process.env.DECAY_EVERY_N_CYCLES!, 10) || 10,
    junkThreshold: parseFloat(process.env.SYNTHESIS_JUNK_THRESHOLD!) || 0.75,
    minSpecificity: parseFloat(process.env.SYNTHESIS_MIN_SPECIFICITY!) || 0.07,
    synthesisDecayEnabled: process.env.SYNTHESIS_DECAY_ENABLED !== 'false',
    synthesisDecayMultiplier: parseFloat(process.env.SYNTHESIS_DECAY_MULTIPLIER!) || 0.95,
    synthesisDecayGraceDays: parseInt(process.env.SYNTHESIS_DECAY_GRACE_DAYS!, 10) || 7,
    fitnessEnabled: process.env.FITNESS_ENABLED !== 'false',
    fitnessWeights: {
      dissimilarity: parseFloat(process.env.FITNESS_WEIGHT_DISSIMILARITY!) || 0.4,
      novelty: parseFloat(process.env.FITNESS_WEIGHT_NOVELTY!) || 0.5,
      specificity: parseFloat(process.env.FITNESS_WEIGHT_SPECIFICITY!) || 0.3,
    },
    fitnessRange: {
      min: parseFloat(process.env.FITNESS_RANGE_MIN!) || 0.85,
      max: parseFloat(process.env.FITNESS_RANGE_MAX!) || 1.15,
    },
  },

  nodes: {
    defaultWeight: parseFloat(process.env.NODE_DEFAULT_WEIGHT!) || 1.0,
    defaultSalience: parseFloat(process.env.NODE_DEFAULT_TEMPERATURE!) || 1.0,
    breakthroughWeight: parseFloat(process.env.BREAKTHROUGH_WEIGHT!) || 1.6,
    promoteWeight: parseFloat(process.env.PROMOTE_WEIGHT!) || 1.3,
    warmThreshold: parseFloat(process.env.WARM_THRESHOLD!) || 0.7,
    warmWeightThreshold: parseFloat(process.env.WARM_WEIGHT_THRESHOLD!) || 1.15,
  },

  feedback: {
    usefulWeight: parseFloat(process.env.FEEDBACK_USEFUL_WEIGHT!) || 0.2,
    notUsefulWeight: parseFloat(process.env.FEEDBACK_NOT_USEFUL_WEIGHT!) || -0.25,
    harmfulWeight: parseFloat(process.env.FEEDBACK_HARMFUL_WEIGHT!) || -0.5,
    weightFloor: parseFloat(process.env.FEEDBACK_WEIGHT_FLOOR!) || 0.1,
  },

  specificity: {
    numberWeight: parseFloat(process.env.SPECIFICITY_NUMBER_WEIGHT!) || 2.76,
    techTermWeight: parseFloat(process.env.SPECIFICITY_TECHTERM_WEIGHT!) || 4.61,
    concreteNounWeight: parseFloat(process.env.SPECIFICITY_NOUN_WEIGHT!) || 1.84,
    unitWeight: parseFloat(process.env.SPECIFICITY_UNIT_WEIGHT!) || 2.78,
    unitPattern: process.env.SPECIFICITY_UNIT_PATTERN || '\\b(mm|cm|m|km|μm|nm|inch|ft|kg|g|mg|°|hz|mpa|gpa|rpm)\\b',
    maxLearnedTermsPerDomain: 500,
    technicalTerms: {
      mechanical: [
        'gear', 'tooth', 'involute', 'pressure angle', 'pitch', 'helix',
        'bearing', 'shaft', 'torque', 'rpm', 'mesh', 'backlash', 'module',
        'ratio', 'friction', 'lubrication', 'fatigue', 'stress', 'strain',
        'agma', 'iso', 'din', 'hobbing', 'grinding', 'cnc', 'tolerance',
      ],
      software: [
        'api', 'endpoint', 'middleware', 'router', 'handler', 'webhook',
        'sqlite', 'postgresql', 'schema', 'migration', 'index', 'query',
        'embedding', 'vector', 'cosine', 'similarity', 'dimension',
        'llm', 'token', 'prompt', 'inference', 'model', 'tier',
        'websocket', 'http', 'rest', 'graphql', 'grpc',
        'cache', 'ttl', 'session', 'state', 'mutex', 'queue',
        'typescript', 'javascript', 'react', 'express', 'vite',
        'node', 'process', 'thread', 'spawn', 'detach',
        'json', 'buffer', 'float32array', 'serialization',
        'partition', 'domain', 'namespace', 'scope',
        'mcp', 'stdio', 'transport', 'protocol',
        'threshold', 'decay', 'weight', 'salience', 'specificity',
        'dedup', 'junk', 'hallucination', 'novelty', 'validation',
      ],
      biology: [
        'protein', 'gene', 'dna', 'rna', 'enzyme', 'membrane',
        'cell', 'receptor', 'pathway', 'transcription', 'translation',
        'mutation', 'phenotype', 'genotype', 'allele', 'chromosome',
      ],
    },
  },

  docs: {
    maxAttempts: 5.89,
  },

  voice: {},

  dedup: {
    embeddingSimilarityThreshold: parseFloat(process.env.DEDUP_EMBEDDING_THRESHOLD!) || 0.85,
    wordOverlapThreshold: parseFloat(process.env.DEDUP_WORD_OVERLAP_THRESHOLD!) || 0.85,
    maxNodesPerDomain: parseInt(process.env.DEDUP_MAX_NODES!, 10) || 200,
    supersedesThreshold: parseFloat(process.env.SUPERSEDES_THRESHOLD!) || 0.80,
    minWordLength: parseInt(process.env.DEDUP_MIN_WORD_LENGTH!, 10) || 3,
    llmJudgeEnabled: true,
    llmJudgeDoubtFloor: 0.85,
    llmJudgeHardCeiling: 0.95,
    attractorThreshold: 15,
    attractorWeightDecay: 0.02,
  },

  groundRules: {
    enabled: true,
    batchSize: 50,
    intervalMs: 5000,
  },

  contextEngine: {
    totalBudget: parseInt(process.env.CONTEXT_BUDGET!, 10) || 52000,
    allocation: {
      knowledge: parseFloat(process.env.CONTEXT_KNOWLEDGE_PCT!) || 0.40,
      history: parseFloat(process.env.CONTEXT_HISTORY_PCT!) || 0.30,
      systemPrompt: parseFloat(process.env.CONTEXT_SYSTEM_PCT!) || 0.10,
      response: parseFloat(process.env.CONTEXT_RESPONSE_PCT!) || 0.20,
    },
    maxKnowledgeNodes: parseInt(process.env.CONTEXT_MAX_NODES!, 10) || 40,
    minRelevanceScore: parseFloat(process.env.CONTEXT_MIN_RELEVANCE!) || 0.2,
    relevanceWeights: {
      embedding: parseFloat(process.env.CONTEXT_W_EMBEDDING!) || 0.40,
      topicMatch: parseFloat(process.env.CONTEXT_W_TOPIC!) || 0.30,
      nodeWeight: parseFloat(process.env.CONTEXT_W_WEIGHT!) || 0.20,
      recency: parseFloat(process.env.CONTEXT_W_RECENCY!) || 0.10,
    },
    sessionTTLMs: parseInt(process.env.CONTEXT_SESSION_TTL!, 10) || 3600000,
    maxSessionHistory: parseInt(process.env.CONTEXT_MAX_HISTORY!, 10) || 50,
    compressionTier: 'tier1', // historical field — compression uses assigned model
    compressionThreshold: parseFloat(process.env.CONTEXT_COMPRESS_AT!) || 0.80,
    dynamicBudget: {
      enabled: process.env.CONTEXT_DYNAMIC_BUDGET !== 'false',
      depthCeiling: parseInt(process.env.CONTEXT_DEPTH_CEILING!, 10) || 56.6,
      newProfile: {
        knowledge: 1,
        history: 0.83,
        systemPrompt: 1,
        response: 0.54,
      },
      deepProfile: {
        knowledge: 1,
        history: 0.54,
        systemPrompt: 0.10,
        response: 0.20,
      },
    },
    feedback: {
      enabled: process.env.CONTEXT_FEEDBACK !== 'false',
      usageThreshold: parseFloat(process.env.CONTEXT_FEEDBACK_THRESHOLD!) || 0.575,
      weightBoost: parseFloat(process.env.CONTEXT_FEEDBACK_BOOST!) || 0.2,
      maxBoostPerTurn: parseFloat(process.env.CONTEXT_FEEDBACK_MAX_BOOST!) || 0.31,
    },
    topicClustering: {
      enabled: process.env.CONTEXT_CLUSTERING !== 'false',
      threshold: parseFloat(process.env.CONTEXT_CLUSTER_THRESHOLD!) || 0.95,
      maxTopicsToEmbed: parseInt(process.env.CONTEXT_CLUSTER_MAX_TOPICS!, 10) || 9.45,
      clusterWeight: parseFloat(process.env.CONTEXT_CLUSTER_WEIGHT!) || 0.58,
    },
    crossSession: {
      enabled: process.env.CONTEXT_CROSS_SESSION !== 'false',
      topicWeightThreshold: parseFloat(process.env.CONTEXT_CS_WEIGHT_THRESHOLD!) || 1,
      maxTopicsToPersist: parseInt(process.env.CONTEXT_CS_MAX_TOPICS!, 10) || 18.8,
      emaRetain: parseFloat(process.env.CONTEXT_CS_EMA_RETAIN!) || 0.675,
      emaIncoming: parseFloat(process.env.CONTEXT_CS_EMA_INCOMING!) || 1,
      dampeningNew: parseFloat(process.env.CONTEXT_CS_DAMPENING_NEW!) || 1,
      boostExisting: parseFloat(process.env.CONTEXT_CS_BOOST_EXISTING!) || 0.289,
      maxInsightsToLoad: parseInt(process.env.CONTEXT_CS_MAX_INSIGHTS!, 10) || 50,
      maxNodeUsageToLoad: parseInt(process.env.CONTEXT_CS_MAX_NODE_USAGE!, 10) || 30,
      nodeUsageMinThreshold: parseInt(process.env.CONTEXT_CS_NODE_USAGE_MIN!, 10) || 1,
    },
    modelProfiles: {
      micro: {
        label: 'Micro (2K-4K context)',
        contextWindow: 2048,
        budgetMultiplier: 0.12,
        preferCompressed: true,
        maxKnowledgeNodes: 3,
        historyTurns: 2,
      },
      small: {
        label: 'Small (< 8K context)',
        contextWindow: 4096,
        budgetMultiplier: 0.25,
        preferCompressed: true,
        maxKnowledgeNodes: 5,
        historyTurns: 4,
      },
      medium: {
        label: 'Medium (8K-32K context)',
        contextWindow: 16000,
        budgetMultiplier: 1.0,
        preferCompressed: false,
        maxKnowledgeNodes: 15,
        historyTurns: 20,
      },
      large: {
        label: 'Large (32K-128K context)',
        contextWindow: 65000,
        budgetMultiplier: 4.0,
        preferCompressed: false,
        maxKnowledgeNodes: 30,
        historyTurns: 50,
      },
      xl: {
        label: 'XL (128K+ context)',
        contextWindow: 128000,
        budgetMultiplier: 8.0,
        preferCompressed: false,
        maxKnowledgeNodes: 50,
        historyTurns: 100,
      },
    },
    sessionCleanupIntervalMs: parseInt(process.env.CONTEXT_CLEANUP_INTERVAL!, 10) || 600000,
    stopWords: process.env.CONTEXT_STOP_WORDS
      ? process.env.CONTEXT_STOP_WORDS.split(',').map(w => w.trim()).filter(Boolean)
      : [
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
      'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'could', 'should', 'may', 'might', 'can', 'shall', 'this', 'that',
      'these', 'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you',
      'your', 'he', 'she', 'they', 'them', 'their', 'what', 'which', 'who',
      'when', 'where', 'how', 'why', 'if', 'then', 'so', 'as', 'not', 'no',
      'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any',
      'such', 'only', 'same', 'than', 'too', 'very', 'just', 'about', 'also',
      'here', 'there', 'now', 'well', 'get', 'got', 'make', 'made', 'like',
      'know', 'think', 'want', 'see', 'look', 'use', 'find', 'give', 'tell',
      'try', 'ask', 'work', 'call', 'need', 'come', 'go', 'take', 'let',
      'say', 'said', 'still', 'into', 'over', 'after', 'before', 'between',
      'much', 'many', 'way', 'back', 'even', 'new', 'first', 'last', 'long',
      'great', 'little', 'own', 'old', 'right', 'while', 'sure', 'thing',
    ],
    dedupInSelectionThreshold: parseFloat(process.env.CONTEXT_DEDUP_THRESHOLD!) || 0.564,
    topicDecayAgeMs: parseInt(process.env.CONTEXT_TOPIC_DECAY_AGE!, 10) || 60000,
    topicDecayFactor: parseFloat(process.env.CONTEXT_TOPIC_DECAY_FACTOR!) || 0.8,
    topicMinWeight: parseFloat(process.env.CONTEXT_TOPIC_MIN_WEIGHT!) || 0.5,
    recencyDays: parseInt(process.env.CONTEXT_RECENCY_DAYS!, 10) || 1,
    topicBoosts: {
      existingKeyword: parseFloat(process.env.CONTEXT_BOOST_KEYWORD!) || 0.5,
      existingPhrase: parseFloat(process.env.CONTEXT_BOOST_PHRASE!) || 1.0,
      newPhrase: parseFloat(process.env.CONTEXT_BOOST_NEW_PHRASE!) || 1.5,
    },
    qualityMetricWeights: {
      knowledgeUtilization: parseFloat(process.env.CONTEXT_QM_KNOWLEDGE!) || 0.35,
      responseGrounding: parseFloat(process.env.CONTEXT_QM_GROUNDING!) || 0.30,
      topicCoverage: parseFloat(process.env.CONTEXT_QM_COVERAGE!) || 0.20,
      budgetEfficiency: parseFloat(process.env.CONTEXT_QM_BUDGET!) || 0.15,
    },
    intentBlendMax: parseFloat(process.env.CONTEXT_INTENT_BLEND_MAX!) || 1,
    intentMinConfidence: parseFloat(process.env.CONTEXT_INTENT_MIN_CONFIDENCE!) || 0.3,
    intentPatterns: {
      retrieval: [
        '\\b(what is|what are|tell me about|explain|describe|summarize|show me|how does|how do)\\b',
        '\\b(definition|meaning|overview|summary|history|background)\\b',
        '\\?$',
      ],
      action: [
        '\\b(create|build|implement|add|remove|update|fix|change|modify|refactor|deploy|migrate)\\b',
        '\\b(write|generate|make|set up|configure|install)\\b',
        '\\b(should I|how to|steps to|plan for)\\b',
      ],
      diagnosis: [
        '\\b(why is|why does|why isn\'t|why doesn\'t|bug|error|broken|failing|wrong|issue|problem)\\b',
        '\\b(debug|troubleshoot|investigate|diagnose|root cause|regression)\\b',
        '\\b(unexpected|should not|shouldn\'t|supposed to|used to work)\\b',
      ],
      exploration: [
        '\\b(what if|could we|might|wonder|explore|consider|brainstorm|think about)\\b',
        '\\b(connection|relationship|pattern|tension|implication)\\b',
      ],
    },
    intentWeightProfiles: {
      retrieval:   { embedding: 0.50, topicMatch: 0.25, nodeWeight: 0.15, recency: 0.10 },
      action:      { embedding: 0.30, topicMatch: 0.35, nodeWeight: 0.25, recency: 0.10 },
      diagnosis:   { embedding: 0.35, topicMatch: 0.20, nodeWeight: 0.15, recency: 0.30 },
      exploration: { embedding: 0.45, topicMatch: 0.20, nodeWeight: 0.10, recency: 0.25 },
    },
    intentScoring: {
      scorePerMatch: 5,
      maxConfidenceScore: 16.1,
    },
  },

  voicing: {
    maxInsightWords: parseInt(process.env.VOICING_MAX_INSIGHT_WORDS!, 10) || 50,
    maxOutputWords: parseInt(process.env.VOICING_MAX_OUTPUT_WORDS!, 10) || 75,
    truncatedWords: parseInt(process.env.VOICING_TRUNCATED_WORDS!, 10) || 42.7,
    minNovelWords: parseInt(process.env.VOICING_MIN_NOVEL_WORDS!, 10) || 5,
    minNovelWordLength: parseInt(process.env.VOICING_MIN_NOVEL_WORD_LENGTH!, 10) || 7.06,
    rejectUnclosedParens: process.env.VOICING_REJECT_UNCLOSED_PARENS === 'false' ? 0 : 1,
    rejectNoSentenceEnding: process.env.VOICING_REJECT_NO_SENTENCE_ENDING === 'false' ? 0 : 1,
    telegraphicEnabled: process.env.VOICING_TELEGRAPHIC !== 'false',
    telegraphicAggressiveness: (process.env.VOICING_TELEGRAPHIC_LEVEL || 'medium') as 'light' | 'medium' | 'aggressive',
    // Entropy-aware compression — protects high-information tokens from telegraphic removal
    entropyEnabled: process.env.VOICING_ENTROPY_ENABLED !== 'false',
    entropyWeights: {
      entity: parseFloat(process.env.VOICING_ENTROPY_WEIGHT_ENTITY!) || 0.40,
      number: parseFloat(process.env.VOICING_ENTROPY_WEIGHT_NUMBER!) || 0.35,
      properNoun: parseFloat(process.env.VOICING_ENTROPY_WEIGHT_PROPERNOUN!) || 0.30,
      acronym: parseFloat(process.env.VOICING_ENTROPY_WEIGHT_ACRONYM!) || 0.25,
      rarity: parseFloat(process.env.VOICING_ENTROPY_WEIGHT_RARITY!) || 0.15,
    },
    entropyThresholds: {
      light: parseFloat(process.env.VOICING_ENTROPY_THRESHOLD_LIGHT!) || 0.20,
      medium: parseFloat(process.env.VOICING_ENTROPY_THRESHOLD_MEDIUM!) || 0.35,
      aggressive: parseFloat(process.env.VOICING_ENTROPY_THRESHOLD_AGGRESSIVE!) || 0.50,
    },
    entropyRarityMinLength: parseInt(process.env.VOICING_ENTROPY_RARITY_MIN_LENGTH!, 10) || 8,
    responseCleanupPatterns: process.env.VOICING_RESPONSE_CLEANUP_PATTERNS
      ? process.env.VOICING_RESPONSE_CLEANUP_PATTERNS.split('||').map(p => p.trim())
      : [
      '^(The new insight is|This implies|Combining these|From this)[:\\s]*',
      '^(Here\'s|Here is|One)[^:]*:\\s*',
      '^(Prediction|Implication|Mechanism)[:\\s]*',
      '^(In summary|To summarize|In conclusion|To conclude)[,:\\s]*',
      '^(Based on (the|these|this|both))[^,]*,\\s*',
      '^(Looking at|Considering|Examining|Analyzing)[^,]*,\\s*',
      '^(The (key|main|central|core) (insight|takeaway|finding|point) is)[:\\s]*',
      '^(What emerges is|What we see is|What this reveals is)[:\\s]*',
      '^(Interestingly|Notably|Importantly|Significantly|Crucially)[,:\\s]*',
      '^(It (is|seems|appears) (clear|evident|apparent|obvious) that)[,:\\s]*',
      '^(When we (combine|consider|examine|look at))[^,]*,\\s*',
      '^(By (combining|examining|considering|analyzing))[^,]*,\\s*',
      '^(A (key|novel|new|critical|important) (observation|finding|result|conclusion) is)[:\\s]*',
      '^(This (suggests|indicates|reveals|shows|demonstrates|implies) that)[:\\s]*',
      '^(Together,? these)[^.]*',
      '^(The (synthesis|combination|integration|intersection) of)[^.]*reveals\\s*',
      '^(Upon (closer|further|careful) (examination|inspection|analysis))[,:\\s]*',
      '^(There is a (clear|strong|notable|significant|key) (connection|link|relationship))[^.]*',
      '^(Essentially|Fundamentally|Ultimately|At its core|At the heart of)[,:\\s]*',
      '^(The (takeaway|upshot|bottom line|implication) (is|here))[:\\s]*',
    ],
    tierOverrides: {
      medium: { minNovelWords: 3 },
      frontier: { minNovelWords: 2 },
    },
  },

  telegraphic: {
    phrases: JSON.parse(process.env.TELEGRAPHIC_PHRASES || 'null') || [
      ['in order to', '→'], ['with respect to', 're:'], ['as well as', '+'],
      ['in addition to', '+'], ['rather than', 'vs'], ['instead of', 'vs'],
      ['for example', 'e.g.'], ['for instance', 'e.g.'], ['such as', 'e.g.'],
      ['in other words', 'i.e.'], ['that is to say', 'i.e.'], ['even though', 'tho'],
      ['results in', '→'], ['leads to', '→'], ['related to', '↔'],
      ['connected to', '↔'], ['associated with', '↔'], ['corresponds to', '↔'],
      ['equivalent to', '≡'], ['not equal to', '≠'], ['different from', '≠'],
      ['greater than', '>'], ['more than', '>'], ['less than', '<'],
      ['fewer than', '<'], ['at least', '≥'], ['at most', '≤'], ['compared to', 'vs'],
    ] as [string, string][],
    words: JSON.parse(process.env.TELEGRAPHIC_WORDS || 'null') || 0 as any,
    removeAlways: process.env.TELEGRAPHIC_REMOVE_ALWAYS
      ? process.env.TELEGRAPHIC_REMOVE_ALWAYS.split(',').map(w => w.trim()).filter(Boolean)
      : ['a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
         'very', 'really', 'quite', 'rather', 'somewhat', 'just'],
    removeMedium: process.env.TELEGRAPHIC_REMOVE_MEDIUM
      ? process.env.TELEGRAPHIC_REMOVE_MEDIUM.split(',').map(w => w.trim()).filter(Boolean)
      : ['have', 'has', 'had', 'do', 'does', 'did',
         'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
         'it', 'its', 'this', 'that', 'these', 'those',
         'there', 'here', 'then', 'now',
         'some', 'any', 'each', 'every', 'all', 'both', 'many', 'much',
         'which', 'who', 'whom', 'what', 'whose',
         'also', 'too', 'only', 'still', 'already', 'even'],
    removeAggressive: process.env.TELEGRAPHIC_REMOVE_AGGRESSIVE
      ? process.env.TELEGRAPHIC_REMOVE_AGGRESSIVE.split(',').map(w => w.trim()).filter(Boolean)
      : ['i', 'me', 'my', 'we', 'our', 'you', 'your',
         'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their',
         'of', 'in', 'for', 'on', 'at', 'by', 'from', 'as', 'into',
         'through', 'during', 'before', 'after', 'above', 'below', 'between'],
    preserve: process.env.TELEGRAPHIC_PRESERVE
      ? process.env.TELEGRAPHIC_PRESERVE.split(',').map(w => w.trim()).filter(Boolean)
      : ['not', 'no', 'never', 'none', 'nothing', 'neither', 'nor',
         'but', 'yet', 'if', 'when', 'where', 'why', 'how',
         'first', 'second', 'third', 'last', 'next',
         'more', 'less', 'most', 'least',
         'true', 'false', 'yes'],
  },

  nodeValidation: {
    genericStartPatterns: process.env.NODE_VALIDATION_GENERIC_START
      ? process.env.NODE_VALIDATION_GENERIC_START.split('||').map(p => p.trim())
      : [
        '^(this is|it is|there is|we need|we should|it would be)\\b',
      ],
    genericFillerPatterns: process.env.NODE_VALIDATION_GENERIC_FILLER
      ? process.env.NODE_VALIDATION_GENERIC_FILLER.split('||').map(p => p.trim())
      : [
        '\\b(very important|crucial|essential|key|significant|interesting)\\b',
      ],
    genericRatioThreshold: parseFloat(process.env.NODE_VALIDATION_GENERIC_RATIO!) || 0.5,
    genericMinWordCount: parseInt(process.env.NODE_VALIDATION_GENERIC_MIN_WORDS!, 10) || 20,
  },

  injection: {
    instructionOverridePatterns: process.env.INJECTION_INSTRUCTION_OVERRIDE
      ? process.env.INJECTION_INSTRUCTION_OVERRIDE.split('||').map(p => p.trim())
      : [
        '\\b(ignore|disregard|forget|override)\\s+(all\\s+)?(previous|prior|above|earlier|preceding)\\s+(instructions?|prompts?|rules?|context)\\b',
        '\\b(ignore|disregard|forget)\\s+(everything|all)\\s+(above|before|you were told)\\b',
        '\\bnew instructions?\\s*:',
        '\\bdo not follow\\s+(the|your)\\s+(previous|original|above)',
      ],
    roleOverridePatterns: process.env.INJECTION_ROLE_OVERRIDE
      ? process.env.INJECTION_ROLE_OVERRIDE.split('||').map(p => p.trim())
      : [
        '\\byou are now\\b',
        '\\byour new (role|instructions?|persona|identity)\\b',
        '\\b(act|behave|respond|operate)\\s+(as|like)\\s+(a|an|if you were)\\b',
        '\\bpretend (to be|you are)\\b',
        '\\bswitch to\\s+\\w+\\s+mode\\b',
      ],
    promptStructurePatterns: process.env.INJECTION_PROMPT_STRUCTURE
      ? process.env.INJECTION_PROMPT_STRUCTURE.split('||').map(p => p.trim())
      : [
        '\\[INST\\]',
        '<\\|im_start\\|>',
        '<\\|im_end\\|>',
        '###\\s*(System|Assistant|User|Human)\\s*:?',
        '</?system>',
        '</?assistant>',
        '<<SYS>>',
        '<</SYS>>',
      ],
    templateInjectionPatterns: process.env.INJECTION_TEMPLATE
      ? process.env.INJECTION_TEMPLATE.split('||').map(p => p.trim())
      : ['\\{\\{\\w+\\}\\}'],
    structureBreakingPatterns: process.env.INJECTION_STRUCTURE_BREAKING
      ? process.env.INJECTION_STRUCTURE_BREAKING.split('||').map(p => p.trim())
      : ['^\\s*[}\\]]', '"\\s*:\\s*"'],
    systemPromptPatterns: process.env.INJECTION_SYSTEM_PROMPT
      ? process.env.INJECTION_SYSTEM_PROMPT.split('||').map(p => p.trim())
      : [
        '\\bsystem\\s*prompt\\s*:',
        '\\bSYSTEM\\s*:',
        '\\b(begin|start)\\s+system\\s+(message|prompt)',
      ],
    scoreThreshold: parseInt(process.env.INJECTION_SCORE_THRESHOLD!, 10) || 1,
    autoRejectTypes: process.env.INJECTION_AUTO_REJECT_TYPES
      ? process.env.INJECTION_AUTO_REJECT_TYPES.split(',').map(t => t.trim())
      : ['voiced', 'synthesis'],
  },

  intakeDefense: {
    enabled: process.env.INTAKE_DEFENSE_ENABLED !== 'false',
    windowHours: parseInt(process.env.INTAKE_DEFENSE_WINDOW_HOURS!, 10) || 1,
    concentrationThreshold: parseFloat(process.env.INTAKE_DEFENSE_CONCENTRATION_THRESHOLD!) || 0.9,
    throttleThreshold: parseFloat(process.env.INTAKE_DEFENSE_THROTTLE_THRESHOLD!) || 1,
    minProposalsForCheck: parseInt(process.env.INTAKE_DEFENSE_MIN_PROPOSALS!, 10) || 61,
  },

  consultantPipeline: {
    threshold: parseInt(process.env.CONSULTANT_PIPELINE_THRESHOLD!, 10) || 8,
    compressionLevel: parseInt(process.env.CONSULTANT_COMPRESSION_LEVEL!, 10) || 1,
    weights: {
      coherence: 0.20,
      grounding: 0.15,
      novelty: 0.20,
      derivation: 0.15,
      forcedAnalogy: 0.10,
      incrementalValue: 0.20,
    },
    graphContextTopN: 5,
  },

  synthesisEngine: {
    enabled: process.env.SYNTHESIS_ENGINE_ENABLED !== 'false',
    subsetOverlapThreshold: parseFloat(process.env.SYNTHESIS_SUBSET_OVERLAP!) || 0.8,
    similarityCeiling: parseFloat(process.env.SYNTHESIS_SIMILARITY_CEILING!) || 0.83,
    minVocabulary: parseInt(process.env.SYNTHESIS_MIN_VOCABULARY!, 10) || 10,
    minCombinedSpecificity: parseFloat(process.env.SYNTHESIS_MIN_COMBINED_SPECIFICITY!) || 0.5,
    candidateLimit: parseInt(process.env.SYNTHESIS_CANDIDATE_LIMIT!, 10) || 407,
    directedSearchTopK: parseInt(process.env.SYNTHESIS_DIRECTED_SEARCH_TOP_K!, 10) || 16.4,
    nichingEnabled: process.env.SYNTHESIS_NICHING_ENABLED !== 'false',
    nichingLookbackCycles: parseInt(process.env.SYNTHESIS_NICHING_LOOKBACK!, 10) || 50,
    nichingMinShare: parseFloat(process.env.SYNTHESIS_NICHING_MIN_SHARE!) || 0.1,
    migrationEnabled: process.env.SYNTHESIS_MIGRATION_ENABLED === 'true',
    migrationRate: parseFloat(process.env.SYNTHESIS_MIGRATION_RATE!) || 0.05,
    migrationTopK: parseInt(process.env.SYNTHESIS_MIGRATION_TOP_K!, 10) || 10,
    domainDirectedEnabled: process.env.SYNTHESIS_DOMAIN_DIRECTED_ENABLED !== 'false',
    domainDirectedCycleRate: parseFloat(process.env.SYNTHESIS_DOMAIN_DIRECTED_CYCLE_RATE!) || 0.4,
    domainDirectedLookbackDays: parseInt(process.env.SYNTHESIS_DOMAIN_DIRECTED_LOOKBACK_DAYS!, 10) || 7,
  },

  clusterSelection: {
    enabled: process.env.CLUSTER_SELECTION_ENABLED !== 'false',
    targetSize: parseInt(process.env.CLUSTER_TARGET_SIZE!, 10) || 3,
    candidatePoolSize: parseInt(process.env.CLUSTER_CANDIDATE_POOL!, 10) || 200,
    initialTemp: parseFloat(process.env.CLUSTER_INITIAL_TEMP!) || 1.0,
    coolingRate: parseFloat(process.env.CLUSTER_COOLING_RATE!) || 0.995,
    maxIterations: parseInt(process.env.CLUSTER_MAX_ITERATIONS!, 10) || 2000,
    coherenceWeight: parseFloat(process.env.CLUSTER_COHERENCE_WEIGHT!) || 0.6,
    diversityWeight: parseFloat(process.env.CLUSTER_DIVERSITY_WEIGHT!) || 1.2,
    weightBonusScale: parseFloat(process.env.CLUSTER_WEIGHT_BONUS!) || 0.3,
    sizePenalty: parseFloat(process.env.CLUSTER_SIZE_PENALTY!) || 0.5,
    minSimilarity: parseFloat(process.env.CLUSTER_MIN_SIMILARITY!) || 0.3,
    maxSimilarity: parseFloat(process.env.CLUSTER_MAX_SIMILARITY!) || 0.85,
    clustersPerCycle: parseInt(process.env.CLUSTER_PER_CYCLE!, 10) || 1,
    clusterCycleRate: parseFloat(process.env.CLUSTER_CYCLE_RATE!) || 0.3,
  },

  hallucination: {
    novelRatioThreshold: parseFloat(process.env.HALLUCINATION_NOVEL_RATIO!) || 0.75,
    minOutputWordsForNoveltyCheck: parseInt(process.env.HALLUCINATION_MIN_OUTPUT_WORDS!, 10) || 23,
    maxVerboseWords: parseInt(process.env.HALLUCINATION_MAX_VERBOSE_WORDS!, 10) || 90,
    minRedFlags: parseInt(process.env.HALLUCINATION_MIN_RED_FLAGS!, 10) || 2,
    largeNumberThreshold: parseInt(process.env.HALLUCINATION_LARGE_NUMBER!, 10) || 200,
    futureYearPattern: process.env.HALLUCINATION_FUTURE_YEAR_PATTERN || 'by 20[3-9]\\d|in 20[3-9]\\d|until 20[3-9]\\d',
    multiplierPattern: process.env.HALLUCINATION_MULTIPLIER_PATTERN || '\\b\\d{2,}x\\b',
    financialClaimPattern: process.env.HALLUCINATION_FINANCIAL_PATTERN || '\\b(cost|revenue|saving|budget|profit|loss).*\\d+',
    financialTerms: process.env.HALLUCINATION_FINANCIAL_TERMS || 'cost|revenue|saving|budget|profit|loss',
    numberPattern: process.env.HALLUCINATION_NUMBER_PATTERN || '\\b\\d+\\.?\\d*%?',
    roundNumberPattern: process.env.HALLUCINATION_ROUND_NUMBER_PATTERN || '^[0-9]$|^[1-9]0+$',
    novelWordMinLength: parseInt(process.env.HALLUCINATION_NOVEL_WORD_MIN_LENGTH!, 10) || 4,
    synthesisVocabulary: process.env.HALLUCINATION_SYNTHESIS_VOCABULARY
      ? process.env.HALLUCINATION_SYNTHESIS_VOCABULARY.split(',').map(w => w.trim()).filter(Boolean)
      : [
      'therefore', 'implies', 'suggests', 'reveals', 'whereas', 'although',
      'however', 'because', 'furthermore', 'moreover', 'consequently',
      'similarly', 'conversely', 'nevertheless', 'despite', 'unlike',
      'rather', 'instead', 'while', 'since', 'unless', 'whether',
      'fundamentally', 'structural', 'structurally', 'mechanism', 'pattern',
      'connection', 'relationship', 'underlying', 'between', 'contrast',
      'distinction', 'parallel', 'analogous', 'emerges', 'tension',
      'paradox', 'precisely', 'essentially', 'specifically', 'directly',
      'exactly', 'conceptually', 'architectural', 'functionally',
      'insight', 'synthesis', 'combines', 'bridges', 'connects',
      'intersection', 'overlap', 'diverge', 'converge', 'reconcile',
      'neither', 'reframing', 'framework', 'perspective', 'approach',
      'question', 'answer', 'resolution', 'conflict', 'compatible',
      'incompatible', 'equivalent', 'distinct', 'inverse', 'inversion',
      'means', 'indicates', 'demonstrates', 'confirms', 'contradicts',
      'supports', 'undermines', 'validates', 'challenges', 'predicts',
      'explains', 'accounts', 'describes', 'identifies', 'recognizes',
      'genuinely', 'actually', 'effectively', 'simply', 'merely',
      'entirely', 'partially', 'primarily', 'largely', 'typically',
    ],
    fabricatedNumberCheck: true,
    crossDomainNumberCheck: true,
    crossDomainTrivialPattern: '^[0-9]$|^10$|^100$|^1000$',
    tierOverrides: {
      medium: { fabricatedNumberCheck: true, minRedFlags: 2, maxVerboseWords: 120, novelRatioThreshold: 0.75 },
      frontier: { fabricatedNumberCheck: false, minRedFlags: 2, maxVerboseWords: 200, novelRatioThreshold: 0.85 },
    },
  },

  tensions: {
    patterns: [
      ['improve', 'harm'],
      ['increase', 'decrease'],
      ['enable', 'prevent'],
      ['solve', 'cause'],
      ['help', 'hurt'],
      ['efficient', 'inefficient'],
      ['safe', 'dangerous'],
      ['aligned', 'misaligned'],
      ['can', 'cannot'],
      ['possible', 'impossible'],
    ],
    negationBoost: parseFloat(process.env.TENSION_NEGATION_BOOST!) || 1.84,
    minSimilarity: parseFloat(process.env.TENSION_MIN_SIMILARITY!) || 0.661,
    candidateLimit: parseInt(process.env.TENSION_CANDIDATE_LIMIT!, 10) || 417.3,
  },

  validation: {
    compositeWeights: {
      synthesis: parseFloat(process.env.VALIDATION_W_SYNTHESIS!) || 0.458,
      novelty: parseFloat(process.env.VALIDATION_W_NOVELTY!) || 0.458,
      testability: parseFloat(process.env.VALIDATION_W_TESTABILITY!) || 0.252,
      tensionResolution: parseFloat(process.env.VALIDATION_W_TENSION!) || 0.252,
    },
    breakthroughThresholds: {
      minSynthesis: parseInt(process.env.VALIDATION_MIN_SYNTHESIS!, 10) || 4.5,
      minNovelty: parseInt(process.env.VALIDATION_MIN_NOVELTY!, 10) || 4.5,
      minTestability: parseInt(process.env.VALIDATION_MIN_TESTABILITY!, 10) || 3.5,
      minTensionResolution: parseInt(process.env.VALIDATION_MIN_TENSION!, 10) || 3.5,
    },
    generativityBoost: {
      parent: parseFloat(process.env.VALIDATION_BOOST_PARENT!) || 0.293,
      grandparent: parseFloat(process.env.VALIDATION_BOOST_GRANDPARENT!) || 0.177,
    },
    noveltyGateEnabled: process.env.VALIDATION_NOVELTY_GATE_ENABLED !== 'false',
    evmGateEnabled: process.env.VALIDATION_EVM_GATE_ENABLED !== 'false',
  },

  embeddingCache: {
    maxSize: parseInt(process.env.EMBEDDING_CACHE_MAX_SIZE!, 10) || 27193,
    defaultWarmupLimit: parseInt(process.env.EMBEDDING_CACHE_WARMUP_LIMIT!, 10) || 2715,
  },

  tokenLimits: {
    reasoningModelPatterns: ['reasoning', 'r1', 'glm', 'gpt-oss', 'o1', 'o3', 'o4-'],
  },

  subsystemTemperatures: { ...DEFAULT_TEMPERATURES },
  subsystemRepeatPenalties: { ...DEFAULT_REPEAT_PENALTIES },

  // Sampling parameters per subsystem
  subsystemTopP: {
    voice: 0.9, chat: 0.9, synthesis: 0.9, research: 0.9, docs: 0.9, proxy: 0.9, image_gen: 0.9,
    compress: 0.8, context: 1, keyword: 0.9, elite_mapping: 0.9, evm_analysis: 0.9, evm_guidance: 0.9, config_tune: 0.9,
    autorating: 0.9, spec_extraction: 0.9, spec_review: 0.9, api_verification: 0.9, breakthrough_check: 0.9,
    ground_rules: 0.9, population_control: 0.9, lab_routing: 0.9, dedup_judge: 0.9, tuning_judge: 0.9,
    reader_text: 1, reader_pdf: 1, reader_doc: 1,
    reader_image: 0.9, reader_sheet: 1, reader_code: 0.75,
  } as Record<string, number>,
  subsystemMinP: {
    voice: 0.05, chat: 0.05, synthesis: 0.05, research: 0.05, docs: 0.05, proxy: 0.05, image_gen: 0.05,
    compress: 0, context: 0, keyword: 0, elite_mapping: 0.05, evm_analysis: 0.05, evm_guidance: 0.05, config_tune: 0,
    autorating: 0, spec_extraction: 0, spec_review: 0, api_verification: 0.05, breakthrough_check: 0,
    ground_rules: 0, population_control: 0, lab_routing: 0, dedup_judge: 0, tuning_judge: 0,
    reader_text: 0, reader_pdf: 0, reader_doc: 0,
    reader_image: 0.05, reader_sheet: 0, reader_code: 0.08,
  } as Record<string, number>,
  subsystemTopK: {
    voice: 40, chat: 40, synthesis: 40, research: 40, docs: 40, proxy: 40, image_gen: 40,
    compress: 0, context: 0, keyword: 0, elite_mapping: 40, evm_analysis: 40, evm_guidance: 40, config_tune: 0,
    autorating: 0, spec_extraction: 0, spec_review: 0, api_verification: 40, breakthrough_check: 0,
    ground_rules: 0, population_control: 0, lab_routing: 0, dedup_judge: 0, tuning_judge: 0,
    reader_text: 0, reader_pdf: 0, reader_doc: 0,
    reader_image: 40, reader_sheet: 0, reader_code: 20,
  } as Record<string, number>,

  // Consultant model inference parameters — separate from primary model params.
  // Low default temperature for deterministic review scoring.
  consultantTemperatures: {
    voice: 0.15, synthesis: 0.15, dedup_judge: 0.15, research: 0.15,
    spec_extraction: 0.15, config_tune: 0.15, tuning_judge: 0.15,
    evm_codegen: 0.15, evm_triage: 0.15, evm_guidance: 0.15,
    elite_mapping: 0.15, compress: 0.15, autorating: 0.15,
    evm_analysis: 0.15, evm_structural: 0.15, chat: 0.15, docs: 0.15,
    breakthrough_check: 0.15, evm_research: 0.15, evm_expert: 0.15,
    reader_sheet: 0.15, reader_code: 0.15, context: 0.15, keyword: 0.15,
    proxy: 0.15, reader_text: 0.15, reader_pdf: 0.15, reader_doc: 0.15,
    api_verification: 0.15, ground_rules: 0.15, population_control: 0.15,
    embedding: 0.15, spec_review: 0.15, reader_image: 0.15,
  } as Record<string, number>,
  consultantRepeatPenalties: {} as Record<string, number>,
  consultantTopP: {} as Record<string, number>,
  consultantMinP: {} as Record<string, number>,
  consultantTopK: {} as Record<string, number>,

  autonomousCycles: {
    validation: {
      enabled: process.env.CYCLE_VALIDATION_ENABLED !== 'false',
      intervalMs: parseInt(process.env.CYCLE_VALIDATION_INTERVAL_MS!, 10) || 60000,
      minWeightThreshold: parseFloat(process.env.CYCLE_VALIDATION_MIN_WEIGHT!) || 1.4,
      minCompositeForPromotion: parseInt(process.env.CYCLE_VALIDATION_MIN_COMPOSITE!, 10) || 7,
    },
    questions: {
      enabled: process.env.CYCLE_QUESTIONS_ENABLED !== 'false',
      intervalMs: parseInt(process.env.CYCLE_QUESTIONS_INTERVAL_MS!, 10) || 10000,
      batchSize: parseInt(process.env.CYCLE_QUESTIONS_BATCH_SIZE!, 10) || 1,
      candidatePoolSize: 200,
      contextMinSimilarity: 0.6,
      contextTopN: 5,
      weightPenalty: 0.25,
      weightFloor: 0.01,
    },
    tensions: {
      enabled: process.env.CYCLE_TENSIONS_ENABLED !== 'false',
      intervalMs: parseInt(process.env.CYCLE_TENSIONS_INTERVAL_MS!, 10) || 10000,
      maxQuestionsPerCycle: parseInt(process.env.CYCLE_TENSIONS_MAX_QUESTIONS!, 10) || 2,
      maxPendingQuestions: parseInt(process.env.CYCLE_TENSIONS_MAX_PENDING!, 10) || 5,
    },
    research: {
      enabled: process.env.CYCLE_RESEARCH_ENABLED !== 'false',
      intervalMs: parseInt(process.env.CYCLE_RESEARCH_INTERVAL_MS!, 10) || 15000,
      maxSeedsPerCycle: parseInt(process.env.CYCLE_RESEARCH_MAX_SEEDS!, 10) || 20,
      minDomainNodes: parseInt(process.env.CYCLE_RESEARCH_MIN_DOMAIN_NODES!, 10) || 1,
      maxDomainNodes: parseInt(process.env.CYCLE_RESEARCH_MAX_DOMAIN_NODES!, 10) || 500,
      domainSelectionLimit: 5,
      knowledgeContextLimit: 15,
      openQuestionsLimit: 7,
      seedMinLength: 80,
      seedMaxLength: 500,
      relevanceThreshold: 0.3,
      domainRelevanceThreshold: 0.1,
      exhaustionStreak: 5,
      exhaustionCooldownMs: 77400000,
    },
    autorating: {
      enabled: process.env.CYCLE_AUTORATING_ENABLED !== 'false',
      intervalMs: parseInt(process.env.CYCLE_AUTORATING_INTERVAL_MS!, 10) || 15000,
      gracePeriodMinutes: parseInt(process.env.CYCLE_AUTORATING_GRACE_MINUTES!, 10) || 11,
      inlineEnabled: process.env.CYCLE_AUTORATING_INLINE_ENABLED !== 'false',
      batchSize: parseInt(process.env.CYCLE_AUTORATING_BATCH_SIZE!, 10) || 10,
    },
    evm: {
      enabled: process.env.CYCLE_EVM_ENABLED !== 'false',
      intervalMs: parseInt(process.env.CYCLE_EVM_INTERVAL_MS!, 10) || 20000,
      minWeightThreshold: parseFloat(process.env.CYCLE_EVM_MIN_WEIGHT!) || 0.9,
      maxRetriesPerNode: parseInt(process.env.CYCLE_EVM_MAX_RETRIES!, 10) || 3,
      retryBackoffMs: parseInt(process.env.CYCLE_EVM_RETRY_BACKOFF!, 10) || 300000,
      triageEnabled: true,
      minTriageScore: 0.4,
      webResearchEnabled: process.env.CYCLE_EVM_WEB_RESEARCH === 'true',
      resynthesisEnabled: process.env.CYCLE_EVM_RESYNTHESIS !== 'false',
      autoApproveThreshold: 0.8,
      autoApproveVerdicts: ['supported', 'unsupported'],
    },
    voicing: {
      enabled: process.env.CYCLE_VOICING_ENABLED !== 'false',
      intervalMs: parseInt(process.env.CYCLE_VOICING_INTERVAL_MS!, 10) || 30000,
      minWeightThreshold: parseFloat(process.env.CYCLE_VOICING_MIN_WEIGHT!) || 1,
      modes: ['object-following', 'sincere', 'cynic', 'pragmatist', 'child'],
    },
  },

  magicNumbers: {
    junkFilterLimit: 200,
    domainInferenceThreshold: 0.88,
    salienceRescueDays: 7,
  },

  knowledgeBase: {
    enabled: process.env.KB_ENABLED !== 'false',
    maxConcurrency: parseInt(process.env.KB_MAX_CONCURRENCY!, 10) || 1,
    maxChunkSize: parseInt(process.env.KB_MAX_CHUNK_SIZE!, 10) || 7000,
    watcherPollInterval: parseInt(process.env.KB_POLL_INTERVAL!, 10) || 1000,
    awaitWriteFinish: parseInt(process.env.KB_AWAIT_WRITE_FINISH!, 10) || 2000,
    autoStartWatchers: process.env.KB_AUTO_START_WATCHERS === 'true',
    skipLargeFiles: parseInt(process.env.KB_SKIP_LARGE_FILES!, 10) || 52428800, // 50MB
    minChunkLength: parseInt(process.env.KB_MIN_CHUNK_LENGTH!, 10) || 240,
    curationMaxTokens: 32000,
    maxClaimsPerFile: 10,
    maxNodesPerFile: 12,
    defaultExcludePatterns: (process.env.KB_DEFAULT_EXCLUDE_PATTERNS || [
      // Package/lock files
      '*.lock', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
      // Minified/compiled JS/CSS
      '*.min.js', '*.min.css', '*.map', '*.bundle.js', '*.chunk.js',
      // Fonts
      '*.woff', '*.woff2', '*.ttf', '*.otf', '*.eot',
      // Audio/video
      '*.mp3', '*.wav', '*.ogg', '*.mp4', '*.avi', '*.mov', '*.mkv', '*.webm', '*.flac',
      // Archives/binaries
      '*.zip', '*.tar', '*.gz', '*.7z', '*.rar', '*.bin', '*.exe', '*.dll', '*.so', '*.dylib',
      // GPU textures / 3D formats (not useful as knowledge)
      '*.ktx2', '*.basis', '*.glb', '*.gltf', '*.obj', '*.fbx', '*.dae', '*.stl',
      // Vector/icon formats
      '*.svg', '*.ico',
      // Compiled/bytecode
      '*.wasm', '*.pyc', '*.class', '*.o',
      // Database files
      '*.db', '*.sqlite', '*.db-shm', '*.db-wal',
      // IDE/tool dirs
      '.env', '.claude/*', '.cursor/*', '.vscode/*', '.idea/*', '.git/*',
      // Build output
      'node_modules/*', 'dist/*', 'build/*', '.next/*', '__pycache__/*',
      // Test/coverage output
      'tests/*', 'test/*', 'coverage/*', '__tests__/*',
    ].join(',')).split(',').map(s => s.trim()),
    retryMaxAttempts: 3,
    retryDelayMs: 5000,
    networkFolderRetryIntervalMs: 60000,
    postIngestionSummary: true,
  },

  labVerify: {
    enabled: process.env.EVM_ENABLED !== 'false',
    weightBoostOnVerified: parseFloat(process.env.EVM_WEIGHT_BOOST!) || 0.15,
    weightPenaltyOnFailed: parseFloat(process.env.EVM_WEIGHT_PENALTY!) || -0.05,
    weightPenaltyOnError: parseFloat(process.env.EVM_WEIGHT_ERROR_PENALTY!) || 0.0,
    autoArchiveOnDisproved: true,
    autoArchiveConfidence: 0.6,
    failedSalienceCap: 0.5,
    numericalPrecision: parseInt(process.env.EVM_NUMERICAL_PRECISION!, 10) || 500,
    postRejection: {
      enabled: process.env.EVM_POST_REJECTION_ENABLED !== 'false',
      analysisTimeoutMs: parseInt(process.env.EVM_ANALYSIS_TIMEOUT_MS!, 10) || 120000,
      proposalEnabled: process.env.EVM_ANALYSIS_PROPOSAL_ENABLED !== 'false',
      maxAnalysisCodeLength: parseInt(process.env.EVM_ANALYSIS_MAX_CODE!, 10) || 16000,
    },
    decompose: {
      maxFacts: 10,
      maxQuestions: 5,
      weightDowngrade: -0.20,
      factInitialWeight: 0.8,
      questionInitialWeight: 1.0,
    },
    specReview: {
      enabled: true,
      minConfidence: 0.7,
    },
    autoRetest: {
      enabled: true,
      maxRetests: 2,
      confidenceThreshold: 0.75,
    },
    apiVerification: {
      enabled: false,
      maxApisPerNode: 3,
      enrichmentEnabled: false,
      enrichmentMaxNodesPerCall: 5,
      enrichmentMinConfidence: 0.7,
      enrichmentInitialWeight: 0.6,
      enrichmentMode: 'inline' as const,
      enrichmentMaxContentWords: 500,
      correctionPenalty: -0.1,
      validationBoost: 0.2,
      refutationPenalty: -0.5,
      minCorrectionConfidence: 0.7,
    },
  },

  elitePool: {
    enabled: true,
    promotionThreshold: 1,
    maxGeneration: 3,
    enableEliteBridging: true,
    bridgingPriority: 'cross_domain' as const,
    maxBridgingAttemptsPerPair: 2,
    logicalApprovalEnabled: true,
    logicalApprovalThreshold: 8.61,
    dedup: {
      enabled: true,
      semanticThreshold: 0.94,
      checkVariableOverlap: true,
      checkParentLineage: true,
    },
    manifestMapping: {
      enabled: true,
      minRelevanceScore: 0.4,
    },
    eliteWeight: 1.5,
    bridgingRate: 0.2,
  },

  contentSpec: {
    enabled: process.env.CONTENT_SPEC_ENABLED === 'true',
    birthEnabled: process.env.CONTENT_SPEC_BIRTH !== 'false',
    researchEnabled: process.env.CONTENT_SPEC_RESEARCH !== 'false',
    trustPreSpecced: process.env.CONTENT_SPEC_TRUST !== 'false',
    minValidFields: parseInt(process.env.CONTENT_SPEC_MIN_FIELDS!, 10) || 3,
  },

  transient: {
    enabled: process.env.TRANSIENT_ENABLED !== 'false',
    maxTransientPartitions: parseInt(process.env.TRANSIENT_MAX_PARTITIONS!, 10) || 3,
    maxNodesPerImport: parseInt(process.env.TRANSIENT_MAX_NODES_PER_IMPORT!, 10) || 1550,
    maxTransientNodeRatio: parseFloat(process.env.TRANSIENT_MAX_NODE_RATIO!) || 0.20,
    minCycles: parseInt(process.env.TRANSIENT_MIN_CYCLES!, 10) || 5,
    maxCycles: parseInt(process.env.TRANSIENT_MAX_CYCLES!, 10) || 100,
    exhaustionThreshold: parseInt(process.env.TRANSIENT_EXHAUSTION_THRESHOLD!, 10) || 25,
    quarantine: {
      autoApproveKnownSigners: process.env.TRANSIENT_AUTO_APPROVE !== 'false',
      scanFailThreshold: parseFloat(process.env.TRANSIENT_SCAN_FAIL_THRESHOLD!) || 0.40,
      sandboxCycles: parseInt(process.env.TRANSIENT_SANDBOX_CYCLES!, 10) || 5,
      sandboxFailThreshold: parseFloat(process.env.TRANSIENT_SANDBOX_FAIL_THRESHOLD!) || 0.50,
    },
  },

  lifecycle: {
    enabled: true,
    barrenThreshold: 5,
    compostAfter: 11,
    nascent: {
      maxCycles: 14,
      stillbirthMinAutorating: 0.3,
    },
    composting: {
      preserveBreakthroughs: true,
      summaryMaxLength: 200,
    },
    sweepInterval: 1,
  },

  numberVariables: {
    enabled: true,
    contextWindowSize: 8,
    maxVarsPerNode: 20,
  },

  populationControl: {
    enabled: true,
    intervalMs: parseInt(process.env.CYCLE_POPULATION_CONTROL_INTERVAL_MS!, 10) || 120000,
    gracePeriodHours: 2,
    batchSize: 5,
    threshold: 5.0,
    archiveThreshold: 2.0,
    demoteWeight: 0.5,
    boostWeight: 1.1,
    dedupSweep: {
      enabled: true,
      maxAgeDays: 7,
      maxNodesPerDomain: 200,
      embeddingThreshold: 0.87,
      wordOverlapThreshold: 0.80,
    },
  },

  minitruth: {
    enabled: true,
    maxReworkAttempts: 1,
  },

  embeddingEval: {
    enabled: true,
    shadowMode: false,
    maxChars: 8192,
    // Mode 8: Self-reinforcing drift (child paraphrases parent)
    driftFailThreshold: 0.78,
    // Mode 1: Lexical bridge (child only integrates one parent)
    // CONSTRAINT: lexicalBridgeHighThreshold > lexicalBridgeLowThreshold
    lexicalBridgeHighThreshold: 0.78,
    lexicalBridgeLowThreshold: 0.40,
    // Mode 4: Number recycling (same claims across unrelated domains)
    numberRecyclingThreshold: 0.82,
    // Mode 7: Toxic parent (one parent contaminates many children)
    toxicParentThreshold: 0.80,
    toxicParentMinChildren: 3,
    toxicParentMinDomains: 3,
    // Instruction prefixes (Qwen3-Embedding format: "Instruct: ...\nQuery:")
    instructStructuralClaim: 'Represent the core structural claim of this text, ignoring domain-specific terminology',
    instructMechanicalProcess: 'Represent the mechanical process or mechanism described, not the vocabulary used',
    instructQuantitativeClaims: 'Represent the quantitative claims, specific numbers, percentages and their derivation context',
    instructDomainContribution: 'Represent the domain-specific technical content contributed by this text',
  },

  consultantReview: {
    enabled: true,
    thresholds: {
      spec_extraction: 0.4,
      voice: 6.22,
      synthesis: 6.22,
      dedup_judge: 0.75,
      research: 4,
      config_tune: 5,
      tuning_judge: 5,
    },
  },

  avatars: {
    enabled: true,
    style: 'rings',
  },

  partitionServer: {
    port: PORTS.partitionServer,
    enabled: process.env.PARTITION_SERVER_ENABLED === 'true',
    dbPath: 'data/pool.db',
    returnCheckIntervalMs: parseInt(process.env.PARTITION_RETURN_CHECK_MS!, 10) || 60000,
    minPoolNodes: 10,
    staleGraceHours: 24,
    staleCheckIntervalMs: 300000,
  },

  server: {
    port: PORTS.api,
    host: process.env.HOST || 'localhost',
    corsOrigins: (process.env.PODBIT_CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
  },

  gui: {
    port: PORTS.gui,
  },

  lab: {
    freezeOnExperiment: true,
    taintOnRefute: false,
    taintMaxDepth: 2,
    taintDecayDays: 7,
    taintSimilarityThreshold: 0.85,
    mathLabPort: PORTS.mathLab,
    healthCheckIntervalMs: 60_000,
    routingEnabled: true,
    defaultLabId: null,
    freezeTimeoutMs: 1_800_000, // 30 minutes
    maxConcurrentVerifications: 2,
    chaining: {
      enabled: false,
      maxChainDepth: 3,
      critiqueOnVerdicts: ['supported', 'refuted'],
      deferConsequences: true,
    },
  },
};

// Backward compatibility alias — config.resonance references the same object as config.engine
// This allows existing code to use either path during migration
(config as any).resonance = config.engine;
