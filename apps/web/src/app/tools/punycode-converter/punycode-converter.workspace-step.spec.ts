import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './punycode-converter.workspace-step';

describe('punycode-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips input/mode/direction through snapshot and restore', () => {
    workspaceStep.restore({ input: 'xn--mnchen-3ya.de', mode: 'inspect', direction: 'toUnicode' });
    expect(workspaceStep.snapshot()?.state).toEqual({ input: 'xn--mnchen-3ya.de', mode: 'inspect', direction: 'toUnicode' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
