import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getMeta } from '@dude/sqlite-store';
import { buildAdminMethods } from '../../admin/methods.js';
import { HELP_TEXT, parseArgs } from '../../cli/args.js';
import { hubPaths } from '../../config/data-dir.js';
import { loadOrCreateHubConfig, parseHubConfig } from '../../config/hub-config.js';
import { openHubDb } from '../../db/open-hub-db.js';
import { listAudit } from '../../security/audit.js';
import { createHstsPolicy } from '../../security/hsts.js';
import { tempDir } from '../../server/test-helpers.js';
import { runTlsAcme } from '../../service/tls-acme.js';
import type { CaKeyProtector } from '../ca-key-protector.js';
import { ensureTlsIdentity } from '../identity.js';
import { createTlsRotation } from '../rotation.js';
import { spkiSha256 } from '../self-signed.js';
import { acmeAccountKeyExists } from './account-key.js';
import { ACME_LAST_ATTEMPT_META, createAcmeRenewal } from './acme-renewal.js';
import { AcmeIssueError, issueAcmeCertificate, validateAcmeNames } from './acme-issue.js';
import { createFakeAcmeServer } from './fake-acme-server.js';
import type { FakeAcmeServer } from './fake-acme-server.js';
import { createHttp01Listener } from './http01-listener.js';
import type { Http01Listener } from './http01-listener.js';

const ID = '0123456789abcdef-test';
const DAY = 86_400_000;
const NAMES = ['hub.example.test', 'www.example.test'];

function fakeProtector(): CaKeyProtector & { unprotects: number } {
  const state = { unprotects: 0 };
  return {
    kind: 'file' as const,
    keyFile: 'account-key.fake',
    protect: (plain: Buffer) => Buffer.from(Buffer.from(plain).reverse()),
    unprotect: (blob: Buffer) => { state.unprotects++; return Buffer.from(Buffer.from(blob).reverse()); },
    get unprotects() { return state.unprotects; },
  };
}

const open: Array<{ fake: FakeAcmeServer; listeners: Http01Listener[] }> = [];
afterEach(async () => {
  for (const r of open.splice(0)) { for (const l of r.listeners) await l.stop(); await r.fake.stop(); }
});

async function fixture() {
  const root = tempDir('hub-acme-');
  const paths = hubPaths(root);
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error('db');
  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.tlsDir, { recursive: true });
  writeFileSync(paths.configFile, JSON.stringify({ port: 4711, bind: 'loopback' }));
  const identity = ensureTlsIdentity(paths.tlsDir, { hubInstanceId: ID });
  const protector = fakeProtector();
  const rotation = createTlsRotation({ db: opened.hub.db, tlsDir: paths.tlsDir, hubInstanceId: opened.hub.hubInstanceId });
  const at = new Date().toISOString();
  opened.hub.db.prepare("INSERT INTO tls_pins(spki_sha256, cert_pem, key_ref, state, created_at, activated_at) VALUES(?, ?, NULL, 'active', ?, ?)").run(identity.spkiSha256, identity.certPem, at, at);

  const state = { port: 0, started: 0, listeners: [] as Http01Listener[], failStart: false };
  const fake = createFakeAcmeServer({ resolve: () => ({ host: '127.0.0.1', port: state.port }) });
  await fake.start();
  open.push({ fake, listeners: state.listeners });
  const listenerFactory = (): Http01Listener => {
    const inner = createHttp01Listener({ port: 0, host: '127.0.0.1' });
    state.listeners.push(inner);
    return {
      ...inner,
      start: async () => {
        if (state.failStart) throw Object.assign(new Error('listen EADDRINUSE: address already in use :::80'), { code: 'EADDRINUSE' });
        const r = await inner.start();
        state.port = r.port;
        state.started++;
        return r;
      },
    };
  };
  const applied: Array<{ key: string; cert: string }> = [];
  const names: string[][] = [];
  const methods = buildAdminMethods({
    db: opened.hub.db, hubVersion: 't', hubInstanceId: opened.hub.hubInstanceId, bind: 'loopback', getPort: () => 4711, startedAt: 0,
    configDir: paths.configDir, configFile: paths.configFile, tlsDir: paths.tlsDir, spkiSha256: identity.spkiSha256, tls: rotation,
    acmeProtector: protector, acmeTest: { listenerFactory }, onNamesChanged: (n) => void names.push([...n]),
  });
  const issue = (params: Record<string, unknown> = {}) => methods['tls.acme.issue']!({ names: NAMES, directoryUrl: fake.directoryUrl, agreeTos: true, ...params }) as Promise<{ spkiSha256: string; notAfter: string; source: string }>;
  return { paths, hub: opened.hub, db: opened.hub.db, identity, protector, rotation, fake, state, listenerFactory, methods, issue, applied, names };
}

