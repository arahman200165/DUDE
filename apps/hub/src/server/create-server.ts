import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import type { HubConfig } from '../config/hub-config.js';
import type { HubPaths } from '../config/data-dir.js';
import { envelope, hubErrorHandler } from './errors.js';
import { registerHelloRoute } from './routes/hello.js';
import { registerBootstrapRoute } from './routes/bootstrap.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerTlsAuditRoutes } from './routes/tls-audit.js';
import { registerSecurityAlertRoutes } from './routes/security-alerts.js';
import { registerDiagnosticsRoute } from './routes/diagnostics.js';
import { registerReachabilityRoute } from './routes/reachability.js';
import { createHostFacts, currentConfig, gatherRunningHubDeps } from '../diagnostics/gather.js';
import { collectDiagnostics } from '../diagnostics/engine.js';
import { createCachedNameResolver } from '../diagnostics/addresses.js';
import type { InterfaceMap, NameResolution } from '../diagnostics/addresses.js';
import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import type { DiagnosticsHostFacts } from '../diagnostics/engine.js';
import { defaultExec } from '../service/common.js';
import type { ExecFn } from '../service/common.js';
import { registerDeviceAuthRoutes } from './routes/device-auth.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerWebRecordRoutes } from './routes/web-records.js';
import { registerSyncCompaction } from './sync-compaction.js';
import type { SyncCompactionOptions } from './sync-compaction.js';
import { registerDeviceRecoveryRoutes } from './routes/device-recovery.js';
import { createRequireDevice } from '../auth/device-auth.js';
import { HubEvents } from '../auth/hub-events.js';
import { createRequireOwner } from '../auth/owner-auth.js';
import { verifyCsrf } from '../auth/sessions.js';
import { ConfirmationStore } from '../security/confirmation-store.js';
import type { PasswordParams } from '../auth/password.js';
import { createStaticHandler } from './static.js';
import { ensureActiveTlsPin } from './tls-pins.js';
import { registerRealtime } from '../realtime/realtime.js';
import type { RealtimeTimings } from '../realtime/realtime.js';
import type { HubLoggerOptions } from './logger.js';
import { startAuditPruning } from '../security/audit.js';
import { registerSecurityHeaders } from '../security/headers.js';
import { createHostGuard, registerHostGuard } from '../security/host-guard.js';
import { createRateLimiter, registerRateLimit, withPrincipalLimit } from '../security/rate-limit.js';
import { noteFloodHit, registerIpBlock } from '../security/ip-block.js';
import { createHstsPolicy } from '../security/hsts.js';
import { trustProxyFor } from '../security/trusted-proxy.js';
import type { RateLimiterOptions } from '../security/rate-limit.js';
import { registerRequestGuard } from '../security/request-guard.js';
import type { CsrfVerifier } from '../security/request-guard.js';

export const HUB_BODY_LIMIT = 64 * 1024;

declare module 'fastify' {
  interface FastifyInstance { hubDiagnostics: () => Promise<HubDiagnosticsReport> }
}

export interface CreateHubServerOptions {
  paths: HubPaths;
  config: Pick<HubConfig, 'webRoot'> & Partial<Pick<HubConfig, 'bind' | 'exposure'>>;
  /** Injected clock for rate limiting and audit pruning (tests). */
  now?: () => number;
  /** Overrides how the CSRF header is verified against the session cookie (default: the session store). */
  csrfVerifier?: CsrfVerifier;
  /** Additional accepted Host names (tests); operators configure `exposure.names`. */
  extraHosts?: readonly string[];
  rateLimit?: RateLimiterOptions;
  /** Realtime timers and limits (tests inject short ones). */
  realtime?: Partial<RealtimeTimings>;
  /** Sync compaction timer and retention (tests inject short ones). */
  sync?: SyncCompactionOptions;
  /** Registers routes before the server is ready (the security hooks are already installed). */
  configure?: (app: FastifyInstance) => void;
  tls: { keyPem: string; certPem: string; spkiSha256: string };
  hub: { db: Db; hubInstanceId: string };
  hubVersion: string;
  /** Endpoint diagnostics: injectable host facts (service state, firewall rule; cached 60 s) so tests never touch Windows. */
  diagnostics?: { exec?: ExecFn; platform?: NodeJS.Platform; host?: () => Promise<DiagnosticsHostFacts>; resolveDns?: (names: readonly string[]) => Promise<NameResolution[]>; interfaces?: () => InterfaceMap };
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
    trustProxy: trustProxyFor(options.config.exposure?.proxy?.trusted),
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
  const proxy = options.config.exposure?.proxy;
  const hstsPolicy = createHstsPolicy({ db: options.hub.db, tlsDir: options.paths.tlsDir, proxy: proxy !== undefined });
  registerSecurityHeaders(app, { hsts: hstsPolicy });
  const limiter = createRateLimiter({ now, ...options.rateLimit });
  registerIpBlock(app, options.hub.db, now);
  registerRateLimit(app, limiter, undefined, { onFlood: (ip) => noteFloodHit(options.hub.db, ip, now()) });
  const hostGuard = createHostGuard({ bind: options.config.bind ?? 'loopback', names: options.config.exposure?.names ?? [], ...(proxy ? { proxy } : {}), ...(options.extraHosts ? { extraHosts: options.extraHosts } : {}) }, getPort);
  app.decorate('hostGuard', hostGuard);
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

