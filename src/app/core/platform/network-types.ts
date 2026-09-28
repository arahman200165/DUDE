/** Typed contract shared by the sandboxed renderer and Electron main process. */
export type NetworkKind =
  | 'ping' | 'traceroute' | 'dns-lookup' | 'reverse-dns' | 'dns-propagation'
  | 'tcp-port-tester' | 'udp-port-tester' | 'port-scanner' | 'local-network'
  | 'public-ip' | 'hostname-resolver' | 'whois-lookup' | 'connectivity-tester'
  | 'latency-monitor' | 'packet-loss' | 'mtu-discovery' | 'route-comparison'
  | 'network-diagnostic-bundle'
  // Phase 28 — DNS & Live TLS / Certificate Tools
  | 'dnssec-inspector' | 'email-auth' | 'tls-inspector' | 'tls-enumeration' | 'tls-capture'
  | 'http3-probe' | 'live-chain' | 'revocation' | 'ct-lookup' | 'starttls' | 'https-analyzer';

export type AddressFamily = 'auto' | 'ipv4' | 'ipv6';
export type DnsTransport = 'classic' | 'doh' | 'dot';
export type DnsRecordType =
  | 'A' | 'AAAA' | 'MX' | 'TXT' | 'SRV' | 'NS' | 'CNAME' | 'PTR'
  | 'SOA' | 'CAA' | 'DNSKEY' | 'DS' | 'RRSIG' | 'NSEC' | 'NSEC3' | 'TLSA' | 'HTTPS' | 'SVCB';
export const DNS_RECORD_TYPES: readonly DnsRecordType[] = [
  'A', 'AAAA', 'MX', 'TXT', 'SRV', 'NS', 'CNAME', 'PTR',
  'SOA', 'CAA', 'DNSKEY', 'DS', 'RRSIG', 'NSEC', 'NSEC3', 'TLSA', 'HTTPS', 'SVCB',
];
export type LocalView = 'ports' | 'connections' | 'processes' | 'neighbors' | 'routes' | 'interfaces' | 'local-ip';
export type ScanProtocol = 'tcp' | 'udp' | 'both';
export type TlsVersionName = 'TLSv1' | 'TLSv1.1' | 'TLSv1.2' | 'TLSv1.3';
export type StartTlsProtocol = 'smtp' | 'imap' | 'pop3' | 'ftp' | 'ldap' | 'postgres' | 'mysql' | 'xmpp';
export const STARTTLS_PROTOCOLS: readonly StartTlsProtocol[] = ['smtp', 'imap', 'pop3', 'ftp', 'ldap', 'postgres', 'mysql', 'xmpp'];
export type EmailAuthCheck = 'spf' | 'dkim' | 'dmarc';
export type RevocationAction = 'ocsp' | 'crl' | 'aia';

/** One resolver in the Resolver Comparator (DNS Propagation). */
export interface ResolverSpec {
  readonly label: string;
  readonly server: string;
  readonly transport: DnsTransport;
}

/**
 * A client identity for mTLS. `pfxBase64`/`pemCert`+`pemKey` are session-only material sent for
 * one connection; `secureRef` names an identity the user explicitly saved to `secure-local`.
 */
