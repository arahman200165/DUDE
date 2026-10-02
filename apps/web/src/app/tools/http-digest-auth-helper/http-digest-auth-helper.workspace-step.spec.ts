import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './http-digest-auth-helper.workspace-step';

describe('http-digest-auth-helper workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips only non-credential preferences', () => {
    workspaceStep.restore({ method: 'POST', nc: '00000002', qop: 'auth-int', algorithm: 'SHA-256' });
    expect(workspaceStep.snapshot()?.state).toEqual({ method: 'POST', nc: '00000002', qop: 'auth-int', algorithm: 'SHA-256' });
    expect(localStorage.getItem('dude:v1:http-digest-auth-helper:password')).toBeNull();
  });

  it('is not history-eligible (credential-adjacent)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
