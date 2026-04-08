import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GitBranch, X, Loader2, ChevronUp, ChevronDown, ChevronRight } from 'lucide-react';
import { resonance } from '../lib/api';

const TYPE_COLORS = {
  seed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  synthesis: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800',
  voiced: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  breakthrough: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
  possible: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800',
  question: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800',
  raw: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700',
  elite_verification: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
};
const DEFAULT_TYPE = 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700';

/** Compact inline node item — single line, fits in a grid */
function NodeItem({ node, onNavigate, viaLabel }) {
  if (!node || !node.content) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onNavigate(node.id); }}
      className="flex items-start gap-1.5 px-2 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm transition-all text-left group min-w-0"
      title={node.content + (viaLabel ? `\n\nvia: ${viaLabel}` : '')}
    >
      <span className={`text-[0.625rem] leading-none px-1 py-0.5 rounded border shrink-0 mt-px ${TYPE_COLORS[node.type] || DEFAULT_TYPE}`}>
        {node.type}
      </span>
      <span className="text-xs text-gray-600 dark:text-gray-300 line-clamp-1 group-hover:text-gray-900 dark:group-hover:text-gray-100 min-w-0">
        {node.name || (node.content.length > 120 ? node.content.slice(0, 120) + '...' : node.content)}
      </span>
    </button>
  );
}

/** Trigger node — highlighted, larger */
function TriggerCard({ node, onNavigate }) {
  if (!node || !node.content) return null;
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onNavigate(node.id); }}
      className="px-3 py-2.5 rounded-lg border-2 border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-300/40 dark:ring-blue-600/40 text-left hover:shadow-md transition-all group max-w-2xl w-full"
      title={node.content}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`text-[0.625rem] leading-none px-1 py-0.5 rounded border ${TYPE_COLORS[node.type] || DEFAULT_TYPE}`}>
          {node.type}
        </span>
        {node.domain && (
          <span className="text-xs text-blue-500 dark:text-blue-400">
            {node.domain}
          </span>
        )}
      </div>
      <p className="text-sm text-gray-700 dark:text-gray-200 line-clamp-3 leading-snug group-hover:text-gray-900 dark:group-hover:text-gray-100">
        {node.content}
      </p>
    </button>
  );
}

/**
 * Build generation levels from flat lineage data.
 * Returns sorted array: [{ level, nodes }] where level 0 = trigger.
 * Each node appears exactly once (deduplicated by ID).
 */
function buildLevels(triggerNode, ancestors, descendants) {
  const seen = new Set();
  const levelMap = new Map();

  if (triggerNode) {
    levelMap.set(0, [triggerNode]);
    seen.add(triggerNode.id);
  }

  for (const anc of ancestors) {
    if (seen.has(anc.id)) continue;
    seen.add(anc.id);
    const level = -anc.distance;
    if (!levelMap.has(level)) levelMap.set(level, []);
    levelMap.get(level).push(anc);
  }

  for (const desc of descendants) {
    if (seen.has(desc.id)) continue;
    seen.add(desc.id);
    const level = desc.distance;
    if (!levelMap.has(level)) levelMap.set(level, []);
    levelMap.get(level).push(desc);
  }

  return [...levelMap.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([level, nodes]) => ({ level, nodes }));
}

/** Generation label */
function levelLabel(level) {
  if (level === 0) return null;
  const abs = Math.abs(level);
  const isAncestor = level < 0;

  if (abs === 1) return isAncestor ? 'Parents' : 'Children';
  if (abs === 2) return isAncestor ? 'Grandparents' : 'Grandchildren';

  const greats = abs - 2;
  const prefix = greats === 1 ? 'Great-' : 'Great-'.repeat(greats);
  return isAncestor ? `${prefix}grandparents` : `${prefix}grandchildren`;
}

/** Build a lookup: nodeId → short content snippet for "via" labels */
function buildNodeLabels(levels) {
  const labels = new Map();
  for (const { nodes } of levels) {
    for (const node of nodes) {
      if (node.content) {
        labels.set(node.id, node.name || (node.content.length > 40 ? node.content.slice(0, 40) + '...' : node.content));
      }
    }
  }
  return labels;
}

