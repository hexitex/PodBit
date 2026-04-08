

function KBPipelineDiagram() {
  return (
    <svg viewBox="0 0 860 195" className="w-full mx-auto" role="img" aria-label="KB ingestion pipeline">
      <defs>
        <marker id="arrowKB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      <rect x="10" y="25" width="130" height="60" rx="8" fill="#f97316" opacity="0.15" stroke="#f97316" strokeWidth="1.5" />
      <text x="75" y="50" textAnchor="middle" className="text-xs fill-orange-700 dark:fill-orange-400 font-semibold">Folders</text>
      <text x="75" y="65" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">Watch / Scan</text>
      <text x="75" y="78" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">Glob patterns</text>
      <path d="M 140 55 C 155 55, 160 55, 175 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowKB)" />
      <rect x="180" y="25" width="130" height="60" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="245" y="50" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Scanner</text>
      <text x="245" y="65" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Recursive walk</text>
      <text x="245" y="78" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">SHA-256 hash</text>
      <path d="M 310 55 C 325 55, 330 55, 345 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowKB)" />
      <rect x="350" y="15" width="140" height="80" rx="8" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeWidth="1.5" />
      <text x="420" y="35" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-semibold">Readers</text>
      <text x="420" y="50" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Text, PDF, Doc</text>
      <text x="420" y="63" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Sheet, Image, Code</text>
      <text x="420" y="78" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Smart chunking</text>
      <text x="420" y="90" textAnchor="middle" className="text-xs fill-purple-500 dark:fill-purple-400">(6 plugin types)</text>
      <path d="M 490 55 C 505 55, 510 55, 525 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowKB)" />
      <rect x="530" y="25" width="130" height="60" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="595" y="50" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-semibold">Pipeline</text>
      <text x="595" y="65" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Embed chunks</text>
      <text x="595" y="78" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Create nodes</text>
      <path d="M 660 55 C 675 55, 680 55, 695 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowKB)" />
      <rect x="700" y="25" width="130" height="60" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="765" y="45" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Knowledge</text>
      <text x="765" y="58" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Graph</text>
      <text x="765" y="78" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Searchable nodes</text>
      <path d="M 75 87 C 45 120, 45 155, 85 160 C 125 165, 175 145, 175 110" fill="none" stroke="#f97316" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <text x="140" y="178" className="text-xs fill-orange-500">chokidar watcher</text>
      <text x="430" y="188" textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">Re-scans skip unchanged files (content hash match)</text>
    </svg>
  );
}

