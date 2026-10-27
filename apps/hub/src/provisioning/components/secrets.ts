import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { HUB_SECRET_PURPOSES, createSecretStore, isHubSecretPurpose } from '../../secrets/secret-store.js';
import type { HubSecretPurpose, SecretStore } from '../../secrets/secret-store.js';
import type { ComponentOutcome, ProvisioningComponent, ProvisioningContext, SecretPresence } from '../types.js';

/**
 * `savesphere.db` `meta` key listing the secret purposes the Hub expects to hold (JSON array of purpose names, never a value).
 * `meta` is a kept table, so the list survives a backup and restore while the machine-bound secrets themselves never do: after a
 * restore the file is gone and the purpose is still expected, which is exactly `needsReentry`.
 */
export const EXPECTED_SECRETS_META = 'provisioning_expected_secrets';

export function readExpectedSecrets(db: Db): HubSecretPurpose[] {
  const raw = getMeta(db, EXPECTED_SECRETS_META);
  if (raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isHubSecretPurpose) : [];
  } catch {
    return [];
  }
}

/**
 * Records that `purpose` is expected from now on (a later milestone calls it when the owner stores a secret or configures the
 * feature that needs one). Idempotent. `expected: false` forgets a purpose the owner removed on purpose.
 */
export function setSecretExpected(db: Db, purpose: HubSecretPurpose, expected = true): void {
  const current = new Set(readExpectedSecrets(db));
  if (expected) current.add(purpose);
  else current.delete(purpose);
  setMeta(db, EXPECTED_SECRETS_META, JSON.stringify(HUB_SECRET_PURPOSES.filter((p) => current.has(p))));
}

const storeFor = (context: ProvisioningContext): SecretStore => createSecretStore({ secretsDir: context.paths.secretsDir, platform: context.platform });

/**
 * Secret presence only (never a value): which purposes the machine-bound store holds and which the content store says are expected
 * but missing. A provision run records every purpose that is present as expected, so a later restore shows what to re-enter.
 * Handlers never import the secret store; this component and the admin pipe are the only provisioning readers.
 */
export const secretsComponent: ProvisioningComponent = {
  id: 'secrets',
  provision(context: ProvisioningContext): void {
    if (context.store.state !== 'ready') return;
    const status = storeFor(context).status();
    for (const purpose of HUB_SECRET_PURPOSES) if (status[purpose].present) setSecretExpected(context.store.db, purpose);
  },
  check(context: ProvisioningContext): ComponentOutcome {
    const expected = context.store.state === 'ready' ? readExpectedSecrets(context.store.db) : [];
    const status = storeFor(context).status({ expected });
    const secrets: SecretPresence[] = HUB_SECRET_PURPOSES.map((purpose) => ({ purpose, present: status[purpose].present, needsReentry: status[purpose].needsReentry }));
    const missing = secrets.filter((s) => s.needsReentry).map((s) => s.purpose);
    if (missing.length > 0) {
      return {
        state: 'needs-attention', secrets,
        detail: `${missing.length} secret${missing.length === 1 ? '' : 's'} must be entered again (${missing.join(', ')}); secrets never travel in a backup.`,
        nextAction: 'Enter them again in the setup step that asked for them, on the Hub machine.',
      };
    }
    const held = secrets.filter((s) => s.present).length;
    if (held === 0) return { state: 'not-configured', secrets, detail: 'No secret is stored yet; none is needed until a feature that uses one is set up.' };
    return { state: 'ready', secrets, detail: `${held} secret${held === 1 ? ' is' : 's are'} stored, protected for this machine.` };
  },
};
