import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { isSea } from 'node:sea';
import type { SecretStore } from '../secrets/secret-store.js';
import { createSupervisor } from '../supervisor/supervisor.js';
import type { PreparedCommand, Supervisor, SupervisorOptions } from '../supervisor/supervisor.js';

/**
 * The `cloudflared` tunnel connector (32-SS1, PD-142, Milestone 836): what to run, with which pinned binary and how to ask it
 * whether it is ready. It builds the command only; turning the tunnel on and off (the elevated `network tunnel on|off`,
 * `run.ts` autostart, readiness blockers) is Milestone 837.
 *
 * Rules that hold here and are tested in `cloudflared.spec.ts`:
 * - The connector token (secret purpose `tunnel.connectorToken`, owner-pasted) is read from the secret store at start and
 *   reaches the child ONLY as the environment variable `TUNNEL_TOKEN`. It is never in argv (visible to every local process),
 *   never logged, and scrubbed from the captured output.
 * - The executable is hashed and compared with the pin before EVERY start; a mismatch refuses the start with a value-free error.
 * - `--no-autoupdate`: the Hub, not the binary, decides when cloudflared changes (a new pin ships with a new Hub).
 * - The child gets an allowlisted environment and nothing else of the Hub's.
 * - Windows only (PD-141). The Docker image carries no cloudflared; starting there fails with `unsupported-platform`.
 *
 * Limit: the hash check and the spawn are separate steps, so a process that can already write to the install directory could
 * swap the file between them. The install directory is writable only by administrators (the installer's ACL); this check
 * defends against a corrupted or substituted file at rest, not against an administrator.
 */

/** Keep in step with `scripts/fetch-cloudflared.mjs` (a spec compares the two). */
export const CLOUDFLARED_VERSION = '2026.10.4';
export const CLOUDFLARED_SHA256 = '411b16d40c8d872243efeb52c550053d00af0a8a97fbb32e730fb8aba429eaa8';
export const CLOUDFLARED_EXE = 'cloudflared.exe';
export const TUNNEL_SECRET_PURPOSE = 'tunnel.connectorToken' as const;

/** Environment variables cloudflared may inherit from the Hub. Everything else (and every Hub secret) is dropped. */
export const CLOUDFLARED_ENV_ALLOWLIST = ['SystemRoot', 'windir', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'ProgramData', 'TZ'] as const;

export type TunnelStartErrorCode =
  | 'unsupported-platform'
  | 'binary-missing'
  | 'binary-unreadable'
  | 'binary-hash-mismatch'
  | 'token-missing'
  | 'token-unreadable'
  | 'metrics-port-unavailable';

/** A refused start. The message never carries a path, a hash of a secret or any credential. */
export class TunnelStartError extends Error {
  override readonly name = 'TunnelStartError';
  constructor(readonly code: TunnelStartErrorCode, message: string) {
    super(message);
  }
}

/** `sha256` of a file, streamed. */
export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Refuses unless the file's SHA-256 equals the pin. */
export async function verifyCloudflaredBinary(file: string, expectedSha256: string = CLOUDFLARED_SHA256): Promise<void> {
  if (!existsSync(file)) throw new TunnelStartError('binary-missing', 'The tunnel connector (cloudflared) is not installed beside the Hub.');
  let actual: string;
  try {
    actual = await sha256File(file);
  } catch {
    throw new TunnelStartError('binary-unreadable', 'The tunnel connector (cloudflared) could not be read.');
  }
  if (actual.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new TunnelStartError('binary-hash-mismatch', 'The tunnel connector (cloudflared) does not match the version pinned by this Hub, so it was not started. Reinstall or update the Hub.');
  }
}

export interface CloudflaredLocation {
  /** Whether this process is the single-executable Hub (`dude-hub.exe`). */
  sea: boolean;
  /** `process.execPath`. */
  execPath: string;
  /** The bundle `node` was started with (`process.argv[1]`); only meaningful when not single-executable. */
  scriptPath?: string;
  exists?: (file: string) => boolean;
}

/**
 * Where cloudflared lives: next to `dude-hub.exe` in an installed Hub; in a development or foreground run (`node dist/hub/dude-hub.cjs`)
 * next to the bundle, else `build/vendor/cloudflared/` of the checkout (found by walking up from the bundle). Undefined when absent.
 */
export function resolveCloudflaredPath(location: CloudflaredLocation): string | undefined {
  const exists = location.exists ?? existsSync;
  const candidates: string[] = [];
  if (location.sea) candidates.push(path.join(path.dirname(location.execPath), CLOUDFLARED_EXE));
  else if (location.scriptPath) {
    let dir = path.dirname(path.resolve(location.scriptPath));
    candidates.push(path.join(dir, CLOUDFLARED_EXE));
    for (let i = 0; i < 6; i += 1) {
      candidates.push(path.join(dir, 'build', 'vendor', 'cloudflared', CLOUDFLARED_EXE));
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return candidates.find((candidate) => exists(candidate));
}

/** The exact argument list; the token is deliberately not part of it. */
export const buildCloudflaredArgs = (metricsPort: number): string[] => ['tunnel', '--no-autoupdate', '--metrics', `127.0.0.1:${String(metricsPort)}`, 'run'];

/** The child's whole environment: the allowlist from the Hub's environment plus the token. */
export function buildCloudflaredEnv(parentEnv: NodeJS.ProcessEnv, token: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const name of CLOUDFLARED_ENV_ALLOWLIST) {
    const value = parentEnv[name];
    if (value !== undefined) env[name] = value;
  }
  env['TUNNEL_TOKEN'] = token;
  return env;
}

/** A free loopback port for `--metrics` (a small race between closing the probe socket and cloudflared binding it is accepted). */
export function pickFreeLoopbackPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => (typeof address === 'object' && address ? resolve(address.port) : reject(new Error('no port'))));
    });
  });
}

