import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './markdown-workspace.workspace-step';

describe('markdown-workspace workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({
      source: '# Hi',
      paneRatio: 0.4,
      showToc: false,
      showFrontMatterPanel: false,
      syncScroll: false,
      customCss: 'h1{}',
    });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({
      source: '# Hi',
      paneRatio: 0.4,
      showToc: false,
      showFrontMatterPanel: false,
      syncScroll: false,
      customCss: 'h1{}',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
