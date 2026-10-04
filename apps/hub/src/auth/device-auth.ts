import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { DEVICE_TOKEN_PREFIX, resolveDeviceToken } from '../devices/device-tokens.js';
import type { DeviceContext } from '../devices/device-tokens.js';
import { touchLastSeen } from '../devices/registry.js';
import { noteRevokedToken } from '../devices/revoked-attempts.js';
import { classifyCredential } from '../security/request-guard.js';
import { envelope } from '../server/errors.js';
import { OWNER_BEARER_PREFIX } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest { device?: DeviceContext }
}

export interface DeviceAuthOptions { db: Db; now: () => number }

type Resolution = { ok: true; device: DeviceContext } | { ok: false; status: 400 | 401 | 403; code: 'bad-request' | 'unauthorized' | 'forbidden'; message: string };

export function resolveDevice(request: Pick<FastifyRequest, 'headers'>, options: DeviceAuthOptions): Resolution {
  const credential = classifyCredential(request);
  if (credential.conflict || credential.duplicateSession) return { ok: false, status: 400, code: 'bad-request', message: 'Send one credential type per request.' };
  // An owner credential never grants device rights (and a device route must not run on a browser session).
  if (credential.kind === 'cookie' || credential.bearerToken?.startsWith(OWNER_BEARER_PREFIX)) {
    return { ok: false, status: 403, code: 'forbidden', message: 'An owner credential cannot act as a device.' };
  }
  const token = credential.bearerToken;
  if (credential.kind !== 'bearer' || token === undefined || !token.startsWith(DEVICE_TOKEN_PREFIX)) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Device authentication is required.' };
  }
  const device = resolveDeviceToken(options.db, token, options.now());
  return device ? { ok: true, device } : { ok: false, status: 401, code: 'unauthorized', message: 'Device authentication is required.' };
}

/** Fastify preHandler: 401/403 envelope unless a valid `Authorization: Bearer ddt_...` resolves; attaches `request.device`. */
export function createRequireDevice(options: DeviceAuthOptions) {
  return async function requireDevice(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
    const result = resolveDevice(request, options);
    if (result.ok) {
      request.device = result.device;
      touchLastSeen(options.db, result.device.deviceId, options.now());
      return undefined;
    }
    if (result.status === 401) {
      const token = classifyCredential(request).bearerToken;
      // Failure path only: a token of an ended device is audited (rate-limited); the response is identical to an unknown token.
      if (token?.startsWith(DEVICE_TOKEN_PREFIX)) noteRevokedToken(options.db, token, 'token', request.ip || undefined, options.now());
    }
    return reply.code(result.status).type('application/json').header('Cache-Control', 'no-store').send(envelope(result.code, result.message));
  };
}
