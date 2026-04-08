import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Link } from 'react-router-dom';

// =============================================================================
// Shared Markdown Renderer (react-markdown with custom styling)
// =============================================================================

const markdownComponents = {
  h2: ({ children }) => <h2 className="font-bold mt-3 mb-1 text-gray-900 dark:text-gray-100">{children}</h2>,
  h3: ({ children }) => <h3 className="font-bold text-sm mt-2 mb-0.5 text-gray-900 dark:text-gray-100">{children}</h3>,
  h4: ({ children }) => <h4 className="font-semibold text-sm mt-2 mb-0.5 text-gray-800 dark:text-gray-200">{children}</h4>,
  p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside space-y-0.5 my-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside space-y-0.5 my-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  table: ({ children }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full text-xs border border-gray-200 dark:border-gray-700 rounded overflow-hidden">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50 dark:bg-gray-800">{children}</thead>,
  th: ({ children }) => <th className="px-2 py-1 text-left font-semibold border-b border-gray-200 dark:border-gray-700">{children}</th>,
  td: ({ children }) => <td className="px-2 py-1 border-b border-gray-100 dark:border-gray-800">{children}</td>,
  code: ({ children, className }) => {
    if (className?.startsWith('language-')) {
      return <code className={`text-xs ${className}`}>{children}</code>;
    }
    return (
      <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs font-mono text-pink-600 dark:text-pink-400">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 overflow-x-auto my-2 text-xs leading-relaxed">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-3 border-gray-300 dark:border-gray-600 pl-3 my-2 text-gray-500 dark:text-gray-400 italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => {
    if (href?.startsWith('/')) {
      return <Link to={href} className="text-blue-500 hover:text-blue-600 underline">{children}</Link>;
    }
    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 underline">{children}</a>;
  },
  hr: () => <hr className="border-gray-200 dark:border-gray-700 my-3" />,
};

/** Renders markdown (or OpenAI content array) as styled HTML with custom link/hr. */
export default function Markdown({ content, children }) {
  // Support both <Markdown content="..."> and <Markdown>...</Markdown>
  let text = content ?? children;

  // Handle OpenAI array content format [{type:"text", text:"..."}]
  if (Array.isArray(text)) {
    text = text
      .filter(p => p.type === 'text' && typeof p.text === 'string')
      .map(p => p.text)
      .join(' ');
  }

  if (!text) return null;
  if (typeof text !== 'string') text = String(text);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  );
}
