import { loadDoc, saveDoc } from './device-store/device-docs';
import { isDeviceStoreReady, storeCall } from './device-store/store-client';
import { app, ipcMain, type WebContents } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { ConfirmationStore } from './mutation-core';
import { isElevated } from './elevation-bridge';
import { detectPwsh } from './sys-pwsh';
import type { PwshStatus } from "@dude/contracts/system/system-types";
import { analyzePowerShellScript, type PowerShellCmdletDefinition, type PowerShellParameterDefinition } from "@dude/contracts/shared/system/powershell-builder";
import type { PowerShellHistoryEntry, PowerShellRunEvent, PowerShellRunPreview } from "@dude/contracts/system/powershell-types";

/**
 * PowerShell Builder workbench (M612): the desktop side of the `powershell-builder` tool. Running a script is
 * arbitrary code execution, so it follows DUDE_PRD.md §5.2.1: `preview` (exact script, SHA-256, cwd, elevation,
 * static warnings) -> `confirm` (single-use ~60 s token bound to the requesting window and the script digest, via
 * `ConfirmationStore`) -> `run`. Nothing is rerun from history; history keeps metadata only (never script text or
 * output), so restoring an entry cannot execute anything.
 *
 * Transport: the script never touches a command line or a temp file. pwsh reads a one-line ASCII bootstrap from stdin
 * (`-Command -`) that base64-decodes the UTF-8 script and dot-sources it as a script block, which avoids the 32 K
 * command-line limit, console code-page mangling of non-ASCII text, and execution-policy checks on temp `.ps1` files.
 */

const TOKEN_TTL_MS = 60_000;
const PLAN_TTL_MS = 15 * 60_000;
const MAX_PLANS = 24;
const MAX_HISTORY = 100;
const LEGACY_STATE_DOC = 'legacy-import-state';
const MAX_SCRIPT_BYTES = 1_000_000;
const MAX_OUTPUT_BYTES = 2_000_000;
const MAX_STREAM_CHUNK_BYTES = 64_000;
const MAX_RUN_MS = 5 * 60_000;
const CATALOG_TIMEOUT_MS = 180_000;
const CATALOG_SCRIPT = `$ErrorActionPreference = 'Stop'
$common = @([System.Management.Automation.Cmdlet]::CommonParameters) + @([System.Management.Automation.Cmdlet]::OptionalCommonParameters)
function Get-DudeType($t) {
  if ($t -eq [string]) { 'string' }
  elseif ($t -eq [bool]) { 'boolean' }
  elseif ($t -eq [System.Management.Automation.SwitchParameter]) { 'switch' }
  elseif ($t -in @([int], [long], [double], [decimal], [single], [int16], [uint16], [uint32], [uint64], [byte])) { 'number' }
  elseif ($t -eq [string[]]) { 'string[]' }
  elseif ($t -in @([int[]], [long[]], [double[]], [uint32[]])) { 'number[]' }
  elseif ($t -eq [hashtable] -or $t -eq [System.Collections.IDictionary]) { 'hashtable' }
  elseif ($t.IsEnum) { 'string' }
  else { 'unknown' }
}
$items = Get-Command -CommandType Cmdlet | ForEach-Object {
  $command = Get-Command -Name $_.Name -CommandType Cmdlet -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $command) { return }
  $sets = @($command.ParameterSets | ForEach-Object {
    $set = $_
    [pscustomobject]@{ name = $set.Name; parameters = @($set.Parameters | Where-Object { $common -notcontains $_.Name } | ForEach-Object {
      $parameter = $_
      $values = @($parameter.Attributes | Where-Object { $_ -is [System.Management.Automation.ValidateSetAttribute] } | ForEach-Object { $_.ValidValues } | Select-Object -First 64)
      if ($values.Count -eq 0 -and $parameter.ParameterType.IsEnum) { $values = @([Enum]::GetNames($parameter.ParameterType)) }
      [pscustomobject]@{ name = $parameter.Name; type = (Get-DudeType $parameter.ParameterType); mandatory = [bool]$parameter.IsMandatory; validateSet = @($values | ForEach-Object { [string]$_ }) }
    }) }
  })
  [pscustomobject]@{ name = $command.Name; parameterSets = $sets }
}
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
ConvertTo-Json -InputObject @($items) -Depth 8 -Compress`;

