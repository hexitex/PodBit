# Transient Partitions — Design Specification

> Distributed knowledge evolution through temporary partition visits.

## 1. Core Concept

Partitions can temporarily **visit** other projects. A transient partition bridges to host partitions, participates in synthesis cycles, produces offspring with host nodes, and after its value is exhausted migrates out — carrying evolved nodes and claimed children. The host retains stub records (provenance metadata) for departed nodes, preserving lineage.

This creates a **living circulation system** where knowledge propagates across projects without central infrastructure. Each project stays a single SQLite file; the "network" is partitions moving between files via export/import with temporal rules.

**Natural selection emerges**: partitions producing high-weight children everywhere they visit become sought-after guests; those producing noise stop being invited.

### What This Is Not

- Not replication (the partition *moves*, not copies)
- Not federation (no central coordinator required)
- Not merging (host and visitor remain separate partitions)

## 2. Lifecycle

```
EXPORT          IMPORT          QUARANTINE        BRIDGE          SYNTHESIZE        DEPART
────────────────────────────────────────────────────────────────────────────────────────────

Source        ──►  Host         ──►  Scan &      ──►  Bridge to  ──►  Participate  ──►  Export
project           receives          validate          host            in cycles         partition
exports           partition         every node        partitions      produce           + children
partition         as transient      (autorating,      (auto or        offspring         back out
file              (quarantine)      junk filter,      manual)
                                    injection                                          Host keeps
                                    scan)                                              stub records
```

### 2.1 States

| State | Description | Bridged? | Synthesizes? |
|-------|-------------|----------|-------------|
| `exported` | Serialized to file, not in any project | N/A | No |
| `quarantine` | Imported but not yet validated | No | No |
| `active` | Validated, bridged, participating | Yes | Yes |
| `departing` | TTL expired, preparing to export | Yes (read-only) | No (last cycle) |
| `departed` | Exported out, stub records remain | No | No |

### 2.2 TTL: Diminishing Returns

The partition departs when **cross-pollination value is exhausted**, not after a fixed time:

- Track children produced per synthesis cycle window (e.g., last 10 cycles)
- If 0 new children in N consecutive cycles → trigger departure
- Configurable: `transient.minCycles` (minimum stay), `transient.maxCycles` (maximum stay), `transient.exhaustionThreshold` (consecutive barren cycles before departure)
- Host can also manually trigger departure at any time

## 3. Data Model

### 3.1 Schema Additions

```sql
-- New columns on domain_partitions
ALTER TABLE domain_partitions ADD COLUMN transient INTEGER DEFAULT 0;
ALTER TABLE domain_partitions ADD COLUMN source_project TEXT;          -- project name the partition came from
ALTER TABLE domain_partitions ADD COLUMN source_owner TEXT;            -- who exported it (public key fingerprint)
ALTER TABLE domain_partitions ADD COLUMN imported_at TEXT;             -- when it arrived
ALTER TABLE domain_partitions ADD COLUMN state TEXT DEFAULT 'active';  -- quarantine|active|departing|departed
ALTER TABLE domain_partitions ADD COLUMN visit_config TEXT;            -- JSON: {minCycles, maxCycles, exhaustionThreshold}
ALTER TABLE domain_partitions ADD COLUMN cycles_completed INTEGER DEFAULT 0;
ALTER TABLE domain_partitions ADD COLUMN barren_cycles INTEGER DEFAULT 0;  -- consecutive cycles with 0 children

-- Visit history (provenance manifest)
CREATE TABLE IF NOT EXISTS partition_visits (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    partition_id    TEXT NOT NULL,              -- transient partition ID
    project_name    TEXT NOT NULL,              -- host project name
    arrived_at      TEXT NOT NULL,
    departed_at     TEXT,
    cycles_run      INTEGER DEFAULT 0,
    children_created INTEGER DEFAULT 0,
    children_avg_weight REAL DEFAULT 0,
    children_breakthroughs INTEGER DEFAULT 0,
    departure_reason TEXT,                      -- exhaustion|manual|quarantine_fail|max_cycles
    FOREIGN KEY (partition_id) REFERENCES domain_partitions(id)
);

-- Stub records for departed nodes (preserves lineage)
CREATE TABLE IF NOT EXISTS departed_node_stubs (
    node_id         TEXT PRIMARY KEY,           -- original UUID
    partition_id    TEXT NOT NULL,              -- which transient partition owned it
    domain          TEXT NOT NULL,
    content_hash    TEXT NOT NULL,              -- SHA-256 of content (portable identity)
    summary         TEXT,                       -- first 200 chars of content
    weight_at_departure REAL,
    departed_at     TEXT NOT NULL,
    children_left   TEXT                        -- JSON array of child node IDs that stayed in host
);
```

