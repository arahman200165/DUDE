import Type, { type Static } from 'typebox';

/**
 * The resumable chunked upload route family (32-SS1, Milestone 845, PD-118, PD-148). A client creates a session naming the declared size
 * (and optionally the SHA-256 of the whole file), sends the file as fixed-size chunks (`PUT` of raw `application/octet-stream`, idempotent
 * by index, in any order, retried freely), asks for the status to resume after a dropped connection, then completes: the Hub assembles the
 * chunks in order into the content-addressed blob store, verifies the size and the declared hash, and returns the blob's identity.
 *
 * Credential types, route by route (the ingest-token class is NOT used here; 32-SS3 may add it to the same session core):
 * - `POST   /api/v1/uploads`                          owner cookie (plus CSRF) or owner bearer: create a session.
 * - `GET    /api/v1/uploads/:id`                      owner: the session status (which chunks arrived, for resume).
 * - `PUT    /api/v1/uploads/:id/chunks/:index`        owner: one chunk, raw bytes, `Content-Length` required, idempotent by index.
 * - `POST   /api/v1/uploads/:id/complete`             owner: assemble into the blob store; idempotent (the same result again).
 * - `DELETE /api/v1/uploads/:id`                      owner: abort. Single step, audited (see the Hub AGENTS.md destructive-action note).
 * A device token or an ingest token is refused (403 and 401); an anonymous request is 401.
 *
 * There is no fixed attachment size cap: an upload is limited by the free-disk guard (507, code `storage-full`) and a very large sanity ceiling.
 */
export const HUB_UPLOADS_PATH = '/api/v1/uploads';
export const uploadPath = (id: string): string => `${HUB_UPLOADS_PATH}/${encodeURIComponent(id)}`;
export const uploadChunkPath = (id: string, index: number): string => `${uploadPath(id)}/chunks/${index}`;
export const uploadCompletePath = (id: string): string => `${uploadPath(id)}/complete`;

const MIB = 1024 * 1024;
/** 8 MiB: far below the 100 MB request-body limit Cloudflare documents for its lower plans, large enough to keep the request count low. */
export const UPLOAD_CHUNK_SIZE_DEFAULT = 8 * MIB;
export const UPLOAD_CHUNK_SIZE_MIN = 1 * MIB;
export const UPLOAD_CHUNK_SIZE_MAX = 32 * MIB;
/** The chunk route's body limit is the session chunk size; this is the hard ceiling (largest negotiable chunk plus slack) checked before a session is even looked up. */
export const UPLOAD_BODY_SLACK = 1024;
export const UPLOAD_BODY_LIMIT = UPLOAD_CHUNK_SIZE_MAX + UPLOAD_BODY_SLACK;
/** A sanity ceiling on the declared size (1 TiB), not a policy cap: the disk guard is the real limit. */
export const UPLOAD_MAX_DECLARED_SIZE = 2 ** 40;
export const UPLOAD_NAME_MAX = 255;
export const UPLOAD_MIME_MAX = 127;
export const UPLOAD_CHUNK_HASH_HEADER = 'x-chunk-sha256';
export const UPLOAD_CONTENT_TYPE = 'application/octet-stream';
/** The blob registry owner kind a completed upload's reference carries until a later phase attaches the blob. */
export const UPLOAD_BLOB_OWNER_KIND = 'upload';

/**
 * `open` (accepting chunks), `completing` (assembling), `complete` (a blob exists), `failed` (assembly proved the content wrong; nothing kept),
 * `aborted` (the owner deleted it) and `expired` (no activity for the retention window). The last four are final.
 */
export const UPLOAD_STATES = ['open', 'completing', 'complete', 'failed', 'aborted', 'expired'] as const;
export type UploadState = (typeof UPLOAD_STATES)[number];

/** Why a session failed, closed: `sha256-mismatch` (the assembled bytes do not hash to the declared value), `blob-missing` (the store lost the blob during commit). */
export const UPLOAD_FAILURE_REASONS = ['sha256-mismatch', 'blob-missing'] as const;
export type UploadFailureReason = (typeof UPLOAD_FAILURE_REASONS)[number];

const Sha256Hex = Type.String({ pattern: '^[0-9a-f]{64}$' });
const Instant = Type.String({ minLength: 1, maxLength: 40 });

