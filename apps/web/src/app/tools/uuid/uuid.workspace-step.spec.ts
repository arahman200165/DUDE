import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './uuid.workspace-step';

describe('uuid workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips generated list and inspect input through snapshot and restore', () => {
    workspaceStep.restore({
      generated: ['a-b-c'],
      inspectInput: 'x-y-z',
      version: 'v7',
      exportFormat: 'json',
      namespaceChoice: 'custom',
      customNamespace: 'ns',
      name: 'n',
    });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({
      generated: ['a-b-c'],
      inspectInput: 'x-y-z',
      version: 'v7',
      exportFormat: 'json',
      namespaceChoice: 'custom',
      customNamespace: 'ns',
      name: 'n',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
