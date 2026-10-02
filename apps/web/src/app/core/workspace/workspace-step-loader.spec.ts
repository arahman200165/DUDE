import { describe, expect, it } from 'vitest';
import { loadWorkspaceStep } from "./workspace-step-loader";

describe('loadWorkspaceStep', () => {
  it('resolves a workspace-eligible tool by convention', async () => {
    const step = await loadWorkspaceStep('base64');
    expect(step).toBeDefined();
    expect(step?.historyEligible).toBe(true);
  });

  it('resolves a tool with no History eligibility (sensitive, none-policy)', async () => {
    const step = await loadWorkspaceStep('jwt');
    expect(step).toBeDefined();
    expect(step?.historyEligible).toBeUndefined();
  });

  it('returns undefined for a tool with no workspace-step file', async () => {
    const step = await loadWorkspaceStep('this-tool-does-not-exist');
    expect(step).toBeUndefined();
  });
});
