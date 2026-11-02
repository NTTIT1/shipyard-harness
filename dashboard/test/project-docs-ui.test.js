// Pure helpers behind "Tài liệu sản phẩm": the outline of a long document and the names of the screens.
import { describe, it, expect } from 'vitest';
import { docOutline, screenTitle, docSummary } from '../src/lib/projectdocs.js';

describe('product documents', () => {
  it('outlines a document by its ## headings, skipping code blocks', () => {
    const md = '# Kiến trúc\n\n## Tổng quan\nx\n\n```\n## not a heading\n```\n\n## Mô hình dữ liệu\ny\n### chi tiết\n## Lộ trình tính năng\n';
    expect(docOutline(md)).toEqual(['Tổng quan', 'Mô hình dữ liệu', 'Lộ trình tính năng']);
    expect(docOutline('')).toEqual([]);
  });
  it('names a screen by its <title>, else by its file name', () => {
    expect(screenTitle({ name: '01-dang-nhap.html', html: '<html><head><title>Đăng nhập</title></head></html>' })).toBe('Đăng nhập');
    expect(screenTitle({ name: '02-danh-sach-don.html', html: '<html></html>' })).toBe('danh sach don');
  });
  it('summarises a document by its first paragraph', () => {
    expect(docSummary('# Bán hàng\n\n## Tóm tắt\nHệ thống POS cho **5 cửa hàng**.\n\nThêm')).toBe('Hệ thống POS cho 5 cửa hàng.');
    expect(docSummary('')).toBe('');
  });
});
