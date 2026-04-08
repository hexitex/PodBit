/**
 * Knowledge Base REST API routes.
 *
 * Folder CRUD, scan/watch control, file listing/reprocess/retry,
 * pipeline stop, status/readers/defaults/stats, extension mapping,
 * OS-native folder browser and file opener, and SMB share management.
 * Mounted at /api/kb via routes/api.ts.
 *
 * @module routes/knowledge-base
 */

import { Router } from 'express';
import { exec } from 'child_process';
import { asyncHandler } from '../utils/async-handler.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

const router = Router();

// ---- Folders ----

router.get('/kb/folders', asyncHandler(async (_req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    res.json(await handleKnowledgeBase({ action: 'folders' }));
}));

router.post('/kb/folders', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'add', ...req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.status(201).json(result);
}));

router.put('/kb/folders/:id', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'update', folderId: req.params.id, ...req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.delete('/kb/folders/:id', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const deleteNodes = req.query.deleteNodes === 'true';
    const result = await handleKnowledgeBase({ action: 'remove', folderId: req.params.id, deleteNodes });
    res.json(result);
}));

// ---- Folder Actions ----

router.post('/kb/folders/:id/scan', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'scan', folderId: req.params.id }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.post('/kb/folders/:id/reprocess', asyncHandler(async (req, res) => {
    const { processingPipeline } = await import('../kb/pipeline.js');
    processingPipeline.resume(); // ensure pipeline isn't stopped
    const count = await processingPipeline.reprocessFolder(req.params.id);
    res.json({ success: true, filesQueued: count });
}));

router.post('/kb/folders/:id/watch/start', asyncHandler(async (req, res) => {
    const { startWatcher } = await import('../kb/watcher.js');
    const result = await startWatcher(req.params.id);
    res.json(result);
}));

router.post('/kb/folders/:id/watch/stop', asyncHandler(async (req, res) => {
    const { stopWatcher } = await import('../kb/watcher.js');
    const result = await stopWatcher(req.params.id);
    res.json(result);
}));

// ---- Files ----

router.get('/kb/files', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({
        action: 'files',
        folderId: req.query.folderId as string,
        status: req.query.status as string,
        domain: req.query.domain as string,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
    });
    res.json(result);
}));

router.get('/kb/files/:id', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'file', fileId: req.params.id }) as any;
    if (result.error) return res.status(404).json(result);
    res.json(result);
}));

router.post('/kb/files/:id/reprocess', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'reprocess', fileId: req.params.id }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.post('/kb/files/retry-failed', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'retry', folderId: req.body?.folderId });
    res.json(result);
}));

// ---- Pipeline Control ----

router.post('/kb/stop', asyncHandler(async (_req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    res.json(await handleKnowledgeBase({ action: 'stop' }));
}));

// ---- Status & Info ----

router.get('/kb/status', asyncHandler(async (_req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    res.json(await handleKnowledgeBase({ action: 'status' }));
}));

router.get('/kb/readers', asyncHandler(async (_req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    res.json(await handleKnowledgeBase({ action: 'readers' }));
}));

router.get('/kb/defaults', asyncHandler(async (_req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    res.json(await handleKnowledgeBase({ action: 'defaults' }));
}));

