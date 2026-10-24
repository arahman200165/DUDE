import Type, { type Static } from 'typebox';

/**
 * Hub collaboration (Phase 31J, protocol 3; PD-100, PD-104, PD-105). A separate WebSocket next to `/api/v1/realtime`: JSON control
 * frames (text) travel next to binary frames laid out as `[channel][kind: 0 sync | 1 awareness][y-protocols payload]`
 * (the codec lives in `@dude/collab-doc`; contracts cannot depend on it). Authentication, hello and close codes are those of
 * the realtime socket (`REALTIME_CLOSE_CODES`): the same credential classes, checked before the upgrade.
 */
export const HUB_COLLAB_PATH = '/api/v1/collab';

/** Largest binary frame (a sync step or a full-state update) or the connection is closed with the protocol-error code. */
export const COLLAB_MAX_FRAME_BYTES = 1024 * 1024;
/** Largest JSON control frame. */
export const COLLAB_MAX_CONTROL_BYTES = 4096;
/** Documents one connection can subscribe to; channels are numbered 1 to this value. */
export const COLLAB_MAX_CHANNELS = 8;
/** At most this many frames (control and binary) per connection per window, or the connection is closed with the rate-limited code. */
export const COLLAB_RATE_LIMIT_FRAMES = 600;
export const COLLAB_RATE_LIMIT_WINDOW_MS = 10_000;

/** Markdown Workspace rooms (PD-104): ephemeral, closed `COLLAB_ROOM_IDLE_CLOSE_MS` after the last participant leaves. */
export const COLLAB_MAX_ROOMS = 8;
export const COLLAB_MAX_ROOM_PARTICIPANTS = 8;
export const COLLAB_ROOM_IDLE_CLOSE_MS = 5 * 60_000;
export const COLLAB_ROOM_NAME_MAX = 80;
/** Longest title of a kept document; mirrors the `markdown-doc` codec. */
export const COLLAB_DOCUMENT_TITLE_MAX = 200;

/** History snapshots (PD-105): per document, whichever limit is reached first prunes the oldest. */
export const COLLAB_HISTORY_MAX_SNAPSHOTS = 200;
export const COLLAB_HISTORY_RETENTION_DAYS = 30;
export const COLLAB_HISTORY_MAX_BYTES = 8 * 1024 * 1024;
/** A snapshot is taken at most this often while a document is edited, and once a document has been idle this long after an edit. */
export const COLLAB_SNAPSHOT_MIN_INTERVAL_MS = 10 * 60_000;
export const COLLAB_SNAPSHOT_IDLE_MS = 2 * 60_000;

/** Number of presence colors an identity can take; the slot is assigned by the Hub. */
export const COLLAB_COLOR_SLOTS = 8;

/** Document kinds of a `kind:id` key. Mirrors `COLLAB_DOC_KINDS` in `@dude/collab-doc`, which owns key validation. */
export const COLLAB_WIRE_DOC_KINDS = ['scratchpad', 'user-script', 'markdown-doc', 'room'] as const;
export type CollabWireDocKind = (typeof COLLAB_WIRE_DOC_KINDS)[number];
const DocKey = Type.String({ pattern: `^(${COLLAB_WIRE_DOC_KINDS.join('|')}):[A-Za-z0-9_-]{1,64}$`, maxLength: 80 });
const Channel = Type.Integer({ minimum: 1, maximum: COLLAB_MAX_CHANNELS });

export const COLLAB_DOC_ERROR_CODES = ['consent-required', 'not-found', 'forbidden', 'too-large', 'limit', 'unavailable', 'consent-revoked'] as const;
export type CollabDocErrorCode = (typeof COLLAB_DOC_ERROR_CODES)[number];

export const CollabClientControl = Type.Union([
  Type.Object({ type: Type.Literal('hello'), protocolVersion: Type.Integer({ minimum: 1 }), minHubProtocol: Type.Integer({ minimum: 1 }) }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal('subscribe'), channel: Channel, doc: DocKey }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal('unsubscribe'), channel: Channel }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal('heartbeat') }, { additionalProperties: false }),
]);
export type CollabClientControl = Static<typeof CollabClientControl>;

/** The authenticated identity the Hub stamps into every awareness update; a client cannot claim another (PD-103). */
export const CollabIdentity = Type.Object({
  deviceId: Type.String({ minLength: 1, maxLength: 64 }),
  name: Type.String({ minLength: 1, maxLength: 80 }),
  colorSlot: Type.Integer({ minimum: 0, maximum: COLLAB_COLOR_SLOTS - 1 }),
}, { additionalProperties: false });
export type CollabIdentity = Static<typeof CollabIdentity>;

