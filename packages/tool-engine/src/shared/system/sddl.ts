/**
 * Pure SDDL (Security Descriptor Definition Language) parser/formatter, access-mask decoder and a few
 * ACL editing helpers. Dependency-free apart from the SID codec, so it also runs on the web build and in
 * Workers.
 *
 * The parsed model keeps the exact tokens it read (`rightsText`, `sid` alias, flag order) so that
 * `formatSddl(parseSddl(x)) === x` for anything Windows itself emits, and edits produce a minimal
 * before -> after SDDL diff. The write helpers (`addAce`, `removeAce`, `setProtected`, `setOwner`) are
 * immutable: they return a new model and never touch the input.
 */
import { describeSid, parseSidString } from "./sid.js";

// ---- model ---------------------------------------------------------------------------------------

export interface SddlAce {
  /** SDDL ACE type code, e.g. `A`, `D`, `AU`, `OA`, `XA`, `ML`. */
  readonly type: string;
  /** SDDL ACE flag codes in source order: `OI` `CI` `NP` `IO` `ID` `SA` `FA` `CR` `TP`. */
  readonly flags: readonly string[];
  /** The rights field exactly as written (`FA`, `0x1200a9`, `GXGR`, ...). Regenerated when it no longer matches `mask`. */
  readonly rightsText: string;
  readonly mask: number;
  readonly objectGuid: string;
  readonly inheritGuid: string;
  /** The SID token exactly as written: `S-1-5-18` or an SDDL alias such as `SY`. */
  readonly sid: string;
  /** Seventh field (conditional expression / resource attribute), verbatim, without the trailing `)` but with its own parentheses. */
  readonly extra?: string;
}

export interface SddlAcl {
  /** ACL control tokens in source order: `P`, `AI`, `AR`, `NO_ACCESS_CONTROL`. */
  readonly flags: readonly string[];
  readonly aces: readonly SddlAce[];
}

export interface Sddl {
  readonly owner?: string;
  readonly group?: string;
  /** Absent = the descriptor has no `D:` section (NULL DACL when the caller asked for it). */
  readonly dacl?: SddlAcl;
  readonly sacl?: SddlAcl;
}

export type AclSection = 'dacl' | 'sacl';

export class SddlParseError extends Error {
  constructor(message: string, readonly position: number) {
    super(`${message} (at position ${position})`);
    this.name = 'SddlParseError';
  }
}

// ---- SID aliases ---------------------------------------------------------------------------------

interface AliasEntry { readonly alias: string; readonly sid: string | null; readonly rid?: number; readonly name: string }

