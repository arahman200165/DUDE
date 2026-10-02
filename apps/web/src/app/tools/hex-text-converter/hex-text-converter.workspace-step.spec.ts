import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './hex-text-converter.workspace-step';

describe('hex-text-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ input: 'hi', direction: 'toText', encoding: 'ascii' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'hi', direction: 'toText', encoding: 'ascii' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
