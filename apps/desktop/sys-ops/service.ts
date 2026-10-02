import type { ServiceConfig, ServiceStartType } from "@dude/contracts/system/system-types";
import type { SysApplyContext, SysOpApplyResult, SysOpContext, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import { validateServiceName } from '../sys-validation';
import type { RegisterSysOp } from './process';

/**
 * Windows service ops (DUDE_PRD.md §21 Phase 31, Milestone 602): `service.start`, `service.stop`,
 * `service.restart` and `service.setStartType`. They ride on the helper's `svc.control` / `svc.setStartType`
 * (reached only from confirmed engine plans) and read live state through `svc.config`. Service control needs
 * administrator rights, so every op requires elevation. Services in a small critical set, and drivers, need
 * the service name typed to confirm. Start and stop undo each other; restart has no undo.
 */

const CRITICAL_SERVICES = new Set([
  'rpcss', 'dcomlaunch', 'lsm', 'power', 'profsvc', 'eventlog', 'schedule', 'dhcp', 'dnscache', 'nsi', 'mpssvc', 'windefend', 'winmgmt', 'themes', 'audiosrv',
].map((n) => n.toLowerCase()));

const ERROR_ACCESS_DENIED = 5;
const ERROR_DEPENDENT_SERVICES_RUNNING = 1051;
const ERROR_SERVICE_DOES_NOT_EXIST = 1060;
const ACCESS_HINT = 'Access is denied — try Relaunch as Administrator.';
const DEPENDENTS_HINT = 'The service has running dependents; stop them first.';
const CHANGED = 'The service changed since the preview.';
const MAX_DISPLAY_NAME = 512;
const SETTABLE_START_TYPES = ['auto', 'auto-delayed', 'manual', 'disabled'] as const;
type SettableStartType = (typeof SETTABLE_START_TYPES)[number];
type Action = 'start' | 'stop' | 'restart';

interface ServiceRef { name: string; displayName: string }
interface StartTypeParams extends ServiceRef { startType: SettableStartType }
interface Precondition { state: string; startType: ServiceStartType }

type HelperResult = Awaited<ReturnType<SysOpContext['helper']>>;
type Failed = Extract<HelperResult, { ok: false }>;
const isFailed = (result: { ok: boolean }): result is Failed => !result.ok;

function strictRecord(raw: unknown, what: string, allowed: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid ${what} parameters.`);
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new Error(`Invalid ${what}: unknown field ${key}.`);
  return record;
}

function validateRef(r: Record<string, unknown>, what: string): ServiceRef {
  let name: string;
  try { name = validateServiceName(r['name']); } catch (e) { throw new Error(`Invalid ${what}: ${(e as Error).message}`); }
  const displayName = r['displayName'];
  if (typeof displayName !== 'string' || displayName.length > MAX_DISPLAY_NAME || /[\u0000-\u001f\u007f]/.test(displayName)) {
    throw new Error(`Invalid ${what}: displayName must be a string of at most ${MAX_DISPLAY_NAME} characters without control characters.`);
  }
  return { name, displayName };
}

const targetOf = (p: ServiceRef) => (p.displayName && p.displayName !== p.name ? `${p.displayName} (${p.name})` : p.name);
const isCritical = (name: string, config: ServiceConfig) => config.isDriver || CRITICAL_SERVICES.has(name.toLowerCase());

function helperFailure(result: Failed, prefix = ''): SysOpApplyResult {
  if (result.code === ERROR_ACCESS_DENIED) return { outcome: 'failed', message: prefix + ACCESS_HINT };
  if (result.code === ERROR_DEPENDENT_SERVICES_RUNNING) return { outcome: 'failed', message: `${prefix}${result.error} ${DEPENDENTS_HINT}` };
  return { outcome: 'failed', message: prefix + result.error };
}

async function readConfig(name: string, ctx: SysOpContext): Promise<{ ok: true; config: ServiceConfig } | Failed> {
  const result = await ctx.helper('svc.config', { name });
  if (isFailed(result)) return result;
  const config = (result.data as { config?: ServiceConfig } | null)?.config;
  if (!config || typeof config !== 'object') return { ok: false, error: 'The service configuration could not be read.' };
  return { ok: true, config };
}

const toPrecondition = (c: ServiceConfig): Precondition => ({ state: c.state, startType: c.startType });

const blocked = (p: ServiceRef, summary: string, reason: string, extra: Partial<SysOpPreviewResult> = {}): SysOpPreviewResult => ({
  target: targetOf(p), summary, requiresElevation: true, noUndo: false, warnings: [], precondition: null, blockedReason: reason, ...extra,
});

const readFailure = (p: ServiceRef, summary: string, failed: Failed): SysOpPreviewResult =>
  blocked(p, summary, failed.code === ERROR_SERVICE_DOES_NOT_EXIST ? 'The service does not exist.' : `Cannot read the service: ${failed.error}`);

// ---- service.start / service.stop / service.restart ----

const SUMMARY: Record<Action, string> = { start: 'Start the service', stop: 'Stop the service', restart: 'Restart the service' };
const AFTER: Record<Action, string> = { start: 'running', stop: 'stopped', restart: 'running' };
const TARGET_STATE: Record<Action, string> = { start: 'running', stop: 'stopped', restart: 'running' };

function controlOp(action: Action): SysOpDefinition<ServiceRef> {
  const kind = `service.${action}`;
  const inverse = action === 'start' ? 'service.stop' : action === 'stop' ? 'service.start' : null;
  return {
    kind,
    validate(raw) {
      return validateRef(strictRecord(raw, kind, ['name', 'displayName']), kind);
    },
    async preview(p, ctx): Promise<SysOpPreviewResult> {
      const read = await readConfig(p.name, ctx);
      if (isFailed(read)) return readFailure(p, SUMMARY[action], read);
      const c = read.config;
      const warnings: string[] = [];
      let typedConfirm: string | undefined;
      if (isCritical(p.name, c)) {
        warnings.push(c.isDriver ? 'This is a driver service.' : 'This is a critical Windows service.');
        typedConfirm = p.name;
      }
      if (action !== 'start' && c.dependents.length > 0) {
        warnings.push(`Stopping this will also stop: ${c.dependents.join(', ')}`);
      }
      const extra: Partial<SysOpPreviewResult> = {
        before: c.state, after: AFTER[action], warnings, requiresElevation: true, precondition: toPrecondition(c), ...(typedConfirm ? { typedConfirm } : {}),
      };
      if (action === 'start' && c.state === 'running') return blocked(p, SUMMARY[action], 'The service is already running.', extra);
      if (action === 'stop' && c.state === 'stopped') return blocked(p, SUMMARY[action], 'The service is already stopped.', extra);
      if (action === 'start' && c.startType === 'disabled') warnings.push('The service is disabled and cannot be started until its start type is changed.');
      return {
        target: targetOf(p), summary: SUMMARY[action], noUndo: inverse === null, warnings, requiresElevation: true,
        precondition: toPrecondition(c), before: c.state, after: AFTER[action], ...(typedConfirm ? { typedConfirm } : {}),
      };
    },
    async apply(p, precondition, ctx: SysApplyContext): Promise<SysOpApplyResult> {
      const pre = precondition as Precondition;
      const read = await readConfig(p.name, ctx);
      if (isFailed(read)) return helperFailure(read, 'Cannot re-check the service: ');
      const state = read.config.state;
      if (state !== pre.state) return { outcome: 'conflict', message: CHANGED };
      if (action !== 'restart' && state === TARGET_STATE[action]) return { outcome: 'conflict', message: `The service is already ${state}.` };
      const done = await ctx.helper('svc.control', { name: p.name, action });
      if (isFailed(done)) return helperFailure(done);
      const finalState = (done.data as { state?: unknown } | null)?.state;
      return {
        outcome: 'applied', before: state, after: typeof finalState === 'string' ? finalState : AFTER[action],
        ...(inverse ? { undo: { kind: inverse, params: { name: p.name, displayName: p.displayName } } } : {}),
      };
    },
  };
}

// ---- service.setStartType ----

const setStartTypeOp: SysOpDefinition<StartTypeParams> = {
  kind: 'service.setStartType',
  validate(raw) {
    const r = strictRecord(raw, 'service.setStartType', ['name', 'displayName', 'startType']);
    const ref = validateRef(r, 'service.setStartType');
    const startType = r['startType'];
    if (typeof startType !== 'string' || !(SETTABLE_START_TYPES as readonly string[]).includes(startType)) {
      throw new Error('Invalid service.setStartType: startType must be auto, auto-delayed, manual or disabled.');
    }
    return { ...ref, startType: startType as SettableStartType };
  },
  async preview(p, ctx): Promise<SysOpPreviewResult> {
    const summary = `Set the start type to ${p.startType}`;
    const read = await readConfig(p.name, ctx);
    if (isFailed(read)) return readFailure(p, summary, read);
    const c = read.config;
    const warnings: string[] = [];
    let typedConfirm: string | undefined;
    if (isCritical(p.name, c)) {
      warnings.push(c.isDriver ? 'This is a driver service.' : 'This is a critical Windows service.');
      typedConfirm = p.name;
    }
    const extra: Partial<SysOpPreviewResult> = {
      before: c.startType, after: p.startType, warnings, requiresElevation: true, precondition: toPrecondition(c), ...(typedConfirm ? { typedConfirm } : {}),
    };
    if (c.startType === 'boot' || c.startType === 'system') {
      return blocked(p, summary, 'Boot and system start services (drivers) cannot be changed.', extra);
    }
    if (c.startType === p.startType) return blocked(p, summary, `The start type is already ${p.startType}.`, extra);
    if (p.startType === 'disabled' && c.state === 'running') warnings.push('The service is running; disabling it does not stop it.');
    return { target: targetOf(p), summary, noUndo: false, warnings, requiresElevation: true, precondition: toPrecondition(c), before: c.startType, after: p.startType, ...(typedConfirm ? { typedConfirm } : {}) };
  },
  async apply(p, precondition, ctx: SysApplyContext): Promise<SysOpApplyResult> {
    const pre = precondition as Precondition;
    const read = await readConfig(p.name, ctx);
    if (isFailed(read)) return helperFailure(read, 'Cannot re-check the service: ');
    if (read.config.startType !== pre.startType) return { outcome: 'conflict', message: CHANGED };
    const done = await ctx.helper('svc.setStartType', { name: p.name, startType: p.startType });
    if (isFailed(done)) return helperFailure(done);
    const reported = (done.data as { previous?: unknown } | null)?.previous;
    const previous = typeof reported === 'string' ? reported : pre.startType;
    const restorable = (SETTABLE_START_TYPES as readonly string[]).includes(previous);
    return {
      outcome: 'applied', before: previous, after: p.startType,
      ...(restorable ? { undo: { kind: 'service.setStartType', params: { name: p.name, displayName: p.displayName, startType: previous } } } : {}),
    };
  },
};

export const SERVICE_OPS: readonly SysOpDefinition<any>[] = [controlOp('start'), controlOp('stop'), controlOp('restart'), setStartTypeOp];

export function registerServiceOps(register: RegisterSysOp): void {
  for (const def of SERVICE_OPS) register(def);
}
