import path from 'node:path';
import type { Server as TlsServer } from 'node:tls';
import type { FastifyInstance } from 'fastify';
import { ensureLayout, resolveDataDir } from '../config/data-dir.js';
import { bindAddress, exposureRefusal, loadOrCreateHubConfig } from '../config/hub-config.js';
import { openHubDb } from '../db/open-hub-db.js';
import { drainAuditOutboxAtStart } from '../savesphere-db/audit-outbox.js';
import { createQueueRuntime } from '../queue/queue-runtime.js';
import { presentTestKnobs, readHubTestOverrides } from './test-overrides.js';
import { createHubServer } from '../server/create-server.js';
import { createLogStream, hubLoggerOptions } from '../server/logger.js';
import { existsSync } from 'node:fs';
import { ensureTlsIdentity } from '../tls/index.js';
import { defaultAcmeKeyProtector, defaultCaKeyProtector } from '../tls/ca-key-protector.js';
import { localCaExists, rootSha256, readCaCertPem } from '../tls/ca-public.js';
import { RENEWAL_INTERVAL_MS, createLeafRenewal } from '../tls/renewal.js';
import { runTlsCa } from '../service/tls-ca.js';
import { canonicalSanName, computeSubjectAltNames, configuredDnsNames, missingSubjectAltNames, operatorCertificateNames } from '../tls/names.js';
import { runSecurityBlocks } from '../service/security-blocks.js';
import { runSecurityAuditIps } from '../service/security-audit-ips.js';
import { runTlsNames } from '../service/tls-names.js';
import { runTlsImport, runTlsProxyPin } from '../service/tls-external.js';
import { runTlsAcme } from '../service/tls-acme.js';
import { nodeBackupDeps } from '../backup/kdf.js';
import { BACKUP_SCHEDULER_CHECK_MS, createBackupScheduler } from '../backup/scheduler.js';
import { defaultScheduleKeyProtector } from '../backup/schedule-key.js';
import { defaultMasterKeyStore } from '../backup/master-key.js';
import { ACME_RENEWAL_INTERVAL_MS, createAcmeRenewal } from '../tls/acme/acme-renewal.js';
import { ADDRESS_WATCH_INTERVAL_MS, addressChangeNotice, createAddressWatch } from '../diagnostics/address-watch.js';
import { AdminCallError, callAdmin } from '../admin/admin-client.js';
import { startAdminEndpoint } from '../admin/admin-endpoint.js';
import { buildAdminMethods } from '../admin/methods.js';
import { REALTIME_CLOSE_CODES } from '@dude/contracts/hub';
import { ensureSetupToken } from '../auth/setup-token.js';
import { audit } from '../security/audit.js';
import { emitRevoked } from '../auth/hub-events.js';
import { runOwnerReset } from './owner-reset.js';
import { runSetupToken } from './setup-token.js';
import { runTls } from './tls.js';
import { createTlsRotation } from '../tls/rotation.js';
import { createProxyPins } from '../tls/proxy-pins.js';
import { runServiceInstall } from '../service/install.js';
import { runServiceControl, runServiceStatus, runServiceUninstall, runServiceUpdate } from '../service/lifecycle.js';
import { runNetwork } from '../service/network.js';
import { runTunnel } from '../service/tunnel.js';
import { runFirewall } from '../service/firewall.js';
import { createHstsPolicy } from '../security/hsts.js';
import { runDoctor } from '../service/doctor.js';
import { runPurge } from '../service/purge.js';
import { runBackup } from '../service/backup.js';
import { runProvision } from '../service/provision.js';
import { createProvisioningService } from '../provisioning/service.js';
import { createTunnelRuntime } from '../tunnel/tunnel-runtime.js';
import { createOidcSecretSource } from '../secrets/oidc-source.js';
import { createClientSecretReader } from '../auth/oidc/client-secret.js';
import type { OidcStatus } from '../auth/oidc/client.js';
import { runRestore } from '../service/restore.js';
import { HELP_TEXT, UsageError, parseArgs } from './args.js';

