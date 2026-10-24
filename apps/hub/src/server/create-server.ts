import Fastify from 'fastify';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Db } from '@dude/sqlite-store';
import { bindAddress } from '../config/hub-config.js';
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
import { registerPresenceRoutes } from './routes/presence.js';
import { registerJobsRoute } from './routes/jobs.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { startNotificationProducers } from '../notifications/producers.js';
import { startNotificationRetention } from '../notifications/retention.js';
import { createJobRegistry } from '../jobs/job-status.js';
import { registerDiagnosticsRoute } from './routes/diagnostics.js';
import { registerReachabilityRoute } from './routes/reachability.js';
import { registerBackupRoutes } from './routes/backup.js';
import { createHostFacts, currentConfig, gatherRunningHubDeps } from '../diagnostics/gather.js';
import { collectDiagnostics } from '../diagnostics/engine.js';
import { createCachedNameResolver } from '../diagnostics/addresses.js';
import type { InterfaceMap, NameResolution } from '../diagnostics/addresses.js';
import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import type { DiagnosticsHostFacts, DiagnosticsOverride } from '../diagnostics/engine.js';
import { defaultExec } from '../service/common.js';
import type { ExecFn } from '../service/common.js';
import { registerDeviceAuthRoutes } from './routes/device-auth.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerWebRecordRoutes } from './routes/web-records.js';
import { registerCollabRoomRoutes } from './routes/collab-rooms.js';
import { collabKindForEntity } from '@dude/collab-doc';
import { createCollabRegistry } from '../collab/doc-registry.js';
import type { CollabRegistry, CollabRegistryOptions } from '../collab/doc-registry.js';
import { registerCollabSocket } from '../collab/collab-socket.js';
import type { CollabSocketTimings } from '../collab/collab-socket.js';
import { createCollabRooms } from '../collab/rooms.js';
import type { CollabRooms, CollabRoomsOptions } from '../collab/rooms.js';
import { observeCanonicalCommits } from '../db/canonical-repository.js';
import { SYNC_COMPACTION_INTERVAL_MS, registerSyncCompaction } from './sync-compaction.js';
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
import { registerWsHost } from '../realtime/ws-host.js';
import type { RealtimeTimings } from '../realtime/realtime.js';
import type { HubLoggerOptions } from './logger.js';
import { AUDIT_PRUNE_INTERVAL_MS, startAuditPruning } from '../security/audit.js';
import { registerSecurityHeaders } from '../security/headers.js';
import { createHostGuard, registerHostGuard } from '../security/host-guard.js';
import { createRateLimiter, registerRateLimit, withPrincipalLimit } from '../security/rate-limit.js';
import { noteFloodHit, registerIpBlock } from '../security/ip-block.js';
import { createHstsPolicy } from '../security/hsts.js';
import { registerTransferFence } from '../security/transfer-fence.js';
import { trustProxyFor } from '../security/trusted-proxy.js';
import type { RateLimiterOptions } from '../security/rate-limit.js';
import { registerRequestGuard } from '../security/request-guard.js';
import type { CsrfVerifier } from '../security/request-guard.js';

export const HUB_BODY_LIMIT = 64 * 1024;

