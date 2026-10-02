import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { ErrorEnvelope, HUB_API_PREFIX, HelloResponse } from '@dude/contracts/hub';
import { request, startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';

describe('hub server', () => {
  let hub: TestHub;
  beforeAll(async () => { hub = await startTestHub(); });
  afterAll(async () => { await hub.close(); });

  it('serves a valid hello over pinned HTTPS for an un-bootstrapped hub', async () => {
    const res = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body: unknown = JSON.parse(res.body);
    expect(Value.Check(HelloResponse, body)).toBe(true);
    const hello = body as HelloResponse;
    expect(hello.bootstrapped).toBe(false);
    expect(hello.environmentId).toBeNull();
    expect(hello.tls.spkiSha256).toBe(hub.tls.spkiSha256);
    expect(hello.tls.nextSpkiSha256).toBeNull();
    expect(hello.hubInstanceId).toBe(hub.hub.hubInstanceId);
  });

  it('records the active certificate pin', () => {
    const rows = hub.hub.db.prepare('SELECT spki_sha256, state FROM tls_pins').all();
    expect(rows.map((r) => ({ ...r }))).toEqual([{ spki_sha256: hub.tls.spkiSha256, state: 'active' }]);
  });

  it('reports a next pin once one exists', async () => {
    const next = 'A'.repeat(43);
    hub.hub.db.prepare("INSERT INTO tls_pins(spki_sha256, cert_pem, state, created_at) VALUES(?, 'x', 'next', 'now')").run(next);
    const res = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/hello`);
    expect((JSON.parse(res.body) as HelloResponse).tls.nextSpkiSha256).toBe(next);
    hub.hub.db.prepare('DELETE FROM tls_pins WHERE spki_sha256 = ?').run(next);
  });

  it('answers unknown /api paths with a JSON envelope, never HTML', async () => {
    for (const method of ['GET', 'POST']) {
      const res = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/nope`, { method, headers: { origin: `https://127.0.0.1:${hub.port}` } });
      expect(res.status).toBe(404);
      expect(String(res.headers['content-type'])).toContain('application/json');
      const body: unknown = JSON.parse(res.body);
      expect(Value.Check(ErrorEnvelope, body)).toBe(true);
      expect((body as ErrorEnvelope).error.code).toBe('not-found');
    }
  });

  it('rejects bodies over 64 KiB with 413', async () => {
    const res = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/nope`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `https://127.0.0.1:${hub.port}` },
      body: JSON.stringify({ filler: 'x'.repeat(70 * 1024) }),
    });
    expect(res.status).toBe(413);
    expect((JSON.parse(res.body) as ErrorEnvelope).error.code).toBe('payload-too-large');
  });

  it('maps malformed JSON to a 400 envelope without leaking detail', async () => {
    const res = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}/nope`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `https://127.0.0.1:${hub.port}` },
      body: '{not json',
    });
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ error: { code: 'bad-request', message: 'The request is not valid.' } });
  });

  it('answers non-GET methods outside /api with JSON 404', async () => {
    const res = await request(hub.port, hub.tls.certPem, '/settings', { method: 'POST' });
    expect(res.status).toBe(404);
    expect(String(res.headers['content-type'])).toContain('application/json');
  });
});