export type { PowerShellHistoryEntry, PowerShellRunEvent, PowerShellRunPreview };
interface StoredPreview {
  readonly id: string;
  readonly ownerId: number;
  readonly digest: string;
  readonly expires: number;
  readonly script: string;
  readonly cwd: string;
  readonly elevated: boolean;
}
interface RunJob { readonly ownerId: number; readonly child: ChildProcess; timer: NodeJS.Timeout; bytes: number; truncated: boolean; timedOut: boolean; cancelled: boolean; startedAt: string; digest: string; cwd: string; elevated: boolean }

export interface PowerShellWorkbenchDeps {
  readonly userData: () => string;
  readonly home: () => string;
  readonly status: () => Promise<PwshStatus>;
  readonly elevated: () => Promise<boolean>;
  readonly spawn: typeof spawn;
  readonly killTree: (child: ChildProcess) => void;
  readonly now: () => number;
  readonly appendHistory?: (entry: PowerShellHistoryEntry) => Promise<void>;
}

function defaultKillTree(child: ChildProcess): void {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, shell: false, stdio: 'ignore' });
    killer.on('error', () => child.kill());
    killer.unref();
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

const deps: PowerShellWorkbenchDeps = {
  userData: () => app.getPath('userData'), home: () => app.getPath('home'), status: () => detectPwsh(), elevated: isElevated,
  spawn, killTree: defaultKillTree, now: Date.now,
};

const previews = new ConfirmationStore<StoredPreview>({ tokenTtlMs: TOKEN_TTL_MS, maxPlans: MAX_PLANS, maxTokens: MAX_PLANS });
const runs = new Map<string, RunJob>();
const activeContents = new Map<number, WebContents>();
const watchedOwners = new Set<number>();
const pendingFinishes = new Set<Promise<void>>();
let historyQueue: Promise<void> = Promise.resolve();

function digest(script: string): string { return createHash('sha256').update(script, 'utf8').digest('hex'); }
function catalogDirectory(): string { return join(deps.userData(), 'powershell-catalog'); }
function catalogFile(version: string): string { return join(catalogDirectory(), `${version.replace(/[^0-9A-Za-z.-]/g, '_')}.json`); }
function historyFile(): string { return join(deps.userData(), 'powershell-history.json'); }

function locatePwsh(status: PwshStatus): string {
  if (!status.available || !status.path) throw new Error(status.reason ?? 'PowerShell 7 is unavailable.');
  return status.path;
}

function encodedCommand(script: string): string { return Buffer.from(script, 'utf16le').toString('base64'); }

/** One ASCII line for pwsh's stdin; decodes and dot-sources the user's script. Exit codes and `exit` pass through. */
export function bootstrapFor(script: string): string {
  const payload = Buffer.from(script, 'utf8').toString('base64');
  return `[Console]::OutputEncoding=[Text.UTF8Encoding]::new(); $PSStyle.OutputRendering='PlainText'; $ProgressPreference='SilentlyContinue'; . ([scriptblock]::Create([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}'))))\n`;
}

function runCapture(file: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = deps.spawn(file, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => deps.killTree(child), timeoutMs);
    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); if (Buffer.byteLength(stdout, 'utf8') > MAX_OUTPUT_BYTES * 20) deps.killTree(child); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); if (Buffer.byteLength(stderr, 'utf8') > 64_000) deps.killTree(child); });
    child.once('error', (error) => { clearTimeout(timer); reject(error); });
    child.once('close', (code) => { clearTimeout(timer); if (code === 0) resolve(stdout); else reject(new Error(stderr.trim() || `PowerShell exited ${code}.`)); });
  });
}

/** Drops empty ValidateSet arrays (they would reject every value) and keeps only well-formed entries. */
export function normalizeCatalog(data: unknown): PowerShellCmdletDefinition[] {
  if (!Array.isArray(data)) throw new Error('PowerShell returned an invalid cmdlet catalog.');
  const commands: PowerShellCmdletDefinition[] = [];
  for (const entry of data as PowerShellCmdletDefinition[]) {
    if (!entry || typeof entry.name !== 'string' || !Array.isArray(entry.parameterSets)) continue;
    commands.push({
      name: entry.name,
      parameterSets: entry.parameterSets.map((set) => ({
        name: String(set.name),
        parameters: (set.parameters ?? []).map((parameter: PowerShellParameterDefinition) => ({
          name: parameter.name, type: parameter.type, mandatory: parameter.mandatory === true,
          ...(Array.isArray(parameter.validateSet) && parameter.validateSet.length > 0 ? { validateSet: parameter.validateSet } : {}),
        })),
      })),
    });
  }
  return commands;
}

