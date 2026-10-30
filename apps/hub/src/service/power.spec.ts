import { describe, expect, it } from 'vitest';
import { AdminCallError } from '../admin/admin-client.js';
import { HELP_TEXT, UsageError, parseArgs } from '../cli/args.js';
import { runPower } from './power.js';
import type { PowerOptions } from './power.js';
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
        case 'power.status': return { verdict: 'needs-change', sleepAcMinutes: 30, hibernateAcMinutes: 0 };
        case 'power.preview':
          return {
            confirmToken: 'tok', expiresAt: 'soon', consequenceClass: ['system-config'],
            summary: {
              scope: 'AC timeouts of the active power plan', before: { sleepAcMinutes: 30, hibernateAcMinutes: 0 }, after: { sleepAcMinutes: 0, hibernateAcMinutes: 0 },
              commands: ['powercfg /change standby-timeout-ac 0'], revertCommands: ['powercfg /change standby-timeout-ac 30'], revertWith: 'dude-hub power revert',
            },
          };
        case 'power.apply':
        case 'power.revert': return { verdict: 'ok' };
        default: throw new Error(`unexpected ${method}`);
      }
    },
  };
  const run = (options: Partial<PowerOptions> & Pick<PowerOptions, 'action'>): Promise<number> => runPower({ dataDir: f.dataDir, ...options }, deps);
  const powerCalls = (): Call[] => calls.filter((c) => c.method !== 'status');
  return { run, powerCalls, out: () => f.out.join(''), err: () => f.err.join('') };
}

describe('dude-hub power', () => {
  it('parses status, apply and revert with an optional confirmation, and documents them', () => {
    expect(parseArgs(['power', 'status'])).toEqual({ command: 'power', action: 'status' });
    expect(parseArgs(['power', 'apply', '--confirm', 'tok', '--data-dir', 'D'])).toEqual({ command: 'power', action: 'apply', confirm: 'tok', dataDir: 'D' });
    expect(parseArgs(['power', 'revert'])).toEqual({ command: 'power', action: 'revert' });
    expect(() => parseArgs(['power'])).toThrow(UsageError);
    expect(() => parseArgs(['power', 'sleep'])).toThrow(UsageError);
    expect(() => parseArgs(['power', 'status', '--confirm', 'x'])).toThrow(UsageError);
    expect(HELP_TEXT).toContain('dude-hub power apply|revert');
  });

  it('shows the status and explains the verdict', async () => {
    const h = harness();
    expect(await h.run({ action: 'status' })).toBe(0);
    expect(h.powerCalls()).toEqual([{ method: 'power.status', params: {} }]);
    expect(JSON.parse(h.out())).toMatchObject({ verdict: 'needs-change' });
    expect(h.err()).toContain('dude-hub power apply');
  });

  it('previews an apply without changing anything: the commands and the undo on stderr, the token on stdout', async () => {
    const h = harness();
    expect(await h.run({ action: 'apply' })).toBe(0);
    expect(h.powerCalls()).toEqual([{ method: 'power.preview', params: { action: 'apply' } }]);
    expect(JSON.parse(h.out())).toEqual({ confirmToken: 'tok', expiresAt: 'soon', consequenceClass: ['system-config'] });
    expect(h.err()).toContain('powercfg /change standby-timeout-ac 0');
    expect(h.err()).toContain('To undo:      powercfg /change standby-timeout-ac 30');
    expect(h.err()).toContain('Sleep (AC):   30 min -> never');
    expect(h.err()).toContain('Nothing has been changed');
  });

  it('applies and reverts with --confirm', async () => {
    const h = harness();
    expect(await h.run({ action: 'apply', confirm: 'tok' })).toBe(0);
    expect(await h.run({ action: 'revert', confirm: 'tok2' })).toBe(0);
    expect(h.powerCalls().map((c) => [c.method, c.params])).toEqual([['power.apply', { confirmToken: 'tok' }], ['power.revert', { confirmToken: 'tok2' }]]);
  });

  it('needs the elevated terminal for apply and revert (not for status), and a running Hub', async () => {
    const unelevated = harness({ state: 'running', elevated: false });
    expect(await unelevated.run({ action: 'apply' })).not.toBe(0);
    expect(await unelevated.run({ action: 'revert', confirm: 'x' })).not.toBe(0);
    expect(unelevated.powerCalls()).toEqual([]);
    expect(await unelevated.run({ action: 'status' })).toBe(0);
    const stopped = harness({ state: 'running', elevated: true }, undefined, false);
    expect(await stopped.run({ action: 'apply' })).toBe(2);
    expect(stopped.err()).toContain('The Hub is not running');
  });

  it('explains a spent confirmation and an unsupported deployment', async () => {
    const spent = harness(undefined, (method) => (method === 'power.apply' ? new AdminCallError('confirmation-required', 'x') : undefined));
    expect(await spent.run({ action: 'apply', confirm: 'old' })).toBe(1);
    expect(spent.err()).toContain('Run "dude-hub power apply" again');
    const docker = harness(undefined, (method) => (method === 'power.preview' ? new AdminCallError('unsupported', 'The power policy can be read and changed only on a Windows Hub.') : undefined));
    expect(await docker.run({ action: 'apply' })).toBe(1);
    expect(docker.err()).toContain('only on a Windows Hub');
  });
});