/** `sid: null` entries are domain-relative (`S-1-5-21-<domain>-<rid>`) and cannot be expanded without a domain. */
export const SID_ALIASES: readonly AliasEntry[] = [
  { alias: 'AA', sid: 'S-1-5-32-579', name: 'BUILTIN\\Access Control Assistance Operators' },
  { alias: 'AC', sid: 'S-1-15-2-1', name: 'ALL APPLICATION PACKAGES' },
  { alias: 'AN', sid: 'S-1-5-7', name: 'ANONYMOUS LOGON' },
  { alias: 'AO', sid: 'S-1-5-32-548', name: 'BUILTIN\\Account Operators' },
  { alias: 'AP', sid: null, rid: 525, name: 'Protected Users' },
  { alias: 'AU', sid: 'S-1-5-11', name: 'Authenticated Users' },
  { alias: 'BA', sid: 'S-1-5-32-544', name: 'BUILTIN\\Administrators' },
  { alias: 'BG', sid: 'S-1-5-32-546', name: 'BUILTIN\\Guests' },
  { alias: 'BO', sid: 'S-1-5-32-551', name: 'BUILTIN\\Backup Operators' },
  { alias: 'BU', sid: 'S-1-5-32-545', name: 'BUILTIN\\Users' },
  { alias: 'CA', sid: null, rid: 517, name: 'Cert Publishers' },
  { alias: 'CD', sid: 'S-1-5-32-574', name: 'BUILTIN\\Certificate Service DCOM Access' },
  { alias: 'CG', sid: 'S-1-3-1', name: 'CREATOR GROUP' },
  { alias: 'CN', sid: null, rid: 522, name: 'Cloneable Domain Controllers' },
  { alias: 'CO', sid: 'S-1-3-0', name: 'CREATOR OWNER' },
  { alias: 'CY', sid: 'S-1-5-32-569', name: 'BUILTIN\\Cryptographic Operators' },
  { alias: 'DA', sid: null, rid: 512, name: 'Domain Admins' },
  { alias: 'DC', sid: null, rid: 515, name: 'Domain Computers' },
  { alias: 'DD', sid: null, rid: 516, name: 'Domain Controllers' },
  { alias: 'DG', sid: null, rid: 514, name: 'Domain Guests' },
  { alias: 'DU', sid: null, rid: 513, name: 'Domain Users' },
  { alias: 'EA', sid: null, rid: 519, name: 'Enterprise Admins' },
  { alias: 'ED', sid: 'S-1-5-9', name: 'ENTERPRISE DOMAIN CONTROLLERS' },
  { alias: 'EK', sid: null, rid: 527, name: 'Enterprise Key Admins' },
  { alias: 'ER', sid: 'S-1-5-32-573', name: 'BUILTIN\\Event Log Readers' },
  { alias: 'ES', sid: 'S-1-5-32-576', name: 'BUILTIN\\RDS Endpoint Servers' },
  { alias: 'HA', sid: 'S-1-5-32-578', name: 'BUILTIN\\Hyper-V Administrators' },
  { alias: 'HI', sid: 'S-1-16-12288', name: 'High Mandatory Level' },
  { alias: 'IS', sid: 'S-1-5-17', name: 'IIS_IUSRS' },
  { alias: 'IU', sid: 'S-1-5-4', name: 'INTERACTIVE' },
  { alias: 'KA', sid: null, rid: 526, name: 'Key Admins' },
  { alias: 'LA', sid: null, rid: 500, name: 'Administrator' },
  { alias: 'LG', sid: null, rid: 501, name: 'Guest' },
  { alias: 'LS', sid: 'S-1-5-19', name: 'LOCAL SERVICE' },
  { alias: 'LU', sid: 'S-1-5-32-559', name: 'BUILTIN\\Performance Log Users' },
  { alias: 'LW', sid: 'S-1-16-4096', name: 'Low Mandatory Level' },
  { alias: 'ME', sid: 'S-1-16-8192', name: 'Medium Mandatory Level' },
  { alias: 'MP', sid: 'S-1-16-8448', name: 'Medium Plus Mandatory Level' },
  { alias: 'MU', sid: 'S-1-5-32-558', name: 'BUILTIN\\Performance Monitor Users' },
  { alias: 'NO', sid: 'S-1-5-32-556', name: 'BUILTIN\\Network Configuration Operators' },
  { alias: 'NS', sid: 'S-1-5-20', name: 'NETWORK SERVICE' },
  { alias: 'NU', sid: 'S-1-5-2', name: 'NETWORK' },
  { alias: 'OW', sid: 'S-1-3-4', name: 'OWNER RIGHTS' },
  { alias: 'PA', sid: null, rid: 520, name: 'Group Policy Creator Owners' },
  { alias: 'PO', sid: 'S-1-5-32-550', name: 'BUILTIN\\Print Operators' },
  { alias: 'PS', sid: 'S-1-5-10', name: 'SELF' },
  { alias: 'PU', sid: 'S-1-5-32-547', name: 'BUILTIN\\Power Users' },
  { alias: 'RA', sid: 'S-1-5-32-575', name: 'BUILTIN\\RDS Remote Access Servers' },
  { alias: 'RC', sid: 'S-1-5-12', name: 'RESTRICTED' },
  { alias: 'RD', sid: 'S-1-5-32-555', name: 'BUILTIN\\Remote Desktop Users' },
  { alias: 'RE', sid: 'S-1-5-32-552', name: 'BUILTIN\\Replicator' },
  { alias: 'RM', sid: 'S-1-5-32-580', name: 'BUILTIN\\Remote Management Users' },
  { alias: 'RO', sid: null, rid: 498, name: 'Enterprise Read-only Domain Controllers' },
  { alias: 'RS', sid: null, rid: 553, name: 'RAS and IAS Servers' },
  { alias: 'RU', sid: 'S-1-5-32-554', name: 'BUILTIN\\Pre-Windows 2000 Compatible Access' },
  { alias: 'SA', sid: null, rid: 518, name: 'Schema Admins' },
  { alias: 'SI', sid: 'S-1-16-16384', name: 'System Mandatory Level' },
  { alias: 'SO', sid: 'S-1-5-32-549', name: 'BUILTIN\\Server Operators' },
  { alias: 'SS', sid: 'S-1-18-2', name: 'Service Asserted Identity' },
  { alias: 'SU', sid: 'S-1-5-6', name: 'SERVICE' },
  { alias: 'SY', sid: 'S-1-5-18', name: 'SYSTEM' },
  { alias: 'UD', sid: 'S-1-5-84-0-0-0-0-0', name: 'USER MODE DRIVERS' },
  { alias: 'WD', sid: 'S-1-1-0', name: 'Everyone' },
  { alias: 'WR', sid: 'S-1-5-33', name: 'WRITE RESTRICTED' },
];

const ALIAS_BY_CODE = new Map(SID_ALIASES.map((a) => [a.alias, a]));
const ALIAS_BY_SID = new Map(SID_ALIASES.filter((a) => a.sid).map((a) => [a.sid as string, a]));
const SID_TOKEN = /^S-1-\d+(?:-\d+)*/i;

/** True for `S-1-...` strings and known two-letter aliases. */
export function isSidToken(token: string): boolean {
  if (ALIAS_BY_CODE.has(token)) return true;
  try { parseSidString(token); return true; } catch { return false; }
}

