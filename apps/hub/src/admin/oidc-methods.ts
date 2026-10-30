import { applyOidcChange, DEFAULT_OIDC_ISSUER, loadOrCreateHubConfig, parseOidcConfig, writeHubConfig } from '../config/hub-config.js';
import { audit } from '../security/audit.js';
import { AdminError } from './admin-endpoint.js';
import type { AdminMethod } from './admin-endpoint.js';
import type { AdminMethodContext } from './methods.js';

const KEYS = new Set(['clientId', 'clientSecret', 'redirectOrigin']);
/** Google issues secrets of about 35 characters; the bounds only keep a pasted blob or an empty value out. */
const SECRET_MIN = 8;
const SECRET_MAX = 512;

/**
 * Google sign-in configuration (32-SS1, Milestone 853, PD-121, PD-145): `oidc.configure`. Credential class: the local admin pipe (an elevated
 * session of `dude-hub provision`, driven by the desktop wizard); no HTTP route can reach it. It writes the public `oidc` block of `hub.json`
 * (client id and redirect origin; the issuer is always Google's) and stores the client secret only in the machine-bound secret store
 * (`oidc.clientSecret`). It is additive owner configuration of a sign-in factor that never replaces the password, so it needs no confirmation
 * token; it is audited as `oidc.configured` with the redirect origin only. The secret is never returned, audited, logged or put in an error,
 * and an unknown key is refused without echoing its name. The Hub reads the block at start, so the result says a restart is needed.
 */
export function buildOidcMethods(context: AdminMethodContext, shared: { now: () => number }): Record<string, AdminMethod> {
  return {
    'oidc.configure': (params) => {
      if (typeof params !== 'object' || params === null || Array.isArray(params)) throw new AdminError('bad-request', 'The parameters must be an object.');
      const input = params as Record<string, unknown>;
      if (Object.keys(input).some((key) => !KEYS.has(key))) throw new AdminError('bad-request', 'oidc.configure takes clientId, clientSecret and redirectOrigin only.');
      if (!context.configFile || !context.oidc) throw new AdminError('unavailable', 'Google sign-in cannot be configured in this context.');
      const secret = input['clientSecret'];
      if (typeof secret !== 'string' || secret.length < SECRET_MIN || secret.length > SECRET_MAX || /[\s\u0000-\u001f]/u.test(secret)) {
        throw new AdminError('bad-request', 'The client secret must be the single value Google shows for the OAuth client (no spaces or line breaks).');
      }
      let block;
      try {
        block = parseOidcConfig({ issuer: DEFAULT_OIDC_ISSUER, clientId: input['clientId'], redirectOrigin: input['redirectOrigin'] });
      } catch (error) {
        throw new AdminError('bad-request', (error as Error).message);
      }
      const file = context.configFile;
      const next = applyOidcChange(loadOrCreateHubConfig(file), block);
      try {
        context.oidc.putClientSecret(secret);
      } catch {
        throw new AdminError('unavailable', 'The client secret could not be stored on this machine.');
      }
      writeHubConfig(file, next);
      audit(context.db, { event: 'oidc.configured', outcome: 'success', actorKind: 'cli', detail: { redirectOrigin: block.redirectOrigin }, now: shared.now() });
      return { configured: true, redirectOrigin: block.redirectOrigin, restartRequired: true };
    },
  };
}
