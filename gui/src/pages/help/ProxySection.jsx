import { Link } from 'react-router-dom';

function ProxyFlowDiagram() {
  return (
    <svg viewBox="0 0 860 300" className="w-full mx-auto" role="img" aria-label="Knowledge proxy request flow">
      <defs>
        <marker id="arrow7" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
        <marker id="arrow7g" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
        </marker>
      </defs>

      {/* ── Row 1: Request flow ── */}
      {/* Client */}
      <rect x="10" y="20" width="150" height="55" rx="8" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="85" y="43" textAnchor="middle" className="fill-gray-700 dark:fill-gray-300 text-xs font-semibold">Client App</text>
      <text x="85" y="60" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">IDE / Script / Agent</text>

      {/* Arrow: Client -> Proxy */}
      <path d="M 160 47 L 240 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow7)" />
      <text x="200" y="40" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">request</text>

      {/* Proxy */}
      <rect x="245" y="15" width="200" height="65" rx="8" fill="#fff7ed" stroke="#f97316" strokeWidth="1.5" className="dark:fill-orange-900/30 dark:stroke-orange-500" />
      <text x="345" y="36" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400 text-xs font-semibold">Knowledge Proxy</text>
      <text x="345" y="52" textAnchor="middle" className="fill-orange-400 dark:fill-orange-500 text-xs">:11435</text>
      <text x="345" y="66" textAnchor="middle" className="fill-orange-400 dark:fill-orange-500 text-xs">Intercept + Enrich + Forward</text>

      {/* Arrow: Proxy -> LLM */}
      <path d="M 445 47 L 555 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow7)" />
      <text x="500" y="40" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">enriched</text>

      {/* LLM */}
      <rect x="560" y="20" width="175" height="55" rx="8" fill="#fffbeb" stroke="#f59e0b" strokeWidth="1.5" className="dark:fill-amber-900/30 dark:stroke-amber-500" />
      <text x="648" y="43" textAnchor="middle" className="fill-amber-600 dark:fill-amber-400 text-xs font-semibold">LLM Endpoint</text>
      <text x="648" y="60" textAnchor="middle" className="fill-amber-400 dark:fill-amber-500 text-xs">Model Registry</text>

      {/* ── Row 2: Knowledge enrichment ── */}
      {/* Arrow: Proxy -> Context Engine */}
      <path d="M 345 80 L 345 115" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrow7g)" />
      <text x="365" y="103" className="fill-emerald-500 dark:fill-emerald-400 text-xs">prepare()</text>

      {/* Context Engine */}
      <rect x="245" y="120" width="200" height="55" rx="8" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.5" className="dark:fill-emerald-900/30 dark:stroke-emerald-500" />
      <text x="345" y="143" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs font-semibold">Context Engine</text>
      <text x="345" y="160" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-500 text-xs">Select + Inject Knowledge</text>

      {/* Arrow: Context Engine -> Knowledge Graph */}
      <path d="M 445 147 L 555 147" fill="none" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#arrow7)" />

      {/* Knowledge Graph */}
      <rect x="560" y="120" width="175" height="55" rx="8" fill="#f0f9ff" stroke="#38bdf8" strokeWidth="1.5" className="dark:fill-sky-900/30 dark:stroke-sky-500" />
      <text x="648" y="143" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs font-semibold">Knowledge Graph</text>
      <text x="648" y="160" textAnchor="middle" className="fill-sky-400 dark:fill-sky-500 text-xs">Nodes + Embeddings</text>

      {/* ── Row 3: Response flow ── */}
      {/* Arrow: LLM -> Response */}
      <path d="M 648 75 L 648 205" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" />

      {/* Arrow: Context Engine -> update (dashed) */}
      <path d="M 345 175 L 345 205" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow7g)" />
      <text x="365" y="195" className="fill-emerald-500 dark:fill-emerald-400 text-xs">update()</text>

      {/* Response box */}
      <rect x="205" y="210" width="300" height="45" rx="8" fill="#fafafa" stroke="#d4d4d8" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-600" />
      <text x="355" y="228" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">OpenAI-compatible response</text>
      <text x="355" y="244" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">usage data + tool_calls + SSE streaming</text>

      {/* Arrow: Response -> Client */}
      <path d="M 205 232 L 160 232" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow7)" />

      {/* Client return */}
      <rect x="10" y="210" width="150" height="45" rx="8" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="85" y="228" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">Response</text>
      <text x="85" y="244" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">to Client</text>

      {/* Step numbers */}
      <circle cx="200" cy="47" r="9" fill="#f97316" opacity="0.2" stroke="#f97316" strokeWidth="1" />
      <text x="200" y="51" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400" style={{ fontSize: '9px', fontWeight: 700 }}>1</text>
      <circle cx="345" cy="103" r="9" fill="#10b981" opacity="0.2" stroke="#10b981" strokeWidth="1" />
      <text x="345" y="107" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400" style={{ fontSize: '9px', fontWeight: 700 }}>2</text>
      <circle cx="500" cy="47" r="9" fill="#f59e0b" opacity="0.2" stroke="#f59e0b" strokeWidth="1" />
      <text x="500" y="51" textAnchor="middle" className="fill-amber-600 dark:fill-amber-400" style={{ fontSize: '9px', fontWeight: 700 }}>3</text>
      <circle cx="648" cy="195" r="9" fill="#94a3b8" opacity="0.2" stroke="#94a3b8" strokeWidth="1" />
      <text x="648" y="199" textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" style={{ fontSize: '9px', fontWeight: 700 }}>4</text>
    </svg>
  );
}

