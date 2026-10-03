import { X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAdminMethods } from '../admin/methods.js';
import { parseArgs } from '../cli/args.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { runTlsImport } from '../service/tls-external.js';
import type { CaKeyProtector } from './ca-key-protector.js';
import { ensureTlsIdentity } from './identity.js';
import { ImportError, parseCertificatePems, sanCoversName, validateImport } from './import.js';
import { createLocalCa, issueLeafFromCa } from './local-ca.js';
import { createLeafRenewal } from './renewal.js';
import { createTlsRotation } from './rotation.js';
import { generateSelfSigned, spkiSha256 } from './self-signed.js';

const ID = '0123456789abcdef-test';
const DAY = 86_400_000;

const protector: CaKeyProtector = { kind: 'file', keyFile: 'ca-key.fake', protect: (b) => Buffer.from(b), unprotect: (b) => Buffer.from(b) };

/** A self-signed server certificate with roughly `daysLeft` days of validity left (negative: already expired). */
function selfSigned(names: string[], daysLeft = 300) {
  const now = new Date(Date.now() - (365 - daysLeft) * DAY);
  return generateSelfSigned({ hubInstanceId: ID, extraNames: names, now, validityYears: 1 });
}

const expectRefusal = (run: () => unknown, pattern: RegExp): ImportError => {
  try { run(); } catch (error) {
    expect(error).toBeInstanceOf(ImportError);
    expect((error as Error).message).toMatch(pattern);
    return error as ImportError;
  }
  throw new Error('expected the import to be refused');
};

