import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { app, ipcMain, type BrowserWindow } from 'electron';
import type { AgentHubStatus } from '@dude/contracts';
import type {
  DesktopHubResult, DesktopHubStatus, DesktopLocalHubInfo, DesktopLocalHubSetupResult, DesktopLocalHubUpdateResult,
} from '@dude/contracts/shared/models/platform-bridge.model';
import { DeviceStoreError } from './agent-host';
import type { DeviceStoreHost } from './agent-host';

/**
 * Local Hub lifecycle for the renderer (PD-025, PD-028): `dude:hub:localHubInfo`, `dude:hub:setupLocalHub`,
 * `dude:hub:updateLocalHub`. Main is the trust boundary: it elevates the INSTALLED `dude-hub.exe` (Program Files is
 * admin-writable only) for the setup hand-off and the bundled one for an update. The setup token travels only in the
 * ACL'd hand-off file straight to the Device Agent; the renderer sees recovery codes and a status, never a credential.
 */

export const LOCAL_HUB_ERRORS = {
  unsupportedPlatform: 'unsupported-platform', busy: 'busy', notInstalled: 'not-installed', elevationCancelled: 'elevation-cancelled',
  elevationFailed: 'elevation-failed', setupTokenFailed: 'setup-token-failed', unsupportedInDev: 'unsupported-in-dev', noUpdate: 'no-update', updateFailed: 'update-failed',
} as const;

/** Exit codes the elevation wrapper uses for "the user declined UAC" (ERROR_CANCELLED) and "could not start". */
export const ELEVATION_CANCELLED_EXIT = 1223;
export const ELEVATION_FAILED_EXIT = 9009;

/**
 * The wrapper script is a CONSTANT: the file and arguments reach it only through environment variables, never by string
 * interpolation, so no value can alter the script. `Start-Process -ArgumentList` joins with spaces, so each argument is
 * quoted here when it needs it.
 */
export const ELEVATE_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  'try {',
  '  $list = @(foreach ($a in (ConvertFrom-Json $env:DUDE_ELEVATE_ARGS)) { if ($a -match \'[\\s"]\') { \'"\' + ($a -replace \'"\', \'\\"\') + \'"\' } else { [string]$a } })',
  '  $p = Start-Process -FilePath $env:DUDE_ELEVATE_FILE -ArgumentList $list -Verb RunAs -Wait -PassThru -WindowStyle Hidden',
  '  exit $p.ExitCode',
  '} catch {',
  `  if ($_.Exception.NativeErrorCode -eq ${ELEVATION_CANCELLED_EXIT}) { exit ${ELEVATION_CANCELLED_EXIT} }`,
  `  exit ${ELEVATION_FAILED_EXIT}`,
  '}',
].join('\n');

export interface ExecResult { readonly stdout: string; readonly code: number }
export type ExecFn = (file: string, args: readonly string[], options?: { readonly env?: Record<string, string>; readonly timeoutMs?: number }) => Promise<ExecResult>;

export interface LocalHubDeps {
  platform: NodeJS.Platform;
  env: Record<string, string | undefined>;
  isPackaged: () => boolean;
  resourcesPath: () => string;
  appVersion: () => string;
  exists: (file: string) => boolean;
  exec: ExecFn;
  randomBytes: (size: number) => Buffer;
  /** Polling budget while a restarted Hub comes back after an update. */
  updateWaitMs: number;
  sleep: (ms: number) => Promise<void>;
}

const ELEVATION_TIMEOUT_MS = 10 * 60_000;

export const defaultExec: ExecFn = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    execFile(
      file, [...args],
      { shell: false, windowsHide: true, timeout: options.timeoutMs ?? 20_000, encoding: 'utf8', env: { ...process.env, ...options.env } },
      (error, stdout) => {
        if (error && typeof (error as { code?: unknown }).code !== 'number') reject(error);
        else resolve({ stdout, code: error ? ((error as { code: number }).code) : 0 });
      },
    );
  });

const defaultDeps = (): LocalHubDeps => ({
  platform: process.platform, env: process.env, isPackaged: () => app.isPackaged, resourcesPath: () => process.resourcesPath, appVersion: () => app.getVersion(),
  exists: existsSync, exec: defaultExec, randomBytes, updateWaitMs: 30_000, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
});

const envValue = (env: Record<string, string | undefined>, name: string): string | undefined => {
  const hit = Object.entries(env).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return hit?.[1] || undefined;
};

export const HUB_EXE = 'dude-hub.exe';
const SID = /^S-1-(5-21|12-1)(-\d+){1,8}$/;
const REG_KEY = 'HKLM\\Software\\DUDE\\Hub';

