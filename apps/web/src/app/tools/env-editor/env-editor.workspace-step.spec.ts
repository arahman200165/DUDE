import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './env-editor.workspace-step';

describe('env-editor workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips raw through snapshot and restore', () => {
    workspaceStep.restore({ raw: 'FOO=bar' });
    expect(workspaceStep.snapshot()?.state).toEqual({ raw: 'FOO=bar' });
  });

  it('is not history-eligible (.env content routinely embeds real secrets)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
