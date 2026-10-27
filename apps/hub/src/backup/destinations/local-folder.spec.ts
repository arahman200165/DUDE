import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BackupError } from '@dude/hub-backup';
import { hubPaths } from '../../config/data-dir.js';
import { tempRoot } from '../backup-fixture.js';
import { DestinationError, assertObjectName, backupIdOfManifest, packIdOfObject } from './destination.js';
import { assertSafeLocalFolder, createLocalFolderDestination, isInsideFolder, openBackupDestination } from './index.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
const dir = (label: string): string => { const d = tempRoot(label); roots.push(d); return d; };
const PACK = `packs/${'a'.repeat(32)}`;
const MANIFEST = `manifests/20261027T120000Z-${'b'.repeat(32)}`;

async function collect(stream: AsyncIterable<Uint8Array>): Promise<Buffer> {
  const parts: Uint8Array[] = [];
  for await (const piece of stream) parts.push(piece);
  return Buffer.concat(parts);
}

describe('local-folder destination', () => {
  it('commits an object only at commit (via .part), refuses an existing or in-flight name, and never overwrites', async () => {
    const folder = dir('dest-write');
    const destination = createLocalFolderDestination({ id: 'd-1', label: 'Spec', folder });
    const sink = destination.sink();
    const out = await sink.create(PACK);
    await out.write(new Uint8Array([1, 2, 3]));
    expect(readdirSync(path.join(folder, 'packs'))).toEqual([`${'a'.repeat(32)}.part`]);
    expect(await destination.stat(PACK)).toBeNull();
    expect(await destination.list('packs/')).toEqual([]);
    await expect(sink.create(PACK)).rejects.toMatchObject({ code: 'exists' });
    // A second instance over the same folder (the scheduler and the admin pipe each open one) is refused by the exclusive .part.
    await expect(createLocalFolderDestination({ id: 'd-1', label: 'x', folder }).sink().create(PACK)).rejects.toMatchObject({ code: 'exists' });
    await out.write(new Uint8Array([4]));
    await out.commit();
    expect(readdirSync(path.join(folder, 'packs'))).toEqual(['a'.repeat(32)]);
    expect(await destination.list('packs/')).toEqual([{ name: PACK, size: 4 }]);
    await expect(sink.create(PACK)).rejects.toBeInstanceOf(DestinationError);
    expect(readFileSync(path.join(folder, 'packs', 'a'.repeat(32)))).toEqual(Buffer.from([1, 2, 3, 4]));
    await expect(out.write(new Uint8Array([9]))).rejects.toBeInstanceOf(BackupError);
  });

  it('abort leaves nothing; reads stream from an offset; a missing object is an integrity error', async () => {
    const folder = dir('dest-read');
    const destination = createLocalFolderDestination({ id: 'd-1', label: 'Spec', folder });
    const aborted = await destination.sink().create(MANIFEST);
    await aborted.write(new Uint8Array([7]));
    await aborted.abort();
    await aborted.abort();
    expect(readdirSync(path.join(folder, 'manifests'))).toEqual([]);
    const out = await destination.sink().create(MANIFEST);
    await out.write(new Uint8Array([10, 11, 12, 13, 14]));
    await out.commit();
    expect([...(await collect(destination.source().read(MANIFEST, 2)))]).toEqual([12, 13, 14]);
    await expect(collect(destination.source().read(PACK))).rejects.toMatchObject({ code: 'integrity' });
    expect(backupIdOfManifest(MANIFEST)).toBe(`20261027T120000Z-${'b'.repeat(32)}`);
    expect(packIdOfObject(PACK)).toBe('a'.repeat(32));
  });

  it('accepts only repository object names (no traversal, no separators, no other files)', async () => {
    const destination = createLocalFolderDestination({ id: 'd-1', label: 'Spec', folder: dir('dest-names') });
    for (const bad of ['../repo', 'packs/../../x', 'packs/ABC', `packs/${'a'.repeat(31)}`, 'manifests/x', 'repo/', 'other', '', 'packs\\x']) {
      expect(() => assertObjectName(bad), bad).toThrow(DestinationError);
      await expect(destination.sink().create(bad), bad).rejects.toMatchObject({ code: 'bad-name' });
    }
  });

  it('lists committed objects sorted by name, ignoring partial and foreign files, and deletes idempotently', async () => {
    const folder = dir('dest-list');
    const destination = createLocalFolderDestination({ id: 'd-1', label: 'Spec', folder });
    for (const name of [`manifests/20261028T000000Z-${'c'.repeat(32)}`, MANIFEST]) {
      const out = await destination.sink().create(name);
      await out.write(new Uint8Array([1]));
      await out.commit();
    }
    writeFileSync(path.join(folder, 'manifests', 'notes.txt'), 'x');
    expect((await destination.list('manifests/')).map((o) => o.name)).toEqual([MANIFEST, `manifests/20261028T000000Z-${'c'.repeat(32)}`]);
    await destination.deleteObject(MANIFEST);
    await destination.deleteObject(MANIFEST);
    expect((await destination.list('manifests/')).map((o) => o.name)).toEqual([`manifests/20261028T000000Z-${'c'.repeat(32)}`]);
  });

  it('replaces repo atomically (the only overwrite), probes connectivity and free space, and sweeps stale .part files', async () => {
    const folder = dir('dest-repo');
    const destination = createLocalFolderDestination({ id: 'd-1', label: 'Spec', folder, freeBytes: async () => 12345 });
    const first = await destination.sink().create('repo');
    await first.write(new Uint8Array([1]));
    await first.commit();
    await destination.replaceRepo(new Uint8Array([2, 3]));
    expect(readFileSync(path.join(folder, 'repo'))).toEqual(Buffer.from([2, 3]));
    expect(readdirSync(folder).filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect(await destination.probe()).toEqual({ ok: true, freeBytes: 12345 });
    expect(readdirSync(folder).some((n) => n.startsWith('.probe-'))).toBe(false);
    const blocked = path.join(folder, 'blocker');
    writeFileSync(blocked, 'a file, not a folder');
    expect(await createLocalFolderDestination({ id: 'd-2', label: 'x', folder: path.join(blocked, 'inside') }).probe()).toMatchObject({ ok: false });

    mkdirSync(path.join(folder, 'packs'), { recursive: true });
    const stale = path.join(folder, 'packs', `${'d'.repeat(32)}.part`);
    writeFileSync(stale, 'x');
    const old = new Date(Date.now() - 2 * 3_600_000);
    utimesSync(stale, old, old);
    writeFileSync(path.join(folder, 'packs', `${'e'.repeat(32)}.part`), 'fresh');
    expect(await destination.sweepIncomplete!(3_600_000, Date.now())).toBe(1);
    expect(existsSync(stale)).toBe(false);
  });

  it('refuses a folder inside the Hub data, configuration, certificate, secret or storage directories (also at open time)', () => {
    const root = dir('dest-safety');
    const paths = hubPaths(root);
    for (const bad of [paths.dataDir, path.join(paths.dataDir, 'x'), paths.configDir, paths.tlsDir, paths.secretsDir, paths.storageDir, paths.blobsDir, 'relative/dir', '']) {
      expect(() => assertSafeLocalFolder(bad, paths), bad).toThrow(DestinationError);
      if (bad !== '' && path.isAbsolute(bad)) {
        expect(() => openBackupDestination({ id: 'd-1', kind: 'local-folder', label: 'x', folder: bad }, paths), bad).toThrow(/cannot be inside/);
      }
    }
    expect(assertSafeLocalFolder(path.join(root, 'backups'), paths)).toBe(path.join(root, 'backups'));
    expect(assertSafeLocalFolder(`${paths.dataDir}-copies`, paths)).toBe(`${paths.dataDir}-copies`);
    expect(isInsideFolder(path.join(root, 'DATA', 'x'), path.join(root, 'data'), 'win32')).toBe(true);
    expect(isInsideFolder(path.join(root, 'data-x'), path.join(root, 'data'), 'win32')).toBe(false);
  });
});
