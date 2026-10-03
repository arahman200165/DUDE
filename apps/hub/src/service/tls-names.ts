import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { hubPaths } from '../config/data-dir.js';
import { applyHubNameChange, loadOrCreateHubConfig, writeHubConfig } from '../config/hub-config.js';
import { certificateSubjectAltNames, computeSubjectAltNames, missingSubjectAltNames } from '../tls/names.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';

export interface TlsNamesOptions { action: 'list' | 'add' | 'remove'; name?: string; dataDir?: string; installDir?: string }

export const TLS_NAMES_NEXT_STEPS =
  'The next certificate is staged and announced to connected devices. Run "dude-hub tls status" until no device is pending, then "dude-hub tls activate".\n';

/**
 * `dude-hub tls names list|add <name>|remove <name>`.
 * Installed service: elevated; the change goes through the admin channel (`tls.names.set`, audited), which edits `hub.json`,
 * stages a re-issued certificate through the dual-pin rotation and updates the running Host guard (no restart).
 * No Hub running: only the config file is edited (the database is the Hub's alone, so no certificate can be staged);
 * run `add` again once the Hub is up to stage it.
 */
export async function runTlsNames(options: TlsNamesOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const paths = hubPaths(dataRoot);

  if (options.action === 'list') {
    try {
      const config = existsSync(paths.configFile) ? loadOrCreateHubConfig(paths.configFile) : null;
      const certFile = path.join(paths.tlsDir, 'cert.pem');
      const cert = existsSync(certFile) ? readFileSync(certFile, 'utf8') : null;
      const wanted = config ? computeSubjectAltNames(config) : [];
      d.out(json({
        names: config?.exposure.names ?? [],
        canonicalOrigin: config?.exposure.canonicalOrigin ?? null,
        activeSubjectAltNames: cert ? certificateSubjectAltNames(cert) : null,
        missing: cert ? missingSubjectAltNames(cert, wanted) : [],
      }));
      return EXIT_OK;
    } catch (error) {
      d.err(`${(error as Error).message}\n`);
      return EXIT_FAILURE;
    }
  }

  if (options.name === undefined) {
    d.err(`Usage: dude-hub tls names ${options.action} <name>.\n`);
    return EXIT_USAGE;
  }
  const change = options.action === 'add' ? { add: options.name } : { remove: options.name };
  const state = await serviceState(d);
  const installed = state !== 'not-installed' && state !== 'unknown';
  if (installed) {
    const refused = await requireElevated(d, 'Changing the Hub names');
    if (refused !== null) return refused;
  }

  if ((await tryAdminStatus(d, dataRoot)) !== null) {
    try {
      const result = (await d.call(dataRoot, 'tls.names.set', change)) as { staged: unknown };
      d.out(json(result));
      if (result.staged) d.err(TLS_NAMES_NEXT_STEPS);
      else d.err('The certificate already covers these names; nothing was staged.\n');
      return EXIT_OK;
    } catch (error) {
      d.err(`${(error as Error).message}\n`);
      return EXIT_FAILURE;
    }
  }

  // No running Hub: edit the config directly (it is service-owned, so only while nothing else can write it).
  try {
    const config = loadOrCreateHubConfig(paths.configFile);
    const names = applyHubNameChange(config.exposure, change);
    if (names !== config.exposure.names) writeHubConfig(paths.configFile, { ...config, exposure: { ...config.exposure, names } });
    d.out(json({ names, staged: null, changed: names !== config.exposure.names }));
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
  d.err(
    'The Hub is not running, so the names were written to its config directly and are not audited; no certificate was staged. ' +
      (options.action === 'add'
        ? `Start the Hub, then run "dude-hub tls names add ${options.name}" again to stage a certificate that covers it.\n`
        : 'Start the Hub, then run "dude-hub tls rotate" to stage a certificate without it.\n'),
  );
  return EXIT_OK;
}
