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
import { OIDC_SWEEP_INTERVAL_MS, registerOidcRoutes, startOidcFlowSweep } from './routes/oidc.js';
import { createOidcClient } from '../auth/oidc/client.js';
import type { OidcClient, OidcClientOptions } from '../auth/oidc/client.js';
import type { FetchLike } from '../auth/oidc/egress.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerTlsAuditRoutes } from './routes/tls-audit.js';
import { registerSecurityAlertRoutes } from './routes/security-alerts.js';
import { registerPresenceRoutes } from './routes/presence.js';
import { registerJobsRoute } from './routes/jobs.js';
import { registerQueueRoute } from './routes/queue.js';
import { registerProvisioningRoute } from './routes/provisioning.js';
import { registerIngestRoutes } from './routes/ingest.js';
import { registerUploadRoutes } from './routes/uploads.js';
import type { UploadService } from '../uploads/upload-service.js';
import { createIngestTokenStore } from '../ingest/ingest-tokens.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerStandbyRoutes } from './routes/standby.js';
import { defaultOpenStandbyDestination } from '../standby/repositories.js';
import { startNotificationProducers } from '../notifications/producers.js';
import { startNotificationRetention } from '../notifications/retention.js';
import { createJobRegistry } from '../jobs/job-status.js';
import { registerDiagnosticsRoute } from './routes/diagnostics.js';
import { registerReachabilityRoute } from './routes/reachability.js';
import { registerTunnelRoute } from './routes/tunnel.js';
import { registerBackupRoutes } from './routes/backup.js';
import { createHostFacts, currentConfig, gatherRunningHubDeps } from '../diagnostics/gather.js';
import { collectDiagnostics } from '../diagnostics/engine.js';
import { createCachedNameResolver } from '../diagnostics/addresses.js';
import type { InterfaceMap, NameResolution } from '../diagnostics/addresses.js';
import type { HubDiagnosticsReport, HubDiagnosticsTunnel, HubProvisioningResponse, HubQueueStatusResponse, HubTunnelStatusResponse } from '@dude/contracts/hub';
import { TUNNEL_TRUSTED_PEERS } from '../config/hub-config.js';
import type { DiagnosticsHostFacts, DiagnosticsOverride } from '../diagnostics/engine.js';
import { defaultExec } from '../service/common.js';
import type { ExecFn } from '../service/common.js';
import { registerDeviceAuthRoutes } from './routes/device-auth.js';
import { registerSyncRoutes } from './routes/sync.js';
import { registerWebRecordRoutes } from './routes/web-records.js';
import { registerCollabRoomRoutes } from './routes/collab-rooms.js';
import { registerCollabHistoryRoutes } from './routes/collab-history.js';
import { COLLAB_HISTORY_PRUNE_INTERVAL_MS, startCollabHistoryPruning } from '../collab/history.js';
import { startCollabMaintenance } from '../collab/maintenance.js';
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
import { AUDIT_PRUNE_INTERVAL_MS, audit, startAuditPruning } from '../security/audit.js';
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
    /** The Google sign-in relying party (always present; `enabled` is false without an `oidc` block). */
    oidc: OidcClient;
  }
}

