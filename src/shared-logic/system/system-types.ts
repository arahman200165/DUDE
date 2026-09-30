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
export const SYS_READ_METHODS = [
  'helper.info', 'process.list', 'process.detail', 'process.modules', 'process.threads', 'process.handles',
  'file.version', 'file.signature', 'svc.list', 'svc.config', 'evt.channels', 'evt.query', 'evt.queryFile', 'net.tcp', 'net.udp', 'reg.enumKey', 'reg.getValues', 'fs.probeDirs', 'reg.search', 'reg.export', 'pe.apisetmap',
] as const;
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

// ---- process.detail / modules / threads / handles (Milestone 595) ------------------------------

/** Identifies one process instance: PID plus the `startKey` from `process.list`, so a reused PID never matches. */
export interface ProcessRef {
  readonly pid: number;
  /** Decimal FILETIME creation time (`ProcessSummary.startKey`). */
  readonly startKey: string;
}

export type ProcessIntegrityLevel = 'untrusted' | 'low' | 'medium' | 'medium-plus' | 'high' | 'system' | 'protected';
export type ProcessPriorityClass = 'idle' | 'below-normal' | 'normal' | 'above-normal' | 'high' | 'realtime';

export interface ProcessDetail {
  readonly pid: number;
  readonly startKey: string;
  readonly imagePath: string | null;
  readonly commandLine: string | null;
  readonly currentDirectory: string | null;
  readonly environment: Readonly<Record<string, string>> | null;
  readonly user: { readonly name: string; readonly domain: string; readonly sid: string } | null;
  readonly integrityLevel: ProcessIntegrityLevel | null;
  readonly elevated: boolean | null;
  readonly wow64: boolean | null;
  readonly priorityClass: ProcessPriorityClass | null;
  /** '0x'-prefixed lower-case hex. */
  readonly affinityMask: string | null;
  readonly systemAffinityMask: string | null;
  /** A field that could not be read is null and has an entry here (field name to Windows message). */
  readonly errors: Readonly<Record<string, string>>;
}

export interface ProcessModule {
  readonly name: string;
  readonly path: string;
  /** '0x'-prefixed lower-case hex. */
  readonly baseAddress: string;
  readonly size: number;
}

export interface ProcessModulesResult {
  readonly modules: readonly ProcessModule[];
}

export interface ProcessThread {
  readonly tid: number;
  /** '0x'-prefixed lower-case hex. */
  readonly startAddress: string;
  readonly priority: number;
  readonly basePriority: number;
  /** KTHREAD_STATE name, e.g. 'Running', 'Waiting'. */
  readonly state: string;
  /** KWAIT_REASON name while `state` is 'Waiting', otherwise ''. */
  readonly waitReason: string;
  readonly kernelTime100ns: number;
  readonly userTime100ns: number;
  readonly createTimeMs: number;
}

export interface ProcessThreadsResult {
  readonly threads: readonly ProcessThread[];
}

export interface ProcessHandle {
  /** '0x'-prefixed lower-case hex. */
  readonly handle: string;
  readonly type: string;
  readonly name: string | null;
}

export interface ProcessHandlesResult {
  readonly handles: readonly ProcessHandle[];
  /** True when the ~3 s budget ran out before every handle was examined. */
  readonly truncated: boolean;
  readonly note?: string;
}

// ---- file.version / file.signature (Milestone 595) ---------------------------------------------

export interface FileVersionResult {
  readonly fixed: { readonly fileVersion: string; readonly productVersion: string } | null;
  /** CompanyName, FileDescription, FileVersion, ProductName, ProductVersion, OriginalFilename, InternalName, LegalCopyright (those present). */
  readonly strings: Readonly<Record<string, string>>;
}

export interface FileSignatureResult {
  readonly status: 'signed' | 'catalog-signed' | 'unsigned' | 'invalid';
  readonly signer?: string;
  readonly message?: string;
}

// ---- svc.list (Milestone 595) -------------------------------------------------------------------

export type ServiceState = 'stopped' | 'start-pending' | 'stop-pending' | 'running' | 'continue-pending' | 'pause-pending' | 'paused';
export type ServiceType = 'own-process' | 'share-process' | 'other';

