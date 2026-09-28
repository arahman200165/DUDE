import { algorithmForDigestLength, formatBsd, formatCsv, formatGnu, formatJson, merkleHash, parseManifest, type ManifestEntry } from './manifest-format';
import { diffSnapshots, parseSnapshot } from './snapshot-diff';

const entries: ManifestEntry[] = [
  { path: 'a.txt', size: 1, mtimeMs: 0, digests: { 'SHA-256': 'aa'.repeat(32), MD5: 'bb'.repeat(16) } },
  { path: 'dir/b c.txt', size: 2, mtimeMs: 0, digests: { 'SHA-256': 'cc'.repeat(32) } },
  { path: 'odd\\name\n.txt', size: 3, mtimeMs: 0, digests: { 'SHA-256': 'dd'.repeat(32) } },
];

describe('manifest formats', () => {
  it('writes GNU lines with coreutils escaping, and parses them back', () => {
    const text = formatGnu(entries, 'SHA-256');
    expect(text.split('\n')[0]).toBe(`${'aa'.repeat(32)}  a.txt`);
    expect(text.split('\n')[2]).toBe(`\\${'dd'.repeat(32)}  odd\\\\name\\n.txt`);
    const parsed = parseManifest(text);
    expect(parsed.format).toBe('gnu');
    expect(parsed.entries.map((entry) => entry.path)).toEqual(['a.txt', 'dir/b c.txt', 'odd\\name\n.txt']);
    expect(parsed.entries[0].algorithm).toBe('SHA-256');
    // Binary-mode marker and CRLF from other tools are accepted.
    expect(parseManifest(`${'bb'.repeat(16)} *a.txt\r\n`).entries[0]).toMatchObject({ path: 'a.txt', algorithm: 'MD5' });
  });

  it('writes and reads BSD tag lines, including other tools\' tag spellings', () => {
    const text = formatBsd(entries.slice(0, 1), ['SHA-256', 'MD5']);
    expect(text).toBe(`SHA256 (a.txt) = ${'aa'.repeat(32)}\nMD5 (a.txt) = ${'bb'.repeat(16)}\n`);
    const parsed = parseManifest(`${text}BLAKE2b-512 (x) = ${'ee'.repeat(64)}\nnot a line\n`);
    expect(parsed.format).toBe('bsd');
    expect(parsed.entries.map((entry) => entry.algorithm)).toEqual(['SHA-256', 'MD5', 'BLAKE2b']);
    expect(parsed.errors).toEqual([{ line: 4, text: 'not a line' }]);
  });

  it('round-trips DUDE JSON and CSV manifests', () => {
    const json = parseManifest(formatJson(entries.slice(0, 2), { root: 'x' }));
    expect(json.entries.map((entry) => `${entry.algorithm}:${entry.path}`)).toEqual(['MD5:a.txt', 'SHA-256:a.txt', 'SHA-256:dir/b c.txt']);
    const csv = parseManifest(formatCsv(entries, ['SHA-256']));
    expect(csv.entries.map((entry) => entry.path)).toEqual(['a.txt', 'dir/b c.txt', 'odd\\name\n.txt']);
    expect(csv.format).toBe('csv');
    expect(algorithmForDigestLength(128)).toBe('SHA-512');
  });
});

describe('merkleHash', () => {
  const files = new Map([['a.txt', 'aa'.repeat(32)], ['sub/b.txt', 'bb'.repeat(32)]]);
  it('is deterministic, independent of insertion order, and sensitive to names, content and empty folders', () => {
    const first = merkleHash(files, ['sub']);
    const reordered = merkleHash(new Map([...files].reverse()), ['sub']);
    expect(first.root).toMatch(/^[0-9a-f]{64}$/);
    expect(reordered.root).toBe(first.root);
    expect(merkleHash(new Map([['a.txt', 'aa'.repeat(32)], ['sub/B.txt', 'bb'.repeat(32)]]), ['sub']).root).not.toBe(first.root);
    expect(merkleHash(new Map([['a.txt', 'aa'.repeat(32)], ['sub/b.txt', 'cc'.repeat(32)]]), ['sub']).root).not.toBe(first.root);
    expect(merkleHash(files, ['sub', 'empty']).root).not.toBe(first.root);
    // A subtree's digest equals the root digest of that subtree hashed on its own.
    expect(first.folders.get('sub')).toBe(merkleHash(new Map([['b.txt', 'bb'.repeat(32)]]), []).root);
  });
});

describe('diffSnapshots', () => {
  it('classifies added, removed, modified, touched, and moved files', () => {
    const base = { directories: ['old'], entries: [
      { path: 'same.txt', size: 1, mtimeMs: 1, hash: 'h1' }, { path: 'edit.txt', size: 1, mtimeMs: 1, hash: 'h2' },
      { path: 'touch.txt', size: 1, mtimeMs: 1, hash: 'h3' }, { path: 'gone.txt', size: 1, mtimeMs: 1, hash: 'h4' }, { path: 'old/moved.bin', size: 9, mtimeMs: 1, hash: 'h5' },
    ] };
    const next = { directories: ['new'], entries: [
      { path: 'same.txt', size: 1, mtimeMs: 1, hash: 'h1' }, { path: 'edit.txt', size: 1, mtimeMs: 5, hash: 'hX' },
      { path: 'touch.txt', size: 1, mtimeMs: 9, hash: 'h3' }, { path: 'new/moved.bin', size: 9, mtimeMs: 2, hash: 'h5' }, { path: 'fresh.txt', size: 2, mtimeMs: 2 },
    ] };
    const diff = diffSnapshots(base, next);
    expect(diff.counts).toEqual({ added: 1, removed: 1, modified: 1, touched: 1, moved: 1, unchanged: 1 });
    expect(diff.items.find((item) => item.change === 'moved')).toMatchObject({ path: 'new/moved.bin', from: 'old/moved.bin' });
    expect(diff.addedDirs).toEqual(['new']);
    expect(diff.removedDirs).toEqual(['old']);
  });

  it('treats a new mtime without hashes as a possible modification, and validates imports', () => {
    const diff = diffSnapshots({ directories: [], entries: [{ path: 'a', size: 1, mtimeMs: 1 }] }, { directories: [], entries: [{ path: 'a', size: 1, mtimeMs: 50 }] });
    expect(diff.counts.modified).toBe(1);
    expect(parseSnapshot({ nope: true })).toBeNull();
    expect(parseSnapshot({ root: 'C:\\x', takenAt: 't', entries: [{ path: 'a', size: 3, mtimeMs: 1 }, { bad: 1 }] })).toMatchObject({ files: 1, bytes: 3 });
  });
});
