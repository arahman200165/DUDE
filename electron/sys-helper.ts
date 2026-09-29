import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { join } from 'node:path';
import { app } from 'electron';
import type { SysResult } from '../src/shared-logic/system/system-types';

/** Same resolution rule as the network helper: `resources/` when packaged, `build/` in development. */
export function windowsSysHelperPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'windows-sys.exe') : join(__dirname, '../../build/windows-sys.exe');
}

/** The slice of a child process this client uses; satisfied by `ChildProcessWithoutNullStreams` and by test fakes. */
export interface SysChild {
  readonly stdin: { write(data: string): unknown; end(): unknown; on(event: 'error', listener: (error: Error) => void): unknown };
  readonly stdout: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown };
  readonly stderr?: { on(event: 'data', listener: (chunk: Buffer | string) => void): unknown } | null;
  on(event: 'exit' | 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: NodeJS.ErrnoException) => void): unknown;
  kill(): unknown;
}
export type SysSpawn = (file: string, args: string[], options: { shell: false; windowsHide: true; stdio: ['pipe', 'pipe', 'pipe'] }) => SysChild;

const MAX_LINE_CHARS = 64 * 1024 * 1024;
const EXITED = 'Windows system helper exited.';
const NOT_INSTALLED = 'Windows system helper is not installed.';
const TIMED_OUT = 'Windows system helper timed out.';

interface Pending { readonly resolve: (value: SysResult<unknown>) => void; readonly timer: NodeJS.Timeout }

/** Long-lived `windows-sys.exe` client: one JSON request per stdin line, one response line per request. */
export class SysHelperClient {
  private child: SysChild | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly helper: string, private readonly spawnFn: SysSpawn = spawn as unknown as SysSpawn) {}

  call(method: string, params: unknown, timeoutMs = 15_000): Promise<SysResult<unknown>> {
    return new Promise((resolve) => {
      const child = this.ensure();
      if (!child) { resolve({ ok: false, error: NOT_INSTALLED }); return; }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        if (this.pending.delete(id)) resolve({ ok: false, error: TIMED_OUT });
      }, timeoutMs);
      this.pending.set(id, { resolve, timer });
      try { child.stdin.write(`${JSON.stringify({ id, method, params: params ?? {} })}\n`); }
      catch { this.settle(id, { ok: false, error: EXITED }); }
    });
  }

  close(): void {
    const child = this.child;
    this.child = null;
    this.failAll(EXITED);
    if (!child) return;
    try { child.stdin.end(); } catch { /* already closed */ }
    try { child.kill(); } catch { /* already gone */ }
  }

  private settle(id: number, result: SysResult<unknown>): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.resolve(result);
  }

  private failAll(error: string): void {
    for (const id of [...this.pending.keys()]) this.settle(id, { ok: false, error });
  }

  private ensure(): SysChild | null {
    if (this.child) return this.child;
    let child: SysChild;
    try { child = this.spawnFn(this.helper, [], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }); }
    catch { return null; }
    this.child = child;
    const gone = (error: string) => {
      if (this.child !== child) return;
      this.child = null;
      this.failAll(error);
    };
    child.stdin.on('error', () => gone(EXITED));
    child.stderr?.on('data', () => { /* drained so the helper can never block on a full pipe */ });
    const decoder = new StringDecoder('utf8');
    let partial: string[] = [];
    let partialLength = 0;
    child.stdout.on('data', (chunk) => {
      if (this.child !== child) return;
      let text = typeof chunk === 'string' ? chunk : decoder.write(chunk);
      for (let newline = text.indexOf('\n'); newline >= 0; newline = text.indexOf('\n')) {
        const line = partial.join('') + text.slice(0, newline);
        partial = []; partialLength = 0;
        text = text.slice(newline + 1);
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
    child.on('error', (error) => gone(error.code === 'ENOENT' ? NOT_INSTALLED : EXITED));
    child.on('exit', () => gone(EXITED));
    child.on('close', () => gone(EXITED));
    return child;
  }

  private onLine(line: string): void {
    if (!line.trim()) return;
    let message: { id?: unknown; ok?: unknown; result?: unknown; error?: unknown; code?: unknown };
    try { message = JSON.parse(line) as typeof message; } catch { return; }
    if (typeof message.id !== 'number' || !this.pending.has(message.id)) return;
    if (message.ok === true) this.settle(message.id, { ok: true, data: message.result });
    else {
      this.settle(message.id, {
        ok: false,
        error: typeof message.error === 'string' && message.error ? message.error : 'Windows system helper failed.',
        ...(typeof message.code === 'number' ? { code: message.code } : {}),
      });
    }
  }
}

let shared: SysHelperClient | null = null;
export function sysHelper(): SysHelperClient {
  shared ??= new SysHelperClient(windowsSysHelperPath());
  return shared;
}
export function stopSysHelper(): void {
  shared?.close();
  shared = null;
}
