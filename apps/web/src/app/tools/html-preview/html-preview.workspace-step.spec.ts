import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './html-preview.workspace-step';

describe('html-preview workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips source through snapshot and restore', () => {
    workspaceStep.restore({ source: '<h1>hi</h1>' });
    expect(workspaceStep.snapshot()?.state).toEqual({ source: '<h1>hi</h1>' });
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
