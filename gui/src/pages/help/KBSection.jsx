import { Link } from 'react-router-dom';

function KBPipelineDiagram() {
  return (
    <svg viewBox="0 0 860 195" className="w-full mx-auto" role="img" aria-label="KB ingestion pipeline">
      <defs>
        <marker id="arrowKB" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Folders */}
      <rect x="10" y="25" width="130" height="60" rx="8" fill="#f97316" opacity="0.15" stroke="#f97316" strokeWidth="1.5" />
      <text x="75" y="50" textAnchor="middle" className="text-xs fill-orange-700 dark:fill-orange-400 font-semibold">Folders</text>
      <text x="75" y="65" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">Watch / Scan</text>
      <text x="75" y="78" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">Glob patterns</text>

      <path d="M 140 55 C 155 55, 160 55, 175 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowKB)" />

      {/* Scanner */}
      <rect x="180" y="25" width="130" height="60" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="245" y="50" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Scanner</text>
      <text x="245" y="65" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Recursive walk</text>
      <text x="245" y="78" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">SHA-256 hash</text>

      <path d="M 310 55 C 325 55, 330 55, 345 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowKB)" />

      {/* Readers */}
      <rect x="350" y="15" width="140" height="80" rx="8" fill="#8b5cf6" opacity="0.15" stroke="#8b5cf6" strokeWidth="1.5" />
      <text x="420" y="35" textAnchor="middle" className="text-xs fill-purple-700 dark:fill-purple-400 font-semibold">Readers</text>
      <text x="420" y="50" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Text, PDF, Doc</text>
      <text x="420" y="63" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Sheet, Image, Code</text>
      <text x="420" y="78" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">Smart chunking</text>
      <text x="420" y="90" textAnchor="middle" className="text-xs fill-purple-500 dark:fill-purple-400">(6 plugin types)</text>

      <path d="M 490 55 C 505 55, 510 55, 525 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowKB)" />

      {/* Pipeline */}
      <rect x="530" y="25" width="130" height="60" rx="8" fill="#10b981" opacity="0.15" stroke="#10b981" strokeWidth="1.5" />
      <text x="595" y="50" textAnchor="middle" className="text-xs fill-emerald-700 dark:fill-emerald-400 font-semibold">Pipeline</text>
      <text x="595" y="65" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Embed chunks</text>
      <text x="595" y="78" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Create nodes</text>

      <path d="M 660 55 C 675 55, 680 55, 695 55" fill="none" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrowKB)" />

      {/* Knowledge Graph */}
      <rect x="700" y="25" width="130" height="60" rx="8" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="765" y="45" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Knowledge</text>
      <text x="765" y="58" textAnchor="middle" className="text-xs fill-sky-700 dark:fill-sky-400 font-semibold">Graph</text>
      <text x="765" y="78" textAnchor="middle" className="text-xs fill-sky-600 dark:fill-sky-400">Searchable nodes</text>

      {/* Watcher loop */}
      <path d="M 75 87 C 45 120, 45 155, 85 160 C 125 165, 175 145, 175 110" fill="none" stroke="#f97316" strokeWidth="1" strokeDasharray="4 3" opacity="0.5" />
      <text x="140" y="178" className="text-xs fill-orange-500">chokidar watcher</text>

      {/* Change detection label */}
      <text x="430" y="188" textAnchor="middle" className="text-xs fill-gray-400 dark:fill-gray-500">Re-scans skip unchanged files (content hash match)</text>
    </svg>
  );
}

