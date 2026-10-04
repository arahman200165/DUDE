import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { audit } from '../security/audit.js';
import { checkThrottleKeys, lockedReply, recordFailureKeys, recordSuccessKeys, throttleKeys } from '../security/throttle.js';
import { envelope } from '../server/errors.js';
import { getOwner, getStoredPassword } from './owner.js';
import { verifyPassword } from './password.js';

/**
 * Throttled owner-password re-verification shared by step-up, recovery-trust and the owner bearer exchange. Returns true
 * when it already replied (a reply is thenable, so it cannot be returned through an async helper). Never logs the password.
 */
export async function checkOwnerPassword(
  deps: { db: Db; now: () => number }, request: FastifyRequest, reply: FastifyReply, password: string, actor: { kind: 'owner' | 'device'; id: string },
): Promise<boolean> {
  const { db, now } = deps;
  const ip = request.ip || 'unknown';
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
