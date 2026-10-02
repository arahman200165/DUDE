import { diffDirectoryPayload, DirectoryDiffFileEntry } from "./directory-tree-diff.js";

function entry(path: string, text: string): DirectoryDiffFileEntry {
  const buffer = new TextEncoder().encode(text).buffer;
  return { path, size: buffer.byteLength, buffer };
}

describe('diffDirectoryPayload', () => {
  it('reports a file present only on the left as removed', async () => {
    const result = await diffDirectoryPayload({ left: [entry('a.txt', 'hello')], right: [] });
    expect(result).toEqual([{ path: 'a.txt', status: 'removed', leftSize: 5 }]);
  });

  it('reports a file present only on the right as added', async () => {
    const result = await diffDirectoryPayload({ left: [], right: [entry('a.txt', 'hello')] });
    expect(result).toEqual([{ path: 'a.txt', status: 'added', rightSize: 5 }]);
  });

  it('reports identical files as unchanged', async () => {
    const result = await diffDirectoryPayload({ left: [entry('a.txt', 'hello')], right: [entry('a.txt', 'hello')] });
    expect(result).toEqual([{ path: 'a.txt', status: 'unchanged', leftSize: 5, rightSize: 5 }]);
  });

  it('reports files with different sizes as changed without hashing', async () => {
    const result = await diffDirectoryPayload({ left: [entry('a.txt', 'hi')], right: [entry('a.txt', 'hello')] });
    expect(result).toEqual([{ path: 'a.txt', status: 'changed', leftSize: 2, rightSize: 5 }]);
  });

  it('reports same-size files with different content as changed', async () => {
    const result = await diffDirectoryPayload({ left: [entry('a.txt', 'abcde')], right: [entry('a.txt', 'xyzde')] });
    expect(result).toEqual([{ path: 'a.txt', status: 'changed', leftSize: 5, rightSize: 5 }]);
  });

  it('sorts entries by path', async () => {
    const result = await diffDirectoryPayload({
      left: [entry('b.txt', '1'), entry('a.txt', '1')],
      right: [entry('b.txt', '1'), entry('a.txt', '1')],
    });
    expect(result.map((r) => r.path)).toEqual(['a.txt', 'b.txt']);
  });

  it('handles an empty comparison', async () => {
    expect(await diffDirectoryPayload({ left: [], right: [] })).toEqual([]);
  });
});
