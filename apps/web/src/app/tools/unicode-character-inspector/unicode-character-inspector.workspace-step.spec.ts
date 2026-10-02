import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './unicode-character-inspector.workspace-step';

describe('unicode-character-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input', () => {
    workspaceStep.restore({ input: '你好' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '你好' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
