import { X509Certificate, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import tls from 'node:tls';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAdminMethods } from '../admin/methods.js';
import { parseArgs } from '../cli/args.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { runTlsCa } from '../service/tls-ca.js';
import { createDpapiProtector } from './ca-key-protector.js';
import type { CaKeyProtector } from './ca-key-protector.js';
import { caNameConstraints, describeCertificateSource, localCaExists, localCaStatus, readCaCertPem, rootSha256 } from './ca-public.js';
import { ensureTlsIdentity } from './identity.js';
import { createLeafIssuer } from './leaf-issuer.js';
import { LEAF_VALIDITY_DAYS, createLocalCa, issueLeafFromCa, loadCaKey, validateCaSuffixes } from './local-ca.js';
import { certificateSubjectAltNames } from './names.js';
import { createLeafRenewal } from './renewal.js';
import { createTlsRotation } from './rotation.js';
import { generateSelfSigned, spkiSha256 } from './self-signed.js';
import {
  KEY_USAGE, OID, authorityKeyIdentifierValue, basicConstraintsValue, buildCertificate, certificateExtensions, extension, generalName, keyUsageValue, pemEncode,
  skiFromSpki, skiOfKey,
} from './x509.js';
import { octetString, oid, sequence } from './der-writer.js';

const ID = '0123456789abcdef-test';
const DAY = 86_400_000;

/** A reversible fake: the stored bytes differ from the PEM, and every unprotect is counted. */
function fakeProtector(): CaKeyProtector & { unprotects: number } {
  const state = { unprotects: 0 };
  const protector = {
    kind: 'file' as const,
    keyFile: 'ca-key.fake',
    protect: (plain: Buffer) => Buffer.from(Buffer.from(plain).reverse()),
    unprotect: (blob: Buffer) => { state.unprotects++; return Buffer.from(Buffer.from(blob).reverse()); },
    get unprotects() { return state.unprotects; },
  };
  return protector;
}

const newTlsDir = (): string => path.join(tempDir('hub-ca-'), 'tls');
const opensslAvailable = spawnSync('openssl', ['version']).status === 0;

function listen(server: tls.Server): Promise<number> {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)));
}

function handshake(identity: { keyPem: string; certPem: string }, client: tls.ConnectionOptions): Promise<{ ok: true } | { ok: false; code: string | undefined; message: string }> {
  const server = tls.createServer({ key: identity.keyPem, cert: identity.certPem }, (socket) => socket.end());
  return listen(server).then(
    (port) =>
      new Promise((resolve) => {
        const socket = tls.connect({ port, ...client, rejectUnauthorized: true });
        socket.on('secureConnect', () => { socket.end(); server.close(); resolve({ ok: true }); });
        socket.on('error', (error: NodeJS.ErrnoException) => { server.close(); resolve({ ok: false, code: error.code, message: error.message }); });
      }),
  );
}

