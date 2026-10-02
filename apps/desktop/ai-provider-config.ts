import { ipcMain, type BrowserWindow } from 'electron';
import { loadDoc, saveDoc } from './device-store/device-docs';
import { secretStatus } from './secrets-bridge';
import type { AiProviderConfig, AiProviderConfigView } from '@dude/contracts/shared/models/platform-bridge.model';

/**
 * AI provider base URL and model: a device doc (`ai-provider`) owned by main. The renderer reads and
 * writes it only over sender-checked IPC; the API key is a separate secret (`ai.llmApiKey`) whose value
 * never leaves main.
 */

export const AI_PROVIDER_DOC = 'ai-provider';
const MAX_URL = 2048;
const MAX_MODEL = 200;

export function validBaseUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_URL) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

export const validModel = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_MODEL;

export function decodeAiProvider(raw: unknown): AiProviderConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { baseUrl, model } = raw as { baseUrl?: unknown; model?: unknown };
  return { baseUrl: validBaseUrl(baseUrl) ? baseUrl : '', model: validModel(model) ? model : '' };
}

const EMPTY: AiProviderConfig = { baseUrl: '', model: '' };

export const loadAiProvider = (): Promise<AiProviderConfig> => loadDoc(AI_PROVIDER_DOC, decodeAiProvider, EMPTY);

/** `{ baseUrl?, model? }` and nothing else; an empty baseUrl clears it. */
export function parseAiProviderPatch(payload: unknown): Partial<AiProviderConfig> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const keys = Object.keys(payload);
  if (keys.some((key) => key !== 'baseUrl' && key !== 'model')) return null;
  const { baseUrl, model } = payload as { baseUrl?: unknown; model?: unknown };
  const patch: { baseUrl?: string; model?: string } = {};
  if (baseUrl !== undefined) {
    if (baseUrl !== '' && !validBaseUrl(baseUrl)) return null;
    patch.baseUrl = baseUrl as string;
  }
  if (model !== undefined) {
    if (!validModel(model)) return null;
    patch.model = model;
  }
  return patch;
}

export function registerAiProviderHandlers(window: BrowserWindow): void {
  ipcMain.handle('dude:ai:getConfig', async (event): Promise<AiProviderConfigView | null> => {
    if (event.sender !== window.webContents) return null;
    const config = await loadAiProvider();
    return { ...config, apiKey: await secretStatus('ai.llmApiKey') };
  });

  ipcMain.handle('dude:ai:setConfig', async (event, payload: unknown): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: string }> => {
    if (event.sender !== window.webContents) return { ok: false, error: 'rejected' };
    const patch = parseAiProviderPatch(payload);
    if (!patch) return { ok: false, error: 'invalid-config' };
    await saveDoc(AI_PROVIDER_DOC, { ...(await loadAiProvider()), ...patch });
    return { ok: true };
  });
}