export const UploadCreateRequest = Type.Object(
  {
    /** Bytes in the whole file (at least 1). */
    size: Type.Integer({ minimum: 1, maximum: UPLOAD_MAX_DECLARED_SIZE }),
    /** Optional lower-case hex SHA-256 of the whole file; when present, completion fails unless the assembled bytes match. */
    sha256: Type.Optional(Sha256Hex),
    /** Preferred chunk size; the Hub negotiates it into `[UPLOAD_CHUNK_SIZE_MIN, UPLOAD_CHUNK_SIZE_MAX]` (default 8 MiB) and answers with the one to use. */
    chunkSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 2 ** 31 })),
    /** Display metadata only (sanitized and length-limited by the Hub; never used for a path). */
    mime: Type.Optional(Type.String({ maxLength: UPLOAD_MIME_MAX })),
    name: Type.Optional(Type.String({ maxLength: UPLOAD_NAME_MAX })),
  },
  { additionalProperties: false },
);
export type UploadCreateRequest = Static<typeof UploadCreateRequest>;

/** An inclusive run of received chunk indexes, `[from, to]`. */
export const UploadChunkRange = Type.Tuple([Type.Integer({ minimum: 0 }), Type.Integer({ minimum: 0 })]);
export type UploadChunkRange = Static<typeof UploadChunkRange>;

export const UploadBlob = Type.Object({
  sha256: Sha256Hex,
  size: Type.Integer({ minimum: 0 }),
  /** `upload:<uploadId>`: the reference the blob registry holds for this session until the blob is attached (`attachUploadBlob`) or the session expires. */
  blobRef: Type.String({ minLength: 1, maxLength: 128 }),
});
export type UploadBlob = Static<typeof UploadBlob>;

/** The session as the owner sees it: what a create returns and what a status poll returns (the resume point). */
export const UploadSession = Type.Object({
  uploadId: Type.String({ minLength: 1, maxLength: 64 }),
  state: Type.Unsafe<UploadState>({ type: 'string', enum: [...UPLOAD_STATES] }),
  size: Type.Integer({ minimum: 1 }),
  sha256: Type.Union([Sha256Hex, Type.Null()]),
  chunkSize: Type.Integer({ minimum: 1 }),
  chunkCount: Type.Integer({ minimum: 1 }),
  /** The received chunk indexes as ascending, non-overlapping inclusive ranges. Empty once the session is complete (the chunks were assembled). */
  received: Type.Array(UploadChunkRange),
  receivedChunks: Type.Integer({ minimum: 0 }),
  receivedBytes: Type.Integer({ minimum: 0 }),
  createdAt: Instant,
  expiresAt: Instant,
  mime: Type.Union([Type.String({ maxLength: UPLOAD_MIME_MAX }), Type.Null()]),
  name: Type.Union([Type.String({ maxLength: UPLOAD_NAME_MAX }), Type.Null()]),
  blob: Type.Union([UploadBlob, Type.Null()]),
  failure: Type.Union([Type.Unsafe<UploadFailureReason>({ type: 'string', enum: [...UPLOAD_FAILURE_REASONS] }), Type.Null()]),
});
export type UploadSession = Static<typeof UploadSession>;

export const UploadChunkResponse = Type.Object({
  uploadId: Type.String({ minLength: 1, maxLength: 64 }),
  index: Type.Integer({ minimum: 0 }),
  size: Type.Integer({ minimum: 1 }),
  sha256: Sha256Hex,
  /** True when this exact chunk had already arrived (a safe retry): nothing was written. */
  duplicate: Type.Boolean(),
  receivedChunks: Type.Integer({ minimum: 0 }),
  receivedBytes: Type.Integer({ minimum: 0 }),
  expiresAt: Instant,
});
export type UploadChunkResponse = Static<typeof UploadChunkResponse>;

export const UploadCompleteResponse = Type.Object({
  uploadId: Type.String({ minLength: 1, maxLength: 64 }),
  state: Type.Literal('complete'),
  sha256: Sha256Hex,
  size: Type.Integer({ minimum: 1 }),
  blobRef: Type.String({ minLength: 1, maxLength: 128 }),
  /** When the Hub releases the session's reference if nothing attached the blob by then. */
  expiresAt: Instant,
});
export type UploadCompleteResponse = Static<typeof UploadCompleteResponse>;

/** The chunk count of a file: every chunk is `chunkSize` bytes except the last, which carries the remainder. */
export function uploadChunkCount(size: number, chunkSize: number): number {
  return Math.ceil(size / chunkSize);
}

/** The exact byte length chunk `index` must have. */
export function uploadChunkLength(size: number, chunkSize: number, index: number): number {
  const count = uploadChunkCount(size, chunkSize);
  return index === count - 1 ? size - (count - 1) * chunkSize : chunkSize;
}

/** Clamps a requested chunk size into the negotiable range (undefined means the default). */
export function negotiateUploadChunkSize(requested: number | undefined): number {
  if (requested === undefined) return UPLOAD_CHUNK_SIZE_DEFAULT;
  return Math.min(UPLOAD_CHUNK_SIZE_MAX, Math.max(UPLOAD_CHUNK_SIZE_MIN, requested));
}
