import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './pem-der-inspector.workspace-step';

describe('pem-der-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: '-----BEGIN CERTIFICATE-----abc', viewMode: 'hex', pemType: 'CERTIFICATE' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '-----BEGIN CERTIFICATE-----abc', viewMode: 'hex', pemType: 'CERTIFICATE' });
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
