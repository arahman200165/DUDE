import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './python-playground.workspace-step';

describe('python-playground workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips code as session-scoped until consent is granted', () => {
    workspaceStep.restore({ code: "print('hi')" });
    expect(sessionStorage.getItem('dude:v1:python-playground:code')).toBe('"print(\'hi\')"');
    expect(localStorage.getItem('dude:v1:python-playground:code')).toBeNull();

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ code: "print('hi')" });
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
