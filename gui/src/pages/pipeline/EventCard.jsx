import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getCachedName } from '../../lib/node-names';

/**
 * Full-detail event card for the pipeline tree.
 * Shows all available fields from the event detail object.
 */
export default function EventCard({ evt }) {
  const [expanded, setExpanded] = useState(false);
  const d = evt.detail || {};

  const ts = new Date(evt.time);
  const timeStr = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Collect parent node IDs
  const parents = [];
  if (d.nodeA) parents.push(d.nodeA);
  if (d.nodeB) parents.push(d.nodeB);
  if (d.parentA && !parents.includes(d.parentA)) parents.push(d.parentA);
  if (d.parentB && !parents.includes(d.parentB)) parents.push(d.parentB);

  // Collect domains
  const domains = [];
  if (d.domain) domains.push(d.domain);
  if (d.domainA && !domains.includes(d.domainA)) domains.push(d.domainA);
  if (d.domainB && !domains.includes(d.domainB)) domains.push(d.domainB);
  if (d.domains) d.domains.forEach(dm => { if (!domains.includes(dm)) domains.push(dm); });

  // Check if there's rich detail worth expanding
  const hasRichDetail = d.totalClauses != null || d.domainCount != null ||
    d.maxSimilarity != null || d.scores != null || d.reasoning ||
    (d.reasons && d.reasons.length > 0) || d.matchedNode || d.junkNode ||
    d.novelWords != null || d.consultantScore != null;

  return (
    <div
      className={`text-xs rounded border transition-colors ${
        evt.passed
          ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-900/30'
          : 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-900/30'
      }`}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-2 p-2 cursor-pointer"
        onClick={() => hasRichDetail && setExpanded(!expanded)}
      >
        <span className={`shrink-0 font-bold ${evt.passed ? 'text-green-500' : 'text-red-500'}`}>
          {evt.passed ? '\u2713' : '\u2717'}
        </span>

        <span className="text-gray-600 dark:text-gray-300 truncate flex-1">
          {evt.message}
        </span>

        {/* Inline chips */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Model provenance */}
          {d.modelName && (
            <span
              className="px-1.5 py-0.5 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-300 rounded text-xs"
              title={d.modelId || ''}
            >
              {d.modelName}
            </span>
          )}

          {/* Domains */}
          {domains.slice(0, 2).map(dm => (
            <span key={dm} className="px-1.5 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-300 rounded text-xs">
              {dm}
            </span>
          ))}

          {/* Similarity */}
          {d.similarity != null && (
            <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">
              sim:{d.similarity.toFixed(3)}
            </span>
          )}

          {/* Node link */}
          {(d.nodeId || d.childId) && (
            <Link
              to={`/graph?node=${d.nodeId || d.childId}`}
              className="text-blue-500 hover:underline font-mono text-xs shrink-0"
              onClick={e => e.stopPropagation()}
            >
              {getCachedName(d.nodeId || d.childId)}
            </Link>
          )}

          {/* Timestamp */}
          <span className="text-gray-400 dark:text-gray-500 font-mono text-xs shrink-0">
            {timeStr}
          </span>

          {/* Expand indicator */}
          {hasRichDetail && (
            <span className="text-gray-400 dark:text-gray-500">
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          )}
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-2.5 pt-0.5 border-t border-gray-100 dark:border-gray-800 space-y-1.5">
          {/* Parent nodes */}
          {parents.length > 0 && (
            <DetailRow label="Parents">
              {parents.map((pid, i) => (
                <span key={pid}>
                  {i > 0 && <span className="text-gray-400 mx-0.5">+</span>}
                  <Link
                    to={`/graph?node=${pid}`}
                    className="text-blue-500 hover:underline font-mono"
                  >
                    {getCachedName(pid)}
                  </Link>
                </span>
              ))}
            </DetailRow>
          )}

          {/* Quality scores */}
          {(d.specificity != null || d.weight != null || d.fitness != null) && (
            <DetailRow label="Quality">
              <div className="flex gap-3">
                {d.specificity != null && <Metric label="spec" value={typeof d.specificity === 'number' ? d.specificity.toFixed(1) : d.specificity} />}
                {d.weight != null && <Metric label="weight" value={d.weight.toFixed(2)} />}
                {d.fitness != null && <Metric label="fitness" value={d.fitness.toFixed(1)} />}
                {d.wordCount != null && <Metric label="words" value={d.wordCount} />}
              </div>
            </DetailRow>
          )}

          {/* Similarity bar */}
          {d.similarity != null && d.threshold != null && (
            <DetailRow label="Similarity">
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full relative overflow-visible">
                  {/* Threshold marker */}
                  <div
                    className="absolute top-0 h-2 w-px bg-gray-400 dark:bg-gray-500"
                    style={{ left: `${Math.min(d.threshold * 100, 100)}%` }}
                    title={`threshold: ${d.threshold.toFixed(3)}`}
                  />
                  {/* Value fill */}
                  <div
                    className={`h-full rounded-full ${d.passed ? 'bg-green-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.min(d.similarity * 100, 100)}%` }}
                  />
                </div>
                <span className="font-mono text-gray-500 dark:text-gray-400 w-16 text-right">
                  {d.similarity.toFixed(3)} / {d.threshold.toFixed(3)}
                </span>
              </div>
            </DetailRow>
          )}

          {/* Grounding (claim provenance) */}
          {d.totalClauses != null && (
            <DetailRow label="Grounding">
              <div className="flex items-center gap-2 flex-1">
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${(d.orphanRatio || 0) > 0.3 ? 'bg-red-400' : 'bg-green-400'}`}
                    style={{ width: `${(1 - (d.orphanRatio || 0)) * 100}%` }}
                  />
                </div>
                <span className="font-mono text-gray-500 dark:text-gray-400">
                  {d.totalClauses - (d.orphanedClauses || 0)}/{d.totalClauses} grounded
                </span>
              </div>
            </DetailRow>
          )}

          {/* Counterfactual independence */}
          {d.domainCount != null && (
            <DetailRow label="Counterfactual">
              <span className="font-mono">
                {d.domainCount - (d.decorativeCount || 0)}/{d.domainCount} domains contribute
              </span>
              {d.decorativeCount > 0 && (
                <span className="text-red-500 ml-1">({d.decorativeCount} decorative)</span>
              )}
            </DetailRow>
          )}

          {/* Redundancy */}
          {d.maxSimilarity != null && (
            <DetailRow label="Redundancy">
              <div className="flex gap-3">
                <Metric label="max parent sim" value={d.maxSimilarity.toFixed(3)} />
                {d.centroidSimilarity != null && <Metric label="centroid" value={d.centroidSimilarity.toFixed(3)} />}
                {d.parentCount != null && <Metric label="parents" value={d.parentCount} />}
              </div>
            </DetailRow>
          )}

          {/* Dedup match */}
          {d.matchedNode && (
            <DetailRow label="Dedup match">
              <Link
                to={`/graph?node=${d.matchedNode}`}
                className="text-blue-500 hover:underline font-mono"
              >
                {getCachedName(d.matchedNode)}
              </Link>
            </DetailRow>
          )}

          {/* Junk filter */}
          {d.junkNode && (
            <DetailRow label="Junk match">
              <Link
                to={`/graph?node=${d.junkNode}`}
                className="text-blue-500 hover:underline font-mono"
              >
                {getCachedName(d.junkNode)}
              </Link>
              {d.junkNodesChecked != null && (
                <span className="text-gray-400 ml-1">({d.junkNodesChecked} checked)</span>
              )}
            </DetailRow>
          )}

          {/* Consultant scores */}
          {d.scores && typeof d.scores === 'object' && (
            <DetailRow label="Consultant">
              <div className="flex flex-wrap gap-2">
                {Object.entries(d.scores).map(([key, val]) => (
                  <Metric key={key} label={key} value={typeof val === 'number' ? val.toFixed(1) : val} />
                ))}
                {d.composite != null && <Metric label="composite" value={d.composite.toFixed(1)} bold />}
              </div>
            </DetailRow>
          )}

          {/* Consultant score (from voicing gate) */}
          {d.consultantScore != null && (
            <DetailRow label="Consultant">
              <Metric label="score" value={d.consultantScore.toFixed(1)} />
              {d.threshold != null && <Metric label="threshold" value={d.threshold.toFixed(1)} />}
            </DetailRow>
          )}

          {/* Hallucination reasons */}
          {d.reasons && d.reasons.length > 0 && (
            <DetailRow label="Reasons">
              <div className="space-y-0.5">
                {d.reasons.map((r, i) => (
                  <div key={i} className="text-red-600 dark:text-red-400">{r}</div>
                ))}
              </div>
            </DetailRow>
          )}

          {/* Voicing detail */}
          {d.novelWords != null && (
            <DetailRow label="Novel words">
              <span className="font-mono">{d.novelWords}</span>
              {d.minRequired != null && (
                <span className="text-gray-400 ml-1">(min: {d.minRequired})</span>
              )}
            </DetailRow>
          )}

          {/* Reasoning text */}
          {d.reasoning && (
            <DetailRow label="Reasoning">
              <div className="text-gray-600 dark:text-gray-300 italic max-h-24 overflow-y-auto">
                {d.reasoning}
              </div>
            </DetailRow>
          )}
        </div>
      )}
    </div>
  );
}

/** Label + value row in expanded detail */
function DetailRow({ label, children }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-400 dark:text-gray-500 w-20 shrink-0 text-right font-medium">
        {label}
      </span>
      <div className="flex items-center gap-1 flex-wrap flex-1 text-gray-600 dark:text-gray-300">
        {children}
      </div>
    </div>
  );
}

/** Small labeled metric value */
function Metric({ label, value, bold }) {
  return (
    <span className={`font-mono ${bold ? 'font-bold text-gray-700 dark:text-gray-200' : ''}`}>
      <span className="text-gray-400 dark:text-gray-500">{label}:</span>{' '}
      <span className="text-gray-700 dark:text-gray-200">{value}</span>
    </span>
  );
}
