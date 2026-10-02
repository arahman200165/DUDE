import type { DnsTransport, HostnameVerdict, LiveCertificateSummary, TrustVerdict } from "./network-types.js";

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

export interface DnssecSignatureView { readonly covered: string; readonly owner: string; readonly algorithm: number; readonly algorithmName: string; readonly keyTag: number; readonly signer: string; readonly inception: string; readonly expiration: string; readonly expiresInDays: number; readonly valid: boolean; readonly reason: string }
export interface DnssecDenialView { readonly kind: 'NSEC' | 'NSEC3' | 'none'; readonly proven: boolean; readonly optOut: boolean; readonly nameExists: boolean | null; readonly typesAtName: readonly string[]; readonly detail: string; readonly iterations?: number }
export interface DnssecZoneView {
  readonly zone: string;
  readonly delegation: 'anchor' | 'secure' | 'insecure' | 'bogus';
  readonly ds: readonly { readonly keyTag: number; readonly algorithm: number; readonly digestType: number; readonly digest: string; readonly digestName: string; readonly matchedKey: boolean }[];
  readonly dsSignatures: readonly DnssecSignatureView[];
  readonly keys: readonly { readonly keyTag: number; readonly algorithm: number; readonly algorithmName: string; readonly flags: number; readonly role: string; readonly revoked: boolean; readonly matchesParentDs: boolean; readonly bits?: number }[];
  readonly keySignatures: readonly DnssecSignatureView[];
  readonly denial?: DnssecDenialView;
  readonly note: string;
}
export interface DnssecView {
  readonly target: string;
  readonly recordType: string;
  readonly contacted: string;
  readonly resolverAuthenticated: boolean;
  readonly resolverRcode: string;
  readonly status: 'secure' | 'insecure' | 'bogus' | 'indeterminate';
  readonly statusReason: string;
  readonly zones: readonly DnssecZoneView[];
  readonly answer: { readonly rcode: string; readonly records: readonly DnsRecordView[]; readonly signatures: readonly DnssecSignatureView[]; readonly denial?: DnssecDenialView };
  readonly findings: readonly { readonly id: string; readonly status: 'pass' | 'warn' | 'fail' | 'info'; readonly title: string; readonly detail?: string; readonly reference?: string }[];
  readonly queries: number;
}

export interface SpfTermView { readonly raw: string; readonly kind: string; readonly qualifier?: string; readonly name: string; readonly value?: string; readonly error?: string; readonly resolved?: readonly string[]; readonly child?: SpfNodeView; readonly note?: string }
export interface SpfNodeView { readonly domain: string; readonly record: string | null; readonly terms: readonly SpfTermView[]; readonly errors: readonly string[]; readonly lookupCount: number }
export interface LiveFindingView { readonly id: string; readonly status: 'pass' | 'warn' | 'fail' | 'info'; readonly title: string; readonly detail?: string; readonly reference?: string }
export interface EmailAuthView {
  readonly domain: string;
  readonly spf?: { readonly records: readonly string[]; readonly tree: SpfNodeView | null; readonly lookupCount: number; readonly voidLookups: number; readonly flattened: readonly { readonly range: string; readonly qualifier: string; readonly source: string }[]; readonly evaluation?: { readonly ip: string; readonly result: string; readonly matched?: string; readonly explanation: string }; readonly findings: readonly LiveFindingView[] };
  readonly dkim?: {
    readonly keys: readonly { readonly selector: string; readonly domain: string; readonly name: string; readonly source: string; readonly found: boolean; readonly record?: string; readonly keyType?: string; readonly keyBits?: number; readonly revoked?: boolean; readonly testing?: boolean; readonly findings: readonly LiveFindingView[] }[];
    readonly signatures: readonly { readonly domain: string; readonly selector: string; readonly algorithm: string; readonly canonicalization: string; readonly signedHeaders: string; readonly expires?: string; readonly identity?: string }[];
    readonly guessedSelectors?: readonly string[];
  };
  readonly dmarc?: { readonly queried: readonly string[]; readonly policyDomain: string | null; readonly organizationalDomain: string; readonly record: string | null; readonly tags: Readonly<Record<string, string>>; readonly reportDestinations: readonly { readonly uri: string; readonly kind: string; readonly external: boolean; readonly authorized?: boolean; readonly checkedName?: string }[]; readonly findings: readonly LiveFindingView[] };
  readonly queries: number;
}

