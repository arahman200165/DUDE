import { describe, expect, it } from 'vitest';
import { allowedHosts, createHostGuard, isHostAllowed } from './host-guard.js';

describe('host guard with configured names', () => {
  it('allows a configured name on the listen port (and bare on 443), never an unconfigured one', () => {
    const config = { bind: 'loopback' as const, names: ['hub.example.com', '2001:db8::5'] };
    expect(isHostAllowed('hub.example.com:8443', config, 8443)).toBe(true);
    expect(isHostAllowed('HUB.example.com:8443', config, 8443)).toBe(true);
    expect(isHostAllowed('[2001:db8::5]:8443', config, 8443)).toBe(true);
    expect(isHostAllowed('hub.example.com:9000', config, 8443)).toBe(false);
    expect(isHostAllowed('hub.example.com', config, 8443)).toBe(false);
    expect(isHostAllowed('hub.example.com', config, 443)).toBe(true);
    expect(isHostAllowed('evil.example:8443', config, 8443)).toBe(false);
  });

  it('allows a name with an explicit port only on that port', () => {
    const config = { bind: 'lan' as const, names: ['hub.example.com:8443'] };
    expect(isHostAllowed('hub.example.com:8443', config, 443)).toBe(true);
    expect(isHostAllowed('hub.example.com', config, 443)).toBe(false);
    expect(isHostAllowed('hub.example.com:443', config, 443)).toBe(false);
    expect(allowedHosts(config, 48200).has('hub.example.com:48200')).toBe(false);
  });

  it('container mode enforces the allowlist once names are configured, and accepts any Host when none are', () => {
    expect(isHostAllowed('anything.example:1', { bind: 'container' }, 48200)).toBe(true);
    expect(isHostAllowed('anything.example:1', { bind: 'container', names: [] }, 48200)).toBe(true);
    const enforced = { bind: 'container' as const, names: ['hub.example.com'] };
    expect(isHostAllowed('anything.example:48200', enforced, 48200)).toBe(false);
    expect(isHostAllowed('hub.example.com:48200', enforced, 48200)).toBe(true);
    expect(isHostAllowed('localhost:48200', enforced, 48200)).toBe(true);
    expect(isHostAllowed(undefined, { bind: 'container' }, 48200)).toBe(false);
  });

  it('setNames takes effect immediately despite the cache', () => {
    const guard = createHostGuard({ bind: 'loopback' }, () => 48200);
    expect(guard.isAllowed('new.example:48200')).toBe(false);
    guard.setNames(['new.example']);
    expect(guard.isAllowed('new.example:48200')).toBe(true);
    guard.setNames([]);
    expect(guard.isAllowed('new.example:48200')).toBe(false);
  });
});
