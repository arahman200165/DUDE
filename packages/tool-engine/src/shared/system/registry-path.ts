/** Registry path parsing shared by the Registry Editor and ACL Inspector. */
import type { RegistryHive } from "@dude/contracts/system/system-types";
import { REGISTRY_HIVES } from "@dude/contracts/system/system-types";

export const HIVE_LONG: Readonly<Record<RegistryHive, string>> = {
  HKLM: 'HKEY_LOCAL_MACHINE', HKCU: 'HKEY_CURRENT_USER', HKCR: 'HKEY_CLASSES_ROOT', HKU: 'HKEY_USERS', HKCC: 'HKEY_CURRENT_CONFIG',
};

const HIVE_BY_NAME = new Map<string, RegistryHive>();
for (const hive of REGISTRY_HIVES) { HIVE_BY_NAME.set(hive, hive); HIVE_BY_NAME.set(HIVE_LONG[hive], hive); }

export interface KeyRef { readonly hive: RegistryHive; readonly path: string }

/**
 * Accepts `HKLM\...`, `HKEY_LOCAL_MACHINE\...`, `Computer\HKEY_LOCAL_MACHINE\...` (regedit's address
 * bar), `HKLM:\...` and `Registry::HKEY_LOCAL_MACHINE\...` (PowerShell). Returns null when the hive is unknown.
 */
export function parseRegistryPath(input: string): KeyRef | null {
  let text = input.trim().replace(/^["']|["']$/g, '').replace(/^Microsoft\.PowerShell\.Core\\/i, '').replace(/^Registry::/i, '');
  text = text.replace(/^Computer\\/i, '').replace(/\//g, '\\');
  const m = /^([A-Za-z_]+):?(?:\\(.*))?$/.exec(text);
  if (!m) return null;
  const hive = HIVE_BY_NAME.get(m[1].toUpperCase());
  if (!hive) return null;
  const path = (m[2] ?? '').split('\\').filter(Boolean).join('\\');
  return { hive, path };
}

