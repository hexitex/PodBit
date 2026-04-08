

function ArchitectureDiagram() {
  return (
    <svg viewBox="0 0 880 420" className="w-full mx-auto" role="img" aria-label="System architecture - 4-tier layered view">
      <defs>
        <marker id="arrow-arch" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>
      <text x="12" y="52" className="text-xs fill-gray-400 dark:fill-gray-500 font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Clients</text>
      <text x="12" y="148" className="text-xs fill-gray-400 dark:fill-gray-500 font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Interface</text>
      <text x="12" y="258" className="text-xs fill-gray-400 dark:fill-gray-500 font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Core</text>
      <text x="12" y="352" className="text-xs fill-gray-400 dark:fill-gray-500 font-bold" style={{ textTransform: 'uppercase', letterSpacing: '0.1em' }}>Infra</text>
      <line x1="75" y1="90" x2="860" y2="90" stroke="#e2e8f0" strokeWidth="0.5" className="dark:stroke-gray-700" />
      <line x1="75" y1="200" x2="860" y2="200" stroke="#e2e8f0" strokeWidth="0.5" className="dark:stroke-gray-700" />
      <line x1="75" y1="310" x2="860" y2="310" stroke="#e2e8f0" strokeWidth="0.5" className="dark:stroke-gray-700" />
      {/* Clients */}
      <rect x="80" y="25" width="170" height="48" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="165" y="46" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">AI Agent</text>
      <text x="165" y="62" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">IDE / MCP client</text>
      <rect x="275" y="25" width="170" height="48" rx="6" fill="#8b5cf6" opacity="0.12" stroke="#8b5cf6" strokeWidth="1.5" />
      <text x="360" y="46" textAnchor="middle" className="text-xs font-semibold fill-purple-700 dark:fill-purple-400">GUI Dashboard</text>
      <text x="360" y="62" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">React + Vite</text>
      <rect x="500" y="25" width="345" height="48" rx="6" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1" className="dark:fill-gray-700 dark:stroke-gray-500" />
      <text x="672" y="46" textAnchor="middle" className="text-xs font-semibold fill-gray-700 dark:fill-gray-300">Any OpenAI-Compatible Client</text>
      <text x="672" y="62" textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">Chat apps, agents, scripts</text>
      <line x1="165" y1="73" x2="165" y2="108" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-arch)" />
      <text x="180" y="95" className="text-xs fill-gray-400 dark:fill-gray-500">stdio</text>
      <line x1="360" y1="73" x2="360" y2="108" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-arch)" />
      <text x="375" y="95" className="text-xs fill-gray-400 dark:fill-gray-500">HTTP</text>
      <line x1="672" y1="73" x2="672" y2="108" stroke="#94a3b8" strokeWidth="1.5" markerEnd="url(#arrow-arch)" />
      <text x="687" y="95" className="text-xs fill-gray-400 dark:fill-gray-500">HTTP</text>
      {/* Interface */}
      <rect x="80" y="108" width="170" height="68" rx="6" fill="#f59e0b" opacity="0.12" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="165" y="130" textAnchor="middle" className="text-xs font-semibold fill-amber-700 dark:fill-amber-400">MCP Server</text>
      <text x="165" y="145" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">mcp-stdio.ts</text>
      <text x="165" y="160" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">30+ tools via stdio</text>
      <rect x="275" y="108" width="200" height="68" rx="6" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1.5" />
      <text x="375" y="128" textAnchor="middle" className="text-xs font-semibold fill-emerald-700 dark:fill-emerald-400">REST API</text>
      <text x="375" y="143" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">server.ts + orchestrator.ts</text>
      <text x="375" y="158" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-400">Express (:4710)</text>
      <rect x="500" y="108" width="345" height="68" rx="6" fill="#f97316" opacity="0.12" stroke="#f97316" strokeWidth="1.5" />
      <text x="672" y="128" textAnchor="middle" className="text-xs font-semibold fill-orange-700 dark:fill-orange-400">Knowledge Proxy</text>
      <text x="672" y="143" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">proxy-server.ts (:11435)</text>
      <text x="672" y="158" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">OpenAI-compatible + context enrichment</text>
      <line x1="250" y1="140" x2="275" y2="140" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 2" markerEnd="url(#arrow-arch)" />
      <line x1="165" y1="176" x2="165" y2="218" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-arch)" />
      <line x1="360" y1="176" x2="360" y2="218" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-arch)" />
      <line x1="672" y1="176" x2="672" y2="218" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-arch)" />
      {/* Core */}
      <rect x="80" y="218" width="765" height="72" rx="8" fill="#0ea5e9" opacity="0.08" stroke="#0ea5e9" strokeWidth="1.5" />
      <text x="462" y="237" textAnchor="middle" className="text-xs font-semibold fill-sky-700 dark:fill-sky-400">Core Engine</text>
      <text x="462" y="250" textAnchor="middle" className="text-xs fill-sky-500 dark:fill-sky-400">core/*.ts · handlers/*.ts · models.ts</text>
      {['Synthesis', 'Voicing', 'Scoring', 'Context', 'Models', 'Config', 'Lab', 'KB'].map((name, i) => {
        const chipX = 110 + i * 90;
        return (
          <g key={name}>
            <rect x={chipX} y="258" width="80" height="20" rx="4" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="0.5" />
            <text x={chipX + 40} y="272" textAnchor="middle" className="text-xs font-medium fill-sky-600 dark:fill-sky-400">{name}</text>
          </g>
        );
      })}
      <line x1="160" y1="290" x2="160" y2="328" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-arch)" />
      <line x1="340" y1="290" x2="340" y2="328" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-arch)" />
      <line x1="530" y1="290" x2="530" y2="328" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-arch)" />
      <line x1="720" y1="290" x2="720" y2="328" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" markerEnd="url(#arrow-arch)" />
      {/* Infra */}
      <rect x="80" y="328" width="175" height="60" rx="6" fill="#ef4444" opacity="0.1" stroke="#ef4444" strokeWidth="1.5" />
      <text x="167" y="346" textAnchor="middle" className="text-xs font-semibold fill-red-700 dark:fill-red-400">SQLite</text>
      <text x="167" y="360" textAnchor="middle" className="text-xs fill-red-600 dark:fill-red-400">better-sqlite3, WAL mode</text>
      <text x="167" y="378" textAnchor="middle" style={{ fontSize: '10px' }} className="fill-rose-500 dark:fill-rose-400">fine-grained undo journal</text>
      <rect x="270" y="328" width="155" height="48" rx="6" fill="#f59e0b" opacity="0.1" stroke="#f59e0b" strokeWidth="1.5" />
      <text x="347" y="350" textAnchor="middle" className="text-xs font-semibold fill-amber-700 dark:fill-amber-400">Embeddings</text>
      <text x="347" y="365" textAnchor="middle" className="text-xs fill-amber-600 dark:fill-amber-400">Ollama / LM Studio</text>
      <rect x="440" y="328" width="210" height="48" rx="6" fill="#8b5cf6" opacity="0.1" stroke="#8b5cf6" strokeWidth="1.5" />
      <text x="545" y="350" textAnchor="middle" className="text-xs font-semibold fill-purple-700 dark:fill-purple-400">LLM Providers</text>
      <text x="545" y="365" textAnchor="middle" className="text-xs fill-purple-600 dark:fill-purple-400">OpenAI Compat / Local / Z.AI</text>
      <rect x="665" y="328" width="175" height="48" rx="6" fill="#f97316" opacity="0.12" stroke="#f97316" strokeWidth="1.5" />
      <text x="752" y="350" textAnchor="middle" className="text-xs font-semibold fill-orange-700 dark:fill-orange-400">File System</text>
      <text x="752" y="365" textAnchor="middle" className="text-xs fill-orange-600 dark:fill-orange-400">Watched folders</text>
      <text x="462" y="408" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">All services auto-started by the orchestrator on MCP client connect</text>
    </svg>
  );
}