router.put('/kb/defaults', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'updateDefaults', ...req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.get('/kb/stats', asyncHandler(async (_req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    res.json(await handleKnowledgeBase({ action: 'stats' }));
}));

// ---- Extension Mappings ----

router.post('/kb/extensions/map', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'mapExtension', ...req.body }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

router.delete('/kb/extensions/:ext', asyncHandler(async (req, res) => {
    const { handleKnowledgeBase } = await import('../handlers/knowledge-base.js');
    const result = await handleKnowledgeBase({ action: 'unmapExtension', extension: req.params.ext }) as any;
    if (result.error) return res.status(400).json(result);
    res.json(result);
}));

// ---- OS Integration ----

/**
 * Open an OS-native folder browser dialog. Platform-specific: PowerShell
 * FolderBrowserDialog on Windows, osascript on macOS, zenity/kdialog on Linux.
 * 120s timeout; returns { selected: null } on cancel or dialog unavailability.
 */
router.post('/kb/browse-folder', asyncHandler(async (_req, res) => {
    const platform = os.platform();
    let cmd: string;

    if (platform === 'win32') {
        // PowerShell folder browser dialog
        cmd = `powershell -NoProfile -Command "Add-Type -AssemblyName System.Windows.Forms; $fb = New-Object System.Windows.Forms.FolderBrowserDialog; $fb.Description = 'Select folder for Knowledge Base'; $fb.ShowNewFolderButton = $false; if ($fb.ShowDialog() -eq 'OK') { $fb.SelectedPath } else { '' }"`;
    } else if (platform === 'darwin') {
        cmd = `osascript -e 'POSIX path of (choose folder with prompt "Select folder for Knowledge Base")'`;
    } else {
        // Linux — try zenity, fall back to kdialog
        cmd = `which zenity > /dev/null 2>&1 && zenity --file-selection --directory --title="Select folder for Knowledge Base" || kdialog --getexistingdirectory "$HOME" --title "Select folder for Knowledge Base"`;
    }

    exec(cmd, { timeout: 120000 }, (err, stdout, _stderr) => {
        if (err) {
            // User cancelled or dialog tool not available
            return res.json({ selected: null, error: err.killed ? 'timeout' : 'cancelled' });
        }
        const selected = stdout.trim();
        if (!selected) {
            return res.json({ selected: null, error: 'cancelled' });
        }
        // Verify the path exists
        if (!fs.existsSync(selected)) {
            return res.json({ selected: null, error: `Path does not exist: ${selected}` });
        }
        res.json({ selected });
    });
}));

/**
 * Open a file or directory in the OS file manager. Directories open directly;
 * files open the containing folder with the file selected (explorer /select on
 * Windows, open -R on macOS, xdg-open parent dir on Linux).
 */
router.post('/kb/open-path', asyncHandler(async (req, res) => {
    const { filePath } = req.body;
    if (!filePath || typeof filePath !== 'string') {
        return res.status(400).json({ error: 'filePath is required' });
    }

    // Resolve and verify path exists
    const resolved = path.resolve(filePath);
    if (!fs.existsSync(resolved)) {
        return res.status(404).json({ error: `Path not found: ${resolved}` });
    }

    const platform = os.platform();
    let cmd: string;

    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
        // Open folder in file explorer
        if (platform === 'win32') cmd = `explorer "${resolved}"`;
        else if (platform === 'darwin') cmd = `open "${resolved}"`;
        else cmd = `xdg-open "${resolved}"`;
    } else {
        // Open file's containing folder with the file selected
        const dir = path.dirname(resolved);
        const _basename = path.basename(resolved);
        if (platform === 'win32') cmd = `explorer /select,"${resolved}"`;
        else if (platform === 'darwin') cmd = `open -R "${resolved}"`;
        else cmd = `xdg-open "${dir}"`;
    }

    exec(cmd, (err) => {
        if (err) {
            return res.status(500).json({ error: `Failed to open: ${err.message}` });
        }
        res.json({ success: true });
    });
}));

// ---- SMB Connections ----

router.get('/kb/smb/connections', asyncHandler(async (_req, res) => {
    const { listConnections } = await import('../services/smb.js');
    res.json(listConnections());
}));

router.post('/kb/smb/connect', asyncHandler(async (req, res) => {
    const { host, share, username, password, domain } = req.body;
    if (!host || !share || !username || !password) {
        return res.status(400).json({ error: 'host, share, username, and password are required' });
    }
    const { connectShare } = await import('../services/smb.js');
    try {
        const conn = await connectShare({ host, share, username, password, domain });
        res.json(conn);
    } catch (err: any) {
        res.status(400).json({ error: err.message });
    }
}));

router.post('/kb/smb/test', asyncHandler(async (req, res) => {
    const { host, share, username, password, domain } = req.body;
    if (!host || !share || !username || !password) {
        return res.status(400).json({ error: 'host, share, username, and password are required' });
    }
    const { testConnection } = await import('../services/smb.js');
    const result = await testConnection({ host, share, username, password, domain });
    res.json(result);
}));

router.post('/kb/smb/disconnect', asyncHandler(async (req, res) => {
    const { host, share } = req.body;
    if (!host || !share) {
        return res.status(400).json({ error: 'host and share are required' });
    }
    const { disconnectShare } = await import('../services/smb.js');
    await disconnectShare(host, share);
    res.json({ success: true });
}));

export default router;
