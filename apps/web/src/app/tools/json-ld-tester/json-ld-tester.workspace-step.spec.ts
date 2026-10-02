import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-ld-tester.workspace-step';

describe('json-ld-tester workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input through snapshot and restore', () => {
    workspaceStep.restore({ input: '{"@context":"https://schema.org"}' });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '{"@context":"https://schema.org"}' });
    expect(snapshot?.summary).toContain('JSON-LD');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
