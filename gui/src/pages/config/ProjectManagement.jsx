import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderOpen, Save, Plus, Loader, Trash2, Upload, FolderPlus, X, MessageCircle, Send, CheckCircle, Edit3, ChevronDown, ChevronRight } from 'lucide-react';
import { database } from '../../lib/api';
import { useConfirmDialog } from '../../components/ConfirmDialog';

// =============================================================================
// Interview Chat Component
// =============================================================================

function InterviewChat({ name, description, onComplete, onCancel }) {
  const [interviewId, setInterviewId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input after receiving a response
  useEffect(() => {
    if (!sending && !manifest) inputRef.current?.focus();
  }, [sending, manifest]);

  // Start the interview on mount
  useEffect(() => {
    let cancelled = false;
    async function start() {
      setSending(true);
      setError(null);
      try {
        const result = await database.startInterview(name, description);
        if (cancelled) return;
        setInterviewId(result.interviewId);
        setMessages([{ role: 'assistant', content: result.question }]);
      } catch (err) {
        if (cancelled) return;
        setError(err.response?.data?.error || err.message || 'Failed to start interview');
      } finally {
        if (!cancelled) setSending(false);
      }
    }
    start();
    return () => { cancelled = true; };
  }, [name, description]);

  const sendResponse = async () => {
    if (!input.trim() || sending || !interviewId) return;
    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setSending(true);
    setError(null);

    try {
      const result = await database.continueInterview(interviewId, userMessage);

      if (result.status === 'complete') {
        setManifest(result.manifest);
        setMessages(prev => [...prev, { role: 'system', content: 'Interview complete. Project created successfully.' }]);
        onComplete(result);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: result.question }]);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Interview failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-indigo-300 dark:border-indigo-700 rounded-lg">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
          <MessageCircle size={14} />
          Project Interview: {name}
        </h3>
        {!manifest && (
          <button
            onClick={onCancel}
            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
          >
            Cancel
          </button>
        )}
      </div>

      {error && (
        <div className="mb-3 p-2 text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded">
          {error}
        </div>
      )}

      {/* Message thread */}
      <div className="max-h-80 overflow-y-auto mb-3 space-y-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
              msg.role === 'user'
                ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200'
                : msg.role === 'system'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {sending && !manifest && (
          <div className="flex justify-start">
            <div className="px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
              <Loader size={14} className="animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input or completion */}
      {manifest ? (
        <div className="space-y-3">
          <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <div className="flex items-center gap-1.5 mb-2 text-sm font-medium text-green-700 dark:text-green-300">
              <CheckCircle size={14} />
              Project Manifest
            </div>
            <div className="text-xs text-green-800 dark:text-green-200 space-y-1">
              <p><span className="font-medium">Purpose:</span> {manifest.purpose}</p>
              {manifest.domains?.length > 0 && (
                <p><span className="font-medium">Domains:</span> {manifest.domains.join(', ')}</p>
              )}
              {manifest.goals?.length > 0 && (
                <p><span className="font-medium">Goals:</span> {manifest.goals.join('; ')}</p>
              )}
              {manifest.keyQuestions?.length > 0 && (
                <div>
                  <span className="font-medium">Key questions:</span>
                  <ul className="ml-3 mt-0.5 list-disc">
                    {manifest.keyQuestions.map((q, i) => <li key={i}>{q}</li>)}
                  </ul>
                </div>
              )}
              {manifest.bridges?.length > 0 && (
                <p><span className="font-medium">Bridges:</span> {manifest.bridges.map(b => b.join(' <-> ')).join(', ')}</p>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            className="w-full px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700"
          >
            Done
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') sendResponse(); }}
            placeholder="Your answer..."
            disabled={sending || !interviewId}
            className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-50"
          />
          <button
            onClick={sendResponse}
            disabled={!input.trim() || sending || !interviewId}
            className="flex items-center gap-1 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            <Send size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// Manifest Editor Component
// =============================================================================

function ManifestEditor() {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['manifest'],
    queryFn: database.getManifest,
  });

  const manifest = data?.manifest;

  const startEditing = () => {
    setDraft({
      purpose: manifest?.purpose || '',
      domains: [...(manifest?.domains || [])],
      goals: [...(manifest?.goals || [])],
      keyQuestions: [...(manifest?.keyQuestions || [])],
      constraints: [...(manifest?.constraints || [])],
      bridges: (manifest?.bridges || []).map(b => [...b]),
      autoBridge: manifest?.autoBridge || false,
    });
    setEditing(true);
    setError(null);
  };

  const cancelEditing = () => {
    setDraft(null);
    setEditing(false);
    setError(null);
  };

  const saveManifest = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await database.updateManifest(draft);
      setEditing(false);
      setDraft(null);
      refetch();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Array field helpers
  const addItem = (field) => {
    setDraft(d => ({ ...d, [field]: [...d[field], ''] }));
  };
  const updateItem = (field, index, value) => {
    setDraft(d => {
      const arr = [...d[field]];
      arr[index] = value;
      return { ...d, [field]: arr };
    });
  };
  const removeItem = (field, index) => {
    setDraft(d => ({ ...d, [field]: d[field].filter((_, i) => i !== index) }));
  };

  // Bridge helpers
  const addBridge = () => {
    setDraft(d => ({ ...d, bridges: [...d.bridges, ['', '']] }));
  };
  const updateBridge = (index, side, value) => {
    setDraft(d => {
      const bridges = d.bridges.map(b => [...b]);
      bridges[index][side] = value;
      return { ...d, bridges };
    });
  };
  const removeBridge = (index) => {
    setDraft(d => ({ ...d, bridges: d.bridges.filter((_, i) => i !== index) }));
  };

  if (isLoading) return null;
  if (!manifest && !editing) {
    return (
      <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-800 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          No project manifest. Use <span className="font-medium">Guided</span> mode when creating a project, or
          <button onClick={startEditing} className="ml-1 text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
            create one manually
          </button>.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-sm font-medium text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 dark:hover:text-indigo-100"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Project Manifest
      </button>

      {expanded && (
        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          {error && (
            <div className="mb-2 p-2 text-xs bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 rounded">
              {error}
            </div>
          )}

          {editing && draft ? (
            <div className="space-y-3">
              {/* Purpose */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Purpose</label>
                <textarea
                  value={draft.purpose}
                  onChange={(e) => setDraft(d => ({ ...d, purpose: e.target.value }))}
                  rows={2}
                  className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                />
              </div>

              {/* Domains */}
              <ArrayField
                label="Domains"
                items={draft.domains}
                placeholder="domain-name"
                onAdd={() => addItem('domains')}
                onUpdate={(i, v) => updateItem('domains', i, v)}
                onRemove={(i) => removeItem('domains', i)}
              />

              {/* Goals */}
              <ArrayField
                label="Goals"
                items={draft.goals}
                placeholder="A goal for this project..."
                onAdd={() => addItem('goals')}
                onUpdate={(i, v) => updateItem('goals', i, v)}
                onRemove={(i) => removeItem('goals', i)}
              />

              {/* Key Questions */}
              <ArrayField
                label="Key Questions"
                items={draft.keyQuestions}
                placeholder="A question to explore..."
                onAdd={() => addItem('keyQuestions')}
                onUpdate={(i, v) => updateItem('keyQuestions', i, v)}
                onRemove={(i) => removeItem('keyQuestions', i)}
              />

              {/* Constraints */}
              <ArrayField
                label="Constraints"
                items={draft.constraints}
                placeholder="A constraint or boundary..."
                onAdd={() => addItem('constraints')}
                onUpdate={(i, v) => updateItem('constraints', i, v)}
                onRemove={(i) => removeItem('constraints', i)}
              />

              {/* Bridges */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bridges</label>
                {draft.bridges.map((bridge, i) => (
                  <div key={i} className="flex items-center gap-1.5 mb-1">
                    <input
                      value={bridge[0] || ''}
                      onChange={(e) => updateBridge(i, 0, e.target.value)}
                      placeholder="domain-a"
                      className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    />
                    <span className="text-xs text-gray-400">&harr;</span>
                    <input
                      value={bridge[1] || ''}
                      onChange={(e) => updateBridge(i, 1, e.target.value)}
                      placeholder="domain-b"
                      className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
                    />
                    <button onClick={() => removeBridge(i)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
                  </div>
                ))}
                <button onClick={addBridge} className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400">+ add bridge</button>
              </div>

              {/* Auto Bridge */}
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                <input
                  type="checkbox"
                  checked={draft.autoBridge}
                  onChange={(e) => setDraft(d => ({ ...d, autoBridge: e.target.checked }))}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                Auto-bridge new domains
              </label>

              {/* Save / Cancel */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveManifest}
                  disabled={saving}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving ? <Loader size={12} className="animate-spin" /> : <Save size={12} />}
                  Save
                </button>
                <button
                  onClick={cancelEditing}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div>
              {/* Read-only view */}
              <div className="text-xs space-y-1.5 text-gray-700 dark:text-gray-300">
                {manifest.purpose && (
                  <p><span className="font-medium text-gray-500 dark:text-gray-400">Purpose:</span> {manifest.purpose}</p>
                )}
                {manifest.domains?.length > 0 && (
                  <p><span className="font-medium text-gray-500 dark:text-gray-400">Domains:</span> {manifest.domains.join(', ')}</p>
                )}
                {manifest.goals?.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Goals:</span>
                    <ul className="ml-3 mt-0.5 list-disc">{manifest.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
                  </div>
                )}
                {manifest.keyQuestions?.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Key Questions:</span>
                    <ul className="ml-3 mt-0.5 list-disc">{manifest.keyQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
                  </div>
                )}
                {manifest.constraints?.length > 0 && (
                  <div>
                    <span className="font-medium text-gray-500 dark:text-gray-400">Constraints:</span>
                    <ul className="ml-3 mt-0.5 list-disc">{manifest.constraints.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  </div>
                )}
                {manifest.bridges?.length > 0 && (
                  <p><span className="font-medium text-gray-500 dark:text-gray-400">Bridges:</span> {manifest.bridges.map(b => b.join(' \u2194 ')).join(', ')}</p>
                )}
              </div>
              <button
                onClick={startEditing}
                className="mt-2 flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200"
              >
                <Edit3 size={12} />
                Edit manifest
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Read-only manifest display for non-active projects */
function ReadOnlyManifest({ manifest }) {
  const [expanded, setExpanded] = useState(false);
  if (!manifest) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Project Manifest
      </button>

      {expanded && (
        <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="text-xs space-y-1.5 text-gray-700 dark:text-gray-300">
            {manifest.purpose && (
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Purpose:</span> {manifest.purpose}</p>
            )}
            {manifest.domains?.length > 0 && (
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Domains:</span> {manifest.domains.join(', ')}</p>
            )}
            {manifest.goals?.length > 0 && (
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Goals:</span>
                <ul className="ml-3 mt-0.5 list-disc">{manifest.goals.map((g, i) => <li key={i}>{g}</li>)}</ul>
              </div>
            )}
            {manifest.keyQuestions?.length > 0 && (
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Key Questions:</span>
                <ul className="ml-3 mt-0.5 list-disc">{manifest.keyQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul>
              </div>
            )}
            {manifest.constraints?.length > 0 && (
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Constraints:</span>
                <ul className="ml-3 mt-0.5 list-disc">{manifest.constraints.map((c, i) => <li key={i}>{c}</li>)}</ul>
              </div>
            )}
            {manifest.bridges?.length > 0 && (
              <p><span className="font-medium text-gray-500 dark:text-gray-400">Bridges:</span> {manifest.bridges.map(b => b.join(' \u2194 ')).join(', ')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Reusable array field editor */
function ArrayField({ label, items, placeholder, onAdd, onUpdate, onRemove }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5 mb-1">
          <input
            value={item}
            onChange={(e) => onUpdate(i, e.target.value)}
            placeholder={placeholder}
            className="flex-1 px-2 py-1 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200"
          />
          <button onClick={() => onRemove(i)} className="text-red-400 hover:text-red-600"><X size={12} /></button>
        </div>
      ))}
      <button onClick={onAdd} className="text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400">+ add {label.toLowerCase().replace(/s$/, '')}</button>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

/** Project CRUD: list, load, save as, new (quick or interview), delete. */
export default function ProjectManagement() {
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [saveAsName, setSaveAsName] = useState('');
  const [message, setMessage] = useState(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [interviewMode, setInterviewMode] = useState(false); // true = interview, false = quick create
  const [activeInterview, setActiveInterview] = useState(null); // { name, description } when interview is running
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();

  const { data: projectsData, isLoading, refetch } = useQuery({
    queryKey: ['projects'],
    queryFn: database.listProjects,
  });

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  const saveMutation = useMutation({
    mutationFn: ({ name, description }) => database.saveProject(name, description),
    onSuccess: (data) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setSaveAsName('');
      showMessage('success', data.message);
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message || 'Save failed'),
  });

  const loadMutation = useMutation({
    mutationFn: (name) => database.loadProject(name),
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      showMessage('success', data.message);
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message || 'Load failed'),
  });

  const newMutation = useMutation({
    mutationFn: ({ name, description }) => database.newProject(name, description),
    onSuccess: (data) => {
      queryClient.invalidateQueries();
      setNewName('');
      setNewDescription('');
      setShowNewForm(false);
      showMessage('success', data.message);
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message || 'Create failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (name) => database.deleteProject(name),
    onSuccess: (data) => {
      refetch();
      showMessage('success', data.message);
    },
    onError: (err) => showMessage('error', err.response?.data?.error || err.message || 'Delete failed'),
  });


  const currentProject = projectsData?.currentProject;
  const projects = projectsData?.projects || [];

  const formatSize = (bytes) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isAnyMutating = saveMutation.isPending || loadMutation.isPending || newMutation.isPending || deleteMutation.isPending;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-6 border-2 border-indigo-200 dark:border-indigo-800">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-indigo-700 dark:text-indigo-300">
          <FolderOpen size={20} />
          Projects
        </h2>
        {currentProject && (
          <span className="text-sm px-3 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-medium">
            {currentProject}
          </span>
        )}
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg text-sm ${
          message.type === 'success' ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
        }`}>
          {message.text}
        </div>
      )}

      {/* Save Controls */}
      <div className="mb-4 p-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg">
        <h3 className="font-medium text-sm text-indigo-800 dark:text-indigo-300 mb-3">Save Project</h3>
        <div className="flex flex-wrap gap-2">
          {currentProject && (
            <button
              onClick={() => saveMutation.mutate({ name: currentProject })}
              disabled={isAnyMutating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
              Save "{currentProject}"
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={saveAsName}
              onChange={(e) => setSaveAsName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
              placeholder="Save as..."
              className="px-2 py-1.5 text-sm border rounded w-40 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
            <button
              onClick={() => saveAsName && saveMutation.mutate({ name: saveAsName })}
              disabled={!saveAsName || isAnyMutating}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50"
            >
              <Save size={14} />
              Save As
            </button>
          </div>
        </div>
      </div>

      {/* New Project */}
      <div className="mb-4">
        {activeInterview ? (
          <InterviewChat
            name={activeInterview.name}
            description={activeInterview.description}
            onComplete={(result) => {
              queryClient.invalidateQueries();
              showMessage('success', result.project?.message || 'Project created via interview');
            }}
            onCancel={() => {
              setActiveInterview(null);
              setShowNewForm(false);
              setNewName('');
              setNewDescription('');
              refetch();
            }}
          />
        ) : !showNewForm ? (
          <button
            onClick={() => setShowNewForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-700 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
          >
            <FolderPlus size={14} />
            New Project
          </button>
        ) : (
          <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
            <h3 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">Create New Project</h3>

            {/* Mode toggle */}
            <div className="flex gap-1 mb-3 p-0.5 bg-gray-200 dark:bg-gray-700 rounded-lg w-fit">
              <button
                onClick={() => setInterviewMode(false)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  !interviewMode
                    ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span className="flex items-center gap-1"><Plus size={12} /> Quick</span>
              </button>
              <button
                onClick={() => setInterviewMode(true)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  interviewMode
                    ? 'bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-200 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <span className="flex items-center gap-1"><MessageCircle size={12} /> Guided</span>
              </button>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              {interviewMode
                ? 'An AI interview will discover your project\'s purpose, domains, and goals to set up the knowledge graph optimally.'
                : 'Creates a fresh knowledge base. Models, prompts, and settings carry over.'}
            </p>

            <div className="space-y-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value.replace(/[^a-zA-Z0-9_-]/g, ''))}
                placeholder="Project name"
                className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
              />
              {!interviewMode && (
                <input
                  type="text"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-gray-400"
                />
              )}
              <div className="flex gap-2">
                {interviewMode ? (
                  <button
                    onClick={() => {
                      if (!newName) return;
                      setActiveInterview({ name: newName, description: newDescription });
                    }}
                    disabled={!newName || isAnyMutating}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    <MessageCircle size={14} />
                    Start Interview
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      if (!newName) return;
                      const ok = await confirm({
                        title: 'Create New Project',
                        message: `Create new project "${newName}"?\n\nThe current knowledge base will be backed up automatically before switching.`,
                        confirmLabel: 'Create',
                        confirmColor: 'bg-indigo-600 hover:bg-indigo-700',
                      });
                      if (ok) newMutation.mutate({ name: newName, description: newDescription });
                    }}
                    disabled={!newName || isAnyMutating}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {newMutation.isPending ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                    Create
                  </button>
                )}
                <button
                  onClick={() => { setShowNewForm(false); setNewName(''); setNewDescription(''); setInterviewMode(false); }}
                  className="px-3 py-1.5 text-sm bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Project List */}
      {isLoading ? (
        <div className="text-sm text-gray-500 dark:text-gray-400">Loading projects...</div>
      ) : projects.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-gray-600 dark:text-gray-400">Saved Projects</h3>
          {projects.map((p) => {
            const isActive = p.name === currentProject;
            return (
              <div
                key={p.name}
                className={`px-4 py-3 rounded-lg border ${
                  isActive ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-800 dark:text-gray-200">{p.name}</span>
                      {isActive && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-indigo-200 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">active</span>
                      )}
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.description}</p>
                    )}
                    <div className="text-xs text-gray-400 mt-1">
                      {p.nodeCount} nodes
                      {p.domains?.length > 0 && ` · ${p.domains.join(', ')}`}
                      {' · '}{formatSize(p.fileSize)}
                      {' · Saved '}{new Date(p.lastSaved).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3 shrink-0">
                    {!isActive && (
                      <>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Load Project',
                              message: `Load project "${p.name}"?\n\nCurrent state will be backed up automatically before switching.`,
                              confirmLabel: 'Load',
                              confirmColor: 'bg-amber-600 hover:bg-amber-700',
                            });
                            if (ok) loadMutation.mutate(p.name);
                          }}
                          disabled={isAnyMutating}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-amber-100 text-amber-700 rounded hover:bg-amber-200 disabled:opacity-50"
                        >
                          {loadMutation.isPending ? <Loader size={12} className="animate-spin" /> : <Upload size={12} />}
                          Load
                        </button>
                        <button
                          onClick={async () => {
                            const ok = await confirm({
                              title: 'Delete Project',
                              message: `Delete project "${p.name}"?\n\nThis cannot be undone. The project database file will be permanently removed.`,
                              confirmLabel: 'Delete',
                            });
                            if (ok) deleteMutation.mutate(p.name);
                          }}
                          disabled={isAnyMutating}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded disabled:opacity-50"
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {/* Active project: full editor; others: read-only view from list data */}
                {isActive ? (
                  <ManifestEditor />
                ) : p.manifest ? (
                  <ReadOnlyManifest manifest={p.manifest} />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500 dark:text-gray-400">No saved projects yet. Save the current knowledge base to get started.</p>
      )}
      {ConfirmDialogEl}
    </div>
  );
}
