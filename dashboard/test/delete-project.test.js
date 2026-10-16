import { describe, it, expect } from 'vitest';
import { deleteConfirmMatches } from '../src/lib/projects.js';

describe('deleteConfirmMatches', () => {
  it('requires the exact slug (trimmed), never an empty one', () => {
    expect(deleteConfirmMatches(' hrm-gms ', 'hrm-gms')).toBe(true);
    expect(deleteConfirmMatches('HRM-GMS', 'hrm-gms')).toBe(false);
    expect(deleteConfirmMatches('', '')).toBe(false);
  });
});
