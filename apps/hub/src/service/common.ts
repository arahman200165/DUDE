import { execFile } from 'node:child_process';
import { X509Certificate } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { HUB_API_PREFIX } from '@dude/contracts/hub';
import type { HelloResponse } from '@dude/contracts/hub';
import { AdminCallError, callAdmin, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { hubPaths, resolveDataDir } from '../config/data-dir.js';
import { readCaCertPem } from '../tls/ca-public.js';
import { spkiSha256 } from '../tls/self-signed.js';

export const SERVICE_NAME = 'DudeHub';
export const SERVICE_DISPLAY_NAME = 'DUDE Hub';
export const SERVICE_ACCOUNT = 'NT SERVICE\\DudeHub';
export const FIREWALL_RULE_NAME = 'DUDE Hub (LAN)';
export const WRAPPER_EXE = 'DudeHub.exe';
export const WRAPPER_XML = 'DudeHub.xml';
export const HUB_EXE = 'dude-hub.exe';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;

export interface ExecResult { stdout: string; stderr: string; code: number }
/** Runs an external program without a shell. Resolves with the exit code; rejects only when it cannot be spawned. */
export type ExecFn = (file: string, args: readonly string[]) => Promise<ExecResult>;

export const defaultExec: ExecFn = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { shell: false, windowsHide: true, timeout: 120_000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) return resolve({ stdout, stderr, code: 0 });
      const code = (error as { code?: unknown }).code;
      if (typeof code === 'number') return resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? ''), code });
      reject(error);
    });
  });

export interface ServiceDeps {
  exec?: ExecFn;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  /** Directory the running binary was started from (the staged files). */
  sourceDir?: string;
  call?: (dataDir: string, method: string, params: unknown, timeoutMs?: number) => Promise<unknown>;
  hello?: (dataDir: string, port: number) => Promise<HelloResponse | null>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** How long to wait for the Hub to answer hello after a start (default 30 s). */
  helloTimeoutMs?: number;
}

export interface ResolvedDeps {
  exec: ExecFn;
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  out: (text: string) => void;
  err: (text: string) => void;
  sourceDir: string;
  call: (dataDir: string, method: string, params: unknown, timeoutMs?: number) => Promise<unknown>;
  hello: (dataDir: string, port: number) => Promise<HelloResponse | null>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  helloTimeoutMs: number;
}

export function resolveDeps(deps: ServiceDeps = {}): ResolvedDeps {
  return {
    exec: deps.exec ?? defaultExec,
    platform: deps.platform ?? process.platform,
    env: deps.env ?? process.env,
    out: deps.stdout ?? ((t) => void process.stdout.write(t)),
    err: deps.stderr ?? ((t) => void process.stderr.write(t)),
    sourceDir: deps.sourceDir ?? path.dirname(process.execPath),
    call: deps.call ?? ((dataDir, method, params, timeoutMs = 10_000) => callAdmin(dataDir, method, params, timeoutMs)),
    hello: deps.hello ?? fetchHello,
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: deps.now ?? Date.now,
    helloTimeoutMs: deps.helloTimeoutMs ?? 30_000,
  };
}

const envValue = (env: Record<string, string | undefined>, name: string): string | undefined =>
  Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

export const defaultInstallDir = (env: Record<string, string | undefined>): string =>
  path.win32.join(envValue(env, 'ProgramFiles') ?? 'C:\\Program Files', 'DUDE Hub');
export const defaultServiceDataDir = (env: Record<string, string | undefined>): string =>
  path.win32.join(envValue(env, 'ProgramData') ?? 'C:\\ProgramData', 'DUDE', 'Hub');

/** Data directory for the service commands: the flag, else `DUDE_HUB_DATA_DIR`, else the Windows default. */
export function serviceDataDir(flag: string | undefined, d: Pick<ResolvedDeps, 'env' | 'platform'>): string {
  const explicit = flag?.trim() || d.env['DUDE_HUB_DATA_DIR']?.trim();
  if (explicit) return path.resolve(explicit);
  if (d.platform === 'win32') return defaultServiceDataDir(d.env);
  return resolveDataDir({ env: d.env });
}

export const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

/** `fltmc` succeeds only for an elevated administrator. */
export async function isElevated(exec: ExecFn): Promise<boolean> {
  try {
    return (await exec('fltmc', [])).code === 0;
  } catch {
    return false;
  }
}

/** Refuses with exit 2 when not on Windows or not elevated. Returns null when the command may proceed. */
export async function requireElevated(d: ResolvedDeps, what: string): Promise<number | null> {
  if (d.platform !== 'win32') {
    d.err(`${what} is supported only on Windows.\n`);
    return EXIT_USAGE;
  }
  if (!(await isElevated(d.exec))) {
    d.err(`${what} needs an elevated (Administrator) terminal. Re-run it from "Run as administrator".\n`);
    return EXIT_USAGE;
  }
  return null;
}

