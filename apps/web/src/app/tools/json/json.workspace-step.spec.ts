import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './json.workspace-step';

describe('json workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all five fields through snapshot and restore', () => {
    workspaceStep.restore({
      input: '{"a":1}',
      mode: 'minify',
      indent: 4,
      view: 'tree',
      compareRight: '{"a":2}',
    });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({
      input: '{"a":1}',
      mode: 'minify',
      indent: 4,
      view: 'tree',
      compareRight: '{"a":2}',
    });
    expect(snapshot?.summary).toContain('minify');
  });

  it('defaults missing local-policy fields sensibly', () => {
    workspaceStep.restore({ input: '{}' });
    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ input: '{}', mode: 'pretty', indent: 2, view: 'text', compareRight: '' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
