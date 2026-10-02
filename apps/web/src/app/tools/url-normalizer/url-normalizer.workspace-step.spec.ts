import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './url-normalizer.workspace-step';

describe('url-normalizer workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips all fields through snapshot and restore', () => {
    workspaceStep.restore({
      mode: 'compare',
      normalizeInput: '',
      resolveBase: '',
      resolveRelative: '',
      compareA: 'https://a.com',
      compareB: 'https://b.com',
      sortQueryParams: true,
      stripTrailingSlash: true,
      stripFragment: false,
    });

    expect(workspaceStep.snapshot()?.state).toEqual({
      mode: 'compare',
      normalizeInput: '',
      resolveBase: '',
      resolveRelative: '',
      compareA: 'https://a.com',
      compareB: 'https://b.com',
      sortQueryParams: true,
      stripTrailingSlash: true,
      stripFragment: false,
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
