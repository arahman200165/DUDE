/**
 * Shared contract for DUDE's Windows system bridge (DUDE_PRD.md §21 Phase 31, Milestone 593).
 *
 * Three processes speak these shapes: the `windows-sys.exe` native helper (JSON lines over
 * stdin/stdout), the Electron main process (`electron/sys-*.ts`, which validates every renderer
 * request before forwarding it), and the renderer (`SystemInfoService`). Only the read methods in
 * `SYS_READ_METHODS` are renderer-callable; the helper's mutation methods are reachable only through
 * the main-process system mutation engine (Milestone 594) and never appear here.
 */

/** Renderer-callable read methods. Grows one milestone at a time; main rejects anything else. */
export const SYS_READ_METHODS = ['helper.info', 'process.list', 'net.tcp', 'net.udp', 'reg.enumKey', 'reg.getValues'] as const;
export type SysReadMethod = (typeof SYS_READ_METHODS)[number];

export type SysResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: string; /** Win32 error code when the helper reported one (5 = access denied). */ readonly code?: number };

// ---- helper.info -------------------------------------------------------------------------------

export interface HelperInfo {
  readonly version: string;
  readonly pid: number;
  /** True when the helper (and therefore DUDE) runs with an elevated token. */
  readonly elevated: boolean;
  readonly arch: 'x64' | 'arm64' | 'x86';
}

// ---- process.list ------------------------------------------------------------------------------

export interface ProcessSummary {
  readonly pid: number;
  readonly parentPid: number;
  readonly name: string;
  readonly sessionId: number;
  readonly threadCount: number;
  readonly handleCount: number;
  /** Creation time as Unix epoch milliseconds (0 for System Idle / System). */
  readonly createTimeMs: number;
  /**
   * The raw FILETIME creation time as a decimal string: exact, unlike `createTimeMs`. PID +
   * `startKey` identifies a process instance, and it is the precondition for any later process
   * mutation, so a reused PID can never be mistaken for the original.
   */
  readonly startKey: string;
  /** Cumulative CPU time in 100 ns units. */
  readonly kernelTime100ns: number;
  readonly userTime100ns: number;
  readonly workingSetBytes: number;
  readonly privateBytes: number;
  readonly basePriority: number;
}

export interface ProcessListResult {
  /** Helper-side QueryPerformanceCounter-free wall clock for the sample, Unix ms (for CPU deltas). */
  readonly sampledAtMs: number;
  readonly logicalProcessors: number;
  readonly processes: readonly ProcessSummary[];
}

// ---- net.tcp / net.udp -------------------------------------------------------------------------

export type TcpState =
  | 'CLOSED' | 'LISTEN' | 'SYN_SENT' | 'SYN_RCVD' | 'ESTABLISHED' | 'FIN_WAIT1' | 'FIN_WAIT2'
  | 'CLOSE_WAIT' | 'CLOSING' | 'LAST_ACK' | 'TIME_WAIT' | 'DELETE_TCB' | 'UNKNOWN';

export interface SocketEntry {
  readonly protocol: 'tcp' | 'udp';
  readonly family: 4 | 6;
  readonly localAddress: string;
  readonly localPort: number;
  /** TCP only. */
  readonly remoteAddress?: string;
  readonly remotePort?: number;
  readonly state?: TcpState;
  readonly pid: number;
}

export interface SocketTableResult {
  readonly entries: readonly SocketEntry[];
}

// ---- reg.enumKey / reg.getValues ---------------------------------------------------------------

export const REGISTRY_HIVES = ['HKLM', 'HKCU', 'HKCR', 'HKU', 'HKCC'] as const;
export type RegistryHive = (typeof REGISTRY_HIVES)[number];
/** WOW64 registry view: `default` = the helper's native view (64-bit on x64), `64` / `32` force one. */
export type RegistryView = 'default' | '64' | '32';

export interface RegistryKeyParams {
  readonly hive: RegistryHive;
  /** Backslash-separated subkey path under the hive; '' for the hive root. No leading/trailing '\'. */
  readonly path: string;
  readonly view: RegistryView;
}

export interface RegistrySubkey {
  readonly name: string;
  readonly subkeyCount: number;
  readonly valueCount: number;
  readonly lastWriteMs: number;
}

export interface RegistryEnumResult {
  readonly lastWriteMs: number;
  readonly subkeys: readonly RegistrySubkey[];
}

export type RegistryValueType =
  | 'REG_NONE' | 'REG_SZ' | 'REG_EXPAND_SZ' | 'REG_BINARY' | 'REG_DWORD' | 'REG_DWORD_BIG_ENDIAN'
  | 'REG_LINK' | 'REG_MULTI_SZ' | 'REG_RESOURCE_LIST' | 'REG_FULL_RESOURCE_DESCRIPTOR'
  | 'REG_RESOURCE_REQUIREMENTS_LIST' | 'REG_QWORD' | 'REG_UNKNOWN';

export interface RegistryValue {
  /** '' is the key's (Default) value. */
  readonly name: string;
  readonly type: RegistryValueType;
  /** The raw numeric REG_* type (kept for REG_UNKNOWN and exact round-trips). */
  readonly rawType: number;
  readonly byteLength: number;
  /**
   * Decoded data:
   * - REG_SZ / REG_EXPAND_SZ / REG_LINK → string (unexpanded; trailing NULs trimmed)
   * - REG_MULTI_SZ → string[]
   * - REG_DWORD / REG_DWORD_BIG_ENDIAN → number
   * - REG_QWORD → decimal string (exceeds 2^53)
   * - everything else → lower-case hex string of the raw bytes
   */
  readonly data: string | number | readonly string[];
}

export interface RegistryValuesResult {
  readonly values: readonly RegistryValue[];
}

// ---- method → params/result map ----------------------------------------------------------------

export interface SysMethodMap {
  'helper.info': { params: Record<string, never>; result: HelperInfo };
  'process.list': { params: Record<string, never>; result: ProcessListResult };
  'net.tcp': { params: Record<string, never>; result: SocketTableResult };
  'net.udp': { params: Record<string, never>; result: SocketTableResult };
  'reg.enumKey': { params: RegistryKeyParams; result: RegistryEnumResult };
  'reg.getValues': { params: RegistryKeyParams; result: RegistryValuesResult };
}

/** Streamed helper events forwarded on `dude:sys:event` (event tail, registry search — later milestones). */
export interface SysStreamEvent {
  readonly streamId: string;
  readonly type: 'data' | 'error' | 'done';
  readonly data?: unknown;
  readonly message?: string;
}

// ---- PowerShell 7 ------------------------------------------------------------------------------

export interface PwshStatus {
  readonly available: boolean;
  /** Resolved pwsh.exe path (may be the WindowsApps App Execution Alias for MSIX installs). */
  readonly path?: string;
  readonly version?: string;
  readonly source?: 'path' | 'program-files' | 'windows-apps';
  /** Why it isn't available (not found, or found but < 7). */
  readonly reason?: string;
}
