import path from 'node:path';
import type { Server as TlsServer } from 'node:tls';
import type { FastifyInstance } from 'fastify';
import { ensureLayout, resolveDataDir } from '../config/data-dir.js';
import { bindAddress, loadOrCreateHubConfig } from '../config/hub-config.js';
import { openHubDb } from '../db/open-hub-db.js';
import { createHubServer } from '../server/create-server.js';
import { createLogStream, hubLoggerOptions } from '../server/logger.js';
import { ensureTlsIdentity } from '../tls/index.js';
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
  if (parsed.command === 'tls') {
    return runTls({
      action: parsed.action,
      ...(parsed.dataDir !== undefined ? { dataDir: parsed.dataDir } : {}),
      ...(parsed.restage ? { restage: true } : {}),
      ...(parsed.force ? { force: true } : {}),
      ...(parsed.confirm !== undefined ? { confirm: parsed.confirm } : {}),
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
  const tls = ensureTlsIdentity(paths.tlsDir, { hubInstanceId: hub.hubInstanceId });
  const logStream = createLogStream(path.join(paths.logsDir, 'hub.log'), { stdout: true });
  const server: FastifyInstance = createHubServer({
    paths,
    config,
    tls,
    hub: { db: hub.db, hubInstanceId: hub.hubInstanceId },
    hubVersion: hubVersion(),
    logger: hubLoggerOptions(logStream),
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
        db: hub.db, hubVersion: hubVersion(), hubInstanceId: hub.hubInstanceId, bind: config.bind, getPort: () => port, startedAt, configDir: paths.configDir, spkiSha256: tls.spkiSha256,
        tls: createTlsRotation({
          db: hub.db, tlsDir: paths.tlsDir, hubInstanceId: hub.hubInstanceId,
          applySecureContext: (context) => (server.server as unknown as TlsServer).setSecureContext(context),
          announceNext: (spkiSha256) => server.hubEvents.emit('tls-next-pin', { spkiSha256 }),
        }),
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
  audit(hub.db, { event: 'hub.started', outcome: 'success', actorKind: 'system', detail: { version: hubVersion(), port, bind: config.bind }, now: Date.now() });
  process.stdout.write(`${JSON.stringify({ event: 'listening', url: `https://127.0.0.1:${port}`, spkiSha256: tls.spkiSha256 })}\n`);

  return new Promise<number>((resolve) => {
    let stopping = false;
    const shutdown = (): void => {
      if (stopping) return;
      stopping = true;
      void (async () => {
        let code = EXIT_OK;
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
