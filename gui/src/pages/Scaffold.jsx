import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play, Loader, Download, Check, AlertTriangle,
  RefreshCw, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Trash2
} from 'lucide-react';
import { docs, seeds } from '../lib/api';
import TagSelector from '../components/TagSelector';
import { useConfirmDialog } from '../components/ConfirmDialog';
import Markdown from '../components/Markdown';

// =============================================================================
// STATUS BADGE
// =============================================================================

const statusConfig = {
  in_progress: { label: 'Running', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', icon: Loader },
  completed:   { label: 'Done',    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300', icon: CheckCircle },
  partial:     { label: 'Partial', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300', icon: AlertTriangle },
  failed:      { label: 'Failed',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300', icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = statusConfig[status] || statusConfig.failed;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.color}`}>
      <Icon size={12} className={status === 'in_progress' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  );
}

// Markdown renderer imported from ../components/Markdown

// =============================================================================
// BRIEF GENERATOR
// =============================================================================

function BriefGenerator({ onResult }) {
  const [request, setRequest] = useState('');
  const [taskType, setTaskType] = useState('research_brief');
  const [knowledgeQuery, setKnowledgeQuery] = useState('');
  const [selectedDomains, setSelectedDomains] = useState([]);
  const queryClient = useQueryClient();

  const { data: domainList } = useQuery({
    queryKey: ['seeds', 'domains'],
    queryFn: () => seeds.domains(),
    staleTime: 60000,
  });

  const domainItems = (domainList?.domains || []).map((d) => d.domain || d);

  const generateMutation = useMutation({
    mutationFn: ({ request, taskType, options }) =>
      docs.generate(request, taskType, options),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['docs', 'jobs'] });
      onResult(data);
    },
    onError: (err) => onResult({ error: err.message }),
  });

  const handleGenerate = () => {
    if (!request.trim()) return;
    generateMutation.mutate({
      request,
      taskType,
      options: {
        knowledgeQuery: knowledgeQuery || undefined,
        domains: selectedDomains.length > 0 ? selectedDomains : undefined,
      },
    });
  };

  return (
    <div className="bg-white rounded-lg shadow dark:bg-gray-900 dark:shadow-gray-950/50 p-5">
      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">What do you want to generate?</label>
          <textarea
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={3}
            className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none"
            placeholder="e.g. Summarize current knowledge about retinol mechanisms in skincare..."
          />
        </div>

        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Type</label>
            <select
              value={taskType}
              onChange={(e) => setTaskType(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm"
            >
              <option value="research_brief">Research Brief</option>
              <option value="knowledge_synthesis">Knowledge Synthesis</option>
              <option value="technical_report">Technical Report</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pull from graph (optional)</label>
            <input
              value={knowledgeQuery}
              onChange={(e) => setKnowledgeQuery(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-700 rounded-lg p-2 text-sm"
              placeholder="Search query for relevant nodes..."
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={!request.trim() || generateMutation.isPending}
            className="flex items-center gap-2 px-5 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 text-sm font-medium whitespace-nowrap"
          >
            {generateMutation.isPending ? (
              <><Loader size={14} className="animate-spin" /> Generating...</>
            ) : (
              <><Play size={14} /> Generate</>
            )}
          </button>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Domains (optional)</label>
          <TagSelector
            items={domainItems}
            selected={selectedDomains}
            onChange={setSelectedDomains}
            multi
            placeholder="Type to filter domains..."
          />
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// JOB LIST (compact sidebar)
// =============================================================================

function JobList({ onSelect, selectedId, onResume, resumingId, onDelete }) {
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const { data: jobs, isLoading, refetch } = useQuery({
    queryKey: ['docs', 'jobs'],
    queryFn: () => docs.jobs(),
    refetchInterval: 15000,
  });

  if (isLoading) {
    return <div className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1"><Loader size={12} className="animate-spin" /> Loading...</div>;
  }

  if (!jobs || jobs.length === 0) {
    return (
      <div className="text-center py-6 text-gray-400 dark:text-gray-500">
        <Clock className="mx-auto mb-1" size={20} />
        <p className="text-xs">No jobs yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">History</span>
        <button onClick={() => refetch()} className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"><RefreshCw size={12} /></button>
      </div>
      {jobs.map((job) => {
        const isSelected = job.id === selectedId;
        const isResuming = job.id === resumingId;
        return (
          <div
            key={job.id}
            onClick={() => onSelect(job.id)}
            className={`w-full text-left rounded-lg p-2.5 transition-colors border cursor-pointer ${
              isSelected ? 'border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-900/30' : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate leading-tight">
              {job.request?.slice(0, 50)}{job.request?.length > 50 ? '...' : ''}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <StatusBadge status={job.status} />
              <span className="text-xs text-gray-400 dark:text-gray-500">
                {new Date(job.updated_at || job.created_at).toLocaleDateString()}
              </span>
              <div className="ml-auto flex items-center gap-1">
                {(job.status === 'partial' || job.status === 'failed') && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onResume(job.id); }}
                    disabled={isResuming}
                    className="text-xs text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                    title="Resume — retry failed sections"
                  >
                    {isResuming ? <Loader size={10} className="animate-spin" /> : 'Resume'}
                  </button>
                )}
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const ok = await confirm({
                      title: 'Delete Doc Job',
                      message: 'Delete this document generation job?\n\nThe generated document and all section data will be permanently removed.',
                      confirmLabel: 'Delete',
                    });
                    if (ok) onDelete(job.id);
                  }}
                  className="text-gray-300 dark:text-gray-600 hover:text-red-500 p-0.5"
                  title="Delete job"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
            {job.error && (
              <p className="text-xs text-red-400 mt-1 truncate">{job.error}</p>
            )}
          </div>
        );
      })}
    {ConfirmDialogEl}
    </div>
  );
}

// =============================================================================
// RESULT PANEL (the main content area)
// =============================================================================

function ResultPanel({ result, isLoading }) {
  const [viewMode, setViewMode] = useState('rendered'); // 'rendered' | 'raw' | 'sections'

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow dark:bg-gray-900 dark:shadow-gray-950/50 p-8 text-center text-gray-400 dark:text-gray-500">
        <Loader size={24} className="animate-spin mx-auto mb-2" />
        <p className="text-sm">Generating brief...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="bg-white rounded-lg shadow dark:bg-gray-900 dark:shadow-gray-950/50 p-8 text-center text-gray-300 dark:text-gray-600">
        <p className="text-sm">Generate a brief or select a job from the sidebar to view results.</p>
      </div>
    );
  }

  if (result.error && !result.partial && !result.document) {
    return (
      <div className="bg-white rounded-lg shadow dark:bg-gray-900 dark:shadow-gray-950/50 p-6">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p className="text-sm text-red-600 dark:text-red-300 font-medium">Generation failed</p>
          <p className="text-sm text-red-500 dark:text-red-400 mt-1">{result.error}</p>
        </div>
      </div>
    );
  }

  const downloadBrief = () => {
    if (!result.document) return;
    const blob = new Blob([result.document], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `brief_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sections = result.sections || {};
  const outline = result.outline;
  const failedSections = result.failedSections || [];
  const pendingSections = result.pendingSections || [];

  return (
    <div className="bg-white rounded-lg shadow dark:bg-gray-900 dark:shadow-gray-950/50">
      {/* Header bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b dark:border-gray-700">
        <div className="flex items-center gap-3">
          {result.success ? (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-300 text-sm font-medium"><Check size={16} /> Complete</span>
          ) : result.inProgress ? (
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-300 text-sm font-medium"><Loader size={16} className="animate-spin" /> Generating...</span>
          ) : result.partial ? (
            <span className="flex items-center gap-1 text-yellow-600 dark:text-yellow-300 text-sm font-medium"><AlertTriangle size={16} /> Partial</span>
          ) : (
            <span className="flex items-center gap-1 text-red-600 dark:text-red-300 text-sm font-medium"><XCircle size={16} /> Failed</span>
          )}
          {outline?.sections && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {Object.keys(sections).length}/{outline.sections.length} sections
            </span>
          )}
          {result.jobId && (
            <span className="text-xs text-gray-300 dark:text-gray-600 font-mono">{result.jobId.slice(0, 8)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View mode tabs */}
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 text-xs">
            {['rendered', 'raw', 'sections'].map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-2.5 py-1 rounded-md transition-colors capitalize ${
                  viewMode === mode ? 'bg-white dark:bg-gray-700 shadow text-gray-700 dark:text-gray-200 font-medium' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
          {result.document && (
            <button onClick={downloadBrief} className="flex items-center gap-1 px-3 py-1.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
              <Download size={12} /> .md
            </button>
          )}
        </div>
      </div>

      {/* Pending sections banner (in-progress jobs) */}
      {pendingSections.length > 0 && (
        <div className="px-5 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-100 dark:border-blue-700 text-xs text-blue-700 dark:text-blue-300 flex items-center gap-2">
          <Loader size={12} className="animate-spin" /> Generating: {pendingSections.join(', ')}
        </div>
      )}

      {/* Failed sections banner */}
      {failedSections.length > 0 && (
        <div className="px-5 py-2 bg-yellow-50 dark:bg-yellow-900/30 border-b border-yellow-100 dark:border-yellow-700 text-xs text-yellow-700 dark:text-yellow-300">
          Failed: {failedSections.join(', ')} — use Resume to retry
        </div>
      )}

      {/* Content area */}
      <div className="p-5 max-h-[calc(100vh-320px)] overflow-y-auto">
        {viewMode === 'rendered' && result.document && (
          <Markdown>{result.document}</Markdown>
        )}

        {viewMode === 'raw' && result.document && (
          <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap font-mono">{result.document}</pre>
        )}

        {viewMode === 'sections' && outline?.sections && (
          <SectionList outline={outline} sections={sections} failedSections={failedSections} pendingSections={pendingSections} />
        )}

        {!result.document && viewMode !== 'sections' && (
          <p className="text-sm text-gray-400 dark:text-gray-500">No document content available.</p>
        )}
      </div>

      {/* Coherence issues footer */}
      {result.coherenceIssues?.length > 0 && (
        <div className="px-5 py-3 border-t dark:border-gray-700 bg-yellow-50/50 dark:bg-yellow-900/30">
          <p className="text-xs font-medium text-yellow-700 dark:text-yellow-300 mb-1">Coherence notes</p>
          {result.coherenceIssues.map((issue, idx) => (
            <p key={idx} className="text-xs text-yellow-600 dark:text-yellow-400">{issue.message}</p>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SECTION LIST (expandable per-section view)
// =============================================================================

function SectionList({ outline, sections, failedSections, pendingSections = [] }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="space-y-1.5">
      {outline.sections.map((s) => {
        const content = sections[s.id];
        const failed = failedSections.includes(s.id);
        const pending = pendingSections.includes(s.id);
        const isOpen = expanded === s.id;

        return (
          <div key={s.id} className={`border rounded-lg overflow-hidden ${failed ? 'border-red-200 bg-red-50/30 dark:border-red-800 dark:bg-red-900/20' : pending ? 'border-blue-200 bg-blue-50/30 dark:border-blue-800 dark:bg-blue-900/20' : ''}`}>
            <button
              onClick={() => content && setExpanded(isOpen ? null : s.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left ${
                content ? 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer' : 'cursor-default'
              }`}
            >
              {failed ? (
                <XCircle size={14} className="text-red-400 flex-shrink-0" />
              ) : pending ? (
                <Loader size={14} className="text-blue-400 animate-spin flex-shrink-0" />
              ) : content ? (
                <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
              ) : (
                <Clock size={14} className="text-gray-300 flex-shrink-0" />
              )}
              <span className={`font-medium flex-1 ${failed ? 'text-red-500 dark:text-red-400' : pending ? 'text-blue-500 dark:text-blue-400' : content ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400 dark:text-gray-500'}`}>
                {s.title}
              </span>
              {content && (
                <>
                  <span className="text-xs text-gray-400">{content.split(/\s+/).length}w</span>
                  {isOpen ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
                </>
              )}
            </button>
            {isOpen && content && (
              <div className="px-4 pb-4 border-t">
                <Markdown>{content}</Markdown>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =============================================================================
// JOB DETAIL LOADER (fetches full job data for sidebar selection)
// =============================================================================

function useJobDetail(jobId) {
  return useQuery({
    queryKey: ['docs', 'job', jobId],
    queryFn: () => docs.getJob(jobId),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const job = query.state.data;
      return job?.status === 'in_progress' ? 5000 : false;
    },
    select: (job) => {
      // Transform DB job into the same shape as a generate result
      const outline = job.outline;
      const sections = job.sections || {};
      const allSectionIds = outline?.sections?.map((s) => s.id) || [];
      const completedIds = Object.keys(sections);
      const incompleteSections = allSectionIds.filter((id) => !completedIds.includes(id));

      // Only mark sections as failed when the job is done (partial/failed).
      // While in_progress, incomplete sections are still pending — not failed.
      const failedSections = (job.status === 'partial' || job.status === 'failed')
        ? incompleteSections
        : [];
      const pendingSections = job.status === 'in_progress' ? incompleteSections : [];

      // Assemble document from sections
      let document = '';
      for (const s of outline?.sections || []) {
        if (sections[s.id]) {
          document += `## ${s.title}\n\n${sections[s.id]}\n\n`;
        }
      }

      return {
        success: job.status === 'completed',
        partial: job.status === 'partial',
        inProgress: job.status === 'in_progress',
        jobId: job.id,
        document: document || null,
        outline,
        sections,
        failedSections,
        pendingSections,
        coherenceIssues: [],
        error: job.error,
      };
    },
  });
}

// =============================================================================
// MAIN PAGE
// =============================================================================

/** Scaffold page: research brief generation, job list, and live result. */
export default function Scaffold() {
  const [selectedJobId, setSelectedJobId] = useState(null);
  const [liveResult, setLiveResult] = useState(null);      // result from Generate or Resume
  const [isGenerating, setIsGenerating] = useState(false);
  const [resumingId, setResumingId] = useState(null);
  const queryClient = useQueryClient();

  // Fetch selected job detail (only when viewing a historical job, not a live result)
  const { data: jobResult, isLoading: jobLoading } = useJobDetail(
    liveResult ? null : selectedJobId
  );

  const resumeMutation = useMutation({
    mutationFn: (jobId) => docs.resume(jobId),
    onSuccess: (data) => {
      setLiveResult(data);
      setSelectedJobId(data.jobId);
      setResumingId(null);
      queryClient.invalidateQueries({ queryKey: ['docs', 'jobs'] });
    },
    onError: (err) => {
      setLiveResult({ error: err.message });
      setResumingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (jobId) => docs.deleteJob(jobId),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['docs', 'jobs'] });
      if (selectedJobId === deletedId) {
        setSelectedJobId(null);
        setLiveResult(null);
      }
    },
  });

  const handleGenerate = (data) => {
    setIsGenerating(false);
    setLiveResult(data);
    if (data.jobId) setSelectedJobId(data.jobId);
  };

  const handleResume = (jobId) => {
    setLiveResult(null);
    setResumingId(jobId);
    setSelectedJobId(jobId);
    resumeMutation.mutate(jobId);
  };

  const handleSelectJob = (jobId) => {
    setLiveResult(null);  // clear live result so we fetch from DB
    setSelectedJobId(jobId);
  };

  // Decide what to show in the result panel
  const displayResult = liveResult || jobResult || null;
  const displayLoading = isGenerating || resumeMutation.isPending || (selectedJobId && !liveResult && jobLoading);

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold mb-1">Create Docs</h1>
      <p className="text-sm text-gray-400 dark:text-gray-500 mb-5">
        Generate structured documents from the knowledge graph. Choose a document type, optionally scope to specific domains, and each section is saved as it completes — failed jobs can be resumed.
      </p>

      <div className="flex flex-col lg:flex-row gap-5">
        {/* Sidebar: job history */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <div className="bg-white rounded-lg shadow dark:bg-gray-900 dark:shadow-gray-950/50 p-3">
            <JobList
              onSelect={handleSelectJob}
              selectedId={selectedJobId}
              onResume={handleResume}
              resumingId={resumingId}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          </div>
        </div>

        {/* Main area */}
        <div className="flex-1 min-w-0 space-y-4 overflow-hidden">
          <BriefGenerator onResult={handleGenerate} />
          <ResultPanel result={displayResult} isLoading={displayLoading} />
        </div>
      </div>
    </div>
  );
}
