import { existsSync, readFileSync } from 'node:fs';
import { allowedEgressHosts } from '../../auth/oidc/egress.js';
import { parseOidcConfig } from '../../config/hub-config.js';
import type { HubOidcConfig } from '../../config/hub-config.js';
import { createSecretStore } from '../../secrets/secret-store.js';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext } from '../types.js';
import { readExpectedSecrets } from './secrets.js';

/** The client-secret purpose (see `secrets/secret-store.ts`). */
const OIDC_PURPOSE = 'oidc.clientSecret';

const SET_UP = 'Add an "oidc" block (client id and redirect origin) to hub.json and enter the Google client secret on the Hub machine (the Hub set-up wizard does both).';

type ConfigRead = { state: 'absent' } | { state: 'invalid' } | { state: 'ok'; config: HubOidcConfig };

/** Reads only the `oidc` block of `hub.json` (never creates the file, never fails the check). */
function readOidcConfig(configFile: string): ConfigRead {
  if (!existsSync(configFile)) return { state: 'absent' };
  let raw: unknown;
  try { raw = JSON.parse(readFileSync(configFile, 'utf8')); } catch { return { state: 'absent' }; }
  const block = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>)['oidc'] : undefined;
  if (block === undefined) return { state: 'absent' };
  try { return { state: 'ok', config: parseOidcConfig(block) }; } catch { return { state: 'invalid' }; }
}

/**
 * Google (OIDC) sign-in (32-SS1, Milestone 841, PD-121, PD-145). Read-only and offline: provisioning never configures it (that needs the
 * owner's own Google OAuth client) and never contacts the provider; the last known reachability comes from the running Hub's OIDC client
 * (`context.oidc`). The password stays the way in whatever this reports, so no state here is a blocker for the Hub itself.
 *
 * - `not-configured`: no `oidc` block in `hub.json`.
 * - `needs-attention`: the block is invalid, or the client secret is absent on this machine (never entered, or the Hub was restored:
 *   machine-bound secrets and the `oidc` block do not travel in a backup, so after a restore the owner configures it again and links
 *   Google again).
 * - `degraded` (the contract has no `unreachable` state): the provider could not be reached last time; sign-in falls back to the password.
 * - `ready`: configured with a secret. The detail names the only hosts the Hub will ever contact for it (the egress allowlist).
 */
export const oidcComponent: ProvisioningComponent = {
  id: 'oidc',
  check(context: ProvisioningContext): ComponentOutcome {
    const configured = readOidcConfig(context.paths.configFile);
    if (configured.state === 'absent') {
      const expected = context.store.state === 'ready' && readExpectedSecrets(context.store.db).includes(OIDC_PURPOSE);
      return expected
        ? { state: 'needs-attention', detail: 'Google sign-in was set up before but is not configured on this Hub (a restore does not bring it back); the password still works.', nextAction: SET_UP }
        : { state: 'not-configured', detail: 'Google sign-in is not configured; the password is the only sign-in.', nextAction: SET_UP };
    }
    if (configured.state === 'invalid') return { state: 'needs-attention', detail: 'The "oidc" block of hub.json is not valid, so Google sign-in is off; the password still works.', nextAction: 'Correct the "oidc" block of hub.json and restart the Hub.' };

    const status = createSecretStore({ secretsDir: context.paths.secretsDir, platform: context.platform }).status();
    if (!status[OIDC_PURPOSE].present) {
      return { state: 'needs-attention', detail: 'The Google client secret is not stored on this machine; enter it again.', nextAction: SET_UP };
    }
    if (context.oidc?.().state === 'unreachable') {
      return { state: 'degraded', detail: 'Google could not be reached last time or answered unexpectedly; sign-in falls back to the password.', nextAction: 'Check this machine can reach Google, then try again.' };
    }
    return { state: 'ready', detail: `Google sign-in is configured. The Hub contacts only ${allowedEgressHosts(configured.config.issuer).join(', ')} for it.` };
  },
};
