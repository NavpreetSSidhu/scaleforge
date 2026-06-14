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
});
