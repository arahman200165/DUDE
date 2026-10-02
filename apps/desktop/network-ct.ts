import { X509Certificate } from 'node:crypto';
import type { NetworkRequest } from "@dude/contracts/core/platform/network-types";
import { embeddedSctList, splitSctList } from './der';
import ctLogList from './data/ct-log-list.json';

/**
 * Certificate Transparency Lookup (DUDE_PRD.md §21 Phase 28 item 20). Embedded SCTs are decoded
 * locally and each log is named from the bundled CT log list (no network). Domain history is an
 * explicit search against crt.sh — a named third party, disclosed before it runs — or a
 * user-supplied crt.sh-compatible endpoint.
 */
interface CtLog { operator: string; description: string; logId: string; url: string; state: string }
const LOGS = new Map((ctLogList as { logs: CtLog[] }).logs.map((log) => [log.logId, log]));
export const CT_LOG_COUNT = LOGS.size;
export const CT_LOG_LIST_RETRIEVED = (ctLogList as { retrievedAt: string }).retrievedAt;

export type SctSource = 'embedded' | 'ocsp' | 'tls';
export interface DecodedSct {
  readonly source: SctSource;
  readonly version: number;
  readonly logId: string;
  readonly logName: string | null;
  readonly logOperator: string | null;
  readonly logState: string | null;
  readonly timestamp: string;
  readonly hashAlgorithm: number;
  readonly signatureAlgorithm: number;
  readonly extensionsBytes: number;
}
const HASH_ALG: Record<number, string> = { 2: 'SHA-1', 4: 'SHA-256' };
const SIG_ALG: Record<number, string> = { 1: 'RSA', 3: 'ECDSA', 7: 'Ed25519' };
export const signatureAlgName = (code: number): string => SIG_ALG[code] ?? `alg ${code}`;
export const hashAlgName = (code: number): string => HASH_ALG[code] ?? `hash ${code}`;

/** One serialized SCT (RFC 6962 §3.2): version, log id, timestamp, extensions, then the signature. */
export function decodeSct(bytes: Buffer, source: SctSource): DecodedSct {
  if (bytes.length < 43) throw new Error('SCT too short.');
  const version = bytes[0];
  const logId = bytes.subarray(1, 33).toString('base64');
  const timestamp = bytes.readBigUInt64BE(33);
  const extensionsLength = bytes.readUInt16BE(41);
  const sigOffset = 43 + extensionsLength;
  const hashAlgorithm = bytes[sigOffset];
  const signatureAlgorithm = bytes[sigOffset + 1];
  const log = LOGS.get(logId);
  return {
    source, version, logId, logName: log?.description ?? null, logOperator: log?.operator ?? null, logState: log?.state ?? null,
    timestamp: new Date(Number(timestamp)).toISOString(), hashAlgorithm, signatureAlgorithm, extensionsBytes: extensionsLength,
  };
}

export function decodeEmbeddedScts(leafDer: Buffer): DecodedSct[] {
  const list = embeddedSctList(leafDer);
  if (!list) return [];
  return splitSctList(list).map((sct) => decodeSct(sct, 'embedded'));
}
/** Decode SCTs from a stapled OCSP response's SCT extension (best effort). */
export function decodeOcspScts(ocspDer: Buffer): DecodedSct[] {
  const marker = Buffer.from('06 0a 2b 06 01 04 01 d6 79 02 04 05'.replace(/ /g, ''), 'hex'); // OID 1.3.6.1.4.1.11129.2.4.5
  const at = ocspDer.indexOf(marker);
  if (at < 0) return [];
  try {
    // The extnValue OCTET STRING follows; inside is an OCTET STRING wrapping the SCT list.
    let pos = at + marker.length;
    if (ocspDer[pos] === 0x04) { const len = ocspDer[pos + 1]; pos += 2; if (len & 0x80) pos += len & 0x7f; }
    if (ocspDer[pos] === 0x04) { pos += 2; }
    const listLen = ocspDer.readUInt16BE(pos);
    return splitSctList(ocspDer.subarray(pos, pos + 2 + listLen)).map((sct) => decodeSct(sct, 'ocsp'));
  } catch { return []; }
}

