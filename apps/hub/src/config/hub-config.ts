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
  /**
   * Managed Cloudflare Tunnel (32-SS1, Milestone 837, PD-143). Tunnel mode IS reverse-proxy mode with exactly one trusted hop, the
   * loopback `cloudflared` connector: `proxy.trusted` is `127.0.0.1`/`::1` only and `proxy.publicOrigin` is `https://<hostname>`.
   * It is written only by the elevated `network tunnel on|off` admin method, together with that proxy block.
   */
  tunnel?: HubTunnelConfig;
}

export interface HubTunnelConfig {
  /** The connector is started with the Hub. `off` removes the block altogether, so this is true whenever the block exists today. */
  enabled: boolean;
  /** The owner's bare public domain (no port, no `www.`); also `proxy.publicOrigin`'s host. */
  hostname: string;
}

/** The only peers a tunnel Hub trusts to supply forwarded headers: the local connector. Never a network, never a CIDR. */
export const TUNNEL_TRUSTED_PEERS = ['127.0.0.1', '::1'] as const;

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

/**
 * A scheduled backup. From 32-SS1 (Milestone 847) it is only the interval: each run goes to every configured destination with the
 * backup v2 engine, the key is the master key in the secret store (never here) and retention is the 7/4/6 policy pruned by the
 * two-step `backup prune`. `folder` and `retention` are the 31G fields: still accepted so an older `hub.json` keeps parsing, never
 * written again and never used by a run (the owner sets the schedule again once, with the passphrase, to move to v2).
 */
export interface HubBackupScheduleConfig {
  /** Hours between backups, 1 to 8760. */
  intervalHours: number;
  /** 31G only (read, never written): the folder the v1 schedule wrote to. */
  folder?: string;
  /** 31G only (read, never written): how many v1 files the old schedule kept. */
  retention?: number;
}

/** A backup v2 destination's non-secret definition (Milestone 847). Credentials of later kinds live only in the secret store. */
export interface HubBackupLocalFolderDestination {
  /** `^[a-z0-9][a-z0-9-]{0,31}$`, assigned by the Hub. */
  id: string;
  kind: 'local-folder';
  /** Display text, 1 to 64 characters. */
  label: string;
  /** Absolute folder holding the repository. */
  folder: string;
}

/**
 * An S3-compatible backup destination's non-secret definition (Milestone 848: AWS S3, Cloudflare R2, Backblaze B2 S3 API, MinIO).
 * The access key id, secret access key and optional session token are NEVER here: they live in the secret store (purpose
 * `backup.s3.credentials`, a JSON map keyed by destination id).
 */
export interface HubBackupS3Destination {
  /** `^[a-z0-9][a-z0-9-]{0,31}$`, assigned by the Hub. */
  id: string;
  kind: 's3';
  /** Display text, 1 to 64 characters. */
  label: string;
  /** `https://host[:port]` with no path, credentials, query or fragment; plain `http` only for a loopback host with `allowPrivateNetwork`. */
  endpoint: string;
  /** The SigV4 region (`us-east-1`, `auto` for R2, `eu-central-003` for B2). */
  region: string;
  bucket: string;
  /** Key prefix isolating this repository inside the bucket (no leading or trailing slash); absent means the bucket root. */
  prefix?: string;
  /** Path-style addressing (`host/bucket/key`); absent means virtual-hosted for `*.amazonaws.com` and path-style for every other endpoint. */
  forcePathStyle?: boolean;
  /** The owner explicitly allows an endpoint that resolves to a loopback or private (LAN) address, such as MinIO on the LAN. Never lifts the link-local and metadata refusal. */
  allowPrivateNetwork?: boolean;
}

/**
 * A Google Drive backup destination's non-secret definition (Milestone 856). The repository lives in ONE folder the Hub created
 * itself under the narrow `drive.file` scope (the app can see only files it created, never the owner's other Drive content). The
 * OAuth client secret and the refresh token are NEVER here: they live in the secret store (purpose `backup.drive.refreshToken`, a
 * JSON map keyed by destination id). The client id is public and is kept so a reconnect after a revocation reuses it.
 */
