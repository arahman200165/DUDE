import { createHubWebAdmin, type HubWebAdminOptions } from './hub-web-admin.adapter';
import { hubCsrf } from './hub-csrf';
import { isCollabConsentRefusal } from './hub-admin.port';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
  credentials: RequestCredentials | undefined;
}
type Responder = (call: Call) => { status: number; body?: unknown; headers?: Record<string, string> };

const HELLO = {
  service: 'dude-hub',
  protocolVersion: 1,
  minClientProtocol: 1,
  hubVersion: '0.0.0',
  hubInstanceId: '0190ffff-bbbb-7ccc-8ddd-eeeeeeeeeeee',
  environmentId: 'env-1',
  bootstrapped: true,
  tls: { spkiSha256: 'A'.repeat(43), nextSpkiSha256: null },
};
const SESSION = {
  csrfToken: 'csrf-1',
  session: { sessionId: 'aaaaaaaaaaaaaaaa', kind: 'cookie', createdAt: 'x', lastActiveAt: 'x', idleExpiresAt: 'x', absoluteExpiresAt: '2099-01-01T00:00:00.000Z', current: true, userAgent: null, ip: null, deviceId: null },
  owner: { ownerId: 'o1', displayName: 'Ada', remainingRecoveryCodes: 10 },
};

