import { X509Certificate } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { hubPaths } from '../config/data-dir.js';
import { localCaStatus, readCaCertPem } from '../tls/ca-public.js';
import { validateCaSuffixes } from '../tls/local-ca.js';
import { EXIT_FAILURE, EXIT_OK, EXIT_USAGE, json, requireElevated, resolveDeps, serviceDataDir, serviceState, tryAdminStatus } from './common.js';
import type { ServiceDeps } from './common.js';

export interface TlsCaOptions {
  action: 'init' | 'status' | 'export';
  suffixes?: readonly string[];
  out?: string;
  dataDir?: string;
  installDir?: string;
  /** Default export directory (default: the current directory). */
  cwd?: string;
}

export const TLS_CA_NEXT_STEPS =
  'A CA-issued certificate with a new key is staged and announced to connected devices. Run "dude-hub tls status" until no device is pending, then "dude-hub tls activate".\n' +
  'Then trust the root once on each machine whose browser should accept the Hub: "dude-hub tls ca export".\n';

/**
 * `dude-hub tls ca init|status|export`.
 * `init` (installed service: elevated) goes through the admin channel (`tls.ca.init`, audited): it creates the CA when absent and STAGES a
 * CA-issued leaf with a new key through the dual-pin rotation; activate it with `tls activate`. A running Hub is required (the hub instance
 * id, the audit log and the pin table are the Hub's). `status` and `export` read public files only and never touch the CA key.
 */
export async function runTlsCa(options: TlsCaOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const paths = hubPaths(dataRoot);

  if (options.action === 'status') {
    try {
      const status = localCaStatus(paths.tlsDir);
      d.out(json(status ?? { localCa: false, hint: 'This Hub has no local CA. Run "dude-hub tls ca init" to opt in.' }));
      return EXIT_OK;
    } catch (error) {
      d.err(`${(error as Error).message}\n`);
      return EXIT_FAILURE;
    }
  }

  if (options.action === 'export') {
    const pem = readCaCertPem(paths.tlsDir);
    if (pem === null) {
      d.err('This Hub has no local CA. Run "dude-hub tls ca init" first.\n');
      return EXIT_FAILURE;
    }
    const file = path.resolve(options.cwd ?? process.cwd(), options.out ?? 'dude-hub-root.cer');
    try {
      writeFileSync(file, new X509Certificate(pem).raw);
    } catch (error) {
      d.err(`Could not write ${file}: ${(error as Error).message}\n`);
      return EXIT_FAILURE;
    }
    d.out(`Wrote the DUDE Hub root certificate (public, DER) to ${file}\n\n`);
    d.out('Trust it for the current Windows user (no elevation):\n');
    d.out(`  certutil -user -addstore Root "${file}"\n\n`);
    d.out('Firefox, macOS, Linux and other browsers keep their own stores: import this .cer as a trusted root (authority) there.\n');
    d.out('The root is restricted by name constraints to private names and addresses; it cannot vouch for public websites.\n');
    return EXIT_OK;
  }

  const suffixes = options.suffixes ?? [];
  try {
    validateCaSuffixes(suffixes);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const state = await serviceState(d);
  if (state !== 'not-installed' && state !== 'unknown') {
    const refused = await requireElevated(d, 'Creating the local CA');
    if (refused !== null) return refused;
  }
  if ((await tryAdminStatus(d, dataRoot)) === null) {
    d.err('The Hub is not running. Start it (service or "dude-hub run"), then run "dude-hub tls ca init" again.\n');
    return EXIT_USAGE;
  }
  try {
    d.out(json(await d.call(dataRoot, 'tls.ca.init', { suffixes })));
    d.err(TLS_CA_NEXT_STEPS);
    return EXIT_OK;
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}