const proxyParams = [
  { name: 'messages', supported: true, notes: 'Required. Enriched with knowledge context.' },
  { name: 'model', supported: true, notes: 'Resolved via model registry (name, ID, tier).' },
  { name: 'temperature', supported: true, notes: 'Default 0.7.' },
  { name: 'max_tokens', supported: true, notes: 'Default from config.' },
  { name: 'top_p', supported: true, notes: 'Forwarded to LLM.' },
  { name: 'frequency_penalty', supported: true, notes: 'Forwarded to LLM.' },
  { name: 'presence_penalty', supported: true, notes: 'Forwarded to LLM.' },
  { name: 'stop', supported: true, notes: 'String or array of stop sequences.' },
  { name: 'response_format', supported: true, notes: 'JSON mode. Forwarded to LLM.' },
  { name: 'tools / tool_choice', supported: true, notes: 'Function calling. Forwarded to LLM.' },
  { name: 'n', supported: true, notes: 'Multiple completions. All choices returned.' },
  { name: 'seed', supported: true, notes: 'Reproducibility. Forwarded to LLM.' },
  { name: 'logprobs / top_logprobs', supported: true, notes: 'Log probabilities. Forwarded to LLM.' },
  { name: 'user', supported: true, notes: 'Used for session resolution.' },
  { name: 'stream', supported: true, notes: 'SSE streaming. Proxy fetches non-streaming from upstream, converts to Server-Sent Events format.' },
];

