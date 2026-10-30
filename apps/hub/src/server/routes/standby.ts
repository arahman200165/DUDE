import { Readable } from 'node:stream';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import {
  ErrorEnvelope, HUB_STANDBY_PATHS, STANDBY_CONTENT_TYPE, STANDBY_MAX_CONCURRENT_STREAMS, StandbyDestinationParams, StandbyObjectBytes, StandbyObjectQuery,
  StandbyObjectsQuery, StandbyObjectsResponse, StandbyRepositoriesResponse, parseStandbyRange,
} from '@dude/contracts/hub';
import type { HubBackupConfig, HubBackupLocalFolderDestination } from '../../config/hub-config.js';
import { readDestinationState } from '../../hub/backup-destination-state.js';
import { audit } from '../../security/audit.js';
import { standbyGrantOf } from '../../standby/grants.js';
import { listStandbyObjects, readStandbyRange, standbyDefinitions, statStandbyObject } from '../../standby/repositories.js';
import type { OpenStandbyDestination } from '../../standby/repositories.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface StandbyRouteOptions {
  db: Db;
  now: () => number;
  /** The device-token resolver with its per-device rate-limit bucket (`device:<id>`), as every device route uses. */
  requireDevice: Preparer;
  /** The `hub.json` backup block, read per request (destinations are added and removed by the elevated CLI while the Hub runs). */
  backupConfig: () => HubBackupConfig | undefined;
  /** Opens a local-folder destination read-only, re-applying the location rule (`standby/repositories.ts`). */
  openDestination: OpenStandbyDestination;
}

/** `standby.denied` at most once per device per hour; `standby.pulled` once per device and backup (both in memory, bounded). */
export const STANDBY_DENIED_AUDIT_INTERVAL_MS = 3600_000;
const AUDIT_MEMORY_MAX = 1024;

const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';
const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
const ERRORS = { 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope, 416: ErrorEnvelope, 429: ErrorEnvelope } as const;

/**
 * The warm-standby pull routes (32-SS1, Milestone 849, PD-151); contracts `@dude/contracts/hub` `standby.schema.ts`.
 *
 * Credential type: a DEVICE TOKEN only, resolved by `requireDevice` (so a revoked device is refused on its next call, and the per-device
 * bucket applies), whose active desktop row holds the owner's standby grant (`standby/grants.ts`, re-read on every request). Without the
 * grant the answer is 403 `forbidden`, exactly like the notification reader grant; an owner session is the device resolver's 403 and ingest
 * tokens and anonymous callers its 401, so none of them reaches the grant check. The Hub never pushes: these are GETs a device makes.
 *
 * What is served: the stored objects of the Hub's `local-folder` backup destinations, byte for byte, which are ciphertext (the master key
 * is wrapped under the owner's passphrase in `repo`; packs and manifests are sealed). Nothing here opens a repository, reads a key or a
 * passphrase, decrypts, or names a folder. Objects of a run that has not been recorded are hidden.
 *
 * Audit: `standby.denied` (a device without the grant, at most hourly per device) and `standby.pulled` (a device received the LAST byte of
 * a manifest, the backup's commit point, once per device and backup); listing and pack reads are not audited (they would drown the log),
 * like notification reads. Never a token, a path or bytes in the detail.
 */
