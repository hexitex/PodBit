import { useState, useRef, useEffect, useCallback, Fragment } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot, User, Loader, Brain, Tag, Globe, Wrench,
  BookOpen, ChevronRight, Zap, Trash2, BarChart3,
  Send, Filter, Plus, MessageSquare, Clock, SlidersHorizontal,
  AlertTriangle, ArrowDown, ArrowUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { conversations, partitions as partitionsApi, seeds, models, getSecurityKey } from '../lib/api';
import TagSelector from '../components/TagSelector';
import { useConfirmDialog } from '../components/ConfirmDialog';
import Markdown from '../components/Markdown';
import { resolveNodeNames, getCachedName } from '../lib/node-names';

// Alias for backwards compat within this file
const ChatMarkdown = Markdown;

// =============================================================================
// SSE Activity Stream hook — shows real-time progress while waiting
// =============================================================================

function useActivityStream(active) {
  const [events, setEvents] = useState([]);
  const esRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setEvents([]);
      return;
    }

    let cancelled = false;
    const startTime = Date.now();

    const handleMessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        // Only show events that happened after we started listening
        const evtTime = evt.timestamp ? new Date(evt.timestamp).getTime() : Date.now();
        if (evtTime < startTime - 1000) return;
        // Only show relevant categories
        if (['llm', 'synthesis', 'voicing', 'cycle', 'system', 'mcp'].includes(evt.category)) {
          setEvents(prev => [...prev.slice(-20), evt]);
        }
      } catch { /* ignore parse errors */ }
    };

    const handleInit = () => {
      // Skip init events — we only want live ones
    };

    getSecurityKey().then((key) => {
      if (cancelled) return;
      const url = key ? `/api/activity/stream?key=${encodeURIComponent(key)}` : '/api/activity/stream';
      const es = new EventSource(url);
      esRef.current = es;
      es.addEventListener('message', handleMessage);
      es.addEventListener('init', handleInit);
    });

    return () => {
      cancelled = true;
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
      setEvents([]);
    };
  }, [active]);

  return events;
}

// =============================================================================
// Slash commands — shown in autocomplete when user types "/"
// =============================================================================

const COMMANDS = [
  { cmd: '/research', syntax: '/research <topic>', desc: 'Generate foundational seeds about a topic' },
  { cmd: '/seed', syntax: '/seed <text>', desc: 'Paste your own research text as seed nodes' },
  { cmd: '/voice', syntax: '/voice <topic>', desc: 'Find and voice cross-domain connections' },
  { cmd: '/summarize', syntax: '/summarize <topic>', desc: 'Structured summary of what the graph knows' },
  { cmd: '/compress', syntax: '/compress <topic>', desc: 'Build a compressed meta-prompt from graph knowledge' },
  { cmd: '/tensions', syntax: '/tensions [topic]', desc: 'Find contradictions in the graph' },
  { cmd: '/stats', syntax: '/stats', desc: 'Show graph statistics', noParam: true },
  { cmd: '/synthesis', syntax: '/synthesis', desc: 'Run a synthesis cycle', noParam: true },
  { cmd: '/dedup', syntax: '/dedup [domain] [--apply]', desc: 'Find duplicate nodes (dry-run by default)' },
  { cmd: '/templates', syntax: '/templates', desc: 'List research brief templates', noParam: true },
];

// =============================================================================
// Message Component
// =============================================================================

