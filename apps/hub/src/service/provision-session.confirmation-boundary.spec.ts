import { describe, expect, it } from 'vitest';
import { HUB_TUNNEL_PHRASE } from '@dude/contracts/hub';
import { SESSION_DEVICE, SESSION_HOST, SESSION_TOKEN, sessionHarness } from './provision-session-fixture.js';

/**
 * The Destructive-Action Contract's boundary for the desktop wizard's elevated session (32-SS1, Milestone 853): the exposure-widening step
 * (the Cloudflare tunnel) and the machine-setting changes (power plan, standby grant) are the same two steps as the CLI. A preview writes
 * nothing; the apply needs the preview's single-use confirmation, and the tunnel also needs the exact typed phrase, checked before any admin
 * call. The session offers no way to turn the tunnel off, widen the network mode, or run anything but the closed operations.
 */
const APPLY = { hostname: SESSION_HOST, confirmToken: 'tok-on', acknowledgement: HUB_TUNNEL_PHRASE, acceptUnverifiedReachability: false, connectorToken: SESSION_TOKEN };

describe('provision session confirmation boundary', () => {
  it('previews the tunnel with no write: only the preview method runs, and it returns the confirmation, the phrase and the dashboard values', async () => {
    const h = sessionHarness();
    const answer = await h.ask('tunnel-preview', { hostname: SESSION_HOST, acceptUnverifiedReachability: false });
    expect(answer.ok).toBe(true);
    expect(answer.result).toMatchObject({ confirmToken: 'tok-on', requiredPhrase: HUB_TUNNEL_PHRASE, needsConnectorToken: true, hostname: SESSION_HOST });
    expect(answer.result.dashboardLines.join('\n')).toContain('No TLS Verify');
    expect(h.adminCalls().map((c) => c.method)).toEqual(['network.tunnel.preview']);
    expect(h.adminCalls()[0]!.params).toMatchObject({ action: 'on' });
    await h.close();
  });

  it('refuses the tunnel apply without the exact phrase before any admin call, whatever the typo', async () => {
    const h = sessionHarness();
    for (const acknowledgement of ['', 'expose hub through cloudflare', `${HUB_TUNNEL_PHRASE} `, 'yes']) {
      const answer = await h.ask('tunnel-apply', { ...APPLY, acknowledgement });
      expect(answer).toMatchObject({ ok: false, error: { code: 'refused', detail: { requiredPhrase: HUB_TUNNEL_PHRASE } } });
    }
    expect(h.adminCalls()).toEqual([]);
    await h.close();
  });

  it('refuses the tunnel apply without a confirmation token, and sends exactly the previewed token with the phrase to the Hub', async () => {
    const h = sessionHarness();
    const { confirmToken: _omitted, ...withoutToken } = APPLY;
    expect((await h.ask('tunnel-apply', withoutToken)).error.code).toBe('bad-request');
    expect((await h.ask('tunnel-apply', { ...APPLY, confirmToken: '' })).error.code).toBe('bad-request');
    expect(h.adminCalls()).toEqual([]);
    const done = await h.ask('tunnel-apply', APPLY);
    expect(done).toMatchObject({ ok: true, result: { hostname: SESSION_HOST, warnings: ['other'], restartRequired: true } });
    expect(JSON.stringify(done)).not.toContain(SESSION_TOKEN);
    const apply = h.adminCalls().find((c) => c.method === 'network.tunnel.apply')!;
    expect(apply.params).toMatchObject({ action: 'on', confirmToken: 'tok-on', acknowledgement: HUB_TUNNEL_PHRASE, connectorToken: SESSION_TOKEN });
    await h.close();
  });

  it('keeps the power change and the standby grant two-step: the apply operations need the previewed token', async () => {
    const h = sessionHarness();
    expect((await h.ask('power-apply', {})).error.code).toBe('bad-request');
    expect((await h.ask('standby-apply', { deviceId: SESSION_DEVICE })).error.code).toBe('bad-request');
    expect(h.adminCalls()).toEqual([]);
    const preview = await h.ask('power-preview');
    expect(h.adminCalls().map((c) => c.method)).toEqual(['power.preview']);
    expect((await h.ask('power-apply', { confirmToken: preview.result.confirmToken })).ok).toBe(true);
    await h.close();
  });

  it('offers no operation that narrows or widens the exposure any other way, or purges, restores or uninstalls', async () => {
    const h = sessionHarness();
    for (const op of ['tunnel-off', 'network.mode.set', 'network.tunnel.apply', 'purge', 'backup.restore', 'owner.reset.apply', 'service.uninstall', 'tls.activate.apply']) {
      expect((await h.ask(op, { action: 'off' })).error.code).toBe('unknown-operation');
    }
    expect(h.adminCalls()).toEqual([]);
    await h.close();
  });
});
