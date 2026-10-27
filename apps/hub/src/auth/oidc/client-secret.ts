import type { ClientSecretResult } from './client.js';

/**
 * Adapts the machine-bound secret store to the OIDC client (32-SS1, Milestone 841). The store is passed in structurally: this module
 * is under `auth/`, which never imports `secrets/` (`secrets.spec.ts` keeps that boundary); the Hub's `run` wiring (Milestone 842)
 * builds the store and hands it over. The secret is read per call and never kept; a store failure is `unreadable` with no cause.
 */
export interface OidcSecretSource { getText(purpose: 'oidc.clientSecret'): string | null }

export function createClientSecretReader(store: OidcSecretSource): () => ClientSecretResult {
  return () => {
    let value: string | null;
    try { value = store.getText('oidc.clientSecret'); } catch { return { status: 'unreadable' }; }
    const secret = value?.trim() ?? '';
    return secret.length === 0 ? { status: 'missing' } : { status: 'ok', secret };
  };
}
