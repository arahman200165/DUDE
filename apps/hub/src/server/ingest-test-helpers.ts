import { INGEST_SCOPES } from '@dude/contracts/hub';
import type { IngestTokenCreateResponse } from '@dude/contracts/hub';
import { createSession } from '../auth/sessions.js';
import { ensureLayout } from '../config/data-dir.js';
import type { RateLimiterOptions } from '../security/rate-limit.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import type { SaveSphereDb } from '../savesphere-db/open.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { ApiResult, AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';
import { tempDir } from './test-helpers.js';

/** Ingest specs (Milestone 843): a real Hub test server over a real `savesphere.db`, with an owner session ready. */
export interface IngestHub extends AuthHub {
  /** The `savesphere.db` the Hub serves ingest tokens from (absent when started `unprovisioned`). */
  sdb: SaveSphereDb | undefined;
  owner: Signed;
  /** Mints a token as the owner (password sign-in starts stepped up). Returns the response. */
  mint(label?: string, extra?: { expiresInDays?: number; session?: Pick<Signed, 'cookie' | 'csrf'> }): Promise<ApiResult>;
  /** `mint`, asserting success; returns the secret and the id. */
  mintOk(label?: string, extra?: { expiresInDays?: number }): Promise<{ secret: string; id: string; body: IngestTokenCreateResponse }>;
  ping(secret: string | undefined, headers?: Record<string, string>): Promise<ApiResult>;
  /** A live owner bearer (`dob_`) and a device token (`ddt_`) for the credential matrix. */
  ownerBearer(): Promise<string>;
  deviceToken(): Promise<string>;
}

export interface StartIngestHubOptions {
  /** No `savesphere.db`: SaveSphere storage is not set up. */
  unprovisioned?: boolean;
  rateLimit?: RateLimiterOptions;
  clock?: { t: number };
}

export async function startIngestHub(options: StartIngestHubOptions = {}): Promise<IngestHub> {
  const root = tempDir('hub-ingest-');
  let sdb: SaveSphereDb | undefined;
  if (options.unprovisioned !== true) {
    const opened = openSaveSphereDb(ensureLayout(root));
    if (opened.status !== 'ready') throw new Error('savesphere.db not ready');
    sdb = opened.store;
  }
  const h = await startAuthHub({
    dataRoot: root,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.rateLimit ? { rateLimit: options.rateLimit } : {}),
    ...(sdb ? { ingest: { db: sdb.db } } : {}),
  });
  const owner = await h.signIn();
  const mint: IngestHub['mint'] = (label = 'Phone shortcut', extra = {}) => {
    const s = extra.session ?? owner;
    return h.call('POST', '/admin/ingest-tokens', {
      cookie: s.cookie, csrf: s.csrf, body: { label, scopes: [...INGEST_SCOPES], ...(extra.expiresInDays === undefined ? {} : { expiresInDays: extra.expiresInDays }) },
    });
  };
  return {
    ...h, sdb, owner, mint,
    async mintOk(label, extra) {
      const res = await mint(label, extra);
      if (res.status !== 201) throw new Error(`mint failed: ${res.status} ${res.raw.body}`);
      return { secret: res.json.secret as string, id: res.json.token.id as string, body: res.json as IngestTokenCreateResponse };
    },
    ping: (secret, headers) => h.call('GET', '/ingest/ping', { ...(secret === undefined ? {} : { bearer: secret }), ...(headers ? { headers } : {}), noOrigin: true }),
    async ownerBearer() {
      const device = await enrolled(h, owner);
      const deviceId = device.device.deviceId;
      return createSession(h.hub.hub.db, { ownerId: h.ownerId, kind: 'bearer', deviceId, now: h.clock.t }).token;
    },
    async deviceToken() { return (await enrolled(h, owner)).token; },
    close: async () => {
      await h.close();
      sdb?.close();
    },
  };
}
