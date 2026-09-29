import type { SysOpApplyResult, SysOpContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';

/**
 * Process-management ops (DUDE_PRD.md §21 Phase 31, Milestone 596): end task, end process tree, restart,
 * suspend/resume, priority, affinity and crash dump. Every op targets a `{ pid, startKey }` reference the
 * helper verifies against the process's real creation time, so a reused PID is never acted on (code 1168).
 * Elevation is discovered at apply time: an access-denied result surfaces as a `failed` outcome with a
 * relaunch hint rather than blocking the plan up front.
 */

/** Registered by `./index` (a function, not an import side effect, so the engine/family cycle stays safe). */
export type RegisterSysOp = <P>(def: SysOpDefinition<P>) => void;

const CRITICAL_NAMES = new Set(['system', 'smss.exe', 'csrss.exe', 'wininit.exe', 'winlogon.exe', 'services.exe', 'lsass.exe']);
const ERROR_ACCESS_DENIED = 5;
const ERROR_NOT_FOUND = 1168;
const ACCESS_HINT = 'Access is denied — try Relaunch as Administrator.';
const GONE = 'Already exited or PID reused.';
const PRIORITIES = ['idle', 'below-normal', 'normal', 'above-normal', 'high', 'realtime'] as const;
type PriorityClass = (typeof PRIORITIES)[number];

interface ProcRef { pid: number; startKey: string; name: string }
interface PriorityParams extends ProcRef { priorityClass: PriorityClass }
interface AffinityParams extends ProcRef { affinityMask: string }
interface DumpParams extends ProcRef { outputPath: string; full: boolean }

function record(raw: unknown, what: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid ${what} parameters.`);
  return raw as Record<string, unknown>;
}

function validateRef(raw: unknown, what: string): ProcRef {
  const r = record(raw, what);
  const { pid, startKey, name } = r;
  if (typeof pid !== 'number' || !Number.isSafeInteger(pid) || pid <= 0 || pid > 0xffffffff) throw new Error(`Invalid ${what}: pid.`);
  if (typeof startKey !== 'string' || !/^\d{1,20}$/.test(startKey)) throw new Error(`Invalid ${what}: startKey.`);
  if (typeof name !== 'string' || !name || name.length > 260) throw new Error(`Invalid ${what}: name.`);
  return { pid, startKey, name };
}

const ref = (p: ProcRef) => ({ pid: p.pid, startKey: p.startKey });
const targetOf = (p: ProcRef) => `${p.name} (PID ${p.pid})`;
const isCritical = (name: string) => CRITICAL_NAMES.has(name.toLowerCase());
const isAbsoluteWindowsPath = (path: string) => /^(?:[a-zA-Z]:[\\/]|\\\\)[^\0]+$/.test(path);

interface Failed { ok: false; error: string; code?: number }
const isFailed = (result: { ok: boolean }): result is Failed => !result.ok;

/** Maps a failed helper call onto an apply outcome. */
function failure(result: Failed, prefix = ''): SysOpApplyResult {
  if (result.code === ERROR_NOT_FOUND) return { outcome: 'conflict', message: prefix + GONE };
  if (result.code === ERROR_ACCESS_DENIED) return { outcome: 'failed', message: prefix + ACCESS_HINT };
  return { outcome: 'failed', message: prefix + result.error };
}

function criticalWarnings(p: ProcRef, warnings: string[]): string | undefined {
  if (p.pid === process.pid) warnings.push('This is DUDE itself; ending it will close the app.');
  if (!isCritical(p.name)) return undefined;
  warnings.push('This is a critical Windows process.');
  return p.name;
}

const base = (p: ProcRef, summary: string, extra: Partial<SysOpPreviewResult> = {}): SysOpPreviewResult => ({
  target: targetOf(p), summary, requiresElevation: false, noUndo: false, precondition: ref(p), ...extra,
});

const asData = <T>(data: unknown): T => (data && typeof data === 'object' ? data : {}) as T;

interface DescendantInfo { pid: number; startKey: string; name: string }
async function fetchTree(p: ProcRef, ctx: SysOpContext): Promise<{ ok: true; descendants: DescendantInfo[] } | Failed> {
  const result = await ctx.helper('proc.tree', ref(p));
  if (isFailed(result)) return result;
  const list = asData<{ descendants?: unknown }>(result.data).descendants;
  const descendants = (Array.isArray(list) ? list : []).flatMap((item): DescendantInfo[] => {
    const d = item as Partial<DescendantInfo> | null;
    return d && typeof d.pid === 'number' && typeof d.startKey === 'string' ? [{ pid: d.pid, startKey: d.startKey, name: String(d.name ?? '') }] : [];
  });
  return { ok: true, descendants };
}

interface StartInfo { imagePath: string | null; commandLine: string | null; currentDirectory: string | null; environment: Record<string, string> | null; priorityClass: string | null; affinityMask: string | null; systemAffinityMask: string | null }
async function fetchStartInfo(p: ProcRef, ctx: SysOpContext): Promise<{ ok: true; info: StartInfo } | Failed> {
  const result = await ctx.helper('proc.startInfo', ref(p));
  if (isFailed(result)) return result;
  const d = asData<Partial<Record<keyof StartInfo, unknown>>>(result.data);
  const text = (value: unknown) => (typeof value === 'string' ? value : null);
  const env = d.environment && typeof d.environment === 'object' && !Array.isArray(d.environment) ? (d.environment as Record<string, string>) : null;
  return {
    ok: true,
    info: {
      imagePath: text(d.imagePath), commandLine: text(d.commandLine), currentDirectory: text(d.currentDirectory), environment: env,
      priorityClass: text(d.priorityClass), affinityMask: text(d.affinityMask), systemAffinityMask: text(d.systemAffinityMask),
    },
  };
}

// ---- process.end ----

const endOp: SysOpDefinition<ProcRef> = {
  kind: 'process.end',
  validate: (raw) => validateRef(raw, 'process.end'),
  async preview(p) {
    const warnings: string[] = [];
    const typedConfirm = criticalWarnings(p, warnings);
    return base(p, 'End the process', { noUndo: true, warnings, ...(typedConfirm ? { typedConfirm } : {}) });
  },
  async apply(p, _precondition, ctx) {
    const result = await ctx.helper('proc.terminate', ref(p));
    if (isFailed(result)) return failure(result);
    return { outcome: 'applied', before: 'Running', after: 'Ended' };
  },
};

// ---- process.end-tree ----

const PREVIEW_LIST = 20;

const endTreeOp: SysOpDefinition<ProcRef> = {
  kind: 'process.end-tree',
  validate: (raw) => validateRef(raw, 'process.end-tree'),
  async preview(p, ctx) {
    const warnings: string[] = [];
    const typedConfirm = criticalWarnings(p, warnings);
    const tree = await fetchTree(p, ctx);
    if (isFailed(tree)) {
      return base(p, 'End the process and its descendants', {
        noUndo: true, warnings, ...(typedConfirm ? { typedConfirm } : {}),
        blockedReason: tree.code === ERROR_NOT_FOUND ? 'The process has already exited or its PID was reused.' : `Cannot list descendants: ${tree.error}`,
      });
    }
    const shown = tree.descendants.slice(0, PREVIEW_LIST).map((d) => `${d.name} (PID ${d.pid})`);
    if (tree.descendants.length > PREVIEW_LIST) shown.push(`… and ${tree.descendants.length - PREVIEW_LIST} more`);
    if (tree.descendants.some((d) => d.pid === process.pid)) warnings.push('This includes DUDE itself; ending it will close the app.');
    return base(p, `End the process and its ${tree.descendants.length} descendant(s)`, {
      noUndo: true, warnings, before: shown.join('\n') || '(no descendants)', ...(typedConfirm ? { typedConfirm } : {}),
    });
  },
  async apply(p, _precondition, ctx) {
    const tree = await fetchTree(p, ctx);
    if (isFailed(tree)) return failure(tree);
    const problems: string[] = [];
    let ended = 0;
    // The helper lists descendants depth-first (parents before children); reversing ends leaves first.
    for (const child of [...tree.descendants].reverse()) {
      const result = await ctx.helper('proc.terminate', { pid: child.pid, startKey: child.startKey });
      if (!isFailed(result)) ended++;
      else if (result.code !== ERROR_NOT_FOUND) problems.push(`${child.name} (PID ${child.pid}): ${result.code === ERROR_ACCESS_DENIED ? ACCESS_HINT : result.error}`);
    }
    const root = await ctx.helper('proc.terminate', ref(p));
    if (isFailed(root)) {
      if (root.code === ERROR_NOT_FOUND && !problems.length) return { outcome: 'conflict', message: `${GONE} ${ended} descendant(s) ended.` };
      problems.unshift(`${p.name} (PID ${p.pid}): ${root.code === ERROR_NOT_FOUND ? GONE : root.code === ERROR_ACCESS_DENIED ? ACCESS_HINT : root.error}`);
    } else ended++;
    if (problems.length) return { outcome: 'failed', message: `Ended ${ended} of ${tree.descendants.length + 1} process(es). ${problems.join(' ')}` };
    return { outcome: 'applied', before: 'Running', after: `Ended ${ended} process(es)` };
  },
};

// ---- process.restart ----

interface RestartPrecondition { ref: { pid: number; startKey: string }; imagePath: string; commandLine: string; currentDirectory: string | null; environment: Record<string, string> | null }

const restartOp: SysOpDefinition<ProcRef> = {
  kind: 'process.restart',
  validate: (raw) => validateRef(raw, 'process.restart'),
  async preview(p, ctx) {
    const warnings: string[] = [];
    const typedConfirm = criticalWarnings(p, warnings);
    const common = { noUndo: true, warnings, ...(typedConfirm ? { typedConfirm } : {}) };
    const info = await fetchStartInfo(p, ctx);
    if (isFailed(info)) return base(p, 'Restart (end, then relaunch)', { ...common, blockedReason: `Cannot restart: ${info.error}` });
    const { imagePath, commandLine } = info.info;
    if (!imagePath || !commandLine) return base(p, 'Restart (end, then relaunch)', { ...common, blockedReason: 'Cannot restart: command line unavailable.' });
    const precondition: RestartPrecondition = {
      ref: ref(p), imagePath, commandLine, currentDirectory: info.info.currentDirectory, environment: info.info.environment,
    };
    return base(p, 'Restart (end, then relaunch)', { ...common, after: commandLine, precondition });
  },
  async apply(p, precondition, ctx) {
    const pre = precondition as RestartPrecondition;
    const ended = await ctx.helper('proc.terminate', ref(p));
    if (isFailed(ended)) return failure(ended);
    const created = await ctx.helper('proc.create', {
      imagePath: pre.imagePath, commandLine: pre.commandLine,
      ...(pre.currentDirectory ? { currentDirectory: pre.currentDirectory } : {}),
      ...(pre.environment ? { environment: pre.environment } : {}),
    });
    if (isFailed(created)) return { outcome: 'failed', message: `The process was ended but could not be relaunched: ${created.error}` };
    const newPid = asData<{ pid?: unknown }>(created.data).pid;
    return { outcome: 'applied', before: `PID ${p.pid}`, after: `Relaunched as PID ${typeof newPid === 'number' ? newPid : '?'}` };
  },
};

// ---- process.suspend / process.resume ----

function pauseOp(kind: 'process.suspend' | 'process.resume', inverse: 'process.resume' | 'process.suspend', method: 'proc.suspend' | 'proc.resume'): SysOpDefinition<ProcRef> {
  const suspending = kind === 'process.suspend';
  return {
    kind,
    validate: (raw) => validateRef(raw, kind),
    async preview(p) {
      const warnings: string[] = [];
      if (suspending && isCritical(p.name)) warnings.push('This is a critical Windows process. Suspending it can hang the system.');
      if (suspending && p.pid === process.pid) warnings.push('This is DUDE itself; suspending it will freeze the app.');
      return base(p, suspending ? 'Suspend the process' : 'Resume the process', { warnings, before: suspending ? 'Running' : 'Suspended', after: suspending ? 'Suspended' : 'Running' });
    },
    async apply(p, _precondition, ctx) {
      const result = await ctx.helper(method, ref(p));
      if (isFailed(result)) return failure(result);
      return {
        outcome: 'applied', before: suspending ? 'Running' : 'Suspended', after: suspending ? 'Suspended' : 'Running',
        undo: { kind: inverse, params: { pid: p.pid, startKey: p.startKey, name: p.name } },
      };
    },
  };
}

// ---- process.set-priority ----

const priorityOp: SysOpDefinition<PriorityParams> = {
  kind: 'process.set-priority',
  validate(raw) {
    const p = validateRef(raw, 'process.set-priority');
    const priorityClass = (raw as Record<string, unknown>)['priorityClass'];
    if (typeof priorityClass !== 'string' || !(PRIORITIES as readonly string[]).includes(priorityClass)) throw new Error('Invalid process.set-priority: priorityClass.');
    return { ...p, priorityClass: priorityClass as PriorityClass };
  },
  async preview(p, ctx) {
    const warnings = p.priorityClass === 'realtime' ? ['Real-time priority can starve the system; Windows may cap it at High without the right privilege.'] : [];
    const info = await fetchStartInfo(p, ctx);
    const before = !isFailed(info) ? info.info.priorityClass ?? undefined : undefined;
    return base(p, `Set the priority class to ${p.priorityClass}`, { warnings, ...(before ? { before } : {}), after: p.priorityClass });
  },
  async apply(p, _precondition, ctx) {
    const result = await ctx.helper('proc.setPriority', { ...ref(p), priorityClass: p.priorityClass });
    if (isFailed(result)) return failure(result);
    const previous = asData<{ previous?: unknown }>(result.data).previous;
    const prev = typeof previous === 'string' && (PRIORITIES as readonly string[]).includes(previous) ? previous : null;
    return {
      outcome: 'applied', ...(prev ? { before: prev } : {}), after: p.priorityClass,
      ...(prev ? { undo: { kind: 'process.set-priority', params: { pid: p.pid, startKey: p.startKey, name: p.name, priorityClass: prev } } } : {}),
    };
  },
};

// ---- process.set-affinity ----

const MASK_PATTERN = /^0x[0-9a-fA-F]{1,16}$/;
const maskValue = (mask: string) => BigInt(mask);

const affinityOp: SysOpDefinition<AffinityParams> = {
  kind: 'process.set-affinity',
  validate(raw) {
    const p = validateRef(raw, 'process.set-affinity');
    const affinityMask = (raw as Record<string, unknown>)['affinityMask'];
    if (typeof affinityMask !== 'string' || !MASK_PATTERN.test(affinityMask) || maskValue(affinityMask) === 0n) throw new Error('Invalid process.set-affinity: affinityMask.');
    return { ...p, affinityMask: affinityMask.toLowerCase() };
  },
  async preview(p, ctx) {
    const info = await fetchStartInfo(p, ctx);
    let blockedReason: string | undefined;
    let before: string | undefined;
    if (!isFailed(info)) {
      before = info.info.affinityMask ?? undefined;
      const system = info.info.systemAffinityMask;
      if (system && MASK_PATTERN.test(system) && (maskValue(p.affinityMask) & ~maskValue(system)) !== 0n) blockedReason = 'Affinity mask includes processors that do not exist.';
    }
    return base(p, `Set the CPU affinity mask to ${p.affinityMask}`, { ...(before ? { before } : {}), after: p.affinityMask, ...(blockedReason ? { blockedReason } : {}) });
  },
  async apply(p, _precondition, ctx) {
    const result = await ctx.helper('proc.setAffinity', { ...ref(p), affinityMask: p.affinityMask });
    if (isFailed(result)) return failure(result);
    const previous = asData<{ previous?: unknown }>(result.data).previous;
    const prev = typeof previous === 'string' && MASK_PATTERN.test(previous) ? previous : null;
    return {
      outcome: 'applied', ...(prev ? { before: prev } : {}), after: p.affinityMask,
      ...(prev ? { undo: { kind: 'process.set-affinity', params: { pid: p.pid, startKey: p.startKey, name: p.name, affinityMask: prev } } } : {}),
    };
  },
};

// ---- process.dump ----

const dumpOp: SysOpDefinition<DumpParams> = {
  kind: 'process.dump',
  validate(raw) {
    const p = validateRef(raw, 'process.dump');
    const { outputPath, full } = raw as Record<string, unknown>;
    if (typeof outputPath !== 'string' || outputPath.length > 1024 || !isAbsoluteWindowsPath(outputPath)) throw new Error('Invalid process.dump: outputPath must be an absolute path.');
    if (typeof full !== 'boolean') throw new Error('Invalid process.dump: full.');
    return { ...p, outputPath, full };
  },
  async preview(p) {
    const warnings = p.full ? ['A full-memory dump can be very large and contains everything in the process memory, including secrets.'] : [];
    return base(p, `Write a crash dump to ${p.outputPath}`, { noUndo: true, warnings, after: p.full ? 'Full-memory dump' : 'Minidump' });
  },
  async apply(p, _precondition, ctx) {
    const result = await ctx.helper('proc.dump', { ...ref(p), outputPath: p.outputPath, full: p.full });
    if (isFailed(result)) return failure(result);
    const bytes = asData<{ bytes?: unknown }>(result.data).bytes;
    return { outcome: 'applied', after: `${typeof bytes === 'number' ? bytes : '?'} bytes written` };
  },
};

export const PROCESS_OPS: readonly SysOpDefinition<any>[] = [
  endOp, endTreeOp, restartOp,
  pauseOp('process.suspend', 'process.resume', 'proc.suspend'), pauseOp('process.resume', 'process.suspend', 'proc.resume'),
  priorityOp, affinityOp, dumpOp,
];

export function registerProcessOps(register: RegisterSysOp): void {
  for (const def of PROCESS_OPS) register(def);
}
