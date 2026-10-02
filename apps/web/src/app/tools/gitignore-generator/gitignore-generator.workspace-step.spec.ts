import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './gitignore-generator.workspace-step';

describe('gitignore-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    localStorage.setItem('dude:v1:gitignore-generator:selected', JSON.stringify([]));
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips selected templates through snapshot and restore', () => {
    workspaceStep.restore({ selected: ['node', 'python'] });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ selected: ['node', 'python'] });
    expect(snapshot?.summary).toContain('node, python');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
