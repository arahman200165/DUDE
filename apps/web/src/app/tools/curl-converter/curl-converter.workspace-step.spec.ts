import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './curl-converter.workspace-step';

describe('curl-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips exportFormat only, never the sensitive raw command', () => {
    workspaceStep.restore({ exportFormat: 'python' });
    expect(workspaceStep.snapshot()?.state).toEqual({ exportFormat: 'python' });
    expect(sessionStorage.getItem('dude:v1:curl-converter:raw')).toBeNull();
  });

  it('is not history-eligible (sensitive raw command excluded)', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
