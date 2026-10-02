import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './lorem-ipsum-generator.workspace-step';

describe('lorem-ipsum-generator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('always has a snapshot (default options)', () => {
    expect(workspaceStep.snapshot()?.state).toEqual({
      options: { source: 'classic', unit: 'paragraphs', count: 3, format: 'plain' },
    });
  });

  it('round-trips options through restore', () => {
    workspaceStep.restore({ options: { source: 'hipster', unit: 'words', count: 10, format: 'html' } });
    expect(workspaceStep.snapshot()?.state).toEqual({ options: { source: 'hipster', unit: 'words', count: 10, format: 'html' } });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
