import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HelloResponse, PairingCodeResponse, parsePairingString } from '@dude/contracts/hub';
import { parseHubConfig } from '../config/hub-config.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';

/**
 * Trust-mode advertisement (32-SS1, Milestone 838, PD-143). The Hub only ADVERTISES `public-ca` (hello and pairing code) while the managed tunnel is on;
 * a Hub without the tunnel is byte-for-byte the pre-838 shape, so older clients keep pinning.
 */
const HOST = 'notes.example.com';

describe('tunnel mode advertises public-CA trust', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub({
      config: parseHubConfig({ exposure: { names: [HOST], proxy: { trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${HOST}` }, tunnel: { enabled: true, hostname: HOST } } }),
    });
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });

  const viaDomain = { host: HOST, origin: `https://${HOST}` };

  it('hello carries trustMode and trustDomain and still matches the contract', async () => {
    const res = await h.call('GET', '/hello', { headers: { host: `localhost:${h.hub.port}` } });
    expect(res.status).toBe(200);
    expect(Value.Check(HelloResponse, res.json)).toBe(true);
    expect(res.json).toMatchObject({ trustMode: 'public-ca', trustDomain: HOST });
  });

  it('a code issued for the tunnel domain is a pin-free v2 pairing string', async () => {
    const res = await h.call('POST', '/pairing-codes', { cookie: owner.cookie, csrf: owner.csrf, body: {}, headers: viaDomain });
    expect(res.status, res.raw.body).toBe(200);
    expect(Value.Check(PairingCodeResponse, res.json)).toBe(true);
    expect(res.json).toMatchObject({ trustMode: 'public-ca', trustDomain: HOST, hubUrl: `https://${HOST}` });
    expect(res.json.pairingString).toMatch(new RegExp(`^dude-pair:v2:${HOST.replace(/\./g, '\.')}:443:[0-9A-Z]{8}:public-ca$`));
    expect(res.json.pairingString).not.toContain(res.json.spkiSha256);
    expect(parsePairingString(res.json.pairingString)).toMatchObject({ trustMode: 'public-ca', host: HOST, port: 443, spkiSha256: null });
  });

  it('a code for a loopback host keeps the pinned v1 form even with the tunnel on', async () => {
    const res = await h.call('POST', '/pairing-codes', { cookie: owner.cookie, csrf: owner.csrf, body: { host: 'localhost' } });
    expect(res.status, res.raw.body).toBe(200);
    expect(res.json.trustMode).toBeUndefined();
    expect(res.json.pairingString).toMatch(/^dude-pair:v1:localhost:\d+:[0-9A-Z]{8}:[A-Za-z0-9_-]{43}$/);
  });
});

describe('a Hub without the tunnel keeps the pre-838 shape', () => {
  it('hello and pairing codes carry no trust fields', async () => {
    const h = await startAuthHub();
    try {
      const owner = await h.signIn();
      const hello = await h.call('GET', '/hello');
      expect(Value.Check(HelloResponse, hello.json)).toBe(true);
      expect(hello.json).not.toHaveProperty('trustMode');
      expect(hello.json).not.toHaveProperty('trustDomain');
      const code = await h.call('POST', '/pairing-codes', { cookie: owner.cookie, csrf: owner.csrf, body: {} });
      expect(code.status).toBe(200);
      expect(code.json).not.toHaveProperty('trustMode');
      expect(code.json.pairingString).toMatch(/^dude-pair:v1:/);
    } finally {
      await h.close();
    }
  });
});
