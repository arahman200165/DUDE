import type { StartupApprovedRef } from "@dude/contracts/system/startup-types";
import type { RegistryValue } from "@dude/contracts/system/system-types";
import type { SysApplyContext, SysOpApplyResult, SysOpContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import type { RegisterSysOp } from './process';

interface StartupParams extends StartupApprovedRef { enabled: boolean; restoreExists?: boolean; restoreBytes?: string }
interface ValueState { exists: boolean; bytes?: string; type: string | null }
interface Precondition extends ValueState {}
const APPROVED_PATHS = new Set([
  'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\RunOnce',
  'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32',
  'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder',
]);
const CHANGED = 'The StartupApproved state changed since the preview.';
type HelperResult = Awaited<ReturnType<SysOpContext['helper']>>;
type Failed = Extract<HelperResult, { ok: false }>;
const isFailed = (result: { ok: boolean }): result is Failed => !result.ok;

function record(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid startup operation parameters.');
  return raw as Record<string, unknown>;
}
function validate(raw: unknown, enabled: boolean): StartupParams {
  const r = record(raw);
  for (const key of Object.keys(r)) if (!['hive', 'path', 'view', 'valueName', 'exists', 'bytes', 'enabled', 'restoreExists', 'restoreBytes'].includes(key)) throw new Error(`Invalid startup operation: unknown field ${key}.`);
  if (r['hive'] !== 'HKCU' && r['hive'] !== 'HKLM') throw new Error('StartupApproved hive must be HKCU or HKLM.');
  if (typeof r['path'] !== 'string' || !APPROVED_PATHS.has(r['path'])) throw new Error('Invalid StartupApproved key path.');
  if (r['view'] !== 'default' && r['view'] !== '32') throw new Error('StartupApproved view must be default or 32.');
  if (typeof r['valueName'] !== 'string' || !r['valueName'] || r['valueName'].length > 16383 || r['valueName'].includes('\0')) throw new Error('Invalid StartupApproved value name.');
  if (typeof r['enabled'] !== 'boolean' || r['enabled'] !== enabled) throw new Error('Operation enabled state does not match its kind.');
  if (r['exists'] !== undefined && typeof r['exists'] !== 'boolean') throw new Error('Invalid StartupApproved existence state.');
  if (r['bytes'] !== undefined && (typeof r['bytes'] !== 'string' || !/^(?:[0-9a-fA-F]{2}){2,128}$/.test(r['bytes']))) throw new Error('StartupApproved bytes must be a REG_BINARY value.');
  if (r['restoreExists'] !== undefined && typeof r['restoreExists'] !== 'boolean') throw new Error('Invalid restore existence state.');
  if (r['restoreBytes'] !== undefined && (typeof r['restoreBytes'] !== 'string' || !/^(?:[0-9a-fA-F]{2}){2,128}$/.test(r['restoreBytes']))) throw new Error('Invalid restore bytes.');
  if (r['restoreExists'] === true && typeof r['restoreBytes'] !== 'string') throw new Error('Restore bytes are required when restoring a StartupApproved value.');
  return { hive: r['hive'], path: r['path'], view: r['view'], valueName: r['valueName'], enabled,
    exists: r['exists'] === true, ...(typeof r['bytes'] === 'string' ? { bytes: r['bytes'].toLowerCase() } : {}),
    ...(typeof r['restoreExists'] === 'boolean' ? { restoreExists: r['restoreExists'] } : {}),
    ...(typeof r['restoreBytes'] === 'string' ? { restoreBytes: r['restoreBytes'].toLowerCase() } : {}) } as StartupParams;
}
async function current(p: StartupApprovedRef, ctx: SysOpContext): Promise<{ state?: ValueState; error?: Failed }> {
  const result = await ctx.helper('reg.getValues', { hive: p.hive, path: p.path, view: p.view });
  if (isFailed(result)) return { error: result };
  const values = (result.data as { values?: unknown } | null)?.values;
  const match = (Array.isArray(values) ? values as RegistryValue[] : []).find((item) => item.name.toLowerCase() === p.valueName.toLowerCase());
  if (!match) return { state: { exists: false, type: null } };
  if (match.type !== 'REG_BINARY' || typeof match.data !== 'string') return { error: { ok: false, error: 'The StartupApproved value is not binary.' } };
  return { state: { exists: true, bytes: match.data.toLowerCase(), type: match.type } };
}
function equal(a: ValueState, b: ValueState): boolean { return a.exists === b.exists && a.type === b.type && a.bytes === b.bytes; }
function taskManagerBytes(enabled: boolean): string {
  if (enabled) return '020000000000000000000000';
  const filetime = BigInt(Date.now()) * 10000n + 116444736000000000n;
  const stamp = Buffer.alloc(12);
  stamp[0] = 3;
  stamp.writeBigUInt64LE(filetime, 4);
  return stamp.toString('hex');
}
function stateName(value: ValueState): string {
  if (!value.exists) return 'enabled (default)';
  const status = value.bytes?.slice(0, 2);
  return status === '02' ? 'enabled' : status === '03' ? 'disabled' : `unknown (${status ?? 'invalid'})`;
}

function op(enabled: boolean): SysOpDefinition<StartupParams> {
  const kind = enabled ? 'startup.enable' : 'startup.disable';
  return {
    kind,
    validate(raw) { return validate(raw, enabled); },
    async preview(p, ctx): Promise<SysOpPreviewResult> {
      const read = await current(p, ctx);
      const target = `${p.hive}\\${p.path}\\${p.valueName}`;
      if (read.error) return { target, summary: enabled ? 'Enable startup entry' : 'Disable startup entry', requiresElevation: p.hive === 'HKLM', noUndo: false, precondition: null, blockedReason: `Cannot read StartupApproved: ${read.error.error}` };
      const before = read.state!;
      const after = p.restoreExists === false ? null : p.restoreBytes ?? taskManagerBytes(enabled);
      const warnings = p.hive === 'HKLM' ? ['This is a machine-wide startup setting and needs administrator rights.'] : [];
      const already = p.restoreExists === undefined && ((enabled && !before.exists) || (before.exists && before.bytes?.slice(0, 2) === (enabled ? '02' : '03')));
      return { target, summary: enabled ? 'Enable startup entry' : 'Disable startup entry', before: stateName(before), after: after === null ? '(remove approval record)' : after.slice(0, 2) === '02' ? 'enabled' : 'disabled', warnings,
        requiresElevation: p.hive === 'HKLM', noUndo: false, precondition: before,
        ...(already ? { blockedReason: `The startup entry is already ${stateName(before)}.` } : {}) };
    },
    async apply(p, precondition, ctx: SysApplyContext): Promise<SysOpApplyResult> {
      const read = await current(p, ctx);
      if (read.error) return { outcome: 'failed', message: `Cannot re-check StartupApproved: ${read.error.error}` };
      const pre = precondition as Precondition;
      if (!equal(read.state!, pre)) return { outcome: 'conflict', message: CHANGED };
      const before = read.state!;
      const remove = p.restoreExists === false;
      const after = remove ? undefined : p.restoreBytes ?? taskManagerBytes(enabled);
      if (!remove && before.exists && before.bytes === after) return { outcome: 'conflict', message: `The startup entry is already ${stateName(before)}.` };
      if (remove && !before.exists) return { outcome: 'conflict', message: 'The StartupApproved value is already absent.' };
      const write = remove
        ? await ctx.helper('reg.deleteValue', { hive: p.hive, path: p.path, view: p.view, name: p.valueName })
        : await ctx.helper('reg.setValue', { hive: p.hive, path: p.path, view: p.view, name: p.valueName, type: 'REG_BINARY', data: after! });
      if (isFailed(write)) return { outcome: 'failed', message: write.code === 5 ? 'Access is denied - try Relaunch as Administrator.' : write.error };
      return { outcome: 'applied', before: stateName(before), after: remove ? '(approval removed)' : stateName({ exists: true, bytes: after, type: 'REG_BINARY' }),
        undo: { kind: enabled ? 'startup.disable' : 'startup.enable', params: { hive: p.hive, path: p.path, view: p.view, valueName: p.valueName, exists: before.exists, ...(before.bytes ? { bytes: before.bytes } : {}), enabled: !enabled, restoreExists: before.exists, ...(before.bytes ? { restoreBytes: before.bytes } : {}) } } };
    },
  };
}

export const STARTUP_OPS: readonly SysOpDefinition<any>[] = [op(true), op(false)];
export function registerStartupOps(register: RegisterSysOp): void { for (const def of STARTUP_OPS) register(def); }
