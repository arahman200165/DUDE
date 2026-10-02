import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';

export type HubBindMode = 'loopback' | 'lan' | 'container';

export interface HubConfig {
  port: number;
  bind: HubBindMode;
  webRoot?: string;
}

const BIND_MODES: readonly HubBindMode[] = ['loopback', 'lan', 'container'];
const KNOWN_KEYS = new Set(['port', 'bind', 'webRoot']);

export function defaultHubConfig(): HubConfig {
  return { port: HUB_DEFAULT_PORT, bind: 'loopback' };
}

/** Strict validation: unknown keys and wrong types are rejected with a clear message. */
export function parseHubConfig(raw: unknown): HubConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Hub config must be a JSON object.');
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!KNOWN_KEYS.has(key)) throw new Error(`Hub config has an unknown key "${key}".`);
  const config = defaultHubConfig();
  if (record['port'] !== undefined) {
    const port = record['port'];
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Hub config "port" must be an integer from 1 to 65535.');
    config.port = port;
  }
  if (record['bind'] !== undefined) {
    const bind = record['bind'];
    if (typeof bind !== 'string' || !BIND_MODES.includes(bind as HubBindMode)) throw new Error(`Hub config "bind" must be one of ${BIND_MODES.join(', ')}.`);
    config.bind = bind as HubBindMode;
  }
  if (record['webRoot'] !== undefined) {
    const webRoot = record['webRoot'];
    if (typeof webRoot !== 'string' || webRoot.length === 0) throw new Error('Hub config "webRoot" must be a non-empty string.');
    config.webRoot = webRoot;
  }
  return config;
}

/** Atomic write: temp file in the same directory, then rename. */
export function writeHubConfig(file: string, config: HubConfig): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + '\n');
  renameSync(tmp, file);
}

/** Load the config, writing defaults on first start. */
export function loadOrCreateHubConfig(file: string): HubConfig {
  if (!existsSync(file)) {
    const config = defaultHubConfig();
    writeHubConfig(file, config);
    return config;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Hub config ${file} is not valid JSON: ${(error as Error).message}`);
  }
  return parseHubConfig(parsed);
}

export function bindAddress(config: Pick<HubConfig, 'bind'>): string {
  return config.bind === 'loopback' ? '127.0.0.1' : '0.0.0.0';
}
