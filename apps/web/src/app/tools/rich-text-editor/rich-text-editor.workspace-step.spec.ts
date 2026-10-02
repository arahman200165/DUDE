import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './rich-text-editor.workspace-step';

describe('rich-text-editor workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ contentHtml: '<p>Hello world</p>' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ contentHtml: '<p>Hello world</p>' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
