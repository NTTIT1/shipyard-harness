// The project being worked on survives F5; a studio session reports the project it registered.
import { describe, it, expect } from 'vitest';
import { restoreProject, restoreView } from '../src/hooks/useRemembered.js';
import { projectIdOf } from '../src/lib/studio.js';

describe('remembered project', () => {
  const ps = [{ id: 'p1' }, { id: 'p2' }];
  it('keeps a project that still exists', () => expect(restoreProject('p2', ps)).toBe('p2'));
  it('falls back to all projects when it is gone or unset', () => {
    expect(restoreProject('gone', ps)).toBe('ALL');
    expect(restoreProject(null, ps)).toBe('ALL');
    expect(restoreProject('ALL', ps)).toBe('ALL');
  });
});

describe('studio project id', () => {
  it('is null until the project is registered', () => {
    expect(projectIdOf(null)).toBe(null);
    expect(projectIdOf({ project: { jobId: 'j1' }, job: { status: 'running' } })).toBe(null);
  });
  it('comes from the job while it runs, then from the saved session', () => {
    expect(projectIdOf({ project: { jobId: 'j1' }, job: { project: { id: 'p9' } } })).toBe('p9');
    expect(projectIdOf({ project: { projectId: 'p9' }, job: null })).toBe('p9');
  });
});

describe('remembered screen', () => {
  it('reopens the screen you were on', () => {
    expect(restoreView('lanes')).toBe('lanes');
    expect(restoreView('studio')).toBe('studio');
  });
  it('reopens the inbox for a review, the board for anything unknown', () => {
    expect(restoreView('review')).toBe('inbox');
    expect(restoreView('nope')).toBe('board');
    expect(restoreView(undefined)).toBe('board');
  });
});
