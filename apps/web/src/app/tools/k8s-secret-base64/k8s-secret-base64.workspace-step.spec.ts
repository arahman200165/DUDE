import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './k8s-secret-base64.workspace-step';

describe('k8s-secret-base64 workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips mode/pairs through snapshot and restore', () => {
    workspaceStep.restore({ mode: 'decode', pairs: [{ key: 'k', value: 'v' }] });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ mode: 'decode', pairs: [{ key: 'k', value: 'v' }] });
  });

  it('is not history-eligible (may carry real secret values)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
