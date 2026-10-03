import Type, { type Static } from 'typebox';

const SpkiSha256 = Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' });
const PinnedCertificate = Type.Object({ spkiSha256: SpkiSha256, certPem: Type.String() });

/** Where the active leaf comes from. A later 31E milestone may grow this with `proxy`. */
export const TlsCertificateSource = Type.Union([Type.Literal('self-signed'), Type.Literal('local-ca'), Type.Literal('imported')]);
export type TlsCertificateSource = Static<typeof TlsCertificateSource>;

/**
 * Public data: the pinned certificates. A client verifies a fetched `next` certificate against the announced pin.
 * `caCertPem` is the PUBLIC local-CA root (never a key), or null when the Hub has no local CA.
 */
export const TlsCertificatesResponse = Type.Object({
  active: PinnedCertificate,
  next: Type.Union([PinnedCertificate, Type.Null()]),
  source: TlsCertificateSource,
  caCertPem: Type.Union([Type.String(), Type.Null()]),
  /** ISO-8601 expiry of the active leaf. */
  leafNotAfter: Type.String(),
  /** Reverse-proxy leaf pins (active plus staged next); absent on Hubs that predate proxy pins. */
  proxySpkiSha256: Type.Optional(Type.Array(SpkiSha256)),
});
export type TlsCertificatesResponse = Static<typeof TlsCertificatesResponse>;

export const AUDIT_LIST_DEFAULT_LIMIT = 50;
export const AUDIT_LIST_MAX_LIMIT = 200;

export const AuditListQuery = Type.Object({
  /** Query values arrive as strings (the Hub does not coerce types): decimal digits only. */
  beforeSeq: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,15}$' })),
  limit: Type.Optional(Type.String({ pattern: '^[1-9][0-9]{0,2}$' })),
});
export type AuditListQuery = Static<typeof AuditListQuery>;

export const AuditListEvent = Type.Object({
  seq: Type.Integer(),
  at: Type.String(),
  actorKind: Type.String(),
  actorId: Type.Union([Type.String(), Type.Null()]),
  event: Type.String(),
  outcome: Type.String(),
  ip: Type.Union([Type.String(), Type.Null()]),
  detail: Type.Union([Type.Record(Type.String(), Type.Unknown()), Type.Null()]),
});
export type AuditListEvent = Static<typeof AuditListEvent>;

export const AuditListResponse = Type.Object({
  events: Type.Array(AuditListEvent),
  nextBeforeSeq: Type.Union([Type.Integer(), Type.Null()]),
});
export type AuditListResponse = Static<typeof AuditListResponse>;
