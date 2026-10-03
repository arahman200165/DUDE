import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAdminMethods } from '../admin/methods.js';
import { parseArgs } from '../cli/args.js';
import { hubPaths } from '../config/data-dir.js';
import { parseHubConfig } from '../config/hub-config.js';
import { openHubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { fixture } from '../service/test-helpers.js';
import { runTlsNames } from '../service/tls-names.js';
import { certificateSubjectAltNames, computeSubjectAltNames, missingSubjectAltNames } from './names.js';
import type { NetworkInterfaces } from './names.js';
import { createTlsRotation } from './rotation.js';
import { ensureTlsIdentity } from './identity.js';
import { generateSelfSigned } from './self-signed.js';

const iface = (address: string, family: 'IPv4' | 'IPv6', internal = false) => ({ address, family, internal, netmask: '', mac: '', cidr: null });
const interfaces = {
  Loopback: [iface('127.0.0.1', 'IPv4', true), iface('::1', 'IPv6', true)],
  Ethernet: [iface('192.168.1.20', 'IPv4'), iface('fe80::1ff:fe23:4567:890a%eth0', 'IPv6'), iface('2001:db8::20', 'IPv6')],
  Empty: undefined,
} as unknown as NetworkInterfaces;

const config = (bind: 'loopback' | 'lan' | 'container', names: string[] = []) => parseHubConfig({ bind, exposure: { names } });

describe('computeSubjectAltNames', () => {
  it('loopback mode: built-ins plus configured names (host part only), no interface addresses', () => {
    const sans = computeSubjectAltNames(config('loopback', ['Hub.Example.com', 'hub.example.com:8443', '10.1.1.1', '2001:DB8::5']), interfaces);
    expect(sans).toEqual(expect.arrayContaining(['localhost', '127.0.0.1', '::1', 'hub.example.com', '10.1.1.1', '2001:db8::5']));
    expect(sans.filter((s) => s === 'hub.example.com')).toHaveLength(1);
    expect(sans.some((s) => s.includes(':8443'))).toBe(false);
    expect(sans).not.toContain('192.168.1.20');
  });

  it('lan and container mode add non-internal IPv4 and global IPv6, skipping internal and link-local', () => {
    for (const bind of ['lan', 'container'] as const) {
      const sans = computeSubjectAltNames(config(bind), interfaces);
      expect(sans).toEqual(expect.arrayContaining(['192.168.1.20', '2001:db8::20']));
      expect(sans.some((s) => s.toLowerCase().startsWith('fe80'))).toBe(false);
      expect(sans.filter((s) => s === '127.0.0.1')).toHaveLength(1);
    }
  });

  it('compares certificate names canonically and reports the missing ones', () => {
    const { certPem } = generateSelfSigned({ hubInstanceId: 'abcdef12-0000', extraNames: ['hub.example.com', '2001:db8::20', '10.0.0.9'] });
    expect(certificateSubjectAltNames(certPem)).toEqual(expect.arrayContaining(['hub.example.com', '2001:db8::20', '10.0.0.9', '::1']));
    expect(missingSubjectAltNames(certPem, ['hub.example.com', '2001:DB8:0:0:0:0:0:20', 'other.example', '10.0.0.10'])).toEqual(['other.example', '10.0.0.10']);
  });
});

function adminFixture(names: string[] = []) {
  const root = tempDir('hub-names-');
  const paths = hubPaths(root);
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error('db');
  mkdirSync(paths.configDir, { recursive: true });
  mkdirSync(paths.tlsDir, { recursive: true });
  writeFileSync(paths.configFile, JSON.stringify({ port: 4711, bind: 'loopback', ...(names.length ? { exposure: { names } } : {}) }));
  const tls = ensureTlsIdentity(paths.tlsDir, { hubInstanceId: opened.hub.hubInstanceId });
  const seen: string[][] = [];
  const rotation = createTlsRotation({ db: opened.hub.db, tlsDir: paths.tlsDir, hubInstanceId: opened.hub.hubInstanceId });
  const methods = buildAdminMethods({
    db: opened.hub.db, hubVersion: 't', hubInstanceId: opened.hub.hubInstanceId, bind: 'loopback', getPort: () => 4711, startedAt: 0,
    configDir: paths.configDir, configFile: paths.configFile, tlsDir: paths.tlsDir, spkiSha256: tls.spkiSha256, tls: rotation, onNamesChanged: (n) => void seen.push([...n]),
  });
  return { methods, paths, hub: opened.hub, rotation, seen };
}

const reject = (run: () => unknown) => expect(Promise.resolve().then(run)).rejects;

describe('rotation staging with custom names', () => {
  it('stage({ extraNames }) issues a certificate that carries them', () => {
    const f = adminFixture();
    f.rotation.stage({ extraNames: ['hub.example.com', '10.9.8.7'] });
    const next = new X509Certificate(readFileSync(path.join(f.paths.tlsDir, 'next-cert.pem'), 'utf8'));
    expect(next.subjectAltName).toContain('DNS:hub.example.com');
    expect(next.subjectAltName).toContain('IP Address:10.9.8.7');
    expect(next.subjectAltName).toContain('DNS:localhost');
    f.hub.close();
  });
});

describe('tls.names.set', () => {
  it('adds a name: writes the config, audits the list only, stages a certificate and updates the guard', async () => {
    const f = adminFixture();
    const result = (await f.methods['tls.names.set']!({ add: 'Hub.Example.com:8443' })) as { names: string[]; staged: { spkiSha256: string } | null; subjectAltNames: string[] };
    expect(result.names).toEqual(['hub.example.com:8443']);
    expect(result.staged?.spkiSha256).toBeTruthy();
    expect(result.subjectAltNames).toContain('hub.example.com');
    expect(JSON.parse(readFileSync(f.paths.configFile, 'utf8')).exposure).toEqual({ mode: 'private', names: ['hub.example.com:8443'] });
    expect(f.seen).toEqual([['hub.example.com:8443']]);
    const next = new X509Certificate(readFileSync(path.join(f.paths.tlsDir, 'next-cert.pem'), 'utf8'));
    expect(next.subjectAltName).toContain('DNS:hub.example.com');
    const rows = f.hub.db.prepare("SELECT actor_kind, detail_json AS detail FROM audit_events WHERE event = 'tls.names-changed'").all() as Array<{ actor_kind: string; detail: string }>;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.detail)).toEqual({ names: ['hub.example.com:8443'] });
    f.hub.close();
  });

  it('refuses while a next certificate is staged and leaves the config untouched', async () => {
    const f = adminFixture();
    await f.methods['tls.names.set']!({ add: 'a.example' });
    await reject(() => f.methods['tls.names.set']!({ add: 'b.example' })).toMatchObject({ code: 'conflict' });
    expect(JSON.parse(readFileSync(f.paths.configFile, 'utf8')).exposure.names).toEqual(['a.example']);
    f.hub.close();
  });

  it('removes a name, rejects bad input and unknown names', async () => {
    const f = adminFixture(['a.example', 'b.example']);
    await reject(() => f.methods['tls.names.set']!({ add: '*.example' })).toMatchObject({ code: 'bad-request' });
    await reject(() => f.methods['tls.names.set']!({ remove: 'zzz.example' })).toMatchObject({ code: 'bad-request' });
    await reject(() => f.methods['tls.names.set']!({})).toMatchObject({ code: 'bad-request' });
    const result = (await f.methods['tls.names.set']!({ remove: 'a.example' })) as { names: string[]; changed: boolean };
    expect(result).toMatchObject({ names: ['b.example'], changed: true });
    expect(f.seen).toEqual([['b.example']]);
    f.hub.close();
  });

  it('adding an already-configured name restages only when the active certificate lacks it', async () => {
    const f = adminFixture(['a.example']);
    const stale = (await f.methods['tls.names.set']!({ add: 'a.example' })) as { changed: boolean; staged: unknown };
    expect(stale.changed).toBe(false);
    expect(stale.staged).not.toBeNull();
    expect(f.seen).toEqual([]);
    f.hub.close();
    const ok = adminFixture(['localhost']);
    const none = (await ok.methods['tls.names.set']!({ add: 'localhost' })) as { changed: boolean; staged: unknown };
    expect(none).toMatchObject({ changed: false, staged: null }); // already configured and already covered
    ok.hub.close();
  });

  it('tls.stage (plain rotate) also carries the configured names', async () => {
    const f = adminFixture(['rot.example']);
    await f.methods['tls.stage']!({});
    expect(existsSync(path.join(f.paths.tlsDir, 'next-cert.pem'))).toBe(true);
    expect(new X509Certificate(readFileSync(path.join(f.paths.tlsDir, 'next-cert.pem'), 'utf8')).subjectAltName).toContain('DNS:rot.example');
    f.hub.close();
  });
});

