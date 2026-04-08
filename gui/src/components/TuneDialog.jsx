/**
 * TuneDialog — reusable modal for LLM-powered config parameter tuning.
 * Shows preset buttons, custom input, and structured suggestion display.
 */

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { X, Sparkles, Loader, AlertTriangle, Info, Save } from 'lucide-react';
import { configApi } from '../lib/api';
import SuggestionRow from './SuggestionRow';

export default function TuneDialog({ sectionId, sectionTitle, presets, isOpen, onClose, onAccept, onSave }) {
  const [request, setRequest] = useState('');
  const [accepted, setAccepted] = useState({});
  const [applied, setApplied] = useState(false);

  const tuneMutation = useMutation({
    mutationFn: ({ sectionId, request }) => configApi.tune(sectionId, request),
  });

  // When suggestions arrive, default all to accepted
  useEffect(() => {
    if (tuneMutation.data?.suggestions) {
      const initial = {};
      tuneMutation.data.suggestions.forEach(s => {
        initial[s.key] = true;
      });
      setAccepted(initial);
    }
  }, [tuneMutation.data]);

  // Reset state when dialog opens with a new section
  useEffect(() => {
    if (isOpen) {
      setRequest('');
      setAccepted({});
      setApplied(false);
      tuneMutation.reset();
    }
  }, [isOpen, sectionId]);

  const handleSubmit = () => {
    if (!request.trim()) return;
    tuneMutation.mutate({ sectionId, request: request.trim() });
  };

  const handlePreset = (intent) => {
    setRequest(intent);
    tuneMutation.mutate({ sectionId, request: intent });
  };

  const handleApply = () => {
    const changes = (tuneMutation.data?.suggestions || [])
      .filter(s => accepted[s.key])
      .map(s => ({ configPath: s.configPath, value: s.suggestedValue }));
    onAccept(changes);
    setApplied(true);
  };

  const handleSave = () => {
    if (onSave) onSave();
    onClose();
  };

  const acceptedCount = Object.values(accepted).filter(Boolean).length;
  const totalCount = tuneMutation.data?.suggestions?.length || 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Sparkles size={16} className="text-purple-500" />
              Tune: {sectionTitle}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Describe what behavior you want, or pick a preset
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X size={16} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">
          {/* Quick Presets */}
          {presets && presets.length > 0 && (
            <div className="p-4 border-b">
              <div className="text-xs text-gray-500 mb-2">Quick presets:</div>
              <div className="flex flex-wrap gap-2">
                {presets.map(p => (
                  <button
                    key={p.label}
                    onClick={() => handlePreset(p.intent)}
                    disabled={tuneMutation.isPending}
                    className="text-xs px-3 py-1.5 rounded-full border border-gray-200 hover:bg-purple-50 hover:border-purple-300 transition-colors disabled:opacity-50"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Custom Input */}
          <div className="p-4 border-b">
            <div className="flex gap-2">
              <input
                value={request}
                onChange={e => setRequest(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !tuneMutation.isPending && handleSubmit()}
                placeholder="e.g. Make the synthesis engine explore more aggressively..."
                className="flex-1 text-sm px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300"
                disabled={tuneMutation.isPending}
              />
              <button
                onClick={handleSubmit}
                disabled={!request.trim() || tuneMutation.isPending}
                className="px-4 py-2 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-600 disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0"
              >
                {tuneMutation.isPending ? (
                  <Loader size={14} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                Tune
              </button>
            </div>
          </div>

          {/* Loading State */}
          {tuneMutation.isPending && (
            <div className="p-8 text-center">
              <Loader size={24} className="animate-spin mx-auto text-purple-400 mb-3" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Analyzing parameters...</p>
            </div>
          )}

          {/* Results */}
          {tuneMutation.data && !tuneMutation.isPending && (
            <div className="p-4">
              {/* Summary */}
              <div className="mb-3 p-3 bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-800 rounded-lg flex gap-2">
                <Info size={14} className="flex-shrink-0 mt-0.5 text-purple-600 dark:text-purple-400" />
                <p className="text-sm text-purple-800 dark:text-purple-300">{tuneMutation.data.summary}</p>
              </div>

              {/* No suggestions */}
              {tuneMutation.data.suggestions?.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                  No parameter changes suggested — current values already match your request.
                </p>
              )}

              {/* Suggestion rows */}
              <div className="space-y-2">
                {tuneMutation.data.suggestions?.map(s => (
                  <SuggestionRow
                    key={s.key}
                    suggestion={s}
                    accepted={accepted[s.key] ?? false}
                    onToggle={() =>
                      setAccepted(prev => ({ ...prev, [s.key]: !prev[s.key] }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Error state */}
          {tuneMutation.isError && (
            <div className="p-4">
              <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg">
                <AlertTriangle size={14} className="flex-shrink-0 mt-0.5 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-red-700 dark:text-red-300">Tuning failed</p>
                  <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                    {tuneMutation.error?.response?.data?.error ||
                      tuneMutation.error?.message ||
                      'An unexpected error occurred. Check that an LLM is configured and reachable.'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action bar — only show when we have results */}
        {tuneMutation.data && !tuneMutation.isPending && tuneMutation.data.suggestions?.length > 0 && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-2 flex-shrink-0">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {applied ? 'Close' : 'Cancel'}
            </button>
            {!applied ? (
              <button
                onClick={handleApply}
                disabled={acceptedCount === 0}
                className="flex-1 px-4 py-2 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                Apply {acceptedCount}/{totalCount} Changes
              </button>
            ) : (
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-1.5"
              >
                <Save size={14} />
                Save to Config
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
