import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import picomatch from 'picomatch';
import type { MutationOp, MutationPlanDraft, WalkEntry } from "@dude/contracts/fs/fs-types";
import { sanitizeWalkOptions } from "@dude/tool-engine/shared/fs/walk-filter";
import { compileQuery, replaceLines, searchLines, type SearchQuery } from "@dude/tool-engine/shared/fs/text-search";
import { sniffFileType } from "@dude/shared-types/shared/file-signatures";
import { registerFsJob, type FsJobContext } from './fs-jobs';
import { paramsOf } from './fs-job-walk';
import { walkTree } from './fs-walk';
import { resolveInRoot } from './fs-paths';
import { decodeBytes, encodeText, readTextFile, splitLines } from './fs-text-io';

/**
 * Tree Search jobs (Phase 29 items 18 and 19, Milestone 529): ripgrep-style content search,
 * metadata search (name, extension, size, age, magic-byte type, empty), streaming text for
 * structured queries evaluated in the renderer (JSONPath/JMESPath/YAML path/XPath reuse the
 * existing tools' evaluators there, since XPath needs the DOM), and search-and-replace plans.
 */

const MAX_TOTAL_MATCHES = 100_000;
const MAX_STRUCTURED_BYTES = 8 * 1024 * 1024;

function queryOf(params: Record<string, unknown>): SearchQuery {
  return {
    pattern: typeof params['pattern'] === 'string' ? params['pattern'] : '',
    regex: params['regex'] === true,
    caseSensitive: params['caseSensitive'] === true,
    wholeWord: params['wholeWord'] === true,
  };
}

async function eachFile(context: FsJobContext, phase: string, visit: (entry: WalkEntry, absolute: string) => Promise<void>, includeDirs = false): Promise<number> {
  const options = sanitizeWalkOptions(paramsOf(context)['options']);
  const files: WalkEntry[] = [];
  await walkTree(context.root, options, {
    signal: context.signal,
    includeDirs,
    onEntry: (entry) => { if (entry.kind === 'file' || (includeDirs && entry.kind === 'dir')) files.push(entry); },
    onIssue: (issue) => context.issue(issue),
  }, options.skipHidden ? context.attributes : null);
  let done = 0;
  for (const entry of files) {
    if (context.signal.aborted) throw new Error('Cancelled.');
    context.progress({ phase, scanned: ++done, bytes: 0, total: files.length, current: entry.path });
    try { await visit(entry, resolveInRoot(context.root, entry.path)!); }
    catch (error) { context.issue({ path: entry.path, code: (error as { code?: string }).code ?? 'READ', message: (error as Error).message }); }
  }
  return files.length;
}

registerFsJob('tree-search', async (context) => {
  const params = paramsOf(context);
  const regex = compileQuery(queryOf(params));
  const contextLines = Math.min(5, Math.max(0, Number(params['context']) || 0));
  const perFile = Math.min(1000, Math.max(1, Number(params['maxPerFile']) || 200));
  const fallback = typeof params['fallbackEncoding'] === 'string' ? params['fallbackEncoding'] : 'win1252';
  let total = 0;
  let filesMatched = 0;
  let skippedBinary = 0;
  let skippedLarge = 0;
  let truncated = false;
  const scanned = await eachFile(context, 'Searching', async (entry, absolute) => {
    if (total >= MAX_TOTAL_MATCHES) { truncated = true; return; }
    const decoded = await readTextFile(absolute, { fallback });
    if (!decoded) { if (entry.size > 32 * 1024 * 1024) skippedLarge++; else skippedBinary++; return; }
    const lines = splitLines(decoded.text).map((part) => part.line);
    const result = searchLines(lines, regex, contextLines, perFile);
    if (!result.total) return;
    filesMatched++;
    total += result.total;
    context.batch({ path: entry.path, size: entry.size, encoding: decoded.encoding, total: result.total, matches: result.matches });
  });
  return { scanned, filesMatched, total, skippedBinary, skippedLarge, truncated };
});

function typeOf(head: Uint8Array): string {
  return sniffFileType(head)?.extension ?? '';
}

