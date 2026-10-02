import { ipcMain, type BrowserWindow } from 'electron';
import { getSecretValue } from './secrets-bridge';
import { loadAiProvider } from './ai-provider-config';

/**
 * IPC for the desktop LLM integration. Reads Settings' (/settings, AI / LLM Provider) stored
 * config in-process: base URL and model from the `ai-provider` device doc (`ai-provider-config.ts`) and the
 * API key via `getSecretValue('ai.llmApiKey')`, so the key never reaches the renderer. `dude:llm:chat` performs the
 * provider request in main (non-streaming; Regex Tester's AI features need a short, complete reply)
 * and accepts requests only from this window's own renderer. The renderer is served from the
 * `dude-app://` scheme, so it cannot call a loopback HTTP proxy cross-origin; IPC replaces it.
 */

const MAX_MESSAGES = 200;
const MAX_TOTAL_CONTENT = 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ERROR_LENGTH = 300;

export type LlmChatResult = { readonly ok: true; readonly content: string } | { readonly ok: false; readonly error: string };

interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

async function readConfig(): Promise<{ baseUrl: string; model: string; apiKey: string } | null> {
  const [{ baseUrl, model }, apiKey] = await Promise.all([loadAiProvider(), getSecretValue('ai.llmApiKey')]);
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, model, apiKey };
}

/** Strict payload check: exactly `{ messages: [{ role, content }] }` within the size bounds. */
export function parseChatRequest(payload: unknown): readonly ChatMessage[] | null {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
  const keys = Object.keys(payload);
  if (keys.length !== 1 || keys[0] !== 'messages') return null;
  const messages = (payload as { messages: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
  const parsed: ChatMessage[] = [];
  let total = 0;
  for (const entry of messages as unknown[]) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return null;
    const entryKeys = Object.keys(entry);
    if (entryKeys.length !== 2 || !entryKeys.includes('role') || !entryKeys.includes('content')) return null;
    const { role, content } = entry as { role: unknown; content: unknown };
    if (role !== 'system' && role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string') return null;
    total += content.length;
    if (total > MAX_TOTAL_CONTENT) return null;
    parsed.push({ role, content });
  }
  return parsed;
}

function scrub(text: string, apiKey: string): string {
  const cleaned = apiKey ? text.split(apiKey).join('[redacted]') : text;
  return cleaned.length > MAX_ERROR_LENGTH ? `${cleaned.slice(0, MAX_ERROR_LENGTH)}...` : cleaned;
}

async function chat(messages: readonly ChatMessage[]): Promise<LlmChatResult> {
  const config = await readConfig();
  if (!config) return { ok: false, error: 'not-configured' };

  try {
    const upstream = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages, stream: false }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const data: unknown = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      const providerError = (data as { error?: unknown } | null)?.error;
      const nested = (providerError as { message?: unknown } | null | undefined)?.message;
      const detail = typeof providerError === 'string' ? providerError : typeof nested === 'string' ? nested : '';
      const message = detail ? `The AI request failed (${upstream.status}): ${detail}` : `The AI request failed (${upstream.status}).`;
      return { ok: false, error: scrub(message, config.apiKey) };
    }

    const content = (data as { choices?: readonly { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return { ok: false, error: 'The AI response was in an unexpected format.' };
    return { ok: true, content };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { ok: false, error: timedOut ? 'The AI request timed out.' : scrub(error instanceof Error ? error.message : 'The LLM endpoint could not be reached.', config.apiKey) };
  }
}

export function registerLlmHandlers(window: BrowserWindow): void {
  ipcMain.handle('dude:llm:isConfigured', async (event): Promise<boolean> => {
    if (event.sender !== window.webContents) return false;
    return (await readConfig()) !== null;
  });

  ipcMain.handle('dude:llm:chat', async (event, payload: unknown): Promise<LlmChatResult> => {
    if (event.sender !== window.webContents) return { ok: false, error: 'Request rejected.' };
    const messages = parseChatRequest(payload);
    if (!messages) return { ok: false, error: 'Invalid chat request.' };
    return chat(messages);
  });
}
