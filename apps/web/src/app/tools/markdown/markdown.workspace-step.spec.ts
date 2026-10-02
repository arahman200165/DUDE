import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './markdown.workspace-step';

describe('markdown workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ source: '# Hi', paneRatio: 0.6, stylePreset: 'github', customCss: 'body{}' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ source: '# Hi', paneRatio: 0.6, stylePreset: 'github', customCss: 'body{}' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
