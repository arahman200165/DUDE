import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import type { ByteSegment, MutationOp, MutationPlanDraft } from "@dude/contracts/fs/fs-types";
import { countRanges, detectPartSets, partName, sizeRanges, type PartNaming } from "@dude/tool-engine/shared/fs/split-naming";
import { formatGnu, parseManifest } from "@dude/tool-engine/shared/fs/manifest-format";
import { registerFsJob, type FsJobContext } from './fs-jobs';
import { paramsOf } from './fs-job-walk';
import { hashFile } from './fs-hash';
import { resolveInRoot } from './fs-paths';

/**
 * File Split & Join jobs (Phase 29 items 5 and 6, Milestone 532). Split parts and joined files are
 * `create` ops built from byte ranges of the source — the mutation engine copies them straight from
 * the source at apply time, so a multi-gigabyte split never passes through a staging copy. A
 * `.sha256` sidecar (GNU format, `sha256sum -c --ignore-missing` compatible) records every part and
 * the original; join verifies the parts against it and the engine checks the joined result's
 * SHA-256 before it replaces anything.
 */

const MAX_PARTS = 10_000;

async function hashRanges(context: FsJobContext, source: string, prefix: Buffer | null, start: number, end: number, onBytes: (count: number) => void): Promise<string> {
  const hash = createHash('sha256');
  if (prefix) hash.update(prefix);
  if (end > start) for await (const chunk of createReadStream(source, { start, end: end - 1, highWaterMark: 1024 * 1024, signal: context.signal }) as AsyncIterable<Buffer>) { hash.update(chunk); onBytes(chunk.length); }
  return hash.digest('hex');
}

/** Byte offsets just past each `\n`, so line-based parts never cut a line (CRLF stays intact). */
async function lineStarts(context: FsJobContext, source: string, total: number): Promise<number[]> {
  const starts = [0];
  let offset = 0;
  for await (const chunk of createReadStream(source, { highWaterMark: 1024 * 1024, signal: context.signal }) as AsyncIterable<Buffer>) {
    for (let index = chunk.indexOf(10); index >= 0; index = chunk.indexOf(10, index + 1)) starts.push(offset + index + 1);
    offset += chunk.length;
    context.progress({ phase: 'Finding line breaks', scanned: starts.length, bytes: offset, total });
  }
  if (starts[starts.length - 1] !== total) starts.push(total);
  return starts;
}

