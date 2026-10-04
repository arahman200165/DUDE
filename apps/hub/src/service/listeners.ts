import type { ExecFn } from './common.js';

/**
 * Native-listener audit (PD-068). The Device Agent speaks over a named pipe and must never listen on a TCP port at all; the desktop
 * app may expose its optional LAN collaboration server (a deliberate, user-started exception). Everything goes through the injectable
 * `ExecFn` (`netstat`, `tasklist`) and is a no-op off Windows.
 */
export const AGENT_IMAGE = 'dude-agent.exe';
export const DESKTOP_IMAGE = 'dude.exe';

export type ListenerScope = 'loopback' | 'any' | 'specific';
export interface TcpListener { pid: number; address: string; port: number; scope: ListenerScope }

function scopeOf(address: string): ListenerScope {
  const a = address.toLowerCase();
  if (a === '0.0.0.0' || a === '::' || a === '*') return 'any';
  if (a === '::1' || /^127\./.test(a) || a === '::ffff:127.0.0.1') return 'loopback';
  return 'specific';
}

function splitEndpoint(text: string): { address: string; port: number } | null {
  const index = text.lastIndexOf(':');
  if (index <= 0) return null;
  const port = Number(text.slice(index + 1));
  if (!Number.isInteger(port) || port < 0 || port > 65535) return null;
  let address = text.slice(0, index);
  if (address.startsWith('[') && address.endsWith(']')) address = address.slice(1, -1);
  address = address.replace(/%.*$/, ''); // IPv6 zone id
  return address.length > 0 ? { address, port } : null;
}

/**
 * Parses `netstat -ano` rows. A listening row has a zero foreign port, which keeps this independent of the localized state text.
 * Accepts IPv4 (`0.0.0.0:135`) and bracketed IPv6 (`[::]:135`) forms.
 */
export function parseNetstatListeners(stdout: string): TcpListener[] {
  const out: TcpListener[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*TCP\s+(\S+)\s+(\S+)\s+\S+\s+(\d+)\s*$/i.exec(line);
    if (!match) continue;
    const foreign = splitEndpoint(match[2]!);
    if (foreign === null || foreign.port !== 0) continue;
    const local = splitEndpoint(match[1]!);
    if (local === null) continue;
    out.push({ pid: Number(match[3]), address: local.address, port: local.port, scope: scopeOf(local.address) });
  }
  return out;
}

/** All listening TCP sockets, IPv4 and IPv6. Null when `netstat` could not be run or answered with a failure. */
export async function listTcpListeners(exec: ExecFn): Promise<TcpListener[] | null> {
  let v4;
  try { v4 = await exec('netstat', ['-ano', '-p', 'TCP']); } catch { return null; }
  if (v4.code !== 0) return null;
  const rows = parseNetstatListeners(v4.stdout);
  try {
    const v6 = await exec('netstat', ['-ano', '-p', 'TCPv6']); // `-p TCP` lists IPv4 only on Windows
    if (v6.code === 0) rows.push(...parseNetstatListeners(v6.stdout));
  } catch { /* IPv6 not available */ }
  const seen = new Set<string>();
  return rows.filter((r) => { const key = `${r.pid}|${r.address}|${r.port}`; if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Parses `tasklist /FO CSV /NH` into pid to image name (lower-case). */
export function parseTasklist(stdout: string): Map<number, string> {
  const names = new Map<number, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^"([^"]*)","(\d+)"/.exec(line.trim());
    if (match) names.set(Number(match[2]), match[1]!.toLowerCase());
  }
  return names;
}

/** pid to image name for the requested pids. Null when `tasklist` failed or returned nothing parseable. */
export async function processNames(exec: ExecFn, pids: readonly number[]): Promise<Map<number, string> | null> {
  let result;
  try { result = await exec('tasklist', ['/FO', 'CSV', '/NH']); } catch { return null; }
  if (result.code !== 0) return null;
  const all = parseTasklist(result.stdout);
  if (all.size === 0) return null;
  const wanted = new Set(pids);
  return new Map([...all].filter(([pid]) => wanted.has(pid)));
}

export interface NativeListener { image: string; pid: number; address: string; port: number; scope: ListenerScope }

export interface NativeListenerAudit {
  applicable: boolean;
  /** Violations: any Agent TCP listener. `scope` tells loopback (still a violation) from exposed. */
  exposed: NativeListener[];
  /** Informational: a desktop-app listener on a non-loopback address (the optional LAN collaboration server). */
  desktopLan: NativeListener[];
  /** The output could not be read completely; an empty result is then not proof of absence. */
  partial: boolean;
}

/** Audits listening TCP sockets for the Device Agent (never allowed) and the desktop app (LAN exception). */
export async function auditNativeListeners(exec: ExecFn, platform: NodeJS.Platform = process.platform): Promise<NativeListenerAudit> {
  if (platform !== 'win32') return { applicable: false, exposed: [], desktopLan: [], partial: false };
  const listeners = await listTcpListeners(exec);
  if (listeners === null || listeners.length === 0) return { applicable: true, exposed: [], desktopLan: [], partial: true };
  const names = await processNames(exec, [...new Set(listeners.map((l) => l.pid))]);
  if (names === null) return { applicable: true, exposed: [], desktopLan: [], partial: true };
  const exposed: NativeListener[] = [];
  const desktopLan: NativeListener[] = [];
  for (const l of listeners) {
    const image = names.get(l.pid);
    if (image === undefined) continue;
    const entry: NativeListener = { image, pid: l.pid, address: l.address, port: l.port, scope: l.scope };
    if (image === AGENT_IMAGE) exposed.push(entry);
    else if (image === DESKTOP_IMAGE && l.scope !== 'loopback') desktopLan.push(entry);
  }
  return { applicable: true, exposed, desktopLan, partial: false };
}
