import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { isSafeModulePath, walkDependencies, type DependencyPeImage } from './dependency-walker';

const roots: string[] = [];
async function fixture(images: Readonly<Record<string, DependencyPeImage>>, options: { maxDepth?: number } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dude-forwarders-'));
  roots.push(directory);
  await mkdir(join(directory, 'System32'));
  for (const name of Object.keys(images)) await writeFile(join(directory, name), Buffer.alloc(64 * 1024));
  const rootPath = join(directory, 'root.exe');
  const imageMap = new Map(Object.entries(images).map(([name, image]) => [name.toLowerCase(), image]));
  const result = await walkDependencies(rootPath, {
    search: { applicationDirectory: directory, windowsDirectory: join(directory, 'Windows'), systemDirectory: join(directory, 'System32'), targetArchitecture: 'x64', pathDirectories: [] },
    parsePe: (_bytes, path) => {
      const image = imageMap.get(basename(path).toLowerCase());
      if (!image) throw new Error('No fixture image for ' + path);
      return image;
    },
    ...options,
  });
  return result.imports[0];
}
function image(overrides: Partial<DependencyPeImage> = {}): DependencyPeImage {
  return { machine: 'x64', imports: [], exports: [], ...overrides };
}

afterEach(async () => { await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('Dependency Walker export forwarder chains', () => {
  it('follows a multi-hop chain to the exported terminal symbol', async () => {
    const result = await fixture({
      'root.exe': image({ imports: [{ name: 'A.dll', symbols: [{ name: 'Start' }] }] }),
      'A.dll': image({ exports: [{ name: 'Start', ordinal: 1, forwardedTo: 'B.Middle' }] }),
      'B.dll': image({ exports: [{ name: 'Middle', ordinal: 2, forwardedTo: 'C.Final' }] }),
      'C.dll': image({ exports: [{ name: 'Final', ordinal: 3 }] }),
    });
    expect(result?.forwarderChains?.[0]).toMatchObject({ status: 'resolved', chain: ['A.dll!Start', 'B.dll!Middle', 'C.dll!Final'] });
  });

  it('reports missing forwarder modules and target symbols', async () => {
    const missingModule = await fixture({
      'root.exe': image({ imports: [{ name: 'A.dll', symbols: [{ name: 'Start' }] }] }),
      'A.dll': image({ exports: [{ name: 'Start', ordinal: 1, forwardedTo: 'Missing.Target' }] }),
    });
    expect(missingModule?.forwarderChains?.[0]?.status).toBe('missing-module');
    const missingSymbol = await fixture({
      'root.exe': image({ imports: [{ name: 'A.dll', symbols: [{ name: 'Start' }] }] }),
      'A.dll': image({ exports: [{ name: 'Start', ordinal: 1, forwardedTo: 'B.Absent' }] }),
      'B.dll': image(),
    });
    expect(missingSymbol?.forwarderChains?.[0]?.status).toBe('missing-symbol');
  });

  it('stops cycles, depth overruns, and architecture mismatches with explicit statuses', async () => {
    const cycle = await fixture({
      'root.exe': image({ imports: [{ name: 'A.dll', symbols: [{ name: 'Start' }] }] }),
      'A.dll': image({ exports: [{ name: 'Start', ordinal: 1, forwardedTo: 'B.Go' }] }),
      'B.dll': image({ exports: [{ name: 'Go', ordinal: 2, forwardedTo: 'A.Start' }] }),
    });
    expect(cycle?.forwarderChains?.[0]?.status).toBe('cycle');
    const depth = await fixture({
      'root.exe': image({ imports: [{ name: 'A.dll', symbols: [{ name: 'Start' }] }] }),
      'A.dll': image({ exports: [{ name: 'Start', ordinal: 1, forwardedTo: 'B.Go' }] }),
      'B.dll': image({ exports: [{ name: 'Go', ordinal: 2, forwardedTo: 'C.End' }] }),
      'C.dll': image({ exports: [{ name: 'End', ordinal: 3 }] }),
    }, { maxDepth: 1 });
    expect(depth?.forwarderChains?.[0]?.status).toBe('limit');
    const architecture = await fixture({
      'root.exe': image({ imports: [{ name: 'A.dll', symbols: [{ name: 'Start' }] }] }),
      'A.dll': image({ exports: [{ name: 'Start', ordinal: 1, forwardedTo: 'B.Go' }] }),
      'B.dll': image({ machine: 'x86', exports: [{ name: 'Go', ordinal: 2 }] }),
    });
    expect(architecture?.forwarderChains?.[0]?.status).toBe('architecture-mismatch');
  });
});

describe('Dependency Walker hostile paths', () => {
  it('only accepts bounded absolute drive-letter module paths', () => {
    expect(isSafeModulePath('C:\\Windows\\System32\\kernel32.dll')).toBe(true);
    expect(isSafeModulePath('C:/Windows/notepad.exe')).toBe(true);
    for (const hostile of [
      '\\\\?\\C:\\Windows\\System32\\kernel32.dll', '\\\\.\\PhysicalDrive0', '\\\\?\\GLOBALROOT\\Device\\x.dll',
      'C:\\App\\..\\..\\Windows\\evil.dll', 'kernel32.dll', '..\\evil.dll', 'C:\\Windows\\win.ini', 'C:\\a\\b.dll\u0000.txt',
      '\\\\server\\share\\evil.dll',
    ]) expect(isSafeModulePath(hostile), hostile).toBe(false);
    expect(isSafeModulePath('\\\\server\\share\\picked.exe', true)).toBe(true);
    expect(isSafeModulePath('\\\\?\\UNC\\server\\share\\picked.exe', true)).toBe(false);
  });

  it('refuses a device-path root and reports hostile import names as missing without reading them', async () => {
    const options = { search: { applicationDirectory: 'C:\\Nonexistent', windowsDirectory: 'C:\\Nonexistent\\Windows', systemDirectory: 'C:\\Nonexistent\\System32', targetArchitecture: 'x64' as const, pathDirectories: [] } };
    await expect(walkDependencies('\\\\.\\PhysicalDrive0', options)).rejects.toThrow();
    await expect(walkDependencies('\\\\?\\C:\\x\\root.exe', options)).rejects.toThrow();
    const result = await fixture({
      'root.exe': image({ imports: [{ name: '\\\\server\\share\\evil.dll' }, { name: '..\\..\\evil.dll' }, { name: '\\\\?\\C:\\evil.dll' }] }),
    });
    expect(result?.status).toBe('missing');
  });

  it('caps the header read at maxHeaderBytes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dude-cap-'));
    roots.push(directory);
    const root = join(directory, 'root.exe');
    await writeFile(root, Buffer.alloc(512 * 1024));
    let seen = -1;
    await walkDependencies(root, {
      search: { applicationDirectory: directory, windowsDirectory: directory, systemDirectory: directory, targetArchitecture: 'x64', pathDirectories: [] },
      maxHeaderBytes: 64 * 1024, parsePe: (bytes) => { seen = bytes.length; return { machine: 'x64', imports: [] }; },
    });
    expect(seen).toBe(64 * 1024);
  });
});
