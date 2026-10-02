import { safeStorage } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { AI_PROVIDER_DOC, decodeAiProvider, validBaseUrl, validModel } from '../ai-provider-config';
import { loadDoc, saveDoc } from './device-docs';
import { isDeviceStoreReady, storeCall } from './store-client';

/**
 * One-shot import of the pre-M622 `userData/secure-store.json` (`key -> base64(safeStorage ciphertext)`):
 *  - `dude:v1:settings:llmApiKey` -> secret `ai.llmApiKey`, copying the ciphertext bytes UNCHANGED (never
 *    decrypted or re-encrypted here);
 *  - `dude:v1:settings:llmBaseUrl` / `llmModel` -> the `ai-provider` device doc (only if it does not exist yet),
 *    which needs a decrypt; skipped with a warning when `safeStorage` is unavailable;
 *  - any other key is left untouched and only its NAME is logged.
 * Guarded by `legacy-import-state.secureStore`; afterwards the file moves to the same
 * `legacy-import/<timestamp>/` recovery convention as the other legacy files.
 */
const FILE = 'secure-store.json';
const KEY_BASE_URL = 'dude:v1:settings:llmBaseUrl';
const KEY_MODEL = 'dude:v1:settings:llmModel';
const KEY_API_KEY = 'dude:v1:settings:llmApiKey';
const STATE_DOC = 'legacy-import-state';
const decodeState = (raw: unknown): Record<string, unknown> | null => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null);

async function readStore(path: string): Promise<Record<string, string> | null> {
  let parsed: unknown;
  try { parsed = JSON.parse(await fs.readFile(path, 'utf8')); } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') console.warn('[legacy-import] skipped secure-store.json: not valid JSON.');
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const store: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) if (typeof value === 'string') store[key] = value;
  return store;
}

function decrypt(encoded: string | undefined): string | null {
  if (!encoded) return null;
  try { return safeStorage.decryptString(Buffer.from(encoded, 'base64')); } catch { return null; }
}

async function moveToRecovery(userData: string): Promise<void> {
  const folder = join(userData, 'legacy-import', new Date().toISOString().replace(/[:.]/g, '-'));
  try {
    await fs.mkdir(folder, { recursive: true });
    await fs.rename(join(userData, FILE), join(folder, FILE));
  } catch (error) {
    try { await fs.copyFile(join(userData, FILE), join(folder, FILE)); await fs.unlink(join(userData, FILE)); } catch {
      console.warn('[legacy-import] could not move secure-store.json:', error instanceof Error ? error.message : error);
    }
  }
}

export async function importLegacySecureStore(userData: string): Promise<void> {
  if (!isDeviceStoreReady()) return;
  const path = join(userData, FILE);
  const state = await loadDoc(STATE_DOC, decodeState, {});
  if (state['secureStore'] !== true) {
    const store = await readStore(path);
    if (!store) return;

    try {
      const encodedKey = store[KEY_API_KEY];
      if (encodedKey) {
        const ciphertext = new Uint8Array(Buffer.from(encodedKey, 'base64'));
        if (ciphertext.length > 0 && !(await storeCall('secrets.status', { purpose: 'ai.llmApiKey' })).isSet) {
          await storeCall('secrets.set', { purpose: 'ai.llmApiKey', ciphertext });
        }
      }

      const hasProviderFields = store[KEY_BASE_URL] !== undefined || store[KEY_MODEL] !== undefined;
      if (hasProviderFields && (await storeCall('docs.get', { name: AI_PROVIDER_DOC })) === null) {
        if (safeStorage.isEncryptionAvailable()) {
          const baseUrl = decrypt(store[KEY_BASE_URL]);
          const model = decrypt(store[KEY_MODEL]);
          const doc = decodeAiProvider({ baseUrl: validBaseUrl(baseUrl) ? baseUrl : '', model: validModel(model) ? model : '' });
          if (doc && (doc.baseUrl || doc.model)) await storeCall('docs.set', { name: AI_PROVIDER_DOC, value: doc });
        } else {
          console.warn('[legacy-import] safeStorage is unavailable: the AI base URL and model were not imported.');
        }
      }

      const skipped = Object.keys(store).filter((key) => key !== KEY_BASE_URL && key !== KEY_MODEL && key !== KEY_API_KEY);
      if (skipped.length) console.warn(`[legacy-import] secure-store.json entries not imported: ${skipped.join(', ')}`);
    } catch (error) {
      console.warn('[legacy-import] could not import secure-store.json:', error instanceof Error ? error.message : error);
      return; // Retry on the next healthy start; the file stays in place.
    }
    await saveDoc(STATE_DOC, { ...(await loadDoc(STATE_DOC, decodeState, {})), secureStore: true, secureStoreAt: new Date().toISOString() });
    if (!isDeviceStoreReady()) return;
  }
  try { await fs.access(path); } catch { return; }
  await moveToRecovery(userData);
}
