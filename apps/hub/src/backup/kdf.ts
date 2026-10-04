import { argon2, randomBytes } from 'node:crypto';
import type { BackupDeps } from '@dude/hub-backup';

/** Same bounds as the owner password (auth/password.ts `validateOwnerPassword`): 12 to 256 code points after NFKC, not blank. */
export const BACKUP_PASSPHRASE_MIN_CODE_POINTS = 12;
export const BACKUP_PASSPHRASE_MAX_CODE_POINTS = 256;

/** Node's Argon2id (memory is in KiB) behind the portable library's injected KDF; the random source and clock are Node's. */
export function nodeBackupDeps(now: () => Date = () => new Date()): BackupDeps {
  return {
    deriveKey: (passphrase, salt, params) =>
      new Promise<Uint8Array>((resolve, reject) => {
        argon2(
          'argon2id',
          { message: passphrase, nonce: salt, parallelism: params.p, tagLength: params.len, memory: params.m, passes: params.t },
          (error, key) => (error ? reject(error) : resolve(new Uint8Array(key))),
        );
      }),
    randomBytes: (n) => new Uint8Array(randomBytes(n)),
    now,
  };
}

/** Returns a message for an unusable backup passphrase, or null when it is acceptable. */
export function validateBackupPassphrase(passphrase: string): string | null {
  if (typeof passphrase !== 'string') return 'The backup passphrase must be text.';
  const normalized = passphrase.normalize('NFKC');
  if (/^\s*$/u.test(normalized)) return 'The backup passphrase cannot be blank.';
  const length = [...normalized].length;
  if (length < BACKUP_PASSPHRASE_MIN_CODE_POINTS) return `The backup passphrase must be at least ${BACKUP_PASSPHRASE_MIN_CODE_POINTS} characters.`;
  if (length > BACKUP_PASSPHRASE_MAX_CODE_POINTS) return `The backup passphrase must be at most ${BACKUP_PASSPHRASE_MAX_CODE_POINTS} characters.`;
  return null;
}
