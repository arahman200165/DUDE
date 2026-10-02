import type { ScannedFile } from "../directory-diff/directory-tree-scan.js";
import type { InMemoryFile } from "./git-fs-shim.js";

/**
 * The web build's folder-upload → in-memory repo conversion, kept pure so the web/desktop parity
 * suite runs the exact path the component uses. `scanFileList` already strips the picked folder's
 * own name, so these paths are root-relative, the same as the native client sees.
 */
export async function toInMemoryRepoFiles(scanned: readonly ScannedFile[]): Promise<InMemoryFile[]> {
  const files = await Promise.all(scanned.map(async (entry) => ({ path: `/${entry.path}`, data: new Uint8Array(await entry.read()) })));
  if (!files.some((file) => file.path.startsWith('/.git/'))) {
    throw new Error('No .git folder found in the selected folder — select a folder containing a git repository.');
  }
  return files;
}
