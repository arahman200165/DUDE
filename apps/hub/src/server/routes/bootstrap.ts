import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { BootstrapRequest, BootstrapResponse, ErrorEnvelope, HUB_API_PREFIX } from '@dude/contracts/hub';
import { hashPassword, validateOwnerPassword } from '../../auth/password.js';
import type { PasswordParams } from '../../auth/password.js';
import { replaceRecoveryCodes } from '../../auth/recovery-codes.js';
import { consumeSetupToken, deleteSetupTokenFile, verifySetupToken } from '../../auth/setup-token.js';
import { audit } from '../../security/audit.js';
import { checkThrottleKeys, lockedReply, recordFailureKeys, recordSuccessKeys, throttleKeys } from '../../security/throttle.js';
import { newId } from '../../util/ids.js';
import { envelope } from '../errors.js';

export interface BootstrapRouteOptions {
  db: Db;
  configDir: string;
  now: () => number;
  /** Cheaper Argon2 settings for specs only. */
  passwordParams?: PasswordParams;
}

const ownerExists = (db: Db): boolean => db.prepare('SELECT 1 AS x FROM owner LIMIT 1').get() !== undefined;

/** Credential type: setup token. Creates the environment, the single owner and the first recovery codes. */
export function registerBootstrapRoute(app: FastifyInstance, options: BootstrapRouteOptions): void {
  const { db } = options;
  app.withTypeProvider<TypeBoxTypeProvider>().post(
    `${HUB_API_PREFIX}/bootstrap`,
    { config: { authLimited: true, credentialless: true }, schema: { body: BootstrapRequest, response: { 201: BootstrapResponse, 400: ErrorEnvelope, 401: ErrorEnvelope, 409: ErrorEnvelope } } },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const ip = request.ip || 'unknown';
      const keys = throttleKeys['setup-token'](ip);
      const now = options.now();

      const decision = checkThrottleKeys(db, keys, now);
      if (!decision.allowed) return lockedReply(reply, decision.retryAfterMs);
      if (ownerExists(db)) return reply.code(409).send(envelope('conflict', 'This Hub already has an owner.'));

      const body = request.body;
      if (!verifySetupToken(db, body.setupToken)) {
        recordFailureKeys(db, keys, now);
        audit(db, { event: 'auth.failure', outcome: 'failure', actorKind: 'anonymous', ip, detail: { kind: 'setup-token' }, now });
        return reply.code(401).send(envelope('unauthorized', 'The setup token is not valid.'));
      }

      const policy = validateOwnerPassword(body.password);
      if (!policy.ok) return reply.code(400).send(envelope('bad-request', `Password rejected: ${policy.reason}.`));

      const credential = await hashPassword(body.password, options.passwordParams); // async, so before the transaction

      const created = transaction(db, () => {
        if (ownerExists(db) || !verifySetupToken(db, body.setupToken)) return null;
        const at = new Date(now).toISOString();
        const environmentId = newId(options.now);
        const ownerId = newId(options.now);
        db.prepare('INSERT INTO environment(environment_id, display_name, created_at) VALUES(?, ?, ?)').run(environmentId, body.environmentName, at);
        db.prepare('INSERT INTO owner(owner_id, environment_id, display_name, created_at, password_changed_at) VALUES(?, ?, ?, ?, ?)').run(
          ownerId, environmentId, body.ownerDisplayName, at, at,
        );
        db.prepare("INSERT INTO owner_credentials(owner_id, kind, algorithm, params_json, salt, hash, updated_at) VALUES(?, 'password', 'argon2id', ?, ?, ?, ?)").run(
          ownerId, credential.paramsJson, credential.salt, credential.hash, at,
        );
        const recoveryCodes = replaceRecoveryCodes(db, ownerId, now);
        consumeSetupToken(db, now);
        audit(db, { event: 'hub.bootstrap', outcome: 'success', actorKind: 'system', ip, detail: { ownerId }, now });
        return { environmentId, ownerId, recoveryCodes };
      });
      if (created === null) return reply.code(409).send(envelope('conflict', 'This Hub already has an owner.'));

      recordSuccessKeys(db, keys);
      deleteSetupTokenFile(options.configDir);
      return reply.code(201).send(created);
    },
  );
}