describe('certificate import validation', () => {
  const required = ['hub.example.com'];

  it('accepts a matching key and certificate and normalizes the key; warns that there is no chain', () => {
    const { keyPem, certPem } = selfSigned(['hub.example.com']);
    const ok = validateImport({ keyPem, certPem, requiredNames: required });
    expect(ok.spkiSha256).toBe(spkiSha256(certPem));
    expect(ok.certChainPem.trim()).toBe(certPem.trim());
    expect(ok.keyPem).toContain('PRIVATE KEY');
    expect(ok.subjectCn).toMatch(/^DUDE Hub /);
    expect(ok.warnings.join(' ')).toMatch(/No chain/);
  });

  it('does not require the built-in names (localhost, loopback) for an imported certificate', () => {
    const { keyPem, certPem } = selfSigned(['hub.example.com']);
    expect(validateImport({ keyPem, certPem, requiredNames: required }).spkiSha256).toBeTruthy();
  });

  it('refuses a key that does not match the certificate, and an unreadable key', () => {
    const a = selfSigned(['hub.example.com']);
    const b = selfSigned(['hub.example.com']);
    expectRefusal(() => validateImport({ keyPem: b.keyPem, certPem: a.certPem, requiredNames: required }), /does not match/);
    expectRefusal(() => validateImport({ keyPem: 'nonsense', certPem: a.certPem, requiredNames: required }), /could not be read/);
    expectRefusal(() => validateImport({ keyPem: a.keyPem, certPem: 'nonsense', requiredNames: required }), /no PEM certificate/);
  });

  it('refuses an expired certificate and one with fewer than 7 days left, but accepts 10 days', () => {
    const expired = selfSigned(['hub.example.com'], -5);
    expectRefusal(() => validateImport({ keyPem: expired.keyPem, certPem: expired.certPem, requiredNames: required }), /expired/);
    const soon = selfSigned(['hub.example.com'], 5);
    expectRefusal(() => validateImport({ keyPem: soon.keyPem, certPem: soon.certPem, requiredNames: required }), /within 7 days/);
    const ok = selfSigned(['hub.example.com'], 10);
    expect(validateImport({ keyPem: ok.keyPem, certPem: ok.certPem, requiredNames: required }).notAfter).toBeTruthy();
  });

  it('refuses a certificate that is not yet valid', () => {
    const { keyPem, certPem } = generateSelfSigned({ hubInstanceId: ID, extraNames: ['hub.example.com'] });
    expectRefusal(() => validateImport({ keyPem, certPem, requiredNames: required, now: Date.now() - 10 * DAY }), /not valid until/);
  });

  it('refuses a CA certificate', () => {
    const ca = createLocalCa({ tlsDir: path.join(tempDir('imp-ca-'), 'tls'), hubInstanceId: ID, protector });
    const keyPem = ca.caKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expectRefusal(() => validateImport({ keyPem, certPem: ca.caCertPem, requiredNames: [] }), /certificate authority/);
  });

  it('refuses a certificate missing a configured name and reports each missing name', () => {
    const { keyPem, certPem } = selfSigned(['hub.example.com']);
    const error = expectRefusal(() => validateImport({ keyPem, certPem, requiredNames: ['hub.example.com', 'other.example.com', '10.0.0.5'] }), /does not cover: other\.example\.com, 10\.0\.0\.5/);
    expect(error.missingNames).toEqual(['other.example.com', '10.0.0.5']);
  });

  it('matches single-label DNS wildcards only', () => {
    const { keyPem, certPem } = selfSigned(['*.example.com', '10.0.0.5']);
    expect(validateImport({ keyPem, certPem, requiredNames: ['hub.example.com', 'HUB2.Example.com', '10.0.0.5'] }).spkiSha256).toBeTruthy();
    expectRefusal(() => validateImport({ keyPem, certPem, requiredNames: ['a.b.example.com'] }), /does not cover/);
    expectRefusal(() => validateImport({ keyPem, certPem, requiredNames: ['example.com'] }), /does not cover/);
    expect(sanCoversName(['*.com'], 'example.com')).toBe(false);
    expect(sanCoversName(['*.example.com'], '10.0.0.5')).toBe(false);
  });

  describe('chains', () => {
    const lan = (suffix: string) => {
      const dir = path.join(tempDir('imp-chain-'), 'tls');
      const ca = createLocalCa({ tlsDir: dir, hubInstanceId: ID, protector, suffixes: [suffix] });
      const leaf = issueLeafFromCa({ caCertPem: ca.caCertPem, caKey: ca.caKey, hubInstanceId: ID, names: [`hub.${suffix}`] });
      return { ca, leaf };
    };

    it('accepts a leaf with its issuing chain, serving leaf first, and drops the warning', () => {
      const { ca, leaf } = lan('lan');
      const ok = validateImport({ keyPem: leaf.keyPem, certPem: leaf.certPem, chainPem: ca.caCertPem, requiredNames: ['hub.lan'] });
      expect(ok.warnings).toEqual([]);
      expect(parseCertificatePems(ok.certChainPem)).toHaveLength(2);
      expect(new X509Certificate(parseCertificatePems(ok.certChainPem)[0]!).raw).toEqual(new X509Certificate(leaf.certPem).raw);
    });

    it('accepts a fullchain file passed as --cert (leaf plus chain in one PEM)', () => {
      const { ca, leaf } = lan('lan');
      const ok = validateImport({ keyPem: leaf.keyPem, certPem: `${leaf.certPem}${ca.caCertPem}`, requiredNames: ['hub.lan'] });
      expect(parseCertificatePems(ok.certChainPem)).toHaveLength(2);
      expect(ok.warnings).toEqual([]);
    });

    it('refuses a chain that did not issue the certificate', () => {
      const a = lan('lan');
      const b = lan('lan');
      expectRefusal(() => validateImport({ keyPem: a.leaf.keyPem, certPem: a.leaf.certPem, chainPem: b.ca.caCertPem, requiredNames: ['hub.lan'] }), /did not issue/);
    });

    it('refuses a chain whose certificates do not link', () => {
      const a = lan('lan');
      const b = lan('lan');
      expectRefusal(() => validateImport({ keyPem: a.leaf.keyPem, certPem: a.leaf.certPem, chainPem: `${a.ca.caCertPem}${b.ca.caCertPem}`, requiredNames: ['hub.lan'] }), /not issued by chain certificate 2/);
    });
  });
});

