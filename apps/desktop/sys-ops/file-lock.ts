import type { SysOpApplyResult, SysOpContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import type { ProcessListResult, SysResult } from "@dude/contracts/system/system-types";
import { lockPathMatches } from '../file-locks';
import { isInsideGrantedRoot } from '../fs-grants';

/**
 * File Lock Inspector ops (DUDE_PRD.md §21 Phase 31, Milestone 611).
 *  - `lock.release`: the preferred path. Restart Manager graceful shutdown (flags 0, never forced), optionally
 *    followed by a restart in the same session. A handle is never force-closed.
 *  - `lock.end-owner`: terminate the owning process, re-validating owner PID + start key first.
 */

type Params = { path: string; pid: number; startKey: string; name: string };
type ReleaseParams = { path: string; restartAfter: boolean };
interface RmOwner { pid: number; startKey: string; name: string; service: string; applicationType: number; restartable: boolean; appStatus: number; sessionId: number }
type Failure = { ok: false; error: string; code?: number };
const isFailure = (r: SysResult<unknown>): r is Failure => !r.ok;
const CRITICAL = new Set(['system', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe']);
/** Core Windows services whose shutdown can destabilize the session; a release naming one needs a typed confirmation. */
const CRITICAL_SERVICES = new Set(['rpcss', 'dcomlaunch', 'lsm', 'samss', 'eventlog', 'winmgmt', 'brokerinfrastructure', 'coremessaging', 'cryptsvc', 'gpsvc', 'profsvc', 'power', 'plugplay', 'schedule', 'lanmanserver', 'lanmanworkstation']);
const RM_SERVICE = 3;
const RM_CRITICAL = 1000;
const RM_MESSAGES: Record<number, string> = {
  121: 'An application did not respond to the shutdown request in time.',
  350: 'Windows cannot release these locks without a reboot.',
  351: 'An application refused to shut down.',
  353: 'An application could not be restarted.',
  1223: 'The shutdown request was cancelled before every application closed.',
};
const ABSOLUTE_PATH = /^(?:[a-zA-Z]:[\\/]|\\\\)[^\0]+$/;

function validate(raw: unknown): Params {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid lock owner parameters.');
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join(',') !== 'name,path,pid,startKey') throw new Error('Lock owner parameters must contain path, pid, startKey and name.');
  if (typeof r.path !== 'string' || !ABSOLUTE_PATH.test(r.path)) throw new Error('Lock path must be absolute.');
  if (typeof r.pid !== 'number' || !Number.isSafeInteger(r.pid) || r.pid <= 0 || r.pid > 0xffffffff) throw new Error('Invalid process id.');
  if (typeof r.startKey !== 'string' || !/^\d{1,20}$/.test(r.startKey)) throw new Error('Invalid process start key.');
  if (typeof r.name !== 'string' || !r.name || r.name.length > 260) throw new Error('Invalid process name.');
  return r as Params;
}

async function check(p: Params, ctx: SysOpContext): Promise<{ reason?: string; exeName?: string }> {
  if (!isInsideGrantedRoot(p.path)) return { reason: 'Pick the file or folder with the native file picker before ending its lock owner.' };
  const [locks, processes] = await Promise.all([ctx.helper('lock.rmList', { path: p.path }), ctx.helper('process.list', {})]);
  if (!processes.ok) return { reason: 'Unable to recheck the file lock owner.' };
  const rmOwners = locks.ok ? (((locks.data as { owners?: unknown }).owners ?? []) as { pid: number; startKey: string; name: string }[]) : [];
  let ownerMatches = rmOwners.some((item) => item.pid === p.pid && item.startKey === p.startKey && item.name === p.name);
  if (!ownerMatches) {
    const scan = await ctx.helper('lock.handleScan', { path: p.path });
    if (scan.ok) {
      const rows = ((scan.data as { owners?: unknown }).owners ?? []) as { pid: number; startKey: string; name: string; path: string }[];
      ownerMatches = rows.some((item) => item.pid === p.pid && item.startKey === p.startKey && item.name === p.name && lockPathMatches(p.path, item.path, true));
    }
  }
  if (!ownerMatches) return { reason: 'The selected process no longer owns a lock on this path.' };
  const list = processes.data as ProcessListResult;
  const live = list.processes.find((item) => item.pid === p.pid && item.startKey === p.startKey);
  if (!live) return { reason: 'The process exited or its PID was reused.' };
  return { exeName: live.name };
}

const endOwnerOp: SysOpDefinition<Params> = {
  kind: 'lock.end-owner',
  validate,
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const { reason, exeName } = await check(p, ctx);
    const typed = [exeName, p.name].find((n) => n && CRITICAL.has(n.toLowerCase()));
    return {
      target: `${p.name} (PID ${p.pid})`, summary: 'End the process holding the selected file lock',
      before: p.path, requiresElevation: false, noUndo: true, precondition: { pid: p.pid, startKey: p.startKey, path: p.path },
      warnings: ['Ending a process can lose unsaved work.'], ...(typed ? { typedConfirm: typed } : {}),
      ...(reason ? { blockedReason: reason } : {}),
    };
  },
  async apply(p, precondition, ctx): Promise<SysOpApplyResult> {
    const saved = precondition as Partial<Params>;
    if (saved.pid !== p.pid || saved.startKey !== p.startKey || saved.path !== p.path) return { outcome: 'conflict', message: 'The previewed process or path changed.' };
    const { reason } = await check(p, ctx);
    if (reason) return { outcome: 'conflict', message: reason };
    const ended = await ctx.helper('proc.terminate', { pid: p.pid, startKey: p.startKey });
    if (!ended.ok) return ended.code === 1168 ? { outcome: 'conflict', message: 'The process exited or its PID was reused.' } : { outcome: 'failed', message: ended.error };
    return { outcome: 'applied', before: 'Holding a lock', after: 'Ended' };
  },
};

// ---- lock.release ----

function validateRelease(raw: unknown): ReleaseParams {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid lock release parameters.');
  const r = raw as Record<string, unknown>;
  if (Object.keys(r).sort().join(',') !== 'path,restartAfter') throw new Error('Lock release parameters must contain path and restartAfter.');
  if (typeof r.path !== 'string' || r.path.length > 1024 || !ABSOLUTE_PATH.test(r.path)) throw new Error('Lock path must be absolute.');
  if (typeof r.restartAfter !== 'boolean') throw new Error('restartAfter must be a boolean.');
  return r as ReleaseParams;
}

const ownerKey = (o: { pid: number; startKey: string }) => `${o.pid}:${o.startKey}`;
const describeOwner = (o: RmOwner): string =>
  `${o.name} (PID ${o.pid}, ${o.applicationType === RM_SERVICE ? `service ${o.service}` : `app type ${o.applicationType}`}, ${o.restartable ? 'restartable' : 'not restartable'})`;

async function snapshot(p: ReleaseParams, ctx: SysOpContext): Promise<{ owners: RmOwner[]; exeNames: Map<string, string>; reboot: number } | string> {
  if (!isInsideGrantedRoot(p.path)) return 'Pick the file or folder with the native file picker before releasing its locks.';
  const [locks, processes] = await Promise.all([ctx.helper('lock.rmList', { path: p.path }), ctx.helper('process.list', {})]);
  if (!locks.ok) return `Unable to list the lock owners: ${locks.error}`;
  const exeNames = new Map<string, string>();
  if (processes.ok) for (const item of (processes.data as ProcessListResult).processes) exeNames.set(ownerKey(item), item.name);
  const data = locks.data as { owners?: unknown; rebootReasons?: unknown };
  return { owners: Array.isArray(data.owners) ? (data.owners as RmOwner[]) : [], exeNames, reboot: Number(data.rebootReasons ?? 0) };
}

function criticalOf(owners: readonly RmOwner[], exeNames: ReadonlyMap<string, string>): string | undefined {
  for (const o of owners) {
    const exe = exeNames.get(ownerKey(o));
    if (exe && CRITICAL.has(exe.toLowerCase())) return exe;
    if (o.applicationType === RM_SERVICE && CRITICAL_SERVICES.has(o.service.toLowerCase())) return o.service;
  }
  return undefined;
}

const releaseOp: SysOpDefinition<ReleaseParams> = {
  kind: 'lock.release',
  validate: validateRelease,
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const summary = p.restartAfter
      ? 'Ask the applications holding these locks to close, then restart them (Restart Manager)'
      : 'Ask the applications holding these locks to close (Restart Manager)';
    const base = { target: p.path, summary, requiresElevation: false, noUndo: true };
    const shot = await snapshot(p, ctx);
    if (typeof shot === 'string') return { ...base, precondition: { keys: [] as string[] }, blockedReason: shot };
    const { owners, exeNames, reboot } = shot;
    const warnings = ['Applications are asked to close gracefully; they may prompt to save or decline. Nothing is force-closed.'];
    if (owners.some((o) => o.applicationType === RM_SERVICE)) warnings.push('Services holding the lock are stopped and can take dependent services with them.');
    if (!p.restartAfter) warnings.push('Closed applications are not restarted.');
    else if (owners.some((o) => !o.restartable)) warnings.push('Some applications are not restartable and will stay closed.');
    if (reboot) warnings.push('Restart Manager reports that a reboot may be needed to fully release these files.');
    const typed = criticalOf(owners, exeNames);
    if (typed) warnings.push('A critical Windows process or service is among the owners.');
    let blockedReason: string | undefined;
    if (!owners.length) blockedReason = 'Restart Manager reports no application holding this path.';
    else if (owners.some((o) => o.applicationType === RM_CRITICAL)) blockedReason = 'A critical system process holds this path; Restart Manager cannot release it.';
    return {
      ...base, before: owners.map(describeOwner).join('\n') || '(none)', after: p.restartAfter ? 'Closed, then restarted' : 'Closed',
      precondition: { keys: owners.map(ownerKey).sort() }, warnings, ...(typed ? { typedConfirm: typed } : {}),
      ...(blockedReason ? { blockedReason } : {}),
    };
  },
  async apply(p, precondition, ctx): Promise<SysOpApplyResult> {
    const saved = (precondition as { keys?: unknown } | null)?.keys;
    const shot = await snapshot(p, ctx);
    if (typeof shot === 'string') return { outcome: 'conflict', message: shot };
    const now = shot.owners.map(ownerKey).sort();
    if (!Array.isArray(saved) || saved.length !== now.length || saved.some((k, i) => k !== now[i])) {
      return { outcome: 'conflict', message: 'The applications holding this path changed since the preview.' };
    }
    if (shot.owners.some((o) => o.applicationType === RM_CRITICAL)) return { outcome: 'conflict', message: 'A critical system process holds this path.' };
    const done = await ctx.helper('lock.rmRelease', { path: p.path, restartAfter: p.restartAfter });
    if (!done.ok) return { outcome: 'failed', message: done.error };
    const d = done.data as { shutdownStatus?: number; restartStatus?: number; rebootReasons?: number };
    const count = shot.owners.length;
    if (d.shutdownStatus) return { outcome: 'failed', message: `${RM_MESSAGES[d.shutdownStatus] ?? `Restart Manager shutdown failed (error ${d.shutdownStatus}).`} Nothing was force-closed.` };
    if (p.restartAfter && d.restartStatus) return { outcome: 'failed', message: `Closed ${count} application(s). ${RM_MESSAGES[d.restartStatus] ?? `Restart failed (error ${d.restartStatus}).`}` };
    return {
      outcome: 'applied', before: `${count} application(s) holding the path`,
      after: (p.restartAfter ? 'Closed and restarted' : 'Closed') + (d.rebootReasons ? '. A reboot may be required to fully release the files.' : ''),
    };
  },
};

export function registerFileLockOps(register: <P>(def: SysOpDefinition<P>) => void): void {
  register(endOwnerOp);
  register(releaseOp);
}
