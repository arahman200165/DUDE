import { createHash } from 'node:crypto';
import { REGISTRY_HIVES, type RegistryHive } from "@dude/contracts/system/system-types";
import type { SysApplyContext, SysOpApplyResult, SysOpContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import { validateRegistryPath } from '../sys-validation';
import type { RegisterSysOp } from './process';

/**
 * Registry ops (DUDE_PRD.md §21 Phase 31, Milestone 601): `registry.setValue`, `registry.deleteValue`,
 * `registry.createKey` and `registry.deleteKeyIfEmpty` (the undo of a created key). They ride on the
 * helper's `reg.setValue` / `reg.deleteValue` / `reg.createKey` / `reg.deleteKeyIfEmpty`; the protected-location
 * denylist (SAM, SECURITY, BCD, service ImagePath/ServiceDll) is enforced in the native helper and its error
 * surfaces as a `failed` outcome. There is deliberately no recursive key delete anywhere.
 *
 * Before a value write or delete the containing key is exported as a `.reg` file (non-recursive, UTF-16 with
 * BOM, importable as-is) into the plan's backups, alongside the structured undo op recorded in the journal.
 */

type View = 'default' | '64' | '32';
const VIEWS: readonly View[] = ['default', '64', '32'];

/** Value types the helper can both read and write back exactly. */
const WRITABLE_TYPES = ['REG_NONE', 'REG_SZ', 'REG_EXPAND_SZ', 'REG_LINK', 'REG_MULTI_SZ', 'REG_DWORD', 'REG_QWORD', 'REG_BINARY'] as const;
type WritableType = (typeof WRITABLE_TYPES)[number];
type ValueData = string | number | string[] | null;

interface KeyRef { hive: RegistryHive; path: string; view: View }
interface ValueRef extends KeyRef { name: string }
interface SetParams extends ValueRef { type: WritableType; data: ValueData }

interface ValueState {
  existed: boolean;
  keyExisted: boolean;
  type: string | null;
  /** True when the current value's type/bytes cannot be written back exactly (no structured undo). */
  restorable: boolean;
  data: ValueData;
  digest: string;
  actualName: string;
}
interface Precondition { keyExisted: boolean; existed: boolean; type: string | null; digest: string }

const ERROR_FILE_NOT_FOUND = 2;
const ERROR_PATH_NOT_FOUND = 3;
const ERROR_ACCESS_DENIED = 5;
const ACCESS_HINT = 'Access is denied — try Relaunch as Administrator.';
const CHANGED = 'The registry value changed since the preview.';
const MAX_NAME = 16383;
const MAX_TEXT = 65536;
const MAX_MULTI_ITEMS = 1024;
const MAX_BINARY_BYTES = 1024 * 1024;
const MAX_DISPLAY = 500;

type HelperResult = Awaited<ReturnType<SysOpContext['helper']>>;
type Failed = Extract<HelperResult, { ok: false }>;
const isFailed = (result: { ok: boolean }): result is Failed => !result.ok;

function strictRecord(raw: unknown, what: string, allowed: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid ${what} parameters.`);
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new Error(`Invalid ${what}: unknown field ${key}.`);
  return record;
}

function validateKeyRef(r: Record<string, unknown>, what: string, requirePath: boolean): KeyRef {
  const hive = r['hive'];
  if (typeof hive !== 'string' || !(REGISTRY_HIVES as readonly string[]).includes(hive)) throw new Error(`Invalid ${what}: unknown hive.`);
  const view = r['view'];
  if (typeof view !== 'string' || !(VIEWS as readonly string[]).includes(view)) throw new Error(`Invalid ${what}: unknown view.`);
  let path: string;
  try { path = validateRegistryPath(r['path']); } catch (e) { throw new Error(`Invalid ${what}: ${(e as Error).message}`); }
  if (requirePath && path === '') throw new Error(`Invalid ${what}: a key path is required.`);
  return { hive: hive as RegistryHive, path, view: view as View };
}

function validateValueName(value: unknown, what: string): string {
  if (typeof value !== 'string' || value.length > MAX_NAME || value.includes('\0')) {
    throw new Error(`Invalid ${what}: name must be a string of at most ${MAX_NAME} characters without NUL.`);
  }
  return value;
}

function validateData(type: WritableType, data: unknown): ValueData {
  const bad = (why: string): never => { throw new Error(`Invalid registry.setValue: ${why}`); };
  switch (type) {
    case 'REG_NONE':
      if (data !== undefined && data !== null) bad('REG_NONE takes no data.');
      return null;
    case 'REG_SZ': case 'REG_EXPAND_SZ': case 'REG_LINK':
      if (typeof data !== 'string' || data.length > MAX_TEXT || data.includes('\0')) return bad(`${type} data must be a string of at most ${MAX_TEXT} characters without NUL.`);
      return data;
    case 'REG_MULTI_SZ': {
      if (!Array.isArray(data) || data.length > MAX_MULTI_ITEMS) return bad('REG_MULTI_SZ data must be an array of strings.');
      let total = 0;
      for (const item of data) {
        if (typeof item !== 'string' || item.length === 0 || item.includes('\0')) return bad('REG_MULTI_SZ entries must be non-empty strings without NUL.');
        total += item.length;
      }
      if (total > MAX_TEXT) return bad('REG_MULTI_SZ data is too long.');
      return [...(data as string[])];
    }
    case 'REG_DWORD':
      if (typeof data !== 'number' || !Number.isInteger(data) || data < 0 || data > 0xffffffff) return bad('REG_DWORD data must be an integer from 0 to 4294967295.');
      return data;
    case 'REG_QWORD':
      if (typeof data !== 'string' || !/^\d{1,20}$/.test(data) || BigInt(data) > 0xffffffffffffffffn) return bad('REG_QWORD data must be a decimal string up to 18446744073709551615.');
      return BigInt(data).toString();
    case 'REG_BINARY':
      if (typeof data !== 'string' || data.length > MAX_BINARY_BYTES * 2 || !/^(?:[0-9a-fA-F]{2})*$/.test(data)) return bad('REG_BINARY data must be an even-length hex string.');
      return data.toLowerCase();
  }
}

const hiveNeedsElevation = (key: KeyRef): boolean =>
  key.hive === 'HKLM' || key.hive === 'HKCC' || (key.hive === 'HKU' && (key.path === '' || key.path.split('\\')[0].toLowerCase() === '.default'));

function scopeWarnings(key: KeyRef): string[] {
  const warnings: string[] = [];
  if (key.hive === 'HKLM') warnings.push('This changes machine-wide settings for every user and needs administrator rights.');
  if (key.hive === 'HKCR') warnings.push('HKCR is a merged view; the change lands in HKCU or HKLM depending on where the key lives.');
  if (key.hive === 'HKU' && hiveNeedsElevation(key)) warnings.push('This changes another account\'s or the default profile and needs administrator rights.');
  return warnings;
}

const keyLabel = (key: KeyRef) => (key.path ? `${key.hive}\\${key.path}` : key.hive);
const valueLabel = (v: ValueRef) => `${keyLabel(v)}\\${v.name === '' ? '(Default)' : v.name}`;
const digestOf = (type: string | null, data: unknown) => createHash('sha256').update(JSON.stringify([type, data ?? null])).digest('hex');

function display(type: string | null, data: ValueData): string {
  let text: string;
  if (Array.isArray(data)) text = data.join(' | ');
  else if (data === null) text = '';
  else text = String(data);
  if (type === 'REG_DWORD' && typeof data === 'number') text = `0x${data.toString(16).padStart(8, '0')} (${data})`;
  const clipped = text.length > MAX_DISPLAY ? `${text.slice(0, MAX_DISPLAY)}…` : text;
  return `${type ?? ''}${type ? ': ' : ''}${clipped}`;
}

function helperFailure(result: Failed, prefix = ''): SysOpApplyResult {
  if (result.code === ERROR_ACCESS_DENIED) return { outcome: 'failed', message: prefix + ACCESS_HINT };
  return { outcome: 'failed', message: prefix + result.error };
}

const isMissingCode = (code: number | undefined) => code === ERROR_FILE_NOT_FOUND || code === ERROR_PATH_NOT_FOUND;

/** Reads the current state of one value; a missing key reads as "no value" (`keyExisted: false`). */
async function readValue(v: ValueRef, ctx: SysOpContext): Promise<{ ok: true; state: ValueState } | Failed> {
  const result = await ctx.helper('reg.getValues', { hive: v.hive, path: v.path, view: v.view });
  if (isFailed(result)) {
    if (isMissingCode(result.code)) {
      return { ok: true, state: { existed: false, keyExisted: false, type: null, restorable: true, data: null, digest: digestOf(null, null), actualName: v.name } };
    }
    return result;
  }
  const values = (result.data as { values?: unknown } | null)?.values;
  const list = Array.isArray(values) ? (values as { name?: unknown; type?: unknown; byteLength?: unknown; data?: unknown }[]) : [];
  const lower = v.name.toLowerCase();
  const hit = list.find((e) => e.name === v.name) ?? list.find((e) => typeof e.name === 'string' && e.name.toLowerCase() === lower);
  if (!hit) return { ok: true, state: { existed: false, keyExisted: true, type: null, restorable: true, data: null, digest: digestOf(null, null), actualName: v.name } };
  const type = typeof hit.type === 'string' ? hit.type : null;
  const writable = (WRITABLE_TYPES as readonly string[]).includes(type ?? '');
  // REG_NONE with bytes cannot be rewritten by the helper (it writes an empty value).
  const restorable = writable && !(type === 'REG_NONE' && Number(hit.byteLength) > 0);
  const data = (hit.data ?? null) as ValueData;
  return {
    ok: true,
    state: { existed: true, keyExisted: true, type, restorable, data, digest: digestOf(type, data), actualName: String(hit.name) },
  };
}

const toPrecondition = (s: ValueState): Precondition => ({ keyExisted: s.keyExisted, existed: s.existed, type: s.type, digest: s.digest });
const samePrecondition = (s: ValueState, p: Precondition) => s.keyExisted === p.keyExisted && s.existed === p.existed && s.type === p.type && s.digest === p.digest;

/** The structured undo for "put this value back as it was": set the old value, or delete it if it was absent. */
function restoreRequest(v: ValueRef, before: ValueState) {
  const key = { hive: v.hive, path: v.path, view: v.view, name: v.name };
  if (!before.existed) return { kind: 'registry.deleteValue', params: key };
  if (!before.restorable || before.type === null) return undefined;
  return { kind: 'registry.setValue', params: { ...key, name: before.actualName, type: before.type, data: before.type === 'REG_NONE' ? null : before.data } };
}

/** Best-effort `.reg` backup of the containing key (non-recursive). A missing key simply has nothing to back up. */
async function backupKey(key: KeyRef, ctx: SysApplyContext): Promise<void> {
  const exported = await ctx.helper('reg.export', { hive: key.hive, path: key.path, view: key.view, recursive: false });
  if (isFailed(exported)) return;
  const text = (exported.data as { text?: unknown } | null)?.text;
  if (typeof text !== 'string' || !text) return;
  const label = `${key.hive}-${key.path || 'root'}`.replace(/[^\w.-]+/g, '_');
  await ctx.backup(`registry-${label}.reg`, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
}

const blockedBase = (v: ValueRef, summary: string, extra: Partial<SysOpPreviewResult> = {}) => ({
  target: valueLabel(v), summary, requiresElevation: hiveNeedsElevation(v), noUndo: false, warnings: scopeWarnings(v), precondition: null, ...extra,
});

// ---- registry.setValue ----

const setValueOp: SysOpDefinition<SetParams> = {
  kind: 'registry.setValue',
  validate(raw) {
    const r = strictRecord(raw, 'registry.setValue', ['hive', 'path', 'view', 'name', 'type', 'data']);
    const key = validateKeyRef(r, 'registry.setValue', true);
    const name = validateValueName(r['name'], 'registry.setValue');
    const type = r['type'];
    if (typeof type !== 'string' || !(WRITABLE_TYPES as readonly string[]).includes(type)) throw new Error('Invalid registry.setValue: unsupported value type.');
    return { ...key, name, type: type as WritableType, data: validateData(type as WritableType, r['data']) };
  },
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const read = await readValue(p, ctx);
    if (isFailed(read)) return blockedBase(p, `Set ${p.name || '(Default)'}`, { blockedReason: `Cannot read the current value: ${read.error}` });
    const cur = read.state;
    const warnings = scopeWarnings(p);
    if (!cur.keyExisted) warnings.push('The key does not exist and will be created.');
    let noUndo = false;
    if (cur.existed && !cur.restorable) {
      noUndo = true;
      warnings.push(`The existing ${cur.type ?? 'value'} cannot be restored exactly; a .reg backup is saved but undo is unavailable.`);
    }
    if (cur.existed && cur.type === p.type && cur.digest === digestOf(p.type, p.data)) warnings.push('The value already has this data; nothing will change.');
    return {
      target: valueLabel(p),
      summary: cur.existed ? `Replace the value ${p.name || '(Default)'}` : `Create the value ${p.name || '(Default)'}`,
      ...(cur.existed ? { before: display(cur.type, cur.data) } : {}),
      after: display(p.type, p.data),
      warnings, requiresElevation: hiveNeedsElevation(p), noUndo, precondition: toPrecondition(cur),
    };
  },
  async apply(p, precondition, ctx): Promise<SysOpApplyResult> {
    const pre = precondition as Precondition;
    const read = await readValue(p, ctx);
    if (isFailed(read)) return helperFailure(read, 'Cannot re-check the value: ');
    if (!samePrecondition(read.state, pre)) return { outcome: 'conflict', message: CHANGED };
    await backupKey(p, ctx);
    const params = { hive: p.hive, path: p.path, view: p.view, name: read.state.actualName, type: p.type, ...(p.type === 'REG_NONE' ? {} : { data: p.data }) };
    const written = await ctx.helper('reg.setValue', params);
    if (isFailed(written)) return helperFailure(written);
    const undo = restoreRequest(p, read.state);
    return {
      outcome: 'applied', ...(read.state.existed ? { before: display(read.state.type, read.state.data) } : {}), after: display(p.type, p.data),
      ...(undo ? { undo } : {}),
    };
  },
};

// ---- registry.deleteValue ----

const deleteValueOp: SysOpDefinition<ValueRef> = {
  kind: 'registry.deleteValue',
  validate(raw) {
    const r = strictRecord(raw, 'registry.deleteValue', ['hive', 'path', 'view', 'name']);
    return { ...validateKeyRef(r, 'registry.deleteValue', true), name: validateValueName(r['name'], 'registry.deleteValue') };
  },
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const summary = `Delete the value ${p.name || '(Default)'}`;
    const read = await readValue(p, ctx);
    if (isFailed(read)) return blockedBase(p, summary, { blockedReason: `Cannot read the current value: ${read.error}` });
    const cur = read.state;
    if (!cur.existed) return blockedBase(p, summary, { precondition: toPrecondition(cur), blockedReason: 'The value does not exist.' });
    const warnings = scopeWarnings(p);
    if (!cur.restorable) warnings.push(`The existing ${cur.type ?? 'value'} cannot be restored exactly; a .reg backup is saved but undo is unavailable.`);
    return {
      target: valueLabel(p), summary, before: display(cur.type, cur.data), after: '(deleted)', warnings,
      requiresElevation: hiveNeedsElevation(p), noUndo: !cur.restorable, precondition: toPrecondition(cur),
    };
  },
  async apply(p, precondition, ctx): Promise<SysOpApplyResult> {
    const pre = precondition as Precondition;
    const read = await readValue(p, ctx);
    if (isFailed(read)) return helperFailure(read, 'Cannot re-check the value: ');
    if (!samePrecondition(read.state, pre)) return { outcome: 'conflict', message: CHANGED };
    await backupKey(p, ctx);
    const deleted = await ctx.helper('reg.deleteValue', { hive: p.hive, path: p.path, view: p.view, name: read.state.actualName });
    if (isFailed(deleted)) {
      if (isMissingCode(deleted.code)) return { outcome: 'conflict', message: CHANGED };
      return helperFailure(deleted);
    }
    const undo = restoreRequest(p, read.state);
    return { outcome: 'applied', before: display(read.state.type, read.state.data), after: '(deleted)', ...(undo?.kind === 'registry.setValue' ? { undo } : {}) };
  },
};

// ---- registry.createKey / registry.deleteKeyIfEmpty ----

interface KeyState { existed: boolean; subkeys: number; values: number }

async function readKey(k: KeyRef, ctx: SysOpContext): Promise<{ ok: true; state: KeyState } | Failed> {
  const enumerated = await ctx.helper('reg.enumKey', { hive: k.hive, path: k.path, view: k.view });
  if (isFailed(enumerated)) {
    if (isMissingCode(enumerated.code)) return { ok: true, state: { existed: false, subkeys: 0, values: 0 } };
    return enumerated;
  }
  const subkeys = (enumerated.data as { subkeys?: unknown[] } | null)?.subkeys;
  const values = await ctx.helper('reg.getValues', { hive: k.hive, path: k.path, view: k.view });
  if (isFailed(values)) return values;
  const list = (values.data as { values?: unknown[] } | null)?.values;
  return { ok: true, state: { existed: true, subkeys: Array.isArray(subkeys) ? subkeys.length : 0, values: Array.isArray(list) ? list.length : 0 } };
}

const keyBlocked = (k: KeyRef, summary: string, reason: string, extra: Partial<SysOpPreviewResult> = {}): SysOpPreviewResult => ({
  target: keyLabel(k), summary, requiresElevation: hiveNeedsElevation(k), noUndo: false, warnings: scopeWarnings(k), precondition: null, blockedReason: reason, ...extra,
});

const createKeyOp: SysOpDefinition<KeyRef> = {
  kind: 'registry.createKey',
  validate(raw) {
    return validateKeyRef(strictRecord(raw, 'registry.createKey', ['hive', 'path', 'view']), 'registry.createKey', true);
  },
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const summary = 'Create the registry key';
    const read = await readKey(p, ctx);
    if (isFailed(read)) return keyBlocked(p, summary, `Cannot read the key: ${read.error}`);
    const warnings = scopeWarnings(p);
    if (read.state.existed) warnings.push('The key already exists; nothing will change.');
    return {
      target: keyLabel(p), summary, after: '(new key)', warnings, requiresElevation: hiveNeedsElevation(p),
      noUndo: read.state.existed, precondition: { existed: read.state.existed },
    };
  },
  async apply(p, precondition, ctx): Promise<SysOpApplyResult> {
    const pre = precondition as { existed: boolean };
    const read = await readKey(p, ctx);
    if (isFailed(read)) return helperFailure(read, 'Cannot re-check the key: ');
    if (read.state.existed !== pre.existed) return { outcome: 'conflict', message: 'The key changed since the preview.' };
    const created = await ctx.helper('reg.createKey', { hive: p.hive, path: p.path, view: p.view });
    if (isFailed(created)) return helperFailure(created);
    const wasCreated = (created.data as { created?: unknown } | null)?.created === true;
    return {
      outcome: 'applied', after: wasCreated ? '(new key)' : '(already existed)',
      ...(wasCreated ? { undo: { kind: 'registry.deleteKeyIfEmpty', params: { hive: p.hive, path: p.path, view: p.view } } } : {}),
    };
  },
};

const deleteKeyIfEmptyOp: SysOpDefinition<KeyRef> = {
  kind: 'registry.deleteKeyIfEmpty',
  validate(raw) {
    return validateKeyRef(strictRecord(raw, 'registry.deleteKeyIfEmpty', ['hive', 'path', 'view']), 'registry.deleteKeyIfEmpty', true);
  },
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const summary = 'Delete the empty registry key';
    const read = await readKey(p, ctx);
    if (isFailed(read)) return keyBlocked(p, summary, `Cannot read the key: ${read.error}`);
    if (!read.state.existed) return keyBlocked(p, summary, 'The key does not exist.', { precondition: read.state });
    if (read.state.subkeys > 0 || read.state.values > 0) {
      return keyBlocked(p, summary, 'The key is not empty; DUDE only deletes empty keys.', { precondition: read.state });
    }
    return {
      target: keyLabel(p), summary, before: '(empty key)', after: '(deleted)', warnings: scopeWarnings(p),
      requiresElevation: hiveNeedsElevation(p), noUndo: false, precondition: read.state,
    };
  },
  async apply(p, precondition, ctx): Promise<SysOpApplyResult> {
    const pre = precondition as KeyState;
    const read = await readKey(p, ctx);
    if (isFailed(read)) return helperFailure(read, 'Cannot re-check the key: ');
    if (read.state.existed !== pre.existed || read.state.subkeys !== pre.subkeys || read.state.values !== pre.values) {
      return { outcome: 'conflict', message: 'The key changed since the preview.' };
    }
    const deleted = await ctx.helper('reg.deleteKeyIfEmpty', { hive: p.hive, path: p.path, view: p.view });
    if (isFailed(deleted)) {
      if (isMissingCode(deleted.code)) return { outcome: 'conflict', message: 'The key changed since the preview.' };
      return helperFailure(deleted);
    }
    return { outcome: 'applied', before: '(empty key)', after: '(deleted)', undo: { kind: 'registry.createKey', params: { hive: p.hive, path: p.path, view: p.view } } };
  },
};

export const REGISTRY_OPS: readonly SysOpDefinition<any>[] = [setValueOp, deleteValueOp, createKeyOp, deleteKeyIfEmptyOp];

export function registerRegistryOps(register: RegisterSysOp): void {
  for (const def of REGISTRY_OPS) register(def);
}
