import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, Download, Upload, Globe } from 'lucide-react';
import { configApi } from '../../lib/api';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { formatLocal } from '../../lib/datetime';

/** Config snapshots: save, list, restore, and delete. */
export default function SnapshotManagement() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState(null);
  const [showAllProjects, setShowAllProjects] = useState(false);

  const { data: snapData, isLoading } = useQuery({
    queryKey: ['config-snapshots', showAllProjects],
    queryFn: () => configApi.snapshots({ allProjects: showAllProjects }),
  });

  const saveMutation = useMutation({
    mutationFn: (label) => configApi.saveSnapshot(label),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['config-snapshots'] });
      setLabel('');
      setMessage({ type: 'success', text: `Snapshot "${data.label}" saved (${data.parameterCount} params)` });
      setTimeout(() => setMessage(null), 4000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.response?.data?.error || err.message });
      setTimeout(() => setMessage(null), 4000);
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (snapshotId) => configApi.restoreSnapshot(snapshotId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: ['config-snapshots'] });
      queryClient.invalidateQueries({ queryKey: ['config-history'] });
      setMessage({ type: 'success', text: `Restored "${data.snapshotLabel}" (${data.restoredCount} params changed)` });
      setTimeout(() => setMessage(null), 4000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.response?.data?.error || err.message });
      setTimeout(() => setMessage(null), 4000);
    },
  });

  const handleSave = () => {
    if (saveMutation.isPending) return;
    saveMutation.mutate(label || undefined);
  };

  const handleRestore = async (snapshot) => {
    if (restoreMutation.isPending) return;
    const isOtherProject = snapData?.currentProject && snapshot.projectName !== snapData.currentProject;
    const ok = await confirm({
      title: 'Restore Snapshot',
      message: `Restore snapshot "${snapshot.label}"?${isOtherProject ? `\n\nThis snapshot is from project "${snapshot.projectName}".` : ''}\n\nThis will overwrite all current algorithm parameters.`,
      confirmLabel: 'Restore',
      confirmColor: 'bg-amber-600 hover:bg-amber-700',
    });
    if (!ok) return;
    restoreMutation.mutate(snapshot.id);
  };

  const currentProject = snapData?.currentProject;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Config Snapshots</h2>
        <button
          onClick={() => setShowAllProjects(!showAllProjects)}
          className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
            showAllProjects
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title={showAllProjects ? 'Showing all projects' : 'Show all projects'}
        >
          <Globe size={12} />
          {showAllProjects ? 'All projects' : 'This project'}
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Rolling window of config states. Auto-saved before changes. Keeps 10 per project.
      </p>

      {message && (
        <div className={`mb-3 p-2 rounded text-xs border ${
          message.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Save new snapshot */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Snapshot label (optional)"
          className="flex-1 text-xs border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-300 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-100"
        />
        <button
          onClick={handleSave}
          disabled={saveMutation.isPending}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {saveMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Download size={12} />}
          Save
        </button>
      </div>

      {/* Snapshots list */}
      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Loader size={14} className="animate-spin" /> Loading snapshots...
        </div>
      ) : !snapData?.snapshots || snapData.snapshots.length === 0 ? (
        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-500 dark:text-gray-400">
          No snapshots yet. Snapshots are auto-saved before config changes.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {snapData.snapshots.map((s) => {
            const isOtherProject = currentProject && s.projectName !== currentProject;
            return (
              <div key={s.id} className={`flex items-center gap-2 text-xs p-2 rounded border ${
                isOtherProject
                  ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50'
                  : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700'
              }`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium truncate">{s.label}</span>
                    {s.createdBy === 'system' && (
                      <span className="text-gray-400 dark:text-gray-500 shrink-0">(auto)</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-gray-400 dark:text-gray-500">
                    {isOtherProject && (
                      <span className="text-blue-500 dark:text-blue-400 font-medium">{s.projectName}</span>
                    )}
                    <span>{formatLocal(s.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    {s.synthSuccessRate != null && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        {(s.synthSuccessRate * 100).toFixed(0)}% synth
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRestore(s)}
                  disabled={restoreMutation.isPending}
                  className="flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded hover:bg-orange-200 dark:hover:bg-orange-900/50 disabled:opacity-50 shrink-0"
                  title="Restore this snapshot"
                >
                  <Upload size={10} /> Restore
                </button>
              </div>
            );
          })}
        </div>
      )}
      {ConfirmDialogEl}
    </div>
  );
}