/** Expand an SDDL SID token to `S-1-...`; null for domain-relative aliases (`DA`, `DU`, ...) or garbage. */
export function resolveSidToken(token: string): string | null {
  const alias = ALIAS_BY_CODE.get(token);
  if (alias) return alias.sid;
  return SID_TOKEN.test(token) ? token.toUpperCase() : null;
}

/** The compact SDDL spelling Windows would emit for a SID (`S-1-5-32-544` -> `BA`), else the SID itself. */
export function canonicalSidToken(sid: string): string {
  return ALIAS_BY_SID.get(sid.toUpperCase())?.alias ?? sid.toUpperCase();
}

/** Human name for an SDDL SID token when it is well-known; null otherwise (use the resolver for the rest). */
export function sidTokenName(token: string): string | null {
  const alias = ALIAS_BY_CODE.get(token);
  if (alias) return alias.name;
  const sid = resolveSidToken(token);
  if (!sid) return null;
  const name = describeSid(sid)?.name ?? null;
  return name === 'Domain or machine account' ? null : name;
}

// ---- rights tokens -------------------------------------------------------------------------------

export const FILE_ALL_ACCESS = 0x1f01ff;
export const FILE_MODIFY = 0x1301bf;
export const FILE_READ_EXECUTE = 0x1200a9;
export const FILE_READ = 0x120089;
export const FILE_WRITE = 0x100116;
export const FILE_GENERIC_READ = 0x120089;
export const FILE_GENERIC_WRITE = 0x120116;
export const FILE_GENERIC_EXECUTE = 0x1200a0;
export const KEY_ALL_ACCESS = 0xf003f;
export const KEY_READ = 0x20019;
export const KEY_WRITE = 0x20006;
export const KEY_EXECUTE = 0x20019;

/** SDDL two-letter rights tokens -> mask (winnt.h / sddl.h). */
export const SDDL_RIGHTS_TOKENS: Readonly<Record<string, number>> = {
  GA: 0x10000000, GR: 0x80000000, GW: 0x40000000, GX: 0x20000000,
  RC: 0x20000, SD: 0x10000, WD: 0x40000, WO: 0x80000,
  RP: 0x10, WP: 0x20, CC: 0x1, DC: 0x2, LC: 0x4, SW: 0x8, LO: 0x80, DT: 0x40, CR: 0x100,
  FA: FILE_ALL_ACCESS, FR: FILE_READ, FW: FILE_GENERIC_WRITE, FX: FILE_GENERIC_EXECUTE,
  KA: KEY_ALL_ACCESS, KR: KEY_READ, KW: KEY_WRITE, KX: KEY_EXECUTE,
  NW: 0x1, NR: 0x2, NX: 0x4,
};

const FORMAT_TOKENS: readonly (readonly [string, number])[] = [
  ['FA', FILE_ALL_ACCESS], ['KA', KEY_ALL_ACCESS], ['FR', FILE_READ], ['FW', FILE_GENERIC_WRITE], ['FX', FILE_GENERIC_EXECUTE],
  ['KR', KEY_READ], ['KW', KEY_WRITE], ['GA', 0x10000000], ['GR', 0x80000000], ['GW', 0x40000000], ['GX', 0x20000000],
];

/** Parse an SDDL rights field: a decimal/hex number, or concatenated two-letter tokens. */
export function parseRightsText(text: string, position = 0): number {
  if (text === '') return 0;
  if (/^0x[0-9a-f]+$/i.test(text) || /^\d+$/.test(text)) {
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value > 0xffffffff) throw new SddlParseError(`Access mask "${text}" exceeds 32 bits`, position);
    return value >>> 0;
  }
  if (text.length % 2 !== 0) throw new SddlParseError(`Malformed rights "${text}"`, position);
  let mask = 0;
  for (let i = 0; i < text.length; i += 2) {
    const token = text.slice(i, i + 2);
    const bit = SDDL_RIGHTS_TOKENS[token];
    if (bit === undefined) throw new SddlParseError(`Unknown rights token "${token}"`, position + i);
    mask |= bit;
  }
  return mask >>> 0;
}

/** Windows-style rights text: a single well-known token when the mask is exactly one, else `0x...` hex. */
export function formatRightsText(mask: number): string {
  const m = mask >>> 0;
  for (const [token, value] of FORMAT_TOKENS) if (m === value) return token;
  return `0x${m.toString(16)}`;
}

// ---- ACE types and flags -------------------------------------------------------------------------

export type AceCategory = 'allow' | 'deny' | 'audit' | 'other';