describe('tls import through the admin channel and rotation', () => {
  function fixture(names: string[] = ['hub.example.com']) {
    const root = tempDir('hub-import-');
    const paths = hubPaths(root);
    const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (opened.status !== 'ready') throw new Error('db');
    mkdirSync(paths.configDir, { recursive: true });
    mkdirSync(paths.tlsDir, { recursive: true });
    writeFileSync(paths.configFile, JSON.stringify({ port: 4711, bind: 'loopback', exposure: { names, ...(names.length > 0 ? { canonicalOrigin: `https://${names[0]}` } : {}) } }));
    const active = ensureTlsIdentity(paths.tlsDir, { hubInstanceId: opened.hub.hubInstanceId });
    const swaps: string[] = [];
    const announced: string[] = [];
    const rotation = createTlsRotation({
      db: opened.hub.db, tlsDir: paths.tlsDir, hubInstanceId: opened.hub.hubInstanceId,
      applySecureContext: (context) => void swaps.push(context.cert), announceNext: (spki) => void announced.push(spki),
    });
    opened.hub.db.prepare("INSERT INTO tls_pins(spki_sha256, cert_pem, key_ref, state, created_at, activated_at) VALUES(?, ?, NULL, 'active', ?, ?)").run(active.spkiSha256, active.certPem, new Date().toISOString(), new Date().toISOString());
    const methods = buildAdminMethods({
      db: opened.hub.db, hubVersion: 't', hubInstanceId: opened.hub.hubInstanceId, bind: 'loopback', getPort: () => 4711, startedAt: 0,
      configDir: paths.configDir, configFile: paths.configFile, tlsDir: paths.tlsDir, spkiSha256: active.spkiSha256, tls: rotation,
    });
    return { methods, paths, hub: opened.hub, rotation, active, swaps, announced, root };
  }
  const call = (f: ReturnType<typeof fixture>, name: string, params: unknown): Promise<any> => Promise.resolve().then(() => f.methods[name]!(params));

  it('stages an imported certificate as next, audits spki, notAfter and subject only, and activates it with source imported', async () => {
    const f = fixture();
    const { keyPem, certPem } = selfSigned(['*.example.com']);
    const staged = await call(f, 'tls.import.stage', { cert: certPem, key: keyPem });
    expect(staged).toMatchObject({ spkiSha256: spkiSha256(certPem), source: 'imported' });
    expect(staged.warnings).toHaveLength(1);
    expect(f.announced).toEqual([spkiSha256(certPem)]);
    expect(f.rotation.status().next?.spkiSha256).toBe(spkiSha256(certPem));
    expect(readFileSync(path.join(f.paths.tlsDir, 'next-cert.pem'), 'utf8')).toBe(`${certPem.trim()}\n`);
    expect(readFileSync(path.join(f.paths.tlsDir, 'next-key.pem'), 'utf8')).toContain('PRIVATE KEY');
    expect(f.hub.db.prepare("SELECT source FROM tls_pins WHERE state = 'next'").get()).toEqual({ source: 'imported' });
    const rows = f.hub.db.prepare("SELECT detail_json AS detail FROM audit_events WHERE event = 'tls.import-staged'").all() as Array<{ detail: string }>;
    expect(rows).toHaveLength(1);
    const detail = JSON.parse(rows[0]!.detail) as Record<string, string>;
    expect(Object.keys(detail).sort()).toEqual(['notAfter', 'spki', 'subject']);
    expect(detail['spki']).toBe(spkiSha256(certPem));
    expect(rows[0]!.detail).not.toContain('PRIVATE');

    const preview = await call(f, 'tls.activate.preview', {});
    await call(f, 'tls.activate.apply', { confirmToken: preview.confirmToken });
    expect(f.hub.db.prepare("SELECT source, state FROM tls_pins WHERE spki_sha256 = ?").get(spkiSha256(certPem))).toEqual({ source: 'imported', state: 'active' });
    expect(f.swaps).toEqual([`${certPem.trim()}\n`]);
    expect(spkiSha256(readFileSync(path.join(f.paths.tlsDir, 'cert.pem'), 'utf8'))).toBe(spkiSha256(certPem));
    f.hub.close();
  });

  it('refuses while a next pin exists, and surfaces validation failures as bad-request without staging', async () => {
    const f = fixture();
    const good = selfSigned(['hub.example.com']);
    await call(f, 'tls.import.stage', { cert: good.certPem, key: good.keyPem });
    await expect(call(f, 'tls.import.stage', { cert: good.certPem, key: good.keyPem })).rejects.toMatchObject({ code: 'conflict' });
    f.hub.close();

    const g = fixture(['hub.example.com', 'other.example.org']);
    const bad = selfSigned(['hub.example.com']);
    await expect(call(g, 'tls.import.stage', { cert: bad.certPem, key: bad.keyPem })).rejects.toMatchObject({ code: 'bad-request', message: expect.stringContaining('other.example.org') });
    expect(g.rotation.status().next).toBeNull();
    expect(existsSync(path.join(g.paths.tlsDir, 'next-key.pem'))).toBe(false);
    await expect(call(g, 'tls.import.stage', { cert: bad.certPem })).rejects.toMatchObject({ code: 'bad-request' });
    g.hub.close();
  });

  it('refuses a certificate that reuses the active key (the pin would not change)', async () => {
    const f = fixture([]);
    const activeKey = readFileSync(path.join(f.paths.tlsDir, 'key.pem'), 'utf8');
    const activeCert = readFileSync(path.join(f.paths.tlsDir, 'cert.pem'), 'utf8');
    await expect(call(f, 'tls.import.stage', { cert: activeCert, key: activeKey })).rejects.toMatchObject({ code: 'conflict' });
    f.hub.close();
  });

  it('the CLI reads files, sends PEM over the admin channel and prints warnings and next steps', async () => {
    const f = fixture();
    const { keyPem, certPem } = selfSigned(['hub.example.com']);
    writeFileSync(path.join(f.root, 'c.pem'), certPem);
    writeFileSync(path.join(f.root, 'k.pem'), keyPem);
    const out: string[] = [];
    const err: string[] = [];
    const calls: Array<{ method: string; params: any }> = [];
    const deps = {
      platform: 'linux' as const, stdout: (t: string) => void out.push(t), stderr: (t: string) => void err.push(t),
      call: async (_dir: string, method: string, params: unknown) => {
        calls.push({ method, params });
        return method === 'status' ? { ok: true } : f.methods[method]!(params);
      },
    };
    expect(await runTlsImport({ cert: 'c.pem', key: 'k.pem', dataDir: f.root, cwd: f.root }, deps)).toBe(0);
    const stage = calls.find((c) => c.method === 'tls.import.stage')!;
    expect(stage.params.cert).toBe(certPem);
    expect(stage.params).not.toHaveProperty('chain');
    expect(JSON.parse(out.join(''))).toMatchObject({ source: 'imported' });
    expect(err.join('')).toMatch(/Warning: No chain/);
    expect(err.join('')).toMatch(/tls activate/);

    expect(await runTlsImport({ cert: 'missing.pem', key: 'k.pem', dataDir: f.root, cwd: f.root }, deps)).toBe(1);
    f.hub.close();
  });

  it('parses the CLI flags', () => {
    expect(parseArgs(['tls', 'import', '--cert', 'a.pem', '--key', 'b.pem', '--chain', 'c.pem'])).toEqual({ command: 'tls-import', cert: 'a.pem', key: 'b.pem', chain: 'c.pem' });
    expect(() => parseArgs(['tls', 'import', '--cert', 'a.pem'])).toThrow(/Usage/);
    expect(() => parseArgs(['tls', 'import', '--cert', 'a.pem', '--key', 'b.pem', '--bogus', 'x'])).toThrow();
  });
});

