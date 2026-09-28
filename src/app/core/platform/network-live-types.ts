import type { DnsTransport, HostnameVerdict, LiveCertificateSummary, TrustVerdict } from './network-types';

/**
 * Result shapes of the Phase 28 live checks, as the renderer reads them. The Electron modules
 * produce structurally identical objects; these are declared here (type-only) so tool templates
 * can render typed fields instead of raw JSON.
 */
export interface DnsFlagsView { readonly qr: boolean; readonly aa: boolean; readonly tc: boolean; readonly rd: boolean; readonly ra: boolean; readonly ad: boolean; readonly cd: boolean }
export interface DnsRecordView { readonly name: string; readonly type: string; readonly ttl: number; readonly value: string }
export interface DnsDiagnosticsView {
  readonly transport: DnsTransport;
  readonly server: string;
  readonly contacted: string;
  readonly elapsedMs: number;
  readonly queryBytes: number;
  readonly responseBytes: number;
  readonly retriedOverTcp?: boolean;
  readonly http?: { readonly status: number; readonly contentType: string; readonly url: string };
  readonly tls?: { readonly protocol: string | null; readonly cipher: string | null; readonly authorized: boolean; readonly subject?: string; readonly issuer?: string; readonly validTo?: string; readonly alpn?: string | false | null };
}
export interface CaaView {
  readonly queriedName: string;
  readonly relevantName: string | null;
  readonly climbed: readonly { readonly name: string; readonly rcode: string; readonly count: number }[];
  readonly issuers: readonly string[];
  readonly wildcardIssuers: readonly string[];
  readonly iodef: readonly string[];
  readonly nonWildcardPolicy: 'unrestricted' | 'none-allowed' | 'restricted';
  readonly wildcardPolicy: 'unrestricted' | 'none-allowed' | 'restricted';
  readonly blockedByCriticalUnknownTag: boolean;
  readonly caCheck?: { readonly ca: string; readonly nonWildcard: boolean; readonly wildcard: boolean };
  readonly warnings: readonly string[];
}
export interface DnsLookupView {
  readonly name: string;
  readonly type: string;
  readonly server: string;
  readonly transport: DnsTransport;
  readonly rcode: number;
  readonly rcodeName: string;
  readonly flags: DnsFlagsView;
  readonly answers: readonly DnsRecordView[];
  readonly authority: readonly DnsRecordView[];
  readonly additional: readonly DnsRecordView[];
  readonly edns?: { readonly udpSize: number; readonly version: number; readonly dnssecOk: boolean; readonly options: readonly { code: number; hex: string }[] };
  readonly diagnostics: DnsDiagnosticsView;
  readonly caa?: CaaView;
}
export interface ComparatorEntryView extends Partial<DnsLookupView> { readonly label: string; readonly error?: string }
export interface ComparatorView {
  readonly target: string;
  readonly recordType: string;
  readonly results: readonly ComparatorEntryView[];
  readonly comparison: {
    readonly consistent: boolean;
    readonly valuesByResolver: readonly { readonly label: string; readonly values: readonly string[]; readonly rcode?: number; readonly error?: string; readonly minTtl?: number; readonly maxTtl?: number; readonly authenticated?: boolean }[];
    readonly ttlSpread: number;
    readonly onlyIn: readonly { readonly label: string; readonly values: readonly string[] }[];
  };
}

export interface TlsCipherView { readonly name: string; readonly standardName: string; readonly version: string }
export interface HandshakeView {
  readonly host: string;
  readonly port: number;
  readonly address: string | null;
  readonly servername: string | null;
  readonly protocol: string | null;
  readonly cipher: TlsCipherView | null;
  readonly alpn: string | null;
  readonly ephemeralKey: { readonly type?: string; readonly name?: string; readonly size?: number } | null;
  readonly authorizedByNode: boolean;
  readonly authorizationError: string | null;
  readonly chain: readonly LiveCertificateSummary[];
  readonly ocspStapleBase64: string | null;
  readonly clientCertificateRequested: boolean;
  readonly acceptableClientCAs: readonly string[];
  readonly sessionReused: boolean;
  readonly timings: { readonly dnsMs: number | null; readonly tcpMs: number | null; readonly tlsMs: number | null; readonly totalMs: number };
}
export interface LiveEndpointView {
  readonly handshake: HandshakeView;
  readonly trust: readonly TrustVerdict[];
  readonly hostname: HostnameVerdict | null;
}
