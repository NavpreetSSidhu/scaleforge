import { useRef, useState, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { Check, Copy } from 'lucide-react';
import 'highlight.js/styles/github-dark.css';

/** A fenced code block: syntax-highlighted, horizontally scrollable, with a copy button. */
function CodeBlock({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = ref.current?.textContent ?? '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div className="group relative my-3">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-white/[0.08] bg-surface/80 px-2 py-1 text-[11px] text-ink-muted opacity-0 backdrop-blur transition hover:text-ink group-hover:opacity-100"
      >
        {copied ? (
          <>
            <Check className="h-3 w-3 text-accent" /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3 w-3" /> Copy
          </>
        )}
      </button>
      <pre
        ref={ref}
        className="overflow-x-auto rounded-lg border border-white/[0.06] text-[0.78rem] leading-relaxed [&>code.hljs]:block [&>code.hljs]:rounded-lg [&>code.hljs]:p-3.5"
      >
        {children}
      </pre>
    </div>
  );
}

/** Dark-theme markdown styling shared by lesson bodies, tutor replies, and every
 *  AI chat drawer — LLM replies are markdown, and rendering them raw shows the
 *  user literal asterisks and backticks. */
const components: Components = {
  p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic text-ink-muted">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  // Models pick heading levels inconsistently; they should all read as one style
  // rather than one of them falling through to the browser default.
  h1: ({ children }) => <h3 className="mb-2 text-sm font-semibold text-ink">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 text-sm font-semibold text-ink">{children}</h3>,
  h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold text-ink">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1.5 text-[13px] font-semibold text-ink">{children}</h4>,
  hr: () => <hr className="my-3 border-0 border-t border-surface-line" />,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-2 border-surface-line pl-3 text-ink-faint last:mb-0">
      {children}
    </blockquote>
  ),
  // Wide tables must scroll inside the bubble rather than stretch the drawer.
  table: ({ children }) => (
    <div className="mb-3 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-[0.85em]">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-surface-line px-2 py-1 text-left font-semibold text-ink">{children}</th>
  ),
  td: ({ children }) => <td className="border border-surface-line px-2 py-1">{children}</td>,
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  code: ({ className, children }) => {
    // rehype-highlight tags fenced blocks with `language-*`/`hljs`; inline code has neither.
    if (className && /language-|hljs/.test(className)) {
      return <code className={className}>{children}</code>;
    }
    return (
      <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
        {children}
      </code>
    );
  },
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
      {children}
    </a>
  ),
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`text-sm text-ink-muted ${className ?? ''}`}>
      <ReactMarkdown components={components} rehypePlugins={[rehypeHighlight]}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