const ACE_TYPES: Readonly<Record<string, { name: string; category: AceCategory; object: boolean }>> = {
  A: { name: 'Allow', category: 'allow', object: false },
  D: { name: 'Deny', category: 'deny', object: false },
  AU: { name: 'Audit', category: 'audit', object: false },
  AL: { name: 'Alarm', category: 'other', object: false },
  OA: { name: 'Allow (object)', category: 'allow', object: true },
  OD: { name: 'Deny (object)', category: 'deny', object: true },
  OU: { name: 'Audit (object)', category: 'audit', object: true },
  OL: { name: 'Alarm (object)', category: 'other', object: true },
  XA: { name: 'Allow (conditional)', category: 'allow', object: false },
  XD: { name: 'Deny (conditional)', category: 'deny', object: false },
  XU: { name: 'Audit (conditional)', category: 'audit', object: false },
  ZA: { name: 'Allow (conditional, object)', category: 'allow', object: true },
  ML: { name: 'Mandatory label', category: 'other', object: false },
  RA: { name: 'Resource attribute', category: 'other', object: false },
  SP: { name: 'Scoped policy ID', category: 'other', object: false },
  TL: { name: 'Process trust label', category: 'other', object: false },
  FL: { name: 'Access filter', category: 'other', object: false },
};

export const aceTypeName = (type: string): string => ACE_TYPES[type]?.name ?? type;
export const aceCategory = (type: string): AceCategory => ACE_TYPES[type]?.category ?? 'other';

/** ACE_HEADER.AceType byte -> SDDL code (unknown bytes come back as `0x..`). */
export function aceTypeFromByte(byte: number): string {
  const map: Readonly<Record<number, string>> = { 0: 'A', 1: 'D', 2: 'AU', 3: 'AL', 5: 'OA', 6: 'OD', 7: 'OU', 8: 'OL', 9: 'XA', 10: 'XD', 11: 'ZA', 13: 'XU', 17: 'ML', 18: 'RA', 19: 'SP', 20: 'TL', 21: 'FL' };
  return map[byte] ?? `0x${byte.toString(16)}`;
}

const ACE_FLAG_BITS: readonly (readonly [string, number])[] = [['OI', 0x1], ['CI', 0x2], ['NP', 0x4], ['IO', 0x8], ['ID', 0x10], ['CR', 0x20], ['SA', 0x40], ['FA', 0x80]];
const ACE_FLAG_CODES = new Set(['OI', 'CI', 'NP', 'IO', 'ID', 'SA', 'FA', 'CR', 'TP']);

/** ACE_HEADER.AceFlags byte -> SDDL flag codes. */
export function aceFlagsFromByte(byte: number): string[] {
  return ACE_FLAG_BITS.filter(([, bit]) => (byte & bit) !== 0).map(([code]) => code);
}

export function aceFlagsToByte(flags: readonly string[]): number {
  let out = 0;
  for (const [code, bit] of ACE_FLAG_BITS) if (flags.includes(code)) out |= bit;
  return out;
}

export const isInherited = (ace: Pick<SddlAce, 'flags'>): boolean => ace.flags.includes('ID');

/** icacls-style notation: `(I)(OI)(CI)(IO)(NP)` in icacls's order. */
export function formatIcaclsInheritance(flags: readonly string[]): string {
  return ['ID', 'OI', 'CI', 'IO', 'NP'].filter((f) => flags.includes(f)).map((f) => `(${f === 'ID' ? 'I' : f})`).join('');
}

export type ObjectKind = 'file' | 'directory' | 'registry';

/** Plain-English "applies to" scope of an ACE, like the Explorer/regedit "Applies to" column. */
export function describeInheritanceScope(flags: readonly string[], kind: ObjectKind): string {
  const oi = flags.includes('OI');
  const ci = flags.includes('CI');
  const io = flags.includes('IO');
  const np = flags.includes('NP');
  let text: string;
  if (kind === 'registry') {
    if (ci && io) text = 'Subkeys only';
    else if (ci) text = 'This key and subkeys';
    else text = 'This key only';
  } else if (kind === 'file') {
    text = 'This file only';
  } else if (!oi && !ci) {
    text = 'This folder only';
  } else if (oi && ci) text = io ? 'Subfolders and files only' : 'This folder, subfolders and files';
  else if (ci) text = io ? 'Subfolders only' : 'This folder and subfolders';
  else text = io ? 'Files only' : 'This folder and files';
  if (np && (oi || ci)) text += ' (one level only)';
  return text;
}

// ---- rights decoding -----------------------------------------------------------------------------

export interface RightsDescription {
  /** Explorer-like: `Full control`, `Modify`, `Read & execute`, `Read`, `Write`, `Special`, or combinations. */
  readonly summary: string;
  /** icacls simple rights plus specific leftovers, e.g. `RX`, `M`, `R,W`, `S,X`; for registry keys the SDDL token (`KA`/`KR`/`KW`). */
  readonly short: string;
  /** Every individual right set in the mask, in human words. */
  readonly names: readonly string[];
  /** Generic rights present (`GENERIC_READ`, ...); these are normally resolved before storage. */
  readonly generic: readonly string[];
  readonly hex: string;
}

interface BitName { readonly bit: number; readonly icacls: string; readonly file: string; readonly directory: string; readonly registry: string }