function ScalingDiagram() {
  const projects = [
    { label: 'Biology', detail: '3.2K nodes' },
    { label: 'Codebase', detail: '2.0K nodes' },
    { label: 'Research', detail: '800 nodes' },
    { label: 'Recipes', detail: '450 nodes' },
    { label: 'Legal', detail: '1.1K nodes' },
    { label: 'ML Models', detail: '650 nodes' },
    { label: 'Client A', detail: '300 nodes' },
    { label: 'New...', detail: '0 nodes' },
  ];
  const cw = 130, ch = 52, gx = 16, gy = 16, cols = 4;
  const gw = cols * cw + (cols - 1) * gx;
  const vw = 650;
  const sx = Math.round((vw - gw) / 2);
  const r1 = 148, r2 = r1 + ch + gy;
  const colX = (c) => sx + c * (cw + gx);
  const colCX = (c) => colX(c) + cw / 2;
  return (
    <svg viewBox={`0 0 ${vw} ${r2 + ch + 28}`} className="w-full max-w-2xl mx-auto" role="img"
      aria-label="Project sharding - each project is an independent SQLite file">
      <defs>
        <marker id="arrow-scale" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
        </marker>
      </defs>
      <text x={vw / 2} y="20" textAnchor="middle" className="text-sm font-bold fill-gray-700 dark:fill-gray-300">Project Sharding — Load &amp; Switch</text>
      <rect x="200" y="36" width="250" height="44" rx="8" fill="#10b981" fillOpacity="0.1" stroke="#10b981" strokeWidth="1.5" />
      <text x={vw / 2} y="55" textAnchor="middle" className="text-xs font-semibold fill-emerald-700 dark:fill-emerald-400">Podbit Server</text>
      <text x={vw / 2} y="70" textAnchor="middle" className="text-xs fill-emerald-600 dark:fill-emerald-500" opacity="0.8">One project loaded at a time</text>
      <path d={`M ${vw / 2 - 60} 80 C ${vw / 2 - 60} 116, ${colCX(0)} 116, ${colCX(0)} ${r1 - 4}`}
        stroke="#10b981" strokeWidth="2" fill="none" markerEnd="url(#arrow-scale)" />
      {projects.map((p, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = colX(col);
        const y = row === 0 ? r1 : r2;
        const cx = colCX(col);
        const active = i === 0;
        return (
          <g key={i} opacity={active ? 1 : 0.6}>
            <rect x={x} y={y} width={cw} height={ch} rx="6"
              fill={active ? '#10b981' : '#94a3b8'} fillOpacity={active ? 0.15 : 0.04}
              stroke={active ? '#10b981' : '#cbd5e1'} strokeWidth={active ? 2.5 : 0.8}
              className={active ? '' : 'dark:stroke-gray-600'} />
            {active && <circle cx={x + 14} cy={y + 14} r="4" fill="#10b981" />}
            <text x={cx} y={y + 18} textAnchor="middle"
              className={`text-xs font-semibold ${active ? 'fill-emerald-700 dark:fill-emerald-400' : 'fill-gray-600 dark:fill-gray-400'}`}>{p.label}</text>
            <text x={cx} y={y + 33} textAnchor="middle" className="text-xs fill-gray-500 dark:fill-gray-400">{p.detail}</text>
            <text x={cx} y={y + 46} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '10px' }}>.db file</text>
          </g>
        );
      })}
      <text x={vw / 2} y={r2 + ch + 14} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: '10px' }}>
        data/projects/ — each project is a separate database file with its own undo journal
      </text>
    </svg>
  );
}

