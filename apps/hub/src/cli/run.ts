import path from 'node:path';
import type { Server as TlsServer } from 'node:tls';
import type { FastifyInstance } from 'fastify';
import { ensureLayout, resolveDataDir } from '../config/data-dir.js';
import { bindAddress, exposureRefusal, loadOrCreateHubConfig } from '../config/hub-config.js';
import { openHubDb } from '../db/open-hub-db.js';
import { presentTestKnobs, readHubTestOverrides } from './test-overrides.js';
import { createHubServer } from '../server/create-server.js';
import { createLogStream, hubLoggerOptions } from '../server/logger.js';
import { existsSync } from 'node:fs';
import { ensureTlsIdentity } from '../tls/index.js';
import { defaultAcmeKeyProtector, defaultCaKeyProtector } from '../tls/ca-key-protector.js';
import { localCaExists, rootSha256, readCaCertPem } from '../tls/ca-public.js';
import { createLeafRenewal } from '../tls/renewal.js';
import { runTlsCa } from '../service/tls-ca.js';
import { computeSubjectAltNames, configuredDnsNames, missingSubjectAltNames } from '../tls/names.js';
import { runSecurityBlocks } from '../service/security-blocks.js';
import { runSecurityAuditIps } from '../service/security-audit-ips.js';
import { runTlsNames } from '../service/tls-names.js';
import { runTlsImport, runTlsProxyPin } from '../service/tls-external.js';
import { runTlsAcme } from '../service/tls-acme.js';
import { createAcmeRenewal } from '../tls/acme/acme-renewal.js';
import { addressChangeNotice, createAddressWatch } from '../diagnostics/address-watch.js';
import { AdminCallError, callAdmin } from '../admin/admin-client.js';
import { startAdminEndpoint } from '../admin/admin-endpoint.js';
import { buildAdminMethods } from '../admin/methods.js';
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
import { runFirewall } from '../service/firewall.js';
import { createHstsPolicy } from '../security/hsts.js';
import { runDoctor } from '../service/doctor.js';
import { runPurge } from '../service/purge.js';
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
  ensureSetupToken(hub.db, paths.configDir, Date.now());
  const wantedNames = computeSubjectAltNames(config);
  const hadIdentity = existsSync(path.join(paths.tlsDir, 'cert.pem')) && existsSync(path.join(paths.tlsDir, 'key.pem'));
  // A NEW identity carries every configured name; an existing one is never replaced silently (devices pin it).
  const caProtector = defaultCaKeyProtector();
  const acmeProtector = defaultAcmeKeyProtector();
  const hadCa = localCaExists(paths.tlsDir);
  // New Hubs default to the built-in local CA (PD-058); an existing self-signed Hub opts in with "tls ca init".
  const tls = ensureTlsIdentity(paths.tlsDir, { hubInstanceId: hub.hubInstanceId, extraNames: wantedNames, localCa: { protector: caProtector, configuredNames: configuredDnsNames(config) } });
  if (!hadCa && localCaExists(paths.tlsDir)) {
    audit(hub.db, { event: 'tls.ca-created', outcome: 'success', actorKind: 'system', detail: { rootSha256: rootSha256(readCaCertPem(paths.tlsDir)!) }, now: Date.now() });
  }
  const staleNames = hadIdentity ? missingSubjectAltNames(tls.certPem, wantedNames) : [];
  if (staleNames.length > 0) {
    process.stdout.write(`${JSON.stringify({ event: 'tls-names-stale', missing: staleNames, hint: 'Run "dude-hub tls rotate" to stage a certificate that covers them, then "dude-hub tls activate".' })}\n`);
  }
  const logStream = createLogStream(path.join(paths.logsDir, 'hub.log'), { stdout: true });
  const server: FastifyInstance = createHubServer({
    paths,
    config,
    tls,
    hub: { db: hub.db, hubInstanceId: hub.hubInstanceId },
    hubVersion: hubVersion(),
    logger: hubLoggerOptions(logStream),
    ...readHubTestOverrides(),
  });

  try {
    await server.listen({ port: config.port, host: bindAddress(config) });
  } catch (error) {
    process.stderr.write(`The Hub could not listen on ${bindAddress(config)}:${config.port}: ${(error as Error).message}\n`);
    hub.close();
    logStream.close();
    return EXIT_FAILURE;
  }
  const address = server.server.address();
  const port = typeof address === 'object' && address ? address.port : config.port;
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
        caProtector, acmeProtector,
        tls: createTlsRotation({
          db: hub.db, tlsDir: paths.tlsDir, hubInstanceId: hub.hubInstanceId, caProtector,
          applySecureContext: (context) => (server.server as unknown as TlsServer).setSecureContext(context),
          announceNext: (spkiSha256) => server.hubEvents.emit('tls-next-pin', { spkiSha256 }),
        }),
        diagnostics: (override) => server.hubDiagnostics(override),
        proxyPins: createProxyPins({ db: hub.db, announceNext: (spkiSha256) => server.hubEvents.emit('tls-next-pin', { spkiSha256, kind: 'proxy' }) }),
        onSessionsRevoked: (sessions) => emitRevoked(server, sessions, 'owner-reset'),
      }),
    });
  } catch (error) {
    process.stderr.write(`The admin endpoint could not start: ${(error as Error).message}\n`);
    await server.close();
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
  });
  renewal.start();
  // Re-orders an ACME-issued active certificate (same key) within 30 days of expiry; the http-01 listener binds only during an order.
  const acmeRenewal = createAcmeRenewal({
    db: hub.db, tlsDir: paths.tlsDir, configFile: paths.configFile, protector: acmeProtector,
    applySecureContext: (context) => (server.server as unknown as TlsServer).setSecureContext(context),
    audit: (event, outcome, detail) => audit(hub.db, { event, outcome, actorKind: 'system', detail, now: Date.now() }),
    recordCertificate: (certPem, spki) => void hub.db.prepare("UPDATE tls_pins SET cert_pem = ? WHERE state = 'active' AND spki_sha256 = ?").run(certPem, spki),
  });
  acmeRenewal.start();
  // Detection only (PD-064): records this machine's addresses and audits a change; DNS is never updated and no DNS credential is stored.
  const addressWatch = createAddressWatch({
    db: hub.db,
    audit: (event, detail) => audit(hub.db, { event, outcome: 'success', actorKind: 'system', detail, now: Date.now() }),
  });
  try {
    const change = addressWatch.runOnce();
    const notice = addressChangeNotice(change);
    if (notice !== null) process.stdout.write(`${notice}
`);
  } catch { /* detection is best effort */ }
  addressWatch.start();
  audit(hub.db, { event: 'hub.started', outcome: 'success', actorKind: 'system', detail: { version: hubVersion(), port, bind: config.bind }, now: Date.now() });
  process.stdout.write(`${JSON.stringify({ event: 'listening', url: `https://127.0.0.1:${port}`, spkiSha256: tls.spkiSha256 })}\n`);

  return new Promise<number>((resolve) => {
    let stopping = false;
    const shutdown = (): void => {
      if (stopping) return;
      stopping = true;
      void (async () => {
        let code = EXIT_OK;
        renewal.stop();
        acmeRenewal.stop();
        addressWatch.stop();
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