export interface ClientIdentity {
  readonly pfxBase64?: string;
  readonly passphrase?: string;
  readonly pemCert?: string;
  readonly pemKey?: string;
  readonly secureRef?: string;
}

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
  // Phase 28
  /** Set the EDNS0 DO bit (request DNSSEC records). */
  readonly dnssecOk?: boolean;
  /** Set the CD (checking disabled) bit, so a validating resolver returns bogus data for local inspection. */
  readonly checkingDisabled?: boolean;
  /** Resolver Comparator: explicit resolver list (the system resolver is added with `includeSystem`). */
  readonly resolvers?: readonly ResolverSpec[];
  readonly includeSystem?: boolean;
  readonly includePresets?: boolean;
  /** CAA analysis: optional CA identifier to test ("letsencrypt.org"). */
  readonly caIdentifier?: string;
  readonly emailChecks?: readonly EmailAuthCheck[];
  readonly dkimSelectors?: readonly string[];
  readonly dkimHeaders?: string;
  readonly dkimCommonProbe?: boolean;
  readonly senderIp?: string;
  readonly sni?: string;
  readonly noSni?: boolean;
  readonly sniNames?: readonly string[];
  readonly alpn?: readonly string[];
  readonly tlsVersions?: readonly TlsVersionName[];
  readonly starttlsProtocol?: StartTlsProtocol;
  readonly clientIdentity?: ClientIdentity;
  readonly revocationAction?: RevocationAction;
  /** CA URLs the user chose to contact; must come from a chain this window fetched. */
  readonly urls?: readonly string[];
  /** The leaf + issuer DER (base64) the revocation/CT check is about. */
  readonly chainBase64?: readonly string[];
  readonly ctEndpoint?: string;
  readonly ctSearch?: boolean;
  readonly includeSubdomains?: boolean;
  readonly captureWire?: boolean;
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

/** Certificate summary produced in the main process from a live handshake (node:crypto X509Certificate). */
export interface LiveCertificateSummary {
  readonly subject: string;
  readonly issuer: string;
  readonly serialNumber: string;
  readonly validFrom: string;
  readonly validTo: string;
  readonly daysRemaining: number;
  readonly fingerprint256: string;
  readonly fingerprint1: string;
  readonly subjectAltName: readonly string[];
  readonly keyType: string;
  readonly keyDetail: string;
  readonly signatureAlgorithm: string;
  readonly isCA: boolean;
  readonly selfIssued: boolean;
  readonly ocspUrls: readonly string[];
  readonly caIssuerUrls: readonly string[];
  readonly crlUrls: readonly string[];
  readonly sctCount: number;
  readonly derBase64: string;
}

export interface TrustVerdict {
  readonly store: 'mozilla' | 'windows';
  readonly trusted: boolean;
  readonly reason: string;
  readonly path: readonly string[];
  readonly anchor?: string;
}

export interface HostnameVerdict {
  readonly host: string;
  readonly matches: boolean;
  readonly matchedName?: string;
  readonly reasons: readonly string[];
}

// ---- Certificate Watch List (Phase 28 item 17/24) ----
export type WatchStatus = 'ok' | 'warning' | 'expired' | 'error' | 'changed' | 'pending';
export interface WatchCheck {
  readonly checkedAt: string;
  readonly status: WatchStatus;
  readonly fingerprint256?: string;
  readonly validTo?: string;
  readonly daysRemaining?: number;
  readonly issuer?: string;
  readonly subject?: string;
  readonly error?: string;
}
export interface WatchEntry {
  readonly id: string;
  readonly label: string;
  readonly host: string;
  readonly port: number;
  readonly sni?: string;
  readonly starttlsProtocol?: StartTlsProtocol;
  readonly clientIdentityRef?: string;
  /** Per-entry warning thresholds in days; falls back to the global setting. */
  readonly thresholds?: readonly number[];
  readonly pinnedFingerprint?: string;
  readonly last?: WatchCheck;
  readonly history: readonly WatchCheck[];
  readonly consecutiveFailures: number;
  readonly notified: readonly string[];
}
export interface WatchSettings {
  readonly enabled: boolean;
  readonly intervalHours: 6 | 12 | 24;
  readonly thresholds: readonly number[];
  readonly failureAlertAfter: number;
  readonly notifications: boolean;
}
export interface WatchState {
  readonly settings: WatchSettings;
  readonly entries: readonly WatchEntry[];
  readonly lastPassAt?: string;
  readonly nextPassAt?: string;
}
export type WatchResult<T = unknown> = ({ readonly ok: true } & T) | { readonly ok: false; readonly error: string };
