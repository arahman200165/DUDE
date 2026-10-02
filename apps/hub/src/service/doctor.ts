import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import path from 'node:path';
import { hubPaths } from '../config/data-dir.js';
import { spkiSha256 } from '../tls/self-signed.js';
import { EXIT_OK, EXIT_USAGE, defaultInstallDir, firewallRuleExists, json, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';

export interface DoctorOptions { dataDir?: string; installDir?: string; hubVersion: string }

export const LOG_LINES = 50;
const REDACTED = '[redacted]';
const SENSITIVE_KEY = /(token|password|passwd|cookie|authorization|secret|recovery|pairing|csrf|apikey|private)/i;
const NOT_A_SECRET_CODE = /^(status|exit|error|http|reason|response)code$/i;

/** True for a JSON/logfmt key whose value must never be shown: credentials and any `...code` that is not a numeric status. */
function isSensitiveKey(key: string): boolean {
  const k = key.replace(/[-_\s]/g, '');
  if (SENSITIVE_KEY.test(k)) return true;
  return /code$/i.test(k) && !NOT_A_SECRET_CODE.test(k);
}

/** Masks credential values in one log line (JSON members, key=value pairs, Authorization/Cookie headers, bearer tokens). */
export function redactLine(line: string): string {
  let out = line.replace(/"([^"\\]{1,64})"\s*:\s*("(?:[^"\\]|\\.)*"|[^,}\]\s]+)/g, (whole, key: string) => (isSensitiveKey(key) ? `"${key}":"${REDACTED}"` : whole));
  out = out.replace(/\b((?:set-)?cookie|authorization|proxy-authorization)\b(\s*[:=]\s*)[^\r\n]*/gi, `$1$2${REDACTED}`);
  out = out.replace(/\b([A-Za-z][A-Za-z0-9_.-]{0,40})=("[^"]*"|[^\s&;,]+)/g, (whole, key: string) => (isSensitiveKey(key) ? `${key}=${REDACTED}` : whole));
  out = out.replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${REDACTED}`);
  return out;
}

function fileSize(file: string): number | null {
  try { return statSync(file).size; } catch { return null; }
}

function tailLines(file: string, count: number): string[] {
  try {
    const text = readFileSync(file, 'utf8');
    return text.split(/\r?\n/).filter((l) => l.length > 0).slice(-count).map(redactLine);
  } catch {
    return [];
  }
}

function tlsInfo(tlsDir: string): { spkiSha256: string; validFrom: string; validTo: string; expired: boolean } | null {
  try {
    const pem = readFileSync(path.join(tlsDir, 'cert.pem'), 'utf8');
    const cert = new X509Certificate(pem);
    return { spkiSha256: spkiSha256(pem), validFrom: new Date(cert.validFrom).toISOString(), validTo: new Date(cert.validTo).toISOString(), expired: new Date(cert.validTo).getTime() < Date.now() };
  } catch {
    return null;
  }
}

/**
 * `dude-hub doctor`: redacted diagnostics. Works while the service is down and never opens the database;
 * database facts come from the admin channel when the Hub is running.
 */
export async function runDoctor(options: DoctorOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const paths = hubPaths(dataRoot);
  const installDir = path.resolve(options.installDir ?? defaultInstallDir(d.env));
  const state = await serviceState(d);
  const status = await tryAdminStatus(d, dataRoot);

  let freeBytes: number | null = null;
  try {
    const target = existsSync(dataRoot) ? dataRoot : path.dirname(dataRoot);
    const stats = await statfs(target);
    freeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch { /* unsupported or inaccessible */ }

  const report = {
    hubVersion: options.hubVersion,
    platform: `${d.platform} ${process.arch}`,
    node: process.version,
    service: { state, installDir: d.platform === 'win32' ? installDir : null, installDirExists: d.platform === 'win32' ? existsSync(installDir) : null },
    dataDir: dataRoot,
    dataDirExists: existsSync(dataRoot),
    freeDiskBytes: freeBytes,
    database: { dbBytes: fileSize(paths.dbFile), walBytes: fileSize(`${paths.dbFile}-wal`) },
    admin: status,
    ...(status === null ? { adminNote: 'The Hub is not reachable over the admin channel (stopped, or this terminal is not elevated); schema and runtime fields are omitted.' } : {}),
    tls: tlsInfo(paths.tlsDir),
    lanFirewallRule: d.platform === 'win32' ? await firewallRuleExists(d.exec) : null,
    logTail: tailLines(path.join(paths.logsDir, 'hub.log'), LOG_LINES),
  };
  d.out(json(report));
  return EXIT_OK;
}
