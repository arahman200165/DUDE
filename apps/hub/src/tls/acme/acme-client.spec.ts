import { X509Certificate, createPublicKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { AcmeError, createAcmeClient } from './acme-client.js';
import type { AcmeClientOptions, ChallengeInfo } from './acme-client.js';
import { buildCsr } from './csr.js';
import { createFakeAcmeServer } from './fake-acme-server.js';
import type { FakeAcmeServer } from './fake-acme-server.js';
import { createHttp01Listener } from './http01-listener.js';
import type { Http01Listener } from './http01-listener.js';

const NAMES = ['hub.example.test', 'www.example.test'];

interface Rig {
  fake: FakeAcmeServer;
  listener: Http01Listener;
  sleeps: number[];
  fetched: string[];
  done: ChallengeInfo[];
  announced: ChallengeInfo[];
  client: ReturnType<typeof createAcmeClient>;
  issue(names?: string[]): ReturnType<ReturnType<typeof createAcmeClient>['issue']>;
  csrKey: KeyObject;
}

const open: Rig[] = [];

async function rig(clientOptions: Partial<AcmeClientOptions> = {}): Promise<Rig> {
  const listener = createHttp01Listener({ port: 0, host: '127.0.0.1' });
  const { port } = await listener.start();
  const fake = createFakeAcmeServer({ resolve: () => ({ host: '127.0.0.1', port }) });
  await fake.start();
  const sleeps: number[] = [];
  const fetched: string[] = [];
  const done: ChallengeInfo[] = [];
  const announced: ChallengeInfo[] = [];
  const csrKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  const client = createAcmeClient({
    directoryUrl: fake.directoryUrl,
    accountKey: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey,
    sleep: async (ms) => { sleeps.push(ms); },
    fetchImpl: (input, init) => { fetched.push(`${init?.method ?? 'GET'} ${String(input)}`); return fetch(input, init); },
    ...clientOptions,
  });
  const r: Rig = {
    fake, listener, sleeps, fetched, done, announced, client, csrKey,
    issue: (names = NAMES) => client.issue({
      names,
      csrDer: buildCsr({ names, key: csrKey }).der,
      onChallenge: (c) => { announced.push(c); listener.set(c.token, c.keyAuthorization); },
      onChallengeDone: (c) => { done.push(c); listener.remove(c.token); },
    }),
  };
  open.push(r);
  return r;
}

afterEach(async () => {
  for (const r of open.splice(0)) { await r.listener.stop(); await r.fake.stop(); }
});

describe('acme client', () => {
  it('issues a chain whose leaf covers the names and matches the CSR key', async () => {
    const r = await rig();
    await r.client.ensureAccount({ contactEmail: 'ops@example.test', termsOfServiceAgreed: true });
    const result = await r.issue();
    const leaf = new X509Certificate(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(result.chainPem)![0]);
    for (const name of NAMES) expect(leaf.subjectAltName).toContain(`DNS:${name}`);
    expect(leaf.publicKey.export({ type: 'spki', format: 'der' }).equals(createPublicKey(r.csrKey).export({ type: 'spki', format: 'der' }))).toBe(true);
    expect(leaf.verify(new X509Certificate(r.fake.caPem).publicKey)).toBe(true);
    expect(result.chainPem.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
    expect(result.orderUrl).toMatch(/\/order\//);
    expect(new Date(result.notAfter!).getTime()).toBeGreaterThan(Date.now());
    expect(r.announced.map((c) => c.domain).sort()).toEqual(NAMES);
    expect(r.done).toHaveLength(2);
    expect(r.fake.finalizedNames[0]).toEqual(NAMES);
    expect(r.listener.stats().served).toBe(2);
  });

  it('reuses an existing account for the same key (kid kept)', async () => {
    const r = await rig();
    const first = await r.client.ensureAccount({ termsOfServiceAgreed: true });
    expect(await r.client.ensureAccount({ termsOfServiceAgreed: true })).toEqual(first);
    const second = createAcmeClient({ directoryUrl: r.fake.directoryUrl, accountKey: generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey });
    expect((await second.ensureAccount({ termsOfServiceAgreed: true })).kid).not.toBe(first.kid);
    expect(r.fake.accounts.size).toBe(2);
  });

  it('throws before any request unless terms of service are agreed', async () => {
    const r = await rig();
    for (const agreed of [false, undefined, 'yes', 1]) {
      await expect(r.client.ensureAccount({ termsOfServiceAgreed: agreed as unknown as boolean })).rejects.toMatchObject({ type: 'dude:terms-not-agreed' });
    }
    expect(r.fetched).toEqual([]);
    expect(r.fake.requests).toEqual([]);
  });

  it('retries once on badNonce', async () => {
    const r = await rig();
    await r.client.ensureAccount({ termsOfServiceAgreed: true });
    r.fake.injectBadNonce(1);
    await expect(r.issue()).resolves.toMatchObject({ chainPem: expect.stringContaining('BEGIN CERTIFICATE') });
  });

  it('gives up after a second consecutive badNonce', async () => {
    const r = await rig();
    r.fake.injectBadNonce(2);
    await expect(r.client.ensureAccount({ termsOfServiceAgreed: true })).rejects.toMatchObject({ type: 'urn:ietf:params:acme:error:badNonce' });
  });

  it('surfaces an invalid authorization with its problem type and still cleans up', async () => {
    const r = await rig();
    r.fake.rejectChallenges = true;
    await r.client.ensureAccount({ termsOfServiceAgreed: true });
    const error = await r.issue().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AcmeError);
    expect(error).toMatchObject({ type: 'urn:ietf:params:acme:error:unauthorized' });
    expect((error as AcmeError).detail).toMatch(/Could not validate/);
    expect(r.done).toHaveLength(2);
  });

  it('surfaces rateLimited with Retry-After and does not retry', async () => {
    const r = await rig();
    r.fake.rateLimited = 3600;
    await r.client.ensureAccount({ termsOfServiceAgreed: true });
    const error = (await r.issue().catch((e: unknown) => e)) as AcmeError;
    expect(error).toMatchObject({ type: 'urn:ietf:params:acme:error:rateLimited', status: 429, retryAfterSeconds: 3600 });
    expect(r.fake.requests.filter((q) => q === 'POST /new-order')).toHaveLength(1);
    expect(r.announced).toEqual([]);
  });

  it('fails clearly when the CA offers no http-01 challenge', async () => {
    const r = await rig();
    r.fake.dnsOnly = true;
    await r.client.ensureAccount({ termsOfServiceAgreed: true });
    await expect(r.issue()).rejects.toMatchObject({ type: 'dude:no-http-01', detail: expect.stringContaining('dns-01') });
    expect(r.announced).toEqual([]);
  });

  it('polls within bounds and reports a timeout', async () => {
    const r = await rig({ maxPollAttempts: 3, pollIntervalMs: 111 });
    r.fake.orderProcessingPolls = 100;
    await r.client.ensureAccount({ termsOfServiceAgreed: true });
    await expect(r.issue()).rejects.toMatchObject({ type: 'dude:poll-timeout' });
    expect(r.fake.requests.filter((q) => q.startsWith('POST /order/')).length).toBeLessThanOrEqual(4);
    expect(r.sleeps.every((ms) => ms === 111)).toBe(true);
    expect(r.done).toHaveLength(2);
  });

  it('waits through pending authorizations and processing orders', async () => {
    const r = await rig({ pollIntervalMs: 50 });
    r.fake.authzPendingPolls = 2;
    r.fake.orderProcessingPolls = 2;
    await r.client.ensureAccount({ termsOfServiceAgreed: true });
    await expect(r.issue()).resolves.toMatchObject({ chainPem: expect.any(String) });
    expect(r.sleeps.length).toBeGreaterThan(0);
  });

  it('calls onChallengeDone even when onChallenge throws', async () => {
    const r = await rig();
    await r.client.ensureAccount({ termsOfServiceAgreed: true });
    const done: string[] = [];
    await expect(r.client.issue({
      names: ['a.example.test'],
      csrDer: buildCsr({ names: ['a.example.test'], key: r.csrKey }).der,
      onChallenge: () => { throw new Error('port 80 busy'); },
      onChallengeDone: (c) => { done.push(c.domain); },
    })).rejects.toThrow('port 80 busy');
    expect(done).toEqual(['a.example.test']);
  });

  it('rejects non-HTTPS directory URLs unless loopback', async () => {
    const key = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
    const calls: string[] = [];
    const client = createAcmeClient({ directoryUrl: 'http://ca.example.test/directory', accountKey: key, fetchImpl: async (u) => { calls.push(String(u)); return new Response('{}'); } });
    await expect(client.ensureAccount({ termsOfServiceAgreed: true })).rejects.toMatchObject({ type: 'dude:insecure-url' });
    expect(calls).toEqual([]);
  });

  it('requires an account before issuing', async () => {
    const r = await rig();
    await expect(r.issue()).rejects.toMatchObject({ type: 'dude:no-account' });
  });
});
