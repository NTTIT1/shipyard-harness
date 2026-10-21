import { describe, it, expect } from 'vitest';
import { findMockupIndex } from '../src/components/studio/MockupViewer.jsx';

describe('MockupViewer findMockupIndex', () => {
  const mockups = [
    { name: '01-dang-nhap.html', html: '<div>Dang nhap</div>' },
    { name: '02-so-do-ban.html', html: '<div>So do ban</div>' },
    { name: '03-order.html', html: '<div>Order</div>' },
    { name: '04-thanh-toan.html', html: '<div>Thanh toan</div>' }
  ];

  it('matches exact filename with extension', () => {
    expect(findMockupIndex(mockups, '04-thanh-toan.html')).toBe(3);
    expect(findMockupIndex(mockups, '01-dang-nhap.html')).toBe(0);
  });

  it('matches filename with leading ./ or path slashes', () => {
    expect(findMockupIndex(mockups, './02-so-do-ban.html')).toBe(1);
    expect(findMockupIndex(mockups, '/03-order.html')).toBe(2);
  });

  it('matches slug without numeric prefixes or extension', () => {
    expect(findMockupIndex(mockups, 'thanh-toan')).toBe(3);
    expect(findMockupIndex(mockups, 'so-do-ban.html')).toBe(1);
    expect(findMockupIndex(mockups, 'order')).toBe(2);
  });

  it('strips hash fragments and query params', () => {
    expect(findMockupIndex(mockups, '03-order.html#huy-order')).toBe(2);
    expect(findMockupIndex(mockups, '04-thanh-toan.html?tab=qr#step2')).toBe(3);
  });

  it('returns -1 for purely anchor links or invalid targets', () => {
    expect(findMockupIndex(mockups, '#huy-order')).toBe(-1);
    expect(findMockupIndex(mockups, '#order')).toBe(-1);
    expect(findMockupIndex(mockups, '')).toBe(-1);
    expect(findMockupIndex(mockups, 'nonexistent.html')).toBe(-1);
    expect(findMockupIndex([], '01-dang-nhap.html')).toBe(-1);
  });
});
