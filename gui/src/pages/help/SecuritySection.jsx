/** Help section: security, authentication, TLS, and remote access. */

function AuthFlowDiagram() {
  return (
    <svg viewBox="0 0 860 340" className="w-full mx-auto" role="img" aria-label="Authentication flow diagram">
      <defs>
        <marker id="arrowSec" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
        <marker id="arrowSecG" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
        </marker>
        <marker id="arrowSecR" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
        </marker>
      </defs>

      {/* Title */}
      <text x="430" y="20" textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" style={{ fontSize: '11px', fontWeight: 600 }}>Authentication Flow (Remote Mode)</text>

      {/* Browser */}
      <rect x="10" y="40" width="140" height="55" rx="8" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="80" y="63" textAnchor="middle" className="fill-gray-700 dark:fill-gray-300 text-xs font-semibold">Browser / Client</text>
      <text x="80" y="80" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">GUI or API consumer</text>

      {/* Arrow: Browser -> Login */}
      <path d="M 150 67 L 230 67" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowSec)" />
      <text x="190" y="60" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">password</text>

      {/* Login endpoint */}
      <rect x="235" y="40" width="180" height="55" rx="8" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5" className="dark:fill-amber-900/30 dark:stroke-amber-500" />
      <text x="325" y="60" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-xs font-semibold">POST /auth/login</text>
      <text x="325" y="76" textAnchor="middle" className="fill-amber-500 dark:fill-amber-400 text-xs">Rate limited (5 / 15min)</text>

      {/* Arrow: Login -> JWT */}
      <path d="M 415 67 L 510 67" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrowSecG)" />

      {/* JWT tokens */}
      <rect x="515" y="35" width="200" height="65" rx="8" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.5" className="dark:fill-emerald-900/30 dark:stroke-emerald-500" />
      <text x="615" y="55" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">JWT Access Token (15min)</text>
      <text x="615" y="72" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">+ Refresh Token (7 days)</text>
      <text x="615" y="88" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">httpOnly cookie + body</text>

      {/* Arrow: Browser -> API with JWT */}
      <path d="M 80 95 L 80 160 L 230 160" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowSec)" />
      <text x="155" y="152" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">Bearer JWT</text>

      {/* API Server */}
      <rect x="235" y="130" width="180" height="55" rx="8" fill="#eff6ff" stroke="#3b82f6" strokeWidth="1.5" className="dark:fill-blue-900/30 dark:stroke-blue-500" />
      <text x="325" y="153" textAnchor="middle" className="fill-blue-700 dark:fill-blue-300 text-xs font-semibold">API Server (:4710)</text>
      <text x="325" y="170" textAnchor="middle" className="fill-blue-400 dark:fill-blue-500 text-xs">requireKey middleware</text>

      {/* Arrow: API -> Verify */}
      <path d="M 415 160 L 510 160" fill="none" stroke="#3b82f6" strokeWidth="1.5" markerEnd="url(#arrowSec)" />
      <text x="462" y="152" textAnchor="middle" className="fill-blue-400 dark:fill-blue-500 text-xs">verify</text>

      {/* Verify box */}
      <rect x="515" y="130" width="200" height="55" rx="8" fill="#f5f3ff" stroke="#8b5cf6" strokeWidth="1.5" className="dark:fill-violet-900/30 dark:stroke-violet-500" />
      <text x="615" y="150" textAnchor="middle" className="fill-violet-700 dark:fill-violet-300 text-xs font-semibold">HMAC-SHA256 Verify</text>
      <text x="615" y="167" textAnchor="middle" className="fill-violet-500 dark:fill-violet-400 text-xs">Security key = JWT secret</text>

      {/* Token expired flow */}
      <path d="M 325 185 L 325 240" fill="none" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arrowSecR)" />
      <text x="345" y="218" className="fill-red-400 dark:fill-red-500 text-xs">expired?</text>

      {/* Refresh endpoint */}
      <rect x="235" y="245" width="180" height="55" rx="8" fill="#fff1f2" stroke="#f43f5e" strokeWidth="1.5" className="dark:fill-rose-900/30 dark:stroke-rose-500" />
      <text x="325" y="268" textAnchor="middle" className="fill-rose-700 dark:fill-rose-300 text-xs font-semibold">POST /auth/refresh</text>
      <text x="325" y="284" textAnchor="middle" className="fill-rose-500 dark:fill-rose-400 text-xs">Rotate refresh token</text>

      {/* Arrow: Refresh -> New tokens */}
      <path d="M 415 272 L 510 272" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrowSecG)" />

      {/* New tokens */}
      <rect x="515" y="245" width="200" height="55" rx="8" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.5" className="dark:fill-emerald-900/30 dark:stroke-emerald-500" />
      <text x="615" y="265" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-xs font-semibold">New Access + Refresh</text>
      <text x="615" y="282" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">Old refresh revoked</text>

      {/* Step numbers */}
      <circle cx="190" cy="67" r="9" fill="#f59e0b" opacity="0.2" stroke="#f59e0b" strokeWidth="1" />
      <text x="190" y="71" textAnchor="middle" className="fill-amber-600 dark:fill-amber-400" style={{ fontSize: '9px', fontWeight: 700 }}>1</text>
      <circle cx="462" cy="67" r="9" fill="#10b981" opacity="0.2" stroke="#10b981" strokeWidth="1" />
      <text x="462" y="71" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400" style={{ fontSize: '9px', fontWeight: 700 }}>2</text>
      <circle cx="155" cy="160" r="9" fill="#3b82f6" opacity="0.2" stroke="#3b82f6" strokeWidth="1" />
      <text x="155" y="164" textAnchor="middle" className="fill-blue-600 dark:fill-blue-400" style={{ fontSize: '9px', fontWeight: 700 }}>3</text>
      <circle cx="345" cy="218" r="9" fill="#ef4444" opacity="0.2" stroke="#ef4444" strokeWidth="1" />
      <text x="345" y="222" textAnchor="middle" className="fill-red-600 dark:fill-red-400" style={{ fontSize: '9px', fontWeight: 700 }}>4</text>
    </svg>
  );
}

