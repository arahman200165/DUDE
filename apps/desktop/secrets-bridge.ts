import { ipcMain, safeStorage, type BrowserWindow } from 'electron';
import { SECRET_PURPOSES, isSecretPurpose, maskSecretHint } from '@dude/persistence';
import type { SecretPurpose, SecretStatus } from '@dude/persistence';
import { isDeviceStoreReady, storeCall } from './device-store/store-client';

/**
 * Secrets live in the Device State Store as `safeStorage` ciphertext (Phase 31B, M622). Main encrypts
 * and decrypts; the store only ever holds ciphertext. The renderer can learn whether a secret is set
 * and a masked hint (computed here), and can replace or remove it. There is deliberately NO channel
 * that returns a value: plaintext is readable only in-process via `getSecretValue` (e.g. `llm-bridge.ts`).
 */

export type SecretWriteResult = { readonly ok: true } | { readonly ok: false; readonly error: string };

const unavailable = (purpose: SecretPurpose, error: 'store-unavailable'): SecretStatus & { readonly error: string } => ({ purpose, isSet: false, hint: null, needsReentry: false, error });

/** In-process read for other main modules. Null when unset, undecryptable or the store is down. */
export async function getSecretValue(purpose: SecretPurpose): Promise<string | null> {
  if (!isDeviceStoreReady()) return null;
  try {
    const { ciphertext } = await storeCall('secrets.getCiphertext', { purpose });
    if (!ciphertext) return null;
    return safeStorage.decryptString(Buffer.from(ciphertext));
  } catch {
    return null;
  }
}

export async function setSecretValue(purpose: SecretPurpose, value: string): Promise<SecretWriteResult> {
  if (!isDeviceStoreReady()) return { ok: false, error: 'store-unavailable' };
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'encryption-unavailable' };
  try {
    await storeCall('secrets.set', { purpose, ciphertext: new Uint8Array(safeStorage.encryptString(value)) });
    return { ok: true };
  } catch {
    return { ok: false, error: 'store-unavailable' };
  }
}

export async function removeSecret(purpose: SecretPurpose): Promise<SecretWriteResult> {
  if (!isDeviceStoreReady()) return { ok: false, error: 'store-unavailable' };
  try {
    await storeCall('secrets.remove', { purpose });
    return { ok: true };
  } catch {
    return { ok: false, error: 'store-unavailable' };
  }
}

/** Presence, a masked hint and the re-entry flag. The hint is derived in main; the value never leaves it. */
export async function secretStatus(purpose: SecretPurpose): Promise<SecretStatus & { readonly error?: string }> {
  if (!isDeviceStoreReady()) return unavailable(purpose, 'store-unavailable');
  try {
    const row = await storeCall('secrets.status', { purpose });
    if (!row.isSet) return { purpose, isSet: false, hint: null, needsReentry: row.needsReentry };
    if (row.needsReentry) return { purpose, isSet: true, hint: null, needsReentry: true };
    const value = await getSecretValue(purpose);
    if (value === null) return { purpose, isSet: true, hint: null, needsReentry: true };
    return { purpose, isSet: true, hint: maskSecretHint(value), needsReentry: false };
  } catch {
    return unavailable(purpose, 'store-unavailable');
  }
}

export function registerSecretsHandlers(window: BrowserWindow): void {
  const fromWindow = (event: { sender: unknown }): boolean => event.sender === window.webContents;

  ipcMain.handle('dude:secrets:status', async (event, purpose: unknown) => {
    if (!fromWindow(event) || !isSecretPurpose(purpose)) return { purpose: String(purpose), isSet: false, hint: null, needsReentry: false, error: 'rejected' };
    return secretStatus(purpose);
  });

  ipcMain.handle('dude:secrets:set', async (event, purpose: unknown, value: unknown): Promise<SecretWriteResult> => {
    if (!fromWindow(event)) return { ok: false, error: 'rejected' };
    if (!isSecretPurpose(purpose)) return { ok: false, error: 'unknown-purpose' };
    if (typeof value !== 'string' || value.length === 0 || value.length > SECRET_PURPOSES[purpose].maxLength) return { ok: false, error: 'invalid-value' };
    return setSecretValue(purpose, value);
  });

  ipcMain.handle('dude:secrets:remove', async (event, purpose: unknown): Promise<SecretWriteResult> => {
    if (!fromWindow(event)) return { ok: false, error: 'rejected' };
    if (!isSecretPurpose(purpose)) return { ok: false, error: 'unknown-purpose' };
    return removeSecret(purpose);
  });
}
