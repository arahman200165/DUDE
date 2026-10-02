import type { SysApplyContext, SysOpApplyResult, SysOpContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import type { RegisterSysOp } from './process';

/**
 * Environment-variable ops (DUDE_PRD.md §21 Phase 31, Milestone 598): `env.set` and `env.delete`.
 * Windows stores environment variables in the registry (user: HKCU\Environment, machine: the Session
 * Manager\Environment key), so these ride on the helper's `reg.setValue` / `reg.deleteValue` and then
 * broadcast WM_SETTINGCHANGE ("Environment") so newly started processes see the change.
 *
 * The protected-location denylist (SAM, SECURITY, BCD, service ImagePath/ServiceDll) is enforced inside
 * the native helper; neither environment key is on it, so it is not repeated here.
 */

export type EnvScope = 'user' | 'machine';
interface EnvSetParams { scope: EnvScope; name: string; value: string; expandable: boolean }
interface EnvDeleteParams { scope: EnvScope; name: string }
interface EnvPrecondition { existed: boolean; type: string | null; value: string | null }

const ERROR_ACCESS_DENIED = 5;
const ERROR_FILE_NOT_FOUND = 2;
const ACCESS_HINT = 'Access is denied — try Relaunch as Administrator.';
const MAX_NAME = 255;
const MAX_VALUE = 32767;

const LOCATIONS: Record<EnvScope, { hive: 'HKCU' | 'HKLM'; path: string; label: string }> = {
  user: { hive: 'HKCU', path: 'Environment', label: 'user' },
  machine: { hive: 'HKLM', path: 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', label: 'machine' },
};

type HelperResult = Awaited<ReturnType<SysOpContext['helper']>>;
type Failed = Extract<HelperResult, { ok: false }>;
const isFailed = (result: { ok: boolean }): result is Failed => !result.ok;

function strictRecord(raw: unknown, what: string, allowed: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid ${what} parameters.`);
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new Error(`Invalid ${what}: unknown field ${key}.`);
  return record;
}

function validateScope(value: unknown, what: string): EnvScope {
  if (value !== 'user' && value !== 'machine') throw new Error(`Invalid ${what}: scope must be "user" or "machine".`);
  return value;
}

function validateName(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > MAX_NAME || value.includes('=') || value.includes('\0')) {
    throw new Error(`Invalid ${what}: name must be 1-${MAX_NAME} characters without "=" or NUL.`);
  }
  return value;
}

const targetOf = (scope: EnvScope, name: string) => `${LOCATIONS[scope].label} environment: ${name}`;
const isPath = (name: string) => name.toLowerCase() === 'path';

interface Current { existed: boolean; type: string | null; value: string | null; actualName: string }

/** Reads the current registry value for `name` (names are case-insensitive on Windows). */
async function readCurrent(scope: EnvScope, name: string, ctx: SysOpContext): Promise<{ ok: true; current: Current } | Failed> {
  const loc = LOCATIONS[scope];
  const result = await ctx.helper('reg.getValues', { hive: loc.hive, path: loc.path, view: 'default' });
  if (isFailed(result)) return result;
  const values = (result.data as { values?: unknown } | null)?.values;
  const list = Array.isArray(values) ? (values as { name?: unknown; type?: unknown; data?: unknown }[]) : [];
  const lower = name.toLowerCase();
  const hit = list.find((v) => v.name === name) ?? list.find((v) => typeof v.name === 'string' && v.name.toLowerCase() === lower);
  if (!hit) return { ok: true, current: { existed: false, type: null, value: null, actualName: name } };
  return {
    ok: true,
    current: {
      existed: true,
      type: typeof hit.type === 'string' ? hit.type : null,
      value: typeof hit.data === 'string' ? hit.data : null,
      actualName: String(hit.name),
    },
  };
}

const snapshot = (c: Current): EnvPrecondition => ({ existed: c.existed, type: c.type, value: c.value });
const sameState = (a: EnvPrecondition, b: EnvPrecondition) => a.existed === b.existed && a.type === b.type && a.value === b.value;
const isStringType = (type: string | null) => type === 'REG_SZ' || type === 'REG_EXPAND_SZ';

function helperFailure(result: Failed, prefix = ''): SysOpApplyResult {
  if (result.code === ERROR_ACCESS_DENIED) return { outcome: 'failed', message: prefix + ACCESS_HINT };
  return { outcome: 'failed', message: prefix + result.error };
}

const CHANGED = 'The variable changed since the preview.';

/** Restores the pre-change state: put the old value (and type) back, or delete it if it did not exist. */
function undoFor(scope: EnvScope, name: string, before: EnvPrecondition) {
  if (before.existed && before.value !== null && isStringType(before.type)) {
    return { kind: 'env.set', params: { scope, name, value: before.value, expandable: before.type === 'REG_EXPAND_SZ' } };
  }
  if (!before.existed) return { kind: 'env.delete', params: { scope, name } };
  return undefined;
}

/** Broadcast is best-effort after the write: a failure must not turn a written value into a failure. */
async function broadcast(ctx: SysApplyContext): Promise<string | undefined> {
  const result = await ctx.helper('env.broadcast', {});
  return isFailed(result) ? `Saved, but notifying running programs failed (${result.error}). New programs may need a sign-out.` : undefined;
}

// ---- env.set ----

const setOp: SysOpDefinition<EnvSetParams> = {
  kind: 'env.set',
  validate(raw) {
    const r = strictRecord(raw, 'env.set', ['scope', 'name', 'value', 'expandable']);
    const scope = validateScope(r['scope'], 'env.set');
    const name = validateName(r['name'], 'env.set');
    const { value, expandable } = r;
    if (typeof value !== 'string' || value.length > MAX_VALUE || value.includes('\0')) throw new Error(`Invalid env.set: value must be a string of at most ${MAX_VALUE} characters without NUL.`);
    if (typeof expandable !== 'boolean') throw new Error('Invalid env.set: expandable must be a boolean.');
    return { scope, name, value, expandable };
  },
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const warnings: string[] = [];
    if (p.scope === 'machine') warnings.push('This changes the machine-wide environment for every user and needs administrator rights.');
    if (isPath(p.name)) warnings.push('Editing PATH here replaces the whole value; the PATH Editor is safer.');
    const base = {
      target: targetOf(p.scope, p.name), requiresElevation: p.scope === 'machine', noUndo: false, warnings, after: p.value,
    };
    const read = await readCurrent(p.scope, p.name, ctx);
    if (isFailed(read)) {
      return { ...base, summary: `Set ${p.name}`, precondition: null, blockedReason: `Cannot read the current value: ${read.error}` };
    }
    const cur = read.current;
    if (cur.existed && !isStringType(cur.type)) {
      return { ...base, summary: `Set ${p.name}`, precondition: snapshot(cur), blockedReason: `The existing value is ${cur.type ?? 'an unsupported type'}, not text; DUDE will not overwrite it.` };
    }
    if (cur.existed && cur.value === p.value && cur.type === (p.expandable ? 'REG_EXPAND_SZ' : 'REG_SZ')) warnings.push('The variable already has this value; nothing will change.');
    return {
      ...base,
      summary: cur.existed ? `Replace the value of ${p.name}` : `Create ${p.name}`,
      ...(cur.existed && cur.value !== null ? { before: cur.value } : {}),
      precondition: snapshot(cur),
    };
  },
  async apply(p, precondition, ctx): Promise<SysOpApplyResult> {
    const pre = precondition as EnvPrecondition;
    const read = await readCurrent(p.scope, p.name, ctx);
    if (isFailed(read)) return helperFailure(read, 'Cannot re-check the variable: ');
    if (!sameState(snapshot(read.current), pre)) return { outcome: 'conflict', message: CHANGED };
    const loc = LOCATIONS[p.scope];
    const type = p.expandable ? 'REG_EXPAND_SZ' : 'REG_SZ';
    const written = await ctx.helper('reg.setValue', { hive: loc.hive, path: loc.path, view: 'default', name: read.current.actualName, type, data: p.value });
    if (isFailed(written)) return helperFailure(written);
    const warning = await broadcast(ctx);
    const undo = undoFor(p.scope, p.name, pre);
    return {
      outcome: 'applied', ...(pre.existed && pre.value !== null ? { before: pre.value } : {}), after: p.value,
      ...(warning ? { message: warning } : {}), ...(undo ? { undo } : {}),
    };
  },
};

// ---- env.delete ----

const deleteOp: SysOpDefinition<EnvDeleteParams> = {
  kind: 'env.delete',
  validate(raw) {
    const r = strictRecord(raw, 'env.delete', ['scope', 'name']);
    return { scope: validateScope(r['scope'], 'env.delete'), name: validateName(r['name'], 'env.delete') };
  },
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const warnings: string[] = [];
    if (p.scope === 'machine') warnings.push('This changes the machine-wide environment for every user and needs administrator rights.');
    if (isPath(p.name)) warnings.push('Deleting PATH removes it entirely; programs may stop finding commands.');
    const base = { target: targetOf(p.scope, p.name), summary: `Delete ${p.name}`, requiresElevation: p.scope === 'machine', noUndo: false, warnings };
    const read = await readCurrent(p.scope, p.name, ctx);
    if (isFailed(read)) return { ...base, precondition: null, blockedReason: `Cannot read the current value: ${read.error}` };
    const cur = read.current;
    if (!cur.existed) return { ...base, precondition: snapshot(cur), blockedReason: 'The variable does not exist.' };
    if (!isStringType(cur.type)) {
      return { ...base, precondition: snapshot(cur), blockedReason: `The existing value is ${cur.type ?? 'an unsupported type'}, not text; DUDE will not delete it.` };
    }
    return { ...base, ...(cur.value !== null ? { before: cur.value } : {}), after: '(deleted)', precondition: snapshot(cur) };
  },
  async apply(p, precondition, ctx): Promise<SysOpApplyResult> {
    const pre = precondition as EnvPrecondition;
    const read = await readCurrent(p.scope, p.name, ctx);
    if (isFailed(read)) return helperFailure(read, 'Cannot re-check the variable: ');
    if (!sameState(snapshot(read.current), pre)) return { outcome: 'conflict', message: CHANGED };
    const loc = LOCATIONS[p.scope];
    const deleted = await ctx.helper('reg.deleteValue', { hive: loc.hive, path: loc.path, view: 'default', name: read.current.actualName });
    if (isFailed(deleted)) {
      if (deleted.code === ERROR_FILE_NOT_FOUND) return { outcome: 'conflict', message: CHANGED };
      return helperFailure(deleted);
    }
    const warning = await broadcast(ctx);
    const undo = undoFor(p.scope, p.name, pre);
    return {
      outcome: 'applied', ...(pre.value !== null ? { before: pre.value } : {}), after: '(deleted)',
      ...(warning ? { message: warning } : {}), ...(undo ? { undo } : {}),
    };
  },
};

export const ENV_OPS: readonly SysOpDefinition<any>[] = [setOp, deleteOp];

export function registerEnvOps(register: RegisterSysOp): void {
  for (const def of ENV_OPS) register(def);
}
