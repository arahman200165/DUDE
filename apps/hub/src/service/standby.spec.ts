import { describe, expect, it } from 'vitest';
import { AdminCallError } from '../admin/admin-client.js';
import { HELP_TEXT, UsageError, parseArgs } from '../cli/args.js';
import { runStandby } from './standby.js';
import type { StandbyOptions } from './standby.js';
import { fixture } from './test-helpers.js';

interface Call { method: string; params: Record<string, unknown> }

function harness(initial: Parameters<typeof fixture>[0] = { state: 'running', elevated: true }, fail?: (method: string) => Error | undefined, running = true) {
  const f = fixture(initial);
  const calls: Call[] = [];
  const deps = {
    ...f.deps,
    call: async (_dataDir: string, method: string, params: unknown) => {
      if (method === 'status' && !running) throw new Error('not running');
      calls.push({ method, params: params as Record<string, unknown> });
      const error = fail?.(method);
      if (error) throw error;
      switch (method) {
        case 'status': return { ok: true };
        case 'standby.list': return { grants: [{ deviceId: 'pc', displayName: 'Desk PC', grantedAt: 't', active: true }], repositories: 1 };
        case 'standby.grant.preview':
        case 'standby.revoke.preview':
          return { confirmToken: 'tok', expiresAt: 'soon', consequenceClass: ['authentication', 'database-write'], summary: { deviceId: 'pc', displayName: 'Desk PC' } };
        case 'standby.grant.apply': return { deviceId: 'pc', granted: true, renewed: false };
        case 'standby.revoke.apply': return { deviceId: 'pc', revoked: true };
        default: throw new Error(`unexpected ${method}`);
      }
    },
  };
  const run = (options: Partial<StandbyOptions> & Pick<StandbyOptions, 'action'>): Promise<number> => runStandby({ dataDir: f.dataDir, ...options }, deps);
  const standbyCalls = (): Call[] => calls.filter((c) => c.method !== 'status');
  return { run, standbyCalls, out: () => f.out.join(''), err: () => f.err.join('') };
}

describe('dude-hub standby', () => {
  it('parses list, grant and revoke with an optional confirmation, and documents them', () => {
    expect(parseArgs(['standby', 'list'])).toEqual({ command: 'standby', action: 'list' });
    expect(parseArgs(['standby', 'grant', 'pc-1', '--confirm', 'tok', '--data-dir', 'D'])).toEqual({ command: 'standby', action: 'grant', deviceId: 'pc-1', confirm: 'tok', dataDir: 'D' });
    expect(parseArgs(['standby', 'revoke', 'pc-1'])).toEqual({ command: 'standby', action: 'revoke', deviceId: 'pc-1' });
    expect(() => parseArgs(['standby', 'grant'])).toThrow(UsageError);
    expect(() => parseArgs(['standby', 'grant', '--confirm', 'x'])).toThrow(UsageError);
    expect(() => parseArgs(['standby', 'list', '--confirm', 'x'])).toThrow(UsageError);
    expect(() => parseArgs(['standby', 'push', 'pc-1'])).toThrow(UsageError);
    expect(HELP_TEXT).toContain('dude-hub standby grant|revoke <deviceId>');
  });

  it('previews a grant without changing anything: the token on stdout, the consequence on stderr', async () => {
    const h = harness();
    expect(await h.run({ action: 'grant', deviceId: 'pc' })).toBe(0);
    expect(h.standbyCalls()).toEqual([{ method: 'standby.grant.preview', params: { deviceId: 'pc' } }]);
    expect(JSON.parse(h.out())).toEqual({ confirmToken: 'tok', expiresAt: 'soon' });
    expect(h.err()).toContain('authentication, database-write');
    expect(h.err()).toContain('Nothing has been changed');
  });

  it('applies with --confirm, revokes the same way and lists', async () => {
    const h = harness();
    expect(await h.run({ action: 'grant', deviceId: 'pc', confirm: 'tok' })).toBe(0);
    expect(await h.run({ action: 'revoke', deviceId: 'pc', confirm: 'tok' })).toBe(0);
    expect(await h.run({ action: 'list' })).toBe(0);
    expect(h.standbyCalls().map((c) => [c.method, c.params])).toEqual([
      ['standby.grant.apply', { deviceId: 'pc', confirmToken: 'tok' }],
      ['standby.revoke.apply', { deviceId: 'pc', confirmToken: 'tok' }],
      ['standby.list', {}],
    ]);
  });

  it('refuses without elevation, without a running Hub, and explains a spent confirmation', async () => {
    const unelevated = harness({ state: 'running', elevated: false });
    expect(await unelevated.run({ action: 'grant', deviceId: 'pc' })).not.toBe(0);
    expect(unelevated.standbyCalls()).toEqual([]);
    const stopped = harness({ state: 'running', elevated: true }, undefined, false);
    expect(await stopped.run({ action: 'list' })).toBe(1);
    expect(stopped.err()).toContain('The Hub is not running');
    const spent = harness(undefined, (method) => (method === 'standby.grant.apply' ? new AdminCallError('confirmation-required', 'x') : undefined));
    expect(await spent.run({ action: 'grant', deviceId: 'pc', confirm: 'old' })).toBe(1);
    expect(spent.err()).toContain('Run "dude-hub standby grant pc" again');
  });
});
