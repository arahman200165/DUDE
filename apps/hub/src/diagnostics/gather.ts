import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '@dude/sqlite-store';
import { bindAddress, defaultHubConfig, loadOrCreateHubConfig } from '../config/hub-config.js';
import type { HubConfig } from '../config/hub-config.js';
import { describeCertificateSource, localCaStatus } from '../tls/ca-public.js';
import type { TlsCertificateSource } from '../tls/ca-public.js';
import { computeSubjectAltNames } from '../tls/names.js';
import { firewallRuleExists, serviceState } from '../service/common.js';
import type { ExecFn } from '../service/common.js';
import { readAddressRecord } from './address-watch.js';
import { readReachability } from './reachability.js';
import type { InterfaceMap, NameResolution } from './addresses.js';
import type { DiagnosticsCertificateFacts, DiagnosticsDeps, DiagnosticsHostFacts } from './engine.js';

/** Firewall and service facts shell out (`netsh`, `sc.exe`); the route and admin method share one cache so a request never does. */
export const HOST_FACTS_TTL_MS = 60_000;

export interface HostFactsOptions {
  exec: ExecFn;
  platform?: NodeJS.Platform;
  now?: () => number;
  ttlMs?: number;
}

/** Cached `serviceState` + firewall-rule lookups (60 s). Failures resolve to unknown (`firewallPresent: null`), never throw. */
export function createHostFacts(options: HostFactsOptions): () => Promise<DiagnosticsHostFacts> {
  const platform = options.platform ?? process.platform;
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? HOST_FACTS_TTL_MS;
  let cached: { at: number; facts: DiagnosticsHostFacts } | null = null;
  let inflight: Promise<DiagnosticsHostFacts> | null = null;
  return () => {
    if (cached !== null && now() - cached.at < ttl) return Promise.resolve(cached.facts);
    inflight ??= (async (): Promise<DiagnosticsHostFacts> => {
      try {
        if (platform !== 'win32') return { firewallPresent: null };
        const state = await serviceState({ exec: options.exec, platform });
        // `netsh show rule` exits non-zero both for "no rule" and for an unreadable store; only a zero exit is a positive fact.
        const present = await firewallRuleExists(options.exec);
        return { serviceState: state, firewallPresent: present };
      } catch {
        return { firewallPresent: null };
      } finally {
        inflight = null;
      }
    })().then((facts) => { cached = { at: now(), facts }; return facts; });
    return inflight;
  };
}

