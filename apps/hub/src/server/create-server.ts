import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import type { HubConfig } from '../config/hub-config.js';
import type { HubPaths } from '../config/data-dir.js';
import { envelope, hubErrorHandler } from './errors.js';
import { registerHelloRoute } from './routes/hello.js';
import { registerBootstrapRoute } from './routes/bootstrap.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerDeviceAuthRoutes } from './routes/device-auth.js';
import { createRequireDevice } from '../auth/device-auth.js';
import { HubEvents } from '../auth/hub-events.js';
import { createRequireOwner } from '../auth/owner-auth.js';
import { verifyCsrf } from '../auth/sessions.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import type { PasswordParams } from '../auth/password.js';
import { createStaticHandler } from './static.js';
import { ensureActiveTlsPin } from './tls-pins.js';
import type { HubLoggerOptions } from './logger.js';
import { startAuditPruning } from '../security/audit.js';
import { registerSecurityHeaders } from '../security/headers.js';
import { createHostGuard, registerHostGuard } from '../security/host-guard.js';
import { createRateLimiter, registerRateLimit } from '../security/rate-limit.js';
import type { RateLimiterOptions } from '../security/rate-limit.js';
import { registerRequestGuard } from '../security/request-guard.js';
import type { CsrfVerifier } from '../security/request-guard.js';

export const HUB_BODY_LIMIT = 64 * 1024;

export interface CreateHubServerOptions {
  paths: HubPaths;
  config: Pick<HubConfig, 'webRoot'> & Partial<Pick<HubConfig, 'bind'>>;
  /** Injected clock for rate limiting and audit pruning (tests). */
  now?: () => number;
  /** Overrides how the CSRF header is verified against the session cookie (default: the session store). */
  csrfVerifier?: CsrfVerifier;
  /** Additional accepted Host names (without port). */
  extraHosts?: readonly string[];
  rateLimit?: RateLimiterOptions;
  /** Registers routes before the server is ready (the security hooks are already installed). */
  configure?: (app: FastifyInstance) => void;
  tls: { keyPem: string; certPem: string; spkiSha256: string };
  hub: { db: Db; hubInstanceId: string };
  hubVersion: string;
  logger?: boolean | HubLoggerOptions;
  /** Cheaper Argon2 settings for specs only. */
  passwordParams?: PasswordParams;
}

export function createHubServer(options: CreateHubServerOptions): FastifyInstance {
  ensureActiveTlsPin(options.hub.db, { spkiSha256: options.tls.spkiSha256, certPem: options.tls.certPem });

  const app = Fastify({
    https: { key: options.tls.keyPem, cert: options.tls.certPem, minVersion: 'TLSv1.2' },
    logger: options.logger ?? false,
    bodyLimit: HUB_BODY_LIMIT,
    trustProxy: false,
    ajv: { customOptions: { strict: true, removeAdditional: false, coerceTypes: false, allErrors: false } },
  });

  app.setErrorHandler(hubErrorHandler);
  app.decorate('hubEvents', new HubEvents());

  // Order: rate limit, host guard, request guard, routes. Headers are added to every response.
  const now = options.now ?? Date.now;
  const getPort = (): number => {
    const address = app.server.address();
    return typeof address === 'object' && address ? address.port : 0;
  };
  registerSecurityHeaders(app);
  registerRateLimit(app, createRateLimiter({ now, ...options.rateLimit }));
  const hostGuard = createHostGuard({ bind: options.config.bind ?? 'loopback', ...(options.extraHosts ? { extraHosts: options.extraHosts } : {}) }, getPort);
  registerHostGuard(app, hostGuard);
  const csrfVerifier: CsrfVerifier = options.csrfVerifier ?? ((cookie, header) => verifyCsrf(options.hub.db, cookie, header, now()));
  registerRequestGuard(app, { hostGuard, csrfVerifier });
  const stopPruning = startAuditPruning(options.hub.db, now);
  app.addHook('onClose', async () => { stopPruning(); });
  options.configure?.(app);

  registerHelloRoute(app, {
    db: options.hub.db,
    hubInstanceId: options.hub.hubInstanceId,
    hubVersion: options.hubVersion,
    spkiSha256: options.tls.spkiSha256,
  });

  registerBootstrapRoute(app, {
    db: options.hub.db,
    configDir: options.paths.configDir,
    now,
    ...(options.passwordParams ? { passwordParams: options.passwordParams } : {}),
  });

  const confirmations = new ConfirmationStore();
  const authOptions = {
    db: options.hub.db,
    configDir: options.paths.configDir,
    now,
    confirmations,
    requireOwner: createRequireOwner({ db: options.hub.db, now }),
    requireCookieOwner: createRequireOwner({ db: options.hub.db, now, kinds: ['cookie'] }),
    ...(options.passwordParams ? { passwordParams: options.passwordParams } : {}),
  };
  registerAuthRoutes(app, authOptions);
  registerSessionRoutes(app, authOptions);
  registerDeviceAuthRoutes(app, { db: options.hub.db, now, hubInstanceId: options.hub.hubInstanceId });
  registerDeviceRoutes(app, {
    db: options.hub.db, now, confirmations, requireOwner: authOptions.requireOwner, requireDevice: createRequireDevice({ db: options.hub.db, now }),
    hostGuard, spkiSha256: options.tls.spkiSha256,
  });

  const serveStatic = createStaticHandler({ root: options.config.webRoot ?? options.paths.webRoot });
  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    const isApi = pathname === '/api' || pathname.startsWith('/api/');
    if (!isApi && (request.method === 'GET' || request.method === 'HEAD')) return serveStatic(request, reply);
    return reply.code(404).type('application/json').header('Cache-Control', 'no-store').send(envelope('not-found', 'Not found.'));
  });

  return app;
}
