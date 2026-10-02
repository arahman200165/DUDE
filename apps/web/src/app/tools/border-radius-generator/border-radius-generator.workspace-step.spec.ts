import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './border-radius-generator.workspace-step';

describe('border-radius-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips corners/unit/linked', () => {
    const corners = { topLeft: 4, topRight: 4, bottomLeft: 4, bottomRight: 4 };
    workspaceStep.restore({ corners, unit: 'rem', linked: false });
    expect(workspaceStep.snapshot()?.state).toEqual({ corners, unit: 'rem', linked: false });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