export const CollabServerControl = Type.Union([
  Type.Object({
    type: Type.Literal('welcome'),
    protocolVersion: Type.Integer({ minimum: 1 }),
    sessionKind: Type.Union([Type.Literal('owner-cookie'), Type.Literal('owner-bearer'), Type.Literal('device')]),
    deviceId: Type.Union([Type.String(), Type.Null()]),
    heartbeatIntervalMs: Type.Integer({ minimum: 1 }),
    identity: CollabIdentity,
  }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal('subscribed'), channel: Channel, doc: DocKey }, { additionalProperties: false }),
  Type.Object({
    type: Type.Literal('doc-error'),
    channel: Channel,
    code: Type.Unsafe<CollabDocErrorCode>({ type: 'string', enum: [...COLLAB_DOC_ERROR_CODES] }),
    message: Type.Optional(Type.String({ maxLength: 200 })),
  }, { additionalProperties: false }),
  Type.Object({ type: Type.Literal('error'), code: Type.String({ maxLength: 64 }) }, { additionalProperties: false }),
]);
export type CollabServerControl = Static<typeof CollabServerControl>;

/** Markdown Workspace rooms. Credential: owner cookie or bearer session. */
export const HUB_COLLAB_ROOMS_PATH = '/api/v1/collab/rooms';
const RoomId = Type.String({ pattern: '^[A-Za-z0-9_-]{1,64}$' });
const Instant = Type.String({ minLength: 1, maxLength: 40 });

export const CollabRoom = Type.Object({
  id: RoomId,
  name: Type.String({ minLength: 1, maxLength: COLLAB_ROOM_NAME_MAX }),
  participants: Type.Integer({ minimum: 0, maximum: COLLAB_MAX_ROOM_PARTICIPANTS }),
  createdAt: Instant,
}, { additionalProperties: false });
export type CollabRoom = Static<typeof CollabRoom>;
export const CollabRoomsResponse = Type.Object({ rooms: Type.Array(CollabRoom, { maxItems: COLLAB_MAX_ROOMS }) }, { additionalProperties: false });
export type CollabRoomsResponse = Static<typeof CollabRoomsResponse>;
export const CreateCollabRoomRequest = Type.Object({ name: Type.String({ minLength: 1, maxLength: COLLAB_ROOM_NAME_MAX }) }, { additionalProperties: false });
export type CreateCollabRoomRequest = Static<typeof CreateCollabRoomRequest>;
export const CollabRoomParams = Type.Object({ roomId: RoomId });
export type CollabRoomParams = Static<typeof CollabRoomParams>;

/** `POST /api/v1/collab/rooms/:roomId/keep`: persists the room as a `markdown-doc` record; refused unless `collab-documents` is on. */
export const KeepCollabRoomRequest = Type.Object({ title: Type.String({ minLength: 1, maxLength: COLLAB_DOCUMENT_TITLE_MAX }) }, { additionalProperties: false });
export type KeepCollabRoomRequest = Static<typeof KeepCollabRoomRequest>;
export const KeepCollabRoomResponse = Type.Object({ entityId: Type.String({ minLength: 1, maxLength: 64 }) }, { additionalProperties: false });
export type KeepCollabRoomResponse = Static<typeof KeepCollabRoomResponse>;

/** Document history (PD-105). Credential: owner cookie or bearer session. A restore is a forward edit and is audited. */
export const HUB_COLLAB_HISTORY_PATH = '/api/v1/collab/history';
const SnapshotId = Type.String({ minLength: 1, maxLength: 64 });

export const CollabHistoryQuery = Type.Object({ doc: DocKey });
export type CollabHistoryQuery = Static<typeof CollabHistoryQuery>;
export const CollabSnapshotSummary = Type.Object({
  id: SnapshotId,
  takenAt: Instant,
  bytes: Type.Integer({ minimum: 0, maximum: COLLAB_HISTORY_MAX_BYTES }),
}, { additionalProperties: false });
export type CollabSnapshotSummary = Static<typeof CollabSnapshotSummary>;
/** Newest first. */
export const CollabHistoryResponse = Type.Object({ snapshots: Type.Array(CollabSnapshotSummary, { maxItems: COLLAB_HISTORY_MAX_SNAPSHOTS }) }, { additionalProperties: false });
export type CollabHistoryResponse = Static<typeof CollabHistoryResponse>;
export const CollabSnapshotParams = Type.Object({ snapshotId: SnapshotId });
export type CollabSnapshotParams = Static<typeof CollabSnapshotParams>;
/** The preview: the plain JSON a restore would write, in the document's own record shape. */
export const CollabSnapshotResponse = Type.Object({
  doc: DocKey,
  takenAt: Instant,
  payload: Type.Record(Type.String(), Type.Unknown()),
}, { additionalProperties: false });
export type CollabSnapshotResponse = Static<typeof CollabSnapshotResponse>;
export const CollabRestoreResponse = Type.Object({ ok: Type.Literal(true) }, { additionalProperties: false });
export type CollabRestoreResponse = Static<typeof CollabRestoreResponse>;
