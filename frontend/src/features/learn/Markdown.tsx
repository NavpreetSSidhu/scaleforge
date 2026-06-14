import ReactMarkdown, { type Components } from 'react-markdown';

/** Dark-theme markdown styling shared by lesson bodies and tutor replies. */
const components: Components = {
  p: ({ children }) => <p className="mb-3 leading-relaxed last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic text-ink-muted">{children}</em>,
  ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
  ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h3: ({ children }) => <h3 className="mb-2 text-sm font-semibold text-ink">{children}</h3>,
  code: ({ children }) => (
    <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[0.85em] text-accent">
      {children}
    </code>
  ),
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">
      {children}
    </a>
  ),
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={`text-sm text-ink-muted ${className ?? ''}`}>
      <ReactMarkdown components={components}>{children}</ReactMarkdown>
    </div>
  );
}
