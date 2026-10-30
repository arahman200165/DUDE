import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { HUB_BACKUP_DRIVE_PATHS } from '@dude/contracts/hub';
import { createDriveAuthorizations } from '../backup/destinations/index.js';
import type { DriveAuthorizations } from '../backup/destinations/index.js';
import { FakeDriveServer } from '../backup/destinations/drive/fake-drive-server.js';
import { request, startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';

/**
 * The Google Drive callback route (Milestone 856): the second cross-site GET exemption, and only while a connect waits; session-less
 * (credential headers stripped); a static page that echoes nothing; refused states are one answer and are throttled; only outcomes
 * Google decided are audited, with a closed reason and nothing else.
 */
const CALLBACK = HUB_BACKUP_DRIVE_PATHS.callback;
const CROSS_NAV = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };

const servers: FakeDriveServer[] = [];
const hubs: TestHub[] = [];
afterEach(async () => {
  for (const hub of hubs.splice(0)) await hub.close();
  for (const server of servers.splice(0)) await server.close();
});

async function setup() {
  const server = new FakeDriveServer();
  servers.push(server);
  await server.start();
  const authorizations: DriveAuthorizations = createDriveAuthorizations({ endpoints: server.endpoints() });
  const seen: Array<{ cookie: string | string[] | null; authorization: string | string[] | null }> = [];
  const hub = await startTestHub({}, {
    driveAuthorizations: authorizations,
    configure: (app: FastifyInstance) => { app.addHook('onRequest', async (req) => { if (req.url.startsWith(CALLBACK)) seen.push({ cookie: req.headers['cookie'] ?? null, authorization: req.headers['authorization'] ?? null }); }); },
  });
  hubs.push(hub);
  const get = (path: string, headers: Record<string, string> = {}, method = 'GET') => request(hub.port, hub.tls.certPem, path, { method, headers });
  const start = () => {
    const started = authorizations.begin({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: 'https://hub.example.com' });
    const approved = server.authorize(started.authorizationUrl) as { redirect: string };
    return { started, query: new URL(approved.redirect).search, state: new URL(approved.redirect).searchParams.get('state')! };
  };
  const audit = () => hub.hub.db.prepare("SELECT event, outcome, actor_kind, detail_json FROM audit_events WHERE event = 'backup.drive-authorized' ORDER BY seq").all() as Array<{ event: string; outcome: string; actor_kind: string; detail_json: string | null }>;
  return { server, authorizations, hub, get, start, audit, seen };
}