const SPECIFIC_BITS: readonly BitName[] = [
  { bit: 0x1, icacls: 'RD', file: 'Read data', directory: 'List folder', registry: 'Query value' },
  { bit: 0x2, icacls: 'WD', file: 'Write data', directory: 'Create files', registry: 'Set value' },
  { bit: 0x4, icacls: 'AD', file: 'Append data', directory: 'Create folders', registry: 'Create subkey' },
  { bit: 0x8, icacls: 'REA', file: 'Read extended attributes', directory: 'Read extended attributes', registry: 'Enumerate subkeys' },
  { bit: 0x10, icacls: 'WEA', file: 'Write extended attributes', directory: 'Write extended attributes', registry: 'Notify' },
  { bit: 0x20, icacls: 'X', file: 'Execute', directory: 'Traverse folder', registry: 'Create link' },
  { bit: 0x40, icacls: 'DC', file: 'Delete child', directory: 'Delete subfolders and files', registry: 'Reserved (0x40)' },
  { bit: 0x80, icacls: 'RA', file: 'Read attributes', directory: 'Read attributes', registry: 'Reserved (0x80)' },
  { bit: 0x100, icacls: 'WA', file: 'Write attributes', directory: 'Write attributes', registry: '64-bit view (WOW64_64KEY)' },
  { bit: 0x200, icacls: '', file: 'Reserved (0x200)', directory: 'Reserved (0x200)', registry: '32-bit view (WOW64_32KEY)' },
];

const STANDARD_BITS: readonly (readonly [number, string, string])[] = [
  [0x10000, 'DE', 'Delete'], [0x20000, 'RC', 'Read permissions'], [0x40000, 'WDAC', 'Change permissions'],
  [0x80000, 'WO', 'Take ownership'], [0x100000, 'S', 'Synchronize'], [0x1000000, 'AS', 'Access system security'], [0x2000000, 'MA', 'Maximum allowed'],
];
const GENERIC_BITS: readonly (readonly [number, string, string])[] = [
  [0x80000000, 'GR', 'GENERIC_READ'], [0x40000000, 'GW', 'GENERIC_WRITE'], [0x20000000, 'GE', 'GENERIC_EXECUTE'], [0x10000000, 'GA', 'GENERIC_ALL'],
];

const has = (mask: number, bits: number): boolean => (mask & bits) === bits;

/** Resolve generic rights into object-specific ones (GENERIC_MAPPING for files or registry keys). */
export function mapGenericRights(mask: number, kind: ObjectKind): number {
  const m = mask >>> 0;
  const map = kind === 'registry'
    ? { r: KEY_READ, w: KEY_WRITE, x: KEY_EXECUTE, a: KEY_ALL_ACCESS }
    : { r: FILE_GENERIC_READ, w: FILE_GENERIC_WRITE, x: FILE_GENERIC_EXECUTE, a: FILE_ALL_ACCESS };
  let out = m & 0x0fffffff;
  if (m & 0x80000000) out |= map.r;
  if (m & 0x40000000) out |= map.w;
  if (m & 0x20000000) out |= map.x;
  if (m & 0x10000000) out |= map.a;
  return out >>> 0;
}

/**
 * icacls-style rights for a file mask: simple groups (F, M, RX, R, W) on the object-specific bits, then the
 * remaining rights in icacls's order (standard, generic, specific). Generic bits are left unresolved, as icacls does.
 */
export function icaclsRights(mask: number): string {
  const m = mask >>> 0;
  // icacls prints GENERIC_ALL as F; the other generic bits stay symbolic.
  const specific = (m & 0x03ffffff) | (m & 0x10000000 ? FILE_ALL_ACCESS : 0);
  const parts: string[] = [];
  let consumed = 0;
  if (has(specific, FILE_ALL_ACCESS)) { parts.push('F'); consumed = FILE_ALL_ACCESS; }
  else if (has(specific, FILE_MODIFY)) { parts.push('M'); consumed = FILE_MODIFY; }
  else {
    if (has(specific, FILE_READ_EXECUTE)) { parts.push('RX'); consumed |= FILE_READ_EXECUTE; }
    else if (has(specific, FILE_READ)) { parts.push('R'); consumed |= FILE_READ; }
    if (has(specific, FILE_WRITE)) { parts.push('W'); consumed |= FILE_WRITE; }
  }
  const rest = specific & ~consumed;
  for (const [bit, code] of STANDARD_BITS) if (rest & bit) parts.push(code);
  for (const [bit, code] of GENERIC_BITS) if (m & bit && bit !== 0x10000000) parts.push(code);
  for (const b of SPECIFIC_BITS) if (rest & b.bit && b.icacls) parts.push(b.icacls);
  return parts.join(',');
}

