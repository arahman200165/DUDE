import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './certificate-chain-tools.workspace-step';

describe('certificate-chain-tools workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: '-----BEGIN CERTIFICATE-----abc' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '-----BEGIN CERTIFICATE-----abc' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
