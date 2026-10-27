import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HUB_CREDENTIAL_TYPES, INGEST_PATH_PREFIX } from '@dude/contracts/hub';
import { startTestHub } from '../server/test-helpers.js';
import type { TestHub } from '../server/test-helpers.js';
import { ANONYMOUS_SESSION_ALLOWLIST, INGEST_ALLOWLIST_PROBE_PATH, findGatingException } from './route-gating-allowlist.js';

/** The fixture Milestone 844's enumerate-and-probe gating spec consumes (PD-122, PD-144). */
describe('anonymous-session allowlist fixture', () => {
  const registered = new Set<string>();
  let hub: TestHub;
  beforeAll(async () => {
    hub = await startTestHub({}, { configure: (app) => app.addHook('onRoute', (route) => { for (const m of [route.method].flat()) registered.add(`${m} ${route.url}`); }) });
  });
  afterAll(async () => { await hub.close(); });

  it('lists exactly the documented exceptions so far, each with a reason and a declared credential type from the closed list', () => {
    expect(ANONYMOUS_SESSION_ALLOWLIST.map((e) => `${e.method} ${e.path}`)).toEqual([
      'GET /api/v1/hello', 'POST /api/v1/auth/sign-in', 'POST /api/v1/auth/recover', 'POST /api/v1/owner/reset',
      'GET /api/v1/auth/oidc/status', 'POST /api/v1/auth/oidc/start', 'GET /api/v1/auth/oidc/callback', '* /api/v1/ingest/',
    ]);
    for (const entry of ANONYMOUS_SESSION_ALLOWLIST) {
      expect(entry.reason.length).toBeGreaterThan(20);
      expect(entry.credentials.length).toBeGreaterThan(0);
      for (const credential of entry.credentials) expect(HUB_CREDENTIAL_TYPES).toContain(credential);
    }
  });

  it('the ingest namespace is the only prefix entry and accepts an ingest token only', () => {
    const prefixes = ANONYMOUS_SESSION_ALLOWLIST.filter((e) => e.match === 'prefix');
    expect(prefixes).toHaveLength(1);
    expect(prefixes[0]).toMatchObject({ path: INGEST_PATH_PREFIX, credentials: ['ingest-token'], method: '*' });
  });

  it('every exact entry is a registered route, and the ingest prefix covers a registered route', () => {
    for (const entry of ANONYMOUS_SESSION_ALLOWLIST.filter((e) => e.match === 'exact')) expect(registered, `${entry.method} ${entry.path}`).toContain(`${entry.method} ${entry.path}`);
    expect([...registered].filter((r) => r.split(' ')[1]!.startsWith(INGEST_PATH_PREFIX))).toContain(`GET ${INGEST_ALLOWLIST_PROBE_PATH}`);
  });

  it('finds the exception for a request, ignoring the query string, and finds none for gated routes', () => {
    expect(findGatingException('GET', '/api/v1/ingest/ping?x=1')?.credentials).toEqual(['ingest-token']);
    expect(findGatingException('POST', '/api/v1/ingest/anything')?.credentials).toEqual(['ingest-token']);
    expect(findGatingException('GET', '/api/v1/hello')?.credentials).toEqual(['none']);
    expect(findGatingException('GET', '/api/v1/auth/sign-in')).toBeUndefined();
    for (const gated of ['/api/v1/sessions', '/api/v1/admin/ingest-tokens', '/api/v1/devices', '/api/v1/ingestx/ping']) expect(findGatingException('GET', gated), gated).toBeUndefined();
  });
});