describe('local CA root', () => {
  const dir = newTlsDir();
  const protector = fakeProtector();
  const ca = createLocalCa({ tlsDir: dir, hubInstanceId: ID, protector, suffixes: ['Corp.Example', 'lab'], configuredNames: ['hub.corp.example', '10.1.2.3'] });
  const root = new X509Certificate(ca.caCertPem);

  it('is a self-issued CA with pathLen 0, critical keyCertSign+cRLSign and a critical name-constraints extension', () => {
    expect(root.ca).toBe(true);
    expect(root.checkIssued(root)).toBe(true);
    expect(root.verify(root.publicKey)).toBe(true);
    expect(root.subject).toMatch(/^CN=DUDE Hub Local CA 01234567 [0-9a-f]{4}$/);
    const exts = new Map(certificateExtensions(root.raw).map((e) => [e.oid, e]));
    expect(exts.get(OID.basicConstraints)).toMatchObject({ critical: true });
    expect([...exts.get(OID.basicConstraints)!.value]).toEqual([0x30, 0x06, 0x01, 0x01, 0xff, 0x02, 0x01, 0x00]);
    expect(exts.get(OID.keyUsage)).toMatchObject({ critical: true });
    expect([...exts.get(OID.keyUsage)!.value]).toEqual([0x03, 0x02, 0x01, 0x06]); // keyCertSign(5) + cRLSign(6), 1 unused bit
    expect(exts.get(OID.nameConstraints)).toMatchObject({ critical: true });
    expect(exts.get(OID.subjectKeyIdentifier)!.value.subarray(2)).toEqual(skiOfKey(root.publicKey));
    // ten years
    expect(new Date(root.validTo).getTime() - Date.now()).toBeGreaterThan(3640 * DAY);
  });

  it('permits only the fixed private names plus the OS host name, suffixes and configured DNS names (computed once)', () => {
    const nc = caNameConstraints(ca.caCertPem);
    expect(nc.permittedDns.sort()).toEqual(['corp.example', 'hub.corp.example', 'home.arpa', 'internal', 'lab', 'lan', 'local', 'localhost', os.hostname().toLowerCase()].sort());
    expect(nc.permittedIps.map((s) => `${s.address}/${s.prefix}`)).toEqual([
      '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '::1/128', 'fc00::/7', 'fe80::/10',
    ]);
    expect(nc.excludedCount).toBe(0);
  });

  it.skipIf(!opensslAvailable)('is accepted by OpenSSL, which reports the constraints as critical', () => {
    const run = spawnSync('openssl', ['x509', '-noout', '-text'], { input: ca.caCertPem, encoding: 'utf8' });
    const text = run.stdout.toLowerCase(); // the openssl flavour on PATH varies in case and IPv6 spelling
    expect(run.status).toBe(0);
    expect(text).toMatch(/name constraints:? ?(x509v3 )?(\(?critical\)?)?/);
    expect(text).toContain('critical');
    expect(text).toContain('home.arpa');
    expect(text).toContain('10.0.0.0/255.0.0.0');
    expect(text).toMatch(/fc00:(:|0:0:0:0:0:0:0)\/fe00:/);
    expect(text).toMatch(/ca:true/);
  });

  it('stores the key only through the protector (not as PEM) and exposes the public root only', () => {
    const stored = readFileSync(path.join(dir, 'ca', 'ca-key.fake'), 'utf8');
    expect(stored).not.toContain('BEGIN PRIVATE KEY');
    expect(loadCaKey(dir, protector).type).toBe('private');
    expect(readdirSync(path.join(dir, 'ca')).sort()).toEqual(['ca-cert.pem', 'ca-key.fake']);
    expect(readCaCertPem(dir)).toBe(ca.caCertPem);
    expect(() => createLocalCa({ tlsDir: dir, hubInstanceId: ID, protector })).toThrow(/already exists/);
  });

  it('writes the key with mode 0600 (POSIX)', () => {
    if (process.platform === 'win32') return;
    expect(statSync(path.join(dir, 'ca', 'ca-key.fake')).mode & 0o777).toBe(0o600);
  });
});

describe('suffix validation', () => {
  it('lowercases, de-duplicates and rejects bad syntax and more than eight', () => {
    expect(validateCaSuffixes(['Corp.Example', 'corp.example.', 'lab'])).toEqual(['corp.example', 'lab']);
    for (const bad of ['', '-a.com', 'a..b', 'a b', '*.x', '10.0.0.1', `${'a'.repeat(64)}.com`, '_x.com']) expect(() => validateCaSuffixes([bad])).toThrow(/valid DNS suffix/);
    expect(() => validateCaSuffixes(Array.from({ length: 9 }, (_, i) => `s${i}.example`))).toThrow(/At most 8/);
  });
});