export function registerStandbyRoutes(app: FastifyInstance, options: StandbyRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const deniedAt = new Map<string, number>();
  const pulled = new Set<string>();
  const openStreams = new Map<string, number>();

  const remember = <T>(collection: Map<string, T> | Set<string>): void => {
    if (collection.size < AUDIT_MEMORY_MAX) return;
    const oldest = collection.keys().next().value;
    if (oldest !== undefined) collection.delete(oldest);
  };

  const requireStandby: Preparer = async (request, reply) => {
    const denied = await options.requireDevice(request, reply);
    if (denied !== undefined) return denied;
    const deviceId = request.device!.deviceId;
    if (standbyGrantOf(db, deviceId) !== null) return undefined;
    const at = now();
    const last = deniedAt.get(deviceId);
    if (last === undefined || at - last >= STANDBY_DENIED_AUDIT_INTERVAL_MS) {
      deniedAt.delete(deviceId);
      remember(deniedAt);
      deniedAt.set(deviceId, at);
      audit(db, { event: 'standby.denied', outcome: 'denied', actorKind: 'device', actorId: deviceId, ip: ipOf(request), detail: { deviceId, reason: 'no-grant' }, now: at });
    }
    return reply.code(403).type('application/json').header('Cache-Control', 'no-store').send(envelope('forbidden', 'This device has not been granted standby access.'));
  };

  const definitionOf = (id: string): HubBackupLocalFolderDestination | undefined => standbyDefinitions(options.backupConfig()).find((d) => d.id === id);
  const unavailable = (reply: FastifyReply): FastifyReply => reply.code(409).send(envelope('conflict', 'That backup repository is not available right now.'));

  typed.get(
    HUB_STANDBY_PATHS.repositories,
    { preHandler: requireStandby, schema: { response: { 200: StandbyRepositoriesResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 429: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      const grant = standbyGrantOf(db, deviceId)!;
      const repositories = standbyDefinitions(options.backupConfig()).map((d) => {
        const state = readDestinationState(db, d.id);
        return { id: d.id, kind: 'local-folder' as const, label: d.label, lastSuccessAt: state.lastSuccessAt ?? null, lastBackupId: state.lastBackupId ?? null };
      });
      return reply.code(200).send({ deviceId, grantedAt: grant.grantedAt, repositories });
    },
  );

  typed.get(
    `${HUB_STANDBY_PATHS.repositories}/:destinationId/objects`,
    { preHandler: requireStandby, schema: { params: StandbyDestinationParams, querystring: StandbyObjectsQuery, response: { 200: StandbyObjectsResponse, ...ERRORS } } },
    async (request, reply) => {
      nostore(reply);
      const definition = definitionOf(request.params.destinationId);
      if (definition === undefined) return reply.code(404).send(envelope('not-found', 'No such backup repository.'));
      const { prefix, after, limit } = request.query;
      try {
        const page = await listStandbyObjects(db, options.openDestination(definition), {
          ...(prefix !== undefined ? { prefix } : {}), ...(after !== undefined ? { after } : {}), ...(limit !== undefined ? { limit: Number(limit) } : {}),
        });
        return reply.code(200).send(page);
      } catch {
        return unavailable(reply);
      }
    },
  );

  typed.get(
    `${HUB_STANDBY_PATHS.repositories}/:destinationId/object`,
    {
      // No automatic HEAD: the listing carries every size, and a HEAD must not count as a pull.
      exposeHeadRoute: false,
      preHandler: requireStandby,
      schema: { params: StandbyDestinationParams, querystring: StandbyObjectQuery, response: { 200: StandbyObjectBytes, 206: StandbyObjectBytes, ...ERRORS } },
    },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      const definition = definitionOf(request.params.destinationId);
      if (definition === undefined) return reply.code(404).send(envelope('not-found', 'No such backup repository.'));
      const name = request.query.name;
      let destination;
      let size: number | null;
      try {
        destination = options.openDestination(definition);
        size = await statStandbyObject(db, destination, name);
      } catch {
        return unavailable(reply);
      }
      if (size === null) return reply.code(404).send(envelope('not-found', 'No such backup object.'));
      const header = request.headers.range;
      const range = parseStandbyRange(Array.isArray(header) ? header.join(',') : header, size);
      if (range === 'unsatisfiable') {
        return reply.code(416).header('Content-Range', `bytes */${size}`).send(envelope('bad-request', 'Only one satisfiable byte range is served.'));
      }
      const open = openStreams.get(deviceId) ?? 0;
      if (open >= STANDBY_MAX_CONCURRENT_STREAMS) {
        return reply.code(429).header('Retry-After', '1').send(envelope('rate-limited', 'Too many object downloads at once from this device.'));
      }
      openStreams.set(deviceId, open + 1);
      reply.raw.once('close', () => {
        const left = (openStreams.get(deviceId) ?? 1) - 1;
        if (left <= 0) openStreams.delete(deviceId); else openStreams.set(deviceId, left);
      });
      const start = range?.start ?? 0;
      const end = range?.end ?? size - 1;
      const length = size === 0 ? 0 : end - start + 1;
      const backupId = name.startsWith('manifests/') ? name.slice('manifests/'.length) : null;
      if (backupId !== null && end === size - 1) {
        const key = `${deviceId}\n${definition.id}\n${backupId}`;
        reply.raw.once('finish', () => {
          if (pulled.has(key)) return;
          remember(pulled);
          pulled.add(key);
          try {
            audit(db, { event: 'standby.pulled', outcome: 'success', actorKind: 'device', actorId: deviceId, ip: ipOf(request), detail: { deviceId, destination: definition.id, backupId }, now: now() });
          } catch { /* auditing a completed download never fails it */ }
        });
      }
      void reply
        .code(range === null ? 200 : 206)
        .header('Content-Type', STANDBY_CONTENT_TYPE)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', String(length));
      if (range !== null) void reply.header('Content-Range', `bytes ${start}-${end}/${size}`);
      // A stream bypasses the response serializer; the schema documents the bytes.
      return (reply as FastifyReply).send(Readable.from(readStandbyRange(destination, name, start, length), { objectMode: false }));
    },
  );
}
