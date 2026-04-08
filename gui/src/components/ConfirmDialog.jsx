/**
 * ConfirmDialog — reusable modal confirmation dialog.
 *
 * Usage:
 *   const [confirmState, setConfirmState] = useState(null);
 *   // To trigger:
 *   setConfirmState({ title: 'Delete?', message: '...', onConfirm: () => doThing() });
 *   // In JSX:
 *   <ConfirmDialog state={confirmState} onClose={() => setConfirmState(null)} />
 *
 * Or use the hook:
 *   const { confirm, ConfirmDialogEl } = useConfirmDialog();
 *   await confirm({ title: 'Delete?', message: '...' }); // resolves true/false
 *   // In JSX: {ConfirmDialogEl}
 */

import { useState, useCallback, useRef } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * @param {{ state: { title: string, message: string, confirmLabel?: string, confirmColor?: string, onConfirm: () => void } | null, onClose: () => void }}
 */
export default function ConfirmDialog({ state, onClose }) {
  if (!state) return null;

  const {
    title = 'Confirm',
    message,
    confirmLabel = 'Confirm',
    confirmColor = 'bg-red-600 hover:bg-red-700',
  } = state;

  const handleConfirm = () => {
    state.onConfirm();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b dark:border-gray-700">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-600 dark:text-red-400" />
          </div>
          <h3 className="font-semibold text-lg flex-1">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>
        <div className="p-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-line">{message}</p>
        </div>
        <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm rounded-lg text-white ${confirmColor}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Hook for imperative confirm dialogs.
 * Returns { confirm, ConfirmDialogEl }.
 *
 * const { confirm, ConfirmDialogEl } = useConfirmDialog();
 * const ok = await confirm({ title: '...', message: '...' });
 */
export function useConfirmDialog() {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback(({ title, message, confirmLabel, confirmColor }) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        title,
        message,
        confirmLabel,
        confirmColor,
        onConfirm: () => resolve(true),
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    setState(null);
    if (resolveRef.current) {
      resolveRef.current(false);
      resolveRef.current = null;
    }
  }, []);

  const ConfirmDialogEl = <ConfirmDialog state={state} onClose={handleClose} />;

  return { confirm, ConfirmDialogEl };
}