const versionParts = (v: string): number[] | null => {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
/** True when `candidate` is a strictly newer `major.minor.patch` than `current` (pre-release suffixes ignored). */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = versionParts(candidate);
  const b = versionParts(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! > b[i]!;
  return false;
}

/** Runs `file args` elevated and waits. Values travel in the environment, never in the script text. Throws a `DeviceStoreError`. */
export async function runElevated(exec: ExecFn, file: string, args: readonly string[]): Promise<void> {
  let result: ExecResult;
  try {
    result = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ELEVATE_SCRIPT], {
      env: { DUDE_ELEVATE_FILE: file, DUDE_ELEVATE_ARGS: JSON.stringify(args) }, timeoutMs: ELEVATION_TIMEOUT_MS,
    });
  } catch {
    throw new DeviceStoreError(LOCAL_HUB_ERRORS.elevationFailed, 'The elevated command could not be started.');
  }
  if (result.code === ELEVATION_CANCELLED_EXIT) throw new DeviceStoreError(LOCAL_HUB_ERRORS.elevationCancelled, 'The administrator prompt was declined.');
  if (result.code === ELEVATION_FAILED_EXIT) throw new DeviceStoreError(LOCAL_HUB_ERRORS.elevationFailed, 'The elevated command could not be started.');
  if (result.code !== 0) throw new DeviceStoreError('command-failed', `The elevated command failed (exit ${result.code}).`);
}

function programFilesRoots(env: Record<string, string | undefined>): string[] {
  return [envValue(env, 'ProgramFiles') ?? 'C:\\Program Files', envValue(env, 'ProgramFiles(x86)')].filter((v): v is string => v !== undefined);
}

/** True when `dir` is strictly inside a Program Files root, which only administrators can write. */
export function isUnderProgramFiles(dir: string, env: Record<string, string | undefined>): boolean {
  const normalized = path.win32.normalize(dir);
  return path.win32.isAbsolute(normalized) && programFilesRoots(env).some((root) => {
    const rel = path.win32.relative(root, normalized);
    return rel !== '' && !rel.startsWith('..') && !path.win32.isAbsolute(rel);
  });
}

/** `%ProgramFiles%\DUDE Hub` or the installer-written `HKLM\Software\DUDE\Hub` InstallDir (only when it sits under a Program Files root). */
export async function findHubInstall(deps: LocalHubDeps): Promise<string | null> {
  const roots = programFilesRoots(deps.env);
  const candidates: string[] = [];
  try {
    const { stdout, code } = await deps.exec('reg.exe', ['query', REG_KEY, '/v', 'InstallDir']);
    const match = code === 0 ? /InstallDir\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(stdout) : null;
    if (match?.[1]) {
      const dir = path.win32.normalize(match[1]);
      if (isUnderProgramFiles(dir, deps.env)) candidates.push(dir);
    }
  } catch { /* the registry value is optional */ }
  candidates.push(path.win32.join(roots[0]!, 'DUDE Hub'));
  return candidates.find((dir) => deps.exists(path.win32.join(dir, HUB_EXE))) ?? null;
}

async function currentSid(deps: LocalHubDeps): Promise<string> {
  const { stdout, code } = await deps.exec('whoami', ['/user', '/fo', 'csv', '/nh']);
  const sid = code === 0 ? /"(S-1-[\d-]+)"\s*$/m.exec(stdout)?.[1] : undefined;
  if (!sid || !SID.test(sid)) throw new DeviceStoreError(LOCAL_HUB_ERRORS.setupTokenFailed, 'Your Windows account could not be identified.');
  return sid;
}

const fail = (code: string, message: string): DesktopHubResult<never> => ({ ok: false, error: { code, message } });
const isString = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.length >= min && v.length <= max;
const hasOnly = (o: object, keys: readonly string[]): boolean => Object.keys(o).every((k) => keys.includes(k));

export interface LocalHubHelpers {
  toStatus: (status: AgentHubStatus) => DesktopHubStatus;
  scrub: <T>(value: T) => T;
}

