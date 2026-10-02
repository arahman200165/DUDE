import { resolveKvScope } from './scope-resolver';

describe('resolveKvScope', () => {
  it('prefers a core setting definition over manifest overrides and policy', () => {
    expect(resolveKvScope('settings.ai', 'baseUrl', 'local', () => ({ scope: 'workspace' }))).toBe('device');
    expect(resolveKvScope('settings', 'appearance', 'session')).toBe('environment');
  });

  it('then uses a tool manifest override', () => {
    expect(resolveKvScope('some-tool', 'k', 'local', () => ({ scope: 'workspace' }))).toBe('workspace');
  });

  it('then falls back to the policy rule', () => {
    const none = () => undefined;
    expect(resolveKvScope('some-tool', 'k', 'local', none)).toBe('environment');
    expect(resolveKvScope('some-tool', 'k', 'session', none)).toBe('local-only');
    expect(resolveKvScope('some-tool', 'k', 'user-choice', none)).toBe('local-only');
  });

  it('uses the generated registry lookup by default', () => {
    expect(resolveKvScope('definitely-not-a-tool', 'k', 'local')).toBe('environment');
  });
});