export interface ServiceSummary {
  readonly name: string;
  readonly displayName: string;
  /** 0 when the service is not running. */
  readonly pid: number;
  readonly state: ServiceState;
  readonly type: ServiceType;
}

export interface ServiceListResult {
  readonly services: readonly ServiceSummary[];
}

export type ServiceStartType = 'boot' | 'system' | 'auto' | 'auto-delayed' | 'manual' | 'disabled';

export interface ServiceConfig {
  readonly name: string;
  readonly displayName: string;
  readonly description: string;
  readonly state: ServiceState;
  readonly type: ServiceType;
  readonly startType: ServiceStartType;
  readonly pid: number;
  /** The service's binary/command line (ImagePath). */
  readonly binaryPath: string;
  /** The account it runs as (e.g. LocalSystem, NT AUTHORITY\NetworkService). */
  readonly account: string;
  /** True when the service can accept a pause/continue while running. */
  readonly canPauseContinue: boolean;
  /** Whether the service is actually a kernel/filesystem driver. */
  readonly isDriver: boolean;
  /** Service names this service depends on (must start first). */
  readonly dependencies: readonly string[];
  /** Service names that depend on this one (stopping this stops them too). */
  readonly dependents: readonly string[];
}

export interface ServiceConfigResult {
  readonly config: ServiceConfig;
}

// ---- Windows Event Log (evt.channels / evt.query / evt.queryFile) -------------------------------

export interface EventChannel {
  readonly name: string;
  /** classic Application/System/Security/Setup, or a modern Operational/Analytic/Debug channel. */
  readonly type: 'admin' | 'operational' | 'analytic' | 'debug' | 'classic';
  readonly enabled: boolean;
  /** Records currently in the channel, when known. */
  readonly recordCount?: number;
}

export interface EventChannelsResult {
  readonly channels: readonly EventChannel[];
}

export type EventLevel = 'critical' | 'error' | 'warning' | 'information' | 'verbose' | 'unknown';

export interface EventRecord {
  /** EventRecordID within the channel; a monotonically increasing cursor for incremental polling. */
  readonly recordId: string;
  readonly timeCreated: string;
  readonly level: EventLevel;
  readonly providerName: string;
  readonly eventId: number;
  readonly task: string;
  readonly opcode: string;
  readonly keywords: readonly string[];
  readonly channel: string;
  readonly computer: string;
  readonly userSid: string | null;
  readonly processId: number | null;
  readonly threadId: number | null;
  /** Correlation ActivityID/RelatedActivityID (GUIDs) when present. */
  readonly activityId: string | null;
  readonly relatedActivityId: string | null;
  /** The rendered, human-readable message (EvtFormatMessage), or '' if it could not be rendered. */
  readonly message: string;
  /** The raw event XML. */
  readonly xml: string;
}

export interface EventQueryParams {
  /** A live channel name (e.g. 'System'); mutually exclusive with a file query. */
  readonly channel: string;
  /** An EvtQuery XPath/structured-XML query ('*' for everything). */
  readonly xpath?: string;
  /** Newest-first (default true). */
  readonly reverse?: boolean;
  /** Only records with EventRecordID greater than this (incremental "live tail"). */
  readonly afterRecordId?: string;
  /** Max records to return (helper caps, e.g. 1000). */
  readonly limit?: number;
}

export interface EventQueryFileParams {
  /** Absolute path to a .evtx file. */
  readonly path: string;
  readonly xpath?: string;
  readonly reverse?: boolean;
  readonly limit?: number;
}

