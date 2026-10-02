import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json-schema-validator.workspace-step';

describe('json-schema-validator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ schema: '{"type":"object"}', instance: '{}', draftMode: '2020-12' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ schema: '{"type":"object"}', instance: '{}', draftMode: '2020-12' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
