# MCP Guide - Connecting IDE Agents to Podbit

> Status: matches the current MCP surface as of the journaling + lab-framework refactor. If a tool name in this guide doesn't match what your IDE shows, run `podbit.api(action: "tools")` to get the live list.

Podbit ships an MCP (Model Context Protocol) server over **stdio** so any agent that speaks MCP - Cursor, Windsurf, Claude Desktop, VS Code with Claude Code, Zed, custom SDK clients - can read from and write to the knowledge graph from inside an editing session.

The MCP layer is a thin shim over the HTTP API: when the stdio server starts, it ensures the orchestrator + API server are running, then **proxies every tool call to the HTTP server**. This means MCP, REST, and the GUI all share one process, one database, one cache, and one journal. There is no second copy of the graph hiding behind the IDE.

---

## 1. Architecture in one diagram

```
┌──────────────┐  JSON-RPC over stdio  ┌──────────────────┐
│  IDE agent   │ ────────────────────► │ mcp-stdio.ts     │
│ (Cursor etc) │                       │  (this process)  │
└──────────────┘                       └────────┬─────────┘
                                                │ HTTP proxy
                                                ▼
                              ┌─────────────────────────────┐
                              │ Podbit API server (port 4710)│
                              │  ├── handlers/*              │
                              │  ├── synthesis engine        │
                              │  ├── lab fleet (4714/15/16)  │
                              │  ├── journal + rollback      │
                              │  └── SQLite (per-project)    │
                              └─────────────────────────────┘
```

Key consequences:

- **Auto-start** - connecting your IDE to the MCP server bootstraps the entire Podbit stack (orchestrator, API server, GUI, proxy, optional labs). You do not need to run `npm run orchestrate` separately.
- **Single source of truth** - anything you do via MCP shows up immediately in the GUI at `http://localhost:4712` and vice versa.
- **No data loss on disconnect** - an EPIPE guard handles IDE disconnects gracefully without crash-looping.
- **MCP responses are size-capped** at 80 KB. When a response would exceed this, the server compacts it (truncates content, strips metadata, drops items beyond a threshold) rather than slicing JSON. Look for `_compacted` in the response if you suspect truncation.

---

## 2. Connecting from each IDE

The server entry point is `mcp-stdio.ts`, run via `tsx`. The exact way you wire it up varies by IDE.

### Cursor

Cursor reads `.mcp.json` at the workspace root. Podbit ships one - open it and adjust the `cwd` to your install path:

```json
{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "mcp-stdio.ts"],
      "cwd": "c:\\path\\to\\podbit",
      "env": {
        "PODBIT_AUTO_OPEN_BROWSER": "false"
      }
    }
  }
}
```

Restart Cursor (or use the MCP reload command) and the `podbit` server should appear in the MCP panel. First connection takes a few seconds while the orchestrator boots.

### VS Code (Claude Code extension)

Same `.mcp.json` format. Drop the file at the workspace root or merge the `mcpServers` block into your existing one. Claude Code reloads MCP servers when the workspace opens.

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config) and add the same `mcpServers` block:

```json
{
  "mcpServers": {
    "podbit": {
      "command": "npx",
      "args": ["tsx", "mcp-stdio.ts"],
      "cwd": "c:\\path\\to\\podbit"
    }
  }
}
```

Restart Claude Desktop. The `podbit` tools will appear in the slash-command tool picker.

### Windsurf

Windsurf uses the same MCP config format under `~/.codeium/windsurf/mcp_config.json`. Add the same `podbit` block, restart, done.

### Zed

Add to `~/.config/zed/settings.json` under `context_servers`:

```json
{
  "context_servers": {
    "podbit": {
      "command": {
        "path": "npx",
        "args": ["tsx", "mcp-stdio.ts"]
      },
      "settings": {
        "cwd": "c:\\path\\to\\podbit"
      }
    }
  }
}
```

### Custom MCP client (Python / TypeScript SDK)

```python
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

params = StdioServerParameters(
    command="npx",
    args=["tsx", "mcp-stdio.ts"],
    cwd="c:/path/to/podbit",
)

async with stdio_client(params) as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        tools = await session.list_tools()
```

### Notes on the command

