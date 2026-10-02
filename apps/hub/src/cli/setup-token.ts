import { execFile } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { AdminCallError, callAdmin, HUB_NOT_RUNNING } from '../admin/admin-client.js';
import { resolveDataDir } from '../config/data-dir.js';

export const SID_PATTERN = /^S-1-(5-21|12-1)(-\d+){1,8}$/;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

/** Key segments are joined with escaped backslashes on purpose; a spec asserts the split. */
export const PROFILE_LIST_KEY = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\ProfileList';
export const profileKeyFor = (sid: string): string => `${PROFILE_LIST_KEY}\\${sid}`;

export type ExecFn = (file: string, args: readonly string[]) => Promise<{ stdout: string }>;

export const defaultExec: ExecFn = (file, args) =>
  new Promise((resolve, reject) => {
    execFile(file, [...args], { shell: false, windowsHide: true, timeout: 15_000, encoding: 'utf8' }, (error, stdout) => (error ? reject(error) : resolve({ stdout })));
  });

export interface SetupTokenPayload { token: string; spkiSha256: string; port: number; hubInstanceId: string }

export interface SetupTokenDeps {
  exec?: ExecFn;
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  now?: () => number;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  call?: (dataDir: string) => Promise<unknown>;
}

export interface SetupTokenOptions { dataDir?: string; deliverTo?: string; nonce?: string }

const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;

export function expandEnv(value: string, env: Record<string, string | undefined>): string {
  return value.replace(/%([^%]+)%/g, (whole, name: string) => {
    const hit = Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase());
    return hit?.[1] ?? whole;
  });
}

export async function resolveProfileDir(sid: string, exec: ExecFn, env: Record<string, string | undefined>): Promise<string> {
  const { stdout } = await exec('reg.exe', ['query', profileKeyFor(sid), '/v', 'ProfileImagePath']);
  const match = /ProfileImagePath\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(stdout);
  if (!match?.[1]) throw new Error('The profile directory for that account could not be found.');
  const dir = expandEnv(match[1], env);
  if (dir.includes('%')) throw new Error('The profile directory contains an unresolved variable.');
  return dir;
}

export const handoffFileFor = (profileDir: string, nonce: string): string =>
  path.join(profileDir, 'AppData', 'Local', 'DUDE', `hub-handoff-${nonce}.json`);

/** Writes the hand-off file (temp + rename) and restricts it to the target SID and SYSTEM. Removes it on any failure. */
export async function deliverHandoff(
  payload: SetupTokenPayload,
  sid: string,
  nonce: string,
  deps: Required<Pick<SetupTokenDeps, 'exec' | 'env' | 'now'>>,
): Promise<string> {
  const profileDir = await resolveProfileDir(sid, deps.exec, deps.env);
  const file = handoffFileFor(profileDir, nonce);
  const temp = `${file}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    const body = { v: 1, token: payload.token, spkiSha256: payload.spkiSha256, port: payload.port, hubInstanceId: payload.hubInstanceId, createdAt: new Date(deps.now()).toISOString() };
    writeFileSync(temp, `${JSON.stringify(body)}\n`, { mode: 0o600 });
    renameSync(temp, file);
    await deps.exec('icacls', [file, '/inheritance:r', '/grant:r', `*${sid}:(R,D)`, '*S-1-5-18:(F)']);
  } catch (error) {
    rmSync(temp, { force: true });
    rmSync(file, { force: true });
    throw error;
  }
  return file;
}

/** `dude-hub setup-token`: asks the running service over the admin channel; never opens the database. */
export async function runSetupToken(options: SetupTokenOptions, deps: SetupTokenDeps = {}): Promise<number> {
  const platform = deps.platform ?? process.platform;
  const out = deps.stdout ?? ((t: string) => void process.stdout.write(t));
  const err = deps.stderr ?? ((t: string) => void process.stderr.write(t));
  const deliver = options.deliverTo !== undefined || options.nonce !== undefined;
  if (deliver) {
    if (platform !== 'win32') { err('--deliver-to is supported only on Windows.\n'); return EXIT_USAGE; }
    if (options.deliverTo === undefined || options.nonce === undefined) { err('--deliver-to and --nonce must be given together.\n'); return EXIT_USAGE; }
    if (!SID_PATTERN.test(options.deliverTo)) { err('--deliver-to is not a valid account SID.\n'); return EXIT_USAGE; }
    if (!NONCE_PATTERN.test(options.nonce)) { err('--nonce must be 16 to 64 characters of A-Z, a-z, 0-9, "_" or "-".\n'); return EXIT_USAGE; }
  }

  let payload: SetupTokenPayload;
  try {
    const dataDir = resolveDataDir({ dataDir: options.dataDir });
    payload = (await (deps.call ? deps.call(dataDir) : callAdmin(dataDir, 'setup.token', {}, 5000))) as SetupTokenPayload;
  } catch (error) {
    err(`${error instanceof Error ? error.message : 'setup-token failed'}\n`);
    return error instanceof AdminCallError && (error.code === HUB_NOT_RUNNING || error.code === 'already-bootstrapped') ? EXIT_USAGE : EXIT_FAILURE;
  }

  if (!deliver) {
    out(`${JSON.stringify({ token: payload.token, spkiSha256: payload.spkiSha256, port: payload.port })}\n`);
    return 0;
  }
  try {
    await deliverHandoff(payload, options.deliverTo!, options.nonce!, { exec: deps.exec ?? defaultExec, env: deps.env ?? process.env, now: deps.now ?? Date.now });
  } catch {
    err('The setup hand-off could not be delivered.\n'); // never include the token or file contents
    return EXIT_FAILURE;
  }
  out(`${JSON.stringify({ delivered: true, nonce: options.nonce })}\n`);
  return 0;
}
