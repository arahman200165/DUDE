import Type, { type Static, type TSchema } from 'typebox';

/**
 * Endpoint diagnostics report (PD-060). One engine builds it for `GET /api/v1/diagnostics`, `dude-hub doctor --json` and
 * the Endpoint & Exposure settings section. It never carries secrets, file contents, tokens or private keys.
 */
const Nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);

export const DiagnosticStatus = Type.Union([Type.Literal('pass'), Type.Literal('warn'), Type.Literal('fail'), Type.Literal('info')]);
export type DiagnosticStatus = Static<typeof DiagnosticStatus>;

/** `verified`: the Hub observed it itself. `claimed`: operator configuration the Hub cannot verify. `not-checked`: needs external reachability (Phase 31F) or a running Hub. */
export const DiagnosticBasis = Type.Union([Type.Literal('verified'), Type.Literal('claimed'), Type.Literal('not-checked')]);
export type DiagnosticBasis = Static<typeof DiagnosticBasis>;

export const DiagnosticCheck = Type.Object({
  id: Type.String(),
  label: Type.String(),
  status: DiagnosticStatus,
  basis: DiagnosticBasis,
  detail: Type.String(),
  /** An exact elevated CLI command, when one fixes the finding. */
  fix: Type.Optional(Type.String()),
});
export type DiagnosticCheck = Static<typeof DiagnosticCheck>;

export const HubDiagnosticsCertificate = Type.Object({
  source: Type.Union([Type.Literal('self-signed'), Type.Literal('local-ca'), Type.Literal('imported')]),
  subject: Type.String(),
  sans: Type.Array(Type.String()),
  missingNames: Type.Array(Type.String()),
  notBefore: Type.String(),
  notAfter: Type.String(),
  daysLeft: Type.Number(),
  spkiSha256: Type.String(),
  nextSpkiSha256: Nullable(Type.String()),
  pendingAcks: Type.Number(),
  chainLength: Type.Number(),
  ca: Nullable(Type.Object({
    fingerprintSha256: Type.String(),
    notAfter: Type.String(),
    permitted: Type.Object({ dns: Type.Array(Type.String()), ip: Type.Array(Type.String()) }),
  })),
  renewal: Type.Object({ automatic: Type.Boolean(), nextCheckAt: Nullable(Type.String()) }),
  hsts: Type.Boolean(),
});
export type HubDiagnosticsCertificate = Static<typeof HubDiagnosticsCertificate>;

export const HubDiagnosticsReport = Type.Object({
  generatedAt: Type.String(),
  hubVersion: Type.String(),
  protocolVersion: Type.Number(),
  schemaVersion: Type.Number(),
  service: Type.Object({
    mode: Type.Union([Type.Literal('service'), Type.Literal('foreground'), Type.Literal('container')]),
    uptimeSeconds: Type.Number(),
    state: Type.Optional(Type.String()),
  }),
  exposure: Type.Object({
    mode: Type.Union([Type.Literal('private'), Type.Literal('public')]),
    publicReleased: Type.Literal(false),
    bind: Type.Union([Type.Literal('loopback'), Type.Literal('lan'), Type.Literal('container')]),
    bindAddress: Type.String(),
    port: Type.Number(),
    names: Type.Array(Type.String()),
    canonicalOrigin: Nullable(Type.String()),
    proxy: Nullable(Type.Object({ trusted: Type.Array(Type.String()), publicOrigin: Type.String() })),
  }),
  /** Null only for an offline `doctor` that finds no certificate file. */
  certificate: Type.Union([HubDiagnosticsCertificate, Type.Null()]),
  proxyPins: Type.Object({ active: Nullable(Type.String()), next: Nullable(Type.String()) }),
  firewall: Type.Object({
    applicable: Type.Boolean(),
    ruleName: Nullable(Type.String()),
    present: Type.Union([Type.Boolean(), Type.Null()]),
    profile: Nullable(Type.String()),
  }),
  realtime: Type.Object({
    available: Type.Boolean(),
    connections: Type.Object({ owner: Type.Number(), device: Type.Number() }),
  }),
  checks: Type.Array(DiagnosticCheck),
});
export type HubDiagnosticsReport = Static<typeof HubDiagnosticsReport>;