export interface HubBackupDriveDestination {
  /** `^[a-z0-9][a-z0-9-]{0,31}$`, assigned by the Hub. */
  id: string;
  kind: 'drive';
  /** Display text, 1 to 64 characters. */
  label: string;
  /** The Drive folder id (`[A-Za-z0-9_-]{10,128}`) of the folder this app created. */
  folderId: string;
  /** The owner's own OAuth client id (printable, no spaces, at most 256 characters). */
  clientId: string;
}

/**
 * A OneDrive backup destination's non-secret definition (Milestone 857). The repository lives in ONE folder the Hub created itself
 * inside its own app folder under the narrow `Files.ReadWrite.AppFolder` scope (the app can see only that app folder, never the
 * owner's other OneDrive content). The OAuth client secret and the refresh token are NEVER here: they live in the secret store (purpose
 * `backup.onedrive.refreshToken`, a JSON map keyed by destination id). The client id is public and is kept so a reconnect after a
 * revocation reuses it.
 */
export interface HubBackupOneDriveDestination {
  /** `^[a-z0-9][a-z0-9-]{0,31}$`, assigned by the Hub. */
  id: string;
  kind: 'onedrive';
  /** Display text, 1 to 64 characters. */
  label: string;
  /** The OneDrive item id (`[A-Za-z0-9_!.-]{10,200}`) of the folder this app created. */
  folderId: string;
  /** The owner's own app registration (client) id (printable, no spaces, at most 256 characters). */
  clientId: string;
}

export type HubBackupDestinationConfig = HubBackupLocalFolderDestination | HubBackupS3Destination | HubBackupDriveDestination | HubBackupOneDriveDestination;

export const DRIVE_FOLDER_ID_PATTERN = /^[A-Za-z0-9_-]{10,128}$/;
export const DRIVE_CLIENT_ID_PATTERN = /^[\x21-\x7e]{1,256}$/;
export const ONEDRIVE_FOLDER_ID_PATTERN = /^[A-Za-z0-9_!.-]{10,200}$/;
export const ONEDRIVE_CLIENT_ID_PATTERN = DRIVE_CLIENT_ID_PATTERN;

export interface HubBackupConfig {
  /** Absent means no scheduled backups. */
  schedule?: HubBackupScheduleConfig;
  /** Backup v2 destinations (at most `BACKUP_DESTINATIONS_MAX`); written only by the elevated `backup destination` commands. */
  destinations?: HubBackupDestinationConfig[];
}

export const BACKUP_DESTINATIONS_MAX = 8;
export const BACKUP_DESTINATION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * Google (or another OIDC provider) sign-in (32-SS1, Milestone 841, PD-121, PD-145). The owner brings their own OAuth client: the id
 * and redirect origin live here, the client secret only in the machine-bound secret store (purpose `oidc.clientSecret`, never in
 * `hub.json`, a backup or a log). Absent block means the feature is off and the password is the only sign-in.
 */
export interface HubOidcConfig {
  /** The provider's issuer identifier, exactly as its ID tokens carry it in `iss`; `https` only, no query or trailing slash. */
  issuer: string;
  /** The owner's OAuth client id (public). */
  clientId: string;
  /** The origin the provider redirects the browser back to: `https://<host>[:port]` (plain `http` only for a loopback host). */
  redirectOrigin: string;
}

export const DEFAULT_OIDC_ISSUER = 'https://accounts.google.com';

export interface HubConfig {
  port: number;
  bind: HubBindMode;
  webRoot?: string;
  exposure: HubExposureConfig;
  /** Backup settings (31G). Absent by default. */
  backup?: HubBackupConfig;
  /** OIDC sign-in (32-SS1). Absent means off; never restored from a backup (the restored Hub is a new instance, PD-145). */
  oidc?: HubOidcConfig;
}

export const BACKUP_INTERVAL_HOURS_MAX = 8760;
export const BACKUP_RETENTION_MAX = 1000;

