import { describe, expect, it } from 'vitest';
import { buildAdminMethods } from '../admin/methods.js';
import { parseArgs } from '../cli/args.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { ConfirmationStore, CONFIRMATION_TTL_MS } from '../security/confirmation-store.js';
import { tempDir } from '../server/test-helpers.js';
import { runTlsProxyPin } from '../service/tls-external.js';
import { PROXY_PIN_CONSEQUENCE_CLASS, createProxyPins, proxyPinSpkis } from './proxy-pins.js';

/** The Destructive-Action Contract's confirmation-boundary spec for `dude-hub tls proxy-pin activate|remove`. */
const pin = (c: string): string => c.repeat(43);

function fixture() {
  const paths = hubPaths(tempDir('hub-proxy-'));
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error('db');
  let clock = 1_000_000;
  const proxy = createProxyPins({ db: opened.hub.db, now: () => clock, confirmations: new ConfirmationStore() });
  return { db: opened.hub.db, proxy, advance: (ms: number) => { clock += ms; }, close: () => opened.hub.close(), paths, hub: opened.hub };
}

describe('proxy-pin confirmation boundary', () => {
  it('tags the consequence class and changes nothing on a preview', () => {
    const f = fixture();
    f.proxy.add(pin('A'));
    const before = JSON.stringify(f.db.prepare('SELECT * FROM tls_proxy_pins').all());
    const activate = f.proxy.previewActivate();
    const remove = f.proxy.previewRemove(pin('A'));
    expect(activate.consequenceClass).toEqual([...PROXY_PIN_CONSEQUENCE_CLASS]);
    expect(remove.consequenceClass).toEqual([...PROXY_PIN_CONSEQUENCE_CLASS]);
    expect(JSON.stringify(f.db.prepare('SELECT * FROM tls_proxy_pins').all())).toBe(before);
    expect(f.db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE event IN ('tls.proxy-pin-activated', 'tls.proxy-pin-removed')").get()).toEqual({ n: 0 });
    f.close();
  });

  it('requires a valid single-use token: missing, wrong action, replayed and expired tokens do nothing', () => {
    const f = fixture();
    f.proxy.add(pin('A'));
    expect(() => f.proxy.applyActivate({ confirmToken: 'nope' })).toThrow(/missing, expired or already used/);
    expect(() => f.proxy.applyRemove({ spkiSha256: pin('A'), confirmToken: 'nope' })).toThrow(/missing, expired or already used/);

    const removeToken = f.proxy.previewRemove(pin('A')).confirmToken;
    expect(() => f.proxy.applyActivate({ confirmToken: removeToken })).toThrow(/missing, expired or already used/); // wrong action
    expect(proxyPinSpkis(f.db)).toEqual([pin('A')]);

    const token = f.proxy.previewActivate().confirmToken;
    f.advance(CONFIRMATION_TTL_MS + 1);
    expect(() => f.proxy.applyActivate({ confirmToken: token })).toThrow(/missing, expired or already used/);

    const fresh = f.proxy.previewActivate().confirmToken;
    expect(f.proxy.applyActivate({ confirmToken: fresh }).activated).toBe(true);
    expect(() => f.proxy.applyActivate({ confirmToken: fresh })).toThrow(); // replay
    f.close();
  });

  it('a remove token is bound to the previewed pin and state', () => {
    const f = fixture();
    f.proxy.add(pin('A'));
    const forA = f.proxy.previewRemove(pin('A')).confirmToken;
    f.proxy.applyActivate({ confirmToken: f.proxy.previewActivate().confirmToken });
    // The pin changed state (next -> active) after the preview: the old token must not remove it.
    expect(() => f.proxy.applyRemove({ spkiSha256: pin('A'), confirmToken: forA })).toThrow(/changed since the preview/);
    expect(proxyPinSpkis(f.db)).toEqual([pin('A')]);
    f.close();
  });

  it('removing the ACTIVE pin says devices can no longer connect through the proxy, then removes it with an audit', () => {
    const f = fixture();
    f.proxy.add(pin('A'));
    f.proxy.applyActivate({ confirmToken: f.proxy.previewActivate().confirmToken });
    const preview = f.proxy.previewRemove(pin('A'));
    expect(preview.summary.state).toBe('active');
    expect(preview.consequence).toMatch(/can no longer connect through the proxy/);
    expect(f.proxy.applyRemove({ spkiSha256: pin('A'), confirmToken: preview.confirmToken })).toMatchObject({ removed: true, state: 'active' });
    expect(proxyPinSpkis(f.db)).toEqual([]);
    expect(f.db.prepare("SELECT detail_json AS d FROM audit_events WHERE event = 'tls.proxy-pin-removed'").get()).toEqual({ d: JSON.stringify({ spki: pin('A') }) });
    expect(() => f.proxy.previewRemove(pin('A'))).toThrow(/not registered/);
    f.close();
  });

  it('an activation token is bound to the force flag', () => {
    const f = fixture();
    f.proxy.add(pin('A'));
    const token = f.proxy.previewActivate().confirmToken;
    expect(() => f.proxy.applyActivate({ confirmToken: token, force: true })).toThrow(/changed since the preview/);
    f.close();
  });
});

describe('proxy-pin CLI', () => {
  it('parses the subcommands and flags', () => {
    expect(parseArgs(['tls', 'proxy-pin', 'add', 'proxy.pem'])).toEqual({ command: 'tls-proxy-pin', action: 'add', value: 'proxy.pem' });
    expect(parseArgs(['tls', 'proxy-pin', 'remove', pin('A'), '--confirm', 't'])).toEqual({ command: 'tls-proxy-pin', action: 'remove', value: pin('A'), confirm: 't' });
    expect(parseArgs(['tls', 'proxy-pin', 'activate', '--force', '--confirm', 't'])).toEqual({ command: 'tls-proxy-pin', action: 'activate', force: true, confirm: 't' });
    expect(parseArgs(['tls', 'proxy-pin', 'list'])).toEqual({ command: 'tls-proxy-pin', action: 'list' });
    expect(() => parseArgs(['tls', 'proxy-pin', 'add'])).toThrow(/Usage/);
    expect(() => parseArgs(['tls', 'proxy-pin', 'frob'])).toThrow(/Usage/);
    expect(() => parseArgs(['tls', 'proxy-pin', 'list', '--force'])).toThrow();
  });

  it('is two-step over the admin channel: previews print a token and change nothing; --confirm applies', async () => {
    const f = fixture();
    const methods = buildAdminMethods({
      db: f.db, hubVersion: 't', hubInstanceId: f.hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0, configDir: f.paths.configDir, spkiSha256: pin('S'),
      proxyPins: createProxyPins({ db: f.db }),
    });
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      platform: 'linux' as const, stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t),
      call: async (_dir: string, method: string, params: unknown) => (method === 'status' ? { ok: true } : methods[method]!(params)),
    };
    const run = async (options: Parameters<typeof runTlsProxyPin>[0]): Promise<{ code: number; json: any }> => {
      out.length = 0;
      const code = await runTlsProxyPin({ dataDir: f.paths.root, ...options }, deps);
      return { code, json: out.length > 0 ? JSON.parse(out.join('')) : null };
    };

    expect((await run({ action: 'add', value: pin('K') })).code).toBe(0);
    expect((await run({ action: 'add', value: pin('K') })).code).toBe(1); // already registered
    expect((await run({ action: 'add', value: 'not-a-file-or-pin' })).code).toBe(2);
    const preview = await run({ action: 'activate' });
    expect(preview.json.confirmToken).toBeTruthy();
    expect(err.join('')).toMatch(/Nothing has changed/);
    expect(proxyPinSpkis(f.db)).toEqual([pin('K')]);
    expect(f.db.prepare("SELECT state FROM tls_proxy_pins").get()).toEqual({ state: 'next' });
    expect((await run({ action: 'activate', confirm: preview.json.confirmToken })).json).toMatchObject({ activated: true });
    expect((await run({ action: 'list' })).json.active.spkiSha256).toBe(pin('K'));

    const removePreview = await run({ action: 'remove', value: pin('K') });
    expect(removePreview.json.consequence).toMatch(/can no longer connect through the proxy/);
    expect(err.join('')).toMatch(/can no longer connect through the proxy/);
    expect(proxyPinSpkis(f.db)).toEqual([pin('K')]);
    expect((await run({ action: 'remove', value: pin('K'), confirm: removePreview.json.confirmToken })).json).toMatchObject({ removed: true });
    expect(proxyPinSpkis(f.db)).toEqual([]);
    f.close();
  });
});