/** Help section: knowledge proxy and OpenAI-compatible endpoint. */
function ProxySection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Knowledge Proxy</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The knowledge proxy is an <strong>OpenAI-compatible endpoint</strong> that enriches any LLM request with
          knowledge graph context. Point any application that speaks the OpenAI-compatible API at{' '}
          <code className="bg-orange-50 dark:bg-orange-900/30 px-1.5 py-0.5 rounded text-orange-700 dark:text-orange-300 text-sm">http://localhost:11435/v1</code>{' '}
          and every request is automatically enriched with relevant knowledge before being forwarded to your configured LLM.
        </p>
      </div>

      <ProxyFlowDiagram />

      {/* Supported Parameters */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Supported OpenAI-Compatible Parameters</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          All standard chat completion parameters are forwarded to the LLM. Only parameters explicitly sent by the client are included in the
          upstream request, so providers that don't support certain parameters won't receive them.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Parameter</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400 w-16">Status</th>
                <th className="py-1.5 font-medium text-gray-600 dark:text-gray-400">Notes</th>
              </tr>
            </thead>
            <tbody>
              {proxyParams.map(p => (
                <tr key={p.name} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{p.name}</td>
                  <td className="py-1.5 pr-3">
                    {p.supported
                      ? <span className="text-emerald-600 dark:text-emerald-400 font-medium">Yes</span>
                      : <span className="text-red-500 dark:text-red-400 font-medium">No</span>
                    }
                  </td>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">{p.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Start */}
      <div>
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Quick Start</h3>
        <div className="grid grid-cols-1 gap-4">
          {/* Python */}
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Python (OpenAI SDK)</span>
            </div>
            <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:11435/v1",
    api_key="not-needed"
)

response = client.chat.completions.create(
    model="default",
    messages=[{"role": "user", "content": "What patterns exist?"}],
    temperature=0.7
)
print(response.choices[0].message.content)`}</code></pre>
          </div>

          {/* IDE Config */}
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Continue.dev / Cursor / IDE Agents</span>
            </div>
            <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`// In your IDE's model configuration:
{
  "models": [{
    "title": "Podbit Enriched",
    "provider": "openai",
    "model": "default",
    "apiBase": "http://localhost:11435/v1",
    "apiKey": "not-needed"
  }]
}

// For Cursor: Settings > Models > Add Model
// Provider: OpenAI Compatible
// Base URL: http://localhost:11435/v1
// API Key: not-needed`}</code></pre>
          </div>

          {/* cURL */}
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2 border-b dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">cURL</span>
            </div>
            <pre className="p-4 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto leading-relaxed"><code>{`curl http://localhost:11435/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "default",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`}</code></pre>
          </div>
        </div>
      </div>

      {/* Session Management */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Session Management</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Sessions map stateless OpenAI-compatible requests to stateful context engine sessions. The context engine accumulates
          topics, tracks knowledge utilization, and learns which nodes are most useful across turns.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-3">
            <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Priority 1: X-Session-Id Header</div>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Pass <code className="bg-orange-100 dark:bg-orange-900/30 px-1 rounded">X-Session-Id: my-session</code> for explicit session control.
              Best for stateful multi-turn conversations.
            </p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-3">
            <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Priority 2: User Field</div>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              The <code className="bg-orange-100 dark:bg-orange-900/30 px-1 rounded">user</code> field in the request body maps to a session per user.
            </p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-3">
            <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Priority 3: System Message Hash</div>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              If no header or user, sessions group by the SHA-256 hash of the first system message content.
            </p>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-3">
            <div className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">Priority 4: Random UUID</div>
            <p className="text-xs text-orange-600 dark:text-orange-400">
              Fallback: each request gets a unique session. No cross-turn learning.
            </p>
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-2">All session IDs are prefixed with <code>proxy:</code> for namespace isolation from MCP/GUI sessions.</p>
      </div>

      {/* Model Resolution */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Model Resolution</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          The <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">model</code> field is resolved against the model registry in this order:
        </p>
        <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
          <li>Exact match by <strong>modelId</strong> (e.g., <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">llama-3.2-3b</code>)</li>
          <li>Case-insensitive match by <strong>display name</strong></li>
          <li>Match by <strong>registry ID</strong></li>
          <li>Fallback: <strong>chat subsystem assignment</strong> (configured on the Models page)</li>
          <li>Last resort: first enabled model in the registry</li>
        </ol>
        <p className="text-xs text-gray-400 mt-2">Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">"default"</code> or omit the model field to use the chat subsystem's assigned model.</p>
      </div>

      {/* Knowledge Enrichment */}
      <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
        <h3 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">How Knowledge Enrichment Works</h3>
        <ol className="text-xs text-emerald-600 dark:text-emerald-400 space-y-1.5 list-decimal list-inside">
          <li>The proxy extracts the last user message from the conversation</li>
          <li>The <Link to="/help/context" className="font-semibold underline decoration-emerald-300 hover:text-emerald-800 dark:hover:text-emerald-200">context engine's</Link> <code className="bg-emerald-100 dark:bg-emerald-900/30 px-1 rounded">prepare()</code> selects relevant knowledge nodes using embedding similarity, topic matching, and session history</li>
          <li>Selected knowledge is formatted into a structured system prompt section</li>
          <li>The knowledge prompt is <strong>appended</strong> to the client's existing system message (never replaces it)</li>
          <li>After the LLM responds, <code className="bg-emerald-100 dark:bg-emerald-900/30 px-1 rounded">update()</code> runs asynchronously to track which knowledge was actually referenced</li>
        </ol>
        <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-2">
          If the context engine fails for any reason, the request proceeds without enrichment. The proxy is never less reliable than a direct LLM call.
        </p>
      </div>

      {/* Telegraphic Compression */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Telegraphic Compression</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          Converts natural English into dense telegram-style notation, fitting more knowledge into limited context windows.
          Enable on the <strong>Models page → Proxy Settings</strong>.
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-2 border border-purple-100 dark:border-purple-700">
            <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Rule-Based Mode</div>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Static word lists remove articles, copulas, and filler words. Symbols replace common phrases (→ ∴ ∵ ~).
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-2 border border-purple-100 dark:border-purple-700">
            <div className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">Entropy-Aware Mode</div>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              NLP-based scoring preserves high-information tokens (entities, numbers, acronyms) even if they'd otherwise be removed.
            </p>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-lg p-2 border border-purple-100 dark:border-purple-700">
          <div className="text-xs font-mono text-gray-600 dark:text-gray-400">
            <span className="text-gray-400">Input: </span>"Dr. Smith of NASA discovered approximately 0.003 kilograms."<br/>
            <span className="text-gray-400">Output:</span> "Dr. Smith NASA discovered ~ 0.003 kilograms."
          </div>
        </div>
        <p className="text-xs text-purple-500 dark:text-purple-400 mt-2">
          Entropy mode is a protective layer  - it never removes more than rule-based, but ensures high-value tokens are preserved.
        </p>
      </div>

      {/* Tool Calling / Agent Loop */}
      <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
        <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Tool Calling (Agent Loop)</h3>
        <p className="text-xs text-sky-600 dark:text-sky-400 mb-3">
          When the proxy's <strong>tool calling mode</strong> is enabled (read-write), the LLM can interact with the knowledge graph
          directly during a conversation. The proxy injects graph tools as OpenAI-compatible function definitions, then runs an
          agent loop  - the LLM calls tools, the proxy executes them and feeds results back, repeating until the model
          produces a text response or hits the iteration limit (default 5).
        </p>
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <div className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1.5">Read-Only Tools</div>
            <div className="space-y-1">
              {[
                ['graph_query', 'Search nodes by text, domain, type'],
                ['graph_get', 'Retrieve a node by UUID'],
                ['graph_lineage', 'Parent/child relationships'],
                ['graph_summarize', 'Structured topic summary'],
                ['graph_compress', 'Dense meta-prompt from graph'],
                ['graph_tensions', 'Find contradicting node pairs'],
                ['graph_voice', 'Get voicing context for synthesis'],
                ['graph_validate', 'Breakthrough validation context'],
                ['graph_stats', 'Graph health statistics'],
                ['graph_patterns', 'Cross-domain abstract patterns'],
              ].map(([name, desc]) => (
                <div key={name} className="flex gap-2 items-baseline">
                  <code className="text-xs font-mono font-semibold text-sky-800 dark:text-sky-300 whitespace-nowrap">{name}</code>
                  <span className="text-xs text-sky-500 dark:text-sky-400">{desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1.5">Write Tools (read-write mode)</div>
            <div className="space-y-1">
              {[
                ['graph_propose', 'Add knowledge (seed, synthesis, voiced, question)'],
                ['graph_promote', 'Elevate node to breakthrough with scores'],
                ['graph_dedup', 'Find & archive duplicates (dry-run default)'],
                ['graph_remove', 'Archive or junk a node'],
                ['graph_feedback', 'Rate node quality (useful/not/harmful)'],
              ].map(([name, desc]) => (
                <div key={name} className="flex gap-2 items-baseline">
                  <code className="text-xs font-mono font-semibold text-sky-800 dark:text-sky-300 whitespace-nowrap">{name}</code>
                  <span className="text-xs text-sky-500 dark:text-sky-400">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-sky-500 dark:text-sky-400 mt-2">
              If the model doesn't support tool calling, the proxy automatically falls back to a regular (no tools) call
              and marks the model in the registry so future requests skip tools.
            </p>
          </div>
        </div>
        <div className="text-xs text-sky-600 dark:text-sky-400 space-y-1.5 mt-2 border-t border-sky-200 dark:border-sky-700 pt-2">
          <p>
            <strong>Tool strategies:</strong> <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded">complement</code> (default)
            injects passive knowledge context alongside tools  - the LLM has both graph knowledge and tool access.
            <code className="bg-sky-100 dark:bg-sky-900/30 px-1 rounded ml-1">replace</code> mode skips passive knowledge injection
            entirely; the LLM must use tools to access graph knowledge.
          </p>
          <p>
            <strong>Client tool passthrough:</strong> If the client provides its own tools in the request, the proxy
            does not inject graph tools  - the client's tools are forwarded unchanged to the LLM.
          </p>
        </div>
      </div>

      {/* Knowledge Budget */}
      <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
        <h3 className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-2">Knowledge Budget</h3>
        <p className="text-xs text-teal-600 dark:text-teal-400 mb-2">
          The proxy dynamically allocates context window space for knowledge injection using two configurable percentages:
        </p>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-teal-100 dark:border-teal-700">
            <p className="font-medium text-teal-700 dark:text-teal-300">knowledgeReserve (15% default)</p>
            <p className="text-teal-500 dark:text-teal-400">Maximum percentage of context window reserved for injected knowledge. Acts as a ceiling.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-teal-100 dark:border-teal-700">
            <p className="font-medium text-teal-700 dark:text-teal-300">knowledgeMinReserve (5% default)</p>
            <p className="text-teal-500 dark:text-teal-400">Minimum floor. Even when messages consume most of the window, at least this much is reserved for knowledge.</p>
          </div>
        </div>
        <p className="text-xs text-teal-500 dark:text-teal-400 mt-2">
          Budget is calculated from the model's context_size minus existing messages minus tool tokens.
          Stored under <code className="bg-teal-100 dark:bg-teal-900/30 px-1 rounded">proxy.config</code> in settings, auto-reloaded every 60s.
          Configure on the <strong>Models page → Proxy Settings</strong>.
        </p>
      </div>

      {/* Limitations */}
      <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">Limitations</h3>
        <ul className="text-xs text-red-600 dark:text-red-400 space-y-1.5 list-disc list-inside">
          <li><strong>Token usage</strong>  - The <code>usage</code> field in responses comes from the upstream LLM. If the provider doesn't return it, values will be 0</li>
          <li><strong>Context window cost</strong>  - Knowledge enrichment adds to the system message, consuming part of the context window. The context engine uses dynamic budgets to limit this</li>
          <li><strong>Provider compatibility</strong>  - Parameters are only forwarded if the client sends them. Not all providers support all parameters (e.g., local models may not support <code>logprobs</code>)</li>
        </ul>
      </div>

      {/* Endpoints Reference */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Endpoints</h3>
        <table className="text-xs w-full">
          <thead>
            <tr className="text-left border-b dark:border-gray-700">
              <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Endpoint</th>
              <th className="py-1.5 font-medium text-gray-600 dark:text-gray-400">Purpose</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-50 dark:border-gray-700">
              <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">POST /v1/chat/completions</td>
              <td className="py-1.5 text-gray-500 dark:text-gray-400">Main proxy endpoint (OpenAI-compatible)</td>
            </tr>
            <tr className="border-b border-gray-50 dark:border-gray-700">
              <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">GET /v1/models</td>
              <td className="py-1.5 text-gray-500 dark:text-gray-400">List enabled models from registry</td>
            </tr>
            <tr className="border-b border-gray-50 dark:border-gray-700">
              <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">GET /health</td>
              <td className="py-1.5 text-gray-500 dark:text-gray-400">Health check (version, uptime, request stats)</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default ProxySection;
