import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './ssh-key-tools.workspace-step';

describe('ssh-key-tools workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips inspect state through snapshot and restore', () => {
    workspaceStep.restore({
      mode: 'inspect',
      family: 'ed25519',
      modulusLength: 2048,
      curve: 'P-256',
      inspectInput: 'ssh-ed25519 AAAAC3...',
    });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({
      mode: 'inspect',
      family: 'ed25519',
      modulusLength: 2048,
      curve: 'P-256',
      inspectInput: 'ssh-ed25519 AAAAC3...',
    });
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
