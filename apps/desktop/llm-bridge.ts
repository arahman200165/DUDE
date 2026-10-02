import { ipcMain } from 'electron';
import type { Server } from 'node:http';
import { getSecretValue } from './secrets-bridge';
import { startLlmProxy } from './llm-proxy-server';

/**
 * IPC for Stage 4's local LLM proxy. Reads Settings' (/settings, AI / LLM Provider) stored
 * config directly from the secure store (same process, no extra IPC round
 * trip — see `getSecretValue` in `secrets-bridge.ts`) rather than requiring
 * a separate "push config to main" call, so the API key is only ever
 * written to disk once.
 *
 * The proxy is started lazily, on the first `getEndpoint()` call after a
 * key is configured — not eagerly at app launch — and is restarted
 * whenever the stored config changes.
 */

const KEY_BASE_URL = 'dude:v1:settings:llmBaseUrl';
const KEY_MODEL = 'dude:v1:settings:llmModel';
const KEY_API_KEY = 'dude:v1:settings:llmApiKey';

interface RunningProxy {
  readonly server: Server;
  readonly port: number;
  readonly configFingerprint: string;
}

let running: RunningProxy | null = null;

async function readConfig(): Promise<{ baseUrl: string; model: string; apiKey: string } | null> {
  const [baseUrl, model, apiKey] = await Promise.all([getSecretValue(KEY_BASE_URL), getSecretValue(KEY_MODEL), getSecretValue(KEY_API_KEY)]);
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, model: model ?? '', apiKey };
}

export function registerLlmHandlers(): void {
  ipcMain.handle('dude:llm:isConfigured', async (): Promise<boolean> => {
    return (await readConfig()) !== null;
  });

  ipcMain.handle('dude:llm:getEndpoint', async (): Promise<{ ok: true; port: number } | { ok: false; error: string }> => {
    const config = await readConfig();
    if (!config) return { ok: false, error: 'not-configured' };

    const fingerprint = `${config.baseUrl}|${config.model}|${config.apiKey}`;
    if (running && running.configFingerprint === fingerprint) {
      return { ok: true, port: running.port };
    }

    if (running) {
      running.server.close();
      running = null;
    }

    try {
      const { server, port } = await startLlmProxy(config);
      running = { server, port, configFingerprint: fingerprint };
      return { ok: true, port };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Could not start the LLM proxy.' };
    }
  });
}
