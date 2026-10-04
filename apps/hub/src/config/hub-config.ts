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
  /** Reverse-proxy mode (PD-058): only `trusted` peers may supply forwarded client address, host and protocol. */
  proxy?: HubProxyConfig;
  /** ACME (RFC 8555) certificate source (31F). Absent means not configured. */
  acme?: HubAcmeConfig;
}

export interface HubAcmeConfig {
  /** `https://` ACME directory (plain http only for a loopback test CA). */
  directoryUrl: string;
  /** Optional account contact. */
  email?: string;
  /** Port of the http-01 responder, bound only during an order (default 80). */
  httpPort?: number;
  /** When the operator agreed to the CA's terms (ISO). Set only by an issuance run with `--agree-tos`. */
  termsAgreedAt?: string;
}

export const DEFAULT_ACME_HTTP_PORT = 80;
export const LETS_ENCRYPT_DIRECTORY = 'https://acme-v02.api.letsencrypt.org/directory';
export const LETS_ENCRYPT_STAGING_DIRECTORY = 'https://acme-staging-v02.api.letsencrypt.org/directory';

export interface HubProxyConfig {
  /** 1 to 16 IP literals or CIDRs of the proxy hop(s) allowed to set `X-Forwarded-*` (one hop is trusted). */
  trusted: string[];
  /** `https://name[:port]`, the externally visible origin. Its host is one of `exposure.names`. */
  publicOrigin: string;
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
const EXPOSURE_KEYS = new Set(['mode', 'names', 'canonicalOrigin', 'proxy', 'acme']);
const ACME_KEYS = new Set(['directoryUrl', 'email', 'httpPort', 'termsAgreedAt']);
const PROXY_KEYS = new Set(['trusted', 'publicOrigin']);
export const MAX_TRUSTED_PROXIES = 16;
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

function parseOriginText(origin: string, key: string): string {
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error(`Hub config "${key}" "${origin}" is not a valid URL.`); }
  if (url.protocol !== 'https:') throw new Error(`Hub config "${key}" must be an https origin.`);
  if ((url.pathname !== '/' && url.pathname !== '') || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '' || /^https:\/\/[^/?#]*\/?$/.test(origin) === false) {
    throw new Error(`Hub config "${key}" must be https://name[:port] with no path, query or credentials.`);
  }
  return url.origin;
}

function parseCanonicalOrigin(origin: string, names: readonly string[]): string {
  const normalized = parseOriginText(origin, 'exposure.canonicalOrigin');
  const url = new URL(normalized);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const known = new Set([...names.map((n) => normalizeHubName(n).host), ...builtInHubHosts()]);
  if (!known.has(host)) throw new Error(`Hub config "exposure.canonicalOrigin" host "${host}" must be one of "exposure.names" or a built-in name.`);
  return url.origin;
}

/** Normalizes one trusted-proxy entry (IP literal or CIDR). The whole address space (prefix 0) is refused. */
export function normalizeTrustedProxy(raw: string): string {
  if (typeof raw !== 'string') throw new Error('A trusted proxy must be a string.');
  const text = raw.trim().toLowerCase();
  const slash = text.indexOf('/');
  const address = slash < 0 ? text : text.slice(0, slash);
  const family = isIPv4(address) ? 4 : isIPv6(address) ? 6 : 0;
  if (family === 0) throw new Error(`Trusted proxy "${raw}" is not an IP address or CIDR.`);
  if (slash < 0) return address;
  const prefixText = text.slice(slash + 1);
  const prefix = Number(prefixText);
  const max = family === 4 ? 32 : 128;
  if (!/^[0-9]{1,3}$/.test(prefixText) || prefix > max) throw new Error(`Trusted proxy "${raw}" has an invalid prefix length.`);
  if (prefix === 0) throw new Error(`Trusted proxy "${raw}" would trust every address; use a specific proxy address or network.`);
  return `${address}/${prefix}`;
}

function parseProxy(raw: unknown, names: readonly string[]): HubProxyConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Hub config "exposure.proxy" must be an object.');
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!PROXY_KEYS.has(key)) throw new Error(`Hub config "exposure.proxy" has an unknown key "${key}".`);
  const trusted = record['trusted'];
  if (!Array.isArray(trusted) || trusted.length < 1 || trusted.length > MAX_TRUSTED_PROXIES || trusted.some((t) => typeof t !== 'string')) {
    throw new Error(`Hub config "exposure.proxy.trusted" must be an array of 1 to ${MAX_TRUSTED_PROXIES} IP addresses or CIDRs.`);
  }
  const normalized = [...new Set((trusted as string[]).map(normalizeTrustedProxy))];
  const origin = record['publicOrigin'];
  if (typeof origin !== 'string') throw new Error('Hub config "exposure.proxy.publicOrigin" must be a string.');
  const publicOrigin = parseOriginText(origin, 'exposure.proxy.publicOrigin');
  const host = new URL(publicOrigin).hostname.replace(/^\[|\]$/g, '');
  if (!names.some((n) => normalizeHubName(n).host === host)) throw new Error(`Hub config "exposure.proxy.publicOrigin" host "${host}" must be one of "exposure.names".`);
  return { trusted: normalized, publicOrigin };
}

/** Validates an ACME directory URL: https, or http only on a loopback host (a local test CA). Returns the normalized URL. */
export function normalizeAcmeDirectoryUrl(raw: string, key = 'exposure.acme.directoryUrl'): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`Hub config "${key}" "${raw}" is not a valid URL.`); }
  const loopback = url.hostname === 'localhost' || url.hostname === '[::1]' || /^127(\.\d{1,3}){3}$/.test(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error(`Hub config "${key}" must be an https URL.`);
  if (url.username !== '' || url.password !== '' || url.hash !== '') throw new Error(`Hub config "${key}" must not contain credentials or a fragment.`);
  return url.toString();
}

