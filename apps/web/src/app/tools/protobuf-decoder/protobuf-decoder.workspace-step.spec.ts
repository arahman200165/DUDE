import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './protobuf-decoder.workspace-step';

describe('protobuf-decoder workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips schemaText through snapshot and restore', () => {
    workspaceStep.restore({ schemaText: 'message M { string a = 1; }' });
    expect(workspaceStep.snapshot()?.state).toEqual({ schemaText: 'message M { string a = 1; }' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
