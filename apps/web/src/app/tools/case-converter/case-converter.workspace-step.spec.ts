import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './case-converter.workspace-step';

describe('case-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input and style', () => {
    workspaceStep.restore({ input: 'hello world', style: 'snake' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'hello world', style: 'snake' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
