import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './xml-xsd-validator.workspace-step';

describe('xml-xsd-validator workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips both inputs through snapshot and restore', () => {
    workspaceStep.restore({ xmlInput: '<a/>', xsdInput: '<xsd/>' });
    expect(workspaceStep.snapshot()?.state).toEqual({ xmlInput: '<a/>', xsdInput: '<xsd/>' });
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
