# Research Paper Reference: Evolutionary Knowledge Graph Synthesis with Retrieval-Augmented Generation

> Comprehensive reference for all mathematical formulations, algorithms, scoring functions, and novel mechanisms implemented in the Podbit synthesis engine. All formulas are sourced directly from the production codebase.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Graph Data Model](#2-graph-data-model)
3. [Embedding Space and Similarity](#3-embedding-space-and-similarity)
4. [Resonance Band Filtering](#4-resonance-band-filtering)
5. [Node Sampling — Salience-Weighted Selection](#5-node-sampling--salience-weighted-selection)
6. [Synthesis Pipeline — Quality Gate Architecture](#6-synthesis-pipeline--quality-gate-architecture)
7. [Cluster-Based Synthesis via Simulated Annealing](#7-cluster-based-synthesis-via-simulated-annealing)
8. [Fitness Modifier — GA-Inspired Weight Assignment](#8-fitness-modifier--ga-inspired-weight-assignment)
9. [Trajectory Classification](#9-trajectory-classification)
10. [Specificity Measurement](#10-specificity-measurement)
11. [Hallucination Detection](#11-hallucination-detection)
12. [Deduplication — Three-Tier Gate](#12-deduplication--three-tier-gate)
13. [Junk Filter — Negative Memory](#13-junk-filter--negative-memory)
14. [Tension Detection — Contradiction Discovery](#14-tension-detection--contradiction-discovery)
15. [Niching — Domain Diversity Protection](#15-niching--domain-diversity-protection)
16. [Domain-Directed Synthesis](#16-domain-directed-synthesis)
17. [Multi-Parent Recombination](#17-multi-parent-recombination)
18. [Island Migration](#18-island-migration)
19. [Partition Governance](#19-partition-governance)
20. [Decay Functions](#20-decay-functions)
21. [Telegraphic Compression](#21-telegraphic-compression)
22. [Voicing — LLM-Mediated Synthesis](#22-voicing--llm-mediated-synthesis)
23. [Autonomous Cycle Architecture](#23-autonomous-cycle-architecture)
24. [Self-Tuning System](#24-self-tuning-system)
25. [RAG Integration — Knowledge Proxy](#25-rag-integration--knowledge-proxy)
26. [Context Engine — Dynamic Knowledge Delivery](#26-context-engine--dynamic-knowledge-delivery)
27. [Injection Detection](#27-injection-detection)
28. [Domain Inference — Three-Tier Strategy](#28-domain-inference--three-tier-strategy)
29. [Knowledge Base Ingestion](#29-knowledge-base-ingestion)
30. [Novel Contributions Summary](#30-novel-contributions-summary)

---

## 1. System Overview

The system combines a **persistent knowledge graph** with **evolutionary computation** principles and **retrieval-augmented generation (RAG)** to autonomously discover, synthesize, and validate knowledge. It operates as a continuous cycle:

```
Seed Knowledge → Embedding → Sampling → Pairing → LLM Synthesis → Quality Gates → Graph Integration → Decay/Selection
     ↑                                                                                                      |
     └──────────────────────────────────────── Feedback Loop ───────────────────────────────────────────────┘
```

**Key architectural claim:** By treating knowledge nodes as individuals in a genetic algorithm — with cosine similarity defining the fitness landscape, LLM synthesis replacing crossover, and multi-gate quality checks replacing selection pressure — the system evolves a knowledge graph that surfaces non-obvious cross-domain connections while resisting information entropy.

---

## 2. Graph Data Model

### Node Schema

Each node carries:
- **content**: Natural language text (5-200 words)
- **embedding**: Dense vector representation (dimension depends on model, typically 768-1536)
- **embedding_bin**: L2-normalized binary Float32 representation (4x storage reduction)
- **weight** w ∈ [0, w_ceiling]: Accumulated fitness, decays over time
- **salience** s ∈ [s_floor, s_ceiling]: Selection probability factor, decays over time
- **specificity** σ ∈ R⁺: Domain-specific content density score
- **trajectory** ∈ {knowledge, abstraction}: Whether child is more or less specific than parents
- **node_type** ∈ {seed, synthesis, voiced, breakthrough, possible, question, raw}
- **domain**: Organizational partition label
- **junk**: Boolean flag for negative memory filtering

### Edge Schema

Directed edges with:
- **edge_type** ∈ {parent, tension_source, ...}
- **strength** ∈ [0, 1]: Typically the resonance score at creation time

### Node Type Lifecycle

```
seed → (synthesis cycle) → synthesis → (validation) → possible → (human promote) → breakthrough
                                ↓
                          (tension detection) → question → (QA cycle) → voiced answer
```

---

## 3. Embedding Space and Similarity

### Cosine Similarity

The canonical similarity function used throughout:

```
cos(a, b) = (a · b) / (‖a‖ · ‖b‖) = Σᵢ(aᵢ·bᵢ) / (√Σᵢaᵢ² · √Σᵢbᵢ²)
```

Implementation handles heterogeneous input types (JSON string, Float32 Buffer, number array) via `parseEmbedding()`.

### L2 Normalization

All stored embeddings are L2-normalized before storage:

```
â = a / ‖a‖   where ‖a‖ = √(Σᵢ aᵢ²)
```

After normalization, cosine similarity reduces to dot product:

```
cos(â, b̂) = â · b̂ = Σᵢ(âᵢ · b̂ᵢ)
```

This provides ~10-50x faster comparison for cached embeddings.

### Binary Storage Format

Embeddings are stored as Float32Array buffers:
- JSON string: ~6 bytes per dimension (e.g., "0.1234,")
- Float32 binary: 4 bytes per dimension (exact)
- Storage reduction: ~4x for typical embeddings

### Fallback: Jaccard Similarity

When embeddings are unavailable, text-based Jaccard similarity is used:

```
J(A, B) = |W_A ∩ W_B| / |W_A ∪ W_B|
```

where W_A, W_B are word sets from the node contents.

---

## 4. Resonance Band Filtering

The core innovation: synthesis only occurs when two nodes fall within a **productive similarity band** — similar enough to be related, but different enough to produce novel insights.

```
θ_floor ≤ cos(e_A, e_B) ≤ θ_ceiling
```

**Default parameters:**
- θ_floor (resonanceThreshold): 0.5 — minimum semantic overlap
- θ_ceiling (similarityCeiling): 0.92 — maximum before near-duplicate rejection

**Rationale:** Pairs below the floor lack sufficient conceptual connection for meaningful synthesis. Pairs above the ceiling are too similar to produce novel insights — they tend to generate tautological restating.

**Optimal point** for the cluster energy function:

```
θ_optimal = (θ_floor + θ_ceiling) / 2
```

The band width W = θ_ceiling - θ_floor defines the "productive zone" of the embedding space.

---

## 5. Node Sampling — Salience-Weighted Selection

### Exponential Weighted Random Sampling

Node selection uses a stochastic priority function that biases toward high-salience nodes while maintaining exploration:

```sql
ORDER BY -LOG(RANDOM()) / salience
```

This implements **exponential weighted sampling** where the probability of selecting node i is proportional to its salience:

```
P(select i) ∝ sᵢ
```

The `-LOG(RANDOM())` transform converts uniform random variables into exponential random variables, and dividing by salience rescales the rate parameter so higher-salience nodes produce smaller (better) order statistics.

### Inverse-Salience Sampling (Cold Nodes)

For domain-directed synthesis, cold (under-explored) nodes are preferred:

```sql
ORDER BY -LOG(RANDOM()) * salience
```

Here, multiplying by salience (instead of dividing) **inverts** the priority — low-salience nodes are more likely to be selected:

```
P(select i) ∝ 1/sᵢ
```

---

## 6. Synthesis Pipeline — Quality Gate Architecture

Every synthesis attempt passes through a sequential gate pipeline. Rejection at any gate aborts the synthesis:

```
1. Resonance Band    → cos(A,B) ∈ [θ_floor, θ_ceiling]
2. Structural Valid.  → Anti-tautology + vocabulary + specificity checks
3. LLM Voicing       → Generate candidate insight via LLM
4. Truncation Check   → Reject incomplete outputs (unclosed parens, no ending punct.)
5. Novelty Check      → Minimum novel words not in parents
6. Hallucination Det. → Six-signal detector with synthesis vocab exclusion
7. Dedup Gate         → Three-tier duplicate detection
8. Junk Filter        → Negative memory against known-bad outputs
9. Specificity Gate   → σ_child ≥ σ_min
10. Trajectory Class. → knowledge vs abstraction based on specificity ratio
11. Fitness Scoring   → Weight modulation based on parent dissimilarity, novelty, specificity
```

### Structural Validation

Four checks before LLM invocation:

**1. Anti-Tautology (Word Subset Check):**
```
words_A = {w ∈ content_A : |w| > 3}
words_B = {w ∈ content_B : |w| > 3}
overlap = |words_A ∩ words_B|
subset_ratio_A = overlap / |words_A|
subset_ratio_B = overlap / |words_B|

REJECT if max(subset_ratio_A, subset_ratio_B) > τ_subset
```
Default τ_subset (subsetOverlapThreshold): 0.8

**2. Similarity Ceiling:**
```
REJECT if cos(e_A, e_B) > θ_ceiling
```

**3. Minimum Vocabulary:**
```
REJECT if |words_A| < v_min  OR  |words_B| < v_min
```
Default v_min (minVocabulary): 5

**4. Combined Specificity:**
```
REJECT if σ_A + σ_B < σ_combined_min
```
Default σ_combined_min (minCombinedSpecificity): 1.0

---

## 7. Cluster-Based Synthesis via Simulated Annealing

### Energy Function

A multi-node cluster's quality is scored by a composite energy function. Lower energy = better cluster:

```
E(C) = w_coh · E_coherence + w_div · E_diversity + w_wt · E_weight + w_sz · E_size
```

Where:

**Coherence Energy** — deviation from optimal similarity:
```
avg_sim = (1/|pairs|) · Σᵢ<ⱼ cos(eᵢ, eⱼ)
θ_opt = (θ_min_sim + θ_max_sim) / 2
bandwidth = (θ_max_sim - θ_min_sim) / 2
E_coherence = |avg_sim - θ_opt| / bandwidth
```
Range: [0, 1]. 0 = perfectly centered in the productive band.

**Diversity Energy** — domain homogeneity penalty:
```
E_diversity = 1 - |unique_domains| / |C|
```
Range: [0, 1]. 0 = all nodes from different domains (maximally diverse).

**Weight Bonus** — preference for proven nodes:
```
E_weight = -min(avg_weight / 2, 1)
```
Range: [-1, 0]. More negative = higher average weight.

**Size Penalty** — deviation from target cluster size:
```
E_size = |C| - target_size| / target_size
```

**Default weights:**
- w_coh (coherenceWeight): 1.0
- w_div (diversityWeight): 0.5
- w_wt (weightBonusScale): 0.3
- w_sz (sizePenalty): 0.2

### Simulated Annealing Algorithm

```
Initialize: C₀ = random_sample(candidates, target_size)
            T₀ = initial_temperature
            E₀ = E(C₀)

For iter = 1 to max_iterations:
    C' = neighbor(C, candidates)          // Swap one node in/out
    E' = E(C')
    ΔE = E' - E_current

    if ΔE < 0:
        accept C'                          // Better solution
    else:
        accept C' with P = exp(-ΔE / T)   // Metropolis criterion

    if E_current < E_best:
        E_best = E_current
        C_best = C_current

    T = T · cooling_rate                   // Geometric cooling

Return C_best if θ_min ≤ coherence(C_best) ≤ θ_max
```

**Neighbor generation:** swap one random node in the cluster with one random node outside it (Fisher-Yates partial shuffle for initial random samples).

**Default parameters:**
- initial_temperature: 1.0
- cooling_rate: 0.95
- max_iterations: 100
- target_size: 3
- candidate_pool_size: 50

**Final temperature after N iterations:**
```
T_final = T₀ · (cooling_rate)^N
```

### Cluster Structural Validation

Unlike pairwise synthesis, clusters use **majority voting** for structural validation:

```
REJECT if failed_pairs > total_pairs / 2
```

This is more lenient because clusters are inherently more diverse — a single weak pair shouldn't invalidate the whole cluster.

---

## 8. Fitness Modifier — GA-Inspired Weight Assignment

When fitness scoring is enabled, the initial weight of synthesized nodes is modulated by a composite fitness score:

```
w_child = w_base(trajectory) · F
```

Where F (fitness score) is:

```
F = F_min + composite · (F_max - F_min)
```

And the composite is a weighted sum of three signals:

**Signal 1 — Parent Dissimilarity** (harder synthesis = higher reward):
```
dissimilarity = clamp(1 - (resonance - θ_floor) / (θ_ceiling - θ_floor), 0, 1)
```
- Highest when parents are at the floor of the band (maximally dissimilar within the productive zone)
- Lowest when parents are near the ceiling

**Signal 2 — Novelty** (how unlike existing domain content):
```
novelty = 1 - best_similarity_to_existing
```
Where best_similarity comes from the dedup check's `bestSimilarity`.

**Signal 3 — Specificity Enrichment** (child more specific than parents):
```
enrichment = clamp(σ_child / max(avg_parent_σ, 1), 0, 2) / 2
```

**Composite:**
```
composite = w_dissim · dissimilarity + w_novel · novelty + w_spec · enrichment
```

**Default weights:**
- w_dissim: 0.4
- w_novel: 0.35
- w_spec: 0.25
- F_min: 0.5
- F_max: 1.5

**For cluster synthesis**, dissimilarity uses cluster coherence:
```
dissimilarity_cluster = 1 - coherence
```

---

## 9. Trajectory Classification

Each synthesized node is classified based on specificity relative to its parents:

```
trajectory = if σ_child ≥ avg_parent_σ · r then "knowledge" else "abstraction"
```

Where r is the specificityRatio (default: 0.9).

**Weight assignment by trajectory:**
```
w_base = if trajectory == "knowledge" then w_knowledge else w_abstraction
```

- w_knowledge (default): 1.0 — concrete, specific insights
- w_abstraction (default): 0.1 — abstract generalizations are heavily penalized

**Parent boosting:** When a knowledge-trajectory child is created, parents receive a weight boost:
```
w_parent_new = min(w_ceiling, w_parent + Δw_boost)
```
- Δw_boost (parentBoost, default): 0.1
- w_ceiling (weightCeiling, default): 3.0

---

## 10. Specificity Measurement

A heuristic scoring function that measures content density:

```
σ(content, domain) = n_numbers · w_num + n_tech · w_tech + n_nouns · w_noun + n_units · w_unit
```

Where:
- **n_numbers**: Count of numeric tokens (integers, decimals, percentages)
  - Pattern: `/\d+\.?\d*%?/g`
- **n_tech**: Count of domain-specific technical terms (word-boundary matched)
  - Loaded from configurable per-domain term lists
- **n_nouns**: Count of concrete nouns (capitalized words not at sentence start)
  - Pattern: `/(?<=[.!?]\s+[a-z].*?\s)[A-Z][a-z]+/g`
- **n_units**: Count of measurement units
  - Pattern from config (e.g., `\b\d+\s*(mg|ml|kg|km|Hz|dB|°C|%|ppm)\b`)

**Default weights:** Configurable at runtime via `config.specificity.*`.

---

## 11. Hallucination Detection

A six-signal heuristic detector with configurable thresholds. Synthesis output is checked against the source nodes:

### Signal 1: Fabricated Numbers
```
suspicious_numbers = {n ∈ output_numbers : n ∉ source_numbers ∧ (is_precise_decimal(n) ∨ int(n) > threshold)}
```
Round numbers (matching configurable pattern) are excluded. Default large number threshold: 1000.

### Signal 2: Future Predictions
```
flag if output matches pattern for future year references
```

### Signal 3: Extreme Multipliers
```
flag if output contains multipliers (e.g., "1000x", "50x") absent from sources
```

### Signal 4: Ungrounded Financial Claims
```
flag if output contains financial claims and sources lack financial terminology
```

### Signal 5: Novel Word Ratio (with Synthesis Vocabulary Exclusion)

**Key innovation:** This check excludes a configurable **synthesis vocabulary** — analytical and connective words that naturally emerge during synthesis (e.g., "furthermore", "whereas", "consequently") even when absent from parents. Without this exclusion, valid inferences are falsely flagged as hallucinations.

```
source_words = {w ∈ source_text : |w| > min_len}
output_words = [w ∈ output_text : |w| > min_len]
synth_vocab = configured set of ~60 synthesis-appropriate words

novel_words = [w ∈ output_words : w ∉ source_words ∧ w ∉ synth_vocab]
novel_ratio = |novel_words| / |output_words|

flag if novel_ratio > τ_novel ∧ |output_words| > min_words
```
Default τ_novel (novelRatioThreshold): 0.7

### Signal 6: Verbose Output
```
flag if word_count(output) > max_verbose_words
```

### Decision Rule
```
is_hallucination = (count(flagged_signals) ≥ min_red_flags)
```
Default min_red_flags: 2

---

## 12. Deduplication — Three-Tier Gate

The dedup system uses a tiered approach with per-source gate overrides:

### Tier 1: Hard Ceiling (Always Reject)
```
if cos(e_new, e_existing) ≥ θ_hard_ceiling → DUPLICATE
```
Default θ_hard_ceiling: 0.95

### Tier 2: Doubt Zone (LLM Judge)
```
if θ_doubt_floor ≤ cos(e_new, e_existing) < θ_hard_ceiling:
    verdict = LLM_judge(existing_content, new_content, similarity)
    if verdict == "DUPLICATE" → DUPLICATE
    else continue checking
```
Default θ_doubt_floor: 0.85

The LLM judge receives both contents and the similarity score, and must answer "NOVEL" or "DUPLICATE" with a one-line explanation. It is called via a dedicated `dedup_judge` subsystem with temperature 0.1 for deterministic behavior.

**Fail-open policy:** If the LLM call fails, the content is allowed through.

### Tier 3: Legacy Threshold (No Judge)
```
if cos(e_new, e_existing) ≥ θ_embedding → DUPLICATE
```
Default θ_embedding: 0.90

### Fallback: Word Overlap
```
overlap(A, B) = |{w : |w| > min_len, w ∈ A ∩ B}| / min(|A'|, |B'|)

if overlap ≥ τ_word_overlap → DUPLICATE
```
Default τ_word_overlap: 0.85, min_len: 3

### Per-Source Overrides

Each synthesis source (e.g., 'synthesis', 'domain-directed', 'kb-ingestion') can have independent thresholds stored in `dedup_gate_overrides` table, merged over global defaults.

### Batch Deduplication (Offline)

Union-Find clustering with single-linkage:

```
For each pair (i, j) where areSimilar(i, j):
    union(i, j)

For each cluster:
    keep node with max(weight)
    archive all others
```

---

## 13. Junk Filter — Negative Memory

Junked nodes serve as **negative examples**. New synthesis outputs are compared against all junk embeddings:

```
for each junk_node in recent_junk:
    sim = cos(e_new, e_junk)
    if sim ≥ θ_junk → REJECT
```

Default θ_junk (junkThreshold): 0.85 (raised from 0.65 to prevent self-poisoning)

### Anti-Poisoning Measures

The junk filter can self-poison: bad synthesis from bad inputs → junked → junk embeddings block ALL future content about those topics. Three defenses:

1. **High threshold** (0.85): Only very similar content is blocked
2. **Contributor exemption**: Seeds, human-contributed, and KB-ingested nodes skip the junk filter
3. **30-day decay**: Old junk nodes are excluded from the filter

---

## 14. Tension Detection — Contradiction Discovery

### Tension Scoring

Pairs of semantically similar nodes are checked for contradictory signals:

```
tension_score = Σ(matched_patterns) + negation_bonus

where:
  matched_patterns: count of opposing word pairs found across nodes
    e.g., (A contains "increase" ∧ B contains "decrease")
    Pattern pairs from config: [["increase", "decrease"], ["improve", "worsen"], ...]

  negation_bonus: added if exactly one node contains negation ("not", "n't")
```

### Combined Ranking

```
combined_score = similarity · tension_score
```

Pairs are ranked by combined_score descending. High similarity + high tension = most interesting contradiction.

### Requirements

```
similarity ≥ θ_tension_min    (only semantically related pairs)
tension_score > 0             (at least one opposing signal)
```

Partition boundaries are enforced — nodes in different unbridged partitions are never compared.

---

## 15. Niching — Domain Diversity Protection

Inspired by fitness sharing in genetic algorithms, niching prevents any single domain from monopolizing synthesis cycles:

```
fair_share = 1 / |domains|
threshold = max(min_share, fair_share)

For each domain d:
    share_d = recent_cycles_in_d / total_recent_cycles
    if share_d < threshold:
        add d to underrepresented[]

Select domain randomly from underrepresented[]
```

**Effect:** If domain A has been synthesized 80% of recent cycles while domain B has been synthesized 5%, niching forces the next cycle to target domain B.

Default min_share: 0.1, lookback_cycles: 20.

---

## 16. Domain-Directed Synthesis

A top-down approach that identifies underserved cross-domain pairs:

### Pair Scoring

```
For each bridged domain pair (d_A, d_B):
    min_nodes = min(node_count_A, node_count_B)
    recent = recent_syntheses_A + recent_syntheses_B
    score = min_nodes / (recent + 1)
    jittered_score = score · uniform(0.8, 1.2)

Select pair with max(jittered_score)
```

The jitter prevents always selecting the same pair. The scoring formula favors pairs with:
- Many nodes (high potential for novel connections)
- Few recent syntheses (underserved)

### Cold Node Selection

Within each domain, nodes are sampled using inverse-salience weighting (low salience = cold = more likely selected), ensuring under-explored nodes get attention.

---

## 17. Multi-Parent Recombination

GA-inspired N-parent recombination (typically 3-4 parents):

```
if multiParentEnabled ∧ random() < multiParentRate:
    extra_parents = neighbor_pool[1 : multiParentCount - 2]
    parent_set = [node_A, node_B, ...extra_parents]
```

The multi-parent voicing uses a specialized prompt that demands insight from the COMBINATION of all inputs, not just pairwise connections.

Default: multiParentRate = 0.2, multiParentCount = 3

---

## 18. Island Migration

Inspired by GA island models, migration occasionally selects partner nodes from **foreign (non-bridged) partitions**:

```
if migrationEnabled ∧ random() < migrationRate:
    foreignPartitions = all_partitions - home_partition - bridged_partitions
    migrants = top_K_nodes(foreignPartitions, by weight)
    candidates = migrants
```

This creates rare but potentially high-value cross-partition connections that wouldn't occur through normal bridged synthesis.

Default: migrationRate = 0.05 (5% of cycles), migrationTopK = 10

---

## 19. Partition Governance

### Isolation Model

Domains are organized into partitions. Cross-domain synthesis is restricted:

```
accessible(d) = {d' : d' ∈ same_partition(d)} ∪ {d' : d' ∈ bridged_partition(d)}
```

Nodes in different, non-bridged partitions **never** interact during synthesis, tension detection, or cluster formation.

### Auto-Partition Creation

New domains automatically get their own partition. If `project.autoBridge = true`, new partitions are automatically bridged to all existing partitions (except `know-thyself`).

### Decision Audit Trail

All graph mutations are logged with tier provenance:

```
decisions(entity_type, entity_id, field, old_value, new_value, decided_by_tier, contributor, reason)
```

**Override rules:**
- Human decisions can only be overridden by humans
- System decisions can be overridden by anyone
- This prevents autonomous systems from silently overriding human curation

---

## 20. Decay Functions

### Salience Decay

Applied every N synthesis cycles (default: 10):

```
s_new = s · λ_salience    for all active nodes where s > s_floor
```
Default λ_salience (salienceDecay): 0.98 (2% per cycle batch)

### Stale Node Rescue

Prevents "orphaned partition death spiral" where isolated nodes decay below the sampling threshold permanently:

```
if s > 0 ∧ s ≤ s_floor · 1.5 ∧ last_updated < (now - rescue_days):
    s = s_floor · 2
```

This gives rescued nodes low but nonzero selection probability.

### Weight Decay

```
w_new = w · λ_weight    for all active nodes
```
Default λ_weight (weightDecay): 0.99

### Synthesis Node Extra Decay

GA-inspired: synthesis/voiced nodes that are never referenced by the context engine receive accelerated decay:

```
if node_type ∈ {synthesis, voiced}
   ∧ age > grace_period_days
   ∧ times_used_in_sessions = 0:
    w_new = w · λ_synthesis_decay
```
Default λ_synthesis_decay: 0.95, grace_period: 7 days

**Effect:** Synthesized knowledge that is never useful to users decays faster, implementing a form of "use it or lose it" natural selection.

---

## 21. Telegraphic Compression

A two-mode text compression system used to reduce token consumption when feeding node content to LLMs:

### Rule-Based Mode

Three-level removal with configurable word lists:

```
For each word w in text:
    if w ∈ REMOVE_ALWAYS: remove          // articles, "the", "a", "an"
    if aggressiveness ≥ medium:
        if w ∈ REMOVE_MEDIUM: remove      // prepositions, conjunctions
    if aggressiveness = aggressive:
        if w ∈ REMOVE_AGGRESSIVE: remove  // auxiliary verbs, adverbs

    if w ∈ WORD_REPLACEMENTS: replace     // "because" → "∵", "therefore" → "∴"
    if w ∈ PRESERVE: keep                 // domain-critical words
```

Multi-word phrase replacements applied first (e.g., "in order to" → "→", "as a result" → "∴").

### Entropy-Aware Mode

Uses `compromise` NLP library to assign information-density scores:

```
entropy(token) = Σ (signal_weight · signal_present)

Signals and default weights:
  - Named entity (person/place/org):  0.40
  - Number/money/percentage:          0.35
  - Proper noun:                      0.30
  - Acronym (2-6 uppercase letters):  0.25
  - Rare word (≥ 8 characters):       0.15

Normalized: entropy = raw_score / max_possible_score
```

**Removal decision:**
```
if entropy(token) ≥ threshold[aggressiveness]: PRESERVE
else: apply rule-based removal check
```

Default thresholds: light=0.20, medium=0.35, aggressive=0.50

**Key property:** Entropy mode is a **protective layer** — it can only prevent removal, never force it. A token that passes the entropy threshold is preserved regardless of rule-based lists.

---

## 22. Voicing — LLM-Mediated Synthesis

The voicing system converts node pairs (or clusters) into novel insights via LLM:

### Prompt Structure

```
[Project Context Block]    // Manifest: purpose, domains, goals
[Insight Synthesis Prompt] // Demands NEW insight not in either input
  - Node A: <node-content>...</node-content>
  - Node B: <node-content>...</node-content>
```

Content is wrapped in `<node-content>` delimiters to defend against indirect prompt injection.

### Structured Output

JSON schema enforced:
```json
{
  "insight": "One sentence synthesis insight under N words"
}
```

### Post-Processing Pipeline

1. **JSON parsing** with multi-level fallback (strict parse → regex extract → raw text)
2. **Truncation detection:** Reject if unclosed parentheses, ends with comma/paren, no sentence-ending punctuation
3. **Length enforcement:** If too long, extract first sentence or truncate to N words
4. **Novelty check:**
   ```
   novel_words = {w ∈ output : |w| > min_len ∧ w ∉ words_A ∧ w ∉ words_B}
   REJECT if |novel_words| < min_novel_words
   ```
   Default: min_novel_words = 2, min_word_length = 3
5. **Hallucination detection** (see Section 11)

### Multi-Parent Voicing

For clusters (3+ parents), content is labeled A:, B:, C:, D: and a specialized `multi_insight_synthesis` prompt demands insight from the COMBINATION, not just pairwise connections.

---

## 23. Autonomous Cycle Architecture

Five independent cycle types run via a generic loop runner:

### Cycle Types

| Cycle | Purpose | Input | Output |
|-------|---------|-------|--------|
| **Synthesis** | Create new knowledge | Node pairs/clusters | synthesis nodes |
| **Validation** | Identify breakthroughs | High-weight synthesis nodes | "possible" promotions |
| **Questions** | Answer research gaps | question nodes + context | voiced answers |
| **Tensions** | Find contradictions | All weighted nodes | question nodes |
| **Research** | Seed new knowledge | Underserved domains | seed nodes |

### Cycle Selection (Main Loop)

Each iteration probabilistically selects a synthesis mode:

```
p_domain = domainDirectedCycleRate
p_cluster = clusterCycleRate · (1 - p_domain)

random_value = random()

if random_value < p_domain:
    domainDirectedCycle()
elif random_value < p_domain + p_cluster:
    clusterSynthesisCycle()
else:
    synthesisCycle()          // Standard pairwise
```

### Validation Cycle

Identifies breakthrough candidates using LLM-based scoring:

```
candidates = nodes where weight ≥ threshold ∧ type ∈ {synthesis, voiced} ∧ not_yet_validated
scores = LLM_validate(candidate, parent_nodes)
composite = weighted_sum(synthesis, novelty, testability, tension_resolution)

if composite ≥ min_composite:
    promote to "possible"
```

### Research Cycle with Relevance Gate

The research cycle generates new seeds for underserved domains, with an embedding-based relevance gate:

```
1. Select domain with fewest nodes (underserved)
2. Gather existing knowledge + open questions
3. Guard: require project manifest (prevents domain name misinterpretation)
4. Generate seeds via LLM
5. For each seed:
   centroid = average(embeddings of existing domain nodes)
   seed_emb = embed(seed)
   relevance = cos(seed_emb, centroid)
   if relevance < τ_relevance: REJECT
6. Propose accepted seeds through standard intake pipeline
```

Default τ_relevance: 0.3

### Question Backlog Control

The tension cycle respects a maximum pending question count:

```
if unanswered_questions ≥ max_pending:
    skip_cycle()
```

This prevents unbounded question generation when the QA cycle can't keep up.

---

## 24. Self-Tuning System

### Parameter Grid Search

Automated parameter optimization using Latin Hypercube Sampling:

**Grid dimensions:**
```
temperature: [0.1, 0.3, 0.5, 0.7, 0.9]
top_p:       [0.8, 0.9, 1.0]
min_p:       [0, 0.05, 0.10]
top_k:       [0, 20, 40]
repeat_pen:  [1.0, 1.1, 1.3]
```

Full Cartesian product: 5 × 3 × 3 × 3 × 3 = 405 combinations.

**Latin Hypercube Sampling** when maxCombos < total:
```
scored = [(combo, sin(i · 2654435761) · 10000 mod 1) for i in range(total)]
sort by score
select evenly-spaced samples: idx = floor(i · total / maxCombos)
```

### Refinement Grid

Subsequent subsystems in the same model group use a narrow grid around the best-found parameters:

```
narrow(param, delta) = [clamp(param - delta), param, clamp(param + delta)]
```

### Gold Standard 3-Tier Scoring

Each operational prompt has gold standard reference outputs at three quality tiers, generated by a dedicated `tuning_judge` model:

```
goldScore = max(cos(e_output, e_tier1) · 1.0,
                cos(e_output, e_tier2) · 0.85,
                cos(e_output, e_tier3) · 0.65)
```

Tier weights: Tier 1 (best) = 1.0, Tier 2 (good) = 0.85, Tier 3 (acceptable) = 0.65.

### Convergence Detection with Variance Weighting

When top combos score similarly, prefer consistency:

```
top3 = sort_by_score(results)[:3]
range = top3[0].score - top3[2].score

if range < convergence_threshold:
    For each combo in top3:
        σ = stddev(run_scores)

    Select combo with min(σ), breaking ties by max(score)
```

### Heuristic Scoring Functions

When gold standards are unavailable, per-subsystem heuristic scorers are used:

**Voice scoring** (5 dimensions):
```
overall = 0.30 · jsonValid + 0.25 · completeness + 0.20 · length + 0.15 · noRepetition + 0.10 · substance
```

**Compression scoring** (4 dimensions):
```
overall = 0.30 · compression_ratio + 0.35 · term_retention + 0.20 · coherence + 0.15 · no_repetition
```

**Stutter detection** (shared across scorers):
```
For window_size in [3, 8]:
    For each position:
        phrase = words[i:i+window_size]
        if phrase appears again in remaining text: STUTTER
```

### Model Grouping and Reader Consolidation

Subsystems sharing the same LLM model are grouped. The first subsystem gets full grid search; subsequent ones get refinement search seeded from the best result. Text readers (text/pdf/doc) share parameters and are tuned once.

---

## 25. RAG Integration — Knowledge Proxy

An OpenAI-compatible proxy server that enriches LLM requests with knowledge graph context:

### Dynamic Budget Allocation

```
total_budget = model_context_size
knowledge_reserve = total_budget · reserve_ratio
knowledge_min = total_budget · min_reserve_ratio
user_content_tokens = estimate_tokens(messages)

available_for_knowledge = clamp(
    total_budget - user_content_tokens - overhead,
    knowledge_min,
    knowledge_reserve
)
```

Default: reserve_ratio = 0.15 (15%), min_reserve_ratio = 0.05 (5%)

### Token Estimation

```
tokens ≈ chars / 3 + 20 per message (chat template overhead)
```

Conservative estimate suitable for most models.

### Knowledge Injection

The proxy:
1. Extracts user's query from the message history
2. Queries the knowledge graph via `podbit.compress` with task-aware reranking
3. Injects the compressed knowledge as a system message prefix
4. Forwards the enriched request to the target LLM

---

## 26. Context Engine — Dynamic Knowledge Delivery

A per-turn, session-aware knowledge delivery system designed primarily for smaller/local LLMs:

### Five-Signal Relevance Scoring

Each knowledge node is scored for relevance to the current turn:

```
relevance(node, turn) = Σᵢ wᵢ · signalᵢ
```

| Signal | Description | Typical Weight |
|--------|-------------|----------------|
| Embedding similarity | cos(query_emb, node_emb) | 0.35 |
| Topic match | Keyword/domain overlap with accumulated topics | 0.25 |
| Node weight | Graph-derived importance | 0.15 |
| Recency | Time since node was last referenced | 0.10 |
| Cluster diversity | Penalize nodes similar to already-selected ones | 0.15 |

### Intent-Adaptive Weights

The engine classifies user intent and adjusts signal weights:

| Intent | Embedding ↑ | Topic ↑ | Weight ↑ | Recency ↑ |
|--------|-------------|---------|----------|-----------|
| Retrieval | High | Medium | Low | Low |
| Action | Medium | High | Medium | Medium |
| Diagnosis | High | High | High | Low |
| Exploration | Low | Low | High | High |

### Cross-Session Learning

Topic weights and node usage are persisted to the database using Exponential Moving Average:

```
topic_weight_new = α · current_relevance + (1 - α) · topic_weight_old
```

New sessions warm-start from these persisted insights rather than starting cold.

### Feedback Loop

After each model response, the engine:
1. Detects which delivered knowledge nodes were referenced in the response
2. Boosts those nodes' weights in the graph
3. Extracts new topics from the response
4. Computes quality metrics (knowledge utilization, response grounding, topic coverage)
5. Compresses conversation history if token budget is exceeded

---

## 27. Injection Detection

Pattern-based prompt injection detection for proposed content:

### Scoring Architecture

Six pattern groups with independent weights:

```
For each group g in [instruction_override, role_override, prompt_structure,
                     template_injection, structure_breaking, system_prompt]:
    For each pattern in g.patterns:
        if regex_match(content, pattern):
            score += g.weight
            break  // One match per group

is_injection = (score ≥ score_threshold)
```

**Default weights:**
- instruction_override: 2
- role_override: 1
- prompt_structure: 2
- template_injection: 2
- structure_breaking: 1
- system_prompt: 1

Default score_threshold: 3

---

## 28. Domain Inference — Three-Tier Strategy

When content is proposed without a domain, the system infers one:

### Tier 1: Synonym Match (No LLM)
```
Check domain_synonyms table for matches against content keywords
```
Synonyms are auto-generated from domain names (singular/plural, -ing/-ed variants, prefixes) and enriched by LLM.

### Tier 2: Embedding Similarity
```
For each domain d:
    representative = highest-weight node in d
    sim = cos(embed(text), embed(representative))

Select domain with max(sim) if sim > τ_inference
```
Default τ_inference: 0.5

### Tier 3: LLM Classification
```
Prompt: Given existing domains [list], classify this text into one.
Parse JSON response for domain name.
Convert to kebab-case slug.
```

### Fallback
```
domain = slug(first_3_words(content))
```

---

## 29. Knowledge Base Ingestion

### Dual-Mode Pattern

The same source folder can be registered twice:

1. **Raw mode** (`node_type = 'raw'`): Verbatim content for search/RAG only. Excluded from ALL autonomous cycles.
2. **Curated mode** (`node_type = 'seed'`): LLM-processed descriptions that participate in synthesis.

### Change Detection

```
hash = SHA-256(file_content)
if hash == stored_hash: skip
else: reprocess
```

### Two-Stage Decomposition Pipeline (pdf, doc, text readers)

Replaces "extract principles in 1-3 sentences" curation with a two-stage LLM pipeline:

```
Stage 1 — Claim Decomposition (per chunk):
    decompose(chunk) → [{
        claim: "atomic statement",
        type: EMPIRICAL | RESTATEMENT | METHODOLOGICAL | SPECULATIVE | DEFINITIONAL,
        evidence_strength: "strong" | "moderate" | "weak",
        source_location: "section/page reference",
        depends_on: [other_claim_indices],
        confidence_signals: ["signal1", "signal2"]
    }]

Stage 2 — Claim Filtering (per file, all Stage 1 output):
    filter(all_claims) → [{
        action: seed | context | hypothesis | discard,
        weight: 0.0-1.0,
        ingestion_content: "formatted for graph",
        discard_reason?: "why removed"
    }]
```

### Intake Defense

KB ingestion floods a single domain, which would trigger concentration throttling. Defense: exempt KB contributors from concentration checks:

```
-- Concentration count EXCLUDES kb: contributors
SELECT COUNT(*) FROM nodes
WHERE contributor NOT LIKE 'kb:%' AND created_at >= cutoff
```

---

## 30. Novel Contributions Summary

### For the Research Paper

1. **Resonance Band Filtering**: Productive similarity window [θ_floor, θ_ceiling] that constrains synthesis to the zone between "too different" and "too similar" — a novel application of bandpass filtering to embedding space.

2. **Evolutionary Knowledge Graph**: Treating knowledge nodes as individuals in a genetic algorithm with cosine similarity defining fitness landscape, LLM synthesis as crossover, multi-gate quality checks as selection pressure, and salience decay as generational turnover.

3. **Simulated Annealing Cluster Selection**: Using simulated annealing to find optimal multi-node clusters in embedding space with a composite energy function balancing coherence, diversity, weight, and size.

4. **Fitness Modifier**: GA-inspired initial weight assignment that rewards harder synthesis (dissimilar parents), novelty (unlike existing content), and specificity enrichment (child more specific than parents).

5. **Synthesis Vocabulary Exclusion**: Novel defense against false hallucination detection — excluding analytical/connective words that naturally emerge during synthesis from the novel word ratio check.

6. **Three-Tier Dedup with LLM Judge**: Embedding threshold → LLM doubt zone → hard ceiling architecture with per-source gate overrides and fail-open policy.

7. **Junk Filter Negative Memory with Anti-Poisoning**: Using archived "junk" embeddings as negative filters with three anti-poisoning defenses (high threshold, contributor exemption, temporal decay).

8. **Partition Governance with Decision Provenance**: Domain isolation via partitions with explicit bridges, audit-trailed decisions with tier provenance, and human-override protection.

9. **Domain-Directed Synthesis**: Top-down selection of underserved cross-domain pairs with inverse-salience cold-node sampling and jitter-based selection diversity.

10. **Entropy-Aware Telegraphic Compression**: NLP-based information density scoring that acts as a protective layer over rule-based text compression, preserving high-entropy tokens (entities, numbers, acronyms) while allowing removal of low-information function words.

11. **Self-Tuning with Gold Standard 3-Tier Scoring**: Automated parameter search with Latin Hypercube Sampling, gold standard reference responses at three quality tiers, variance-weighted convergence detection, and cross-subsystem parameter seeding.

12. **Research Cycle with Embedding Relevance Gate**: Autonomous knowledge generation with domain centroid comparison to reject off-topic seeds, and mandatory project manifest to prevent domain name misinterpretation.

13. **Cross-Session Learning Context Engine**: Per-turn knowledge delivery with 5-signal relevance scoring, intent-adaptive weights, feedback loop with weight modification, and EMA-based cross-session persistence.

14. **Use-It-Or-Lose-It Synthesis Decay**: Accelerated weight decay for synthesized nodes never referenced by users, implementing natural selection pressure toward useful knowledge.

15. **Stale Node Rescue**: Periodic salience reset preventing "orphaned partition death spiral" where isolated nodes decay below sampling threshold permanently.

16. **Domain-Scoped Numeric Isolation**: Variable placeholder system (`[[[PREFIX+nnn]]]`) that prevents the synthesis engine from universalizing domain-specific numbers across unrelated domains, with two resolution strategies (direct resolution for most contexts, legend injection for voicing).

17. **Unified Synthesis Pipeline**: Single pipeline with mechanical birth checks, citizen validation (accept/rework/reject), and comprehensive consultant scoring (coherence, grounding, novelty, specificity, forced analogy). 100+ configurable parameters.

18. **Execution Validation Module with Falsifiability Defense**: Multi-stage verification pipeline with structural tautology detection (rejects specs containing embedded code), adversarial falsifiability review (second LLM checks for cherry-picked parameters), prior rejection memory (prevents flip-flopping), and external lab server routing. Defends against the class of tautological tests that pass structural checks but encode the conclusion as arithmetic.

20. **Elite Verification Pool with Generation Tracking**: Immutable, high-confidence verified knowledge nodes with generation depth tracking, manifest goal mapping, and elite-to-elite bridging synthesis. Terminal findings at max generation represent the deepest verified insights.

21. **Merkle DAG Integrity Chain**: Cryptographic provenance via SHA-256 content hashing with chained log entries, creating tamper-evident audit trail where any modification breaks the hash chain.

22. **Transient Partition Migration**: Knowledge propagation across projects via temporary partition visits — export, quarantine, bridge, synthesize, depart — with natural selection where partition fitness is measured by offspring weight.

23. **Two-Stage Document Decomposition Pipeline**: Knowledge base curation that replaces "extract principles in 1-3 sentences" with a two-stage LLM pipeline. Stage 1 decomposes each chunk into atomic classified claims (EMPIRICAL, RESTATEMENT, METHODOLOGICAL, SPECULATIVE, DEFINITIONAL) with evidence strength, dependency tracking, and confidence signals. Stage 2 runs file-wide filtering with aggressive noise removal, weight assignment, and action classification (seed/context/hypothesis/discard). Produces higher-quality graph nodes that preserve quantitative results and provenance metadata.

---

## 31. Unified Synthesis Pipeline

Single pipeline replacing the former dual heuristic/consultant modes:

### Birth Pipeline
Mechanical checks + citizen validation (accept/rework/reject LLM call).

### Population Control
Single `runComprehensiveConsultant()` per node:

```
consultant_score = Σ wᵢ · scoreᵢ

Dimensions and weights:
    coherence:       0.30
    grounding:       0.25
    novelty:         0.20
    specificity:     0.15
    forced_analogy:  0.10
```

**Active gates (pure math/string):** resonance threshold, structural validation, truncation checks, word limits, compression, specificity scoring, dedup, junk filter, number variables, salience/weight dynamics.

---

## 32. Domain-Scoped Numeric Isolation (Number Variables)

Prevents the synthesis engine from universalizing domain-specific numbers:

### Variable Registration
```
For each number n in node content:
    var_id = PREFIX + counter    // PREFIX = SHA-256(installation_uuid)[:4]
    registry[var_id] = {value: n, domain: d, context: surrounding_words}
    content = content.replace(n, "[[[var_id]]]")
```

### Resolution Strategy
Two resolution modes depending on context:

1. **Direct resolution** (EVM, evaluation, validation, QA, research, tensions):
   ```
   resolved = content.replace("[[[var_id]]]", registry[var_id].value)
   ```

2. **Legend injection** (voicing only):
   ```
   legend = "Variable [[[NX1]]] = 0.003, domain: biology, context: 'activation density'"
   prompt = legend + content_with_placeholders
   output = strip_any_leaked_placeholders(llm_output)
   new_vars = register_fresh_variables(output)
   ```

**Key property:** Voicing never resolves variables. Instead, the LLM sees the legend and produces clean output with raw numbers, which get fresh variable refs when stored.

---

## 34. Execution Validation Module (EVM)

Verifies synthesized knowledge claims via external lab servers with multi-stage defense against tautological tests:

### Verification Pipeline
```
1. Pre-flight: check if prior "no lab" skip can be avoided (lab now registered?)
2. Spec extraction: LLM reads claim + lab capabilities → ExperimentSpec
   - Prior rejection reasons injected to prevent flip-flopping
   - Claim types are open-ended (labs define their own)
3. Structural tautology check: reject specs with embedded code
   - Detects: function definitions (def/function), import/for/while/return blocks
   - Specs must be declarative parameters, not executable implementations
4. Falsifiability review (spec_review subsystem, optional):
   - Second LLM judges whether setup params are cherry-picked
   - Checks: extreme ratios, narrow parameter spaces, definitional measurements
   - Configurable confidence threshold (default 0.7)
5. Lab routing: select best lab from registry (capabilities, queue, health, priority)
6. Lab execution: lab generates code, runs experiment, evaluates results
7. Record: update node weight based on verification outcome
```

### Persistent Queue
```
lab_queue(status, priority, retry_count, max_retries, guidance)
    status ∈ {pending, processing, completed, failed, cancelled}
    worker polls every 5s
    cooldown: 10min for non-manual enqueues (prevents re-queue churn)
    template_id nullable (resolved at runtime by routing)
```

### Weight Adjustment
```
if verified:
    w_new = w + boost      // verified claim gets weight increase
elif failed:
    w_new = w - penalty    // failed claim gets weight decrease
```

### Decomposition
Broad claims can be split into atomic facts + research questions before verification:
```
decompose(claim) → {facts: [{content, confidence, category}], questions: [{content, reasoning}]}
```

---

## 35. Elite Verification Pool

High-confidence verified knowledge promoted from successful EVM verification:

### Promotion Pipeline
```
if evm_verified ∧ confidence ≥ threshold:
    elite_content = LLM_synthesize(source_content, hypothesis, code, stdout, manifest_context)
    elite_node = create(content: elite_content, generation: max(parent_generations) + 1)
    map_to_manifest(elite_node, project_goals)
```

### Elite-to-Elite Bridging
```
candidates = elite_pairs where both parents are elite ∧ not yet attempted
synthesis = voice(parent_a, parent_b)
if passes_all_gates:
    promote to next generation elite
```

### Generation Tracking
```
generation(seed) = 0
generation(elite from raw verification) = 1
generation(elite from bridging) = max(parent_generations) + 1
```

Terminal findings at max generation represent the system's deepest verified insights.

---

## 36. Model Provenance Tracking

Every synthesized node stores its creation model:

```
node.model_id = assigned_model.id        // registry UUID
node.model_name = assigned_model.name    // human-readable name
```

Populated at all LLM creation points: synthesis engine (4 paths), voicing cycle, question cycle, tension cycle. Enables per-model quality analysis and attribution.

---

## 37. Feedback System

Human/agent quality feedback with weight adjustment:

```
rate(node, rating):
    if rating == 1 (useful):     w_new = w + 0.2
    if rating == 0 (not useful): w_new = w - 0.1
    if rating == -1 (harmful):   w_new = w - 0.3

    w_new = max(w_new, 0.1)    // weight floor
```

Feedback invalidates knowledge cache for the affected domain. Sources: human, agent, auto. Full history tracked in `node_feedback` table.

---

## 38. Integrity Verification (Merkle DAG)

Cryptographic provenance chain for graph mutations:

```
For each mutation (create, update, promote):
    content_hash = SHA-256(node.content)
    parent_hashes = [hash(parent) for parent in node.parents]
    prev_log_hash = most_recent_log_entry.log_hash
    log_hash = SHA-256(content_hash + parent_hashes + prev_log_hash + operation + timestamp)
```

Creates tamper-evident audit trail. Any modification to historical nodes breaks the hash chain.

---

## 39. Transient Partition Migration

Knowledge propagation across projects without central infrastructure:

### Lifecycle
```
EXPORT → IMPORT (quarantine) → BRIDGE → SYNTHESIZE → DEPART
```

1. Source project exports partition as JSON (nodes, edges, metadata)
2. Host imports as transient (state: quarantine)
3. After validation, bridges to host partitions
4. Participates in synthesis cycles, produces offspring
5. On departure: exports partition + claimed children, host retains stubs

### Natural Selection
```
partition_fitness = Σ (child_weight) / cycles_run
```
Partitions producing high-weight children everywhere they visit become sought-after; those producing noise stop being invited.

---

## Appendix A: Key Configuration Parameters

| Parameter | Default | Section |
|-----------|---------|---------|
| resonanceThreshold | 0.5 | Resonance Band |
| similarityCeiling | 0.92 | Resonance Band |
| salienceDecay | 0.98 | Decay |
| weightDecay | 0.99 | Decay |
| salienceFloor | 0.01 | Sampling |
| salienceCeiling | 1.0 | Sampling |
| salienceBoost | 0.05 | Sampling |
| weightCeiling | 3.0 | Weight |
| parentBoost | 0.1 | Weight |
| knowledgeWeight | 1.0 | Trajectory |
| abstractionWeight | 0.1 | Trajectory |
| specificityRatio | 0.9 | Trajectory |
| minSpecificity | 0.5 | Specificity Gate |
| subsetOverlapThreshold | 0.8 | Anti-Tautology |
| minVocabulary | 5 | Structural |
| minCombinedSpecificity | 1.0 | Structural |
| junkThreshold | 0.85 | Junk Filter |
| embeddingSimilarityThreshold | 0.90 | Dedup |
| llmJudgeDoubtFloor | 0.85 | Dedup |
| llmJudgeHardCeiling | 0.95 | Dedup |
| wordOverlapThreshold | 0.85 | Dedup |
| novelRatioThreshold | 0.7 | Hallucination |
| minRedFlags | 2 | Hallucination |
| migrationRate | 0.05 | Island Migration |
| multiParentRate | 0.2 | Multi-Parent |
| nichingMinShare | 0.1 | Niching |
| initialTemp | 1.0 | Simulated Annealing |
| coolingRate | 0.95 | Simulated Annealing |
| maxIterations | 100 | Simulated Annealing |
| targetClusterSize | 3 | Cluster Selection |
| fitnessWeights.dissimilarity | 0.4 | Fitness |
| fitnessWeights.novelty | 0.35 | Fitness |
| fitnessWeights.specificity | 0.25 | Fitness |
| fitnessRange.min | 0.5 | Fitness |
| fitnessRange.max | 1.5 | Fitness |
| relevanceThreshold | 0.3 | Research Cycle |
| numberVariables.enabled | true | Number Variables |
| numberVariables.maxVarsPerNode | 50 | Number Variables |
| numberVariables.contextWindowSize | 10 | Number Variables |

## Appendix B: Database Schema (Key Tables)

```sql
-- Knowledge nodes
CREATE TABLE nodes (
    id TEXT PRIMARY KEY DEFAULT (uuid),
    content TEXT NOT NULL,
    embedding_bin BLOB,            -- L2-normalized Float32Array binary
    embedding_model TEXT,
    embedding_dims INTEGER,
    node_type TEXT,                 -- seed|synthesis|voiced|breakthrough|possible|question|raw
    trajectory TEXT,               -- knowledge|abstraction
    domain TEXT,
    weight REAL DEFAULT 1.0,
    salience REAL DEFAULT 1.0,
    specificity REAL DEFAULT 0,
    origin TEXT,
    contributor TEXT,
    archived INTEGER DEFAULT 0,
    junk INTEGER DEFAULT 0,
    excluded INTEGER DEFAULT 0,
    lifecycle_state TEXT DEFAULT 'active',  -- nascent|active|declining|composted
    generation INTEGER DEFAULT 0,
    elite_considered INTEGER DEFAULT 0,
    breedable INTEGER DEFAULT 1,
    model_id TEXT,                  -- LLM model provenance
    model_name TEXT,
    content_hash TEXT,             -- SHA-256 for Merkle DAG
    avatar_url TEXT,               -- DiceBear SVG data URI
    voice_mode TEXT,
    last_resonated TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Directed edges
CREATE TABLE edges (
    source_id TEXT REFERENCES nodes(id),
    target_id TEXT REFERENCES nodes(id),
    edge_type TEXT,                 -- parent|tension_source
    strength REAL DEFAULT 1.0,
    UNIQUE(source_id, target_id, edge_type)
);

-- Synthesis cycle audit log
CREATE TABLE dream_cycles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_a_id TEXT,
    node_b_id TEXT,
    resonance_score REAL,
    threshold_used REAL,
    created_child BOOLEAN,
    child_node_id TEXT,
    child_trajectory TEXT,
    rejection_reason TEXT,
    domain TEXT,
    parent_ids TEXT,                -- JSON array
    parameters TEXT,               -- JSON with config snapshot
    completed_at DATETIME
);

-- Decision audit trail
CREATE TABLE decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT,
    entity_id TEXT,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    decided_by_tier TEXT,          -- human|system
    contributor TEXT,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Domain partitions (island model)
CREATE TABLE domain_partitions (id TEXT PK, name TEXT, description TEXT, system INTEGER DEFAULT 0, transient INTEGER DEFAULT 0, state TEXT DEFAULT 'active');
CREATE TABLE partition_domains (partition_id TEXT, domain TEXT, UNIQUE);
CREATE TABLE partition_bridges (partition_a TEXT, partition_b TEXT, UNIQUE);

-- Number variable isolation
CREATE TABLE number_registry (var_id TEXT PK, value TEXT, scope_text TEXT, source_node_id TEXT, domain TEXT);
CREATE TABLE node_number_refs (node_id TEXT, var_id TEXT, PRIMARY KEY(node_id, var_id));

-- Elite verification pool
CREATE TABLE elite_nodes (node_id TEXT PK, source_verification_id TEXT, confidence REAL, verification_type TEXT, provenance_chain TEXT);
CREATE TABLE elite_manifest_mappings (id TEXT PK, node_id TEXT, manifest_target_type TEXT, manifest_target_text TEXT, relevance_score REAL);
CREATE TABLE elite_bridging_log (id TEXT PK, parent_a_id TEXT, parent_b_id TEXT, synthesis_node_id TEXT, outcome TEXT);

-- EVM
CREATE TABLE evm_executions (id TEXT PK, node_id TEXT, status TEXT, hypothesis TEXT, code TEXT, verified INTEGER, confidence REAL, score REAL, claim_index INTEGER DEFAULT 0);
CREATE TABLE evm_queue (id INTEGER PK, node_id TEXT, status TEXT DEFAULT 'pending', priority INTEGER DEFAULT 0, retry_count INTEGER DEFAULT 0);

-- Feedback
CREATE TABLE node_feedback (id TEXT PK, node_id TEXT, rating INTEGER, source TEXT, contributor TEXT, note TEXT, weight_before REAL, weight_after REAL);

-- Integrity
CREATE TABLE integrity_log (id INTEGER PK, node_id TEXT, operation TEXT, content_hash_before TEXT, content_hash_after TEXT, parent_hashes TEXT, log_hash TEXT, prev_log_hash TEXT);

-- Transient partitions
CREATE TABLE partition_visits (id INTEGER PK, partition_id TEXT, project_name TEXT, arrived_at TEXT, departed_at TEXT, cycles_run INTEGER DEFAULT 0, children_created INTEGER DEFAULT 0);
CREATE TABLE node_stubs (node_id TEXT PK, domain TEXT, partition_id TEXT, content_hash TEXT, summary TEXT, weight_at_stub REAL, cause TEXT);
```

## Appendix C: Relevant Literature Connections

- **Genetic Algorithms**: Holland (1975), Goldberg (1989) — fitness-proportionate selection, crossover, mutation
- **Island Model GA**: Whitley et al. (1999) — isolated subpopulations with migration
- **Fitness Sharing / Niching**: Goldberg & Richardson (1987) — maintaining population diversity
- **Simulated Annealing**: Kirkpatrick et al. (1983) — Metropolis criterion, cooling schedules
- **RAG**: Lewis et al. (2020) — retrieval-augmented generation
- **Knowledge Graphs**: Ji et al. (2021) — survey of knowledge graph embedding and reasoning
- **Embedding Similarity**: Mikolov et al. (2013), Reimers & Gurevych (2019) — word/sentence embeddings
- **Prompt Injection Defense**: Greshake et al. (2023) — indirect prompt injection attacks
- **Latin Hypercube Sampling**: McKay et al. (1979) — stratified sampling for parameter search
- **Telegraphic Speech**: Brown (1973) — linguistic compression in child language acquisition
- **Information Entropy**: Shannon (1948) — foundational information theory for entropy-aware compression