export interface EventQueryResult {
  readonly events: readonly EventRecord[];
  readonly truncated: boolean;
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

// ---- reg.search (bounded, non-recursive-safe registry search) ----------------------------------

export interface RegistrySearchParams {
  readonly hive: RegistryHive;
  /** Subkey to search under ('' = hive root). */
  readonly path: string;
  readonly view: RegistryView;
  /** The search text (or regex source when `regex` is set). */
  readonly query: string;
  readonly regex?: boolean;
  readonly caseSensitive?: boolean;
  /** What to match against. At least one should be true; the helper defaults to all three. */
  readonly matchKeys?: boolean;
  readonly matchValueNames?: boolean;
  readonly matchValueData?: boolean;
  /** Stop after this many matches (helper caps it, e.g. 5000). */
  readonly limit?: number;
  /** Stop after roughly this many milliseconds of scanning (helper caps it, e.g. 10000). */
  readonly timeBudgetMs?: number;
}

export interface RegistrySearchMatch {
  /** Full path of the key the match is in, e.g. `HKLM\SOFTWARE\Foo`. */
  readonly keyPath: string;
  /** 'key' = the key name matched; 'value-name'/'value-data' = a value under the key matched. */
  readonly matchIn: 'key' | 'value-name' | 'value-data';
  /** The value name when matchIn is a value ('' = default value). */
  readonly valueName?: string;
  readonly valueType?: RegistryValueType;
  /** A short preview of the matched value's data. */
  readonly preview?: string;
}

export interface RegistrySearchResult {
  readonly matches: readonly RegistrySearchMatch[];
  /** True when the scan stopped at the match limit or time budget before finishing. */
  readonly truncated: boolean;
  readonly keysScanned: number;
}

// ---- reg.export (REGEDIT5 .reg text) -----------------------------------------------------------

export interface RegistryExportParams {
  readonly hive: RegistryHive;
  readonly path: string;
  readonly view: RegistryView;
  /** Include all descendant keys (default true). */
  readonly recursive?: boolean;
}

export interface RegistryExportResult {
  /** UTF-16 REGEDIT5 `.reg` text (as a UTF-8 string here; the caller writes the file). */
  readonly text: string;
  readonly keysExported: number;
}

export interface ApiSetMapResult { readonly version: number; readonly contracts: Readonly<Record<string, readonly string[]>>; }

// ---- method → params/result map ----------------------------------------------------------------

export interface SysMethodMap {
  'helper.info': { params: Record<string, never>; result: HelperInfo };
  'pe.apisetmap': { params: Record<string, never>; result: ApiSetMapResult };
  'process.list': { params: Record<string, never>; result: ProcessListResult };
  'process.detail': { params: ProcessRef; result: ProcessDetail };
  'process.modules': { params: ProcessRef; result: ProcessModulesResult };
  'process.threads': { params: { pid: number }; result: ProcessThreadsResult };
  'process.handles': { params: ProcessRef; result: ProcessHandlesResult };
  'file.version': { params: { path: string }; result: FileVersionResult };
  'file.signature': { params: { path: string }; result: FileSignatureResult };
  'svc.list': { params: Record<string, never>; result: ServiceListResult };
  'svc.config': { params: { name: string }; result: ServiceConfigResult };
  'evt.channels': { params: Record<string, never>; result: EventChannelsResult };
  'evt.query': { params: EventQueryParams; result: EventQueryResult };
  'evt.queryFile': { params: EventQueryFileParams; result: EventQueryResult };
  'net.tcp': { params: Record<string, never>; result: SocketTableResult };
  'net.udp': { params: Record<string, never>; result: SocketTableResult };
  'reg.enumKey': { params: RegistryKeyParams; result: RegistryEnumResult };
  'reg.getValues': { params: RegistryKeyParams; result: RegistryValuesResult };
  'fs.probeDirs': { params: ProbeDirsParams; result: ProbeDirsResult };
  'reg.search': { params: RegistrySearchParams; result: RegistrySearchResult };
  'reg.export': { params: RegistryExportParams; result: RegistryExportResult };
}

// ---- fs.probeDirs (PATH directory probe for the PATH Editor & Conflict Detector) ----------------

export interface ProbeDirsParams {
  /** Absolute directory paths to probe (already %VAR%-expanded by the caller). */
  readonly dirs: readonly string[];
  /**
   * Lower-case, dot-prefixed executable extensions from PATHEXT (e.g. ['.com', '.exe', '.bat']).
   * When present, each dir's `executables` lists only entries whose extension is in this set.
   */
  readonly extensions?: readonly string[];
}

export interface ProbeDirEntry {
  readonly dir: string;
  readonly exists: boolean;
  readonly isDirectory: boolean;
  /** File names (not full paths) in the directory whose extension is in `extensions`; capped. */
  readonly executables: readonly string[];
  /** Set when the directory could not be read (e.g. access denied); `exists` reflects what is known. */
  readonly error?: string;
}

export interface ProbeDirsResult {
  readonly dirs: readonly ProbeDirEntry[];
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
