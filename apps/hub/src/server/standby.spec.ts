import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { createBackupWriter, openBackupV2 } from '@dude/hub-backup';
import { setMeta } from '@dude/sqlite-store';
import { HUB_API_PREFIX, StandbyObjectsResponse, StandbyRepositoriesResponse } from '@dude/contracts/hub';
import { HubApiError, createHubClient } from '@dude/api-client';
import type { HubTransport } from '@dude/api-client';
import { randomCheapDeps } from '../backup/backup-fixture.js';
import { createLocalFolderDestination } from '../backup/destinations/local-folder.js';
import { BACKUP_JOURNAL_PREFIX } from '../backup/run-backup-v2.js';
import { applyBackupConfigChange, loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import { deactivateDevice } from '../devices/registry.js';
import { listAudit } from '../security/audit.js';
import { grantStandby, revokeStandby } from '../standby/grants.js';
import { STANDBY_JOURNAL_PREFIX } from '../standby/repositories.js';
import { PASSWORD, startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { deviceToken, enrolled } from './device-test-helpers.js';
import type { SimDevice } from './device-test-helpers.js';

const PASSPHRASE = 'standby spec passphrase, long enough';
const MARKER = 'PLAINTEXT-STANDBY-MARKER-4c1e';
const DEST = 'local-1';

interface BinaryResponse { status: number; headers: Record<string, string | string[] | undefined>; body: Buffer }

function getBytes(h: AuthHub, pathName: string, headers: Record<string, string> = {}): Promise<BinaryResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: '127.0.0.1', port: h.hub.port, path: `${HUB_API_PREFIX}${pathName}`, method: 'GET', ca: h.hub.tls.certPem, headers, servername: 'localhost' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

/** A pinned HTTPS transport that honours `responseType: 'bytes'` (what the desktop puller's transport must do). */
function bytesTransport(h: AuthHub): HubTransport {
  return {
    request: (req) => new Promise((resolve, reject) => {
      const r = https.request({ host: '127.0.0.1', port: h.hub.port, path: req.path, method: req.method, ca: h.hub.tls.certPem, headers: req.headers ?? {}, servername: 'localhost' }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks);
          const status = res.statusCode ?? 0;
          const headers = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : v ?? '']));
          const binary = req.responseType === 'bytes' && status >= 200 && status < 300;
          let body: unknown = new Uint8Array(raw);
          if (!binary) { try { body = raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8')); } catch { body = undefined; } }
          resolve({ status, headers, body });
        });
      });
      r.on('error', reject);
      r.end();
    }),
  };
}

const objectPath = (name: string, dest = DEST): string => `/standby/repositories/${dest}/object?name=${encodeURIComponent(name)}`;

