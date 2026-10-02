import { describe, it, expect } from 'vitest';
import { createManifestScopeLookup, resolveKvScope } from './kv-scope.js';

describe('resolveKvScope', () => {
  it('prefers a core setting definition over manifest overrides and policy', () => {
    expect(resolveKvScope('settings.ai', 'baseUrl', 'local', () => ({ scope: 'workspace' }))).toBe('device');
    expect(resolveKvScope('settings', 'appearance', 'session')).toBe('environment');
  });

  it('then uses a tool manifest override', () => {
    expect(resolveKvScope('some-tool', 'k', 'local', () => ({ scope: 'workspace' }))).toBe('workspace');
  });

  it('then falls back to the policy rule', () => {
    expect(resolveKvScope('some-tool', 'k', 'local')).toBe('environment');
    expect(resolveKvScope('some-tool', 'k', 'session')).toBe('local-only');
    expect(resolveKvScope('some-tool', 'k', 'user-choice')).toBe('local-only');
  });

  it('builds a manifest lookup from tool metadata', () => {
    const lookup = createManifestScopeLookup([{ id: 'a', settingScopes: { k: { scope: 'device' } } }, { id: 'b' }]);
    expect(resolveKvScope('a', 'k', 'local', lookup)).toBe('device');
    expect(resolveKvScope('a', 'other', 'local', lookup)).toBe('environment');
    expect(resolveKvScope('b', 'k', 'session', lookup)).toBe('local-only');
  });
});