### 3.2 Export Format Extension

```typescript
interface TransientExport extends PartitionExport {
    podbitExport: "2.0";              // version bump
    transient: true;
    visitHistory: PartitionVisit[];   // full provenance manifest
    manifest: {
        creator: string;              // ed25519 public key
        signature: string;            // signature over content hashes
        contentHashes: Record<string, string>;  // nodeId → SHA-256
        totalVisits: number;
        avgChildrenPerVisit: number;
        avgChildWeight: number;
        breakthroughsProduced: number;
    };
}
```

## 4. Offspring Attribution

When a transient node and a host node synthesize, the child belongs to **both** — but must physically live somewhere.

### 4.1 The Fork Model

Both sides get a copy. The child is created in a **new hybrid partition** `T×H`:

```
Transient Node A  +  Host Node B  ──synthesis──►  Child C

Child C goes into hybrid partition "visitor-name×host-domain"
Both T and H are listed as parents in the edges table
```

**On departure:**
- Children in the hybrid partition are **duplicated**
- One copy stays in the host (reparented to a host-only partition or the hybrid becomes permanent)
- One copy goes with the transient partition
- Both copies share the same `content_hash` but get new UUIDs (content-addressed identity)

### 4.2 Why Not "Winner Takes All"?

Higher-weight parent claiming the child was considered but rejected:
- Creates perverse incentives (inflate weights to claim children)
- Loses the evolutionary benefit — both lineages should carry the genes
- The fork model mirrors biological reproduction: both parents pass traits to offspring

### 4.3 Hybrid Partition Naming

Deterministic: `{visitor-partition-id}×{host-partition-id}` (uses `×` character, not `x`)

On departure, the hybrid partition is renamed to `departed:{visitor-id}:{timestamp}` and marked as a permanent host partition.

## 5. Security Model

Attack vector: **prompt injection through node content** is the "virus" of knowledge graphs.

### 5.1 Six-Layer Immune System

| Layer | Defense | Purpose |
|-------|---------|---------|
| 1. Weight Reset | ALL imported nodes reset to weight 1.0, salience 0.5 | Never trust foreign quality signals |
| 2. Quarantine | Imported partitions start unbridged; every node autorated + junk-filtered + injection-scanned before bridging | Validate before interaction |
| 3. Cryptographic Signing | Export manifest includes creator ed25519 public key + SHA-256 content hashes + signature chain | Provenance and tamper detection |
| 4. Synthesis Sandbox | First N cycles with transient nodes run enhanced validation; children autorated before acceptance. If >50% children score below threshold, partition auto-quarantined | Limit damage from bad synthesis |
| 5. Content Scanning | LLM judge checks each imported node for instruction-like patterns, excessive length, adversarial tokens | Catch prompt injection directly |
| 6. Blast Radius Caps | Max nodes per import (500), max transient partitions per project (3), max transient nodes as % of host (20%) | Structural limits on exposure |

### 5.2 Quarantine Pipeline

```
Import file
  │
  ├─ Verify signature (if signed)
  │    └─ Unknown signer? → require manual approval
  │
  ├─ Check blast radius caps
  │    └─ Over limits? → reject
  │
  ├─ Reset all weights to 1.0, salience to 0.5
  │
  ├─ For each node:
  │    ├─ Content scan (injection patterns)
  │    ├─ Junk filter (embedding similarity to known junk)
  │    └─ Autorating (quality score)
  │
  ├─ If >N% nodes fail scanning → reject entire partition
  │
  └─ Mark state = 'quarantine' (unbridged, not synthesizing)
       └─ Manual review or auto-bridge if signer is trusted
```

### 5.3 Trust & Reputation

- First-time signers: always quarantine, require manual approval
- Known signers with good visit history: auto-bridge after quarantine scan
- Signers whose partitions have been manually quarantined before: permanent manual-only
- Visit history is the "reputation score" — avg children weight, breakthroughs produced, quarantine failures