export const MAX_EXPOSURE_NAMES = 32;
const BIND_MODES: readonly HubBindMode[] = ['loopback', 'lan', 'container'];
const EXPOSURE_MODES: readonly HubExposureMode[] = ['private', 'public'];
const KNOWN_KEYS = new Set(['port', 'bind', 'webRoot', 'exposure', 'backup', 'oidc']);
const OIDC_KEYS = new Set(['issuer', 'clientId', 'redirectOrigin']);
const BACKUP_KEYS = new Set(['schedule', 'destinations']);
const BACKUP_DESTINATION_KEYS = new Set(['id', 'kind', 'label', 'folder', 'endpoint', 'region', 'bucket', 'prefix', 'forcePathStyle', 'allowPrivateNetwork', 'folderId', 'clientId']);
const S3_ONLY_KEYS = ['endpoint', 'region', 'bucket', 'prefix', 'forcePathStyle', 'allowPrivateNetwork'] as const;
/** The keys a Google Drive and a OneDrive destination share (and no other kind accepts). */
const DRIVE_ONLY_KEYS = ['folderId', 'clientId'] as const;
const S3_REGION_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
const S3_BUCKET_PATTERN = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const S3_PREFIX_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
export const S3_PREFIX_MAX = 200;
const BACKUP_SCHEDULE_KEYS = new Set(['folder', 'intervalHours', 'retention']);
const EXPOSURE_KEYS = new Set(['mode', 'names', 'canonicalOrigin', 'proxy', 'acme', 'tunnel']);
const TUNNEL_KEYS = new Set(['enabled', 'hostname']);
/** Suffixes that can never be a public tunnel domain (no public CA or Cloudflare zone can hold them). */
const NON_PUBLIC_SUFFIX = /.(local|localhost|lan|internal|home|corp|test|invalid|example)$/;
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

/**
 * A tunnel hostname: a lowercase public-looking DNS name with at least two labels, no port, no IP literal and not `www.` (the bare
 * domain is canonical; `www` redirects to it). Returns the normalized name.
 */
export function normalizeTunnelHostname(raw: unknown, key = 'exposure.tunnel.hostname'): string {
  if (typeof raw !== 'string') throw new Error(`Hub config "${key}" must be a string.`);
  let name: HubName;
  try { name = normalizeHubName(raw); } catch (error) { throw new Error(`Hub config "${key}": ${(error as Error).message}`); }
  if (name.port !== undefined) throw new Error(`Hub config "${key}" must not include a port.`);
  const host = name.host;
  if (isIPv4(host) || isIPv6(host)) throw new Error(`Hub config "${key}" must be a DNS name, not an IP address.`);
  if (!host.includes('.') || NON_PUBLIC_SUFFIX.test(host) || host === 'localhost') throw new Error(`Hub config "${key}" must be a public DNS name such as notes.example.com.`);
  if (host.startsWith('www.')) throw new Error(`Hub config "${key}" must be the bare domain; www.<domain> redirects to it.`);
  return host;
}

