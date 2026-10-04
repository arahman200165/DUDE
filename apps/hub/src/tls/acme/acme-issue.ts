import { generateKeyPairSync } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { isIP } from 'node:net';
import { applyHubNameChange, loadOrCreateHubConfig, normalizeAcmeDirectoryUrl, writeHubConfig } from '../../config/hub-config.js';
import type { HubAcmeConfig } from '../../config/hub-config.js';
import type { CaKeyProtector } from '../ca-key-protector.js';
import { ImportError, validateImport } from '../import.js';
import type { TlsRotation } from '../rotation.js';
import { loadOrCreateAcmeAccountKey } from './account-key.js';
import { AcmeError, createAcmeClient } from './acme-client.js';
import type { AcmeClientOptions } from './acme-client.js';
import { buildCsr } from './csr.js';
import { createHttp01Listener } from './http01-listener.js';
import type { Http01Listener } from './http01-listener.js';

/**
 * ACME issuance for the Hub (31F). Key-use boundary: this module and the renewal job are the only users of the ACME account key.
 * The http-01 listener is bound ONLY for the duration of one order (start before the challenge, stop in `finally`).
 */
export const ACME_MAX_NAMES = 8;
const LOCAL_SUFFIXES = ['.local', '.internal', '.lan', '.home.arpa', '.localhost', '.localdomain'] as const;
const DNS_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export type AcmeIssueErrorCode = 'bad-request' | 'refused' | 'conflict' | 'busy' | 'port-unavailable' | 'failed';

export class AcmeIssueError extends Error {
  constructor(readonly code: AcmeIssueErrorCode, message: string, readonly problem?: string) {
    super(message);
  }
}

export type AcmeAuditSink = (event: 'tls.acme-issued' | 'tls.acme-failed', outcome: 'success' | 'failure', detail: Record<string, unknown>) => void;

export type Http01ListenerFactory = (port: number) => Http01Listener;

/** Lowercases and validates the names an ACME order may carry. Public CAs issue only for public DNS names. */
export function validateAcmeNames(raw: readonly string[]): string[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new AcmeIssueError('bad-request', 'Provide at least one DNS name.');
  const names: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') throw new AcmeIssueError('bad-request', 'Names must be strings.');
    const name = entry.trim().toLowerCase();
    if (name.length === 0) throw new AcmeIssueError('bad-request', 'A name must not be empty.');
    if (name.includes('*')) throw new AcmeIssueError('bad-request', `"${entry}" is a wildcard; wildcards need DNS-01, which the Hub does not implement.`);
    if (isIP(name.replace(/^\[|\]$/g, '')) !== 0) throw new AcmeIssueError('bad-request', `"${entry}" is an IP address; certificate authorities issue for DNS names here.`);
    if (name.length > 253 || name.endsWith('.') || !name.split('.').every((label) => DNS_LABEL.test(label))) throw new AcmeIssueError('bad-request', `"${entry}" is not a valid DNS name.`);
    if (!name.includes('.')) throw new AcmeIssueError('bad-request', `"${entry}" is a single-label name; use a fully qualified public DNS name.`);
    if (name === 'localhost' || LOCAL_SUFFIXES.some((suffix) => name.endsWith(suffix))) {
      throw new AcmeIssueError('bad-request', `"${entry}" is a local name; a public CA cannot issue for it.`);
    }
    if (!names.includes(name)) names.push(name);
  }
  if (names.length > ACME_MAX_NAMES) throw new AcmeIssueError('bad-request', `At most ${ACME_MAX_NAMES} names per certificate.`);
  return names;
}

let ordering = false;
/** Whether an ACME order (and so the port-80 listener) is currently in progress in this process. */
export const acmeOrderInProgress = (): boolean => ordering;

export interface AcmeOrderInput {
  names: string[];
  directoryUrl: string;
  email?: string;
  httpPort: number;
  tlsDir: string;
  protector: CaKeyProtector;
  /** The key the certificate is for (a fresh key for issuance, the active key for a renewal). */
  leafKey: KeyObject;
  fetchImpl?: typeof fetch;
  listenerFactory?: Http01ListenerFactory;
  clientOptions?: Partial<AcmeClientOptions>;
  /** Called once the account is registered (before the order). */
  onAccountReady?: () => void;
}

