import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './text-inspector.workspace-step';

describe('text-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips text through snapshot and restore', () => {
    workspaceStep.restore({ text: 'hello world' });
    expect(workspaceStep.snapshot()?.state).toEqual({ text: 'hello world' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
