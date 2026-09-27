import { scanFileList, scanNativeEntries } from './directory-tree-scan';

function fakeFileList(files: readonly File[]): FileList {
  const list = files.slice() as unknown as FileList & File[];
  return list;
}

function fakeFile(name: string, relativePath: string): File {
  const file = new File(['content'], name) as File & { webkitRelativePath: string };
  Object.defineProperty(file, 'webkitRelativePath', { value: relativePath, configurable: true });
  return file;
}

describe('scanFileList', () => {
  it("uses webkitRelativePath minus the picked folder's own name, like the root-relative native walk", async () => {
    const file = fakeFile('a.txt', 'my-folder/sub/a.txt');
    const result = scanFileList(fakeFileList([file]));
    expect(result.map((r) => r.path)).toEqual(['sub/a.txt']);
    expect(new TextDecoder().decode(await result[0].read())).toBe('content');
  });

  it('falls back to the plain file name when webkitRelativePath is empty', () => {
    const file = new File(['content'], 'plain.txt');
    const result = scanFileList(fakeFileList([file]));
    expect(result.map((r) => r.path)).toEqual(['plain.txt']);
  });

  it('scans multiple files', () => {
    const a = fakeFile('a.txt', 'dir/a.txt');
    const b = fakeFile('b.txt', 'dir/b.txt');
    const result = scanFileList(fakeFileList([a, b]));
    expect(result.map((r) => r.path)).toEqual(['a.txt', 'b.txt']);
  });

  it('returns an empty array for an empty FileList', () => {
    expect(scanFileList(fakeFileList([]))).toEqual([]);
  });
});

describe('scanNativeEntries', () => {
  it('wraps each entry with a read() closure bound to its own path', async () => {
    const reads: string[] = [];
    const readFile = async (relativePath: string) => {
      reads.push(relativePath);
      return new TextEncoder().encode(`data:${relativePath}`).buffer;
    };

    const result = scanNativeEntries([{ path: 'a.txt', size: 1 }, { path: 'dir/b.txt', size: 2 }], readFile);
    expect(result.map((r) => r.path)).toEqual(['a.txt', 'dir/b.txt']);

    const bytes = await result[1].read();
    expect(new TextDecoder().decode(bytes)).toBe('data:dir/b.txt');
    expect(reads).toEqual(['dir/b.txt']);
  });

  it('returns an empty array for no entries', () => {
    expect(scanNativeEntries([], async () => new ArrayBuffer(0))).toEqual([]);
  });
});