function parseTunnel(raw: unknown, exposure: HubExposureConfig): HubTunnelConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Hub config "exposure.tunnel" must be an object.');
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!TUNNEL_KEYS.has(key)) throw new Error(`Hub config "exposure.tunnel" has an unknown key "${key}".`);
  if (typeof record['enabled'] !== 'boolean') throw new Error('Hub config "exposure.tunnel.enabled" must be true or false.');
  const hostname = normalizeTunnelHostname(record['hostname']);
  const proxy = exposure.proxy;
  if (proxy === undefined) throw new Error('Hub config "exposure.tunnel" requires "exposure.proxy" (tunnel mode is reverse-proxy mode with the loopback connector as the only trusted hop).');
  const loopback = new Set<string>(TUNNEL_TRUSTED_PEERS);
  if (proxy.trusted.length === 0 || !proxy.trusted.every((entry) => loopback.has(entry))) {
    throw new Error('Hub config "exposure.proxy.trusted" must be only 127.0.0.1 and ::1 in tunnel mode.');
  }
  if (new URL(proxy.publicOrigin).origin !== `https://${hostname}`) throw new Error('Hub config "exposure.proxy.publicOrigin" must be https://<exposure.tunnel.hostname> in tunnel mode.');
  return { enabled: record['enabled'], hostname };
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
  if (record['tunnel'] !== undefined) exposure.tunnel = parseTunnel(record['tunnel'], exposure);
  return exposure;
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Strict `oidc` block validation (see `HubOidcConfig`). Throws a clear message on anything else. */
export function parseOidcConfig(raw: unknown): HubOidcConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Hub config "oidc" must be an object.');
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!OIDC_KEYS.has(key)) throw new Error(`Hub config "oidc" has an unknown key "${key}".`);

  const issuerRaw = record['issuer'] ?? DEFAULT_OIDC_ISSUER;
  if (typeof issuerRaw !== 'string' || issuerRaw.length === 0 || issuerRaw.length > 256) throw new Error('Hub config "oidc.issuer" must be an https URL of at most 256 characters.');
  let issuerUrl: URL;
  try { issuerUrl = new URL(issuerRaw); } catch { throw new Error('Hub config "oidc.issuer" must be an https URL.'); }
  if (issuerUrl.protocol !== 'https:' || issuerUrl.username !== '' || issuerUrl.password !== '' || issuerUrl.search !== '' || issuerUrl.hash !== '' || issuerUrl.port !== '') {
    throw new Error('Hub config "oidc.issuer" must be an https URL with no credentials, port, query or fragment.');
  }
  if (isIPv4(issuerUrl.hostname) || issuerUrl.hostname.startsWith('[') || issuerUrl.hostname === 'localhost' || !issuerUrl.hostname.includes('.')) {
    throw new Error('Hub config "oidc.issuer" must name a public DNS host, not an IP address or a local name.');
  }
  const issuer = issuerUrl.origin + (issuerUrl.pathname === '/' ? '' : issuerUrl.pathname);
  if (issuer !== issuerRaw) throw new Error(`Hub config "oidc.issuer" must be written exactly as "${issuer}" (no trailing slash, lower-case host).`);

  const clientId = record['clientId'];
  if (typeof clientId !== 'string' || clientId.length === 0 || clientId.length > 256 || /[\s\u0000-\u001f\u007f]/.test(clientId)) {
    throw new Error('Hub config "oidc.clientId" must be a non-empty string of at most 256 characters without spaces.');
  }

  const redirectRaw = record['redirectOrigin'];
  if (typeof redirectRaw !== 'string' || redirectRaw.length === 0 || redirectRaw.length > 256) throw new Error('Hub config "oidc.redirectOrigin" must be an origin such as https://hub.example.com.');
  let redirectUrl: URL;
  try { redirectUrl = new URL(redirectRaw); } catch { throw new Error('Hub config "oidc.redirectOrigin" must be an origin such as https://hub.example.com.'); }
  if (redirectUrl.origin !== redirectRaw) throw new Error(`Hub config "oidc.redirectOrigin" must be an origin only, written exactly as "${redirectUrl.origin}".`);
  if (redirectUrl.protocol !== 'https:' && !(redirectUrl.protocol === 'http:' && LOOPBACK_HOSTS.has(redirectUrl.hostname))) {
    throw new Error('Hub config "oidc.redirectOrigin" must use https (plain http only for localhost, 127.0.0.1 or [::1]).');
  }
  return { issuer, clientId, redirectOrigin: redirectRaw };
}

function parseBackupSchedule(raw: unknown): HubBackupScheduleConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Hub config "backup.schedule" must be an object.');
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!BACKUP_SCHEDULE_KEYS.has(key)) throw new Error(`Hub config "backup.schedule" has an unknown key "${key}".`);
  const hours = record['intervalHours'];
  if (typeof hours !== 'number' || !Number.isInteger(hours) || hours < 1 || hours > BACKUP_INTERVAL_HOURS_MAX) {
    throw new Error(`Hub config "backup.schedule.intervalHours" must be an integer from 1 to ${BACKUP_INTERVAL_HOURS_MAX}.`);
  }
  const schedule: HubBackupScheduleConfig = { intervalHours: hours };
  const folder = record['folder'];
  if (folder !== undefined) {
    if (typeof folder !== 'string' || folder.length === 0 || !path.isAbsolute(folder)) throw new Error('Hub config "backup.schedule.folder" must be a non-empty absolute path.');
    schedule.folder = folder;
  }
  const retention = record['retention'];
  if (retention !== undefined) {
    if (typeof retention !== 'number' || !Number.isInteger(retention) || retention < 1 || retention > BACKUP_RETENTION_MAX) {
      throw new Error(`Hub config "backup.schedule.retention" must be an integer from 1 to ${BACKUP_RETENTION_MAX}.`);
    }
    schedule.retention = retention;
  }
  return schedule;
}

/** True for `localhost`, an IPv4 loopback literal or `[::1]` (the only hosts plain `http` may name). */
export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