describe('dude-hub tls names CLI', () => {
  it('parses list, add and remove', () => {
    expect(parseArgs(['tls', 'names', 'list'])).toEqual({ command: 'tls-names', action: 'list' });
    expect(parseArgs(['tls', 'names', 'add', 'hub.example.com', '--data-dir', 'd'])).toEqual({ command: 'tls-names', action: 'add', name: 'hub.example.com', dataDir: 'd' });
    expect(parseArgs(['tls', 'names', 'remove', '10.0.0.1', '--install-dir=i'])).toEqual({ command: 'tls-names', action: 'remove', name: '10.0.0.1', installDir: 'i' });
    expect(() => parseArgs(['tls', 'names'])).toThrow();
    expect(() => parseArgs(['tls', 'names', 'add'])).toThrow();
    expect(() => parseArgs(['tls', 'names', 'add', '--data-dir', 'd'])).toThrow();
    expect(() => parseArgs(['tls', 'names', 'purge', 'x'])).toThrow();
    expect(() => parseArgs(['tls', 'names', 'list', '--nope'])).toThrow();
  });

  it('routes add through the admin channel when the service runs, and needs elevation', async () => {
    const f = fixture({ state: 'running', elevated: true });
    const calls: string[] = [];
    const call = async (_d: string, method: string, params: unknown): Promise<unknown> => {
      calls.push(`${method} ${JSON.stringify(params)}`);
      return method === 'status' ? { bind: 'loopback' } : { names: ['hub.example.com'], staged: { spkiSha256: 'x' }, changed: true };
    };
    expect(await runTlsNames({ action: 'add', name: 'hub.example.com', dataDir: f.dataDir }, { ...f.deps, call })).toBe(0);
    expect(calls).toEqual(['status {}', 'tls.names.set {"add":"hub.example.com"}']);
    expect(f.err.join('')).toContain('dude-hub tls activate');

    const denied = fixture({ state: 'running', elevated: false });
    expect(await runTlsNames({ action: 'add', name: 'a.example', dataDir: denied.dataDir }, denied.deps)).toBe(2);
  });

  it('edits only the config when no Hub is running, and lists configured and missing names', async () => {
    const f = fixture({ state: 'not-installed' });
    expect(await runTlsNames({ action: 'add', name: 'Hub.Example.com', dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(f.err.join('')).toContain('no certificate was staged');
    const paths = hubPaths(f.dataDir);
    expect(JSON.parse(readFileSync(paths.configFile, 'utf8')).exposure.names).toEqual(['hub.example.com']);
    ensureTlsIdentity(paths.tlsDir, { hubInstanceId: 'abcdef12-0000' });
    f.out.length = 0;
    expect(await runTlsNames({ action: 'list', dataDir: f.dataDir }, f.deps)).toBe(0);
    const listed = JSON.parse(f.out.join('')) as { names: string[]; activeSubjectAltNames: string[]; missing: string[] };
    expect(listed.names).toEqual(['hub.example.com']);
    expect(listed.activeSubjectAltNames).toContain('localhost');
    expect(listed.missing).toEqual(['hub.example.com']);
    expect(await runTlsNames({ action: 'remove', name: 'nope.example', dataDir: f.dataDir }, f.deps)).toBe(1);
  });
});
