import type { FastifyReply, FastifyRequest } from 'fastify';
import { envelope } from '../server/errors.js';
import type { OwnerContext } from './owner-auth.js';
import { isSteppedUp } from './sessions.js';

/** preHandler run after `requireOwner`: 403 `step-up-required` unless the session recently confirmed the owner password. */
export function createRequireStepUp(now: () => number) {
  return async function requireStepUp(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply | undefined> {
    const ctx = request.owner as OwnerContext | undefined;
    if (ctx && isSteppedUp(ctx.session, now())) return undefined;
    return reply.code(403).type('application/json').header('Cache-Control', 'no-store').send(envelope('step-up-required', 'Confirm your password to continue.'));
  };
}
