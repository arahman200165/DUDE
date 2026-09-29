import type { RegistryKeyParams, RegistryValue } from '../../../shared-logic/system/system-types';
import type { SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';
import { expandEnvStrings } from '../../../shared-logic/system/env-expand';

export type EnvScope = 'user' | 'machine' | 'volatile';
export type EditableScope = 'user' | 'machine';
export const ENV_SCOPES: readonly EnvScope[] = ['user', 'machine', 'volatile'];

export const SCOPE_LABEL: Readonly<Record<EnvScope, string>> = { user: 'User', machine: 'Machine', volatile: 'Volatile' };

export const SCOPE_KEY: Readonly<Record<EnvScope, RegistryKeyParams>> = {
  user: { hive: 'HKCU', path: 'Environment', view: 'default' },
  machine: { hive: 'HKLM', path: 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment', view: 'default' },
  volatile: { hive: 'HKCU', path: 'Volatile Environment', view: 'default' },
};

export type EnvValueType = 'REG_SZ' | 'REG_EXPAND_SZ';

export interface RawEnvValue {
  readonly name: string;
  readonly value: string;
  readonly type: EnvValueType;
}

export interface EnvRow extends RawEnvValue {
  readonly expanded: string;
}

/** Only string-typed registry values are environment variables; others are ignored. */
export function stringValues(values: readonly RegistryValue[]): RawEnvValue[] {
  const out: RawEnvValue[] = [];
  for (const v of values) {
    if (!v.name || (v.type !== 'REG_SZ' && v.type !== 'REG_EXPAND_SZ')) continue;
    out.push({ name: v.name, value: typeof v.data === 'string' ? v.data : String(v.data), type: v.type });
  }
  return out;
}

/** Windows composes the process environment machine, then user, then volatile (later wins). */
export function buildExpansionMap(scopes: Partial<Record<EnvScope, readonly { name: string; value: string }[]>>): Map<string, string> {
  const map = new Map<string, string>();
  for (const scope of ['machine', 'user', 'volatile'] as const) for (const v of scopes[scope] ?? []) map.set(v.name.toLowerCase(), v.value);
  return map;
}

export function toEnvRows(values: readonly RawEnvValue[], expansion: ReadonlyMap<string, string>): EnvRow[] {
  return values.map((v) => ({ ...v, expanded: v.type === 'REG_EXPAND_SZ' ? expandEnvStrings(v.value, expansion) : v.value }));
}

export function filterEnvRows(rows: readonly EnvRow[], query: string): EnvRow[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)) : [...rows];
}

/** null when valid; otherwise the reason. */
export function validateEnvName(name: string): string | null {
  if (!name.trim()) return 'Enter a variable name.';
  if (name.includes('=')) return 'A name cannot contain "=".';
  if (/[\0\r\n]/.test(name)) return 'A name cannot contain control characters.';
  return null;
}

export function setRequest(scope: EditableScope, name: string, value: string, expandable: boolean): SysPlanRequest {
  return { tool: 'environment-variables', title: `Set ${scope} environment variable ${name}`, ops: [{ kind: 'env.set', params: { scope, name, value, expandable } }] };
}

export function deleteRequest(scope: EditableScope, name: string): SysPlanRequest {
  return { tool: 'environment-variables', title: `Delete ${scope} environment variable ${name}`, ops: [{ kind: 'env.delete', params: { scope, name } }] };
}

/** Name -> raw value record for a snapshot. */
export function rowsToRecord(rows: readonly { name: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(rows.map((r) => [r.name, r.value]));
}
