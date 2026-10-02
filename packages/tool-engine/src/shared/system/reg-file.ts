/**
 * `.reg` file parser / serializer (REGEDIT4 and REGEDIT5). Framework-free.
 *
 * Value data uses the same convention as the helper's `RegistryValue.data`: REG_SZ / REG_EXPAND_SZ /
 * REG_LINK -> string, REG_MULTI_SZ -> string[], REG_DWORD -> number, REG_QWORD -> decimal string,
 * every other type -> lower-case hex string of the raw bytes. `hex(2)` / `hex(7)` are decoded
 * (UTF-16LE in REGEDIT5, ANSI in REGEDIT4); `hex:` / `hex(b)` keep raw bytes or a QWORD.
 */
import type { RegistryValueType } from "@dude/contracts/system/system-types";

export interface RegFileValue {
  /** '' is the key's (Default) value (`@` in a .reg file). */
  readonly name: string;
  readonly type: RegistryValueType;
  readonly data: string | number | readonly string[];
  /** The numeric type for a `hex(N)` value with no known REG_* name (kept so it round-trips). */
  readonly rawType?: number;
  /** `"name"=-` : the value is deleted when the file is imported. */
  readonly deleted?: boolean;
}

export interface RegFileKey {
  /** Full path as written in the file, e.g. `HKEY_LOCAL_MACHINE\SOFTWARE\Foo`. */
  readonly path: string;
  readonly values: readonly RegFileValue[];
  /** `[-path]` : the key is deleted when the file is imported. */
  readonly deleted?: boolean;
}

export interface RegFile {
  readonly format: 'REGEDIT4' | 'REGEDIT5';
  readonly keys: readonly RegFileKey[];
}

const TYPE_BY_CODE: Record<number, RegistryValueType> = {
  0: 'REG_NONE', 1: 'REG_SZ', 2: 'REG_EXPAND_SZ', 3: 'REG_BINARY', 4: 'REG_DWORD', 5: 'REG_DWORD_BIG_ENDIAN',
  6: 'REG_LINK', 7: 'REG_MULTI_SZ', 8: 'REG_RESOURCE_LIST', 9: 'REG_FULL_RESOURCE_DESCRIPTOR',
  10: 'REG_RESOURCE_REQUIREMENTS_LIST', 11: 'REG_QWORD',
};
const CODE_BY_TYPE = new Map<RegistryValueType, number>(Object.entries(TYPE_BY_CODE).map(([code, type]) => [type, Number(code)]));

const HIVE_LONG: Record<string, string> = {
  HKLM: 'HKEY_LOCAL_MACHINE', HKCU: 'HKEY_CURRENT_USER', HKCR: 'HKEY_CLASSES_ROOT', HKU: 'HKEY_USERS', HKCC: 'HKEY_CURRENT_CONFIG',
};

/** Expands a short hive name (`HKLM\...`) to the long form (`HKEY_LOCAL_MACHINE\...`), so paths from different sources compare. */
export function normalizeRegPath(path: string): string {
  const trimmed = path.trim().replace(/\\+/g, '\\').replace(/\\$/, '');
  const slash = trimmed.indexOf('\\');
  const head = (slash < 0 ? trimmed : trimmed.slice(0, slash)).toUpperCase();
  const rest = slash < 0 ? '' : trimmed.slice(slash);
  return head.startsWith('HK') ? (HIVE_LONG[head] ?? head) + rest : trimmed;
}

// ---- bytes helpers -------------------------------------------------------------------------------

const toHex = (bytes: readonly number[]): string => bytes.map((b) => b.toString(16).padStart(2, '0')).join('');

function decodeString(bytes: readonly number[], wide: boolean): string {
  let out = '';
  if (wide) {
    for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode(bytes[i] | (bytes[i + 1] << 8));
  } else {
    for (const b of bytes) out += String.fromCharCode(b);
  }
  return out;
}

function encodeString(text: string, wide: boolean): number[] {
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (wide) out.push(c & 0xff, c >> 8);
    else out.push(c & 0xff);
  }
  return out;
}

const trimNul = (s: string): string => s.replace(/\0+$/, '');

