import Type, { type Static } from 'typebox';

/**
 * Warm standby pull (32-SS1, Milestone 849, PD-151). A paired desktop PULLS the encrypted backup v2 repository objects of the Hub's
 * `local-folder` destinations; the Hub never pushes to a device. The bytes are the repository objects exactly as stored (`repo`,
 * `packs/<id>`, `manifests/<backupId>`): ciphertext the device cannot decrypt without the owner's backup passphrase. The Hub never
 * serves plaintext, the master key or the passphrase on these routes.
 *
 * Credential type, every route: a DEVICE TOKEN (`Authorization: Bearer ddt_...`) whose active desktop row holds the owner's standby grant.
 * The grant is set and revoked only on the elevated admin pipe (`dude-hub standby grant|revoke <deviceId>`, two-step, audited as
 * `standby.granted` / `standby.revoked`). A device token without the grant is 403 `forbidden`; an owner cookie or bearer session is 403 (an
 * owner credential cannot act as a device); an ingest token, an unknown, revoked or unenrolled device and anonymous callers are 401.
 *
 * - `GET /api/v1/standby/repositories`                                   the grant and the servable repositories (never a folder path).
 * - `GET /api/v1/standby/repositories/:destinationId/objects`            committed objects, sorted by name, paged (`after`, `limit`); objects of
 *                                                                         a backup run that has not been recorded yet are hidden.
 * - `GET /api/v1/standby/repositories/:destinationId/object?name=<name>` one object's bytes (`application/octet-stream`), streamed; one
 *                                                                         `Range: bytes=a-b | a- | -n` gives 206 with `Content-Range`; any other
 *                                                                         or unsatisfiable range is 416 with `Content-Range: bytes * /<size>`.
 *
 * A puller mirrors packs FIRST and each manifest LAST (the manifest is a backup's commit point, as in the writer), deletes locally what the
 * listing no longer shows (retention prune), and re-fetches `repo` whole whenever its size changes (a passphrase re-wrap replaces it).
 */
export const HUB_STANDBY_PATH = '/api/v1/standby';
export const HUB_STANDBY_PATHS = { repositories: `${HUB_STANDBY_PATH}/repositories` } as const;
export const standbyObjectsPath = (destinationId: string): string => `${HUB_STANDBY_PATHS.repositories}/${encodeURIComponent(destinationId)}/objects`;
export const standbyObjectPath = (destinationId: string, name: string): string =>
  `${HUB_STANDBY_PATHS.repositories}/${encodeURIComponent(destinationId)}/object?name=${encodeURIComponent(name)}`;

export const STANDBY_CONTENT_TYPE = 'application/octet-stream';
/** Objects per listing page (default and ceiling). */
export const STANDBY_LIST_LIMIT_DEFAULT = 1000;
export const STANDBY_LIST_LIMIT_MAX = 5000;
/** Object streams one device may have open at once; more is 429. */
export const STANDBY_MAX_CONCURRENT_STREAMS = 4;

/** The admin-pipe confirmation actions of the grant and the revoke (single-use token bound to the device) and their consequence class tags. */
export const STANDBY_GRANT_ACTION = 'standby.grant';
export const STANDBY_REVOKE_ACTION = 'standby.revoke';
export const STANDBY_CONSEQUENCE_CLASS = ['authentication', 'database-write'] as const;

/** The object names a backup v2 repository holds (the Hub's `BACKUP_OBJECT_NAME_PATTERN`, split so a schema can enumerate them). */
export const STANDBY_REPO_OBJECT = 'repo';
export const STANDBY_PACK_NAME_PATTERN = '^packs/[0-9a-f]{32}$';
export const STANDBY_MANIFEST_NAME_PATTERN = '^manifests/[0-9]{8}T[0-9]{6}Z-[0-9a-f]{32}$';
export const STANDBY_OBJECT_PREFIXES = ['repo', 'manifests/', 'packs/'] as const;
export type StandbyObjectPrefix = (typeof STANDBY_OBJECT_PREFIXES)[number];