  const activeSpki = (): string => {
    const row = options.hub.db.prepare("SELECT spki_sha256 FROM tls_pins WHERE state = 'active' LIMIT 1").get() as { spki_sha256: string } | undefined;
    return row?.spki_sha256 ?? options.tls.spkiSha256;
  };
  const realtime = registerRealtime(app, {
    db: options.hub.db, now, hostGuard, activeSpki, ...(options.realtime ? { timings: options.realtime } : {}),
  });

  const confirmations = new ConfirmationStore();
  // Authenticated requests are metered per principal (session or device) once auth resolves it, not per address.
  const ownerKey = (r: FastifyRequest): string | undefined => (r.owner ? `owner:${r.owner.sessionHash}` : undefined);
  const requireDevice = withPrincipalLimit(limiter, createRequireDevice({ db: options.hub.db, now }), (r) => (r.device ? `device:${r.device.deviceId}` : undefined));
  const authOptions = {
    db: options.hub.db,
    configDir: options.paths.configDir,
    now,
    confirmations,
    requireOwner: withPrincipalLimit(limiter, createRequireOwner({ db: options.hub.db, now }), ownerKey),
    requireCookieOwner: withPrincipalLimit(limiter, createRequireOwner({ db: options.hub.db, now, kinds: ['cookie'] }), ownerKey),
    ...(options.passwordParams ? { passwordParams: options.passwordParams } : {}),
  };
  registerAuthRoutes(app, authOptions);
  registerSessionRoutes(app, authOptions);
  registerTlsAuditRoutes(app, { db: options.hub.db, tlsDir: options.paths.tlsDir, requireOwner: authOptions.requireOwner });
  registerSecurityAlertRoutes(app, { db: options.hub.db, now, requireOwner: authOptions.requireOwner });
  const startedAt = now();
  const hostFacts = options.diagnostics?.host ?? createHostFacts({ exec: options.diagnostics?.exec ?? defaultExec, ...(options.diagnostics?.platform ? { platform: options.diagnostics.platform } : {}), now });
  const resolveDns = options.diagnostics?.resolveDns ?? createCachedNameResolver({ now });
  const collectHubDiagnostics = async (): Promise<HubDiagnosticsReport> => collectDiagnostics(await gatherRunningHubDeps({
    db: options.hub.db, tlsDir: options.paths.tlsDir, configFile: options.paths.configFile, config: { port: 0, ...(options.config.bind ? { bind: options.config.bind } : {}), ...(options.config.exposure ? { exposure: options.config.exposure } : {}) },
    hubVersion: options.hubVersion, startedAt, now, getPort, hsts: hstsPolicy, realtime, host: hostFacts, resolveDns, ...(options.diagnostics?.interfaces ? { interfaces: options.diagnostics.interfaces } : {}), ...(options.diagnostics?.platform ? { platform: options.diagnostics.platform } : {}),
  }));
  app.decorate('hubDiagnostics', collectHubDiagnostics);
  registerDiagnosticsRoute(app, { db: options.hub.db, now, requireOwner: authOptions.requireOwner, collect: collectHubDiagnostics });
  registerReachabilityRoute(app, {
    db: options.hub.db, now, requireOwner: authOptions.requireOwner, requireDevice, hostGuard,
    exposure: () => {
      const wanted = currentConfig(options.paths.configFile, { port: 0, ...(options.config.bind ? { bind: options.config.bind } : {}), ...(options.config.exposure ? { exposure: options.config.exposure } : {}) }).exposure;
      return { names: wanted.names, publicOrigin: wanted.proxy?.publicOrigin };
    },
  });
  registerDeviceAuthRoutes(app, { db: options.hub.db, now, hubInstanceId: options.hub.hubInstanceId });
  registerDeviceRecoveryRoutes(app, {
    db: options.hub.db, now, hubInstanceId: options.hub.hubInstanceId, requireDevice,
    ...(options.passwordParams ? { passwordParams: options.passwordParams } : {}),
  });
  registerDeviceRoutes(app, {
    db: options.hub.db, now, confirmations, requireOwner: authOptions.requireOwner, requireDevice,
    hostGuard, spkiSha256: activeSpki, isDeviceOnline: realtime.isDeviceOnline,
    ...(proxy ? { canonicalOrigin: proxy.publicOrigin } : options.config.exposure?.canonicalOrigin ? { canonicalOrigin: options.config.exposure.canonicalOrigin } : {}),
  });

  registerSyncRoutes(app, {
    db: options.hub.db, now, confirmations, requireOwner: authOptions.requireOwner, requireDevice,
  });
  registerWebRecordRoutes(app, { db: options.hub.db, now, requireCookieOwner: authOptions.requireCookieOwner });
  registerSyncCompaction(app, options.hub.db, now, options.sync);

  const serveStatic = createStaticHandler({ root: options.config.webRoot ?? options.paths.webRoot });
  app.setNotFoundHandler(async (request, reply) => {
    const pathname = request.url.split('?')[0] ?? '/';
    const isApi = pathname === '/api' || pathname.startsWith('/api/');
    if (!isApi && (request.method === 'GET' || request.method === 'HEAD')) return serveStatic(request, reply);
    return reply.code(404).type('application/json').header('Cache-Control', 'no-store').send(envelope('not-found', 'Not found.'));
  });

  return app;
}
