import { describe, expect, it } from 'vitest';
import { consumeWorkspaceState, offerWorkspaceState } from "./workspace-handoff.js";

describe('workspace-handoff', () => {
  it('hands off a value exactly once', () => {
    offerWorkspaceState('fake-tool', { token: 'abc' });
    expect(consumeWorkspaceState('fake-tool')).toEqual({ token: 'abc' });
    expect(consumeWorkspaceState('fake-tool')).toBeUndefined();
  });

  it('returns undefined when nothing was offered', () => {
    expect(consumeWorkspaceState('nothing-offered')).toBeUndefined();
  });
});
