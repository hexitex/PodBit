import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FolderOpen, Plus, Trash2, Play, Square, RefreshCw, Eye, ChevronDown, ChevronRight,
  FileText, AlertCircle, CheckCircle, Clock, Loader2, Search, HardDrive, X, Pencil,
  Network, Unplug,
} from 'lucide-react';
import { knowledgeBase } from '../lib/api';
import { useConfirmDialog } from '../components/ConfirmDialog';

// ---- Status badge ----
function StatusBadge({ status }) {
  const map = {
    idle: { color: 'bg-gray-500', icon: Clock, label: 'Idle' },
    scanning: { color: 'bg-blue-500', icon: Loader2, label: 'Scanning', spin: true },
    watching: { color: 'bg-green-500', icon: Eye, label: 'Watching' },
    error: { color: 'bg-red-500', icon: AlertCircle, label: 'Error' },
    pending: { color: 'bg-yellow-500', icon: Clock, label: 'Pending' },
    processing: { color: 'bg-blue-500', icon: Loader2, label: 'Processing', spin: true },
    completed: { color: 'bg-green-500', icon: CheckCircle, label: 'Completed' },
    skipped: { color: 'bg-gray-400', icon: null, label: 'Skipped' },
    deleted: { color: 'bg-red-400', icon: Trash2, label: 'Deleted' },
  };
  const s = map[status] || { color: 'bg-gray-500', icon: null, label: status };
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white ${s.color}`}>
      {Icon && <Icon size={12} className={s.spin ? 'animate-spin' : ''} />}
      {s.label}
    </span>
  );
}

// ---- Localhost detection ----
const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);

// ---- Pattern list input (tag-based) ----
function PatternListInput({ value, onChange, placeholder }) {
  const [inputVal, setInputVal] = useState('');
  const patterns = value ? value.split(',').map(s => s.trim()).filter(Boolean) : [];

  const addPattern = (raw) => {
    const items = raw.split(',').map(s => s.trim()).filter(Boolean);
    const unique = [...new Set([...patterns, ...items])];
    onChange(unique.join(', '));
    setInputVal('');
  };

  const removePattern = (idx) => {
    const next = patterns.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next.join(', ') : '');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      if (inputVal.trim()) addPattern(inputVal);
    } else if (e.key === 'Backspace' && !inputVal && patterns.length > 0) {
      removePattern(patterns.length - 1);
    }
  };

  return (
    <div className="border rounded-lg dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1.5 flex flex-wrap gap-1 items-center min-h-[38px] focus-within:ring-2 focus-within:ring-podbit-500/40">
      {patterns.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md bg-podbit-100 dark:bg-podbit-900/40 text-podbit-700 dark:text-podbit-300 text-xs font-mono">
          {p}
          <button type="button" onClick={() => removePattern(i)} className="ml-0.5 hover:text-red-500 leading-none">
            <X size={10} />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => { if (inputVal.trim()) addPattern(inputVal); }}
        placeholder={patterns.length === 0 ? placeholder : ''}
        className="flex-1 min-w-[80px] bg-transparent text-sm outline-none py-0.5 placeholder:text-gray-400"
      />
    </div>
  );
}

// ---- Add Folder Dialog ----
function AddFolderDialog({ onClose, onAdd }) {
  const [mode, setMode] = useState('local'); // 'local' | 'smb'
  const [folderPath, setFolderPath] = useState('');
  const [domain, setDomain] = useState('');
  const [recursive, setRecursive] = useState(true);
  const [watchEnabled, setWatchEnabled] = useState(false);
  const [includePatterns, setIncludePatterns] = useState('');
  const [excludePatterns, setExcludePatterns] = useState('');
  const [rawMode, setRawMode] = useState(false);
  const [showDefaults, setShowDefaults] = useState(false);
  const [browsing, setBrowsing] = useState(false);

  // SMB fields
  const [smbHost, setSmbHost] = useState('');
  const [smbShare, setSmbShare] = useState('');
  const [smbUsername, setSmbUsername] = useState('');
  const [smbPassword, setSmbPassword] = useState('');
  const [smbDomain, setSmbDomain] = useState('');
  const [smbSubpath, setSmbSubpath] = useState('');
  const [smbStatus, setSmbStatus] = useState(null); // null | 'testing' | 'connecting' | { success, error, fileCount }
  const [smbConnected, setSmbConnected] = useState(false);

  const browseMut = useMutation({
    mutationFn: () => knowledgeBase.browseFolder(),
    onMutate: () => setBrowsing(true),
    onSettled: () => setBrowsing(false),
    onSuccess: (data) => {
      if (data.selected) setFolderPath(data.selected);
    },
  });

  const { data: defaults } = useQuery({
    queryKey: ['kb-defaults'],
    queryFn: knowledgeBase.defaults,
  });

  const handleSmbTest = async () => {
    setSmbStatus('testing');
    try {
      const result = await knowledgeBase.smbTest({ host: smbHost, share: smbShare, username: smbUsername, password: smbPassword, domain: smbDomain || undefined });
      setSmbStatus(result);
    } catch (err) {
      setSmbStatus({ success: false, error: err.response?.data?.error || err.message });
    }
  };

  const handleSmbConnect = async () => {
    setSmbStatus('connecting');
    try {
      const conn = await knowledgeBase.smbConnect({ host: smbHost, share: smbShare, username: smbUsername, password: smbPassword, domain: smbDomain || undefined });
      setSmbConnected(true);
      const uncPath = conn.uncPath + (smbSubpath ? `\\${smbSubpath.replace(/^[\\/]+/, '')}` : '');
      setFolderPath(uncPath);
      setSmbStatus({ success: true });
    } catch (err) {
      setSmbStatus({ success: false, error: err.response?.data?.error || err.message });
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd({
      folderPath: folderPath.trim(),
      domain: domain.trim() || undefined,
      recursive,
      watchEnabled,
      rawMode,
      includePatterns: includePatterns.trim() || undefined,
      excludePatterns: excludePatterns.trim() || undefined,
    });
  };

  const smbReady = smbHost.trim() && smbShare.trim() && smbUsername.trim() && smbPassword.trim();
  const tabClass = (active) => `flex-1 px-3 py-2 text-sm font-medium rounded-lg flex items-center justify-center gap-1.5 transition-colors ${active ? 'bg-podbit-600 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="font-semibold text-lg">Add Folder</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-900 rounded-lg">
            <button type="button" onClick={() => setMode('local')} className={tabClass(mode === 'local')}>
              <FolderOpen size={14} /> Local Path
            </button>
            <button type="button" onClick={() => setMode('smb')} className={tabClass(mode === 'smb')}>
              <Network size={14} /> Network Share
            </button>
          </div>

          {mode === 'local' ? (
            <div>
              <label className="block text-sm font-medium mb-1">Folder Path *</label>
              <div className="flex gap-2">
                <input
                  type="text" value={folderPath} onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="C:\Research\papers or /home/user/docs"
                  className="flex-1 px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
                  required autoFocus
                />
                {isLocalhost && (
                  <button
                    type="button"
                    onClick={() => browseMut.mutate()}
                    disabled={browsing}
                    className="px-3 py-2 border rounded-lg dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm shrink-0 flex items-center gap-1.5"
                    title="Browse for folder"
                  >
                    {browsing ? <Loader2 size={14} className="animate-spin" /> : <FolderOpen size={14} />}
                    Browse
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Host / IP *</label>
                  <input type="text" value={smbHost} onChange={(e) => setSmbHost(e.target.value)}
                    placeholder="192.168.1.50 or nas" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Share Name *</label>
                  <input type="text" value={smbShare} onChange={(e) => setSmbShare(e.target.value)}
                    placeholder="Documents" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Username *</label>
                  <input type="text" value={smbUsername} onChange={(e) => setSmbUsername(e.target.value)}
                    placeholder="user" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Password *</label>
                  <input type="password" value={smbPassword} onChange={(e) => setSmbPassword(e.target.value)}
                    placeholder="••••••••" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium mb-1">Domain</label>
                  <input type="text" value={smbDomain} onChange={(e) => setSmbDomain(e.target.value)}
                    placeholder="WORKGROUP" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Subfolder</label>
                  <input type="text" value={smbSubpath} onChange={(e) => setSmbSubpath(e.target.value)}
                    placeholder="research/papers" className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm" />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={handleSmbTest} disabled={!smbReady || smbStatus === 'testing' || smbStatus === 'connecting'}
                  className="flex-1 px-3 py-2 text-sm border rounded-lg dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-1.5 disabled:opacity-50">
                  {smbStatus === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                  Test
                </button>
                <button type="button" onClick={handleSmbConnect} disabled={!smbReady || smbStatus === 'testing' || smbStatus === 'connecting' || smbConnected}
                  className="flex-1 px-3 py-2 text-sm rounded-lg bg-podbit-600 text-white hover:bg-podbit-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {smbStatus === 'connecting' ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
                  {smbConnected ? 'Connected' : 'Connect'}
                </button>
              </div>
              {smbStatus && typeof smbStatus === 'object' && (
                <div className={`text-xs px-3 py-2 rounded-lg ${smbStatus.success ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                  {smbStatus.success ? (
                    <span className="flex items-center gap-1"><CheckCircle size={12} /> Connected{smbStatus.fileCount != null ? ` — ${smbStatus.fileCount} items in share root` : ''}</span>
                  ) : (
                    <span className="flex items-center gap-1"><AlertCircle size={12} /> {smbStatus.error}</span>
                  )}
                </div>
              )}
              {smbConnected && (
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-500">Resolved Path</label>
                  <input type="text" value={folderPath} readOnly
                    className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm bg-gray-50 dark:bg-gray-900 text-gray-500" />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Domain</label>
            <input
              type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
              placeholder="Auto-detect from folder name"
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">Leave blank to use folder name as domain</p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Include Patterns</label>
              <PatternListInput value={includePatterns} onChange={setIncludePatterns} placeholder="*.md, *.pdf — press Enter to add" />
              <p className="text-xs text-gray-500 mt-1">Leave empty to include all supported file types</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Extra Exclude Patterns</label>
              <PatternListInput value={excludePatterns} onChange={setExcludePatterns} placeholder="*.log, temp/* — press Enter to add" />
            </div>
          </div>
          {defaults?.defaultExcludePatterns?.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setShowDefaults(!showDefaults)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 w-full"
              >
                {showDefaults ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Default excludes ({defaults.defaultExcludePatterns.length} patterns)
                <span className="ml-auto text-gray-400">always applied</span>
              </button>
              {showDefaults && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {defaults.defaultExcludePatterns.map((p, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs font-mono text-gray-500 dark:text-gray-400">{p}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} className="rounded" />
              Recursive
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={watchEnabled} onChange={(e) => setWatchEnabled(e.target.checked)} className="rounded" />
              Watch for changes
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rawMode} onChange={(e) => setRawMode(e.target.checked)} className="rounded" />
              Raw mode
            </label>
          </div>
          {rawMode && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Raw mode stores content as-is without LLM curation. Nodes are available for RAG retrieval but excluded from synthesis, compress, and dedup.
            </p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
            <button type="submit" disabled={!folderPath.trim() || (mode === 'smb' && !smbConnected)} className="px-4 py-2 text-sm rounded-lg bg-podbit-600 text-white hover:bg-podbit-700 disabled:opacity-50">Add Folder</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Pattern helpers ----
function parsePatterns(val) {
  if (!val) return '';
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.join(', ') : String(parsed);
  } catch {
    return String(val);
  }
}
function patternsToArray(str) {
  if (!str || !str.trim()) return null;
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

// ---- Edit Folder Dialog ----
function EditFolderDialog({ folder, onClose, onSaved }) {
  const queryClient = useQueryClient();
  const [folderPath, setFolderPath] = useState(folder.folder_path || '');
  const [domain, setDomain] = useState(folder.domain || '');
  const [includePatterns, setIncludePatterns] = useState(() => parsePatterns(folder.include_patterns));
  const [excludePatterns, setExcludePatterns] = useState(() => parsePatterns(folder.exclude_patterns));
  const [recursive, setRecursive] = useState(!!folder.recursive);
  const [watchEnabled, setWatchEnabled] = useState(!!folder.watch_enabled);
  const [showDefaults, setShowDefaults] = useState(false);
  const [error, setError] = useState(null);

  const { data: defaults } = useQuery({
    queryKey: ['kb-defaults'],
    queryFn: knowledgeBase.defaults,
  });

  const updateMut = useMutation({
    mutationFn: (data) => knowledgeBase.updateFolder(folder.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      onSaved();
    },
    onError: (err) => {
      setError(err.response?.data?.error || err.message || 'Update failed');
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    updateMut.mutate({
      folderPath: folderPath.trim(),
      domain: domain.trim(),
      includePatterns: patternsToArray(includePatterns),
      excludePatterns: patternsToArray(excludePatterns),
      recursive,
      watchEnabled,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="font-semibold text-lg">Edit Folder</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Folder Path</label>
            <input
              type="text" value={folderPath} onChange={(e) => setFolderPath(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm font-mono"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Domain</label>
              <input
                type="text" value={domain} onChange={(e) => setDomain(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg dark:bg-gray-700 dark:border-gray-600 text-sm"
              />
            </div>
            {folder.raw_mode ? (
              <span className="mt-5 px-2 py-1 rounded text-xs font-bold bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">RAW</span>
            ) : null}
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Include Patterns</label>
              <PatternListInput value={includePatterns} onChange={setIncludePatterns} placeholder="*.md, *.pdf — press Enter to add" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Exclude Patterns</label>
              <PatternListInput value={excludePatterns} onChange={setExcludePatterns} placeholder="*.log, temp/* — press Enter to add" />
            </div>
          </div>
          {defaults?.defaultExcludePatterns?.length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setShowDefaults(!showDefaults)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 w-full"
              >
                {showDefaults ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Default excludes ({defaults.defaultExcludePatterns.length} patterns)
                <span className="ml-auto text-gray-400">always applied</span>
              </button>
              {showDefaults && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {defaults.defaultExcludePatterns.map((p, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-xs font-mono text-gray-500 dark:text-gray-400">{p}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 sm:gap-6 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={recursive} onChange={(e) => setRecursive(e.target.checked)} className="rounded" />
              Recursive
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={watchEnabled} onChange={(e) => setWatchEnabled(e.target.checked)} className="rounded" />
              Watch for changes
            </label>
          </div>
          {error && (
            <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} disabled={updateMut.isPending} className="px-4 py-2 text-sm rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={updateMut.isPending} className="px-4 py-2 text-sm rounded-lg bg-podbit-600 text-white hover:bg-podbit-700 disabled:opacity-50 flex items-center gap-1.5">
              {updateMut.isPending && <Loader2 size={14} className="animate-spin" />}
              {updateMut.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- File list for a folder ----
function FolderFiles({ folderId, folderPath }) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const { data, isLoading } = useQuery({
    queryKey: ['kb-files', folderId],
    queryFn: () => knowledgeBase.files({ folderId, limit: 1000 }),
    refetchInterval: 5000,
  });

  const reprocessMut = useMutation({
    mutationFn: (fileId) => knowledgeBase.reprocess(fileId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-files', folderId] }),
  });

  const openFile = (relativePath) => {
    // Combine folder path + relative file path for the absolute path
    const sep = folderPath.includes('\\') ? '\\' : '/';
    const absPath = folderPath + sep + relativePath.replace(/[/\\]/g, sep);
    knowledgeBase.openPath(absPath).catch(() => {});
  };

  const files = data?.files || [];
  if (isLoading) return <div className="p-4 text-sm text-gray-500">Loading files...</div>;
  if (files.length === 0) return <div className="p-4 text-sm text-gray-500">No files found. Run a scan first.</div>;

  const statusCounts = {};
  files.forEach((f) => { statusCounts[f.status] = (statusCounts[f.status] || 0) + 1; });

  return (
    <div className="border-t dark:border-gray-700">
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/50 flex items-center gap-3 text-xs text-gray-500">
        <span>{files.length} files</span>
        {Object.entries(statusCounts).map(([s, c]) => (
          <span key={s}>{c} {s}</span>
        ))}
        {data?.total > files.length && <span className="text-gray-400">({data.total} total)</span>}
      </div>
      <div className="max-h-64 overflow-y-auto divide-y dark:divide-gray-700">
        {files.map((file) => (
          <div key={file.id} className="px-4 py-2 flex items-center gap-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/30">
            <FileText size={14} className="text-gray-400 shrink-0" />
            <button
              onClick={() => openFile(file.file_path)}
              className="flex-1 truncate font-mono text-xs text-left hover:text-podbit-600 hover:underline"
              title={`Open in file explorer: ${file.file_path}`}
            >
              {file.file_path.split('/').pop() || file.file_path}
            </button>
            <span className="text-xs text-gray-400 uppercase">{file.extension}</span>
            <StatusBadge status={file.status} />
            {(file.status === 'error' || file.status === 'completed') && (
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: 'Reprocess File',
                    message: `Reprocess "${file.file_path.split('/').pop() || file.file_path}"?\n\nExisting nodes from this file will be archived and the file will be re-ingested.`,
                    confirmLabel: 'Reprocess',
                    confirmColor: 'bg-blue-600 hover:bg-blue-700',
                  });
                  if (ok) reprocessMut.mutate(file.id);
                }}
                disabled={reprocessMut.isPending}
                className="text-gray-400 hover:text-podbit-600 p-1"
                title="Reprocess"
              >
                <RefreshCw size={14} className={reprocessMut.isPending ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        ))}
      </div>
      {ConfirmDialogEl}
    </div>
  );
}

// ---- Folder Card ----
function FolderCard({ folder, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [scanMsg, setScanMsg] = useState(null);
  const queryClient = useQueryClient();

  const scanMut = useMutation({
    mutationFn: () => knowledgeBase.scan(folder.id),
    onMutate: () => {
      setScanMsg(null);
      // Optimistically set folder to scanning so the stop button stays visible
      // while the folders query refetches with the real status
      queryClient.setQueryData(['kb-folders'], (old) => {
        if (!old?.folders) return old;
        return { ...old, folders: old.folders.map(f => f.id === folder.id ? { ...f, status: 'scanning' } : f) };
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-files', folder.id] });
      const parts = [];
      if (data?.queued > 0) parts.push(`${data.queued} queued`);
      if (data?.unchanged > 0) parts.push(`${data.unchanged} unchanged`);
      if (data?.unsupported > 0) parts.push(`${data.unsupported} unsupported`);
      setScanMsg({ type: 'success', text: parts.length > 0 ? `Scan complete: ${parts.join(', ')}` : 'Scan complete: no files found' });
      setTimeout(() => setScanMsg(null), 5000);
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      setScanMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Scan failed' });
      setTimeout(() => setScanMsg(null), 8000);
    },
  });

  const reprocessFolderMut = useMutation({
    mutationFn: () => knowledgeBase.reprocessFolder(folder.id),
    onMutate: () => {
      setScanMsg(null);
      queryClient.setQueryData(['kb-folders'], (old) => {
        if (!old?.folders) return old;
        return { ...old, folders: old.folders.map(f => f.id === folder.id ? { ...f, status: 'processing' } : f) };
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-files', folder.id] });
      setScanMsg({ type: 'success', text: `Reprocessing ${data?.filesQueued || 0} files (old nodes archived)` });
      setTimeout(() => setScanMsg(null), 8000);
    },
    onError: (err) => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      setScanMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Reprocess failed' });
      setTimeout(() => setScanMsg(null), 8000);
    },
  });

  const watchStartMut = useMutation({
    mutationFn: () => knowledgeBase.startWatch(folder.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-folders'] }),
  });

  const watchStopMut = useMutation({
    mutationFn: () => knowledgeBase.stopWatch(folder.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-folders'] }),
  });

  const isWatching = folder.status === 'watching';
  const isScanning = folder.status === 'scanning' || folder.status === 'processing' || scanMut.isPending;

  const stopMut = useMutation({
    mutationFn: () => knowledgeBase.stop(),
    onMutate: () => {
      queryClient.setQueryData(['kb-folders'], (old) => {
        if (!old?.folders) return old;
        return { ...old, folders: old.folders.map(f => f.id === folder.id ? { ...f, status: 'idle' } : f) };
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-files', folder.id] });
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
    },
  });

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <button onClick={() => setExpanded(!expanded)} className="mt-1 text-gray-400 hover:text-gray-600">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <FolderOpen size={20} className="text-podbit-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => knowledgeBase.openPath(folder.folder_path).catch(() => {})}
              className="font-medium text-sm truncate hover:text-podbit-600 hover:underline text-left"
              title={`Open folder: ${folder.folder_path}`}
            >
              {folder.folder_path}
            </button>
            <StatusBadge status={folder.status} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
            <span>Domain: <strong className="text-gray-700 dark:text-gray-300">{folder.domain}</strong></span>
            {folder.raw_mode ? <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">RAW</span> : null}
            {folder.recursive ? <span>Recursive</span> : null}
            {folder.last_scanned && <span>Last scan: {new Date(folder.last_scanned).toLocaleString()}</span>}
          </div>
          {(folder.include_patterns || folder.exclude_patterns) && (
            <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
              {folder.include_patterns && <span>Include: {parsePatterns(folder.include_patterns)}</span>}
              {folder.exclude_patterns && <span>Exclude: {parsePatterns(folder.exclude_patterns)}</span>}
            </div>
          )}
          {scanMsg && (
            <div className={`mt-1.5 text-xs ${scanMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              {scanMsg.text}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isScanning ? (
            <button
              onClick={() => stopMut.mutate()}
              disabled={stopMut.isPending}
              className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 hover:text-red-600"
              title={folder.status === 'processing' ? 'Stop processing' : 'Stop scanning'}
            >
              {stopMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Square size={16} />}
            </button>
          ) : (<>
            <button
              onClick={() => scanMut.mutate()}
              disabled={scanMut.isPending}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-podbit-600"
              title="Scan now"
            >
              <Search size={16} />
            </button>
            <button
              onClick={() => {
                if (confirm('Reprocess all files? This archives existing nodes (including synthesis children) and re-ingests from scratch.'))
                  reprocessFolderMut.mutate();
              }}
              disabled={reprocessFolderMut?.isPending}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-amber-600"
              title="Reprocess all files (archives old nodes + children, re-ingests)"
            >
              <RefreshCw size={16} className={reprocessFolderMut?.isPending ? 'animate-spin' : ''} />
            </button>
          </>)}
          {isWatching ? (
            <button
              onClick={() => watchStopMut.mutate()}
              disabled={watchStopMut.isPending}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-green-500 hover:text-red-500"
              title="Stop watching"
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              onClick={() => watchStartMut.mutate()}
              disabled={watchStartMut.isPending}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-green-600"
              title="Start watching"
            >
              <Play size={16} />
            </button>
          )}
          <button
            onClick={() => setEditing(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-podbit-600"
            title="Edit folder settings"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onRemove(folder.id)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500"
            title="Remove folder"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>
      {expanded && <FolderFiles folderId={folder.id} folderPath={folder.folder_path} />}
      {editing && (
        <EditFolderDialog
          folder={folder}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </div>
  );
}

// ---- Stats Card ----
function StatsCard({ label, value, icon: Icon, sub }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
        {Icon && <Icon size={14} />}
        {label}
      </div>
      <div className="text-2xl font-bold">{value ?? '—'}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

// ---- Default Excludes Editor ----
function DefaultExcludesEditor() {
  const queryClient = useQueryClient();
  const { data: defaults } = useQuery({
    queryKey: ['kb-defaults'],
    queryFn: knowledgeBase.defaults,
  });
  const [patternsStr, setPatternsStr] = useState('');
  const [initialized, setInitialized] = useState(false);

  // Sync from server on first load
  if (defaults?.defaultExcludePatterns && !initialized) {
    setPatternsStr(defaults.defaultExcludePatterns.join(', '));
    setInitialized(true);
  }

  const saveMut = useMutation({
    mutationFn: (patterns) => knowledgeBase.updateDefaults({ defaultExcludePatterns: patterns }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-defaults'] }),
  });

  const patterns = patternsStr ? patternsStr.split(',').map(s => s.trim()).filter(Boolean) : [];

  const handleSave = () => saveMut.mutate(patterns);

  // Check if changed from server state
  const serverPatterns = defaults?.defaultExcludePatterns || [];
  const hasChanges = initialized && JSON.stringify(patterns) !== JSON.stringify(serverPatterns);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Default Exclude Patterns</h3>
        <span className="text-xs text-gray-400">Applied to every folder scan</span>
      </div>
      <PatternListInput value={patternsStr} onChange={setPatternsStr} placeholder="Add pattern — press Enter" />
      {hasChanges && (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={handleSave}
            disabled={saveMut.isPending}
            className="px-3 py-1.5 text-xs bg-podbit-600 text-white rounded-lg hover:bg-podbit-700 disabled:opacity-50 flex items-center gap-1"
          >
            {saveMut.isPending && <Loader2 size={12} className="animate-spin" />}
            Save Changes
          </button>
          <button
            onClick={() => { setPatternsStr(serverPatterns.join(', ')); }}
            className="px-3 py-1.5 text-xs border rounded-lg dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Revert
          </button>
          {saveMut.isSuccess && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
        </div>
      )}
    </div>
  );
}

// ---- Readers Overview ----
function ReadersPanel() {
  const [newExt, setNewExt] = useState('');
  const [newReader, setNewReader] = useState('');
  const [mapMsg, setMapMsg] = useState(null);
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['kb-readers'],
    queryFn: knowledgeBase.readers,
    staleTime: 60000,
  });

  const mapMut = useMutation({
    mutationFn: ({ extension, readerName }) => knowledgeBase.mapExtension(extension, readerName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-readers'] });
      setNewExt('');
      setNewReader('');
      setMapMsg({ type: 'success', text: 'Extension mapped' });
      setTimeout(() => setMapMsg(null), 3000);
    },
    onError: (err) => {
      setMapMsg({ type: 'error', text: err.response?.data?.error || err.message || 'Map failed' });
      setTimeout(() => setMapMsg(null), 5000);
    },
  });

  const unmapMut = useMutation({
    mutationFn: (ext) => knowledgeBase.unmapExtension(ext),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-readers'] }),
  });

  const readers = data?.readers || [];
  const customMappings = data?.customMappings || [];
  const customSet = new Set(customMappings.map(m => m.extension));
  if (readers.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
      <h3 className="font-semibold text-sm mb-3">Registered Readers</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {readers.map((r) => (
          <div key={r.id} className="p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm">
            <div className="flex items-center gap-2">
              <FileText size={14} className="text-podbit-500 shrink-0" />
              <span className="font-medium text-xs">{r.name}</span>
              {r.requiresLLM && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">LLM</span>
              )}
            </div>
            <div className="flex flex-wrap gap-0.5 mt-1">
              {r.extensions.map(e => (
                <span key={e} className={`text-xs font-mono px-1 py-0.5 rounded ${customSet.has(e) ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300' : 'text-gray-400'}`}>
                  .{e}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Custom extension mappings */}
      {customMappings.length > 0 && (
        <div className="mt-3 pt-3 border-t dark:border-gray-700">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Custom Overrides</h4>
          <div className="flex flex-wrap gap-1.5">
            {customMappings.map((m) => (
              <span key={m.extension} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-indigo-50 dark:bg-indigo-900/30 text-xs text-indigo-700 dark:text-indigo-300">
                .{m.extension} &rarr; {m.readerName}
                <button onClick={() => unmapMut.mutate(m.extension)} className="text-indigo-400 hover:text-red-500 ml-0.5" title="Reset to default"><X size={10} /></button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Add/reassign extension mapping */}
      <div className="mt-3 pt-3 border-t dark:border-gray-700">
        <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Add or Reassign Extension</h4>
        <div className="flex items-center gap-2">
          <input
            type="text" value={newExt} onChange={(e) => setNewExt(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))}
            placeholder="ext"
            className="w-20 px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600 font-mono"
          />
          <span className="text-xs text-gray-400">&rarr;</span>
          <select
            value={newReader} onChange={(e) => setNewReader(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs border rounded dark:bg-gray-700 dark:border-gray-600"
          >
            <option value="">Select reader...</option>
            {readers.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
          </select>
          <button
            onClick={() => newExt && newReader && mapMut.mutate({ extension: newExt, readerName: newReader })}
            disabled={!newExt || !newReader || mapMut.isPending}
            className="px-2.5 py-1.5 text-xs bg-podbit-600 text-white rounded hover:bg-podbit-700 disabled:opacity-50"
          >
            {mapMut.isPending ? <Loader2 size={12} className="animate-spin" /> : 'Map'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">New extensions or reassign built-in ones to a different reader</p>
        {mapMsg && (
          <div className={`mt-1.5 text-xs ${mapMsg.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {mapMsg.text}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Pipeline Status ----
function PipelineStatus() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ['kb-status'],
    queryFn: knowledgeBase.status,
    refetchInterval: 3000,
  });

  const stopMut = useMutation({
    mutationFn: () => knowledgeBase.stop(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-status'] });
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-stats'] });
    },
  });

  if (!data?.pipeline) return null;
  const p = data.pipeline;
  if (p.queued === 0 && p.active === 0) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm font-medium">
          <Loader2 size={16} className="animate-spin" />
          Processing Pipeline
        </div>
        <button
          onClick={() => stopMut.mutate()}
          disabled={stopMut.isPending}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="Stop processing"
        >
          {stopMut.isPending ? <Loader2 size={12} className="animate-spin" /> : <Square size={12} />}
          Stop
        </button>
      </div>
      <div className="flex items-center gap-4 text-sm">
        <span><strong>{p.active}</strong> active</span>
        <span><strong>{p.queued}</strong> queued</span>
        <span><strong>{p.completed}</strong> completed</span>
        {p.failed > 0 && <span className="text-red-500"><strong>{p.failed}</strong> failed</span>}
      </div>
    </div>
  );
}

// ---- Main Page ----
/** Knowledge Base page: folders, scan, readers, and file status. */
export default function KnowledgeBase() {
  const queryClient = useQueryClient();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const { confirm, ConfirmDialogEl } = useConfirmDialog();

  const { data: foldersData, isLoading } = useQuery({
    queryKey: ['kb-folders'],
    queryFn: knowledgeBase.folders,
    refetchInterval: 5000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['kb-stats'],
    queryFn: knowledgeBase.stats,
    refetchInterval: 10000,
  });

  const addMut = useMutation({
    mutationFn: (data) => knowledgeBase.addFolder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      setShowAddDialog(false);
    },
  });

  const removeMut = useMutation({
    mutationFn: (id) => knowledgeBase.removeFolder(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kb-folders'] }),
  });

  const retryMut = useMutation({
    mutationFn: () => knowledgeBase.retryFailed(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kb-folders'] });
      queryClient.invalidateQueries({ queryKey: ['kb-stats'] });
    },
  });

  const { data: smbConns, refetch: refetchSmb } = useQuery({
    queryKey: ['smb-connections'],
    queryFn: knowledgeBase.smbConnections,
    refetchInterval: 30000,
  });

  const smbDisconnectMut = useMutation({
    mutationFn: ({ host, share }) => knowledgeBase.smbDisconnect(host, share),
    onSuccess: () => refetchSmb(),
  });

  const folders = foldersData?.folders || [];
  const stats = statsData || {};

  const handleRemove = async (id) => {
    const ok = await confirm({
      title: 'Remove Folder',
      message: 'Remove this folder from the Knowledge Base?\n\nFiles already ingested will remain in the graph.',
      confirmLabel: 'Remove',
    });
    if (ok) removeMut.mutate(id);
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-gray-500 mt-1">Ingest folders into the knowledge graph</p>
        </div>
        <div className="flex items-center gap-2">
          {(stats.errorFiles > 0 || stats.failedFiles > 0) && (
            <button
              onClick={() => retryMut.mutate()}
              disabled={retryMut.isPending}
              className="px-3 py-2 text-sm rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <RefreshCw size={14} className={`inline mr-1 ${retryMut.isPending ? 'animate-spin' : ''}`} />
              Retry Failed
            </button>
          )}
          <button
            onClick={() => setShowAddDialog(true)}
            className="px-4 py-2 text-sm rounded-lg bg-podbit-600 text-white hover:bg-podbit-700 flex items-center gap-2"
          >
            <Plus size={16} /> Add Folder
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatsCard label="Folders" value={stats.totalFolders ?? folders.length} icon={FolderOpen} />
        <StatsCard label="Files" value={stats.totalFiles ?? '—'} icon={FileText} />
        <StatsCard label="Nodes Created" value={stats.totalNodes ?? '—'} icon={HardDrive} />
        <StatsCard
          label="Errors"
          value={stats.errorFiles ?? 0}
          icon={AlertCircle}
          sub={stats.errorFiles > 0 ? 'Click Retry Failed above' : undefined}
        />
      </div>

      {/* SMB Connections */}
      {smbConns?.length > 0 && (
        <div className="mb-6 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700 p-4">
          <h3 className="text-sm font-medium flex items-center gap-2 mb-3">
            <Network size={14} /> Active Network Shares
          </h3>
          <div className="space-y-2">
            {smbConns.map((c) => (
              <div key={c.id} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs">{c.uncPath}</span>
                  <span className="text-xs text-gray-400">{c.username}{c.domain ? `@${c.domain}` : ''}</span>
                </div>
                <button
                  onClick={() => smbDisconnectMut.mutate({ host: c.host, share: c.share })}
                  disabled={smbDisconnectMut.isPending}
                  className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1"
                  title="Disconnect share"
                >
                  <Unplug size={12} /> Disconnect
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline */}
      <PipelineStatus />

      {/* Folders */}
      <div className="space-y-3 mt-6">
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">
            <Loader2 size={24} className="animate-spin mx-auto mb-2" />
            Loading folders...
          </div>
        ) : folders.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border dark:border-gray-700">
            <FolderOpen size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-500 mb-4">No folders added yet</p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="px-4 py-2 text-sm rounded-lg bg-podbit-600 text-white hover:bg-podbit-700"
            >
              Add Your First Folder
            </button>
          </div>
        ) : (
          folders.map((f) => <FolderCard key={f.id} folder={f} onRemove={handleRemove} />)
        )}
      </div>

      {/* Default Excludes & Readers */}
      <div className="mt-6 space-y-4">
        <DefaultExcludesEditor />
        <ReadersPanel />
      </div>

      {/* Add Dialog */}
      {showAddDialog && (
        <AddFolderDialog
          onClose={() => setShowAddDialog(false)}
          onAdd={(data) => addMut.mutate(data)}
        />
      )}

      {/* Mutation error toast */}
      {addMut.isError && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {addMut.error?.response?.data?.error || addMut.error?.message || 'Failed to add folder'}
        </div>
      )}

      {ConfirmDialogEl}
    </div>
  );
}