/** Help section: Adding knowledge — KB pipeline diagram and folder/reader workflow. */
function Part2AddingKnowledge() {
  return (
    <div className="space-y-6">
      {/* Opening */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Adding Knowledge</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Knowledge enters Podbit through six paths, each suited to a different source. You can manually seed
          ideas, bulk-import documents, let LLMs fill gaps, or feed in live data from external APIs.
        </p>
      </div>

      {/* Six Input Paths */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Six Input Paths</h3>
        <div className="grid grid-cols-2 gap-4">
          {/* Manual Seeding */}
          <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
            <h4 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Manual Seeding</h4>
            <p className="text-xs text-sky-600 dark:text-sky-400 mb-2">
              The most direct path. Use the GUI Chat in seed mode, the Graph page, or type ideas directly.
              You control exactly what enters the graph. Seeds carry your domain expertise, hypotheses,
              observations, and curated facts. IDE agents can also seed via MCP.
            </p>
            <p className="text-xs text-sky-500 dark:text-sky-400">
              <strong>Creates:</strong> <code className="text-sky-700 dark:text-sky-300">seed</code> nodes.
              <strong> Contributors:</strong> <code className="text-sky-700 dark:text-sky-300">human:*</code>, <code className="text-sky-700 dark:text-sky-300">claude</code>
            </p>
          </div>

          {/* Knowledge Base */}
          <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
            <h4 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Knowledge Base (File Ingestion)</h4>
            <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
              Bulk import from local folders — papers, documents, code, spreadsheets, images. Six reader plugins
              process files and create nodes. <strong>Curated mode</strong> uses LLMs to generate descriptions
              as <code className="text-orange-700 dark:text-orange-300">seed</code> nodes.{' '}
              <strong>Raw mode</strong> ingests verbatim as <code className="text-orange-700 dark:text-orange-300">raw</code> nodes
              (searchable, but excluded from synthesis).
            </p>
            <p className="text-xs text-orange-500 dark:text-orange-400">
              <strong>Creates:</strong> <code className="text-orange-700 dark:text-orange-300">seed</code> or <code className="text-orange-700 dark:text-orange-300">raw</code> nodes.
              <strong> Contributors:</strong> <code className="text-orange-700 dark:text-orange-300">kb:*</code>
            </p>
          </div>

          {/* Research Cycle */}
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-4">
            <h4 className="font-semibold text-emerald-700 dark:text-emerald-300 text-sm mb-2">Research Cycle (LLM Knowledge)</h4>
            <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-2">
              The research cycle asks an LLM to generate factual seeds for under-populated domains, drawing on
              the model's training knowledge. This fills gaps with the model's broad knowledge about a topic,
              filtered through relevance gates so only on-topic content makes it in.
            </p>
            <p className="text-xs text-emerald-500 dark:text-emerald-400">
              <strong>Creates:</strong> <code className="text-emerald-700 dark:text-emerald-300">seed</code> nodes.
              <strong> Contributors:</strong> <code className="text-emerald-700 dark:text-emerald-300">research-cycle</code>
            </p>
          </div>

          {/* API Enrichment */}
          <div className="bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-700 rounded-lg p-4">
            <h4 className="font-semibold text-cyan-700 dark:text-cyan-300 text-sm mb-2">API Enrichment (External Data)</h4>
            <p className="text-xs text-cyan-600 dark:text-cyan-400 mb-2">
              Registered external APIs (weather services, scientific databases, financial data, etc.) are called
              during lab verification. The API response is parsed by an LLM into discrete facts, and each
              fact becomes a new node. This is how real-world data enters the graph — from live sources,
              not from the LLM's training.
            </p>
            <p className="text-xs text-cyan-500 dark:text-cyan-400">
              <strong>Creates:</strong> <code className="text-cyan-700 dark:text-cyan-300">seed</code> nodes.
              <strong> Contributors:</strong> <code className="text-cyan-700 dark:text-cyan-300">api-enrichment:*</code>
            </p>
          </div>

          {/* Synthesis & Voicing */}
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
            <h4 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Synthesis &amp; Voicing (Derived Knowledge)</h4>
            <p className="text-xs text-purple-600 dark:text-purple-400 mb-2">
              Not technically an "input" — these cycles recombine existing knowledge into new insights. But
              their output feeds back into the graph and becomes input for future cycles. A synthesis node
              can be paired with a seed to produce a second-generation synthesis, and so on. This is how
              the graph deepens over time.
            </p>
            <p className="text-xs text-purple-500 dark:text-purple-400">
              <strong>Creates:</strong> <code className="text-purple-700 dark:text-purple-300">synthesis</code> and <code className="text-purple-700 dark:text-purple-300">voiced</code> nodes.
              See <span className="docs-link-internal underline cursor-pointer" data-doc="growing-graph">Growing the Graph</span>.
            </p>
          </div>

          {/* Chat & Proxy */}
          <div className="bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-700 rounded-lg p-4">
            <h4 className="font-semibold text-teal-700 dark:text-teal-300 text-sm mb-2">Chat &amp; Proxy (Conversational)</h4>
            <p className="text-xs text-teal-600 dark:text-teal-400 mb-2">
              The GUI Chat and Knowledge Proxy can seed knowledge from conversations. When a chat response
              contains useful information, it can be proposed to the graph. The proxy enriches LLM
              calls with graph context, and the resulting conversation can feed discoveries back.
            </p>
            <p className="text-xs text-teal-500 dark:text-teal-400">
              <strong>Creates:</strong> <code className="text-teal-700 dark:text-teal-300">seed</code> nodes.
              See <span className="docs-link-internal underline cursor-pointer" data-doc="chat-questions">Chat &amp; Questions</span>.
            </p>
          </div>
        </div>
      </div>

      {/* The Input Spectrum */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">The Input Spectrum</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Each input path occupies a different position on the precision-vs-scale spectrum:
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
          <span className="font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">High precision, low volume</span>
          <div className="flex-1 h-2 rounded-full bg-gradient-to-r from-sky-400 via-emerald-400 to-orange-400 opacity-40" />
          <span className="font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">Low precision, high volume</span>
        </div>
        <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1 px-1">
          <span>Manual seeding</span>
          <span>Chat / Proxy</span>
          <span>Research cycle</span>
          <span>API enrichment</span>
          <span>KB ingestion</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
          A healthy graph uses multiple input paths. Manual seeds provide curated expertise. KB ingestion
          brings in source material at scale. Research fills gaps with LLM knowledge. API enrichment
          grounds claims in real data. The quality gates in synthesis and the autorating cycle handle
          the varying quality levels — higher-quality inputs naturally rise in weight.
        </p>
      </div>

      {/* Knowledge Base Deep Dive */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Knowledge Base Deep Dive</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The Knowledge Base (KB) ingests local folders into the knowledge graph via a plugin-based reader
          pipeline. It handles everything from plain text to images, with smart chunking, change detection,
          and optional real-time file watching.
        </p>
      </div>

      <KBPipelineDiagram />

      {/* How It Works */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">How It Works</h3>
        <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
          <li>
            <strong>Add a folder</strong> — Register a local folder path with a target domain. Configure include/exclude
            glob patterns, recursive scanning, and whether to use raw or curated mode.
          </li>
          <li>
            <strong>Scan</strong> — The scanner recursively walks the folder, matching files against glob patterns.
            Each file is hashed (SHA-256) for change detection.
          </li>
          <li>
            <strong>Read</strong> — Matched files are dispatched to the appropriate reader plugin based on file extension.
            Each reader extracts text content and splits it into smart chunks.
          </li>
          <li>
            <strong>Ingest</strong> — The pipeline embeds each chunk, creates nodes in the graph, and links child chunks
            to their parent file node via edges. Domain is derived from the folder path.
          </li>
          <li>
            <strong>Watch</strong> — If file watching is enabled, chokidar monitors the folder for changes.
            Modified files are automatically re-scanned. Unchanged files (same content hash) are skipped.
          </li>
        </ol>
      </div>

      {/* Reader Plugins */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Reader Plugins</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-3">
            <h4 className="font-semibold text-sky-700 dark:text-sky-300 text-xs mb-1">Text</h4>
            <p className="text-xs text-sky-600 dark:text-sky-400">
              <code className="text-sky-700 dark:text-sky-300">.txt .md .csv .json .xml .yaml .log .ini .env .toml</code>
            </p>
            <p className="text-xs text-sky-500 dark:text-sky-400 mt-1">Plain text extraction with smart paragraph-based chunking.</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-3">
            <h4 className="font-semibold text-red-700 dark:text-red-300 text-xs mb-1">PDF</h4>
            <p className="text-xs text-red-600 dark:text-red-400">
              <code className="text-red-700 dark:text-red-300">.pdf</code>
            </p>
            <p className="text-xs text-red-500 dark:text-red-400 mt-1">Page-based extraction. Requires optional npm dependency.</p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-3">
            <h4 className="font-semibold text-indigo-700 dark:text-indigo-300 text-xs mb-1">Doc</h4>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">
              <code className="text-indigo-700 dark:text-indigo-300">.docx .doc</code>
            </p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">Word document parsing. Requires optional npm dependency.</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-lg p-3">
            <h4 className="font-semibold text-emerald-700 dark:text-emerald-300 text-xs mb-1">Sheet</h4>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              <code className="text-emerald-700 dark:text-emerald-300">.xlsx .xls .ods</code>
            </p>
            <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1">Spreadsheet extraction with sheet-level chunking. Requires optional npm dependency.</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
            <h4 className="font-semibold text-amber-700 dark:text-amber-300 text-xs mb-1">Image</h4>
            <p className="text-xs text-amber-600 dark:text-amber-400">
              <code className="text-amber-700 dark:text-amber-300">.png .jpg .jpeg .gif .webp</code>
            </p>
            <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">
              Requires a <strong>vision LLM</strong> assigned to the <code className="text-amber-700 dark:text-amber-300">reader_image</code> subsystem.
            </p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-3">
            <h4 className="font-semibold text-purple-700 dark:text-purple-300 text-xs mb-1">Code</h4>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              <code className="text-purple-700 dark:text-purple-300">.js .ts .py .java .go .rs .c .cpp .rb .php .swift .kt</code>
            </p>
            <p className="text-xs text-purple-500 dark:text-purple-400 mt-1">Function/class-level chunking with language-aware parsing.</p>
          </div>
        </div>
      </div>

      {/* Key Features */}
      <div>
        <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-200">Key Features</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-2">Change Detection</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Every file is hashed with SHA-256 on scan. Re-scans skip unchanged files entirely — only modified
              or new files are re-processed. This makes re-scans fast even for large folders.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-2">Domain Mapping</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Each folder maps to a domain in the graph. Subfolders automatically inherit the parent domain
              unless overridden. This keeps ingested knowledge organized by source location.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-2">File Watching</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Optional chokidar-based real-time monitoring. When a watched file changes on disk, it is
              automatically re-scanned and re-ingested without manual intervention.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
            <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-200 mb-2">Pipeline Control</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              Concurrency limits prevent overwhelming the system during large ingestions. Failed files can be
              retried individually or in bulk. The pipeline queue processes files in order with configurable
              parallelism.
            </p>
          </div>
        </div>
      </div>

      {/* Raw Mode */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Raw Mode</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
          When a folder is registered with <code className="text-orange-700 dark:text-orange-300">rawMode: true</code>,
          files are ingested verbatim as <code className="text-orange-700 dark:text-orange-300">raw</code> nodes. No
          LLM curation is applied — the content is stored exactly as-is.
        </p>
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
          Raw nodes are <strong>excluded from all autonomous cycles</strong> — synthesis, voicing, tensions, validation,
          questions, and research will never touch them. They exist solely as searchable reference material
          for RAG-style retrieval via <code className="text-orange-700 dark:text-orange-300">podbit.query</code> and{' '}
          <code className="text-orange-700 dark:text-orange-300">podbit.compress</code>.
        </p>
        <p className="text-xs text-orange-500 dark:text-orange-400">
          <strong>Use for:</strong> Large reference corpora, source code archives, documentation sets, or any content
          you want searchable but not synthesized. Embeddings are prefixed with the filename for improved retrieval relevance.
        </p>
        <p className="text-xs text-orange-500 dark:text-orange-400 mt-2">
          <strong>Dual-folder pattern:</strong> Register the same source folder twice — once in raw mode (domain: <code className="text-orange-700 dark:text-orange-300">my:raw</code>)
          and once in curated mode (domain: <code className="text-orange-700 dark:text-orange-300">my:curated</code>). This gives you both
          verbatim source content for precise retrieval and curated knowledge for graph synthesis.
        </p>
      </div>

      {/* GUI & MCP */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Managing the Knowledge Base</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">GUI</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              The <strong>Knowledge Base</strong> page in the sidebar provides folder management, scan triggers,
              file status, pipeline monitoring, and reader configuration — all through a visual interface.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">MCP Tool</h4>
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
              The <code className="text-gray-700 dark:text-gray-300">podbit.kb</code> tool provides full programmatic access:
            </p>
            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
              <p><code className="text-gray-700 dark:text-gray-300">folders</code> — list watched folders</p>
              <p><code className="text-gray-700 dark:text-gray-300">add / remove</code> — manage folders</p>
              <p><code className="text-gray-700 dark:text-gray-300">scan</code> — trigger folder scan</p>
              <p><code className="text-gray-700 dark:text-gray-300">files / file</code> — list files, view file detail + chunks</p>
              <p><code className="text-gray-700 dark:text-gray-300">reprocess / retry</code> — re-read or retry failed files</p>
              <p><code className="text-gray-700 dark:text-gray-300">readers / stats</code> — list reader plugins, ingestion statistics</p>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              See <span className="docs-link-internal underline cursor-pointer" data-doc="slash-commands">MCP Tools</span> for
              the full <code className="text-gray-700 dark:text-gray-300">podbit.kb</code> reference.
            </p>
          </div>
        </div>
      </div>

      {/* Cross-references */}
      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-3">
        <h4 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">Related Sections</h4>
        <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span className="docs-link-internal underline cursor-pointer" data-doc="growing-graph">Growing the Graph</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="docs-link-internal underline cursor-pointer" data-doc="chat-questions">Chat &amp; Questions</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="docs-link-internal underline cursor-pointer" data-doc="configuration">Configuration</span>
          <span className="text-gray-300 dark:text-gray-600">|</span>
          <span className="docs-link-internal underline cursor-pointer" data-doc="slash-commands">MCP Tools</span>
        </div>
      </div>
    </div>
  );
}

export { KBPipelineDiagram };
export default Part2AddingKnowledge;
