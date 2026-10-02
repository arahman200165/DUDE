import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHubClient } from '@dude/api-client';
import type { HubClient, HubRequest } from '@dude/api-client';
import { startTestHub } from './test-helpers.js';
import type { TestHub } from './test-helpers.js';

/**
 * Every request `createHubClient` can make must hit a route the Hub registers, with the same method. This is what
 * stops a client/server method or path drift (a POST that became a PUT) from shipping unnoticed.
 */
const ID = 'PARAMID';
const ARGS: Record<string, readonly unknown[]> = {
  hello: [],
  bootstrap: [{}],
  tlsCertificates: [],
  signIn: ['pw'],
  currentSession: [],
  recover: ['code', 'pw'],
  ownerReset: ['token', 'pw'],
  enroll: [{}],
  deviceChallenge: [ID],
  deviceToken: [{}],
  deviceSelf: ['t'],
  updateDeviceSelf: ['t', {}],
  unenrollSelf: ['t'],
  ownerBearer: ['t', 'pw'],
  signOut: ['t'],
  listDevices: ['t'],
  createPairingCode: ['t'],
  renameDevice: ['t', ID, 'n'],
  revokeDevicePreview: ['t', ID],
  revokeDevice: ['t', ID, 'c'],
  setRecoveryTrust: ['t', ID, 'pw', true],
  listSessions: ['t'],
  revokeSession: ['t', ID],
  revokeAllPreview: ['t'],
  revokeAll: ['t', 'c'],
  listAudit: ['t', { beforeSeq: 1, limit: 2 }],
  recoveryCodesPreview: ['t'],
  regenerateRecoveryCodes: ['t', 'c'],
  changePassword: ['t', 'a', 'b'],
};
const NOT_REQUESTS = new Set(['compatibility']);

const normaliseTemplate = (url: string): string => url.replace(/:[^/]+/g, ':p').replace(/\/+$/, '');
const normaliseClientPath = (path: string): string =>
  (path.split('?')[0] ?? '').split('/').map((s) => (s === ID ? ':p' : s)).join('/').replace(/\/+$/, '');

describe('api-client / Hub route parity', () => {
  let hub: TestHub;
  const registered = new Set<string>();

  beforeAll(async () => {
    hub = await startTestHub(
      {},
      { configure: (app) => app.addHook('onRoute', (route) => {
          for (const method of [route.method].flat()) registered.add(`${method} ${normaliseTemplate(route.url)}`);
        }) },
    );
  });
  afterAll(async () => hub.close());

  it('drives every client method', () => {
    const client = createHubClient({ request: () => Promise.reject(new Error('x')) }, { clientProtocol: 1, minHubProtocol: 1 });
    const methods = Object.keys(client).filter((m) => !NOT_REQUESTS.has(m)).sort();
    expect(Object.keys(ARGS).sort()).toEqual(methods);
  });

  it('only calls (method, path) pairs the Hub registers', async () => {
    expect(registered.size).toBeGreaterThan(10);
    const seen: HubRequest[] = [];
    const client = createHubClient(
      { request: (req) => { seen.push(req); return Promise.resolve({ status: 500, headers: {}, body: undefined }); } },
      { clientProtocol: 1, minHubProtocol: 1 },
    );
    for (const [name, args] of Object.entries(ARGS)) {
      const before = seen.length;
      await ((client as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[name]!(...args)).catch(() => undefined);
      expect(seen.length, name).toBe(before + 1);
    }
    const missing = seen
      .map((r) => `${r.method} ${normaliseClientPath(r.path)}`)
      .filter((key) => !registered.has(key));
    expect(missing).toEqual([]);
  });
});