- **`npx tsx mcp-stdio.ts`** is the canonical form. tsx compiles TypeScript on the fly so there is no build step.
- On Windows, if `npx` is not on the IDE's PATH, replace `"command": "npx"` with the absolute path to `npx.cmd` (e.g. `"C:\\nvm4w\\nodejs\\npx.cmd"`).
- Set `PODBIT_AUTO_OPEN_BROWSER=false` to stop the orchestrator from launching the GUI in your browser every time the IDE reconnects.

---

## 3. The tool surface

Podbit exposes **9 named MCP tools**. Eight are core operations with rich schemas the LLM can call directly. The ninth, `podbit.api`, is a generic gateway to every other handler - it lets you discover and call ~25 additional tools without bloating the main tool list.

This split keeps the LLM's tool-list short (faster, fewer mistakes) while preserving full access to every Podbit feature.

### 3.1 Core tools (8)

| Tool | What it does | Required params |
|---|---|---|
| **`podbit.query`** | Search nodes by semantic similarity, keyword, domain, type, weight, etc. | none - at least one filter recommended |
| **`podbit.get`** | Fetch one node by UUID with full content and lineage counts | `id` |
| **`podbit.propose`** | Add a new node (seed / synthesis / breakthrough / voiced / question / raw) | `content`, `nodeType`, `contributor` |
| **`podbit.compress`** | Build a dense, cached system prompt for a topic. With `task` it reranks by relevance and skips cache | `topic` |
| **`podbit.projects`** | Manage projects (list, current, save, load, new, interview, manifest, …) | `action` |
| **`podbit.partitions`** | Manage domain partitions and bridges, plus export / import | `action` |
| **`podbit.stats`** | Graph health snapshot - counts, distribution, recent activity | none |
| **`podbit.config`** | Read, AI-tune, apply, snapshot, and audit algorithm parameters | `action` |

#### Examples

**Search:**
```json
{
  "tool": "podbit.query",
  "args": {
    "text": "memory consolidation during sleep",
    "domain": "neuroscience",
    "minWeight": 1.2,
    "limit": 20,
    "orderBy": "weight"
  }
}
```

**Add a seed:**
```json
{
  "tool": "podbit.propose",
  "args": {
    "content": "REM sleep selectively consolidates emotional and procedural memories.",
    "nodeType": "seed",
    "domain": "neuroscience",
    "contributor": "human:rob"
  }
}
```

**Get a session-bootstrap prompt:**
```json
{
  "tool": "podbit.compress",
  "args": {
    "topic": "REM sleep and memory",
    "task": "I'm about to design a synthesis cycle that pairs sleep nodes with motor-learning nodes",
    "targetProfile": "medium"
  }
}
```

### 3.2 The gateway: `podbit.api`

`podbit.api` is the discovery and execution gateway for everything that isn't in the core 8. It supports five actions:

| Action | Purpose |
|---|---|
| `tools` | List **every** MCP tool the server can dispatch (core + extended) |
| `schema` | Get the full JSON schema for one tool |
| `call` | Execute any tool by name with a `params` object |
| `routes` | List every HTTP REST endpoint the API server exposes |
| `http` | Call any HTTP endpoint directly (`method`, `path`, `body`, `query`) |

#### Discovery flow

```json
{ "tool": "podbit.api", "args": { "action": "tools" } }
```

returns the full list of dispatchable tools. Then:

```json
{
  "tool": "podbit.api",
  "args": { "action": "schema", "tool": "podbit.tensions" }
}
```

returns the parameter schema. Finally:

```json
{
  "tool": "podbit.api",
  "args": {
    "action": "call",
    "tool": "podbit.tensions",
    "params": { "domain": "neuroscience", "limit": 5 }
  }
}
```

executes the call. The LLM can do all three steps autonomously without you having to memorise the full surface.

### 3.3 Extended tools available via the gateway

These all dispatch through `podbit.api(action: "call", tool: "...")`. Group is informative - there is no enforced grouping in the API.

**Graph operations**
- `podbit.lineage` - parent/child tree to a depth
- `podbit.remove` - junk / archive / hard-delete
- `podbit.edit` - modify node fields with audit trail
- `podbit.dedup` - find and archive duplicate clusters (always dry-run first)