function DualDbDiagram() {
  return (
    <svg viewBox="0 0 880 380" className="w-full mx-auto" role="img" aria-label="Dual-database architecture">
      <defs>
        <marker id="arrow-pd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* System DB - left */}
      <rect x="30" y="30" width="340" height="300" rx="12" fill="#6366f1" opacity="0.1" stroke="#6366f1" strokeWidth="2" />
      <text x="200" y="60" textAnchor="middle" className="fill-indigo-700 dark:fill-indigo-300 text-sm font-bold">system.db (permanent)</text>
      <text x="200" y="80" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">Shared across all projects</text>

      <rect x="45" y="95" width="150" height="30" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="120" y="115" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">model_registry</text>

      <rect x="205" y="95" width="155" height="30" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="282" y="115" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">subsystem_assignments</text>

      <rect x="45" y="135" width="150" height="30" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="120" y="155" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">prompts</text>

      <rect x="205" y="135" width="155" height="30" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="282" y="155" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">config_history</text>

      <rect x="45" y="175" width="150" height="30" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="120" y="195" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">breakthrough_registry</text>

      <rect x="205" y="175" width="155" height="30" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="282" y="195" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">llm_usage_log</text>

      <rect x="45" y="215" width="150" height="30" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="120" y="235" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">config_snapshots</text>

      <rect x="205" y="215" width="155" height="30" rx="5" fill="#6366f1" opacity="0.12" stroke="#6366f1" strokeWidth="1" />
      <text x="282" y="235" textAnchor="middle" className="fill-indigo-600 dark:fill-indigo-400 text-xs">api_registry</text>

      <text x="200" y="275" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">Models, prompts, and config stay</text>
      <text x="200" y="292" textAnchor="middle" className="fill-indigo-500 dark:fill-indigo-400 text-xs">constant when you switch projects</text>

      {/* Project DB - right */}
      <rect x="510" y="30" width="340" height="300" rx="12" fill="#10b981" opacity="0.1" stroke="#10b981" strokeWidth="2" />
      <text x="680" y="60" textAnchor="middle" className="fill-emerald-700 dark:fill-emerald-300 text-sm font-bold">project.db (per-project)</text>
      <text x="680" y="80" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">Swapped when you load a project</text>

      <rect x="525" y="95" width="155" height="30" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="602" y="115" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">nodes</text>

      <rect x="690" y="95" width="145" height="30" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="762" y="115" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">edges</text>

      <rect x="525" y="135" width="155" height="30" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="602" y="155" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">domain_partitions</text>

      <rect x="690" y="135" width="145" height="30" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="762" y="155" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">lab_executions</text>

      <rect x="525" y="175" width="155" height="30" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="602" y="195" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">kb_folders / kb_files</text>

      <rect x="690" y="175" width="145" height="30" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="762" y="195" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">number_registry</text>

      <rect x="525" y="215" width="155" height="30" rx="5" fill="#f43f5e" opacity="0.12" stroke="#f43f5e" strokeWidth="1.5" />
      <text x="602" y="235" textAnchor="middle" className="fill-rose-600 dark:fill-rose-400 text-xs font-medium">graph_journal</text>

      <rect x="690" y="215" width="145" height="30" rx="5" fill="#10b981" opacity="0.12" stroke="#10b981" strokeWidth="1" />
      <text x="762" y="235" textAnchor="middle" className="fill-emerald-600 dark:fill-emerald-400 text-xs">activity_log</text>

      <text x="680" y="270" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">Each project is a fully independent</text>
      <text x="680" y="284" textAnchor="middle" className="fill-emerald-500 dark:fill-emerald-400 text-xs">knowledge graph with its own data</text>
      <text x="680" y="302" textAnchor="middle" className="fill-rose-500 dark:fill-rose-400" style={{ fontSize: '10px' }}>Fine-grained undo journal with time-based rollback &amp; node pinning</text>

      {/* Switch arrow */}
      <path d="M 400 170 L 480 170" fill="none" stroke="#94a3b8" strokeWidth="2" strokeDasharray="6 4" markerEnd="url(#arrow-pd)" />
      <text x="440" y="160" textAnchor="middle" className="fill-gray-500 dark:fill-gray-400 text-xs">switch</text>

      {/* Bottom label */}
      <text x="440" y="365" textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-xs">SQLite with WAL mode + trigger-based undo journal -- efficient up to ~10K nodes with in-memory similarity search</text>
    </svg>
  );
}

