import type { SysPlanRequest } from "@dude/contracts/system/sys-mutation-types";
import type { FileLockHandleScanResult, FileLockListResult } from "@dude/contracts/system/system-types";

export const FILE_LOCK_INSPECTOR_TOOL_ID = 'file-lock-inspector';

export type LockOwner = FileLockListResult['owners'][number];
export type HandleRow = FileLockHandleScanResult['owners'][number];

/** RM_APP_TYPE values reported by the Windows Restart Manager. */
const APP_TYPES: Readonly<Record<number, string>> = {
  0: 'Unknown', 1: 'Main window', 2: 'Other window', 3: 'Service', 4: 'Explorer', 5: 'Console', 1000: 'Critical system process',
};
export const appTypeLabel = (type: number): string => APP_TYPES[type] ?? `Type ${type}`;

/** RM_APP_STATUS bit flags (a running app is 1). */
export function appStatusLabel(status: number): string {
  const parts: string[] = [];
  if (status & 0x1) parts.push('running');
  if (status & 0x2) parts.push('stopped');
  if (status & 0x4) parts.push('stopped by other');
  if (status & 0x8) parts.push('restarted');
  if (status & 0x10) parts.push('error on stop');
  if (status & 0x20) parts.push('error on restart');
  return parts.join(', ') || 'unknown';
}

/** RM_REBOOT_REASON bits: permission, session ownership, critical process, critical service, detected self. */
export const rebootNeeded = (reasons: number): boolean => reasons !== 0;

export const ownerKey = (owner: { pid: number; startKey: string }): string => `${owner.pid}:${owner.startKey}`;

export function releaseRequest(path: string, restartAfter: boolean): SysPlanRequest {
  return {
    tool: FILE_LOCK_INSPECTOR_TOOL_ID,
    title: `${restartAfter ? 'Release and restart' : 'Release gracefully'}: ${path}`,
    ops: [{ kind: 'lock.release', params: { path, restartAfter } }],
  };
}

export function endOwnerRequest(path: string, owner: { pid: number; startKey: string; name: string }): SysPlanRequest {
  return {
    tool: FILE_LOCK_INSPECTOR_TOOL_ID,
    title: `End process ${owner.name} (PID ${owner.pid}) holding ${path}`,
    ops: [{ kind: 'lock.end-owner', params: { path, pid: owner.pid, startKey: owner.startKey, name: owner.name } }],
  };
}

/** A Restart Manager owner can be released gracefully unless it is a critical system process. */
export const canRelease = (owners: readonly LockOwner[]): boolean => owners.length > 0 && owners.every((o) => o.applicationType !== 1000);
