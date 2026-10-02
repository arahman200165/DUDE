import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './advanced-diff.workspace-step';

describe('advanced-diff workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when both sides are empty', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both sides and options', () => {
    workspaceStep.restore({
      left: 'a',
      right: 'b',
      base: '',
      inputMode: 'paste',
      mode: 'text',
      granularity: 'line',
      viewMode: 'diff',
      paneRatio: 0.5,
      mergeMode: 'two-way',
      ignoreOptions: undefined,
      detectMovedBlocks: false,
      imageThreshold: 0.1,
    });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state['left']).toBe('a');
    expect(snapshot?.state['right']).toBe('b');
    expect(snapshot?.state['mode']).toBe('text');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
