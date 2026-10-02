import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './js-playground.workspace-step';

describe('js-playground workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips code through snapshot and restore', () => {
    workspaceStep.restore({ code: "console.log('hi')" });
    expect(workspaceStep.snapshot()?.state).toEqual({ code: "console.log('hi')" });
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