describe('ACME name validation', () => {
  it('accepts public DNS names, lowercases and dedupes', () => {
    expect(validateAcmeNames(['Hub.Example.Test', 'hub.example.test', 'a.example.org'])).toEqual(['hub.example.test', 'a.example.org']);
  });
  it.each([
    ['an IPv4 address', '192.168.1.5'], ['an IPv6 address', '2001:db8::1'], ['a wildcard', '*.example.test'], ['a .local name', 'hub.local'],
    ['an .internal name', 'hub.internal'], ['a .lan name', 'hub.lan'], ['a .home.arpa name', 'hub.home.arpa'], ['localhost', 'localhost'],
    ['a single label', 'hub'], ['a trailing dot', 'hub.example.test.'], ['an invalid label', 'bad_name.example.test'],
  ])('rejects %s', (_label, name) => {
    expect(() => validateAcmeNames([name])).toThrow(AcmeIssueError);
  });
  it('rejects more than 8 names and an empty list', () => {
    expect(() => validateAcmeNames(Array.from({ length: 9 }, (_, i) => `h${i}.example.test`))).toThrow(/At most 8/);
    expect(() => validateAcmeNames([])).toThrow(AcmeIssueError);
  });
});

describe('tls.acme.issue', () => {
  it('stages an acme-source next pin whose chain covers the names, records config and audits without secrets', async () => {
    const f = await fixture();
    const result = await f.issue({ email: 'ops@example.test' });
    expect(result.source).toBe('acme');
    const status = f.rotation.status();
    expect(status.next?.spkiSha256).toBe(result.spkiSha256);
    expect(status.active?.spkiSha256).toBe(f.identity.spkiSha256);
    const chain = readFileSync(path.join(f.paths.tlsDir, 'next-cert.pem'), 'utf8');
    expect(chain.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
    const leaf = new X509Certificate(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/.exec(chain)![0]);
    for (const name of NAMES) expect(leaf.subjectAltName).toContain(`DNS:${name}`);
    expect(spkiSha256(chain)).toBe(result.spkiSha256);
    expect((f.db.prepare("SELECT source FROM tls_pins WHERE state = 'next'").get() as { source: string }).source).toBe('acme');

    const config = loadOrCreateHubConfig(f.paths.configFile);
    expect(config.exposure.names).toEqual(NAMES);
    expect(config.exposure.acme).toMatchObject({ directoryUrl: f.fake.directoryUrl, email: 'ops@example.test' });
    expect(Date.parse(config.exposure.acme!.termsAgreedAt!)).not.toBeNaN();
    expect(f.names).toEqual([NAMES]);

    const events = listAudit(f.db, { limit: 20 });
    const issued = events.filter((e) => e.event === 'tls.acme-issued');
    expect(issued).toHaveLength(1);
    expect(events.some((e) => e.event === 'tls.import-staged')).toBe(false);
    expect(issued[0]!.detail).toMatchObject({ names: NAMES, spki: result.spkiSha256, directoryHost: new URL(f.fake.directoryUrl).host });
    const text = JSON.stringify(events);
    expect(text).not.toMatch(/PRIVATE KEY|kid|\/acct\//);
    expect(f.state.started).toBe(1);
    // The listener is closed once the order finished.
    await expect(fetch(`http://127.0.0.1:${f.state.port}/.well-known/acme-challenge/x`)).rejects.toThrow();
    f.hub.close();
  });

  it('creates the account key protected, reuses it, and remembers the terms agreement', async () => {
    const f = await fixture();
    expect(acmeAccountKeyExists(f.paths.tlsDir, f.protector)).toBe(false);
    await f.issue();
    const stored = readFileSync(path.join(f.paths.tlsDir, 'acme', 'account-key.fake'), 'utf8');
    expect(stored).not.toContain('PRIVATE KEY');
    expect(acmeAccountKeyExists(f.paths.tlsDir, f.protector)).toBe(true);
    expect(f.protector.unprotects).toBe(0);
    f.db.prepare("DELETE FROM tls_pins WHERE state = 'next'").run();
    // Terms were agreed once for this directory: no --agree-tos needed again.
    await f.issue({ agreeTos: undefined });
    expect(f.protector.unprotects).toBe(1);
    expect(f.fake.accounts.size).toBe(1);
    expect(readdirSync(path.join(f.paths.tlsDir, 'acme'))).toEqual(['account-key.fake']);
    f.hub.close();
  });

  it('refuses before any ACME request or key creation unless the terms are agreed', async () => {
    const f = await fixture();
    await expect(f.issue({ agreeTos: false })).rejects.toMatchObject({ code: 'refused', message: expect.stringContaining('--agree-tos') });
    expect(f.fake.requests).toEqual([]);
    expect(f.state.started).toBe(0);
    expect(existsSync(path.join(f.paths.tlsDir, 'acme'))).toBe(false);
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.acme).toBeUndefined();
    f.hub.close();
  });

  it('rejects bad names and params before contacting the CA', async () => {
    const f = await fixture();
    for (const names of [['10.0.0.1'], ['*.example.test'], ['hub.local'], ['hub'], []]) {
      await expect(f.issue({ names })).rejects.toMatchObject({ code: 'bad-request' });
    }
    for (const params of [{ names: 'x' }, { directoryUrl: 5 }, { email: 'nope' }, { agreeTos: 'yes' }, { httpPort: 0 }, { httpPort: 70000 }, { directoryUrl: 'http://ca.example.test/dir' }]) {
      await expect(f.issue(params)).rejects.toMatchObject({ code: 'bad-request' });
    }
    await expect(f.methods['tls.acme.issue']!({ names: NAMES, agreeTos: true })).rejects.toMatchObject({ code: 'refused' });
    expect(f.fake.requests).toEqual([]);
    f.hub.close();
  });

  it('conflicts when a next pin is already staged, without contacting the CA', async () => {
    const f = await fixture();
    await f.issue();
    const requests = f.fake.requests.length;
    await expect(f.issue()).rejects.toMatchObject({ code: 'conflict' });
    expect(f.fake.requests.length).toBe(requests);
    f.hub.close();
  });

  it('explains a busy port 80, audits the failure and leaves config and pins untouched', async () => {
    const f = await fixture();
    f.state.failStart = true;
    const refused = await f.issue().catch((e: unknown) => e as { code: string; message: string });
    expect(refused).toMatchObject({ code: 'unavailable' });
    expect((refused as unknown as Error).message).toMatch(/port 80 must be reachable from the Internet/i);
    expect(f.fake.requests).toEqual([]);
    expect(f.rotation.status().next).toBeNull();
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.names).toEqual([]);
    const failed = listAudit(f.db, { limit: 5 }).find((e) => e.event === 'tls.acme-failed');
    expect(failed?.outcome).toBe('failure');
    expect(failed?.detail).toMatchObject({ problem: 'dude:port-unavailable', names: NAMES });
    f.hub.close();
  });

  it('surfaces a CA refusal with its problem type and records it in the status read model', async () => {
    const f = await fixture();
    f.fake.rejectChallenges = true;
    await expect(f.issue()).rejects.toMatchObject({ code: 'failed' });
    expect(f.rotation.status().next).toBeNull();
    const status = f.methods['tls.acme.status']!({}) as Record<string, any>;
    expect(status.configured).toBe(true);
    expect(status.accountRegistered).toBe(true);
    expect(status.lastFailure).toMatchObject({ problem: 'urn:ietf:params:acme:error:unauthorized' });
    expect(status.activeSource).toBe('self-signed');
    f.hub.close();
  });

  it('reports status: unconfigured, then configured with the active acme certificate and renewal window', async () => {
    const f = await fixture();
    expect(f.methods['tls.acme.status']!({})).toMatchObject({ configured: false, directoryHost: null, accountRegistered: false, nextRenewalWindow: null });
    await f.issue();
    const preview = f.rotation.previewActivate();
    f.rotation.applyActivate({ confirmToken: preview.confirmToken });
    const status = f.methods['tls.acme.status']!({}) as Record<string, any>;
    expect(status).toMatchObject({ configured: true, activeSource: 'acme', accountRegistered: true, lastFailure: null });
    expect(Date.parse(status.nextRenewalWindow)).toBe(Date.parse(status.notAfter) - 30 * DAY);
    f.hub.close();
  });
});

