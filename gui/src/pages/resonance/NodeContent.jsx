import VariableRefText from '../../components/VariableRefText';

/** Renders node content with code-aware formatting (JSON lab output, fenced blocks, plain text). */
export function NodeContent({ content, className = '' }) {
  if (!content) return null;
  const text = content.trim();

  // JSON with a code field (lab output)
  try {
    const parsed = JSON.parse(text);
    if (parsed.code && (parsed.hypothesis || parsed.evaluationMode)) {
      return (
        <div className={`space-y-2 ${className}`}>
          {parsed.hypothesis && <p className="text-sm"><span className="font-semibold opacity-70">Hypothesis:</span> {parsed.hypothesis}</p>}
          {parsed.evaluationMode && <p className="text-sm"><span className="font-semibold opacity-70">Mode:</span> {parsed.evaluationMode}</p>}
          {parsed.expectedBehavior && <p className="text-sm"><span className="font-semibold opacity-70">Expected:</span> {parsed.expectedBehavior}</p>}
          <div className="border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800/60 overflow-x-auto">
            <pre className="text-xs font-mono p-2.5 whitespace-pre leading-relaxed">{parsed.code}</pre>
          </div>
        </div>
      );
    }
  } catch { /* not JSON */ }

  // Fenced code blocks — split into prose + code segments
  if (text.includes('```')) {
    const parts = text.split(/(```\w*\n[\s\S]*?\n```)/g);
    return (
      <div className={`space-y-2 ${className}`}>
        {parts.map((part, i) => {
          if (part.startsWith('```')) {
            const code = part.replace(/^```\w*\n?/, '').replace(/\n?```$/, '');
            return (
              <div key={i} className="border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-800/60 overflow-x-auto">
                <pre className="text-xs font-mono p-2.5 whitespace-pre leading-relaxed">{code}</pre>
              </div>
            );
          }
          const trimmed = part.trim();
          return trimmed
            ? <p key={i} className="text-sm whitespace-pre-wrap"><VariableRefText>{trimmed}</VariableRefText></p>
            : null;
        })}
      </div>
    );
  }

  return (
    <p className={`text-sm whitespace-pre-wrap ${className}`}>
      <VariableRefText>{text}</VariableRefText>
    </p>
  );
}

/** Coloured score badge — hides when score is null/undefined. */
function _ScoreBadge({ label, score, color = 'blue' }) {
  if (score == null) return null;
  const colors = {
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  };
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded ${colors[color]}`}>
      {label}: {score.toFixed(1)}
    </span>
  );
}
