import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './x509-certificate-inspector.workspace-step';

describe('x509-certificate-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ tab: 'san', input: '-----BEGIN CERTIFICATE-----abc' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ tab: 'san', input: '-----BEGIN CERTIFICATE-----abc' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