async function readCatalogCache(version: string): Promise<PowerShellCmdletDefinition[] | null> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(catalogFile(version), 'utf8'));
    return Array.isArray(parsed) ? parsed as PowerShellCmdletDefinition[] : null;
  } catch { return null; }
}

export async function getPowerShellCatalog(refresh = false): Promise<{ version: string; commands: PowerShellCmdletDefinition[] }> {
  const status = await deps.status();
  const file = locatePwsh(status);
  const version = status.version ?? 'unknown';
  if (!refresh) {
    const cached = await readCatalogCache(version);
    if (cached) return { version, commands: cached };
  }
  const stdout = await runCapture(file, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', encodedCommand(CATALOG_SCRIPT)], CATALOG_TIMEOUT_MS);
  const commands = normalizeCatalog(JSON.parse(stdout));
  await fs.mkdir(catalogDirectory(), { recursive: true });
  await fs.writeFile(catalogFile(version), JSON.stringify(commands), 'utf8');
  return { version, commands };
}

async function readHistory(): Promise<PowerShellHistoryEntry[]> {
  if (isDeviceStoreReady()) {
    try { return await storeCall('powershell.list', {}) as PowerShellHistoryEntry[]; } catch { /* fall back to the file */ }
  }
  return readHistoryFile();
}

async function readHistoryFile(): Promise<PowerShellHistoryEntry[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(historyFile(), 'utf8'));
    return Array.isArray(parsed) ? parsed as PowerShellHistoryEntry[] : [];
  } catch { return []; }
}

async function appendHistory(entry: PowerShellHistoryEntry): Promise<void> {
  const write = async () => {
    if (isDeviceStoreReady()) {
      try { await storeCall('powershell.add', { entry: { ...entry } }); return; } catch { /* fall back to the file */ }
    }
    const entries = await readHistoryFile();
    entries.unshift(entry);
    await fs.mkdir(deps.userData(), { recursive: true });
    await fs.writeFile(historyFile(), JSON.stringify(entries.slice(0, MAX_HISTORY)), 'utf8');
  };
  // Serialised so two runs finishing together cannot overwrite each other's entry.
  historyQueue = historyQueue.then(write, write);
  await historyQueue;
}

/**
 * One-shot import of `powershell-history.json` into the store on the first healthy start. The file is left
 * in place (the legacy import moves it later); a `legacy-import-state` doc flag prevents a second import,
 * so history cleared in the store never comes back.
 */
export async function importLegacyPowerShellHistory(): Promise<number> {
  if (!isDeviceStoreReady()) return 0;
  const state = await loadDoc<Record<string, unknown>>(LEGACY_STATE_DOC, (raw) => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null), {});
  if (state['powershellHistory'] === true) return 0;
  const entries = (await readHistoryFile()).filter((entry) => entry && typeof entry.id === 'string' && entry.id.length > 0);
  for (const entry of entries.slice(0, MAX_HISTORY).reverse()) await storeCall('powershell.add', { entry: { ...entry } });
  await saveDoc(LEGACY_STATE_DOC, { ...state, powershellHistory: true });
  return entries.length;
}

export async function listPowerShellHistory(): Promise<PowerShellHistoryEntry[]> { await historyQueue.catch(() => undefined); return readHistory(); }

export async function clearPowerShellHistory(): Promise<void> {
  await historyQueue.catch(() => undefined);
  if (isDeviceStoreReady()) {
    try { await storeCall('powershell.clear', {}); } catch { /* the file is cleared below regardless */ }
  }
  await fs.rm(historyFile(), { force: true });
}