describe('warm standby pull routes', () => {
  let h: AuthHub;
  let owner: Signed;
  let folder: string;
  let backupId: string;
  let granted: { deviceId: string; token: string; sim: SimDevice };
  let ungranted: { deviceId: string; token: string; sim: SimDevice };
  const onDisk = (): Array<{ name: string; size: number }> => {
    const out: Array<{ name: string; size: number }> = [{ name: 'repo', size: readFileSync(path.join(folder, 'repo')).length }];
    for (const sub of ['manifests', 'packs']) for (const n of readdirSync(path.join(folder, sub))) if (!n.endsWith('.part')) out.push({ name: `${sub}/${n}`, size: readFileSync(path.join(folder, sub, n)).length });
    return out.sort((a, b) => (a.name < b.name ? -1 : 1));
  };
  const fileOf = (name: string): Buffer => readFileSync(path.join(folder, ...name.split('/')));
  const audits = (event: string) => listAudit(h.hub.hub.db, { limit: 1000 }).filter((r) => r.event === event);
  const device = (d: { token: string }) => ({ authorization: `Bearer ${d.token}` });

  beforeAll(async () => {
    h = await startAuthHub();
    owner = await h.signIn();
    folder = mkdtempSync(path.join(os.tmpdir(), 'hub-standby-repo-'));
    // A real backup v2 repository written by the format library through the local-folder destination (the layout run-backup-v2 writes).
    const destination = createLocalFolderDestination({ id: DEST, label: 'USB drive', folder });
    const writer = await createBackupWriter({
      passphrase: PASSPHRASE, sink: destination.sink(), deps: randomCheapDeps(), chunkSize: 1024, packBytes: 8192,
      metadata: { hubVersion: 'test', source: { hubInstanceId: h.hub.hub.hubInstanceId, authorityEpoch: 1, schemaVersion: 13, dbMinReaderVersion: 10 }, forTransfer: false },
    });
    const plaintext = Buffer.from(`${MARKER} `.repeat(2000));
    await writer.addFile('dude.db', [plaintext]);
    await writer.addBlob([Buffer.concat([Buffer.from(MARKER), randomBytes(20_000)])]);
    backupId = (await writer.finish()).backupId;
    const config = loadOrCreateHubConfig(h.hub.paths.configFile);
    writeHubConfig(h.hub.paths.configFile, applyBackupConfigChange(config, {
      destinations: [
        { id: DEST, kind: 'local-folder', label: 'USB drive', folder },
        { id: 'bucket-1', kind: 's3', label: 'Bucket', endpoint: 'https://s3.example.com', region: 'us-east-1', bucket: 'dude-backups' },
      ],
    }));
    setMeta(h.hub.hub.db, `backup_dest_state:${DEST}`, JSON.stringify({ lastSuccessAt: '2026-03-01T00:00:00.000Z', lastBackupId: backupId, lastOutcome: 'success' }));
    const a = await enrolled(h, owner);
    const b = await enrolled(h, owner);
    granted = { deviceId: a.device.deviceId, token: a.token, sim: a.device };
    ungranted = { deviceId: b.device.deviceId, token: b.token, sim: b.device };
    expect(grantStandby(h.hub.hub.db, granted.deviceId, h.clock.t)).toBe(true);
  });
  afterAll(async () => {
    await h.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it('refuses a device without the grant (403, audited at most hourly), an owner credential (403) and anything else (401)', async () => {
    const before = audits('standby.denied').length;
    for (const p of ['/standby/repositories', `/standby/repositories/${DEST}/objects`, objectPath('repo')]) {
      const res = await getBytes(h, p, device(ungranted));
      expect(res.status, p).toBe(403);
      expect(JSON.parse(res.body.toString('utf8'))).toEqual({ error: { code: 'forbidden', message: 'This device has not been granted standby access.' } });
      expect((await getBytes(h, p)).status, p).toBe(401);
      expect((await getBytes(h, p, { authorization: 'Bearer ddt_unknown' })).status, p).toBe(401);
      expect((await getBytes(h, p, { authorization: 'Bearer dit_unknown' })).status, p).toBe(401);
      // An owner credential cannot act as a device (the device resolver's 403), and never reaches the grant check.
      const asOwner = await getBytes(h, p, { cookie: `__Host-dude_session=${owner.cookie}`, host: `localhost:${h.hub.port}` });
      expect(asOwner.status, p).toBe(403);
      expect(JSON.parse(asOwner.body.toString('utf8')).error.message, p).toBe('An owner credential cannot act as a device.');
    }
    const ownerBearer = (await h.call('POST', '/auth/owner/bearer', { bearer: granted.token, noOrigin: true, body: { password: PASSWORD } })).json.accessToken as string;
    expect((await getBytes(h, '/standby/repositories', { authorization: `Bearer ${ownerBearer}` })).status).toBe(403);
    const denied = audits('standby.denied');
    expect(denied.length).toBe(before + 1);
    expect(denied[0]).toMatchObject({ outcome: 'denied', actorKind: 'device', actorId: ungranted.deviceId, detail: { deviceId: ungranted.deviceId, reason: 'no-grant' } });
    h.clock.t += 3600_000;
    // Device tokens live about 15 minutes: both devices fetch fresh ones after the clock jump.
    ungranted.token = (await deviceToken(h, ungranted.sim)).token;
    granted.token = (await deviceToken(h, granted.sim)).token;
    await getBytes(h, '/standby/repositories', device(ungranted));
    expect(audits('standby.denied').length).toBe(before + 2);
  });

  it('lists the grant and only the local-folder repositories, never a folder path', async () => {
    const res = await h.call('GET', '/standby/repositories', { bearer: granted.token, noOrigin: true });
    expect(res.status).toBe(200);
    expect(res.raw.headers['cache-control']).toBe('no-store');
    expect(Value.Check(StandbyRepositoriesResponse, res.json)).toBe(true);
    expect(res.json).toEqual({
      deviceId: granted.deviceId, grantedAt: '2026-03-01T00:00:00.000Z',
      repositories: [{ id: DEST, kind: 'local-folder', label: 'USB drive', lastSuccessAt: '2026-03-01T00:00:00.000Z', lastBackupId: backupId }],
    });
    expect(res.raw.body).not.toContain(folder.replace(/\\/g, '\\\\'));
    expect(res.raw.body).not.toContain(path.basename(folder));
  });

  it('lists exactly the committed objects on disk, sorted, paged and filtered, hiding an unrecorded run', async () => {
    const all = await h.call('GET', `/standby/repositories/${DEST}/objects`, { bearer: granted.token, noOrigin: true });
    expect(all.status).toBe(200);
    expect(Value.Check(StandbyObjectsResponse, all.json)).toBe(true);
    expect(all.json).toEqual({ objects: onDisk(), next: null });
    expect(all.json.objects.some((o: { name: string }) => o.name.startsWith('packs/'))).toBe(true);
    expect(all.json.objects.filter((o: { name: string }) => o.name.startsWith('manifests/'))).toEqual([{ name: `manifests/${backupId}`, size: fileOf(`manifests/${backupId}`).length }]);

    const pages: string[] = [];
    let after: string | null = null;
    do {
      const page = await h.call('GET', `/standby/repositories/${DEST}/objects?limit=2${after === null ? '' : `&after=${encodeURIComponent(after)}`}`, { bearer: granted.token, noOrigin: true });
      expect(page.json.objects.length).toBeLessThanOrEqual(2);
      pages.push(...page.json.objects.map((o: { name: string }) => o.name));
      after = page.json.next;
    } while (after !== null);
    expect(pages).toEqual(onDisk().map((o) => o.name));
    const packs = await h.call('GET', `/standby/repositories/${DEST}/objects?prefix=packs/`, { bearer: granted.token, noOrigin: true });
    expect(packs.json.objects.every((o: { name: string }) => o.name.startsWith('packs/'))).toBe(true);
    expect((await h.call('GET', `/standby/repositories/${DEST}/objects?prefix=repo`, { bearer: granted.token, noOrigin: true })).json.objects.map((o: { name: string }) => o.name)).toEqual(['repo']);
    expect((await h.call('GET', `/standby/repositories/${DEST}/objects?prefix=other`, { bearer: granted.token, noOrigin: true })).status).toBe(400);
    expect((await h.call('GET', `/standby/repositories/${DEST}/objects?limit=abc`, { bearer: granted.token, noOrigin: true })).status).toBe(400);

    // A run that committed objects but has not been recorded (its journal): hidden from the listing and from a fetch.
    expect(STANDBY_JOURNAL_PREFIX).toBe(BACKUP_JOURNAL_PREFIX);
    const hiddenPack = packs.json.objects[0].name as string;
    setMeta(h.hub.hub.db, `${BACKUP_JOURNAL_PREFIX}${DEST}`, JSON.stringify({ backupId: null, objects: [hiddenPack] }));
    const during = await h.call('GET', `/standby/repositories/${DEST}/objects`, { bearer: granted.token, noOrigin: true });
    expect(during.json.objects.map((o: { name: string }) => o.name)).not.toContain(hiddenPack);
    expect((await getBytes(h, objectPath(hiddenPack), device(granted))).status).toBe(404);
    h.hub.hub.db.prepare('DELETE FROM meta WHERE key = ?').run(`${BACKUP_JOURNAL_PREFIX}${DEST}`);
  });

  it('answers 404 for an unknown or non-local destination and a missing object, and 400 for a name outside the repository layout', async () => {
    expect((await h.call('GET', '/standby/repositories/bucket-1/objects', { bearer: granted.token, noOrigin: true })).status).toBe(404);
    expect((await h.call('GET', '/standby/repositories/nope/objects', { bearer: granted.token, noOrigin: true })).status).toBe(404);
    expect((await getBytes(h, objectPath('repo', 'bucket-1'), device(granted))).status).toBe(404);
    expect((await getBytes(h, objectPath(`packs/${'0'.repeat(32)}`), device(granted))).status).toBe(404);
    for (const bad of ['../hub.json', 'packs/../repo', 'repo.part', `packs/${'A'.repeat(32)}`, 'config/hub.json']) {
      expect((await getBytes(h, objectPath(bad), device(granted))).status, bad).toBe(400);
    }
  });

  it('streams an object byte for byte, whole or by one range, with correct Content-Range and 416 for anything else', async () => {
    const pack = onDisk().filter((o) => o.name.startsWith('packs/')).sort((a, b) => b.size - a.size)[0]!;
    const bytes = fileOf(pack.name);
    const whole = await getBytes(h, objectPath(pack.name), device(granted));
    expect(whole.status).toBe(200);
    expect(whole.headers['content-type']).toBe('application/octet-stream');
    expect(whole.headers['accept-ranges']).toBe('bytes');
    expect(whole.headers['cache-control']).toBe('no-store');
    expect(whole.headers['content-length']).toBe(String(bytes.length));
    expect(whole.body.equals(bytes)).toBe(true);

    const cases: Array<[string, number, number]> = [['bytes=10-99', 10, 99], ['bytes=0-0', 0, 0], ['bytes=-5', bytes.length - 5, bytes.length - 1], [`bytes=100-`, 100, bytes.length - 1], [`bytes=50-${bytes.length + 1000}`, 50, bytes.length - 1]];
    for (const [range, start, end] of cases) {
      const res = await getBytes(h, objectPath(pack.name), { ...device(granted), range });
      expect(res.status, range).toBe(206);
      expect(res.headers['content-range'], range).toBe(`bytes ${start}-${end}/${bytes.length}`);
      expect(res.headers['content-length'], range).toBe(String(end - start + 1));
      expect(res.body.equals(bytes.subarray(start, end + 1)), range).toBe(true);
    }
    // Three ranges reassemble the object exactly (what a resumable puller does).
    const third = Math.floor(bytes.length / 3);
    const parts = [];
    for (const [s, e] of [[0, third - 1], [third, 2 * third - 1], [2 * third, bytes.length - 1]] as const) parts.push((await getBytes(h, objectPath(pack.name), { ...device(granted), range: `bytes=${s}-${e}` })).body);
    expect(Buffer.concat(parts).equals(bytes)).toBe(true);

    for (const range of [`bytes=${bytes.length}-`, 'bytes=9-5', 'bytes=0-1,5-6', 'items=0-5', 'bytes=-0', 'bytes=-']) {
      const res = await getBytes(h, objectPath(pack.name), { ...device(granted), range });
      expect(res.status, range).toBe(416);
      expect(res.headers['content-range'], range).toBe(`bytes */${bytes.length}`);
    }
  });

  it('serves ciphertext only: every object is the stored bytes, no plaintext or passphrase appears, and only the passphrase opens the mirror', async () => {
    const mirror = mkdtempSync(path.join(os.tmpdir(), 'hub-standby-mirror-'));
    try {
      const sink = createLocalFolderDestination({ id: 'mirror', label: 'mirror', folder: mirror });
      const objects = (await h.call('GET', `/standby/repositories/${DEST}/objects`, { bearer: granted.token, noOrigin: true })).json.objects as Array<{ name: string }>;
      // Packs first, the manifest last, `repo` before anything is opened: the puller's order.
      const ordered = [...objects.filter((o) => o.name === 'repo'), ...objects.filter((o) => o.name.startsWith('packs/')), ...objects.filter((o) => o.name.startsWith('manifests/'))];
      for (const { name } of ordered) {
        const res = await getBytes(h, objectPath(name), device(granted));
        expect(res.status).toBe(200);
        expect(res.body.equals(fileOf(name)), name).toBe(true);
        const text = res.body.toString('latin1');
        expect(text, name).not.toContain(MARKER);
        expect(text, name).not.toContain(PASSPHRASE);
        const out = await sink.sink().create(name);
        await out.write(new Uint8Array(res.body));
        await out.commit();
      }
      const reader = await openBackupV2(sink.source(), backupId, { passphrase: PASSPHRASE }, randomCheapDeps());
      expect(await reader.verify()).toMatchObject({ backupId, files: 1, blobs: 1 });
      await reader.close();
      await expect(openBackupV2(sink.source(), backupId, { passphrase: 'not the passphrase at all' }, randomCheapDeps())).rejects.toMatchObject({ code: 'wrong-passphrase-or-corrupt' });
    } finally {
      rmSync(mirror, { recursive: true, force: true });
    }
  });

  it('audits standby.pulled once per device and backup when the last byte of a manifest is delivered, never for a partial piece', async () => {
    owner = await h.signIn(); // the clock moved past the step-up window: a fresh password sign-in for the pairing code
    const third = await enrolled(h, owner);
    expect(grantStandby(h.hub.hub.db, third.device.deviceId, h.clock.t)).toBe(true);
    const manifest = `manifests/${backupId}`;
    const pulledFor = () => audits('standby.pulled').filter((r) => (r.detail as { deviceId?: string } | null)?.deviceId === third.device.deviceId);
    await getBytes(h, objectPath(manifest), { ...device(third), range: 'bytes=0-9' });
    await getBytes(h, objectPath(`packs/${onDisk().find((o) => o.name.startsWith('packs/'))!.name.slice(6)}`), device(third));
    expect(pulledFor()).toEqual([]);
    await getBytes(h, objectPath(manifest), { ...device(third), range: 'bytes=10-' });
    expect(pulledFor()).toHaveLength(1);
    await getBytes(h, objectPath(manifest), device(third));
    const rows = pulledFor();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'success', actorKind: 'device', actorId: third.device.deviceId, detail: { deviceId: third.device.deviceId, destination: DEST, backupId } });
    expect(JSON.stringify(rows)).not.toContain(path.basename(folder));
  });

  it('the typed client reads the same contract: listing, a ranged piece and the 403 for an ungranted device', async () => {
    const client = createHubClient(bytesTransport(h), { clientProtocol: 1, minHubProtocol: 1 });
    const repos = await client.standbyRepositories(granted.token);
    expect(repos.repositories.map((r) => r.id)).toEqual([DEST]);
    const listing = await client.listStandbyObjects(granted.token, DEST, { prefix: 'manifests/' });
    expect(listing.objects.map((o) => o.name)).toEqual([`manifests/${backupId}`]);
    const manifest = fileOf(`manifests/${backupId}`);
    const piece = await client.getStandbyObject(granted.token, DEST, `manifests/${backupId}`, { start: 3, end: 40 });
    expect(piece).toMatchObject({ status: 206, start: 3, end: 40, size: manifest.length });
    expect(Buffer.from(piece.bytes).equals(manifest.subarray(3, 41))).toBe(true);
    const whole = await client.getStandbyObject(granted.token, DEST, 'repo');
    expect(Buffer.from(whole.bytes).equals(fileOf('repo'))).toBe(true);
    await expect(client.standbyRepositories(ungranted.token)).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(client.getStandbyObject(ungranted.token, DEST, 'repo')).rejects.toBeInstanceOf(HubApiError);
  });

  it('stops serving on the next request after a revoke, a device revocation or a re-enrolment', async () => {
    expect((await getBytes(h, '/standby/repositories', device(granted))).status).toBe(200);
    expect(revokeStandby(h.hub.hub.db, granted.deviceId)).toBe(true);
    expect((await getBytes(h, objectPath('repo'), device(granted))).status).toBe(403);
    expect(grantStandby(h.hub.hub.db, granted.deviceId, h.clock.t)).toBe(true);
    expect((await getBytes(h, objectPath('repo'), device(granted))).status).toBe(200);
    deactivateDevice(h.hub.hub.db, granted.deviceId, 'revoked', h.clock.t);
    expect((await getBytes(h, objectPath('repo'), device(granted))).status).toBe(401);
  });
});
