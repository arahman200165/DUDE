/** `secret:<uuid>` reference string. Branded so plain strings are not accepted by accident. */
export type SecretRef = string & { readonly __brand: 'SecretRef' };

export function isSecretRef(value: unknown): value is SecretRef {
  return typeof value === 'string' && /^secret:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Closed purpose allowlist. `consumer: 'main'` means the plaintext is only ever read in the Electron main process. */
export const SECRET_PURPOSES = {
  'ai.llmApiKey': { owner: 'settings.ai', consumer: 'main', maxLength: 4096 },
} as const;

export type SecretPurpose = keyof typeof SECRET_PURPOSES;

export function isSecretPurpose(value: unknown): value is SecretPurpose {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SECRET_PURPOSES, value);
}

export interface SecretRefRecord {
  ref: SecretRef;
  purpose: SecretPurpose;
  owner: string;
  scope: 'device';
  /** ISO-8601. */
  createdAt: string;
  lastUsedAt?: string;
  /** True after a clone/restore: the ciphertext cannot be decrypted here and the user must re-enter it. */
  needsReentry: boolean;
}

/** What the renderer may know about a secret: presence and a masked hint, never the value. */
export interface SecretStatus {
  purpose: SecretPurpose;
  isSet: boolean;
  hint: string | null;
  needsReentry: boolean;
}

/** Bullets plus the last 4 characters; values shorter than 8 characters reveal nothing. */
export function maskSecretHint(value: string): string {
  return value.length < 8 ? '••••' : '••••' + value.slice(-4);
}
