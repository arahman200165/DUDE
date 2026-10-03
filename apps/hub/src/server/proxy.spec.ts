import { afterAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { HUB_API_PREFIX, HUB_REALTIME_PATH } from '@dude/contracts/hub';
import { parseHubConfig } from '../config/hub-config.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub } from './auth-test-helpers.js';
import { createPairingCode } from './device-test-helpers.js';
import { request, startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';
import { createTrustMatcher, trustProxyFor } from '../security/trusted-proxy.js';

const WHOAMI = `${HUB_API_PREFIX}/test/whoami`;

const proxied = (trusted: string[], publicOrigin = 'https://hub.example.com', extra: Record<string, unknown> = {}) =>
  parseHubConfig({ exposure: { names: ['hub.example.com'], proxy: { trusted, publicOrigin }, ...extra } });

const opened: Array<{ close(): Promise<void> }> = [];
afterAll(async () => { for (const h of opened) await h.close(); });

async function whoamiHub(trusted: string[]): Promise<TestHub> {
  const hub = await startTestHub(proxied(trusted), {
    rateLimit: { global: { perMinute: 600_000, burst: 100_000 } },
    configure: (app) => {
      app.get(WHOAMI, async (req) => ({ ip: req.ip, host: req.host, protocol: req.protocol, hostname: req.hostname }));
    },
  });
  opened.push(hub);
  return hub;
}

const whoami = async (hub: TestHub, headers: Record<string, string>) => {
  const res = await request(hub.port, hub.tls.certPem, WHOAMI, { headers: { host: `localhost:${hub.port}`, ...headers } });
  return { status: res.status, body: res.status === 200 ? (JSON.parse(res.body) as Record<string, string>) : null };
};

describe('trust matcher', () => {
  it('matches IP literals and CIDRs in both families, including IPv4-mapped peers, and never an unknown peer', () => {
    const matches = createTrustMatcher(['10.0.0.1', '192.168.0.0/16', '2001:db8::/32']);
    expect(matches('10.0.0.1')).toBe(true);
    expect(matches('10.0.0.2')).toBe(false);
    expect(matches('192.168.44.5')).toBe(true);
    expect(matches('::ffff:192.168.44.5')).toBe(true);
    expect(matches('2001:db8:1::9')).toBe(true);
    expect(matches('2001:db9::1')).toBe(false);
    expect(matches(undefined)).toBe(false);
    expect(matches('garbage')).toBe(false);
  });

  it('trustProxyFor trusts only hop 0 and only a configured peer', () => {
    expect(trustProxyFor(undefined)).toBe(false);
    const trust = trustProxyFor(['10.0.0.1']) as (address: string, hop: number) => boolean;
    expect(trust('10.0.0.1', 0)).toBe(true);
    expect(trust('10.0.0.1', 1)).toBe(false);
    expect(trust('10.0.0.9', 0)).toBe(false);
  });
});

describe('trustProxy in a running Hub', () => {
  it('a trusted peer supplies the client address (last hop), host and protocol', async () => {
    const hub = await whoamiHub(['127.0.0.1']);
    const { status, body } = await whoami(hub, { 'x-forwarded-for': '203.0.113.9, 198.51.100.7', 'x-forwarded-host': 'hub.example.com', 'x-forwarded-proto': 'https' });
    expect(status).toBe(200);
    // Only one hop is trusted: the spoofed first entry is ignored, the last one the proxy appended is the client.
    expect(body).toMatchObject({ ip: '198.51.100.7', host: 'hub.example.com', protocol: 'https', hostname: 'hub.example.com' });
  });

  it('an untrusted peer cannot spoof the client address, host or protocol', async () => {
    const hub = await whoamiHub(['10.0.0.1']);
    const { status, body } = await whoami(hub, { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-host': 'hub.example.com', 'x-forwarded-proto': 'http' });
    expect(status).toBe(200);
    expect(body?.ip).toBe('127.0.0.1');
    expect(body?.host).toBe(`localhost:${hub.port}`);
    expect(body?.protocol).toBe('https');
  });

  it('is off when no proxy is configured', async () => {
    const hub = await startTestHub({}, { configure: (app) => { app.get(WHOAMI, async (req) => ({ ip: req.ip, host: req.host })); } });
    opened.push(hub);
    const res = await request(hub.port, hub.tls.certPem, WHOAMI, { headers: { host: `localhost:${hub.port}`, 'x-forwarded-for': '203.0.113.9', 'x-forwarded-host': 'evil.example' } });
    expect(JSON.parse(res.body)).toEqual({ ip: '127.0.0.1', host: `localhost:${hub.port}` });
  });
});

describe('effective host in proxy mode', () => {
  it('a trusted proxy is served for the public host and refused for any other forwarded host', async () => {
    const hub = await whoamiHub(['127.0.0.1']);
    expect((await whoami(hub, { 'x-forwarded-host': 'hub.example.com' })).status).toBe(200);
    expect((await whoami(hub, { 'x-forwarded-host': 'evil.example' })).status).toBe(421);
    // Without X-Forwarded-Host the Host header is the effective host.
    expect((await whoami(hub, {})).status).toBe(200);
    expect((await whoami(hub, { host: 'evil.example' })).status).toBe(421);
  });

  it('a direct (untrusted) peer is limited to loopback Host names, even for a configured name', async () => {
    const hub = await whoamiHub(['10.0.0.1']);
    expect((await whoami(hub, {})).status).toBe(200);
    expect((await whoami(hub, { host: `127.0.0.1:${hub.port}` })).status).toBe(200);
    expect((await whoami(hub, { host: `hub.example.com:${hub.port}` })).status).toBe(421);
    expect((await whoami(hub, { host: 'hub.example.com' })).status).toBe(421);
    expect((await whoami(hub, { 'x-forwarded-host': 'hub.example.com' })).status).toBe(200); // header ignored, loopback Host still valid
  });
});

describe('Origin in proxy mode', () => {
  const signIn = (h: AuthHub, headers: Record<string, string>) => h.call('POST', '/auth/sign-in', { headers, body: { password: 'a very long password' } });

  it('requires the public origin from a trusted proxy and the plain Host origin from a direct peer', async () => {
    const trustedHub = await startAuthHub({ config: proxied(['127.0.0.1']) });
    opened.push(trustedHub);
    const host = `localhost:${trustedHub.hub.port}`;
    const forwarded = { host, 'x-forwarded-host': 'hub.example.com' };
    expect((await signIn(trustedHub, { ...forwarded, origin: 'https://hub.example.com' })).status).toBe(200);
    expect((await signIn(trustedHub, { ...forwarded, origin: 'https://evil.example' })).status).toBe(403);
    // The upstream Host is not the externally visible one once the proxy forwarded the real host.
    expect((await signIn(trustedHub, { ...forwarded, origin: `https://${host}` })).status).toBe(403);
    expect((await signIn(trustedHub, { host, origin: `https://${host}` })).status).toBe(200);
    // A trusted proxy that does not forward the host may still present the configured public origin.
    expect((await signIn(trustedHub, { host, origin: 'https://hub.example.com' })).status).toBe(200);
    expect((await signIn(trustedHub, { host, origin: 'https://evil.example' })).status).toBe(403);

    const directHub = await startAuthHub({ config: proxied(['10.0.0.1']) });
    opened.push(directHub);
    const directHost = `localhost:${directHub.hub.port}`;
    expect((await signIn(directHub, { host: directHost, origin: `https://${directHost}` })).status).toBe(200);
    // A spoofed X-Forwarded-Host from an untrusted peer changes nothing.
    expect((await signIn(directHub, { host: directHost, 'x-forwarded-host': 'hub.example.com', origin: 'https://hub.example.com' })).status).toBe(403);
  });

  it('applies the same rule to the cookie realtime socket', async () => {
    const h = await startAuthHub({ config: proxied(['127.0.0.1']) });
    opened.push(h);
    const signed = await h.signIn();
    const connect = (headers: Record<string, string>): Promise<number> =>
      new Promise((resolve) => {
        const ws = new WebSocket(`wss://127.0.0.1:${h.hub.port}${HUB_REALTIME_PATH}`, { ca: h.hub.tls.certPem, headers: { cookie: `__Host-dude_session=${signed.cookie}`, ...headers } });
        ws.on('open', () => { ws.close(); resolve(101); });
        ws.on('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode ?? 0); });
        ws.on('error', () => { /* unexpected-response also fires */ });
      });
    const host = `localhost:${h.hub.port}`;
    expect(await connect({ host, 'x-forwarded-host': 'hub.example.com', origin: 'https://hub.example.com' })).toBe(101);
    expect(await connect({ host, 'x-forwarded-host': 'hub.example.com', origin: `https://${host}` })).toBe(401);
    expect(await connect({ host, 'x-forwarded-host': 'hub.example.com', origin: 'https://evil.example' })).toBe(401);
    expect(await connect({ host, origin: `https://${host}` })).toBe(101);
  });
});

describe('pairing hubUrl', () => {
  it('hands out the proxy public origin, ahead of canonicalOrigin and the request Host', async () => {
    const h = await startAuthHub({ config: proxied(['127.0.0.1'], 'https://hub.example.com:8443', { canonicalOrigin: 'https://localhost:5555' }) });
    opened.push(h);
    const owner = await h.signIn();
    const created = await createPairingCode(h, owner);
    expect(created.status).toBe(200);
    expect(created.json.hubUrl).toBe('https://hub.example.com:8443');
    expect(created.json.pairingString).toContain('hub.example.com');

    const plain = await startAuthHub({ config: proxied(['127.0.0.1']) });
    opened.push(plain);
    expect((await createPairingCode(plain, await plain.signIn())).json.hubUrl).toBe('https://hub.example.com');
  });
});

describe('HSTS follows the certificate source', () => {
  const hsts = async (hub: TestHub): Promise<string | string[] | undefined> =>
    (await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`)).headers['strict-transport-security'];

  it('omits HSTS on a self-signed certificate and sends it for a local-CA or imported one', async () => {
    const hub = await startTestHub();
    opened.push(hub);
    expect(await hsts(hub)).toBeUndefined();
    hub.hub.db.prepare("UPDATE tls_pins SET source = 'imported' WHERE state = 'active'").run();
    expect(await hsts(hub)).toBe('max-age=31536000');
    hub.hub.db.prepare("UPDATE tls_pins SET source = 'local-ca' WHERE state = 'active'").run();
    expect(await hsts(hub)).toBe('max-age=31536000');
    hub.hub.db.prepare("UPDATE tls_pins SET source = 'self-signed' WHERE state = 'active'").run();
    expect(await hsts(hub)).toBeUndefined();
  });

  it('sends HSTS in proxy mode regardless of the Hub certificate', async () => {
    const hub = await whoamiHub(['127.0.0.1']);
    expect(await hsts(hub)).toBe('max-age=31536000');
  });
});
