import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseHubConfig } from '../config/hub-config.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { createPairingCode } from './device-test-helpers.js';

describe('pairing hubUrl with exposure.canonicalOrigin', () => {
  let h: AuthHub;
  let owner: Signed;
  beforeAll(async () => {
    h = await startAuthHub({ config: parseHubConfig({ exposure: { names: ['hub.example.com'], canonicalOrigin: 'https://hub.example.com:8443' } }) });
    owner = await h.signIn();
  });
  afterAll(async () => { await h.close(); });

  it('hands out the canonical origin instead of the request Host', async () => {
    const created = await createPairingCode(h, owner);
    expect(created.status).toBe(200);
    expect(created.json.hubUrl).toBe('https://hub.example.com:8443');
    expect(created.json.pairingString).toContain('hub.example.com');
  });
});

describe('Host allowlist from config', () => {
  it('serves a configured name and refuses an unconfigured one with 421', async () => {
    const h = await startAuthHub({ config: parseHubConfig({ exposure: { names: ['hub.example.com'] } }) });
    try {
      const ok = await h.call('GET', '/hello', { noOrigin: true, headers: { host: `hub.example.com:${h.hub.port}` } });
      expect(ok.status).toBe(200);
      const bad = await h.call('GET', '/hello', { noOrigin: true, headers: { host: `other.example.com:${h.hub.port}` } });
      expect(bad.status).toBe(421);
    } finally {
      await h.close();
    }
  });
});
