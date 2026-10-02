import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import type { DuplicateGroup, WalkEntry } from "@dude/contracts/fs/fs-types";
import { sanitizeWalkOptions } from "@dude/tool-engine/shared/fs/walk-filter";
import { DEFAULT_NORMALIZE, decodeText, isProbablyBinary, normalizeText, type NormalizeOptions } from "@dude/tool-engine/shared/fs/text-normalize";
import { registerFsJob, type FsJobContext } from './fs-jobs';
import { paramsOf } from './fs-job-walk';
import { hashFile } from './fs-hash';
import { walkTree } from './fs-walk';
import { resolveInRoot } from './fs-paths';

/**
 * Duplicate Files (Phase 29 items 2 and 17, Milestone 528). Exact mode narrows candidates cheaply —
 * same size, then same head+tail 64 KiB fingerprint — before hashing whole files with SHA-256, and
 * can optionally confirm byte-for-byte. Content mode groups text files whose *normalized* content
 * matches (line endings, trailing whitespace, BOM, optionally all whitespace/case), for "same file,
 * different editor settings" duplicates. Read-only: removing extras is a separate Recycle Bin plan.
 */

const EDGE = 64 * 1024;
const MAX_CONTENT_BYTES = 16 * 1024 * 1024;


async function edgeFingerprint(path: string, size: number): Promise<string> {
  const handle = await open(path, 'r');
  try {
    const hash = createHash('sha1');
    const head = Buffer.alloc(Math.min(EDGE, size));
    await handle.read(head, 0, head.length, 0);
    hash.update(head);
    if (size > EDGE) {
      const tail = Buffer.alloc(Math.min(EDGE, size - EDGE));
      await handle.read(tail, 0, tail.length, size - tail.length);
      hash.update(tail);
    }
    return hash.digest('hex');
  } finally { await handle.close(); }
}

async function sameBytes(a: string, b: string): Promise<boolean> {
  const [left, right] = await Promise.all([open(a, 'r'), open(b, 'r')]);
  try {
    const bufferA = Buffer.alloc(1024 * 1024);
    const bufferB = Buffer.alloc(1024 * 1024);
    let position = 0;
    for (;;) {
      const [readA, readB] = await Promise.all([left.read(bufferA, 0, bufferA.length, position), right.read(bufferB, 0, bufferB.length, position)]);
      if (readA.bytesRead !== readB.bytesRead) return false;
      if (!readA.bytesRead) return true;
      if (!bufferA.subarray(0, readA.bytesRead).equals(bufferB.subarray(0, readB.bytesRead))) return false;
      position += readA.bytesRead;
    }
  } finally { await Promise.all([left.close(), right.close()]); }
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

async function listFiles(context: FsJobContext, minSize: number): Promise<WalkEntry[]> {
  const options = sanitizeWalkOptions(paramsOf(context)['options']);
  const files: WalkEntry[] = [];
  await walkTree(context.root, options, {
    signal: context.signal,
    onEntry: (entry) => { if (entry.kind === 'file' && entry.size >= minSize) files.push(entry); context.progress({ phase: 'Listing', scanned: files.length, bytes: 0, current: entry.path }); },
    onIssue: (issue) => context.issue(issue),
  }, options.skipHidden ? context.attributes : null);
  return files;
}

function toGroup(key: string, files: readonly WalkEntry[], identicalBytes: boolean): DuplicateGroup {
  const size = files[0].size;
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : 1)).map((file) => ({ path: file.path, size: file.size, mtimeMs: file.mtimeMs }));
  return { key, size, files: sorted, wasted: files.slice(1).reduce((sum, file) => sum + file.size, 0), identicalBytes };
}