function PartitionDiagram() {
  return (
    <svg viewBox="0 0 880 280" className="w-full mx-auto" role="img" aria-label="Partitions and bridging">
      <defs>
        <marker id="arrow-part" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
        </marker>
      </defs>

      {/* Partition A */}
      <rect x="30" y="30" width="300" height="180" rx="12" fill="#a855f7" opacity="0.1" stroke="#a855f7" strokeWidth="2" />
      <text x="180" y="55" textAnchor="middle" className="fill-purple-700 dark:fill-purple-300 text-sm font-bold">Partition: Biology</text>

      <rect x="50" y="70" width="120" height="45" rx="6" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1" />
      <text x="110" y="97" textAnchor="middle" className="fill-purple-600 dark:fill-purple-400 text-xs font-medium">neuroscience</text>

      <rect x="190" y="70" width="120" height="45" rx="6" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1" />
      <text x="250" y="97" textAnchor="middle" className="fill-purple-600 dark:fill-purple-400 text-xs font-medium">genetics</text>

      <rect x="120" y="130" width="120" height="45" rx="6" fill="#a855f7" opacity="0.15" stroke="#a855f7" strokeWidth="1" />
      <text x="180" y="157" textAnchor="middle" className="fill-purple-600 dark:fill-purple-400 text-xs font-medium">cell-biology</text>

      <text x="180" y="200" textAnchor="middle" className="fill-purple-500 dark:fill-purple-400 text-xs">Domains synthesize freely within partition</text>

      {/* Partition B */}
      <rect x="550" y="30" width="300" height="180" rx="12" fill="#0ea5e9" opacity="0.1" stroke="#0ea5e9" strokeWidth="2" />
      <text x="700" y="55" textAnchor="middle" className="fill-sky-700 dark:fill-sky-300 text-sm font-bold">Partition: AI Research</text>

      <rect x="570" y="70" width="120" height="45" rx="6" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1" />
      <text x="630" y="97" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs font-medium">alignment</text>

      <rect x="710" y="70" width="120" height="45" rx="6" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1" />
      <text x="770" y="97" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs font-medium">architecture</text>

      <rect x="640" y="130" width="120" height="45" rx="6" fill="#0ea5e9" opacity="0.15" stroke="#0ea5e9" strokeWidth="1" />
      <text x="700" y="157" textAnchor="middle" className="fill-sky-600 dark:fill-sky-400 text-xs font-medium">interpretability</text>

      <text x="700" y="200" textAnchor="middle" className="fill-sky-500 dark:fill-sky-400 text-xs">Isolated unless explicitly bridged</text>

      {/* Bridge */}
      <path d="M 330 120 C 390 100, 490 100, 550 120" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="8 4" markerEnd="url(#arrow-part)" />
      <path d="M 550 120 C 490 140, 390 140, 330 120" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeDasharray="8 4" markerEnd="url(#arrow-part)" />
      <rect x="400" y="105" width="80" height="22" rx="4" fill="#fef3c7" className="dark:fill-amber-900/50" stroke="#f59e0b" strokeWidth="1" />
      <text x="440" y="120" textAnchor="middle" className="fill-amber-700 dark:fill-amber-300 text-xs font-semibold">Bridge</text>

      {/* System partition - bottom */}
      <rect x="310" y="230" width="260" height="40" rx="8" fill="#ef4444" opacity="0.1" stroke="#ef4444" strokeWidth="1.5" strokeDasharray="6 3" />
      <text x="440" y="255" textAnchor="middle" className="fill-red-600 dark:fill-red-400 text-xs font-medium">System partition (isolated, cannot bridge)</text>
    </svg>
  );
}

