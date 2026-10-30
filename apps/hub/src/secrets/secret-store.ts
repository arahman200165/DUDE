import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { plainSecretsKnob } from '../cli/test-overrides.js';
import { createDpapiProtector, createFileProtector, defaultSyncExec } from '../tls/ca-key-protector.js';
import type { CaKeyProtector, SyncExec } from '../tls/ca-key-protector.js';

/**
 * The Hub secret store (32-SS1, PD-142): machine-bound secrets the Hub must hold to act unattended (the Cloudflare tunnel
 * connector token, the OIDC client secret, backup destination credentials and refresh tokens). It generalizes the one-off
 * protectors of `tls/ca-key-protector.ts` (CA and ACME keys) and `backup/schedule-key.ts` (derived backup key): same DPAPI
 * LocalMachine mechanism (the shared `createDpapiProtector`), but one protected file and one DPAPI entropy PER PURPOSE, so a blob
 * protected for one purpose can never be replayed as another.
 *
 * - Windows: DPAPI LocalMachine through the existing PowerShell helper; the value travels over stdin, never argv.
 * - Linux/Docker: there is no machine-bound key store, so the fallback is the value in a mode-0600 file in a mode-0700 directory.
 *   That is file-permission protection only, the same trade-off the CA and ACME keys make there.
 * - Files live in `<configDir>/secrets/<purpose>.<dpapi|secret>`, written as `.part` then renamed.
 *
 * Backup and restore (PD-070, PD-153): the backup contains only the scrubbed database and `hub.json`, so this directory is never
 * in a backup (`secrets.spec.ts` asserts it) and DPAPI blobs would be unreadable on another machine anyway. After a restore onto a
 * new machine every purpose is absent and the owner must re-enter it; `status({ expected })` reports that as `needsReentry`.
 * It is also never part of any diagnostics report: `status()` carries presence only.
 *
 * Boundary: only the elevated admin-pipe and provisioning code, the tunnel supervisor and the destination/OIDC code that
 * needs a value may import this module; request handlers never do (enforced by `secrets.spec.ts`). Values are never logged,
 * audited, put in an error message or returned by `status()`.
 */
export const HUB_SECRET_PURPOSES = [
  'tunnel.connectorToken',
  'oidc.clientSecret',
  'backup.s3.credentials',
  'backup.drive.refreshToken',
  'backup.onedrive.refreshToken',
  /** The backup v2 master key (Milestone 847): unattended runs open every destination repository with it, never with the passphrase. */
  'backup.masterKey',
] as const;

export type HubSecretPurpose = (typeof HUB_SECRET_PURPOSES)[number];

/** Upper bound for one secret (a JSON credential set is far below this); keeps the PowerShell stdin hand-off small. */
export const MAX_SECRET_BYTES = 64 * 1024;

export interface SecretStatusEntry {
  readonly present: boolean;
  /** True when the purpose is expected to be configured (the caller says so) but no secret is stored, for example after a restore. */
  readonly needsReentry: boolean;
}

export type SecretStatus = Readonly<Record<HubSecretPurpose, SecretStatusEntry>>;

export interface SecretStore {
  readonly kind: 'dpapi' | 'file';
  put(purpose: HubSecretPurpose, value: Uint8Array | string): void;
  /** Null when no secret is stored for the purpose; throws a clear, value-free error when one is stored but cannot be read. */
  get(purpose: HubSecretPurpose): Buffer | null;
  getText(purpose: HubSecretPurpose): string | null;
  /** True when a secret was stored. */
  delete(purpose: HubSecretPurpose): boolean;
  /** Presence per purpose; never a value. `expected` names the purposes the Hub configuration says should hold a secret. */
  status(options?: { expected?: Iterable<HubSecretPurpose> }): SecretStatus;
}

export interface SecretStoreOptions {
  secretsDir: string;
  platform?: NodeJS.Platform;
  /** Test seam for the PowerShell DPAPI call. */
  exec?: SyncExec;
}

/** A purpose's DPAPI entropy: fixed, distinct per purpose, and distinct from the CA, ACME and backup-schedule entropies. */
export const secretEntropy = (purpose: HubSecretPurpose): string => `DUDE Hub Secret ${purpose} v1`;

export function isHubSecretPurpose(value: unknown): value is HubSecretPurpose {
  return typeof value === 'string' && (HUB_SECRET_PURPOSES as readonly string[]).includes(value);
}

function assertPurpose(purpose: unknown): asserts purpose is HubSecretPurpose {
  if (!isHubSecretPurpose(purpose)) throw new Error('Unknown secret purpose.');
}

export function createSecretStore(options: SecretStoreOptions): SecretStore {
  // TEST-ONLY (PD-068, ignored by a release bundle): the file fallback on every platform, so an e2e can write secrets without DPAPI.
  const platform = plainSecretsKnob() ? 'linux' : (options.platform ?? process.platform);
  const exec = options.exec ?? defaultSyncExec;
  const protectorFor = (purpose: HubSecretPurpose): CaKeyProtector =>
    platform === 'win32' ? createDpapiProtector(exec, { entropy: secretEntropy(purpose), keyFile: `${purpose}.dpapi` }) : createFileProtector(`${purpose}.secret`);
  const kind = platform === 'win32' ? 'dpapi' : 'file';
  const fileFor = (purpose: HubSecretPurpose): string => path.join(options.secretsDir, protectorFor(purpose).keyFile);

  const unreadable = (purpose: HubSecretPurpose): Error =>
    new Error(`The stored secret for ${purpose} is unreadable (it was protected on another machine or is corrupt); enter it again.`);

  const get = (purpose: HubSecretPurpose): Buffer | null => {
    assertPurpose(purpose);
    const file = fileFor(purpose);
    if (!existsSync(file)) return null;
    try {
      return protectorFor(purpose).unprotect(readFileSync(file));
    } catch {
      // The underlying error can carry PowerShell output; the message here never does.
      throw unreadable(purpose);
    }
  };

  return {
    kind,
    put(purpose, value) {
      assertPurpose(purpose);
      const plain = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
      if (plain.length === 0) throw new Error('A secret value must not be empty.');
      if (plain.length > MAX_SECRET_BYTES) throw new Error(`A secret value must be at most ${String(MAX_SECRET_BYTES)} bytes.`);
      let blob: Buffer;
      try {
        blob = protectorFor(purpose).protect(plain);
      } catch {
        throw new Error(`The secret for ${purpose} could not be protected on this machine.`);
      }
      mkdirSync(options.secretsDir, { recursive: true, mode: 0o700 });
      const file = fileFor(purpose);
      const part = `${file}.part`;
      try {
        writeFileSync(part, blob, { mode: 0o600 });
        renameSync(part, file);
      } catch (error) {
        rmSync(part, { force: true });
        throw error;
      }
    },
    get,
    getText(purpose) {
      return get(purpose)?.toString('utf8') ?? null;
    },
    delete(purpose) {
      assertPurpose(purpose);
      const file = fileFor(purpose);
      const existed = existsSync(file);
      rmSync(file, { force: true });
      return existed;
    },
    status(statusOptions = {}) {
      const expected = new Set<HubSecretPurpose>(statusOptions.expected ?? []);
      const entries = HUB_SECRET_PURPOSES.map((purpose) => {
        const present = existsSync(fileFor(purpose));
        return [purpose, { present, needsReentry: !present && expected.has(purpose) }] as const;
      });
      return Object.fromEntries(entries) as SecretStatus;
    },
  };
}
