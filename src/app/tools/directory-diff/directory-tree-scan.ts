/**
 * Pure, framework-free folder scanning for the Directory Diff tool.
 *
 * The web build uses `<input webkitdirectory>` rather than the File System
 * Access API's `showDirectoryPicker()` — broad support (Chromium/Firefox/
 * Safari) over Chromium-only. The desktop (Electron) build instead uses a
 * native `dialog.showOpenDirectory` + Node `fs` walk (see
 * `NativeFsService`/`scanNativeEntries` below) — Electron's main process
 * already has full native filesystem access, so there's no need for either
 * browser API there, and the native path also supports live rescanning.
 *
 * Both paths produce the same `ScannedFile[]` shape: a flat list keyed by
 * relative path, with a `read()` closure that lazily supplies bytes so the
 * rest of the tool (`directory-diff.ts`) doesn't need to know which source
 * produced a given entry.
 */

export interface ScannedFile {
  readonly path: string;
  read(): Promise<ArrayBuffer>;
}

/**
 * `webkitRelativePath` starts with the picked folder's own name (`v1/src/a.ts`), but the native
 * walk is root-relative (`src/a.ts`). That first segment is stripped so both paths key files
 * identically. Before Phase 26's parity suite caught it, comparing web folders named differently
 * (`v1` vs `v2`) reported every file as added/removed.
 */
export function scanFileList(fileList: FileList): readonly ScannedFile[] {
  const files: ScannedFile[] = [];
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    const relative = file.webkitRelativePath;
    const slash = relative ? relative.indexOf('/') : -1;
    files.push({ path: slash >= 0 ? relative.slice(slash + 1) : relative || file.name, read: () => file.arrayBuffer() });
  }
  return files;
}

export function scanNativeEntries(
  entries: readonly { readonly path: string; readonly size: number }[],
  readFile: (relativePath: string) => Promise<ArrayBuffer>,
): readonly ScannedFile[] {
  return entries.map((entry) => ({ path: entry.path, read: () => readFile(entry.path) }));
}
