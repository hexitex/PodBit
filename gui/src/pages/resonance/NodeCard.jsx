import { GitBranch, EyeOff } from 'lucide-react';
import VariableRefText from '../../components/VariableRefText';
import { formatNodeTime, formatNodeTimeFull } from './node-utils';

const TYPE_COLORS_SIMPLE = {
  seed: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  synthesis: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  voiced: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  breakthrough: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  possible: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  question: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  raw: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
  elite_verification: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
};

/** Compact card for a node in list view with type badge and content preview. */
export default function NodeCard({ node, onSelect, onShowTree }) {
  const trajectoryIcon = node.trajectory === 'knowledge' ? '📚' : node.trajectory === 'abstraction' ? '🌀' : null;

  return (
    <div
      onClick={() => onSelect(node)}
      className="bg-white dark:bg-gray-900 rounded-lg shadow dark:shadow-gray-950/50 p-4 cursor-pointer hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-xs px-2 py-1 rounded ${TYPE_COLORS_SIMPLE[node.type] || 'bg-gray-100 dark:bg-gray-800'}`}
            title={[node.origin && `Origin: ${node.origin}`, node.contributor && `Contributor: ${node.contributor}`].filter(Boolean).join(' · ') || undefined}
          >
            {node.type}{node.type === 'question' && node.metadata?.answered ? ' \u2713' : ''}
          </span>
          {node.type === 'question' && !node.metadata?.answered && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 border border-red-100 dark:border-red-800">
              open
            </span>
          )}
          {node.partition && (
            <span className="text-xs px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-800">
              {node.partition.name}
            </span>
          )}
          {node.excluded && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 dark:bg-orange-900/30 text-orange-500 dark:text-orange-400 border border-orange-100 dark:border-orange-800" title="Excluded from briefs">
              <EyeOff size={10} className="inline" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {node.validation?.composite && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
              ⭐ {node.validation.composite.toFixed(1)}
            </span>
          )}
          {trajectoryIcon && <span className="text-sm">{trajectoryIcon}</span>}
          {onShowTree && (
            <button
              onClick={(e) => { e.stopPropagation(); onShowTree(node); }}
              className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
              title="View family tree"
            >
              <GitBranch size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="flex gap-3 mb-3">
        {node.avatarUrl && (
          <img
            src={node.avatarUrl}
            alt=""
            className="w-4 h-4 rounded shadow-sm flex-shrink-0 bg-gray-100 dark:bg-gray-800 object-cover"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        )}
        <p className="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">
          <VariableRefText>{node.content}</VariableRefText>
        </p>
      </div>
      <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
        <span>W: {node.weight?.toFixed(2)}</span>
        <span className="text-gray-300 dark:text-gray-500">|</span>
        <span>S: {node.salience?.toFixed(2)}</span>
        {node.domain && (
          <>
            <span className="text-gray-300 dark:text-gray-500">|</span>
            <span className="text-blue-500 dark:text-blue-400">{node.domain}</span>
          </>
        )}
        {node.createdAt && (
          <>
            <span className="text-gray-300 dark:text-gray-500">|</span>
            <span title={formatNodeTimeFull(node.createdAt)}>{formatNodeTime(node.createdAt)}</span>
          </>
        )}
      </div>
    </div>
  );
}
