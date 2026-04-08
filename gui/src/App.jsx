import { useState, useRef, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Brain, FileText, Settings, Home, MessageSquare, BookOpen, PenTool, Menu, X, Server, Database, Zap, FolderOpen, DollarSign, Briefcase, ShieldCheck, Radio, Globe, GitBranch, Activity, FlaskConical } from 'lucide-react';
import { database, evm, server } from './lib/api';
import { ThemeProvider } from './lib/theme';
import ThemeSwitcher from './components/ThemeSwitcher';
import Dashboard from './pages/Dashboard';
import Resonance from './pages/Resonance';
import Scaffold from './pages/Scaffold';
import Prompts from './pages/Prompts';
import Config from './pages/Config';
import Chat from './pages/Chat';
import Help from './pages/Help';
import Models from './pages/Models';
import Data from './pages/Data';
import Breakthroughs from './pages/Breakthroughs';
import KnowledgeBase from './pages/KnowledgeBase';
import CostAnalytics from './pages/CostAnalytics';
import Projects from './pages/Projects';
import Verification from './pages/Verification';
import ApiRegistry from './pages/ApiRegistry';
import ActivityLog from './pages/ActivityLog';
import Pipeline from './pages/Pipeline';
import Labs from './pages/Labs';
import EmbeddingEval from './pages/EmbeddingEval';
import BudgetBanner from './components/BudgetBanner';

const links = [
  { to: '/projects', icon: Briefcase, label: 'Projects' },
  { to: '/', icon: Home, label: 'Dashboard' },

  { section: 'Knowledge' },
  { to: '/graph', icon: Brain, label: 'Graph' },
  { to: '/chat', icon: MessageSquare, label: 'Chat' },
  { to: '/breakthroughs', icon: Zap, label: 'Breakthroughs' },

  { section: 'Synthesis' },
  { to: '/pipeline', icon: GitBranch, label: 'Pipeline' },
  { to: '/verification', icon: ShieldCheck, label: 'Verification' },
  { to: '/activity', icon: Radio, label: 'Activity Log' },
  { to: '/embedding-eval', icon: Activity, label: 'Embedding Eval' },

  { section: 'Settings' },
  { to: '/models', icon: Server, label: 'Models' },
  { to: '/labs', icon: FlaskConical, label: 'Labs' },
  { to: '/api-registry', icon: Globe, label: 'API Registry' },
  { to: '/prompts', icon: PenTool, label: 'Prompts' },
  { to: '/config', icon: Settings, label: 'Config' },
  { to: '/kb', icon: FolderOpen, label: 'Knowledge Ingestion' },
  { to: '/costs', icon: DollarSign, label: 'Cost & Budgets' },

  { section: 'Tools' },
  { to: '/docs', icon: FileText, label: 'Create Docs' },

  { section: '' },
  { to: '/help', icon: BookOpen, label: 'Help' },

  { section: 'System' },
  { to: '/data', icon: Database, label: 'Data' },
];

function SidebarNavLink({ item, onClose, badge }) {
  const { to, icon: Icon, label } = item;

  return (
    <NavLink
      to={to}
      end={to === '/'}
      onClick={onClose}
      className={({ isActive }) =>
        `flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
          isActive
            ? 'bg-podbit-600 text-white dark:text-white'
            : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
        }`
      }
    >
      <Icon size={20} />
      <span className="flex-1">{label}</span>
      {badge > 0 && (
        <span className="bg-purple-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
          {badge}
        </span>
      )}
    </NavLink>
  );
}

function Sidebar({ open, onClose }) {
  const { data: projectsData } = useQuery({
    queryKey: ['projects'],
    queryFn: database.listProjects,
    staleTime: 30000,
  });
  const { data: evmStats } = useQuery({
    queryKey: ['lab-stats', 30],
    queryFn: () => evm.stats(30),
    staleTime: 30000,
    refetchInterval: 30000,
  });
  const { data: healthData } = useQuery({
    queryKey: ['server-health'],
    queryFn: server.health,
    staleTime: 60000,
    retry: 1,
  });
  const pendingReviews = evmStats?.pendingReviews ?? 0;

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 bg-white dark:bg-gray-950 text-gray-900 dark:text-white flex flex-col
        transform transition-transform duration-200 ease-in-out
        lg:static lg:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
        w-64
        sm:w-56
        xl:w-72
        border-r border-gray-200 dark:border-gray-800
      `}>
        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <img src="/podbit-logo.svg" alt="Podbit" className="h-8 w-auto" />
              Podbit
            </h1>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Pods of knowledge. Bits of insight.</p>
            {projectsData?.currentProject && (
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{projectsData.currentProject}</p>
            )}
          </div>
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-gray-700 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {links.map((item, i) => {
            if (item.section !== undefined) {
              return (
                <div key={`section-${i}`} className="pt-4 pb-1 first:pt-0">
                  {item.section && (
                    <p className="px-4 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-600">{item.section}</p>
                  )}
                  {!item.section && <div className="border-t border-gray-200 dark:border-gray-800 mx-2" />}
                </div>
              );
            }
            return <SidebarNavLink key={item.to} item={item} onClose={onClose} badge={item.to === '/verification' ? pendingReviews : 0} />;
          })}
        </nav>
        <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
          <ThemeSwitcher />
          {healthData?.version && <p className="text-xs text-gray-400 dark:text-gray-500">v{healthData.version}</p>}
        </div>
      </aside>
    </>
  );
}

function MobileHeader({ onMenuClick }) {
  const location = useLocation();
  const current = links.find(l => l.to && l.to === location.pathname) || links[0];
  const Icon = current.icon;

  return (
    <header className="lg:hidden bg-white dark:bg-gray-950 text-gray-900 dark:text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-30 border-b border-gray-200 dark:border-gray-800">
      <button onClick={onMenuClick} className="text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">
        <Menu size={24} />
      </button>
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-podbit-600 dark:text-podbit-400" />
        <span className="font-medium">{current.label}</span>
      </div>
    </header>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-950 overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <MobileHeader onMenuClick={() => setSidebarOpen(true)} />
        <BudgetBanner />
        <main ref={mainRef} className="flex-1 min-h-0 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/graph" element={<Resonance />} />
            <Route path="/breakthroughs" element={<Breakthroughs />} />
            <Route path="/models" element={<Models />} />
            <Route path="/costs" element={<CostAnalytics />} />
            <Route path="/docs" element={<Scaffold />} />
            <Route path="/prompts" element={<Prompts />} />
            <Route path="/kb" element={<KnowledgeBase />} />
            <Route path="/data" element={<Data />} />
            <Route path="/verification" element={<Verification />} />
            <Route path="/api-registry" element={<ApiRegistry />} />
            <Route path="/labs" element={<Labs />} />
            <Route path="/config" element={<Config />} />
            <Route path="/pipeline" element={<Pipeline />} />
            <Route path="/activity" element={<ActivityLog />} />
            <Route path="/embedding-eval" element={<EmbeddingEval />} />
            <Route path="/help/*" element={<Help />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppLayout />
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
