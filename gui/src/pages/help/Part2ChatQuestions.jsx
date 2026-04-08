

function ProxyFlowDiagram() {
  return (
    <svg viewBox="0 0 860 300" className="w-full mx-auto" role="img" aria-label="Knowledge proxy request flow">
      <defs>
        <marker id="arrow-pf" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
        <marker id="arrow-pfg" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
        </marker>
      </defs>

      {/* Row 1: Request flow */}
      <rect x="10" y="20" width="150" height="55" rx="8" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1.5" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="85" y="43" textAnchor="middle" className="fill-gray-700 dark:fill-gray-300 text-xs font-semibold">Client App</text>
      <text x="85" y="60" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">IDE / Script / Agent</text>

      <path d="M 160 47 L 240 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-pf)" />
      <text x="200" y="40" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">request</text>

      <rect x="240" y="15" width="220" height="65" rx="8" fill="#fff7ed" stroke="#f97316" strokeWidth="1.5" className="dark:fill-orange-900/30 dark:stroke-orange-500" />
      <text x="350" y="36" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400 text-xs font-semibold">Knowledge Proxy</text>
      <text x="350" y="52" textAnchor="middle" className="fill-orange-400 dark:fill-orange-500 text-xs">:11435</text>
      <text x="350" y="66" textAnchor="middle" className="fill-orange-400 dark:fill-orange-500 text-xs">Intercept + Enrich + Forward</text>

      <path d="M 460 47 L 565 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-pf)" />
      <text x="512" y="40" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">enriched</text>

      <rect x="570" y="20" width="175" height="55" rx="8" fill="#fffbeb" stroke="#f59e0b" strokeWidth="1.5" className="dark:fill-amber-900/30 dark:stroke-amber-500" />
      <text x="658" y="43" textAnchor="middle" className="fill-amber-600 dark:fill-amber-400 text-xs font-semibold">LLM Endpoint</text>
      <text x="658" y="60" textAnchor="middle" className="fill-amber-400 dark:fill-amber-500 text-xs">Model Registry</text>

      {/* Row 2: Knowledge enrichment */}
      <path d="M 350 80 L 350 115" fill="none" stroke="#10b981" strokeWidth="1.5" markerEnd="url(#arrow-pfg)" />
      <text x="370" y="103" className="fill-emerald-500 dark:fill-emerald-400 text-xs">prepare()</text>

      <rect x="240" y="120" width="220" height="55" rx="8" fill="#ecfdf5" stroke="#10b981" strokeWidth="1.5" className="dark:fill-emerald-900/30 dark:stroke-emerald-500" />
      <text x="350" y="143" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs font-semibold">Context Engine</text>
      <text x="350" y="160" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-500 text-xs">Select + Inject Knowledge</text>

      <path d="M 460 147 L 565 147" fill="none" stroke="#38bdf8" strokeWidth="1.5" markerEnd="url(#arrow-pf)" />

      <rect x="570" y="120" width="175" height="55" rx="8" fill="#f0f9ff" stroke="#38bdf8" strokeWidth="1.5" className="dark:fill-sky-900/30 dark:stroke-sky-500" />
      <text x="658" y="143" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs font-semibold">Knowledge Graph</text>
      <text x="658" y="160" textAnchor="middle" className="fill-sky-400 dark:fill-sky-500 text-xs">Nodes + Embeddings</text>

      {/* Row 3: Response flow */}
      <path d="M 658 75 L 658 205" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" />

      <path d="M 350 175 L 350 205" fill="none" stroke="#10b981" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-pfg)" />
      <text x="370" y="195" className="fill-emerald-500 dark:fill-emerald-400 text-xs">update()</text>

      <rect x="205" y="210" width="310" height="45" rx="8" fill="#fafafa" stroke="#d4d4d8" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-600" />
      <text x="360" y="228" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">OpenAI-compatible response</text>
      <text x="360" y="244" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">usage data + tool_calls + SSE streaming</text>

      <path d="M 205 232 L 160 232" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-pf)" />

      <rect x="10" y="210" width="150" height="45" rx="8" fill="#f1f5f9" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="85" y="228" textAnchor="middle" className="fill-gray-600 dark:fill-gray-300 text-xs font-medium">Response</text>
      <text x="85" y="244" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">to Client</text>

      {/* Step numbers */}
      <circle cx="200" cy="47" r="9" fill="#f97316" opacity="0.2" stroke="#f97316" strokeWidth="1" />
      <text x="200" y="51" textAnchor="middle" className="fill-orange-600 dark:fill-orange-400" style={{ fontSize: '10px', fontWeight: 700 }}>1</text>
      <circle cx="350" cy="103" r="9" fill="#10b981" opacity="0.2" stroke="#10b981" strokeWidth="1" />
      <text x="350" y="107" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400" style={{ fontSize: '10px', fontWeight: 700 }}>2</text>
      <circle cx="512" cy="47" r="9" fill="#f59e0b" opacity="0.2" stroke="#f59e0b" strokeWidth="1" />
      <text x="512" y="51" textAnchor="middle" className="fill-amber-600 dark:fill-amber-400" style={{ fontSize: '10px', fontWeight: 700 }}>3</text>
      <circle cx="658" cy="195" r="9" fill="#94a3b8" opacity="0.2" stroke="#94a3b8" strokeWidth="1" />
      <text x="658" y="199" textAnchor="middle" className="fill-gray-500 dark:fill-gray-400" style={{ fontSize: '10px', fontWeight: 700 }}>4</text>
    </svg>
  );
}

