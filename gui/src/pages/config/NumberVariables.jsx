import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Variable, Pencil, Trash2, Search, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { database } from '../../lib/api';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { resolveNodeNames, getCachedName } from '../../lib/node-names';

const PAGE_SIZE = 25;

/** Number variables: paginated list, edit, and delete for domain-scoped numeric refs. */
export default function NumberVariables() {
  const [domain, setDomain] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [editingVar, setEditingVar] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [editScope, setEditScope] = useState('');
  const [message, setMessage] = useState(null);
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();

  const { data, isLoading } = useQuery({
    queryKey: ['number-variables', domain, search, page],
    queryFn: () => database.listNumberVariables({
      domain: domain || undefined,
      search: search || undefined,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
  });

  const editMutation = useMutation({
    mutationFn: ({ varId, updates }) => database.editNumberVariable(varId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['number-variables'] });
      setEditingVar(null);
      setMessage({ type: 'success', text: 'Variable updated' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.message || 'Update failed' });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (varId) => database.deleteNumberVariable(varId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['number-variables'] });
      setMessage({ type: 'success', text: 'Variable deleted' });
      setTimeout(() => setMessage(null), 3000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.message || 'Delete failed' });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const backfillMutation = useMutation({
    mutationFn: () => database.backfillNumberVariables(),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['number-variables'] });
      setMessage({ type: 'success', text: data.message || 'Backfill complete' });
      setTimeout(() => setMessage(null), 8000);
    },
    onError: (err) => {
      setMessage({ type: 'error', text: err.response?.data?.error || err.message || 'Backfill failed' });
      setTimeout(() => setMessage(null), 5000);
    },
  });

  const handleBackfill = async () => {
    const ok = await confirm({
      title: 'Backfill Number Variables',
      message: 'Scan all existing nodes and extract all numbers into domain-scoped variables. Node content will have numbers replaced with variable references.\n\nNumbers already inside variable refs will be skipped.',
      confirmLabel: 'Run Backfill',
    });
    if (ok) backfillMutation.mutate();
  };

  const startEdit = (v) => {
    setEditingVar(v.varId);
    setEditValue(v.value);
    setEditScope(v.scopeText);
  };

  const saveEdit = (varId) => {
    editMutation.mutate({
      varId,
      updates: { value: editValue, scopeText: editScope },
    });
  };

  const handleDelete = async (varId) => {
    const ok = await confirm({
      title: 'Delete Variable',
      message: `Delete ${varId}? This removes the registry entry but does NOT change node content.`,
      confirmLabel: 'Delete',
    });
    if (ok) deleteMutation.mutate(varId);
  };

  const variables = data?.variables || [];
  const total = data?.total || 0;

  // Batch-resolve source node names
  const [, _forceNames] = useState(0);
  useEffect(() => {
    const ids = variables.map(v => v.sourceNodeId).filter(Boolean);
    if (ids.length > 0) resolveNodeNames([...new Set(ids)]).then(() => _forceNames(n => n + 1));
  }, [variables.length, page]);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      {ConfirmDialogEl}
      <div className="flex items-center gap-2 mb-4">
        <Variable className="w-5 h-5 text-blue-500" />
        <h2 className="text-lg font-semibold">Number Variables</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {total} registered
        </span>
        <div className="ml-auto">
          <button
            onClick={handleBackfill}
            disabled={backfillMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 border border-blue-300 dark:border-blue-600 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 disabled:opacity-50"
            title="Extract number variables from all existing nodes"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${backfillMutation.isPending ? 'animate-spin' : ''}`} />
            {backfillMutation.isPending ? 'Running...' : 'Backfill Existing Nodes'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-3 p-2 rounded text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* Search & domain filter */}
      <div className="flex items-center gap-2 mb-3">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          placeholder="Search by ID, value, or scope..."
          className="flex-1 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
        />
        <input
          type="text"
          value={domain}
          onChange={(e) => { setDomain(e.target.value); setPage(0); }}
          placeholder="Domain..."
          className="w-36 px-2 py-1 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
        />
        {(domain || search) && (
          <button
            onClick={() => { setDomain(''); setSearch(''); setPage(0); }}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500 py-4 text-center">Loading...</div>
      ) : variables.length === 0 ? (
        <div className="text-sm text-gray-500 py-4 text-center">
          No number variables registered. Enable the feature in Algorithm Parameters &rarr; Number Variables.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 dark:text-gray-400 border-b dark:border-gray-600">
                  <th className="pb-2 pr-2">ID</th>
                  <th className="pb-2 pr-2">Value</th>
                  <th className="pb-2 pr-2">Scope</th>
                  <th className="pb-2 pr-2">Domain</th>
                  <th className="pb-2 pr-2">Source</th>
                  <th className="pb-2 w-20"></th>
                </tr>
              </thead>
              <tbody>
                {variables.map((v) => (
                  <tr key={v.varId} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="py-2 pr-2 font-mono text-xs text-blue-600 dark:text-blue-400">
                      {v.varId}
                    </td>
                    <td className="py-2 pr-2">
                      {editingVar === v.varId ? (
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="w-20 px-1 py-0.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                        />
                      ) : (
                        <span className="font-mono font-bold">{v.value}</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 text-xs text-gray-600 dark:text-gray-400 max-w-xs truncate">
                      {editingVar === v.varId ? (
                        <input
                          type="text"
                          value={editScope}
                          onChange={(e) => setEditScope(e.target.value)}
                          className="w-full px-1 py-0.5 text-sm border rounded dark:bg-gray-700 dark:border-gray-600"
                        />
                      ) : (
                        v.scopeText
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                        {v.domain}
                      </span>
                    </td>
                    <td className="py-2 pr-2 font-mono text-xs">
                      {v.sourceNodeId ? <Link to={`/graph?node=${v.sourceNodeId}`} className="text-blue-500 hover:underline">{getCachedName(v.sourceNodeId)}</Link> : '—'}
                    </td>
                    <td className="py-2 text-right">
                      {editingVar === v.varId ? (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => saveEdit(v.varId)}
                            className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingVar(null)}
                            className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-600 rounded hover:bg-gray-300 dark:hover:bg-gray-500"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => startEdit(v)}
                            className="p-1 text-gray-400 hover:text-blue-500"
                            title="Edit variable"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(v.varId)}
                            className="p-1 text-gray-400 hover:text-red-500"
                            title="Delete variable"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
              <span>Page {page + 1} of {totalPages}</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
