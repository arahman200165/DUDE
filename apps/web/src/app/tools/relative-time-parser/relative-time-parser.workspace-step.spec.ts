import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './relative-time-parser.workspace-step';

describe('relative-time-parser workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ referenceInput: '2026-01-01T00:00', textInput: '5 minutes ago', timestampInput: '' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ referenceInput: '2026-01-01T00:00', textInput: '5 minutes ago', timestampInput: '' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
