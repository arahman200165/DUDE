import { beforeEach, describe, expect, it } from 'vitest';
import { workspaceStep } from './chmod-converter.workspace-step';
import { NO_PERMISSIONS } from "@dude/tool-engine/tools/chmod-converter/chmod-convert";

describe('chmod-converter workspaceStep', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('returns undefined when there is nothing to snapshot', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('round-trips permissions through snapshot and restore', () => {
    const permissions = { ...NO_PERMISSIONS, owner: { read: true, write: true, execute: false } };
    workspaceStep.restore({ permissions });

    const snapshot = workspaceStep.snapshot();
    expect(snapshot?.state).toEqual({ permissions });
    expect(snapshot?.summary).toContain('chmod');
  });

  it('is history-eligible', () => {
    expect(workspaceStep.historyEligible).toBe(true);
  });
});