/** One order: binds the http-01 listener, registers (or finds) the account, orders and returns the chain PEM. */
export async function orderAcmeChain(input: AcmeOrderInput): Promise<{ chainPem: string; notAfter?: string }> {
  if (ordering) throw new AcmeIssueError('busy', 'An ACME order is already in progress.');
  ordering = true;
  const listener = (input.listenerFactory ?? ((port) => createHttp01Listener({ port })))(input.httpPort);
  try {
    try {
      await listener.start();
    } catch (error) {
      throw new AcmeIssueError(
        'port-unavailable',
        `Could not listen on port ${input.httpPort} for the ACME http-01 challenge (${(error as Error).message}). Port ${input.httpPort === 80 ? '80' : `${input.httpPort} (forwarded from port 80)`} must be reachable from the Internet for the CA, and nothing else may be using it.`,
        'dude:port-unavailable',
      );
    }
    const { key: accountKey } = loadOrCreateAcmeAccountKey(input.tlsDir, input.protector);
    const client = createAcmeClient({
      directoryUrl: input.directoryUrl, accountKey, ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}), ...input.clientOptions,
    });
    await client.ensureAccount({ ...(input.email !== undefined ? { contactEmail: input.email } : {}), termsOfServiceAgreed: true });
    input.onAccountReady?.();
    const result = await client.issue({
      names: input.names,
      csrDer: buildCsr({ names: input.names, key: input.leafKey }).der,
      onChallenge: (c) => listener.set(c.token, c.keyAuthorization),
      onChallengeDone: (c) => listener.remove(c.token),
    });
    return { chainPem: result.chainPem, ...(result.notAfter !== undefined ? { notAfter: result.notAfter } : {}) };
  } finally {
    try { await listener.stop(); } finally { ordering = false; }
  }
}

/** Audit detail for a failure: the ACME problem type and a short detail, never secrets. */
export function failureDetail(error: unknown): { problem: string; detail: string } {
  if (error instanceof AcmeError) return { problem: error.type, detail: error.detail.slice(0, 200) };
  if (error instanceof AcmeIssueError) return { problem: error.problem ?? `dude:${error.code}`, detail: error.message.slice(0, 200) };
  return { problem: 'dude:error', detail: (error instanceof Error ? error.message : 'unknown error').slice(0, 200) };
}

export const directoryHost = (directoryUrl: string): string => new URL(directoryUrl).host;

export interface IssueAcmeOptions {
  names: readonly string[];
  directoryUrl: string;
  email?: string;
  /** Must be true: the operator accepts the CA's terms. Nothing is sent to the CA otherwise. */
  agreeTos: boolean;
  httpPort: number;
  tlsDir: string;
  rotation: TlsRotation;
  protector: CaKeyProtector;
  audit: AcmeAuditSink;
  /** `hub.json`: the issued names join `exposure.names` and the `exposure.acme` block is recorded. */
  configFile?: string;
  /** Told the new operator names after the config was written (the running Host guard picks them up). */
  onNamesChanged?: (names: readonly string[]) => void;
  fetchImpl?: typeof fetch;
  listenerFactory?: Http01ListenerFactory;
  clientOptions?: Partial<AcmeClientOptions>;
  now?: () => number;
}

export interface IssueAcmeResult { spkiSha256: string; notAfter: string; names: string[]; source: 'acme'; directoryHost: string }

/**
 * Orders a certificate for `names` with a FRESH leaf key and STAGES it (source `acme`) through the dual-pin rotation; the
 * operator activates it with `tls activate` once devices acknowledged. Refuses before any ACME request unless `agreeTos`.
 */
