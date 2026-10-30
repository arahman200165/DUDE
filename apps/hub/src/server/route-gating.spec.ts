import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { Value } from 'typebox/value';
import { INGEST_SCOPES } from '@dude/contracts/hub';
import { createFakeIdp } from '../auth/oidc/fake-idp.js';
import type { FakeIdp } from '../auth/oidc/fake-idp.js';
import { createClientSecretReader } from '../auth/oidc/client-secret.js';
import { ensureLayout } from '../config/data-dir.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import type { SaveSphereDb } from '../savesphere-db/open.js';
import { ANONYMOUS_SESSION_ALLOWLIST, findGatingException, isPublicStaticRequest } from '../security/route-gating-allowlist.js';
import type { GatingException } from '../security/route-gating-allowlist.js';
import { startAuthHub } from './auth-test-helpers.js';
import type { AuthHub, Signed } from './auth-test-helpers.js';
import { enrolled } from './device-test-helpers.js';
import { makeWebRoot, request, tempDir } from './test-helpers.js';
import type { RawResponse } from './test-helpers.js';

/**
 * Enumerate-and-probe route gating (32-SS1, Milestone 844, PD-122, PD-144). The real Hub is started with everything configured, EVERY route
 * Fastify registers is captured through `onRoute` (hooked before the first route registers, and the spec fails if it was not), and each is
 * probed anonymously. A route is either gated (401 or 403, never a 2xx, a 5xx or a redirect) or listed in
 * `security/route-gating-allowlist.ts`, and each listed route is then probed to prove it is reachable anonymously ONLY as documented. An
 * entry with no registered route is stale and fails. Widening the allowlist to make this pass is a security decision with a recorded reason.
 */
interface CapturedRoute { method: string; url: string; websocket: boolean; schema: { params?: unknown; querystring?: unknown; body?: unknown } | undefined }

const FOREIGN_ORIGIN = 'https://evil.example';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const STRING_CANDIDATES = [
  'PARAMID', '123e4567-e89b-42d3-a456-426614174000', 'a'.repeat(43), 'a'.repeat(64), 'a'.repeat(86), '1', '0', 'AAAA-AAAA-AAAA-AAAA', 'abc-def',
  '2026-10-27T00:00:00.000Z', 'markdown-doc:m1', 'a:b', 'a.b', 'general', 'dude-1', 'a'.repeat(20), 'a'.repeat(8), '0123456789abcdef', 'a'.repeat(16), 'a'.repeat(32), 'f'.repeat(40), 'x'.repeat(32), 'user@example.com', 'https://example.com/',
];

type JsonSchema = { type?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; anyOf?: JsonSchema[]; oneOf?: JsonSchema[]; enum?: unknown[]; const?: unknown; minItems?: number; minimum?: number; default?: unknown; minLength?: number };

/** A value that satisfies `schema`, built from its JSON-schema shape (required properties only). `Value.Create` cannot do this for pattern and unique-array schemas. */
function generate(schema: JsonSchema): unknown {
  if (schema.default !== undefined) return schema.default;
  if (schema.const !== undefined) return schema.const;
  if (schema.enum !== undefined) return schema.enum[0];
  const variants = schema.anyOf ?? schema.oneOf;
  if (variants !== undefined) {
    for (const variant of variants) { try { const v = generate(variant); if (Value.Check(variant as never, v)) return v; } catch { /* next variant */ } }
    throw new Error('no variant could be generated');
  }
  switch (schema.type) {
    case 'string': {
      for (const candidate of STRING_CANDIDATES) if (Value.Check(schema as never, candidate)) return candidate;
      throw new Error(`no string candidate satisfies ${JSON.stringify(schema)}`);
    }
    case 'integer': case 'number': return schema.minimum !== undefined ? Math.max(1, schema.minimum) : 1;
    case 'boolean': return false;
    case 'null': return null;
    case 'array': {
      const count = schema.minItems ?? 0;
      return Array.from({ length: count }, () => generate(schema.items ?? {}));
    }
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const name of schema.required ?? []) out[name] = generate(schema.properties?.[name] ?? {});
      return out;
    }
    default: return {};
  }
}