## 6. Provenance & Content-Addressed Identity

### 6.1 Content Hashes as Portable Identity

Node UUIDs are local to each SQLite database — they're regenerated on import. The **content hash** (SHA-256 of the node's content text) is the portable identity:

- Two nodes with the same content hash are "the same knowledge" regardless of UUID
- Enables dedup across imports
- Enables lineage tracking across project boundaries
- The export manifest maps `nodeId → contentHash` for verification

### 6.2 Visit Manifest (The Partition's CV)

Every partition carries a `visitHistory` array documenting everywhere it's been:

```typescript
interface PartitionVisit {
    projectName: string;
    arrivedAt: string;
    departedAt: string;
    cyclesRun: number;
    childrenCreated: number;
    childrenAvgWeight: number;
    childrenBreakthroughs: number;
    departureReason: 'exhaustion' | 'manual' | 'quarantine_fail' | 'max_cycles';
}
```

This manifest is:
- **Append-only** — hosts add their visit record on departure
- **Signed** — each visit entry signed by the host's key
- **Public** — visible to future hosts as part of the trust decision
- **Unforgeable** — removing or modifying entries breaks the signature chain

### 6.3 Stub Records

When a transient partition departs, the host retains **stub records** for every departed node:

- Node ID, content hash, summary (first 200 chars), weight at departure
- List of child node IDs that remained in the host
- Enables: "this host node's parent was a visitor from project X"
- Minimal storage footprint (no embeddings, no full content)

## 7. Natural Selection

The system creates emergent evolutionary pressure without explicit curation:

| Signal | Effect |
|--------|--------|
| High avg child weight across visits | Partition gets accepted more → wider propagation |
| Breakthroughs produced | Strongest positive signal — proves genuine insight generation |
| Low child weight / many barren cycles | Partition gets rejected → stops propagating |
| Quarantine failures | Negative reputation — may never be accepted again |
| Visit count | Social proof — many successful visits = trusted knowledge |

### 7.1 Modes

**Evolving mode** (default): The transient partition itself evolves. Nodes gain weight from successful synthesis, new nodes are added from offspring. The partition that returns is different from the one that left — it carries experience.

**Seed-bank mode**: The partition is read-only during visits. It contributes to synthesis but doesn't change. Useful for reference material, curated datasets, or published "textbook" partitions.

## 8. Integration with Existing Systems

### 8.1 Synthesis Engine

The synthesis engine (`core/synthesis-engine.ts`) already supports partition isolation via `getAccessibleDomains()`. Transient partitions integrate naturally:

- When `state='active'`: transient domains are accessible to bridged host domains
- When `state='quarantine'` or `state='departing'`: transient domains are isolated
- `sampleNodes()` already respects domain accessibility — no changes needed
- Child creation needs augmentation: detect when one parent is transient, create child in hybrid partition

### 8.2 Research Cycles

Research cycles should **skip transient domains** — they generate seeds based on existing knowledge, which could create confusing cross-project research. The existing `system=1` exclusion pattern can be extended to `transient=1`.

### 8.3 KB Ingestion

KB folders should **never map to transient partition domains**. Guard in `kb/pipeline.ts`.

### 8.4 Context Engine

The context engine can include transient partition nodes in knowledge delivery — they're valid knowledge while present. Session-level tracking already handles domain scoping.

### 8.5 MCP Tools

New actions on `podbit.partitions`:

| Action | Purpose |
|--------|---------|
| `importTransient` | Import a partition file as transient (quarantine state) |
| `approveTransient` | Move from quarantine to active (bridge) |
| `departTransient` | Trigger departure (export + cleanup) |
| `visitHistory` | Get a partition's visit manifest |

## 9. Future: Central Repository & Marketplace

The transient partition system is designed to work **peer-to-peer first** (export file, share, import) but the architecture supports a central marketplace:

### 9.1 Partition Marketplace

- Versioned, rated, reputation-tracked partitions
- Quality metrics: avg weight, breakthrough count, visit history
- Publishers sign with ed25519 keys; central repo verifies signatures
- Central quarantine pipeline before listing

### 9.2 Training Data Marketplace

The graph produces curated, quality-filtered, provenance-tracked, domain-labeled knowledge as a **byproduct of normal usage**. Every synthesis cycle, feedback rating, and breakthrough promotion adds quality signal that raw training data lacks.

