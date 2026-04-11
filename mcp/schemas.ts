/**
 * @module mcp/schemas
 *
 * MCP tool JSON Schema definitions. Core tools have rich schemas for
 * reliable LLM tool-calling. All other tools are accessible via the
 * generic `podbit_api` gateway (tools/schema/call/routes/http actions).
 *
 * Core tools (8): query, get, propose, compress, projects, partitions, stats, config
 * Gateway (1): podbit_api — discover and call any tool or HTTP endpoint
 */

export const tools = [
    // =========================================================================
    // CORE TOOLS — high-frequency, rich schemas for reliable tool-calling
    // =========================================================================

    {
        name: 'podbit_query',
        description: 'Search nodes in the knowledge graph. Returns nodes matching the criteria, sorted by relevance.',
        inputSchema: {
            type: 'object',
            properties: {
                text: { type: 'string', description: 'Semantic search query (embedding similarity + keyword fallback)' },
                search: { type: 'string', description: 'Keyword search (LIKE match on content and keywords)' },
                domain: { type: 'string', description: 'Filter by domain' },
                nodeType: {
                    type: 'string',
                    enum: ['seed', 'proto', 'voiced', 'synthesis', 'breakthrough', 'possible', 'question', 'raw', 'elite_verification'],
                    description: 'Filter by node type',
                },
                trajectory: { type: 'string', enum: ['knowledge', 'abstraction'], description: 'Filter by trajectory' },
                minWeight: { type: 'number', description: 'Minimum weight threshold (0.0-2.0)' },
                limit: { type: 'integer', default: 10, description: 'Maximum results (default: 10)' },
                orderBy: { type: 'string', enum: ['weight', 'salience', 'recent', 'oldest', 'specificity'], description: 'Sort order' },
            },
        },
    },

    {
        name: 'podbit_get',
        description: 'Get a specific node by ID with full content, metadata, lineage counts, and partition info.',
        inputSchema: {
            type: 'object',
            properties: {
                id: { type: 'string', description: 'UUID of the node' },
            },
            required: ['id'],
        },
    },

    {
        name: 'podbit_propose',
        description: 'Propose a new node to the graph. Use for seeds (foundational content), synthesis, or breakthroughs.',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'The content of the node' },
                nodeType: {
                    type: 'string',
                    enum: ['seed', 'synthesis', 'breakthrough', 'voiced', 'question', 'raw'],
                    description: 'Type of node',
                },
                domain: { type: 'string', description: 'Domain classification' },
                parentIds: { type: 'array', items: { type: 'string' }, description: 'UUIDs of parent nodes' },
                supersedes: { type: 'array', items: { type: 'string' }, description: 'UUIDs of nodes this replaces (archived with audit trail)' },
                contributor: { type: 'string', description: 'Who is proposing (e.g., "claude", "human:rob")' },
            },
            required: ['content', 'nodeType', 'contributor'],
        },
    },

    {
        name: 'podbit_compress',
        description: 'Generate a compressed meta-prompt capturing expert knowledge about a topic. Cached without task param; task-aware calls skip cache for relevance-reranked output.',
        inputSchema: {
            type: 'object',
            properties: {
                topic: { type: 'string', description: 'Topic to compress into a meta-prompt' },
                task: { type: 'string', description: 'Optional task — reranks nodes by relevance, skips cache' },
                domains: { type: 'array', items: { type: 'string' }, description: 'Explicit domains to pull from (bypasses topic inference)' },
                targetProfile: {
                    type: 'string',
                    enum: ['micro', 'small', 'medium', 'large', 'xl'],
                    description: 'Output length: micro (~100 tokens), small (~200), medium (default ~1000), large (~1500), xl (~2000)',
                },
            },
            required: ['topic'],
        },
    },

    {
        name: 'podbit_projects',
        description: 'Manage knowledge graph projects. Actions: "list", "current", "save", "load", "new" (with bootstrap), "delete", "update", "interview" (LLM-guided creation), "manifest", "updateManifest".',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'current', 'save', 'load', 'new', 'delete', 'update', 'interview', 'manifest', 'updateManifest'],
                    description: 'Action to perform',
                },
                name: { type: 'string', description: 'Project name (for save/load/new/delete/update)' },
                description: { type: 'string', description: 'Project description' },
                purpose: { type: 'string', description: 'For new: project focus. Used to generate foundational seeds.' },
                domains: { type: 'array', items: { type: 'string' }, description: 'For new: domains to create' },
                bridges: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'For new: domain pairs to bridge' },
                goals: { type: 'array', items: { type: 'string' }, description: 'For new: learning goals' },
                autoBridge: { type: 'boolean', description: 'For new: auto-bridge future partitions (default: false)' },
                interviewId: { type: 'string', description: 'For interview continue: session ID' },
                response: { type: 'string', description: 'For interview continue: user response' },
                manifest: { type: 'object', description: 'For updateManifest: fields to update' },
            },
            required: ['action'],
        },
    },

    {
        name: 'podbit_partitions',
        description: 'Manage domain partitions and bridges. Actions: list, get, create, update, delete, addDomain, removeDomain, renameDomain, listBridges, createBridge, deleteBridge, export, import.',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['list', 'get', 'create', 'update', 'delete', 'addDomain', 'removeDomain', 'renameDomain', 'listBridges', 'createBridge', 'deleteBridge', 'export', 'import'],
                    description: 'Action to perform',
                },
                id: { type: 'string', description: 'Partition ID' },
                name: { type: 'string', description: 'Partition name (create/update)' },
                description: { type: 'string', description: 'Partition description' },
                domains: { type: 'array', items: { type: 'string' }, description: 'Domains (create)' },
                domain: { type: 'string', description: 'Single domain (addDomain/removeDomain)' },
                oldDomain: { type: 'string', description: 'Current domain name (renameDomain)' },
                newDomain: { type: 'string', description: 'New domain name (renameDomain)' },
                targetPartitionId: { type: 'string', description: 'Target partition (createBridge/deleteBridge)' },
                owner: { type: 'string', description: 'Owner tag for export' },
                data: { type: 'object', description: 'Export JSON for import' },
                overwrite: { type: 'boolean', description: 'Replace on import collision (default: false)' },
            },
            required: ['action'],
        },
    },

    {
        name: 'podbit_stats',
        description: 'Graph health statistics — node counts, domain distribution, synthesis metrics, activity.',
        inputSchema: {
            type: 'object',
            properties: {
                domain: { type: 'string', description: 'Filter by domain (optional)' },
                days: { type: 'integer', default: 7, description: 'Analysis window in days (default: 7)' },
            },
        },
    },

    {
        name: 'podbit_config',
        description: 'Read, tune, and manage algorithm configuration. Actions: "get", "sections" (parameter metadata), "tune" (AI suggestions), "apply" (with audit trail), "metrics" (quality dashboard), "snapshot" (save/restore/list), "history" (change log).',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['get', 'sections', 'tune', 'apply', 'metrics', 'snapshot', 'history'],
                    description: 'Action to perform',
                },
                sectionId: { type: 'string', description: 'Specific config section ID' },
                request: { type: 'string', description: 'For tune: natural language optimization request' },
                changes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            configPath: { type: 'array', items: { type: 'string' }, description: 'Path to config value' },
                            value: { description: 'New value' },
                        },
                        required: ['configPath', 'value'],
                    },
                    description: 'For apply: parameter changes',
                },
                reason: { type: 'string', description: 'For apply: audit trail reason' },
                contributor: { type: 'string', description: 'For apply/snapshot: who (default: "claude")' },
                snapshotAction: { type: 'string', enum: ['save', 'restore', 'list'], description: 'For snapshot action' },
                snapshotId: { type: 'string', description: 'For snapshot restore: ID' },
                snapshotLabel: { type: 'string', description: 'For snapshot save: label' },
                days: { type: 'integer', default: 7, description: 'For metrics: days window' },
                limit: { type: 'integer', default: 20, description: 'For history: max entries' },
            },
            required: ['action'],
        },
    },

    // =========================================================================
    // GENERIC API GATEWAY — discover and call any tool or HTTP endpoint
    // =========================================================================

    {
        name: 'podbit_api',
        description: 'Generic API gateway. Discover and execute ANY Podbit tool or HTTP endpoint. Actions: "tools" (list all MCP tools), "schema" (get full parameter schema for a tool), "call" (execute any tool by name), "routes" (list all HTTP API endpoints), "http" (call any HTTP endpoint directly). Use this for tools not in the core set: voice, promote, validate, tensions, question, lineage, remove, edit, dedup, synthesis, summarize, context, feedback, labVerify, elite, kb, lab, journal, apiRegistry, pending, complete, patterns, docs.*',
        inputSchema: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    enum: ['tools', 'schema', 'call', 'routes', 'http'],
                    description: 'Action: "tools" = list available tools, "schema" = get tool parameter schema, "call" = execute a tool, "routes" = list HTTP endpoints, "http" = call HTTP endpoint directly',
                },
                tool: {
                    type: 'string',
                    description: 'For schema/call: tool name (e.g., "podbit_voice", "podbit_tensions")',
                },
                params: {
                    type: 'object',
                    description: 'For call: parameters to pass to the tool',
                },
                method: {
                    type: 'string',
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                    description: 'For http: HTTP method (default: GET)',
                },
                path: {
                    type: 'string',
                    description: 'For http: API path (e.g., "/models/registry", "/kb/stats")',
                },
                body: {
                    type: 'object',
                    description: 'For http: request body (POST/PUT/PATCH)',
                },
                query: {
                    type: 'object',
                    description: 'For http: query parameters',
                },
            },
            required: ['action'],
        },
    },
];