/** Decode an access mask for a file, folder or registry key into summary, icacls-style short form and per-bit names. */
export function describeRights(mask: number, kind: ObjectKind): RightsDescription {
  const m = mask >>> 0;
  const specificKind = kind === 'registry' ? 'registry' : kind;
  const generic = GENERIC_BITS.filter(([bit]) => (m & bit) !== 0).map(([, , name]) => name);
  const names: string[] = [];
  for (const b of SPECIFIC_BITS) if (m & b.bit) names.push(b[specificKind]);
  for (const [bit, , name] of STANDARD_BITS) if (m & bit) names.push(name);
  const hex = `0x${m.toString(16).padStart(8, '0')}`;

  const resolved = mapGenericRights(m, kind);
  const summaryParts: string[] = [];
  const shortParts: string[] = [];
  let consumed = 0;
  if (kind === 'registry') {
    if (has(resolved, KEY_ALL_ACCESS)) { summaryParts.push('Full control'); shortParts.push('KA'); consumed = KEY_ALL_ACCESS; }
    else {
      if (has(resolved, KEY_READ)) { summaryParts.push('Read'); shortParts.push('KR'); consumed |= KEY_READ; }
      if (has(resolved, KEY_WRITE)) { summaryParts.push('Write'); shortParts.push('KW'); consumed |= KEY_WRITE; }
    }
  } else if (has(resolved, FILE_ALL_ACCESS)) {
    summaryParts.push('Full control'); shortParts.push('F'); consumed = FILE_ALL_ACCESS;
  } else if (has(resolved, FILE_MODIFY)) {
    summaryParts.push('Modify'); shortParts.push('M'); consumed = FILE_MODIFY;
  } else {
    if (has(resolved, FILE_READ_EXECUTE)) { summaryParts.push('Read & execute'); shortParts.push('RX'); consumed |= FILE_READ_EXECUTE; }
    else if (has(resolved, FILE_READ)) { summaryParts.push('Read'); shortParts.push('R'); consumed |= FILE_READ; }
    if (has(resolved, FILE_WRITE)) { summaryParts.push('Write'); shortParts.push('W'); consumed |= FILE_WRITE; }
  }
  // Rights the named groups don't cover (SYNCHRONIZE alone doesn't count as "special").
  const leftover = resolved & ~consumed & ~0x100000 & 0x03ffffff;
  // Explorer folds READ_CONTROL into Read/Write, so it is not "special" next to them (icacls still lists it).
  const summaryLeftover = summaryParts.length && (resolved & 0x20000) ? leftover & ~0x20000 : leftover;
  if (summaryLeftover) summaryParts.push(summaryParts.length ? 'Special' : 'Special permissions');
  if (!leftover && !summaryParts.length && resolved & 0x100000) summaryParts.push('Synchronize only');
  if (!summaryParts.length) summaryParts.push(resolved === 0 ? 'No access' : 'Special permissions');
  const short = kind === 'registry' ? shortParts.join(',') : icaclsRights(m);
  return { summary: summaryParts.join(' + '), short, names, generic, hex };
}

// ---- parsing -------------------------------------------------------------------------------------

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class Reader {
  pos = 0;
  constructor(readonly text: string) {}
  get done(): boolean { return this.pos >= this.text.length; }
  skipWs(): void { while (!this.done && /\s/.test(this.text[this.pos])) this.pos++; }
  peek(len = 1): string { return this.text.slice(this.pos, this.pos + len); }
  fail(message: string, at = this.pos): never { throw new SddlParseError(message, at); }
}

function readSidToken(r: Reader, what: string): string {
  const rest = r.text.slice(r.pos);
  const numeric = SID_TOKEN.exec(rest);
  if (numeric) {
    r.pos += numeric[0].length;
    try { parseSidString(numeric[0]); } catch (e) { r.fail(`${what}: ${(e as Error).message}`, r.pos - numeric[0].length); }
    return numeric[0].toUpperCase();
  }
  const alias = rest.slice(0, 2);
  if (ALIAS_BY_CODE.has(alias)) { r.pos += 2; return alias; }
  return r.fail(`${what}: expected an S-1-... SID or a known SDDL alias`);
}

/** Split `a;b;(c;d);e` at top-level semicolons, respecting parentheses and double quotes. */
function splitFields(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === '"') quoted = !quoted;
    else if (quoted) continue;
    else if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ';' && depth === 0) { out.push(body.slice(start, i)); start = i + 1; }
  }
  out.push(body.slice(start));
  return out;
}

function parseAceBody(body: string, at: number): SddlAce {
  const fields = splitFields(body);
  if (fields.length < 6 || fields.length > 7) throw new SddlParseError(`An ACE needs 6 or 7 ';'-separated fields, found ${fields.length}`, at);
  const [type, flagText, rightsText, objectGuid, inheritGuid, sid] = fields.map((f) => f.trim());
  if (!ACE_TYPES[type]) throw new SddlParseError(`Unknown ACE type "${type}"`, at);
  if (flagText.length % 2 !== 0) throw new SddlParseError(`Malformed ACE flags "${flagText}"`, at);
  const flags: string[] = [];
  for (let i = 0; i < flagText.length; i += 2) {
    const code = flagText.slice(i, i + 2);
    if (!ACE_FLAG_CODES.has(code)) throw new SddlParseError(`Unknown ACE flag "${code}"`, at);
    if (flags.includes(code)) throw new SddlParseError(`Duplicate ACE flag "${code}"`, at);
    flags.push(code);
  }
  for (const g of [objectGuid, inheritGuid]) if (g !== '' && !GUID.test(g)) throw new SddlParseError(`Malformed GUID "${g}"`, at);
  if (!isSidToken(sid)) throw new SddlParseError(`Unknown SID or alias "${sid}"`, at);
  const mask = parseRightsText(rightsText, at);
  const ace: SddlAce = { type, flags, rightsText, mask, objectGuid, inheritGuid, sid: SID_TOKEN.test(sid) ? sid.toUpperCase() : sid };
  return fields.length === 7 ? { ...ace, extra: fields[6].trim() } : ace;
}

