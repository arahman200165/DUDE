import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './cookie-tools.workspace-step';

describe('cookie-tools workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips mode through snapshot and restore, never touching the sensitive raw fields', () => {
    workspaceStep.restore({ mode: 'set-cookie' });
    expect(workspaceStep.snapshot()?.state).toEqual({ mode: 'set-cookie' });
    expect(localStorage.getItem('dude:v1:cookie-tools:cookieRaw')).toBeNull();
  });

  it('is not history-eligible (sensitive raw fields excluded)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
