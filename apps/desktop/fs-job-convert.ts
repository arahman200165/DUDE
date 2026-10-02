import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { MutationOp, MutationPlanDraft, WalkEntry } from "@dude/contracts/fs/fs-types";
import { sanitizeWalkOptions } from "@dude/tool-engine/shared/fs/walk-filter";
import { convertText, DEFAULT_CONVERT, inventory, type ConvertOptions } from "@dude/tool-engine/shared/fs/text-convert";
import { editorConfigToOptions, parseEditorConfig, resolveEditorConfig, type EditorConfigFile } from "@dude/tool-engine/shared/fs/editorconfig";
import { registerFsJob, type FsJobContext } from './fs-jobs';
import { paramsOf } from './fs-job-walk';
import { walkTree } from './fs-walk';
import { resolveInRoot } from './fs-paths';
import { encodeText, encodingSupported, readTextFile, roundTrips } from './fs-text-io';

/**
 * Batch Text Converter jobs (Phase 29 items 7 and 8, Milestone 531): an inventory of a tree's line
 * endings, encodings, BOMs, final newlines, trailing whitespace and indentation, and a conversion
 * plan that re-encodes files with iconv-lite. A conversion that would lose characters (the target
 * encoding can't represent them) is left out of the plan with the reason, never written lossy.
 */

export function convertOptionsOf(raw: unknown): ConvertOptions {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<ConvertOptions>;
  const pick = <T extends string>(input: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(input as T) ? (input as T) : fallback);
  return {
    eol: pick(value.eol, ['keep', 'lf', 'crlf', 'cr'], 'keep'),
    encoding: typeof value.encoding === 'string' && value.encoding ? value.encoding : 'keep',
    bom: pick(value.bom, ['keep', 'add', 'strip'], 'keep'),
    finalNewline: pick(value.finalNewline, ['keep', 'ensure', 'strip'], 'keep'),
    trimTrailing: value.trimTrailing === true,
    indent: pick(value.indent, ['keep', 'tabs', 'spaces'], 'keep'),
    indentSize: Math.min(16, Math.max(1, Math.floor(Number(value.indentSize) || DEFAULT_CONVERT.indentSize))),
    editorconfig: value.editorconfig === true,
  };
}

async function textFiles(context: FsJobContext): Promise<{ files: WalkEntry[]; editorconfigs: Map<string, EditorConfigFile> }> {
  const options = sanitizeWalkOptions(paramsOf(context)['options']);
  const files: WalkEntry[] = [];
  const editorconfigs = new Map<string, EditorConfigFile>();
  const configPaths: string[] = [];
  await walkTree(context.root, options, {
    signal: context.signal,
    onEntry: (entry) => {
      if (entry.kind !== 'file') return;
      if (entry.path === '.editorconfig' || entry.path.endsWith('/.editorconfig')) configPaths.push(entry.path);
      else files.push(entry);
      context.progress({ phase: 'Listing', scanned: files.length, bytes: 0, current: entry.path });
    },
    onIssue: (issue) => context.issue(issue),
  }, options.skipHidden ? context.attributes : null);
  for (const path of configPaths) {
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    editorconfigs.set(dir, parseEditorConfig(await fs.readFile(resolveInRoot(context.root, path)!, 'utf8'), dir));
  }
  return { files, editorconfigs };
}

registerFsJob('text-inventory', async (context) => {
  const params = paramsOf(context);
  const fallback = typeof params['fallbackEncoding'] === 'string' ? params['fallbackEncoding'] : 'win1252';
  const { files } = await textFiles(context);
  let done = 0;
  let binary = 0;
  for (const entry of files) {
    if (context.signal.aborted) throw new Error('Cancelled.');
    context.progress({ phase: 'Reading', scanned: ++done, bytes: 0, total: files.length, current: entry.path });
    try {
      const decoded = await readTextFile(resolveInRoot(context.root, entry.path)!, { fallback });
      if (!decoded) { binary++; continue; }
      context.batch({ path: entry.path, size: entry.size, encoding: decoded.encoding, bom: decoded.bom, ...inventory(decoded.text) });
    } catch (error) { context.issue({ path: entry.path, code: 'READ', message: (error as Error).message }); }
  }
  return { files: files.length, binary };
});

function visible(text: string): string {
  return text.split('\n').slice(0, 6).join('\n').replace(/\r/g, '␍').replace(/\n/g, '␊\n').replace(/\t/g, '→');
}

registerFsJob('plan-convert', async (context) => {
  const params = paramsOf(context);
  const base = convertOptionsOf(params['convert']);
  const fallback = typeof params['fallbackEncoding'] === 'string' ? params['fallbackEncoding'] : 'win1252';
  const only = Array.isArray(params['paths']) ? new Set(params['paths'].filter((item): item is string => typeof item === 'string')) : null;
  const { files, editorconfigs } = await textFiles(context);
  const ops: MutationOp[] = [];
  const skipped: { path: string; reason: string }[] = [];
  await fs.mkdir(context.stagingDir, { recursive: true });
  let done = 0;
  for (const entry of files) {
    if (context.signal.aborted) throw new Error('Cancelled.');
    if (only && !only.has(entry.path)) continue;
    context.progress({ phase: 'Converting', scanned: ++done, bytes: 0, total: only?.size ?? files.length, current: entry.path });
    const absolute = resolveInRoot(context.root, entry.path)!;
    try {
      const info = await fs.stat(absolute);
      const decoded = await readTextFile(absolute, { fallback });
      if (!decoded) continue;
      const options = base.editorconfig ? editorConfigToOptions(resolveEditorConfig(entry.path, editorconfigs)) : base;
      const { text, changes } = convertText(decoded.text, options);
      const encoding = options.encoding === 'keep' ? decoded.encoding : options.encoding;
      const bom = options.bom === 'keep' ? decoded.bom : options.bom === 'add';
      if (!encodingSupported(encoding)) { skipped.push({ path: entry.path, reason: `Unknown encoding “${encoding}”.` }); continue; }
      if (!roundTrips(text, encoding)) { skipped.push({ path: entry.path, reason: `Contains characters ${encoding} can’t represent — converting would lose them.` }); continue; }
      const bytes = encodeText(text, encoding, bom);
      if (bytes.equals(decoded.bytes)) continue;
      if (encoding !== decoded.encoding) changes.unshift(`${decoded.encoding} → ${encoding}`);
      if (bom !== decoded.bom) changes.push(bom ? 'added BOM' : 'removed BOM');
      const staged = join(context.stagingDir, randomUUID());
      await fs.writeFile(staged, bytes);
      ops.push({
        kind: 'write', path: absolute, staged, expect: { size: info.size, mtimeMs: info.mtimeMs }, newSize: bytes.length,
        detail: changes.join(', ') || 're-encoded',
        sample: { before: visible(decoded.text), after: visible(text) },
      });
    } catch (error) { skipped.push({ path: entry.path, reason: (error as Error).message }); }
  }
  const plan: MutationPlanDraft = { title: `Convert ${ops.length} text file(s)`, tool: 'batch-text-converter', root: context.root, ops, skipped };
  return { plan };
});
