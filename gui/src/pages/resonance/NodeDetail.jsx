import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, ChevronUp, ChevronDown, Zap, Layers, Trash2, Ban,
  GitBranch, ThumbsUp, ThumbsDown, AlertTriangle, Loader2, ArrowLeft,
  ArrowDown, History, Pencil, EyeOff, Eye, FileText, Tag, Key,
  CheckCircle, HelpCircle, ShieldCheck, XCircle, Clock, Copy, Send,
} from 'lucide-react';
import api, { resonance, feedback, evm } from '../../lib/api';
import { formatLocal, formatLocalDate } from '../../lib/datetime';
import TagSelector from '../../components/TagSelector';
import VariableRefText from '../../components/VariableRefText';
import { VerificationDetailModal, getOutcome, OUTCOME_CONFIG } from '../../components/VerificationDetail';
import { useConfirmDialog } from '../../components/ConfirmDialog';
import { TYPE_COLORS, formatNodeTime, formatNodeTimeFull } from './node-utils';
import { NodeContent } from './NodeContent';

// Clipboard fallback for non-secure contexts (HTTP remote access)
function copyText(text) {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  }
  return fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  return ok ? Promise.resolve() : Promise.reject(new Error('execCommand copy failed'));
}

// ---------------------------------------------------------------------------
// LineageItem — clickable parent/child row inside the lineage explorer
// ---------------------------------------------------------------------------
function LineageItem({ node, direction, onNavigate, isLoading }) {
  const Icon = direction === 'parent' ? ChevronUp : ChevronDown;
  const borderColor = direction === 'parent' ? 'border-l-amber-400' : 'border-l-emerald-400';

  return (
    <button
      onClick={() => onNavigate(node.id)}
      disabled={isLoading}
      className={`group w-full text-left p-2 rounded-lg border border-gray-100 dark:border-gray-700 ${borderColor} border-l-2
        hover:bg-gray-50 dark:hover:bg-gray-800 hover:border-gray-200 dark:hover:border-gray-600 transition-all disabled:opacity-50 disabled:cursor-wait`}
    >
      <div className="flex items-start gap-2">
        <Icon size={14} className={`mt-0.5 flex-shrink-0 ${direction === 'parent' ? 'text-amber-500' : 'text-emerald-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className={`text-xs px-1.5 py-0.5 rounded border ${TYPE_COLORS[node.type] || 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700'}`}
              title={[node.origin && `Origin: ${node.origin}`, node.contributor && `Contributor: ${node.contributor}`].filter(Boolean).join(' · ') || undefined}
            >
              {node.type}
            </span>
            {node.domain && (
              <span className="text-xs text-blue-500 dark:text-blue-400 truncate">{node.domain}</span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto flex items-center gap-1.5">
              {node.createdAt && <span title={formatNodeTimeFull(node.createdAt)}>{formatNodeTime(node.createdAt)}</span>}
              <span>W:{node.weight?.toFixed(2) || '?'}</span>
            </span>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2 group-hover:text-gray-900 dark:group-hover:text-gray-100">
            <VariableRefText>{node.content}</VariableRefText>
          </p>
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// NodeDetail — full detail panel for a selected knowledge graph node
// ---------------------------------------------------------------------------
/** Full detail panel: content, lineage, actions, promote, edit, remove. */
export default function NodeDetail({ node, onClose, onSelectNode, onShowTree, domains, navigationHistory = [], onNavigationChange }) {
  const queryClient = useQueryClient();
  const [editingDomain, setEditingDomain] = useState(false);
  const [newDomain, setNewDomain] = useState(node.domain || '');
  const [isNavigating, setIsNavigating] = useState(false);
  const [editingContent, setEditingContent] = useState(false);
  const [editedContent, setEditedContent] = useState(node.content || '');
  const [actionError, setActionError] = useState(null);
  const [showPromoteForm, setShowPromoteForm] = useState(false);
  const [promoteScores, setPromoteScores] = useState({ synthesis: 7, novelty: 7, testability: 5, tension_resolution: 5 });
  const [selectedVerificationExec, setSelectedVerificationExec] = useState(null);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const { confirm, ConfirmDialogEl } = useConfirmDialog();

  // Live node re-fetch (picks up async autorating, verification status, etc.)
  const { data: liveNode } = useQuery({
    queryKey: ['resonance', 'node', node.id],
    queryFn: () => resonance.getNode(node.id),
    enabled: !!node.id,
    initialData: node,
    staleTime: 30_000,
  });
  const n = liveNode || node;

  const { data: feedbackHistory } = useQuery({
    queryKey: ['resonance', 'feedback', node.id],
    queryFn: () => feedback.getNodeFeedback(node.id),
    enabled: !!node.id,
  });

  const { data: evmHistory } = useQuery({
    queryKey: ['lab', 'history', node.id],
    queryFn: () => evm.history(node.id, { full: true }),
    enabled: !!node.id,
  });

  const { data: lineage, isLoading: lineageLoading } = useQuery({
    queryKey: ['resonance', 'lineage', node.id],
    queryFn: () => resonance.getLineage(node.id, 2),
    enabled: !!node.id,
  });

  const handleLineageNavigate = async (nodeId) => {
    if (!onSelectNode) return;
    setIsNavigating(true);
    try {
      const fullNode = await resonance.getNode(nodeId);
      if (!fullNode?.id) return;
      if (onNavigationChange) onNavigationChange([...navigationHistory, { id: node.id, content: node.content?.slice(0, 50) }]);
      onSelectNode(fullNode);
    } finally {
      setIsNavigating(false);
    }
  };

  const handleBack = async () => {
    if (navigationHistory.length === 0 || !onSelectNode) return;
    setIsNavigating(true);
    try {
      const prevNode = navigationHistory[navigationHistory.length - 1];
      const fullNode = await resonance.getNode(prevNode.id);
      if (!fullNode?.id) return;
      if (onNavigationChange) onNavigationChange(navigationHistory.slice(0, -1));
      onSelectNode(fullNode);
    } finally {
      setIsNavigating(false);
    }
  };

  const handleCopyNodeInfo = async () => {
    if (copying) return;
    setCopying(true);
    const resolve = async (id) => {
      try { return (await resonance.getResolvedContent(id)).resolved; }
      catch { return null; }
    };

    const [resolvedContent, ...resolvedLineage] = await Promise.all([
      resolve(n.id),
      ...(lineage?.parents || []).map(p => resolve(p.id)),
      ...(lineage?.children?.slice(0, 10) || []).map(c => resolve(c.id)),
    ]);

    const parentCount = lineage?.parents?.length || 0;
    const resolvedParents = (lineage?.parents || []).map((p, i) => ({ ...p, _content: resolvedLineage[i] || p.content }));
    const resolvedChildren = (lineage?.children?.slice(0, 10) || []).map((c, i) => ({ ...c, _content: resolvedLineage[parentCount + i] || c.content }));

    const lines = [];
    lines.push(`# ${n.name || 'Node'} (${n.id.slice(0, 12)})`);
    lines.push(`Type: ${n.type || n.node_type || 'unknown'} | Domain: ${n.domain || 'N/A'} | Weight: ${n.weight?.toFixed(3) ?? 'N/A'} | Salience: ${n.salience?.toFixed(3) ?? 'N/A'}`);
    if (n.contributor) lines.push(`Contributor: ${n.contributor}`);
    if (n.trajectory) lines.push(`Trajectory: ${n.trajectory}`);
    if (n.specificity != null) lines.push(`Specificity: ${n.specificity.toFixed(1)}`);
    lines.push(`Created: ${n.createdAt || n.created_at || 'unknown'}`);
    if (n.breedable === 0) lines.push(`Breedable: NO (excluded from synthesis)`);
    lines.push('');
    lines.push('## Content');
    lines.push(resolvedContent || n.content || '(empty)');

    if (resolvedParents.length > 0) {
      lines.push('');
      lines.push('## Parents');
      for (const p of resolvedParents) {
        lines.push(`- [${p.name || p.id?.slice(0, 8)}] (${p.node_type || p.type}, w:${p.weight?.toFixed(3) ?? '?'}) ${p._content || ''}`);
      }
    }

    if (lineage?.children?.length > 0) {
      lines.push('');
      lines.push(`## Children (${lineage.children.length})`);
      for (const c of resolvedChildren) {
        lines.push(`- [${c.name || c.id?.slice(0, 8)}] (${c.node_type || c.type}, w:${c.weight?.toFixed(3) ?? '?'}) ${c._content || ''}`);
      }
      if (lineage.children.length > 10) lines.push(`... and ${lineage.children.length - 10} more`);
    }

    const execs = evmHistory?.executions || [];
    if (execs.length > 0) {
      lines.push('');
      lines.push(`## Verification History (${execs.length} executions)`);
      for (const e of execs.slice(0, 5)) {
        // Verdict only reflects an actual test outcome when status === 'completed'.
        // Other statuses (failed, code_error, skipped, needs_review, …) are infrastructure
        // states and must NOT be labelled DISPROVED — the experiment never produced a verdict.
        let verdict;
        if (e.status === 'completed') {
          verdict = e.claim_supported ? 'SUPPORTED' : 'DISPROVED';
        } else if (e.status === 'failed') {
          verdict = 'ERROR';
        } else if (e.status === 'code_error') {
          verdict = 'CODE_ERROR';
        } else if (e.status === 'skipped') {
          verdict = 'SKIPPED';
        } else {
          verdict = (e.status || 'unknown').toUpperCase();
        }
        const conf = e.confidence != null ? ` confidence:${(e.confidence * 100).toFixed(0)}%` : '';
        const score = e.score != null ? ` score:${e.score.toFixed(3)}` : '';
        const weightChange = e.weight_before != null && e.weight_after != null ? ` weight:${e.weight_before.toFixed(3)}→${e.weight_after.toFixed(3)}` : '';
        lines.push('');
        lines.push(`### [${e.status}] ${verdict}${conf}${score}${weightChange}`);
        lines.push(`Hypothesis: ${e.hypothesis || 'none'}`);
        if (e.claim_type) lines.push(`Claim type: ${e.claim_type} | Test category: ${e.test_category || 'N/A'}`);
        // Lab traceability
        if (e.lab_name || e.lab_id) lines.push(`Lab: ${e.lab_name || e.lab_id}${e.lab_job_id ? ` | Job: ${e.lab_job_id}` : ''}${e.template_id ? ` | Template: ${e.template_id}` : ''}`);
        if (e.spec) {
          try {
            const spec = JSON.parse(e.spec);
            lines.push(`Spec type: ${spec.specType} | Measurements: ${spec.measurements?.length || 0}`);
            lines.push('Experiment spec:');
            lines.push('```json');
            lines.push(JSON.stringify(spec, null, 2));
            lines.push('```');
          } catch { /* */ }
        }
        if (e.error) lines.push(`Error: ${e.error}`);
        if (e.guidance) lines.push(`Guidance: ${e.guidance}`);
        if (e.code) { lines.push('```python'); lines.push(e.code); lines.push('```'); }
        if (e.stdout) { lines.push('Stdout:'); lines.push('```'); lines.push(e.stdout); lines.push('```'); }
        if (e.stderr) { lines.push('Stderr:'); lines.push('```'); lines.push(e.stderr); lines.push('```'); }
        if (e.execution_time_ms != null) lines.push(`Execution time: ${e.execution_time_ms}ms`);
        if (e.attempt > 1) lines.push(`Attempts: ${e.attempt}`);
        if (e.created_at) lines.push(`When: ${e.created_at}`);

        // Fetch and include lab artifacts (text-based ones only)
        if (e.artifact_zip_id) {
          try {
            const artResp = await api.get(`/lab/evidence/${e.artifact_zip_id}/artifacts`);
            const arts = artResp.data?.artifacts || [];
            if (arts.length > 0) {
              lines.push('');
              lines.push(`#### Lab Artifacts (${arts.length} files)`);
              for (const a of arts) {
                const isText = a.type?.startsWith('text/') || a.type === 'application/json';
                if (isText) {
                  try {
                    const contentResp = await api.get(`/lab/evidence/${e.artifact_zip_id}/artifacts/${a.filename}`, { responseType: 'text', transformResponse: [d => d] });
                    const ext = a.filename.endsWith('.py') ? 'python' : a.type === 'application/json' ? 'json' : '';
                    lines.push(`**${a.filename}** (${a.size > 1024 ? `${(a.size / 1024).toFixed(1)}KB` : `${a.size}B`})`);
                    lines.push(`\`\`\`${ext}`);
                    lines.push(contentResp.data || '');
                    lines.push('```');
                  } catch {
                    lines.push(`**${a.filename}** (${a.size > 1024 ? `${(a.size / 1024).toFixed(1)}KB` : `${a.size}B`}) — failed to fetch`);
                  }
                } else {
                  lines.push(`**${a.filename}** (${a.type}, ${a.size > 1024 ? `${(a.size / 1024).toFixed(1)}KB` : `${a.size}B`}) — binary`);
                }
              }
            }
          } catch { /* non-fatal — artifacts may not be available */ }
        }
      }
      if (execs.length > 5) lines.push(`\n... and ${execs.length - 5} more executions`);
    }

    if (n.verification_status) {
      lines.push('');
      lines.push(`## Current Verification Status: ${n.verification_status}`);
      if (n.verification_score != null) lines.push(`Score: ${n.verification_score.toFixed(3)}`);
      if (n.verification_impact) lines.push(`API Impact: ${n.verification_impact}`);
      if (n.verification_results) {
        try {
          const vr = typeof n.verification_results === 'string' ? JSON.parse(n.verification_results) : n.verification_results;
          if (vr.details) lines.push(`Details: ${vr.details}`);
          if (vr.multiClaim) lines.push(`Multi-claim: ${vr.claimsVerified}/${vr.claimsTotal} claims verified`);
          // Render any structured payload (critique action / issues / guidance / etc.)
          // as labelled lines instead of dumping a JSON blob.
          const sd = vr.structuredDetails;
          if (sd && typeof sd === 'object') {
            if (sd.action) lines.push(`Critique action: ${sd.action}`);
            if (sd.correctedVerdict) lines.push(`Corrected verdict: ${sd.correctedVerdict}${sd.correctedConfidence != null ? ` (${Math.round(sd.correctedConfidence * 100)}%)` : ''}`);
            if (sd.methodologyScore != null) lines.push(`Methodology score: ${Number(sd.methodologyScore).toFixed(2)}`);
            if (Array.isArray(sd.issues) && sd.issues.length > 0) {
              lines.push('Issues:');
              for (const issue of sd.issues) lines.push(`  - ${issue}`);
            }
            if (sd.guidance) lines.push(`Guidance: ${sd.guidance}`);
            if (sd.critique && sd.critique !== vr.details) lines.push(`Critique: ${sd.critique}`);
            if (sd.rewrittenClaim) lines.push(`Rewritten claim: ${sd.rewrittenClaim}`);
          }
        } catch { /* ignore */ }
      }
    }

    try {
      await copyText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // copy failed — don't show tick
    } finally {
      setCopying(false);
    }
  };

  // ---- Mutations ----
  const promoteMutation = useMutation({
    mutationFn: (data) => resonance.promoteNode(node.id, data),
    onSuccess: (data) => {
      if (data?.error) { setActionError(`Promote failed: ${data.error}`); setTimeout(() => setActionError(null), 5000); return; }
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['resonance'] });
    },
    onError: (err) => { setActionError(`Promote failed: ${err.response?.data?.error || err.message}`); setTimeout(() => setActionError(null), 5000); },
  });

  const demoteMutation = useMutation({
    mutationFn: (data) => resonance.demoteNode(node.id, data),
    onSuccess: (data) => {
      if (data?.error) { setActionError(`Demote failed: ${data.error}`); setTimeout(() => setActionError(null), 5000); return; }
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['resonance'] });
    },
    onError: (err) => { setActionError(`Demote failed: ${err.response?.data?.error || err.message}`); setTimeout(() => setActionError(null), 5000); },
  });

  const domainMutation = useMutation({
    mutationFn: (domain) => resonance.updateDomain(node.id, domain),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['resonance'] }); setEditingDomain(false); },
  });

  const removeMutation = useMutation({
    mutationFn: ({ mode, reason }) => resonance.removeNode(node.id, mode, reason),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['resonance'] }); onClose(); },
  });

  const feedbackMutation = useMutation({
    mutationFn: ({ rating, note }) => feedback.rate(node.id, rating, { source: 'human', contributor: 'gui:user', note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['resonance'] }),
  });

  const enqueueMutation = useMutation({
    mutationFn: () => evm.enqueue(node.id),
    onSuccess: (data) => {
      if (data?.error) { setActionError(`Lab queue: ${data.error}`); setTimeout(() => setActionError(null), 5000); return; }
      if (data?.existing) { setActionError('Already in queue'); setTimeout(() => setActionError(null), 3000); return; }
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['resonance'] });
      queryClient.invalidateQueries({ queryKey: ['evm', 'history', node.id] });
    },
    onError: (err) => { setActionError(`Lab queue failed: ${err.response?.data?.error || err.message}`); setTimeout(() => setActionError(null), 5000); },
  });

  const editContentMutation = useMutation({
    mutationFn: (content) => resonance.editContent(node.id, { content, contributor: 'gui:user' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resonance'] });
      setEditingContent(false);
      if (onSelectNode) onSelectNode({ ...node, content: editedContent });
    },
  });

  const excludeMutation = useMutation({
    mutationFn: (excluded) => resonance.setExcluded(node.id, { excluded, contributor: 'gui:user' }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['resonance'] });
      if (onSelectNode) onSelectNode({ ...node, excluded: data.excluded });
    },
  });

  // Reset all editing/action states when switching nodes
  useEffect(() => {
    setEditingDomain(false);
    setNewDomain(node.domain || '');
    setEditingContent(false);
    setEditedContent(node.content || '');
    setShowPromoteForm(false);
    setActionError(null);
    setSelectedVerificationExec(null);
    feedbackMutation.reset();
    editContentMutation.reset();
    promoteMutation.reset();
    excludeMutation.reset();
  }, [node.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const effectiveNode = liveNode || node;
  const currentFeedback = effectiveNode.feedback_rating != null
    ? { rating: effectiveNode.feedback_rating, source: effectiveNode.feedback_source }
    : null;
  const nodePartition = node.partition;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-lg dark:shadow-gray-950/50 p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {navigationHistory.length > 0 && (
            <button
              onClick={handleBack}
              disabled={isNavigating}
              className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
              title="Go back"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          {effectiveNode.avatarUrl && (
            <img src={effectiveNode.avatarUrl} alt="" className="w-8 h-8 rounded-lg shadow-sm bg-gray-100 dark:bg-gray-800 object-cover" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
          )}
          <h2 className="text-lg font-semibold">{node.name || 'Node Details'}</h2>
          <span
            className="text-xs text-gray-400 dark:text-gray-500 font-mono cursor-pointer hover:text-gray-600 dark:hover:text-gray-300"
            title="Click to copy ID"
            onClick={() => copyText(node.id)}
          >{node.id.slice(0, 12)}</span>
          <button
            onClick={handleCopyNodeInfo}
            className="p-1 text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
            title="Copy node summary to clipboard"
          >
            {copied ? <CheckCircle size={14} className="text-green-500" /> : copying ? <Loader2 size={14} className="animate-spin text-blue-400" /> : <Copy size={14} />}
          </button>
          {isNavigating && <Loader2 size={14} className="animate-spin text-blue-500" />}
        </div>
        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400">✕</button>
      </div>

      {/* Navigation breadcrumb */}
      {navigationHistory.length > 0 && (
        <div className="flex items-center gap-1 mb-3 text-xs text-gray-400 dark:text-gray-500 overflow-x-auto">
          <History size={10} />
          {navigationHistory.slice(-3).map((h, i) => (
            <span key={h.id} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={8} />}
              <span className="truncate max-w-[80px]" title={h.content}>{h.content}...</span>
            </span>
          ))}
          <ChevronRight size={8} />
          <span className="text-gray-600 dark:text-gray-400 font-medium">Current</span>
        </div>
      )}

      {/* Archived banner */}
      {n.archived && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 text-xs">
          <AlertTriangle size={14} />
          <span className="font-medium">This node has been archived</span>
          <span className="text-amber-500 dark:text-amber-500">— it was removed from the active graph (junked, deduped, or manually archived).</span>
        </div>
      )}

      <div className="space-y-4">
        {/* Content editor */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-gray-500 dark:text-gray-400">Content</label>
            {!editingContent && (
              <button
                onClick={() => { setEditingContent(true); setEditedContent(node.content || ''); }}
                className="flex items-center gap-1 text-xs text-blue-500 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
              >
                <Pencil size={12} /> Edit
              </button>
            )}
          </div>
          {editingContent ? (
            <div className="mt-1">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                rows={5}
                className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:focus:ring-blue-800"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400 dark:text-gray-500">{editedContent.trim().split(/\s+/).length} words</span>
                <div className="flex gap-2">
                  <button onClick={() => { setEditingContent(false); setEditedContent(node.content || ''); }} className="text-xs px-3 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">Cancel</button>
                  <button
                    onClick={() => editContentMutation.mutate(editedContent)}
                    disabled={editContentMutation.isPending || editedContent.trim() === node.content?.trim()}
                    className="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                  >
                    {editContentMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              {editContentMutation.isError && (
                <p className="text-xs text-red-600 mt-1">{editContentMutation.error?.response?.data?.error || 'Failed to save'}</p>
              )}
            </div>
          ) : (
            <NodeContent content={node.content} className="mt-1" />
          )}
        </div>

        {/* Brief exclusion toggle */}
        <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
          <div className="flex items-center gap-2">
            {node.excluded ? <EyeOff size={14} className="text-orange-500" /> : <Eye size={14} className="text-green-500" />}
            <span className="text-xs text-gray-600 dark:text-gray-400">{node.excluded ? 'Excluded from briefs' : 'Included in briefs'}</span>
          </div>
          <button
            onClick={() => excludeMutation.mutate(!node.excluded)}
            disabled={excludeMutation.isPending}
            className={`text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-50 ${
              node.excluded
                ? 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-800/50'
                : 'bg-orange-50 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 hover:bg-orange-100 dark:hover:bg-orange-800/50'
            }`}
          >
            {excludeMutation.isPending ? '...' : node.excluded ? 'Include' : 'Exclude'}
          </button>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Type</label>
            <p className="text-sm font-medium mt-1" title={[node.origin && `Origin: ${node.origin}`, node.contributor && `Contributor: ${node.contributor}`].filter(Boolean).join(' · ') || undefined}>{node.type}</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400">Domain</label>
            {editingDomain ? (
              <div className="flex gap-1 mt-1 items-end">
                <div className="flex-1">
                  <TagSelector items={domains} selected={newDomain} onChange={setNewDomain} placeholder="Search domains..." />
                </div>
                <button onClick={() => domainMutation.mutate(newDomain)} disabled={domainMutation.isPending} className="text-xs px-2 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50">Save</button>
                <button onClick={() => { setEditingDomain(false); setNewDomain(node.domain || ''); }} className="text-xs px-2 py-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">✕</button>
              </div>
            ) : (
              <p className="text-sm font-medium mt-1 cursor-pointer hover:text-blue-500" onClick={() => setEditingDomain(true)} title="Click to change domain">
                {node.domain || <span className="text-gray-400 dark:text-gray-500">N/A (click to set)</span>}
              </p>
            )}
          </div>
          <div><label className="text-xs text-gray-500 dark:text-gray-400">Weight</label><p className="text-sm font-medium mt-1">{node.weight?.toFixed(3)}</p></div>
          <div><label className="text-xs text-gray-500 dark:text-gray-400">Salience</label><p className="text-sm font-medium mt-1">{node.salience?.toFixed(3)}</p></div>
          <div><label className="text-xs text-gray-500 dark:text-gray-400">Specificity</label><p className="text-sm font-medium mt-1">{node.specificity?.toFixed(1)}</p></div>
          <div><label className="text-xs text-gray-500 dark:text-gray-400">Trajectory</label><p className="text-sm font-medium mt-1">{node.trajectory || 'N/A'}</p></div>
          <div><label className="text-xs text-gray-500 dark:text-gray-400">Created</label><p className="text-sm font-medium mt-1">{formatNodeTimeFull(node.createdAt)}</p></div>
          <div><label className="text-xs text-gray-500 dark:text-gray-400">Updated</label><p className="text-sm font-medium mt-1">{formatNodeTimeFull(node.updatedAt)}</p></div>
        </div>

        {/* Keywords */}
        {node.keywords?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1.5"><Key size={12} /> Keywords</div>
            <div className="flex flex-wrap gap-1.5">
              {node.keywords.map(kw => (
                <span key={kw} className="px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs rounded-full border border-amber-200 dark:border-amber-800">{kw}</span>
              ))}
            </div>
          </div>
        )}

        {/* Domain Synonyms */}
        {node.domainSynonyms?.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1.5"><Tag size={12} /> Domain Synonyms</div>
            <div className="flex flex-wrap gap-1.5">
              {node.domainSynonyms.map(s => (
                <span key={s} className="px-2 py-0.5 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs rounded-full border border-violet-200 dark:border-violet-800">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Source metadata (KB ingestion) */}
        {node.metadata?.source && (
          <div className="bg-sky-50 dark:bg-sky-900/30 rounded-lg p-3 border border-sky-100 dark:border-sky-800">
            <div className="flex items-center gap-1.5 text-sky-700 dark:text-sky-300 text-xs font-medium mb-1"><FileText size={12} /> Source</div>
            <p className="text-sm font-medium text-sky-800 dark:text-sky-200 break-all">{node.metadata.source.fileName}</p>
            <p className="text-xs text-sky-600 dark:text-sky-400 break-all mt-0.5">{node.metadata.source.file}</p>
            <div className="flex gap-3 mt-1.5 text-xs text-sky-500 dark:text-sky-400">
              {node.metadata.source.reader && <span>Reader: {node.metadata.source.reader}</span>}
              {node.metadata.source.chunk && <span>Chunk: {node.metadata.source.chunk}</span>}
              {node.metadata.source.extension && <span>.{node.metadata.source.extension}</span>}
            </div>
          </div>
        )}

        {/* Question answer status */}
        {node.type === 'question' && node.metadata?.answered && (
          <div className="bg-emerald-50 dark:bg-emerald-900/30 rounded-lg p-3 border border-emerald-100 dark:border-emerald-800">
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-medium mb-1">
              <CheckCircle size={12} /> Answered
              {node.metadata.answeredAt && <span className="text-emerald-500 dark:text-emerald-400 font-normal ml-auto">{formatLocalDate(node.metadata.answeredAt)}</span>}
            </div>
            {node.metadata.answerPreview && <p className="text-sm text-emerald-800 dark:text-emerald-200 mt-1">{node.metadata.answerPreview}</p>}
            {node.metadata.contextNodeCount && <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1.5">{node.metadata.contextNodeCount} context nodes used</p>}
          </div>
        )}
        {node.type === 'question' && !node.metadata?.answered && (
          <div className="bg-red-50 dark:bg-red-900/30 rounded-lg p-3 border border-red-100 dark:border-red-800">
            <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 text-xs font-medium">
              <HelpCircle size={12} /> Unanswered — awaiting sufficient context or next question cycle
            </div>
          </div>
        )}

        {/* Partition info */}
        {nodePartition ? (
          <div className="bg-indigo-50 dark:bg-indigo-900/30 rounded-lg p-3 border border-indigo-100 dark:border-indigo-800">
            <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 text-xs font-medium mb-1"><Layers size={12} /> Partition</div>
            <p className="text-sm font-medium text-indigo-800">{nodePartition.name}</p>
            <p className="text-xs text-indigo-500">{nodePartition.id}</p>
          </div>
        ) : node.domain ? (
          <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-100">
            <div className="text-xs text-yellow-700 font-medium mb-1">No Partition</div>
            <p className="text-xs text-yellow-600">Domain "{node.domain}" is not assigned to any partition. It is isolated from all other domains.</p>
          </div>
        ) : null}

        {/* Validation Scores */}
        {node.validation && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">Validation Scores</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { key: 'synthesis', label: 'Synthesis', cls: 'blue' },
                { key: 'novelty', label: 'Novelty', cls: 'green' },
                { key: 'testability', label: 'Testability', cls: 'yellow' },
                { key: 'tension_resolution', label: 'Tension Resolution', cls: 'purple' },
              ].map(({ key, label, cls }) => (
                <div key={key} className={`bg-${cls}-50 dark:bg-${cls}-900/30 rounded p-2`}>
                  <div className={`text-xs text-${cls}-600 dark:text-${cls}-400`}>{label}</div>
                  <div className={`text-lg font-bold text-${cls}-700 dark:text-${cls}-300`}>{node.validation[key]?.toFixed(1)}</div>
                </div>
              ))}
            </div>
            <div className="bg-gray-100 dark:bg-gray-800 rounded p-2 mb-2">
              <div className="text-xs text-gray-600 dark:text-gray-400">Composite Score</div>
              <div className="text-xl font-bold text-gray-800 dark:text-gray-200">{node.validation.composite?.toFixed(2)}</div>
            </div>
            {node.validation.reason && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400">Reason</label>
                <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">{node.validation.reason}</p>
              </div>
            )}
            {node.validation.validatedBy && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Validated by {node.validation.validatedBy} on {formatLocalDate(node.validation.validatedAt)}
              </p>
            )}
          </div>
        )}

        {/* Lab Verification */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
              <ShieldCheck size={12} /> Lab Verification
            </label>
            {evmHistory?.count > 0 && (
              <span className="text-xs text-gray-400 dark:text-gray-500">{evmHistory.count} run{evmHistory.count !== 1 ? 's' : ''}</span>
            )}
          </div>
          {n.verification_status && (
            <div className={`flex items-center gap-2 rounded p-2 mb-2 ${
              n.verification_status === 'completed' && n.verification_score > 0 ? 'bg-green-50 dark:bg-green-900/20'
                : n.verification_status === 'completed' ? 'bg-red-50 dark:bg-red-900/20'
                : n.verification_status === 'failed' ? 'bg-yellow-50 dark:bg-yellow-900/20'
                : 'bg-gray-50 dark:bg-gray-800'
            }`}>
              {n.verification_status === 'completed' && n.verification_score > 0 ? <CheckCircle size={14} className="text-green-500" />
                : n.verification_status === 'completed' ? <XCircle size={14} className="text-red-500" />
                : n.verification_status === 'failed' ? <AlertTriangle size={14} className="text-yellow-500" />
                : <Clock size={14} className="text-gray-400" />}
              <div className="flex-1">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 capitalize">{n.verification_status}</span>
                {n.verification_score != null && (
                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">Score: {(n.verification_score * 100).toFixed(0)}%</span>
                )}
              </div>
            </div>
          )}
          {evmHistory?.executions?.length > 0 && (
            <div className="space-y-1.5 max-h-48 overflow-y-auto mb-2">
              {evmHistory.executions.map((exec) => {
                const outcome = getOutcome(exec);
                const cfg = OUTCOME_CONFIG[outcome];
                const Icon = cfg.icon;
                return (
                  <div
                    key={exec.id}
                    className="flex items-center gap-2 text-xs bg-gray-50 dark:bg-gray-800 rounded p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    onClick={() => setSelectedVerificationExec({ ...exec, node_content: n.content, node_domain: n.domain })}
                  >
                    <Icon size={12} className={`shrink-0 ${cfg.text}`} />
                    <span className="text-gray-600 dark:text-gray-400 truncate flex-1">{exec.hypothesis || exec.error || cfg.label}</span>
                    {exec.confidence != null && <span className="text-gray-400 dark:text-gray-500 shrink-0">{(exec.confidence * 100).toFixed(0)}%</span>}
                  </div>
                );
              })}
            </div>
          )}
          {n.verification_status !== 'in_queue' && n.verification_status !== 'pending_review' && (
            <button
              onClick={() => enqueueMutation.mutate()}
              disabled={enqueueMutation.isPending}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              {enqueueMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send to Lab
            </button>
          )}
        </div>

        {/* Lineage Explorer */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium flex items-center gap-1.5">
              <GitBranch size={12} /> Lineage Explorer
            </label>
            <div className="flex items-center gap-2">
              {lineageLoading && <Loader2 size={12} className="animate-spin text-gray-400 dark:text-gray-500" />}
              {onShowTree && (
                <button onClick={() => onShowTree(node)} className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1" title="View full lineage tree">
                  <GitBranch size={12} /> Full Tree
                </button>
              )}
            </div>
          </div>
          {lineage ? (
            <div className="space-y-4">
              {lineage.parents?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ChevronUp size={12} className="text-amber-500" />
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Parents ({lineage.parents.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {lineage.parents.map((p) => <LineageItem key={p.id} node={p} direction="parent" onNavigate={handleLineageNavigate} isLoading={isNavigating} />)}
                  </div>
                </div>
              )}
              {lineage.children?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <ChevronDown size={12} className="text-emerald-500" />
                    <span className="text-xs font-medium text-emerald-700 dark:text-emerald-300">Children ({lineage.children.length})</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {lineage.children.map((c) => <LineageItem key={c.id} node={c} direction="child" onNavigate={handleLineageNavigate} isLoading={isNavigating} />)}
                  </div>
                </div>
              )}
              {(!lineage.parents?.length && !lineage.children?.length) && (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">This node has no parents or children yet.</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-3">Loading lineage...</p>
          )}
        </div>

        {actionError && (
          <div className="mb-2 p-2 rounded text-sm bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300">{actionError}</div>
        )}

        {/* Promote / Demote */}
        {node.type !== 'breakthrough' && !showPromoteForm && (
          <div className="flex gap-2">
            <button onClick={() => setShowPromoteForm(true)} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600">
              <Zap size={16} /> Promote
            </button>
            {(node.type === 'possible' || node.type === 'elite_verification') && (
              <button
                onClick={() => demoteMutation.mutate({ reason: node.type === 'elite_verification' ? 'Demoted from elite via GUI' : 'Demoted via GUI', contributor: 'gui:user', decidedByTier: 'human' })}
                disabled={demoteMutation.isPending}
                className="flex items-center justify-center gap-2 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 disabled:opacity-50"
              >
                <ArrowDown size={16} /> {node.type === 'elite_verification' ? 'Demote from Elite' : 'Demote'}
              </button>
            )}
          </div>
        )}

        {showPromoteForm && (
          <div className="border border-purple-200 dark:border-purple-800 rounded-lg p-3 space-y-3 bg-purple-50/50 dark:bg-purple-900/10">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300"><Zap size={14} /> Promote to Breakthrough</div>
            {[
              { key: 'synthesis', label: 'Synthesis', desc: 'How well does it combine source ideas?' },
              { key: 'novelty', label: 'Novelty', desc: 'How new is this insight?' },
              { key: 'testability', label: 'Testability', desc: 'Can this claim be verified?' },
              { key: 'tension_resolution', label: 'Tension Resolution', desc: 'Does it resolve a contradiction?' },
            ].map(({ key, label, desc }) => (
              <div key={key}>
                <div className="flex items-center justify-between mb-0.5">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
                  <span className="text-xs font-mono text-gray-500 w-6 text-right">{promoteScores[key]}</span>
                </div>
                <input type="range" min="0" max="10" step="1" value={promoteScores[key]} onChange={(e) => setPromoteScores(s => ({ ...s, [key]: parseInt(e.target.value, 10) }))} className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-purple-500" title={desc} />
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { promoteMutation.mutate({ reason: 'Promoted via GUI', contributor: 'gui:user', decidedByTier: 'human', scores: promoteScores }); setShowPromoteForm(false); }}
                disabled={promoteMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50"
              >
                <Zap size={14} /> Confirm
              </button>
              <button onClick={() => setShowPromoteForm(false)} className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600">Cancel</button>
            </div>
          </div>
        )}

        {/* Feedback */}
        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Quality Feedback</label>
            {currentFeedback && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                currentFeedback.rating === 1 ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : currentFeedback.rating === 0 ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
              }`}>
                {currentFeedback.rating === 1 ? 'Useful' : currentFeedback.rating === 0 ? 'Not Useful' : 'Harmful'}
                {currentFeedback.source === 'auto' && ' (auto)'}
              </span>
            )}
          </div>
          {currentFeedback && effectiveNode.feedback_note && (
            <div className={`mb-3 p-2.5 rounded-lg text-xs ${
              currentFeedback.rating === 1 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : currentFeedback.rating === 0 ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <p className="text-gray-700 dark:text-gray-300 italic">{effectiveNode.feedback_note}</p>
              <div className="flex items-center gap-2 mt-1.5 text-gray-500 dark:text-gray-400">
                {effectiveNode.feedback_source && <span className="capitalize">{effectiveNode.feedback_source}</span>}
                {effectiveNode.feedback_at && <span>{formatLocal(effectiveNode.feedback_at)}</span>}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            {[
              { rating: 1, label: 'Useful', Icon: ThumbsUp, activeClass: 'bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300', hoverClass: 'hover:bg-green-50 dark:hover:bg-green-900/30 hover:border-green-200 dark:hover:border-green-700 hover:text-green-600 dark:hover:text-green-400', title: 'Mark as useful (+0.2 weight)' },
              { rating: 0, label: 'Meh', Icon: ThumbsDown, activeClass: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-700 dark:text-yellow-300', hoverClass: 'hover:bg-yellow-50 dark:hover:bg-yellow-900/30 hover:border-yellow-200 dark:hover:border-yellow-700 hover:text-yellow-600 dark:hover:text-yellow-400', title: 'Mark as not useful (-0.1 weight)' },
            ].map(({ rating, label, Icon, activeClass, hoverClass, title }) => (
              <button
                key={rating}
                onClick={() => feedbackMutation.mutate({ rating })}
                disabled={feedbackMutation.isPending}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                  currentFeedback?.rating === rating ? activeClass : `bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 ${hoverClass}`
                }`}
                title={title}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
            <button
              onClick={async () => {
                const ok = await confirm({ title: 'Mark as Harmful', message: 'Mark this node as harmful/wrong?\n\nThis will significantly reduce its weight (-0.3).', confirmLabel: 'Mark Harmful' });
                if (ok) feedbackMutation.mutate({ rating: -1, note: 'Marked harmful via GUI' });
              }}
              disabled={feedbackMutation.isPending}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm rounded-lg border transition-colors disabled:opacity-50 ${
                currentFeedback?.rating === -1
                  ? 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-700 dark:text-red-300'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-700 hover:text-red-600 dark:hover:text-red-400'
              }`}
              title="Mark as harmful (-0.3 weight)"
            >
              <AlertTriangle size={14} /> Bad
            </button>
          </div>
          {feedbackMutation.isSuccess && <p className="text-xs text-green-600 mt-2">Feedback recorded! Weight updated.</p>}
          {feedbackMutation.isError && <p className="text-xs text-red-600 mt-2">Failed to record feedback.</p>}

          {/* Feedback history */}
          {feedbackHistory?.feedback?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">Rating History</label>
              {feedbackHistory.feedback.map((fb) => (
                <div key={fb.id} className="flex items-start gap-2 text-xs py-1.5 border-t border-gray-100 dark:border-gray-800">
                  <span className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold ${fb.rating === 1 ? 'bg-green-500' : fb.rating === 0 ? 'bg-yellow-500' : 'bg-red-500'}`}>
                    {fb.rating === 1 ? '+' : fb.rating === 0 ? '~' : '!'}
                  </span>
                  <div className="flex-1 min-w-0">
                    {fb.note && <p className="text-gray-700 dark:text-gray-300 truncate">{fb.note}</p>}
                    <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
                      <span className="capitalize">{fb.source}</span>
                      {fb.contributor && <span>{fb.contributor}</span>}
                      <span>{formatLocal(fb.created_at)}</span>
                      {fb.weight_before != null && fb.weight_after != null && (
                        <span className={fb.weight_after > fb.weight_before ? 'text-green-500' : fb.weight_after < fb.weight_before ? 'text-red-500' : ''}>
                          {fb.weight_before.toFixed(2)} → {fb.weight_after.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Remove actions — hide for archived nodes */}
        {!n.archived && <div className="flex gap-2 pt-2 border-t">
          <button
            onClick={async () => {
              const ok = await confirm({ title: 'Mark as Junk', message: 'Mark this node as junk?\n\nThis archives the node and prevents similar content from being proposed.', confirmLabel: 'Mark as Junk', confirmColor: 'bg-orange-600 hover:bg-orange-700' });
              if (ok) removeMutation.mutate({ mode: 'junk', reason: 'Marked as junk via GUI' });
            }}
            disabled={removeMutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-800/50 disabled:opacity-50"
          >
            <Ban size={14} /> Junk
          </button>
          <button
            onClick={async () => {
              const ok = await confirm({ title: 'Permanently Delete Node', message: 'Permanently delete this node?\n\nThis cannot be undone.', confirmLabel: 'Delete Forever' });
              if (ok) removeMutation.mutate({ mode: 'hard', reason: 'Deleted via GUI' });
            }}
            disabled={removeMutation.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-800/50 disabled:opacity-50"
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>}
      </div>

      {selectedVerificationExec && (
        <VerificationDetailModal exec={selectedVerificationExec} onClose={() => setSelectedVerificationExec(null)} />
      )}
      {ConfirmDialogEl}
    </div>
  );
}
