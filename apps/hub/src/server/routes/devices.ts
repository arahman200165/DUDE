import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import {
  ConfirmApply, ConfirmPreview, DeviceIdParams, DeviceInfo, DeviceListResponse, DeviceRenameRequest, DeviceSelfUpdate, ErrorEnvelope, HUB_API_PREFIX,
  OkResponse, OwnerBearerRequest, OwnerBearerResponse, PairingCodeRequest, PairingCodeResponse, RecoveryTrustRequest, displayPairingCode, formatPairingString,
} from '@dude/contracts/hub';
import { emitRevoked } from '../../auth/hub-events.js';
import { getOwner, getStoredPassword } from '../../auth/owner.js';
import type { OwnerContext } from '../../auth/owner-auth.js';
import { verifyPassword } from '../../auth/password.js';
import { createSession } from '../../auth/sessions.js';
import { createPairingCode } from '../../devices/pairing.js';
import {
  activeKeyIds, deactivateDevice, getDevice, isDeviceActive, listDevices, renameDevice, setRecoveryTrust, updateSelf,
} from '../../devices/registry.js';
import { audit } from '../../security/audit.js';
import { ConfirmationStore } from '../../security/confirmation-store.js';
import type { HostGuard } from '../../security/host-guard.js';
import { checkThrottleKeys, lockedReply, recordFailureKeys, recordSuccessKeys, throttleKeys } from '../../security/throttle.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface DeviceRouteOptions {
  db: Db;
  now: () => number;
  confirmations: ConfirmationStore;
  requireOwner: Preparer;
  requireDevice: Preparer;
  hostGuard: HostGuard;
  spkiSha256: string;
}

export const REVOKE_DEVICE_ACTION = 'devices.revoke';

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');
const ipOf = (request: FastifyRequest): string => request.socket.remoteAddress ?? 'unknown';

/** Splits a Host header into its hostname (IPv6 stays bracketed) and port (443 when omitted). */
export function splitHostHeader(hostHeader: string): { hostname: string; port: number } {
  const bracket = hostHeader.startsWith('[') ? hostHeader.indexOf(']') : -1;
  const colon = bracket >= 0 ? (hostHeader[bracket + 1] === ':' ? bracket + 1 : -1) : hostHeader.lastIndexOf(':');
  if (colon < 0) return { hostname: hostHeader, port: 443 };
  const port = Number(hostHeader.slice(colon + 1));
  return { hostname: hostHeader.slice(0, colon), port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 443 };
}

/**
 * Credential types: owner cookie/bearer session (pairing codes, registry management), device token (`/devices/self`,
 * owner bearer exchange). A device credential never grants owner rights and vice versa.
 */