/** Help section: Projects and domains — architecture, scaling, dual DB, partitions. */
function Part3ProjectsDomains() {
  return (
    <div className="space-y-6">

      {/* Opening */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Projects, Domains &amp; Data</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          Podbit organizes knowledge into projects, domains, and partitions. Each project is an independent
          knowledge graph. Domains label topics within a project. Partitions control which domains can
          synthesize together.
        </p>
      </div>

      {/* Projects */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Projects</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Each project is a separate SQLite database file. You can run multiple research projects in parallel,
          each with its own nodes, domains, partitions, and knowledge base folders. Switching projects swaps the
          project database while keeping your models and system configuration intact.
        </p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-sky-50 dark:bg-sky-900/30 rounded-lg p-3 border border-sky-200 dark:border-sky-700">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Save / Save As</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">Save the current project state. Save As creates a named copy.</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/30 rounded-lg p-3 border border-sky-200 dark:border-sky-700">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">New Project</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">Create an empty knowledge graph. Optionally uses interview-based creation.</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/30 rounded-lg p-3 border border-sky-200 dark:border-sky-700">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Load Project</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">Shows node count, domains, and file size for each saved project.</p>
          </div>
          <div className="bg-sky-50 dark:bg-sky-900/30 rounded-lg p-3 border border-sky-200 dark:border-sky-700">
            <p className="text-xs font-semibold text-sky-700 dark:text-sky-300 mb-1">Delete Project</p>
            <p className="text-xs text-sky-600 dark:text-sky-400">Permanently remove a saved project. Cannot delete the active project.</p>
          </div>
        </div>
      </div>

      {/* Interview-Based Creation */}
      <div className="bg-purple-50 dark:bg-purple-900/30 border border-purple-200 dark:border-purple-700 rounded-lg p-4">
        <h3 className="font-semibold text-purple-700 dark:text-purple-300 text-sm mb-2">Interview-Based Project Creation</h3>
        <p className="text-xs text-purple-600 dark:text-purple-400 mb-3">
          When creating a new project, Podbit can run a multi-turn LLM conversation to discover your research
          purpose, suggest domains, and define goals. The interview auto-generates a project manifest with
          partitions and bridges so you can start seeding knowledge immediately.
        </p>
        <p className="text-xs text-purple-600 dark:text-purple-400">
          See{' '}
          <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="first-steps">First Steps</a>{' '}
          for a walkthrough of this flow.
        </p>
      </div>

      {/* Project Manifest */}
      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Project Manifest</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
          Every project has a manifest stored in the settings table. It provides context to all LLM subsystems,
          grounding their reasoning in your project's purpose.
        </p>
        <div className="space-y-2">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">purpose</p>
            <p className="text-xs text-amber-500 dark:text-amber-400">One sentence grounding all LLM reasoning for this project.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">domains</p>
            <p className="text-xs text-amber-500 dark:text-amber-400">List of domain names with descriptions. Prevents LLMs from misinterpreting domain labels.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">goals</p>
            <p className="text-xs text-amber-500 dark:text-amber-400">What you want to learn or discover from this project.</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-amber-100 dark:border-amber-800">
            <p className="text-xs font-medium text-amber-700 dark:text-amber-300">keyQuestions</p>
            <p className="text-xs text-amber-500 dark:text-amber-400">Open questions to investigate. Guide research and question cycles.</p>
          </div>
        </div>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
          Update the manifest via MCP (<code className="text-amber-700 dark:text-amber-300">podbit.projects updateManifest</code>) or
          through the GUI Data page.
        </p>
      </div>

      {/* Domains */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Domains</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Domains are string labels on nodes that organize knowledge into logical groups — for example,
          "biology", "alignment", or "architecture". Each KB folder maps to a domain. Domains are dynamic:
          they appear when nodes are seeded with a new domain label and can be discovered at any time via{' '}
          <code className="text-sm text-gray-800 dark:text-gray-200">podbit.partitions list</code>.
        </p>

        <div className="bg-gray-100 dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-600 dark:text-gray-400">
            <strong className="text-gray-800 dark:text-gray-200">Choosing domains:</strong> Use descriptive labels that
            reflect research topics, not implementation details. When ingesting files through the Knowledge Base, each
            folder maps to a domain — see{' '}
            <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="adding-knowledge">Adding Knowledge</a>{' '}
            for details on KB domain mapping.
          </p>
        </div>
      </div>

      {/* Partitions */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Partitions</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Partitions group domains into isolated sets. Nodes in different partitions <strong>cannot</strong>{' '}
          synthesize together unless the partitions are explicitly bridged. This prevents unrelated topics
          from contaminating each other during autonomous cycles.
        </p>
      </div>

      {/* Partition diagram */}
      <PartitionDiagram />

      {/* Partition details */}
      <div className="space-y-3">
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
          <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Bridging Partitions</h3>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Create bridges between partitions to allow cross-domain synthesis. Bridged partitions can pair nodes
            across their domains, enabling cross-pollination of ideas. Manage bridges through the GUI Data page
            or via MCP (<code className="text-amber-700 dark:text-amber-300">podbit.partitions createBridge</code>).
            Cross-partition synthesis nodes get provenance domain naming (e.g., "podbit&lt;x&gt;biology") to track
            their origin.
          </p>
        </div>

        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <h3 className="font-semibold text-red-700 dark:text-red-300 text-sm mb-2">System Partitions</h3>
          <p className="text-xs text-red-600 dark:text-red-400">
            Some partitions are marked as <strong>system</strong> (e.g., know-thyself). System partitions
            synthesize internally but cannot be bridged to user partitions.
            They are excluded from research cycles and are auto-populated by internal processes like
            config tuning. Do not manually seed into system partitions.
          </p>
        </div>

        <div className="bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg p-4">
          <h3 className="font-semibold text-violet-700 dark:text-violet-300 text-sm mb-2">Cycle Controls</h3>
          <p className="text-xs text-violet-600 dark:text-violet-400">
            By default, partitions participate in all autonomous cycles (synthesis, voicing, research,
            tensions, questions, validation, lab verification). You can restrict a partition to specific cycles using the
            <strong> Allowed Cycles</strong> setting in the partition edit modal. For example, a curated KB
            partition can be set to only participate in synthesis and voicing — its nodes will form relationships
            but won't trigger research questions, tension detection, or verification attempts. Set via MCP:{' '}
            <code className="text-violet-700 dark:text-violet-300">
              podbit.partitions update id=&quot;my-partition&quot; allowed_cycles=[&quot;synthesis&quot;,&quot;voicing&quot;]
            </code>.
            Set <code className="text-violet-700 dark:text-violet-300">allowed_cycles=null</code> to restore
            unrestricted participation.
          </p>
        </div>

        <div className="bg-sky-50 dark:bg-sky-900/30 border border-sky-200 dark:border-sky-700 rounded-lg p-4">
          <h3 className="font-semibold text-sky-700 dark:text-sky-300 text-sm mb-2">Export / Import</h3>
          <p className="text-xs text-sky-600 dark:text-sky-400">
            Share partitions between Podbit instances as <code className="text-sky-700 dark:text-sky-300">.podbit.json</code>{' '}
            files. Export includes the partition, its domains, all active nodes (without embeddings), edges,
            and bridges. Import into another instance with optional overwrite for collisions. Manage via MCP:{' '}
            <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="slash-commands">MCP Tools Reference</a>.
          </p>
        </div>
      </div>

      {/* Dual-Database Architecture */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Dual-Database Architecture</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Podbit runs two concurrent SQLite databases. The <strong>system database</strong> (system.db) is
          permanent and shared across all projects — it stores models, prompts, subsystem assignments, and
          configuration history. The <strong>project database</strong> is per-project and holds the knowledge
          graph itself: nodes, edges, partitions, KB files, and all project-specific data.
        </p>
      </div>

      {/* Dual DB diagram */}
      <DualDbDiagram />

      <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-lg p-4">
        <h3 className="font-semibold text-indigo-700 dark:text-indigo-300 text-sm mb-2">What Happens When You Switch Projects</h3>
        <p className="text-xs text-indigo-600 dark:text-indigo-400">
          The system database stays open — your model assignments, prompts, and configuration are untouched.
          Only the project database is closed and the new one opened. All caches are cleared, the synthesis
          engine reinitializes, and KB watchers restart for the new project's folders. SQLite uses WAL
          (Write-Ahead Logging) mode for concurrent read/write safety.
        </p>
      </div>

      {/* Database Management */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Database Management</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The Data page in the GUI provides tools for backup, cleanup, and integrity verification.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-700">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Backup &amp; Restore</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Create named backups of both databases. View backup list with size and date. Restore from any saved backup.</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-700">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Stats &amp; Health</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Node count by type and domain. Graph health metrics. Synthesis engine status and cycle counts.</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-700">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Cleanup</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Delete nodes by type or domain. Clear knowledge cache, cross-domain patterns, and decision log.</p>
          </div>
          <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-3 border border-emerald-200 dark:border-emerald-700">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-1">Integrity Verification</p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">Merkle DAG content hashing provides cryptographic provenance. Verify that node content has not been tampered with.</p>
          </div>
        </div>
      </div>

      {/* Number Variables */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Number Variables</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          The number variable system prevents synthesis from universalizing domain-specific numbers across
          unrelated domains. For example, "1-5% activation density" from biology should not become a universal
          constant when synthesized with physics knowledge.
        </p>

        <div className="bg-orange-50 dark:bg-orange-900/30 border border-orange-200 dark:border-orange-700 rounded-lg p-4 mb-3">
          <h3 className="font-semibold text-orange-700 dark:text-orange-300 text-sm mb-2">How It Works</h3>
          <div className="space-y-2 text-xs text-orange-600 dark:text-orange-400">
            <p>
              <strong className="text-orange-700 dark:text-orange-300">1. Extraction:</strong> When a node is created,
              all numeric values are extracted and stored in a registry.
            </p>
            <p>
              <strong className="text-orange-700 dark:text-orange-300">2. Placeholder replacement:</strong> Numbers in
              node content are replaced with <code className="text-orange-700 dark:text-orange-300">[[[PREFIX+nnn]]]</code>{' '}
              placeholders. The prefix is derived from a per-installation UUID, making variable IDs globally unique.
            </p>
            <p>
              <strong className="text-orange-700 dark:text-orange-300">3. Resolution:</strong> Before any LLM receives
              node content, placeholders are resolved back to actual values. Voicing uses a different path — it keeps
              placeholders but injects a variable legend so the LLM sees each value's domain provenance.
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Registry Fields</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 pr-3 text-gray-500 dark:text-gray-400 font-medium">Field</th>
                  <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="text-gray-600 dark:text-gray-400">
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3 font-mono text-gray-700 dark:text-gray-300">var_id</td>
                  <td className="py-2 px-3">Unique placeholder identifier (e.g., SBKR42)</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3 font-mono text-gray-700 dark:text-gray-300">value</td>
                  <td className="py-2 px-3">The actual numeric value</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3 font-mono text-gray-700 dark:text-gray-300">scope_text</td>
                  <td className="py-2 px-3">Surrounding context window (words around the number)</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3 font-mono text-gray-700 dark:text-gray-300">domain</td>
                  <td className="py-2 px-3">Which domain the number belongs to</td>
                </tr>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-2 pr-3 font-mono text-gray-700 dark:text-gray-300">source_node_id</td>
                  <td className="py-2 px-3">The node this number was extracted from</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
            Enable number variables in{' '}
            <a href="#" className="docs-link-internal text-podbit-500 hover:text-podbit-400 underline" data-doc="configuration">Algorithm Parameters</a>{' '}
            under the Number Variables section.
          </p>
        </div>
      </div>

      {/* Journal & Rollback */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Journal &amp; Rollback</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Every structural change to the knowledge graph is automatically recorded by SQLite triggers into an undo journal.
          Unlike traditional database rollback which is all-or-nothing, Podbit's journaling is purpose-built for
          knowledge graphs — it lets you roll back to any point in time while <strong>selectively preserving</strong> valuable
          nodes. Pin a breakthrough and its entire parent ancestry is automatically exported, the rollback executes,
          and the pinned lineage is reimported with original timestamps intact. This means you can undo a bad KB
          ingestion or runaway synthesis cycle without losing genuine insights that emerged from it.
        </p>
      </div>

      <div className="bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-700 rounded-lg p-4">
        <h3 className="font-semibold text-rose-700 dark:text-rose-300 text-sm mb-2">What Gets Journaled</h3>
        <p className="text-xs text-rose-600 dark:text-rose-400 mb-2">
          <strong>Structural changes only</strong> — node creation, deletion, content edits, type changes, domain moves,
          archive/junk status, verification results, and lab status. Scoring metadata (weight, salience, barren cycles,
          lifecycle state) is <strong>not</strong> journaled — it is recalculated by the synthesis engine and would
          generate thousands of noise entries per cycle.
        </p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-rose-100 dark:border-rose-700">
            <p className="font-medium text-rose-700 dark:text-rose-300">Journaled Tables</p>
            <p className="text-rose-500 dark:text-rose-400">nodes, edges, domain_partitions, partition_domains, partition_bridges, number_registry, node_number_refs</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border border-rose-100 dark:border-rose-700">
            <p className="font-medium text-rose-700 dark:text-rose-300">Not Journaled</p>
            <p className="text-rose-500 dark:text-rose-400">activity_log, resonance_cycles, lab_executions, knowledge_cache, config_history, chat sessions, feedback</p>
          </div>
        </div>
      </div>

      <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-lg p-4">
        <h3 className="font-semibold text-amber-700 dark:text-amber-300 text-sm mb-2">Timeline &amp; Rollback Flow</h3>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-2">
          The Journal section on the Data page shows journal entries grouped into time buckets with human-readable
          descriptions (e.g., &ldquo;3 nodes created in Optimization Algorithms&rdquo;, &ldquo;2 edges added&rdquo;).
        </p>
        <ol className="text-xs text-amber-600 dark:text-amber-400 list-decimal list-inside space-y-1 mb-2">
          <li>Hover any time bucket and click <strong>Restore</strong> to preview what would be undone</li>
          <li>The preview shows nodes that will be removed, reverted, or re-created — with a per-table breakdown</li>
          <li>All <strong>pinnable nodes</strong> (voiced, synthesis, possible, elite, breakthrough) created after the restore point are listed with checkboxes</li>
          <li>Select nodes you want to keep, then click <strong>Pin &amp; Restore</strong></li>
          <li>The system exports pinned nodes plus their full parent ancestry, executes the rollback, then reimports the pinned package with original IDs and timestamps</li>
        </ol>
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Seeds are not pinnable — they are automatically captured as ancestors of any pinned node.
          All background services (synthesis, voicing, research cycles) are stopped before rollback executes.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Pinning &amp; Preservation</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            Pinned nodes retain their original <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">created_at</code> and{' '}
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">updated_at</code> — they are reimported
            with <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">INSERT OR IGNORE</code> using original GUIDs.
            On a timeline, a preserved node from days ago sitting alongside new nodes visually shows it survived a rollback.
          </p>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">Clipping</h3>
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
            The <strong>Clip</strong> button trims journal entries from the oldest end. There is no automatic retention policy —
            if you load a project dormant for months, its journal is preserved until you manually clip it.
            Clipping is irreversible: you cannot roll back past a clipped point.
          </p>
        </div>
      </div>

      <div className="bg-gray-50 dark:bg-gray-800 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-2 text-gray-900 dark:text-gray-200">MCP Tool Reference</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          All journal operations are available via <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">podbit.journal</code>:
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">timeline</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">List timeline markers</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">entries</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">Query raw journal</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">stats</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">Journal statistics</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">preview</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">Preview rollback impact</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">pin</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">Pin nodes to keep</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">rollback</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">Execute rollback</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">prune</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">Clip old entries</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">marker</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">Create manual marker</p>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded p-2 border dark:border-gray-700">
            <code className="text-rose-600 dark:text-rose-400">pins</code> / <code className="text-rose-600 dark:text-rose-400">unpin</code>
            <p className="text-gray-500 dark:text-gray-400 mt-0.5">Manage pin groups</p>
          </div>
        </div>
      </div>

      {/* Architecture Overview */}
      <div>
        <h2 className="text-xl font-bold mb-3 text-gray-900 dark:text-gray-200">Architecture Overview</h2>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">
          Podbit is a 4-tier application — Clients, Interface, Core Engine, and Infrastructure — built with
          Node.js, React, SQLite, and Tailwind CSS.
        </p>
      </div>

      <ArchitectureDiagram />

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Technology Stack</h3>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
            <li><strong>Runtime:</strong> Node.js 18+ with tsx (TypeScript, no build step)</li>
            <li><strong>Backend:</strong> TypeScript, Express.js</li>
            <li><strong>Frontend:</strong> React, Tailwind CSS, React Query, Vite</li>
            <li><strong>Database:</strong> SQLite (better-sqlite3, WAL mode)</li>
            <li><strong>Embeddings:</strong> Ollama / LM Studio (set EMBEDDING_MODEL in .env)</li>
            <li><strong>LLM:</strong> Any OpenAI-compatible API (per-subsystem assignment)</li>
            <li><strong>Proxy:</strong> OpenAI-compatible knowledge proxy (:11435)</li>
            <li><strong>Protocol:</strong> MCP via @modelcontextprotocol/sdk</li>
          </ul>
        </div>
        <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
          <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Key Files</h3>
          <ul className="text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">mcp-stdio.ts</code> — MCP entry point (auto-starts orchestrator)</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">mcp-server.ts</code> — Tool definitions + dispatch</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">handlers/*.ts</code> — Tool implementations</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">core/*.ts</code> — Synthesis engine, voicing, scoring, context</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">kb/*.ts</code> — KB pipeline, scanner, readers, watcher</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">models.ts</code> — LLM provider abstraction + model registry</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">server.ts</code> — Express REST API</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">proxy-server.ts</code> — Knowledge proxy (:11435)</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">orchestrator.ts</code> — Service lifecycle</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">evm/</code> — Verification pipeline (spec extraction, lab client, evaluation)</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">lab/</code> — Lab framework (freeze, taint, templates, evidence)</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">core/integrity.ts</code> — Merkle DAG content hashing</li>
            <li><code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">core/number-variables.ts</code> — Domain-scoped numeric isolation</li>
          </ul>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg p-4">
        <h3 className="font-semibold text-sm mb-3 text-gray-900 dark:text-gray-200">Service Startup Sequence</h3>
        <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
          When an MCP client starts the server, it automatically boots the full stack:
        </p>
        <ol className="text-xs text-gray-600 dark:text-gray-400 space-y-1 list-decimal list-inside">
          <li>MCP stdio server checks if orchestrator is running (health check on :4711)</li>
          <li>If not running, spawns orchestrator as a detached process</li>
          <li>Orchestrator starts the REST API server, knowledge proxy, and GUI dev server</li>
          <li>MCP server optionally opens browser to GUI dashboard</li>
          <li>MCP stdio transport connects — tools become available</li>
        </ol>
      </div>

      <ScalingDiagram />

    </div>
  );
}

export default Part3ProjectsDomains;
