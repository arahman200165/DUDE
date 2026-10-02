import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './compression-lab.workspace-step';

describe('compression-lab workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ inputMode: 'text', direction: 'decompress', format: 'deflate', text: 'hello' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ inputMode: 'text', direction: 'decompress', format: 'deflate', text: 'hello' });
    expect(snapshot?.summary).toContain('decompress');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