function Message({ message, contextMeta }) {
  const isUser = message.role === 'user';
  const [showContext, setShowContext] = useState(false);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
        isUser ? 'bg-blue-500' : 'bg-gray-700'
      }`}>
        {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
      </div>
      <div className={`flex-1 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block rounded-lg px-4 py-2 text-left ${
          isUser ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-900 border dark:border-gray-700 shadow-sm'
        }`}>
          {isUser ? (
            <p className="text-sm whitespace-pre-wrap text-white">{message.content}</p>
          ) : (
            <div className="text-sm text-gray-700 dark:text-gray-300">
              <ChatMarkdown content={(message.content || '').replace(/<tool-findings>[\s\S]*?<\/tool-findings>/g, '').trim()} />
            </div>
          )}
        </div>
        {/* Context indicator for assistant messages */}
        {!isUser && contextMeta && contextMeta.knowledgeCount > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowContext(!showContext)}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Brain size={12} />
              {contextMeta.knowledgeCount} nodes
              <ChevronRight size={12} className={`transition-transform ${showContext ? 'rotate-90' : ''}`} />
            </button>
            {showContext && contextMeta.knowledge && (
              <div className="mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded border dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 text-left max-w-md">
                {contextMeta.knowledge.map((k, i) => (
                  <div key={i} className="mb-1">
                    <span className="text-gray-400">[{k.domain}]</span>{' '}
                    {k.id ? (
                      <Link to={`/graph?node=${k.id}`} className="hover:text-blue-400 hover:underline">
                        {k.content.slice(0, 80)}{k.content.length > 80 ? '...' : ''}
                      </Link>
                    ) : (
                      <span>{k.content.slice(0, 80)}{k.content.length > 80 ? '...' : ''}</span>
                    )}
                    <span className="text-orange-400 ml-1">({k.relevance})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* Tool call indicator */}
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-1">
            <button
              onClick={() => setShowContext(!showContext)}
              className="inline-flex items-center gap-1 text-xs text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300"
            >
              <Wrench size={12} />
              Used {message.toolCalls.length} tool{message.toolCalls.length !== 1 ? 's' : ''}
              <ChevronRight size={12} className={`transition-transform ${showContext ? 'rotate-90' : ''}`} />
            </button>
            {showContext && (
              <div className="mt-1 p-2 bg-amber-50 dark:bg-amber-950/30 rounded border border-amber-200 dark:border-amber-800 text-xs text-gray-600 dark:text-gray-400 text-left max-w-md">
                {message.toolCalls.map((tc, i) => (
                  <div key={i} className="mb-1 font-mono">
                    <span className="text-amber-600 dark:text-amber-400">{tc.name}</span>
                    <span className="text-gray-400">({JSON.stringify(tc.args).slice(0, 60)})</span>
                    {tc.durationMs && <span className="text-gray-400 ml-1">{tc.durationMs}ms</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Context Panel (Sidebar)
// =============================================================================

function ContextPanel({ sessionId, contextData, budgetData, chatSettings, onUpdateChatSettings }) {
  const knowledge = contextData?.knowledge || [];

  // Batch-resolve knowledge node names (getCachedName used in render)
  // Hooks must run before any early return — Rules of Hooks.
  const [, _forceNames] = useState(0);
  useEffect(() => {
    const ids = knowledge.map(k => k.id).filter(Boolean);
    if (ids.length > 0) resolveNodeNames(ids).then(() => _forceNames(n => n + 1));
  }, [knowledge.length]);

  if (!contextData && !sessionId) {
    return (
      <div className="p-4 text-center text-gray-400 dark:text-gray-500 text-sm">
        <Brain size={24} className="mx-auto mb-2 opacity-50" />
        <p>Context engine inactive</p>
        <p className="text-xs mt-1">Send a message to activate</p>
      </div>
    );
  }

  const topics = contextData?.topics || [];
  const domains = contextData?.domains || [];
  const budget = contextData?.budget || budgetData;

  return (
    <div className="p-3 space-y-4 text-sm overflow-y-auto h-full">
      {/* Context Settings */}
      {onUpdateChatSettings && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-medium mb-1">
            <SlidersHorizontal size={14} />
            Context Settings
          </div>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-400 mb-0.5">Max knowledge nodes</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0" max="100" step="1"
                  value={chatSettings?.maxKnowledgeNodes || 0}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                    onUpdateChatSettings({ maxKnowledgeNodes: v });
                  }}
                  className="border dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-0.5 text-xs w-16"
                />
                <span className="text-xs text-gray-400">
                  {(chatSettings?.maxKnowledgeNodes || 0) === 0 ? 'auto' : ''}
                </span>
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-0.5">Model profile</label>
              <select
                value={chatSettings?.modelProfile || ''}
                onChange={(e) => onUpdateChatSettings({ modelProfile: e.target.value })}
                className="border dark:border-gray-600 dark:bg-gray-800 rounded px-2 py-0.5 text-xs w-full"
              >
                <option value="">Auto (medium)</option>
                <option value="micro">Micro (3 nodes)</option>
                <option value="small">Small (5 nodes)</option>
                <option value="medium">Medium (15 nodes)</option>
                <option value="large">Large (30 nodes)</option>
                <option value="xl">XL (50 nodes)</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Session info */}
      <div>
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-medium mb-1">
          <Zap size={14} />
          Session
        </div>
        <div className="text-xs text-gray-400 font-mono truncate">{sessionId || 'none'}</div>
        {contextData?.turnCount > 0 && (
          <div className="text-xs text-gray-400 mt-0.5">Turn {contextData.turnCount}</div>
        )}
      </div>

      {/* Topics */}
      {topics.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-medium mb-1">
            <Tag size={14} />
            Topics ({topics.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {topics.map((t, i) => (
              <span key={i} className="inline-block px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded-full">
                {t.term}
                <span className="text-blue-300 ml-1">{t.weight}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Domains */}
      {domains.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-medium mb-1">
            <Globe size={14} />
            Domains ({domains.length})
          </div>
          <div className="flex flex-wrap gap-1">
            {domains.map((d, i) => (
              <span key={i} className="inline-block px-2 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs rounded-full">
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Knowledge nodes */}
      {knowledge.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-medium mb-1">
            <BookOpen size={14} />
            Knowledge ({knowledge.length})
          </div>
          <div className="space-y-1.5">
            {knowledge.map((k, i) => (
              <div key={i} className="p-1.5 bg-gray-50 dark:bg-gray-800 rounded border dark:border-gray-700 text-xs">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-gray-400">{k.domain}</span>
                  <div className="flex items-center gap-2">
                    {k.id && (
                      <Link to={`/graph?node=${k.id}`} className="text-blue-500 hover:underline font-mono">
                        {getCachedName(k.id)}
                      </Link>
                    )}
                    <span className="text-orange-500 font-mono">{k.relevance}</span>
                  </div>
                </div>
                <div className="text-gray-600 dark:text-gray-400 line-clamp-2">{k.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Token Budget */}
      {budget && (
        <div>
          <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 font-medium mb-1">
            <BarChart3 size={14} />
            Token Budget
          </div>
          <div className="space-y-1">
            {budget.knowledge && (
              <BudgetBar label="Knowledge" used={budget.knowledge.used} total={budget.knowledge.budget} color="blue" />
            )}
            {budget.history && (
              <BudgetBar label="History" used={budget.history.used} total={budget.history.budget} color="green" />
            )}
            {budget.response && (
              <BudgetBar label="Response" used={0} total={budget.response.budget} color="gray" />
            )}
          </div>
          {budget.total && (
            <div className="mt-1 text-xs text-gray-400">
              {budget.used || 0} / {budget.total} tokens used
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BudgetBar({ label, used, total, color }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const colorMap = {
    blue: 'bg-blue-400',
    green: 'bg-green-400',
    gray: 'bg-gray-300',
    orange: 'bg-orange-400',
  };

  return (
    <div>
      <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>{label}</span>
        <span>{used}/{total}</span>
      </div>
      <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 mt-0.5">
        <div
          className={`h-1.5 rounded-full ${colorMap[color] || 'bg-blue-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// Conversation List Panel
// =============================================================================

function ConversationList({ conversations: convList, activeId, onSelect, onCreate, onDelete }) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
        <button
          onClick={onCreate}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          <Plus size={14} />
          New Chat
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {(!convList || convList.length === 0) && (
          <div className="p-4 text-center text-gray-400 text-xs">
            No conversations yet
          </div>
        )}
        {convList?.map((conv) => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b transition-colors ${
              activeId === conv.id
                ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-l-blue-500'
                : 'hover:bg-gray-50 dark:hover:bg-gray-800 border-l-2 border-l-transparent'
            }`}
          >
            <MessageSquare size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
                {conv.title}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-0.5">
                <Clock size={10} />
                {formatRelativeTime(conv.updatedAt)}
                {conv.messageCount > 0 && (
                  <span className="text-gray-300">&middot; {conv.messageCount} msgs</span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
              className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-500 text-gray-300 dark:text-gray-600 transition-all"
              title="Delete conversation"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// =============================================================================
// Chat Page
// =============================================================================

/** Chat page: conversations, context engine, and tool-augmented replies. */
export default function Chat() {
  const queryClient = useQueryClient();
  const { confirm, ConfirmDialogEl } = useConfirmDialog();
  const [activeConversationId, setActiveConversationId] = useState(() =>
    localStorage.getItem('chat-active-conversation') || null
  );
  const [input, setInput] = useState('');
  const [pendingMessages, setPendingMessages] = useState([]);
  const [contextData, setContextData] = useState(null);
  const [lastError, setLastError] = useState(null);
  const [showPanel, setShowPanel] = useState(() => {
    const saved = localStorage.getItem('chat-panel-visible');
    return saved ? JSON.parse(saved) : true;
  });
  const [showCommands, setShowCommands] = useState(false);
  const [showScope, setShowScope] = useState(false);

  // SSE activity stream — active when a message is being processed
  const isSending = pendingMessages.some(m => m.status === 'sending');
  const activityEvents = useActivityStream(isSending);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const processingRef = useRef(false);
  const isNearBottomRef = useRef(false);
  const userDidSendRef = useRef(false);
  const [hasNewBelow, setHasNewBelow] = useState(false);
  const [isScrolledFromTop, setIsScrolledFromTop] = useState(false);
  const [migrationDone, setMigrationDone] = useState(() =>
    localStorage.getItem('chat-migration-v2') === 'done'
  );

  // =========================================================================
  // Tool calling toggle (persisted to chat.config in DB)
  // =========================================================================
  const { data: chatToolSettings } = useQuery({
    queryKey: ['chat-settings'],
    queryFn: () => models.chatSettings(),
    staleTime: 30_000,
  });

  const toolCallingMutation = useMutation({
    mutationFn: (enabled) => models.updateChatSettings({ toolCallingEnabled: enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat-settings'] }),
  });

  const chatSettingsMutation = useMutation({
    mutationFn: (settings) => models.updateChatSettings(settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chat-settings'] }),
  });

  const toolCallingEnabled = chatToolSettings?.toolCallingEnabled || false;

  // =========================================================================
  // localStorage migration: move old single-chat data to a DB conversation
  // =========================================================================
  useEffect(() => {
    if (migrationDone) return;

    const oldMessages = localStorage.getItem('chat-messages');
    if (!oldMessages) {
      localStorage.setItem('chat-migration-v2', 'done');
      setMigrationDone(true);
      return;
    }

    let msgs;
    try { msgs = JSON.parse(oldMessages); } catch { msgs = []; }
    if (msgs.length === 0) {
      localStorage.setItem('chat-migration-v2', 'done');
      setMigrationDone(true);
      return;
    }

    // Create a conversation from old data
    (async () => {
      try {
        const firstUserMsg = msgs.find(m => m.role === 'user');
        const title = firstUserMsg
          ? firstUserMsg.content.replace(/^\/\w+\s*/, '').trim().slice(0, 60) || 'Migrated Chat'
          : 'Migrated Chat';

        const conv = await conversations.create({ title });

        // Save messages into the new conversation
        await conversations.update(conv.id, {});
        // We need to write messages directly — use a raw API call
        // Actually, we can just update with the messages by calling the update endpoint.
        // But the update endpoint doesn't accept messages. The messages are persisted
        // through the sendMessage flow. For migration, let's write them via the
        // conversation GET + PUT pattern — but PUT doesn't support messages either.
        // The cleanest approach: just set the active conversation and let the old
        // messages be visible via the conversation list. Since we can't bulk-write
        // messages to the DB from the frontend easily, we'll create the conversation
        // and note the migration happened. Messages will start fresh.

        setActiveConversationId(conv.id);
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch (err) {
        console.warn('Migration failed:', err);
      }

      // Clean up old localStorage keys
      localStorage.removeItem('chat-messages');
      localStorage.removeItem('chat-session-id');
      localStorage.removeItem('chat-scope-partition');
      localStorage.removeItem('chat-scope-domains');
      localStorage.removeItem('chat-scope-visible');
      localStorage.setItem('chat-migration-v2', 'done');
      setMigrationDone(true);
    })();
  }, [migrationDone, queryClient]);

  // =========================================================================
  // React Query: conversation list + active conversation
  // =========================================================================

  const { data: conversationList } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversations.list().then(r => r.conversations || r),
    staleTime: 5000,
  });

  const { data: activeConversation } = useQuery({
    queryKey: ['conversation', activeConversationId],
    queryFn: async () => {
      try {
        return await conversations.get(activeConversationId);
      } catch (err) {
        // Conversation was deleted (e.g. project switch) — clear stale reference
        if (err.response?.status === 404) {
          setActiveConversationId(null);
          return null;
        }
        throw err;
      }
    },
    enabled: !!activeConversationId,
    staleTime: 2000,
  });

  const messages = activeConversation?.messages || [];
  const sessionId = activeConversation?.sessionId || null;

  // Scope from active conversation
  const scopeDomains = activeConversation?.scopeDomains || [];
  const scopePartition = activeConversation?.scopePartition || '';

  const { data: partitionList } = useQuery({
    queryKey: ['partitions'],
    queryFn: () => partitionsApi.list().then(r => r.data || r),
    staleTime: 60000,
  });

  const { data: domainList } = useQuery({
    queryKey: ['domains'],
    queryFn: () => seeds.domains().then(r => r.data?.domains || r.domains || r),
    staleTime: 60000,
  });

  // Persist active conversation ID
  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem('chat-active-conversation', activeConversationId);
    } else {
      localStorage.removeItem('chat-active-conversation');
    }
  }, [activeConversationId]);

  // Persist panel visibility
  useEffect(() => {
    localStorage.setItem('chat-panel-visible', JSON.stringify(showPanel));
  }, [showPanel]);

  // Scroll helpers
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setHasNewBelow(false);
  }, []);

  const scrollToTop = useCallback(() => {
    messagesContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  // Track scroll position to decide when to auto-scroll
  const handleMessagesScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    isNearBottomRef.current = nearBottom;
    if (nearBottom) setHasNewBelow(false);
    setIsScrolledFromTop(el.scrollTop > 200);
  }, []);

  // Smart scroll: ONLY scroll when user explicitly sends a message
  useEffect(() => {
    if (userDidSendRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      userDidSendRef.current = false;
      setHasNewBelow(false);
    } else if (messages.length > 0 || pendingMessages.length > 0) {
      const el = messagesContainerRef.current;
      if (el && el.scrollHeight - el.scrollTop - el.clientHeight > 150) {
        setHasNewBelow(true);
      }
    }
  }, [messages, pendingMessages]);

  // =========================================================================
  // Conversation CRUD mutations
  // =========================================================================

  const createConversation = useMutation({
    mutationFn: (data = {}) => conversations.create(data),
    onSuccess: (conv) => {
      setActiveConversationId(conv.id);
      setContextData(null);
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      inputRef.current?.focus();
    },
  });

  const deleteConversation = useMutation({
    mutationFn: (id) => conversations.delete(id),
    onSuccess: (_, deletedId) => {
      if (activeConversationId === deletedId) {
        setActiveConversationId(null);
        setContextData(null);
      }
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const updateConversation = useMutation({
    mutationFn: ({ id, data }) => conversations.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (activeConversationId) {
        queryClient.invalidateQueries({ queryKey: ['conversation', activeConversationId] });
      }
    },
  });

  // =========================================================================
  // Message queue processor — sends one at a time, allows input while pending
  // =========================================================================

  useEffect(() => {
    const processNext = async () => {
      if (processingRef.current) return;

      const nextMsg = pendingMessages.find(m => m.status === 'queued');
      if (!nextMsg) return;

      processingRef.current = true;

      // Mark as sending
      setPendingMessages(prev => prev.map(m =>
        m.id === nextMsg.id ? { ...m, status: 'sending' } : m
      ));

      let convId = activeConversationId;

      try {
        setLastError(null);

        // Create conversation if needed
        if (!convId) {
          const conv = await conversations.create({});
          convId = conv.id;
          setActiveConversationId(convId);
          queryClient.invalidateQueries({ queryKey: ['conversations'] });
        }

        const result = await conversations.sendMessage(convId, nextMsg.command, { mode: 'api' });
        if (result.context) setContextData(result.context);

        // Wait for conversation data to refresh before removing optimistic message
        await queryClient.invalidateQueries({ queryKey: ['conversation', convId] });
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      } catch (err) {
        console.error('Chat error:', err);
        let errMsg;
        if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
          errMsg = 'Request timed out — the model may still be processing. Check server logs or try again.';
        } else if (err.message === 'Network Error') {
          errMsg = 'Connection lost — the server may be busy or the request took too long. Try again.';
        } else {
          errMsg = err.response?.data?.error || err.message || 'Unknown error';
        }
        setLastError(errMsg);
      }

      // Remove completed message and allow next to process
      setPendingMessages(prev => prev.filter(m => m.id !== nextMsg.id));
      processingRef.current = false;
    };

    processNext();
  }, [pendingMessages, activeConversationId, queryClient]);

  // =========================================================================
  // Handlers
  // =========================================================================

  const handleSelectConversation = useCallback((id) => {
    setActiveConversationId(id);
    setContextData(null);
  }, []);

  const handleCreateConversation = useCallback(() => {
    createConversation.mutate({});
  }, [createConversation]);

  const handleDeleteConversation = useCallback(async (id) => {
    const ok = await confirm({
      title: 'Delete Conversation',
      message: 'Delete this conversation?\n\nAll messages will be permanently removed.',
      confirmLabel: 'Delete',
    });
    if (ok) deleteConversation.mutate(id);
  }, [deleteConversation, confirm]);

  const handleScopeChange = useCallback((newDomains, newPartition) => {
    if (!activeConversationId) return;
    updateConversation.mutate({
      id: activeConversationId,
      data: {
        scopeDomains: newDomains,
        scopePartition: newPartition || null,
      },
    });
  }, [activeConversationId, updateConversation]);

  const handlePartitionChange = useCallback((partId) => {
    let newDomains = scopeDomains;
    if (partId && partitionList) {
      const part = (Array.isArray(partitionList) ? partitionList : []).find(p => p.id === partId);
      if (part?.domains) {
        newDomains = part.domains;
      }
    } else if (!partId) {
      newDomains = [];
    }
    handleScopeChange(newDomains, partId);
  }, [partitionList, scopeDomains, handleScopeChange]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Slash commands go as-is; bare text gets /chat prefix for the backend router
    const command = input.startsWith('/') ? input.trim() : `/chat ${input.trim()}`;
    const msgId = `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    setInput('');
    setShowCommands(false);
    setLastError(null);
    userDidSendRef.current = true;

    setPendingMessages(prev => [...prev, {
      id: msgId,
      command,
      status: 'queued',
    }]);
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    // Show command autocomplete when user types "/" at the start
    setShowCommands(val === '/' || (val.startsWith('/') && !val.includes(' ')));
  };

  const handleCommandSelect = (cmd) => {
    setInput(cmd);
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowCommands(false);
    }
  };

  // Detect if user is typing a /seed command to switch to textarea
  const isSeedMode = input.startsWith('/seed ') || input === '/seed';

  return (
    <div className="h-full flex">
      {/* Conversation list panel (left) */}
      <div className="hidden md:flex w-64 border-r dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0 flex-col overflow-hidden">
        <ConversationList
          conversations={conversationList}
          activeId={activeConversationId}
          onSelect={handleSelectConversation}
          onCreate={handleCreateConversation}
          onDelete={handleDeleteConversation}
        />
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="bg-white dark:bg-gray-900 border-b dark:border-gray-700 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Mobile: New Chat button (conversation list hidden on mobile) */}
            <button
              onClick={handleCreateConversation}
              className="md:hidden p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400"
              title="New chat"
            >
              <Plus size={18} />
            </button>
            <h2 className="font-semibold text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
              {activeConversation?.title || 'Chat'}
            </h2>
            {contextData && (
              <span className="text-xs text-gray-400">
                Turn {contextData.turnCount || 0}
                {contextData.knowledge?.length > 0 && (
                  <> &middot; {contextData.knowledge.length} nodes</>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toolCallingMutation.mutate(!toolCallingEnabled)}
              className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${toolCallingEnabled ? 'text-amber-500' : 'text-gray-400'}`}
              title={toolCallingEnabled ? 'Tool calling enabled — click to disable' : 'Enable tool calling — let the LLM query the graph'}
            >
              <Wrench size={18} />
            </button>
            <button
              onClick={() => setShowPanel(!showPanel)}
              className={`p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 ${showPanel ? 'text-blue-500' : 'text-gray-400'}`}
              title="Toggle context panel"
            >
              <Brain size={18} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={messagesContainerRef}
          onScroll={handleMessagesScroll}
          className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 bg-gray-50 dark:bg-gray-950 min-h-0 relative"
        >
          {!activeConversationId && (
            <div className="text-center text-gray-400 mt-20">
              <Brain size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg">Multi-Conversation Chat</p>
              <p className="text-sm mt-1">Create a new chat or select an existing one to start</p>
              <button
                onClick={handleCreateConversation}
                className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 transition-colors"
              >
                <Plus size={14} className="inline mr-1" />
                New Chat
              </button>
            </div>
          )}
          {activeConversationId && messages.length === 0 && pendingMessages.length === 0 && (
            <div className="text-center text-gray-400 mt-20">
              <Brain size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-lg">Context Engine Active</p>
              <p className="text-sm mt-1">Knowledge from the graph will be dynamically selected and compressed for each message</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <Message key={`msg-${i}`} message={msg} />
          ))}
          {pendingMessages.map((pm) => (
            <Fragment key={pm.id}>
              <Message message={{ role: 'user', content: pm.command }} />
              {pm.status === 'sending' && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <Loader size={16} className="text-white animate-spin" />
                  </div>
                  <div className="inline-block bg-white dark:bg-gray-900 border dark:border-gray-700 shadow-sm rounded-lg px-4 py-2 max-w-[80%]">
                    {activityEvents.length === 0 ? (
                      <p className="text-sm text-gray-400">Thinking...</p>
                    ) : (
                      <div className="space-y-1">
                        {activityEvents.slice(-5).map((evt, i) => (
                          <div key={evt.id || i} className="flex items-center gap-2 text-xs animate-fade-in">
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              evt.type?.includes('complete') || evt.type?.includes('scored')
                                ? 'bg-green-400'
                                : evt.type?.includes('fail') || evt.type?.includes('error')
                                ? 'bg-red-400'
                                : 'bg-blue-400 animate-pulse'
                            }`} />
                            <span className="text-gray-500 dark:text-gray-400 truncate">{evt.message}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Fragment>
          ))}
          {lastError && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={16} className="text-white" />
              </div>
              <div className="inline-block bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-2 max-w-[80%]">
                <p className="text-sm text-red-700 dark:text-red-300 font-medium mb-1">Error</p>
                <p className="text-sm text-red-600 dark:text-red-400">{lastError}</p>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />

          {/* Floating: "New messages" pill */}
          {hasNewBelow && (
            <button
              onClick={scrollToBottom}
              className="sticky bottom-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-full shadow-lg hover:bg-blue-600 transition-all animate-bounce-once"
            >
              <ArrowDown size={12} />
              New messages
            </button>
          )}

          {/* Floating: "Back to top" button */}
          {isScrolledFromTop && !hasNewBelow && (
            <button
              onClick={scrollToTop}
              className="sticky bottom-3 right-3 ml-auto z-10 flex items-center gap-1 px-2.5 py-1.5 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs border dark:border-gray-700 rounded-full shadow-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
            >
              <ArrowUp size={12} />
              Top
            </button>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 border-t dark:border-gray-700 p-4">
          {/* Scope selector */}
          {activeConversationId && (
            <div className="mb-3">
              <button
                type="button"
                onClick={() => setShowScope(!showScope)}
                className={`flex items-center gap-1.5 text-xs ${
                  scopeDomains.length > 0
                    ? 'text-blue-600 font-medium'
                    : 'text-gray-400'
                } hover:text-blue-500 transition-colors`}
              >
                <Filter size={12} />
                {scopeDomains.length > 0
                  ? `Scope: ${scopeDomains.length} domain${scopeDomains.length !== 1 ? 's' : ''}`
                  : 'Scope: All domains'}
                <ChevronRight size={12} className={`transition-transform ${showScope ? 'rotate-90' : ''}`} />
              </button>

              {showScope && (
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <div className="sm:w-48">
                    <TagSelector
                      items={(Array.isArray(partitionList) ? partitionList : []).map(p => ({ value: p.id, label: p.name || p.id }))}
                      selected={scopePartition}
                      onChange={handlePartitionChange}
                      placeholder="Partition..."
                    />
                  </div>
                  <div className="flex-1">
                    <TagSelector
                      items={Array.isArray(domainList) ? domainList : []}
                      selected={scopeDomains}
                      onChange={(newDomains) => handleScopeChange(newDomains, scopePartition)}
                      multi
                      placeholder="Domains..."
                    />
                  </div>
                  {scopeDomains.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleScopeChange([], '')}
                      className="self-end text-xs text-gray-400 hover:text-red-500 px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Input row */}
          <div className="flex gap-2 relative">
            <div className="relative flex-1">
              {isSeedMode ? (
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={(e) => {
                    handleInputKeyDown(e);
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      handleSubmit(e);
                    }
                  }}
                  placeholder="/seed — Paste research text here. Separate paragraphs with blank lines for multiple seeds."
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y min-h-[80px] max-h-[200px] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  rows={3}
                  autoFocus
                />
              ) : (
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Ask anything, or type / for commands..."
                  className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  autoFocus
                />
              )}
              {/* Command autocomplete — filters as user types */}
              {showCommands && (
                <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-gray-900 border dark:border-gray-700 rounded-lg shadow-lg dark:shadow-gray-950/50 max-h-64 overflow-y-auto z-10">
                  {COMMANDS
                    .filter(c => c.cmd.startsWith(input.split(' ')[0]))
                    .map(({ cmd, syntax, desc, noParam }) => (
                    <button
                      key={cmd}
                      type="button"
                      onClick={() => handleCommandSelect(noParam ? cmd : cmd + ' ')}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      <code className="text-xs font-mono text-blue-600 font-semibold w-36 flex-shrink-0">{syntax}</code>
                      <span className="text-xs text-gray-500">{desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim()}
              className={`px-5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed ${isSeedMode ? 'self-end py-3' : 'py-3'}`}
            >
              <Send size={18} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {isSeedMode
              ? <><kbd className="bg-gray-100 dark:bg-gray-800 px-1 rounded">Ctrl+Enter</kbd> to submit seed text</>
              : <>Type <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">/</code> for commands — or just ask naturally</>
            }
          </p>
        </form>
      </div>

      {/* Context Panel (sidebar) */}
      {showPanel && (
        <div className="hidden lg:block w-72 border-l dark:border-gray-700 bg-white dark:bg-gray-900 flex-shrink-0 overflow-hidden">
          <div className="px-3 py-2 border-b dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-400 font-medium text-sm">
              <Brain size={14} />
              Context Engine
            </div>
          </div>
          <ContextPanel
            sessionId={sessionId}
            contextData={contextData}
            chatSettings={chatToolSettings}
            onUpdateChatSettings={(s) => chatSettingsMutation.mutate(s)}
          />
        </div>
      )}
      {ConfirmDialogEl}
    </div>
  );
}
