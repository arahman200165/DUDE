import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { statfs } from 'node:fs/promises';
import path from 'node:path';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';
import { hubPaths } from '../config/data-dir.js';
import { spkiSha256 } from '../tls/self-signed.js';
import { Value } from 'typebox/value';
import { HubDiagnosticsReport } from '@dude/contracts/hub';
import { collectDiagnostics, formatChecks } from '../diagnostics/index.js';
import { nativePortsCheck, publicFirewallCheck } from '../diagnostics/engine.js';
import type { DiagnosticsHostFacts } from '../diagnostics/engine.js';
import { gatherOfflineDeps } from '../diagnostics/gather.js';
import { EXIT_OK, EXIT_USAGE, defaultInstallDir, firewallRuleExists, json, readConfigPort, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';
import { gatherPublicFirewallFact } from './firewall.js';
import { auditNativeListeners } from './listeners.js';

export interface DoctorOptions { dataDir?: string; installDir?: string; hubVersion: string; /** Print only the endpoint diagnostics report as JSON. */ json?: boolean }

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
  const lanFirewallRule = d.platform === 'win32' ? await firewallRuleExists(d.exec) : null;

  // PD-068: the elevated doctor inspects the Public rule and audits native listeners; the owner route never shells out for these.
  const hostExtras: Pick<DiagnosticsHostFacts, 'publicFirewall' | 'nativeListeners'> = {};
  if (d.platform === 'win32') {
    const port = typeof status?.['port'] === 'number' ? status['port'] : readConfigPort(paths.configFile) ?? HUB_DEFAULT_PORT;
    hostExtras.publicFirewall = await gatherPublicFirewallFact(d.exec, port, installDir);
    const audit = await auditNativeListeners(d.exec, d.platform);
    hostExtras.nativeListeners = { exposed: audit.exposed, desktopLan: audit.desktopLan, partial: audit.partial };
  }

  // One engine (PD-060): the running Hub reports over the admin channel; otherwise it is built from config and public certificate files.
  let diagnostics: HubDiagnosticsReport | null = null;
  if (status !== null) {
    try {
      const reported = await d.call(dataRoot, 'diagnostics', {});
      if (Value.Check(HubDiagnosticsReport, reported)) {
        diagnostics = reported;
        // The running Hub reported these two as not-checked; replace them with what this elevated terminal observed.
        diagnostics = {
          ...reported,
          checks: reported.checks.map((c) => (c.id === 'public-firewall-rule'
            ? publicFirewallCheck({ platform: d.platform, bind: reported.exposure.bind, mode: reported.exposure.mode, fact: hostExtras.publicFirewall })
            : c.id === 'native-ports-exposed' ? nativePortsCheck({ platform: d.platform, fact: hostExtras.nativeListeners }) : c)),
        };
      }
    } catch { /* an older Hub without the method: fall back to the offline view */ }
  }
  diagnostics ??= await collectDiagnostics(gatherOfflineDeps({
    tlsDir: paths.tlsDir, configFile: paths.configFile, hubVersion: options.hubVersion, now: d.now(), platform: d.platform,
    host: () => Promise.resolve({ serviceState: state, firewallPresent: lanFirewallRule, ...hostExtras }),
  }));
  if (options.json) {
    d.out(json(diagnostics));
    return EXIT_OK;
  }

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
    lanFirewallRule,
    logTail: tailLines(path.join(paths.logsDir, 'hub.log'), LOG_LINES),
  };
  d.out(`${formatChecks(diagnostics)}

--- details ---
${json({ ...report, diagnostics })}`);
  return EXIT_OK;
}
