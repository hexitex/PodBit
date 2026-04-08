-- =============================================================================
-- PODBIT KNOWLEDGE GRAPH - SQLITE SCHEMA (consolidated)
-- Last updated: 2026-02-16
-- This is the canonical schema — all tables, columns, indexes in one place.
-- Loaded on first DB init (when nodes table doesn't exist).
-- Incremental migrations in migrations.ts handle upgrades for existing DBs.
-- =============================================================================

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- NODES: The fundamental unit of the knowledge graph
CREATE TABLE IF NOT EXISTS nodes (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    -- Content
    content         TEXT NOT NULL,
    embedding       TEXT,                   -- JSON array (stored as string, legacy)
    embedding_bin   BLOB,                   -- L2-normalized Float32Array buffer (fast path)
    embedding_model TEXT,                   -- Model that generated the embedding (e.g., 'nomic-embed-text')
    embedding_dims  INTEGER,               -- Embedding dimensions (e.g., 768)

    -- Classification
    node_type       TEXT NOT NULL,          -- seed, proto, voiced, synthesis, breakthrough, question, raw
    trajectory      TEXT,                   -- knowledge, abstraction, null for seeds

    -- Domain
    domain          TEXT,

    -- Lifecycle
    weight          REAL DEFAULT 1.0,
    salience        REAL DEFAULT 1.0,

    -- Specificity
    specificity     REAL,

    -- Provenance
    origin          TEXT NOT NULL,
    contributor     TEXT,

    -- Validation scores (from breakthrough validation)
    validation_synthesis        REAL,
    validation_novelty          REAL,
    validation_testability      REAL,
    validation_tension_resolution REAL,
    validation_composite        REAL,
    validation_reason           TEXT,
    validated_at                TEXT,
    validated_by                TEXT,

    -- Feedback (denormalized from node_feedback for fast queries)
    feedback_rating INTEGER,
    feedback_source TEXT,
    feedback_at     TEXT,
    feedback_note   TEXT,

    -- EVM verification
    verification_status  TEXT,
    verification_score   REAL,
    verification_results TEXT,

    -- Brief exclusion toggle (excluded from compress/summarize/scaffold output)
    excluded        INTEGER DEFAULT 0,

    -- Arbitrary JSON metadata (source provenance, etc.)
    metadata        TEXT,

    -- Timestamps
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    last_resonated  TEXT,

    -- Soft delete
    archived        INTEGER DEFAULT 0,

    -- Junk flag: marks node as low-quality / unwanted
    -- Junk nodes are excluded from queries AND used as negative filter for new proposals
    junk            INTEGER DEFAULT 0,

    -- Node lifecycle state machine (fertility-driven)
    lifecycle_state TEXT DEFAULT 'active',
    born_at         TEXT,
    activated_at    TEXT,
    declining_since TEXT,
    composted_at    TEXT,
    barren_cycles   INTEGER DEFAULT 0,
    total_children  INTEGER DEFAULT 0,
    generation          INTEGER DEFAULT 0,
    elite_considered    INTEGER DEFAULT 0,

    -- Avatar
    avatar_url      TEXT,

    -- Integrity (Merkle DAG provenance)
    content_hash    TEXT
);

-- EDGES: Relationships between nodes
CREATE TABLE IF NOT EXISTS edges (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    source_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id       TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,

    edge_type       TEXT NOT NULL,
    strength        REAL DEFAULT 1.0,

    created_at      TEXT DEFAULT (datetime('now')),

    UNIQUE(source_id, target_id, edge_type)
);

-- VOICINGS: Record of how proto-nodes were voiced
CREATE TABLE IF NOT EXISTS voicings (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    proto_node_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    voiced_node_id  TEXT REFERENCES nodes(id) ON DELETE SET NULL,

    architecture    TEXT NOT NULL,
    model_version   TEXT,

    mode            TEXT NOT NULL,
    disposition     TEXT,

    raw_output      TEXT,

    specificity     REAL,
    tokens_used     INTEGER,
    latency_ms      INTEGER,

    created_at      TEXT DEFAULT (datetime('now'))
);

-- DREAM_CYCLES: Log of synthesis engine activity
CREATE TABLE IF NOT EXISTS dream_cycles (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    node_a_id       TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    node_b_id       TEXT REFERENCES nodes(id) ON DELETE SET NULL,

    resonance_score REAL,
    threshold_used  REAL,

    created_child   INTEGER DEFAULT 0,
    child_node_id   TEXT REFERENCES nodes(id) ON DELETE SET NULL,
    child_trajectory TEXT,

    parameters      TEXT,           -- JSON
    rejection_reason TEXT,           -- Why the cycle was rejected (null if accepted)
    parent_ids      TEXT,           -- JSON array of parent node IDs

    started_at      TEXT DEFAULT (datetime('now')),
    completed_at    TEXT,

    domain          TEXT
);

-- BIAS_OBSERVATIONS: Raw divergence data
CREATE TABLE IF NOT EXISTS bias_observations (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    proto_node_id   TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,

    arch_a          TEXT NOT NULL,
    arch_b          TEXT NOT NULL,

    divergence_score REAL,
    divergence_type  TEXT,

    domain          TEXT,

    created_at      TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- DOMAIN & PARTITION MANAGEMENT
-- =============================================================================

-- Partition definitions: named groups of related domains
CREATE TABLE IF NOT EXISTS domain_partitions (
    id              TEXT PRIMARY KEY,           -- e.g., 'cognitive-science'
    name            TEXT NOT NULL,              -- e.g., 'Cognitive Science'
    description     TEXT,
    system          INTEGER DEFAULT 0,         -- 1 = system partition (un-bridgeable, synthesizes internally only)
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Which domains belong to which partition
CREATE TABLE IF NOT EXISTS partition_domains (
    partition_id    TEXT NOT NULL REFERENCES domain_partitions(id) ON DELETE CASCADE,
    domain          TEXT NOT NULL,
    added_at        TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (partition_id, domain)
);

-- Opt-in bridges between partitions (allows cross-partition synthesis)
CREATE TABLE IF NOT EXISTS partition_bridges (
    partition_a     TEXT NOT NULL REFERENCES domain_partitions(id) ON DELETE CASCADE,
    partition_b     TEXT NOT NULL REFERENCES domain_partitions(id) ON DELETE CASCADE,
    created_at      TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (partition_a, partition_b)
);

-- Domain synonym mapping for fuzzy domain resolution
CREATE TABLE IF NOT EXISTS domain_synonyms (
    domain          TEXT NOT NULL,
    synonym         TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'rule',
    UNIQUE(domain, synonym)
);

-- Extracted keywords per node (for keyword search and domain classification)
CREATE TABLE IF NOT EXISTS node_keywords (
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    keyword         TEXT NOT NULL,
    source          TEXT NOT NULL DEFAULT 'llm',
    created_at      TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (node_id, keyword)
);

-- =============================================================================
-- NUMBER VARIABLE REGISTRY (domain-scoped numeric references)
-- =============================================================================

-- Registry of extracted numeric values with domain scope
CREATE TABLE IF NOT EXISTS number_registry (
    var_id          TEXT PRIMARY KEY,   -- 'NX1', 'NX2', auto-increment
    value           TEXT NOT NULL,      -- the numeric value: '1', '5', '0.138'
    scope_text      TEXT NOT NULL,      -- context: 'activation density in cortical networks'
    source_node_id  TEXT NOT NULL,      -- node that introduced this number
    domain          TEXT NOT NULL,      -- domain scope
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Junction table: which nodes reference which variables
CREATE TABLE IF NOT EXISTS node_number_refs (
    node_id    TEXT NOT NULL,
    var_id     TEXT NOT NULL,
    PRIMARY KEY (node_id, var_id)
);

-- =============================================================================
-- CROSS-DOMAIN PATTERNS (Abstract pattern discovery)
-- =============================================================================

CREATE TABLE IF NOT EXISTS abstract_patterns (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    name            TEXT NOT NULL UNIQUE,
    description     TEXT,
    embedding       TEXT,           -- JSON array

    created_by      TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS node_abstract_patterns (
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    pattern_id      TEXT NOT NULL REFERENCES abstract_patterns(id) ON DELETE CASCADE,
    strength        REAL DEFAULT 1.0,
    contributor     TEXT,
    PRIMARY KEY (node_id, pattern_id)
);

-- =============================================================================
-- ARCHITECTURE & CODE GENERATION
-- =============================================================================

-- Domain-specific parameter history
CREATE TABLE IF NOT EXISTS parameters (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    domain          TEXT NOT NULL,

    resonance_threshold     REAL DEFAULT 0.5,
    salience_boost          REAL DEFAULT 0.1,
    salience_decay          REAL DEFAULT 0.99,
    weight_decay            REAL DEFAULT 0.999,
    knowledge_weight        REAL DEFAULT 1.0,
    abstraction_weight      REAL DEFAULT 0.1,

    sample_by_salience      INTEGER DEFAULT 1,
    cross_domain_rate       REAL DEFAULT 0.1,

    active          INTEGER DEFAULT 1,

    created_at      TEXT DEFAULT (datetime('now')),
    created_by      TEXT
);

-- Code generation patterns
CREATE TABLE IF NOT EXISTS patterns (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    name            TEXT NOT NULL,
    signature       TEXT,
    skeleton        TEXT NOT NULL,
    slots           TEXT,           -- JSON
    imports         TEXT,           -- JSON array
    tests           TEXT,           -- JSON
    category        TEXT,

    embedding       TEXT,           -- JSON array

    times_used      INTEGER DEFAULT 0,
    success_rate    REAL DEFAULT 1.0,

    created_by      TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Successful slot fills for few-shot learning
CREATE TABLE IF NOT EXISTS slot_fills (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    pattern_id      TEXT NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
    slot_name       TEXT NOT NULL,
    request_context TEXT,
    fill_code       TEXT NOT NULL,
    test_passed     INTEGER DEFAULT 0,

    created_at      TEXT DEFAULT (datetime('now'))
);

-- Document scaffolding templates
CREATE TABLE IF NOT EXISTS templates (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),

    task_type       TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    outline_schema  TEXT NOT NULL,   -- JSON
    section_defaults TEXT,           -- JSON
    verifiers       TEXT,            -- JSON

    created_at      TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- LLM MODEL MANAGEMENT
-- =============================================================================

-- Model registry: user-configured LLMs with cost tracking
CREATE TABLE IF NOT EXISTS model_registry (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,           -- Display name (e.g., "Claude 3.5 Sonnet")
    provider        TEXT NOT NULL,           -- anthropic|openai|lmstudio|local
    model_id        TEXT NOT NULL,           -- Provider model identifier
    endpoint_url    TEXT,                    -- Custom endpoint (null = provider default)
    enabled         INTEGER DEFAULT 1,
    max_tokens      INTEGER,                -- Override default max tokens (null = use tier default)
    context_size    INTEGER,                -- Model context window in tokens (null = unknown)
    cost_per_1k     REAL DEFAULT 0,         -- Legacy cost per 1k tokens
    input_cost_per_mtok  REAL DEFAULT 0,    -- Cost per million input tokens
    output_cost_per_mtok REAL DEFAULT 0,    -- Cost per million output tokens
    tool_cost_per_mtok   REAL DEFAULT 0,    -- Cost per million tool-use tokens
    sort_order      INTEGER DEFAULT 0,      -- Priority within tier (lower = tried first)
    max_concurrency INTEGER DEFAULT 1,      -- Max concurrent API calls to this model
    request_pause_ms INTEGER DEFAULT 0,     -- Minimum pause between consecutive requests (ms)
    max_retries     INTEGER DEFAULT 3,      -- Max retries on failure
    retry_window_minutes REAL DEFAULT 2,    -- Retry window in minutes
    request_timeout INTEGER DEFAULT 180,    -- Per-request fetch timeout in seconds
    api_key         TEXT,                   -- Per-model API key (for OpenAI-compatible providers)
    supports_tools  INTEGER DEFAULT NULL,   -- Whether model supports tool use (null = auto-detect)
    no_think        INTEGER DEFAULT 0,      -- Suppress chain-of-thought for this model
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- Subsystem assignments: which model handles each subsystem
CREATE TABLE IF NOT EXISTS subsystem_assignments (
    subsystem       TEXT PRIMARY KEY,       -- synthesis|chat|context|docs|compress|voice|...
    model_id        TEXT REFERENCES model_registry(id) ON DELETE SET NULL,
    consultant_model_id TEXT REFERENCES model_registry(id) ON DELETE SET NULL,  -- Fallback model for quality-gate escalation
    no_think        INTEGER DEFAULT NULL,   -- NULL=inherit from model, 0=force think, 1=force no-think
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- LLM usage log: persistent call tracking for cost analytics
CREATE TABLE IF NOT EXISTS llm_usage_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    subsystem       TEXT NOT NULL,
    model_id        TEXT NOT NULL,
    model_name      TEXT NOT NULL,
    provider        TEXT NOT NULL,
    input_tokens    INTEGER DEFAULT 0,
    output_tokens   INTEGER DEFAULT 0,
    tool_tokens     INTEGER DEFAULT 0,
    total_tokens    INTEGER DEFAULT 0,
    input_cost      REAL DEFAULT 0,
    output_cost     REAL DEFAULT 0,
    tool_cost       REAL DEFAULT 0,
    total_cost      REAL DEFAULT 0,
    latency_ms      INTEGER,
    finish_reason   TEXT,
    error           TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- CACHE & CONFIGURATION
-- =============================================================================

-- Knowledge cache: cached compress/summarize results
CREATE TABLE IF NOT EXISTS knowledge_cache (
    cache_type              TEXT NOT NULL,           -- 'compress', 'summarize', or 'digest'
    topic                   TEXT NOT NULL,
    domains                 TEXT NOT NULL,            -- JSON array of domains that contributed
    node_count              INTEGER NOT NULL,
    result                  TEXT NOT NULL,            -- JSON: the cached response
    stale                   INTEGER DEFAULT 0,       -- 1 = invalidated but not yet regenerated
    changes_since_cached    INTEGER DEFAULT 0,       -- how many graph changes since this was cached
    created_at              TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (cache_type, topic)
);

-- Externalised LLM prompts for tuning + multi-language
CREATE TABLE IF NOT EXISTS prompts (
    id          TEXT NOT NULL,
    category    TEXT NOT NULL,
    locale      TEXT NOT NULL DEFAULT 'en',
    content     TEXT NOT NULL,
    description TEXT,
    updated_at  TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (id, locale)
);

-- Prompt gold standards: tuning judge reference responses
CREATE TABLE IF NOT EXISTS prompt_gold_standards (
    id              TEXT PRIMARY KEY DEFAULT (gen_random_uuid()),
    prompt_id       TEXT NOT NULL,
    tier            INTEGER NOT NULL CHECK (tier BETWEEN 1 AND 3),
    content         TEXT NOT NULL,
    test_input      TEXT NOT NULL,
    embedding       BLOB,
    model_used      TEXT,
    locked          INTEGER DEFAULT 0,
    generated_at    TEXT DEFAULT (datetime('now')),
    UNIQUE(prompt_id, tier)
);

-- Scaffold jobs: incremental persistence of generated documents
CREATE TABLE IF NOT EXISTS scaffold_jobs (
    id              TEXT PRIMARY KEY,
    request         TEXT NOT NULL,
    task_type       TEXT NOT NULL,
    outline         TEXT NOT NULL,           -- JSON: the decomposed outline
    sections        TEXT NOT NULL DEFAULT '{}', -- JSON: completed section contents keyed by sectionId
    status          TEXT NOT NULL DEFAULT 'in_progress', -- in_progress, completed, partial, failed
    error           TEXT,                    -- last error message if partial/failed
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- Settings: key-value store for persistent configuration
CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,           -- JSON stored as text
    updated_at      TEXT DEFAULT (datetime('now'))
);

-- Config change audit trail
CREATE TABLE IF NOT EXISTS config_history (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    config_path     TEXT NOT NULL,           -- e.g., "resonance.threshold"
    old_value       TEXT,                    -- JSON-encoded old value
    new_value       TEXT NOT NULL,           -- JSON-encoded new value
    changed_by      TEXT NOT NULL,           -- 'tier2', 'human', 'system'
    contributor     TEXT,                    -- 'claude', 'human:rob'
    reason          TEXT,
    section_id      TEXT,                    -- which config section this belongs to
    metrics_before  TEXT,                    -- JSON: quality metrics at time of change
    snapshot_id     TEXT,                    -- if part of a snapshot restore
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Configuration snapshots for rollback
CREATE TABLE IF NOT EXISTS config_snapshots (
    id              TEXT PRIMARY KEY,
    label           TEXT NOT NULL,
    parameters      TEXT NOT NULL,           -- JSON: full parameter snapshot
    metrics_at_save TEXT,                    -- JSON: quality metrics at save time
    created_by      TEXT,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- TIER PROVENANCE / DECISION TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS decisions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type     TEXT NOT NULL,           -- 'node', 'partition', 'domain_assignment'
    entity_id       TEXT NOT NULL,           -- node UUID, partition ID, etc.
    field           TEXT NOT NULL,           -- 'domain', 'node_type', 'weight', 'partition'
    old_value       TEXT,                    -- previous value (null for creation)
    new_value       TEXT NOT NULL,           -- new value
    decided_by_tier TEXT NOT NULL,           -- 'tier1', 'tier2', 'human', 'system'
    contributor     TEXT,                    -- specific model/user/agent
    reason          TEXT,                    -- why this decision was made
    created_at      TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- FEEDBACK & VERIFICATION
-- =============================================================================

-- Node feedback history (detailed per-feedback records)
CREATE TABLE IF NOT EXISTS node_feedback (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    rating          INTEGER NOT NULL,        -- 1 = useful, 0 = not useful, -1 = harmful
    source          TEXT NOT NULL DEFAULT 'human', -- human, agent, auto
    contributor     TEXT,
    note            TEXT,
    context         TEXT,                    -- JSON
    weight_before   REAL,
    weight_after    REAL,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Per-source dedup gate thresholds
CREATE TABLE IF NOT EXISTS dedup_gate_overrides (
    source                  TEXT PRIMARY KEY,
    embedding_threshold     REAL,
    word_overlap_threshold  REAL,
    llm_judge_enabled       INTEGER,
    llm_judge_doubt_floor   REAL,
    llm_judge_hard_ceiling  REAL,
    updated_at              TEXT DEFAULT (datetime('now'))
);

-- EVM: execution & verification logs
CREATE TABLE IF NOT EXISTS evm_executions (
    id              TEXT PRIMARY KEY,
    node_id         TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending',
    hypothesis      TEXT,
    code            TEXT,
    evaluation_mode TEXT,
    claim_type      TEXT,
    test_category   TEXT,
    stdout          TEXT,
    stderr          TEXT,
    exit_code       INTEGER,
    execution_time_ms INTEGER,
    verified        INTEGER,
    confidence      REAL,
    score           REAL,
    weight_before   REAL,
    weight_after    REAL,
    error           TEXT,
    attempt         INTEGER DEFAULT 1,
    guidance        TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    completed_at    TEXT
);

-- Breakthrough registry (shared across projects, not cleared on project switch)
CREATE TABLE IF NOT EXISTS breakthrough_registry (
    id                          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    node_id                     TEXT NOT NULL,
    content                     TEXT NOT NULL,
    domain                      TEXT,
    partition_id                 TEXT,
    partition_name               TEXT,
    trajectory                   TEXT,
    validation_synthesis         REAL,
    validation_novelty           REAL,
    validation_testability       REAL,
    validation_tension_resolution REAL,
    validation_composite         REAL,
    validation_reason            TEXT,
    project_name                 TEXT NOT NULL,
    promoted_by                  TEXT,
    promotion_source             TEXT NOT NULL DEFAULT 'manual',
    parent_contents              TEXT,
    documentation                TEXT,
    promoted_at                  TEXT DEFAULT (datetime('now')),
    created_at                   TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- CHAT & SESSION MANAGEMENT
-- =============================================================================

-- Persistent multi-conversation chat with context engine
CREATE TABLE IF NOT EXISTS chat_conversations (
    id              TEXT PRIMARY KEY,
    title           TEXT NOT NULL DEFAULT 'New Chat',
    session_id      TEXT,
    messages        TEXT NOT NULL DEFAULT '[]',
    scope_partition TEXT,
    scope_domains   TEXT,
    action_mode     TEXT DEFAULT 'research',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    archived        INTEGER DEFAULT 0
);

-- Cross-session learning persistence
CREATE TABLE IF NOT EXISTS session_insights (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    session_id      TEXT NOT NULL,
    topic           TEXT NOT NULL,
    weight          REAL DEFAULT 1.0,
    domain          TEXT,
    usage_count     INTEGER DEFAULT 1,
    last_seen       TEXT NOT NULL,
    first_seen      TEXT NOT NULL,
    cluster_terms   TEXT,              -- JSON array of related terms
    created_at      TEXT DEFAULT (datetime('now'))
);

-- Node delivery/usage tracking per session
CREATE TABLE IF NOT EXISTS session_node_usage (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    session_id      TEXT NOT NULL,
    node_id         TEXT NOT NULL,
    times_delivered INTEGER DEFAULT 0,
    times_used      INTEGER DEFAULT 0,
    avg_similarity  REAL DEFAULT 0,
    last_used       TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now'))
);

-- =============================================================================
-- KNOWLEDGE BASE (folder ingestion system)
-- =============================================================================

-- Watched folder configuration
CREATE TABLE IF NOT EXISTS kb_folders (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    folder_path     TEXT NOT NULL,
    domain          TEXT NOT NULL,
    recursive       INTEGER DEFAULT 1,
    watch_enabled   INTEGER DEFAULT 1,
    include_patterns TEXT,
    exclude_patterns TEXT,
    auto_domain_subfolders INTEGER DEFAULT 0,
    raw_mode        INTEGER DEFAULT 0,       -- 1 = verbatim ingestion (RAG-only, excluded from cycles)
    last_scanned    TEXT,
    status          TEXT DEFAULT 'idle',
    error_message   TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(folder_path, domain, raw_mode)
);

-- Tracked file state for change detection
CREATE TABLE IF NOT EXISTS kb_files (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    folder_id       TEXT NOT NULL REFERENCES kb_folders(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,
    file_name       TEXT NOT NULL,
    extension       TEXT NOT NULL,
    file_size       INTEGER NOT NULL,
    modified_at     TEXT NOT NULL,
    content_hash    TEXT NOT NULL,
    reader_plugin   TEXT NOT NULL,
    status          TEXT DEFAULT 'pending',
    error_message   TEXT,
    chunk_count     INTEGER DEFAULT 0,
    node_id         TEXT,
    domain          TEXT NOT NULL,
    processed_at    TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(folder_id, file_path)
);

-- Individual chunks linked to graph nodes
CREATE TABLE IF NOT EXISTS kb_chunks (
    id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    file_id         TEXT NOT NULL REFERENCES kb_files(id) ON DELETE CASCADE,
    chunk_index     INTEGER NOT NULL,
    chunk_type      TEXT NOT NULL,
    chunk_label     TEXT,
    content         TEXT NOT NULL,
    content_length  INTEGER NOT NULL,
    node_id         TEXT,
    metadata        TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    UNIQUE(file_id, chunk_index)
);

-- =============================================================================
-- PENDING REQUESTS QUEUE (MCP Mode / GUI integration)
-- =============================================================================

CREATE TABLE IF NOT EXISTS pending_requests (
    id              TEXT PRIMARY KEY,
    type            TEXT NOT NULL,
    params          TEXT,           -- JSON
    queued_at       TEXT DEFAULT (datetime('now')),
    completed_at    TEXT,
    status          TEXT DEFAULT 'pending',
    result          TEXT            -- JSON
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Nodes (single-column)
CREATE INDEX IF NOT EXISTS idx_nodes_weight ON nodes (weight DESC) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_nodes_salience ON nodes (salience DESC) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_nodes_domain ON nodes (domain) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_nodes_type ON nodes (node_type) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_nodes_feedback ON nodes (feedback_rating) WHERE feedback_rating IS NOT NULL;

-- Nodes (composite — covering indexes for hot query patterns)
CREATE INDEX IF NOT EXISTS idx_nodes_domain_type_weight ON nodes (domain, node_type, weight DESC) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_nodes_type_weight ON nodes (node_type, weight DESC) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes (created_at DESC) WHERE archived = 0;
CREATE INDEX IF NOT EXISTS idx_nodes_junk_created ON nodes (created_at DESC) WHERE junk = 1;
CREATE INDEX IF NOT EXISTS idx_nodes_domain_created ON nodes (domain, created_at DESC) WHERE archived = 0;

-- Edges
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges (source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges (target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges (edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_target_type ON edges (target_id, edge_type);
CREATE INDEX IF NOT EXISTS idx_edges_source_type ON edges (source_id, edge_type);

-- Voicings
CREATE INDEX IF NOT EXISTS idx_voicings_proto ON voicings (proto_node_id);
CREATE INDEX IF NOT EXISTS idx_voicings_arch ON voicings (architecture);

-- Dream/Synthesis cycles
CREATE INDEX IF NOT EXISTS idx_dream_cycles_domain ON dream_cycles (domain);
CREATE INDEX IF NOT EXISTS idx_dream_cycles_time ON dream_cycles (started_at DESC);

-- Patterns & Slot fills
CREATE INDEX IF NOT EXISTS idx_patterns_category ON patterns (category);
CREATE INDEX IF NOT EXISTS idx_slot_fills_pattern ON slot_fills (pattern_id);

-- Domain synonyms
CREATE INDEX IF NOT EXISTS idx_domain_synonyms_domain ON domain_synonyms (domain);
CREATE INDEX IF NOT EXISTS idx_domain_synonyms_synonym ON domain_synonyms (synonym);

-- Node keywords
CREATE INDEX IF NOT EXISTS idx_node_keywords_keyword ON node_keywords (keyword);
CREATE INDEX IF NOT EXISTS idx_node_keywords_node ON node_keywords (node_id);

-- Partitions
CREATE INDEX IF NOT EXISTS idx_partition_domains_domain ON partition_domains (domain);

-- Decisions
CREATE INDEX IF NOT EXISTS idx_decisions_entity ON decisions (entity_type, entity_id, field);
CREATE INDEX IF NOT EXISTS idx_decisions_tier ON decisions (decided_by_tier);

-- Sessions
CREATE INDEX IF NOT EXISTS idx_session_insights_topic ON session_insights (topic);
CREATE INDEX IF NOT EXISTS idx_session_insights_domain ON session_insights (domain);
CREATE INDEX IF NOT EXISTS idx_session_node_usage_node ON session_node_usage (node_id);

-- Config
CREATE INDEX IF NOT EXISTS idx_config_history_path ON config_history (config_path);
CREATE INDEX IF NOT EXISTS idx_config_history_time ON config_history (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_config_history_contributor ON config_history (contributor);

-- Model registry
CREATE INDEX IF NOT EXISTS idx_model_registry_provider ON model_registry (provider);

-- Chat
CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated ON chat_conversations (updated_at DESC) WHERE archived = 0;

-- Scaffold
CREATE INDEX IF NOT EXISTS idx_scaffold_jobs_status ON scaffold_jobs (status);

-- Knowledge Base
CREATE INDEX IF NOT EXISTS idx_kb_folders_domain ON kb_folders (domain);
CREATE INDEX IF NOT EXISTS idx_kb_files_folder ON kb_files (folder_id);
CREATE INDEX IF NOT EXISTS idx_kb_files_hash ON kb_files (content_hash);
CREATE INDEX IF NOT EXISTS idx_kb_files_status ON kb_files (status);
CREATE INDEX IF NOT EXISTS idx_kb_files_domain ON kb_files (domain);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_file ON kb_chunks (file_id);
CREATE INDEX IF NOT EXISTS idx_kb_chunks_node ON kb_chunks (node_id);

-- Number variables
CREATE INDEX IF NOT EXISTS idx_number_registry_source ON number_registry (source_node_id);
CREATE INDEX IF NOT EXISTS idx_number_registry_domain ON number_registry (domain);
CREATE INDEX IF NOT EXISTS idx_node_number_refs_node ON node_number_refs (node_id);
CREATE INDEX IF NOT EXISTS idx_node_number_refs_var ON node_number_refs (var_id);

-- Gold standards
CREATE INDEX IF NOT EXISTS idx_gold_standards_prompt ON prompt_gold_standards (prompt_id);

-- Node feedback
CREATE INDEX IF NOT EXISTS idx_node_feedback_node ON node_feedback (node_id);
CREATE INDEX IF NOT EXISTS idx_node_feedback_rating ON node_feedback (rating);
CREATE INDEX IF NOT EXISTS idx_node_feedback_source ON node_feedback (source);
CREATE INDEX IF NOT EXISTS idx_node_feedback_created ON node_feedback (created_at DESC);

-- LLM usage
CREATE INDEX IF NOT EXISTS idx_llm_usage_model ON llm_usage_log (model_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_subsystem ON llm_usage_log (subsystem);
CREATE INDEX IF NOT EXISTS idx_llm_usage_created ON llm_usage_log (created_at DESC);

-- EVM
CREATE INDEX IF NOT EXISTS idx_evm_executions_node ON evm_executions (node_id);
CREATE INDEX IF NOT EXISTS idx_evm_executions_status ON evm_executions (status);
CREATE INDEX IF NOT EXISTS idx_evm_executions_verified ON evm_executions (verified);
CREATE INDEX IF NOT EXISTS idx_evm_executions_created ON evm_executions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evm_node_created ON evm_executions (node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nodes_verif_status ON nodes (verification_status, archived) WHERE verification_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dream_cycles_domain_completed ON dream_cycles (domain, completed_at DESC) WHERE domain IS NOT NULL;

-- Breakthrough registry
CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_project ON breakthrough_registry (project_name);
CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_domain ON breakthrough_registry (domain);
CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_promoted ON breakthrough_registry (promoted_at DESC);
CREATE INDEX IF NOT EXISTS idx_breakthrough_registry_composite ON breakthrough_registry (validation_composite DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_breakthrough_registry_dedup ON breakthrough_registry (node_id, project_name);

-- =============================================================================
-- ELITE VERIFICATION POOL
-- =============================================================================

-- ELITE_NODES: Metadata for nodes promoted to the elite pool
CREATE TABLE IF NOT EXISTS elite_nodes (
    node_id                 TEXT PRIMARY KEY,    -- FK to nodes table (the NEW elite node)
    source_verification_id  TEXT,                -- evm_executions record ID
    promoted_at             TEXT DEFAULT (datetime('now')),
    confidence              REAL,                -- 0-1 EVM confidence
    verification_type       TEXT,                -- 'mathematical', 'logical', 'empirical'
    provenance_chain        TEXT                 -- JSON: full parent chain + verification details
);

-- ELITE_MANIFEST_MAPPINGS: Maps elite nodes to project manifest targets
CREATE TABLE IF NOT EXISTS elite_manifest_mappings (
    id                   TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    node_id              TEXT NOT NULL,          -- FK to elite_nodes
    manifest_target_type TEXT NOT NULL,          -- 'goal', 'question', 'bridge'
    manifest_target_text TEXT NOT NULL,          -- the specific goal/question/bridge text
    relevance_score      REAL,                   -- 0-1
    mapped_at            TEXT DEFAULT (datetime('now'))
);

-- ELITE_VERIFIED_VARIABLES: Variables computationally verified by EVM
CREATE TABLE IF NOT EXISTS elite_verified_variables (
    id                      TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    var_id                  TEXT NOT NULL,       -- FK to number_registry
    elite_node_id           TEXT NOT NULL,       -- FK to elite_nodes
    verification_confidence REAL,                -- confidence in verified value
    verified_value          TEXT,                -- the value as confirmed by EVM
    verified_at             TEXT DEFAULT (datetime('now'))
);

-- ELITE_BRIDGING_LOG: Audit trail for elite-to-elite synthesis attempts
CREATE TABLE IF NOT EXISTS elite_bridging_log (
    id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-'||substr('89ab',abs(random())%4+1,1)||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6)))),
    parent_a_id       TEXT NOT NULL,            -- FK to elite_nodes
    parent_b_id       TEXT NOT NULL,            -- FK to elite_nodes
    synthesis_node_id TEXT,                     -- the resulting synthesis node
    outcome           TEXT,                     -- 'promoted', 'rejected', 'duplicate', 'pending'
    attempted_at      TEXT DEFAULT (datetime('now'))
);

-- Elite pool indexes
CREATE INDEX IF NOT EXISTS idx_elite_manifest_node ON elite_manifest_mappings (node_id);
CREATE INDEX IF NOT EXISTS idx_elite_manifest_target ON elite_manifest_mappings (manifest_target_type);
CREATE INDEX IF NOT EXISTS idx_elite_verified_vars_node ON elite_verified_variables (elite_node_id);
CREATE INDEX IF NOT EXISTS idx_elite_verified_vars_var ON elite_verified_variables (var_id);
CREATE INDEX IF NOT EXISTS idx_elite_bridging_time ON elite_bridging_log (attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_elite_bridging_parents ON elite_bridging_log (parent_a_id, parent_b_id);
CREATE INDEX IF NOT EXISTS idx_elite_nodes_gen ON nodes (generation, node_type) WHERE node_type = 'elite_verification' AND archived = 0;

-- =============================================================================
-- VIEWS
-- =============================================================================

CREATE VIEW IF NOT EXISTS v_nodes_with_lineage AS
SELECT
    n.*,
    COUNT(DISTINCT e_parents.source_id) as parent_count,
    COUNT(DISTINCT e_children.target_id) as child_count
FROM nodes n
LEFT JOIN edges e_parents ON n.id = e_parents.target_id AND e_parents.edge_type = 'parent'
LEFT JOIN edges e_children ON n.id = e_children.source_id AND e_children.edge_type = 'parent'
WHERE n.archived = 0
GROUP BY n.id;

CREATE VIEW IF NOT EXISTS v_pattern_stats AS
SELECT
    p.id,
    p.name,
    p.description,
    COUNT(DISTINCT np.node_id) as node_count,
    COUNT(DISTINCT n.domain) as domain_count,
    GROUP_CONCAT(DISTINCT n.domain) as domains
FROM abstract_patterns p
LEFT JOIN node_abstract_patterns np ON np.pattern_id = p.id
LEFT JOIN nodes n ON n.id = np.node_id
GROUP BY p.id, p.name, p.description;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS nodes_updated_at
    AFTER UPDATE ON nodes
    FOR EACH ROW
BEGIN
    UPDATE nodes SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

INSERT OR IGNORE INTO parameters (id, domain, active, created_by)
VALUES ('00000000-0000-4000-8000-000000000000', '*', 1, 'system');
