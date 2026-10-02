import { DirectoryDiffFileEntry, diffDirectoryPayload } from "./directory-tree-diff.js";
import { ScannedFile, scanFileList, scanNativeEntries } from "./directory-tree-scan.js";

// Web/desktop adapter parity (DUDE_PRD.md §33.4, Phase 26 Item 15) for Directory Diff's
// `native-fs` fallback. The same two folder trees reach the diff through the web path
// (`<input webkitdirectory>`, `scanFileList`) and the desktop path (native walk + readFile,
// `scanNativeEntries`). The diff must be identical. This suite caught web paths carrying the
// picked folder's own name.

const LEFT = { 'README.md': '# v1', 'src/a.ts': 'export const a = 1;', 'src/gone.ts': 'old', 'bin/data.bin': '\u0000\u0001' };
const RIGHT = { 'README.md': '# v1', 'src/a.ts': 'export const a = 2;', 'src/new.ts': 'new', 'bin/data.bin': '\u0000\u0002' };

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer;

function webFolder(folderName: string, tree: Record<string, string>): readonly ScannedFile[] {
  const files = Object.entries(tree).map(([path, text]) => {
    const file = new File([text], path.split('/').pop()!);
    Object.defineProperty(file, 'webkitRelativePath', { value: `${folderName}/${path}` });
    return file;
  });
  return scanFileList(files as unknown as FileList);
}

function nativeFolder(tree: Record<string, string>): readonly ScannedFile[] {
  const entries = Object.entries(tree).map(([path, text]) => ({ path, size: bytes(text).byteLength }));
  return scanNativeEntries(entries, async (path) => bytes(tree[path as keyof typeof tree]));
}

async function payload(files: readonly ScannedFile[]): Promise<DirectoryDiffFileEntry[]> {
  return Promise.all(files.map(async (file) => ({ path: file.path, size: (await file.read()).byteLength, buffer: await file.read() })));
}

async function diff(left: readonly ScannedFile[], right: readonly ScannedFile[]) {
  return diffDirectoryPayload({ left: await payload(left), right: await payload(right) });
}

describe('Directory Diff: web/desktop adapter parity', () => {
  it('produces the identical diff from a webkitdirectory upload and a native folder walk', async () => {
    // Different folder names on the web side, as when comparing "v1" against "v2".
    const web = await diff(webFolder('v1', LEFT), webFolder('v2', RIGHT));
    const desktop = await diff(nativeFolder(LEFT), nativeFolder(RIGHT));

    expect(web).toEqual(desktop);
    expect(desktop.map((entry) => `${entry.status}:${entry.path}`).sort()).toEqual([
      'added:src/new.ts',
      'changed:bin/data.bin',
      'changed:src/a.ts',
      'removed:src/gone.ts',
      'unchanged:README.md',
    ]);
  });
});
