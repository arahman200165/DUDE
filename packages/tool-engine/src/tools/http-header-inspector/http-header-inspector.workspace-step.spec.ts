import { describe, expect, it } from 'vitest';
import { workspaceStep } from "./http-header-inspector.workspace-step.js";
import { consumeWorkspaceState } from "../../core/workspace/workspace-handoff.js";

describe('http-header-inspector workspaceStep', () => {
  it('never reads storage (no snapshot)', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });

  it('restore hands the raw headers off in-memory rather than writing storage', () => {
    workspaceStep.restore({ raw: 'Content-Type: application/json' });
    expect(localStorage.getItem('dude:v1:http-header-inspector:raw')).toBeNull();
    expect(consumeWorkspaceState('http-header-inspector')).toEqual({ raw: 'Content-Type: application/json' });
  });
});