function decodeMulti(bytes: readonly number[], wide: boolean): string[] {
  const parts = decodeString(bytes, wide).split('\0');
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

function bytesToQword(bytes: readonly number[]): string {
  let v = 0n;
  for (let i = Math.min(bytes.length, 8) - 1; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v.toString();
}

function qwordToBytes(text: string): number[] {
  let v = BigInt.asUintN(64, BigInt(text || '0'));
  const out: number[] = [];
  for (let i = 0; i < 8; i++) { out.push(Number(v & 0xffn)); v >>= 8n; }
  return out;
}

function bytesToDword(bytes: readonly number[]): number {
  return ((bytes[0] ?? 0) | ((bytes[1] ?? 0) << 8) | ((bytes[2] ?? 0) << 16) | ((bytes[3] ?? 0) << 24)) >>> 0;
}

// ---- parse ---------------------------------------------------------------------------------------

function unquote(text: string, start: number): { value: string; end: number } | null {
  if (text[start] !== '"') return null;
  let value = '';
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\' && i + 1 < text.length) { value += text[++i]; continue; }
    if (c === '"') return { value, end: i + 1 };
    value += c;
  }
  return null;
}

function parseHexBytes(text: string): number[] {
  return text.split(',').map((s) => s.trim()).filter(Boolean).map((s) => parseInt(s, 16)).filter((n) => !Number.isNaN(n) && n >= 0 && n <= 255);
}

function parseValueLine(line: string, wide: boolean): RegFileValue | null {
  let name: string;
  let rest: string;
  if (line.startsWith('@')) {
    name = '';
    rest = line.slice(1).trimStart();
  } else {
    const q = unquote(line, 0);
    if (!q) return null;
    name = q.value;
    rest = line.slice(q.end).trimStart();
  }
  if (!rest.startsWith('=')) return null;
  rest = rest.slice(1).trim();

  if (rest === '-') return { name, type: 'REG_NONE', data: '', deleted: true };
  if (rest.startsWith('"')) {
    const q = unquote(rest, 0);
    return q ? { name, type: 'REG_SZ', data: q.value } : null;
  }
  const dword = /^dword:([0-9a-f]{1,8})$/i.exec(rest);
  if (dword) return { name, type: 'REG_DWORD', data: parseInt(dword[1], 16) >>> 0 };

  const hex = /^hex(?:\(([0-9a-f]+)\))?:(.*)$/is.exec(rest);
  if (!hex) return null;
  const code = hex[1] === undefined ? 3 : parseInt(hex[1], 16);
  const bytes = parseHexBytes(hex[2]);
  const type = TYPE_BY_CODE[code];
  switch (type) {
    case 'REG_SZ': case 'REG_EXPAND_SZ': case 'REG_LINK':
      return { name, type, data: trimNul(decodeString(bytes, wide)) };
    case 'REG_MULTI_SZ': return { name, type, data: decodeMulti(bytes, wide) };
    case 'REG_DWORD': return { name, type, data: bytesToDword(bytes) };
    case 'REG_QWORD': return { name, type, data: bytesToQword(bytes) };
    case undefined: return { name, type: 'REG_UNKNOWN', data: toHex(bytes), rawType: code };
    default: return { name, type, data: toHex(bytes) };
  }
}

/** Parses REGEDIT4 / REGEDIT5 text. Unrecognised lines are skipped. */
export function parseRegFile(input: string): RegFile {
  const text = input.replace(/^﻿/, '');
  const rawLines = text.split(/\r\n|\n|\r/);
  const format: RegFile['format'] = /^\s*REGEDIT4\s*$/im.test(rawLines.find((l) => l.trim()) ?? '') ? 'REGEDIT4' : 'REGEDIT5';
  const wide = format === 'REGEDIT5';

  // Join `\` continuation lines of hex values.
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i].trim();
    if (/=\s*hex(\([0-9a-f]+\))?:/i.test(line) || /^hex/i.test(line)) {
      while (line.endsWith('\\') && i + 1 < rawLines.length) line = line.slice(0, -1) + rawLines[++i].trim();
    }
    lines.push(line);
  }

  const keys: { path: string; values: RegFileValue[]; deleted?: boolean }[] = [];
  let current: { path: string; values: RegFileValue[]; deleted?: boolean } | null = null;
  for (const line of lines) {
    if (!line || line.startsWith(';')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      const inner = line.slice(1, -1);
      current = inner.startsWith('-') ? { path: inner.slice(1), values: [], deleted: true } : { path: inner, values: [] };
      keys.push(current);
      continue;
    }
    if (!current || current.deleted) continue;
    const value = parseValueLine(line, wide);
    if (value) current.values.push(value);
  }
  return { format, keys };
}

