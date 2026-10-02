import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './resx-tool.workspace-step';

describe('resx-tool workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ mode: 'diff', baseInput: '<resx/>', overlayInput: '<resx2/>' });
    expect(workspaceStep.snapshot()?.state).toEqual({ mode: 'diff', baseInput: '<resx/>', overlayInput: '<resx2/>' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
