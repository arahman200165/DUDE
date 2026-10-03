import Type, { type Static } from 'typebox';

/** The authenticated Hub WebSocket (PD-034). No synchronization rides on it in 31C. */
export const HUB_REALTIME_PATH = '/api/v1/realtime';
export const REALTIME_HEARTBEAT_INTERVAL_MS = 25_000;
export const REALTIME_IDLE_TIMEOUT_MS = 60_000;
export const REALTIME_HELLO_TIMEOUT_MS = 10_000;
export const REALTIME_MAX_MESSAGE_BYTES = 16 * 1024;

export const REALTIME_CLOSE_CODES = {
  unauthorized: 4001,
  revoked: 4003,
  unsupportedProtocol: 4008,
  heartbeatTimeout: 4009,
  protocolError: 4010,
  rateLimited: 4029,
} as const;
export type RealtimeCloseCode = (typeof REALTIME_CLOSE_CODES)[keyof typeof REALTIME_CLOSE_CODES];

const SpkiSha256 = Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' });

export const RealtimeClientMessage = Type.Union([
  Type.Object({ type: Type.Literal('hello'), protocolVersion: Type.Integer({ minimum: 1 }), minHubProtocol: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal('heartbeat') }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal('tls-pin-ack'), spkiSha256: SpkiSha256 }, { additionalProperties: false }),
]);
export type RealtimeClientMessage = Static<typeof RealtimeClientMessage>;

export const REALTIME_SESSION_KINDS = ['owner-cookie', 'owner-bearer', 'device'] as const;
export const REALTIME_EVENTS = ['device-registry-changed', 'session-revoked', 'device-revoked', 'tls-next-pin', 'owner-recovered', 'changes-available', 'web-access-changed'] as const;

export const RealtimeServerMessage = Type.Union([
  Type.Object({
    type: Type.Literal('welcome'),
    protocolVersion: Type.Integer({ minimum: 1 }),
    sessionKind: Type.Union([Type.Literal('owner-cookie'), Type.Literal('owner-bearer'), Type.Literal('device')]),
    deviceId: Type.Union([Type.String(), Type.Null()]),
    heartbeatIntervalMs: Type.Integer({ minimum: 1 }),
    tls: Type.Object({ spkiSha256: SpkiSha256, nextSpkiSha256: Type.Union([SpkiSha256, Type.Null()]), proxySpkiSha256: Type.Optional(Type.Array(SpkiSha256)) }),
  }),
  Type.Object({
    type: Type.Literal('event'),
    event: Type.Union([Type.Literal('device-registry-changed'), Type.Literal('session-revoked'), Type.Literal('device-revoked'), Type.Literal('tls-next-pin'), Type.Literal('owner-recovered'), Type.Literal('changes-available'), Type.Literal('web-access-changed')]),
    data: Type.Record(Type.String(), Type.Unknown()),
  }),
  Type.Object({ type: Type.Literal('error'), code: Type.String() }),
]);
export type RealtimeServerMessage = Static<typeof RealtimeServerMessage>;

/** Payload of the changes-available event (device sockets and owner cookie sockets, PD-054): the environment head revision. */
export const ChangesAvailableData = Type.Object({ revision: Type.Integer({ minimum: 0 }) });
export type ChangesAvailableData = Static<typeof ChangesAvailableData>;