- Priced per-domain with quality tiers (all nodes vs breakthroughs-only vs weight threshold)
- Revenue sharing: publishers earn from downloads and training data inclusion
- Privacy: default local-only, explicit opt-in at every level

### 9.3 Revenue Model

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | Local-only, unlimited use |
| Connected | $3-5/mo | Marketplace access, backup, sync |
| Team | $50/mo | Private registry, team sharing |
| Enterprise | Custom | SSO/SLA, dedicated support |
| Data buyers | Per-dataset | Training data access |

### 9.4 Open Source Strategy

**Business Source License (BSL)**: open source the tool, monetize the network.

- Everything open: MCP server, graph engine, synthesis, proxy, GUI, all algorithms
- Proprietary exclusion: running a competing commercial marketplace
- Converts to Apache 2.0 after 3 years
- Trust is prerequisite for knowledge sharing — no one uploads to a closed-source black box
- The moat is network effect, not code

## 10. Implementation Phases

### Phase 1: Foundation (Local Transient Support)

**Goal**: Import/export partitions with transient lifecycle, quarantine, and departure.

1. Schema migrations: add transient columns to `domain_partitions`, create `partition_visits` and `departed_node_stubs` tables
2. Extend export format to v0.5 with visit history and manifest
3. Implement quarantine pipeline: weight reset, content scan, autorating, junk filter
4. Add transient state machine: quarantine → active → departing → departed
5. Implement departure: export partition + hybrid children, create stub records, cleanup
6. MCP tool extensions: `importTransient`, `approveTransient`, `departTransient`
7. GUI: transient partition indicators, quarantine approval UI, visit history display

### Phase 2: Offspring & Hybrid Partitions

**Goal**: Synthesis produces children in hybrid partitions, fork on departure.

1. Detect transient×host synthesis pairs in the synthesis engine
2. Create hybrid partitions (`T×H` naming)
3. Route children to hybrid partition instead of either parent's domain
4. Implement child forking on departure: duplicate to both sides
5. Content-addressed identity: hash-based dedup across imports
6. Stub record creation with child linkage

### Phase 3: Security & Signing

**Goal**: Cryptographic provenance and trust system.

1. ed25519 keypair generation per project
2. Export manifest signing (content hashes + signature chain)
3. Import signature verification
4. Visit history signing (append-only, host-signed entries)
5. Trust levels: unknown → quarantine-only → auto-bridge
6. Blast radius enforcement: node caps, partition caps, percentage caps

### Phase 4: Central Repository (Future)

**Goal**: Hosted marketplace for partition sharing.

1. Central API server with partition registry
2. Publisher accounts with ed25519 key registration
3. Central quarantine pipeline
4. Search, ratings, download tracking
5. Training data API with opt-in and revenue sharing
6. BSL license enforcement

## Appendix A: Config Parameters

```typescript
transient: {
    enabled: boolean;                    // master toggle (default: false)
    maxTransientPartitions: number;      // per project (default: 3)
    maxNodesPerImport: number;           // blast radius cap (default: 500)
    maxTransientNodeRatio: number;       // % of host nodes (default: 0.20)
    minCycles: number;                   // minimum stay (default: 5)
    maxCycles: number;                   // maximum stay (default: 100)
    exhaustionThreshold: number;         // barren cycles before departure (default: 10)
    quarantine: {
        autoApproveKnownSigners: boolean;  // trust returning visitors (default: true)
        scanFailThreshold: number;         // % nodes failing scan to reject (default: 0.30)
        sandboxCycles: number;             // enhanced validation cycles (default: 5)
        sandboxFailThreshold: number;      // % bad children to re-quarantine (default: 0.50)
    };
}
```

## Appendix B: Knowledge Graph Nodes

This design was seeded to the knowledge graph as:

| Node | Type | ID |
|------|------|----|
| Transient Partitions | breakthrough | `c2866e2e-d687-44eb-903d-5d1e232b937a` |
| Security Model | seed | `941dae12-fa77-462a-9438-c7758ff557bc` |
| Central Repo & Marketplace | seed | `36ef67b7-2ee9-48e9-b94a-9de2233b920b` |
| Open Source Strategy | seed | `f2aeacb0-3c41-48d2-bbbe-140f8c172ccb` |
