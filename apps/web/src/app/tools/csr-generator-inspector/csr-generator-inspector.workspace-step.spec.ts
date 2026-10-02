import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './csr-generator-inspector.workspace-step';

describe('csr-generator-inspector workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips subject fields through snapshot and restore', () => {
    const subjectValues = { CN: 'example.com', O: 'Acme', OU: '', L: '', ST: '', C: 'US', E: '' };
    workspaceStep.restore({ mode: 'generate', subjectValues });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ mode: 'generate', subjectValues });
    expect(snapshot?.summary).toContain('example.com');
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });
});
