import type { FetchLike } from './egress.js';

/**
 * TEST-ONLY (PD-068, `DUDE_HUB_TEST_OIDC_IDP_URL`; the 32-SS1 platform exit e2e, Milestone 854): the OIDC client's `fetch`, pointed at a fake
 * identity provider server on loopback (`testing/fake-idp-server.ts`) instead of the network. The egress allowlist and every other rule of the
 * client still apply to the URL that was asked for, because this replaces only the transport underneath `createOidcEgress`: the real URL
 * travels in `x-fake-idp-url` and the server answers as the provider would. A provider that is "down" answers 599, which this turns into the
 * network failure a dead provider is.
 */
export const FAKE_IDP_URL_HEADER = 'x-fake-idp-url';
export const FAKE_IDP_DOWN_STATUS = 599;

export function createForwardingFetch(baseUrl: string, transport: FetchLike = (input, init) => fetch(input, init)): FetchLike {
  const target = `${baseUrl.replace(/\/+$/, '')}/fetch`;
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set(FAKE_IDP_URL_HEADER, input);
    const response = await transport(target, {
      method: init?.method ?? 'GET',
      headers,
      redirect: 'manual',
      ...(init?.signal ? { signal: init.signal } : {}),
      ...(init?.body !== undefined && init.body !== null ? { body: init.body } : {}),
    });
    if (response.status === FAKE_IDP_DOWN_STATUS) {
      try { await response.body?.cancel(); } catch { /* best effort */ }
      throw new TypeError('fetch failed');
    }
    return response;
  };
}