describe('CA-issued leaf', () => {
  const dir = newTlsDir();
  const protector = fakeProtector();
  const ca = createLocalCa({ tlsDir: dir, hubInstanceId: ID, protector });
  const root = new X509Certificate(ca.caCertPem);
  const now = new Date();
  const leafIssued = issueLeafFromCa({ caCertPem: ca.caCertPem, caKey: ca.caKey, hubInstanceId: ID, names: ['localhost', '127.0.0.1', '::1', 'my.lan', '192.168.4.5', '2001:db8::1'], now });
  const leaf = new X509Certificate(leafIssued.certPem);

  it('is signed by the root with AKI = root SKI, leaf constraints and the requested SANs', () => {
    expect(leaf.checkIssued(root)).toBe(true);
    expect(leaf.verify(root.publicKey)).toBe(true);
    expect(leaf.ca).toBe(false);
    const exts = new Map(certificateExtensions(leaf.raw).map((e) => [e.oid, e]));
    expect(exts.get(OID.basicConstraints)).toMatchObject({ critical: true });
    expect(exts.get(OID.keyUsage)).toMatchObject({ critical: true });
    expect([...exts.get(OID.keyUsage)!.value]).toEqual([0x03, 0x02, 0x07, 0x80]); // digitalSignature only
    expect(leaf.keyUsage).toEqual(['1.3.6.1.5.5.7.3.1']); // EKU serverAuth
    const aki = exts.get(OID.authorityKeyIdentifier)!;
    expect(aki.critical).toBe(false);
    expect(aki.value.subarray(4)).toEqual(skiOfKey(root.publicKey));
    expect(exts.get(OID.subjectKeyIdentifier)!.value.subarray(2)).toEqual(skiOfKey(leaf.publicKey));
    expect(certificateSubjectAltNames(leafIssued.certPem)).toEqual(['localhost', '127.0.0.1', '::1', 'my.lan', '192.168.4.5']);
    expect(leafIssued.skippedNames).toEqual(['2001:db8::1']); // global IPv6 is outside the CA constraints, so it is left out
    expect(leaf.subject).toMatch(/^CN=DUDE Hub 01234567 [0-9a-f]{8}$/);
  });

  it('is valid for 397 days', () => {
    const days = (new Date(leaf.validTo).getTime() - now.getTime()) / DAY;
    expect(days).toBeGreaterThan(396.99);
    expect(days).toBeLessThanOrEqual(LEAF_VALIDITY_DAYS);
  });

  it('refuses a configured DNS name outside the name constraints', () => {
    expect(() => issueLeafFromCa({ caCertPem: ca.caCertPem, caKey: ca.caKey, hubInstanceId: ID, names: ['example.com'] })).toThrow(/outside the local CA's name constraints/);
  });

  it('completes a real TLS handshake by DNS name and by IP address with only the root trusted', async () => {
    const byName = await handshake(leafIssued, { ca: [ca.caCertPem], servername: 'localhost', host: '127.0.0.1' });
    expect(byName).toEqual({ ok: true });
    const byIp = await handshake(leafIssued, { ca: [ca.caCertPem], host: '127.0.0.1' });
    expect(byIp).toEqual({ ok: true });
  });

  it('is not trusted without the root', async () => {
    const result = await handshake(leafIssued, { servername: 'localhost', host: '127.0.0.1' });
    expect(result.ok).toBe(false);
  });

  it('OpenSSL enforces the name constraints: a leaf for example.com signed by the CA fails the handshake', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const spki = publicKey.export({ type: 'spki', format: 'der' });
    const ski = skiFromSpki(spki);
    const der = buildCertificate({
      subjectCn: 'rogue', issuerCn: root.subject.replace(/^CN=/, ''), spki, notBefore: new Date(Date.now() - 3600_000), notAfter: new Date(Date.now() + 30 * DAY), signerKey: ca.caKey,
      extensions: [
        extension(OID.basicConstraints, true, basicConstraintsValue(false)),
        extension(OID.keyUsage, true, keyUsageValue([KEY_USAGE.digitalSignature])),
        extension(OID.extKeyUsage, false, sequence(oid(OID.serverAuth))),
        extension(OID.subjectAltName, false, sequence(generalName('example.com'))),
        extension(OID.subjectKeyIdentifier, false, octetString(ski)),
        extension(OID.authorityKeyIdentifier, false, authorityKeyIdentifierValue(skiOfKey(root.publicKey))),
      ],
    });
    const rogue = { keyPem: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), certPem: pemEncode('CERTIFICATE', der) };
    expect(new X509Certificate(rogue.certPem).verify(root.publicKey)).toBe(true); // validly signed...
    const result = await handshake(rogue, { ca: [ca.caCertPem], servername: 'example.com', host: '127.0.0.1' });
    // ...yet rejected: OpenSSL's X509_V_ERR_PERMITTED_VIOLATION reaches Node as code UNSPECIFIED, message "permitted subtree violation".
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) {
      expect(`${result.code} ${result.message}`).toMatch(/permitted subtree violation/i);
      process.stdout.write(`name-constraint violation reported by Node: code=${result.code} message=${result.message}\n`);
    }
  });

  it('describes the certificate source from the issuer, never from a flag', () => {
    expect(describeCertificateSource(dir, leafIssued.certPem)).toEqual({ source: 'local-ca', caCertPem: ca.caCertPem });
    expect(describeCertificateSource(dir, generateSelfSigned({ hubInstanceId: ID }).certPem)).toEqual({ source: 'self-signed', caCertPem: ca.caCertPem });
    expect(describeCertificateSource(newTlsDir(), leafIssued.certPem)).toEqual({ source: 'self-signed', caCertPem: null });
  });
});

