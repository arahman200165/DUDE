import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './model-generator.workspace-step';

describe('model-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/rootName/language through snapshot and restore', () => {
    workspaceStep.restore({ input: '{"id":1}', rootName: 'Widget', language: 'python' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '{"id":1}', rootName: 'Widget', language: 'python' });
    expect(snapshot?.summary).toContain('Widget');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