// ---- serialize -----------------------------------------------------------------------------------

const quote = (s: string): string => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

function wrapHex(prefix: string, bytes: readonly number[]): string {
  if (!bytes.length) return prefix;
  let out = prefix;
  let column = prefix.length;
  for (let i = 0; i < bytes.length; i++) {
    const token = bytes[i].toString(16).padStart(2, '0') + (i < bytes.length - 1 ? ',' : '');
    if (column + token.length > 78) { out += '\\\r\n  '; column = 2; }
    out += token;
    column += token.length;
  }
  return out;
}

function hexBytes(text: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < text.length; i += 2) out.push(parseInt(text.slice(i, i + 2), 16) || 0);
  return out;
}

function serializeValue(v: RegFileValue): string {
  const label = v.name === '' ? '@' : quote(v.name);
  if (v.deleted) return `${label}=-`;
  const data = v.data;
  switch (v.type) {
    case 'REG_SZ': return `${label}=${quote(String(data))}`;
    case 'REG_DWORD': return `${label}=dword:${(Number(data) >>> 0).toString(16).padStart(8, '0')}`;
    case 'REG_EXPAND_SZ': case 'REG_LINK':
      return wrapHex(`${label}=hex(${CODE_BY_TYPE.get(v.type)!.toString(16)}):`, encodeString(String(data) + '\0', true));
    case 'REG_MULTI_SZ': {
      const list = Array.isArray(data) ? (data as readonly string[]) : [String(data)];
      return wrapHex(`${label}=hex(7):`, encodeString(list.map((s) => s + '\0').join('') + '\0', true));
    }
    case 'REG_QWORD': return wrapHex(`${label}=hex(b):`, qwordToBytes(String(data)));
    case 'REG_BINARY': return wrapHex(`${label}=hex:`, hexBytes(String(data)));
    case 'REG_UNKNOWN': return wrapHex(`${label}=hex(${(v.rawType ?? 0).toString(16)}):`, hexBytes(String(data)));
    default: return wrapHex(`${label}=hex(${CODE_BY_TYPE.get(v.type)!.toString(16)}):`, hexBytes(String(data)));
  }
}

/** Serializes to REGEDIT5 text with CRLF line endings (the caller adds a BOM / UTF-16 encoding when writing a file). */
export function serializeRegFile(keys: readonly RegFileKey[]): string {
  const out = ['Windows Registry Editor Version 5.00', ''];
  for (const key of keys) {
    if (key.deleted) { out.push(`[-${key.path}]`, ''); continue; }
    out.push(`[${key.path}]`);
    for (const v of key.values) out.push(serializeValue(v));
    out.push('');
  }
  return out.join('\r\n');
}

/** Human-readable rendering of a value's data, by type. */
export function formatRegData(type: RegistryValueType, data: string | number | readonly string[]): string {
  if (type === 'REG_DWORD' || type === 'REG_DWORD_BIG_ENDIAN') {
    const n = Number(data);
    return `0x${n.toString(16).padStart(8, '0')} (${n})`;
  }
  if (type === 'REG_QWORD') {
    try { return `0x${BigInt(String(data)).toString(16).padStart(16, '0')} (${String(data)})`; } catch { return String(data); }
  }
  if (Array.isArray(data)) return data.length ? (data as readonly string[]).join(' | ') : '(empty list)';
  if (type === 'REG_SZ' || type === 'REG_EXPAND_SZ' || type === 'REG_LINK') return data === '' ? '(empty)' : String(data);
  const hex = String(data);
  if (!hex) return '(zero-length binary)';
  const shown = hex.length > 128 ? hex.slice(0, 128) : hex;
  return (shown.match(/../g) ?? []).join(' ') + (hex.length > 128 ? ` … (${hex.length / 2} bytes)` : '');
}
