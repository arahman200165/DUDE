import type { StartupApprovedRef, StartupEntry, StartupEntryState, StartupProgramsResult } from "@dude/contracts/system/startup-types";
import { existsSync } from 'node:fs';
import type { FileSignatureResult, FileVersionResult, RegistryValue, ServiceConfig, SysResult } from "@dude/contracts/system/system-types";
import type { ScheduledTaskSummary } from "@dude/contracts/system/task-types";
import { runFixedScript } from './sys-pwsh';

export type StartupHelper = (method: string, params: object) => Promise<SysResult<unknown>>;

interface RunSource { hive: 'HKCU' | 'HKLM'; key: string; view: 'default' | '32'; scope: 'user' | 'machine'; once: boolean }
interface StartupFolderItem { name: string; path: string; target?: string | null; exists: boolean; scope?: 'user' | 'common' }
interface StartupScriptResult { folders?: StartupFolderItem[]; tasks?: ScheduledTaskSummary[] }

const RUN_SOURCES: readonly RunSource[] = [
  { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', view: 'default', scope: 'user', once: false },
  { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce', view: 'default', scope: 'user', once: true },
  { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', view: '32', scope: 'user', once: false },
  { hive: 'HKCU', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce', view: '32', scope: 'user', once: true },
  { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', view: 'default', scope: 'machine', once: false },
  { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce', view: 'default', scope: 'machine', once: true },
  { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\Run', view: '32', scope: 'machine', once: false },
  { hive: 'HKLM', key: 'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce', view: '32', scope: 'machine', once: true },
];
const APPROVED: Record<string, string> = {
  Run: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run',
  RunOnce: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\RunOnce',
  Run32: 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run32',
};

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function valuesOf(result: SysResult<unknown>): readonly RegistryValue[] {
  if (!result.ok) throw new Error(result.error);
  const values = asRecord(result.data).values;
  return Array.isArray(values) ? values as RegistryValue[] : [];
}
function keyView(key: string, source: RunSource): string {
  return source.view === '32' ? (source.once ? 'RunOnce' : 'Run32') : source.once ? 'RunOnce' : 'Run';
}
function approvedState(bytes: string | undefined): StartupEntryState {
  if (!bytes || bytes.length < 2) return 'unknown';
  const state = Number.parseInt(bytes.slice(0, 2), 16);
  return state === 2 ? 'enabled' : state === 3 ? 'disabled' : 'unknown';
}
function expandCommand(command: string): string {
  const expanded = command.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? process.env[name.toUpperCase()] ?? whole);
  const match = /^\s*"([^"]+)"|^\s*([^\s,]+)/.exec(expanded);
  return (match?.[1] ?? match?.[2] ?? '').trim();
}
function isWindowsAbsolute(path: string): boolean { return /^(?:[a-z]:\\|\\\\)/i.test(path); }
function fileExists(path: string): boolean { try { return existsSync(path); } catch { return false; } }
function safeId(...parts: string[]): string { return parts.join('|').toLowerCase(); }
async function metadata(helper: StartupHelper, command: string): Promise<{ target: string | null; exists: boolean | null; publisher: string | null; signature: StartupEntry['signature'] }> {
  let target = expandCommand(command);
  if (!target || !isWindowsAbsolute(target)) return { target: target || null, exists: null, publisher: null, signature: null };
  const [version, signature] = await Promise.all([
    helper('file.version', { path: target }).catch(() => null), helper('file.signature', { path: target }).catch(() => null),
  ]);
  const v = version?.ok ? asRecord(version.data) as unknown as FileVersionResult : null;
  const s = signature?.ok ? asRecord(signature.data) as unknown as FileSignatureResult : null;
  return { target, exists: fileExists(target), publisher: v?.strings?.CompanyName ?? s?.signer ?? null, signature: s?.status ?? null };
}
async function readApproved(helper: StartupHelper, source: RunSource, valueName: string): Promise<StartupApprovedRef | undefined> {
  const path = APPROVED[keyView('', source)];
  if (!path) return undefined;
  const result = await helper('reg.getValues', { hive: source.hive, path, view: source.view });
  if (!result.ok) return undefined;
  const found = valuesOf(result).find((value) => value.name.toLowerCase() === valueName.toLowerCase());
  if (found && (found.type !== 'REG_BINARY' || typeof found.data !== 'string')) return undefined;
  return { hive: source.hive, path, view: source.view, valueName: found?.name ?? valueName, exists: !!found, ...(found ? { bytes: (found.data as string).toLowerCase() } : {}) };
}

/**
 * M605 read aggregator. `startup.list` is a fixed, reviewed PowerShell script to be registered by
 * the bridge integration; it returns `{ folders, tasks }`. Its folder rows expose shortcut target
 * and existence, and its task rows contain only logon/boot-trigger tasks. Services are selected
 * from `svc.list` by auto/auto-delayed start type and linked by service name.
 */
export async function readStartupPrograms(helper: StartupHelper, signal?: AbortSignal): Promise<StartupProgramsResult> {
  const entries: StartupEntry[] = [];
  const warnings: string[] = [];
  for (const source of RUN_SOURCES) {
    const rows = await helper('reg.getValues', { hive: source.hive, path: source.key, view: source.view });
    if (!rows.ok) { warnings.push(`Could not read ${source.hive}\\${source.key} (${source.view} view): ${rows.error}`); continue; }
    for (const value of valuesOf(rows)) {
      if (typeof value.data !== 'string') continue;
      const approved = await readApproved(helper, source, value.name);
      const info = await metadata(helper, value.data);
      const state = approved ? (approved.exists ? approvedState(approved.bytes) : 'enabled') : 'unknown';
      entries.push({ id: safeId('run', source.hive, source.key, source.view, value.name), source: 'registry-run', name: value.name,
        command: value.data, targetPath: info.target, exists: info.exists, publisher: info.publisher, signature: info.signature,
        state, scope: source.scope, detail: `${source.once ? 'RunOnce entry; ' : ''}${approved ? (approved.exists ? '' : 'No StartupApproved record') : 'StartupApproved could not be read'}`.trim(), ...(approved ? { approved } : {}) });
    }
  }

  try {
    const raw = await runFixedScript('startup.list', {}, signal ?? new AbortController().signal) as StartupScriptResult | StartupFolderItem[] | null;
    const folders = Array.isArray(raw) ? raw : raw?.folders ?? [];
    for (const item of folders) {
      if (!item || typeof item.name !== 'string' || typeof item.path !== 'string') continue;
      const target = item.target ?? item.path;
      const approvalHive = item.scope === 'common' || /common/i.test(item.path) ? 'HKLM' as const : 'HKCU' as const;
      const approvalPath = 'Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder';
      const approvedResult = await helper('reg.getValues', { hive: approvalHive, path: approvalPath, view: 'default' });
      const approvedValue = approvedResult.ok ? valuesOf(approvedResult).find((v) => (v.name.toLowerCase() === item.path.toLowerCase() || v.name.toLowerCase() === item.name.toLowerCase()) && v.type === 'REG_BINARY' && typeof v.data === 'string') : undefined;
      const approved = approvedResult.ok ? { hive: approvalHive, path: approvalPath, view: 'default' as const, valueName: approvedValue?.name ?? item.name, exists: !!approvedValue, ...(approvedValue ? { bytes: (approvedValue.data as string).toLowerCase() } : {}) } : undefined;
      const info = await metadata(helper, target);
      entries.push({ id: safeId('folder', item.path), source: 'startup-folder', name: item.name, command: target,
        targetPath: info.target, exists: item.exists && info.exists !== false, publisher: info.publisher, signature: info.signature,
        state: approved ? (approved.exists ? approvedState(approved.bytes) : 'enabled') : 'unknown', scope: /common/i.test(item.path) ? 'common' : 'user', detail: approved ? (approved.exists ? undefined : 'No StartupApproved record') : 'StartupApproved could not be read', ...(approved ? { approved } : {}) });
    }
    const tasks = Array.isArray(raw) ? [] : raw?.tasks ?? [];
    for (const task of tasks) {
      if (!task || typeof task.taskPath !== 'string' || typeof task.taskName !== 'string') continue;
      entries.push({ id: safeId('task', task.taskPath, task.taskName), source: 'scheduled-task', name: task.taskName, command: '', targetPath: null,
        exists: null, publisher: null, signature: null, state: task.enabled ? 'enabled' : 'disabled', scope: 'task',
        detail: 'Logon or boot trigger', task: { taskPath: task.taskPath, taskName: task.taskName } });
    }
  } catch (error) { warnings.push(`Startup folders and logon tasks are unavailable: ${error instanceof Error ? error.message : String(error)}`); }

  const serviceResult = await helper('svc.list', {});
  if (!serviceResult.ok) warnings.push(`Could not read auto-start services: ${serviceResult.error}`);
  else {
    const services = asRecord(serviceResult.data).services;
    for (const service of Array.isArray(services) ? services : []) {
      const summary = service as { name?: unknown; displayName?: unknown };
      if (typeof summary.name !== 'string') continue;
      const configured = await helper('svc.config', { name: summary.name });
      if (!configured.ok) continue;
      const config = asRecord(configured.data).config as ServiceConfig | undefined;
      if (!config || (config.startType !== 'auto' && config.startType !== 'auto-delayed' && config.startType !== 'boot' && config.startType !== 'system')) continue;
      const info = await metadata(helper, config.binaryPath);
      entries.push({ id: safeId('service', config.name), source: 'service', name: config.displayName || config.name, command: config.binaryPath,
        targetPath: info.target, exists: info.exists, publisher: info.publisher, signature: info.signature,
        state: 'enabled', scope: 'service', detail: `${config.startType} start; ${config.state}`,
        serviceName: config.name });
    }
  }
  return { entries, warnings };
}
