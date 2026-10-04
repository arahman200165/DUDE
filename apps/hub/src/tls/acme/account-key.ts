import { createPrivateKey, generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CaKeyProtector } from '../ca-key-protector.js';

/**
 * The ACME account key (ES256, P-256), generated on first use and stored protected under `<tlsDir>/acme/`.
 * Key-use boundary: only `acme-issue.ts` (the admin issuance method and the renewal job) may call these functions;
 * request handlers never import this module (enforced by `local-ca.spec.ts`).
 */
export const ACME_DIR = 'acme';

export const acmeDir = (tlsDir: string): string => path.join(tlsDir, ACME_DIR);
const keyPath = (tlsDir: string, protector: CaKeyProtector): string => path.join(acmeDir(tlsDir), protector.keyFile);

/** Whether an account key has been created (never reads it). */
export const acmeAccountKeyExists = (tlsDir: string, protector: CaKeyProtector): boolean => existsSync(keyPath(tlsDir, protector));

/** Loads the account key, creating and protecting a new one on first use. */
export function loadOrCreateAcmeAccountKey(tlsDir: string, protector: CaKeyProtector): { key: KeyObject; created: boolean } {
  const file = keyPath(tlsDir, protector);
  if (existsSync(file)) return { key: createPrivateKey(protector.unprotect(readFileSync(file)).toString('utf8')), created: false };
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  mkdirSync(acmeDir(tlsDir), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, protector.protect(Buffer.from(privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), 'utf8')), { mode: 0o600 });
  renameSync(temp, file);
  return { key: privateKey, created: true };
}
