import { useState, useEffect, useRef, useContext, } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UNSAFE_NavigationContext, useLocation } from 'react-router-dom';
import { Save, RotateCcw, Search, X, Sparkles, ShieldCheck, ShieldOff } from 'lucide-react';
import { configApi, security as securityApi, getAdminToken, setAdminToken, clearAdminToken } from '../lib/api';
import ClampDialog from '../components/ClampDialog';
import ConfigAssistant from '../components/ConfigAssistant';
import { useConfirmDialog } from '../components/ConfirmDialog';
import { useAdminPassword } from '../components/AdminPasswordDialog';
import { useScrollToHash } from '../lib/useScrollToHash';
import {
  AlgorithmParameters,
  SnapshotManagement,
  ConfigHistory,
} from './config/index';

/**
 * Password input that defeats browser autofill.
 * Renders as readonly text initially → switches to editable password on focus.
 */
function SecurePasswordInput({ value, onChange, placeholder, autoFocus, ringColor = 'amber', className = '' }) {
  const ref = useRef(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (autoFocus && ref.current) {
      // Small delay to ensure the browser has finished autofill attempts
      const t = setTimeout(() => { setActive(true); ref.current?.focus(); }, 100);
      return () => clearTimeout(t);
    }
  }, [autoFocus]);

  return (
    <input
      ref={ref}
      type={active ? 'password' : 'text'}
      readOnly={!active}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setActive(true)}
      name={`_secure_${Math.random().toString(36).slice(2, 8)}`}
      autoComplete="off"
      data-1p-ignore="true"
      data-lpignore="true"
      className={`w-full px-3 py-1.5 text-sm rounded-lg border dark:border-gray-600 bg-white dark:bg-gray-700 outline-none focus:ring-1 focus:ring-${ringColor}-500 ${!active ? 'cursor-pointer' : ''} ${className}`}
    />
  );
}

/**
 * Admin Password management card — setup, change, or remove the admin password.
 * When set, security-sensitive config changes (lab verification params, API keys, etc.)
 * require admin authentication.
 */