export type ServiceState = 'running' | 'stopped' | 'starting' | 'stopping' | 'paused' | 'not-installed' | 'unknown';

export function parseScState(stdout: string): ServiceState {
  const match = /STATE\s*:\s*\d+\s+([A-Z_]+)/.exec(stdout);
  switch (match?.[1]) {
    case 'RUNNING': return 'running';
    case 'STOPPED': return 'stopped';
    case 'START_PENDING': return 'starting';
    case 'STOP_PENDING': return 'stopping';
    case 'PAUSED': case 'PAUSE_PENDING': case 'CONTINUE_PENDING': return 'paused';
    default: return 'unknown';
  }
}

export async function serviceState(d: Pick<ResolvedDeps, 'exec' | 'platform'>): Promise<ServiceState> {
  if (d.platform !== 'win32') return 'not-installed';
  try {
    const result = await d.exec('sc.exe', ['query', SERVICE_NAME]);
    if (result.code === 1060) return 'not-installed'; // ERROR_SERVICE_DOES_NOT_EXIST
    if (result.code !== 0) return 'unknown';
    return parseScState(result.stdout);
  } catch {
    return 'unknown';
  }
}

/**
 * True when a Hub may be running on `root`: the service is anything but not-installed or stopped, or the admin channel answers
 * (or fails in any way other than "not running"). The offline commands (purge, restore) refuse on true.
 */
export async function isHubRunning(root: string, d: Pick<ResolvedDeps, 'exec' | 'platform'>): Promise<boolean> {
  const state = await serviceState(d);
  if (state !== 'not-installed' && state !== 'stopped') return true; // running, pending, paused or unknown: refuse
  try {
    await callAdmin(root, 'status', {}, 2000);
    return true;
  } catch (error) {
    return !(error instanceof AdminCallError && error.code === HUB_NOT_RUNNING);
  }
}

export async function firewallRuleExists(exec: ExecFn): Promise<boolean> {
  try {
    return (await exec('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${FIREWALL_RULE_NAME}`])).code === 0;
  } catch {
    return false;
  }
}

export function deleteFirewallRule(exec: ExecFn): Promise<ExecResult> {
  return exec('netsh', ['advfirewall', 'firewall', 'delete', 'rule', `name=${FIREWALL_RULE_NAME}`]);
}

export async function addFirewallRule(exec: ExecFn, port: number, installDir: string): Promise<ExecResult> {
  await deleteFirewallRule(exec); // idempotent: never leave a stale port or program path
  return exec('netsh', [
    'advfirewall', 'firewall', 'add', 'rule', `name=${FIREWALL_RULE_NAME}`, 'dir=in', 'action=allow', 'protocol=TCP',
    `localport=${port}`, 'profile=private', `program=${path.join(installDir, HUB_EXE)}`,
  ]);
}

/** Pinned HTTPS hello against the loopback listener, trusting only the Hub's own certificate. Null when unreachable. */
export function fetchHello(dataDir: string, port: number): Promise<HelloResponse | null> {
  const certFile = path.join(hubPaths(dataDir).tlsDir, 'cert.pem');
  if (!existsSync(certFile)) return Promise.resolve(null);
  let pem: string;
  try { pem = readFileSync(certFile, 'utf8'); } catch { return Promise.resolve(null); }
  const pin = spkiSha256(pem);
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: '127.0.0.1', port, path: `${HUB_API_PREFIX}/hello`, method: 'GET', ca: [pem, ...(readCaCertPem(hubPaths(dataDir).tlsDir) ?? [])], servername: 'localhost', timeout: 4000,
        checkServerIdentity: (_host, cert) => (spkiSha256(new X509Certificate(cert.raw)) === pin ? undefined : new Error('Pinned certificate mismatch.')),
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          try { resolve(res.statusCode === 200 ? (JSON.parse(Buffer.concat(chunks).toString('utf8')) as HelloResponse) : null); } catch { resolve(null); }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/** Polls hello until the Hub answers or the timeout passes. */
export async function waitForHello(d: ResolvedDeps, dataDir: string, port: number): Promise<HelloResponse | null> {
  const deadline = d.now() + d.helloTimeoutMs;
  for (;;) {
    const hello = await d.hello(dataDir, port);
    if (hello) return hello;
    if (d.now() >= deadline) return null;
    await d.sleep(500);
  }
}

/** Admin `status`, or null when the Hub is not running or the pipe is not reachable from this account. */
export async function tryAdminStatus(d: ResolvedDeps, dataDir: string): Promise<Record<string, unknown> | null> {
  try {
    return (await d.call(dataDir, 'status', {})) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readConfigPort(configFile: string): number | undefined {
  try {
    const parsed = JSON.parse(readFileSync(configFile, 'utf8')) as { port?: unknown };
    return typeof parsed.port === 'number' ? parsed.port : undefined;
  } catch {
    return undefined;
  }
}
