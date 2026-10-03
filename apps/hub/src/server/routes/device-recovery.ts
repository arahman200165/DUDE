import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import {
  DEVICE_CHALLENGE_TTL_MS, DeviceRecoveryChallengeResponse, DeviceRecoveryRequest, ErrorEnvelope, HUB_API_PREFIX, OWNER_RECOVERY_CHALLENGE_PURPOSE,
  OWNER_RECOVERY_PLATFORMS, OkResponse, ownerRecoveryMessage,
} from '@dude/contracts/hub';
import { emitRevoked } from '../../auth/hub-events.js';
import { getOwner, setStoredPassword } from '../../auth/owner.js';
import { hashPassword, validateOwnerPassword } from '../../auth/password.js';
import type { PasswordParams } from '../../auth/password.js';
import { revokeAllSessions } from '../../auth/sessions.js';
import { ED25519_SIGNATURE_BYTES, decodeBase64url, verifyEd25519 } from '../../devices/keys.js';
import { getDevice } from '../../devices/registry.js';
import { audit } from '../../security/audit.js';
import { checkThrottle, checkThrottleKeys, lockedReply, recordFailure, recordFailureKeys, recordSuccess, recordSuccessKeys, throttleKeys } from '../../security/throttle.js';
import { envelope } from '../errors.js';

type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

export interface DeviceRecoveryRouteOptions {
  db: Db;
  now: () => number;
  hubInstanceId: string;
  requireDevice: Preparer;
  passwordParams?: PasswordParams;
}

const iso = (ms: number): string => new Date(ms).toISOString();
const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';

/** The device is active, a desktop platform and explicitly marked recovery-trusted by the owner. */
export function isRecoveryEligible(db: Db, deviceId: string): boolean {
  const device = getDevice(db, deviceId);
  return device !== null && device.revokedAt === null && device.unenrolledAt === null && device.recoveryTrusted
    && (OWNER_RECOVERY_PLATFORMS as readonly string[]).includes(device.platform);
}

/**
 * Credential type: device token. Device-assisted owner recovery (PD-029): the desktop's Hello/CredUI step is a
 * client-side UI gate the Hub cannot verify; the Hub-side guards are the trust flag, the signed single-use challenge,
 * throttling per device and per IP, the audit trail and the realtime notice.
 */
export function registerDeviceRecoveryRoutes(app: FastifyInstance, options: DeviceRecoveryRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');
  const deviceKey = (deviceId: string): string => `device-recovery:device:${deviceId}`;

  const deny = (request: FastifyRequest, reply: FastifyReply, deviceId: string): FastifyReply => {
    audit(db, { event: 'auth.failure', outcome: 'denied', actorKind: 'device', actorId: deviceId, ip: ipOf(request), detail: { kind: 'device-recovery', deviceId }, now: now() });
    return reply.code(403).send(envelope('forbidden', 'This device is not allowed to recover the owner account.'));
  };

  typed.post(
    `${HUB_API_PREFIX}/auth/device-recovery/challenge`,
    {
      preHandler: options.requireDevice,
      config: { authLimited: true },
      schema: { response: { 200: DeviceRecoveryChallengeResponse, 401: ErrorEnvelope, 403: ErrorEnvelope, 423: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      if (!isRecoveryEligible(db, deviceId)) return deny(request, reply, deviceId);
      const at = now();
      const nonce = randomBytes(32).toString('base64url');
      const expiresAt = iso(at + DEVICE_CHALLENGE_TTL_MS);
      db.prepare('DELETE FROM challenges WHERE expires_at <= ?').run(iso(at));
      db.prepare('INSERT INTO challenges(nonce, purpose, device_id, created_at, expires_at, consumed_at) VALUES(?, ?, ?, ?, ?, NULL)').run(
        nonce, OWNER_RECOVERY_CHALLENGE_PURPOSE, deviceId, iso(at), expiresAt,
      );
      return reply.code(200).send({ nonce, expiresAt });
    },
  );

  typed.post(
    `${HUB_API_PREFIX}/auth/device-recovery`,
    {
      preHandler: options.requireDevice,
      config: { authLimited: true },
      schema: { body: DeviceRecoveryRequest, response: { 200: OkResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 403: ErrorEnvelope, 423: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const deviceId = request.device!.deviceId;
      const ip = ipOf(request);
      const keys = throttleKeys['recovery-code'](ip);
      const perDevice = deviceKey(deviceId);
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);
      const deviceDecision = checkThrottle(db, perDevice, now());
      if (!deviceDecision.allowed) return lockedReply(reply, deviceDecision.retryAfterMs);

      const fail = (): void => { recordFailureKeys(db, keys, now()); recordFailure(db, perDevice, now()); };
      if (!isRecoveryEligible(db, deviceId)) { fail(); return deny(request, reply, deviceId); }
      const owner = getOwner(db);
      if (owner === null) return reply.code(401).send(envelope('unauthorized', 'Authentication is required.'));

      // The policy is checked before the nonce is consumed, so a rejected password never burns a challenge.
      const policy = validateOwnerPassword(request.body.newPassword);
      if (!policy.ok) return reply.code(400).send(envelope('bad-request', `Password rejected: ${policy.reason}.`));
      const credential = await hashPassword(request.body.newPassword, options.passwordParams);

      const outcome = transaction(db, () => {
        const at = iso(now());
        // The nonce is consumed whatever the signature says, so it is never retried.
        const claimed = db
          .prepare('UPDATE challenges SET consumed_at = ? WHERE nonce = ? AND purpose = ? AND device_id = ? AND consumed_at IS NULL AND expires_at > ?')
          .run(at, request.body.nonce, OWNER_RECOVERY_CHALLENGE_PURPOSE, deviceId, at);
        if (Number(claimed.changes) !== 1) return null;
        if (!isRecoveryEligible(db, deviceId)) return null;
        const signature = decodeBase64url(request.body.signature, ED25519_SIGNATURE_BYTES);
        if (signature === null) return null;
        const message = ownerRecoveryMessage({ hubInstanceId: options.hubInstanceId, nonce: request.body.nonce, deviceId });
        const stored = db.prepare('SELECT public_key FROM device_keys WHERE device_id = ? AND revoked_at IS NULL').all(deviceId) as unknown as Array<{ public_key: Uint8Array }>;
        if (!stored.some((k) => verifyEd25519(k.public_key, message, signature))) return null;
        setStoredPassword(db, owner.ownerId, credential, now());
        const revoked = revokeAllSessions(db, owner.ownerId, undefined, now());
        audit(db, { event: 'owner.recovery-device', outcome: 'success', actorKind: 'device', actorId: deviceId, ip, detail: { deviceId, revokedSessions: revoked.length }, now: now() });
        return { revoked };
      });
      if (outcome === null) {
        fail();
        audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: 'device', actorId: deviceId, ip, detail: { kind: 'device-recovery', deviceId }, now: now() });
        return reply.code(401).send(envelope('unauthorized', 'The recovery request could not be verified.'));
      }
      recordSuccessKeys(db, keys);
      recordSuccess(db, perDevice);
      app.hubEvents.emit('owner-recovered', { deviceId, at: iso(now()) });
      emitRevoked(app, outcome.revoked, 'device-recovery');
      return reply.code(200).send({ ok: true });
    },
  );
}
