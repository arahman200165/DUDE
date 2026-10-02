import { buildNativeFsClient } from './git-native-fs-client';
import type { NativeFsService } from '../../core/platform/native-fs.service';

function text(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer;
}

function fakeNativeFs(overrides: Partial<NativeFsService> = {}): NativeFsService {
  return {
    pickDirectory: async () => ({ canceled: true }),
    walk: async () => [],
    readFile: async () => {
      throw Object.assign(new Error("ENOENT: no such file, open 'x'"), { code: 'ENOENT' });
    },
    readdir: async () => {
      throw Object.assign(new Error("ENOENT: no such directory, scandir 'x'"), { code: 'ENOENT' });
    },
    stat: async () => {
      throw Object.assign(new Error("ENOENT: no such file or directory, stat 'x'"), { code: 'ENOENT' });
    },
    ...overrides,
  } as NativeFsService;
}

describe('buildNativeFsClient', () => {
  it('reads a file back as raw bytes by default', async () => {
    const client = buildNativeFsClient(fakeNativeFs({ readFile: async () => text('hello') }), '/repo');
    const result = await client.promises.readFile('/a.txt');
    expect(new TextDecoder().decode(result as Uint8Array)).toBe('hello');
  });

  it('decodes to a string when utf8 encoding is requested via a string option', async () => {
    const client = buildNativeFsClient(fakeNativeFs({ readFile: async () => text('hello') }), '/repo');
    expect(await client.promises.readFile('/a.txt', 'utf8')).toBe('hello');
  });

  it('decodes to a string when utf8 encoding is requested via an options object', async () => {
    const client = buildNativeFsClient(fakeNativeFs({ readFile: async () => text('hello') }), '/repo');
    expect(await client.promises.readFile('/a.txt', { encoding: 'utf8' })).toBe('hello');
  });

  it('throws a ReadOnlyFsError with code ENOENT for a missing file', async () => {
    const client = buildNativeFsClient(fakeNativeFs(), '/repo');
    await expect(client.promises.readFile('/missing.txt')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(client.promises.readFile('/missing.txt')).rejects.toThrow(/ENOENT/);
  });

  it('strips the leading slash before calling readFile/readdir/stat', async () => {
    const calls: string[] = [];
    const client = buildNativeFsClient(
      fakeNativeFs({
        readdir: async (_root, relativePath) => {
          calls.push(relativePath);
          return ['a.txt', 'sub'];
        },
      }),
      '/repo',
    );
    expect(await client.promises.readdir('/dir')).toEqual(['a.txt', 'sub']);
    expect(calls).toEqual(['dir']);
  });

  it('reports stat for a file with correct isFile/isDirectory/size', async () => {
    const client = buildNativeFsClient(
      fakeNativeFs({ stat: async () => ({ isFile: true, isDirectory: false, isSymbolicLink: false, size: 5, mtimeMs: 0 }) }),
      '/repo',
    );
    const stat = await client.promises.stat('/a.txt');
    expect(stat.isFile()).toBe(true);
    expect(stat.isDirectory()).toBe(false);
    expect(stat.size).toBe(5);
  });

  it('calls stat with followSymlink=true and lstat with followSymlink=false', async () => {
    const calls: boolean[] = [];
    const client = buildNativeFsClient(
      fakeNativeFs({
        stat: async (_root, _path, followSymlink) => {
          calls.push(followSymlink);
          return { isFile: true, isDirectory: false, isSymbolicLink: false, size: 0, mtimeMs: 0 };
        },
      }),
      '/repo',
    );
    await client.promises.stat('/a.txt');
    await client.promises.lstat('/a.txt');
    expect(calls).toEqual([true, false]);
  });

  it('throws for every mutating operation', async () => {
    const client = buildNativeFsClient(fakeNativeFs(), '/repo');
    await expect(client.promises.writeFile('/a.txt', 'x')).rejects.toThrow(/read-only/);
    await expect(client.promises.unlink('/a.txt')).rejects.toThrow(/read-only/);
    await expect(client.promises.mkdir('/dir')).rejects.toThrow(/read-only/);
    await expect(client.promises.rmdir('/dir')).rejects.toThrow(/read-only/);
  });
});