function setup(responder: Responder, extra: Partial<HubWebAdminOptions> = {}) {
  hubCsrf.clear();
  const calls: Call[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
      credentials: init.credentials,
    };
    calls.push(call);
    const r = responder(call);
    return new Response(r.body === undefined ? '' : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as unknown as typeof fetch;
  const admin = createHubWebAdmin({ loadApiClient: () => import('@dude/api-client'), fetch: fakeFetch, origin: () => 'https://hub.local:47600', ...extra });
  return { admin, calls };
}

const envelope = (code: string, message: string) => ({ error: { code, message } });

describe('Hub web admin adapter', () => {
  // Warm the dynamic import once: under the full suite the first cold load can exceed a test's 5 s budget.
  beforeAll(async () => { await import('@dude/api-client'); }, 30_000);

  it('uses same-origin relative URLs with cookie credentials and reads status from hello', async () => {
    const { admin, calls } = setup(() => ({ status: 200, body: HELLO }));
    await expect(admin.status()).resolves.toMatchObject({ hubUrl: 'https://hub.local:47600', environmentId: 'env-1', reachable: true });
    expect(calls[0]).toMatchObject({ url: '/api/v1/hello', method: 'GET', credentials: 'same-origin' });
    expect(calls[0].headers['X-DUDE-CSRF']).toBeUndefined();
    await expect(admin.probeLocal()).resolves.toMatchObject({ found: true, bootstrapped: true });
  });

  it('sends the CSRF token from sign-in on mutating requests only, and forgets it on sign-out', async () => {
    const { admin, calls } = setup((c) => {
      if (c.url.endsWith('/auth/sign-in')) return { status: 200, body: SESSION };
      if (c.url.endsWith('/sessions')) return { status: 200, body: [] };
      if (c.url.endsWith('/auth/sign-out')) return { status: 200, body: { ok: true } };
      if (c.url.endsWith('/sessions/revoke-all/preview')) return { status: 200, body: { confirmToken: 't', expiresAt: 'x', summary: { action: 'a' } } };
      return { status: 404, body: envelope('not-found', 'no') };
    });
    await expect(admin.signIn('pw')).resolves.toMatchObject({ csrfToken: 'csrf-1' });
    expect(calls[0].headers['X-DUDE-CSRF']).toBeUndefined();
    await admin.listSessions();
    expect(calls[1].headers['X-DUDE-CSRF']).toBeUndefined();
    await admin.revokeAllPreview();
    expect(calls[2].headers['X-DUDE-CSRF']).toBe('csrf-1');
    await admin.signOut();
    expect(calls[3].headers['X-DUDE-CSRF']).toBe('csrf-1');
    await admin.revokeAllPreview();
    expect(calls[4].headers['X-DUDE-CSRF']).toBeUndefined();
  });

  it('reads the sync summary through the owner route with the cookie session', async () => {
    const summary = { floor: 0, headRevision: 3, retentionDays: 90, counts: { settings: 1, favorites: 0, pipelines: 0, projects: 0, workspaces: 0, home: 0, usage: 0, 'workspace-layout': 0, scratchpad: 0 }, devices: [] };
    const { admin, calls } = setup(() => ({ status: 200, body: summary }));
    await expect(admin.syncSummary()).resolves.toEqual(summary);
    expect(calls[0]).toMatchObject({ url: '/api/v1/sync/summary', method: 'GET', credentials: 'same-origin' });
  });

  it('reads presence through the owner route with the cookie session and exposes the realtime feed only when given one', async () => {
    const response = { entries: [{ deviceId: 'd1', online: true, activity: { kind: 'tool', id: 'base64' } }, { deviceId: 'd2', online: false, activity: null }] };
    const { admin, calls } = setup(() => ({ status: 200, body: response }));
    await expect(admin.presence()).resolves.toEqual(response);
    expect(calls[0]).toMatchObject({ url: '/api/v1/presence', method: 'GET', credentials: 'same-origin' });
    expect(admin.onPresenceChanged).toBeUndefined();
    const off = (): void => undefined;
    const subscribe = vi.fn(() => off);
    const { admin: live } = setup(() => ({ status: 200, body: response }), { onPresenceChanged: subscribe });
    expect(live.onPresenceChanged?.(() => undefined)).toBe(off);
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('reads the endpoint diagnostics through the owner route', async () => {
    const { admin, calls } = setup(() => ({ status: 401, body: { error: { code: 'unauthorized', message: 'no' } } }));
    await expect(admin.diagnostics()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(calls[0]).toMatchObject({ url: '/api/v1/diagnostics', method: 'GET', credentials: 'same-origin' });
  });

  it('asks the Hub for its reachability echo through the owner session', async () => {
    const response = { observed: { scope: 'private', viaProxy: false }, host: 'hub.local', hostMatchesConfiguredName: true, verified: false, reason: 'r', at: 'x' };
    const { admin, calls } = setup(() => ({ status: 200, body: response }));
    await expect(admin.reachabilityEcho?.('https://ignored.example.com')).resolves.toEqual(response);
    expect(calls[0]).toMatchObject({ url: '/api/v1/reachability/echo', method: 'GET', credentials: 'same-origin' });
  });

  it('reads security alerts and marks them seen through the owner routes', async () => {
    const response = { alerts: [{ seq: 4, at: 'x', event: 'security.ip-blocked', outcome: 'success', ip: '10.0.0.1', summary: 's' }], unseen: 1, seenSeq: 0 };
    const { admin, calls } = setup((c) => (c.method === 'GET' ? { status: 200, body: response } : { status: 200, body: { ok: true } }));
    await expect(admin.listSecurityAlerts()).resolves.toEqual(response);
    expect(calls[0]).toMatchObject({ url: '/api/v1/security/alerts', method: 'GET', credentials: 'same-origin' });
    await expect(admin.markSecurityAlertsSeen(4)).resolves.toEqual({ ok: true });
    expect(calls[1]).toMatchObject({ url: '/api/v1/security/alerts/seen', method: 'POST', body: { upToSeq: 4 } });
  });

  it('exposes the Date header of a public Hub response for the clock-skew check', async () => {
    const { admin, calls } = setup(() => ({ status: 200, body: HELLO, headers: { date: 'Thu, 01 Oct 2026 10:00:00 GMT' } }));
    await expect(admin.serverDate?.()).resolves.toBe('Thu, 01 Oct 2026 10:00:00 GMT');
    expect(calls[0]).toMatchObject({ url: '/api/v1/hello', method: 'GET' });
  });

  it('never persists the CSRF token', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { admin } = setup(() => ({ status: 200, body: SESSION }));
    await admin.signIn('pw');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('maps an unauthorized current session to a signed-out owner status', async () => {
    const { admin } = setup(() => ({ status: 401, body: envelope('unauthorized', 'Sign in.') }));
    await expect(admin.ownerStatus()).resolves.toEqual({ signedIn: false, ownerDisplayName: null, expiresAt: null });
    await expect(admin.currentSession()).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('normalizes API errors including Retry-After on lockout', async () => {
    const { admin } = setup(() => ({ status: 423, body: envelope('locked', 'Too many attempts.'), headers: { 'retry-after': '30' } }));
    await expect(admin.signIn('pw')).rejects.toMatchObject({ name: 'HubAdminError', code: 'locked', retryAfterMs: 30_000 });
    await expect(admin.listDevices()).rejects.toMatchObject({ code: 'locked', retryAfterMs: 30_000 });
  });

  it('reports a network failure and an invalid response body distinctly', async () => {
    const down = createHubWebAdmin({
      loadApiClient: () => import('@dude/api-client'),
      fetch: (async () => {
        throw new TypeError('offline');
      }) as unknown as typeof fetch,
    });
    await expect(down.status()).rejects.toMatchObject({ code: 'network' });
    const { admin } = setup(() => ({ status: 200, body: { nope: true } }));
    await expect(admin.status()).rejects.toMatchObject({ code: 'protocol' });
  });

  it('puts recovery trust and posts recover/reset bodies as the Hub expects', async () => {
    const codes = Array.from({ length: 10 }, (_, i) => `ABCDE-FGHJ${i}`);
    const DEVICE = { deviceId: '0190aaaa-0000-7000-8000-000000000001', displayName: 'd', platform: 'windows', appVersion: '1', protocolVersion: 1, capabilities: [], registeredAt: '2026-01-01T00:00:00.000Z', lastSeenAt: null, revokedAt: null, unenrolledAt: null, recoveryTrusted: true, online: false, current: false, kind: 'desktop' };
    const { admin, calls } = setup((c) => ({ status: 200, body: c.url.endsWith('/recovery-trust') ? DEVICE : c.url.endsWith('/owner/reset') ? { recoveryCodes: codes } : SESSION }));
    await admin.setRecoveryTrust('0190aaaa-0000-7000-8000-000000000001', 'pw', true);
    expect(calls[0]).toMatchObject({ method: 'PUT', url: '/api/v1/devices/0190aaaa-0000-7000-8000-000000000001/recovery-trust', body: { password: 'pw', trusted: true } });
    await admin.recover('ABCDE-FGHJK', 'a long new password');
    expect(calls[1]).toMatchObject({ method: 'POST', url: '/api/v1/auth/recover', body: { recoveryCode: 'ABCDE-FGHJK', newPassword: 'a long new password' } });
    await admin.ownerReset('t'.repeat(43), 'a long new password');
    expect(calls[2]).toMatchObject({ url: '/api/v1/owner/reset', body: { resetToken: 't'.repeat(43), newPassword: 'a long new password' } });
  });

  it('keeps enroll, reconnect and unenroll desktop-only', async () => {
    const { admin } = setup(() => ({ status: 200, body: HELLO }));
    await expect(admin.enroll('dude-pair:v1:x')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(admin.reconnect({ pairingString: 'dude-pair:v1:x', acknowledged: true })).rejects.toMatchObject({ code: 'unavailable' });
    await expect(admin.unenroll()).rejects.toMatchObject({ code: 'unavailable' });
  });

  describe('backup status and re-attach pairing codes', () => {
    const DEVICE = '0190aaaa-0000-7000-8000-000000000001';
    const CODE = { pairingCode: 'ABCD-EFGH', pairingString: 'dude-pair:v1:x', expiresAt: '2099-01-01T00:00:00.000Z', hubUrl: 'https://hub.local:47600', spkiSha256: 'A'.repeat(43), reattachDeviceId: null };
    const STATUS = { authority: { epoch: 2, state: 'active' }, lastBackup: null, schedule: { configured: false }, defaultFolder: 'C:\\ProgramData\\DUDE\\Hub\\backups', devicesNeedingRePair: 1 };

    it('reads the backup status over the cookie session with GET', async () => {
      const { admin, calls } = setup(() => ({ status: 200, body: STATUS }));
      await expect(admin.backupStatus()).resolves.toMatchObject({ authority: { epoch: 2, state: 'active' }, devicesNeedingRePair: 1 });
      expect(calls[0]).toMatchObject({ url: '/api/v1/backup/status', method: 'GET', credentials: 'same-origin' });
    });

    it('surfaces a transferred Hub as the distinct hub-transferred code', async () => {
      const { admin } = setup(() => ({ status: 503, body: envelope('hub-transferred', 'This Hub was transferred to another machine.') }));
      await expect(admin.backupStatus()).rejects.toMatchObject({ name: 'HubAdminError', code: 'hub-transferred' });
    });

    it('sends an empty body without options and the re-attach device id with them', async () => {
      const { admin, calls } = setup((c) => ({ status: 200, body: { ...CODE, reattachDeviceId: (c.body as { reattachDeviceId?: string }).reattachDeviceId ?? null } }));
      await expect(admin.createPairingCode()).resolves.toMatchObject({ reattachDeviceId: null });
      await expect(admin.createPairingCode(undefined, { reattachDeviceId: DEVICE })).resolves.toMatchObject({ reattachDeviceId: DEVICE });
      await admin.createPairingCode('hub.local', { reattachDeviceId: DEVICE });
      expect(calls.map((c) => c.body)).toEqual([{}, { reattachDeviceId: DEVICE }, { host: 'hub.local', reattachDeviceId: DEVICE }]);
    });

    it('still asks for the step-up password before a re-attach code is created', async () => {
      let stepped = false;
      const ask = vi.fn(async (_message?: string) => 'pw' as string | null);
      const { admin, calls } = setup((c) => {
        if (c.url.endsWith('/auth/step-up')) { stepped = true; return { status: 200, body: { ok: true, csrfToken: 'csrf-2', steppedUpUntil: '2099-01-01T00:00:00.000Z' } }; }
        return stepped ? { status: 200, body: { ...CODE, reattachDeviceId: DEVICE } } : { status: 403, body: envelope('step-up-required', 'Confirm your password.') };
      }, { requestStepUp: ask });
      await expect(admin.createPairingCode(undefined, { reattachDeviceId: DEVICE })).resolves.toMatchObject({ reattachDeviceId: DEVICE });
      expect(ask).toHaveBeenCalledTimes(1);
      expect(calls.map((c) => c.body)).toEqual([{ reattachDeviceId: DEVICE }, { password: 'pw' }, { reattachDeviceId: DEVICE }]);
    });
  });

  describe('notification-reader grant (PD-110)', () => {
    const ID = '0190aaaa-0000-7000-8000-000000000001';
    const DEVICE = { deviceId: ID, displayName: 'd', platform: 'windows', appVersion: '1', protocolVersion: 1, capabilities: [], registeredAt: '2026-01-01T00:00:00.000Z', lastSeenAt: null, revokedAt: null, unenrolledAt: null, recoveryTrusted: false, notificationsAccess: true, online: false, current: false, kind: 'desktop' };

    it('puts the switch to the device with the cookie session', async () => {
      const { admin, calls } = setup(() => ({ status: 200, body: DEVICE }));
      await expect(admin.setNotificationsAccess(ID, true)).resolves.toMatchObject({ notificationsAccess: true });
      expect(calls[0]).toMatchObject({ method: 'PUT', url: `/api/v1/devices/${ID}/notifications-access`, body: { enabled: true }, credentials: 'same-origin' });
    });

    it('asks for the owner password once when the Hub requires step-up, then retries with the rotated CSRF token', async () => {
      let stepped = false;
      const ask = vi.fn(async (_message?: string) => 'pw' as string | null);
      const { admin, calls } = setup((c) => {
        if (c.url.endsWith('/auth/step-up')) { stepped = true; return { status: 200, body: { ok: true, csrfToken: 'csrf-2', steppedUpUntil: '2099-01-01T00:00:00.000Z' } }; }
        return stepped ? { status: 200, body: DEVICE } : { status: 403, body: envelope('step-up-required', 'Confirm your password.') };
      }, { requestStepUp: ask });
      await expect(admin.setNotificationsAccess(ID, true)).resolves.toMatchObject({ notificationsAccess: true });
      expect(ask).toHaveBeenCalledTimes(1);
      expect(calls.map((c) => c.body)).toEqual([{ enabled: true }, { password: 'pw' }, { enabled: true }]);
      expect(calls[2]!.headers['X-DUDE-CSRF']).toBe('csrf-2');
    });

    it('fails with step-up-required when the prompt is cancelled, and surfaces a browser-row or ended-device refusal', async () => {
      const cancelled = setup(() => ({ status: 403, body: envelope('step-up-required', 'Confirm your password.') }), { requestStepUp: async () => null });
      await expect(cancelled.admin.setNotificationsAccess(ID, false)).rejects.toMatchObject({ code: 'step-up-required' });
      expect(cancelled.calls).toHaveLength(1);
      const browser = setup(() => ({ status: 400, body: envelope('bad-request', 'Notification access can only be granted to a desktop device.') }));
      await expect(browser.admin.setNotificationsAccess(ID, true)).rejects.toMatchObject({ code: 'bad-request' });
      const ended = setup(() => ({ status: 409, body: envelope('conflict', 'That device is no longer enrolled.') }));
      await expect(ended.admin.setNotificationsAccess(ID, true)).rejects.toMatchObject({ code: 'conflict' });
    });
  });

  describe('owner step-up', () => {
    const PREVIEW = { confirmToken: 't', expiresAt: 'x', summary: { action: 'a' } };
    const stepUpResponder = (accept: (pw: string) => boolean) => {
      let stepped = false;
      return (c: Call) => {
        if (c.url.endsWith('/auth/sign-in')) return { status: 200, body: SESSION };
        if (c.url.endsWith('/auth/step-up')) {
          if (!accept((c.body as { password: string }).password)) return { status: 403, body: envelope('forbidden', 'Wrong password.') };
          stepped = true;
          return { status: 200, body: { ok: true, csrfToken: 'csrf-2', steppedUpUntil: '2099-01-01T00:00:00.000Z' } };
        }
        if (c.url.endsWith('/sessions/revoke-all/preview')) return stepped ? { status: 200, body: PREVIEW } : { status: 403, body: envelope('step-up-required', 'Confirm your password.') };
        return { status: 404, body: envelope('not-found', 'no') };
      };
    };

    it('asks for the password, steps up and retries once with the rotated CSRF token', async () => {
      const ask = vi.fn(async (_message?: string) => 'pw' as string | null);
      const { admin, calls } = setup(stepUpResponder(() => true), { requestStepUp: ask });
      await admin.signIn('pw');
      await expect(admin.revokeAllPreview()).resolves.toMatchObject({ confirmToken: 't' });
      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask).toHaveBeenCalledWith(undefined);
      expect(calls.map((c) => c.url.split('/api/v1')[1])).toEqual(['/auth/sign-in', '/sessions/revoke-all/preview', '/auth/step-up', '/sessions/revoke-all/preview']);
      expect(calls[1].headers['X-DUDE-CSRF']).toBe('csrf-1');
      expect(calls[3].headers['X-DUDE-CSRF']).toBe('csrf-2');
      expect(hubCsrf.get()).toBe('csrf-2');
    });

    it('re-asks with the refusal message after a wrong password', async () => {
      const answers: (string | null)[] = ['bad', 'pw'];
      const ask = vi.fn(async (_message?: string) => answers.shift() ?? null);
      const { admin } = setup(stepUpResponder((pw) => pw === 'pw'), { requestStepUp: ask });
      await expect(admin.revokeAllPreview()).resolves.toMatchObject({ confirmToken: 't' });
      expect(ask.mock.calls).toEqual([[undefined], ['Wrong password.']]);
    });

    it('fails with step-up-required when the prompt is cancelled', async () => {
      const { admin, calls } = setup(stepUpResponder(() => true), { requestStepUp: async () => null });
      await expect(admin.revokeAllPreview()).rejects.toMatchObject({ name: 'HubAdminError', code: 'step-up-required', message: 'Password confirmation was cancelled.' });
      expect(calls).toHaveLength(1);
    });

    it('surfaces the original error when no prompt is wired', async () => {
      const { admin } = setup(stepUpResponder(() => true));
      await expect(admin.revokeAllPreview()).rejects.toMatchObject({ code: 'step-up-required' });
    });

    it('does not step up again when the retry still needs it, and gives up after three wrong passwords', async () => {
      const ask = vi.fn(async (_message?: string) => 'pw' as string | null);
      const never = setup((c) => (c.url.endsWith('/auth/step-up') ? { status: 200, body: { ok: true, csrfToken: null, steppedUpUntil: 'x' } } : { status: 403, body: envelope('step-up-required', 'no') }), { requestStepUp: ask });
      await expect(never.admin.revokeAllPreview()).rejects.toMatchObject({ code: 'step-up-required' });
      expect(ask).toHaveBeenCalledTimes(1);
      const wrong = vi.fn(async (_message?: string) => 'bad' as string | null);
      const w = setup(stepUpResponder(() => false), { requestStepUp: wrong });
      await expect(w.admin.revokeAllPreview()).rejects.toMatchObject({ code: 'forbidden' });
      expect(wrong).toHaveBeenCalledTimes(3);
    });

    it('stops on a lockout during step-up', async () => {
      const ask = vi.fn(async (_message?: string) => 'pw' as string | null);
      const { admin } = setup((c) => (c.url.endsWith('/auth/step-up') ? { status: 423, body: envelope('locked', 'Locked.') } : { status: 403, body: envelope('step-up-required', 'no') }), { requestStepUp: ask });
      await expect(admin.revokeAllPreview()).rejects.toMatchObject({ code: 'locked' });
      expect(ask).toHaveBeenCalledTimes(1);
    });

    it('reads jobs and notifications with the cookie session, sending the CSRF token only on the writes', async () => {
      const { admin, calls } = setup((c) => {
        if (c.url === '/api/v1/jobs') return { status: 200, body: { jobs: [] } };
        if (c.url === '/api/v1/notifications') return { status: 200, body: { notifications: [], unread: 0 } };
        return { status: 200, body: { ok: true } };
      });
      hubCsrf.set('csrf-1');
      await expect(admin.listJobs()).resolves.toEqual({ jobs: [] });
      await expect(admin.listNotifications()).resolves.toEqual({ notifications: [], unread: 0 });
      await expect(admin.markNotificationsRead({ ids: ['n 1'] })).resolves.toEqual({ ok: true });
      await expect(admin.markNotificationsRead({ all: true })).resolves.toEqual({ ok: true });
      await expect(admin.dismissNotification('n 1')).resolves.toEqual({ ok: true });
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        'GET /api/v1/jobs', 'GET /api/v1/notifications', 'POST /api/v1/notifications/read', 'POST /api/v1/notifications/read', 'POST /api/v1/notifications/n%201/dismiss',
      ]);
      expect(calls.map((c) => c.body)).toEqual([undefined, undefined, { ids: ['n 1'] }, { all: true }, undefined]);
      expect(calls.every((c) => c.credentials === 'same-origin')).toBe(true);
      expect(calls[2]?.headers['X-DUDE-CSRF']).toBe('csrf-1');
      expect(calls[4]?.headers['X-DUDE-CSRF']).toBe('csrf-1');
    });

    it('maps a notifications refusal to a HubAdminError code and exposes the page realtime hook only when wired', async () => {
      const refused = setup(() => ({ status: 403, body: envelope('forbidden', 'Not allowed.') }));
      await expect(refused.admin.listNotifications()).rejects.toMatchObject({ name: 'HubAdminError', code: 'forbidden' });
      expect(refused.admin.onNotification).toBeUndefined();
      const hook = vi.fn(() => () => undefined);
      const wired = setup(() => ({ status: 200, body: {} }), { onNotification: hook });
      const off = wired.admin.onNotification?.(() => undefined);
      expect(hook).toHaveBeenCalledOnce();
      expect(typeof off).toBe('function');
    });

    it('drives Markdown rooms and kept documents over the cookie session with CSRF on the writes (PD-104)', async () => {
      const ROOM = { id: 'room_1', name: 'Notes', participants: 0, createdAt: '2026-10-24T00:00:00.000Z' };
      const { admin, calls } = setup((c) => {
        if (c.url === '/api/v1/collab/rooms') return c.method === 'GET' ? { status: 200, body: { rooms: [ROOM] } } : { status: 201, body: ROOM };
        if (c.url.endsWith('/keep')) return { status: 200, body: { entityId: 'doc_1' } };
        if (c.url === '/api/v1/collab/documents') return { status: 200, body: { documents: [{ id: 'doc_1', title: 'T', updatedAt: 'x', bytes: 3 }] } };
        return { status: 200, body: { ok: true } };
      });
      hubCsrf.set('csrf-1');
      await expect(admin.listCollabRooms()).resolves.toEqual({ rooms: [ROOM] });
      await expect(admin.createCollabRoom('Notes')).resolves.toEqual(ROOM);
      await expect(admin.keepCollabRoom('room_1', 'Weekly')).resolves.toEqual({ entityId: 'doc_1' });
      await expect(admin.listCollabDocuments()).resolves.toMatchObject({ documents: [{ id: 'doc_1' }] });
      await expect(admin.deleteCollabDocument('doc_1')).resolves.toEqual({ ok: true });
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        'GET /api/v1/collab/rooms', 'POST /api/v1/collab/rooms', 'POST /api/v1/collab/rooms/room_1/keep', 'GET /api/v1/collab/documents', 'DELETE /api/v1/collab/documents/doc_1',
      ]);
      expect(calls.map((c) => c.body)).toEqual([undefined, { name: 'Notes' }, { title: 'Weekly' }, undefined, undefined]);
      expect([1, 2, 4].map((i) => calls[i]?.headers['X-DUDE-CSRF'])).toEqual(['csrf-1', 'csrf-1', 'csrf-1']);
      expect(calls[0]?.headers['X-DUDE-CSRF']).toBeUndefined();
    });

    it('maps the kept-document consent refusal to a code isCollabConsentRefusal recognizes', async () => {
      const refused = setup(() => ({ status: 403, body: envelope('forbidden', 'Kept documents need the Markdown documents sync category enabled.') }));
      const error = await refused.admin.listCollabDocuments().catch((e: unknown) => e);
      expect(error).toMatchObject({ name: 'HubAdminError', code: 'forbidden' });
      expect(isCollabConsentRefusal(error)).toBe(true);
      expect(isCollabConsentRefusal(new Error('x'))).toBe(false);
    });

    it('lists, previews and restores document history over the cookie session with CSRF on the restore (PD-105)', async () => {
      const SNAP = { id: 'snap_1', takenAt: '2026-10-24T01:00:00.000Z', bytes: 9 };
      const { admin, calls } = setup((c) => {
        if (c.url.startsWith('/api/v1/collab/history?')) return { status: 200, body: { snapshots: [SNAP] } };
        if (c.url === '/api/v1/collab/history/snap_1') return { status: 200, body: { doc: 'user-script:s1', takenAt: SNAP.takenAt, payload: { body: 'x' } } };
        return { status: 200, body: { ok: true } };
      });
      hubCsrf.set('csrf-1');
      await expect(admin.listCollabHistory('user-script:s1')).resolves.toEqual({ snapshots: [SNAP] });
      await expect(admin.getCollabSnapshot('snap_1')).resolves.toEqual({ doc: 'user-script:s1', takenAt: SNAP.takenAt, payload: { body: 'x' } });
      await expect(admin.restoreCollabSnapshot('snap_1')).resolves.toEqual({ ok: true });
      expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
        'GET /api/v1/collab/history?doc=user-script%3As1', 'GET /api/v1/collab/history/snap_1', 'POST /api/v1/collab/history/snap_1/restore',
      ]);
      expect(calls[2]?.headers['X-DUDE-CSRF']).toBe('csrf-1');
      expect(calls[0]?.headers['X-DUDE-CSRF']).toBeUndefined();
      const refused = setup(() => ({ status: 403, body: envelope('forbidden', 'Document history needs the document\'s sync category enabled.') }));
      expect(isCollabConsentRefusal(await refused.admin.listCollabHistory('scratchpad:default').catch((e: unknown) => e))).toBe(true);
    });

    it('adopts the CSRF token returned by a password change', async () => {
      const { admin } = setup(() => ({ status: 200, body: { ok: true, csrfToken: 'csrf-9' } }));
      await expect(admin.changePassword('a', 'b'.repeat(12))).resolves.toMatchObject({ ok: true });
      expect(hubCsrf.get()).toBe('csrf-9');
    });
  });
});
