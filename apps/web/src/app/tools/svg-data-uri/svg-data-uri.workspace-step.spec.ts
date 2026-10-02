import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './svg-data-uri.workspace-step';

describe('svg-data-uri workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ direction: 'decode', svgInput: '', uriInput: 'data:image/svg+xml,%3Csvg/%3E' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ direction: 'decode', svgInput: '', uriInput: 'data:image/svg+xml,%3Csvg/%3E' });
    expect(snapshot?.summary).toContain('Decoding');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
