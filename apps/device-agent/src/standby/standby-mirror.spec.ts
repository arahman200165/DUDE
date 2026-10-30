import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StandbyError, fileSize, inside, listLocal, listPartials, mirrorPaths, objectKind, objectPath, partialPath } from './standby-mirror.js';

const dirs: string[] = [];
const tmp = (): string => { const d = mkdtempSync(path.join(os.tmpdir(), 'dude-standby-mirror-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

const PACK = `packs/${'a'.repeat(32)}`;
const MANIFEST = `manifests/20261029T101500Z-${'b'.repeat(32)}`;

describe('standby mirror names and paths', () => {
  it('classifies only the closed grammar', () => {
    expect(objectKind('repo')).toBe('repo');
    expect(objectKind(PACK)).toBe('pack');
    expect(objectKind(MANIFEST)).toBe('manifest');
    for (const bad of ['', 'repo/', '../repo', 'packs/../repo', `packs/${'A'.repeat(32)}`, `packs/${'a'.repeat(31)}`, `${PACK}/x`, `${PACK}.part`, 'manifests/x', '..\\packs\\x', 'C:\\x', `packs\\${'a'.repeat(32)}`, `${PACK}\0`, 5, null, undefined]) {
      expect(objectKind(bad)).toBeNull();
    }
  });

  it('refuses a hostile destination id or object name before it becomes a path', () => {
    const root = tmp();
    for (const id of ['', '..', '.', 'a/b', 'a\\b', '../x', 'A', '-x', 'a'.repeat(33), 'x\0', 'C:']) {
      expect(() => mirrorPaths(root, id)).toThrowError(StandbyError);
    }
    const paths = mirrorPaths(root, 'local-1');
    for (const name of ['../repo', 'packs/../../x', '..', 'repo/../../x', `${PACK}/../x`, '/etc/passwd', 'C:\\Windows\\x']) {
      expect(() => objectPath(paths, name)).toThrowError(expect.objectContaining({ code: 'hostile-listing' }));
      expect(() => partialPath(paths, name)).toThrowError(expect.objectContaining({ code: 'hostile-listing' }));
    }
  });

  it('keeps every derived path strictly inside the mirror, with partials outside the repository', () => {
    const root = tmp();
    const paths = mirrorPaths(root, 'local-1');
    expect(objectPath(paths, 'repo')).toBe(path.join(root, 'local-1', 'repo'));
    expect(objectPath(paths, PACK)).toBe(path.join(root, 'local-1', 'packs', 'a'.repeat(32)));
    expect(objectPath(paths, MANIFEST)).toBe(path.join(root, 'local-1', 'manifests', MANIFEST.slice('manifests/'.length)));
    const part = partialPath(paths, PACK);
    expect(part).toBe(path.join(root, '.standby-partial', 'local-1', `packs-${'a'.repeat(32)}.part`));
    expect(path.relative(paths.repoDir, part).startsWith('..')).toBe(true);
    expect(() => inside(root, '..', 'x')).toThrowError(StandbyError);
    expect(() => inside(root)).toThrowError(StandbyError);
    expect(() => inside(root, path.resolve(root, '..'))).toThrowError(StandbyError);
  });

  it('lists only regular files that match the grammar, and reads sizes', async () => {
    const root = tmp();
    const paths = mirrorPaths(root, 'local-1');
    mkdirSync(path.join(paths.repoDir, 'packs', 'a'.repeat(32)), { recursive: true }); // a directory with a pack name
    writeFileSync(path.join(paths.repoDir, 'packs', 'b'.repeat(32)), Buffer.alloc(7));
    writeFileSync(path.join(paths.repoDir, 'packs', 'stray.txt'), 'x');
    writeFileSync(path.join(paths.repoDir, 'packs', `${'c'.repeat(32)}.part`), 'x');
    const packs = await listLocal(paths, 'packs');
    expect([...packs]).toEqual([[`packs/${'b'.repeat(32)}`, 7]]);
    expect(await listLocal(paths, 'manifests')).toEqual(new Map());
    expect(await fileSize(path.join(paths.repoDir, 'packs', 'a'.repeat(32)))).toBeNull();
    expect(await fileSize(path.join(paths.repoDir, 'nothing'))).toBeNull();
  });

  it('lists the objects with a partial download and ignores everything else there', async () => {
    const root = tmp();
    const paths = mirrorPaths(root, 'local-1');
    mkdirSync(paths.partialDir, { recursive: true });
    writeFileSync(partialPath(paths, PACK), 'xx');
    writeFileSync(partialPath(paths, MANIFEST), 'xx');
    writeFileSync(partialPath(paths, 'repo'), 'xx');
    writeFileSync(path.join(paths.partialDir, 'readme.txt'), 'x');
    writeFileSync(path.join(paths.partialDir, 'packs-zz.part'), 'x');
    expect((await listPartials(paths)).sort()).toEqual(['repo', MANIFEST, PACK].sort());
    expect(await listPartials(mirrorPaths(root, 'other'))).toEqual([]);
  });
});
