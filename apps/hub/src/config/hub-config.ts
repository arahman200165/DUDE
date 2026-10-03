import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { isIPv4, isIPv6 } from 'node:net';
import os from 'node:os';
import { HUB_DEFAULT_PORT } from '@dude/contracts/hub';

export type HubBindMode = 'loopback' | 'lan' | 'container';
export type HubExposureMode = 'private' | 'public';

export interface HubExposureConfig {
  /** `public` is parsed but refused by `run` until Phase 31F. */
  mode: HubExposureMode;
  /** Operator names: lowercase DNS names or IP literals (IPv6 without brackets), optional `:port` for DNS/IPv4. */
  names: string[];
  /** Optional `https://name[:port]` origin used for pairing `hubUrl`; its host must be a configured or built-in name. */
  canonicalOrigin?: string;
}

export interface HubConfig {
  port: number;
  bind: HubBindMode;
  webRoot?: string;
  exposure: HubExposureConfig;
}

export const MAX_EXPOSURE_NAMES = 32;
const BIND_MODES: readonly HubBindMode[] = ['loopback', 'lan', 'container'];
const EXPOSURE_MODES: readonly HubExposureMode[] = ['private', 'public'];
const KNOWN_KEYS = new Set(['port', 'bind', 'webRoot', 'exposure']);
const EXPOSURE_KEYS = new Set(['mode', 'names', 'canonicalOrigin']);
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export interface HubName { host: string; port?: number }

/** Parses one operator name. Throws a clear message on anything that is not a DNS name or IP literal with an allowed port. */
export function normalizeHubName(raw: string): HubName {
  if (typeof raw !== 'string') throw new Error('A Hub name must be a string.');
  const text = raw.trim().toLowerCase();
  if (text.length === 0) throw new Error('A Hub name must not be empty.');
  if (text.includes('*')) throw new Error(`Hub name "${raw}" must not contain a wildcard.`);
  if (text.startsWith('[') || text.includes(']')) throw new Error(`Hub name "${raw}": write IPv6 addresses without brackets.`);
  if (/[\s/@?#\\]/.test(text)) throw new Error(`Hub name "${raw}" is not a host name or IP address.`);
  if (isIPv6(text)) return { host: text };
  let host = text;
  let port: number | undefined;
  const colon = text.lastIndexOf(':');
  if (colon >= 0) {
    host = text.slice(0, colon);
    const portText = text.slice(colon + 1);
    if (host.includes(':')) throw new Error(`Hub name "${raw}" is not a valid IPv6 address (ports are not allowed on IPv6 names).`);
    port = Number(portText);
    if (!/^[0-9]{1,5}$/.test(portText) || port < 1 || port > 65535) throw new Error(`Hub name "${raw}" has an invalid port.`);
  }
  if (isIPv4(host)) return port === undefined ? { host } : { host, port };
  if (/^[0-9.]+$/.test(host)) throw new Error(`Hub name "${raw}" is not a valid IPv4 address.`);
  const labels = host.split('.');
  if (host.length === 0 || host.length > 253 || !labels.every((label) => DNS_LABEL.test(label))) throw new Error(`Hub name "${raw}" is not a valid DNS name.`);
  return port === undefined ? { host } : { host, port };
}

/** The Host header form of a name: IPv6 bracketed, `:port` only when a port is set. */
export function formatHostHeader(name: HubName, port: number | undefined = name.port): string {
  const host = isIPv6(name.host) ? `[${name.host}]` : name.host;
  return port === undefined ? host : `${host}:${port}`;
}

/** The stored form of a name (IPv6 unbracketed, `:port` only when set). */
export function canonicalHubName(name: HubName): string {
  return name.port === undefined ? name.host : `${name.host}:${name.port}`;
}

/** Hosts that are always valid for `canonicalOrigin` besides the configured names. */
export function builtInHubHosts(): string[] {
  return ['localhost', '127.0.0.1', '::1', os.hostname().toLowerCase()];
}

export function defaultExposure(): HubExposureConfig {
  return { mode: 'private', names: [] };
}

function parseCanonicalOrigin(origin: string, names: readonly string[]): string {
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error(`Hub config "exposure.canonicalOrigin" "${origin}" is not a valid URL.`); }
  if (url.protocol !== 'https:') throw new Error('Hub config "exposure.canonicalOrigin" must be an https origin.');
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '' || /^https:\/\/[^/?#]*\/?$/.test(origin) === false) {
    throw new Error('Hub config "exposure.canonicalOrigin" must be https://name[:port] with no path, query or credentials.');
  }
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const known = new Set([...names.map((n) => normalizeHubName(n).host), ...builtInHubHosts()]);
  if (!known.has(host)) throw new Error(`Hub config "exposure.canonicalOrigin" host "${host}" must be one of "exposure.names" or a built-in name.`);
  return url.origin;
}

function parseExposure(raw: unknown): HubExposureConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Hub config "exposure" must be an object.');
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!EXPOSURE_KEYS.has(key)) throw new Error(`Hub config "exposure" has an unknown key "${key}".`);
  const exposure = defaultExposure();
  if (record['mode'] !== undefined) {
    const mode = record['mode'];
    if (typeof mode !== 'string' || !EXPOSURE_MODES.includes(mode as HubExposureMode)) throw new Error(`Hub config "exposure.mode" must be one of ${EXPOSURE_MODES.join(', ')}.`);
    exposure.mode = mode as HubExposureMode;
  }
  if (record['names'] !== undefined) {
    const names = record['names'];
    if (!Array.isArray(names)) throw new Error('Hub config "exposure.names" must be an array of strings.');
    const unique = new Set<string>();
    for (const entry of names) {
      if (typeof entry !== 'string') throw new Error('Hub config "exposure.names" must be an array of strings.');
      unique.add(canonicalHubName(normalizeHubName(entry)));
    }
    if (unique.size > MAX_EXPOSURE_NAMES) throw new Error(`Hub config "exposure.names" allows at most ${MAX_EXPOSURE_NAMES} names.`);
    exposure.names = [...unique];
  }
  if (record['canonicalOrigin'] !== undefined) {
    const origin = record['canonicalOrigin'];
    if (typeof origin !== 'string') throw new Error('Hub config "exposure.canonicalOrigin" must be a string.');
    exposure.canonicalOrigin = parseCanonicalOrigin(origin, exposure.names);
  }
  return exposure;
}

