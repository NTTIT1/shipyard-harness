// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '../src/lib/markdown.js';

describe('renderMarkdown', () => {
  it('renders markdown', () => {
    expect(renderMarkdown('# Tiêu đề\n\n- AC-1')).toContain('<h1');
    expect(renderMarkdown('# Tiêu đề\n\n- AC-1')).toContain('<li>AC-1</li>');
  });
  it('neutralizes script and event handlers', () => {
    const html = renderMarkdown('hi <img src=x onerror="alert(1)"> <script>alert(2)</script> [x](javascript:alert(3))');
    expect(html).not.toMatch(/onerror|<script|javascript:/i);
  });
  it('tolerates empty input', () => {
    expect(renderMarkdown(null)).toBe('');
  });
});