/** Help section: Knowledge Base folders, readers, and pipeline. */
function KBSection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Knowledge Base</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          The Knowledge Base is the primary way to feed research material into the graph. Point it at a folder of
          papers, documents, code, or data and it will scan, read, chunk, and embed the contents as graph nodes  -
          ready for the synthesis engine to discover connections across your source material. Supports real-time file
          watching, content-hash change detection, and 6 reader plugins for different file types.
        </p>
      </div>

      <KBPipelineDiagram />

      {/* How it works */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">How It Works</h3>
        <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
          <li><strong>Add a folder</strong>  - specify a local path or connect to a network share (SMB), set a target domain, include/exclude glob patterns, and whether to watch for changes</li>
          <li><strong>Scan</strong>  - the scanner recursively walks the folder, discovers files matching your patterns, and computes SHA-256 content hashes</li>
          <li><strong>Read</strong>  - each file is dispatched to the appropriate reader plugin based on file extension. Readers extract structured chunks (pages, sections, sheets, code blocks)</li>
          <li><strong>Ingest</strong>  - the pipeline creates a parent node for each file and child nodes for each chunk, all linked with edges and embedded for similarity search</li>
          <li><strong>Watch (optional)</strong>  - a chokidar file watcher monitors the folder for changes and automatically re-processes modified files</li>
        </ol>
      </div>

      {/* Reader plugins */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Reader Plugins</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          Six reader plugins handle different file types. Each has a corresponding subsystem for model assignment
          on the Models page. Only the image reader requires an LLM (vision model for description).
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded p-2">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Text Reader</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">.txt, .md, .csv, .json, .xml, .yaml, .log, .ini, .env, .toml</p>
            <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1">Sections by headings or size</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded p-2">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300">PDF Reader</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">.pdf</p>
            <p className="text-xs text-sky-500 dark:text-sky-400 mt-1">Page-by-page extraction</p>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded p-2">
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Doc Reader</p>
            <p className="text-xs text-purple-600 dark:text-purple-400">.docx, .doc</p>
            <p className="text-xs text-purple-500 dark:text-purple-400 mt-1">Paragraph extraction</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded p-2">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Sheet Reader</p>
            <p className="text-xs text-amber-600 dark:text-amber-400">.xlsx, .xls, .ods</p>
            <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">Sheet-by-sheet tables</p>
          </div>
          <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded p-2">
            <p className="text-xs font-semibold text-rose-700 dark:text-rose-300">Image Reader</p>
            <p className="text-xs text-rose-600 dark:text-rose-400">.png, .jpg, .jpeg, .gif, .webp, .bmp</p>
            <p className="text-xs text-rose-500 dark:text-rose-400 mt-1">Vision LLM description</p>
          </div>
          <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded p-2">
            <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Code Reader</p>
            <p className="text-xs text-indigo-600 dark:text-indigo-400">.js, .ts, .py, .java, .go, .rs, .c, .cpp, .rb, .php, .swift, .kt</p>
            <p className="text-xs text-indigo-500 dark:text-indigo-400 mt-1">Function/class blocks</p>
          </div>
        </div>
      </div>

      {/* Decomposition pipeline */}
      <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-violet-700 dark:text-violet-300">Two-Stage Decomposition Pipeline</h3>
        <p className="text-xs text-violet-600 dark:text-violet-400 mb-2">
          Document readers (PDF, Doc, Text) use a two-stage LLM pipeline for high-quality knowledge extraction,
          replacing the older "extract principles in 1-3 sentences" approach.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-violet-200 dark:border-violet-800">
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">Stage 1 — Claim Decomposition</p>
            <p className="text-xs text-violet-600 dark:text-violet-400">
              Runs per chunk. Decomposes each section into atomic classified claims: EMPIRICAL, RESTATEMENT,
              METHODOLOGICAL, SPECULATIVE, DEFINITIONAL. Tracks evidence strength, source location, dependencies,
              and confidence signals.
            </p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-violet-200 dark:border-violet-800">
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-1">Stage 2 — Claim Filtering</p>
            <p className="text-xs text-violet-600 dark:text-violet-400">
              Runs once per file on all Stage 1 output. Aggressively filters noise, assigns actions
              (seed/context/hypothesis/discard) and weights, and formats content for graph ingestion.
              Produces much higher quality nodes that preserve quantitative results and provenance.
            </p>
          </div>
        </div>
        <p className="text-xs text-violet-500 dark:text-violet-400 mt-2">
          Code and Sheet readers still use single-prompt curation (<code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">kb.curate_code</code>, <code className="bg-violet-100 dark:bg-violet-900/30 px-1 rounded">kb.curate_data</code>).
        </p>
      </div>

      {/* Key features */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Change Detection</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Every file is SHA-256 hashed on scan. When re-scanning, files with unchanged hashes are skipped
            entirely. This makes re-scans fast  - only modified or new files are reprocessed.
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Domain Mapping</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Each folder maps to a domain in the knowledge graph. With <strong>auto-domain subfolders</strong> enabled,
            subdirectory names become sub-domains (e.g., <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">papers/biology</code> maps
            to the "biology" domain).
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">File Watching</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            When <strong>watch</strong> is enabled on a folder, a chokidar file watcher monitors for changes in
            real time. New or modified files are automatically queued for processing. Deleted files are marked
            but their graph nodes are preserved.
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Pipeline Control</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            The pipeline processes files with configurable concurrency. Failed files can be retried individually
            or in bulk. The GUI shows pipeline status, file counts by status, and per-file chunk details.
          </p>
        </div>
      </div>

      {/* Raw Mode */}
      <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Raw Mode</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          When <strong>raw mode</strong> is enabled on a folder, files are stored as-is without LLM curation.
          This creates <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">raw</code> nodes instead
          of <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">seed</code> nodes. Raw nodes are
          embedded and queryable for RAG retrieval (proxy and context engine) but excluded from:
        </p>
        <ul className="text-xs text-gray-500 dark:text-gray-400 list-disc list-inside space-y-0.5 mb-2">
          <li>Synthesis engine (no pairing or voicing)</li>
          <li>Compress / Summarize (no knowledge summaries)</li>
          <li>Dedup (not compared against curated knowledge)</li>
          <li>Autonomous cycles (validation, questions, tensions)</li>
        </ul>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Use raw mode for large reference corpora where you want RAG retrieval without polluting the curated knowledge graph.
          Raw nodes appear in gray on the domain graph.
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          <strong className="text-gray-600 dark:text-gray-300">Filename embedding:</strong> Raw node content is
          prefixed with the filename (e.g. <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">[authService.ts] ...</code>)
          so the embedding model can align raw content with curated descriptions that reference the same file or concept.
        </p>
      </div>

      {/* GUI Page */}
      <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4">
        <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">Knowledge Base Page</h3>
        <p className="text-xs text-orange-600 dark:text-orange-400 mb-2">
          The <strong>Knowledge Base</strong> page in the sidebar provides full management of watched folders:
          add new folders with domain/pattern configuration, trigger scans, toggle watching, browse processed
          files with their chunks and status, retry failed files, and view ingestion statistics. Each folder
          card shows its status, file count, and last scan time.
        </p>
        <p className="text-xs text-orange-600 dark:text-orange-400">
          <strong className="text-orange-700 dark:text-orange-300">OS integration:</strong> The "Add Folder" dialog
          includes a <strong>Browse</strong> button that opens your OS native folder picker (hidden when accessing
          remotely). Folder paths and file names are clickable  - clicking opens the file or folder in your system's file explorer.
        </p>
        <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
          <strong className="text-orange-700 dark:text-orange-300">Network shares (SMB):</strong> The "Network Share" tab lets you
          connect to SMB/CIFS file shares with host, share name, username, password, and optional domain. On Windows, this uses{' '}
          <code className="bg-orange-100 dark:bg-orange-800/40 px-1 rounded">net use</code> to mount the share, after which the
          UNC path works like any local folder. Test the connection before adding, and manage active shares from the KB page header.
          Active connections persist until manually disconnected or the server restarts.
        </p>
      </div>

      {/* MCP Tool */}
      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">MCP Tool: podbit.kb</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          All KB operations are available via the <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">podbit.kb</code>{' '}
          <Link to="/help/tools" className="text-podbit-500 hover:text-podbit-400 underline">MCP tool</Link>, enabling AI agents to manage folder ingestion programmatically.
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">folders</p>
            <p className="text-gray-500 dark:text-gray-400">List watched folders</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">add / remove</p>
            <p className="text-gray-500 dark:text-gray-400">Manage folders</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">scan</p>
            <p className="text-gray-500 dark:text-gray-400">Trigger folder scan</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">files / file</p>
            <p className="text-gray-500 dark:text-gray-400">Browse files and chunks</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">reprocess / retry</p>
            <p className="text-gray-500 dark:text-gray-400">Re-read or retry failed</p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <p className="font-medium text-gray-700 dark:text-gray-300">readers / stats</p>
            <p className="text-gray-500 dark:text-gray-400">Plugin list and statistics</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default KBSection;