/** A message when this config may not start (public exposure is reserved for Phase 31F), else null. */
export function exposureRefusal(config: Pick<HubConfig, 'exposure'>): string | null {
  return config.exposure.mode === 'public' ? 'Public exposure is not released until Phase 31F: set "exposure.mode" to "private" in hub.json.' : null;
}

export function defaultHubConfig(): HubConfig {
  return { port: HUB_DEFAULT_PORT, bind: 'loopback', exposure: defaultExposure() };
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
  if (record['exposure'] !== undefined) config.exposure = parseExposure(record['exposure']);
  return config;
}

/** Atomic write: temp file in the same directory, then rename. The default `exposure` is omitted to keep files minimal. */
export function writeHubConfig(file: string, config: HubConfig): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  const { exposure, ...rest } = config;
  const isDefault = exposure.mode === 'private' && exposure.names.length === 0 && exposure.canonicalOrigin === undefined;
  writeFileSync(tmp, JSON.stringify(isDefault ? rest : { ...rest, exposure }, null, 2) + '\n');
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

export type HubNameChange = { add: string } | { remove: string };

/** Applies an add/remove to `exposure.names`. Returns the same array instance when nothing changes; throws on invalid input. */
export function applyHubNameChange(exposure: HubExposureConfig, change: HubNameChange): string[] {
  const adding = 'add' in change;
  const parsed = normalizeHubName(adding ? change.add : change.remove);
  const name = canonicalHubName(parsed);
  const previous = exposure.names;
  if (adding) {
    if (previous.includes(name)) return previous;
    if (previous.length >= MAX_EXPOSURE_NAMES) throw new Error(`At most ${MAX_EXPOSURE_NAMES} names can be configured.`);
    return [...previous, name];
  }
  if (!previous.includes(name)) throw new Error(`${name} is not a configured name.`);
  const names = previous.filter((n) => n !== name);
  const originHost = exposure.canonicalOrigin === undefined ? undefined : new URL(exposure.canonicalOrigin).hostname.replace(/^\[|\]$/g, '');
  if (originHost !== undefined && originHost === parsed.host && !names.some((n) => normalizeHubName(n).host === parsed.host)) {
    throw new Error('That name is used by exposure.canonicalOrigin. Change canonicalOrigin first.');
  }
  return names;
}
