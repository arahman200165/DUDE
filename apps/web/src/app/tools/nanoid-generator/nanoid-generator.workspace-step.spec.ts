import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './nanoid-generator.workspace-step';

describe('nanoid-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips generated list through snapshot and restore', () => {
    workspaceStep.restore({ generated: ['abc123'], count: 3, size: 10, alphabet: 'abc' });
    expect(workspaceStep.snapshot()?.state).toEqual({ generated: ['abc123'], count: 3, size: 10, alphabet: 'abc' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
