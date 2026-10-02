import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './git-command-builder.workspace-step';

describe('git-command-builder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips subcommand and values through snapshot and restore', () => {
    workspaceStep.restore({ subcommand: 'rebase', values: { onto: 'main' } });
    expect(workspaceStep.snapshot()?.state).toEqual({ subcommand: 'rebase', values: { onto: 'main' } });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