registerFsJob('plan-split', async (context) => {
  const params = paramsOf(context);
  const source = context.root;
  const info = await fs.stat(source);
  if (!info.isFile()) throw new Error('Pick a file to split.');
  const outputRoot = typeof params['outputRoot'] === 'string' ? params['outputRoot'] : '';
  if (!outputRoot) throw new Error('Pick an output folder.');
  const naming: PartNaming = params['naming'] === 'alpha' || params['naming'] === 'numbered-ext' ? params['naming'] : 'numeric';
  const mode = params['mode'] === 'count' || params['mode'] === 'lines' ? params['mode'] : 'size';
  const name = basename(source);

  let parts: { prefix: Buffer | null; start: number; end: number }[];
  if (mode === 'lines') {
    const perPart = Math.max(1, Math.floor(Number(params['linesPerPart']) || 1000));
    const starts = await lineStarts(context, source, info.size);
    const repeatHeader = params['repeatHeader'] === true && starts.length > 2;
    const headerEnd = starts[1];
    const header = repeatHeader ? Buffer.alloc(headerEnd) : null;
    if (header) { const handle = await fs.open(source, 'r'); try { await handle.read(header, 0, headerEnd, 0); } finally { await handle.close(); } }
    const first = repeatHeader ? 1 : 0;
    const lineCount = starts.length - 1;
    parts = [];
    for (let line = first; line < lineCount; line += perPart) {
      const start = starts[line];
      const end = starts[Math.min(lineCount, line + perPart)];
      parts.push({ prefix: header && parts.length > 0 ? header : null, start: parts.length === 0 && header ? 0 : start, end });
    }
    if (!parts.length) parts = [{ prefix: null, start: 0, end: info.size }];
  } else {
    const ranges = mode === 'count' ? countRanges(info.size, Number(params['parts']) || 2) : sizeRanges(info.size, Number(params['partSize']) || 100 * 1024 * 1024);
    parts = ranges.map((range) => ({ prefix: null, ...range }));
  }
  if (parts.length > MAX_PARTS) throw new Error(`That would make ${parts.length.toLocaleString()} parts; the limit is ${MAX_PARTS.toLocaleString()}.`);
  const digits = Math.max(3, String(parts.length).length);

  const ops: MutationOp[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const sidecarEntries: { path: string; size: number; mtimeMs: number; digests: { 'SHA-256': string } }[] = [];
  const sourceExpect = [{ path: source, size: info.size, mtimeMs: info.mtimeMs }];
  await fs.mkdir(context.stagingDir, { recursive: true });
  let hashed = 0;
  for (let index = 0; index < parts.length; index++) {
    if (context.signal.aborted) throw new Error('Cancelled.');
    const part = parts[index];
    const fileName = partName(name, index, naming, digits);
    const target = join(outputRoot, fileName);
    if (await fs.stat(target).then(() => true, () => false)) throw new Error(`The output folder already contains ${fileName}. Choose another folder or naming.`);
    const digest = await hashRanges(context, source, part.prefix, part.start, part.end, (count) => { hashed += count; context.progress({ phase: 'Hashing parts', scanned: index, bytes: hashed, total: info.size }); });
    let staged: string | undefined;
    if (part.prefix) { staged = join(context.stagingDir, randomUUID()); await fs.writeFile(staged, part.prefix); }
    const segments: ByteSegment[] = [{ source, start: part.start, end: part.end }];
    const newSize = (part.prefix?.length ?? 0) + part.end - part.start;
    ops.push({ kind: 'create', path: target, ...(staged ? { staged } : {}), segments, sources: sourceExpect, sha256: digest, newSize, detail: `bytes ${part.start.toLocaleString()}–${part.end.toLocaleString()}${part.prefix ? ' + header' : ''}` });
    sidecarEntries.push({ path: fileName, size: newSize, mtimeMs: 0, digests: { 'SHA-256': digest } });
  }
  if (params['sidecar'] !== false) {
    const whole = (await hashFile(source, ['SHA-256'], { signal: context.signal }))['SHA-256'];
    const text = formatGnu([...sidecarEntries, { path: name, size: info.size, mtimeMs: 0, digests: { 'SHA-256': whole } }], 'SHA-256');
    const staged = join(context.stagingDir, randomUUID());
    await fs.writeFile(staged, text, 'utf8');
    const sidecar = join(outputRoot, `${name}.sha256`);
    if (await fs.stat(sidecar).then(() => true, () => false)) skipped.push({ path: `${name}.sha256`, reason: 'A checksum file with this name already exists; it was left alone.' });
    else ops.push({ kind: 'create', path: sidecar, staged, newSize: Buffer.byteLength(text), detail: 'SHA-256 of every part and of the original' });
  }
  const plan: MutationPlanDraft = { title: `Split ${name} into ${parts.length} part(s)`, tool: 'file-split-join', root: outputRoot, ops, skipped };
  return { plan, parts: parts.length };
});

registerFsJob('detect-parts', async (context) => {
  const names = await fs.readdir(context.root);
  const sets = detectPartSets(names);
  const detailed = await Promise.all(sets.map(async (set) => {
    const sizes = await Promise.all(set.parts.map(async (part) => (await fs.stat(join(context.root, part))).size));
    return { ...set, total: sizes.reduce((sum, size) => sum + size, 0), sidecar: names.includes(`${set.base}.sha256`) };
  }));
  return { sets: detailed };
});

registerFsJob('plan-join', async (context) => {
  const params = paramsOf(context);
  const base = typeof params['base'] === 'string' ? params['base'] : '';
  const outputRoot = typeof params['outputRoot'] === 'string' ? params['outputRoot'] : '';
  const outputName = typeof params['outputName'] === 'string' && params['outputName'].trim() ? params['outputName'].trim() : base;
  if (!base || !outputRoot) throw new Error('Choose a part set and an output folder.');
  if (/[\\/]/.test(outputName)) throw new Error('The output name must be a file name, not a path.');
  const set = detectPartSets(await fs.readdir(context.root)).find((candidate) => candidate.base === base);
  if (!set) throw new Error(`No parts of ${base} found in this folder.`);
  if (set.gaps.length && params['allowGaps'] !== true) throw new Error(`Part(s) ${set.gaps.join(', ')} are missing — joining would produce a corrupt file.`);
  const partPaths = set.parts.map((part) => resolveInRoot(context.root, part)!);
  const infos = await Promise.all(partPaths.map((path) => fs.stat(path)));
  const sources = partPaths.map((path, index) => ({ path, size: infos[index].size, mtimeMs: infos[index].mtimeMs }));
  const segments: ByteSegment[] = partPaths.map((path, index) => ({ source: path, start: 0, end: infos[index].size }));
  const total = infos.reduce((sum, info) => sum + info.size, 0);

  let expected: string | undefined;
  const checks: string[] = [];
  const sidecarPath = resolveInRoot(context.root, `${base}.sha256`)!;
  const sidecar = await fs.readFile(sidecarPath, 'utf8').catch(() => null);
  if (sidecar && params['verify'] !== false) {
    const lines = parseManifest(sidecar, 'SHA-256').entries;
    let bytes = 0;
    for (let index = 0; index < set.parts.length; index++) {
      if (context.signal.aborted) throw new Error('Cancelled.');
      const line = lines.find((entry) => entry.path === set.parts[index]);
      if (!line) { checks.push(`${set.parts[index]} is not in the checksum file`); continue; }
      const digest = (await hashFile(partPaths[index], ['SHA-256'], { signal: context.signal, onBytes: (count) => { bytes += count; context.progress({ phase: 'Verifying parts', scanned: index, bytes, total }); } }))['SHA-256'];
      if (digest !== line.digest) throw new Error(`${set.parts[index]} does not match its checksum — it is damaged or from a different split.`);
    }
    expected = lines.find((entry) => entry.path === base)?.digest;
  }
  const target = join(outputRoot, outputName);
  const ops: MutationOp[] = [{
    kind: 'create', path: target, segments, sources, newSize: total, ...(expected ? { sha256: expected } : {}),
    detail: `${set.parts.length} part(s)${expected ? ', verified against the original’s SHA-256' : sidecar ? '' : ', no checksum file to verify against'}`,
  }];
  const plan: MutationPlanDraft = { title: `Join ${set.parts.length} part(s) into ${outputName}`, tool: 'file-split-join', root: outputRoot, ops, skipped: checks.map((reason) => ({ path: base, reason })) };
  return { plan, verified: !!expected };
});
