import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Filter, GitBranch, List, Search } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import api, { resonance } from '../lib/api';
import DomainGraph from '../components/DomainGraph';
import TagSelector from '../components/TagSelector';
import FamilyTreeModal from '../components/FamilyTreeModal';
import NodeCard from './resonance/NodeCard';
import NodeDetail from './resonance/NodeDetail';
import CreateNodeForm from './resonance/CreateNodeForm';

const DEFAULT_FILTERS = {
  search: '',
  domains: [],
  nodeType: '',
  trajectory: '',
  feedbackRating: '',
  keywords: [],
  minWeight: '',
  minComposite: '',
  orderBy: 'weight',
};

/** Graph page: list/graph view, filters, node detail, and create. */
export default function Resonance() {
  const [searchParams, _setSearchParams] = useSearchParams();
  const [selectedNode, setSelectedNode] = useState(null);
  const [navigationHistory, setNavigationHistory] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(() => localStorage.getItem('graph-advanced-filters') === 'true');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('graph-view-mode') || 'list');
  const [graphLimit, setGraphLimit] = useState(() => {
    const saved = localStorage.getItem('graph-node-limit');
    return saved ? parseInt(saved, 10) : 500;
  });
  const [viewedNodes, setViewedNodes] = useState(() => new Set());
  const [treeNode, setTreeNode] = useState(null);

  const selectAndTrackNode = useCallback((node) => {
    if (!node?.id) return; // ignore error responses from API
    setViewedNodes(prev => { const s = new Set(prev); s.add(node.id); return s; });
    setSelectedNode(node);
  }, []);

  // Auto-open node from ?node= query parameter
  const handledNodeRef = useRef(null);
  useEffect(() => {
    const nodeId = searchParams.get('node');
    if (!nodeId || nodeId === handledNodeRef.current) return;
    handledNodeRef.current = nodeId;
    window.history.replaceState({}, '', window.location.pathname);
    resonance.getNode(nodeId).then(data => {
      if (data?.id) selectAndTrackNode(data);
    }).catch(() => {});
  }, [searchParams, selectAndTrackNode]);

  const [filters, setFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('graph-filters');
      if (saved) return { ...DEFAULT_FILTERS, ...JSON.parse(saved) };
    } catch { /* ignore */ }
    return DEFAULT_FILTERS;
  });

  useEffect(() => { localStorage.setItem('graph-filters', JSON.stringify(filters)); }, [filters]);

  const { data: domainsData } = useQuery({
    queryKey: ['domains'],
    queryFn: async () => (await api.get('/seeds/domains')).data.domains,
    staleTime: 60000,
  });
  const domains = domainsData || [];

  const { data: keywordsData } = useQuery({
    queryKey: ['keywords'],
    queryFn: resonance.getKeywords,
    staleTime: 60000,
  });
  const topKeywords = keywordsData?.keywords || [];

  const queryFilters = Object.fromEntries(
    Object.entries({
      ...filters,
      domains: filters.domains.length > 0 ? filters.domains : undefined,
      keywords: filters.keywords.length > 0 ? filters.keywords : undefined,
      minWeight: filters.minWeight ? parseFloat(filters.minWeight) : undefined,
      minComposite: filters.minComposite ? parseFloat(filters.minComposite) : undefined,
    }).filter(([, v]) => v !== '' && v !== undefined)
  );

  const { data, isLoading } = useQuery({
    queryKey: ['resonance', 'nodes', queryFilters],
    queryFn: () => resonance.getNodes({ ...queryFilters, limit: 50 }),
  });

  const breakthroughCount = data?.nodes?.filter(n => n.type === 'breakthrough').length || 0;

  const closeSidePanel = () => { setSelectedNode(null); setNavigationHistory([]); };

  // Shared side-panel renderer used in both list and graph modes
  const SidePanel = ({ empty }) => {
    if (showCreateForm) return <CreateNodeForm onClose={() => setShowCreateForm(false)} domains={domains} />;
    if (selectedNode) return (
      <NodeDetail
        node={selectedNode}
        onClose={closeSidePanel}
        onSelectNode={selectAndTrackNode}
        onShowTree={(n) => setTreeNode(n)}
        navigationHistory={navigationHistory}
        onNavigationChange={setNavigationHistory}
        domains={domains}
      />
    );
    return empty
      ? <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">{empty}</div>
      : null;
  };

  const hasActiveFilters = filters.search || filters.nodeType || filters.trajectory || filters.feedbackRating || filters.domains.length > 0 || filters.keywords.length > 0 || filters.minWeight || filters.minComposite;

  return (
    <div className={`h-full flex flex-col ${viewMode === 'graph' ? 'p-2 md:p-3' : 'p-4 md:p-8'}`}>
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Knowledge Graph</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{data?.total || 0} nodes total • {breakthroughCount} breakthroughs shown</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-0.5">
            {[
              { mode: 'list', Icon: List, label: 'List' },
              { mode: 'graph', Icon: GitBranch, label: 'Graph' },
            ].map(({ mode, Icon, label }) => (
              <button
                key={mode}
                onClick={() => { setViewMode(mode); localStorage.setItem('graph-view-mode', mode); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors ${viewMode === mode ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'}`}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreateForm(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
            <Plus size={16} /> Add Node
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 mb-6">
        <div className="flex gap-4 flex-wrap items-center">
          <div className="relative w-full sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input type="text" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} placeholder="Search content..." className="w-full border border-gray-200 dark:border-gray-700 rounded-lg pl-9 pr-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800" />
          </div>
          <div className="w-full sm:w-56">
            <TagSelector items={topKeywords.map(k => ({ value: k.keyword, label: `${k.keyword} (${k.count})` }))} selected={filters.keywords} onChange={(v) => setFilters({ ...filters, keywords: v })} multi placeholder="Keywords..." />
          </div>
          <div className="w-full sm:w-56">
            <TagSelector items={domains} selected={filters.domains} onChange={(v) => setFilters({ ...filters, domains: v })} multi placeholder="Domains..." />
          </div>
          <select value={filters.nodeType} onChange={(e) => setFilters({ ...filters, nodeType: e.target.value })} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="">All Types</option>
            {['seed','synthesis','voiced','breakthrough','possible','question','raw','elite_verification'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1).replace('_', ' ')}</option>)}
          </select>
          <select value={filters.trajectory} onChange={(e) => setFilters({ ...filters, trajectory: e.target.value })} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="">All Trajectories</option>
            <option value="knowledge">Knowledge</option>
            <option value="abstraction">Abstraction</option>
          </select>
          <select value={filters.feedbackRating} onChange={(e) => setFilters({ ...filters, feedbackRating: e.target.value })} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="">All Feedback</option>
            <option value="useful">Useful</option>
            <option value="not_useful">Not Useful</option>
            <option value="harmful">Harmful</option>
            <option value="unrated">Unrated</option>
          </select>
          <select value={filters.orderBy} onChange={(e) => setFilters({ ...filters, orderBy: e.target.value })} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
            <option value="weight">Sort: Weight</option>
            <option value="composite">Sort: Validation Score</option>
            <option value="salience">Sort: Salience</option>
            <option value="specificity">Sort: Specificity</option>
            <option value="recent">Sort: Newest</option>
            <option value="oldest">Sort: Oldest</option>
          </select>
          <button
            onClick={() => { const next = !showAdvancedFilters; setShowAdvancedFilters(next); localStorage.setItem('graph-advanced-filters', String(next)); }}
            className={`flex items-center gap-1 px-3 py-2 text-sm rounded-lg border ${showAdvancedFilters ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700' : 'border-gray-200 dark:border-gray-700'}`}
          >
            <Filter size={14} /> Advanced
          </button>
        </div>

        {showAdvancedFilters && (
          <div className="flex gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            {[
              { key: 'minWeight', label: 'Min Weight', step: '0.1', min: '0', max: '2', placeholder: '0.0' },
              { key: 'minComposite', label: 'Min Validation Score', step: '0.5', min: '0', max: '10', placeholder: '0.0' },
            ].map(({ key, label, ...rest }) => (
              <div key={key}>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</label>
                <input type="number" value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })} className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm w-24 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" {...rest} />
              </div>
            ))}
            <button onClick={() => setFilters(DEFAULT_FILTERS)} className="self-end px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200">Clear Filters</button>
          </div>
        )}
      </div>

      {/* Active filter banner */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2 mb-3">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
            <Filter size={14} />
            <span>Filters active — showing partial data.</span>
            <span className="text-xs text-amber-600 dark:text-amber-500">
              {[
                filters.nodeType && `type: ${filters.nodeType}`,
                filters.trajectory && `trajectory: ${filters.trajectory}`,
                filters.domains.length > 0 && `${filters.domains.length} domain${filters.domains.length > 1 ? 's' : ''}`,
                filters.keywords.length > 0 && `${filters.keywords.length} keyword${filters.keywords.length > 1 ? 's' : ''}`,
                filters.feedbackRating && `feedback: ${filters.feedbackRating.replace('_', ' ')}`,
                filters.search && `search: "${filters.search}"`,
                filters.minWeight && `weight >= ${filters.minWeight}`,
                filters.minComposite && `score >= ${filters.minComposite}`,
              ].filter(Boolean).join(', ')}
            </span>
          </div>
          <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 underline">Clear all</button>
        </div>
      )}

      {/* Mobile overlay */}
      {(selectedNode || showCreateForm) && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={() => { closeSidePanel(); setShowCreateForm(false); }}>
          <div className="absolute inset-x-4 top-20 bottom-4 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <SidePanel />
          </div>
        </div>
      )}

      {/* Graph node-limit slider */}
      {viewMode === 'graph' && (
        <div className="flex items-center gap-3 mb-3 px-1">
          <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Nodes</label>
          <input type="range" min={200} max={3000} step={100} value={graphLimit} onChange={(e) => { const v = parseInt(e.target.value, 10); setGraphLimit(v); localStorage.setItem('graph-node-limit', String(v)); }} className="w-40 accent-blue-500" />
          <span className="text-xs font-mono text-gray-600 dark:text-gray-300 w-12">{graphLimit}</span>
        </div>
      )}

      {/* Main content */}
      {viewMode === 'graph' ? (
        <div className="flex gap-6 min-h-0 overflow-hidden flex-1">
          <div className="relative flex-1 min-w-0 min-h-0">
            <DomainGraph
              onSelectNode={(node) => { setNavigationHistory([]); resonance.getNode(node.id).then(selectAndTrackNode); }}
              limit={graphLimit}
              filters={queryFilters}
              viewedNodes={viewedNodes}
            />
          </div>
          <div className="hidden lg:block w-96 flex-shrink-0 overflow-y-auto">
            <SidePanel empty="Click a node to view details" />
          </div>
        </div>
      ) : (
        <div className="flex gap-6 min-h-0 overflow-hidden flex-1">
          <div className="flex-1 min-w-0 overflow-y-auto">
            {isLoading ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">Loading nodes...</div>
            ) : data?.nodes?.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">No nodes found. Try adjusting filters or adding seeds.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data?.nodes?.map((node) => (
                  <NodeCard key={node.id} node={node} onSelect={(n) => { setNavigationHistory([]); resonance.getNode(n.id).then(selectAndTrackNode); }} onShowTree={(n) => setTreeNode(n)} />
                ))}
              </div>
            )}
          </div>
          <div className="hidden lg:block w-96 flex-shrink-0 overflow-y-auto">
            <SidePanel empty="Select a node to view details" />
          </div>
        </div>
      )}

      {treeNode && (
        <FamilyTreeModal
          nodeId={treeNode.id}
          onClose={() => setTreeNode(null)}
          onNavigate={(clickedId) => { setTreeNode(null); setNavigationHistory([]); resonance.getNode(clickedId).then(selectAndTrackNode); }}
        />
      )}
    </div>
  );
}
