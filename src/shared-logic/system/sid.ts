/** Pure Windows SID codec: `S-R-I-S1-...` string <-> binary SID (hex / base64), plus a well-known SID table. */

export interface ParsedSid {
  readonly revision: number;
  /** 48-bit identifier authority (always < 2^48, so a safe integer). */
  readonly identifierAuthority: number;
  readonly subAuthorities: readonly number[];
}

export type SidInputFormat = 'sid' | 'binary-base64' | 'binary-hex';

export const MAX_SUB_AUTHORITIES = 15;
const MAX_AUTHORITY = 2 ** 48 - 1;

const STRING_SHAPE = /^S-(\d+)-(\d+)((?:-\d+)*)$/i;

/** Parse an `S-1-...` string. Throws on malformed input. */
export function parseSidString(text: string): ParsedSid {
  const match = STRING_SHAPE.exec(text.trim());
  if (!match) throw new Error('Not a valid SID string (expected S-1-5-...).');
  const revision = Number(match[1]);
  if (revision !== 1) throw new Error('Unsupported SID revision (only revision 1 exists).');
  const authority = Number(match[2]);
  if (!Number.isSafeInteger(authority) || authority > MAX_AUTHORITY) throw new Error('Identifier authority exceeds 48 bits.');
  const subs = match[3] ? match[3].slice(1).split('-').map(Number) : [];
  if (subs.length > MAX_SUB_AUTHORITIES) throw new Error('A SID has at most 15 subauthorities.');
  for (const sub of subs) if (!Number.isSafeInteger(sub) || sub > 0xffffffff) throw new Error('Subauthority exceeds 32 bits.');
  return { revision, identifierAuthority: authority, subAuthorities: subs };
}

export function formatSid(sid: ParsedSid): string {
  return ['S', sid.revision, sid.identifierAuthority, ...sid.subAuthorities].join('-');
}

export function sidToBytes(sid: ParsedSid): Uint8Array {
  if (sid.subAuthorities.length > MAX_SUB_AUTHORITIES) throw new Error('A SID has at most 15 subauthorities.');
  if (sid.identifierAuthority < 0 || sid.identifierAuthority > MAX_AUTHORITY) throw new Error('Identifier authority exceeds 48 bits.');
  const bytes = new Uint8Array(8 + 4 * sid.subAuthorities.length);
  const view = new DataView(bytes.buffer);
  bytes[0] = sid.revision;
  bytes[1] = sid.subAuthorities.length;
  view.setUint16(2, Math.floor(sid.identifierAuthority / 2 ** 32));
  view.setUint32(4, sid.identifierAuthority % 2 ** 32);
  sid.subAuthorities.forEach((sub, i) => view.setUint32(8 + 4 * i, sub, true));
  return bytes;
}