/** A schema-valid dummy for a route's params, query or body, or undefined when the route declares none. Throws when the schema cannot be satisfied, so a route is never probed with input that fails validation before authentication. */
function dummyFor(schema: unknown): unknown {
  if (schema === undefined) return undefined;
  const value = generate(schema as JsonSchema);
  if (!Value.Check(schema as never, value)) throw new Error(`generated input does not satisfy ${JSON.stringify(schema).slice(0, 200)}`);
  return value;
}

function concretePath(route: CapturedRoute): string {
  const params = (dummyFor(route.schema?.params) ?? {}) as Record<string, unknown>;
  const raw = route.url.replace(/:([A-Za-z]+)/g, (_m, name: string) => encodeURIComponent(String(params[name] ?? 'PARAMID')));
  const query = dummyFor(route.schema?.querystring);
  if (query === undefined || typeof query !== 'object' || query === null) return raw;
  const search = new URLSearchParams(Object.entries(query as Record<string, unknown>).map(([k, v]) => [k, String(v)])).toString();
  return search === '' ? raw : `${raw}?${search}`;
}

interface Target { name: string; port: number; ca: string; host: string }

function send(target: Target, method: string, pathName: string, extra: { headers?: Record<string, string>; body?: unknown } = {}): Promise<RawResponse> {
  const headers: Record<string, string> = { host: target.host, ...extra.headers };
  if (extra.body !== undefined) headers['content-type'] = 'application/json';
  return request(target.port, target.ca, pathName, { method, headers, ...(extra.body === undefined ? {} : { body: JSON.stringify(extra.body) }) });
}

/** The anonymous probe of one route: no cookie, no token, no Origin (a non-browser client), a schema-valid dummy body where the route takes one. */
function probeAnonymous(target: Target, route: CapturedRoute): Promise<RawResponse> {
  const body = MUTATING.has(route.method) ? dummyFor(route.schema?.body) : undefined;
  return send(target, route.method, concretePath(route), body === undefined ? {} : { body: MUTATING.has(route.method) ? body : undefined });
}

const gated = (res: RawResponse): boolean => res.status === 401 || res.status === 403;
const leaksNothing = (res: RawResponse): boolean => res.headers['set-cookie'] === undefined && res.headers['location'] === undefined;

const key = (method: string, route: string): string => `${method === 'HEAD' ? 'GET' : method} ${route}`;
const covered = (route: CapturedRoute): GatingException | undefined => findGatingException(route.method === 'HEAD' ? 'GET' : route.method, route.url);

interface Fixture {
  name: string;
  hub: AuthHub;
  target: Target;
  routes: CapturedRoute[];
  hooked: boolean;
  close(): Promise<void>;
  idp?: FakeIdp;
  sdb?: SaveSphereDb;
}

async function start(name: 'full' | 'tunnel'): Promise<Fixture> {
  const routes: CapturedRoute[] = [];
  let firstRouteSeen = false;
  let hooked = false;
  const configure = (app: { addHook: (name: 'onRoute', fn: (route: { method: string | string[]; url: string; websocket?: boolean; schema?: CapturedRoute['schema'] }) => void) => void }): void => {
    app.addHook('onRoute', (route) => {
      firstRouteSeen = true;
      for (const method of [route.method].flat()) routes.push({ method, url: route.url, websocket: route.websocket === true, schema: route.schema });
    });
    // Everything a route registration needs comes after `options.configure` in `createHubServer`; the hook is live iff no route registered yet.
    hooked = !firstRouteSeen;
  };

  if (name === 'full') {
    const root = tempDir('hub-gating-');
    const opened = openSaveSphereDb(ensureLayout(root));
    if (opened.status !== 'ready') throw new Error('savesphere.db not ready');
    const idp = await createFakeIdp({ now: () => Date.now() });
    const reader = createClientSecretReader({ getText: () => idp.clientSecret });
    const hub = await startAuthHub({
      dataRoot: root, configure,
      config: { webRoot: makeWebRoot(), oidc: { issuer: idp.issuer, clientId: idp.clientId, redirectOrigin: 'https://hub.example.com' } },
      oidc: { readClientSecret: reader, clientSecretPresent: () => true, fetch: idp.fetch },
      ingest: { db: opened.store.db },
    });
    const target: Target = { name, port: hub.hub.port, ca: hub.hub.tls.certPem, host: `localhost:${hub.hub.port}` };
    return { name, hub, target, routes, hooked, idp, sdb: opened.store, close: async () => { await hub.close(); opened.store.close(); } };
  }

  // Tunnel mode over the trusted loopback connector, an unprovisioned Hub (no savesphere.db, no Google, no owner yet).
  const hostname = 'notes.example.com';
  const hub = await startAuthHub({
    bootstrapped: true, configure,
    config: { webRoot: makeWebRoot(), exposure: { mode: 'public', names: [hostname], proxy: { trusted: ['127.0.0.1', '::1'], publicOrigin: `https://${hostname}` }, tunnel: { enabled: true, hostname } } },
  });
  const target: Target = { name, port: hub.hub.port, ca: hub.hub.tls.certPem, host: hostname };
  return { name, hub, target, routes, hooked, close: () => hub.close() };
}