declare module 'fastify' {
  interface FastifyInstance {
    hubDiagnostics: (override?: DiagnosticsOverride) => Promise<HubDiagnosticsReport>;
    /** The collaborative document registry (PD-101); the `/api/v1/collab` socket opens documents through it. */
    collab: CollabRegistry;
    /** Markdown Workspace rooms (PD-104): ephemeral, in Hub memory only. */
    collabRooms: CollabRooms;
  }
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
  /** Collaborative document timings (tests inject short ones): idle unload, tail compaction, update flush and materialization. */
  collab?: Pick<CollabRegistryOptions, 'idleUnloadMs' | 'compactAfterUpdates' | 'store' | 'materializer'>;
  /** Collaboration socket timers and limits (tests inject short ones). */
  collabSocket?: Partial<CollabSocketTimings>;
  /** Markdown room limits and idle close (tests inject short ones). */
  collabRooms?: Pick<CollabRoomsOptions, 'idleCloseMs' | 'maxRooms' | 'maxParticipants'>;
  /** Registers routes before the server is ready (the security hooks are already installed). */
  configure?: (app: FastifyInstance) => void;
  tls: { keyPem: string; certPem: string; spkiSha256: string };
  hub: { db: Db; hubInstanceId: string };
  hubVersion: string;
  /** Endpoint diagnostics: injectable host facts (service state, firewall rule; cached 60 s) so tests never touch Windows. */
  diagnostics?: { exec?: ExecFn; platform?: NodeJS.Platform; host?: () => Promise<DiagnosticsHostFacts>; resolveDns?: (names: readonly string[]) => Promise<NameResolution[]>; interfaces?: () => InterfaceMap };
  /** Backup status read model: `run` supplies the schedule-key presence check (request handlers never import the schedule-key module). */
  backup?: { scheduleKeyPresent?: () => boolean };
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
  // A transferred Hub refuses every API request but `hello` before any other hook sees it (PD-071): no flood strike, no audit, no auth.
  registerTransferFence(app, options.hub.db);
  registerIpBlock(app, options.hub.db, now);
  registerRateLimit(app, limiter, undefined, { onFlood: (ip) => noteFloodHit(options.hub.db, ip, now()) });
  const hostGuard = createHostGuard({ bind: options.config.bind ?? 'loopback', names: options.config.exposure?.names ?? [], ...(proxy ? { proxy } : {}), ...(options.extraHosts ? { extraHosts: options.extraHosts } : {}) }, getPort);
  app.decorate('hostGuard', hostGuard);
  registerHostGuard(app, hostGuard);
  const csrfVerifier: CsrfVerifier = options.csrfVerifier ?? ((cookie, header) => verifyCsrf(options.hub.db, cookie, header, now()));
  registerRequestGuard(app, { hostGuard, csrfVerifier });
  // Read-only job status (PD-112). `run` registers the timers it starts; the two below belong to this server. `onChange` is wired once realtime exists.
  const jobs = createJobRegistry({ db: options.hub.db, now });
  app.decorate('hubJobs', jobs);
  jobs.register('audit-prune', AUDIT_PRUNE_INTERVAL_MS);
  jobs.register('sync-compaction', options.sync?.compactionIntervalMs ?? SYNC_COMPACTION_INTERVAL_MS);
  const stopPruning = startAuditPruning(options.hub.db, now, AUDIT_PRUNE_INTERVAL_MS, jobs.handle('audit-prune'));
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
  registerWsHost(app);
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
  registerPresenceRoutes(app, { realtime, requireOwner: authOptions.requireOwner });
  jobs.onChange = () => realtime.notifyOwnerView('jobs');
  registerJobsRoute(app, { jobs, requireOwner: authOptions.requireOwner });
  // Notifications (PD-109, PD-110): the closed producer list feeds the table; a new row reaches owner sockets and reader-granted device sockets.
  const producers = startNotificationProducers({
    db: options.hub.db, now, jobs,
    emit: (n) => {
      app.hubEvents.emit('notification-created', { id: n.id, kind: n.kind, severity: n.severity, title: n.title });
      realtime.notifyOwnerView('notifications');
    },
  });
  app.decorate('hubNotifications', producers);
  const stopRetention = startNotificationRetention(options.hub.db, now, () => realtime.notifyOwnerView('notifications'));
  app.addHook('onClose', async () => { producers.stop(); stopRetention(); });
  registerNotificationRoutes(app, { db: options.hub.db, now, requireOwner: authOptions.requireOwner, requireDevice, changed: () => realtime.notifyOwnerView('notifications') });
  const startedAt = now();
  const hostFacts = options.diagnostics?.host ?? createHostFacts({ exec: options.diagnostics?.exec ?? defaultExec, ...(options.diagnostics?.platform ? { platform: options.diagnostics.platform } : {}), now });
  const resolveDns = options.diagnostics?.resolveDns ?? createCachedNameResolver({ now });
  const collectHubDiagnostics = async (override?: DiagnosticsOverride): Promise<HubDiagnosticsReport> => {
    const deps = await gatherRunningHubDeps({
      db: options.hub.db, tlsDir: options.paths.tlsDir, configFile: options.paths.configFile, config: { port: 0, ...(options.config.bind ? { bind: options.config.bind } : {}), ...(options.config.exposure ? { exposure: options.config.exposure } : {}) },
      hubVersion: options.hubVersion, startedAt, now, getPort, hsts: hstsPolicy, realtime, host: hostFacts, resolveDns, ...(options.diagnostics?.interfaces ? { interfaces: options.diagnostics.interfaces } : {}), ...(options.diagnostics?.platform ? { platform: options.diagnostics.platform } : {}),
    });
    if (override !== undefined) {
      // The readiness gate: the configured (not yet running) bind and the supplied host facts, evaluated as public mode.
      const wanted = currentConfig(options.paths.configFile, { port: 0, ...(options.config.bind ? { bind: options.config.bind } : {}), ...(options.config.exposure ? { exposure: options.config.exposure } : {}) });
      const baseHost = deps.host;
      deps.config = { ...deps.config, bind: wanted.bind, bindAddress: bindAddress({ bind: wanted.bind, exposure: wanted.exposure }), exposure: { ...deps.config.exposure, mode: override.mode } };
      deps.host = async () => ({ ...(await baseHost()), ...override.host });
    }
    return collectDiagnostics(deps);
  };
  app.decorate('hubDiagnostics', collectHubDiagnostics);
  registerDiagnosticsRoute(app, { db: options.hub.db, now, requireOwner: authOptions.requireOwner, collect: collectHubDiagnostics });
  registerBackupRoutes(app, {
    db: options.hub.db, requireOwner: authOptions.requireOwner, defaultFolder: options.paths.backupsDir,
    schedule: () => currentConfig(options.paths.configFile, { port: 0 }).backup?.schedule,
    ...(options.backup?.scheduleKeyPresent ? { scheduleKeyPresent: options.backup.scheduleKeyPresent } : {}),
  });
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
  registerSyncCompaction(app, options.hub.db, now, options.sync, jobs.handle('sync-compaction'));