function parseAcl(r: Reader): SddlAcl {
  const flags: string[] = [];
  for (;;) {
    r.skipWs();
    const rest = r.text.slice(r.pos);
    const m = /^(NO_ACCESS_CONTROL|AI|AR|P)/.exec(rest);
    if (!m) break;
    flags.push(m[1]);
    r.pos += m[1].length;
  }
  const aces: SddlAce[] = [];
  for (;;) {
    r.skipWs();
    if (r.peek() !== '(') break;
    const open = r.pos;
    let depth = 0;
    let quoted = false;
    let i = r.pos;
    for (; i < r.text.length; i++) {
      const c = r.text[i];
      if (c === '"') quoted = !quoted;
      else if (quoted) continue;
      else if (c === '(') depth++;
      else if (c === ')' && --depth === 0) break;
    }
    if (i >= r.text.length) r.fail('Unterminated ACE (missing ")")', open);
    aces.push(parseAceBody(r.text.slice(open + 1, i), open));
    r.pos = i + 1;
  }
  return { flags, aces };
}

/** Parse an SDDL string (`O:`/`G:`/`D:`/`S:` sections in any order, each at most once). Throws {@link SddlParseError}. */
export function parseSddl(text: string): Sddl {
  const r = new Reader(text);
  const out: { -readonly [K in keyof Sddl]: Sddl[K] } = {};
  const seen = new Set<string>();
  r.skipWs();
  if (r.done) r.fail('Empty SDDL string');
  while (!r.done) {
    r.skipWs();
    if (r.done) break;
    const tag = r.peek(2);
    if (!/^[OGDS]:$/.test(tag)) r.fail(`Expected "O:", "G:", "D:" or "S:" but found "${r.peek(3)}"`);
    if (seen.has(tag[0])) r.fail(`Duplicate "${tag}" section`);
    seen.add(tag[0]);
    r.pos += 2;
    r.skipWs();
    if (tag[0] === 'O') out.owner = readSidToken(r, 'Owner');
    else if (tag[0] === 'G') out.group = readSidToken(r, 'Group');
    else if (tag[0] === 'D') out.dacl = parseAcl(r);
    else out.sacl = parseAcl(r);
  }
  return out;
}

// ---- formatting ----------------------------------------------------------------------------------

export function formatAce(ace: SddlAce): string {
  const rights = ace.rightsText !== '' && safeRights(ace.rightsText) === (ace.mask >>> 0) ? ace.rightsText : formatRightsText(ace.mask);
  const fields = [ace.type, ace.flags.join(''), rights, ace.objectGuid, ace.inheritGuid, ace.sid];
  if (ace.extra !== undefined) fields.push(ace.extra);
  return `(${fields.join(';')})`;
}

function safeRights(text: string): number | null {
  try { return parseRightsText(text); } catch { return null; }
}

const formatAcl = (acl: SddlAcl): string => acl.flags.join('') + acl.aces.map(formatAce).join('');

export function formatSddl(sd: Sddl): string {
  let out = '';
  if (sd.owner !== undefined) out += `O:${sd.owner}`;
  if (sd.group !== undefined) out += `G:${sd.group}`;
  if (sd.dacl) out += `D:${formatAcl(sd.dacl)}`;
  if (sd.sacl) out += `S:${formatAcl(sd.sacl)}`;
  return out;
}

// ---- building ACEs -------------------------------------------------------------------------------

export interface AceInit {
  readonly type?: string;
  readonly flags?: readonly string[];
  readonly mask: number;
  /** `S-1-...` or an alias; `S-1-5-32-544`-style SIDs are compacted to the alias Windows would emit. */
  readonly sid: string;
  readonly objectGuid?: string;
  readonly inheritGuid?: string;
  readonly extra?: string;
}

export function makeAce(init: AceInit): SddlAce {
  const sid = isSidToken(init.sid) ? (SID_TOKEN.test(init.sid) ? canonicalSidToken(init.sid) : init.sid) : (() => { throw new SddlParseError(`Unknown SID or alias "${init.sid}"`, 0); })();
  const type = init.type ?? 'A';
  if (!ACE_TYPES[type]) throw new SddlParseError(`Unknown ACE type "${type}"`, 0);
  for (const f of init.flags ?? []) if (!ACE_FLAG_CODES.has(f)) throw new SddlParseError(`Unknown ACE flag "${f}"`, 0);
  const mask = init.mask >>> 0;
  const ace: SddlAce = { type, flags: [...(init.flags ?? [])], rightsText: formatRightsText(mask), mask, objectGuid: init.objectGuid ?? '', inheritGuid: init.inheritGuid ?? '', sid };
  return init.extra !== undefined ? { ...ace, extra: init.extra } : ace;
}

