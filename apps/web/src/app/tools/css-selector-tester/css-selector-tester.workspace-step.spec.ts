import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './css-selector-tester.workspace-step';

describe('css-selector-tester workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips html and selector', () => {
    workspaceStep.restore({ html: '<div class="x"></div>', selector: '.x' });
    expect(workspaceStep.snapshot()?.state).toEqual({ html: '<div class="x"></div>', selector: '.x' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