function SecuritySection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Security & Remote Access</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit has a layered security system designed for both <strong>localhost</strong> (zero-friction development)
          and <strong>remote access</strong> (network-exposed server with full authentication). When running locally,
          security is transparent. When exposed to a network, JWT authentication, TLS, CORS lockdown, rate limiting,
          and security headers activate automatically. See the{' '}
          <a href="#doc-installation" className="docs-link-internal" data-doc="installation">Installation & Setup</a> page
          for how to get Podbit running.
        </p>
      </div>

      {/* Two Modes */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
          <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Localhost Mode (Default)</h3>
          <ul className="text-xs text-emerald-600 dark:text-emerald-400 space-y-1.5 list-disc list-inside">
            <li>Server binds to <code className="bg-emerald-100 dark:bg-emerald-900/30 px-1 rounded">127.0.0.1</code></li>
            <li>GUI authenticates via automatic key handshake</li>
            <li>No password required, no login screen</li>
            <li>Proxy accepts all requests without auth</li>
            <li>CORS allows all origins</li>
          </ul>
          <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-2">
            This is the default experience. Nothing to configure.
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Remote Mode</h3>
          <ul className="text-xs text-amber-600 dark:text-amber-400 space-y-1.5 list-disc list-inside">
            <li>Server binds to <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">0.0.0.0</code> (set <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">HOST=0.0.0.0</code>)</li>
            <li>JWT authentication required for all API requests</li>
            <li>Admin password must be set on first access</li>
            <li>Proxy requires security key or JWT bearer token</li>
            <li>CORS locked to same-origin (or configured origins)</li>
            <li>Security headers enforced (HSTS when TLS active)</li>
          </ul>
          <p className="text-xs text-amber-500 dark:text-amber-400 mt-2">
            Activates when <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">HOST</code> is not <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">127.0.0.1</code> or <code className="bg-amber-100 dark:bg-amber-900/30 px-1 rounded">localhost</code>.
          </p>
        </div>
      </div>

      {/* Auth Flow Diagram */}
      <AuthFlowDiagram />

      {/* JWT Authentication */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">JWT Authentication</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Remote mode uses <strong>JWT access tokens</strong> (HMAC-SHA256) signed with the security key. Zero external
          auth dependencies  -  built entirely on Node.js <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">crypto</code>.
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs mb-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Access Token</div>
            <ul className="text-gray-500 dark:text-gray-400 space-y-1 list-disc list-inside">
              <li>15-minute TTL</li>
              <li>Sent as <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Authorization: Bearer &lt;token&gt;</code></li>
              <li>Stored in sessionStorage (browser)</li>
              <li>HMAC-SHA256 signature, base64url encoding</li>
            </ul>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
            <div className="font-semibold text-gray-700 dark:text-gray-300 mb-1">Refresh Token</div>
            <ul className="text-gray-500 dark:text-gray-400 space-y-1 list-disc list-inside">
              <li>7-day TTL</li>
              <li>Delivered as httpOnly cookie (XSS-resistant)</li>
              <li>SHA-256 hash stored in DB (not the raw token)</li>
              <li>Family-based rotation with theft detection</li>
            </ul>
          </div>
        </div>
        <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg p-3">
          <h4 className="font-semibold text-violet-700 dark:text-violet-300 text-xs mb-1">Refresh Token Theft Detection</h4>
          <p className="text-xs text-violet-600 dark:text-violet-400">
            Each refresh token belongs to a <strong>family</strong> (per RFC 6749 &sect;10.4). When a token is refreshed,
            the old one is revoked and a new one issued in the same family. If a revoked token is ever reused
            (indicating theft), the entire family is revoked  -  forcing re-login on all sessions from that family.
          </p>
        </div>
      </div>

      {/* Admin Password */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Admin Password Setup</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          On first access in remote mode, the GUI prompts you to set an admin password. The password is hashed
          with <strong>scrypt</strong> (N=16384, r=8, p=1) and stored in the system database.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Endpoint</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Purpose</th>
                <th className="py-1.5 font-medium text-gray-600 dark:text-gray-400">Auth Required</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['GET /api/admin/status', 'Check if password is set + remote mode', 'No'],
                ['POST /api/admin/setup', 'Set initial password (first time only)', 'No (rate limited)'],
                ['POST /auth/login', 'Authenticate with password, get JWT + refresh', 'No (rate limited)'],
                ['POST /auth/refresh', 'Exchange refresh token for new token pair', 'No (cookie-based)'],
                ['POST /auth/logout', 'Revoke refresh token', 'No'],
                ['POST /api/admin/change-password', 'Change password (revokes all sessions)', 'Yes (JWT)'],
                ['POST /api/admin/regenerate-key', 'Regenerate security key (revokes all sessions)', 'Yes (JWT)'],
              ].map(([endpoint, purpose, auth]) => (
                <tr key={endpoint} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{endpoint}</td>
                  <td className="py-1.5 pr-3 text-gray-500 dark:text-gray-400">{purpose}</td>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">{auth}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Proxy Authentication */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Proxy Authentication</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-3">
          In remote mode, the knowledge proxy requires authentication for non-localhost requests. This is
          designed for OpenAI-compatible API consumers  -  use the Podbit security key as the API key.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Python (OpenAI SDK)</span>
            </div>
            <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`from openai import OpenAI

client = OpenAI(
    base_url="https://your-server:11435/v1",
    api_key="your-podbit-security-key"  # from /api/admin/key
)`}</code></pre>
          </div>
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">cURL</span>
            </div>
            <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`# Option 1: Bearer token (OpenAI-compatible)
curl https://your-server:11435/v1/chat/completions \\
  -H "Authorization: Bearer YOUR_SECURITY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "default", "messages": [{"role": "user", "content": "Hello"}]}'

# Option 2: X-Podbit-Key header
curl https://your-server:11435/v1/chat/completions \\
  -H "X-Podbit-Key: YOUR_SECURITY_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "default", "messages": [{"role": "user", "content": "Hello"}]}'`}</code></pre>
          </div>
        </div>
        <p className="text-xs text-orange-500 dark:text-orange-400 mt-2">
          Localhost requests to the proxy are always allowed without auth (backward compatible).
          JWT bearer tokens are also accepted as an alternative to the security key.
        </p>
      </div>

      {/* TLS */}
      <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
        <h3 className="font-semibold text-blue-700 dark:text-blue-300 text-sm mb-2">TLS (HTTPS)</h3>
        <p className="text-xs text-blue-600 dark:text-blue-400 mb-3">
          Set two environment variables to enable TLS on both the API server and knowledge proxy.
          Without TLS, passwords and tokens travel in plaintext  -  <strong>strongly recommended for remote access</strong>.
        </p>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden mb-3">
          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Environment Variables</span>
          </div>
          <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`PODBIT_TLS_CERT=data/tls/podbit.cert
PODBIT_TLS_KEY=data/tls/podbit.key`}</code></pre>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden mb-3">
          <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
            <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Generate Self-Signed Certificate</span>
          </div>
          <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`# Built-in generator (EC P-256, 365 days)
npm run generate-cert

# Or with a custom hostname
npm run generate-cert -- your-hostname.local

# Output:
#   data/tls/podbit.key   (private key)
#   data/tls/podbit.cert  (self-signed certificate)`}</code></pre>
        </div>
        <p className="text-xs text-blue-500 dark:text-blue-400">
          The certificate generator uses EC P-256 keys (faster TLS handshakes than RSA). For production,
          use a real certificate from Let's Encrypt or your organization's CA.
          When TLS is active, <strong>HSTS headers</strong> are automatically added to all responses.
        </p>
      </div>

      {/* Rate Limiting */}
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">Rate Limiting</h3>
        <p className="text-xs text-red-600 dark:text-red-400 mb-2">
          Authentication endpoints are protected by a sliding-window rate limiter to prevent brute-force attacks.
        </p>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-red-100 dark:border-red-700">
            <p className="font-medium text-red-700 dark:text-red-300">Window</p>
            <p className="text-red-500 dark:text-red-400">15 minutes</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-red-100 dark:border-red-700">
            <p className="font-medium text-red-700 dark:text-red-300">Max Attempts</p>
            <p className="text-red-500 dark:text-red-400">5 per IP</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-red-100 dark:border-red-700">
            <p className="font-medium text-red-700 dark:text-red-300">Protected Endpoints</p>
            <p className="text-red-500 dark:text-red-400">/auth/login, /api/admin/setup, /api/admin/verify</p>
          </div>
        </div>
        <p className="text-xs text-red-500 dark:text-red-400 mt-2">
          Returns <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">429 Too Many Requests</code> with
          a <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">Retry-After</code> header when exceeded.
        </p>
      </div>

      {/* CORS */}
      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">CORS Policy</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-3">
          Cross-Origin Resource Sharing is automatically configured based on the server mode.
        </p>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-indigo-100 dark:border-indigo-700">
            <p className="font-medium text-indigo-700 dark:text-indigo-300">Localhost</p>
            <p className="text-indigo-500 dark:text-indigo-400">All origins allowed (<code className="bg-indigo-100 dark:bg-indigo-900/30 px-1 rounded">*</code>)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-indigo-100 dark:border-indigo-700">
            <p className="font-medium text-indigo-700 dark:text-indigo-300">Remote (default)</p>
            <p className="text-indigo-500 dark:text-indigo-400">Same-origin only (returns the request origin if it matches the server)</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-indigo-100 dark:border-indigo-700">
            <p className="font-medium text-indigo-700 dark:text-indigo-300">Remote (configured)</p>
            <p className="text-indigo-500 dark:text-indigo-400">Specific origins via <code className="bg-indigo-100 dark:bg-indigo-900/30 px-1 rounded">PODBIT_CORS_ORIGINS</code></p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden mt-3">
          <pre className="p-3 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto"><code>{`# Allow specific origins (comma-separated)
PODBIT_CORS_ORIGINS=https://my-app.example.com,https://other.example.com`}</code></pre>
        </div>
      </div>

      {/* Database Encryption */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Database Encryption</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Podbit optionally supports SQLite encryption at rest using{' '}
          <a href="https://github.com/m4heshd/better-sqlite3-multiple-ciphers" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 underline">
            better-sqlite3-multiple-ciphers
          </a>{' '}
          (SQLCipher). When enabled, all database files (system, project, and pool) are encrypted with a symmetric key.
        </p>

        <div className="space-y-2 mb-3">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">1. Install the encrypted SQLite package</div>
            <pre className="text-xs text-gray-600 dark:text-gray-400"><code>npm install better-sqlite3-multiple-ciphers</code></pre>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">2. Set the encryption key in .env</div>
            <pre className="text-xs text-gray-600 dark:text-gray-400"><code>PODBIT_DB_KEY=your-secret-key-here</code></pre>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <div className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">3. Or use the setup wizard</div>
            <pre className="text-xs text-gray-600 dark:text-gray-400"><code>npm run setup</code></pre>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">The wizard installs the package, generates a random key, and writes it to .env.</p>
          </div>
        </div>

        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2">
          <p className="text-xs text-red-700 dark:text-red-300 font-medium">Important</p>
          <ul className="text-xs text-red-600 dark:text-red-400 list-disc list-inside mt-1 space-y-0.5">
            <li>Back up your encryption key — without it, databases are <strong>unrecoverable</strong></li>
            <li>Encryption applies to new databases immediately; existing databases must be re-created</li>
            <li>The key is stored in <code className="bg-red-100 dark:bg-red-900/30 px-1 rounded">.env</code> — keep this file secure</li>
            <li>Without the encrypted package installed, the key pragma is silently ignored (no encryption)</li>
          </ul>
        </div>
      </div>

      {/* Security Headers */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Security Headers</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          All responses include standard security headers to mitigate common web vulnerabilities.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Header</th>
                <th className="py-1.5 font-medium text-gray-600 dark:text-gray-400">Value</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['X-Content-Type-Options', 'nosniff'],
                ['X-Frame-Options', 'DENY'],
                ['Referrer-Policy', 'strict-origin-when-cross-origin'],
                ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
                ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains (TLS only)'],
              ].map(([header, value]) => (
                <tr key={header} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{header}</td>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Setup Guide */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Remote Access Quick Setup</h3>
        <ol className="text-xs text-sky-600 dark:text-sky-400 space-y-2 list-decimal list-inside">
          <li>
            <strong>Bind to network:</strong> Set <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">HOST=0.0.0.0</code> in
            your <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">.env</code> file
          </li>
          <li>
            <strong>Generate TLS certificate:</strong>{' '}
            <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">npm run generate-cert -- your-hostname</code>
          </li>
          <li>
            <strong>Set TLS env vars:</strong>{' '}
            <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">PODBIT_TLS_CERT=data/tls/podbit.cert</code> and{' '}
            <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">PODBIT_TLS_KEY=data/tls/podbit.key</code>
          </li>
          <li>
            <strong>Start the server:</strong> <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">npm start</code>  -  you'll see startup warnings if anything is missing
          </li>
          <li>
            <strong>Open the GUI:</strong> Navigate to <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">https://your-hostname:4710</code> and set your admin password on first visit
          </li>
          <li>
            <strong>Configure proxy clients:</strong> Use your security key (from Settings) as the API key for
            OpenAI-compatible clients pointing at <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">https://your-hostname:11435/v1</code>
          </li>
        </ol>
      </div>

      {/* Startup Safety Checks */}
      <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-700 dark:text-yellow-300 text-sm mb-2">Startup Safety Checks</h3>
        <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-2">
          When running in remote mode, the server prints warnings at startup for common security misconfigurations:
        </p>
        <ul className="text-xs text-yellow-600 dark:text-yellow-400 space-y-1.5 list-disc list-inside">
          <li><strong>No admin password set</strong>  -  anyone can access the server without authentication until a password is configured</li>
          <li><strong>No TLS configured</strong>  -  passwords and tokens travel in plaintext over the network</li>
        </ul>
        <p className="text-xs text-yellow-500 dark:text-yellow-400 mt-2">
          These are warnings only  -  the server will start regardless. Fix them before exposing to untrusted networks.
        </p>
      </div>

      {/* Implementation Details */}
      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Implementation Notes</h3>
        <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5 list-disc list-inside">
          <li><strong>Zero auth dependencies</strong>  -  JWT signing, token hashing, and password hashing all use Node.js built-in <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">crypto</code> module (except <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">cookie-parser</code> for httpOnly cookie handling)</li>
          <li><strong>Refresh tokens in DB</strong>  -  stored as SHA-256 hashes in <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">system.db</code>, so a database compromise doesn't leak raw tokens</li>
          <li><strong>Periodic cleanup</strong>  -  expired refresh tokens are automatically purged every 6 hours</li>
          <li><strong>Password changes</strong>  -  changing the admin password or regenerating the security key revokes all active refresh tokens, forcing re-login everywhere</li>
          <li><strong>GUI auto-refresh</strong>  -  the GUI client automatically refreshes expired access tokens using the httpOnly refresh cookie, with concurrent request queuing to avoid token races</li>
        </ul>
      </div>
    </div>
  );
}

export default SecuritySection;