// ---- editing helpers (immutable) -----------------------------------------------------------------

const DENY = new Set(['D', 'OD', 'XD']);
const ALLOW = new Set(['A', 'OA', 'XA', 'ZA']);

function rank(section: AclSection, ace: SddlAce): number {
  if (section === 'sacl') return isInherited(ace) ? 1 : 0;
  if (isInherited(ace)) return 3;
  if (DENY.has(ace.type)) return 0;
  if (ALLOW.has(ace.type)) return 1;
  return 2;
}

/** Canonical ACE order: explicit deny, explicit allow, other explicit, then inherited (stable within a group). SACLs: explicit, then inherited. */
export function canonicalOrder(aces: readonly SddlAce[], section: AclSection = 'dacl'): SddlAce[] {
  return aces.map((ace, i) => ({ ace, i })).sort((a, b) => rank(section, a.ace) - rank(section, b.ace) || a.i - b.i).map((x) => x.ace);
}

/** True when the ACE list is already in canonical order. */
export function isCanonicalOrder(aces: readonly SddlAce[], section: AclSection = 'dacl'): boolean {
  for (let i = 1; i < aces.length; i++) if (rank(section, aces[i - 1]) > rank(section, aces[i])) return false;
  return true;
}

function withAcl(sd: Sddl, section: AclSection, acl: SddlAcl): Sddl { return { ...sd, [section]: acl }; }

/**
 * Add an ACE and re-sort into canonical order. An absent (NULL) DACL is replaced by a list holding only the
 * new ACE, so callers editing a NULL DACL should warn that it stops granting everyone full access.
 */
export function addAce(sd: Sddl, ace: SddlAce, section: AclSection = 'dacl'): Sddl {
  const acl = sd[section] ?? { flags: [], aces: [] };
  return withAcl(sd, section, { flags: acl.flags, aces: canonicalOrder([...acl.aces, ace], section) });
}

/** Remove the ACE at `index` (an index into the parsed list). Throws when out of range. */
export function removeAce(sd: Sddl, index: number, section: AclSection = 'dacl'): Sddl {
  const acl = sd[section];
  if (!acl || !Number.isInteger(index) || index < 0 || index >= acl.aces.length) throw new RangeError(`No ${section.toUpperCase()} entry at index ${index}`);
  return withAcl(sd, section, { flags: acl.flags, aces: acl.aces.filter((_, i) => i !== index) });
}

export function setOwner(sd: Sddl, sid: string): Sddl {
  if (!isSidToken(sid)) throw new SddlParseError(`Unknown SID or alias "${sid}"`, 0);
  return { ...sd, owner: SID_TOKEN.test(sid) ? canonicalSidToken(sid) : sid };
}

/**
 * Turn DACL inheritance protection on or off.
 * - `protect = true, mode = 'convert'`: set `P` and clear `ID` on the inherited ACEs so they become explicit. Pass
 *   `inheritedAces` when the descriptor you hold does not already list them; they replace the current `ID` ACEs.
 * - `protect = true, mode = 'remove'`: set `P` and drop every inherited ACE.
 * - `protect = false`: clear `P` (the inherited ACEs are re-applied by Windows when the change is committed).
 */
export function setProtected(sd: Sddl, protect: boolean, mode: 'convert' | 'remove' = 'convert', inheritedAces?: readonly SddlAce[]): Sddl {
  const acl = sd.dacl ?? { flags: [], aces: [] };
  if (!protect) return withAcl(sd, 'dacl', { flags: acl.flags.filter((f) => f !== 'P'), aces: acl.aces });
  const explicit = acl.aces.filter((a) => !isInherited(a));
  const inherited = inheritedAces ?? acl.aces.filter(isInherited);
  const flags = acl.flags.includes('P') ? acl.flags : ['P', ...acl.flags];
  if (mode === 'remove') return withAcl(sd, 'dacl', { flags, aces: explicit });
  const converted = inherited.map((a) => ({ ...a, flags: a.flags.filter((f) => f !== 'ID') }));
  return withAcl(sd, 'dacl', { flags, aces: canonicalOrder([...explicit, ...converted]) });
}

/** Whether the DACL carries the protected (`P`) flag. */
export const isProtected = (sd: Sddl): boolean => sd.dacl?.flags.includes('P') ?? false;

/** One-shot description of an ACE for display. */
export interface AceDescription {
  readonly typeName: string;
  readonly category: AceCategory;
  readonly inherited: boolean;
  readonly icacls: string;
  readonly scope: string;
  readonly rights: RightsDescription;
}

export function describeAce(ace: Pick<SddlAce, 'type' | 'flags' | 'mask'>, kind: ObjectKind): AceDescription {
  return {
    typeName: aceTypeName(ace.type), category: aceCategory(ace.type), inherited: isInherited(ace),
    icacls: formatIcaclsInheritance(ace.flags), scope: describeInheritanceScope(ace.flags, kind), rights: describeRights(ace.mask, kind),
  };
}