registerFsJob('metadata-search', async (context) => {
  const params = paramsOf(context);
  const names = Array.isArray(params['names']) ? params['names'].filter((item): item is string => typeof item === 'string' && !!item.trim()) : [];
  const nameMatch = names.length ? picomatch(names, { nocase: true, dot: true }) : null;
  const extensions = new Set((Array.isArray(params['extensions']) ? params['extensions'] : []).filter((item): item is string => typeof item === 'string').map((item) => item.replace(/^\./, '').toLowerCase()).filter(Boolean));
  const types = new Set((Array.isArray(params['types']) ? params['types'] : []).filter((item): item is string => typeof item === 'string').map((item) => item.toLowerCase()));
  const emptyOnly = params['emptyOnly'] === true;
  let found = 0;
  const childCounts = new Map<string, number>();
  const dirs: WalkEntry[] = [];
  const scanned = await eachFile(context, 'Matching', async (entry, absolute) => {
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
    const parent = entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '';
    childCounts.set(parent, (childCounts.get(parent) ?? 0) + 1);
    if (entry.kind === 'dir') { dirs.push(entry); return; }
    if (nameMatch && !nameMatch(name)) return;
    const dot = name.lastIndexOf('.');
    if (extensions.size && !extensions.has(dot > 0 ? name.slice(dot + 1).toLowerCase() : '')) return;
    if (emptyOnly && entry.size !== 0) return;
    let type = '';
    if (types.size) {
      const handle = await open(absolute, 'r');
      try { const head = Buffer.alloc(Math.min(64, entry.size)); await handle.read(head, 0, head.length, 0); type = typeOf(head); } finally { await handle.close(); }
      if (!types.has(type)) return;
    }
    found++;
    context.batch({ path: entry.path, kind: 'file', size: entry.size, mtimeMs: entry.mtimeMs, ...(type ? { type } : {}) });
  }, emptyOnly);
  if (emptyOnly) for (const dir of dirs) if (!childCounts.get(dir.path)) { found++; context.batch({ path: dir.path, kind: 'dir', size: 0, mtimeMs: dir.mtimeMs }); }
  return { scanned, found };
});

registerFsJob('read-text-files', async (context) => {
  const params = paramsOf(context);
  const limit = Math.min(20_000, Math.max(1, Number(params['maxFiles']) || 5000));
  let sent = 0;
  let skipped = 0;
  const scanned = await eachFile(context, 'Reading', async (entry, absolute) => {
    if (sent >= limit) { skipped++; return; }
    const decoded = await readTextFile(absolute, { maxBytes: MAX_STRUCTURED_BYTES });
    if (!decoded) { skipped++; return; }
    sent++;
    context.batch({ path: entry.path, text: decoded.text });
  });
  return { scanned, sent, skipped };
});

/** Search-and-replace plan: files are re-encoded in their own encoding/BOM, line endings untouched. */
registerFsJob('plan-replace', async (context) => {
  const params = paramsOf(context);
  const query = queryOf(params);
  const regex = compileQuery(query);
  const replacement = typeof params['replacement'] === 'string' ? params['replacement'] : '';
  const skip = new Set(Array.isArray(params['skip']) ? params['skip'].filter((item): item is string => typeof item === 'string') : []);
  const only = Array.isArray(params['paths']) ? new Set(params['paths'].filter((item): item is string => typeof item === 'string')) : null;
  const fallback = typeof params['fallbackEncoding'] === 'string' ? params['fallbackEncoding'] : 'win1252';
  const ops: MutationOp[] = [];
  const skipped: { path: string; reason: string }[] = [];
  await fs.mkdir(context.stagingDir, { recursive: true });
  await eachFile(context, 'Preparing replacements', async (entry, absolute) => {
    if (only && !only.has(entry.path)) return;
    const info = await fs.stat(absolute);
    const decoded = await readTextFile(absolute, { fallback });
    if (!decoded) return;
    const parts = splitLines(decoded.text);
    const fileSkip = new Set([...skip].filter((id) => id.startsWith(`${entry.path}#`)).map((id) => id.slice(entry.path.length + 1)));
    const result = replaceLines(parts.map((part) => part.line), regex, replacement, !query.regex, fileSkip);
    if (!result.replaced) return;
    const text = result.lines.map((line, index) => line + parts[index].eol).join('');
    const bytes = encodeText(text, decoded.encoding, decoded.bom);
    if (decodeBytes(bytes, decoded.encoding).text !== text) { skipped.push({ path: entry.path, reason: `The replacement contains characters ${decoded.encoding} cannot store.` }); return; }
    const staged = join(context.stagingDir, randomUUID());
    await fs.writeFile(staged, bytes);
    ops.push({
      kind: 'write', path: absolute, staged, expect: { size: info.size, mtimeMs: info.mtimeMs }, newSize: bytes.length,
      detail: `${result.replaced} replacement(s), ${decoded.encoding}${decoded.bom ? ' + BOM' : ''}`,
      sample: { before: result.samples.map((sample) => `${sample.line}: ${sample.before}`).join('\n'), after: result.samples.map((sample) => `${sample.line}: ${sample.after}`).join('\n') },
    });
  });
  const plan: MutationPlanDraft = { title: `Replace “${query.pattern.slice(0, 40)}” with “${replacement.slice(0, 40)}”`, tool: 'tree-search', root: context.root, ops, skipped };
  return { plan };
});