  // Collaborative documents (PD-101): the registry owns the Y.Docs, their store and the materializer. A tombstoned record or a cleared
  // environment ends the document (the delete commit already removed the rows; this unloads it and ends its subscribers).
  const collab = createCollabRegistry({
    db: options.hub.db, now, log: app.log, ...options.collab,
    emitRecordsChanged: (event) => app.hubEvents.emit('records-changed', event),
  });
  app.decorate('collab', collab);
  const collabRooms = createCollabRooms({ now, ...options.collabRooms });
  app.decorate('collabRooms', collabRooms);
  registerCollabSocket(app, {
    db: options.hub.db, now, hostGuard, registry: collab, rooms: collabRooms, ...(options.collabSocket ? { timings: options.collabSocket } : {}),
  });
  registerCollabRoomRoutes(app, { db: options.hub.db, now, rooms: collabRooms, hubEvents: app.hubEvents, requireOwner: authOptions.requireOwner, requireDevice });
  const stopObservingCommits = observeCanonicalCommits(options.hub.db, (event) => {
    const kind = event.op === 'delete' ? collabKindForEntity(event.entityType) : null;
    if (kind !== null) collab.evict(`${kind}:${event.entityId}`);
  });
  const onEnvironmentCleared = (): void => collab.evictAll();
  app.hubEvents.on('environment-cleared', onEnvironmentCleared);
  app.addHook('onClose', async () => {
    stopObservingCommits();
    app.hubEvents.off('environment-cleared', onEnvironmentCleared);
    collab.dispose();
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