export const countCertificates = (pem: string): number => (pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length;

type ConfigLike = Pick<HubConfig, 'port'> & Partial<Pick<HubConfig, 'bind' | 'exposure'>>;

export function normalizeConfig(config: ConfigLike): DiagnosticsDeps['config'] & { bind: HubConfig['bind']; exposure: HubConfig['exposure'] } {
  const base = defaultHubConfig();
  const full: HubConfig = { ...base, ...config, bind: config.bind ?? base.bind, exposure: config.exposure ?? base.exposure };
  return { port: full.port, bind: full.bind, bindAddress: bindAddress(full), exposure: full.exposure };
}

/** The operator's on-disk config when present (it can be ahead of the running snapshot), else the snapshot. Never writes. */
export function currentConfig(configFile: string | undefined, snapshot: ConfigLike): HubConfig {
  if (configFile !== undefined && existsSync(configFile)) {
    try { return loadOrCreateHubConfig(configFile); } catch { /* fall through to the snapshot */ }
  }
  const base = defaultHubConfig();
  return { ...base, ...snapshot, bind: snapshot.bind ?? base.bind, exposure: snapshot.exposure ?? base.exposure };
}

/** Public certificate facts: source (recorded or derived), the local CA summary, and the staged pin. Never a key. */
export function certificateFacts(tlsDir: string, db: Db | null, hsts: boolean): DiagnosticsCertificateFacts | null {
  const certFile = path.join(tlsDir, 'cert.pem');
  if (!existsSync(certFile)) return null;
  let pem: string;
  try { pem = readFileSync(certFile, 'utf8'); } catch { return null; }
  let source: TlsCertificateSource = describeCertificateSource(tlsDir, pem).source;
  let nextSpkiSha256: string | null = null;
  let pendingAcks = 0;
  if (db !== null) {
    const active = db.prepare("SELECT source FROM tls_pins WHERE state = 'active' LIMIT 1").get() as { source: string } | undefined;
    if (active?.source === 'imported' || active?.source === 'acme') source = active.source;
    const next = db.prepare("SELECT spki_sha256 FROM tls_pins WHERE state = 'next' LIMIT 1").get() as { spki_sha256: string } | undefined;
    if (next) {
      nextSpkiSha256 = next.spki_sha256;
      const row = db.prepare(
        `SELECT COUNT(*) AS n FROM devices WHERE revoked_at IS NULL AND unenrolled_at IS NULL
         AND device_id NOT IN (SELECT device_id FROM tls_pin_acks WHERE spki_sha256 = ?)`,
      ).get(next.spki_sha256) as { n: number };
      pendingAcks = Number(row.n);
    }
  }
  let ca: DiagnosticsCertificateFacts['ca'] = null;
  try {
    const status = localCaStatus(tlsDir);
    if (status) ca = { fingerprintSha256: status.rootSha256, notAfter: status.notAfter, permitted: { dns: status.permittedDns, ip: status.permittedIps } };
  } catch { /* an unreadable CA is reported as absent */ }
  return { pem, source, nextSpkiSha256, pendingAcks, chainLength: countCertificates(pem), ca, hsts };
}

export function proxyPinFacts(db: Db): { active: string | null; next: string | null } {
  const pick = (state: string): string | null => {
    const row = db.prepare('SELECT spki_sha256 FROM tls_proxy_pins WHERE state = ? LIMIT 1').get(state) as { spki_sha256: string } | undefined;
    return row?.spki_sha256 ?? null;
  };
  return { active: pick('active'), next: pick('next') };
}

export function schemaVersionOf(db: Db): number {
  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  return row ? Number(row.value) || 0 : 0;
}

export interface RunningHubSource {
  db: Db;
  tlsDir: string;
  configFile?: string;
  /** The startup config snapshot. */
  config: ConfigLike;
  hubVersion: string;
  startedAt: number;
  now: () => number;
  /** The port actually listening (differs from the config when the config says 0). */
  getPort: () => number;
  hsts: () => boolean;
  realtime?: { connectionCounts(): { owner: number; device: number } };
  host: () => Promise<DiagnosticsHostFacts>;
  platform?: NodeJS.Platform;
  /** Cached DNS resolution (the route shares one 60 s cache); defaults to an uncached system resolver. */
  resolveDns?: (names: readonly string[]) => Promise<NameResolution[]>;
  interfaces?: () => InterfaceMap;
}

/** Facts from a running Hub: database, TLS files, on-disk configuration, realtime. */
export async function gatherRunningHubDeps(source: RunningHubSource): Promise<DiagnosticsDeps> {
  const wanted = currentConfig(source.configFile, source.config);
  const running = source.config;
  const bind = running.bind ?? wanted.bind;
  const host = await source.host().catch((): DiagnosticsHostFacts => ({ firewallPresent: null }));
  const platform = source.platform ?? process.platform;
  const counts = source.realtime?.connectionCounts() ?? { owner: 0, device: 0 };
  const now = source.now();
  return {
    now,
    hubVersion: source.hubVersion,
    running: true,
    serviceMode: bind === 'container' ? 'container' : host.serviceState === 'running' ? 'service' : 'foreground',
    uptimeSeconds: Math.max(0, Math.floor((now - source.startedAt) / 1000)),
    schemaVersion: schemaVersionOf(source.db),
    platform,
    config: { port: source.getPort() || wanted.port, bind, bindAddress: bindAddress({ bind, exposure: wanted.exposure }), exposure: wanted.exposure },
    wantedNames: computeSubjectAltNames({ bind: wanted.bind, exposure: wanted.exposure }),
    certificate: certificateFacts(source.tlsDir, source.db, source.hsts()),
    proxyPins: proxyPinFacts(source.db),
    ownerExists: source.db.prepare('SELECT 1 AS x FROM owner LIMIT 1').get() !== undefined,
    realtime: { available: source.realtime !== undefined, ...counts },
    host: () => Promise.resolve(host),
    storedAddresses: readAddressRecord(source.db)?.addresses ?? null,
    reachability: readReachability(source.db, now),
    ...(source.resolveDns ? { resolveDns: source.resolveDns } : {}),
    ...(source.interfaces ? { interfaces: source.interfaces } : {}),
  };
}

export interface OfflineSource {
  tlsDir: string;
  /** `config/hub.json`; the default configuration is used when it does not exist (it is never created here). */
  configFile: string;
  hubVersion: string;
  now: number;
  platform: NodeJS.Platform;
  host: () => Promise<DiagnosticsHostFacts>;
}

/** Facts for `dude-hub doctor` when no Hub answers: configuration and public certificate files only; no database. */
export function gatherOfflineDeps(source: OfflineSource): DiagnosticsDeps {
  const config = currentConfig(source.configFile, defaultHubConfig());
  const certificate = certificateFacts(source.tlsDir, null, false);
  if (certificate) certificate.hsts = config.exposure.proxy !== undefined || certificate.source !== 'self-signed';
  return {
    now: source.now,
    hubVersion: source.hubVersion,
    running: false,
    serviceMode: config.bind === 'container' ? 'container' : 'foreground',
    uptimeSeconds: 0,
    schemaVersion: 0,
    platform: source.platform,
    config: { port: config.port, bind: config.bind, bindAddress: bindAddress(config), exposure: config.exposure },
    wantedNames: computeSubjectAltNames({ bind: config.bind, exposure: config.exposure }),
    certificate,
    proxyPins: { active: null, next: null },
    ownerExists: null,
    realtime: { available: false, owner: 0, device: 0 },
    host: source.host,
  };
}