function AdminPasswordCard() {
  const queryClient = useQueryClient();
  const { data: status } = useQuery({
    queryKey: ['admin-status'],
    queryFn: securityApi.adminStatus,
    staleTime: 30000,
  });

  const [mode, setMode] = useState(null); // 'setup' | 'change' | 'remove' | 'gate'
  const [gateTarget, setGateTarget] = useState(null); // 'change' | 'remove' — what to unlock after gate
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [currentPw, setCurrentPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setMode(null); setGateTarget(null); setPw(''); setPw2(''); setCurrentPw(''); setError(''); };

  // Gate: verify current password before allowing change/remove
  const handleGate = async (e) => {
    e.preventDefault();
    if (!currentPw || currentPw.length < 8) { setError('Enter your current admin password'); return; }
    setLoading(true);
    try {
      const res = await securityApi.adminVerify(currentPw);
      if (res.token) setAdminToken(res.token, res.expiresInMs);
      setError('');
      setPw('');
      setPw2('');
      setMode(gateTarget);
      // Keep currentPw populated so it's ready for the backend call
    } catch (err) { setError(err.response?.data?.error || 'Incorrect password'); }
    finally { setLoading(false); }
  };

  const startGated = (target) => {
    setGateTarget(target);
    setMode('gate');
    setCurrentPw('');
    setError('');
  };

  const handleSetup = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { setError('Minimum 8 characters'); return; }
    if (pw !== pw2) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await securityApi.adminSetup(pw);
      if (res.token) setAdminToken(res.token, res.expiresInMs);
      queryClient.invalidateQueries({ queryKey: ['admin-status'] });
      reset();
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleChange = async (e) => {
    e.preventDefault();
    if (pw.length < 8) { setError('New password: minimum 8 characters'); return; }
    if (pw !== pw2) { setError('Passwords do not match'); return; }
    setLoading(true);
    try {
      const res = await securityApi.adminChange(currentPw, pw);
      if (res.token) setAdminToken(res.token, res.expiresInMs);
      queryClient.invalidateQueries({ queryKey: ['admin-status'] });
      reset();
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const handleRemove = async (e) => {
    e.preventDefault();
    // currentPw was already verified in the gate step — reuse it for the actual removal
    if (!currentPw) { setError('Session expired — please try again'); reset(); return; }
    setLoading(true);
    try {
      await securityApi.adminRemove(currentPw);
      clearAdminToken();
      queryClient.invalidateQueries({ queryKey: ['admin-status'] });
      reset();
    } catch (err) { setError(err.response?.data?.error || 'Failed'); }
    finally { setLoading(false); }
  };

  const isSet = status?.isSet;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border dark:border-gray-700 p-4">
      <div className="flex items-center gap-2 mb-3">
        {isSet ? <ShieldCheck size={18} className="text-green-500" /> : <ShieldOff size={18} className="text-gray-400" />}
        <h2 className="text-sm font-semibold">Admin Password</h2>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full ${isSet ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>
          {isSet ? 'Active' : 'Not Set'}
        </span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        {isSet
          ? 'Security-sensitive settings (lab templates, API keys) require admin authentication to change.'
          : 'Set an admin password to protect security-sensitive configuration changes.'}
      </p>

      {!mode && (
        <div className="flex gap-2">
          {!isSet && (
            <button onClick={() => setMode('setup')} className="text-xs px-3 py-1.5 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50">
              Set Password
            </button>
          )}
          {isSet && (
            <>
              <button onClick={() => startGated('change')} className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50">
                Change
              </button>
              <button onClick={() => startGated('remove')} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50">
                Remove
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'gate' && (
        <form onSubmit={handleGate} className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">Verify your admin password to continue.</p>
          <SecurePasswordInput value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Current admin password" autoFocus ringColor="amber" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading || !currentPw} className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">{loading ? 'Verifying...' : 'Verify'}</button>
            <button type="button" onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          </div>
          {error && gateTarget === 'remove' && (
            <div className="pt-2 border-t dark:border-gray-700">
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Locked out? Force-remove works from localhost only.</p>
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  try {
                    await securityApi.adminForceRemove();
                    clearAdminToken();
                    queryClient.invalidateQueries({ queryKey: ['admin-status'] });
                    reset();
                  } catch (err) { setError(err.response?.data?.error || 'Force-remove failed — only works from localhost'); }
                  finally { setLoading(false); }
                }}
                className="text-xs px-3 py-1.5 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
              >
                {loading ? 'Removing...' : 'Force Remove (localhost)'}
              </button>
            </div>
          )}
        </form>
      )}

      {mode === 'setup' && (
        <form onSubmit={handleSetup} className="space-y-2">
          <SecurePasswordInput value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (min 8 chars)" autoFocus ringColor="amber" />
          <SecurePasswordInput value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm password" ringColor="amber" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading || !pw || pw.length < 8 || pw !== pw2} className="text-xs px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">{loading ? 'Setting...' : 'Set Password'}</button>
            <button type="button" onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {mode === 'change' && (
        <form key="change-form" onSubmit={handleChange} className="space-y-2">
          <p className="text-xs text-green-600 dark:text-green-400">Identity verified. Enter new password.</p>
          <SecurePasswordInput value={pw} onChange={e => setPw(e.target.value)} placeholder="New password (min 8 chars)" autoFocus ringColor="blue" />
          <SecurePasswordInput value={pw2} onChange={e => setPw2(e.target.value)} placeholder="Confirm new password" ringColor="blue" />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading || !pw || pw.length < 8 || pw !== pw2} className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">{loading ? 'Changing...' : 'Change Password'}</button>
            <button type="button" onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          </div>
        </form>
      )}

      {mode === 'remove' && (
        <form onSubmit={handleRemove} className="space-y-2">
          <p className="text-xs text-red-500 dark:text-red-400">Identity verified. Click below to remove admin password protection.</p>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={loading} className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">{loading ? 'Removing...' : 'Confirm Remove'}</button>
            <button type="button" onClick={reset} className="text-xs px-3 py-1.5 rounded-lg border dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// Parameters that represent node bounds (floor/ceiling)
const BOUND_KEYS = ['weightCeiling', 'salienceCeiling', 'salienceFloor'];

function detectBoundChanges(oldConfig, newConfig) {
  const bounds = {};
  for (const key of BOUND_KEYS) {
    const oldVal = oldConfig?.resonance?.[key];
    const newVal = newConfig?.resonance?.[key];
    if (newVal !== undefined && newVal !== oldVal) {
      bounds[key] = newVal;
    }
  }
  return Object.keys(bounds).length > 0 ? bounds : null;
}

/**
 * Block in-app React Router navigation when shouldBlock is true.
 * Works with legacy BrowserRouter by monkey-patching the navigator.
 * Uses the provided confirm() function to show a modal dialog.
 */
function useNavigationBlocker(shouldBlock, confirmFn) {
  const { navigator } = useContext(UNSAFE_NavigationContext);

  useEffect(() => {
    if (!shouldBlock) return;

    const origPush = navigator.push;
    const origReplace = navigator.replace;

    navigator.push = async (...args) => {
      const ok = await confirmFn({
        title: 'Unsaved Changes',
        message: 'You have unsaved configuration changes.\n\nLeave without saving?',
        confirmLabel: 'Leave',
        confirmColor: 'bg-amber-600 hover:bg-amber-700',
      });
      if (ok) origPush.apply(navigator, args);
    };
    navigator.replace = async (...args) => {
      const ok = await confirmFn({
        title: 'Unsaved Changes',
        message: 'You have unsaved configuration changes.\n\nLeave without saving?',
        confirmLabel: 'Leave',
        confirmColor: 'bg-amber-600 hover:bg-amber-700',
      });
      if (ok) origReplace.apply(navigator, args);
    };

    return () => {
      navigator.push = origPush;
      navigator.replace = origReplace;
    };
  }, [shouldBlock, navigator, confirmFn]);
}

/** Config page: tunable sections, radar, save, and config assistant. */
export default function Config() {
  useScrollToHash();
  const queryClient = useQueryClient();
  const location = useLocation();
  const pendingSuggestionsApplied = useRef(false);

  const { data: config, isLoading } = useQuery({
    queryKey: ['config'],
    queryFn: configApi.get,
  });

  const [localConfig, setLocalConfig] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [clampOpen, setClampOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [configWarnings, setConfigWarnings] = useState([]);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const changedBoundsRef = useRef(null);
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const { promptAdmin, AdminPasswordEl } = useAdminPassword();

  useEffect(() => {
    if (config && (!localConfig || !hasChanges)) {
      setLocalConfig(config);
    }
  }, [config]);

  // Apply pending suggestions from health check navigation
  useEffect(() => {
    const suggestions = location.state?.pendingSuggestions;
    if (!suggestions?.length || !localConfig || pendingSuggestionsApplied.current) return;
    pendingSuggestionsApplied.current = true;

    setLocalConfig(prev => {
      const patched = { ...prev };
      for (const { configPath, value } of suggestions) {
        if (configPath.length === 2) {
          patched[configPath[0]] = { ...patched[configPath[0]], [configPath[1]]: value };
        } else if (configPath.length === 3) {
          patched[configPath[0]] = {
            ...patched[configPath[0]],
            [configPath[1]]: { ...patched[configPath[0]]?.[configPath[1]], [configPath[2]]: value },
          };
        } else if (configPath.length === 4) {
          const sub = patched[configPath[0]]?.[configPath[1]]?.[configPath[2]] || {};
          patched[configPath[0]] = {
            ...patched[configPath[0]],
            [configPath[1]]: {
              ...patched[configPath[0]]?.[configPath[1]],
              [configPath[2]]: { ...sub, [configPath[3]]: value },
            },
          };
        }
      }
      return patched;
    });
    setHasChanges(true);
    // Clear the location state so refresh doesn't re-apply
    window.history.replaceState({}, '');
  }, [localConfig, location.state]);

  // Block browser close/refresh when unsaved changes exist
  useEffect(() => {
    if (!hasChanges) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  // Block in-app navigation (sidebar links) when unsaved changes exist
  useNavigationBlocker(hasChanges, confirm);

  const updateMutation = useMutation({
    mutationFn: ({ payload, adminToken }) => configApi.update(payload, { adminToken }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['config'] });
      setHasChanges(false);
      // If cross-validation clamped values, patch only those into localConfig
      // Don't wholesale replace — localConfig may use aliases (e.g., 'resonance')
      // that the server response doesn't include
      if (data?.warnings?.length > 0 && data.config) {
        setConfigWarnings(data.warnings);
        setLocalConfig(prev => {
          const patched = { ...prev };
          for (const w of data.warnings) {
            // w.param is a dot-path like 'hallucination.maxVerboseWords'
            const parts = w.param.split('.');
            let target = patched;
            for (let i = 0; i < parts.length - 1; i++) {
              if (target[parts[i]] && typeof target[parts[i]] === 'object') {
                target[parts[i]] = { ...target[parts[i]] };
                target = target[parts[i]];
              } else break;
            }
            target[parts[parts.length - 1]] = w.newValue;
          }
          return patched;
        });
      } else {
        setConfigWarnings([]);
      }
      // Open clamp dialog if floor/ceiling bounds changed
      if (changedBoundsRef.current) {
        setClampOpen(true);
      }
    },
    onError: (err) => {
      // Admin auth required — prompt for password
      if (err?.response?.status === 403 && err?.response?.data?.adminRequired) {
        handleAdminRequired(err.response.data.sensitivePaths || []);
      }
    },
  });

  if (isLoading || !localConfig) {
    return (
      <div className="p-4 md:p-8">
        <div className="text-center text-gray-500">Loading configuration...</div>
      </div>
    );
  }

  const updateParam = (section, key, value) => {
    setLocalConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [key]: value,
      },
    }));
    setHasChanges(true);
  };

  const updateNestedParam = (section, subsection, key, value) => {
    setLocalConfig(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [subsection]: {
          ...prev[section]?.[subsection],
          [key]: value,
        },
      },
    }));
    setHasChanges(true);
  };

  const buildPayload = () => {
    const NON_TUNABLE = new Set([
      'database', 'api', 'services', 'server', 'gui', 'orchestrator',
      'managedServices', 'externalServices', 'partitionServer', 'avatars',
      'feedback', 'tokenLimits',
    ]);
    const payload = {};
    for (const key of Object.keys(localConfig)) {
      if (!NON_TUNABLE.has(key)) payload[key] = localConfig[key];
    }
    return payload;
  };

  const handleSave = async () => {
    // Detect floor/ceiling changes before saving (config still has old values)
    changedBoundsRef.current = detectBoundChanges(config, localConfig);

    const payload = buildPayload();
    const adminToken = getAdminToken();

    try {
      updateMutation.mutate({ payload, adminToken });
    } catch { /* handled by mutation callbacks */ }
  };

  // Handle admin auth rejection — prompt for password and retry
  const handleAdminRequired = async (sensitivePaths) => {
    const token = await promptAdmin(sensitivePaths);
    if (token) {
      const payload = buildPayload();
      updateMutation.mutate({ payload, adminToken: token });
    }
  };

  const handleReset = () => {
    setLocalConfig(config);
    setHasChanges(false);
  };

  const handleAssistantApply = (changes) => {
    for (const { configPath, value } of changes) {
      if (configPath.length === 2) {
        updateParam(configPath[0], configPath[1], value);
      } else if (configPath.length === 3) {
        updateNestedParam(configPath[0], configPath[1], configPath[2], value);
      } else if (configPath.length === 4) {
        const current = localConfig[configPath[0]]?.[configPath[1]]?.[configPath[2]] || {};
        updateNestedParam(configPath[0], configPath[1], configPath[2], { ...current, [configPath[3]]: value });
      }
    }
  };

  return (
    <div className="p-4 md:p-8 pt-0 md:pt-0">
      {/* Sticky header bar */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pt-4 md:pt-8 pb-4 -mx-4 md:-mx-8 px-4 md:px-8 border-b border-transparent transition-colors [&:not(:first-child)]:border-gray-200 dark:[&:not(:first-child)]:border-gray-700" style={{ backdropFilter: 'blur(8px)' }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Configuration</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search settings..."
                className="pl-9 pr-8 py-2 text-sm bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-podbit-500 w-56"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {hasChanges && (
                <button
                  onClick={handleReset}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 dark:text-gray-200"
                >
                  <RotateCcw size={16} />
                  Reset
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!hasChanges || updateMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                <Save size={16} />
                {hasChanges ? 'Save Changes' : 'Saved'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Cross-validation warnings */}
      {configWarnings.length > 0 && (
        <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 rounded-lg">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-2">
                Parameters auto-corrected
              </h3>
              <ul className="text-sm text-amber-700 dark:text-amber-400 space-y-1">
                {configWarnings.map((w, i) => (
                  <li key={i}>
                    <span className="font-mono">{w.param}</span>: {w.oldValue} &rarr; {w.newValue} &mdash; {w.reason}
                  </li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setConfigWarnings([])}
              className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 ml-4 mt-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
        {/* Left Column - Algorithm Parameters */}
        <AlgorithmParameters localConfig={localConfig} updateParam={updateParam} updateNestedParam={updateNestedParam} searchTerm={searchTerm} onSave={handleSave} />

        {/* Right Column */}
        <div className="space-y-6">
          <AdminPasswordCard />
          <SnapshotManagement />
          <ConfigHistory />
        </div>
      </div>

      {ConfirmDialogEl}
      {AdminPasswordEl}

      {/* Clamp dialog — appears after saving when floor/ceiling bounds changed */}
      <ClampDialog
        isOpen={clampOpen}
        onClose={() => {
          setClampOpen(false);
          changedBoundsRef.current = null;
        }}
        changedBounds={changedBoundsRef.current}
      />

      {/* Config Assistant — slide-out chat panel */}
      <ConfigAssistant
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        onApplySuggestions={handleAssistantApply}
        onSave={handleSave}
      />

      {/* Floating "Ask AI" button */}
      {!assistantOpen && (
        <button
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-blue-500 hover:bg-blue-600 text-white shadow-lg hover:shadow-xl transition-all text-sm font-medium"
          title="Open Config Assistant"
        >
          <Sparkles size={16} />
          Ask AI
        </button>
      )}
    </div>
  );
}