function wsRefusal(target: Target, route: CapturedRoute, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`wss://127.0.0.1:${target.port}${route.url}`, { ca: target.ca, headers: { host: target.host, ...headers } });
    ws.on('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode ?? 0); });
    ws.on('open', () => { ws.close(); reject(new Error(`${route.url}: the upgrade was accepted`)); });
    ws.on('error', () => { /* unexpected-response also fires */ });
  });
}

describe.each(['full', 'tunnel'] as const)('route gating, %s Hub', (variant) => {
  let fx: Fixture;
  beforeAll(async () => { fx = await start(variant); });
  afterAll(async () => { await fx.close(); });

  it('captured every route, with the capture hooked before the first registration', () => {
    expect(fx.hooked, 'the onRoute hook must be installed before any route registers').toBe(true);
    // The first routes the server registers are in the capture: a hook added late would have missed them.
    expect(fx.routes.slice(0, 3).map((r) => `${r.method} ${r.url}`)).toEqual(['GET /api/v1/hello', 'HEAD /api/v1/hello', 'POST /api/v1/bootstrap']);
    const unique = new Set(fx.routes.map((r) => `${r.method} ${r.url}`));
    expect(unique.size).toBeGreaterThan(80);
    // The two WebSocket upgrade routes are among them, and so is the OIDC callback.
    expect([...new Set(fx.routes.filter((r) => r.websocket).map((r) => r.url))].sort()).toEqual(['/api/v1/collab', '/api/v1/realtime']);
    expect([...unique]).toContain('GET /api/v1/auth/oidc/callback');
    expect([...unique]).toContain('GET /api/v1/backup/drive/callback');
    expect([...unique]).toContain('GET /api/v1/backup/onedrive/callback');
  });

  it('every captured route is gated (401 or 403) when probed anonymously, unless it is in the documented allowlist', async () => {
    const failures: string[] = [];
    let probed = 0;
    for (const route of fx.routes) {
      if (covered(route) !== undefined) continue;
      if (route.websocket) {
        // A plain GET to an upgrade route and a real upgrade attempt: refused before any socket exists.
        const plain = await probeAnonymous(fx.target, route);
        if (!gated(plain) || !leaksNothing(plain)) failures.push(`${route.method} ${route.url} (plain) -> ${plain.status}`);
        if (route.method === 'GET') {
          const status = await wsRefusal(fx.target, route);
          if (status !== 401) failures.push(`WS ${route.url} -> ${status}`);
        }
        continue;
      }
      const res = await probeAnonymous(fx.target, route);
      probed += 1;
      if (!gated(res) || !leaksNothing(res)) failures.push(`${route.method} ${concretePath(route)} -> ${res.status} ${res.body.slice(0, 80)}`);
    }
    expect(probed).toBeGreaterThan(60);
    expect(failures, `ungated or leaking routes:\n${failures.join('\n')}`).toEqual([]);
  });

  it('every allowlist entry is a registered route (no stale entries), and each prefix covers one', () => {
    const registered = new Set(fx.routes.map((r) => key(r.method, r.url)));
    for (const entry of ANONYMOUS_SESSION_ALLOWLIST) {
      if (entry.match === 'exact') expect(registered, `${entry.method} ${entry.path} is not a registered route: remove the stale entry`).toContain(`${entry.method} ${entry.path}`);
      else expect(fx.routes.some((r) => r.url.startsWith(entry.path)), `${entry.path} covers no registered route`).toBe(true);
    }
    // And the reverse: every route the allowlist covers is on it for a stated reason (nothing is covered by accident).
    for (const route of fx.routes) {
      const entry = covered(route);
      if (entry !== undefined) expect(entry.reason.length, `${route.url}`).toBeGreaterThan(20);
    }
  });

  it('answers the documented anonymous exceptions exactly as documented', async () => {
    const t = fx.target;
    const get = (p: string, method = 'GET') => send(t, method, p);
    const post = (p: string, body: unknown) => send(t, 'POST', p, { body });
    const full = variant === 'full';

    const hello = await get('/api/v1/hello');
    expect(hello.status).toBe(200);
    expect(JSON.parse(hello.body)).toMatchObject({ service: 'dude-hub' });
    expect(hello.body).not.toMatch(/PRIVATE KEY|session|token/i);

    const pins = await get('/api/v1/tls/certificates');
    expect(pins.status).toBe(200);
    expect(pins.body).not.toContain('PRIVATE KEY');
    expect(Object.keys(JSON.parse(pins.body)).sort()).toEqual(['active', 'caCertPem', 'leafNotAfter', 'next', 'proxySpkiSha256', 'source']);

    // Sign-in family: a wrong credential is a plain 401 with no cookie.
    for (const [p, body] of [
      ['/api/v1/auth/sign-in', { password: 'not the owner password' }],
      ['/api/v1/auth/recover', { recoveryCode: 'AAAA-AAAA-AAAA-AAAA', newPassword: 'a very long new password' }],
      ['/api/v1/owner/reset', { resetToken: 'x'.repeat(40), newPassword: 'a very long new password' }],
    ] as const) {
      const res = await post(p, body);
      // 409: a Hub with no owner yet has nothing to sign in to.
      expect([400, 401, 409], p).toContain(res.status);
      expect(res.headers['set-cookie'], p).toBeUndefined();
    }

    // Setup: never creates an owner without the setup token (and never at all once an owner exists).
    const boot = await post('/api/v1/bootstrap', { setupToken: 'x'.repeat(43), ownerDisplayName: 'Mallory', environmentName: 'Evil', password: 'a very long password' });
    expect([401, 409]).toContain(boot.status);
    expect(boot.headers['set-cookie']).toBeUndefined();

    // OIDC: status is two booleans; start gives an authorization URL only when configured; the callback only ever redirects, and sets no cookie.
    const status = await get('/api/v1/auth/oidc/status');
    expect(status.status).toBe(200);
    expect(Object.keys(JSON.parse(status.body)).sort()).toEqual(['configured', 'enabled']);
    const start = await post('/api/v1/auth/oidc/start', {});
    expect(start.status).toBe(full ? 200 : 503);
    if (full) expect(Object.keys(JSON.parse(start.body))).toEqual(['authorizationUrl', 'expiresAt']);
    const callback = await get('/api/v1/auth/oidc/callback');
    expect(callback.status).toBe(302);
    expect(String(callback.headers['location'])).toMatch(/^\/hub\/sign-in\?/);
    expect(callback.headers['set-cookie']).toBeUndefined();

    // Google Drive backup consent callback (Milestone 856): with no connect waiting it is one plain refusal page, no cookie, nothing written.
    const driveCallback = await get('/api/v1/backup/drive/callback');
    expect(driveCallback.status).toBe(400);
    expect(String(driveCallback.headers['content-type'])).toContain('text/html');
    expect(driveCallback.headers['set-cookie']).toBeUndefined();
    expect(driveCallback.body).not.toMatch(/owner|session|csrf|token/i);

    // OneDrive backup consent callback (Milestone 857): the same, for Microsoft's redirect.
    const onedriveCallback = await get('/api/v1/backup/onedrive/callback');
    expect(onedriveCallback.status).toBe(400);
    expect(String(onedriveCallback.headers['content-type'])).toContain('text/html');
    expect(onedriveCallback.headers['set-cookie']).toBeUndefined();
    expect(onedriveCallback.body).not.toMatch(/owner|session|csrf|token/i);

    // Device routes: an unknown device gets the same well-formed, never-stored nonce as a known one (so ids cannot be enumerated), and that is the
    // only success; a missing pairing code or key proof is a client error, never a token.
    const dummy = { deviceId: '123e4567-e89b-42d3-a456-426614174000', nonce: 'n'.repeat(43), signature: 's'.repeat(86) };
    const challenge = await post('/api/v1/auth/device/challenge', { deviceId: dummy.deviceId });
    expect(challenge.status).toBe(200);
    expect(Object.keys(JSON.parse(challenge.body)).sort()).toEqual(['expiresAt', 'nonce']);
    for (const [p, body] of [['/api/v1/auth/device/token', dummy], ['/api/v1/devices/enroll', {}]] as const) {
      const res = await post(p, body);
      expect(res.status, p).toBeGreaterThanOrEqual(400);
      expect(res.status, p).toBeLessThan(500);
      expect(res.body, p).not.toMatch(/ddt_|dob_/);
    }

    // Ingest: no token is 401 on every method and path of the namespace, including one that does not exist.
    for (const [method, p] of [['GET', '/api/v1/ingest/ping'], ['POST', '/api/v1/ingest/ping'], ['GET', '/api/v1/ingest/anything'], ['POST', '/api/v1/ingest/anything']] as const) {
      const res = await send(t, method, p, method === 'POST' ? { body: {} } : {});
      expect([401, 404], `${method} ${p}`).toContain(res.status);
      if (p.endsWith('ping') && method === 'GET') expect(res.status).toBe(401);
    }

    // Static: the shell is public (and holds no owner data); every method but GET/HEAD outside /api is a 404; an unknown API path is a JSON 404, never the shell.
    for (const p of ['/', '/tools/base64', '/hub/sign-in', '/main-ABC12345.js', '/favicon.ico']) {
      const res = await get(p);
      expect(res.status, p).toBe(200);
      expect(res.headers['set-cookie'], p).toBeUndefined();
      expect(res.body, p).not.toMatch(/owner|session|csrf/i);
      expect((await get(p, 'HEAD')).status, `HEAD ${p}`).toBe(200);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect((await send(t, method, '/', method === 'DELETE' ? {} : { body: {} })).status, method).toBe(404);
    const unknownApi = await get('/api/v1/definitely-not-a-route');
    expect(unknownApi.status).toBe(404);
    expect(String(unknownApi.headers['content-type'])).toContain('application/json');
    expect((await get('/api/definitely-not-a-route')).status).toBe(404);
    expect(isPublicStaticRequest('GET', '/api/v1/hello')).toBe(false);
    expect(isPublicStaticRequest('GET', '/tools/base64')).toBe(true);
    expect(isPublicStaticRequest('POST', '/tools/base64')).toBe(false);
  });
});

describe('route gating, credentials presented where they do not belong (full Hub)', () => {
  let fx: Fixture;
  let owner: Signed;
  let ingestSecret: string;
  let deviceToken: string;
  beforeAll(async () => {
    fx = await start('full');
    owner = await fx.hub.signIn();
    const minted = await fx.hub.call('POST', '/admin/ingest-tokens', { cookie: owner.cookie, csrf: owner.csrf, body: { label: 'probe', scopes: [...INGEST_SCOPES] } });
    expect(minted.status).toBe(201);
    ingestSecret = minted.json.secret as string;
    deviceToken = (await enrolled(fx.hub, owner)).token;
  });
  afterAll(async () => { await fx.close(); });

  const ownerRoutes = (): CapturedRoute[] => fx.routes.filter((r) => covered(r) === undefined && !r.websocket && r.method !== 'HEAD');

  it('the owner COOKIE presented cross-site is refused on every route (navigation, and a foreign Origin with a CSRF token)', async () => {
    const failures: string[] = [];
    for (const route of ownerRoutes()) {
      const cookie = `__Host-dude_session=${owner.cookie}`;
      const headers: Record<string, string> = MUTATING.has(route.method)
        ? { cookie, origin: FOREIGN_ORIGIN, 'sec-fetch-site': 'cross-site', 'x-dude-csrf': owner.csrf }
        : { cookie, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' };
      const body = MUTATING.has(route.method) ? dummyFor(route.schema?.body) : undefined;
      const res = await send(fx.target, route.method, concretePath(route), { headers, ...(body === undefined ? {} : { body }) });
      if (res.status !== 403) failures.push(`${route.method} ${route.url} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('the owner cookie with a foreign Origin never opens a WebSocket', async () => {
    for (const route of fx.routes.filter((r) => r.websocket && r.method === 'GET')) {
      const status = await wsRefusal(fx.target, route, { cookie: `__Host-dude_session=${owner.cookie}`, origin: FOREIGN_ORIGIN });
      expect([401, 403], route.url).toContain(status);
    }
  });

  it('an ingest token is accepted by the ingest namespace only: every other route refuses it', async () => {
    const failures: string[] = [];
    for (const route of ownerRoutes()) {
      const body = MUTATING.has(route.method) ? dummyFor(route.schema?.body) : undefined;
      const res = await send(fx.target, route.method, concretePath(route), { headers: { authorization: `Bearer ${ingestSecret}` }, ...(body === undefined ? {} : { body }) });
      if (!gated(res)) failures.push(`${route.method} ${route.url} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
    for (const route of fx.routes.filter((r) => r.websocket && r.method === 'GET')) expect(await wsRefusal(fx.target, route, { authorization: `Bearer ${ingestSecret}` }), route.url).toBe(401);
    // And the namespace itself accepts it.
    expect((await send(fx.target, 'GET', '/api/v1/ingest/ping', { headers: { authorization: `Bearer ${ingestSecret}` } })).status).toBe(200);
  });

  it('a device token or an owner cookie is not an ingest credential', async () => {
    expect((await send(fx.target, 'GET', '/api/v1/ingest/ping', { headers: { authorization: `Bearer ${deviceToken}` } })).status).toBe(401);
    expect((await send(fx.target, 'GET', '/api/v1/ingest/ping', { headers: { cookie: `__Host-dude_session=${owner.cookie}` } })).status).toBe(401);
  });

  it('a device token is refused on owner-only routes (a sample; the credential matrix lives in the route specs)', async () => {
    for (const p of ['/api/v1/sessions', '/api/v1/audit', '/api/v1/admin/ingest-tokens', '/api/v1/tunnel', '/api/v1/diagnostics']) {
      const res = await send(fx.target, 'GET', p, { headers: { authorization: `Bearer ${deviceToken}` } });
      expect(res.status, p).toBe(403);
    }
  });
});

describe('the Security Architecture states the allowlist', () => {
  it('the route table in docs/architecture/SECURITY_ARCHITECTURE.md lists exactly the committed allowlist (a cheap drift check)', () => {
    const doc = readFileSync(path.join(import.meta.dirname, '..', '..', '..', '..', 'docs', 'architecture', 'SECURITY_ARCHITECTURE.md'), 'utf8');
    const rows = [...doc.matchAll(/^\| `(GET|POST|\*) (\/api\/\S+)` \| ([a-z-]+) \|/gm)].map((m) => ({ route: `${m[1]} ${m[2]}`, credential: m[3] }));
    expect(rows.map((r) => r.route)).toEqual(ANONYMOUS_SESSION_ALLOWLIST.map((e) => `${e.method} ${e.path}`));
    expect(rows.map((r) => r.credential)).toEqual(ANONYMOUS_SESSION_ALLOWLIST.map((e) => e.credentials.join(', ')));
  });
});
