import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './epoch-timeline-visualizer.workspace-step';

describe('epoch-timeline-visualizer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ mode: 'range', includeNow: false, multiText: '1700000000 | X', rangeStart: '', rangeEnd: '' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ mode: 'range', includeNow: false, multiText: '1700000000 | X', rangeStart: '', rangeEnd: '' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
