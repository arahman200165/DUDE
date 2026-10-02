import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './docker-run-compose-converter.workspace-step';

describe('docker-run-compose-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ direction: 'compose-to-run', serviceName: 'web', input: 'docker run nginx' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ direction: 'compose-to-run', serviceName: 'web', input: 'docker run nginx' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
