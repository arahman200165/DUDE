import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import type { OwnerContext } from '../../auth/owner-auth.js';
import type { CommitActor } from '../../db/canonical-repository.js';
import { boundBrowser } from '../../devices/browsers.js';
import { DEVICE_TOKEN_PREFIX } from '../../devices/device-tokens.js';
import { classifyCredential } from '../../security/request-guard.js';

export type Preparer = (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;

/** The authenticated caller of a collaboration REST route, whichever credential it presented. */
export interface CollabCaller {
  kind: 'owner-cookie' | 'owner-bearer' | 'device';
  /** Audit actor: the owner, or the device. */
  actorKind: 'owner' | 'device';
  actorId: string;
  /** The registry row the work is attributed to (a device, a bound owner-bearer's device, or the cookie session's attached browser row). */
  rowId: string | null;
  deviceId: string | null;
  boundDeviceId: string | null;
  actor: CommitActor | undefined;
}

export interface CollabCallers {
  /** preHandler: an owner cookie or bearer session, or a device token (a device gains no owner right elsewhere). */
  requireCaller: Preparer;
  /** The caller `requireCaller` resolved for this request. */
  callerOf(request: FastifyRequest): CollabCaller;
}

/** Credential resolution shared by the collaboration REST routes (rooms, kept documents, history). */
export function createCollabCallers(options: { db: Db; requireOwner: Preparer; requireDevice: Preparer }): CollabCallers {
  const { db } = options;
  const callers = new WeakMap<FastifyRequest, CollabCaller>();

  const requireCaller: Preparer = async (request, reply) => {
    const isDevice = classifyCredential(request).bearerToken?.startsWith(DEVICE_TOKEN_PREFIX) === true;
    const denied = isDevice ? await options.requireDevice(request, reply) : await options.requireOwner(request, reply);
    if (denied !== undefined) return denied;
    if (isDevice) {
      const device = request.device!;
      callers.set(request, {
        kind: 'device', actorKind: 'device', actorId: device.deviceId, rowId: device.deviceId, deviceId: device.deviceId, boundDeviceId: null,
        actor: { kind: 'device', deviceId: device.deviceId, keyId: device.keyId },
      });
      return undefined;
    }
    const ctx = request.owner as OwnerContext;
    const browser = ctx.kind === 'cookie' ? boundBrowser(db, ctx.sessionHash) : null;
    callers.set(request, {
      kind: ctx.kind === 'cookie' ? 'owner-cookie' : 'owner-bearer', actorKind: 'owner', actorId: ctx.ownerId,
      rowId: ctx.kind === 'cookie' ? (browser?.deviceId ?? null) : ctx.deviceId, deviceId: null, boundDeviceId: ctx.kind === 'bearer' ? ctx.deviceId : null,
      actor: browser ? { kind: 'browser', deviceId: browser.deviceId, sessionHash: ctx.sessionHash } : undefined,
    });
    return undefined;
  };

  return { requireCaller, callerOf: (request) => callers.get(request)! };
}