export function registerDeviceRoutes(app: FastifyInstance, options: DeviceRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const P = `${HUB_API_PREFIX}/devices`;
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const changed = (deviceId: string, change: 'enrolled' | 'renamed' | 'revoked' | 'unenrolled' | 'recovery-trust' | 'updated'): void => {
    app.hubEvents.emit('device-registry-changed', { deviceId, change });
  };

  /** Throttled password re-verification shared by recovery-trust and the owner bearer exchange. True when it already replied (a reply is thenable, so it cannot be returned through an async helper). */
  async function checkPassword(request: FastifyRequest, reply: FastifyReply, password: string, actor: { kind: 'owner' | 'device'; id: string }): Promise<boolean> {
    const ip = ipOf(request);
    const keys = throttleKeys.password(ip);
    const decision = checkThrottleKeys(db, keys, now());
    if (!decision.allowed) { void lockedReply(reply, decision.retryAfterMs); return true; }
    const owner = getOwner(db);
    const stored = owner ? getStoredPassword(db, owner.ownerId) : null;
    if (stored === null || !(await verifyPassword(password, stored))) {
      recordFailureKeys(db, keys, now());
      audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: actor.kind, actorId: actor.id, ip, detail: { kind: 'password' }, now: now() });
      void reply.code(403).send(envelope('forbidden', 'The password is not correct.'));
      return true;
    }
    recordSuccessKeys(db, keys);
    return false;
  }

  // --- Owner ---------------------------------------------------------------------------------------------------

  typed.post(
    `${HUB_API_PREFIX}/pairing-codes`,
    {
      preHandler: options.requireOwner,
      schema: { body: PairingCodeRequest, response: { 200: PairingCodeResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const { hostname, port } = splitHostHeader(request.headers.host ?? '');
      const host = request.body.host ?? hostname;
      if (request.body.host !== undefined && !options.hostGuard.isAllowed(`${host.toLowerCase()}:${port}`)) {
        return reply.code(400).send(envelope('bad-request', 'That host is not one of this Hub\'s allowed host names.'));
      }
      const created = createPairingCode(db, ctx.sessionHash, now());
      audit(db, { event: 'pairing.created', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), detail: { host, expiresAt: created.expiresAt }, now: now() });
      return reply.code(200).send({
        pairingCode: displayPairingCode(created.code),
        pairingString: formatPairingString({ host, port, code: created.code, spkiSha256: options.spkiSha256 }),
        expiresAt: created.expiresAt,
        hubUrl: `https://${host}${port === 443 ? '' : `:${port}`}`,
        spkiSha256: options.spkiSha256,
      });
    },
  );

  typed.get(
    P,
    { preHandler: options.requireOwner, schema: { response: { 200: DeviceListResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      return reply.code(200).send(listDevices(db, ctx.deviceId));
    },
  );

  typed.patch(
    `${P}/:deviceId`,
    {
      preHandler: options.requireOwner,
      schema: { params: DeviceIdParams, body: DeviceRenameRequest, response: { 200: DeviceInfo, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const displayName = request.body.displayName.trim();
      if (displayName.length === 0) return reply.code(400).send(envelope('bad-request', 'The display name cannot be empty.'));
      if (!renameDevice(db, request.params.deviceId, displayName)) return reply.code(404).send(envelope('not-found', 'No such device.'));
      audit(db, { event: 'device.renamed', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request), detail: { deviceId: request.params.deviceId }, now: now() });
      changed(request.params.deviceId, 'renamed');
      return reply.code(200).send(getDevice(db, request.params.deviceId, ctx.deviceId) as DeviceInfo);
    },
  );

  const revokeDigest = (deviceId: string): string => sha256Hex(`${deviceId}\n${activeKeyIds(db, deviceId).join(',')}`);

  typed.post(
    `${P}/:deviceId/revoke/preview`,
    {
      preHandler: options.requireOwner,
      schema: { params: DeviceIdParams, response: { 200: ConfirmPreview, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const { deviceId } = request.params;
      const device = getDevice(db, deviceId);
      if (!device || device.revokedAt !== null || device.unenrolledAt !== null) return reply.code(404).send(envelope('not-found', 'No such active device.'));
      const at = now();
      const confirmToken = options.confirmations.issue({ action: REVOKE_DEVICE_ACTION, digest: revokeDigest(deviceId), bindingId: ctx.sessionHash, now: at });
      return reply.code(200).send({
        confirmToken, expiresAt: ConfirmationStore.expiresAt(at),
        summary: { action: REVOKE_DEVICE_ACTION, deviceId, displayName: device.displayName, keys: activeKeyIds(db, deviceId).length },
      });
    },
  );

  typed.post(
    `${P}/:deviceId/revoke`,
    {
      preHandler: options.requireOwner,
      schema: { params: DeviceIdParams, body: ConfirmApply, response: { 200: OkResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 409: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const { deviceId } = request.params;
      const result = options.confirmations.consumeDetailed({
        token: request.body.confirmToken, action: REVOKE_DEVICE_ACTION, digest: revokeDigest(deviceId), bindingId: ctx.sessionHash, now: now(),
      });
      if (result === 'invalid') return reply.code(403).send(envelope('forbidden', 'The confirmation is missing, expired or already used.'));
      if (result === 'digest-mismatch') return reply.code(409).send(envelope('conflict', 'The device changed since the preview.'));
      const outcome = deactivateDevice(db, deviceId, 'revoked', now());
      if (outcome === null) return reply.code(404).send(envelope('not-found', 'No such active device.'));
      audit(db, {
        event: 'device.revoked', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request),
        detail: { deviceId, endedCredentials: outcome.revokedTokens, revokedSessions: outcome.revokedSessions.length }, now: now(),
      });
      emitRevoked(app, outcome.revokedSessions, 'device-revoked');
      app.hubEvents.emit('device-revoked', { deviceId });
      changed(deviceId, 'revoked');
      return reply.code(200).send({ ok: true });
    },
  );

  typed.put(
    `${P}/:deviceId/recovery-trust`,
    {
      preHandler: options.requireOwner,
      schema: { params: DeviceIdParams, body: RecoveryTrustRequest, response: { 200: DeviceInfo, 401: ErrorEnvelope, 403: ErrorEnvelope, 404: ErrorEnvelope, 423: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ctx = request.owner as OwnerContext;
      const { deviceId } = request.params;
      if (await checkPassword(request, reply, request.body.password, { kind: 'owner', id: ctx.ownerId })) return reply;
      if (!isDeviceActive(db, deviceId) || !setRecoveryTrust(db, deviceId, request.body.trusted)) return reply.code(404).send(envelope('not-found', 'No such active device.'));
      audit(db, {
        event: 'device.recovery-trust-changed', outcome: 'success', actorKind: 'owner', actorId: ctx.ownerId, ip: ipOf(request),
        detail: { deviceId, trusted: request.body.trusted }, now: now(),
      });
      changed(deviceId, 'recovery-trust');
      return reply.code(200).send(getDevice(db, deviceId, ctx.deviceId) as DeviceInfo);
    },
  );

  // --- Device --------------------------------------------------------------------------------------------------

  typed.get(
    `${P}/self`,
    { preHandler: options.requireDevice, schema: { response: { 200: DeviceInfo, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const id = request.device!.deviceId;
      return reply.code(200).send(getDevice(db, id, id) as DeviceInfo);
    },
  );

  typed.patch(
    `${P}/self`,
    {
      preHandler: options.requireDevice,
      schema: { body: DeviceSelfUpdate, response: { 200: DeviceInfo, 401: ErrorEnvelope, 403: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const id = request.device!.deviceId;
      updateSelf(db, id, request.body);
      if (request.body.displayName !== undefined) {
        audit(db, { event: 'device.renamed', outcome: 'success', actorKind: 'device', actorId: id, ip: ipOf(request), detail: { deviceId: id }, now: now() });
      }
      changed(id, 'updated');
      return reply.code(200).send(getDevice(db, id, id) as DeviceInfo);
    },
  );

  typed.post(
    `${P}/self/unenroll`,
    { preHandler: options.requireDevice, schema: { response: { 200: OkResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      nostore(reply);
      const id = request.device!.deviceId;
      const outcome = deactivateDevice(db, id, 'unenrolled', now());
      if (outcome === null) return reply.code(401).send(envelope('unauthorized', 'Device authentication is required.'));
      audit(db, {
        event: 'device.unenrolled', outcome: 'success', actorKind: 'device', actorId: id, ip: ipOf(request),
        detail: { deviceId: id, endedCredentials: outcome.revokedTokens, revokedSessions: outcome.revokedSessions.length }, now: now(),
      });
      emitRevoked(app, outcome.revokedSessions, 'device-unenrolled');
      app.hubEvents.emit('device-unenrolled', { deviceId: id });
      changed(id, 'unenrolled');
      return reply.code(200).send({ ok: true });
    },
  );

  typed.post(
    `${HUB_API_PREFIX}/auth/owner/bearer`,
    {
      preHandler: options.requireDevice,
      schema: { body: OwnerBearerRequest, response: { 200: OwnerBearerResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 423: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      if (await checkPassword(request, reply, request.body.password, { kind: 'device', id: deviceId })) return reply;
      const owner = getOwner(db);
      if (owner === null) return reply.code(401).send(envelope('unauthorized', 'Authentication is required.'));
      const ua = request.headers['user-agent'];
      const created = createSession(db, {
        ownerId: owner.ownerId, kind: 'bearer', deviceId, userAgent: typeof ua === 'string' ? ua : undefined, ip: ipOf(request), now: now(),
      });
      audit(db, { event: 'owner.sign-in', outcome: 'success', actorKind: 'owner', actorId: owner.ownerId, ip: ipOf(request), detail: { via: 'device', deviceId }, now: now() });
      return reply.code(200).send({
        accessToken: created.token, expiresAt: created.record.absoluteExpiresAt, owner: { ownerId: owner.ownerId, displayName: owner.displayName },
      });
    },
  );
}
