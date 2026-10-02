import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './aws-sigv4-inspector.workspace-step';

describe('aws-sigv4-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips only non-credential preferences', () => {
    workspaceStep.restore({ mode: 'inspect', region: 'eu-west-1', service: 's3' });
    expect(workspaceStep.snapshot()?.state).toEqual({ mode: 'inspect', region: 'eu-west-1', service: 's3' });
    expect(localStorage.getItem('dude:v1:aws-sigv4-inspector:secretKey')).toBeNull();
  });

  it('is not history-eligible (credential-adjacent)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