export interface CrtShEntry { readonly id: number; readonly issuer: string; readonly commonName: string; readonly nameValue: string; readonly notBefore: string; readonly notAfter: string; readonly entryTimestamp: string; readonly serial?: string }
export interface CtResult {
  readonly host: string;
  readonly scts: readonly DecodedSct[];
  readonly logListRetrievedAt: string;
  readonly search?: { readonly endpoint: string; readonly query: string; readonly count: number; readonly truncated: boolean; readonly entries: readonly CrtShEntry[]; readonly uniqueNames: readonly string[]; readonly issuers: readonly string[]; readonly error?: string };
  readonly note: string;
}

const MAX_CRTSH_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 500;

async function searchCrtSh(endpoint: string, domain: string, includeSubdomains: boolean, signal: AbortSignal): Promise<CtResult['search']> {
  const base = endpoint || 'https://crt.sh';
  const query = includeSubdomains ? `%.${domain}` : domain;
  const url = new URL(base.replace(/\/$/, '') + '/');
  url.searchParams.set('q', query);
  url.searchParams.set('output', 'json');
  url.searchParams.set('exclude', 'expired');
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
    if (!response.ok) return { endpoint: url.host, query, count: 0, truncated: false, entries: [], uniqueNames: [], issuers: [], error: `HTTP ${response.status} from ${url.host}.` };
    const chunks: Buffer[] = [];
    let total = 0;
    if (!response.body) throw new Error('Empty response.');
    for await (const chunk of response.body) { total += chunk.length; if (total > MAX_CRTSH_BYTES) throw new Error('crt.sh response too large; narrow the query.'); chunks.push(Buffer.from(chunk)); }
    const raw = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>[];
    const entries: CrtShEntry[] = raw.slice(0, MAX_ENTRIES).map((row) => ({
      id: Number(row['id']), issuer: String(row['issuer_name'] ?? ''), commonName: String(row['common_name'] ?? ''), nameValue: String(row['name_value'] ?? ''),
      notBefore: String(row['not_before'] ?? ''), notAfter: String(row['not_after'] ?? ''), entryTimestamp: String(row['entry_timestamp'] ?? ''), serial: row['serial_number'] ? String(row['serial_number']) : undefined,
    }));
    const uniqueNames = [...new Set(entries.flatMap((entry) => entry.nameValue.split('\n')))].filter(Boolean).sort();
    const issuers = [...new Set(entries.map((entry) => entry.issuer))].filter(Boolean).sort();
    return { endpoint: url.host, query, count: raw.length, truncated: raw.length > MAX_ENTRIES, entries, uniqueNames, issuers };
  } catch (error) {
    return { endpoint: url.host, query, count: 0, truncated: false, entries: [], uniqueNames: [], issuers: [], error: error instanceof Error ? error.message : String(error) };
  }
}

export async function inspectCt(request: NetworkRequest, signal: AbortSignal, progress: (completed: number, total: number, data?: unknown) => void): Promise<CtResult> {
  const host = (request.target ?? '').trim();
  const scts: DecodedSct[] = [];
  const chain = request.chainBase64 ?? [];
  if (chain.length) {
    const leafDer = Buffer.from(chain[0], 'base64');
    try { scts.push(...decodeEmbeddedScts(leafDer)); } catch { /* no embedded SCTs */ }
    const leaf = new X509Certificate(leafDer);
    void leaf;
  }
  progress(1, 2);
  let search: CtResult['search'];
  if (request.ctSearch !== false && host) search = await searchCrtSh(request.ctEndpoint ?? '', host, request.includeSubdomains ?? false, signal);
  progress(2, 2);
  const identified = scts.filter((sct) => sct.logName).length;
  return {
    host, scts, logListRetrievedAt: CT_LOG_LIST_RETRIEVED, search,
    note: `${scts.length} embedded SCT(s) decoded; ${identified} matched a log in the bundled list (${CT_LOG_COUNT} logs, retrieved ${CT_LOG_LIST_RETRIEVED.slice(0, 10)}). Signatures are not cryptographically verified in this view. Domain history is from ${request.ctEndpoint || 'crt.sh'}.`,
  };
}
