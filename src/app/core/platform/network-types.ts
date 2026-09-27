/** Typed contract shared by the sandboxed renderer and Electron main process. */
export type NetworkKind =
  | 'ping' | 'traceroute' | 'dns-lookup' | 'reverse-dns' | 'dns-propagation'
  | 'tcp-port-tester' | 'udp-port-tester' | 'port-scanner' | 'local-network'
  | 'public-ip' | 'hostname-resolver' | 'whois-lookup' | 'connectivity-tester'
  | 'latency-monitor' | 'packet-loss' | 'mtu-discovery' | 'route-comparison'
  | 'network-diagnostic-bundle';

export type AddressFamily = 'auto' | 'ipv4' | 'ipv6';
export type DnsTransport = 'classic' | 'doh' | 'dot';
export type DnsRecordType = 'A' | 'AAAA' | 'MX' | 'TXT' | 'SRV' | 'NS' | 'CNAME' | 'PTR';
export type LocalView = 'ports' | 'connections' | 'processes' | 'neighbors' | 'routes' | 'interfaces' | 'local-ip';
export type ScanProtocol = 'tcp' | 'udp' | 'both';

export interface NetworkRequest {
  readonly kind: NetworkKind;
  readonly target?: string;
  readonly secondTarget?: string;
  readonly addressFamily?: AddressFamily;
  readonly port?: number;
  readonly ports?: readonly number[];
  readonly protocol?: ScanProtocol;
  readonly count?: number;
  readonly intervalMs?: number;
  readonly durationMs?: number;
  readonly timeoutMs?: number;
  readonly recordType?: DnsRecordType;
  readonly resolver?: string;
  readonly resolverTransport?: DnsTransport;
  readonly localView?: LocalView;
  readonly connectivityMode?: 'tcp' | 'http';
  readonly selectedChecks?: readonly ('local' | 'dns' | 'ping' | 'trace' | 'tcp' | 'scan')[];
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly includeScan?: boolean;
}

export interface NetworkJobEvent {
  readonly jobId: string;
  readonly type: 'progress' | 'result' | 'error' | 'done';
  readonly sequence: number;
  readonly completed?: number;
  readonly total?: number;
  readonly data?: unknown;
  readonly message?: string;
}

export type NetworkStartResult =
  | { readonly ok: true; readonly jobId: string }
  | { readonly ok: false; readonly error: string };

export type NetworkPrepareResult =
  | { readonly ok: true; readonly token: string; readonly preview: unknown }
  | { readonly ok: false; readonly error: string };
