import { buildInMemoryFs } from "./git-fs-shim.js";

function fs(files: readonly { path: string; data: Uint8Array }[]) {
  return buildInMemoryFs(files);
}

function text(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('buildInMemoryFs', () => {
  it('reads a file back as raw bytes by default', async () => {
    const client = fs([{ path: '/a.txt', data: text('hello') }]);
    const result = await client.promises.readFile('/a.txt');
    expect(new TextDecoder().decode(result as Uint8Array)).toBe('hello');
  });

  it('decodes to a string when utf8 encoding is requested via a string option', async () => {
    const client = fs([{ path: '/a.txt', data: text('hello') }]);
    expect(await client.promises.readFile('/a.txt', 'utf8')).toBe('hello');
  });

  it('decodes to a string when utf8 encoding is requested via an options object', async () => {
    const client = fs([{ path: '/a.txt', data: text('hello') }]);
    expect(await client.promises.readFile('/a.txt', { encoding: 'utf8' })).toBe('hello');
  });

  it('throws ENOENT for a missing file', async () => {
    const client = fs([]);
    await expect(client.promises.readFile('/missing.txt')).rejects.toThrow(/ENOENT/);
  });

  it('lists immediate children of a directory, including nested files by their top-level name', async () => {
    const client = fs([
      { path: '/dir/a.txt', data: text('a') },
      { path: '/dir/sub/b.txt', data: text('b') },
    ]);
    expect(await client.promises.readdir('/dir')).toEqual(expect.arrayContaining(['a.txt', 'sub']));
  });

  it('lists top-level entries at the root', async () => {
    const client = fs([{ path: '/a.txt', data: text('a') }]);
    expect(await client.promises.readdir('/')).toEqual(['a.txt']);
  });

  it('throws ENOENT for readdir on a path that is not a known directory', async () => {
    const client = fs([]);
    await expect(client.promises.readdir('/nope')).rejects.toThrow(/ENOENT/);
  });

  it('reports stat for a file with the correct size and isFile/isDirectory', async () => {
    const client = fs([{ path: '/a.txt', data: text('hello') }]);
    const stat = await client.promises.stat('/a.txt');
    expect(stat.isFile()).toBe(true);
    expect(stat.isDirectory()).toBe(false);
    expect(stat.size).toBe(5);
  });

  it('reports stat for a directory', async () => {
    const client = fs([{ path: '/dir/a.txt', data: text('a') }]);
    const stat = await client.promises.stat('/dir');
    expect(stat.isDirectory()).toBe(true);
    expect(stat.isFile()).toBe(false);
  });

  it('lstat behaves the same as stat (no symlink support)', async () => {
    const client = fs([{ path: '/a.txt', data: text('a') }]);
    const stat = await client.promises.lstat('/a.txt');
    expect(stat.isFile()).toBe(true);
  });

  it('throws for every mutating operation', async () => {
    const client = fs([]);
    await expect(client.promises.writeFile('/a.txt', 'x')).rejects.toThrow(/read-only/);
    await expect(client.promises.unlink('/a.txt')).rejects.toThrow(/read-only/);
    await expect(client.promises.mkdir('/dir')).rejects.toThrow(/read-only/);
    await expect(client.promises.rmdir('/dir')).rejects.toThrow(/read-only/);
  });

  it('normalizes duplicate slashes and trailing slashes', async () => {
    const client = fs([{ path: '/dir//a.txt', data: text('a') }]);
    expect(await client.promises.readFile('/dir/a.txt/')).toBeDefined();
  });
});
