import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './css-formatter.workspace-step';

describe('css-formatter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input and mode', () => {
    workspaceStep.restore({ input: '.a{color:red}', mode: 'minify' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: '.a{color:red}', mode: 'minify' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
