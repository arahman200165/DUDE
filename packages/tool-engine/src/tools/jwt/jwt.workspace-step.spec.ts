import { describe, expect, it } from 'vitest';
import { workspaceStep } from "./jwt.workspace-step.js";
import { consumeWorkspaceState } from "../../core/workspace/workspace-handoff.js";

describe('jwt workspaceStep', () => {
  it('never reads storage (no snapshot)', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });

  it('restore hands the token off in-memory rather than writing storage', () => {
    workspaceStep.restore({ token: 'a.b.c' });
    expect(localStorage.getItem('dude:v1:jwt:token')).toBeNull();
    expect(consumeWorkspaceState('jwt')).toEqual({ token: 'a.b.c' });
  });

  it('ignores a restore with no token field', () => {
    workspaceStep.restore({});
    expect(consumeWorkspaceState('jwt')).toBeUndefined();
  });
});