export interface TlsTimelineEventView { readonly atMs: number; readonly contentType: string; readonly handshakeType?: string; readonly length: number; readonly detail?: string }
export interface TlsWeaknessView { readonly id: string; readonly status: 'pass' | 'warn' | 'fail' | 'info'; readonly title: string; readonly detail?: string; readonly reference?: string }
export interface TlsInspectView {
  readonly host: string;
  readonly port: number;
  readonly handshake: HandshakeView & { readonly ocspStapleBase64: string | null };
  readonly trust: readonly import("./network-types.js").TrustVerdict[];
  readonly hostname: import("./network-types.js").HostnameVerdict;
  readonly sniComparison?: readonly { readonly sni: string | false; readonly protocol: string | null; readonly leafSubject: string | null; readonly leafFingerprint: string | null; readonly matchesHost: boolean; readonly error?: string }[];
  readonly timeline?: readonly TlsTimelineEventView[];
  readonly certificateRequested: boolean;
  readonly weaknesses: readonly TlsWeaknessView[];
}
export interface Http3View {
  readonly url: string;
  readonly attemptedQuic: boolean;
  readonly negotiatedProtocol: string;
  readonly h3: boolean;
  readonly status: number | null;
  readonly altSvc: string | null;
  readonly advertisesH3: boolean;
  readonly elapsedMs: number;
  readonly note: string;
  readonly error?: string;
}

export interface TlsEnumerationView {
  readonly host: string;
  readonly port: number;
  readonly client: string;
  readonly handshakes: number;
  readonly budget: number;
  readonly versions: readonly { readonly version: string; readonly state: string; readonly cipher?: string; readonly detail?: string }[];
  readonly ciphers: readonly { readonly version: string; readonly openssl: string; readonly standardName?: string; readonly state: string; readonly detail?: string }[];
  readonly supportedVersions: readonly string[];
  readonly weaknesses: readonly TlsWeaknessView[];
  readonly notTestable: number;
  readonly note: string;
}

export interface LiveChainView {
  readonly host: string;
  readonly port: number;
  readonly servername: string | null;
  readonly protocol: string | null;
  readonly chain: readonly import("./network-types.js").LiveCertificateSummary[];
  readonly trust: readonly import("./network-types.js").TrustVerdict[];
  readonly hostname: import("./network-types.js").HostnameVerdict;
  readonly incompleteChain: boolean;
  readonly missingIssuerUrls: readonly string[];
  readonly ocspStapleBase64: string | null;
}

export interface RevocationView {
  readonly host: string;
  readonly action: string;
  readonly serial: string;
  readonly leafSubject: string;
  readonly issuerSubject: string;
  readonly ocsp?: { readonly source: string; readonly url?: string; readonly responseStatus: string; readonly certStatus?: string; readonly thisUpdate?: string; readonly nextUpdate?: string; readonly revocationTime?: string; readonly revocationReason?: string; readonly producedAt?: string; readonly responder?: string; readonly signatureValid?: boolean; readonly signatureNote?: string };
  readonly crl?: { readonly url: string; readonly issuer: string; readonly thisUpdate: string; readonly nextUpdate?: string; readonly entries: number; readonly serial: string; readonly revoked: boolean; readonly revocationTime?: string; readonly revocationReason?: string; readonly signatureValid: boolean; readonly signatureNote: string };
  readonly aia?: { readonly url: string; readonly fetchedIssuer?: string; readonly error?: string };
  readonly urls: { readonly ocsp: readonly string[]; readonly crl: readonly string[]; readonly aia: readonly string[] };
  readonly note?: string;
}

export interface CtView {
  readonly host: string;
  readonly scts: readonly { readonly source: string; readonly version: number; readonly logId: string; readonly logName: string | null; readonly logOperator: string | null; readonly logState: string | null; readonly timestamp: string; readonly hashAlgorithm: number; readonly signatureAlgorithm: number }[];
  readonly logListRetrievedAt: string;
  readonly search?: { readonly endpoint: string; readonly query: string; readonly count: number; readonly truncated: boolean; readonly entries: readonly { readonly id: number; readonly issuer: string; readonly commonName: string; readonly nameValue: string; readonly notBefore: string; readonly notAfter: string; readonly entryTimestamp: string }[]; readonly uniqueNames: readonly string[]; readonly issuers: readonly string[]; readonly error?: string };
  readonly note: string;
}

export interface StartTlsView {
  readonly host: string;
  readonly port: number;
  readonly protocol: string;
  readonly transcript: readonly string[];
  readonly upgraded: boolean;
  readonly tlsProtocol: string | null;
  readonly cipher: string | null;
  readonly alpn: string | null;
  readonly chain: readonly import("./network-types.js").LiveCertificateSummary[];
  readonly trust: readonly import("./network-types.js").TrustVerdict[];
  readonly hostname: import("./network-types.js").HostnameVerdict;
  readonly error?: string;
}

export interface HttpsAnalysisView {
  readonly host: string;
  readonly port: number;
  readonly findings: readonly (LiveFindingView & { readonly link?: string; readonly linkLabel?: string; readonly status: 'pass' | 'warn' | 'fail' | 'info' | 'untested' })[];
  readonly summary: { readonly fail: number; readonly warn: number; readonly pass: number };
  readonly supportedVersions: readonly string[];
  readonly redirectsToHttps: boolean | null;
  readonly hsts: string | null;
}
