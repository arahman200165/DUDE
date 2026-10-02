import type { SysPlanRequest } from "@dude/contracts/system/sys-mutation-types";
import type { RegistryHive, RegistryValue, RegistryValueType, RegistryView } from "@dude/contracts/system/system-types";
import { normalizeRegPath } from "../../shared/system/reg-file.js";
import type { RegTreeMap } from "../../shared/system/reg-diff.js";

export const TOOL_ID = 'registry-editor';

export { HIVE_LONG, parseRegistryPath } from "../../shared/system/registry-path.js";
export type { KeyRef } from "../../shared/system/registry-path.js";
import { HIVE_LONG } from "../../shared/system/registry-path.js";
import type { KeyRef } from "../../shared/system/registry-path.js";

export const joinPath = (parent: string, child: string): string => (parent ? `${parent}\\${child}` : child);
export const keyId = (ref: KeyRef): string => `${ref.hive}\\${ref.path}`;
export const displayPath = (ref: KeyRef): string => (ref.path ? `${ref.hive}\\${ref.path}` : ref.hive);
export const longPath = (ref: KeyRef): string => (ref.path ? `${HIVE_LONG[ref.hive]}\\${ref.path}` : HIVE_LONG[ref.hive]);
export const parentOf = (ref: KeyRef): KeyRef => ({ hive: ref.hive, path: ref.path.split('\\').slice(0, -1).join('\\') });

const viewFlag = (view: RegistryView): string => (view === 'default' ? '' : ` /reg:${view}`);
const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export function regExeCommand(ref: KeyRef, view: RegistryView): string {
  return `reg query "${displayPath(ref)}" /s${viewFlag(view)}`;
}

export function powerShellCommand(ref: KeyRef): string {
  const drive = ref.hive === 'HKLM' || ref.hive === 'HKCU' ? `${ref.hive}:\\${ref.path}` : `Registry::${longPath(ref)}`;
  return `Get-ItemProperty -Path ${psQuote(drive)}`;
}

/** Writing outside HKCU needs an elevated helper (HKU holds other users' hives). */
export const needsElevation = (hive: RegistryHive): boolean => hive !== 'HKCU';

// ---- value editing ---------------------------------------------------------------------------------

export const EDITABLE_TYPES: readonly RegistryValueType[] = ['REG_SZ', 'REG_EXPAND_SZ', 'REG_MULTI_SZ', 'REG_DWORD', 'REG_QWORD', 'REG_BINARY'];

export type ParsedData = { ok: true; data: string | number | string[] } | { ok: false; error: string };

/** Turns editor text into the `registry.setValue` data for a type (same shapes as `RegistryValue.data`). */
export function parseValueText(type: RegistryValueType, text: string): ParsedData {
  switch (type) {
    case 'REG_SZ': case 'REG_EXPAND_SZ': return { ok: true, data: text };
    case 'REG_MULTI_SZ': return { ok: true, data: text.split(/\r?\n/).filter((l) => l !== '') };
    case 'REG_DWORD': case 'REG_QWORD': {
      const t = text.trim();
      if (!/^(0x[0-9a-f]+|\d+)$/i.test(t)) return { ok: false, error: 'Enter a decimal number or 0x-prefixed hex.' };
      const big = BigInt(t);
      if (type === 'REG_DWORD') return big > 0xffffffffn ? { ok: false, error: 'A DWORD holds 0 to 4294967295.' } : { ok: true, data: Number(big) };
      return big > 0xffffffffffffffffn ? { ok: false, error: 'A QWORD holds 0 to 18446744073709551615.' } : { ok: true, data: big.toString() };
    }
    case 'REG_BINARY': {
      const cleaned = text.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
      if (!/^([0-9a-f]{2})*$/i.test(cleaned)) return { ok: false, error: 'Enter whole bytes as hex, for example 0a ff 10.' };
      return { ok: true, data: cleaned.toLowerCase() };
    }
    default: return { ok: false, error: `${type} values cannot be created or edited here.` };
  }
}

/** Editor text for an existing value. */
export function valueToText(v: Pick<RegistryValue, 'type' | 'data'>): string {
  if (Array.isArray(v.data)) return (v.data as string[]).join('\n');
  if (v.type === 'REG_BINARY') return ((String(v.data).match(/../g)) ?? []).join(' ');
  return String(v.data);
}

export const valueLabel = (name: string): string => (name === '' ? '(Default)' : name);

export function setValueRequest(ref: KeyRef, view: RegistryView, name: string, type: RegistryValueType, data: string | number | string[]): SysPlanRequest {
  return {
    tool: TOOL_ID,
    title: `Set ${valueLabel(name)} under ${displayPath(ref)}`,
    ops: [{ kind: 'registry.setValue', params: { hive: ref.hive, path: ref.path, view, name, type, data } }],
  };
}

export function deleteValueRequest(ref: KeyRef, view: RegistryView, name: string): SysPlanRequest {
  return {
    tool: TOOL_ID,
    title: `Delete ${valueLabel(name)} from ${displayPath(ref)}`,
    ops: [{ kind: 'registry.deleteValue', params: { hive: ref.hive, path: ref.path, view, name } }],
  };
}

export function createKeyRequest(ref: KeyRef, view: RegistryView): SysPlanRequest {
  return {
    tool: TOOL_ID,
    title: `Create key ${displayPath(ref)}`,
    ops: [{ kind: 'registry.createKey', params: { hive: ref.hive, path: ref.path, view } }],
  };
}

export function validateKeyName(name: string): string | null {
  if (!name.trim()) return 'Enter a key name.';
  if (name.includes('\\') ) return 'Enter a single key name without backslashes.';
  return null;
}

// ---- .reg file bytes -------------------------------------------------------------------------------

/** UTF-16LE with a BOM: the encoding regedit itself writes for REGEDIT5 files. */
export function encodeUtf16leWithBom(text: string): Uint8Array {
  const out = new Uint8Array(2 + text.length * 2);
  out[0] = 0xff; out[1] = 0xfe;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    out[2 + i * 2] = c & 0xff;
    out[3 + i * 2] = c >> 8;
  }
  return out;
}

/** Decodes a `.reg` file's bytes: UTF-16 (BOM, or NUL-heavy) or UTF-8 / ANSI. */
export function decodeRegBytes(bytes: Uint8Array): string {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  const sample = bytes.subarray(0, Math.min(bytes.length, 64));
  if (sample.length >= 4 && sample.filter((b) => b === 0).length > sample.length / 4) return new TextDecoder('utf-16le').decode(bytes);
  return new TextDecoder('utf-8').decode(bytes);
}

export function exportFileName(ref: KeyRef): string {
  const last = ref.path ? ref.path.split('\\').pop()! : ref.hive;
  return `${last.replace(/[^\w.-]+/g, '_') || ref.hive}.reg`;
}

// ---- diff scoping ----------------------------------------------------------------------------------

/** Keeps only the keys at or below `ref`, so an imported file with more keys diffs against the selected subtree. */
export function subtreeOf(tree: RegTreeMap, ref: KeyRef): RegTreeMap {
  const root = normalizeRegPath(longPath(ref)).toLowerCase();
  const out: Record<string, RegTreeMap[string]> = {};
  for (const [path, values] of Object.entries(tree)) {
    const lower = normalizeRegPath(path).toLowerCase();
    if (lower === root || lower.startsWith(root + '\\')) out[path] = values;
  }
  return out;
}