describe('HSTS', () => {
  it('is sent for an active acme certificate and not for a self-signed one', async () => {
    const f = await fixture();
    const hsts = createHstsPolicy({ db: f.db, tlsDir: f.paths.tlsDir, proxy: false });
    expect(hsts()).toBe(false);
    f.db.prepare("UPDATE tls_pins SET source = 'acme' WHERE state = 'active'").run();
    expect(createHstsPolicy({ db: f.db, tlsDir: f.paths.tlsDir, proxy: false })()).toBe(true);
    f.hub.close();
  });
});

describe('ACME renewal', () => {
  /** Issues, activates and returns a renewal job whose clock the test controls. */
  async function activeAcme() {
    const f = await fixture();
    await f.issue();
    const preview = f.rotation.previewActivate();
    f.rotation.applyActivate({ confirmToken: preview.confirmToken });
    const t0 = Date.now();
    let clock = t0;
    const applied: Array<{ key: string; cert: string }> = [];
    const recorded: string[] = [];
    const audits: Array<{ event: string; outcome: string; detail: Record<string, unknown> }> = [];
    const renewal = createAcmeRenewal({
      db: f.db, tlsDir: f.paths.tlsDir, configFile: f.paths.configFile, protector: f.protector, now: () => clock, listenerFactory: f.listenerFactory,
      applySecureContext: (c) => void applied.push(c), recordCertificate: (pem) => void recorded.push(pem),
      audit: (event, outcome, detail) => void audits.push({ event, outcome, detail }),
    });
    return { ...f, t0, applied, recorded, audits, renewal, at: (ms: number) => { clock = ms; } };
  }
  const certFile = (dir: string) => path.join(dir, 'cert.pem');

  it('re-orders with the SAME key within 30 days: same SPKI, atomic replace, one hot swap, tls.renewed with source acme', async () => {
    const r = await activeAcme();
    const before = readFileSync(certFile(r.paths.tlsDir), 'utf8');
    const spki = spkiSha256(before);
    expect(await r.renewal.runOnce()).toEqual({ renewed: false, reason: 'not-due' });
    expect(r.fake.finalizedNames).toHaveLength(1);

    r.at(r.t0 + 70 * DAY);
    const result = await r.renewal.runOnce();
    expect(result).toMatchObject({ renewed: true, spkiSha256: spki });
    const after = readFileSync(certFile(r.paths.tlsDir), 'utf8');
    expect(after).not.toBe(before);
    expect(spkiSha256(after)).toBe(spki);
    expect(after.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
    expect(r.applied).toHaveLength(1);
    expect(r.applied[0]!.cert).toBe(after);
    expect(r.recorded).toHaveLength(1);
    expect(r.recorded[0]!.match(/BEGIN CERTIFICATE/g)).toHaveLength(1);
    expect(r.audits).toEqual([{ event: 'tls.renewed', outcome: 'success', detail: { notAfter: expect.any(String), spki, source: 'acme' } }]);
    expect(r.fake.finalizedNames[1]).toEqual(NAMES);
    expect(r.fake.accounts.size).toBe(1);
    r.hub.close();
  });

  it('skips when the active certificate is not acme-sourced', async () => {
    const r = await activeAcme();
    r.at(r.t0 + 70 * DAY);
    r.db.prepare("UPDATE tls_pins SET source = 'imported' WHERE state = 'active'").run();
    expect(await r.renewal.runOnce()).toEqual({ renewed: false, reason: 'not-acme' });
    expect(r.fake.finalizedNames).toHaveLength(1);
    expect(r.audits).toEqual([]);
    r.hub.close();
  });

  it('backs off 6 hours after a failure and never touches the active certificate', async () => {
    const r = await activeAcme();
    const before = readFileSync(certFile(r.paths.tlsDir), 'utf8');
    r.fake.rejectChallenges = true;
    r.at(r.t0 + 70 * DAY);
    expect(await r.renewal.runOnce()).toMatchObject({ renewed: false, reason: 'failed', problem: 'urn:ietf:params:acme:error:unauthorized' });
    expect(readFileSync(certFile(r.paths.tlsDir), 'utf8')).toBe(before);
    expect(r.applied).toEqual([]);
    expect(r.audits).toHaveLength(1);
    expect(r.audits[0]).toMatchObject({ event: 'tls.acme-failed', outcome: 'failure', detail: { problem: 'urn:ietf:params:acme:error:unauthorized', renewal: true } });
    expect(getMeta(r.db, ACME_LAST_ATTEMPT_META)).toBe(String(r.t0 + 70 * DAY));

    const requests = r.fake.requests.length;
    r.at(r.t0 + 70 * DAY + 5 * 3600_000);
    expect(await r.renewal.runOnce()).toEqual({ renewed: false, reason: 'backoff' });
    expect(r.fake.requests.length).toBe(requests);

    r.fake.rejectChallenges = false;
    r.at(r.t0 + 70 * DAY + 7 * 3600_000);
    expect(await r.renewal.runOnce()).toMatchObject({ renewed: true });
    expect(r.applied).toHaveLength(1);
    r.hub.close();
  });

  it('start() is isolated: a failing run does not throw, and stop() clears the timer', async () => {
    const r = await activeAcme();
    r.at(r.t0 + 70 * DAY);
    r.fake.rejectChallenges = true;
    r.renewal.start();
    r.renewal.start();
    await new Promise((resolve) => setTimeout(resolve, 300));
    r.renewal.stop();
    expect(r.audits.some((a) => a.event === 'tls.acme-failed')).toBe(true);
    r.hub.close();
  });
});

describe('issueAcmeCertificate options', () => {
  it('works without a config file (no names or acme block written)', async () => {
    const f = await fixture();
    const audits: string[] = [];
    const result = await issueAcmeCertificate({
      names: NAMES, directoryUrl: f.fake.directoryUrl, agreeTos: true, httpPort: 80, tlsDir: f.paths.tlsDir, rotation: f.rotation, protector: f.protector,
      audit: (event) => void audits.push(event), listenerFactory: f.listenerFactory,
    });
    expect(result.names).toEqual(NAMES);
    expect(audits).toEqual(['tls.acme-issued']);
    expect(loadOrCreateHubConfig(f.paths.configFile).exposure.acme).toBeUndefined();
    f.hub.close();
  });
});

describe('config and CLI', () => {
  it('validates the exposure.acme block strictly', () => {
    expect(parseHubConfig({ exposure: { acme: { directoryUrl: 'https://acme.example/dir', httpPort: 8080, email: 'a@b.co', termsAgreedAt: '2026-10-04T00:00:00Z' } } }).exposure.acme).toMatchObject({ httpPort: 8080 });
    expect(parseHubConfig({ exposure: { acme: { directoryUrl: 'http://127.0.0.1:14000/dir' } } }).exposure.acme?.directoryUrl).toBe('http://127.0.0.1:14000/dir');
    for (const acme of [{ directoryUrl: 'http://ca.example/dir' }, { directoryUrl: 'ftp://x' }, {}, { directoryUrl: 'https://a.example/d', httpPort: 0 }, { directoryUrl: 'https://a.example/d', httpPort: 70000 },
      { directoryUrl: 'https://a.example/d', email: 'bad' }, { directoryUrl: 'https://a.example/d', extra: 1 }, { directoryUrl: 'https://a.example/d', termsAgreedAt: 'yesterday' }, 'x']) {
      expect(() => parseHubConfig({ exposure: { acme } })).toThrow(/acme/i);
    }
    expect(parseHubConfig({}).exposure.acme).toBeUndefined();
  });

  it('parses tls acme issue and status', () => {
    expect(parseArgs(['tls', 'acme', 'issue', '--name', 'a.example.org', '--name=b.example.org', '--email', 'x@y.zz', '--agree-tos', '--staging', '--http-port', '8080', '--data-dir', 'd'])).toEqual({
      command: 'tls-acme', action: 'issue', names: ['a.example.org', 'b.example.org'], email: 'x@y.zz', agreeTos: true, staging: true, httpPort: 8080, dataDir: 'd',
    });
    expect(parseArgs(['tls', 'acme', 'issue', '--name', 'a.example.org', '--directory', 'https://ca.example/dir'])).toMatchObject({ directory: 'https://ca.example/dir' });
    expect(parseArgs(['tls', 'acme', 'status', '--data-dir', 'd'])).toEqual({ command: 'tls-acme', action: 'status', dataDir: 'd' });
    expect(() => parseArgs(['tls', 'acme', 'issue'])).toThrow(/Usage/);
    expect(() => parseArgs(['tls', 'acme', 'issue', '--name', 'a.example.org', '--staging', '--directory', 'https://x.example'])).toThrow(/either/);
    expect(() => parseArgs(['tls', 'acme', 'issue', '--name', 'a.example.org', '--http-port', '0'])).toThrow(/http-port/);
    expect(() => parseArgs(['tls', 'acme', 'issue', '--name', 'a.example.org', '--bogus'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['tls', 'acme', 'status', '--staging'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['tls', 'acme', 'nope'])).toThrow(/Usage/);
    expect(HELP_TEXT).toMatch(/tls acme issue --name/);
    expect(HELP_TEXT).toMatch(/tls acme status/);
  });

  it('runTlsAcme maps --staging, defaults to production only when unconfigured, and prints the next steps', async () => {
    const calls: Array<{ method: string; params: any }> = [];
    let configured = false;
    const out: string[] = [];
    const err: string[] = [];
    const deps = {
      platform: 'linux' as const, stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t),
      call: async (_dir: string, method: string, params: unknown) => {
        calls.push({ method, params });
        if (method === 'tls.acme.status') return { configured };
        if (method === 'tls.acme.issue') return { source: 'acme' };
        return { ok: true };
      },
    };
    expect(await runTlsAcme({ action: 'issue', names: ['a.example.org'], staging: true, agreeTos: true, dataDir: 'x' }, deps)).toBe(0);
    expect(calls.find((c) => c.method === 'tls.acme.issue')!.params).toEqual({ names: ['a.example.org'], directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory', agreeTos: true });
    expect(err.join('')).toMatch(/tls activate/);
    expect(err.join('')).toMatch(/port 80/);
    calls.length = 0;
    expect(await runTlsAcme({ action: 'issue', names: ['a.example.org'], dataDir: 'x' }, deps)).toBe(0);
    expect(calls.find((c) => c.method === 'tls.acme.issue')!.params.directoryUrl).toBe('https://acme-v02.api.letsencrypt.org/directory');
    configured = true;
    calls.length = 0;
    expect(await runTlsAcme({ action: 'issue', names: ['a.example.org'], dataDir: 'x' }, deps)).toBe(0);
    expect(calls.find((c) => c.method === 'tls.acme.issue')!.params).not.toHaveProperty('directoryUrl');
    expect(await runTlsAcme({ action: 'status', dataDir: 'x' }, deps)).toBe(0);
    expect(JSON.parse(out.join('').split('\n}\n')[out.join('').split('\n}\n').length - 2]! + '\n}')).toEqual({ configured: true });
  });
});

describe('ACME key-use import boundary', () => {
  it('only acme-issue imports the account key; only the admin methods and the renewal job import acme-issue/acme-renewal', () => {
    const root = path.join(__dirname, '..', '..');
    const importers = (pattern: RegExp): string[] => {
      const found: string[] = [];
      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walk(full);
          else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && pattern.test(readFileSync(full, 'utf8'))) found.push(path.relative(root, full).replace(/\\/g, '/'));
        }
      };
      walk(root);
      return found.sort();
    };
    expect(importers(/account-key\.js'/)).toEqual(['tls/acme/acme-issue.ts', 'admin/methods.ts'].sort());
    expect(importers(/acme-issue\.js'/)).toEqual(['admin/methods.ts', 'tls/acme/acme-renewal.ts'].sort());
    expect(importers(/acme-renewal\.js'/)).toEqual(['admin/methods.ts', 'cli/run.ts']);
  });
});
