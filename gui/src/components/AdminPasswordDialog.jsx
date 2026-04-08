/**
 * AdminPasswordDialog — modal for admin password entry.
 *
 * Shows when a config save is rejected because it touches sensitive paths.
 * On successful verification, caches an admin token for 15 minutes.
 *
 * Usage:
 *   const { promptAdmin, AdminPasswordEl } = useAdminPassword();
 *   const token = await promptAdmin(sensitivePaths); // returns token or null
 *   // In JSX: {AdminPasswordEl}
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Shield, X, Eye, EyeOff } from 'lucide-react';
import { security, setAdminToken, getAdminToken } from '../lib/api';

export default function AdminPasswordDialog({ state, onClose }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [active, setActive] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  // Delayed activation to defeat browser autofill
  useEffect(() => {
    if (state) {
      setPassword('');
      setActive(false);
      const t = setTimeout(() => { setActive(true); inputRef.current?.focus(); }, 150);
      return () => clearTimeout(t);
    }
  }, [state]);

  if (!state) return null;

  const { sensitivePaths = [], onSubmit } = state;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password) return;
    setError('');
    setLoading(true);
    try {
      const result = await security.adminVerify(password);
      if (result.token) {
        setAdminToken(result.token, result.expiresInMs);
        onSubmit(result.token);
        setPassword('');
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b dark:border-gray-700">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Shield size={20} className="text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-lg">Admin Authentication</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Security-sensitive settings require admin password</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-4 space-y-3">
            {sensitivePaths.length > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                <p className="font-medium mb-1">Protected settings being changed:</p>
                <ul className="list-disc pl-4 space-y-0.5">
                  {sensitivePaths.slice(0, 5).map((p) => (
                    <li key={p} className="font-mono">{p}</li>
                  ))}
                  {sensitivePaths.length > 5 && (
                    <li className="italic">...and {sensitivePaths.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            <div className="relative">
              <input
                ref={inputRef}
                type={active ? (showPassword ? 'text' : 'password') : 'text'}
                readOnly={!active}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setActive(true)}
                placeholder="Admin password"
                name={`_admin_pw_${Math.random().toString(36).slice(2, 8)}`}
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                className={`w-full px-3 py-2 pr-10 rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none ${!active ? 'cursor-pointer' : ''}`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {error && (
              <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 p-4 border-t dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!password || loading}
              className="px-4 py-2 text-sm rounded-lg text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Authenticate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Hook for admin password prompting.
 * Returns { promptAdmin, AdminPasswordEl }.
 *
 * promptAdmin(sensitivePaths) → Promise<string|null> (resolves to token or null if cancelled)
 */
export function useAdminPassword() {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const promptAdmin = useCallback((sensitivePaths = []) => {
    // Check cached token first
    const existing = getAdminToken();
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({
        sensitivePaths,
        onSubmit: (token) => {
          resolverRef.current = null;
          resolve(token);
        },
      });
    });
  }, []);

  const handleClose = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(null);
      resolverRef.current = null;
    }
    setState(null);
  }, []);

  const AdminPasswordEl = <AdminPasswordDialog state={state} onClose={handleClose} />;

  return { promptAdmin, AdminPasswordEl };
}
