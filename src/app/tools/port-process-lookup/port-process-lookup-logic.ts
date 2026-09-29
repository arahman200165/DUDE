import type { SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';
import type { ProcessListResult, SocketEntry, SocketTableResult, TcpState } from '../../../shared-logic/system/system-types';

export const PORT_PROCESS_LOOKUP_TOOL_ID = 'port-process-lookup';

export interface PortRow {
  readonly protocol: 'tcp' | 'udp';
  readonly family: 4 | 6;
  readonly localAddress: string;
  readonly localPort: number;
  readonly remoteAddress?: string;
  readonly remotePort?: number;
  readonly state?: TcpState;
  readonly pid: number;
  readonly processName: string;
  /** Empty when the owning process is not in the process list (exited, or not readable). */
  readonly startKey: string;
}

export const UNKNOWN_PROCESS = 'Unknown';

/** Joins the TCP and UDP socket tables to the process list by owning PID. */
export function joinSocketsToProcesses(tcp: SocketTableResult, udp: SocketTableResult, processes: ProcessListResult): PortRow[] {
  const byPid = new Map(processes.processes.map((p) => [p.pid, p]));
  const toRow = (s: SocketEntry): PortRow => {
    const p = byPid.get(s.pid);
    return {
      protocol: s.protocol, family: s.family, localAddress: s.localAddress, localPort: s.localPort,
      ...(s.remoteAddress !== undefined ? { remoteAddress: s.remoteAddress } : {}),
      ...(s.remotePort !== undefined ? { remotePort: s.remotePort } : {}),
      ...(s.state !== undefined ? { state: s.state } : {}),
      pid: s.pid, processName: p?.name ?? UNKNOWN_PROCESS, startKey: p?.startKey ?? '',
    };
  };
  return [...tcp.entries, ...udp.entries].map(toRow);
}

/** A socket that accepts traffic: TCP in LISTEN, or any UDP endpoint. */
export function isListening(row: Pick<PortRow, 'protocol' | 'state'>): boolean {
  return row.protocol === 'udp' || row.state === 'LISTEN';
}

interface Term { readonly field: 'any' | 'port' | 'pid'; readonly value: string }

function parseTerms(query: string): Term[] {
  return query.trim().split(/\s+/).filter(Boolean).map((raw): Term => {
    const m = /^(port|pid):(.*)$/i.exec(raw);
    return m ? { field: m[1].toLowerCase() as 'port' | 'pid', value: m[2].toLowerCase() } : { field: 'any', value: raw.replace(/^:/, '').toLowerCase() };
  });
}

/**
 * Whitespace-separated terms, all of which must match. A bare number matches local port, remote port
 * or PID exactly; `port:N` / `pid:N` scope it; anything else is a process-name substring.
 */
export function filterByQuery(rows: readonly PortRow[], query: string): PortRow[] {
  const terms = parseTerms(query).filter((t) => t.value !== '');
  if (!terms.length) return [...rows];
  return rows.filter((row) => terms.every((t) => {
    const isNumber = /^\d+$/.test(t.value);
    const n = isNumber ? Number(t.value) : NaN;
    switch (t.field) {
      case 'port': return isNumber && (row.localPort === n || row.remotePort === n);
      case 'pid': return isNumber && row.pid === n;
      default:
        if (isNumber) return row.localPort === n || row.remotePort === n || row.pid === n;
        return row.processName.toLowerCase().includes(t.value);
    }
  }));
}

/** Groups rows by local port (ascending), keeping the input order within a group. */
export function groupByPort(rows: readonly PortRow[]): { port: number; rows: PortRow[] }[] {
  const groups = new Map<number, PortRow[]>();
  for (const row of rows) {
    const list = groups.get(row.localPort);
    if (list) list.push(row); else groups.set(row.localPort, [row]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([port, list]) => ({ port, rows: list }));
}

export function rowKey(r: PortRow): string {
  return `${r.protocol}|${r.localAddress}|${r.localPort}|${r.remoteAddress ?? ''}|${r.remotePort ?? ''}|${r.pid}`;
}

export function formatEndpoint(address: string | undefined, port: number | undefined): string {
  if (address === undefined || port === undefined) return '';
  return address.includes(':') ? `[${address}]:${port}` : `${address}:${port}`;
}

/** The plan request for ending a socket's owning process instance (exact `pid` + `startKey`). Null when the owner is unknown. */
export function endOwnerRequest(r: PortRow): SysPlanRequest | null {
  if (!r.startKey) return null;
  return {
    tool: PORT_PROCESS_LOOKUP_TOOL_ID,
    title: `End process: ${r.processName} (PID ${r.pid}) owning ${r.protocol.toUpperCase()} port ${r.localPort}`,
    ops: [{ kind: 'process.end', params: { pid: r.pid, startKey: r.startKey, name: r.processName } }],
  };
}
