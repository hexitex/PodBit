# Podbit - Database Schema

SQLite schema as of 2026-03. Dual-DB architecture: `data/system.db` (permanent, shared) + `data/projects/<name>.db` (per-project, swapped on load).

```mermaid
erDiagram
    %% ========== CORE GRAPH ==========
    nodes {
        text id PK
        text content
        blob embedding_bin
        text embedding_model
        int embedding_dims
        text node_type
        text trajectory
        text domain
        real weight
        real salience
        real specificity
        text origin
        text contributor
        int archived
        int junk
        int excluded
        text lifecycle_state
        int generation
        int elite_considered
        int breedable
        text model_id
        text model_name
        text avatar_url
        text content_hash
        text voice_mode
        text created_at
        text updated_at
    }

    edges {
        text id PK
        text source_id FK
        text target_id FK
        text edge_type
        real strength
    }

    nodes ||--o{ edges : "source"
    nodes ||--o{ edges : "target"

    %% ========== VOICING & SYNTHESIS ==========
    voicings {
        text id PK
        text proto_node_id FK
        text voiced_node_id FK
        text architecture
        text mode
        text disposition
        text raw_output
        real specificity
        int tokens_used
        int latency_ms
        text created_at
    }

    dream_cycles {
        text id PK
        text node_a_id FK
        text node_b_id FK
        text child_node_id FK
        real resonance_score
        real threshold_used
        int created_child
        text child_trajectory
        text rejection_reason
        text domain
        text parent_ids
        text parameters
        text started_at
        text completed_at
    }

    voicings }o--|| nodes : "proto"
    voicings }o--o| nodes : "voiced"
    dream_cycles }o--o| nodes : "node_a"
    dream_cycles }o--o| nodes : "node_b"
    dream_cycles }o--o| nodes : "child"

    %% ========== DOMAINS & PARTITIONS ==========
    domain_partitions {
        text id PK
        text name
        text description
        int system
        int transient
        text source_project
        text state
        text visit_config
        int cycles_completed
        int barren_cycles
    }

    partition_domains {
        text partition_id PK_FK
        text domain PK
    }

    partition_bridges {
        text partition_a PK_FK
        text partition_b PK_FK
    }

    domain_partitions ||--o{ partition_domains : "has"
    domain_partitions ||--o{ partition_bridges : "a"
    domain_partitions ||--o{ partition_bridges : "b"

    node_keywords {
        text node_id PK_FK
        text keyword PK
        text source
    }
    nodes ||--o{ node_keywords : "keywords"

    domain_synonyms {
        text domain
        text synonym
        text source
    }

    %% ========== NUMBER VARIABLES ==========
    number_registry {
        text var_id PK
        text value
        text scope_text
        text source_node_id
        text domain
    }

    node_number_refs {
        text node_id PK
        text var_id PK
    }

    nodes ||--o{ node_number_refs : "vars"
    number_registry ||--o{ node_number_refs : "refs"

    %% ========== ABSTRACT PATTERNS ==========
    abstract_patterns {
        text id PK
        text name
        text description
        text embedding
    }

    node_abstract_patterns {
        text node_id PK_FK
        text pattern_id PK_FK
        real strength
        text contributor
    }

    abstract_patterns ||--o{ node_abstract_patterns : ""
    nodes ||--o{ node_abstract_patterns : ""

    %% ========== ELITE VERIFICATION POOL ==========
    elite_nodes {
        text node_id PK
        text source_verification_id
        real confidence
        text verification_type
        text provenance_chain
        text promoted_at
    }

    elite_manifest_mappings {
        text id PK
        text node_id
        text manifest_target_type
        text manifest_target_text
        real relevance_score
    }

    elite_verified_variables {
        text id PK
        text var_id FK
        text elite_node_id FK
        real verification_confidence
        text verified_value
    }

    elite_bridging_log {
        text id PK
        text parent_a_id FK
        text parent_b_id FK
        text synthesis_node_id
        text outcome
    }

    nodes ||--o| elite_nodes : "elite"
    elite_nodes ||--o{ elite_manifest_mappings : "mappings"
    elite_nodes ||--o{ elite_bridging_log : "parent_a"
    elite_nodes ||--o{ elite_bridging_log : "parent_b"

    %% ========== EVM (EXECUTION & VERIFICATION) ==========
    evm_executions {
        text id PK
        text node_id
        text status
        text hypothesis
        text code
        text evaluation_mode
        text claim_type
        int verified
        real confidence
        real score
        real weight_before
        real weight_after
        text error
        int attempt
        text guidance
        int claim_index
    }

    lab_queue {
        int id PK
        text node_id
        text status
        int priority
        int retry_count
        int max_retries
        text guidance
        text queued_by
        text error
        text execution_id
        text template_id
        text external_job_id
    }

    %% ========== FEEDBACK ==========
    node_feedback {
        text id PK
        text node_id FK
        int rating
        text source
        text contributor
        text note
        text context
        real weight_before
        real weight_after
    }

    nodes ||--o{ node_feedback : ""

    %% ========== LLM & MODELS (SYSTEM DB) ==========
    model_registry {
        text id PK
        text name
        text provider
        text model_id
        text endpoint_url
        int enabled
        int max_tokens
        int context_size
        real input_cost_per_mtok
        real output_cost_per_mtok
        int max_concurrency
        int request_pause_ms
        int max_retries
        int request_timeout
        text api_key
        int supports_tools
        int no_think
    }

    subsystem_assignments {
        text subsystem PK
        text model_id FK
        text consultant_model_id FK
        int no_think
        text thinking_level
    }

    llm_usage_log {
        int id PK
        text subsystem
        text model_id
        text model_name
        int input_tokens
        int output_tokens
        int tool_tokens
        real total_cost
        int latency_ms
        text finish_reason
    }

    model_registry ||--o{ subsystem_assignments : "model"
    model_registry ||--o{ subsystem_assignments : "consultant"

    %% ========== LAB REGISTRY (SYSTEM DB) ==========
    lab_registry {
        text id PK
        text name
        text url
        text description
        text auth_type
        text auth_credential
        text auth_header
        text capabilities
        text spec_types
        int queue_limit
        int artifact_ttl_seconds
        text health_status
        int queue_depth
        int enabled
        int priority
        text tags
        text template_id
        text context_prompt
        int context_prompt_edited
    }

    %% ========== CACHE & CONFIG (SYSTEM DB) ==========
    knowledge_cache {
        text cache_type PK
        text topic PK
        text domains
        text result
        int stale
    }

    prompts {
        text id PK
        text category
        text locale PK
        text content
        text description
    }

    prompt_gold_standards {
        text id PK
        text prompt_id FK
        int tier
        text content
        text test_input
        blob embedding
    }

    prompts ||--o{ prompt_gold_standards : ""

    settings {
        text key PK
        text value
    }

    config_history {
        int id PK
        text config_path
        text old_value
        text new_value
        text changed_by
        text contributor
        text reason
        text section_id
    }

    config_snapshots {
        text id PK
        text label
        text parameters
        text metrics_at_save
    }

    %% ========== DECISIONS ==========
    decisions {
        int id PK
        text entity_type
        text entity_id
        text field
        text new_value
        text decided_by_tier
        text contributor
        text reason
    }

    %% ========== CHAT & SESSION ==========
    chat_conversations {
        text id PK
        text title
        text session_id
        text messages
        text scope_partition
        text scope_domains
        text action_mode
        int archived
    }

    session_insights {
        text id PK
        text session_id
        text topic
        real weight
        text domain
        int usage_count
        text cluster_terms
    }

    session_node_usage {
        text id PK
        text session_id
        text node_id FK
        int times_delivered
        int times_used
        real avg_similarity
    }

    nodes ||--o{ session_node_usage : ""

    %% ========== KNOWLEDGE BASE ==========
    kb_folders {
        text id PK
        text folder_path
        text domain
        int recursive
        int watch_enabled
        int raw_mode
        text include_patterns
        text exclude_patterns
    }

    kb_files {
        text id PK
        text folder_id FK
        text file_path
        text file_name
        text content_hash
        text reader_plugin
        text status
        text node_id
        text domain
        int chunk_count
    }

    kb_chunks {
        text id PK
        text file_id FK
        int chunk_index
        text chunk_type
        text chunk_label
        text content
        text node_id
    }

    kb_folders ||--o{ kb_files : ""
    kb_files ||--o{ kb_chunks : ""
    nodes ||--o{ kb_files : "ingested"
    nodes ||--o{ kb_chunks : "chunk"

    %% ========== QUEUE ==========
    pending_requests {
        text id PK
        text type
        text params
        text status
        text result
    }

    %% ========== TRANSIENT PARTITIONS ==========
    partition_visits {
        int id PK
        text partition_id FK
        text project_name
        text arrived_at
        text departed_at
        int cycles_run
        int children_created
        text departure_reason
    }

    node_stubs {
        text node_id PK
        text domain
        text partition_id
        text content_hash
        text summary
        real weight_at_stub
        text cause
    }

    domain_partitions ||--o{ partition_visits : "visits"

    %% ========== INTEGRITY ==========
    integrity_log {
        int id PK
        text node_id FK
        text operation
        text content_hash_before
        text content_hash_after
        text parent_hashes
        text log_hash
        text prev_log_hash
    }

    nodes ||--o{ integrity_log : "provenance"

    %% ========== API VERIFICATION (SYSTEM DB) ==========
    api_registry {
        text id PK
        text name
        text display_name
        text base_url
        text auth_type
        int max_rpm
        text prompt_query
        text prompt_interpret
        text response_format
        text capabilities
        text domains
    }

    api_prompt_history {
        int id PK
        text api_id FK
        text prompt_field
        text content
        int version
    }

    api_registry ||--o{ api_prompt_history : "history"

    %% ========== API VERIFICATIONS (PROJECT DB) ==========
    api_verifications {
        text id PK
        text node_id
        text api_id
        text execution_id
        text request_url
        int response_status
        text verification_impact
        real confidence
        text status
    }

    %% ========== TUNING (SYSTEM DB) ==========
    tuning_registry {
        text id PK
        text model_id
        text model_name
        text parameters
        text metrics_at_save
        int tuning_changes
    }

    %% ========== DEDUP GATE ==========
    dedup_gate_overrides {
        text source PK
        real embedding_threshold
        real word_overlap_threshold
        int llm_judge_enabled
        real llm_judge_doubt_floor
        real llm_judge_hard_ceiling
    }

    %% ========== TEMPLATES & SCAFFOLDING ==========
    templates {
        text id PK
        text task_type
        text name
        text outline_schema
    }

    scaffold_jobs {
        text id PK
        text request
        text task_type
        text outline
        text sections
        text status
    }
```

