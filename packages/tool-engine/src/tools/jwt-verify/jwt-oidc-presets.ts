import { hostFetch } from "@dude/crypto/host";
/**
 * Named identity-provider presets for JWT Verify's JWKS mode. A preset only
 * *populates* `jwksUrl` — it fetches the provider's public
 * `.well-known/openid-configuration` discovery document, extracts
 * `jwks_uri`, and hands that back to the existing `createRemoteJWKSet` flow
 * in `jwt-verify-logic.ts`, which is otherwise untouched.
 *
 * Depends on each provider's discovery endpoint keeping permissive CORS
 * (true today for all four, not guaranteed). Azure AD has both a v1 and v2
 * discovery endpoint; this always uses the v2 (`/v2.0/...`) endpoint, which
 * is correct for the vast majority of modern Entra ID app registrations.
 */

export type OidcPreset = 'auth0' | 'okta' | 'azure-ad' | 'google';

export interface OidcPresetConfig {
  readonly label: string;
  readonly field?: { readonly label: string; readonly placeholder: string };
  readonly discoveryUrl: (input: string) => string;
}

export const OIDC_PRESETS: Record<OidcPreset, OidcPresetConfig> = {
  auth0: {
    label: 'Auth0',
    field: { label: 'Auth0 domain', placeholder: 'your-tenant.us.auth0.com' },
    discoveryUrl: (domain) => `https://${domain}/.well-known/openid-configuration`,
  },
  okta: {
    label: 'Okta',
    field: { label: 'Okta domain', placeholder: 'your-org.okta.com' },
    discoveryUrl: (domain) => `https://${domain}/.well-known/openid-configuration`,
  },
  'azure-ad': {
    label: 'Microsoft Entra ID',
    field: { label: 'Tenant ID', placeholder: 'common, or your tenant GUID' },
    discoveryUrl: (tenant) => `https://login.microsoftonline.com/${tenant || 'common'}/v2.0/.well-known/openid-configuration`,
  },
  google: {
    label: 'Google',
    discoveryUrl: () => 'https://accounts.google.com/.well-known/openid-configuration',
  },
};

export type DiscoveryResult = { readonly ok: true; readonly jwksUri: string } | { readonly ok: false; readonly error: string };

export async function fetchJwksUriFromDiscovery(discoveryUrl: string): Promise<DiscoveryResult> {
  let response: Response;
  try {
    response = await hostFetch(discoveryUrl);
  } catch (error) {
    if (error instanceof TypeError) {
      return { ok: false, error: 'Could not reach the discovery URL — this may be a network issue or the server blocking cross-origin requests (CORS).' };
    }
    return { ok: false, error: error instanceof Error ? error.message : 'Discovery request failed.' };
  }

  if (!response.ok) return { ok: false, error: `Discovery request failed (HTTP ${response.status}).` };

  const doc: unknown = await response.json().catch(() => null);
  const jwksUri = (doc as { jwks_uri?: unknown } | null)?.jwks_uri;
  if (typeof jwksUri !== 'string' || !jwksUri) {
    return { ok: false, error: 'Discovery document did not include a jwks_uri.' };
  }
  return { ok: true, jwksUri };
}
