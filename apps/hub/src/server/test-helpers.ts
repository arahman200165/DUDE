import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { ensureLayout } from '../config/data-dir.js';
import type { HubPaths } from '../config/data-dir.js';
import { defaultHubConfig } from '../config/hub-config.js';
import type { HubConfig } from '../config/hub-config.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { ensureTlsIdentity } from '../tls/index.js';
import type { TlsIdentity } from '../tls/index.js';
import type { RateLimiterOptions } from '../security/rate-limit.js';
import type { CsrfVerifier } from '../security/request-guard.js';
import type { PasswordParams } from '../auth/password.js';
import { createHubServer } from './create-server.js';
import type { RealtimeTimings } from '../realtime/realtime.js';
import type { SyncCompactionOptions } from './sync-compaction.js';

export interface TestHub {
  app: FastifyInstance;
  paths: HubPaths;
  hub: HubDb;
  tls: TlsIdentity;
  port: number;
  close(): Promise<void>;
}

export function tempDir(prefix = 'hub-'): string {
  return mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** A fixture web root with an index and one hashed asset. */
export function makeWebRoot(): string {
  const root = tempDir('hub-web-');
  writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>DUDE</title>');
  writeFileSync(path.join(root, 'main-ABC12345.js'), 'console.log(1);');
  writeFileSync(path.join(root, 'favicon.ico'), 'ico');
  writeFileSync(path.join(root, 'chunk-CzvplghU.js'), 'console.log(2);');
  writeFileSync(path.join(root, 'manifest.webmanifest'), '{}');
  mkdirSync(path.join(root, 'assets'));
  return root;
}

export interface TestHubOptions {
  now?: () => number;
  csrfVerifier?: CsrfVerifier;
  extraHosts?: readonly string[];
  rateLimit?: RateLimiterOptions;
  configure?: (app: FastifyInstance) => void;
  passwordParams?: PasswordParams;
  realtime?: Partial<RealtimeTimings>;
  sync?: SyncCompactionOptions;
}

export async function startTestHub(config: Partial<HubConfig> = {}, extra: TestHubOptions = {}): Promise<TestHub> {
  const paths = ensureLayout(tempDir('hub-data-'));
  const opened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (opened.status !== 'ready') throw new Error('database not ready');
  const hub = opened.hub;
  const tls = ensureTlsIdentity(paths.tlsDir, { hubInstanceId: hub.hubInstanceId });
  const app = createHubServer({
    paths,
    config: { ...defaultHubConfig(), ...config },
    tls,
    hub: { db: hub.db, hubInstanceId: hub.hubInstanceId },
    hubVersion: 'test',
    ...extra,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  return {
    app,
    paths,
    hub,
    tls,
    port,
    close: async () => {
      await app.close();
      hub.close();
    },
  };
}

export interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** HTTPS request that sends `requestPath` verbatim (no URL normalization) and trusts only `ca`. */
export function request(
  port: number,
  ca: string,
  requestPath: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: '127.0.0.1', port, path: requestPath, method: options.method ?? 'GET', ca, headers: options.headers, servername: 'localhost' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}
