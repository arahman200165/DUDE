import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './data-uri-converter.workspace-step';

describe('data-uri-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips state through snapshot and restore', () => {
    workspaceStep.restore({ direction: 'generate', text: 'hello', mimeType: 'text/plain', filename: 'a.txt', input: '' });
    expect(workspaceStep.snapshot()?.state).toEqual({
      direction: 'generate',
      text: 'hello',
      mimeType: 'text/plain',
      filename: 'a.txt',
      input: '',
    });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
