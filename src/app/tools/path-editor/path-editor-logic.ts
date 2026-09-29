import type { SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';
import type { RegistryKeyParams, RegistryValue } from '../../../shared-logic/system/system-types';
import { expandEnvStrings } from '../../../shared-logic/system/env-expand';
import { SYSTEM_EXPANSION_DEFAULTS, joinPath, type PathIssueKind, type ShadowConflict } from '../../../shared-logic/system/path-analysis';
import type { Finding } from '../../shared/components/findings-list/findings-list';

export type EditablePathScope = 'user' | 'machine';
export type PathViewScope = EditablePathScope | 'effective';
export const PATH_VIEW_SCOPES: readonly PathViewScope[] = ['user', 'machine', 'effective'];
export const PATH_SCOPE_LABEL: Readonly<Record<PathViewScope, string>> = { user: 'User', machine: 'Machine', effective: 'Effective (read-only)' };

export const PATH_ENV_KEYS: Readonly<Record<EditablePathScope | 'volatile', RegistryKeyParams>> = {
  user: { hive: 'HKCU', path: 'Environment', view: 'default' },
  machine: { hive: 'HKLM', path: 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', view: 'default' },
  volatile: { hive: 'HKCU', path: 'Volatile Environment', view: 'default' },
};

export const RUNTIME_DETECTOR_ROUTE = '/tools/runtime-detector';

export const ISSUE_LABEL: Readonly<Record<PathIssueKind, string>> = {
  duplicate: 'duplicate',
  missing: 'missing',
  'not-directory': 'not a folder',
  unresolved: 'unresolved variable',
  empty: 'empty',
  relative: 'relative',
  quoted: 'quoted',
  'long-entry': 'too long',
  unreadable: 'unreadable',
};

export interface EnvStringValue { readonly name: string; readonly value: string }

/** Only string-typed values are environment variables. */
export function stringEnv(values: readonly RegistryValue[]): EnvStringValue[] {
  return values.flatMap((v) => (v.name && (v.type === 'REG_SZ' || v.type === 'REG_EXPAND_SZ') ? [{ name: v.name, value: typeof v.data === 'string' ? v.data : String(v.data) }] : []));
}

export const findEnvValue = (values: readonly EnvStringValue[], name: string): string | undefined =>
  values.find((v) => v.name.toLowerCase() === name.toLowerCase())?.value;

/**
 * The map used to expand PATH entries: Windows' per-process defaults (lowest priority), then machine,
 * user and volatile (later wins), with values that themselves reference variables expanded once.
 */
export function buildPathExpansionMap(scopes: Partial<Record<EditablePathScope | 'volatile', readonly EnvStringValue[]>>): Map<string, string> {
  const map = new Map<string, string>(Object.entries(SYSTEM_EXPANSION_DEFAULTS));
  for (const scope of ['machine', 'user', 'volatile'] as const) for (const v of scopes[scope] ?? []) map.set(v.name.toLowerCase(), v.value);
  const flat = new Map<string, string>();
  for (const [k, v] of map) flat.set(k, expandEnvStrings(v, map));
  return flat;
}

/** The one `env.set` request Save builds: the rebuilt raw `;`-joined value, expandable. */
export function pathSetRequest(scope: EditablePathScope, raws: readonly string[]): SysPlanRequest {
  return { tool: 'path-editor', title: `Set ${scope} PATH`, ops: [{ kind: 'env.set', params: { scope, name: 'PATH', value: joinPath(raws), expandable: true } }] };
}

export const sameList = (a: readonly string[], b: readonly string[]): boolean => joinPath(a) === joinPath(b);

/** Summary findings for the conflict view; common-tool conflicts link to Runtime Detector. */
export function shadowFindings(shadows: readonly ShadowConflict[]): Finding[] {
  return shadows
    .filter((s) => s.common || s.note)
    .map((s) => ({
      id: `shadow-${s.name}`,
      status: 'warn' as const,
      title: `${s.name}: ${s.shadowed.length + 1} copies on PATH, ${s.winner.dir} wins`,
      detail: s.note ?? `Shadowed: ${s.shadowed.map((c) => c.dir).join('; ')}`,
      link: RUNTIME_DETECTOR_ROUTE,
      linkLabel: 'Runtime Detector',
    }));
}
