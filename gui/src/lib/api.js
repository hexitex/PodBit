import axios from 'axios';

// =============================================================================
// AUTH STATE
// =============================================================================

// Legacy security key (localhost handshake flow)
let _securityKey = sessionStorage.getItem('podbit-key');

// JWT access token (remote login flow)
let _accessToken = sessionStorage.getItem('podbit-access-token');
let _accessTokenExpiry = parseInt(sessionStorage.getItem('podbit-access-token-expiry') || '0', 10);

// Refresh token (stored in httpOnly cookie by server, but also kept here for non-cookie clients)
let _refreshToken = null;

// Auth mode: 'key' (localhost) or 'jwt' (remote) or null (unknown)
let _authMode = sessionStorage.getItem('podbit-auth-mode') || null;

// Auth event listeners
const _authListeners = [];

/** Subscribe to auth state changes ('login', 'logout', 'expired'). Returns unsubscribe function. */
export function onAuthChange(callback) {
  _authListeners.push(callback);
  return () => {
    const idx = _authListeners.indexOf(callback);
    if (idx >= 0) _authListeners.splice(idx, 1);
  };
}

function emitAuthChange(event, detail = {}) {
  for (const cb of _authListeners) {
    try { cb(event, detail); } catch { /* ignore */ }
  }
}

/** Returns current auth state for UI rendering. */
export function getAuthState() {
  return {
    mode: _authMode,
    authenticated: !!(_securityKey || (_accessToken && Date.now() < _accessTokenExpiry)),
    remoteMode: _authMode === 'jwt',
  };
}

// =============================================================================
// SECURITY KEY (localhost handshake — legacy flow)
// =============================================================================

async function ensureSecurityKey() {
  if (_securityKey) return _securityKey;
  try {
    const res = await fetch('/api/security/handshake');
    if (res.ok) {
      const { key } = await res.json();
      _securityKey = key;
      _authMode = 'key';
      sessionStorage.setItem('podbit-key', key);
      sessionStorage.setItem('podbit-auth-mode', 'key');
      return key;
    }
    // Handshake rejected (non-localhost) — fall through to JWT mode
  } catch { /* server not ready yet */ }
  return null;
}

/** Returns the security key (for SSE URLs where headers cannot be set). */
export async function getSecurityKey() {
  if (_securityKey) return _securityKey;
  return ensureSecurityKey();
}

// =============================================================================
// JWT AUTH (remote login flow)
// =============================================================================

/** Login with password. Returns { accessToken, refreshToken, expiresIn } on success. */
export async function login(password) {
  const res = await api.post('/auth/login', { password });
  const { accessToken, refreshToken, expiresIn } = res.data;
  setAccessToken(accessToken, expiresIn);
  _refreshToken = refreshToken;
  _authMode = 'jwt';
  sessionStorage.setItem('podbit-auth-mode', 'jwt');
  emitAuthChange('login');
  return res.data;
}

/** Refresh the access token using the refresh token (cookie or stored). */
async function refreshAccessToken() {
  try {
    const body = _refreshToken ? { refreshToken: _refreshToken } : {};
    const res = await axios.post('/api/auth/refresh', body, { withCredentials: true });
    const { accessToken, refreshToken, expiresIn } = res.data;
    setAccessToken(accessToken, expiresIn);
    if (refreshToken) _refreshToken = refreshToken;
    return true;
  } catch {
    // Refresh failed — user must re-login
    clearAuth();
    emitAuthChange('expired');
    return false;
  }
}

/** Logout — revoke refresh token and clear all auth state. */
export async function logout() {
  try {
    const body = _refreshToken ? { refreshToken: _refreshToken } : {};
    await axios.post('/api/auth/logout', body, { withCredentials: true });
  } catch { /* best-effort */ }
  clearAuth();
  emitAuthChange('logout');
}

function setAccessToken(token, expiresInSec) {
  _accessToken = token;
  // Refresh 60 seconds before actual expiry to avoid race conditions
  _accessTokenExpiry = Date.now() + (expiresInSec - 60) * 1000;
  sessionStorage.setItem('podbit-access-token', token);
  sessionStorage.setItem('podbit-access-token-expiry', String(_accessTokenExpiry));
}

function clearAuth() {
  _accessToken = null;
  _accessTokenExpiry = 0;
  _refreshToken = null;
  _securityKey = null;
  _authMode = null;
  sessionStorage.removeItem('podbit-access-token');
  sessionStorage.removeItem('podbit-access-token-expiry');
  sessionStorage.removeItem('podbit-key');
  sessionStorage.removeItem('podbit-auth-mode');
}

// =============================================================================
// BOOTSTRAP — determine auth mode on load
// =============================================================================

let _bootstrapPromise = null;

/** Bootstrap auth — try handshake first, fall back to JWT check. */
export async function bootstrapAuth() {
  if (_bootstrapPromise) return _bootstrapPromise;
  _bootstrapPromise = (async () => {
    // If we already have a valid access token, use JWT mode
    if (_accessToken && Date.now() < _accessTokenExpiry) {
      _authMode = 'jwt';
      return { mode: 'jwt', authenticated: true };
    }

    // Try localhost handshake
    const key = await ensureSecurityKey();
    if (key) {
      return { mode: 'key', authenticated: true };
    }

    // No handshake — check if we have a stored access token that might be refreshable
    if (_accessToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        _authMode = 'jwt';
        return { mode: 'jwt', authenticated: true };
      }
    }

    // No auth — needs login
    _authMode = 'jwt'; // Remote mode since handshake failed
    sessionStorage.setItem('podbit-auth-mode', 'jwt');
    return { mode: 'jwt', authenticated: false };
  })();
  return _bootstrapPromise;
}

// Eagerly bootstrap on module load
bootstrapAuth();

