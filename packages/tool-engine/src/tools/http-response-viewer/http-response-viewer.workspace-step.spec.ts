import { describe, expect, it } from 'vitest';
import { workspaceStep } from "./http-response-viewer.workspace-step.js";
import { consumeWorkspaceState } from "../../core/workspace/workspace-handoff.js";

describe('http-response-viewer workspaceStep', () => {
  it('never reads storage (no snapshot)', () => {
    expect(workspaceStep.snapshot()).toBeUndefined();
  });

  it('is not history-eligible', () => {
    expect(workspaceStep.historyEligible).toBeUndefined();
  });

  it('restore hands the raw response off in-memory rather than writing storage', () => {
    workspaceStep.restore({ raw: 'HTTP/1.1 200 OK' });
    expect(localStorage.getItem('dude:v1:http-response-viewer:raw')).toBeNull();
    expect(consumeWorkspaceState('http-response-viewer')).toEqual({ raw: 'HTTP/1.1 200 OK' });
  });
});
