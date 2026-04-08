import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader, Trash2, Download, UploadCloud, HardDrive } from 'lucide-react';
import { database } from '../../lib/api';
import { DeleteButton } from '../../components/ConfigPrimitives';
import { useConfirmDialog } from '../../components/ConfirmDialog';

/** Database: info, stats, backup, restore, clear caches, WAL checkpoint. */
export default function DatabaseManagement() {
  const [message, setMessage] = useState(null);
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();

  const { data: dbInfo } = useQuery({
    queryKey: ['database', 'info'],
    queryFn: database.info,
  });

  const { data: stats, isLoading: loadingStats, refetch: refetchStats } = useQuery({
    queryKey: ['database', 'stats'],
    queryFn: database.stats,
  });

  const clearMutation = useMutation({
    mutationFn: async ({ action, param }) => {
      switch (action) {
        case 'type': return database.clearNodesByType(param);
        case 'domain': return database.clearNodesByDomain(param);
        case 'allNodes': return database.clearAllNodes();
        case 'patterns': return database.clearPatterns();
        case 'templates': return database.clearTemplates();
        case 'docJobs': return database.clearDocJobs();
        case 'knowledgeCache': return database.clearKnowledgeCache();
        case 'decisions': return database.clearDecisions();
        case 'everything': return database.clearEverything();
        default: throw new Error('Unknown action');
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      setMessage({ type: 'success', text: data.message });
      refetchStats();
      setTimeout(() => setMessage(null), 5000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.message || 'Delete failed' });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const confirmAction = async (action, param, label) => {
    const ok = await confirm({
      title: 'Confirm Delete',
      message: `${label}?\n\nThis action cannot be undone.`,
      confirmLabel: 'Delete',
    });
    if (ok) clearMutation.mutate({ action, param });
  };

  const { data: backups, refetch: refetchBackups } = useQuery({
    queryKey: ['database', 'backups'],
    queryFn: database.listBackups,
  });

  const backupMutation = useMutation({
    mutationFn: (label) => database.createBackup(label),
    onSuccess: (data) => {
      refetchBackups();
      setMessage({ type: 'success', text: data.message });
      setTimeout(() => setMessage(null), 5000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.message || 'Backup failed' });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (filename) => database.restoreBackup(filename),
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      refetchBackups();
      refetchStats();
      setMessage({ type: 'success', text: data.message });
      setTimeout(() => setMessage(null), 8000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.message || 'Restore failed' });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const createAutoBackup = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const label = `podbit-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    backupMutation.mutate(label);
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6 border-2 border-red-200 dark:border-red-800">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-700 dark:text-red-300">
        <AlertTriangle size={20} />
        Database Management
      </h2>

      {dbInfo && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-sm">
          <span className="font-medium text-blue-800 dark:text-blue-300">Backend:</span>{' '}
          <span className="text-blue-700 dark:text-blue-300">{dbInfo.label}</span>
          <span className="text-blue-500 dark:text-blue-400 ml-2">({dbInfo.configuredVia})</span>
        </div>
      )}

      {/* Backup & Restore */}
      <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-sm flex items-center gap-2 text-green-800 dark:text-green-300">
            <HardDrive size={16} />
            Backup & Restore
          </h3>
          <button
            onClick={createAutoBackup}
            disabled={backupMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            {backupMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Download size={14} />}
            Backup Now
          </button>
        </div>

        {backups?.backups?.length > 0 ? (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {backups.backups.map((b) => (
              <div key={b.filename} className="flex items-center justify-between text-xs bg-white dark:bg-gray-800 px-3 py-2 rounded border border-gray-200 dark:border-gray-700">
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-gray-800 dark:text-gray-200 truncate block">{b.label}</span>
                  <span className="text-gray-400 dark:text-gray-500">{formatSize(b.size)} &middot; {new Date(b.created).toLocaleString()}</span>
                </div>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Restore Database',
                      message: `Restore from "${b.label}"?\n\nThis will replace the current database with this backup. All current data will be overwritten.`,
                      confirmLabel: 'Restore',
                      confirmColor: 'bg-amber-600 hover:bg-amber-700',
                    });
                    if (ok) restoreMutation.mutate(b.filename);
                  }}
                  disabled={restoreMutation.isPending}
                  className="ml-2 flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 disabled:opacity-50 shrink-0"
                >
                  <UploadCloud size={12} />
                  Restore
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-green-600 dark:text-green-400">No backups yet. Create one before making destructive changes.</p>
        )}
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {loadingStats ? (
        <div className="text-sm text-gray-500">Loading stats...</div>
      ) : stats ? (
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="font-medium text-sm mb-3 flex items-center justify-between">
              <span>Nodes ({stats.nodes} total, {stats.edges} edges)</span>
              {stats.nodes > 0 && (
                <DeleteButton
                  onClick={() => confirmAction('allNodes', null, `Delete all ${stats.nodes} nodes`)}

                >
                  Clear All
                </DeleteButton>
              )}
            </div>

            {stats.byType?.length > 0 && (
              <div className="mb-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">By Type:</div>
                <div className="flex flex-wrap gap-2">
                  {stats.byType.map(({ type, count }) => (
                    <div key={type} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                      <span className="font-medium">{type}</span>
                      <span className="text-gray-500 dark:text-gray-400">({count})</span>
                      <button
                        onClick={() => confirmAction('type', type, `Delete ${count} ${type} nodes`)}
      
                        className="ml-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                        title={`Delete all ${type} nodes`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {stats.byDomain?.length > 0 && (
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">By Domain:</div>
                <div className="flex flex-wrap gap-2">
                  {stats.byDomain.map(({ domain, count }) => (
                    <div key={domain} className="flex items-center gap-1 text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded border border-gray-200 dark:border-gray-700">
                      <span className="font-medium">{domain}</span>
                      <span className="text-gray-500 dark:text-gray-400">({count})</span>
                      <button
                        onClick={() => confirmAction('domain', domain, `Delete ${count} nodes from "${domain}"`)}
      
                        className="ml-1 text-red-500 hover:text-red-700 disabled:opacity-50"
                        title={`Delete all ${domain} nodes`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="font-medium text-sm flex items-center justify-between">
              <span>Research Jobs ({stats.docJobs})</span>
              {stats.docJobs > 0 && (
                <DeleteButton
                  onClick={() => confirmAction('docJobs', null, `Delete all ${stats.docJobs} research jobs`)}

                >
                  Clear
                </DeleteButton>
              )}
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="font-medium text-sm flex items-center justify-between">
              <span>Abstract Patterns ({stats.patterns})</span>
              {stats.patterns > 0 && (
                <DeleteButton
                  onClick={() => confirmAction('patterns', null, `Delete all ${stats.patterns} patterns`)}

                >
                  Clear
                </DeleteButton>
              )}
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="font-medium text-sm flex items-center justify-between">
              <span>Knowledge Cache ({stats.knowledgeCache})</span>
              {stats.knowledgeCache > 0 && (
                <DeleteButton
                  onClick={() => confirmAction('knowledgeCache', null, `Clear ${stats.knowledgeCache} cached entries`)}

                >
                  Clear
                </DeleteButton>
              )}
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="font-medium text-sm flex items-center justify-between">
              <span>Decision Log ({stats.decisions})</span>
              {stats.decisions > 0 && (
                <DeleteButton
                  onClick={() => confirmAction('decisions', null, `Delete all ${stats.decisions} decision records`)}

                >
                  Clear
                </DeleteButton>
              )}
            </div>
          </div>

          <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="font-medium text-sm flex items-center justify-between">
              <span>Templates ({stats.templates})</span>
              {stats.templates > 0 && (
                <DeleteButton
                  onClick={() => confirmAction('templates', null, `Delete all ${stats.templates} templates`)}

                >
                  Clear
                </DeleteButton>
              )}
            </div>
          </div>

          {(stats.nodes > 0 || stats.patterns > 0 || stats.docJobs > 0) && (
            <div className="pt-3 border-t border-red-200 dark:border-red-800">
              <DeleteButton
                onClick={() => confirmAction('everything', null, 'Delete EVERYTHING (nodes, patterns, jobs, cache, decisions)')}
                disabled={false}
                variant="danger"
              >
                Delete Everything
              </DeleteButton>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Completely reset the database</p>
            </div>
          )}
        </div>
      ) : null}
      {ConfirmDialogEl}
    </div>
  );
}
