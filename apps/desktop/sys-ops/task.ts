import type { ScheduledTaskDetail } from "@dude/contracts/system/task-types";
import type { SysApplyContext, SysOpApplyResult, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import { runFixedScript } from '../sys-pwsh';
import type { RegisterSysOp } from './process';

interface TaskRef { taskPath: string; taskName: string }
interface SetEnabledParams extends TaskRef { enabled: boolean }
interface TaskPrecondition { enabled: boolean }
const CHANGED = 'The scheduled task enabled state changed since the preview.';

function strictRecord(raw: unknown, kind: string, allowed: readonly string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid ${kind} parameters.`);
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) throw new Error(`Invalid ${kind}: unknown field ${key}.`);
  return record;
}
function validateRef(r: Record<string, unknown>, kind: string): TaskRef {
  const taskPath = r['taskPath'], taskName = r['taskName'];
  if (typeof taskPath !== 'string' || taskPath.length > 1024 || !taskPath.startsWith('\\') || /[\u0000-\u001f\u007f]/.test(taskPath) || taskPath.includes('..')) throw new Error(`Invalid ${kind}: taskPath must be an absolute Task Scheduler path.`);
  if (taskPath !== '\\' && !taskPath.endsWith('\\')) throw new Error(`Invalid ${kind}: taskPath must end with a backslash.`);
  if (typeof taskName !== 'string' || taskName.length < 1 || taskName.length > 512 || /[\\/\u0000-\u001f\u007f]/.test(taskName) || taskName === '.' || taskName === '..') throw new Error(`Invalid ${kind}: taskName is invalid.`);
  return { taskPath, taskName };
}
async function readTask(p: TaskRef, signal?: AbortSignal): Promise<ScheduledTaskDetail> {
  return await runFixedScript('task.detail', p, signal ?? new AbortController().signal) as ScheduledTaskDetail;
}
function enabledOp(enabled: boolean): SysOpDefinition<SetEnabledParams> {
  const kind = enabled ? 'task.enable' : 'task.disable';
  return {
    kind,
    validate(raw) {
      const r = strictRecord(raw, kind, ['taskPath', 'taskName']);
      return { ...validateRef(r, kind), enabled };
    },
    async preview(p, _ctx): Promise<SysOpPreviewResult> {
      const target = `${p.taskPath}${p.taskName}`;
      try {
        const current = await readTask(p);
        if (current.enabled === enabled) return { target, summary: `${enabled ? 'Enable' : 'Disable'} scheduled task`, before: String(current.enabled), after: String(enabled), requiresElevation: false, noUndo: false, precondition: { enabled: current.enabled }, blockedReason: `The scheduled task is already ${enabled ? 'enabled' : 'disabled'}.` };
        return { target, summary: `${enabled ? 'Enable' : 'Disable'} scheduled task`, before: String(current.enabled), after: String(enabled), requiresElevation: false, noUndo: false, precondition: { enabled: current.enabled } };
      } catch (error) {
        return { target, summary: `${enabled ? 'Enable' : 'Disable'} scheduled task`, requiresElevation: false, noUndo: false, precondition: null, blockedReason: `Cannot read scheduled task: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    async apply(p, precondition, ctx: SysApplyContext): Promise<SysOpApplyResult> {
      let current: ScheduledTaskDetail;
      try { current = await readTask(p, ctx.signal); } catch (error) { return { outcome: 'failed', message: `Cannot re-check scheduled task: ${error instanceof Error ? error.message : String(error)}` }; }
      if (current.enabled !== (precondition as TaskPrecondition).enabled) return { outcome: 'conflict', message: CHANGED };
      if (current.enabled === enabled) return { outcome: 'conflict', message: `The scheduled task is already ${enabled ? 'enabled' : 'disabled'}.` };
      try { await runFixedScript('task.setEnabled', { ...p, enabled }, ctx.signal); }
      catch (error) { return { outcome: 'failed', message: error instanceof Error ? error.message : String(error) }; }
      return { outcome: 'applied', before: String(current.enabled), after: String(enabled), undo: { kind: enabled ? 'task.disable' : 'task.enable', params: { taskPath: p.taskPath, taskName: p.taskName } } };
    },
  };
}
export const TASK_OPS = [enabledOp(true), enabledOp(false)];
export function registerTaskOps(register: RegisterSysOp): void { for (const def of TASK_OPS) register(def); }