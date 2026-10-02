import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './line-prefix-numbering.workspace-step';

describe('line-prefix-numbering workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields', () => {
    workspaceStep.restore({
      input: 'a\nb',
      mode: 'add-numbers',
      prefix: '',
      suffix: '',
      numberOptions: { start: 1, padded: false, separator: '. ' },
      transform: 'uppercase',
      findReplace: { find: '', replace: '' },
    });

    expect(workspaceStep.snapshot()?.state).toEqual({
      input: 'a\nb',
      mode: 'add-numbers',
      prefix: '',
      suffix: '',
      numberOptions: { start: 1, padded: false, separator: '. ' },
      transform: 'uppercase',
      findReplace: { find: '', replace: '' },
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
