import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';

/** DPAPI (CurrentUser scope) as the Device Agent sees it. Tests inject a fake. */
export interface DpapiPort {
  protect(data: Uint8Array, entropy?: Uint8Array): Promise<Uint8Array>;
  unprotect(blob: Uint8Array, entropy?: Uint8Array): Promise<Uint8Array>;
}

const HELPER = 'windows-sys.exe';
const MAX_LINE_CHARS = 64 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 15_000;
const EXITED = 'Windows system helper exited.';
const NOT_INSTALLED = 'Windows system helper is not installed.';
export const DPAPI_UNAVAILABLE = 'dpapi-unavailable';

/** `--helper <path>` / `DUDE_WINDOWS_SYS_HELPER`, else next to the executable, else the dev build output (`build/`). */
export function resolveHelperPath(
  argv: readonly string[] = process.argv,
  env: NodeJS.ProcessEnv = process.env,
  execPath: string = process.execPath,
  exists: (path: string) => boolean = existsSync,
): string | null {
  const flag = argv.indexOf('--helper');
  const explicit = (flag >= 0 ? argv[flag + 1] : undefined) ?? env['DUDE_WINDOWS_SYS_HELPER'];
  if (explicit) return exists(explicit) ? resolve(explicit) : null;
  const beside = join(dirname(execPath), HELPER);
  if (exists(beside)) return beside;
  const starts = [argv[1] ? dirname(resolve(argv[1])) : '', process.cwd()].filter(Boolean);
  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, 'build', HELPER);
      if (exists(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}

interface Pending { readonly resolve: (v: unknown) => void; readonly reject: (e: Error) => void; readonly timer: NodeJS.Timeout }
type Child = ReturnType<typeof spawn>;

/** Long-lived windows-sys.exe client: one JSON request per stdin line, one response per line. Lazily started, restarted after a crash. */
export class WindowsSysClient {
  private child: Child | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly helper: () => string | null = () => resolveHelperPath()) {}

  call(method: string, params: Record<string, unknown>, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<unknown> {
    return new Promise((res, rej) => {
      let child: Child | null;
      try { child = this.ensure(); } catch (e) { rej(e as Error); return; }
      if (!child?.stdin) { rej(new Error(NOT_INSTALLED)); return; }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) rej(new Error('Windows system helper timed out.'));
      }, timeoutMs);
      this.pending.set(id, { resolve: res, reject: rej, timer });
      try { child.stdin.write(`${JSON.stringify({ id, method, params })}\n`); }
      catch { this.settle(id, new Error(EXITED)); }
    });
  }

  close(): void {
    const child = this.child;
    this.child = null;
    this.failAll(new Error(EXITED));
    if (!child) return;
    try { child.stdin?.end(); } catch { /* already closed */ }
    try { child.kill(); } catch { /* already gone */ }
  }

  private settle(id: number, outcome: Error | { value: unknown }): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    if (outcome instanceof Error) entry.reject(outcome); else entry.resolve(outcome.value);
  }

  private failAll(error: Error): void {
    for (const id of [...this.pending.keys()]) this.settle(id, error);
  }

  private ensure(): Child | null {
    if (this.child) return this.child;
    const path = this.helper();
    if (!path) return null;
    const child = spawn(path, [], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    const gone = (message: string) => {
      if (this.child !== child) return;
      this.child = null;
      this.failAll(new Error(message));
    };
    child.stdin?.on('error', () => gone(EXITED));
    child.stderr?.on('data', () => { /* drained so the helper never blocks on a full pipe */ });
    const decoder = new StringDecoder('utf8');
    let partial: string[] = [];
    let partialLength = 0;
    child.stdout?.on('data', (chunk: Buffer | string) => {
      if (this.child !== child) return;
      let text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      for (let nl = text.indexOf('\n'); nl >= 0; nl = text.indexOf('\n')) {
        const line = partial.join('') + text.slice(0, nl);
        partial = []; partialLength = 0;
        text = text.slice(nl + 1);
        this.onLine(line);
      }
      if (text) {
        partial.push(text); partialLength += text.length;
        if (partialLength > MAX_LINE_CHARS) {
          partial = []; partialLength = 0;
          gone(EXITED);
          try { child.kill(); } catch { /* already gone */ }
        }
      }
    });
    child.on('error', (error: NodeJS.ErrnoException) => gone(error.code === 'ENOENT' ? NOT_INSTALLED : EXITED));
    child.on('exit', () => gone(EXITED));
    child.on('close', () => gone(EXITED));
    return child;
  }

  private onLine(line: string): void {
    if (!line.trim()) return;
    let m: { id?: unknown; ok?: unknown; result?: unknown; error?: unknown };
    try { m = JSON.parse(line) as typeof m; } catch { return; }
    if (typeof m.id !== 'number' || !this.pending.has(m.id)) return;
    if (m.ok === true) this.settle(m.id, { value: m.result });
    else this.settle(m.id, new Error(typeof m.error === 'string' && m.error ? m.error : 'Windows system helper failed.'));
  }
}

let shared: WindowsSysClient | null = null;
function client(): WindowsSysClient {
  shared ??= new WindowsSysClient();
  return shared;
}
/** Stops the helper; call on agent exit. */
export function stopWindowsSysClient(): void {
  shared?.close();
  shared = null;
}

const b64 = (bytes: Uint8Array): string => Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');

async function dpapiCall(method: 'dpapi.protect' | 'dpapi.unprotect', key: 'data' | 'blob', out: 'blob' | 'data', input: Uint8Array, entropy?: Uint8Array): Promise<Uint8Array> {
  if (process.platform !== 'win32') throw new Error(DPAPI_UNAVAILABLE);
  const params: Record<string, unknown> = { [key]: b64(input) };
  if (entropy) params['entropy'] = b64(entropy);
  const result = (await client().call(method, params)) as Record<string, unknown> | null;
  const value = result?.[out];
  if (typeof value !== 'string') throw new Error('Windows system helper returned a malformed DPAPI result.');
  return new Uint8Array(Buffer.from(value, 'base64'));
}

export const dpapiProtect = (bytes: Uint8Array, entropy?: Uint8Array): Promise<Uint8Array> =>
  dpapiCall('dpapi.protect', 'data', 'blob', bytes, entropy);
export const dpapiUnprotect = (blob: Uint8Array, entropy?: Uint8Array): Promise<Uint8Array> =>
  dpapiCall('dpapi.unprotect', 'blob', 'data', blob, entropy);

/** Production port backed by windows-sys.exe; throws 'dpapi-unavailable' off Windows. */
export const windowsDpapi: DpapiPort = { protect: dpapiProtect, unprotect: dpapiUnprotect };
