/**
 * ClampDialog — modal for applying floor/ceiling bounds to existing nodes.
 * Shows a partition checklist with preview counts and a clamp action.
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, AlertTriangle, Check, Loader, ArrowDownToLine } from 'lucide-react';
import { configApi, partitions as partitionsApi } from '../lib/api';

const BOUND_LABELS = {
  weightCeiling: 'Weight ceiling',
  salienceCeiling: 'Salience ceiling',
  salienceFloor: 'Salience floor',
};

const BOUND_DESCRIPTIONS = {
  weightCeiling: (v) => `${v} — nodes above this will be clamped down`,
  salienceCeiling: (v) => `${v} — nodes above this will be clamped down`,
  salienceFloor: (v) => `${v} — nodes below this will be raised`,
};

export default function ClampDialog({ isOpen, onClose, changedBounds }) {
  const [selected, setSelected] = useState({});
  const [includeUnpartitioned, setIncludeUnpartitioned] = useState(true);
  const [result, setResult] = useState(null);

  const { data: partitionList } = useQuery({
    queryKey: ['partitions'],
    queryFn: partitionsApi.list,
    enabled: isOpen,
  });

  // Default all partitions to selected when list loads
  useEffect(() => {
    if (partitionList && isOpen) {
      const initial = {};
      partitionList.forEach(p => { initial[p.id] = true; });
      setSelected(initial);
      setIncludeUnpartitioned(true);
      setResult(null);
    }
  }, [partitionList, isOpen]);

  // Preview query — auto-fetches when selection changes
  const selectedIds = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
  const hasSelection = selectedIds.length > 0 || includeUnpartitioned;

  const previewMutation = useMutation({
    mutationFn: (params) => configApi.clampNodes(params),
  });

  const clampMutation = useMutation({
    mutationFn: (params) => configApi.clampNodes(params),
    onSuccess: (data) => setResult(data),
  });

  // Auto-preview when selection changes
  useEffect(() => {
    if (!isOpen || !hasSelection || !changedBounds || Object.keys(changedBounds).length === 0) return;
    previewMutation.mutate({
      partitions: selectedIds,
      includeUnpartitioned,
      ...changedBounds,
      preview: true,
    });
  }, [isOpen, JSON.stringify(selectedIds), includeUnpartitioned]);

  const handleClamp = () => {
    clampMutation.mutate({
      partitions: selectedIds,
      includeUnpartitioned,
      ...changedBounds,
      preview: false,
    });
  };

  const togglePartition = (id) => {
    setSelected(prev => ({ ...prev, [id]: !prev[id] }));
    setResult(null);
  };

  const toggleAll = (checked) => {
    if (!partitionList) return;
    const next = {};
    partitionList.forEach(p => { next[p.id] = checked; });
    setSelected(next);
    setIncludeUnpartitioned(checked);
    setResult(null);
  };

  if (!isOpen || !changedBounds || Object.keys(changedBounds).length === 0) return null;

  const boundEntries = Object.entries(changedBounds).filter(([, v]) => v !== undefined);
  const preview = previewMutation.data;
  const allSelected = partitionList?.every(p => selected[p.id]) && includeUnpartitioned;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <ArrowDownToLine size={16} className="text-blue-500" />
              Apply Bounds to Existing Nodes
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Optionally clamp existing nodes to the new limits
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 p-4">
          {/* Changed bounds summary */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs font-medium text-blue-800 mb-1">Bounds changed:</p>
            {boundEntries.map(([key, value]) => (
              <p key={key} className="text-xs text-blue-700">
                {BOUND_LABELS[key]}: {BOUND_DESCRIPTIONS[key](value)}
              </p>
            ))}
          </div>

          {/* Select/deselect all */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-600">Select partitions:</span>
            <button
              onClick={() => toggleAll(!allSelected)}
              className="text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
          </div>

          {/* Partition list */}
          <div className="space-y-1 mb-3">
            {partitionList?.map(p => (
              <label
                key={p.id}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!selected[p.id]}
                  onChange={() => togglePartition(p.id)}
                  className="rounded border-gray-300 text-blue-500 focus:ring-blue-300"
                />
                <span className="text-sm flex-1">{p.name}</span>
                <span className="text-xs text-gray-400">{p.domains?.length || 0} domains</span>
              </label>
            ))}

            {/* Unpartitioned */}
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer border-t mt-1 pt-2">
              <input
                type="checkbox"
                checked={includeUnpartitioned}
                onChange={() => { setIncludeUnpartitioned(v => !v); setResult(null); }}
                className="rounded border-gray-300 text-blue-500 focus:ring-blue-300"
              />
              <span className="text-sm flex-1 text-gray-600 dark:text-gray-400">Unpartitioned nodes</span>
              <span className="text-xs text-gray-400 dark:text-gray-500">no partition</span>
            </label>
          </div>

          {/* Preview counts */}
          {previewMutation.isPending && (
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 py-2">
              <Loader size={12} className="animate-spin" /> Counting...
            </div>
          )}

          {preview && !previewMutation.isPending && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
              {preview.total === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">All nodes already within bounds.</p>
              ) : (
                <>
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                    {preview.total} node{preview.total !== 1 ? 's' : ''} will be clamped:
                  </p>
                  {preview.counts.weightCeiling > 0 && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {preview.counts.weightCeiling} exceed weight ceiling ({changedBounds.weightCeiling})
                    </p>
                  )}
                  {preview.counts.salienceCeiling > 0 && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {preview.counts.salienceCeiling} exceed salience ceiling ({changedBounds.salienceCeiling})
                    </p>
                  )}
                  {preview.counts.salienceFloor > 0 && (
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {preview.counts.salienceFloor} below salience floor ({changedBounds.salienceFloor})
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {/* Result after clamping */}
          {result && (
            <div className="mt-3 p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg flex items-start gap-2">
              <Check size={14} className="text-green-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-green-800 dark:text-green-300">
                  Clamped {result.total} node{result.total !== 1 ? 's' : ''}
                </p>
                {result.clamped.weightCeiling > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-400">{result.clamped.weightCeiling} weight capped</p>
                )}
                {result.clamped.salienceCeiling > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-400">{result.clamped.salienceCeiling} salience capped</p>
                )}
                {result.clamped.salienceFloor > 0 && (
                  <p className="text-xs text-green-700 dark:text-green-400">{result.clamped.salienceFloor} salience raised</p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {(clampMutation.isError || previewMutation.isError) && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-700 dark:text-red-300">
                {(clampMutation.error || previewMutation.error)?.response?.data?.error || 'Failed to clamp nodes'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {result ? 'Done' : 'Close — Config Saved'}
          </button>
          {!result && (
            <button
              onClick={handleClamp}
              disabled={!hasSelection || clampMutation.isPending || (preview?.total === 0)}
              className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {clampMutation.isPending ? (
                <Loader size={14} className="animate-spin" />
              ) : (
                <ArrowDownToLine size={14} />
              )}
              Apply Bounds{preview?.total > 0 ? ` (${preview.total})` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
