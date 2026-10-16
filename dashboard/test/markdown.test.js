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

describe('renderMarkdown — no UI spoofing', () => {
  it('drops forms, inputs, buttons, styles and fixed overlays', () => {
    const html = renderMarkdown('<div style="position:fixed;inset:0">x</div><form action="https://e.x"><input name=a><button>Gửi</button></form><style>body{display:none}</style>');
    expect(html).not.toMatch(/<form|<input|<button|<style|style=|position:fixed/i);
  });
  it('drops remote images (no tracking pixels), keeps local ones', () => {
    const html = renderMarkdown('![a](https://track.example/p.png) ![b](/spec/2/specs/x/design/01.png)');
    expect(html).not.toContain('track.example');
    expect(html).toContain('/spec/2/specs/x/design/01.png');
  });
});
