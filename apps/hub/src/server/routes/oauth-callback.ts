import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Type from 'typebox';
import type { Db } from '@dude/sqlite-store';
import { ErrorEnvelope } from '@dude/contracts/hub';
import type { OAuthAuthorizations } from '../../hub/oauth-authorization.js';
import { audit } from '../../security/audit.js';
import { checkThrottleKeys, lockedReply, recordFailureKeys, throttleKeys } from '../../security/throttle.js';

/**
 * The one HTTP route of a backup destination's OAuth consent (32-SS1, Milestones 856 and 857, PD-154, PD-150): the browser redirect
 * back from the provider's consent screen. `drive-callback.ts` (Google) and `onedrive-callback.ts` (Microsoft) register it for their
 * path; the contract is `@dude/contracts/hub` `backup.schema.ts`.
 *
 * Credential type: none and SESSION-LESS. `security/cross-site-get.ts` exempts the exact GET from the cross-site navigation refusal
 * only while a connect the elevated admin pipe started is waiting (`OAuthAuthorizations.waiting()`), and strips the `Cookie` and
 * `Authorization` headers before any handler runs; the single-use `state` that only that connect knows is the authority. The route can
 * do exactly one thing: exchange the code and keep the resulting refresh token IN MEMORY for the admin pipe's `connect.complete`. It
 * cannot add, change or remove a destination, read a secret or touch the database beyond one audit row. It answers a small static
 * page (no script, no token, no echo of any query value) with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
 *
 * Failures: an unknown, replayed, expired or malformed state is the same refusal as any wrong credential (counted into the per-address
 * `oidc` throttle and its automatic IP block) and writes no audit row, so unsolicited requests cannot fill the log; an authorization
 * the provider granted or declined is audited with a closed outcome code only.
 */
export interface OAuthCallbackRouteOptions {
  db: Db;
  now: () => number;
  authorizations: OAuthAuthorizations;
  path: string;
  /** The closed audit event of what the provider decided. */
  auditEvent: 'backup.drive-authorized' | 'backup.onedrive-authorized';
  /** The provider's name in the page the owner sees ("Google Drive", "OneDrive"). */
  providerName: string;
}

const page = (title: string, text: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><h1>${title}</h1><p>${text}</p></body></html>`;

export function registerOAuthCallbackRoute(app: FastifyInstance, options: OAuthCallbackRouteOptions): void {
  const { db, now, authorizations, auditEvent } = options;
  const AUTHORIZED = page(`${options.providerName} authorized`, 'The Hub received the authorization. Return to the terminal where you ran dude-hub and finish adding the destination. You can close this tab.');
  const REFUSED = page(`${options.providerName} was not connected`, 'The authorization was declined, failed or is no longer valid. Return to the terminal and start the connect again.');
  const send = (reply: FastifyReply, status: number, html: string): FastifyReply =>
    reply.code(status).header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').type('text/html; charset=utf-8').send(html);

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    options.path,
    {
      config: { authLimited: true },
      schema: {
        querystring: Type.Object({
          code: Type.Optional(Type.String({ maxLength: 2048 })), state: Type.Optional(Type.String({ maxLength: 256 })),
          error: Type.Optional(Type.String({ maxLength: 256 })),
        }),
        response: { 200: Type.String(), 400: Type.String(), 423: ErrorEnvelope },
      },
    },
    async (request, reply) => {
      const ip = request.ip || 'unknown';
      const keys = throttleKeys.oidc(ip);
      const decision = checkThrottleKeys(db, keys, now());
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);
      const { state, code, error } = request.query;
      const outcome = await authorizations.handleCallback({ state, code, error });
      if (outcome.result === 'unknown') {
        recordFailureKeys(db, keys, now());
        return send(reply, 400, REFUSED);
      }
      audit(db, {
        event: auditEvent, outcome: outcome.result === 'authorized' ? 'success' : 'failure', actorKind: 'anonymous', ip,
        detail: outcome.result === 'authorized' ? {} : { reason: outcome.reason }, now: now(),
      });
      return send(reply, outcome.result === 'authorized' ? 200 : 400, outcome.result === 'authorized' ? AUTHORIZED : REFUSED);
    },
  );
}