describe('ensureTlsIdentity and the leaf issuer', () => {
  it('creates the CA and a CA-issued leaf on an empty directory, then reuses both', () => {
    const dir = newTlsDir();
    const protector = fakeProtector();
    const first = ensureTlsIdentity(dir, { hubInstanceId: ID, extraNames: ['hub.local'], localCa: { protector, configuredNames: ['hub.local'] } });
    expect(localCaExists(dir)).toBe(true);
    expect(protector.unprotects).toBe(0); // the fresh key stays in memory
    const root = new X509Certificate(readCaCertPem(dir)!);
    const leaf = new X509Certificate(first.certPem);
    expect(leaf.checkIssued(root)).toBe(true);
    expect(leaf.verify(root.publicKey)).toBe(true);
    expect(certificateSubjectAltNames(first.certPem)).toContain('hub.local');
    expect(first.spkiSha256).toBe(spkiSha256(first.certPem));
    const again = ensureTlsIdentity(dir, { hubInstanceId: ID, localCa: { protector } });
    expect(again.certPem).toBe(first.certPem);
  });

  it('stays self-signed without a localCa option, and the issuer follows the CA directory', () => {
    const dir = newTlsDir();
    const plain = ensureTlsIdentity(dir, { hubInstanceId: ID });
    expect(localCaExists(dir)).toBe(false);
    expect(new X509Certificate(plain.certPem).checkIssued(new X509Certificate(plain.certPem))).toBe(true);
    const protector = fakeProtector();
    expect(createLeafIssuer(dir, protector).source).toBe('self-signed');
    createLocalCa({ tlsDir: dir, hubInstanceId: ID, protector });
    expect(createLeafIssuer(dir, protector).source).toBe('local-ca');
    expect(createLeafIssuer(dir).source).toBe('self-signed'); // no protector, no CA issuance
  });
});