export async function previewPowerShellRun(owner: Pick<WebContents, 'id'>, script: unknown, requestedCwd: unknown): Promise<PowerShellRunPreview> {
  previews.sweep();
  if (typeof script !== 'string' || script.trim().length === 0 || Buffer.byteLength(script, 'utf8') > MAX_SCRIPT_BYTES || script.includes('\0')) throw new Error('Enter a non-empty script under 1 MB.');
  const cwd = requestedCwd === undefined || requestedCwd === '' ? deps.home() : requestedCwd; // blank = the user's home folder
  if (typeof cwd !== 'string' || !isAbsolute(cwd) || cwd.includes('\0') || cwd.length > 32767) throw new Error('Choose an absolute working directory.');
  const stat = await fs.stat(cwd).catch(() => null);
  if (!stat?.isDirectory()) throw new Error('The working directory does not exist.');
  const status = await deps.status();
  locatePwsh(status);
  const elevated = await deps.elevated();
  const id = randomUUID();
  const scriptDigest = digest(script);
  const expires = deps.now() + PLAN_TTL_MS;
  previews.addPlan({ id, ownerId: owner.id, digest: scriptDigest, expires, script, cwd, elevated });
  return { previewId: id, script, sha256: scriptDigest, cwd, elevated, warnings: analyzePowerShellScript(script), expiresAt: new Date(expires).toISOString() };
}

export function discardPowerShellPreview(ownerId: number, previewId: string): boolean {
  const plan = previews.getPlan(previewId);
  return !!plan && plan.ownerId === ownerId && previews.deletePlan(previewId);
}

export function confirmPowerShellRun(ownerId: number, previewId: string): { token: string; expiresAt: string } {
  const result = previews.issueToken(ownerId, previewId);
  if (!result.ok) throw new Error(result.error);
  return { token: result.token, expiresAt: result.expiresAt };
}

function send(ownerId: number, event: PowerShellRunEvent): void {
  const contents = activeContents.get(ownerId);
  if (contents && !contents.isDestroyed()) contents.send('dude:powershell:event', event);
}

async function finishRun(runId: string, code: number | null, error?: string): Promise<void> {
  const job = runs.get(runId);
  if (!job) return;
  clearTimeout(job.timer);
  runs.delete(runId);
  const completedAt = new Date(deps.now()).toISOString();
  const entry: PowerShellHistoryEntry = {
    id: runId, sha256: job.digest, cwd: job.cwd, elevated: job.elevated, startedAt: job.startedAt,
    completedAt, exitCode: code, timedOut: job.timedOut, cancelled: job.cancelled, truncated: job.truncated,
  };
  try { await (deps.appendHistory ?? appendHistory)(entry); } catch { /* history is best-effort; never block the completion event */ }
  send(job.ownerId, { runId, stream: 'complete', exitCode: code, timedOut: job.timedOut, cancelled: job.cancelled, truncated: job.truncated, ...(error ? { error } : {}) });
}

function trackFinish(runId: string, code: number | null, error?: string): void {
  const pending = finishRun(runId, code, error).finally(() => pendingFinishes.delete(pending));
  pendingFinishes.add(pending);
}

export async function startPowerShellRun(owner: Pick<WebContents, 'id'>, previewId: string, token: unknown, timeoutMs = MAX_RUN_MS): Promise<{ runId: string }> {
  const plan = previews.consume(owner.id, previewId, token);
  previews.deletePlan(previewId);
  if (digest(plan.script) !== plan.digest) throw new Error('The script changed after preview. Review it again.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > MAX_RUN_MS) throw new Error('Timeout must be between 1 second and 5 minutes.');
  const status = await deps.status();
  const file = locatePwsh(status);
  const runId = randomUUID();
  const child = deps.spawn(file, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', '-'], {
    cwd: plan.cwd, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'],
  });
  const job: RunJob = {
    ownerId: owner.id, child, bytes: 0, truncated: false, timedOut: false, cancelled: false, startedAt: new Date(deps.now()).toISOString(),
    digest: plan.digest, cwd: plan.cwd, elevated: plan.elevated,
    timer: setTimeout(() => { const current = runs.get(runId); if (current) { current.timedOut = true; deps.killTree(child); } }, timeoutMs),
  };
  runs.set(runId, job);
  const contents = owner as WebContents;
  activeContents.set(owner.id, contents);
  if (!watchedOwners.has(owner.id) && typeof contents.once === 'function') {
    watchedOwners.add(owner.id);
    contents.once('destroyed', () => { watchedOwners.delete(owner.id); cancelPowerShellOwner(owner.id); });
  }
  const handleChunk = (stream: 'stdout' | 'stderr', chunk: Buffer) => {
    const remaining = MAX_OUTPUT_BYTES - job.bytes;
    if (remaining <= 0) { job.truncated = true; return; }
    const bytes = chunk.subarray(0, Math.min(remaining, MAX_STREAM_CHUNK_BYTES));
    job.bytes += bytes.length;
    if (bytes.length < chunk.length || job.bytes >= MAX_OUTPUT_BYTES) job.truncated = true;
    send(owner.id, { runId, stream, text: bytes.toString('utf8') });
    if (job.truncated) deps.killTree(child);
  };
  child.stdout?.on('data', (chunk: Buffer) => handleChunk('stdout', chunk));
  child.stderr?.on('data', (chunk: Buffer) => handleChunk('stderr', chunk));
  child.stdin?.on('error', () => undefined);
  child.once('error', (error) => trackFinish(runId, null, error.message));
  child.once('close', (code) => trackFinish(runId, code));
  child.stdin?.end(bootstrapFor(plan.script), 'utf8');
  return { runId };
}