/** Collapsible generation section */
function GenerationSection({ level, nodes, nodeLabels, onNavigate, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  const label = levelLabel(level);
  const isAncestor = level < 0;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full text-left py-1.5 group"
      >
        <ChevronRight size={14} className={`text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        {isAncestor
          ? <ChevronUp size={14} className="text-amber-500" />
          : <ChevronDown size={14} className="text-emerald-500" />
        }
        <span className={`text-xs font-medium ${isAncestor ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}`}>
          {label}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          ({nodes.length})
        </span>
      </button>
      {open && (
        <div className="ml-6 mt-1 mb-3 grid gap-1.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(20rem, 1fr))' }}>
          {nodes.map((node) => (
            <NodeItem
              key={node.id}
              node={node}
              onNavigate={onNavigate}
              viaLabel={node.connectedFrom && nodeLabels.has(node.connectedFrom) ? nodeLabels.get(node.connectedFrom) : null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Modal showing parent/child lineage tree for a node with navigation to related nodes. */
export default function FamilyTreeModal({ nodeId, onClose, onNavigate }) {
  const { data: lineage, isLoading } = useQuery({
    queryKey: ['resonance', 'lineage-deep', nodeId],
    queryFn: () => resonance.getLineage(nodeId, 4),
    enabled: !!nodeId,
    staleTime: 60_000,
  });

  const handleKeyDown = useCallback((e) => { if (e.key === 'Escape') onClose(); }, [onClose]);
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', handleKeyDown); document.body.style.overflow = ''; };
  }, [handleKeyDown]);

  const levels = useMemo(() => {
    if (!lineage) return null;
    const ancestors = lineage.ancestors?.length ? lineage.ancestors
      : (lineage.parents || []).map(p => ({ ...p, connectedFrom: nodeId, distance: 1 }));
    const descendants = lineage.descendants?.length ? lineage.descendants
      : (lineage.children || []).map(c => ({ ...c, connectedFrom: nodeId, distance: 1 }));
    const trigger = lineage.triggerNode || { id: nodeId, content: '(loading...)', type: 'unknown', domain: '' };
    return buildLevels(trigger, ancestors, descendants);
  }, [lineage, nodeId]);

  const nodeLabels = useMemo(() => levels ? buildNodeLabels(levels) : new Map(), [levels]);

  const triggerLevel = levels?.find(l => l.level === 0);
  const ancestorLevels = levels?.filter(l => l.level < 0) || [];
  const descendantLevels = levels?.filter(l => l.level > 0) || [];
  const hasLineage = ancestorLevels.length > 0 || descendantLevels.length > 0;

  const totalAncestors = ancestorLevels.reduce((s, l) => s + l.nodes.length, 0);
  const totalDescendants = descendantLevels.reduce((s, l) => s + l.nodes.length, 0);

  const handleNodeClick = (clickedId) => {
    onClose();
    onNavigate(clickedId);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 dark:bg-black/70" />
      <div
        className="relative bg-white dark:bg-gray-900 rounded-xl shadow-2xl dark:shadow-black/50 w-full max-w-5xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-2.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <GitBranch size={14} className="text-gray-500 dark:text-gray-400" />
            <h3 className="font-semibold text-sm text-gray-800 dark:text-gray-200">Lineage</h3>
            {hasLineage && (
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {totalAncestors > 0 && `${totalAncestors} ancestor${totalAncestors !== 1 ? 's' : ''}`}
                {totalAncestors > 0 && totalDescendants > 0 && ' · '}
                {totalDescendants > 0 && `${totalDescendants} descendant${totalDescendants !== 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="animate-spin text-blue-500" size={20} />
              <span className="ml-2 text-xs text-gray-400">Loading lineage...</span>
            </div>
          ) : levels ? (
            <div className="space-y-2">
              {/* Ancestors — deepest first */}
              {ancestorLevels.length > 0 && (
                <div className="space-y-1">
                  {ancestorLevels.map(({ level, nodes }) => (
                    <GenerationSection
                      key={level}
                      level={level}
                      nodes={nodes}
                      nodeLabels={nodeLabels}
                      onNavigate={handleNodeClick}
                      defaultOpen={nodes.length <= 12}
                    />
                  ))}
                </div>
              )}

              {/* Trigger node — always visible */}
              {triggerLevel && (
                <div className="flex flex-col items-center py-3">
                  {ancestorLevels.length > 0 && (
                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mb-2" />
                  )}
                  <TriggerCard node={triggerLevel.nodes[0]} onNavigate={handleNodeClick} />
                  {descendantLevels.length > 0 && (
                    <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mt-2" />
                  )}
                </div>
              )}

              {/* Descendants — shallowest first */}
              {descendantLevels.length > 0 && (
                <div className="space-y-1">
                  {descendantLevels.map(({ level, nodes }) => (
                    <GenerationSection
                      key={level}
                      level={level}
                      nodes={nodes}
                      nodeLabels={nodeLabels}
                      onNavigate={handleNodeClick}
                      defaultOpen={nodes.length <= 12}
                    />
                  ))}
                </div>
              )}

              {/* No lineage */}
              {!hasLineage && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                  This node has no parents or children.
                </p>
              )}
            </div>
          ) : (
            <p className="text-center text-gray-400 dark:text-gray-500 py-10 text-xs">
              No lineage data found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