describe('leaf renewal', () => {
  const setup = () => {
    const dir = newTlsDir();
    const protector = fakeProtector();
    const t0 = Date.now();
    const identity = ensureTlsIdentity(dir, { hubInstanceId: ID, now: new Date(t0), localCa: { protector } });
    const applied: Array<{ key: string; cert: string }> = [];
    const audits: Array<{ event: string; detail: Record<string, unknown> }> = [];
    const recorded: string[] = [];
    let clock = t0;
    const renewal = createLeafRenewal({
      tlsDir: dir, hubInstanceId: ID, protector, now: () => clock,
      applySecureContext: (context) => void applied.push(context),
      audit: (event, detail) => void audits.push({ event, detail }),
      recordCertificate: (certPem) => void recorded.push(certPem),
    });
    return { dir, protector, identity, t0, applied, audits, recorded, renewal, at: (ms: number) => { clock = ms; } };
  };

  it('re-issues with the SAME key 20 days before expiry: same SPKI, later notAfter, one hot swap, one audit', () => {
    const s = setup();
    const before = new X509Certificate(s.identity.certPem);
    s.at(new Date(before.validTo).getTime() - 20 * DAY);
    const result = s.renewal.runOnce();
    expect(result.renewed).toBe(true);
    const after = new X509Certificate(readFileSync(path.join(s.dir, 'cert.pem'), 'utf8'));
    expect(spkiSha256(after)).toBe(s.identity.spkiSha256);
    expect(readFileSync(path.join(s.dir, 'key.pem'), 'utf8')).toBe(s.identity.keyPem);
    expect(new Date(after.validTo).getTime()).toBeGreaterThan(new Date(before.validTo).getTime());
    expect(after.verify(new X509Certificate(readCaCertPem(s.dir)!).publicKey)).toBe(true);
    expect(certificateSubjectAltNames(after.toString())).toEqual(certificateSubjectAltNames(s.identity.certPem));
    expect(s.applied).toHaveLength(1);
    expect(s.applied[0]).toMatchObject({ key: s.identity.keyPem, cert: after.toString() });
    expect(s.recorded).toEqual([after.toString()]);
    expect(s.audits).toEqual([{ event: 'tls.renewed', detail: { notAfter: new Date(after.validTo).toISOString(), spki: s.identity.spkiSha256 } }]);
    expect(readdirSync(s.dir).some((f) => f.includes('tmp'))).toBe(false);
    // The renewed certificate is now fresh, so a second run is a no-op.
    expect(s.renewal.runOnce().renewed).toBe(false);
    expect(s.applied).toHaveLength(1);
  });

  it('does nothing 60 days before expiry and does not unprotect the CA key', () => {
    const s = setup();
    s.at(new Date(new X509Certificate(s.identity.certPem).validTo).getTime() - 60 * DAY);
    expect(s.renewal.runOnce()).toEqual({ renewed: false });
    expect(s.applied).toHaveLength(0);
    expect(s.audits).toHaveLength(0);
    expect(s.protector.unprotects).toBe(0);
  });

  it('never touches a self-signed active certificate, even with a CA present', () => {
    const dir = newTlsDir();
    const protector = fakeProtector();
    const plain = ensureTlsIdentity(dir, { hubInstanceId: ID });
    createLocalCa({ tlsDir: dir, hubInstanceId: ID, protector });
    const applied: unknown[] = [];
    const renewal = createLeafRenewal({ tlsDir: dir, hubInstanceId: ID, protector, now: () => Date.now() + 9999 * DAY, applySecureContext: (c) => void applied.push(c), audit: () => undefined });
    expect(renewal.runOnce().renewed).toBe(false);
    expect(readFileSync(path.join(dir, 'cert.pem'), 'utf8')).toBe(plain.certPem);
    expect(applied).toHaveLength(0);
    expect(protector.unprotects).toBe(0);
  });

  it('start() runs once immediately and its timer is unref and stoppable', () => {
    const s = setup();
    s.at(new Date(new X509Certificate(s.identity.certPem).validTo).getTime() - 5 * DAY);
    s.renewal.start();
    expect(s.applied).toHaveLength(1);
    s.renewal.stop();
  });
});