export function cancelPowerShellRun(ownerId: number, runId: string): boolean {
  const job = runs.get(runId);
  if (!job || job.ownerId !== ownerId) return false;
  job.cancelled = true;
  deps.killTree(job.child);
  return true;
}

export function cancelPowerShellOwner(ownerId: number): void {
  for (const [runId, job] of runs) if (job.ownerId === ownerId) cancelPowerShellRun(ownerId, runId);
  activeContents.delete(ownerId);
}

/** App quit: kill every running script's process tree. */
export function cancelAllPowerShellRuns(): void {
  for (const job of runs.values()) { job.cancelled = true; deps.killTree(job.child); }
}

export function registerPowerShellWorkbenchHandlers(): void {
  ipcMain.handle('dude:powershell:catalog', (_event, refresh: unknown) => getPowerShellCatalog(refresh === true));
  ipcMain.handle('dude:powershell:preview', (event, script: unknown, cwd: unknown) => previewPowerShellRun(event.sender, script, cwd));
  ipcMain.handle('dude:powershell:discard', (event, previewId: unknown) => typeof previewId === 'string' && discardPowerShellPreview(event.sender.id, previewId));
  ipcMain.handle('dude:powershell:confirm', (event, previewId: unknown) => {
    if (typeof previewId !== 'string') throw new Error('Invalid preview.');
    return confirmPowerShellRun(event.sender.id, previewId);
  });
  ipcMain.handle('dude:powershell:run', (event, previewId: unknown, token: unknown, timeoutMs: unknown) => {
    if (typeof previewId !== 'string') throw new Error('Invalid preview.');
    return startPowerShellRun(event.sender, previewId, token, timeoutMs === undefined ? MAX_RUN_MS : timeoutMs as number);
  });
  ipcMain.handle('dude:powershell:cancel', (event, runId: unknown) => typeof runId === 'string' && cancelPowerShellRun(event.sender.id, runId));
  ipcMain.handle('dude:powershell:history', () => listPowerShellHistory());
  ipcMain.handle('dude:powershell:clearHistory', () => clearPowerShellHistory());
}

export function setPowerShellWorkbenchDepsForTesting(overrides: Partial<PowerShellWorkbenchDeps> | null): void {
  if (!overrides) Object.assign(deps, { userData: () => app.getPath('userData'), home: () => app.getPath('home'), status: () => detectPwsh(), elevated: isElevated, spawn, killTree: defaultKillTree, now: Date.now, appendHistory: undefined });
  else Object.assign(deps, overrides);
}

/** Test hook: resolves once every finished run has persisted its history entry. */
export async function settlePowerShellRunsForTesting(): Promise<void> {
  while (pendingFinishes.size) await Promise.all([...pendingFinishes]);
}

export function resetPowerShellWorkbenchForTesting(): void {
  for (const [id, job] of runs) { clearTimeout(job.timer); deps.killTree(job.child); runs.delete(id); }
  for (const owner of activeContents.keys()) activeContents.delete(owner);
  watchedOwners.clear();
}
