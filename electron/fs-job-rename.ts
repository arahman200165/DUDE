import { promises as fs } from 'node:fs';
import type { MutationOp, MutationPlanDraft, WalkEntry } from '../src/shared-logic/fs/fs-types';
import { sanitizeWalkOptions } from '../src/shared-logic/fs/walk-filter';
import { computeRenames, DEFAULT_RENAME, type RenameEntry, type RenameOptions } from '../src/shared-logic/fs/rename-pattern';
import { registerFsJob } from './fs-jobs';
import { paramsOf } from './fs-job-walk';
import { hashFile } from './fs-hash';
import { walkTree } from './fs-walk';
import { resolveInRoot } from './fs-paths';

/**
 * Batch Rename plan builder (Phase 29 item 3, Milestone 530). Recomputes every proposal with the
 * same shared engine the preview used, but against the folders' real listings (so a clash with a
 * file hidden by the filters is still caught) and with real `{hash8}` values, then emits rename ops
 * with size+mtime preconditions for the mutation engine.
 */

export function renameOptionsOf(raw: unknown): RenameOptions {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<RenameOptions>;
  const text = (input: unknown, fallback: string) => (typeof input === 'string' ? input.slice(0, 100_000) : fallback);
  const pick = <T extends string>(input: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(input as T) ? (input as T) : fallback);
  return {
    mode: pick(value.mode, ['pattern', 'list'], 'pattern'),
    find: text(value.find, ''),
    replace: text(value.replace, ''),
    regex: value.regex === true,
    caseSensitive: value.caseSensitive === true,
    target: pick(value.target, ['name', 'extension', 'full'], 'name'),
    caseTransform: pick(value.caseTransform, ['none', 'lower', 'upper', 'title', 'slug'], 'none'),
    template: text(value.template, DEFAULT_RENAME.template) || DEFAULT_RENAME.template,
    counterStart: Number.isFinite(value.counterStart) ? Number(value.counterStart) : 1,
    counterStep: Number.isFinite(value.counterStep) ? Number(value.counterStep) : 1,
    sort: pick(value.sort, ['path', 'name', 'mtime', 'size'], 'path'),
    list: text(value.list, ''),
  };
}

registerFsJob('plan-rename', async (context) => {
  const params = paramsOf(context);
  const scope = (params['scope'] && typeof params['scope'] === 'object' ? params['scope'] : {}) as { files?: boolean; dirs?: boolean; recursive?: boolean };
  const walk = sanitizeWalkOptions(params['options']);
  const options = renameOptionsOf(params['rename']);
  const only = Array.isArray(params['paths']) ? new Set(params['paths'].filter((item): item is string => typeof item === 'string')) : null;
  const entries: WalkEntry[] = [];
  await walkTree(context.root, { ...walk, maxDepth: scope.recursive ? walk.maxDepth : 0 }, {
    signal: context.signal,
    includeDirs: true,
    onEntry: (entry) => {
      if ((entry.kind === 'file' && scope.files !== false) || (entry.kind === 'dir' && scope.dirs === true)) entries.push(entry);
      context.progress({ phase: 'Listing', scanned: entries.length, bytes: 0, current: entry.path });
    },
    onIssue: (issue) => context.issue(issue),
  }, walk.skipHidden ? context.attributes : null);

  const needsHash = /\{hash8\}/.test(options.template) && options.mode === 'pattern';
  const renameEntries: RenameEntry[] = [];
  let hashed = 0;
  for (const entry of entries) {
    if (context.signal.aborted) throw new Error('Cancelled.');
    let hash8: string | undefined;
    if (needsHash && entry.kind === 'file') {
      hash8 = (await hashFile(resolveInRoot(context.root, entry.path)!, ['SHA-256'], { signal: context.signal }))['SHA-256'].slice(0, 8);
      context.progress({ phase: 'Hashing for {hash8}', scanned: ++hashed, bytes: 0, total: entries.length, current: entry.path });
    }
    renameEntries.push({ path: entry.path, kind: entry.kind === 'dir' ? 'dir' : 'file', size: entry.size, mtimeMs: entry.mtimeMs, ...(hash8 ? { hash8 } : {}) });
  }

  const existing = new Map<string, Set<string>>();
  for (const folder of new Set(renameEntries.map((entry) => (entry.path.includes('/') ? entry.path.slice(0, entry.path.lastIndexOf('/')) : '')))) {
    const names = await fs.readdir(resolveInRoot(context.root, folder)!).catch(() => [] as string[]);
    existing.set(folder, new Set(names.map((name) => name.toLowerCase())));
  }

  const proposals = computeRenames(renameEntries, options, existing);
  const ops: MutationOp[] = [];
  const skipped: { path: string; reason: string }[] = [];
  for (const proposal of proposals) {
    if (proposal.status === 'unchanged' || (only && !only.has(proposal.path))) continue;
    if (proposal.status !== 'rename') { skipped.push({ path: proposal.path, reason: proposal.reason ?? proposal.status }); continue; }
    const from = resolveInRoot(context.root, proposal.path);
    const to = resolveInRoot(context.root, proposal.to);
    if (!from || !to) { skipped.push({ path: proposal.path, reason: 'Path escapes the folder.' }); continue; }
    const info = await fs.lstat(from);
    ops.push({ kind: 'rename', from, to, expect: { size: info.size, mtimeMs: info.mtimeMs }, ...(proposal.warning ? { detail: proposal.warning } : {}) });
  }
  const plan: MutationPlanDraft = { title: `Rename ${ops.length} item(s)`, tool: 'batch-rename', root: context.root, ops, skipped };
  return { plan };
});