describe('rotation and admin commands with a local CA', () => {
  function fixture(names: string[] = []) {
    const root = tempDir('hub-ca-admin-');
    const paths = hubPaths(root);
    const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error('db');
    mkdirSync(paths.configDir, { recursive: true });
    mkdirSync(paths.tlsDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ port: 4711, bind: 'loopback', ...(names.length ? { exposure: { names } } : {}) }));
    const tlsIdentity = ensureTlsIdentity(paths.tlsDir, { hubInstanceId: opened.hub.hubInstanceId });
    const protector = fakeProtector();
    const rotation = createTlsRotation({ db: opened.hub.db, tlsDir: paths.tlsDir, hubInstanceId: opened.hub.hubInstanceId, caProtector: protector });
    // Mirror run.ts: the active pin is the identity's.
    opened.hub.db.prepare("INSERT INTO tls_pins(spki_sha256, cert_pem, key_ref, state, created_at, activated_at) VALUES(?, ?, NULL, 'active', ?, ?)").run(tlsIdentity.spkiSha256, tlsIdentity.certPem, new Date().toISOString(), new Date().toISOString());
    const methods = buildAdminMethods({
      db: opened.hub.db, hubVersion: 't', hubInstanceId: opened.hub.hubInstanceId, bind: 'loopback', getPort: () => 4711, startedAt: 0,
      configDir: paths.configDir, configFile: paths.configFile, tlsDir: paths.tlsDir, spkiSha256: tlsIdentity.spkiSha256, tls: rotation, caProtector: protector,
    });
    return { methods, paths, hub: opened.hub, rotation, protector, active: tlsIdentity };
  }

  it('tls ca init creates the CA, stages a CA-issued leaf with a NEW pin, audits the root fingerprint only, and refuses a second staging', async () => {
    const f = fixture(['hub.corp.example']);
    const result = (await f.methods['tls.ca.init']!({ suffixes: ['corp.example'] })) as { created: boolean; staged: { spkiSha256: string; source: string } };
    expect(result.created).toBe(true);
    expect(result.staged.spkiSha256).not.toBe(f.active.spkiSha256);
    expect(result.staged.source).toBe('local-ca');
    const next = new X509Certificate(readFileSync(path.join(f.paths.tlsDir, 'next-cert.pem'), 'utf8'));
    const root = new X509Certificate(readCaCertPem(f.paths.tlsDir)!);
    expect(next.verify(root.publicKey)).toBe(true);
    expect(f.rotation.status().next?.spkiSha256).toBe(result.staged.spkiSha256);
    expect(f.rotation.status().active?.spkiSha256).toBe(f.active.spkiSha256);
    expect(JSON.stringify(result)).not.toContain('PRIVATE');
    const rows = f.hub.db.prepare("SELECT detail_json AS detail FROM audit_events WHERE event = 'tls.ca-created'").all() as Array<{ detail: string }>;
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]!.detail)).toEqual({ rootSha256: rootSha256(readCaCertPem(f.paths.tlsDir)!) });
    await expect(Promise.resolve().then(() => f.methods['tls.ca.init']!({}))).rejects.toMatchObject({ code: 'conflict' });
    f.hub.close();
  });

  it('rejects bad suffixes before creating anything', async () => {
    const f = fixture();
    await expect(Promise.resolve().then(() => f.methods['tls.ca.init']!({ suffixes: ['not valid'] }))).rejects.toMatchObject({ code: 'bad-request' });
    expect(localCaExists(f.paths.tlsDir)).toBe(false);
    f.hub.close();
  });

  it('tls rotate and tls names add issue from the CA once it exists; a name outside the constraints is refused and the config is kept', async () => {
    const f = fixture();
    await f.methods['tls.ca.init']!({});
    const root = new X509Certificate(readCaCertPem(f.paths.tlsDir)!);
    f.hub.db.prepare("DELETE FROM tls_pins WHERE state = 'next'").run();
    const staged = (await f.methods['tls.stage']!({})) as { source: string; spkiSha256: string };
    expect(staged.source).toBe('local-ca');
    expect(new X509Certificate(readFileSync(path.join(f.paths.tlsDir, 'next-cert.pem'), 'utf8')).verify(root.publicKey)).toBe(true);

    f.hub.db.prepare("DELETE FROM tls_pins WHERE state = 'next'").run();
    const added = (await f.methods['tls.names.set']!({ add: 'hub.lan' })) as { staged: { source: string } | null };
    expect(added.staged?.source).toBe('local-ca');
    expect(new X509Certificate(readFileSync(path.join(f.paths.tlsDir, 'next-cert.pem'), 'utf8')).subjectAltName).toContain('DNS:hub.lan');

    f.hub.db.prepare("DELETE FROM tls_pins WHERE state = 'next'").run();
    await expect(Promise.resolve().then(() => f.methods['tls.names.set']!({ add: 'example.com' }))).rejects.toThrow(/outside the local CA's name constraints/);
    expect(JSON.parse(readFileSync(f.paths.configFile, 'utf8')).exposure.names).toEqual(['hub.lan']);
    f.hub.close();
  });

  it('refuses ca init when the active certificate is already CA-issued', async () => {
    const f = fixture();
    const ca = createLocalCa({ tlsDir: f.paths.tlsDir, hubInstanceId: f.hub.hubInstanceId, protector: f.protector });
    const leaf = issueLeafFromCa({ caCertPem: ca.caCertPem, caKey: ca.caKey, hubInstanceId: f.hub.hubInstanceId, names: ['localhost'] });
    writeFileSync(path.join(f.paths.tlsDir, 'cert.pem'), leaf.certPem);
    await expect(Promise.resolve().then(() => f.methods['tls.ca.init']!({}))).rejects.toMatchObject({ code: 'conflict' });
    f.hub.close();
  });

  it('CLI: init goes over the admin channel, export writes valid DER with the certutil hint, status reports the CA', async () => {
    const f = fixture();
    const out: string[] = [];
    const err: string[] = [];
    const call = async (_dir: string, method: string, params: unknown) => (method === 'status' ? { ok: true } : f.methods[method]!(params));
    const deps = { platform: 'linux' as const, env: { DUDE_HUB_DATA_DIR: f.paths.root }, stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t), call };

    expect(await runTlsCa({ action: 'status' }, deps)).toBe(0);
    expect(out.join('')).toContain('"localCa": false');
    expect(await runTlsCa({ action: 'export' }, deps)).toBe(1);

    expect(await runTlsCa({ action: 'init', suffixes: ['corp.example'] }, deps)).toBe(0);
    expect(err.join('')).toContain('tls activate');
    out.length = 0;
    expect(await runTlsCa({ action: 'status' }, deps)).toBe(0);
    const status = JSON.parse(out.join('')) as ReturnType<typeof localCaStatus>;
    expect(status).toMatchObject({ rootSha256: rootSha256(readCaCertPem(f.paths.tlsDir)!), activeLeafIssuedByCa: false });
    expect(status!.permittedDns).toContain('corp.example');
    expect(status!.permittedIps).toContain('10.0.0.0/8');
    expect(new Date(status!.notAfter).getTime()).toBeGreaterThan(Date.now());
    expect(typeof status!.leafNotAfter).toBe('string');

    out.length = 0;
    const file = path.join(tempDir('hub-export-'), 'root.cer');
    expect(await runTlsCa({ action: 'export', out: file }, deps)).toBe(0);
    const der = readFileSync(file);
    expect(new X509Certificate(der).fingerprint256.replace(/:/g, '').toLowerCase()).toBe(rootSha256(readCaCertPem(f.paths.tlsDir)!));
    expect(out.join('')).toContain(`certutil -user -addstore Root "${file}"`);
    expect(existsSync(path.join(f.paths.tlsDir, 'ca', 'ca-cert.pem'))).toBe(true);

    // a second init is refused while the first is still staged
    expect(await runTlsCa({ action: 'init' }, deps)).toBe(1);
    // no Hub: refused
    const down = { ...deps, call: async () => { throw new Error('no hub'); } };
    expect(await runTlsCa({ action: 'init' }, down)).toBe(2);
    f.hub.close();
  });

  it('parses the CLI: repeatable --suffix, --out and rejects stray flags', () => {
    expect(parseArgs(['tls', 'ca', 'init', '--suffix', 'a.example', '--suffix=b.example', '--data-dir', 'd'])).toEqual({ command: 'tls-ca', action: 'init', suffixes: ['a.example', 'b.example'], dataDir: 'd' });
    expect(parseArgs(['tls', 'ca', 'export', '--out', 'x.cer'])).toEqual({ command: 'tls-ca', action: 'export', out: 'x.cer' });
    expect(parseArgs(['tls', 'ca', 'status'])).toEqual({ command: 'tls-ca', action: 'status' });
    expect(() => parseArgs(['tls', 'ca', 'status', '--suffix', 'x'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['tls', 'ca', 'nope'])).toThrow(/Usage/);
  });
});

describe('key-use isolation', () => {
  it('no Hub request-handling module imports the CA key code', () => {
    const root = path.join(__dirname, '..');
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') && /\/(server|auth|devices|realtime|security|sync)\//.test(full.replace(/\\/g, '/'))) {
          if (/(local-ca|ca-key-protector|renewal|leaf-issuer|identity)\.js'/.test(readFileSync(full, 'utf8'))) offenders.push(path.relative(root, full));
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});

describe.skipIf(process.platform !== 'win32')('Windows DPAPI protector', () => {
  it('round-trips a small buffer through the real PowerShell DPAPI (LocalMachine)', () => {
    const protector = createDpapiProtector();
    const plain = Buffer.from('dude hub ca key test é\u0000ÿ', 'utf8');
    const blob = protector.protect(plain);
    expect(blob.length).toBeGreaterThan(plain.length);
    expect(blob.includes(plain)).toBe(false);
    expect(protector.unprotect(blob).equals(plain)).toBe(true);
  }, 30_000);
});