/** The endpoint as `origin` (no trailing slash), or a message naming what is wrong. Never echoes the value. */
export function parseS3Endpoint(raw: unknown, allowPrivateNetwork: boolean): { origin: string } | { error: string } {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 253) return { error: 'must be a URL of at most 253 characters' };
  let url: URL;
  try { url = new URL(raw); } catch { return { error: 'must be an absolute URL' }; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'must be an https URL' };
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || (url.pathname !== '/' && url.pathname !== '')) return { error: 'must be only a scheme, host and optional port' };
  if (url.hostname.length === 0) return { error: 'must name a host' };
  if (url.protocol === 'http:' && !(isLoopbackHostname(url.hostname) && allowPrivateNetwork)) return { error: 'must use https (plain http is accepted only for a loopback host with allowPrivateNetwork)' };
  return { origin: url.origin };
}

/** A normalized S3 key prefix (`a/b`, no leading or trailing slash, safe segments) or an error. An empty prefix is the bucket root. */
export function parseS3Prefix(raw: unknown): { prefix: string | undefined } | { error: string } {
  if (raw === undefined || raw === '') return { prefix: undefined };
  if (typeof raw !== 'string' || raw.length > S3_PREFIX_MAX) return { error: `must be at most ${S3_PREFIX_MAX} characters` };
  const trimmed = raw.replace(/^\/+|\/+$/g, '');
  if (trimmed.length === 0) return { prefix: undefined };
  const segments = trimmed.split('/');
  if (!segments.every((segment) => S3_PREFIX_SEGMENT.test(segment))) return { error: 'must be slash-separated segments of letters, digits, dot, underscore and hyphen' };
  return { prefix: segments.join('/') };
}

function parseS3Destination(record: Record<string, unknown>, at: string, base: { id: string; label: string }): HubBackupS3Destination {
  const { endpoint, region, bucket, prefix, forcePathStyle, allowPrivateNetwork } = record;
  if (record['folder'] !== undefined) throw new Error(`${at}.folder is not allowed on an s3 destination.`);
  if (forcePathStyle !== undefined && typeof forcePathStyle !== 'boolean') throw new Error(`${at}.forcePathStyle must be true or false.`);
  if (allowPrivateNetwork !== undefined && typeof allowPrivateNetwork !== 'boolean') throw new Error(`${at}.allowPrivateNetwork must be true or false.`);
  const parsedEndpoint = parseS3Endpoint(endpoint, allowPrivateNetwork === true);
  if ('error' in parsedEndpoint) throw new Error(`${at}.endpoint ${parsedEndpoint.error}.`);
  if (typeof region !== 'string' || !S3_REGION_PATTERN.test(region)) throw new Error(`${at}.region must be 1 to 32 lower-case letters, digits or hyphens.`);
  if (typeof bucket !== 'string' || !S3_BUCKET_PATTERN.test(bucket)) throw new Error(`${at}.bucket must be 3 to 63 lower-case letters, digits, dots or hyphens.`);
  const parsedPrefix = parseS3Prefix(prefix);
  if ('error' in parsedPrefix) throw new Error(`${at}.prefix ${parsedPrefix.error}.`);
  const out: HubBackupS3Destination = { id: base.id, kind: 's3', label: base.label, endpoint: parsedEndpoint.origin, region, bucket };
  if (parsedPrefix.prefix !== undefined) out.prefix = parsedPrefix.prefix;
  if (forcePathStyle !== undefined) out.forcePathStyle = forcePathStyle;
  if (allowPrivateNetwork === true) out.allowPrivateNetwork = true;
  return out;
}

function parseDriveDestination(record: Record<string, unknown>, at: string, base: { id: string; label: string }): HubBackupDriveDestination {
  if (record['folder'] !== undefined) throw new Error(`${at}.folder is not allowed on a drive destination.`);
  for (const key of S3_ONLY_KEYS) if (record[key] !== undefined) throw new Error(`${at}.${key} is not allowed on a drive destination.`);
  const { folderId, clientId } = record;
  if (typeof folderId !== 'string' || !DRIVE_FOLDER_ID_PATTERN.test(folderId)) throw new Error(`${at}.folderId must be a Google Drive folder id.`);
  if (typeof clientId !== 'string' || !DRIVE_CLIENT_ID_PATTERN.test(clientId)) throw new Error(`${at}.clientId must be the OAuth client id (1 to 256 printable characters, no spaces).`);
  return { id: base.id, kind: 'drive', label: base.label, folderId, clientId };
}