describe('GET /api/v1/backup/drive/callback', () => {
  it('is refused as a cross-site navigation unless a connect is waiting', async () => {
    const { get, start, authorizations } = await setup();
    expect((await get(`${CALLBACK}?code=c&state=s`, CROSS_NAV)).status).toBe(403);
    const { query } = start();
    expect(authorizations.waiting()).toBe(true);
    const answer = await get(`${CALLBACK}${query}`, CROSS_NAV);
    expect(answer.status).toBe(200);
    expect(authorizations.waiting()).toBe(false);
    expect((await get(`${CALLBACK}${query}`, CROSS_NAV)).status).toBe(403); // spent: the exemption is gone again
  });

  it('is session-less: cookie and authorization never reach the handler; only a real document navigation is accepted', async () => {
    const { get, start, seen } = await setup();
    const { query } = start();
    expect((await get(`${CALLBACK}${query}`, { ...CROSS_NAV, 'sec-fetch-mode': 'cors' })).status).toBe(403);
    expect((await get(`${CALLBACK}${query}`, { ...CROSS_NAV, 'sec-fetch-dest': 'iframe' })).status).toBe(403);
    expect((await get(`${CALLBACK}${query}`, { ...CROSS_NAV, cookie: 'dude_session=abc', authorization: 'Bearer abc' })).status).toBe(200);
    expect(seen).toEqual([{ cookie: null, authorization: null }]);
  });

  it('answers a small static page that echoes no query value, token or secret, with no-store and no referrer', async () => {
    const { get, start, server } = await setup();
    const { query } = start();
    const answer = await get(`${CALLBACK}${query}`, CROSS_NAV);
    expect(answer.status).toBe(200);
    expect(answer.headers['content-type']).toMatch(/^text\/html/);
    expect(answer.headers['cache-control']).toBe('no-store');
    expect(answer.headers['referrer-policy']).toBe('no-referrer');
    expect(answer.headers['set-cookie']).toBeUndefined();
    expect(answer.body).toContain('Google Drive authorized');
    expect(answer.body).not.toMatch(/<script/i);
    for (const piece of [...new URLSearchParams(query).values(), server.options.clientSecret]) expect(answer.body).not.toContain(piece);
  });

  it('accepts only the documented query parameters, once each, and refuses a body and every method but GET', async () => {
    const { get, start } = await setup();
    const { query } = start();
    for (const bad of ['?session=abc', '?code=c&code=d', '?state=a&state=b', '?code=c&access_token=t', '?redirect_uri=https://evil.example']) {
      expect([bad, (await get(`${CALLBACK}${bad}`, CROSS_NAV)).status]).toEqual([bad, 400]);
    }
    expect((await get(`${CALLBACK}${query}`, CROSS_NAV, 'POST')).status).toBeGreaterThanOrEqual(400);
    expect((await get(`${CALLBACK}${query}`, CROSS_NAV, 'DELETE')).status).toBeGreaterThanOrEqual(400);
  });

  it('refuses an unknown, malformed, replayed or expired state with one answer, writes no audit row, and counts the failure', async () => {
    const { get, start, audit, authorizations, hub } = await setup();
    const { query } = start();
    expect((await get(`${CALLBACK}?code=c&state=${'A'.repeat(43)}`)).status).toBe(400);
    expect((await get(`${CALLBACK}?code=c&state=short`)).status).toBe(400);
    expect((await get(`${CALLBACK}?code=c`)).status).toBe(400);
    expect((await get(`${CALLBACK}${query}`)).status).toBe(200);
    expect((await get(`${CALLBACK}${query}`)).status).toBe(400); // replay
    expect(audit().filter((row) => row.outcome === 'failure')).toEqual([]);
    const failures = (hub.hub.db.prepare("SELECT COALESCE(SUM(failures), 0) AS n FROM throttle WHERE throttle_key LIKE 'oidc:%'").get() as { n: number }).n;
    expect(failures).toBeGreaterThanOrEqual(4);
    expect(authorizations.waiting()).toBe(false);
  });

  it('audits what Google decided with a closed reason only: authorized, declined and refused', async () => {
    const { get, start, audit, server, authorizations } = await setup();
    const ok = start();
    await get(`${CALLBACK}${ok.query}`);
    const declinedStart = authorizations.begin({ clientId: server.options.clientId, clientSecret: server.options.clientSecret, redirectOrigin: 'https://hub.example.com' });
    const declined = server.authorize(declinedStart.authorizationUrl, { deny: true }) as { redirect: string };
    const declinedAnswer = await get(`${CALLBACK}${new URL(declined.redirect).search}`);
    expect(declinedAnswer.status).toBe(400);
    expect(declinedAnswer.body).toContain('was not connected');
    const refusedStart = authorizations.begin({ clientId: server.options.clientId, clientSecret: 'GOCSPX-wrong-secret-000000000', redirectOrigin: 'https://hub.example.com' });
    const refused = server.authorize(refusedStart.authorizationUrl) as { redirect: string };
    expect((await get(`${CALLBACK}${new URL(refused.redirect).search}`)).status).toBe(400);
    expect(audit()).toEqual([
      { event: 'backup.drive-authorized', outcome: 'success', actor_kind: 'anonymous', detail_json: '{}' },
      { event: 'backup.drive-authorized', outcome: 'failure', actor_kind: 'anonymous', detail_json: JSON.stringify({ reason: 'declined' }) },
      { event: 'backup.drive-authorized', outcome: 'failure', actor_kind: 'anonymous', detail_json: JSON.stringify({ reason: 'invalid_client' }) },
    ]);
    const everything = JSON.stringify(audit());
    for (const secret of [server.options.clientSecret, 'GOCSPX', '4/', 'ya29', ok.state]) expect(everything).not.toContain(secret);
  });
});
