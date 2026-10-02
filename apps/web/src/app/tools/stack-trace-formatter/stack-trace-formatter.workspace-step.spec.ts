import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './stack-trace-formatter.workspace-step';

describe('stack-trace-formatter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/mode/hideLibraryFrames through snapshot and restore', () => {
    workspaceStep.restore({ input: 'Error: boom\n  at foo (a.js:1:1)', mode: 'node', hideLibraryFrames: true });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: 'Error: boom\n  at foo (a.js:1:1)', mode: 'node', hideLibraryFrames: true });
    expect(snapshot?.summary).toContain('node');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
