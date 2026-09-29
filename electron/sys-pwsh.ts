import { spawn } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { PwshStatus } from '../src/shared-logic/system/system-types';

export interface PwshDeps {
  readonly env: Readonly<Record<string, string | undefined>>;
  exists(path: string): boolean;
  run(file: string, args: string[], timeoutMs: number): Promise<string>;
}

const VERSION_ARGS = ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'];
const NOT_FOUND = 'PowerShell 7 was not found. Install it with: winget install --id Microsoft.PowerShell';

function runProcess(file: string, args: string[], timeoutMs: number, maxStdout = 2_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf8'); if (stdout.length > maxStdout) child.kill(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf8'); if (stderr.length > 10_000) child.kill(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `PowerShell exited ${code}.`));
    });
  });
}

/** `existsSync` is false for App Execution Alias reparse points (WindowsApps\pwsh.exe); `lstat` sees them. */
function pathExists(path: string): boolean {
  try { lstatSync(path); return true; } catch { return false; }
}

const realDeps: PwshDeps = { env: process.env, exists: pathExists, run: (file, args, timeoutMs) => runProcess(file, args, timeoutMs) };

function candidates(deps: PwshDeps): { path: string; source: NonNullable<PwshStatus['source']> }[] {
  const list: { path: string; source: NonNullable<PwshStatus['source']> }[] = [];
  const pathVar = deps.env['PATH'] ?? deps.env['Path'] ?? '';
  for (const raw of pathVar.split(delimiter)) {
    const dir = raw.trim().replace(/^"|"$/g, '');
    if (!dir) continue;
    const path = join(dir, 'pwsh.exe');
    if (deps.exists(path)) {
      list.push({ path, source: /\\microsoft\\windowsapps/i.test(dir) ? 'windows-apps' : 'path' });
      break;
    }
  }
  const programFiles = deps.env['ProgramFiles'];
  if (programFiles) list.push({ path: join(programFiles, 'PowerShell', '7', 'pwsh.exe'), source: 'program-files' });
  const localAppData = deps.env['LOCALAPPDATA'];
  if (localAppData) list.push({ path: join(localAppData, 'Microsoft', 'WindowsApps', 'pwsh.exe'), source: 'windows-apps' });
  return list;
}

export async function detectPwsh(deps: PwshDeps = realDeps): Promise<PwshStatus> {
  let tooOld: string | undefined;
  const tried = new Set<string>();
  for (const candidate of candidates(deps)) {
    const key = candidate.path.toLowerCase();
    if (tried.has(key) || !deps.exists(candidate.path)) continue;
    tried.add(key);
    let version: string;
    try { version = (await deps.run(candidate.path, VERSION_ARGS, 10_000)).trim(); }
    catch { continue; }
    const major = Number.parseInt(version, 10);
    if (Number.isFinite(major) && major >= 7) return { available: true, path: candidate.path, version, source: candidate.source };
    tooOld ??= version;
  }
  return { available: false, reason: tooOld ? `PowerShell ${tooOld} was found, but DUDE needs PowerShell 7 or newer. Install it with: winget install --id Microsoft.PowerShell` : NOT_FOUND };
}

let cached: Promise<PwshStatus> | null = null;
export function pwshStatus(refresh = false): Promise<PwshStatus> {
  if (refresh || !cached) cached = detectPwsh();
  return cached;
}

/** Fixed, reviewed scripts. Arguments never reach a script except through `$DudeArgs`. */
export const FIXED_SCRIPTS: Record<string, string> = {
  'pwsh.echo': '$DudeArgs',
  'net.neighbors': 'Get-NetNeighbor | Select-Object IPAddress,LinkLayerAddress,State,InterfaceAlias,AddressFamily',
  'net.routes': 'Get-NetRoute | Select-Object DestinationPrefix,NextHop,RouteMetric,InterfaceAlias,AddressFamily',
  'net.interfaces': 'Get-NetIPConfiguration | Select-Object InterfaceAlias,InterfaceDescription,IPv4Address,IPv6Address,IPv4DefaultGateway,DNSServer',
};

export function buildFixedScriptCommand(name: string, args: unknown): string {
  if (!Object.prototype.hasOwnProperty.call(FIXED_SCRIPTS, name)) throw new Error('Unknown PowerShell script.');
  const script = FIXED_SCRIPTS[name];
  const json = JSON.stringify(args ?? null);
  const encoded = Buffer.from(json, 'utf8').toString('base64');
  return `[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; ` +
    `$DudeArgs = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')) | ConvertFrom-Json; ` +
    `@(${script}) | ConvertTo-Json -Compress -Depth 8`;
}

export async function runFixedScript(name: string, args: unknown, signal: AbortSignal, timeoutMs = 30_000): Promise<unknown> {
  const command = buildFixedScriptCommand(name, args);
  const status = await pwshStatus();
  if (!status.available || !status.path) throw new Error(status.reason ?? NOT_FOUND);
  const output = await new Promise<string>((resolve, reject) => {
    const child = spawn(status.path!, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')],
      { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'], signal });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (data: Buffer) => { stdout += data.toString('utf8'); if (stdout.length > 2_000_000) child.kill(); });
    child.stderr.on('data', (data: Buffer) => { stderr += data.toString('utf8'); if (stderr.length > 10_000) child.kill(); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `PowerShell script exited ${code}.`));
    });
  });
  const text = output.trim();
  return text ? JSON.parse(text) as unknown : null;
}