export function bytesToSid(bytes: Uint8Array): ParsedSid {
  if (bytes.length < 8) throw new Error('Binary SID is shorter than the 8-byte header.');
  const revision = bytes[0];
  if (revision !== 1) throw new Error('Unsupported SID revision (only revision 1 exists).');
  const count = bytes[1];
  if (count > MAX_SUB_AUTHORITIES) throw new Error('A SID has at most 15 subauthorities.');
  if (bytes.length !== 8 + 4 * count) throw new Error(`Binary SID length ${bytes.length} does not match ${8 + 4 * count} bytes for ${count} subauthorities.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const identifierAuthority = view.getUint16(2) * 2 ** 32 + view.getUint32(4);
  const subAuthorities: number[] = [];
  for (let i = 0; i < count; i++) subAuthorities.push(view.getUint32(8 + 4 * i, true));
  return { revision, identifierAuthority, subAuthorities };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/0x|[\s:,-]/gi, '');
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) throw new Error('Hex input must be an even number of hexadecimal digits.');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/\s+/g, '');
  if (clean.length === 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(clean)) throw new Error('Base64 input is invalid.');
  return Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
}

/** Parse a SID from any supported input representation. */
export function parseSid(input: string, format: SidInputFormat): ParsedSid {
  if (format === 'sid') return parseSidString(input);
  return bytesToSid(format === 'binary-hex' ? hexToBytes(input) : base64ToBytes(input));
}

export interface DecodedSid {
  readonly sid: string;
  readonly revision: number;
  readonly identifierAuthority: number;
  readonly subAuthorities: readonly number[];
  readonly binaryHex: string;
  readonly base64: string;
  readonly wellKnownName: string | null;
  readonly description: string | null;
}

export function decodeSid(input: string, format: SidInputFormat): DecodedSid {
  const parsed = parseSid(input, format);
  const bytes = sidToBytes(parsed);
  const sid = formatSid(parsed);
  const known = describeSid(sid);
  return { sid, ...parsed, binaryHex: bytesToHex(bytes), base64: bytesToBase64(bytes), wellKnownName: known?.name ?? null, description: known?.description ?? null };
}

export interface WellKnownSid { readonly sid: string; readonly name: string; readonly description: string; }

export const WELL_KNOWN_SIDS: readonly WellKnownSid[] = [
  { sid: 'S-1-0-0', name: 'NULL SID', description: 'No members; used when the SID is unknown.' },
  { sid: 'S-1-1-0', name: 'Everyone', description: 'All users, including anonymous and guests.' },
  { sid: 'S-1-2-0', name: 'LOCAL', description: 'Users who log on locally.' },
  { sid: 'S-1-2-1', name: 'CONSOLE LOGON', description: 'Users logged on to the physical console.' },
  { sid: 'S-1-3-0', name: 'CREATOR OWNER', description: 'Placeholder replaced by the creator of an object.' },
  { sid: 'S-1-3-1', name: 'CREATOR GROUP', description: 'Placeholder replaced by the primary group of the creator.' },
  { sid: 'S-1-5-1', name: 'NT AUTHORITY\\DIALUP', description: 'Users logged on via dial-up.' },
  { sid: 'S-1-5-2', name: 'NT AUTHORITY\\NETWORK', description: 'Users logged on over the network.' },
  { sid: 'S-1-5-3', name: 'NT AUTHORITY\\BATCH', description: 'Batch-logon processes such as scheduled tasks.' },
  { sid: 'S-1-5-4', name: 'NT AUTHORITY\\INTERACTIVE', description: 'Interactive logons.' },
  { sid: 'S-1-5-6', name: 'NT AUTHORITY\\SERVICE', description: 'Service logons.' },
  { sid: 'S-1-5-7', name: 'NT AUTHORITY\\ANONYMOUS LOGON', description: 'Anonymous access.' },
  { sid: 'S-1-5-9', name: 'NT AUTHORITY\\ENTERPRISE DOMAIN CONTROLLERS', description: 'Domain controllers in the forest.' },
  { sid: 'S-1-5-10', name: 'NT AUTHORITY\\SELF', description: 'The object itself (in AD ACEs).' },
  { sid: 'S-1-5-11', name: 'NT AUTHORITY\\Authenticated Users', description: 'Any authenticated user or computer.' },
  { sid: 'S-1-5-12', name: 'NT AUTHORITY\\RESTRICTED', description: 'Restricted-token processes.' },
  { sid: 'S-1-5-13', name: 'NT AUTHORITY\\TERMINAL SERVER USER', description: 'Remote Desktop / terminal server users.' },
  { sid: 'S-1-5-14', name: 'NT AUTHORITY\\REMOTE INTERACTIVE LOGON', description: 'Remote interactive logons.' },
  { sid: 'S-1-5-15', name: 'NT AUTHORITY\\This Organization', description: 'Users from the same organization.' },
  { sid: 'S-1-5-18', name: 'NT AUTHORITY\\SYSTEM', description: 'LocalSystem account.' },
  { sid: 'S-1-5-19', name: 'NT AUTHORITY\\LOCAL SERVICE', description: 'LocalService account.' },
  { sid: 'S-1-5-20', name: 'NT AUTHORITY\\NETWORK SERVICE', description: 'NetworkService account.' },
  { sid: 'S-1-5-32-544', name: 'BUILTIN\\Administrators', description: 'Local administrators group.' },
  { sid: 'S-1-5-32-545', name: 'BUILTIN\\Users', description: 'Local users group.' },
  { sid: 'S-1-5-32-546', name: 'BUILTIN\\Guests', description: 'Local guests group.' },
  { sid: 'S-1-5-32-547', name: 'BUILTIN\\Power Users', description: 'Legacy power users group.' },
  { sid: 'S-1-5-32-548', name: 'BUILTIN\\Account Operators', description: 'Domain account operators.' },
  { sid: 'S-1-5-32-549', name: 'BUILTIN\\Server Operators', description: 'Domain server operators.' },
  { sid: 'S-1-5-32-550', name: 'BUILTIN\\Print Operators', description: 'Domain print operators.' },
  { sid: 'S-1-5-32-551', name: 'BUILTIN\\Backup Operators', description: 'Can bypass file security to back up and restore.' },
  { sid: 'S-1-5-32-552', name: 'BUILTIN\\Replicator', description: 'File replication support.' },
  { sid: 'S-1-5-32-555', name: 'BUILTIN\\Remote Desktop Users', description: 'May log on remotely.' },
  { sid: 'S-1-5-32-556', name: 'BUILTIN\\Network Configuration Operators', description: 'May change network settings.' },
  { sid: 'S-1-5-32-558', name: 'BUILTIN\\Performance Monitor Users', description: 'May monitor performance counters.' },
  { sid: 'S-1-5-32-559', name: 'BUILTIN\\Performance Log Users', description: 'May schedule performance logging.' },
  { sid: 'S-1-5-32-562', name: 'BUILTIN\\Distributed COM Users', description: 'May use DCOM.' },
  { sid: 'S-1-5-32-573', name: 'BUILTIN\\Event Log Readers', description: 'May read event logs.' },
  { sid: 'S-1-5-32-578', name: 'BUILTIN\\Hyper-V Administrators', description: 'Full Hyper-V access.' },
  { sid: 'S-1-5-32-580', name: 'BUILTIN\\Remote Management Users', description: 'May use WinRM.' },
  { sid: 'S-1-5-80-0', name: 'NT SERVICE\\ALL SERVICES', description: 'All service SIDs.' },
  { sid: 'S-1-5-113', name: 'NT AUTHORITY\\Local account', description: 'Any local (non-domain) account.' },
  { sid: 'S-1-5-114', name: 'NT AUTHORITY\\Local account and member of Administrators group', description: 'Local administrator accounts.' },
  { sid: 'S-1-15-2-1', name: 'APPLICATION PACKAGE AUTHORITY\\ALL APPLICATION PACKAGES', description: 'All AppContainer packages.' },
  { sid: 'S-1-15-2-2', name: 'APPLICATION PACKAGE AUTHORITY\\ALL RESTRICTED APPLICATION PACKAGES', description: 'All restricted AppContainer packages.' },
  { sid: 'S-1-16-0', name: 'Mandatory Label\\Untrusted Mandatory Level', description: 'Integrity level 0x0000.' },
  { sid: 'S-1-16-4096', name: 'Mandatory Label\\Low Mandatory Level', description: 'Integrity level 0x1000.' },
  { sid: 'S-1-16-8192', name: 'Mandatory Label\\Medium Mandatory Level', description: 'Integrity level 0x2000.' },
  { sid: 'S-1-16-8448', name: 'Mandatory Label\\Medium Plus Mandatory Level', description: 'Integrity level 0x2100.' },
  { sid: 'S-1-16-12288', name: 'Mandatory Label\\High Mandatory Level', description: 'Integrity level 0x3000 (elevated).' },
  { sid: 'S-1-16-16384', name: 'Mandatory Label\\System Mandatory Level', description: 'Integrity level 0x4000.' },
  { sid: 'S-1-16-20480', name: 'Mandatory Label\\Protected Process Mandatory Level', description: 'Integrity level 0x5000.' },
];

const BY_SID = new Map(WELL_KNOWN_SIDS.map((e) => [e.sid, e]));

const DOMAIN_RIDS: Readonly<Record<string, readonly [string, string]>> = {
  '500': ['Administrator', 'Built-in administrator account (RID 500).'],
  '501': ['Guest', 'Built-in guest account (RID 501).'],
  '502': ['krbtgt', 'Key Distribution Center service account (RID 502).'],
  '512': ['Domain Admins', 'Domain administrators group (RID 512).'],
  '513': ['Domain Users', 'All domain users (RID 513).'],
  '514': ['Domain Guests', 'Domain guests (RID 514).'],
  '515': ['Domain Computers', 'All domain computers (RID 515).'],
  '516': ['Domain Controllers', 'All domain controllers (RID 516).'],
  '518': ['Schema Admins', 'Schema administrators (RID 518).'],
  '519': ['Enterprise Admins', 'Enterprise administrators (RID 519).'],
};

/** Look up a SID string (case-insensitive) in the well-known table, including domain/machine RID patterns. */
export function describeSid(sid: string): { name: string; description: string } | null {
  const upper = sid.toUpperCase();
  const exact = BY_SID.get(upper);
  if (exact) return exact;
  const rid = /^S-1-5-21-\d+-\d+-\d+-(\d+)$/.exec(upper);
  if (!rid) return null;
  const hit = DOMAIN_RIDS[rid[1]];
  if (hit) return { name: `<domain or machine>\\${hit[0]}`, description: hit[1] };
  return { name: 'Domain or machine account', description: `Relative ID ${rid[1]} under a domain/machine identifier (S-1-5-21-...).` };
}
