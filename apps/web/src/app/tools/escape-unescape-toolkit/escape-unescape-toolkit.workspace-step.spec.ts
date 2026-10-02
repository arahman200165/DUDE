import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './escape-unescape-toolkit.workspace-step';

describe('escape-unescape-toolkit workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'a\\b', direction: 'unescape', mode: 'shell' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'a\\b', direction: 'unescape', mode: 'shell' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
