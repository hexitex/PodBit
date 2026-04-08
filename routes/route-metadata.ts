/**
 * Static route metadata for the podbit.api discovery tool.
 * Describes all HTTP API endpoints the LLM can call via podbit.api(action: "http").
 *
 * Grouped by category. Each entry: { method, path, description }.
 * When adding new routes, add a corresponding entry here.
 */

interface RouteInfo {
    method: string;
    path: string;
    description: string;
}

const ROUTES: RouteInfo[] = [
    // ── Health ──
    { method: 'GET', path: '/health', description: 'Server health check with uptime, version, project name' },

    // ── Resonance (Graph) ──
    { method: 'GET', path: '/resonance/nodes', description: 'Query nodes with filters (domain, type, text search, semantic search, keywords)' },
    { method: 'GET', path: '/resonance/nodes/:id', description: 'Get a single node with full metadata' },
    { method: 'GET', path: '/resonance/nodes/:id/resolved', description: 'Get node content with number variables resolved' },
    { method: 'GET', path: '/resonance/nodes/:id/lineage', description: 'Get parent/child lineage tree (depth param)' },
    { method: 'POST', path: '/resonance/nodes', description: 'Create a new node (propose knowledge)' },
    { method: 'POST', path: '/resonance/nodes/names', description: 'Batch resolve node IDs to human-readable names' },
    { method: 'POST', path: '/resonance/nodes/:id/voice', description: 'Synthesize insight from a node pair' },
    { method: 'POST', path: '/resonance/nodes/:id/promote', description: 'Promote node to breakthrough' },
    { method: 'POST', path: '/resonance/nodes/:id/demote', description: 'Demote a node (reduce weight)' },
    { method: 'PUT', path: '/resonance/nodes/:id/domain', description: 'Change a node domain' },
    { method: 'PUT', path: '/resonance/nodes/:id/content', description: 'Edit node content' },
    { method: 'PUT', path: '/resonance/nodes/:id/excluded', description: 'Toggle node exclusion from briefs' },
    { method: 'DELETE', path: '/resonance/nodes/:id', description: 'Remove/archive/junk a node (mode: junk|archive|hard)' },
    { method: 'GET', path: '/resonance/stats', description: 'Graph statistics (node counts, domain distribution, synthesis health)' },
    { method: 'GET', path: '/resonance/graph', description: 'Graph visualization data (nodes + edges for D3)' },
    { method: 'GET', path: '/resonance/keywords', description: 'Aggregate keyword stats across all nodes' },

    // ── Synthesis Engine ──
    { method: 'POST', path: '/synthesis/start', description: 'Start the synthesis engine (optional domain/maxCycles)' },
    { method: 'POST', path: '/synthesis/stop', description: 'Stop the synthesis engine' },
    { method: 'GET', path: '/synthesis/status', description: 'Synthesis engine running status, cycle count, discoveries' },
    { method: 'GET', path: '/synthesis/discoveries', description: 'Recent synthesis discoveries with parent context' },

    // ── Models ──
    { method: 'GET', path: '/models/registry', description: 'List all registered LLM models' },
    { method: 'POST', path: '/models/registry', description: 'Register a new model' },
    { method: 'PUT', path: '/models/registry/:id', description: 'Update a model' },
    { method: 'DELETE', path: '/models/registry/:id', description: 'Delete a model' },
    { method: 'GET', path: '/models/assignments', description: 'List subsystem → model assignments' },
    { method: 'PUT', path: '/models/assignments', description: 'Update subsystem model assignment' },
    { method: 'POST', path: '/models/test', description: 'Test an LLM model connection' },
    { method: 'GET', path: '/models/usage', description: 'LLM usage log (token counts, costs)' },
    { method: 'GET', path: '/models/subsystems', description: 'List all subsystems with descriptions' },

    // ── Prompts ──
    { method: 'GET', path: '/prompts', description: 'List all prompt definitions (id, category, description)' },
    { method: 'GET', path: '/prompts/:id', description: 'Get a prompt by ID with current content' },
    { method: 'PUT', path: '/prompts/:id', description: 'Override a prompt (custom content)' },
    { method: 'DELETE', path: '/prompts/:id', description: 'Reset a prompt to its default template' },
    { method: 'GET', path: '/prompts/gold-standards', description: 'List gold standard responses' },

    // ── Config ──
    { method: 'GET', path: '/config', description: 'Get current configuration (all sections)' },
    { method: 'PUT', path: '/config', description: 'Update configuration values' },
    { method: 'GET', path: '/config/sections', description: 'List all config sections with parameter metadata' },
    { method: 'GET', path: '/config/presets', description: 'Available config presets per section' },

    // ── Partitions ──
    { method: 'GET', path: '/partitions', description: 'List all domain partitions with bridges' },
    { method: 'POST', path: '/partitions', description: 'Create a new partition' },
    { method: 'POST', path: '/partitions/:id/bridge', description: 'Create bridge between partitions' },
    { method: 'DELETE', path: '/partitions/:id/bridge/:targetId', description: 'Remove a partition bridge' },

    // ── Knowledge Base ──
    { method: 'GET', path: '/kb/folders', description: 'List watched KB folders' },
    { method: 'POST', path: '/kb/folders', description: 'Add a folder to KB watch list' },
    { method: 'PUT', path: '/kb/folders/:id', description: 'Update KB folder settings' },
    { method: 'DELETE', path: '/kb/folders/:id', description: 'Remove a KB folder' },
    { method: 'POST', path: '/kb/folders/:id/scan', description: 'Trigger folder scan' },
    { method: 'GET', path: '/kb/files', description: 'List KB files (with status filter)' },
    { method: 'GET', path: '/kb/stats', description: 'KB ingestion statistics' },
    { method: 'GET', path: '/kb/readers', description: 'List registered file readers' },

    // ── Projects ──
    { method: 'GET', path: '/database/projects', description: 'List all projects' },
    { method: 'POST', path: '/database/projects/save', description: 'Save current project' },
    { method: 'POST', path: '/database/projects/load', description: 'Switch to a project (requires confirm: "LOAD_PROJECT")' },
    { method: 'POST', path: '/database/projects/new', description: 'Create a new project (requires confirm: "NEW_PROJECT")' },
    { method: 'POST', path: '/database/projects/interview', description: 'Start/continue project interview' },
    { method: 'GET', path: '/database/projects/manifest', description: 'Get project manifest' },
    { method: 'PUT', path: '/database/projects/manifest', description: 'Update project manifest' },
    { method: 'DELETE', path: '/database/projects/:name', description: 'Delete a project (requires confirm: "DELETE_PROJECT")' },

    // ── Database ──
    { method: 'GET', path: '/database/stats', description: 'Database statistics (table sizes, disk usage)' },
    { method: 'POST', path: '/database/backup', description: 'Create a database backup' },
    { method: 'GET', path: '/database/backups', description: 'List available backups' },
    { method: 'POST', path: '/database/restore', description: 'Restore from a backup' },

    // ── Lab ──
    { method: 'GET', path: '/lab-registry', description: 'List registered lab servers' },
    { method: 'POST', path: '/lab-registry', description: 'Register a new lab server' },
    { method: 'PUT', path: '/lab-registry/:id', description: 'Update lab server config' },
    { method: 'DELETE', path: '/lab-registry/:id', description: 'Remove a lab server' },
    { method: 'POST', path: '/lab-registry/:id/health', description: 'Trigger health check for a lab' },

    // ── EVM / Verification ──
    { method: 'POST', path: '/lab/verify/:nodeId', description: 'Submit a node for lab verification' },
    { method: 'GET', path: '/lab/queue', description: 'View the verification queue' },
    { method: 'GET', path: '/lab/history/:nodeId', description: 'Verification history for a node' },
    { method: 'GET', path: '/lab/reviews', description: 'List pending spec reviews' },

    // ── Elite Pool ──
    { method: 'GET', path: '/elite/nodes', description: 'List elite (verified) nodes' },
    { method: 'GET', path: '/elite/stats', description: 'Elite pool statistics' },

    // ── Activity ──
    { method: 'GET', path: '/activity/stream', description: 'SSE stream of live activity events' },
    { method: 'GET', path: '/activity/recent', description: 'Recent buffered activity events' },
    { method: 'GET', path: '/activity/log', description: 'Persistent activity log with search/filter' },
    { method: 'GET', path: '/activity/categories', description: 'Activity categories with counts' },

    // ── Breakthroughs ──
    { method: 'GET', path: '/breakthroughs', description: 'List breakthrough registry entries' },
    { method: 'PATCH', path: '/breakthroughs/:id', description: 'Update breakthrough metadata' },

    // ── Chat ──
    { method: 'GET', path: '/chat/conversations', description: 'List chat conversations' },
    { method: 'POST', path: '/chat/conversations', description: 'Create a new conversation' },
    { method: 'GET', path: '/chat/conversations/:id', description: 'Get conversation with messages' },
    { method: 'POST', path: '/chat/conversations/:id/messages', description: 'Send a message to a conversation' },
    { method: 'DELETE', path: '/chat/conversations/:id', description: 'Delete a conversation' },

    // ── Keywords ──
    { method: 'POST', path: '/keywords/backfill-nodes', description: 'Backfill keywords (and names) for nodes missing them' },
    { method: 'POST', path: '/keywords/backfill-domains', description: 'Backfill LLM domain synonyms' },

    // ── Seeds ──
    { method: 'GET', path: '/seeds', description: 'List seed nodes' },
    { method: 'POST', path: '/seeds', description: 'Create seed nodes in bulk' },

    // ── Feedback ──
    { method: 'POST', path: '/nodes/:id/feedback', description: 'Record feedback on a node' },
    { method: 'GET', path: '/nodes/:id/feedback', description: 'Get feedback history for a node' },

    // ── Budget ──
    { method: 'GET', path: '/budget', description: 'Token budget status and allocation' },
    { method: 'PUT', path: '/budget', description: 'Update budget settings' },

    // ── Journal ──
    { method: 'GET', path: '/journal/snapshots', description: 'List journal snapshots for time-travel' },
    { method: 'POST', path: '/journal/rollback', description: 'Rollback to a journal snapshot' },

    // ── Scaffold / Docs ──
    { method: 'GET', path: '/scaffold/templates', description: 'List research brief templates' },
    { method: 'POST', path: '/scaffold/decompose', description: 'Decompose a request into structured outline' },
    { method: 'POST', path: '/scaffold/generate', description: 'Generate a full research brief' },

    // ── Context Engine ──
    { method: 'POST', path: '/context/prepare', description: 'Prepare context for a model turn (knowledge delivery)' },
    { method: 'POST', path: '/context/update', description: 'Feed model response back (feedback loop)' },
    { method: 'GET', path: '/context/sessions', description: 'List active context sessions' },
    { method: 'GET', path: '/context/insights', description: 'Cross-session learning data' },

    // ── MCP ──
    { method: 'GET', path: '/mcp/tools', description: 'List all MCP tool schemas' },
    { method: 'POST', path: '/mcp/tool', description: 'Execute any MCP tool (name + params)' },
];

/** Get all route metadata for discovery. */
export function getRouteMetadata(): RouteInfo[] {
    return ROUTES;
}
