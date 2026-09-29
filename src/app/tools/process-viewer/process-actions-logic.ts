import type { SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';
import type { ProcessSummary } from '../../../shared-logic/system/system-types';

export const PROCESS_VIEWER_TOOL_ID = 'process-viewer';

export const PRIORITY_CLASSES = ['idle', 'below-normal', 'normal', 'above-normal', 'high', 'realtime'] as const;
export type PriorityClass = (typeof PRIORITY_CLASSES)[number];

export type ProcessActionKind = 'end' | 'end-tree' | 'restart' | 'suspend' | 'resume';

const TITLES: Record<ProcessActionKind, string> = {
  end: 'End process', 'end-tree': 'End process tree', restart: 'Restart process', suspend: 'Suspend process', resume: 'Resume process',
};

/** The exact process instance (`pid` + `startKey`) the helper verifies before acting, so a reused PID is never touched. */
function instance(p: ProcessSummary) {
  return { pid: p.pid, startKey: p.startKey, name: p.name };
}

function request(p: ProcessSummary, title: string, kind: string, extra: Record<string, unknown> = {}): SysPlanRequest {
  return { tool: PROCESS_VIEWER_TOOL_ID, title: `${title}: ${p.name} (PID ${p.pid})`, ops: [{ kind, params: { ...instance(p), ...extra } }] };
}

export function simpleActionRequest(p: ProcessSummary, action: ProcessActionKind): SysPlanRequest {
  return request(p, TITLES[action], `process.${action}`);
}

export function priorityRequest(p: ProcessSummary, priorityClass: PriorityClass): SysPlanRequest {
  return request(p, 'Set process priority', 'process.set-priority', { priorityClass });
}

/** Hex mask (`0x…`) from logical processor indexes; null when none are selected or an index is outside 0-63. */
export function affinityMask(cpus: Iterable<number>): string | null {
  let mask = 0n;
  for (const cpu of cpus) {
    if (!Number.isInteger(cpu) || cpu < 0 || cpu > 63) return null;
    mask |= 1n << BigInt(cpu);
  }
  return mask === 0n ? null : `0x${mask.toString(16)}`;
}

export function affinityRequest(p: ProcessSummary, cpus: Iterable<number>): SysPlanRequest | null {
  const mask = affinityMask(cpus);
  return mask ? request(p, 'Set CPU affinity', 'process.set-affinity', { affinityMask: mask }) : null;
}

export function dumpFileName(p: ProcessSummary): string {
  return `${p.name.replace(/\.exe$/i, '').replace(/[\\/:*?"<>|]/g, '_')}-${p.pid}.dmp`;
}

/** Joins a granted folder and a file name with a Windows separator. */
export function joinWindowsPath(folder: string, fileName: string): string {
  return `${folder.replace(/[\\/]+$/, '')}\\${fileName}`;
}

export function dumpRequest(p: ProcessSummary, outputPath: string, full: boolean): SysPlanRequest {
  return request(p, full ? 'Write full crash dump' : 'Write minidump', 'process.dump', { outputPath, full });
}
