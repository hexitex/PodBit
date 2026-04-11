import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader, Trash2, Plus, Link2, Unlink, X, Download, Pencil, ArrowUpFromLine, Clock, AlertCircle, RefreshCw, Lock, Star, ChevronDown, ChevronRight, ArrowDownUp, ShieldCheck, ShieldAlert, ShieldX, Shield } from 'lucide-react';
import { partitions, pool } from '../../lib/api';
import { CollapsibleSection } from '../../components/ConfigPrimitives';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { formatLocalDate } from '../../lib/datetime';

// ---------------------------------------------------------------------------
// Modal: generic backdrop + centered card
// ---------------------------------------------------------------------------
function Modal({ open, onClose, title, children }) {
  const overlayRef = useRef(null);
  const mouseDownTarget = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onMouseDown={(e) => { mouseDownTarget.current = e.target; }}
      onClick={(e) => {
        // Only close if BOTH mousedown and click happened on the backdrop itself.
        // This prevents closing when the user clicks inside the modal and drags out.
        if (e.target === overlayRef.current && mouseDownTarget.current === overlayRef.current) {
          onClose();
        }
      }}
    >
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl dark:shadow-gray-950/50 w-full max-w-md mx-4 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Slug preview helper
// ---------------------------------------------------------------------------
function toSlug(text) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 50);
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
/** Partitions and domains: create, bridge, rename, delete. */
export default function PartitionManagement() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const [newPartition, setNewPartition] = useState({ id: '', name: '', description: '' });
  const [newDomain, setNewDomain] = useState({});
  const [bridgeFrom, setBridgeFrom] = useState('');
  const [bridgeTo, setBridgeTo] = useState('');
  const [message, setMessage] = useState(null);

  // Modal state
  const [domainModal, setDomainModal] = useState(null); // { partitionId, oldName }
  const [domainInput, setDomainInput] = useState('');
  const [partitionModal, setPartitionModal] = useState(null); // partition object
  const [partNameInput, setPartNameInput] = useState('');
  const [partDescInput, setPartDescInput] = useState('');
  const [allowedCyclesInput, setAllowedCyclesInput] = useState(null); // null = all, array = restricted
  const [modalError, setModalError] = useState(null);

  const domainInputRef = useRef(null);
  const partNameRef = useRef(null);

  const { data: partitionList, isLoading } = useQuery({
    queryKey: ['partitions'],
    queryFn: partitions.list,
  });

  const { data: bridges, isLoading: loadingBridges } = useQuery({
    queryKey: ['partitions', 'bridges'],
    queryFn: partitions.listBridges,
  });

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  // --- Mutations ---

  const createMutation = useMutation({
    mutationFn: (data) => partitions.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partitions'] });
      setNewPartition({ id: '', name: '', description: '' });
      showMessage('success', 'Partition created');
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => partitions.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partitions'] });
      showMessage('success', 'Partition deleted');
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const updatePartitionMutation = useMutation({
    mutationFn: ({ id, name, description, allowed_cycles }) => partitions.update(id, { name, description, allowed_cycles }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partitions'] });
      setPartitionModal(null);
      showMessage('success', 'Partition updated');
    },
    onError: (err) => setModalError(err.response?.data?.error || err.message),
  });

  const addDomainMutation = useMutation({
    mutationFn: ({ id, domain }) => partitions.addDomain(id, domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partitions'] });
      setNewDomain({});
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const removeDomainMutation = useMutation({
    mutationFn: ({ id, domain }) => partitions.removeDomain(id, domain),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['partitions'] }),
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const renameDomainMutation = useMutation({
    mutationFn: ({ oldDomain, newDomain }) => partitions.renameDomain(oldDomain, newDomain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partitions'] });
      setDomainModal(null);
      showMessage('success', 'Domain renamed');
    },
    onError: (err) => setModalError(err.response?.data?.error || err.message),
  });

  const createBridgeMutation = useMutation({
    mutationFn: ({ a, b }) => partitions.createBridge(a, b),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partitions', 'bridges'] });
      setBridgeFrom('');
      setBridgeTo('');
      showMessage('success', 'Bridge created');
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const deleteBridgeMutation = useMutation({
    mutationFn: ({ a, b }) => partitions.deleteBridge(a, b),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partitions', 'bridges'] });
      showMessage('success', 'Bridge removed');
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  // --- Transient mutations ---

  const approveMutation = useMutation({
    mutationFn: (id) => partitions.approveTransient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partitions'] });
      showMessage('success', 'Transient partition approved and bridged');
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const departMutation = useMutation({
    mutationFn: ({ id, reason }) => partitions.departTransient(id, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['partitions'] });
      showMessage('success', `Partition departed — ${data?.stats?.childrenCreated ?? 0} children created`);
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  // --- Modal openers ---

  const openDomainModal = (partitionId, domainName) => {
    setDomainModal({ partitionId, oldName: domainName });
    setDomainInput(domainName);
    setModalError(null);
    setTimeout(() => domainInputRef.current?.select(), 50);
  };

  const openPartitionModal = (p) => {
    setPartitionModal(p);
    setPartNameInput(p.name || '');
    setPartDescInput(p.description || '');
    setAllowedCyclesInput(p.allowed_cycles || null);
    setModalError(null);
    setTimeout(() => partNameRef.current?.select(), 50);
  };

  // --- Modal submits ---

  const submitDomainRename = () => {
    if (!domainModal) return;
    setModalError(null);
    const slug = toSlug(domainInput);
    if (!slug) {
      setModalError('Domain name cannot be empty');
      return;
    }
    if (slug === domainModal.oldName) {
      setModalError('New name is the same as the current name');
      return;
    }
    renameDomainMutation.mutate({ oldDomain: domainModal.oldName, newDomain: slug });
  };

  const submitPartitionUpdate = () => {
    if (!partitionModal) return;
    setModalError(null);
    const name = partNameInput.trim();
    if (!name) {
      setModalError('Partition name cannot be empty');
      return;
    }
    updatePartitionMutation.mutate({
      id: partitionModal.id,
      name,
      description: partDescInput.trim(),
      allowed_cycles: allowedCyclesInput,
    });
  };

  const allPartitions = partitionList || [];
  const slug = toSlug(domainInput);
  const slugChanged = domainModal && slug !== domainModal.oldName && slug !== domainInput;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6">
      <h2 className="text-lg font-semibold dark:text-gray-100 mb-2">Domain Partitions</h2>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Partitions isolate domains so they never interact during synthesis cycles, voicing, or tension detection.
        Create bridges to opt-in to cross-partition synthesis.
      </p>

      {message && (
        <div className={`mb-4 p-2 rounded text-sm ${
          message.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* ================================================================= */}
      {/* Domain Rename Modal                                               */}
      {/* ================================================================= */}
      <Modal
        open={!!domainModal}
        onClose={() => setDomainModal(null)}
        title="Rename Domain"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Current name</label>
            <div className="text-sm font-mono bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
              {domainModal?.oldName}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">New name</label>
            <input
              ref={domainInputRef}
              type="text"
              value={domainInput}
              onChange={(e) => { setDomainInput(e.target.value); setModalError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submitDomainRename(); }}
              placeholder="new-domain-name"
              className="w-full text-sm font-mono px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-2 focus:ring-indigo-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              disabled={renameDomainMutation.isPending}
              autoFocus
            />
            {slugChanged && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Will be saved as: <span className="font-mono text-indigo-600">{slug}</span>
              </p>
            )}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Renames the domain across all nodes, partitions, parameters, and caches. Kebab-case, max 50 chars.
          </p>
          {modalError && (
            <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded px-3 py-1.5">
              {modalError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setDomainModal(null)}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={submitDomainRename}
              disabled={renameDomainMutation.isPending || !slug || slug === domainModal?.oldName}
              className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              {renameDomainMutation.isPending && <Loader size={12} className="animate-spin" />}
              Rename
            </button>
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* Partition Edit Modal                                              */}
      {/* ================================================================= */}
      <Modal
        open={!!partitionModal}
        onClose={() => setPartitionModal(null)}
        title="Edit Partition"
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Partition ID</label>
            <div className="text-sm font-mono bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded border border-gray-200 dark:border-gray-700 text-gray-400 dark:text-gray-500">
              {partitionModal?.id}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
            <input
              ref={partNameRef}
              type="text"
              value={partNameInput}
              onChange={(e) => { setPartNameInput(e.target.value); setModalError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPartitionUpdate(); }}
              placeholder="Partition name"
              className="w-full text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-2 focus:ring-indigo-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              disabled={updatePartitionMutation.isPending}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Description</label>
            <input
              type="text"
              value={partDescInput}
              onChange={(e) => { setPartDescInput(e.target.value); setModalError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPartitionUpdate(); }}
              placeholder="Optional description"
              className="w-full text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded outline-none focus:ring-2 focus:ring-indigo-300 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              disabled={updatePartitionMutation.isPending}
            />
          </div>
          {/* Allowed Cycles */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs text-gray-500 dark:text-gray-400">Allowed Cycles</label>
              <button
                type="button"
                onClick={() => setAllowedCyclesInput(allowedCyclesInput === null ? ['synthesis', 'voicing', 'research', 'tensions', 'questions', 'validation', 'evm'] : null)}
                className="text-xs text-indigo-500 hover:text-indigo-600"
              >
                {allowedCyclesInput === null ? 'Restrict' : 'Allow all'}
              </button>
            </div>
            {allowedCyclesInput === null ? (
              <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 rounded px-3 py-1.5 border border-gray-200 dark:border-gray-700">
                All cycles enabled (unrestricted)
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {['synthesis', 'voicing', 'research', 'tensions', 'questions', 'validation', 'evm'].map((cycle) => (
                  <label key={cycle} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowedCyclesInput.includes(cycle)}
                      onChange={(e) => {
                        setAllowedCyclesInput(prev =>
                          e.target.checked
                            ? [...prev, cycle]
                            : prev.filter(c => c !== cycle)
                        );
                      }}
                      className="rounded border-gray-300 dark:border-gray-600 text-indigo-500 focus:ring-indigo-300"
                    />
                    {cycle}
                  </label>
                ))}
              </div>
            )}
          </div>
          {modalError && (
            <div className="text-sm text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded px-3 py-1.5">
              {modalError}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setPartitionModal(null)}
              className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            >
              Cancel
            </button>
            <button
              onClick={submitPartitionUpdate}
              disabled={updatePartitionMutation.isPending || !partNameInput.trim()}
              className="px-4 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              {updatePartitionMutation.isPending && <Loader size={12} className="animate-spin" />}
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* ================================================================= */}
      {/* Partition List                                                    */}
      {/* ================================================================= */}
      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
          <Loader size={14} className="animate-spin" /> Loading partitions...
        </div>
      ) : allPartitions.length === 0 ? (
        <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm text-gray-500 dark:text-gray-400">
          No partitions defined. Domains without partitions are strictly isolated to themselves.
        </div>
      ) : (
        <div className="space-y-3 mb-4">
          {allPartitions.filter((p) => !p.transient && !p.system).map((p) => (
            <div key={p.id} className="border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              {/* Partition header */}
              <div className="flex items-center justify-between mb-2">
                <div
                  className="group flex items-center gap-1.5 cursor-pointer"
                  onClick={() => openPartitionModal(p)}
                >
                  <div>
                    <span className="font-medium text-sm dark:text-gray-100">{p.name || p.id}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">({p.id})</span>
                    {p.description && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{p.description}</p>}
                    {p.allowed_cycles && (
                      <p className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">
                        Cycles: {p.allowed_cycles.length > 0 ? p.allowed_cycles.join(', ') : 'none'}
                      </p>
                    )}
                  </div>
                  <Pencil size={11} className="text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={async () => {
                      try {
                        const owner = prompt('Owner tag for export (e.g., your name):');
                        if (!owner) return;
                        const data = await partitions.exportPartition(p.id, owner);
                        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${owner}-${p.id}.podbit.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        showMessage('success', `Exported ${p.id}`);
                      } catch (err) {
                        showMessage('error', `Export failed: ${err.message}`);
                      }
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-gray-500 dark:text-gray-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    title="Export partition"
                  >
                    <Download size={13} />
                    <span>Export</span>
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete Partition',
                        message: `Delete partition "${p.name || p.id}"?\n\nThis only removes the partition grouping. Domains and nodes will not be affected.`,
                        confirmLabel: 'Delete',
                      });
                      if (ok) deleteMutation.mutate(p.id);
                    }}
                    disabled={deleteMutation.isPending}
                    className="text-red-500 hover:text-red-700 disabled:opacity-50"
                    title="Delete partition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* Domains in partition */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(p.domains || []).map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full group"
                  >
                    <button
                      onClick={() => openDomainModal(p.id, d)}
                      className="hover:text-indigo-600 cursor-pointer"
                      title="Click to rename domain"
                    >
                      {d}
                    </button>
                    <button
                      onClick={() => openDomainModal(p.id, d)}
                      className="opacity-0 group-hover:opacity-100 hover:text-indigo-600 transition-opacity"
                      title="Rename domain"
                    >
                      <Pencil size={9} />
                    </button>
                    <button
                      onClick={async () => {
                        const ok = await confirm({
                          title: 'Remove Domain',
                          message: `Remove domain "${d}" from partition "${p.name || p.id}"?\n\nThe domain's nodes will remain but won't be grouped with this partition.`,
                          confirmLabel: 'Remove',
                        });
                        if (ok) removeDomainMutation.mutate({ id: p.id, domain: d });
                      }}
                      className="hover:text-red-500"
                      title="Remove domain from partition"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {(!p.domains || p.domains.length === 0) && (
                  <span className="text-xs text-gray-400 dark:text-gray-500">No domains</span>
                )}
              </div>

              {/* Add domain input */}
              <div className="flex gap-1.5">
                <input
                  type="text"
                  placeholder="Add domain..."
                  value={newDomain[p.id] || ''}
                  onChange={(e) => setNewDomain({ ...newDomain, [p.id]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newDomain[p.id]?.trim()) {
                      addDomainMutation.mutate({ id: p.id, domain: newDomain[p.id].trim() });
                    }
                  }}
                  className="flex-1 text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
                <button
                  onClick={() => {
                    if (newDomain[p.id]?.trim()) {
                      addDomainMutation.mutate({ id: p.id, domain: newDomain[p.id].trim() });
                    }
                  }}
                  disabled={!newDomain[p.id]?.trim()}
                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Transient Visitors */}
      {allPartitions.some((p) => p.transient) && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-2">
            <ArrowUpFromLine size={14} /> Transient Visitors
          </h3>
          <div className="space-y-2">
            {allPartitions.filter((p) => p.transient).map((p) => {
              const state = p.state || 'quarantine';
              const stateColors = {
                quarantine: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
                active: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
                departing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
                departed: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
              };
              return (
                <div key={p.id} className="border border-amber-200 dark:border-amber-700/50 rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm dark:text-gray-100">{p.name || p.id}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${stateColors[state] || stateColors.quarantine}`}>
                        {state}
                      </span>
                      {p.source_owner && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">from {p.source_owner}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {state === 'quarantine' && (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Approve Transient Partition',
                              message: `Approve "${p.name || p.id}" from quarantine?\n\nThis will run injection scanning and bridge it to your partitions for synthesis.`,
                              confirmLabel: 'Approve',
                            });
                            if (ok) approveMutation.mutate(p.id);
                          }}
                          disabled={approveMutation.isPending}
                          className="text-xs px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50"
                        >
                          Approve
                        </button>
                      )}
                      {state === 'active' && (
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Depart Transient Partition',
                              message: `Depart "${p.name || p.id}"?\n\nThe partition will be exported with any children it produced, then removed from your graph. Node stubs will preserve lineage.`,
                              confirmLabel: 'Depart',
                            });
                            if (ok) departMutation.mutate({ id: p.id, reason: 'manual' });
                          }}
                          disabled={departMutation.isPending}
                          className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                        >
                          Depart
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Metadata */}
                  <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {(p.domains || []).map((d) => (
                      <span key={d} className="bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">{d}</span>
                    ))}
                  </div>
                  {(p.cycles_completed > 0 || p.imported_at) && (
                    <div className="flex gap-4 mt-2 text-xs text-gray-400 dark:text-gray-500">
                      {p.cycles_completed > 0 && <span>Cycles: {p.cycles_completed}</span>}
                      {p.barren_cycles > 0 && <span>Barren: {p.barren_cycles}</span>}
                      {p.imported_at && <span>Imported: {new Date(p.imported_at).toLocaleDateString()}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create New Partition */}
      <CollapsibleSection title="Create Partition" description="Add a new domain partition">
        <div className="space-y-2">
          <input
            type="text"
            placeholder="ID (kebab-case, e.g. cognitive-science)"
            value={newPartition.id}
            onChange={(e) => setNewPartition({ ...newPartition, id: e.target.value })}
            className="w-full text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <input
            type="text"
            placeholder="Name (e.g. Cognitive Science)"
            value={newPartition.name}
            onChange={(e) => setNewPartition({ ...newPartition, name: e.target.value })}
            className="w-full text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newPartition.description}
            onChange={(e) => setNewPartition({ ...newPartition, description: e.target.value })}
            className="w-full text-sm px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          <button
            onClick={() => createMutation.mutate(newPartition)}
            disabled={!newPartition.id || !newPartition.name || createMutation.isPending}
            className="w-full text-sm px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {createMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
            Create Partition
          </button>
        </div>
      </CollapsibleSection>

      {/* Import Partition */}
      <CollapsibleSection title="Import Partition" description="Import a partition from a .podbit.json file">
        <div className="space-y-2">
          <input
            type="file"
            accept=".json,.podbit.json"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                const text = await file.text();
                const data = JSON.parse(text);
                const overwrite = await confirm({
                  title: 'Import Partition',
                  message: 'Overwrite if this partition already exists?\n\nChoose "Overwrite" to replace existing data, or "Cancel" to skip if it already exists.',
                  confirmLabel: 'Overwrite',
                  confirmColor: 'bg-amber-600 hover:bg-amber-700',
                });
                const result = await partitions.importPartition(data, overwrite);
                queryClient.invalidateQueries({ queryKey: ['partitions'] });
                showMessage('success', `Imported: ${result.imported?.nodes ?? 0} nodes, ${result.imported?.edges ?? 0} edges`);
              } catch (err) {
                showMessage('error', `Import failed: ${err.message}`);
              }
              e.target.value = '';
            }}
            className="w-full text-sm file:mr-2 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:bg-blue-50 dark:file:bg-blue-900/30 file:text-blue-700 dark:file:text-blue-300 hover:file:bg-blue-100 dark:hover:file:bg-blue-900/50"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500">Select a .podbit.json export file</p>
        </div>
      </CollapsibleSection>

      {/* Bridges */}
      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-semibold dark:text-gray-100 mb-2 flex items-center gap-1.5">
          <Link2 size={14} />
          Partition Bridges
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Bridges allow two partitions to interact during synthesis. Without a bridge, partitions are completely isolated.
        </p>

        {/* Existing bridges */}
        {loadingBridges ? (
          <div className="text-xs text-gray-400 dark:text-gray-500">Loading bridges...</div>
        ) : (bridges || []).length === 0 ? (
          <div className="mb-3 p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs text-gray-500 dark:text-gray-400">No bridges defined.</div>
        ) : (
          <div className="space-y-1.5 mb-3">
            {(bridges || []).map((b, i) => (
              <div key={i} className="flex items-center justify-between text-xs bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-800 px-3 py-1.5 rounded">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-orange-800 dark:text-orange-300">{b.name_a || b.partition_a}</span>
                  <Link2 size={12} className="text-orange-400" />
                  <span className="font-medium text-orange-800 dark:text-orange-300">{b.name_b || b.partition_b}</span>
                </div>
                <button
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Remove Bridge',
                      message: `Remove the bridge between "${b.name_a || b.partition_a}" and "${b.name_b || b.partition_b}"?\n\nThese partitions will no longer cross-synthesize.`,
                      confirmLabel: 'Remove',
                    });
                    if (ok) deleteBridgeMutation.mutate({ a: b.partition_a, b: b.partition_b });
                  }}
                  disabled={deleteBridgeMutation.isPending}
                  className="text-red-500 hover:text-red-700 disabled:opacity-50"
                  title="Remove bridge"
                >
                  <Unlink size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Create bridge */}
        {allPartitions.length >= 2 && (
          <div className="flex gap-1.5 items-center">
            <select
              value={bridgeFrom}
              onChange={(e) => setBridgeFrom(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="">Select partition...</option>
              {allPartitions.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
            <Link2 size={14} className="text-gray-400 flex-shrink-0" />
            <select
              value={bridgeTo}
              onChange={(e) => setBridgeTo(e.target.value)}
              className="flex-1 text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="">Select partition...</option>
              {allPartitions.filter((p) => p.id !== bridgeFrom).map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
            <button
              onClick={() => createBridgeMutation.mutate({ a: bridgeFrom, b: bridgeTo })}
              disabled={!bridgeFrom || !bridgeTo || bridgeFrom === bridgeTo || createBridgeMutation.isPending}
              className="text-xs px-3 py-1.5 bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 flex-shrink-0"
            >
              Bridge
            </button>
          </div>
        )}
      </div>
      {/* Pool Section */}
      <PoolSection
        allPartitions={allPartitions}
        showMessage={showMessage}
      />

      {ConfirmDialogEl}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pool Section — browse and recruit from the system partition pool
// ---------------------------------------------------------------------------
// --- Helpers ---
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function FitnessBadge({ fitness }) {
  const color = fitness >= 4 ? 'bg-emerald-500' : fitness >= 2 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <span className="flex items-center gap-1" title={`Fitness: ${fitness}`}>
      <span className={`w-2 h-2 rounded-full ${color}`} />
      <span className="text-[10px] font-mono text-gray-500">{fitness}</span>
    </span>
  );
}

function IntegrityBadge({ status, chainLength, onClick }) {
  const config = {
    verified: { Icon: ShieldCheck, color: 'text-emerald-500', label: 'Verified' },
    unverified: { Icon: Shield, color: 'text-yellow-500', label: 'Unverified' },
    broken: { Icon: ShieldX, color: 'text-red-500', label: 'Broken' },
    none: { Icon: ShieldAlert, color: 'text-gray-400', label: 'No integrity' },
  }[status] || { Icon: Shield, color: 'text-gray-400', label: status || 'Unknown' };

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      className={`flex items-center gap-0.5 ${config.color} hover:opacity-80`}
      title={`${config.label}${chainLength ? ` (${chainLength} log entries)` : ''}`}
    >
      <config.Icon size={13} />
      {chainLength > 0 && <span className="text-[9px] font-mono">{chainLength}</span>}
    </button>
  );
}

function PartitionTimeline({ partitionId }) {
  const { data, isLoading } = useQuery({
    queryKey: ['pool', 'history', partitionId],
    queryFn: () => pool.history(partitionId),
    retry: false,
  });

  if (isLoading) return <div className="py-2"><Loader size={12} className="animate-spin text-gray-400" /></div>;
  const history = data?.history || [];
  if (history.length === 0) return <p className="text-[10px] text-gray-400">No history yet.</p>;

  const eventIcons = { added: 'text-blue-500', recruited: 'text-emerald-500', returned: 'text-purple-500', expired: 'text-gray-400' };

  return (
    <div className="relative pl-4 space-y-0">
      {/* Vertical line */}
      <div className="absolute left-[5px] top-1 bottom-1 w-px bg-gray-200 dark:bg-gray-700" />
      {history.map((h, i) => {
        const prev = i > 0 ? history[i - 1] : null;
        const nodeDelta = prev ? h.node_count - prev.node_count : 0;
        return (
          <div key={h.id} className="relative pb-3">
            {/* Dot */}
            <div className={`absolute left-[-13px] top-[3px] w-2.5 h-2.5 rounded-full border-2 border-white dark:border-gray-900 ${h.event_type === 'expired' ? 'bg-gray-400' : 'bg-current'} ${eventIcons[h.event_type] || 'text-gray-400'}`} style={{ backgroundColor: h.event_type === 'added' ? '#3b82f6' : h.event_type === 'recruited' ? '#10b981' : h.event_type === 'returned' ? '#8b5cf6' : '#9ca3af' }} />
            <div className="text-[10px]">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {h.event_type === 'added' && 'Added to pool'}
                {h.event_type === 'recruited' && `Recruited by "${h.project}"`}
                {h.event_type === 'returned' && `Returned from "${h.project}"`}
                {h.event_type === 'expired' && `Expired (${h.project})`}
              </span>
              <span className="text-gray-400 ml-1.5">{h.node_count} nodes</span>
              {nodeDelta !== 0 && h.event_type === 'returned' && (
                <span className={nodeDelta > 0 ? 'text-emerald-500 ml-1' : 'text-red-500 ml-1'}>
                  ({nodeDelta > 0 ? '+' : ''}{nodeDelta})
                </span>
              )}
              {h.breakthrough_count > 0 && (
                <span className="text-amber-500 ml-1.5"><Star size={8} className="inline -mt-0.5" /> {h.breakthrough_count}</span>
              )}
              {h.cycles_run > 0 && (
                <span className="text-gray-400 ml-1.5">{h.cycles_run} cycles</span>
              )}
              {h.fitness > 0 && (
                <span className="text-gray-400 ml-1.5">fitness {h.fitness}</span>
              )}
              <div className="text-gray-400">{h.timestamp ? formatLocalDate(h.timestamp) : ''}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PoolSection({ allPartitions, showMessage }) {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const [poolAvailable, setPoolAvailable] = useState(null);
  const [recruitModal, setRecruitModal] = useState(null);
  const [addToPoolModal, setAddToPoolModal] = useState(false);
  const [addOwner, setAddOwner] = useState('');
  const [addPartitionId, setAddPartitionId] = useState('');
  const [recruitProject, setRecruitProject] = useState('');
  const [recruitHours, setRecruitHours] = useState(24);
  const [recruitMinCycles, setRecruitMinCycles] = useState(5);
  const [recruitMaxCycles, setRecruitMaxCycles] = useState(100);
  const [recruitExhaustion, setRecruitExhaustion] = useState(10);
  const [expandedPartition, setExpandedPartition] = useState(null);
  const [sortBy, setSortBy] = useState('fitness');

  // Check if pool server is available
  const { data: poolHealth } = useQuery({
    queryKey: ['pool', 'health'],
    queryFn: () => pool.health(),
    retry: false,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  useEffect(() => {
    setPoolAvailable(!!poolHealth?.status);
  }, [poolHealth]);

  // Dashboard stats
  const { data: dashboardData } = useQuery({
    queryKey: ['pool', 'dashboard'],
    queryFn: () => pool.dashboard(),
    enabled: poolAvailable === true,
    refetchInterval: 30000,
    retry: false,
  });

  // Pool partitions
  const { data: poolData, isLoading: loadingPool } = useQuery({
    queryKey: ['pool', 'partitions'],
    queryFn: () => pool.list(),
    enabled: poolAvailable === true,
    refetchInterval: 30000,
    retry: false,
  });

  // Recruitments
  const { data: recruitmentData, isLoading: loadingRecruitments } = useQuery({
    queryKey: ['pool', 'recruitments'],
    queryFn: () => pool.recruitments(),
    enabled: poolAvailable === true,
    refetchInterval: 30000,
    retry: false,
  });

  // Pool config (minPoolNodes etc.)
  const { data: poolConfig } = useQuery({
    queryKey: ['pool', 'config'],
    queryFn: () => pool.config(),
    enabled: poolAvailable === true,
    staleTime: 60000,
    retry: false,
  });

  // Projects (from pool server)
  const { data: projectsData } = useQuery({
    queryKey: ['pool', 'projects'],
    queryFn: () => pool.projects(),
    enabled: poolAvailable === true && !!recruitModal,
    retry: false,
  });

  const recruitMutation = useMutation({
    mutationFn: ({ id, params }) => pool.recruit(id, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool'] });
      setRecruitModal(null);
      showMessage('success', 'Partition recruited — will activate when project comes online');
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const addToPoolMutation = useMutation({
    mutationFn: async ({ partitionId, owner }) => {
      const exportData = await partitions.exportPartition(partitionId, owner);
      return pool.add(exportData);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pool'] });
      setAddToPoolModal(false);
      setAddOwner('');
      setAddPartitionId('');
      showMessage('success', `Partition added to pool (fitness: ${data.fitness})`);
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const removeFromPoolMutation = useMutation({
    mutationFn: (id) => pool.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pool'] });
      showMessage('success', 'Partition removed from pool');
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const verifyMutation = useMutation({
    mutationFn: (id) => pool.verify(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['pool'] });
      const status = data.status;
      if (status === 'verified') {
        showMessage('success', `Integrity verified: Merkle root valid, ${data.chain?.verified || 0} log entries verified`);
      } else if (status === 'broken') {
        showMessage('error', `Integrity broken: ${data.chain?.reason || 'Merkle root mismatch'}`);
      } else {
        showMessage('info', 'No integrity data available for this partition');
      }
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message),
  });

  const poolPartitions = poolData?.partitions || [];
  const recruitments = recruitmentData?.recruitments || [];
  const projects = projectsData?.projects || [];
  const minPoolNodes = poolConfig?.minPoolNodes || 10;

  // Sort partitions
  const sortedPartitions = [...poolPartitions].sort((a, b) => {
    switch (sortBy) {
      case 'fitness': return (b.fitness || 0) - (a.fitness || 0);
      case 'nodes': return (b.node_count || 0) - (a.node_count || 0);
      case 'recruited': return (b.times_recruited || 0) - (a.times_recruited || 0);
      case 'newest': return new Date(b.added_at || 0) - new Date(a.added_at || 0);
      case 'freshest': return new Date(b.last_returned_at || b.added_at || 0) - new Date(a.last_returned_at || a.added_at || 0);
      default: return 0;
    }
  });

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    returning: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    returned: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    expired: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
  };

  return (
    <>
      <CollapsibleSection title="Partition Pool" defaultOpen={false}>
        {poolAvailable === false || poolAvailable === null ? (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 py-3">
            <AlertCircle size={14} />
            <span>Pool server not available. Start it with <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">npm run pool</code></span>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Dashboard Header */}
            {dashboardData && (
              <div className="grid grid-cols-4 gap-2">
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-2 text-center">
                  <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{dashboardData.totalPartitions}</div>
                  <div className="text-[10px] text-gray-500">Partitions</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-2 text-center">
                  <div className="text-lg font-semibold text-emerald-600">{dashboardData.totalActive}</div>
                  <div className="text-[10px] text-gray-500">Active</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-2 text-center">
                  <div className="text-lg font-semibold text-gray-800 dark:text-gray-200">{dashboardData.avgFitness}</div>
                  <div className="text-[10px] text-gray-500">Avg Fitness</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-2 text-center">
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400">{dashboardData.oldestPartition ? timeAgo(dashboardData.oldestPartition) : '—'}</div>
                  <div className="text-[10px] text-gray-500">Pool Age</div>
                </div>
              </div>
            )}

            {/* Pool Partitions */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Available ({poolPartitions.length})
                  </h4>
                  <div className="flex items-center gap-1">
                    <ArrowDownUp size={10} className="text-gray-400" />
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                      className="text-[10px] bg-transparent border-none text-gray-500 cursor-pointer p-0"
                    >
                      <option value="fitness">Fitness</option>
                      <option value="nodes">Nodes</option>
                      <option value="recruited">Recruited</option>
                      <option value="newest">Newest</option>
                      <option value="freshest">Freshest</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => setAddToPoolModal(true)}
                  className="text-xs px-2 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 flex items-center gap-1"
                >
                  <ArrowUpFromLine size={12} /> Add to Pool
                </button>
              </div>

              {loadingPool ? (
                <div className="flex justify-center py-3"><Loader size={16} className="animate-spin text-gray-400" /></div>
              ) : sortedPartitions.length === 0 ? (
                <p className="text-xs text-gray-400 py-2">No partitions in pool. Export a partition to add it.</p>
              ) : (
                <div className="space-y-1.5">
                  {sortedPartitions.map((p) => {
                    const isExpanded = expandedPartition === p.id;
                    return (
                      <div key={p.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg overflow-hidden">
                        {/* Row summary */}
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedPartition(isExpanded ? null : p.id)}>
                            {isExpanded ? <ChevronDown size={12} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={12} className="text-gray-400 flex-shrink-0" />}
                            <FitnessBadge fitness={p.fitness || 0} />
                            <span className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{p.name}</span>
                            <span className="text-[10px] text-gray-400">{p.owner}</span>
                            {p.checked_out ? (
                              <span className="flex items-center gap-0.5 text-[10px] text-orange-500"><Lock size={9} /> in use</span>
                            ) : null}
                            <IntegrityBadge
                              status={p.integrity_status || 'none'}
                              chainLength={p.chain_length || 0}
                              onClick={() => {
                                verifyMutation.mutate(p.id);
                              }}
                            />
                          </div>
                          <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                            <span className="text-[10px] text-gray-500">{p.node_count} nodes</span>
                            {p.generation > 0 && (
                              <span className="text-[10px] bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full">Gen {p.generation}</span>
                            )}
                            {p.breakthrough_count > 0 && (
                              <span className="flex items-center gap-0.5 text-[10px] text-amber-500"><Star size={9} /> {p.breakthrough_count}</span>
                            )}
                            {p.times_recruited > 0 && (
                              <span className="text-[10px] text-gray-400">{p.times_recruited}x</span>
                            )}
                            <span className="text-[10px] text-gray-400">{timeAgo(p.last_returned_at || p.added_at)}</span>
                            <button
                              onClick={() => setRecruitModal(p)}
                              disabled={p.checked_out}
                              className="text-[10px] px-2 py-1 bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Recruit
                            </button>
                            <button
                              onClick={async () => {
                                const ok = await confirm({
                                  title: 'Remove from Pool',
                                  message: `Remove "${p.name}" from the partition pool? This does not affect any project.`,
                                });
                                if (ok) removeFromPoolMutation.mutate(p.id);
                              }}
                              disabled={p.checked_out}
                              className="text-gray-400 hover:text-red-500 p-1 disabled:opacity-40"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Expanded detail panel */}
                        {isExpanded && (
                          <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-3 space-y-3">
                            {/* Domain tags */}
                            {p.domains && (
                              <div className="flex flex-wrap gap-1">
                                {p.domains.split(', ').filter(Boolean).map((d) => (
                                  <span key={d} className="text-[10px] bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">{d}</span>
                                ))}
                              </div>
                            )}

                            {/* Stats row */}
                            <div className="grid grid-cols-4 gap-2 text-[10px]">
                              <div>
                                <span className="text-gray-400">Avg Weight</span>
                                <span className="ml-1 text-gray-700 dark:text-gray-300 font-mono">{p.avg_weight || '—'}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Domains</span>
                                <span className="ml-1 text-gray-700 dark:text-gray-300">{p.domain_count}</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Recruited</span>
                                <span className="ml-1 text-gray-700 dark:text-gray-300">{p.times_recruited}x</span>
                              </div>
                              <div>
                                <span className="text-gray-400">Active In</span>
                                <span className="ml-1 text-gray-700 dark:text-gray-300">{p.active_in || 0} project{(p.active_in || 0) !== 1 ? 's' : ''}</span>
                              </div>
                            </div>

                            {/* Integrity */}
                            <div className="flex items-center gap-3 text-[10px]">
                              <div className="flex items-center gap-1">
                                <IntegrityBadge status={p.integrity_status || 'none'} chainLength={p.chain_length || 0} />
                                <span className="text-gray-400 ml-1">
                                  {p.integrity_status === 'verified' ? 'Chain verified' :
                                   p.integrity_status === 'broken' ? 'Chain broken' :
                                   p.integrity_status === 'unverified' ? 'Not yet verified' : 'No integrity data'}
                                </span>
                              </div>
                              {p.merkle_root && (
                                <span className="font-mono text-gray-400" title={p.merkle_root}>
                                  Root: {p.merkle_root.slice(0, 12)}...
                                </span>
                              )}
                              {p.chain_length > 0 && (
                                <span className="text-gray-400">{p.chain_length} ops</span>
                              )}
                              <button
                                onClick={(e) => { e.stopPropagation(); verifyMutation.mutate(p.id); }}
                                disabled={verifyMutation.isPending}
                                className="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 rounded hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50"
                              >
                                {verifyMutation.isPending ? 'Verifying...' : 'Verify'}
                              </button>
                            </div>

                            {/* Family Tree */}
                            <div>
                              <h5 className="text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-2">Journey</h5>
                              <PartitionTimeline partitionId={p.id} />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Active Recruitments */}
            {recruitments.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                  Recruitments ({recruitments.length})
                </h4>
                {loadingRecruitments ? (
                  <div className="flex justify-center py-3"><Loader size={16} className="animate-spin text-gray-400" /></div>
                ) : (
                  <div className="space-y-1">
                    {recruitments.map((r) => (
                      <div key={r.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded px-3 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[r.status] || ''}`}>
                            {r.status}
                          </span>
                          <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{r.partition_name || r.pool_partition_id}</span>
                          <span className="text-[10px] text-gray-400">{'\u2192'} {r.target_project}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-shrink-0">
                          <div className="flex items-center gap-1">
                            <Clock size={10} />
                            <span>{r.procreation_hours}h</span>
                            {r.status === 'active' && r.return_due_at && (
                              <span className="text-orange-500">
                                due {formatLocalDate(r.return_due_at)}
                              </span>
                            )}
                          </div>
                          {r.status === 'active' && (
                            <div className="flex items-center gap-1">
                              <RefreshCw size={10} />
                              <span>{r.current_cycles || 0}/{r.max_cycles || '\u221E'}</span>
                              {r.exhaustion_threshold > 0 && (
                                <span className={r.current_barren >= r.exhaustion_threshold ? 'text-red-500' : 'text-gray-400'}>
                                  ({r.current_barren || 0}/{r.exhaustion_threshold} barren)
                                </span>
                              )}
                            </div>
                          )}
                          {r.status === 'returned' && r.current_cycles > 0 && (
                            <span className="text-emerald-500">{r.current_cycles} cycles</span>
                          )}
                          {r.status === 'expired' && (
                            <span className="text-gray-400 italic">stale — never returned</span>
                          )}
                          {r.error && (
                            <span className="text-red-500 truncate max-w-[150px]" title={r.error}>{r.error}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CollapsibleSection>

      {/* Recruit Modal */}
      <Modal open={!!recruitModal} onClose={() => setRecruitModal(null)} title={`Recruit: ${recruitModal?.name || ''}`}>
        <div className="space-y-3">
          {recruitModal?.checked_out && (
            <div className="flex items-center gap-2 text-xs text-orange-600 bg-orange-50 dark:bg-orange-900/20 dark:text-orange-400 px-3 py-2 rounded">
              <Lock size={12} /> This partition is currently checked out.
            </div>
          )}
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Target Project</label>
            <select
              value={recruitProject}
              onChange={(e) => setRecruitProject(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="">Select project...</option>
              {projects.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name} {p.isCurrent ? '(current)' : ''} — {p.nodeCount} nodes
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Time Limit (hours)</label>
            <input
              type="number"
              min="1"
              value={recruitHours}
              onChange={(e) => setRecruitHours(parseInt(e.target.value, 10) || 24)}
              className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Min Cycles</label>
              <input
                type="number"
                min="0"
                value={recruitMinCycles}
                onChange={(e) => setRecruitMinCycles(parseInt(e.target.value, 10) || 0)}
                className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Max Cycles</label>
              <input
                type="number"
                min="1"
                value={recruitMaxCycles}
                onChange={(e) => setRecruitMaxCycles(parseInt(e.target.value, 10) || 100)}
                className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
              />
            </div>
            <div>
              <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">Exhaust After</label>
              <input
                type="number"
                min="1"
                value={recruitExhaustion}
                onChange={(e) => setRecruitExhaustion(parseInt(e.target.value, 10) || 10)}
                className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-400">Returns when time expires, max cycles reached, or barren cycles exceed exhaust threshold (after min cycles).</p>
          <button
            onClick={() => recruitMutation.mutate({
              id: recruitModal.id,
              params: {
                project: recruitProject,
                procreationHours: recruitHours,
                minCycles: recruitMinCycles,
                maxCycles: recruitMaxCycles,
                exhaustionThreshold: recruitExhaustion,
              },
            })}
            disabled={!recruitProject || recruitMutation.isPending || recruitModal?.checked_out}
            className="w-full text-xs px-3 py-2 bg-emerald-500 text-white rounded hover:bg-emerald-600 disabled:opacity-50"
          >
            {recruitMutation.isPending ? 'Recruiting...' : 'Recruit'}
          </button>
        </div>
      </Modal>

      {/* Add to Pool Modal */}
      <Modal open={addToPoolModal} onClose={() => setAddToPoolModal(false)} title="Add Partition to Pool">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Partition</label>
            <select
              value={addPartitionId}
              onChange={(e) => setAddPartitionId(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            >
              <option value="">Select partition...</option>
              {allPartitions.filter((p) => !p.system && !p.transient).map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id} ({p.domains?.length || 0} domains)</option>
              ))}
            </select>
          </div>
          {addPartitionId && (() => {
            const sel = allPartitions.find((p) => p.id === addPartitionId);
            const nodeCount = sel?.nodeCount || sel?.node_count || 0;
            const tooFew = nodeCount < minPoolNodes;
            return tooFew ? (
              <div className="text-[10px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-1.5 rounded">
                This partition needs at least {minPoolNodes} nodes (currently {nodeCount}).
              </div>
            ) : null;
          })()}
          <div>
            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Owner tag</label>
            <input
              type="text"
              placeholder="e.g. rob"
              value={addOwner}
              onChange={(e) => setAddOwner(e.target.value)}
              className="w-full text-xs px-2 py-1.5 border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
            />
          </div>
          <button
            onClick={() => addToPoolMutation.mutate({ partitionId: addPartitionId, owner: addOwner })}
            disabled={!addPartitionId || !addOwner || addToPoolMutation.isPending}
            className="w-full text-xs px-3 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
          >
            {addToPoolMutation.isPending ? 'Exporting...' : 'Export to Pool'}
          </button>
        </div>
      </Modal>

      {ConfirmDialogEl}
    </>
  );
}