async function exactGroups(context: FsJobContext, files: WalkEntry[], byteCompare: boolean): Promise<DuplicateGroup[]> {
  const absolute = (entry: WalkEntry) => resolveInRoot(context.root, entry.path)!;
  const bySize = [...groupBy(files, (file) => String(file.size)).values()].filter((group) => group.length > 1);
  const candidates = bySize.flat();
  let done = 0;
  const edge = new Map<string, string>();
  for (const file of candidates) {
    if (context.signal.aborted) throw new Error('Cancelled.');
    try { edge.set(file.path, await edgeFingerprint(absolute(file), file.size)); } catch (error) { context.issue({ path: file.path, code: 'READ', message: (error as Error).message }); }
    context.progress({ phase: 'Fingerprinting', scanned: ++done, bytes: 0, total: candidates.length, current: file.path });
  }
  const groups: DuplicateGroup[] = [];
  let hashedBytes = 0;
  for (const sizeGroup of bySize) {
    for (const edgeGroup of groupBy(sizeGroup.filter((file) => edge.has(file.path)), (file) => edge.get(file.path)!).values()) {
      if (edgeGroup.length < 2) continue;
      // Files no larger than both edges were fingerprinted in full already.
      const full = new Map<string, string>();
      for (const file of edgeGroup) {
        if (context.signal.aborted) throw new Error('Cancelled.');
        if (file.size <= EDGE * 2) { full.set(file.path, edge.get(file.path)!); continue; }
        try { full.set(file.path, (await hashFile(absolute(file), ['SHA-256'], { signal: context.signal, onBytes: (count) => { hashedBytes += count; context.progress({ phase: 'Hashing candidates', scanned: done, bytes: hashedBytes, current: file.path }); } }))['SHA-256']); }
        catch (error) { if (context.signal.aborted) throw new Error('Cancelled.'); context.issue({ path: file.path, code: 'READ', message: (error as Error).message }); }
      }
      for (const [digest, members] of groupBy(edgeGroup.filter((file) => full.has(file.path)), (file) => full.get(file.path)!)) {
        if (members.length < 2) continue;
        if (!byteCompare) { groups.push(toGroup(`${members[0].size}:${digest}`, members, true)); continue; }
        // Byte-for-byte confirmation against the first member; mismatches (hash collisions) split off.
        const confirmed = [members[0]];
        for (const member of members.slice(1)) if (await sameBytes(absolute(members[0]), absolute(member))) confirmed.push(member); else context.issue({ path: member.path, code: 'COLLISION', message: 'Same hash but different bytes.' });
        if (confirmed.length > 1) groups.push(toGroup(`${members[0].size}:${digest}`, confirmed, true));
      }
    }
  }
  return groups;
}

async function contentGroups(context: FsJobContext, files: WalkEntry[], normalize: NormalizeOptions): Promise<DuplicateGroup[]> {
  const keyed: { file: WalkEntry; key: string; raw: string }[] = [];
  let done = 0;
  for (const file of files) {
    if (context.signal.aborted) throw new Error('Cancelled.');
    context.progress({ phase: 'Normalizing text', scanned: ++done, bytes: 0, total: files.length, current: file.path });
    if (file.size > MAX_CONTENT_BYTES) continue;
    try {
      const bytes = await fs.readFile(resolveInRoot(context.root, file.path)!);
      if (isProbablyBinary(bytes)) continue;
      const text = normalizeText(decodeText(bytes), normalize);
      if (!text) continue;
      keyed.push({ file, key: createHash('sha256').update(text).digest('hex'), raw: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) { context.issue({ path: file.path, code: 'READ', message: (error as Error).message }); }
  }
  const groups: DuplicateGroup[] = [];
  for (const [key, members] of groupBy(keyed, (item) => item.key)) {
    if (members.length < 2) continue;
    const group = toGroup(`text:${key}`, members.map((member) => member.file), new Set(members.map((member) => member.raw)).size === 1);
    // Sizes differ in content mode; "wasted" is everything but the largest copy.
    const sizes = members.map((member) => member.file.size).sort((a, b) => b - a);
    groups.push({ ...group, size: sizes[0], wasted: sizes.slice(1).reduce((sum, size) => sum + size, 0) });
  }
  return groups;
}

registerFsJob('duplicates', async (context) => {
  const params = paramsOf(context);
  const mode = params['mode'] === 'content' ? 'content' : 'exact';
  const minSize = typeof params['minSize'] === 'number' && params['minSize'] >= 0 ? params['minSize'] : 1;
  const files = await listFiles(context, minSize);
  const normalize = { ...DEFAULT_NORMALIZE, ...(params['normalize'] && typeof params['normalize'] === 'object' ? params['normalize'] as Partial<NormalizeOptions> : {}) };
  const groups = mode === 'content' ? await contentGroups(context, files, normalize) : await exactGroups(context, files, params['byteCompare'] === true);
  groups.sort((a, b) => b.wasted - a.wasted || b.files.length - a.files.length);
  return { mode, scannedFiles: files.length, groups, duplicateFiles: groups.reduce((sum, group) => sum + group.files.length - 1, 0), wasted: groups.reduce((sum, group) => sum + group.wasted, 0) };
});
