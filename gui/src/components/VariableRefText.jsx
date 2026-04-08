import { useState, useRef, useCallback } from 'react';
import { database } from '../lib/api';

/**
 * Renders text with [[[NXnnn]]] variable refs as hoverable spans
 * that show the actual value + scope tooltip on mouse enter.
 * Uses a shared in-memory cache to avoid repeated API calls.
 */

// Module-level cache shared across all instances
const varCache = new Map();
const pendingFetches = new Map();

async function resolveVars(varIds) {
  // Await any in-flight fetches for these IDs first
  const pending = varIds
    .map(id => pendingFetches.get(id))
    .filter(Boolean);
  if (pending.length > 0) {
    await Promise.all(pending);
  }

  // Filter to uncached IDs (after awaiting pending)
  const needed = varIds.filter(id => !varCache.has(id));
  if (needed.length === 0) return;

  // Deduplicate in-flight requests
  const fetchPromise = database.resolveNumberVariables(needed).then(result => {
    const vars = result?.variables || {};
    for (const id of needed) {
      varCache.set(id, vars[id] || null);
      pendingFetches.delete(id);
    }
  }).catch(() => {
    for (const id of needed) pendingFetches.delete(id);
  });

  for (const id of needed) pendingFetches.set(id, fetchPromise);
  await fetchPromise;
}

const VAR_PATTERN = /(\[\[\[([A-Z]+\d+)\]\]\])/g;

function VarRef({ varId }) {
  const [tooltip, setTooltip] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [show, setShow] = useState(false);
  const spanRef = useRef(null);

  const handleMouseEnter = useCallback(async () => {
    // Resolve if not cached
    if (!varCache.has(varId)) {
      await resolveVars([varId]);
    }
    const data = varCache.get(varId);
    if (data) {
      setTooltip(data);
    } else {
      setTooltip({ value: '?', scopeText: 'Unknown variable', domain: '?' });
    }

    if (spanRef.current) {
      const rect = spanRef.current.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
    setShow(true);
  }, [varId]);

  const handleMouseLeave = useCallback(() => {
    setShow(false);
  }, []);

  return (
    <>
      <span
        ref={spanRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="inline-flex items-baseline cursor-help"
      >
        {tooltip ? (
          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 border-b border-dotted border-blue-400">
            {tooltip.value}
          </span>
        ) : (
          <span className="font-mono font-bold text-blue-600 dark:text-blue-400 border-b border-dotted border-blue-400 opacity-70">
            {varId}
          </span>
        )}
      </span>
      {show && tooltip && (
        <span
          className="fixed z-50 px-2 py-1 text-xs rounded shadow-lg bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 pointer-events-none whitespace-nowrap"
          style={{
            left: `${pos.x}px`,
            top: `${pos.y - 4}px`,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <span className="font-mono font-bold">{varId}</span> = {tooltip.value}
          <span className="text-gray-400 dark:text-gray-500 ml-1">({tooltip.domain}: {tooltip.scopeText})</span>
        </span>
      )}
    </>
  );
}

/**
 * Renders text, replacing [[[NXnnn]]] with hoverable variable references.
 * If no variable refs are found, renders children as-is (zero overhead).
 */
export default function VariableRefText({ children }) {
  if (!children || typeof children !== 'string') return children;
  if (!children.includes('[[[')) return children;

  // Pre-fetch all variable IDs in this text
  const allIds = [];
  let m;
  const re = new RegExp(VAR_PATTERN.source, 'g');
  while ((m = re.exec(children)) !== null) {
    allIds.push(m[2]);
  }
  if (allIds.length > 0) {
    resolveVars(allIds); // fire-and-forget prefetch
  }

  // Split text around variable refs
  const parts = children.split(VAR_PATTERN);
  // parts array: [text, fullMatch, varId, text, fullMatch, varId, ...]
  // groups of 3: text, fullMatch, varId

  const elements = [];
  let i = 0;
  while (i < parts.length) {
    const text = parts[i];
    if (text) elements.push(text);
    i++;
    if (i < parts.length) {
      const varId = parts[i + 1]; // captured group 2 = varId
      if (varId) {
        elements.push(<VarRef key={`${varId}-${i}`} varId={varId} />);
      }
      i += 2; // skip fullMatch + varId
    }
  }

  return <>{elements}</>;
}

function _clearVarCache() {
  varCache.clear();
}
