/**
 * RelatedLinks — cross-page navigation badges for Prompts <-> Models <-> Config.
 *
 * Shows small clickable badges that navigate to related items on other pages.
 * Uses URL hash anchors to scroll directly to the target item.
 */
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';

/**
 * PageRelationshipBanner — shown at top of Config, Prompts, and Models pages.
 * Explains how the three pages relate and links to each other.
 */
export function PageRelationshipBanner({ currentPage }) {
  const pages = [
    { key: 'models', label: 'Models', path: '/models', desc: 'assign LLMs to subsystems' },
    { key: 'prompts', label: 'Prompts', path: '/prompts', desc: 'edit system prompts' },
    { key: 'config', label: 'Config', path: '/config', desc: 'tune algorithm parameters' },
  ];

  const others = pages.filter(p => p.key !== currentPage);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-4 flex-wrap">
      <span className="text-gray-400 dark:text-gray-500">Related:</span>
      {others.map(p => (
        <Link
          key={p.key}
          to={p.path}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
        >
          {p.label}
          <span className="text-gray-400 dark:text-gray-500">&middot;</span>
          <span className="text-gray-400 dark:text-gray-500">{p.desc}</span>
          <ArrowUpRight size={10} className="text-gray-400" />
        </Link>
      ))}
    </div>
  );
}

/**
 * SubsystemBadge — shown on prompt/config items to indicate which subsystem uses them.
 * Links to the specific subsystem row on the Models page via hash anchor.
 * Optional `assigned` prop shows a colored dot: green = model assigned, red = unassigned.
 */
export function SubsystemBadge({ subsystem, tier, assigned }) {
  const tierColors = {
    frontier: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    small: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    dedicated: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };

  // When assigned is undefined, don't show dot (caller didn't provide assignment data)
  const showDot = assigned !== undefined;
  const dotColor = assigned ? 'bg-green-500' : 'bg-red-400 dark:bg-red-500';
  const statusText = assigned ? 'assigned' : 'NOT assigned';

  return (
    <Link
      to={`/models#subsystem-${subsystem}`}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${tierColors[tier] || tierColors.dedicated} hover:opacity-80 transition-opacity`}
      title={`Subsystem: ${subsystem} (${tier} tier)${showDot ? ` — ${statusText}` : ''} — click to view model assignment`}
    >
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0`} />}
      {subsystem}
      <ArrowUpRight size={8} />
    </Link>
  );
}

/**
 * ConfigLink — small link badge to a config section. Anchors to the specific section.
 */
export function ConfigLink({ sectionId, label }) {
  return (
    <Link
      to={`/config#${sectionId}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300 hover:opacity-80 transition-opacity"
      title={`Config: ${sectionId} — click to view settings`}
    >
      {label || sectionId}
      <ArrowUpRight size={8} />
    </Link>
  );
}

/**
 * PromptLink — small link badge to a prompt. Anchors to the specific prompt card.
 */
export function PromptLink({ promptId }) {
  return (
    <Link
      to={`/prompts#${promptId}`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300 hover:opacity-80 transition-opacity"
      title={`Prompt: ${promptId} — click to view/edit`}
    >
      {promptId}
      <ArrowUpRight size={8} />
    </Link>
  );
}