export interface CreateHubServerOptions {
  paths: HubPaths;
  config: Pick<HubConfig, 'webRoot'> & Partial<Pick<HubConfig, 'bind' | 'exposure' | 'oidc'>>;
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
  collab?: Pick<CollabRegistryOptions, 'idleUnloadMs' | 'compactAfterUpdates' | 'store' | 'materializer' | 'history'>;
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
  /** Backup status read model: `run` supplies the unattended-key (backup v2 master key) presence check (request handlers never import the key modules). */
  backup?: { scheduleKeyPresent?: () => boolean };
  /** Durable queue read model (32-SS1): `run` supplies it once `savesphere.db` is open; without it `GET /api/v1/queue` reports the queue as unavailable. */
  queue?: { status: () => HubQueueStatusResponse };
  /**
   * The open `savesphere.db` (32-SS1, Milestone 843): `run` supplies it once SaveSphere storage exists. The token-only ingest scaffold keeps its
   * `ingest_tokens` there; without it the owner's token routes answer 409 and every ingest token is unknown (`/api/v1/ingest/*` stays 401).
   */
  ingest?: { db: Db };
  /**
   * The resumable upload service (32-SS1, Milestone 845): `run` supplies it from the queue runtime once `savesphere.db` is open; without it the
   * upload routes answer 409. The chunk route has its own raw-stream parser; `HUB_BODY_LIMIT` is untouched everywhere else.
   */
  uploads?: { service: UploadService };
  /** SaveSphere provisioning read model (32-SS1, Milestone 835): `run` supplies it; without it `GET /api/v1/provisioning` reports not provisioned. */
  provisioning?: { status: () => Promise<HubProvisioningResponse> };
  /**
   * Managed tunnel read model and diagnostics facts (32-SS1, Milestone 837): `run` supplies them from the tunnel runtime. `facts(candidate)`
   * reports the connector for the live configuration, or for the configuration the `network tunnel on` gate is evaluating.
   */
  tunnel?: { status: () => HubTunnelStatusResponse; facts: (candidate?: { enabled: boolean; hostname: string }) => HubDiagnosticsTunnel };
  /**
   * Google (OIDC) sign-in (32-SS1, Milestone 842). The Hub always registers the routes; `config.oidc` decides whether they can serve. `run`
   * supplies the client secret reader and the cheap presence check (request handlers never import the secret store); specs inject the
   * fake provider's `fetch`, a short flow lifetime and a secret.
   */
  oidc?: { readClientSecret?: OidcClientOptions['readClientSecret']; clientSecretPresent?: () => boolean; fetch?: FetchLike; flowTtlMs?: number; timeoutMs?: number };
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
  const tunnelConfig = options.config.exposure?.tunnel;
  const hostGuard = createHostGuard({
    bind: options.config.bind ?? 'loopback', names: options.config.exposure?.names ?? [], ...(proxy ? { proxy } : {}),
    ...(proxy && tunnelConfig?.enabled ? { tunnel: { hostname: tunnelConfig.hostname } } : {}), ...(options.extraHosts ? { extraHosts: options.extraHosts } : {}),
  }, getPort);
  app.decorate('hostGuard', hostGuard);
  registerHostGuard(app, hostGuard);
  const csrfVerifier: CsrfVerifier = options.csrfVerifier ?? ((cookie, header) => verifyCsrf(options.hub.db, cookie, header, now()));
  registerRequestGuard(app, { hostGuard, csrfVerifier, oidcEnabled: () => options.config.oidc !== undefined });
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
    ...(tunnelConfig?.enabled && proxy ? { tunnelHostname: tunnelConfig.hostname } : {}),
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
  // Google sign-in, link and unlink (Milestone 842). The client never throws into a request path; with no `oidc` block it answers `off`.
  const oidc = createOidcClient({
    config: options.config.oidc, db: options.hub.db, now,
    readClientSecret: options.oidc?.readClientSecret ?? (() => ({ status: 'missing' })),
    ...(options.oidc?.clientSecretPresent ? { clientSecretPresent: options.oidc.clientSecretPresent } : {}),
    ...(options.oidc?.fetch ? { fetch: options.oidc.fetch } : {}),
    ...(options.oidc?.flowTtlMs !== undefined ? { flowTtlMs: options.oidc.flowTtlMs } : {}),
    ...(options.oidc?.timeoutMs !== undefined ? { timeoutMs: options.oidc.timeoutMs } : {}),
  });
  app.decorate('oidc', oidc);
  const stopOidcSweep = startOidcFlowSweep(oidc, OIDC_SWEEP_INTERVAL_MS);
  app.addHook('onClose', async () => { stopOidcSweep(); });
  registerOidcRoutes(app, { ...authOptions, oidc });
  registerSessionRoutes(app, authOptions);
  registerTlsAuditRoutes(app, { db: options.hub.db, tlsDir: options.paths.tlsDir, requireOwner: authOptions.requireOwner });
  registerSecurityAlertRoutes(app, { db: options.hub.db, now, requireOwner: authOptions.requireOwner });
  registerPresenceRoutes(app, { realtime, requireOwner: authOptions.requireOwner });
  jobs.onChange = () => realtime.notifyOwnerView('jobs');
  registerJobsRoute(app, { jobs, requireOwner: authOptions.requireOwner });
  registerQueueRoute(app, { requireOwner: authOptions.requireOwner, status: options.queue?.status });
  registerProvisioningRoute(app, { requireOwner: authOptions.requireOwner, status: options.provisioning?.status });
  // The token-only ingest scaffold (Milestone 843, PD-119, PD-149): `/api/v1/ingest/ping` takes an ingest token and nothing else; the owner manages tokens under `/api/v1/admin/ingest-tokens`.
  const ingestStore = options.ingest ? createIngestTokenStore({ db: options.ingest.db, hubDb: options.hub.db, auditWriter: (input) => audit(options.hub.db, input), now }) : undefined;
  registerIngestRoutes(app, { store: () => ingestStore, hubDb: options.hub.db, limiter, now, confirmations, requireOwner: authOptions.requireOwner });
  registerUploadRoutes(app, { requireOwner: authOptions.requireOwner, service: () => options.uploads?.service });
  registerTunnelRoute(app, { requireOwner: authOptions.requireOwner, status: options.tunnel?.status });
  // Notifications (PD-109, PD-110): the closed producer list feeds the table; a new row reaches owner sockets and reader-granted device sockets.
  const producers = startNotificationProducers({
    db: options.hub.db, now, jobs,
    destinationLabel: (id) => currentConfig(options.paths.configFile, { port: 0 }).backup?.destinations?.find((d) => d.id === id)?.label ?? null,
    emit: (n) => {
      app.hubEvents.emit('notification-created', { id: n.id, kind: n.kind, severity: n.severity, title: n.title });
      realtime.notifyOwnerView('notifications');
    },
  });
  app.decorate('hubNotifications', producers);
  const stopRetention = startNotificationRetention(options.hub.db, now, () => realtime.notifyOwnerView('notifications'));
  app.addHook('onClose', async () => { producers.stop(); stopRetention(); });
  registerNotificationRoutes(app, { db: options.hub.db, now, requireOwner: authOptions.requireOwner, requireDevice, changed: () => realtime.notifyOwnerView('notifications') });
  // Warm standby pull (32-SS1, Milestone 849, PD-151): device token plus the per-device standby grant; stored ciphertext only.
  registerStandbyRoutes(app, {
    db: options.hub.db, now, requireDevice,
    backupConfig: () => currentConfig(options.paths.configFile, { port: 0 }).backup,
    openDestination: defaultOpenStandbyDestination(options.paths),
  });
  const startedAt = now();
  const hostFacts = options.diagnostics?.host ?? createHostFacts({ exec: options.diagnostics?.exec ?? defaultExec, ...(options.diagnostics?.platform ? { platform: options.diagnostics.platform } : {}), now });
  const resolveDns = options.diagnostics?.resolveDns ?? createCachedNameResolver({ now });
  const collectHubDiagnostics = async (override?: DiagnosticsOverride): Promise<HubDiagnosticsReport> => {
    const deps = await gatherRunningHubDeps({
      db: options.hub.db, tlsDir: options.paths.tlsDir, configFile: options.paths.configFile, config: { port: 0, ...(options.config.bind ? { bind: options.config.bind } : {}), ...(options.config.exposure ? { exposure: options.config.exposure } : {}) },
      hubVersion: options.hubVersion, startedAt, now, getPort, hsts: hstsPolicy, realtime, host: hostFacts, resolveDns, ...(options.tunnel ? { tunnel: () => options.tunnel!.facts() } : {}), ...(options.diagnostics?.interfaces ? { interfaces: options.diagnostics.interfaces } : {}), ...(options.diagnostics?.platform ? { platform: options.diagnostics.platform } : {}),
    });
    if (override !== undefined) {
      // The readiness gate: the configured (not yet running) bind and the supplied host facts, evaluated as public mode.
      const wanted = currentConfig(options.paths.configFile, { port: 0, ...(options.config.bind ? { bind: options.config.bind } : {}), ...(options.config.exposure ? { exposure: options.config.exposure } : {}) });
      const baseHost = deps.host;
      deps.config = { ...deps.config, bind: wanted.bind, bindAddress: bindAddress({ bind: wanted.bind, exposure: wanted.exposure }), exposure: { ...deps.config.exposure, mode: override.mode } };
      if (override.tunnel !== undefined) {
        // The `network tunnel on` gate: as if the change were already written (loopback bind, the loopback connector as the only trusted hop).
        const hostname = override.tunnel.hostname;
        const bind = wanted.bind === 'container' ? 'container' : 'loopback';
        const exposure = {
          ...deps.config.exposure,
          names: deps.config.exposure.names.includes(hostname) ? deps.config.exposure.names : [...deps.config.exposure.names, hostname],
          proxy: { trusted: [...TUNNEL_TRUSTED_PEERS], publicOrigin: `https://${hostname}` },
          tunnel: { enabled: true, hostname },
        };
        deps.config = { ...deps.config, bind, bindAddress: bindAddress({ bind, exposure: { proxy: exposure.proxy } }), exposure };
        deps.tunnel = options.tunnel?.facts({ enabled: true, hostname }) ?? null;
      }
      deps.host = async () => ({ ...(await baseHost()), ...override.host });
    }
    return collectDiagnostics(deps);
  };
  app.decorate('hubDiagnostics', collectHubDiagnostics);
  registerDiagnosticsRoute(app, { db: options.hub.db, now, requireOwner: authOptions.requireOwner, collect: collectHubDiagnostics });
  registerBackupRoutes(app, {
    db: options.hub.db, requireOwner: authOptions.requireOwner, defaultFolder: options.paths.backupsDir,
    backupConfig: () => currentConfig(options.paths.configFile, { port: 0 }).backup,
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
    ...(proxy && tunnelConfig?.enabled ? { tunnelHostname: tunnelConfig.hostname } : {}),
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
  registerCollabHistoryRoutes(app, { db: options.hub.db, now, registry: collab, requireOwner: authOptions.requireOwner, requireDevice });
  // History retention (PD-105): snapshots past 30 days are removed once a day.
  jobs.register('collab-history-prune', COLLAB_HISTORY_PRUNE_INTERVAL_MS);
  const stopHistoryPruning = startCollabHistoryPruning(options.hub.db, now, COLLAB_HISTORY_PRUNE_INTERVAL_MS, jobs.handle('collab-history-prune'));
  // Base pruning below the sync floor and tail compaction of stored documents (PD-105): the sync compaction cadence, first run right after it.
  const collabMaintenanceMs = options.sync?.compactionIntervalMs ?? SYNC_COMPACTION_INTERVAL_MS;
  jobs.register('collab-maintenance', collabMaintenanceMs);
  let stopCollabMaintenance = (): void => undefined;
  app.addHook('onReady', async () => {
    stopCollabMaintenance = startCollabMaintenance({ db: options.hub.db, registry: collab, log: app.log, intervalMs: collabMaintenanceMs, job: jobs.handle('collab-maintenance') });
  });
  const stopObservingCommits = observeCanonicalCommits(options.hub.db, (event) => {
    const kind = event.op === 'delete' ? collabKindForEntity(event.entityType) : null;
    if (kind !== null) collab.evict(`${kind}:${event.entityId}`);
  });
  const onEnvironmentCleared = (): void => collab.evictAll();
  app.hubEvents.on('environment-cleared', onEnvironmentCleared);
  app.addHook('onClose', async () => {
    stopObservingCommits();
    stopHistoryPruning();
    stopCollabMaintenance();
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
