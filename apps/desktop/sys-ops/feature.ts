import type { WindowsFeature, WindowsFeatureList } from "@dude/contracts/system/feature-types";
import type { SysApplyContext, SysOpApplyResult, SysOpDefinition, SysOpPreviewResult } from '../sys-mutation';
import { runFixedScript } from '../sys-pwsh';
import type { RegisterSysOp } from './process';

interface FeatureParams { name: string; enabled: boolean }
interface Precondition { state: WindowsFeature['state']; restartNeeded: boolean | null }
const CHANGED = 'The Windows feature state changed since the preview.';

function params(raw: unknown, enabled: boolean): FeatureParams {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid Windows feature parameters.');
  const r = raw as Record<string, unknown>;
  for (const key of Object.keys(r)) if (!['name'].includes(key)) throw new Error(`Invalid Windows feature operation: unknown field ${key}.`);
  if (typeof r['name'] !== 'string' || !r['name'] || r['name'].length > 512 || /[\u0000-\u001f\u007f]/.test(r['name'])) throw new Error('Feature name must be a non-empty name returned by Windows.');
  return { name: r['name'], enabled };
}

async function read(name: string, signal?: AbortSignal): Promise<WindowsFeature> {
  const result = await runFixedScript('feature.list', {}, signal ?? new AbortController().signal) as WindowsFeatureList | WindowsFeature[] | null;
  const rows = Array.isArray(result) ? result : result && Array.isArray(result.features) ? result.features : [];
  const feature = rows.find((row) => row.name.toLowerCase() === name.toLowerCase());
  if (!feature) throw new Error('The Windows optional feature was not found.');
  return feature;
}

function enabledOp(enabled: boolean): SysOpDefinition<FeatureParams> {
  const kind = enabled ? 'feature.enable' : 'feature.disable';
  const label = enabled ? 'Enable' : 'Disable';
  return {
    kind,
    validate(raw) { return params(raw, enabled); },
    async preview(p): Promise<SysOpPreviewResult> {
      const target = p.name;
      try {
        const current = await read(p.name);
        const precondition: Precondition = { state: current.state, restartNeeded: current.restartNeeded };
        const warnings = ['Windows may require a restart to complete this change.'];
        if (current.restartNeeded) warnings.push('Windows already reports that a restart is needed.');
        const base = { target, summary: `${label} Windows feature`, requiresElevation: true, noUndo: false, warnings, before: current.state, after: enabled ? 'enabled' : 'disabled', precondition };
        if (current.state === (enabled ? 'enabled' : 'disabled')) return { ...base, blockedReason: `The feature is already ${enabled ? 'enabled' : 'disabled'}.` };
        if (current.state.endsWith('-pending') || current.state === 'unknown') return { ...base, blockedReason: 'The feature is in a pending or unknown state and cannot be changed safely.' };
        return base;
      } catch (error) {
        return { target, summary: `${label} Windows feature`, requiresElevation: true, noUndo: false, precondition: null, blockedReason: `Cannot read Windows feature: ${error instanceof Error ? error.message : String(error)}` };
      }
    },
    async apply(p, precondition, ctx: SysApplyContext): Promise<SysOpApplyResult> {
      let current: WindowsFeature;
      try { current = await read(p.name, ctx.signal); }
      catch (error) { return { outcome: 'failed', message: `Cannot re-check Windows feature: ${error instanceof Error ? error.message : String(error)}` }; }
      const pre = precondition as Precondition;
      if (current.state !== pre.state || current.restartNeeded !== pre.restartNeeded) return { outcome: 'conflict', message: CHANGED };
      if (current.state === (enabled ? 'enabled' : 'disabled')) return { outcome: 'conflict', message: `The feature is already ${enabled ? 'enabled' : 'disabled'}.` };
      try { await runFixedScript('feature.setEnabled', { name: p.name, enabled }, ctx.signal); }
      catch (error) { return { outcome: 'failed', message: error instanceof Error ? error.message : String(error) }; }
      return { outcome: 'applied', before: current.state, after: enabled ? 'enabled' : 'disabled', undo: { kind: enabled ? 'feature.disable' : 'feature.enable', params: { name: p.name } } };
    },
  };
}

export const FEATURE_OPS: readonly SysOpDefinition<any>[] = [enabledOp(true), enabledOp(false)];
export function registerFeatureOps(register: RegisterSysOp): void { for (const def of FEATURE_OPS) register(def); }