export function normalizeAcmeConfig(raw: unknown): HubAcmeConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Hub config "exposure.acme" must be an object.');
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!ACME_KEYS.has(key)) throw new Error(`Hub config "exposure.acme" has an unknown key "${key}".`);
  if (typeof record['directoryUrl'] !== 'string') throw new Error('Hub config "exposure.acme.directoryUrl" must be a string.');
  const acme: HubAcmeConfig = { directoryUrl: normalizeAcmeDirectoryUrl(record['directoryUrl']) };
  if (record['email'] !== undefined) {
    const email = record['email'];
    if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('Hub config "exposure.acme.email" must be an email address.');
    acme.email = email;
  }
  if (record['httpPort'] !== undefined) {
    const port = record['httpPort'];
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Hub config "exposure.acme.httpPort" must be an integer from 1 to 65535.');
    acme.httpPort = port;
  }
  if (record['termsAgreedAt'] !== undefined) {
    const at = record['termsAgreedAt'];
    if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) throw new Error('Hub config "exposure.acme.termsAgreedAt" must be an ISO date string.');
    acme.termsAgreedAt = at;
  }
  return acme;
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
  if (record['proxy'] !== undefined) exposure.proxy = parseProxy(record['proxy'], exposure.names);
  if (record['acme'] !== undefined) exposure.acme = normalizeAcmeConfig(record['acme']);
  return exposure;
}

/** The environment variable that lets a Hub configured for public exposure start (unsupported until Phase 31F). */
export const UNRELEASED_PUBLIC_ENV = 'DUDE_HUB_UNRELEASED_PUBLIC';

/**
 * A message when this config may not start, else null. Public exposure is not released until Phase 31F (PD-057): it is
 * refused unless the environment variable `DUDE_HUB_UNRELEASED_PUBLIC=1` is set, so an installed service cannot come up
 * public just because the config file says so.
 */
export function exposureRefusal(config: Pick<HubConfig, 'exposure'>, env: NodeJS.ProcessEnv = process.env): string | null {
  if (config.exposure.mode !== 'public' || env[UNRELEASED_PUBLIC_ENV] === '1') return null;
  return (
    'Public exposure is not released until Phase 31F; the Hub will not start with "exposure.mode" set to "public". ' +
    `Run "dude-hub network mode private" (or set "exposure.mode" to "private" in hub.json). ` +
    `To start it anyway for testing, set ${UNRELEASED_PUBLIC_ENV}=1 in the Hub's environment; this is unsupported.`
  );
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
  const isDefault = exposure.mode === 'private' && exposure.names.length === 0 && exposure.canonicalOrigin === undefined && exposure.proxy === undefined && exposure.acme === undefined;
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

/**
 * The listen address. Reverse-proxy mode forces loopback (the proxy runs on this machine); container mode keeps
 * `0.0.0.0` because the proxy is outside the container (only the configured CIDRs are trusted either way).
 */
export function bindAddress(config: Pick<HubConfig, 'bind'> & { exposure?: Partial<HubExposureConfig> }): string {
  if (config.bind === 'container') return '0.0.0.0';
  if (config.exposure?.proxy !== undefined) return '127.0.0.1';
  return config.bind === 'loopback' ? '127.0.0.1' : '0.0.0.0';
}

/** Returns a validated copy of `config` with the reverse-proxy block set (its host joins `names`) or removed (`null`). */
export function applyProxyChange(config: HubConfig, change: { trusted: readonly string[]; publicOrigin: string } | null): HubConfig {
  const { proxy: _previous, ...exposure } = config.exposure;
  if (change === null) return parseHubConfig({ ...config, exposure });
  let host: string;
  try { host = new URL(change.publicOrigin).hostname.replace(/^\[|\]$/g, ''); } catch { throw new Error(`"${change.publicOrigin}" is not a valid URL.`); }
  const names = exposure.names.some((n) => normalizeHubName(n).host === host) ? exposure.names : [...exposure.names, host];
  const bind = config.bind === 'container' ? 'container' : 'loopback';
  return parseHubConfig({ ...config, bind, exposure: { ...exposure, names, proxy: { trusted: [...change.trusted], publicOrigin: change.publicOrigin } } });
}

/** The exposure read model reported by `status` and `network status` (and consumed by diagnostics). Never secrets. */
export interface ExposureReadModel {
  mode: HubExposureMode;
  bind: HubBindMode;
  port: number;
  names: string[];
  canonicalOrigin: string | null;
  proxy: { trustedCount: number; publicOrigin: string } | null;
  /** Whether `Strict-Transport-Security` is sent; null when it cannot be determined (no running Hub). */
  hsts: boolean | null;
}

export function exposureReadModel(config: HubConfig, running: { bind?: HubBindMode; port: number }, hsts: boolean | null): ExposureReadModel {
  return {
    mode: config.exposure.mode,
    bind: running.bind ?? config.bind,
    port: running.port,
    names: [...config.exposure.names],
    canonicalOrigin: config.exposure.proxy?.publicOrigin ?? config.exposure.canonicalOrigin ?? null,
    proxy: config.exposure.proxy ? { trustedCount: config.exposure.proxy.trusted.length, publicOrigin: config.exposure.proxy.publicOrigin } : null,
    hsts,
  };
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
