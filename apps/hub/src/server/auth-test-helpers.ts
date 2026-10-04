import { HUB_API_PREFIX } from '@dude/contracts/hub';
import { ensureSetupToken } from '../auth/setup-token.js';
import type { HubConfig } from '../config/hub-config.js';
import { request, startTestHub } from './test-helpers.js';
import type { RawResponse, TestHub, TestHubOptions } from './test-helpers.js';

export const CHEAP = { v: 1, m: 64, t: 1, p: 1, len: 32 } as const;
export const PASSWORD = 'a very long password';
export const START = Date.parse('2026-03-01T00:00:00.000Z');

export interface AuthHub {
  hub: TestHub;
  /** Mutable injected clock (ms). */
  clock: { t: number };
  ownerId: string;
  recoveryCodes: string[];
  call(method: string, path: string, options?: CallOptions): Promise<ApiResult>;
  signIn(password?: string): Promise<Signed>;
  close(): Promise<void>;
}

export interface CallOptions {
  body?: unknown;
  cookie?: string;
  csrf?: string;
  bearer?: string;
  /** Skip Origin/Host (a non-browser client). */
  noOrigin?: boolean;
  headers?: Record<string, string>;
}

export interface ApiResult { status: number; json: any; raw: RawResponse; setCookie: string | undefined }
export interface Signed { cookie: string; csrf: string; body: any; setCookie: string; res: ApiResult }

export const cookieValueOf = (setCookie: string | undefined): string => /__Host-dude_session=([^;]*)/.exec(setCookie ?? '')?.[1] ?? '';

export async function startAuthHub({ config, rateLimit, bootstrapped, ...extra }: Pick<TestHubOptions, 'realtime' | 'sync' | 'rateLimit' | 'backup' | 'dataRoot'> & { config?: Partial<HubConfig>; bootstrapped?: boolean } = {}): Promise<AuthHub> {
  const clock = { t: START };
  const hub = await startTestHub(config ?? {}, {
    now: () => clock.t,
    passwordParams: CHEAP,
    ...extra,
    rateLimit: { auth: { perMinute: 600_000, burst: 100_000 }, global: { perMinute: 600_000, burst: 100_000 }, ...rateLimit },
  });
  const call = async (method: string, path: string, options: CallOptions = {}): Promise<ApiResult> => {
    const headers: Record<string, string> = { ...options.headers };
    if (options.body !== undefined) headers['content-type'] = 'application/json';
    if (!options.noOrigin && options.bearer === undefined) {
      headers.origin ??= `https://localhost:${hub.port}`;
      headers.host ??= `localhost:${hub.port}`;
    }
    if (options.cookie !== undefined) headers.cookie = `__Host-dude_session=${options.cookie}`;
    if (options.csrf !== undefined) headers['x-dude-csrf'] = options.csrf;
    if (options.bearer !== undefined) headers.authorization = `Bearer ${options.bearer}`;
    const raw = await request(hub.port, hub.tls.certPem, `${HUB_API_PREFIX}${path}`, {
      method, headers, ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    });
    const sc = raw.headers['set-cookie'];
    let json: unknown = null;
    try { json = raw.body ? JSON.parse(raw.body) : null; } catch { json = null; }
    return { status: raw.status, json, raw, setCookie: Array.isArray(sc) ? sc[0] : sc };
  };

  // `bootstrapped`: the data root already holds an owner (a restored Hub), so there is nothing to bootstrap.
  let boot: ApiResult = { status: 201, json: { ownerId: (hub.hub.db.prepare('SELECT owner_id FROM owner LIMIT 1').get() as { owner_id: string } | undefined)?.owner_id ?? '', recoveryCodes: [] }, raw: undefined as never, setCookie: undefined };
  if (bootstrapped !== true) {
    const token = ensureSetupToken(hub.hub.db, hub.paths.configDir, clock.t)!;
    boot = await call('POST', '/bootstrap', { body: { setupToken: token, ownerDisplayName: 'Ada', environmentName: 'Home', password: PASSWORD } });
    if (boot.status !== 201) throw new Error(`bootstrap failed: ${boot.status} ${boot.raw.body}`);
  }

  const signIn = async (password = PASSWORD): Promise<Signed> => {
    const res = await call('POST', '/auth/sign-in', { body: { password } });
    if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${res.raw.body}`);
    return { cookie: cookieValueOf(res.setCookie), csrf: res.json.csrfToken, body: res.json, setCookie: res.setCookie!, res };
  };

  return {
    hub, clock, ownerId: boot.json.ownerId, recoveryCodes: boot.json.recoveryCodes, call, signIn,
    close: () => hub.close(),
  };
}
