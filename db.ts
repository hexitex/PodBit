/**
 * PODBIT v0.5 - DATABASE MODULE
 *
 * Re-exports from db/index.js (SQLite backend via better-sqlite3).
 */

export {
    query,
    queryOne,
    transactionSync,
    healthCheck,
    close,
    pool,
    dialect,
    systemQuery,
    systemQueryOne,
    systemTransactionSync,
    isSystemSetting,
    backupDatabase,
    restoreDatabase,
    listBackups,
    switchProject,
    saveProjectCopy,
    createEmptyProject,
    getProjectDir,
    getDbDiagnostics,
    resetDbDiagnostics,
    yieldToEventLoop,
} from './db/index.js';

// Graceful shutdown — only register signal handlers when NOT running as
// an MCP stdio server.  The MCP SDK manages the process lifecycle; calling
// process.exit() here would kill the server mid-connection and can crash
// the LLM IDE agent.  The MCP entry-point (mcp-stdio.js) sets this env var.
import { close as dbClose } from './db/index.js';

if (!process.env.MCP_STDIO_SERVER) {
    process.on('SIGINT', async (): Promise<void> => {
        console.error('Closing database connections...');
        await dbClose();
        process.exit(0);
    });

    process.on('SIGTERM', async (): Promise<void> => {
        console.error('Closing database connections...');
        await dbClose();
        process.exit(0);
    });
}
