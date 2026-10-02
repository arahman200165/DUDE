import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './http-request-builder.workspace-step';

describe('http-request-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips preferences only, never request content', () => {
    workspaceStep.restore({ inputMode: 'paste', outputFormat: 'python', assumeScheme: 'http' });
    expect(workspaceStep.snapshot()?.state).toEqual({ inputMode: 'paste', outputFormat: 'python', assumeScheme: 'http' });
  });

  it('is not history-eligible (no request content captured)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
