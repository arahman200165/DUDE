import { describe, it, expect } from 'vitest';
import { DATA_SCOPES, isDataScope } from "./data-scope.js";
describe('data scope vocabulary', () => {
  it('accepts the four ownership scopes without treating storage or consent as scope', () => {
    for (const scope of DATA_SCOPES) expect(isDataScope(scope)).toBe(true);
    for (const value of ['local', 'session', 'secure-local', 'sync-enabled', null, {}]) expect(isDataScope(value)).toBe(false);
  });
});
