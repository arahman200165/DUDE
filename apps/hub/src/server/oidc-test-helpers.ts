import { createClientSecretReader } from '../auth/oidc/client-secret.js';
import { createFakeIdp } from '../auth/oidc/fake-idp.js';
import type { FakeAccount, FakeIdp, FakeIdpOptions } from '../auth/oidc/fake-idp.js';
import { START, startAuthHub } from './auth-test-helpers.js';
import type { ApiResult, AuthHub, Signed } from './auth-test-helpers.js';

/** Google sign-in specs: a real Hub test server wired to the in-process fake provider (Milestone 842). */
export const REDIRECT_ORIGIN = 'https://hub.example.com';
export const CROSS_SITE_NAVIGATION = { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate', 'sec-fetch-dest': 'document' } as const;

export const OWNER_ACCOUNT: FakeAccount = { sub: 'google-sub-owner', email: 'owner@example.com' };
export const SECOND_ACCOUNT: FakeAccount = { sub: 'google-sub-second', email: 'second@example.com' };
export const STRANGER_ACCOUNT: FakeAccount = { sub: 'google-sub-stranger', email: 'stranger@example.com' };

export interface OidcHub extends AuthHub {
  idp: FakeIdp;
  /** What the secret store answers: a string, or null for "not stored". */
  secret: { value: string | null };
  /** Plays the browser: start, approve at the provider, then navigate to the callback cross-site. Returns the callback response. */
  signInWithGoogle(account: FakeAccount, options?: { returnTo?: string }): Promise<{ start: ApiResult; callback: ApiResult; authorizationUrl: string }>;
  /** Plays leg one of linking for a signed-in session; returns the callback response and the completion token when there is one. */
  linkLegOne(session: Pick<Signed, 'cookie' | 'csrf'>, account: FakeAccount, options?: { returnTo?: string }): Promise<{ start: ApiResult; callback: ApiResult; linkToken: string | undefined }>;
  /** Full link: leg one then `link/complete`. */
  linkAccount(session: Pick<Signed, 'cookie' | 'csrf'>, account: FakeAccount): Promise<ApiResult>;
}

export interface StartOidcHubOptions {
  /** Omit the `oidc` block entirely (a Hub with no Google sign-in). */
  unconfigured?: boolean;
  /** Start without a stored client secret. */
  noSecret?: boolean;
  idp?: FakeIdpOptions;
}

export async function startOidcHub(options: StartOidcHubOptions = {}): Promise<OidcHub> {
  const clock = { t: START };
  const idp = await createFakeIdp({ now: () => clock.t, ...options.idp });
  const secret: OidcHub['secret'] = { value: options.noSecret === true ? null : idp.clientSecret };
  const reader = createClientSecretReader({ getText: () => secret.value });
  const h = await startAuthHub({
    clock,
    config: options.unconfigured === true ? {} : { oidc: { issuer: idp.issuer, clientId: idp.clientId, redirectOrigin: REDIRECT_ORIGIN } },
    oidc: { readClientSecret: reader, clientSecretPresent: () => secret.value !== null, fetch: idp.fetch },
  });

  const callbackPath = (callbackUrl: string): string => {
    const url = new URL(callbackUrl);
    return `${url.pathname.replace('/api/v1', '')}${url.search}`;
  };
  const tokenOf = (callback: ApiResult): string | undefined => {
    const location = callback.raw.headers['location'];
    if (typeof location !== 'string') return undefined;
    const value = new URL(location, 'https://x.invalid').searchParams.get('oidcLink');
    return value !== null && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
  };

  const linkLegOne: OidcHub['linkLegOne'] = async (session, account, extra = {}) => {
    const start = await h.call('POST', '/auth/oidc/link/start', { cookie: session.cookie, csrf: session.csrf, body: extra.returnTo === undefined ? {} : { returnTo: extra.returnTo } });
    if (start.status !== 200) return { start, callback: start, linkToken: undefined };
    const { callbackUrl } = idp.authorize(start.json.authorizationUrl, { account });
    // The callback is cross-site and credential-less: no cookie is sent, whatever the browser has.
    const callback = await h.call('GET', callbackPath(callbackUrl), { headers: { ...CROSS_SITE_NAVIGATION } });
    return { start, callback, linkToken: tokenOf(callback) };
  };

  return {
    ...h, idp, secret, linkLegOne,
    async signInWithGoogle(account, extra = {}) {
      const start = await h.call('POST', '/auth/oidc/start', { body: extra.returnTo === undefined ? {} : { returnTo: extra.returnTo } });
      const authorizationUrl: string = start.json?.authorizationUrl ?? '';
      const { callbackUrl } = idp.authorize(authorizationUrl, { account });
      const callback = await h.call('GET', callbackPath(callbackUrl), { headers: { ...CROSS_SITE_NAVIGATION } });
      return { start, callback, authorizationUrl };
    },
    async linkAccount(session, account) {
      const leg = await linkLegOne(session, account, { returnTo: '/settings/security' });
      if (leg.linkToken === undefined) throw new Error(`link leg one failed: ${leg.callback.raw.headers['location'] ?? leg.callback.status}`);
      return h.call('POST', '/auth/oidc/link/complete', { cookie: session.cookie, csrf: session.csrf, body: { linkToken: leg.linkToken } });
    },
  };
}