export const StandbyObjectName = Type.Union([
  Type.Literal(STANDBY_REPO_OBJECT),
  Type.String({ pattern: STANDBY_PACK_NAME_PATTERN }),
  Type.String({ pattern: STANDBY_MANIFEST_NAME_PATTERN }),
]);
export type StandbyObjectName = Static<typeof StandbyObjectName>;

export const StandbyDestinationParams = Type.Object({ destinationId: Type.String({ pattern: '^[a-z0-9][a-z0-9-]{0,31}$' }) });
export type StandbyDestinationParams = Static<typeof StandbyDestinationParams>;

const Instant = Type.String({ minLength: 1, maxLength: 40 });

/** A destination the standby may pull: never its folder. `lastBackupId` / `lastSuccessAt` let a puller skip a poll when nothing changed. */
export const StandbyRepository = Type.Object({
  id: Type.String(),
  kind: Type.Literal('local-folder'),
  label: Type.String(),
  lastSuccessAt: Type.Union([Instant, Type.Null()]),
  lastBackupId: Type.Union([Type.String(), Type.Null()]),
});
export type StandbyRepository = Static<typeof StandbyRepository>;

export const StandbyRepositoriesResponse = Type.Object({
  deviceId: Type.String(),
  grantedAt: Instant,
  repositories: Type.Array(StandbyRepository),
});
export type StandbyRepositoriesResponse = Static<typeof StandbyRepositoriesResponse>;

/** The Hub does not coerce query types: `limit` arrives as digits. `after` is exclusive. */
export const StandbyObjectsQuery = Type.Object({
  prefix: Type.Optional(Type.Unsafe<StandbyObjectPrefix>({ type: 'string', enum: [...STANDBY_OBJECT_PREFIXES] })),
  after: Type.Optional(StandbyObjectName),
  limit: Type.Optional(Type.String({ pattern: '^[0-9]{1,4}$' })),
});
export type StandbyObjectsQuery = Static<typeof StandbyObjectsQuery>;

export const StandbyObjectInfo = Type.Object({ name: Type.String(), size: Type.Integer({ minimum: 0 }) });
export type StandbyObjectInfo = Static<typeof StandbyObjectInfo>;

export const StandbyObjectsResponse = Type.Object({
  /** Ascending by name (`manifests/` sort by time, then `packs/`, then `repo`). */
  objects: Type.Array(StandbyObjectInfo),
  /** Pass as `after` for the next page; null on the last page. */
  next: Type.Union([Type.String(), Type.Null()]),
});
export type StandbyObjectsResponse = Static<typeof StandbyObjectsResponse>;

export const StandbyObjectQuery = Type.Object({ name: StandbyObjectName });
export type StandbyObjectQuery = Static<typeof StandbyObjectQuery>;

/** The 200/206 body: raw ciphertext bytes (`application/octet-stream`), never JSON. */
export const StandbyObjectBytes = Type.Unsafe<Uint8Array>({ type: 'string', description: 'application/octet-stream: the stored (encrypted) object bytes or the requested range' });

/** A grant as the admin pipe lists it (never a credential). `active` is false once the device was revoked, unenrolled or re-enrolled. */
export const StandbyGrantInfo = Type.Object({
  deviceId: Type.String(),
  displayName: Type.Union([Type.String(), Type.Null()]),
  grantedAt: Instant,
  active: Type.Boolean(),
});
export type StandbyGrantInfo = Static<typeof StandbyGrantInfo>;

/** Parses one `Range: bytes=...` value against an object of `size` bytes: the inclusive span, `null` for no header, `'unsatisfiable'` otherwise. */
export function parseStandbyRange(header: string | undefined, size: number): { start: number; end: number } | null | 'unsatisfiable' {
  if (header === undefined) return null;
  const match = /^bytes=(\d{0,16})-(\d{0,16})$/.exec(header.trim());
  if (match === null) return 'unsatisfiable';
  const [, a = '', b = ''] = match;
  if (a === '' && b === '') return 'unsatisfiable';
  if (a === '') {
    const suffix = Number(b);
    if (suffix === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(a);
  const end = b === '' ? size - 1 : Math.min(Number(b), size - 1);
  if (start >= size || (b !== '' && Number(b) < start)) return 'unsatisfiable';
  return { start, end };
}
