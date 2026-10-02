import { hostCrypto } from "@dude/crypto/host";
/**
 * Pure directory-tree diffing. Runs inside `directory-diff.worker.ts` for
 * the content-hashing pass across potentially many files (PRD §15.2's
 * "candidate worker-backed operation").
 *
 * Deliberately takes raw `ArrayBuffer`s rather than `File` objects — the
 * main thread reads each file via `File.arrayBuffer()` before dispatching,
 * so the payload can be transferred (`WorkerClientService`'s `transfer`
 * param) instead of structured-cloned.
 */

export type EntryStatus = 'added' | 'removed' | 'changed' | 'unchanged';

export interface TreeDiffEntry {
  readonly path: string;
  readonly status: EntryStatus;
  readonly leftSize?: number;
  readonly rightSize?: number;
}

export interface DirectoryDiffFileEntry {
  readonly path: string;
  readonly size: number;
  readonly buffer: ArrayBuffer;
}

export interface DirectoryDiffPayload {
  readonly left: readonly DirectoryDiffFileEntry[];
  readonly right: readonly DirectoryDiffFileEntry[];
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await hostCrypto().subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function diffDirectoryPayload(payload: DirectoryDiffPayload): Promise<readonly TreeDiffEntry[]> {
  const leftByPath = new Map(payload.left.map((entry) => [entry.path, entry]));
  const rightByPath = new Map(payload.right.map((entry) => [entry.path, entry]));
  const allPaths = new Set([...leftByPath.keys(), ...rightByPath.keys()]);

  const entries: TreeDiffEntry[] = [];

  for (const path of allPaths) {
    const left = leftByPath.get(path);
    const right = rightByPath.get(path);

    if (!left) {
      entries.push({ path, status: 'added', rightSize: right!.size });
      continue;
    }
    if (!right) {
      entries.push({ path, status: 'removed', leftSize: left.size });
      continue;
    }
    if (left.size !== right.size) {
      entries.push({ path, status: 'changed', leftSize: left.size, rightSize: right.size });
      continue;
    }

    // Cheap size check ruled out an obvious difference; only hash when sizes match.
    const [leftHash, rightHash] = await Promise.all([sha256Hex(left.buffer), sha256Hex(right.buffer)]);
    entries.push({
      path,
      status: leftHash === rightHash ? 'unchanged' : 'changed',
      leftSize: left.size,
      rightSize: right.size,
    });
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