// =============================================================================
// AXIOS INSTANCE
// =============================================================================

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Send httpOnly cookies (refresh token)
  paramsSerializer: (params) => {
    const parts = [];
    for (const [key, val] of Object.entries(params)) {
      if (val === undefined || val === null) continue;
      if (Array.isArray(val)) {
        val.forEach((v) => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`));
      } else {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
      }
    }
    return parts.join('&');
  },
});

// =============================================================================
// REQUEST INTERCEPTOR — inject auth credentials
// =============================================================================

api.interceptors.request.use(async (config) => {
  // JWT mode: use Bearer token
  if (_authMode === 'jwt' && _accessToken) {
    // Proactively refresh if token is about to expire
    if (Date.now() >= _accessTokenExpiry && !config.url?.startsWith('/auth/')) {
      await refreshAccessToken();
    }
    if (_accessToken) {
      config.headers['Authorization'] = `Bearer ${_accessToken}`;
    }
    return config;
  }

  // Legacy key mode: use X-Podbit-Key
  if (_securityKey) {
    config.headers['x-podbit-key'] = _securityKey;
    return config;
  }

  // No auth yet — try bootstrap
  await bootstrapAuth();
  if (_accessToken) {
    config.headers['Authorization'] = `Bearer ${_accessToken}`;
  } else if (_securityKey) {
    config.headers['x-podbit-key'] = _securityKey;
  }
  return config;
});

// =============================================================================
// RESPONSE INTERCEPTOR — handle token expiry
// =============================================================================

let _isRefreshing = false;
let _refreshQueue = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Only handle 401 with TOKEN_EXPIRED code for JWT mode
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'TOKEN_EXPIRED' &&
      _authMode === 'jwt' &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      // If already refreshing, queue this request
      if (_isRefreshing) {
        return new Promise((resolve, reject) => {
          _refreshQueue.push({ resolve, reject });
        }).then(() => {
          originalRequest.headers['Authorization'] = `Bearer ${_accessToken}`;
          return api(originalRequest);
        });
      }

      _isRefreshing = true;
      const success = await refreshAccessToken();
      _isRefreshing = false;

      if (success) {
        // Retry queued requests
        for (const { resolve } of _refreshQueue) resolve();
        _refreshQueue = [];

        originalRequest.headers['Authorization'] = `Bearer ${_accessToken}`;
        return api(originalRequest);
      } else {
        // Refresh failed — reject all queued requests
        for (const { reject } of _refreshQueue) reject(error);
        _refreshQueue = [];
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

// Orchestrator API (separate server for service management)
const orchestratorApi = axios.create({
  // VITE_ORCHESTRATOR_PORT is injected by gui/vite.config.js from .env (or config/port-defaults.json
  // as fallback). It is ALWAYS defined at build time — see vite.config.js `define` block.
  baseURL: `http://${window.location.hostname}:${import.meta.env.VITE_ORCHESTRATOR_PORT}`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Graph API
export const resonance = {
  getNodes: (params) => api.get('/resonance/nodes', { params }).then((r) => r.data),
  getNode: (id) => api.get(`/resonance/nodes/${id}`).then((r) => r.data),
  getResolvedContent: (id) => api.get(`/resonance/nodes/${id}/resolved`).then((r) => r.data),
  getLineage: (id, depth = 2) =>
    api.get(`/resonance/nodes/${id}/lineage`, { params: { depth } }).then((r) => r.data),
  createNode: (data) => api.post('/resonance/nodes', data).then((r) => r.data),
  voiceNode: (id, data) => api.post(`/resonance/nodes/${id}/voice`, data).then((r) => r.data),
  promoteNode: (id, data) => api.post(`/resonance/nodes/${id}/promote`, data).then((r) => r.data),
  demoteNode: (id, data) => api.post(`/resonance/nodes/${id}/demote`, data).then((r) => r.data),
  updateDomain: (id, domain) => api.put(`/resonance/nodes/${id}/domain`, { domain }).then((r) => r.data),
  editContent: (id, { content, contributor = 'gui:user', reason } = {}) =>
    api.put(`/resonance/nodes/${id}/content`, { content, contributor, reason }).then((r) => r.data),
  setExcluded: (id, { excluded, contributor = 'gui:user', reason } = {}) =>
    api.put(`/resonance/nodes/${id}/excluded`, { excluded, contributor, reason }).then((r) => r.data),
  removeNode: (id, mode = 'junk', reason) =>
    api.delete(`/resonance/nodes/${id}`, { data: { mode, reason } }).then((r) => r.data),
  getStats: (params) => api.get('/resonance/stats', { params }).then((r) => r.data),
  getGraph: (params) => api.get('/resonance/graph', { params }).then((r) => r.data),
  getKeywords: () => api.get('/resonance/keywords').then((r) => r.data),
  getNodeNames: (ids) => api.post('/resonance/nodes/names', { ids }).then((r) => r.data),
};

// Synthesis Engine API
export const synthesis = {
  start: (params) => api.post('/synthesis/start', params).then((r) => r.data),
  stop: () => api.post('/synthesis/stop').then((r) => r.data),
  status: () => api.get('/synthesis/status').then((r) => r.data),
  discoveries: () => api.get('/synthesis/discoveries').then((r) => r.data),
  clearDiscovery: (nodeAId, nodeBId) =>
    api.post('/synthesis/discoveries/clear', { nodeAId, nodeBId }).then((r) => r.data),
  history: (limit = 20) => api.get('/synthesis/history', { params: { limit } }).then((r) => r.data),
};

// Lab Verification API
export const evm = {
  stats: (days = 7) => api.get('/lab/stats', { params: { days } }).then((r) => r.data),
  recent: (params) => api.get('/lab/recent', { params }).then((r) => r.data),
  history: (nodeId, { full = false } = {}) => api.get(`/lab/history/${nodeId}`, { params: full ? { full: 'true' } : {} }).then((r) => r.data),
  verify: (nodeId, guidance) => api.post(`/lab/verify/${nodeId}`, guidance ? { guidance } : {}, { timeout: 300000 }).then((r) => r.data),
  analyse: (nodeId) => api.post(`/lab/analyse/${nodeId}`, {}, { timeout: 300000 }).then((r) => r.data),
  suggest: (nodeId) => api.post(`/lab/suggest/${nodeId}`, {}, { timeout: 120000 }).then((r) => r.data),
  dismiss: (nodeId) => api.post(`/lab/dismiss/${nodeId}`).then((r) => r.data),
  reviews: (params) => api.get('/lab/reviews', { params }).then((r) => r.data),
  approveReview: (nodeId, approved, reviewer = 'human') =>
    api.post(`/lab/review/${nodeId}`, { approved, reviewer }).then((r) => r.data),
  reevaluate: (options = {}) =>
    api.post('/lab/reevaluate', options).then((r) => r.data),
  reevaluateReviews: (options = {}) =>
    api.post('/lab/reevaluate-reviews', options).then((r) => r.data),
  reevalReviewsProgress: () =>
    api.get('/lab/reevaluate-reviews/progress').then((r) => r.data),
  reevalReviewsReset: () =>
    api.post('/lab/reevaluate-reviews/reset').then((r) => r.data),
  prune: (options = {}) =>
    api.post('/lab/prune', options).then((r) => r.data),
  decompose: (nodeId) =>
    api.post(`/lab/decompose/${nodeId}`, {}, { timeout: 300000 }).then((r) => r.data),
  decomposeApply: (nodeId, facts, questions) =>
    api.post(`/lab/decompose/${nodeId}/apply`, { facts, questions }).then((r) => r.data),
  parents: (nodeId) => api.get(`/lab/parents/${nodeId}`).then((r) => r.data),
  bulkReview: (nodeIds, approved, reviewer = 'human') =>
    api.post('/lab/review/bulk', { nodeIds, approved, reviewer }).then((r) => r.data),
  queue: (params) => api.get('/lab/queue', { params }).then((r) => r.data),
  queueStats: () => api.get('/lab/queue/stats').then((r) => r.data),
  cancelQueue: (id) => api.delete(`/lab/queue/${id}`).then((r) => r.data),
  enqueue: (nodeId, opts = {}) => api.post(`/lab/queue/${nodeId}`, { priority: opts.priority, guidance: opts.guidance, queuedBy: 'manual' }).then((r) => r.data),
};

// Elite Pool API
export const elite = {
  stats: () => api.get('/elite/stats').then((r) => r.data),
  coverage: () => api.get('/elite/coverage').then((r) => r.data),
  gaps: () => api.get('/elite/gaps').then((r) => r.data),
  candidates: (limit = 10) => api.get('/elite/candidates', { params: { limit } }).then((r) => r.data),
  nodes: (params) => api.get('/elite/nodes', { params }).then((r) => r.data),
  terminals: () => api.get('/elite/terminals').then((r) => r.data),
  rescan: (limit = 50) => api.post('/elite/rescan', { limit }, { timeout: 300000 }).then((r) => r.data),
};

// API Verification Registry
export const apiRegistry = {
  list:           ()           => api.get('/api-registry').then((r) => r.data),
  get:            (id)         => api.get(`/api-registry/${id}`).then((r) => r.data),
  create:         (data)       => api.post('/api-registry', data).then((r) => r.data),
  update:         (id, data)   => api.put(`/api-registry/${id}`, data).then((r) => r.data),
  remove:         (id)         => api.delete(`/api-registry/${id}`).then((r) => r.data),
  enable:         (id)         => api.post(`/api-registry/${id}/enable`).then((r) => r.data),
  disable:        (id)         => api.post(`/api-registry/${id}/disable`).then((r) => r.data),
  test:           (id)         => api.post(`/api-registry/${id}/test`, {}, { timeout: 60000 }).then((r) => r.data),
  testClaim:      (id, claim)  => api.post(`/api-registry/${id}/test-claim`, { claim }, { timeout: 120000 }).then((r) => r.data),
  testEnrichment: (id, claim, domain) => api.post(`/api-registry/${id}/test-enrichment`, { claim, domain }, { timeout: 120000 }).then((r) => r.data),
  promptHistory:  (id)         => api.get(`/api-registry/${id}/prompt-history`).then((r) => r.data),
  stats:          (days)       => api.get('/api-registry/stats', { params: days ? { days } : {} }).then((r) => r.data),
  verifications:  (params)     => api.get('/api-registry/verifications', { params }).then((r) => r.data),
  // Onboarding interview
  startOnboard:   (name)       => api.post('/api-registry/onboard', { name }).then((r) => r.data),
  continueOnboard: (interviewId, response) => api.post('/api-registry/onboard', { interviewId, response }).then((r) => r.data),
};

// Autonomous Cycles API
export const cycles = {
  status: () => api.get('/cycles/status').then((r) => r.data),
  start: (type, params) => api.post(`/cycles/${type}/start`, params).then((r) => r.data),
  stop: (type) => api.post(`/cycles/${type}/stop`).then((r) => r.data),
};

// Docs API
export const docs = {
  decompose: (request, taskType, options) =>
    api.post('/docs/decompose', { request, taskType, options }).then((r) => r.data),
  generate: (request, taskType, options) =>
    api.post('/docs/generate', { request, taskType, options }).then((r) => r.data),
  templates: () => api.get('/docs/templates').then((r) => r.data),
  jobs: (status) =>
    api.get('/docs/jobs', { params: status ? { status } : {} }).then((r) => r.data),
  getJob: (jobId) => api.get(`/docs/jobs/${jobId}`).then((r) => r.data),
  resume: (jobId, options) =>
    api.post(`/docs/resume/${jobId}`, { options }).then((r) => r.data),
  deleteJob: (jobId) =>
    api.delete(`/docs/jobs/${jobId}`).then((r) => r.data),
};

// Config API
export const configApi = {
  get: () => api.get('/config').then((r) => r.data),
  update: (updates, { adminToken } = {}) => {
    const headers = adminToken ? { 'x-admin-token': adminToken } : {};
    return api.put('/config', updates, { headers }).then((r) => r.data);
  },
  tune: (sectionId, request, tier) =>
    api.post('/config/tune', { sectionId, request, tier }).then((r) => r.data),
  generatePatterns: (request, count = 10, tier) =>
    api.post('/config/tune/generate-patterns', { request, count, tier }).then((r) => r.data),
  generateIntentPatterns: (request, intentType, count = 5, tier) =>
    api.post('/config/tune/generate-intent-patterns', { request, intentType, count, tier }).then((r) => r.data),
  generateWords: (listType, listDescription, existing, request, count = 10, tier) =>
    api.post('/config/tune/generate-words', { listType, listDescription, existing, request, count, tier }).then((r) => r.data),
  sections: () => api.get('/config/sections').then((r) => r.data),
  getDefaults: (sectionId) => api.get(`/config/defaults/${sectionId}`).then((r) => r.data),
  history: (days = 7, limit = 30, project) =>
    api.get('/config/history', { params: { days, limit, ...(project ? { project } : {}) } }).then((r) => r.data),
  snapshots: ({ allProjects, project } = {}) =>
    api.get('/config/snapshots', { params: { ...(allProjects ? { allProjects: 'true' } : {}), ...(project ? { project } : {}) } }).then((r) => r.data),
  saveSnapshot: (label) =>
    api.post('/config/snapshots', { label, contributor: 'human' }).then((r) => r.data),
  restoreSnapshot: (snapshotId) =>
    api.post(`/config/snapshots/${snapshotId}/restore`, { contributor: 'human' }).then((r) => r.data),
  metrics: (days = 7) =>
    api.get('/config/metrics', { params: { days } }).then((r) => r.data),
  criticalAnalysis: () =>
    api.post('/config/critical-analysis', {}, { timeout: 120000 }).then((r) => r.data),
  clampNodes: (params) =>
    api.post('/config/clamp-nodes', params).then((r) => r.data),
  // Dedup gate overrides
  getDedupGates: () => api.get('/config/dedup-gates').then((r) => r.data),
  saveDedupGate: (source, overrides) =>
    api.put(`/config/dedup-gates/${encodeURIComponent(source)}`, overrides).then((r) => r.data),
  deleteDedupGate: (source) =>
    api.delete(`/config/dedup-gates/${encodeURIComponent(source)}`).then((r) => r.data),
  // Config Assistant
  assistDiagnostic: () => api.get('/config/assist/diagnostic').then((r) => r.data),
  assist: (message, conversationId) =>
    api.post('/config/assist', { message, conversationId }, { timeout: 120000 }).then((r) => r.data),
  assistInterview: (answers) =>
    api.post('/config/assist/interview', { answers }).then((r) => r.data),
};

// Models API
export const models = {
  health: () => api.get('/models/health').then((r) => r.data),
  cost: (params = {}) => {
    const query = new URLSearchParams();
    if (params.days) query.set('days', params.days);
    if (params.subsystem) query.set('subsystem', params.subsystem);
    if (params.model) query.set('model', params.model);
    const qs = query.toString();
    return api.get(`/models/cost${qs ? '?' + qs : ''}`).then((r) => r.data);
  },
  costTimeSeries: (params = {}) => {
    const query = new URLSearchParams();
    if (params.granularity) query.set('granularity', params.granularity);
    if (params.days) query.set('days', params.days);
    if (params.subsystem) query.set('subsystem', params.subsystem);
    if (params.model) query.set('model', params.model);
    const qs = query.toString();
    return api.get(`/models/cost/timeseries${qs ? '?' + qs : ''}`).then((r) => r.data);
  },
  costDetails: (params = {}) => {
    const query = new URLSearchParams();
    if (params.days) query.set('days', params.days);
    if (params.subsystem) query.set('subsystem', params.subsystem);
    if (params.model) query.set('model', params.model);
    if (params.limit) query.set('limit', params.limit);
    if (params.offset) query.set('offset', params.offset);
    const qs = query.toString();
    return api.get(`/models/cost/details${qs ? '?' + qs : ''}`).then((r) => r.data);
  },
  costExportUrl: (params = {}) => {
    const query = new URLSearchParams();
    if (params.days) query.set('days', params.days);
    if (params.subsystem) query.set('subsystem', params.subsystem);
    if (params.model) query.set('model', params.model);
    const qs = query.toString();
    return `/api/models/cost/export${qs ? '?' + qs : ''}`;
  },
  resetCost: () => api.post('/models/cost/reset').then((r) => r.data),
  available: () => api.get('/models/available').then((r) => r.data),
  config: () => api.get('/models/config').then((r) => r.data),
  setModel: (models, provider) => api.put('/models/config', { models, provider }).then((r) => r.data),

  // Registry
  registry: () => api.get('/models/registry').then((r) => r.data),
  registerModel: (data) => api.post('/models/registry', data).then((r) => r.data),
  updateModel: (id, data) => api.put(`/models/registry/${id}`, data).then((r) => r.data),
  deleteModel: (id) => api.delete(`/models/registry/${id}`).then((r) => r.data),
  testModel: (id) => api.post(`/models/registry/${id}/health`).then((r) => r.data),

  // Subsystem Assignments
  assignments: () => api.get('/models/assignments').then((r) => r.data),
  setAssignment: (subsystem, modelId, { resetParams = false } = {}) =>
    api.put(`/models/assignments/${subsystem}`, { modelId, resetParams }).then((r) => r.data),
  setSubsystemNoThink: (subsystem, noThink) =>
    api.put(`/models/assignments/${subsystem}`, { noThink }).then((r) => r.data),
  setSubsystemThinking: (subsystem, thinkingLevel) =>
    api.put(`/models/assignments/${subsystem}`, { thinkingLevel }).then((r) => r.data),
  setConsultant: (subsystem, modelId) =>
    api.put(`/models/assignments/${subsystem}/consultant`, { modelId }).then((r) => r.data),

  // Proxy Settings
  proxySettings: () => api.get('/models/proxy-settings').then((r) => r.data),
  updateProxySettings: (settings) =>
    api.put('/models/proxy-settings', settings).then((r) => r.data),

  // Image Reader Settings
  imageSettings: () => api.get('/models/image-settings').then((r) => r.data),
  updateImageSettings: (settings) =>
    api.put('/models/image-settings', settings).then((r) => r.data),

  // Chat Settings
  chatSettings: () => api.get('/models/chat-settings').then((r) => r.data),
  updateChatSettings: (settings) =>
    api.put('/models/chat-settings', settings).then((r) => r.data),

  // API Keys
  apiKeys: () => api.get('/models/api-keys').then((r) => r.data),
  setApiKeys: (keys) => api.put('/models/api-keys', keys).then((r) => r.data),

  // Conversational Logging
  convLogging: () => api.get('/models/conv-logging').then((r) => r.data),
  setConvLogging: (enabled) => api.put('/models/conv-logging', { enabled }).then((r) => r.data),

  // Auto-Tune
  autotuneStart: (config) => api.post('/models/autotune/start', config).then((r) => r.data),
  autotuneCancel: () => api.post('/models/autotune/cancel').then((r) => r.data),
  autotuneProgress: () => api.get('/models/autotune/progress').then((r) => r.data),
  autotuneApply: (changes) => api.post('/models/autotune/apply', { changes }).then((r) => r.data),
  autotuneReset: () => api.post('/models/autotune/reset').then((r) => r.data),
};

// Partitions API
export const partitions = {
  list: () => api.get('/partitions').then((r) => r.data),
  get: (id) => api.get(`/partitions/${encodeURIComponent(id)}`).then((r) => r.data),
  create: (data) => api.post('/partitions', data).then((r) => r.data),
  update: (id, data) => api.put(`/partitions/${encodeURIComponent(id)}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/partitions/${encodeURIComponent(id)}`).then((r) => r.data),
  addDomain: (id, domain) => api.post(`/partitions/${encodeURIComponent(id)}/domains`, { domain }).then((r) => r.data),
  removeDomain: (id, domain) => api.delete(`/partitions/${encodeURIComponent(id)}/domains/${encodeURIComponent(domain)}`).then((r) => r.data),
  renameDomain: (oldDomain, newDomain) =>
    api.put(`/partitions/domains/${encodeURIComponent(oldDomain)}/rename`, { newDomain }).then((r) => r.data),
  // Export / Import
  exportPartition: (id, owner) => api.get(`/partitions/${encodeURIComponent(id)}/export`, { params: { owner } }).then((r) => r.data),
  importPartition: (data, overwrite = false) => api.post(`/partitions/import${overwrite ? '?overwrite=true' : ''}`, data).then((r) => r.data),
  // Transient
  importTransient: (data) => api.post('/partitions/transient/import', data).then((r) => r.data),
  approveTransient: (id, bridgeTo) => api.post(`/partitions/${encodeURIComponent(id)}/approve`, { bridgeTo }).then((r) => r.data),
  departTransient: (id, reason) => api.post(`/partitions/${encodeURIComponent(id)}/depart`, { reason }).then((r) => r.data),
  visitHistory: (id) => api.get(`/partitions/${encodeURIComponent(id)}/visits`).then((r) => r.data),
  // Bridges
  listBridges: () => api.get('/partitions/bridges').then((r) => r.data),
  createBridge: (partitionA, partitionB) =>
    api.post('/partitions/bridges', { partitionA, partitionB }).then((r) => r.data),
  deleteBridge: (partitionA, partitionB) =>
    api.delete('/partitions/bridges', { data: { partitionA, partitionB } }).then((r) => r.data),
};

// Partition Pool Server API
const poolApiBase = axios.create({
  baseURL: import.meta.env.VITE_POOL_URL || 'http://localhost:3002',
  headers: { 'Content-Type': 'application/json' },
});

export const pool = {
  health: () => poolApiBase.get('/health').then((r) => r.data),
  list: () => poolApiBase.get('/pool').then((r) => r.data),
  get: (id) => poolApiBase.get(`/pool/${encodeURIComponent(id)}`).then((r) => r.data),
  add: (exportData) => poolApiBase.post('/pool', exportData).then((r) => r.data),
  remove: (id) => poolApiBase.delete(`/pool/${encodeURIComponent(id)}`).then((r) => r.data),
  recruit: (id, params) =>
    poolApiBase.post(`/pool/${encodeURIComponent(id)}/recruit`, params).then((r) => r.data),
  recruitments: (params) => poolApiBase.get('/recruitments', { params }).then((r) => r.data),
  recruitment: (id) => poolApiBase.get(`/recruitments/${encodeURIComponent(id)}`).then((r) => r.data),
  projects: () => poolApiBase.get('/projects').then((r) => r.data),
  dashboard: () => poolApiBase.get('/pool/dashboard').then((r) => r.data),
  history: (id) => poolApiBase.get(`/pool/${encodeURIComponent(id)}/history`).then((r) => r.data),
  config: () => poolApiBase.get('/pool/config').then((r) => r.data),
  verify: (id) => poolApiBase.post(`/pool/${encodeURIComponent(id)}/verify`).then((r) => r.data),
};

// Seeds API
export const seeds = {
  create: (content, domain, contributor) =>
    api.post('/seeds', { content, domain, contributor }).then((r) => r.data),
  createBatch: (seeds) =>
    api.post('/seeds/batch', { seeds }).then((r) => r.data),
  list: (params) => api.get('/seeds', { params }).then((r) => r.data),
  domains: () => api.get('/seeds/domains').then((r) => r.data),
  archiveDomain: (domain) => api.delete(`/seeds/domain/${domain}`).then((r) => r.data),
};

// Services API (connects to orchestrator)
export const services = {
  status: () => orchestratorApi.get('/services').then((r) => r.data),
  start: (id) => orchestratorApi.post(`/services/${id}/start`).then((r) => r.data),
  stop: (id) => orchestratorApi.post(`/services/${id}/stop`).then((r) => r.data),
  restart: (id) => orchestratorApi.post(`/services/${id}/restart`).then((r) => r.data),
  startAll: () => orchestratorApi.post('/services/start-all').then((r) => r.data),
  stopAll: () => orchestratorApi.post('/services/stop-all').then((r) => r.data),
  shutdown: () => orchestratorApi.post('/shutdown').then((r) => r.data),
  orchestratorStatus: () => orchestratorApi.get('/status').then((r) => r.data),
  health: () => orchestratorApi.get('/health').then((r) => r.data),
};

// Chat Conversations API
export const conversations = {
  list: () => api.get('/chat/conversations').then((r) => r.data),
  create: (data = {}) => api.post('/chat/conversations', data).then((r) => r.data),
  get: (id) => api.get(`/chat/conversations/${id}`).then((r) => r.data),
  update: (id, data) => api.put(`/chat/conversations/${id}`, data).then((r) => r.data),
  delete: (id) => api.delete(`/chat/conversations/${id}`).then((r) => r.data),
  sendMessage: (id, message, options = {}) =>
    api.post(`/chat/conversations/${id}/messages`, { message, ...options }, { timeout: 300000 }).then((r) => r.data),
};

// Context Engine API
export const context = {
  prepare: (message, sessionId, options = {}) =>
    api.post('/context/prepare', { message, sessionId, ...options }).then((r) => r.data),
  update: (sessionId, message) =>
    api.post('/context/update', { sessionId, message }).then((r) => r.data),
  getSession: (id) => api.get(`/context/session/${id}`).then((r) => r.data),
  listSessions: () => api.get('/context/sessions').then((r) => r.data),
  deleteSession: (id) => api.delete(`/context/session/${id}`).then((r) => r.data),
  budgets: () => api.get('/context/budgets').then((r) => r.data),
  insights: () => api.get('/context/insights').then((r) => r.data),
  clearInsights: () => api.delete('/context/insights').then((r) => r.data),
  aggregate: () => api.get('/context/aggregate').then((r) => r.data),
  metrics: (sessionId) => api.get(`/context/metrics/${sessionId}`).then((r) => r.data),
};

// Decisions / Tier Provenance API
export const decisions = {
  forEntity: (entityType, entityId, params) =>
    api.get(`/decisions/${entityType}/${entityId}`, { params }).then((r) => r.data),
  list: (params) => api.get('/decisions', { params }).then((r) => r.data),
};

// Feedback API
export const feedback = {
  // Rate a node (1=useful, 0=not useful, -1=harmful)
  rate: (nodeId, rating, options = {}) =>
    api.post(`/nodes/${nodeId}/feedback`, { rating, ...options }).then((r) => r.data),
  // Get feedback history for a node
  getNodeFeedback: (nodeId) =>
    api.get(`/nodes/${nodeId}/feedback`).then((r) => r.data),
  // Get aggregated feedback stats
  stats: (params = {}) =>
    api.get('/feedback/stats', { params }).then((r) => r.data),
  // Get nodes without feedback
  unrated: (params = {}) =>
    api.get('/feedback/unrated', { params }).then((r) => r.data),
};

// Knowledge Base API
export const knowledgeBase = {
  folders: () => api.get('/kb/folders').then((r) => r.data),
  addFolder: (data) => api.post('/kb/folders', data).then((r) => r.data),
  updateFolder: (id, data) => api.put(`/kb/folders/${id}`, data).then((r) => r.data),
  removeFolder: (id, deleteNodes = false) =>
    api.delete(`/kb/folders/${id}`, { params: { deleteNodes } }).then((r) => r.data),
  scan: (folderId) => api.post(`/kb/folders/${folderId}/scan`).then((r) => r.data),
  reprocessFolder: (folderId) => api.post(`/kb/folders/${folderId}/reprocess`).then((r) => r.data),
  startWatch: (folderId) => api.post(`/kb/folders/${folderId}/watch/start`).then((r) => r.data),
  stopWatch: (folderId) => api.post(`/kb/folders/${folderId}/watch/stop`).then((r) => r.data),
  files: (params = {}) => api.get('/kb/files', { params }).then((r) => r.data),
  file: (id) => api.get(`/kb/files/${id}`).then((r) => r.data),
  reprocess: (fileId) => api.post(`/kb/files/${fileId}/reprocess`).then((r) => r.data),
  retryFailed: (folderId) => api.post('/kb/files/retry-failed', { folderId }).then((r) => r.data),
  status: () => api.get('/kb/status').then((r) => r.data),
  readers: () => api.get('/kb/readers').then((r) => r.data),
  stats: () => api.get('/kb/stats').then((r) => r.data),
  stop: () => api.post('/kb/stop').then((r) => r.data),
  defaults: () => api.get('/kb/defaults').then((r) => r.data),
  updateDefaults: (data) => api.put('/kb/defaults', data).then((r) => r.data),
  mapExtension: (extension, readerName) => api.post('/kb/extensions/map', { extension, readerName }).then((r) => r.data),
  unmapExtension: (extension) => api.delete(`/kb/extensions/${extension}`).then((r) => r.data),
  browseFolder: () => api.post('/kb/browse-folder').then((r) => r.data),
  openPath: (filePath) => api.post('/kb/open-path', { filePath }).then((r) => r.data),
  // SMB
  smbConnections: () => api.get('/kb/smb/connections').then((r) => r.data),
  smbConnect: (opts) => api.post('/kb/smb/connect', opts).then((r) => r.data),
  smbTest: (opts) => api.post('/kb/smb/test', opts).then((r) => r.data),
  smbDisconnect: (host, share) => api.post('/kb/smb/disconnect', { host, share }).then((r) => r.data),
};

// Breakthrough Registry API
export const breakthroughRegistry = {
  list: (params = {}) =>
    api.get('/breakthroughs', { params }).then((r) => r.data),
  stats: (params = {}) =>
    api.get('/breakthroughs/stats', { params }).then((r) => r.data),
  updateScores: (id, scores) =>
    api.patch(`/breakthroughs/${id}/scores`, scores).then((r) => r.data),
  getDocumentation: (id) =>
    api.get(`/breakthroughs/${id}/documentation`).then((r) => r.data),
  rebuildDocumentation: (id) =>
    api.post(`/breakthroughs/${id}/rebuild-documentation`).then((r) => r.data),
};

// Prompts API
export const prompts = {
  list: (locale, category) =>
    api.get('/prompts', { params: { locale, category } }).then((r) => r.data),
  get: (id, locale) =>
    api.get(`/prompts/${id}`, { params: { locale } }).then((r) => r.data),
  save: (id, locale, content, description) =>
    api.put(`/prompts/${id}`, { locale, content, description }).then((r) => r.data),
  revert: (id, locale) =>
    api.delete(`/prompts/${id}`, { params: { locale } }).then((r) => r.data),
  preview: (id, locale, variables) =>
    api.post('/prompts/preview', { id, locale, variables }).then((r) => r.data),
  goldStandards: (id) =>
    api.get(`/prompts/${id}/gold-standards`).then((r) => r.data),
  goldStandardsList: () =>
    api.get('/prompts/gold-standards').then((r) => r.data),
  generateGoldStandards: (id) =>
    api.post(`/prompts/${id}/gold-standards/generate`).then((r) => r.data),
  updateGoldStandard: (promptId, gsId, updates) =>
    api.put(`/prompts/${promptId}/gold-standards/${gsId}`, updates).then((r) => r.data),
  deleteGoldStandards: (id) =>
    api.delete(`/prompts/${id}/gold-standards`).then((r) => r.data),
  backupInfo: () =>
    api.get('/prompts/backup').then((r) => r.data),
  backup: () =>
    api.post('/prompts/backup').then((r) => r.data),
  restore: () =>
    api.post('/prompts/restore').then((r) => r.data),
};

// Server health (root endpoint, not under /api)
export const server = {
  health: () => fetch('/health').then((r) => r.json()),
};

// Database Management API (dangerous operations)
export const database = {
  info: () => api.get('/database/info').then((r) => r.data),
  stats: () => api.get('/database/stats').then((r) => r.data),
  // Clear by category
  clearNodesByType: (type) =>
    api.delete(`/database/nodes/type/${type}`, { data: { confirm: 'DELETE' } }).then((r) => r.data),
  clearNodesByDomain: (domain) =>
    api.delete(`/database/nodes/domain/${domain}`, { data: { confirm: 'DELETE' } }).then((r) => r.data),
  clearAllNodes: () =>
    api.delete('/database/nodes', { data: { confirm: 'DELETE_ALL_NODES' } }).then((r) => r.data),
  clearPatterns: () =>
    api.delete('/database/patterns', { data: { confirm: 'DELETE' } }).then((r) => r.data),
  clearTemplates: () =>
    api.delete('/database/templates', { data: { confirm: 'DELETE' } }).then((r) => r.data),
  clearDocJobs: () =>
    api.delete('/database/doc-jobs', { data: { confirm: 'DELETE' } }).then((r) => r.data),
  clearKnowledgeCache: () =>
    api.delete('/database/knowledge-cache', { data: { confirm: 'DELETE' } }).then((r) => r.data),
  clearDecisions: () =>
    api.delete('/database/decisions', { data: { confirm: 'DELETE' } }).then((r) => r.data),
  clearEverything: () =>
    api.delete('/database/all', { data: { confirm: 'DELETE_EVERYTHING' } }).then((r) => r.data),
  embeddingStatus: () =>
    api.get('/database/embeddings/status').then((r) => r.data),
  // Backup & restore
  listBackups: () =>
    api.get('/database/backups').then((r) => r.data),
  createBackup: (label) =>
    api.post('/database/backup', { label }).then((r) => r.data),
  restoreBackup: (filename) =>
    api.post('/database/restore', { filename, confirm: 'RESTORE' }).then((r) => r.data),
  // Projects
  listProjects: () =>
    api.get('/database/projects').then((r) => r.data),
  saveProject: (name, description) =>
    api.post('/database/projects/save', { name, description }).then((r) => r.data),
  loadProject: (name) =>
    api.post('/database/projects/load', { name, confirm: 'LOAD_PROJECT' }).then((r) => r.data),
  newProject: (name, description) =>
    api.post('/database/projects/new', { name, description, confirm: 'NEW_PROJECT' }).then((r) => r.data),
  deleteProject: (name) =>
    api.delete(`/database/projects/${name}`, { data: { confirm: 'DELETE_PROJECT' } }).then((r) => r.data),
  updateProject: (name, updates) =>
    api.put(`/database/projects/${name}`, updates).then((r) => r.data),
  // Interview-based project creation
  startInterview: (name, description) =>
    api.post('/database/projects/interview', { name, description }).then((r) => r.data),
  continueInterview: (interviewId, response) =>
    api.post('/database/projects/interview', { interviewId, response }).then((r) => r.data),
  getManifest: () =>
    api.get('/database/projects/manifest').then((r) => r.data),
  updateManifest: (manifest) =>
    api.put('/database/projects/manifest', manifest).then((r) => r.data),
  // Number variables
  listNumberVariables: (params = {}) =>
    api.get('/database/number-variables', { params }).then((r) => r.data),
  resolveNumberVariables: (varIds) =>
    api.post('/database/number-variables/resolve', { varIds }).then((r) => r.data),
  editNumberVariable: (varId, updates) =>
    api.put(`/database/number-variables/${varId}`, updates).then((r) => r.data),
  deleteNumberVariable: (varId) =>
    api.delete(`/database/number-variables/${varId}`).then((r) => r.data),
  backfillNumberVariables: () =>
    api.post('/database/number-variables/backfill').then((r) => r.data),
};

export const journal = {
  timeline: (params = {}) =>
    api.get('/journal/timeline', { params }).then((r) => r.data),
  entries: (params = {}) =>
    api.get('/journal/entries', { params }).then((r) => r.data),
  stats: () =>
    api.get('/journal/stats').then((r) => r.data),
  createMarker: (data) =>
    api.post('/journal/marker', data).then((r) => r.data),
  pin: (nodeIds, pinGroup) =>
    api.post('/journal/pin', { nodeIds, pinGroup }).then((r) => r.data),
  listPins: (group) =>
    api.get(`/journal/pins/${group}`).then((r) => r.data),
  removePins: (group) =>
    api.delete(`/journal/pins/${group}`).then((r) => r.data),
  preview: (targetTimestamp) =>
    api.post('/journal/preview', { targetTimestamp }).then((r) => r.data),
  rollback: (targetTimestamp, pinGroup) =>
    api.post('/journal/rollback', { targetTimestamp, pinGroup, confirm: true }).then((r) => r.data),
  prune: (olderThan) =>
    api.delete('/journal/prune', { params: { olderThan } }).then((r) => r.data),
};

export const activity = {
  recent: (limit = 100) =>
    api.get('/activity/recent', { params: { limit } }).then((r) => r.data),
  log: (params) => api.get('/activity/log', { params }).then((r) => r.data),
  categories: (params) => api.get('/activity/categories', { params }).then((r) => r.data),
};

// Embedding Eval Calibration API
export const embeddingEval = {
  stats: (days = 7, mode) => api.get('/embedding-eval/stats', { params: { days, mode } }).then((r) => r.data),
  node: (nodeId) => api.get(`/embedding-eval/node/${nodeId}`).then((r) => r.data),
  report: (days = 7) => api.get('/embedding-eval/report', { params: { days } }).then((r) => r.data),
};

export const budget = {
  status: () => api.get('/budget/status').then((r) => r.data),
  config: () => api.get('/budget/config').then((r) => r.data),
  updateConfig: (config) => api.put('/budget/config', config).then((r) => r.data),
  resume: () => api.post('/budget/resume').then((r) => r.data),
};

// Security / Admin API
export const security = {
  adminStatus: () => api.get('/security/admin/status').then((r) => r.data),
  adminSetup: (password) => api.post('/security/admin/setup', { password }).then((r) => r.data),
  adminVerify: (password) => api.post('/security/admin/verify', { password }).then((r) => r.data),
  adminChange: (currentPassword, newPassword) =>
    api.post('/security/admin/change', { currentPassword, newPassword }).then((r) => r.data),
  adminRemove: (password) => api.post('/security/admin/remove', { password }).then((r) => r.data),
  adminForceRemove: () => api.post('/security/admin/remove', { force: true }).then((r) => r.data),
};

// Admin token — cached in memory after verification
let _adminToken = null;
let _adminTokenExpiry = 0;

/** Returns the current admin JWT if valid and not expired; otherwise null. */
export function getAdminToken() {
  if (_adminToken && Date.now() < _adminTokenExpiry) return _adminToken;
  _adminToken = null;
  return null;
}

/** Caches admin JWT in memory with optional expiry (default 15 min). */
export function setAdminToken(token, expiresInMs) {
  _adminToken = token;
  _adminTokenExpiry = Date.now() + (expiresInMs || 15 * 60 * 1000);
}

/** Clears the cached admin token (e.g. on logout). */
export function clearAdminToken() {
  _adminToken = null;
  _adminTokenExpiry = 0;
}

// Lab Registry API
export const labRegistry = {
  list:           ()           => api.get('/lab-registry').then((r) => r.data),
  get:            (id)         => api.get(`/lab-registry/${id}`).then((r) => r.data),
  register:       (data)       => api.post('/lab-registry', data).then((r) => r.data),
  update:         (id, data)   => api.put(`/lab-registry/${id}`, data).then((r) => r.data),
  remove:         (id)         => api.delete(`/lab-registry/${id}`).then((r) => r.data),
  enable:         (id)         => api.post(`/lab-registry/${id}/enable`).then((r) => r.data),
  disable:        (id)         => api.post(`/lab-registry/${id}/disable`).then((r) => r.data),
  checkHealth:    (id)         => api.post(`/lab-registry/${id}/health`, {}, { timeout: 15000 }).then((r) => r.data),
  capabilities:   (id)         => api.get(`/lab-registry/${id}/capabilities`).then((r) => r.data),
  stats:          ()           => api.get('/lab-registry/stats').then((r) => r.data),
};

export default api;