describe('renewal and imported certificates', () => {
  it('never renews an imported certificate, even close to expiry with a local CA present', () => {
    const dir = path.join(tempDir('imp-renew-'), 'tls');
    mkdirSync(dir, { recursive: true });
    createLocalCa({ tlsDir: dir, hubInstanceId: ID, protector });
    const imported = selfSigned(['hub.example.com'], 10);
    writeFileSync(path.join(dir, 'key.pem'), imported.keyPem);
    writeFileSync(path.join(dir, 'cert.pem'), imported.certPem);
    const applied: unknown[] = [];
    const renewal = createLeafRenewal({ tlsDir: dir, hubInstanceId: ID, protector, applySecureContext: (c) => void applied.push(c), audit: () => { throw new Error('must not audit'); } });
    expect(renewal.runOnce()).toEqual({ renewed: false });
    expect(applied).toEqual([]);
    expect(readFileSync(path.join(dir, 'cert.pem'), 'utf8')).toBe(imported.certPem);
  });

  it('never renews a certificate issued by a DIFFERENT CA that was imported', () => {
    const dir = path.join(tempDir('imp-renew2-'), 'tls');
    mkdirSync(dir, { recursive: true });
    createLocalCa({ tlsDir: dir, hubInstanceId: ID, protector });
    const other = createLocalCa({ tlsDir: path.join(tempDir('imp-other-'), 'tls'), hubInstanceId: ID, protector, suffixes: ['lan'] });
    const leaf = issueLeafFromCa({ caCertPem: other.caCertPem, caKey: other.caKey, hubInstanceId: ID, names: ['hub.lan'], now: new Date(Date.now() - 380 * DAY) });
    writeFileSync(path.join(dir, 'key.pem'), leaf.keyPem);
    writeFileSync(path.join(dir, 'cert.pem'), `${leaf.certPem}${other.caCertPem}`);
    const renewal = createLeafRenewal({ tlsDir: dir, hubInstanceId: ID, protector, applySecureContext: () => { throw new Error('must not swap'); }, audit: () => { throw new Error('must not audit'); } });
    expect(renewal.runOnce()).toEqual({ renewed: false });
  });
});
