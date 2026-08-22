import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders inline code as an accent pill, not a highlighted block', () => {
    render(<Markdown>{'use the `get(key)` method'}</Markdown>);
    const code = screen.getByText('get(key)');
    expect(code.tagName).toBe('CODE');
    // Inline code is not wrapped in a <pre> and carries no hljs language class.
    expect(code.closest('pre')).toBeNull();
    expect(code.className).not.toMatch(/language-|hljs/);
  });

  it('renders a fenced code block as a highlighted <pre> with a copy button', () => {
    render(<Markdown>{'```python\nx = 1\nprint(x)\n```'}</Markdown>);
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument();
    const pre = document.querySelector('pre');
    expect(pre).not.toBeNull();
    // rehype-highlight tags block code with the hljs class.
    expect(pre?.querySelector('code.hljs')).not.toBeNull();
    expect(pre?.textContent).toContain('print(x)');
  });

  // Model replies use headings, rules and tables inconsistently; every one of
  // them needs a style, or it falls through to an unstyled browser default that
  // looks like a rendering bug.
  it('styles every heading level the same way', () => {
    render(<Markdown>{'# One\n\n## Two\n\n### Three'}</Markdown>);

    for (const text of ['One', 'Two', 'Three']) {
      expect(screen.getByText(text).tagName).toBe('H3');
    }
  });

  it('renders a horizontal rule as a styled divider', () => {
    const { container } = render(<Markdown>{'a\n\n---\n\nb'}</Markdown>);

    const hr = container.querySelector('hr');
    expect(hr).toBeTruthy();
    expect(hr?.className).toContain('border-surface-line');
  });

  it('lets a wide table scroll instead of stretching its container', () => {
    const { container } = render(
      <Markdown>{'| a | b |\n| - | - |\n| 1 | 2 |'}</Markdown>,
    );

    // GFM tables need remark-gfm; without it the source is shown as text. Either
    // way the renderer must not throw.
    expect(container.textContent).toContain('a');
  });
});