function parseOneDriveDestination(record: Record<string, unknown>, at: string, base: { id: string; label: string }): HubBackupOneDriveDestination {
  if (record['folder'] !== undefined) throw new Error(`${at}.folder is not allowed on a onedrive destination.`);
  for (const key of S3_ONLY_KEYS) if (record[key] !== undefined) throw new Error(`${at}.${key} is not allowed on a onedrive destination.`);
  const { folderId, clientId } = record;
  if (typeof folderId !== 'string' || !ONEDRIVE_FOLDER_ID_PATTERN.test(folderId)) throw new Error(`${at}.folderId must be a OneDrive folder id.`);
  if (typeof clientId !== 'string' || !ONEDRIVE_CLIENT_ID_PATTERN.test(clientId)) throw new Error(`${at}.clientId must be the OAuth client id (1 to 256 printable characters, no spaces).`);
  return { id: base.id, kind: 'onedrive', label: base.label, folderId, clientId };
}

function parseBackupDestination(raw: unknown, index: number): HubBackupDestinationConfig {
  const at = `Hub config "backup.destinations[${index}]"`;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${at} must be an object.`);
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!BACKUP_DESTINATION_KEYS.has(key)) throw new Error(`${at} has an unknown key "${key}".`);
  const { id, kind, label, folder } = record;
  if (typeof id !== 'string' || !BACKUP_DESTINATION_ID_PATTERN.test(id)) throw new Error(`${at}.id must be 1 to 32 lower-case letters, digits or hyphens.`);
  if (kind !== 'local-folder' && kind !== 's3' && kind !== 'drive' && kind !== 'onedrive') throw new Error(`${at}.kind must be "local-folder", "s3", "drive" or "onedrive".`);
  if (typeof label !== 'string' || label.trim().length === 0 || label.length > 64 || /[\u0000-\u001f\u007f]/.test(label)) throw new Error(`${at}.label must be 1 to 64 printable characters.`);
  if (kind === 's3') {
    for (const key of DRIVE_ONLY_KEYS) if (record[key] !== undefined) throw new Error(`${at}.${key} is not allowed on an s3 destination.`);
    return parseS3Destination(record, at, { id, label });
  }
  if (kind === 'drive') return parseDriveDestination(record, at, { id, label });
  if (kind === 'onedrive') return parseOneDriveDestination(record, at, { id, label });
  for (const key of [...S3_ONLY_KEYS, ...DRIVE_ONLY_KEYS]) if (record[key] !== undefined) throw new Error(`${at}.${key} is not allowed on a local-folder destination.`);
  if (typeof folder !== 'string' || folder.length === 0 || !path.isAbsolute(folder)) throw new Error(`${at}.folder must be a non-empty absolute path.`);
  return { id, kind, label, folder };
}

function parseBackup(raw: unknown): HubBackupConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Hub config "backup" must be an object.');
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!BACKUP_KEYS.has(key)) throw new Error(`Hub config "backup" has an unknown key "${key}".`);
  const backup: HubBackupConfig = {};
  if (record['schedule'] !== undefined) backup.schedule = parseBackupSchedule(record['schedule']);
  if (record['destinations'] !== undefined) {
    const list = record['destinations'];
    if (!Array.isArray(list) || list.length > BACKUP_DESTINATIONS_MAX) throw new Error(`Hub config "backup.destinations" must be an array of at most ${BACKUP_DESTINATIONS_MAX} destinations.`);
    const destinations = list.map((entry, index) => parseBackupDestination(entry, index));
    if (new Set(destinations.map((d) => d.id)).size !== destinations.length) throw new Error('Hub config "backup.destinations" has a repeated id.');
    if (destinations.length > 0) backup.destinations = destinations;
  }
  return backup;
}

/** Returns a validated copy of `config` with the backup schedule set, or removed (`null`); destinations are kept. */
export function applyBackupScheduleChange(config: HubConfig, schedule: HubBackupScheduleConfig | null): HubConfig {
  return applyBackupConfigChange(config, { ...(config.backup ?? {}), schedule });
}

/**
 * Returns a validated copy of `config` with the backup block replaced: `schedule: null` removes the schedule, `destinations: []`
 * removes every destination, an omitted field is kept. An empty block is dropped.
 */
export function applyBackupConfigChange(config: HubConfig, change: { schedule?: HubBackupScheduleConfig | null; destinations?: HubBackupDestinationConfig[] }): HubConfig {
  const { backup: previous, ...rest } = config;
  const schedule = change.schedule === undefined ? previous?.schedule : change.schedule ?? undefined;
  const destinations = change.destinations === undefined ? previous?.destinations : change.destinations;
  const backup: Record<string, unknown> = {};
  if (schedule !== undefined) backup['schedule'] = schedule;
  if (destinations !== undefined && destinations.length > 0) backup['destinations'] = destinations;
  return parseHubConfig(Object.keys(backup).length === 0 ? rest : { ...rest, backup });
}

/**
 * A message when this config may not start, else null. Public exposure (PD-066) is released behind an elevated readiness gate at
 * the moment the mode is set, so a configured `public` mode starts. The one start-time refusal is a bind that cannot accept
 * inbound traffic: loopback without reverse-proxy mode. Certificate state never blocks start (an expired certificate must not turn
 * a renewal problem into an outage); diagnostics and alerts surface it.
 */
export function exposureRefusal(config: Pick<HubConfig, 'exposure' | 'bind'>): string | null {
  if (config.exposure.mode !== 'public') return null;
  if (config.bind !== 'loopback' || config.exposure.proxy !== undefined) return null;
  return (
    'The Hub is configured for public exposure but is bound to loopback without reverse-proxy mode, so it cannot accept Internet traffic. ' +
    'Run "dude-hub network lan on" to listen on the network, or "dude-hub network proxy on --trusted <cidr> --public-origin https://<name>" to sit behind a reverse proxy; ' +
    'or return to "dude-hub network mode private".'
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
  if (record['backup'] !== undefined) {
    const backup = parseBackup(record['backup']);
    if (backup.schedule !== undefined || backup.destinations !== undefined) config.backup = backup;
  }
  if (record['oidc'] !== undefined) config.oidc = parseOidcConfig(record['oidc']);
  return config;
}

/** Atomic write: temp file in the same directory, then rename. The default `exposure` is omitted to keep files minimal. */
export function writeHubConfig(file: string, config: HubConfig): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  const { exposure, ...rest } = config;
  const isDefault = exposure.mode === 'private' && exposure.names.length === 0 && exposure.canonicalOrigin === undefined && exposure.proxy === undefined && exposure.acme === undefined && exposure.tunnel === undefined;
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

/**
 * Returns a validated copy of `config` with tunnel mode on for `hostname` (its name joins `exposure.names`, the proxy block becomes
 * the loopback-only tunnel hop, the bind stays loopback) or off (`null`: the tunnel block and its proxy block are removed; a public
 * exposure mode that could no longer accept traffic returns to private). Refuses to replace an operator's own reverse proxy.
 */
export function applyTunnelChange(config: HubConfig, change: { hostname: string } | null): HubConfig {
  const { tunnel: previous, proxy: _proxy, ...exposure } = config.exposure;
  if (change === null) {
    if (previous === undefined) return config; // no tunnel: an operator's own proxy block is not ours to remove
    const mode: HubExposureMode = exposure.mode === 'public' && config.bind === 'loopback' ? 'private' : exposure.mode;
    return parseHubConfig({ ...config, exposure: { ...exposure, mode } });
  }
  if (previous === undefined && config.exposure.proxy !== undefined) throw new Error('A reverse proxy is already configured; turn it off first ("dude-hub network proxy off").');
  const hostname = normalizeTunnelHostname(change.hostname, 'hostname');
  const names = exposure.names.some((n) => normalizeHubName(n).host === hostname) ? exposure.names : [...exposure.names, hostname];
  const bind = config.bind === 'container' ? 'container' : 'loopback';
  return parseHubConfig({
    ...config, bind,
    exposure: { ...exposure, names, proxy: { trusted: [...TUNNEL_TRUSTED_PEERS], publicOrigin: `https://${hostname}` }, tunnel: { enabled: true, hostname } },
  });
}

/** Sets (or replaces) the `oidc` block; the strict block validation runs again through `parseHubConfig`. */
export function applyOidcChange(config: HubConfig, oidc: HubOidcConfig): HubConfig {
  return parseHubConfig({ ...config, oidc: parseOidcConfig(oidc) });
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
