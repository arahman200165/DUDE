import type { FastifyInstance, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import Type from 'typebox';
import type { Db } from '@dude/sqlite-store';
import { ErrorEnvelope, HUB_BACKUP_DRIVE_PATHS } from '@dude/contracts/hub';
import type { DriveAuthorizations } from '../../hub/drive-authorization.js';
import { audit } from '../../security/audit.js';
import { checkThrottleKeys, lockedReply, recordFailureKeys, throttleKeys } from '../../security/throttle.js';

/**
 * The Google Drive backup destination's one HTTP route (32-SS1, Milestone 856, PD-154): `GET /backup/drive/callback`, the browser
 * redirect back from Google's consent screen. Contract: `@dude/contracts/hub` `backup.schema.ts`.
 *
 * Credential type: none and SESSION-LESS. `security/cross-site-get.ts` exempts this exact GET from the cross-site navigation refusal
 * only while a connect the elevated admin pipe started is waiting (`DriveAuthorizations.waiting()`), and strips the `Cookie` and
 * `Authorization` headers before any handler runs; the single-use `state` that only that connect knows is the authority. The route can
 * do exactly one thing: exchange the code and keep the resulting refresh token IN MEMORY for the admin pipe's `connect.complete`. It
 * cannot add, change or remove a destination, read a secret or touch the database beyond one audit row. It answers a small static
 * page (no script, no token, no echo of any query value) with `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
 *
 * Failures: an unknown, replayed, expired or malformed state is the same refusal as any wrong credential (counted into the per-address
 * `oidc` throttle and its automatic IP block) and writes no audit row, so unsolicited requests cannot fill the log; an authorization
 * Google granted or declined is audited as `backup.drive-authorized` with a closed outcome code only.
 */
export interface DriveCallbackRouteOptions {
  db: Db;
  now: () => number;
  drive: DriveAuthorizations;
}

const page = (title: string, text: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body><h1>${title}</h1><p>${text}</p></body></html>`;

const AUTHORIZED = page('Google Drive authorized', 'The Hub received the authorization. Return to the terminal where you ran dude-hub and finish adding the destination. You can close this tab.');
const REFUSED = page('Google Drive was not connected', 'The authorization was declined, failed or is no longer valid. Return to the terminal and start the connect again.');

export function registerDriveCallbackRoute(app: FastifyInstance, options: DriveCallbackRouteOptions): void {
  const { db, now, drive } = options;
  const send = (reply: FastifyReply, status: number, html: string): FastifyReply =>
    reply.code(status).header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer').type('text/html; charset=utf-8').send(html);

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    HUB_BACKUP_DRIVE_PATHS.callback,
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
      const outcome = await drive.handleCallback({ state, code, error });
      if (outcome.result === 'unknown') {
        recordFailureKeys(db, keys, now());
        return send(reply, 400, REFUSED);
      }
      audit(db, {
        event: 'backup.drive-authorized', outcome: outcome.result === 'authorized' ? 'success' : 'failure', actorKind: 'anonymous', ip,
        detail: outcome.result === 'authorized' ? {} : { reason: outcome.reason }, now: now(),
      });
      return send(reply, outcome.result === 'authorized' ? 200 : 400, outcome.result === 'authorized' ? AUTHORIZED : REFUSED);
    },
  );
}
