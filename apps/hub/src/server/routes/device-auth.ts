import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import {
  DeviceChallengeRequest, DeviceChallengeResponse, DeviceTokenRequest, DeviceTokenResponse, EnrollRequest, EnrollResponse, ErrorEnvelope, HUB_API_PREFIX,
  enrollMessage,
} from '@dude/contracts/hub';
import { currentRevision } from '../../db/canonical-repository.js';
import { createChallenge, redeemChallenge } from '../../devices/device-tokens.js';
import { ED25519_PUBLIC_KEY_BYTES, ED25519_SIGNATURE_BYTES, decodeBase64url, publicKeyFromRaw, verifyEd25519 } from '../../devices/keys.js';
import { consumePairingCode, normalizeSubmittedCode, pairingCodeIsLive, recordWrongPairingAttempt } from '../../devices/pairing.js';
import { enrollDevice } from '../../devices/registry.js';
import { isRevokedDevice, noteRevokedAttempt } from '../../devices/revoked-attempts.js';
import { audit } from '../../security/audit.js';
import { checkThrottleKeys, lockedReply, recordFailureKeys, recordSuccessKeys, throttleKeys } from '../../security/throttle.js';
import { envelope } from '../errors.js';

export interface DeviceAuthRouteOptions {
  db: Db;
  now: () => number;
  hubInstanceId: string;
}

const ipOf = (request: FastifyRequest): string => request.ip || 'unknown';

/**
 * Credential type: none (the credential is proof of key possession plus a pairing code or a fresh challenge). These are
 * `credentialless` routes, so a stale session cookie never demands a CSRF token; non-browser clients may omit Origin
 * (see the request guard), browsers are held to the same-origin checks.
 */
export function registerDeviceAuthRoutes(app: FastifyInstance, options: DeviceAuthRouteOptions): void {
  const { db, now } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const nostore = (reply: FastifyReply): void => void reply.header('Cache-Control', 'no-store');

  typed.post(
    `${HUB_API_PREFIX}/devices/enroll`,
    {
      config: { authLimited: true, credentialless: true },
      schema: { body: EnrollRequest, response: { 200: EnrollResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 409: ErrorEnvelope, 423: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ip = ipOf(request);
      const keys = throttleKeys.pairing(ip);
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);
      const body = request.body;
      const reject = (detail: 'pairing' | 'device-signature', message: string): FastifyReply => {
        recordFailureKeys(db, keys, now());
        audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: 'anonymous', ip, detail: { kind: detail, deviceId: body.device.deviceId }, now: now() });
        return reply.code(401).send(envelope('unauthorized', message));
      };

      const code = normalizeSubmittedCode(body.pairingCode);
      const publicKey = decodeBase64url(body.publicKey, ED25519_PUBLIC_KEY_BYTES);
      const signature = decodeBase64url(body.signature, ED25519_SIGNATURE_BYTES);
      if (publicKey === null || signature === null || publicKeyFromRaw(publicKey) === null) return reject('device-signature', 'The device key or signature is not valid.');
      if (code === null) {
        recordWrongPairingAttempt(db, now());
        return reject('pairing', 'The pairing code is not valid.');
      }
      // Proof of possession: the signature covers this Hub, the code, the device id and the very key being registered.
      const message = enrollMessage({ hubInstanceId: options.hubInstanceId, pairingCode: code, deviceId: body.device.deviceId, publicKey: body.publicKey });
      if (!verifyEd25519(publicKey, message, signature)) return reject('device-signature', 'The device signature is not valid.');
      if (!pairingCodeIsLive(db, code, now())) {
        recordWrongPairingAttempt(db, now());
        return reject('pairing', 'The pairing code is not valid.');
      }

      const outcome = enrollDevice(db, { device: body.device, publicKey, now: now() }, () => consumePairingCode(db, code, body.device.deviceId, now()));
      if (outcome.status === 'code-rejected') return reject('pairing', 'The pairing code is not valid.');
      if (outcome.status === 'active-conflict') return reply.code(409).send(envelope('conflict', 'That device is already enrolled.'));
      if (outcome.status === 'key-reused') return reply.code(409).send(envelope('conflict', 'A revoked key cannot be enrolled again; generate a new key.'));
      if (outcome.status === 'no-environment') return reply.code(409).send(envelope('conflict', 'This Hub has no owner yet.'));

      recordSuccessKeys(db, keys);
      audit(db, {
        event: 'device.enrolled', outcome: 'success', actorKind: 'device', actorId: body.device.deviceId, ip,
        detail: { deviceId: body.device.deviceId, platform: body.device.platform, protocolVersion: body.device.protocolVersion }, now: now(),
      });
      app.hubEvents.emit('device-registry-changed', { deviceId: body.device.deviceId, change: 'enrolled' });
      return reply.code(200).send({
        deviceId: body.device.deviceId, environmentId: outcome.environmentId, hubInstanceId: options.hubInstanceId, keyId: outcome.keyId,
        registeredAt: outcome.registeredAt, hubRevision: currentRevision(db),
      });
    },
  );

  typed.post(
    `${HUB_API_PREFIX}/auth/device/challenge`,
    {
      config: { authLimited: true, credentialless: true },
      schema: { body: DeviceChallengeRequest, response: { 200: DeviceChallengeResponse, 400: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      // A revoked or unenrolled id gets the same well-formed (never stored) nonce as an unknown id; it is only audited.
      if (isRevokedDevice(db, request.body.deviceId)) noteRevokedAttempt(db, { deviceId: request.body.deviceId, via: 'challenge', ip: ipOf(request), now: now() });
      return reply.code(200).send(createChallenge(db, request.body.deviceId, now()));
    },
  );

  typed.post(
    `${HUB_API_PREFIX}/auth/device/token`,
    {
      config: { authLimited: true, credentialless: true },
      schema: { body: DeviceTokenRequest, response: { 200: DeviceTokenResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 423: ErrorEnvelope } },
    },
    async (request, reply) => {
      nostore(reply);
      const ip = ipOf(request);
      const keys = throttleKeys['device-challenge'](ip);
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);
      const issued = redeemChallenge(db, {
        deviceId: request.body.deviceId, nonce: request.body.nonce, signature: request.body.signature, hubInstanceId: options.hubInstanceId, now: now(),
      });
      if (issued === null) {
        recordFailureKeys(db, keys, now());
        if (isRevokedDevice(db, request.body.deviceId)) noteRevokedAttempt(db, { deviceId: request.body.deviceId, via: 'redeem', ip, now: now() });
        audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: 'anonymous', ip, detail: { kind: 'device-signature', deviceId: request.body.deviceId }, now: now() });
        return reply.code(401).send(envelope('unauthorized', 'The device could not be authenticated.'));
      }
      recordSuccessKeys(db, keys);
      return reply.code(200).send({ accessToken: issued.accessToken, expiresAt: issued.expiresAt });
    },
  );
}
