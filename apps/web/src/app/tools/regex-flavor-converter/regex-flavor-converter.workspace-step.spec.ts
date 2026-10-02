import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './regex-flavor-converter.workspace-step';

describe('regex-flavor-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({ pattern: '\\d+', flags: '', source: 'js', target: 'pcre' });
    expect(workspaceStep.snapshot()?.state).toEqual({ pattern: '\\d+', flags: '', source: 'js', target: 'pcre' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
