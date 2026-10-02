import { fetchJwksUriFromDiscovery, OIDC_PRESETS } from "./jwt-oidc-presets.js";

describe('OIDC_PRESETS', () => {
  it('builds the expected discovery URL for each preset', () => {
    expect(OIDC_PRESETS.auth0.discoveryUrl('tenant.us.auth0.com')).toBe(
      'https://tenant.us.auth0.com/.well-known/openid-configuration',
    );
    expect(OIDC_PRESETS.okta.discoveryUrl('org.okta.com')).toBe('https://org.okta.com/.well-known/openid-configuration');
    expect(OIDC_PRESETS['azure-ad'].discoveryUrl('my-tenant-id')).toBe(
      'https://login.microsoftonline.com/my-tenant-id/v2.0/.well-known/openid-configuration',
    );
    expect(OIDC_PRESETS['azure-ad'].discoveryUrl('')).toBe(
      'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
    );
    expect(OIDC_PRESETS.google.discoveryUrl('')).toBe('https://accounts.google.com/.well-known/openid-configuration');
  });

  it('only Google has no tenant/domain field', () => {
    expect(OIDC_PRESETS.google.field).toBeUndefined();
    expect(OIDC_PRESETS.auth0.field).toBeDefined();
    expect(OIDC_PRESETS.okta.field).toBeDefined();
    expect(OIDC_PRESETS['azure-ad'].field).toBeDefined();
  });
});

describe('fetchJwksUriFromDiscovery', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts jwks_uri from a successful discovery response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ jwks_uri: 'https://example.com/jwks.json' }),
      }),
    );

    expect(await fetchJwksUriFromDiscovery('https://example.com/.well-known/openid-configuration')).toEqual({
      ok: true,
      jwksUri: 'https://example.com/jwks.json',
    });
  });

  it('reports an HTTP error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));

    expect(await fetchJwksUriFromDiscovery('https://example.com/nope')).toEqual({
      ok: false,
      error: 'Discovery request failed (HTTP 404).',
    });
  });

  it('reports a missing jwks_uri in an otherwise-valid document', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));

    expect(await fetchJwksUriFromDiscovery('https://example.com/.well-known/openid-configuration')).toEqual({
      ok: false,
      error: 'Discovery document did not include a jwks_uri.',
    });
  });

  it('reports a network/CORS failure as a TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    expect(await fetchJwksUriFromDiscovery('https://example.com/.well-known/openid-configuration')).toEqual({
      ok: false,
      error: 'Could not reach the discovery URL — this may be a network issue or the server blocking cross-origin requests (CORS).',
    });
  });
});