export const EXIT_OK = 0;
export const EXIT_FAILURE = 1;
export const EXIT_USAGE = 2;
export const EXIT_DATABASE = 3;

export function hubVersion(): string {
  return typeof __DUDE_VERSION__ === 'string' && __DUDE_VERSION__ ? __DUDE_VERSION__ : 'dev';
}

/** Asks the running service over the admin channel; never opens the database. Exit 2 when it is not running. */
async function runStatus(dataDir: string | undefined): Promise<number> {
  try {
    const result = await callAdmin(resolveDataDir({ dataDir }), 'status', {}, 3000);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return EXIT_OK;
  } catch (error) {
    process.stderr.write(`${error instanceof AdminCallError || error instanceof Error ? error.message : 'status failed'}\n`);
    return EXIT_USAGE;
  }
}

/** Runs the CLI. Resolves with an exit code for one-shot commands; `run` resolves only after shutdown. */
export async function runCli(argv: readonly string[]): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    if (error instanceof UsageError) {
      process.stderr.write(`${error.message}\n`);
      return EXIT_USAGE;
    }
    throw error;
  }
  if (parsed.command === 'help') {
    process.stdout.write(HELP_TEXT);
    return EXIT_OK;
  }
  if (parsed.command === 'version') {
    process.stdout.write(`${hubVersion()}\n`);
    return EXIT_OK;
  }

  if (parsed.command === 'status') return runStatus(parsed.dataDir);
  if (parsed.command === 'owner-reset') {
    return runOwnerReset({ ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.confirm !== undefined ? { confirm: parsed.confirm } : {}) });
  }
  if (parsed.command === 'tls-ca') {
    return runTlsCa({ action: parsed.action, ...(parsed.suffixes ? { suffixes: parsed.suffixes } : {}), ...(parsed.out !== undefined ? { out: parsed.out } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) });
  }
  if (parsed.command === 'tls-import') {
    return runTlsImport({ cert: parsed.cert, key: parsed.key, ...(parsed.chain !== undefined ? { chain: parsed.chain } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) });
  }
  if (parsed.command === 'tls-acme') {
    return runTlsAcme({
      action: parsed.action, ...(parsed.names ? { names: parsed.names } : {}), ...(parsed.email !== undefined ? { email: parsed.email } : {}),
      ...(parsed.agreeTos ? { agreeTos: true } : {}), ...(parsed.staging ? { staging: true } : {}), ...(parsed.directory !== undefined ? { directory: parsed.directory } : {}),
      ...(parsed.httpPort !== undefined ? { httpPort: parsed.httpPort } : {}), ...(parsed.openFirewall ? { openFirewall: true } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}),
    });
  }
  if (parsed.command === 'tls-proxy-pin') {
    return runTlsProxyPin({
      action: parsed.action, ...(parsed.value !== undefined ? { value: parsed.value } : {}), ...(parsed.force ? { force: true } : {}), ...(parsed.confirm !== undefined ? { confirm: parsed.confirm } : {}),
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}),
    });
  }
  if (parsed.command === 'security-audit-ips') {
    return runSecurityAuditIps({ ...(parsed.mode !== undefined ? { mode: parsed.mode } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) });
  }
  if (parsed.command === 'security-blocks') {
    return runSecurityBlocks({ action: parsed.action, ...(parsed.ip !== undefined ? { ip: parsed.ip } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) });
  }
  if (parsed.command === 'tls-names') {
    return runTlsNames({ action: parsed.action, ...(parsed.name !== undefined ? { name: parsed.name } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) });
  }
  if (parsed.command === 'tls') {
    return runTls({
      action: parsed.action,
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}),
      ...(parsed.restage ? { restage: true } : {}),
      ...(parsed.force ? { force: true } : {}),
      ...(parsed.confirm !== undefined ? { confirm: parsed.confirm } : {}),
    });
  }
  if (parsed.command === 'service') {
    const base = { ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) };
    switch (parsed.action) {
      case 'install': return runServiceInstall({ ...base, ...(parsed.port !== undefined ? { port: parsed.port } : {}), ...(parsed.lan ? { lan: true } : {}) });
      case 'uninstall': return runServiceUninstall({ ...base, ...(parsed.keepData ? { keepData: true } : {}) });
      case 'update': return runServiceUpdate({ ...base, ...(parsed.source !== undefined ? { source: parsed.source } : {}) });
      case 'status': return runServiceStatus(base);
      default: return runServiceControl(parsed.action, base);
    }
  }
  if (parsed.command === 'network-firewall') {
    return runFirewall({ target: parsed.target, action: parsed.action, ...(parsed.force ? { force: true } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) });
  }
  if (parsed.command === 'network') {
    return runNetwork({ action: parsed.action, ...(parsed.trusted !== undefined ? { trusted: parsed.trusted } : {}), ...(parsed.publicOrigin !== undefined ? { publicOrigin: parsed.publicOrigin } : {}), ...(parsed.acceptUnverifiedReachability ? { acceptUnverifiedReachability: true } : {}), ...(parsed.type !== undefined ? { type: parsed.type } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) });
  }
  if (parsed.command === 'network-tunnel') {
    return runTunnel({
      action: parsed.action,
      ...(parsed.hostname !== undefined ? { hostname: parsed.hostname } : {}), ...(parsed.confirm !== undefined ? { confirm: parsed.confirm } : {}), ...(parsed.type !== undefined ? { type: parsed.type } : {}),
      ...(parsed.tokenStdin ? { tokenStdin: true } : {}), ...(parsed.acceptUnverifiedReachability ? { acceptUnverifiedReachability: true } : {}), ...(parsed.forgetToken ? { forgetToken: true } : {}),
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}),
    });
  }
  if (parsed.command === 'doctor') {
    return runDoctor({ hubVersion: hubVersion(), ...(parsed.json ? { json: true } : {}), ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}) });
  }
  if (parsed.command === 'purge') {
    return runPurge({
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}),
      ...(parsed.includeBackups ? { includeBackups: true } : {}),
      ...(parsed.confirm !== undefined ? { confirm: parsed.confirm } : {}),
      ...(parsed.type !== undefined ? { type: parsed.type } : {}),
    });
  }
  if (parsed.command === 'backup') {
    return runBackup({
      action: parsed.action,
      ...(parsed.folder !== undefined ? { folder: parsed.folder } : {}), ...(parsed.file !== undefined ? { file: parsed.file } : {}), ...(parsed.confirm !== undefined ? { confirm: parsed.confirm } : {}),
      ...(parsed.forTransfer ? { forTransfer: true } : {}),
      ...(parsed.everyHours !== undefined ? { everyHours: parsed.everyHours } : {}), ...(parsed.keep !== undefined ? { keep: parsed.keep } : {}),
      ...(parsed.destination !== undefined ? { destination: parsed.destination } : {}), ...(parsed.label !== undefined ? { label: parsed.label } : {}),
      ...(parsed.backupId !== undefined ? { backupId: parsed.backupId } : {}),
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}),
    });
  }
  if (parsed.command === 'provision') {
    return runProvision({
      action: parsed.action,
      ...(parsed.json ? { json: true } : {}),
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}),
    });
  }
  if (parsed.command === 'backup-restore') {
    return runRestore({
      ...(parsed.file !== undefined ? { file: parsed.file } : {}), ...(parsed.folder !== undefined ? { folder: parsed.folder } : {}),
      ...(parsed.backupId !== undefined ? { backupId: parsed.backupId } : {}),
      ...(parsed.confirm !== undefined ? { confirm: parsed.confirm } : {}), ...(parsed.replace !== undefined ? { replace: parsed.replace } : {}), ...(parsed.oldHubGone !== undefined ? { oldHubGone: parsed.oldHubGone } : {}),
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}), ...(parsed.installDir !== undefined ? { installDir: parsed.installDir } : {}),
    });
  }
  if (parsed.command === 'setup-token') {
    return runSetupToken({
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}),
      ...(parsed.deliverTo !== undefined ? { deliverTo: parsed.deliverTo } : {}),
      ...(parsed.nonce !== undefined ? { nonce: parsed.nonce } : {}),
    });
  }

  const root = resolveDataDir({ dataDir: parsed.dataDir });
  const paths = ensureLayout(root);
  const config = loadOrCreateHubConfig(paths.configFile);
  if (parsed.port !== undefined) config.port = parsed.port;
  if (parsed.bind !== undefined) config.bind = parsed.bind;
  if (parsed.webRoot !== undefined) config.webRoot = path.resolve(parsed.webRoot);

  const refusal = exposureRefusal(config);
  if (refusal !== null) {
    process.stderr.write(`${refusal}\n`);
    return EXIT_USAGE;
  }

  const knobs = presentTestKnobs();
  if (config.exposure.mode === 'public' && knobs.length > 0) {
    process.stderr.write(`Refusing to start in public mode with test knobs set (${knobs.join(', ')}). Unset them.
`);
    return EXIT_USAGE;
  }

  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') {
    process.stderr.write(
      `${opened.message}\nDatabase: ${opened.path}\nThe Hub did not modify it. ` +
        (opened.status === 'incompatible'
          ? 'Install a DUDE Hub version that supports this database.'
          : 'Restore it from a backup or move it aside, then start the Hub again.') +
        '\n',
    );
    return EXIT_DATABASE;
  }
  const hub = opened.hub;
  // 32-SS1: hand over audit events a crash left in savesphere.db's outbox (only when that store exists; never fatal).
  try { drainAuditOutboxAtStart(paths, hub.db, (input) => audit(hub.db, input)); } catch { /* retried by the next drain */ }
  // 32-SS1: the durable queue exists only once SaveSphere storage does (a store that cannot open never blocks start).
  const queueRuntime = createQueueRuntime({ paths, hubDb: hub.db, auditWriter: (input) => audit(hub.db, input) });
  // 32-SS1 managed tunnel (Milestone 837): the supervised cloudflared and its connector token. Created always (cheap, nothing runs), started
  // below only when `exposure.tunnel.enabled`; the elevated `network tunnel on` also drives it through the admin pipe.
  let listeningPort = config.port;
  const tunnelRuntime = createTunnelRuntime({
    paths, getPort: () => listeningPort,
    readConfig: () => { try { return loadOrCreateHubConfig(paths.configFile).exposure.tunnel; } catch { return undefined; } },
    auditDegraded: (detail) => audit(hub.db, { event: 'tunnel.degraded', outcome: 'failure', actorKind: 'system', detail: { ...detail }, now: Date.now() }),
  });
  // 32-SS1 provisioning read model: checks only, never creates anything; the elevated `dude-hub provision` is the one writer.
  // 32-SS1 Google sign-in (Milestone 842): the client secret lives only in the machine-bound store; the client is built inside the server, and the
  // provisioning component reads its last known reachability through this late-bound getter.
  const oidcSecret = createOidcSecretSource(paths);
  let oidcStatus: (() => OidcStatus) | undefined;
  const provisioning = createProvisioningService(paths, {
    hubInstanceId: hub.hubInstanceId, queueRunning: queueRuntime !== undefined, tunnel: () => tunnelRuntime.status(),
    oidc: () => oidcStatus?.() ?? { state: 'off', detail: 'Google sign-in is not configured.' },
  });
  ensureSetupToken(hub.db, paths.configDir, Date.now());
  const wantedNames = computeSubjectAltNames(config);
  const hadIdentity = existsSync(path.join(paths.tlsDir, 'cert.pem')) && existsSync(path.join(paths.tlsDir, 'key.pem'));
  // A NEW identity carries every configured name; an existing one is never replaced silently (devices pin it).
  const caProtector = defaultCaKeyProtector();
  const acmeProtector = defaultAcmeKeyProtector();
  const scheduleKeyProtector = defaultScheduleKeyProtector();
  // Backup v2 (Milestone 847): the master key unattended runs use; only the backup admin methods and the scheduler read it.
  const masterKeyStore = defaultMasterKeyStore(paths);
  const hadCa = localCaExists(paths.tlsDir);
  // New Hubs default to the built-in local CA (PD-058); an existing self-signed Hub opts in with "tls ca init".
  const tls = ensureTlsIdentity(paths.tlsDir, { hubInstanceId: hub.hubInstanceId, extraNames: wantedNames, localCa: { protector: caProtector, configuredNames: configuredDnsNames(config) } });
  if (!hadCa && localCaExists(paths.tlsDir)) {
    audit(hub.db, { event: 'tls.ca-created', outcome: 'success', actorKind: 'system', detail: { rootSha256: rootSha256(readCaCertPem(paths.tlsDir)!) }, now: Date.now() });
  }
  // An imported or ACME certificate only has to cover the operator's names (loopback and host-name built-ins are not required of it).
  const activeSource = (hub.db.prepare("SELECT source FROM tls_pins WHERE state = 'active' LIMIT 1").get() as { source: string } | undefined)?.source;
  const operatorNames = operatorCertificateNames(config.exposure);
  const requiredNames = activeSource === 'imported' || activeSource === 'acme' ? wantedNames.filter((name) => operatorNames.includes(canonicalSanName(name))) : wantedNames;
  const staleNames = hadIdentity ? missingSubjectAltNames(tls.certPem, requiredNames) : [];
  if (staleNames.length > 0) {
    process.stdout.write(`${JSON.stringify({ event: 'tls-names-stale', missing: staleNames, hint: 'Run "dude-hub tls rotate" to stage a certificate that covers them, then "dude-hub tls activate".' })}\n`);
  }
  const logStream = createLogStream(path.join(paths.logsDir, 'hub.log'), { stdout: true });
  // TEST-ONLY (PD-068): empty in a release bundle. The backup check period goes to the scheduler below, the rest to the server.
  const { backupCheckMs: testBackupCheckMs, ...testServerOverrides } = readHubTestOverrides();
  const server: FastifyInstance = createHubServer({
    paths,
    config,
    tls,
    hub: { db: hub.db, hubInstanceId: hub.hubInstanceId },
    hubVersion: hubVersion(),
    backup: { scheduleKeyPresent: () => masterKeyStore.exists() },
    ...(queueRuntime ? { queue: { status: () => queueRuntime.status() } } : {}),
    ...(queueRuntime ? { ingest: { db: queueRuntime.db } } : {}),
    ...(queueRuntime ? { uploads: { service: queueRuntime.uploads } } : {}),
    provisioning: { status: () => provisioning.status() },
    tunnel: { status: () => tunnelRuntime.status(), facts: (candidate) => tunnelRuntime.facts(candidate) },
    oidc: { readClientSecret: createClientSecretReader(oidcSecret), clientSecretPresent: () => oidcSecret.present() },
    logger: hubLoggerOptions(logStream),
    ...testServerOverrides,
  });

  oidcStatus = () => server.oidc.status();
  try {
    await server.listen({ port: config.port, host: bindAddress(config) });
  } catch (error) {
    process.stderr.write(`The Hub could not listen on ${bindAddress(config)}:${config.port}: ${(error as Error).message}\n`);
    await queueRuntime?.stop();
    hub.close();
    logStream.close();
    return EXIT_FAILURE;
  }
  const address = server.server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
  listeningPort = port;
  const startedAt = Date.now();
  let admin: Awaited<ReturnType<typeof startAdminEndpoint>>;
  try {
    admin = await startAdminEndpoint({
      dataDir: paths.root,
      hubInstanceId: hub.hubInstanceId,
      methods: buildAdminMethods({
        db: hub.db, hubVersion: hubVersion(), hubInstanceId: hub.hubInstanceId, bind: config.bind, getPort: () => port, startedAt, configDir: paths.configDir, configFile: paths.configFile, tlsDir: paths.tlsDir, spkiSha256: tls.spkiSha256,
        onNamesChanged: (names) => server.hostGuard.setNames(names),
        hsts: createHstsPolicy({ db: hub.db, tlsDir: paths.tlsDir, proxy: config.exposure.proxy !== undefined }),
        caProtector, acmeProtector, paths, scheduleKeyProtector, masterKeyStore,
        saveSphereDb: () => queueRuntime?.db,
        queueRunning: () => queueRuntime !== undefined,
        tunnel: tunnelRuntime,
        onProvisioned: () => provisioning.invalidate(),
        tls: createTlsRotation({
          db: hub.db, tlsDir: paths.tlsDir, hubInstanceId: hub.hubInstanceId, caProtector,
          applySecureContext: (context) => (server.server as unknown as TlsServer).setSecureContext(context),
          announceNext: (spkiSha256) => server.hubEvents.emit('tls-next-pin', { spkiSha256 }),
        }),
        diagnostics: (override) => server.hubDiagnostics(override),
        proxyPins: createProxyPins({ db: hub.db, announceNext: (spkiSha256) => server.hubEvents.emit('tls-next-pin', { spkiSha256, kind: 'proxy' }) }),
        onSessionsRevoked: (sessions) => emitRevoked(server, sessions, 'owner-reset'),
        // 31G transfer: after the Hub retired itself, every realtime and collaboration socket closes with 4004 (the HTTP fence already refuses new work).
        onTransferred: () => {
          server.realtime.closeAll(REALTIME_CLOSE_CODES.transferred, 'hub transferred');
          server.collabSockets.closeAll(REALTIME_CLOSE_CODES.transferred, 'hub transferred');
          server.collabRooms.closeAll();
        },
        // A backup snapshot must include buffered Yjs updates and pending materializations (PD-105); rooms are never part of a backup.
        flushCollab: () => server.collab.flushAll(),
      }),
    });
  } catch (error) {
    process.stderr.write(`The admin endpoint could not start: ${(error as Error).message}\n`);
    await server.close();
    await queueRuntime?.stop();
    hub.close();
    logStream.close();
    return EXIT_FAILURE;
  }
  // Renews a CA-issued active leaf (same key, so the pin never changes) within 30 days of expiry; self-signed certificates are never touched.
  const renewal = createLeafRenewal({
    tlsDir: paths.tlsDir, hubInstanceId: hub.hubInstanceId, protector: caProtector,
    applySecureContext: (context) => (server.server as unknown as TlsServer).setSecureContext(context),
    audit: (event, detail) => audit(hub.db, { event, outcome: 'success', actorKind: 'system', detail, now: Date.now() }),
    recordCertificate: (certPem, spki) => void hub.db.prepare("UPDATE tls_pins SET cert_pem = ? WHERE state = 'active' AND spki_sha256 = ?").run(certPem, spki),
    job: server.hubJobs.handle('leaf-renewal'),
  });
  server.hubJobs.register('leaf-renewal', RENEWAL_INTERVAL_MS);
  renewal.start();
  // Re-orders an ACME-issued active certificate (same key) within 30 days of expiry; the http-01 listener binds only during an order.
  const acmeRenewal = createAcmeRenewal({
    db: hub.db, tlsDir: paths.tlsDir, configFile: paths.configFile, protector: acmeProtector,
    applySecureContext: (context) => (server.server as unknown as TlsServer).setSecureContext(context),
    audit: (event, outcome, detail) => audit(hub.db, { event, outcome, actorKind: 'system', detail, now: Date.now() }),
    recordCertificate: (certPem, spki) => void hub.db.prepare("UPDATE tls_pins SET cert_pem = ? WHERE state = 'active' AND spki_sha256 = ?").run(certPem, spki),
    job: server.hubJobs.handle('acme-renewal'),
  });
  server.hubJobs.register('acme-renewal', ACME_RENEWAL_INTERVAL_MS);
  acmeRenewal.start();
  // Unattended backups (31G, backup v2 from Milestone 847): checks every 10 minutes and does nothing unless `backup schedule set`
  // configured an interval in hub.json; each due destination gets a v2 run with the master key from the secret store.
  const backupScheduler = createBackupScheduler({
    db: hub.db, paths, hubVersion: hubVersion(), hubInstanceId: hub.hubInstanceId,
    readConfig: () => loadOrCreateHubConfig(paths.configFile), masterKeys: masterKeyStore, deps: nodeBackupDeps(),
    saveSphereDb: () => queueRuntime?.db,
    job: server.hubJobs.handle('backup-schedule'),
    onCheck: ({ intervalHours }) => server.hubNotifications.checkBackupOverdue(intervalHours),
    beforeSnapshot: () => server.collab.flushAll(),
    ...(testBackupCheckMs !== undefined ? { checkMs: testBackupCheckMs } : {}),
  });
  server.hubJobs.register('backup-schedule', testBackupCheckMs ?? BACKUP_SCHEDULER_CHECK_MS);
  backupScheduler.start();
  // Detection only (PD-064): records this machine's addresses and audits a change; DNS is never updated and no DNS credential is stored.
  const addressWatch = createAddressWatch({
    db: hub.db,
    audit: (event, detail) => audit(hub.db, { event, outcome: 'success', actorKind: 'system', detail, now: Date.now() }),
    job: server.hubJobs.handle('address-watch'),
  });
  server.hubJobs.register('address-watch', ADDRESS_WATCH_INTERVAL_MS);
  try {
    const change = addressWatch.runOnce();
    const notice = addressChangeNotice(change);
    if (notice !== null) process.stdout.write(`${notice}
`);
  } catch { /* detection is best effort */ }
  addressWatch.start();
  // Recovers jobs a crash left leased, then runs queued work and the scheduled blob verify and staging sweep.
  try { await queueRuntime?.start(server.hubJobs); } catch { /* the queue is optional; the Hub keeps serving */ }
  // A cheap, read-only provisioning check once SaveSphere storage exists; it logs the overall state and counts, never a detail.
  if (existsSync(paths.saveSphereDbPath)) void provisioning.checkAtStart((event, detail) => void process.stdout.write(`${JSON.stringify({ event, ...detail })}
`));
  // Tunnel mode (Milestone 837): the connector is supervised for the life of the Hub. A refused start (no token, a binary that is not the
  // pinned one, not Windows) is already audited as `tunnel.degraded` by the runtime and never stops the Hub from serving locally.
  process.on('exit', () => tunnelRuntime.killNow());
  if (config.exposure.tunnel?.enabled === true) {
    tunnelRuntime.start().catch((error: unknown) => {
      process.stdout.write(`${JSON.stringify({ event: 'tunnel-start-refused', code: (error as { code?: unknown }).code ?? 'start-failed' })}\n`);
    });
  }
  audit(hub.db, { event: 'hub.started', outcome: 'success', actorKind: 'system', detail: { version: hubVersion(), port, bind: config.bind }, now: Date.now() });
  process.stdout.write(`${JSON.stringify({ event: 'listening', url: `https://127.0.0.1:${port}`, spkiSha256: tls.spkiSha256 })}\n`);

  return new Promise<number>((resolve) => {
    let stopping = false;
    const shutdown = (): void => {
      if (stopping) return;
      stopping = true;
      void (async () => {
        let code = EXIT_OK;
        try { await tunnelRuntime.stop(); } catch { /* best effort: the next start sweeps an orphan */ }
        tunnelRuntime.dispose();
        renewal.stop();
        acmeRenewal.stop();
        backupScheduler.stop();
        addressWatch.stop();
        try { await queueRuntime?.stop(); } catch { /* best effort */ }
        try { await admin.close(); } catch { /* best effort */ }
        try { await server.close(); } catch { code = EXIT_FAILURE; }
        try { hub.db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch { /* best effort */ }
        hub.close();
        logStream.close();
        resolve(code);
      })();
    };
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK'] as const) process.on(signal, shutdown);
  });
}
