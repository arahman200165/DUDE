import type { HubPaths } from '../config/data-dir.js';
import { createSecretStore } from './secret-store.js';

/**
 * The OIDC client secret as the Google sign-in code sees it (32-SS1, Milestone 842). `auth/oidc/` never imports the store (it takes
 * `getText` structurally, `secrets.spec.ts` enforces it), so this adapter lives beside the store and `run` hands it over. `getText`
 * reads (and, on Windows, DPAPI-unprotects) the secret per call; `present` is the cheap file-presence check that status and the
 * start of a sign-in use so the DPAPI helper is not spawned for them.
 */
export interface OidcSecretSource {
  getText(purpose: 'oidc.clientSecret'): string | null;
  present(): boolean;
  /** Stores the client secret (the elevated `oidc.configure` admin method only); never logged or returned. */
  put(purpose: 'oidc.clientSecret', value: string): void;
}

export function createOidcSecretSource(paths: Pick<HubPaths, 'secretsDir'>, options: { platform?: NodeJS.Platform } = {}): OidcSecretSource {
  const store = createSecretStore({ secretsDir: paths.secretsDir, ...(options.platform ? { platform: options.platform } : {}) });
  return {
    getText: (purpose) => store.getText(purpose),
    present: () => store.status()['oidc.clientSecret'].present,
    put: (purpose, value) => store.put(purpose, value),
  };
}
