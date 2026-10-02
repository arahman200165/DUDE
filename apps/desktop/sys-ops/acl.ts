import type { RegistryHive } from "@dude/contracts/system/system-types";
import {
  SddlParseError, aceCategory, formatAce, formatIcaclsInheritance, formatSddl, icaclsRights, isInherited, parseSddl, resolveSidToken, sidTokenName,
  type Sddl, type SddlAce,
} from "@dude/tool-engine/shared/system/sddl";
import type { SysApplyContext, SysOpApplyResult, SysOpContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import { validateAclTarget } from '../sys-validation';
import { isInsideGrantedRoot } from '../fs-grants';
import type { RegisterSysOp } from './process';

/**
 * ACL edit op (DUDE_PRD.md §21 Phase 31, Milestone 610 part B): `acl.set-dacl`. One op edits the DACL of a
 * single file, folder or registry key: the renderer builds `afterSddl` from the live descriptor with
 * `sddl.ts` (add/remove an explicit ACE, enable/disable inheritance) and main re-validates everything.
 *
 *  - Owner, group and SACL must be identical in `beforeSddl` and `afterSddl`; only the DACL (and its `P`
 *    flag) may differ. The helper's `acl.set` only ever writes the DACL, whatever it is handed.
 *  - The precondition is the live DACL (owner/group/SACL and the auto-inherit `AI`/`AR` flags, which Windows
 *    maintains itself, are ignored). Apply re-reads it and skips with a conflict when it moved.
 *  - Undo is this same op with before and after swapped, so it is previewed and confirmed like any other change.
 *  - Scope ceiling: no recursion. Windows itself propagates inheritable ACEs to children that inherit from
 *    the edited container; that is disclosed in the preview and undo does not rewrite the children.
 */

type View = 'default' | '64' | '32';
type AclTarget = { kind: 'file'; path: string } | { kind: 'registry'; hive: RegistryHive; path: string; view: View };
interface Params { target: AclTarget; beforeSddl: string; afterSddl: string }
interface Precondition { dacl: string }

const MAX_SDDL = 65536;
const MAX_ACES = 1000;
const CHANGED = 'The permissions changed since the preview.';
const ERROR_ACCESS_DENIED = 5;
const ACCESS_HINT = 'Access is denied. Changing permissions needs the Change permissions right on the object, or an elevated session.';

type HelperResult = Awaited<ReturnType<SysOpContext['helper']>>;
type Failed = Extract<HelperResult, { ok: false }>;
const isFailed = (result: { ok: boolean }): result is Failed => !result.ok;

function strictRecord(raw: unknown, what: string, allowed: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid ${what} parameters.`);
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new Error(`Invalid ${what}: unknown field ${key}.`);
  for (const key of allowed) if (!(key in record)) throw new Error(`Invalid ${what}: missing field ${key}.`);
  return record;
}

/** HKLM\SAM, HKLM\SECURITY and HKLM\BCD00000000 (and below): the same protected list the registry helper enforces. */
export function isProtectedAclKey(hive: string, path: string): boolean {
  if (hive !== 'HKLM') return false;
  const p = path.replace(/^\\+|\\+$/g, '').toLowerCase();
  return ['sam', 'security', 'bcd00000000'].some((root) => p === root || p.startsWith(`${root}\\`));
}

const hiveNeedsElevation = (t: AclTarget): boolean =>
  t.kind === 'registry' && (t.hive === 'HKLM' || t.hive === 'HKCC' || (t.hive === 'HKU' && (t.path === '' || t.path.split('\\')[0].toLowerCase() === '.default')));

function targetLabel(t: AclTarget): string {
  return t.kind === 'file' ? t.path : (t.path ? `${t.hive}\\${t.path}` : t.hive);
}

const sidKey = (token: string | undefined): string | undefined => (token === undefined ? undefined : (resolveSidToken(token) ?? token));

/** The DACL as comparable text: only the protected flag is kept; `AI`/`AR` are maintained by Windows. */
function normalizedDacl(sd: Sddl): string {
  return formatSddl({ dacl: { flags: sd.dacl?.flags.filter((f) => f === 'P') ?? [], aces: sd.dacl?.aces ?? [] } });
}

function safeParse(text: string, what: string): Sddl {
  try { return parseSddl(text); } catch (e) {
    throw new Error(`Invalid ${what}: ${e instanceof SddlParseError ? e.message : 'not a valid SDDL string.'}`);
  }
}

function assertOnlyDaclDiffers(before: Sddl, after: Sddl): void {
  if (sidKey(before.owner) !== sidKey(after.owner)) throw new Error('The owner must not change; only the DACL may be edited.');
  if (sidKey(before.group) !== sidKey(after.group)) throw new Error('The primary group must not change; only the DACL may be edited.');
  const sacl = (sd: Sddl) => (sd.sacl ? formatSddl({ sacl: sd.sacl }) : '');
  if (sacl(before) !== sacl(after)) throw new Error('The audit rules (SACL) must not change; only the DACL may be edited.');
}

function validate(raw: unknown): Params {
  const r = strictRecord(raw, 'acl.set-dacl', ['target', 'beforeSddl', 'afterSddl']);
  const target = validateAclTarget(r['target']) as AclTarget;
  if (target.kind === 'registry' && isProtectedAclKey(target.hive, target.path)) throw new Error('This registry location is protected from edits by DUDE.');
  for (const key of ['beforeSddl', 'afterSddl'] as const) {
    const text = r[key];
    if (typeof text !== 'string' || !text || text.length > MAX_SDDL || /[\u0000-\u001f]/.test(text)) throw new Error(`Invalid ${key}: a security descriptor string of at most ${MAX_SDDL} characters is required.`);
  }
  const beforeText = r['beforeSddl'] as string;
  const afterText = r['afterSddl'] as string;
  const before = safeParse(beforeText, 'beforeSddl');
  const after = safeParse(afterText, 'afterSddl');
  if (!before.dacl || !after.dacl) throw new Error('Both security descriptors must contain a DACL.');
  if (before.dacl.flags.includes('NO_ACCESS_CONTROL') || after.dacl.flags.includes('NO_ACCESS_CONTROL')) throw new Error('A NULL DACL cannot be written.');
  if (before.dacl.aces.length > MAX_ACES || after.dacl.aces.length > MAX_ACES) throw new Error(`A DACL may hold at most ${MAX_ACES} entries.`);
  assertOnlyDaclDiffers(before, after);
  if (after.dacl.flags.includes('P') && after.dacl.aces.some(isInherited)) throw new Error('A protected DACL cannot contain inherited entries.');
  // New entries are limited to plain allow/deny ACEs with no object GUIDs or conditions.
  const known = new Map<string, number>();
  for (const ace of before.dacl.aces) known.set(formatAce(ace), (known.get(formatAce(ace)) ?? 0) + 1);
  for (const ace of after.dacl.aces) {
    const key = formatAce(ace);
    const left = known.get(key) ?? 0;
    if (left > 0) { known.set(key, left - 1); continue; }
    if ((ace.type !== 'A' && ace.type !== 'D') || ace.objectGuid || ace.inheritGuid || ace.extra !== undefined) throw new Error('Only plain allow and deny entries can be added.');
  }
  return { target, beforeSddl: beforeText, afterSddl: afterText };
}

function accountLabel(sid: string): string { return sidTokenName(sid) ?? resolveSidToken(sid) ?? sid; }

function describeForDiff(ace: SddlAce): string {
  const kind = aceCategory(ace.type).toUpperCase();
  return `${kind} ${accountLabel(ace.sid)}: ${icaclsRights(ace.mask) || '(no rights)'} ${formatIcaclsInheritance(ace.flags)}`.trimEnd();
}

/** Human-readable ACE diff in icacls notation, plus the protection change. */
export function daclDiffLines(before: Sddl, after: Sddl): string[] {
  const counts = new Map<string, number>();
  for (const ace of before.dacl?.aces ?? []) counts.set(formatAce(ace), (counts.get(formatAce(ace)) ?? 0) + 1);
  const added: string[] = [];
  for (const ace of after.dacl?.aces ?? []) {
    const key = formatAce(ace);
    const left = counts.get(key) ?? 0;
    if (left > 0) counts.set(key, left - 1); else added.push(`+ ${describeForDiff(ace)}`);
  }
  const removed: string[] = [];
  const afterCounts = new Map<string, number>();
  for (const ace of after.dacl?.aces ?? []) afterCounts.set(formatAce(ace), (afterCounts.get(formatAce(ace)) ?? 0) + 1);
  for (const ace of before.dacl?.aces ?? []) {
    const key = formatAce(ace);
    const left = afterCounts.get(key) ?? 0;
    if (left > 0) afterCounts.set(key, left - 1); else removed.push(`- ${describeForDiff(ace)}`);
  }
  const lines = [...removed, ...added];
  const wasProtected = before.dacl?.flags.includes('P') ?? false;
  const isProtectedNow = after.dacl?.flags.includes('P') ?? false;
  if (wasProtected !== isProtectedNow) lines.unshift(isProtectedNow ? '~ Inheritance from the parent: enabled -> disabled' : '~ Inheritance from the parent: disabled -> enabled (Windows re-applies the parent\'s inheritable entries)');
  return lines;
}

function helperFailure(result: Failed, prefix = ''): SysOpApplyResult {
  return { outcome: 'failed', message: prefix + (result.code === ERROR_ACCESS_DENIED ? ACCESS_HINT : result.error) };
}

function grantProblem(t: AclTarget): string | undefined {
  if (t.kind === 'file' && !isInsideGrantedRoot(t.path)) return 'Pick the file or folder with the native file picker before changing its permissions.';
  return undefined;
}

interface Live { sddl: string; sd: Sddl; isContainer: boolean }

async function readLive(t: AclTarget, ctx: SysOpContext): Promise<{ ok: true; live: Live } | Failed | { ok: false; error: string; code?: undefined }> {
  const result = await ctx.helper('acl.get', { target: t });
  if (isFailed(result)) return result;
  const data = result.data as { sddl?: unknown; isContainer?: unknown } | null;
  if (!data || typeof data.sddl !== 'string') return { ok: false, error: 'The helper returned no security descriptor.' };
  try { return { ok: true, live: { sddl: data.sddl, sd: parseSddl(data.sddl), isContainer: data.isContainer === true } }; } catch {
    return { ok: false, error: 'The current security descriptor could not be parsed.' };
  }
}

const dropSacl = (sd: Sddl): string => formatSddl({ owner: sd.owner, group: sd.group, dacl: sd.dacl });

const op: SysOpDefinition<Params> = {
  kind: 'acl.set-dacl',
  validate,
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const before = parseSddl(p.beforeSddl);
    const after = parseSddl(p.afterSddl);
    const base = {
      target: targetLabel(p.target), requiresElevation: hiveNeedsElevation(p.target), noUndo: false, warnings: [] as string[], precondition: null as unknown,
    };
    const summaryFor = (lines: string[]) => (lines.length ? `Change permissions:\n${lines.join('\n')}` : 'Change permissions');
    const lines = daclDiffLines(before, after);
    const blocked = (reason: string): SysOpPreviewResult => ({ ...base, summary: summaryFor(lines), blockedReason: reason });
    const problem = grantProblem(p.target);
    if (problem) return blocked(problem);
    const read = await readLive(p.target, ctx);
    if (isFailed(read)) return blocked(`Cannot read the current permissions: ${read.error}`);
    const current = normalizedDacl(read.live.sd);
    if (current !== normalizedDacl(before)) return blocked('The permissions changed since they were loaded. Refresh and try again.');
    if (current === normalizedDacl(after)) return blocked('These permissions are already in place; nothing would change.');
    const warnings: string[] = [];
    if (hiveNeedsElevation(p.target)) warnings.push('This registry location is machine-wide or belongs to another account and needs an elevated session.');
    if (read.live.isContainer) warnings.push('Windows will propagate inheritable entries to child objects that inherit from this one. Undo restores this object\'s permissions only; it does not rewrite the children.');
    if (!after.dacl?.aces.some((ace) => aceCategory(ace.type) === 'allow')) warnings.push('The new DACL has no allow entries, so nobody would have access.');
    if (!(after.dacl?.flags.includes('P') ?? false) && (before.dacl?.flags.includes('P') ?? false)) warnings.push('Re-enabling inheritance can add entries from the parent that you have not reviewed here.');
    return {
      ...base, summary: summaryFor(lines), before: normalizedDacl(before), after: normalizedDacl(after), warnings, precondition: { dacl: current } satisfies Precondition,
    };
  },
  async apply(p, precondition, ctx: SysApplyContext): Promise<SysOpApplyResult> {
    const pre = precondition as Precondition;
    const problem = grantProblem(p.target);
    if (problem) return { outcome: 'conflict', message: problem };
    const read = await readLive(p.target, ctx);
    if (isFailed(read)) return helperFailure(read, 'Cannot re-check the permissions: ');
    const current = normalizedDacl(read.live.sd);
    if (current !== pre.dacl || current !== normalizedDacl(parseSddl(p.beforeSddl))) return { outcome: 'conflict', message: CHANGED };
    await ctx.backup('acl-before.sddl', read.live.sddl);
    const after = parseSddl(p.afterSddl);
    const written = await ctx.helper('acl.set', { target: p.target, sddl: formatSddl({ dacl: after.dacl }) });
    if (isFailed(written)) return helperFailure(written);
    const resulting = (written.data as { sddl?: unknown } | null)?.sddl;
    if (typeof resulting !== 'string') return { outcome: 'failed', message: 'The helper did not confirm the new permissions.' };
    let resultingSd: Sddl;
    try { resultingSd = parseSddl(resulting); } catch { return { outcome: 'failed', message: 'The new permissions could not be read back.' }; }
    return {
      outcome: 'applied', before: current, after: normalizedDacl(resultingSd),
      undo: { kind: 'acl.set-dacl', params: { target: p.target, beforeSddl: dropSacl(resultingSd), afterSddl: dropSacl(read.live.sd) } },
    };
  },
};

export const ACL_OPS: readonly SysOpDefinition<any>[] = [op];

export function registerAclOps(register: RegisterSysOp): void {
  for (const def of ACL_OPS) register(def);
}