export async function issueAcmeCertificate(options: IssueAcmeOptions): Promise<IssueAcmeResult> {
  const now = options.now ?? Date.now;
  const names = validateAcmeNames(options.names);
  let directoryUrl: string;
  try { directoryUrl = normalizeAcmeDirectoryUrl(options.directoryUrl, 'directoryUrl'); } catch (error) { throw new AcmeIssueError('bad-request', (error as Error).message); }
  if (options.agreeTos !== true) {
    throw new AcmeIssueError('refused', `Issuing needs your agreement to the certificate authority's terms of service. Read them at ${directoryHost(directoryUrl)} and re-run with --agree-tos.`);
  }
  if (!Number.isInteger(options.httpPort) || options.httpPort < 1 || options.httpPort > 65535) throw new AcmeIssueError('bad-request', 'httpPort must be an integer from 1 to 65535.');
  if (options.rotation.status().next) throw new AcmeIssueError('conflict', 'A next certificate is already staged. Run "dude-hub tls activate" first.');

  // Dry-run the config change so a name-limit problem is found before the CA is contacted.
  const config = options.configFile ? loadOrCreateHubConfig(options.configFile) : null;
  let mergedNames: string[] | null = null;
  if (config) {
    try {
      let merged = config.exposure.names;
      for (const name of names) merged = applyHubNameChange({ ...config.exposure, names: merged }, { add: name });
      mergedNames = merged;
    } catch (error) { throw new AcmeIssueError('bad-request', (error as Error).message); }
  }
  const persistAcme = (): void => {
    if (!options.configFile || !config) return;
    const current = loadOrCreateHubConfig(options.configFile);
    const acme: HubAcmeConfig = {
      directoryUrl,
      ...(options.email !== undefined ? { email: options.email } : current.exposure.acme?.email !== undefined ? { email: current.exposure.acme.email } : {}),
      ...(options.httpPort !== 80 ? { httpPort: options.httpPort } : {}),
      termsAgreedAt: current.exposure.acme?.termsAgreedAt ?? new Date(now()).toISOString(),
    };
    writeHubConfig(options.configFile, { ...current, exposure: { ...current.exposure, acme } });
  };

  const leafKey = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  const base = { names, directoryHost: directoryHost(directoryUrl) };
  try {
    const order = await orderAcmeChain({
      names, directoryUrl, ...(options.email !== undefined ? { email: options.email } : {}), httpPort: options.httpPort, tlsDir: options.tlsDir,
      protector: options.protector, leafKey, ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
      ...(options.listenerFactory ? { listenerFactory: options.listenerFactory } : {}), ...(options.clientOptions ? { clientOptions: options.clientOptions } : {}),
      onAccountReady: persistAcme,
    });
    const valid = validateImport({
      certPem: order.chainPem, keyPem: leafKey.export({ type: 'pkcs8', format: 'pem' }).toString(), requiredNames: names, now: now(),
    });
    const staged = options.rotation.stageExternal({ keyPem: valid.keyPem, certChainPem: valid.certChainPem, source: 'acme' });
    if (options.configFile && mergedNames) {
      const current = loadOrCreateHubConfig(options.configFile);
      const changed = mergedNames.some((n) => !current.exposure.names.includes(n));
      if (changed) {
        const nextNames = [...current.exposure.names, ...mergedNames.filter((n) => !current.exposure.names.includes(n))];
        writeHubConfig(options.configFile, { ...current, exposure: { ...current.exposure, names: nextNames } });
        options.onNamesChanged?.(nextNames);
      }
    }
    options.audit('tls.acme-issued', 'success', { ...base, notAfter: valid.notAfter, spki: staged.spkiSha256 });
    return { spkiSha256: staged.spkiSha256, notAfter: valid.notAfter, names, source: 'acme', directoryHost: base.directoryHost };
  } catch (error) {
    // A conflict raised while staging (a pin appeared meanwhile) is the operator's, not the CA's, failure but is still recorded.
    if (!(error instanceof AcmeIssueError && error.code === 'busy')) options.audit('tls.acme-failed', 'failure', { ...base, ...failureDetail(error) });
    if (error instanceof AcmeError) throw new AcmeIssueError('failed', error.message, error.type);
    if (error instanceof ImportError) throw new AcmeIssueError('failed', `The issued certificate was rejected: ${error.message}`);
    throw error;
  }
}