**Synthesis & elevation**
- `podbit.synthesis` - control the autonomous synthesis cycles (start/stop/status)
- `podbit.voice` - get voicing context for a single node (then propose the voiced node yourself)
- `podbit.promote` - promote a node to breakthrough with 4-axis scores
- `podbit.validate` - get validation context for a candidate breakthrough
- `podbit.tensions` - find contradicting node pairs in a domain
- `podbit.question` - get research-question context between two nodes
- `podbit.patterns` - abstract cross-domain pattern search and tagging

**Knowledge extraction**
- `podbit.summarize` - structured topic summary (cached without `task`)
- `podbit.context` - per-turn context engine (prepare / update / metrics / sessions / insights)
- `podbit.feedback` - submit / inspect EVM-style feedback on nodes

**Lab verification framework**
- `podbit.lab` - manage the lab registry (list, register, enable, health, capabilities)
- `podbit.labVerify` - submit a node for verification, query verdicts, manage queue
- `podbit.elite` - elite pool (stats, coverage, gaps, candidates, terminals, rescan, demote)
- `podbit.apiRegistry` - external API registry (PubChem, UniProt, etc.) for grounding

**Knowledge base ingestion**
- `podbit.kb` - folder ingestion (folders, add, scan, files, file, retry, readers, stats, defaults, mapExtension, classify, …)

**Graph journaling and rollback**
- `podbit.journal` - actions: `timeline`, `marker`, `pin`, `pins`, `unpin`, `preview`, `rollback`, `entries`, `prune`, `stats`

**Queue (GUI integration)**
- `podbit.pending` - fetch chat-queued requests waiting for an agent
- `podbit.complete` - mark a queued request as done

**Document generation**
- `docs.*` - Create Docs system: list templates, decompose requests, generate research briefs

The full live list is always one call away: `podbit.api(action: "tools")`.

---

## 4. Recipes

### 4.1 Session bootstrap

At the start of every IDE session, run this trio so the agent knows where it is:

```json
{ "tool": "podbit.projects",   "args": { "action": "current" } }
{ "tool": "podbit.partitions", "args": { "action": "list" } }
{ "tool": "podbit.stats",      "args": { "days": 7 } }
```

Then, for each topic the user is about to work on:

```json
{ "tool": "podbit.compress", "args": { "topic": "<the topic>", "task": "<what you're about to do>" } }
```

This gives the agent a dense, relevance-ranked system prompt without flooding context.

### 4.2 Query before coding

Before modifying a subsystem, ask the graph what it already knows:

```json
{ "tool": "podbit.compress",
  "args": { "topic": "synthesis quality pipeline",
            "task": "I'm about to add a new gate to filter forced analogies" } }

{ "tool": "podbit.query",
  "args": { "domain": "design", "text": "forced analogy detection" } }
```

This prevents rediscovering constraints and patterns the graph already captured.

### 4.3 Verify a claim through the lab fleet

```json
{ "tool": "podbit.api",
  "args": {
    "action": "call",
    "tool": "podbit.labVerify",
    "params": { "action": "submit", "nodeId": "<uuid>" }
  }
}
```

The pipeline (spec extraction → tautology check → falsifiability review → routing → submission → verdict) runs on the API server. Poll status with:

```json
{ "tool": "podbit.api",
  "args": {
    "action": "call",
    "tool": "podbit.labVerify",
    "params": { "action": "status", "nodeId": "<uuid>" }
  }
}
```

Or watch the Verification page in the GUI for live updates.

### 4.4 Pin and roll back

Before a risky experiment, pin your curated breakthroughs and create a marker:

```json
{ "tool": "podbit.api",
  "args": { "action": "call", "tool": "podbit.journal",
            "params": { "action": "pin", "nodeIds": ["<uuid1>", "<uuid2>"] } } }

{ "tool": "podbit.api",
  "args": { "action": "call", "tool": "podbit.journal",
            "params": { "action": "marker", "label": "before quality-gate experiment" } } }
```

If the experiment goes wrong, preview the rollback first:

```json
{ "tool": "podbit.api",
  "args": { "action": "call", "tool": "podbit.journal",
            "params": { "action": "preview", "targetTimestamp": "<ISO>" } } }
```

The preview shows how many nodes will be deleted, modified, or preserved (via ancestry pinning). When you're satisfied:

```json
{ "tool": "podbit.api",
  "args": { "action": "call", "tool": "podbit.journal",
            "params": { "action": "rollback", "targetTimestamp": "<ISO>" } } }
```

Pinned nodes and their ancestry chains are reimported with original timestamps so curated work survives.

### 4.5 Tune a parameter safely

```json
{ "tool": "podbit.config", "args": { "action": "snapshot",
                                     "snapshotAction": "save",
                                     "snapshotLabel": "before lowering resonance band" } }

{ "tool": "podbit.config", "args": { "action": "tune",
                                     "sectionId": "synthesis_quality",
                                     "request": "I want fewer noise rejections in domains with sparse data" } }
```

Review the suggested changes, then apply selectively:

```json
{ "tool": "podbit.config",
  "args": {
    "action": "apply",
    "changes": [{ "configPath": ["synthesis", "resonanceMinSimilarity"], "value": 0.32 }],
    "reason": "sparse-domain tuning experiment",
    "contributor": "claude"
  }
}
```

Then check `podbit.config(action: "metrics", days: 1)` after the next synthesis cycle to see whether quality moved in the expected direction. If it didn't, restore the snapshot.

---

## 5. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| MCP server fails to start in IDE | `npx` not on PATH | Use absolute path to `npx.cmd` in `command` (Windows) or `which npx` output (Unix) |
| First call hangs for 10+ seconds | Orchestrator booting cold (loading models, opening DB) | Normal - subsequent calls are fast |
| Tools list shows only the 9 schemas, not the full ~30 | Working as designed | Use `podbit.api(action: "tools")` to see the rest |
| `Unknown tool: podbit.foo` | Tool name typo or stale doc | Run `podbit.api(action: "tools")` to get the live list |
| Response truncated with `_compacted` field | Response exceeded 80 KB | Add tighter filters (`limit`, `domain`, `minWeight`) or query specific IDs with `podbit.get` |
| MCP server keeps restarting in your IDE | Old EPIPE crash loop pattern | Make sure you're on a current build - `mcp-stdio.ts` has a 5s delayed-exit guard |
| Changes from MCP don't show up in the GUI | None - they should | Confirm the GUI is pointed at the same project: `podbit.projects(action: "current")` |
| Cannot find `tsx` | Not installed in workspace | `npm install` in the Podbit directory before connecting |
| Background activity event spam in IDE | None - events go to disk only | Activity events are routed via the HTTP event bus, not stdout |

### Logs

Server logs go to `data/logs/` (with rolling daily files capped at 5 parts/day to prevent disk floods). Look there first for stack traces - the MCP stdio process suppresses console output to keep the protocol stream clean, so nothing useful prints to the IDE's MCP panel.

### Confirming the stack is alive

Open `http://localhost:4712` in a browser. If the GUI loads, the API server is up and the MCP tools should work. If the GUI doesn't load, the orchestrator failed to start - check `data/logs/` and confirm:

- Node.js >= 18 is installed
- `npm install` has been run in both the root and `gui/`
- Ports 4710 / 4712 / 11435 aren't already in use
- An embedding model is configured in the Models page (the system needs one)

---

## 6. Working agreements for agents

These are conventions for an LLM agent operating against Podbit, not enforced by the API. Adhering to them keeps the graph healthy.

1. **Never propose nodes without explicit user permission.** The graph is curated by the user, not auto-populated. Ask first.
2. **Query before writing.** Use `podbit.compress` and `podbit.query` to check what the graph already knows about a topic before adding to it.
3. **Always dry-run dedup.** `podbit.dedup` with `dryRun: false` is destructive. Run with `dryRun: true` first, read each cluster's full content with `podbit.get`, then ask the user before archiving.
4. **Prefer `compress` over `query` for context.** `compress` is cached and dense; `query` is best for finding specific nodes.
5. **Use `task`-aware compress for relevance.** `podbit.compress(topic, task)` skips the cache and reranks for what you're about to do.
6. **Snapshot before tuning.** Always `podbit.config(action: "snapshot", snapshotAction: "save")` before applying parameter changes.
7. **Pin before rolling back.** Use `podbit.journal(action: "pin")` to preserve curated work before any rollback.
8. **Trust the gateway.** When in doubt about a tool, call `podbit.api(action: "tools")` and `podbit.api(action: "schema", tool: "...")` instead of guessing parameter names.
