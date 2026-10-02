import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './docker-compose-validator.workspace-step';

describe('docker-compose-validator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: 'services: {}' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'services: {}' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
