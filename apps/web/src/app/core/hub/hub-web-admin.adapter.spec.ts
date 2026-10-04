import { createHubWebAdmin, type HubWebAdminOptions } from './hub-web-admin.adapter';
import { hubCsrf } from './hub-csrf';

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

  it('reads the endpoint diagnostics through the owner route', async () => {
    const { admin, calls } = setup(() => ({ status: 401, body: { error: { code: 'unauthorized', message: 'no' } } }));
    await expect(admin.diagnostics()).rejects.toMatchObject({ code: 'unauthorized' });
    expect(calls[0]).toMatchObject({ url: '/api/v1/diagnostics', method: 'GET', credentials: 'same-origin' });
  });

  it('asks the Hub for its reachability echo through the owner session', async () => {
    const response = { observed: { scope: 'private', viaProxy: false }, host: 'hub.local', hostMatchesConfiguredName: true, verified: false, reason: 'r', at: 'x' };
    const { admin, calls } = setup(() => ({ status: 200, body: response }));
    await expect(admin.reachabilityEcho?.()).resolves.toEqual(response);
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

  it('keeps enroll and unenroll desktop-only', async () => {
    const { admin } = setup(() => ({ status: 200, body: HELLO }));
    await expect(admin.enroll('dude-pair:v1:x')).rejects.toMatchObject({ code: 'unavailable' });
    await expect(admin.unenroll()).rejects.toMatchObject({ code: 'unavailable' });
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

    it('adopts the CSRF token returned by a password change', async () => {
      const { admin } = setup(() => ({ status: 200, body: { ok: true, csrfToken: 'csrf-9' } }));
      await expect(admin.changePassword('a', 'b'.repeat(12))).resolves.toMatchObject({ ok: true });
      expect(hubCsrf.get()).toBe('csrf-9');
    });
  });
});