## Table Groups

| Group | Tables | DB |
|-------|--------|----|
| **Core graph** | `nodes`, `edges` | Project |
| **Synthesis** | `voicings`, `dream_cycles`, `bias_observations` | Project |
| **Domains** | `domain_partitions`, `partition_domains`, `partition_bridges`, `domain_synonyms`, `node_keywords` | Project |
| **Number variables** | `number_registry`, `node_number_refs` | Project |
| **Patterns** | `abstract_patterns`, `node_abstract_patterns` | Project |
| **Elite pool** | `elite_nodes`, `elite_manifest_mappings`, `elite_verified_variables`, `elite_bridging_log` | Project |
| **EVM / Lab** | `lab_executions`, `lab_queue` | Project |
| **Lab registry** | `lab_registry` | System |
| **Feedback** | `node_feedback` | Project |
| **Transient** | `partition_visits`, `node_stubs` | Project |
| **Integrity** | `integrity_log` | Project |
| **API verifications** | `api_verifications` | Project |
| **LLM** | `model_registry`, `subsystem_assignments`, `llm_usage_log` | System |
| **Cache & config** | `knowledge_cache`, `prompts`, `prompt_gold_standards`, `settings`, `config_history`, `config_snapshots` | System |
| **API registry** | `api_registry`, `api_prompt_history` | System |
| **Tuning** | `tuning_registry`, `breakthrough_registry` | System |
| **Provenance** | `decisions`, `dedup_gate_overrides` | Project |
| **Chat** | `chat_conversations`, `session_insights`, `session_node_usage` | Project |
| **Knowledge base** | `kb_folders`, `kb_files`, `kb_chunks` | Project |
| **Queue** | `pending_requests` | Project |
| **Scaffolding** | `templates`, `scaffold_jobs` | Project |
| **Code patterns** | `parameters`, `patterns`, `slot_fills` | Project |

## Views

- **v_nodes_with_lineage** — nodes plus parent_count / child_count from edges
- **v_pattern_stats** — abstract_patterns with node_count, domain_count, domains

## Triggers

- **nodes_updated_at** — sets `updated_at` on row update

## Dual-DB Architecture

**System DB** (`data/system.db`) — permanent, survives project switches:
- Model configuration, subsystem assignments, LLM usage logs
- Prompt templates and gold standards
- Config history and snapshots
- API verification registry and prompt history
- Breakthrough registry, tuning registry
- Settings with system prefixes (`config_overrides`, `proxy.*`, `reader_*`, `budget.*`, `llm.*`, `api.*`)

**Project DB** (`data/projects/<name>.db`) — per-project, swapped on load:
- Knowledge graph (nodes, edges, keywords, embeddings)
- Synthesis state (dream cycles, voicings)
- Domain partitions, bridges, transient state
- Elite pool, EVM executions/queue, feedback
- Knowledge base folders/files/chunks
- Chat conversations, session learning
- All other tables