export function registerLocalHubHandlers(window: BrowserWindow, host: () => DeviceStoreHost | null, overrides: Partial<LocalHubDeps>, helpers: LocalHubHelpers): void {
  const deps = (): LocalHubDeps => ({ ...defaultDeps(), ...overrides });
  const own = (sender: unknown): boolean => sender === window.webContents;
  let busy = false;

  const guarded = <R>(channel: string, parse: (args: readonly unknown[]) => string | null, run: (h: DeviceStoreHost, d: LocalHubDeps, args: readonly unknown[]) => Promise<R>, exclusive: boolean): void => {
    ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<DesktopHubResult<R>> => {
      if (!own(event.sender)) return fail('forbidden', 'forbidden');
      const invalid = parse(args);
      if (invalid !== null) return fail('bad-request', invalid);
      const d = deps();
      if (d.platform !== 'win32') return fail(LOCAL_HUB_ERRORS.unsupportedPlatform, 'The local Hub is only available on Windows.');
      const h = host();
      if (!h) return fail('unavailable', 'The device agent is not running.');
      if (exclusive) {
        if (busy) return fail(LOCAL_HUB_ERRORS.busy, 'Another Hub operation is in progress.');
        busy = true;
      }
      try {
        return { ok: true, result: helpers.scrub(await run(h, d, args)) };
      } catch (error) {
        if (error instanceof DeviceStoreError) return fail(error.code, error.message);
        return fail('internal', 'The Hub request failed.');
      } finally {
        if (exclusive) busy = false;
      }
    });
  };

  const bundledHubInstaller = (d: LocalHubDeps): string | null => {
    if (!d.isPackaged()) return null;
    const installer = path.win32.join(d.resourcesPath(), 'DUDE-Hub-Setup.exe');
    // This installer is run elevated. A per-user install keeps resources in a user-writable folder, where anything running
    // as the user could swap it, so only a per-machine (Program Files) install may offer the in-app update.
    if (!isUnderProgramFiles(installer, d.env)) return null;
    return d.exists(installer) ? installer : null;
  };

  const info = async (h: DeviceStoreHost, d: LocalHubDeps): Promise<DesktopLocalHubInfo> => {
    const installDir = await findHubInstall(d);
    const probe = await h.call('hub.probeLocal', {}).catch(() => null);
    const hubVersion = probe?.found ? probe.hubVersion : null;
    const bundledHubVersion = bundledHubInstaller(d) ? d.appVersion() : null;
    return {
      installed: installDir !== null, installDir, found: probe?.found ?? false, bootstrapped: probe?.found ? probe.bootstrapped : null,
      hubVersion, bundledHubVersion,
      updateAvailable: installDir !== null && bundledHubVersion !== null && hubVersion !== null && isNewerVersion(bundledHubVersion, hubVersion),
    };
  };

  guarded('dude:hub:localHubInfo', (args) => (args.length === 0 ? null : 'Invalid request.'), (h, d) => info(h, d), false);

  guarded<DesktopLocalHubSetupResult>(
    'dude:hub:setupLocalHub',
    (args) => {
      const [r] = args;
      if (args.length !== 1 || typeof r !== 'object' || r === null || Array.isArray(r)) return 'Invalid request.';
      const o = r as Record<string, unknown>;
      if (!hasOnly(o, ['environmentName', 'ownerDisplayName', 'password'])) return 'Invalid request.';
      if (!isString(o['environmentName'], 1, 64) || !isString(o['ownerDisplayName'], 1, 64) || !isString(o['password'], 12, 1024)) return 'Invalid request.';
      return null;
    },
    async (h, d, args) => {
      const request = args[0] as { environmentName: string; ownerDisplayName: string; password: string };
      const installDir = await findHubInstall(d);
      if (installDir === null) throw new DeviceStoreError(LOCAL_HUB_ERRORS.notInstalled, 'The DUDE Hub is not installed on this PC.');
      const sid = await currentSid(d);
      const nonce = d.randomBytes(24).toString('base64url');
      const dataDir = path.win32.join(envValue(d.env, 'ProgramData') ?? 'C:\\ProgramData', 'DUDE', 'Hub');
      try {
        await runElevated(d.exec, path.win32.join(installDir, HUB_EXE), ['setup-token', '--data-dir', dataDir, '--deliver-to', sid, '--nonce', nonce]);
      } catch (error) {
        if (error instanceof DeviceStoreError && error.code === 'command-failed') throw new DeviceStoreError(LOCAL_HUB_ERRORS.setupTokenFailed, 'The Hub did not issue a setup token. Is the Hub service running and not yet set up?');
        throw error;
      }
      const result = await h.call('hub.bootstrapLocal', { nonce, environmentName: request.environmentName, ownerDisplayName: request.ownerDisplayName, password: request.password });
      return { recoveryCodes: result.recoveryCodes, status: helpers.toStatus(result.status), ...(result.followUpError ? { followUpError: result.followUpError } : {}) };
    },
    true,
  );

  guarded<DesktopLocalHubUpdateResult>(
    'dude:hub:updateLocalHub',
    (args) => (args.length === 0 ? null : 'Invalid request.'),
    async (h, d) => {
      if (!d.isPackaged()) throw new DeviceStoreError(LOCAL_HUB_ERRORS.unsupportedInDev, 'Updating the Hub is not available in a development build.');
      const before = await info(h, d);
      const installer = bundledHubInstaller(d);
      if (!before.installed || installer === null || !before.updateAvailable) throw new DeviceStoreError(LOCAL_HUB_ERRORS.noUpdate, 'There is no Hub update to install.');
      try {
        // The Hub installer's /UPDATE mode stops, replaces and starts the service (exit 0 ok, 3 install/update failure).
        await runElevated(d.exec, installer, ['/S', '/UPDATE']);
      } catch (error) {
        if (error instanceof DeviceStoreError && error.code === 'command-failed') throw new DeviceStoreError(LOCAL_HUB_ERRORS.updateFailed, 'The Hub update did not complete. Check "dude-hub doctor".');
        throw error;
      }
      let after = before.hubVersion;
      for (let waited = 0; waited <= d.updateWaitMs; waited += 1_000) {
        const probe = await h.call('hub.probeLocal', {}).catch(() => null);
        if (probe?.found && probe.hubVersion !== null && probe.hubVersion !== before.hubVersion) { after = probe.hubVersion; break; }
        await d.sleep(1_000);
      }
      return { fromVersion: before.hubVersion, toVersion: after === before.hubVersion ? null : after };
    },
    true,
  );
}
