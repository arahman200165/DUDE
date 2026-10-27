import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { HUB_TUNNEL_DISCLOSURE, HUB_TUNNEL_PHRASE } from '@dude/contracts/hub';
import { AdminCallError, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { HELP_TEXT, UsageError, parseArgs } from '../cli/args.js';
import { runTunnel } from './tunnel.js';
import type { TunnelCommandDeps, TunnelCommandOptions } from './tunnel.js';
import { fixture } from './test-helpers.js';

const TOKEN = 'eyJhIjoiMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYiLCJ0IjoiMTExMTExMTEtMjIyMi0zMzMzLTQ0NDQtNTU1NTU1NTU1NTU1IiwicyI6InNlY3JldCJ9';
const HOST = 'notes.example.com';

interface Call { method: string; params: Record<string, unknown>; timeoutMs: number | undefined }

function harness(initial: Parameters<typeof fixture>[0] = { state: 'running', elevated: true }, extra: Partial<TunnelCommandDeps> & { fail?: (method: string) => Error | undefined } = {}) {
  const f = fixture(initial);
  const calls: Call[] = [];
  const { fail, ...rest } = extra;
  const deps: TunnelCommandDeps = {
    ...f.deps, platform: 'win32',
    call: async (_dataDir, method, params, timeoutMs) => {
      calls.push({ method, params: params as Record<string, unknown>, timeoutMs });
      const error = fail?.(method);
      if (error) throw error;
      switch (method) {
        case 'status': return { ok: true, port: 47600 };
        case 'network.tunnel.status': return { configured: true, state: 'ready', hostname: HOST, tokenPresent: true, requiredPhrase: HUB_TUNNEL_PHRASE };
        case 'network.tunnel.preview':
          return (params as { action: string }).action === 'on'
            ? {
              confirmToken: 'tok-on', expiresAt: '2026-10-27T12:01:00.000Z', consequenceClass: ['system-config', 'process-management', 'secret-management'], requiredPhrase: HUB_TUNNEL_PHRASE,
              readiness: { ready: true, blockers: [], warnings: [{ id: 'tunnel-edge-tls', reason: HUB_TUNNEL_DISCLOSURE[0], fix: '' }], checkedAtApply: ['tunnel-connector-ready'] },
              summary: { action: 'on', hostname: HOST, port: 47600, tokenStored: false, needsConnectorToken: true, dashboard: { hostname: HOST, service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null } },
            }
            : { confirmToken: 'tok-off', expiresAt: '2026-10-27T12:01:00.000Z', consequenceClass: ['system-config', 'process-management'], summary: { action: 'off', hostname: HOST, returnsToPrivateMode: true, note: 'Delete the public hostname in the dashboard.' } };
        case 'network.tunnel.apply': return { tunnel: { hostname: HOST }, warnings: ['tunnel-edge-tls'], restartRequired: true, status: { state: 'ready' } };
        default: throw new Error(`unexpected ${method}`);
      }
    },
    ...rest,
  };
  const run = (options: Partial<TunnelCommandOptions> & Pick<TunnelCommandOptions, 'action'>): Promise<number> => runTunnel({ dataDir: f.dataDir, ...options }, deps);
  const tunnelCalls = (): Call[] => calls.filter((c) => c.method !== 'status');
  return { f, run, calls, tunnelCalls, out: () => f.out.join(''), err: () => f.err.join('') };
}

describe('network tunnel on', () => {
  it('previews without a token or a phrase: the confirmation on stdout; the effect, dashboard values and disclosure on stderr; nothing applied', async () => {
    const h = harness();
    expect(await h.run({ action: 'on', hostname: HOST })).toBe(0);
    expect(h.tunnelCalls().map((c) => c.method)).toEqual(['network.tunnel.preview']);
    expect(h.tunnelCalls()[0]?.params).toMatchObject({ action: 'on', hostname: HOST });
    expect(JSON.parse(h.out())).toEqual({ confirmToken: 'tok-on', expiresAt: '2026-10-27T12:01:00.000Z', consequenceClass: ['system-config', 'process-management', 'secret-management'] });
    const err = h.err();
    expect(err).toContain('Nothing has been changed');
    expect(err).toContain('HTTPS, https://127.0.0.1:47600');
    expect(err).toContain('No TLS Verify');
    for (const line of HUB_TUNNEL_DISCLOSURE) expect(err).toContain(line);
    expect(err).toContain(`--type "${HUB_TUNNEL_PHRASE}" --token-stdin`);
    expect(err).toContain('LAN firewall rule');
  });

  it('refuses without the exact phrase (usage error), before asking for the token or calling anything', async () => {
    let asked = 0;
    const h = harness(undefined, { readToken: async () => { asked += 1; return TOKEN; } });
    for (const type of [undefined, '', 'expose hub through cloudflare', 'EXPOSE HUB TO THE INTERNET']) {
      expect(await h.run({ action: 'on', hostname: HOST, confirm: 'tok-on', tokenStdin: true, ...(type !== undefined ? { type } : {}) })).toBe(2);
    }
    expect(asked).toBe(0);
    expect(h.tunnelCalls()).toEqual([]);
    expect(h.err()).toContain(`--type "${HUB_TUNNEL_PHRASE}"`);
  });

  it('applies with the confirmation, the phrase and the token read from stdin, in the apply call only, then drops the LAN rule', async () => {
    const h = harness({ state: 'running', elevated: true, firewallRule: true }, { readToken: async () => TOKEN });
    expect(await h.run({ action: 'on', hostname: HOST, confirm: 'tok-on', type: HUB_TUNNEL_PHRASE, tokenStdin: true, acceptUnverifiedReachability: true })).toBe(0);
    const apply = h.tunnelCalls().find((c) => c.method === 'network.tunnel.apply');
    expect(apply?.params).toMatchObject({ action: 'on', confirmToken: 'tok-on', acknowledgement: HUB_TUNNEL_PHRASE, hostname: HOST, acceptUnverifiedReachability: true });
    expect(apply?.timeoutMs).toBeGreaterThanOrEqual(60_000);
    expect(h.f.system.firewallRule).toBe(false);
    expect(h.out()).toContain(`"hostname": "${HOST}"`);
    expect(h.out()).toContain('"restarted": true');
    expect(h.err()).not.toContain('tunnel-edge-tls'); // the disclosure is not a warning to repeat
    for (const place of [h.out(), h.err(), h.f.system.calls.join('\n'), JSON.stringify(h.calls.filter((c) => c.method !== 'network.tunnel.apply'))]) expect(place).not.toContain(TOKEN);
  });

  it('passes the token it read to the apply call, and nowhere else', async () => {
    const h = harness(undefined, { readToken: async () => TOKEN });
    expect(await h.run({ action: 'on', hostname: HOST, confirm: 'tok-on', type: HUB_TUNNEL_PHRASE, tokenStdin: true })).toBe(0);
    expect(h.tunnelCalls().find((c) => c.method === 'network.tunnel.apply')?.params['connectorToken']).toBe(TOKEN);
    expect(h.out() + h.err() + h.f.system.calls.join('\n')).not.toContain(TOKEN);
  });

  it('reads the token from a piped standard input when no replacement is given, and never echoes it', async () => {
    const stdin = new PassThrough();
    const h = harness(undefined, { stdin: stdin as never });
    const running = h.run({ action: 'on', hostname: HOST, confirm: 'tok-on', type: HUB_TUNNEL_PHRASE, tokenStdin: true });
    stdin.write(`  ${TOKEN}  \n`);
    expect(await running).toBe(0);
    expect(h.tunnelCalls().find((c) => c.method === 'network.tunnel.apply')?.params['connectorToken']).toBe(TOKEN);
    expect(h.out() + h.err()).not.toContain(TOKEN);
  });

  it('does not send a token it was not asked to read', async () => {
    const h = harness();
    expect(await h.run({ action: 'on', hostname: HOST, confirm: 'tok-on', type: HUB_TUNNEL_PHRASE })).toBe(0);
    expect(h.tunnelCalls().find((c) => c.method === 'network.tunnel.apply')?.params).not.toHaveProperty('connectorToken');
  });

  it('fails with a value-free message when the token source is empty', async () => {
    const h = harness(undefined, { readToken: async () => { throw new Error('The connector token is empty.'); } });
    expect(await h.run({ action: 'on', hostname: HOST, confirm: 'tok-on', type: HUB_TUNNEL_PHRASE, tokenStdin: true })).toBe(1);
    expect(h.tunnelCalls()).toEqual([]);
    expect(h.err()).toContain('The connector token is empty.');
  });

  it('prints each blocker with its fix when the gate refuses, and exits 1', async () => {
    const detail = { ready: false, blockers: [{ id: 'external-reachability', reason: 'Not verified yet.', fix: 'Turn the tunnel on with --accept-unverified-reachability' }], warnings: [] };
    const h = harness(undefined, { fail: (method) => (method === 'network.tunnel.preview' ? new AdminCallError('refused', 'The Hub is not ready to be published through the tunnel: 1 blocker.', detail) : undefined) });
    expect(await h.run({ action: 'on', hostname: HOST })).toBe(1);
    expect(h.err()).toContain('[BLOCKER] external-reachability');
    expect(h.err()).toContain('--accept-unverified-reachability');
    expect(h.err()).toContain('Nothing was changed.');
    expect(h.out()).toBe('');
  });

  it('explains an expired confirmation and a connector that never connected', async () => {
    const expired = harness(undefined, { fail: (method) => (method === 'network.tunnel.apply' ? new AdminCallError('confirmation-required', 'x') : undefined) });
    expect(await expired.run({ action: 'on', hostname: HOST, confirm: 'old', type: HUB_TUNNEL_PHRASE })).toBe(1);
    expect(expired.err()).toContain('missing, expired or already used');
    const down = harness(undefined, { fail: (method) => (method === 'network.tunnel.apply' ? new AdminCallError('tunnel-failed', 'The tunnel connector did not connect to Cloudflare in time.', { reason: 'not-ready' }) : undefined) });
    expect(await down.run({ action: 'on', hostname: HOST, confirm: 't', type: HUB_TUNNEL_PHRASE })).toBe(1);
    expect(down.err()).toContain('did not connect to Cloudflare in time. [not-ready]');
  });

  it('needs the elevated terminal when the service is installed, and a running Hub', async () => {
    const plain = harness({ state: 'running', elevated: false });
    expect(await plain.run({ action: 'on', hostname: HOST })).not.toBe(0);
    expect(plain.calls).toEqual([]);
    const stopped = harness({ state: 'running', elevated: true }, { fail: (method) => (method === 'status' ? new AdminCallError(HUB_NOT_RUNNING, 'not running') : undefined) });
    expect(await stopped.run({ action: 'on', hostname: HOST })).toBe(2);
    expect(stopped.err()).toContain('The Hub is not running');
  });
});

describe('network tunnel off', () => {
  it('previews, then applies with the confirmation (and optionally forgets the token)', async () => {
    const h = harness();
    expect(await h.run({ action: 'off' })).toBe(0);
    expect(JSON.parse(h.out()).confirmToken).toBe('tok-off');
    expect(h.err()).toContain('the stored connector token is kept');
    expect(h.err()).toContain('returns to private');
    const apply = harness();
    expect(await apply.run({ action: 'off', confirm: 'tok-off', forgetToken: true })).toBe(0);
    expect(apply.tunnelCalls().map((c) => c.method)).toEqual(['network.tunnel.apply']);
    expect(apply.tunnelCalls()[0]?.params).toEqual({ action: 'off', confirmToken: 'tok-off', forgetToken: true });
    expect(apply.err()).toContain('delete the public hostname');
  });
});

describe('network tunnel status', () => {
  it('prints the model as JSON, needs no elevation and shows the disclosure for a configured tunnel', async () => {
    const h = harness({ state: 'running', elevated: false });
    expect(await h.run({ action: 'status' })).toBe(0);
    expect(JSON.parse(h.out())).toMatchObject({ state: 'ready', hostname: HOST });
    expect(h.err()).toContain('Cloudflare terminates TLS');
  });
});

describe('network tunnel parsing', () => {
  it('parses on, off and status with their flags', () => {
    expect(parseArgs(['network', 'tunnel', 'on'])).toEqual({ command: 'network-tunnel', action: 'on' });
    expect(parseArgs(['network', 'tunnel', 'on', '--hostname', HOST, '--accept-unverified-reachability', '--confirm', 'tok', '--type', HUB_TUNNEL_PHRASE, '--token-stdin', '--data-dir', 'd', '--install-dir', 'i'])).toEqual({
      command: 'network-tunnel', action: 'on', hostname: HOST, acceptUnverifiedReachability: true, confirm: 'tok', type: HUB_TUNNEL_PHRASE, tokenStdin: true, dataDir: 'd', installDir: 'i',
    });
    expect(parseArgs(['network', 'tunnel', 'off', '--forget-token', '--confirm', 'tok'])).toEqual({ command: 'network-tunnel', action: 'off', forgetToken: true, confirm: 'tok' });
    expect(parseArgs(['network', 'tunnel', 'status', '--data-dir', 'd'])).toEqual({ command: 'network-tunnel', action: 'status', dataDir: 'd' });
  });

  it('refuses a flag that does not belong, and never takes the token as an argument', () => {
    expect(() => parseArgs(['network', 'tunnel', 'status', '--confirm', 'x'])).toThrow(UsageError);
    expect(() => parseArgs(['network', 'tunnel', 'off', '--hostname', HOST])).toThrow(UsageError);
    expect(() => parseArgs(['network', 'tunnel', 'on', '--token', TOKEN])).toThrow(UsageError);
    expect(() => parseArgs(['network', 'tunnel', 'on', '--connector-token', TOKEN])).toThrow(UsageError);
    expect(() => parseArgs(['network', 'tunnel', 'sideways'])).toThrow(UsageError);
  });

  it('is in the help text, with the token read from standard input', () => {
    expect(HELP_TEXT).toContain('dude-hub network tunnel on');
    expect(HELP_TEXT).toContain('network tunnel off');
    expect(HELP_TEXT).toContain('read from standard input, never an argument');
  });
});