const _proxyParams = [
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

/** Help section: Chat and asking questions — proxy flow and context engine. */
function Part2ChatQuestions() {
  return (
    <div className="space-y-6">
      {/* Opening */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Chat &amp; Knowledge Proxy</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit gives you two ways to have knowledge-enriched conversations: the <strong>GUI Chat</strong> and
          the <strong>Knowledge Proxy</strong>. Both automatically inject relevant knowledge from your graph into
          every LLM interaction. Ask questions, explore topics, and get answers grounded in your actual research
          &mdash; not generic training data.
        </p>
      </div>

      {/* GUI Chat */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-200">GUI Chat</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
          The built-in chat interface provides multi-turn conversations with <strong>automatic knowledge injection</strong>.
          Every message you send is analyzed for topics and intent, then the most relevant nodes from your graph are
          selected and injected into the LLM&rsquo;s context. Conversations persist and can be resumed later.
        </p>
        <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
          <h4 className="font-semibold text-sm text-sky-700 dark:text-sky-300 mb-2">Context Panel</h4>
          <p className="text-sm text-sky-600 dark:text-sky-400 mb-2">
            A sidebar panel shows exactly what knowledge is being used in each conversation turn:
          </p>
          <ul className="text-sm text-sky-600 dark:text-sky-400 space-y-1 list-disc list-inside">
            <li><strong>Detected topics</strong> &mdash; what the engine thinks you are asking about</li>
            <li><strong>Identified domains</strong> &mdash; which graph domains matched your message</li>
            <li><strong>Injected nodes</strong> &mdash; the specific knowledge nodes sent to the LLM, with relevance scores</li>
            <li><strong>Token budget</strong> &mdash; how much of the context window is allocated to knowledge vs. conversation</li>
          </ul>
        </div>
      </div>

      {/* What You Can Do */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">What You Can Do</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
          The chat supports several modes, each designed around a specific intent. Select the mode from the
          chat toolbar or use the corresponding{' '}
          <button className="docs-link-internal text-indigo-600 dark:text-indigo-400 underline" data-doc="slash-commands">slash command</button>.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-purple-700 dark:text-purple-300 mb-1">&ldquo;I want to research a topic&rdquo;</h4>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              <strong>Research mode</strong> &mdash; Ask knowledge-grounded questions about your graph. The LLM answers
              using your own research as context.
            </p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-emerald-700 dark:text-emerald-300 mb-1">&ldquo;I want to add knowledge&rdquo;</h4>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              <strong>Seed mode</strong> &mdash; Paste text to add directly to the graph. See{' '}
              <button className="docs-link-internal underline" data-doc="adding-knowledge">Adding Knowledge</button> for details.
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-amber-700 dark:text-amber-300 mb-1">&ldquo;I want a summary&rdquo;</h4>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              <strong>Summarize mode</strong> &mdash; Get a structured summary of everything the graph knows about a domain or topic.
            </p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-sky-700 dark:text-sky-300 mb-1">&ldquo;I want a dense briefing&rdquo;</h4>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              <strong>Compress mode</strong> &mdash; Get a compressed meta-prompt of graph knowledge &mdash; maximum
              information density in minimum tokens.
            </p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-indigo-700 dark:text-indigo-300 mb-1">&ldquo;I want to find connections&rdquo;</h4>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              <strong>Connections mode</strong> &mdash; Discover cross-domain links and unexpected relationships between ideas.
            </p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-red-700 dark:text-red-300 mb-1">&ldquo;I want to find contradictions&rdquo;</h4>
            <p className="text-xs text-red-600 dark:text-red-400">
              <strong>Tensions mode</strong> &mdash; Surface opposing claims within your research. Contradictions often
              point to where new knowledge is hiding.
            </p>
          </div>
        </div>
      </div>

      {/* Slash Commands */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-200">Slash Commands</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
          Type <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm">/</code> in
          the chat input for autocomplete. Available commands:
        </p>
        <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              ['/stats', 'Graph health overview'],
              ['/synthesis', 'Run synthesis cycle'],
              ['/research', 'Generate research seeds'],
              ['/seed', 'Add knowledge to graph'],
              ['/voice', 'Trigger voicing cycle'],
              ['/tensions', 'Find contradictions'],
              ['/summarize', 'Structured topic summary'],
              ['/compress', 'Dense knowledge briefing'],
              ['/templates', 'List research templates'],
              ['/dedup', 'Find duplicate nodes'],
            ].map(([cmd, desc]) => (
              <div key={cmd} className="flex flex-col">
                <code className="text-xs font-mono text-indigo-600 dark:text-indigo-400">{cmd}</code>
                <span className="text-xs text-gray-500 dark:text-gray-400">{desc}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            See{' '}
            <button className="docs-link-internal underline text-indigo-600 dark:text-indigo-400" data-doc="slash-commands">Slash Commands</button>{' '}
            for the full tool reference.
          </p>
        </div>
      </div>

      {/* Domain Scoping */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-200">Domain Scoping</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The scope selector at the top of the chat lets you filter knowledge injection by <strong>partition</strong> and <strong>domain</strong>.
          When scoped, only nodes from the selected domains are considered for injection. A domain count badge shows how
          many domains are active. This is useful when your graph contains multiple research areas and you want the LLM
          to focus on a specific one. Follow-up suggestions are generated contextually based on the current scope and conversation.
        </p>
      </div>

      {/* Knowledge Proxy */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-200">Knowledge Proxy</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
          The Knowledge Proxy is an <strong>OpenAI-compatible endpoint</strong> running at{' '}
          <code className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm">localhost:11435</code>.
          Point any client &mdash; your IDE, scripts, agents, or any tool that speaks the OpenAI API &mdash; at it, and every
          request is transparently enriched with graph knowledge. No code changes required in your client.
        </p>

        <ProxyFlowDiagram />

        <div className="space-y-3">
          {/* Python example */}
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-xs text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Python</h4>
            <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto"><code>{`client = OpenAI(
  base_url="http://localhost:11435/v1",
  api_key="not-needed"
)`}</code></pre>
          </div>

          {/* IDE Config example */}
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-xs text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">IDE Config (Cursor, Continue, etc.)</h4>
            <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto"><code>{`{
  "model": "your-model-name",
  "apiBase": "http://localhost:11435/v1"
}`}</code></pre>
          </div>

          {/* cURL example */}
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-xs text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">cURL</h4>
            <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto"><code>{`curl http://localhost:11435/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"What do we know about X?"}]}'`}</code></pre>
          </div>
        </div>
      </div>

      {/* How Knowledge Gets Injected */}
      <div>
        <h3 className="text-lg font-semibold mb-2 text-gray-900 dark:text-gray-200">How Knowledge Gets Injected</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-3">
          Whether you use the GUI Chat or the Knowledge Proxy, the same enrichment pipeline runs behind the scenes:
        </p>
        <ol className="text-sm text-gray-700 dark:text-gray-300 space-y-2 list-decimal list-inside">
          <li>Each message is <strong>analyzed for topics and intent</strong> &mdash; what you are asking about and what kind of answer you need</li>
          <li>The most <strong>relevant nodes</strong> are selected from the graph based on embedding similarity and topic matching</li>
          <li>A <strong>knowledge-enriched system prompt</strong> is built and sent alongside your message to the LLM</li>
          <li>The LLM responds with <strong>awareness of your research</strong> &mdash; citing specific findings, not generic information</li>
          <li><strong>Cross-session learning</strong> improves over time: frequently-discussed topics get better knowledge selection in future conversations</li>
        </ol>
      </div>

      {/* Proxy Features */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Proxy Features</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Streaming Support</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Full SSE streaming &mdash; tokens arrive as they are generated, just like a direct API call.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Session Management</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Conversations maintain continuity across multiple requests. Context accumulates and improves each turn.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Model Resolution</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Model names in requests are mapped to your registered models. Use any name your client expects.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Tool Calling</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Agent loops with tool/function calling support. Models can read and write graph operations directly.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Knowledge Budget</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Configurable reserve: 15% max, 5% floor of the context window. Balances knowledge injection against conversation space.
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
            <h4 className="font-semibold text-sm text-gray-700 dark:text-gray-300 mb-1">Configuration</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Proxy settings, context engine tuning, and budget allocation are all configurable. See{' '}
              <button className="docs-link-internal underline text-indigo-600 dark:text-indigo-400" data-doc="configuration">Configuration</button>.
            </p>
          </div>
        </div>
      </div>

      {/* Session Management */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Session Management</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Sessions map stateless OpenAI-compatible requests to stateful context engine sessions that accumulate topics and improve over turns. Session ID resolution order:
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            ['1. X-Session-Id header', 'Pass X-Session-Id: my-session for explicit session control. Best for stateful multi-turn conversations.'],
            ['2. User field', 'The user field in the request body maps to a session per user.'],
            ['3. System message hash', 'Sessions group by SHA-256 hash of the first system message if no header or user field.'],
            ['4. Random UUID (fallback)', 'Each request gets a unique session. No cross-turn learning.'],
          ].map(([priority, detail]) => (
            <div key={priority} className="bg-orange-50 dark:bg-orange-900/30 rounded-lg p-2">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-300 mb-1">{priority}</p>
              <p className="text-xs text-orange-600 dark:text-orange-400">{detail}</p>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">All session IDs are prefixed with <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">proxy:</code> for namespace isolation.</p>
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
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Use <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">"default"</code> or omit the model field to use the chat subsystem&apos;s assigned model.</p>
      </div>

      {/* Supported Parameters */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Supported OpenAI-Compatible Parameters</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          All standard chat completion parameters are forwarded to the LLM. Only parameters explicitly sent by the client are included in the upstream request.
        </p>
        <div className="overflow-x-auto">
          <table className="text-xs w-full">
            <thead>
              <tr className="text-left border-b dark:border-gray-700">
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400">Parameter</th>
                <th className="py-1.5 pr-3 font-medium text-gray-600 dark:text-gray-400 w-12">OK</th>
                <th className="py-1.5 font-medium text-gray-600 dark:text-gray-400">Notes</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['messages', 'Required. Enriched with knowledge context.'],
                ['model', 'Resolved via model registry (name, ID, tier).'],
                ['temperature', 'Default 0.7.'],
                ['max_tokens', 'Default from config.'],
                ['top_p', 'Forwarded to LLM.'],
                ['frequency_penalty', 'Forwarded to LLM.'],
                ['presence_penalty', 'Forwarded to LLM.'],
                ['stop', 'String or array of stop sequences.'],
                ['response_format', 'JSON mode. Forwarded to LLM.'],
                ['tools / tool_choice', 'Function calling. Forwarded to LLM.'],
                ['n', 'Multiple completions. All choices returned.'],
                ['seed', 'Reproducibility. Forwarded to LLM.'],
                ['logprobs / top_logprobs', 'Log probabilities. Forwarded to LLM.'],
                ['user', 'Used for session resolution.'],
                ['stream', 'SSE streaming. Proxy converts non-streaming upstream to Server-Sent Events.'],
              ].map(([name, notes]) => (
                <tr key={name} className="border-b border-gray-50 dark:border-gray-800">
                  <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{name}</td>
                  <td className="py-1.5 pr-3 text-emerald-600 dark:text-emerald-400 font-medium">Yes</td>
                  <td className="py-1.5 text-gray-500 dark:text-gray-400">{notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Endpoints */}
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
            {[
              ['POST /v1/chat/completions', 'Main proxy endpoint (OpenAI-compatible)'],
              ['GET /v1/models', 'List enabled models from registry'],
              ['GET /health', 'Health check (version, uptime, request stats)'],
            ].map(([endpoint, purpose]) => (
              <tr key={endpoint} className="border-b border-gray-50 dark:border-gray-800">
                <td className="py-1.5 pr-3 font-mono text-gray-700 dark:text-gray-300">{endpoint}</td>
                <td className="py-1.5 text-gray-500 dark:text-gray-400">{purpose}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Context Engine Detail */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-200">How Knowledge Selection Works</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Every chat turn and proxy request runs through the <strong>context engine</strong>. A{' '}
          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">prepare()</code> call selects and injects
          relevant graph knowledge before the LLM sees your message. An{' '}
          <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">update()</code> call runs after the response
          to boost nodes the LLM actually used and compute quality metrics.
        </p>

        <svg viewBox="0 0 800 390" className="w-full mx-auto" role="img" aria-label="Context engine flow">
          <defs>
            <marker id="arrow-ce" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
            <marker id="arrow-cep" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
            </marker>
          </defs>
          <rect x="15" y="20" width="130" height="55" rx="8" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.5" className="dark:fill-gray-700 dark:stroke-gray-500" />
          <text x="80" y="42" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Agent / Client</text>
          <text x="80" y="58" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">User message</text>
          <path d="M 145 47 L 185 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-ce)" />
          <rect x="190" y="5" width="170" height="88" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
          <text x="275" y="24" textAnchor="middle" className="text-xs font-semibold fill-emerald-700 dark:fill-emerald-400">prepare()</text>
          <text x="275" y="40" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Detect intent</text>
          <text x="275" y="55" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Extract + cluster topics</text>
          <text x="275" y="70" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Select knowledge</text>
          <text x="275" y="85" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Model-aware formatting</text>
          <path d="M 360 47 L 405 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-ce)" />
          <rect x="410" y="5" width="170" height="88" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
          <text x="495" y="24" textAnchor="middle" className="text-xs font-semibold fill-sky-700 dark:fill-sky-400">Context Package</text>
          <text x="495" y="42" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Knowledge nodes</text>
          <text x="495" y="57" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">System prompt</text>
          <text x="495" y="72" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">History + intent</text>
          <text x="495" y="87" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Dynamic budget</text>
          <path d="M 580 47 L 625 47" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-ce)" />
          <rect x="630" y="15" width="110" height="65" rx="8" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1.5" />
          <text x="685" y="42" textAnchor="middle" className="text-xs font-semibold fill-amber-700 dark:fill-amber-400">LLM</text>
          <text x="685" y="58" textAnchor="middle" className="text-xs fill-amber-500 dark:fill-amber-500">Generate</text>
          <path d="M 685 80 L 685 115" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" />
          <path d="M 685 120 C 685 150, 100 150, 80 80" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 3" markerEnd="url(#arrow-ce)" />
          <text x="390" y="160" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400 font-medium">Response to Client</text>
          <path d="M 630 120 L 585 120" fill="none" stroke="#8b5cf6" strokeWidth="1.5" markerEnd="url(#arrow-cep)" />
          <rect x="410" y="105" width="170" height="70" rx="8" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeWidth="1.5" />
          <text x="495" y="124" textAnchor="middle" className="text-xs font-semibold fill-purple-700 dark:fill-purple-400">update()</text>
          <text x="495" y="140" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Feedback loop</text>
          <text x="495" y="155" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Quality metrics</text>
          <text x="495" y="170" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Weight boost used nodes</text>
          <rect x="40" y="298" width="720" height="82" rx="8" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
          <text x="400" y="316" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Knowledge Selection Signals (4 base + 1 bonus)</text>
          <rect x="60" y="326" width="130" height="30" rx="4" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1" />
          <text x="125" y="340" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-medium">Embedding 40%</text>
          <rect x="200" y="326" width="130" height="30" rx="4" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1" />
          <text x="265" y="340" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-medium">Topic Match 30%</text>
          <rect x="340" y="326" width="130" height="30" rx="4" fill="#f59e0b" opacity="0.15" stroke="#f59e0b" strokeWidth="1" />
          <text x="405" y="340" textAnchor="middle" className="text-xs fill-amber-700 dark:fill-amber-400 font-medium">Node Weight 20%</text>
          <rect x="480" y="326" width="110" height="30" rx="4" fill="#ef4444" opacity="0.15" stroke="#ef4444" strokeWidth="1" />
          <text x="535" y="340" textAnchor="middle" className="text-xs fill-red-700 dark:fill-red-400 font-medium">Recency 10%</text>
          <rect x="600" y="326" width="130" height="30" rx="4" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeWidth="1" strokeDasharray="4 2" />
          <text x="665" y="340" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-medium">Cluster +15% bonus</text>
          <text x="400" y="378" textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">Base signals sum to 100%. Cluster match adds +15% bonus when topic clustering is enabled.</text>
        </svg>

        {/* Prepare / Update flows */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Prepare Flow</h4>
            <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
              <li><strong>Detect intent</strong> — classify query as retrieval, action, diagnosis, or exploration</li>
              <li>Extract topics from user message + session history</li>
              <li><strong>Cluster topics</strong> — group by embedding similarity into concept clusters</li>
              <li>Match domains from extracted topics</li>
              <li>Score nodes using 5 signals: embedding, topic, weight, <strong>cluster centroids</strong>, recency</li>
              <li>Adjust weights by intent (retrieval boosts embedding, diagnosis boosts recency)</li>
              <li><strong>Apply model profile</strong> — adapt budget and node limits for model size</li>
              <li>Build system prompt (compressed format for small models)</li>
              <li>Use <strong>dynamic budget</strong> — more knowledge early, more history later</li>
              <li>Return context package with intent and metrics</li>
            </ol>
          </div>
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Update Flow</h4>
            <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5 list-decimal list-inside">
              <li>Track LLM response in session history</li>
              <li>Extract topics from response</li>
              <li><strong>Feedback loop</strong> — compare response embedding to delivered nodes</li>
              <li>Boost weight of nodes the LLM actually used (similarity &ge; 0.65)</li>
              <li><strong>Quality metrics</strong> — compute utilization, grounding, coverage, efficiency</li>
              <li>Store per-turn composite quality score</li>
            </ol>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              The feedback loop creates natural selection: useful knowledge gets boosted, unused knowledge slowly decays.
            </p>
          </div>
        </div>

        {/* Intent Detection */}
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Intent Detection</h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Zero-cost keyword classifier — pure regex, no LLM call. Detects query intent and adjusts knowledge selection strategy.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ['Retrieval', '"what is", "explain", "?"', 'Boosts embedding similarity', 'sky'],
              ['Action', '"create", "build", "fix"', 'Boosts topic + weight', 'emerald'],
              ['Diagnosis', '"why", "bug", "error"', 'Boosts recency', 'red'],
              ['Exploration', '"what if", "pattern"', 'Boosts embedding + recency', 'purple'],
            ].map(([intent, triggers, effect, color]) => (
              <div key={intent} className={`bg-${color}-50 dark:bg-${color}-900/30 border border-${color}-200 dark:border-${color}-700 rounded p-2`}>
                <p className={`text-xs font-semibold text-${color}-700 dark:text-${color}-300`}>{intent}</p>
                <p className={`text-xs text-${color}-600 dark:text-${color}-400 mb-1`}>{triggers}</p>
                <p className={`text-xs text-${color}-500 dark:text-${color}-400`}>{effect}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Model Profiles */}
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Model-Aware Profiles</h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            The context engine adapts to the size of the model it is enriching. Smaller models get a smaller, denser knowledge package;
            larger models get more nodes and structured formatting.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
                  <th className="pb-1 pr-3">Profile</th>
                  <th className="pb-1 pr-3">Budget</th>
                  <th className="pb-1 pr-3">Max Nodes</th>
                  <th className="pb-1 pr-3">Format</th>
                  <th className="pb-1">History</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                {[
                  ['micro (2–4K)', '0.12×', '3', 'Dense paragraph', '2 turns'],
                  ['small (&lt;8K)', '0.25×', '5', 'Dense paragraph', '4 turns'],
                  ['medium (8–32K)', '1.0×', '15', 'Structured sections', '20 turns'],
                  ['large (32–128K)', '4.0×', '30', 'Structured sections', '50 turns'],
                  ['xl (128K+)', '8.0×', '50', 'Structured sections', '100 turns'],
                ].map(([profile, budget, nodes, fmt, history]) => (
                  <tr key={profile} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-1.5 pr-3 font-medium" dangerouslySetInnerHTML={{ __html: profile }} />
                    <td className="py-1.5 pr-3">{budget}</td>
                    <td className="py-1.5 pr-3">{nodes}</td>
                    <td className="py-1.5 pr-3">{fmt}</td>
                    <td className="py-1.5">{history}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quality Metrics */}
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Quality Metrics</h4>
          <div className="grid grid-cols-2 gap-3 mb-2">
            {[
              ['Knowledge Utilization', 'What fraction of delivered nodes did the LLM actually use?', 'emerald'],
              ['Response Grounding', 'How similar is the response to the used knowledge nodes?', 'sky'],
              ['Topic Coverage', 'What fraction of session topics appear in the response?', 'purple'],
              ['Budget Efficiency', 'Ratio of used tokens vs total available budget.', 'amber'],
            ].map(([metric, desc, color]) => (
              <div key={metric} className={`bg-${color}-50 dark:bg-${color}-900/30 border border-${color}-200 dark:border-${color}-700 rounded p-2`}>
                <p className={`text-xs font-semibold text-${color}-700 dark:text-${color}-300`}>{metric}</p>
                <p className={`text-xs text-${color}-600 dark:text-${color}-400`}>{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500">Composite score = utilization(35%) + grounding(30%) + coverage(20%) + efficiency(15%)</p>
        </div>

        {/* Cross-Session Learning */}
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h4 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Cross-Session Learning</h4>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
            Sessions are in-memory. When a session expires, its most valuable insights are persisted to the database so future sessions
            warm-start from your past conversation patterns.
          </p>
          <svg viewBox="0 0 760 160" className="w-full mx-auto mb-3" role="img" aria-label="Cross-session learning flow">
            <defs>
              <marker id="arrow-cs" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
            </defs>
            <rect x="20" y="20" width="140" height="50" rx="6" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
            <text x="90" y="42" textAnchor="middle" className="text-xs font-semibold fill-sky-700 dark:fill-sky-400">Session A</text>
            <text x="90" y="57" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Topics + feedback</text>
            <line x1="160" y1="45" x2="205" y2="45" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-cs)" />
            <rect x="210" y="15" width="130" height="60" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
            <text x="275" y="35" textAnchor="middle" className="text-xs font-semibold fill-emerald-700 dark:fill-emerald-400">Persist</text>
            <text x="275" y="50" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Insights</text>
            <text x="275" y="63" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Node Usage</text>
            <line x1="340" y1="45" x2="385" y2="45" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-cs)" />
            <rect x="390" y="20" width="130" height="50" rx="6" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1.5" />
            <text x="455" y="42" textAnchor="middle" className="text-xs font-semibold fill-amber-700 dark:fill-amber-400">SQLite</text>
            <text x="455" y="57" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">session_insights</text>
            <line x1="520" y1="45" x2="565" y2="45" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-cs)" />
            <rect x="570" y="20" width="140" height="50" rx="6" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeWidth="1.5" />
            <text x="640" y="42" textAnchor="middle" className="text-xs font-semibold fill-purple-700 dark:fill-purple-400">Session B</text>
            <text x="640" y="57" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Warm-started!</text>
            <rect x="170" y="95" width="420" height="45" rx="6" fill="#f8fafc" stroke="#e2e8f0" strokeWidth="1" className="dark:fill-gray-800 dark:stroke-gray-700" />
            <text x="380" y="113" textAnchor="middle" className="text-xs fill-gray-600 dark:fill-gray-300 font-medium">On session TTL expiry: topics, clusters, node usage</text>
            <text x="380" y="128" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">persist to DB. New sessions load matching insights.</text>
            <line x1="275" y1="75" x2="275" y2="95" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
            <line x1="455" y1="70" x2="455" y2="95" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />
          </svg>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded p-2">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">What Gets Persisted</p>
              <ul className="text-xs text-emerald-600 dark:text-emerald-400 space-y-0.5 mt-1">
                <li>Top 30 topics with weights</li>
                <li>Concept cluster terms</li>
                <li>Node usage (which nodes were helpful)</li>
                <li>Domain associations</li>
              </ul>
            </div>
            <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-2">
              <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">How It Bootstraps</p>
              <ul className="text-xs text-sky-600 dark:text-sky-400 space-y-0.5 mt-1">
                <li>First turn loads matching insights</li>
                <li>Topics merged at 30% weight (dampened)</li>
                <li>Frequently-used nodes prioritized</li>
                <li>EMA weight merging across sessions</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Limitations */}
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-4">
        <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">Limitations</h3>
        <ul className="text-xs text-red-600 dark:text-red-400 space-y-1.5 list-disc list-inside">
          <li><strong>Token usage</strong> — The usage field in responses comes from the upstream LLM. If the provider doesn&apos;t return it, values will be 0.</li>
          <li><strong>Context window cost</strong> — Knowledge enrichment adds to the system message. The context engine uses dynamic budgets to limit this.</li>
          <li><strong>Provider compatibility</strong> — Not all providers support all parameters (e.g., local models may not support logprobs).</li>
        </ul>
      </div>

      {/* Cross-references */}
      <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h4 className="font-semibold text-sm text-indigo-700 dark:text-indigo-300 mb-2">Related Sections</h4>
        <ul className="text-sm text-indigo-600 dark:text-indigo-400 space-y-1">
          <li>
            <button className="docs-link-internal underline" data-doc="adding-knowledge">Adding Knowledge</button>
            {' '}&mdash; How to seed the graph via chat, MCP, or Knowledge Base
          </li>
          <li>
            <button className="docs-link-internal underline" data-doc="growing-graph">Growing Your Graph</button>
            {' '}&mdash; How synthesis uses your knowledge to discover connections
          </li>
          <li>
            <button className="docs-link-internal underline" data-doc="configuration">Configuration</button>
            {' '}&mdash; Proxy settings, context engine tuning, and knowledge budgets
          </li>
          <li>
            <button className="docs-link-internal underline" data-doc="slash-commands">Slash Commands</button>
            {' '}&mdash; Full reference for all chat commands
          </li>
        </ul>
      </div>
    </div>
  );
}

export default Part2ChatQuestions;