/** `GET http://127.0.0.1:<port>/ready` (cloudflared answers 200 once it holds a connection to the edge, 503 before). Never rejects. */
export function createReadyCheck(port: number, options: { timeoutMs?: number } = {}): () => Promise<boolean> {
  const timeoutMs = options.timeoutMs ?? 2000;
  return () => new Promise<boolean>((resolve) => {
    const request = http.get({ host: '127.0.0.1', port, path: '/ready', timeout: timeoutMs, agent: false }, (response) => {
      response.resume();
      resolve(response.statusCode === 200);
    });
    request.on('timeout', () => { request.destroy(); resolve(false); });
    request.on('error', () => resolve(false));
  });
}

export interface CloudflaredSupervisorOptions {
  /** Only `getText` is used, and only here. */
  secrets: Pick<SecretStore, 'getText'>;
  /** The Hub data directory root: `run/cloudflared.pid` records the child, and `run/` is its working directory. */
  dataRoot: string;
  /** Overrides the located executable (specs and an explicit install location). */
  exePath?: string;
  location?: CloudflaredLocation;
  expectedSha256?: string;
  /** Wraps the executable in another command (the spec runs a node stub as `node <stub> <args>`); the hash check still covers `exePath`. */
  launch?: (exePath: string, args: string[]) => { command: string; args: string[] };
  /** Image the pid-file sweep expects (defaults to `exePath`; with `launch` it is the wrapper's image, for example node). */
  expectedImagePath?: string;
  platform?: NodeJS.Platform;
  parentEnv?: NodeJS.ProcessEnv;
  /** Extra non-secret environment for the child. Specs use it to steer the stub; production never passes it. */
  extraEnv?: Readonly<Record<string, string>>;
  pickPort?: () => Promise<number>;
  /** Supervisor tuning (backoff, readiness timing, log bounds): specs shorten them. */
  supervisor?: Partial<Pick<SupervisorOptions, 'backoffMs' | 'crashWindowMs' | 'maxCrashesInWindow' | 'readiness' | 'stopGraceMs' | 'log' | 'now' | 'processImagePath'>>;
}

/** The file recording the running connector's pid, so the next Hub start can remove an orphan. */
export const cloudflaredPidFile = (dataRoot: string): string => path.join(dataRoot, 'run', 'cloudflared.pid');

/**
 * Builds the supervised cloudflared. `prepare` runs before every launch (the first start and every automatic restart): check the
 * platform, locate and hash the binary, then read the token, so a pin or secret that changed while the Hub ran is honoured.
 */
export function createCloudflaredSupervisor(options: CloudflaredSupervisorOptions): Supervisor {
  const platform = options.platform ?? process.platform;
  const parentEnv = options.parentEnv ?? process.env;
  const locate = (): string => {
    const found = options.exePath ?? resolveCloudflaredPath(defaultLocation);
    if (!found) throw new TunnelStartError('binary-missing', 'The tunnel connector (cloudflared) is not installed beside the Hub.');
    return found;
  };
  const defaultLocation: CloudflaredLocation = options.location ?? { sea: isSea(), execPath: process.execPath, scriptPath: process.argv[1] ?? '' };
  const supported = options.launch !== undefined || platform === 'win32';

  const prepare = async (): Promise<PreparedCommand> => {
    if (!supported) throw new TunnelStartError('unsupported-platform', 'The tunnel is available only for the Windows Hub, not in this deployment.');
    const exe = locate();
    await verifyCloudflaredBinary(exe, options.expectedSha256);
    let token: string | null;
    try {
      token = options.secrets.getText(TUNNEL_SECRET_PURPOSE)?.trim() || null;
    } catch {
      throw new TunnelStartError('token-unreadable', 'The stored tunnel connector token cannot be read on this machine; enter it again.');
    }
    if (!token) throw new TunnelStartError('token-missing', 'No tunnel connector token is stored; paste the connector token first.');
    let port: number;
    try {
      port = await (options.pickPort ?? pickFreeLoopbackPort)();
    } catch {
      throw new TunnelStartError('metrics-port-unavailable', 'No loopback port was available for the tunnel connector\'s readiness endpoint.');
    }
    const runDir = path.join(options.dataRoot, 'run');
    mkdirSync(runDir, { recursive: true });
    const args = buildCloudflaredArgs(port);
    const launched = options.launch ? options.launch(exe, args) : { command: exe, args };
    return { command: launched.command, args: launched.args, cwd: runDir, env: { ...buildCloudflaredEnv(parentEnv, token), ...options.extraEnv, TUNNEL_TOKEN: token }, secrets: [token], ready: createReadyCheck(port) };
  };

  return createSupervisor({
    id: 'cloudflared',
    prepare,
    pidFile: cloudflaredPidFile(options.dataRoot),
    expectedImagePath: options.expectedImagePath ?? options.exePath ?? resolveCloudflaredPath(defaultLocation) ?? path.join(path.dirname(process.execPath), CLOUDFLARED_EXE),
    readiness: { intervalMs: 2000, startTimeoutMs: 60_000, unhealthyAfter: 3 },
    ...options.supervisor,
  });
}
