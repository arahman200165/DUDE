import { spawnSync } from 'node:child_process';

/**
 * Protects the local CA private key at rest. Only the admin-pipe CA commands and the renewal job may call `unprotect`;
 * request handlers never import this module (enforced by `local-ca.spec.ts`).
 */
export interface CaKeyProtector {
  readonly kind: 'dpapi' | 'file';
  /** File name under `<tlsDir>/ca/` that holds the protected key. */
  readonly keyFile: string;
  protect(plain: Buffer): Buffer;
  unprotect(blob: Buffer): Buffer;
}

/** Runs an external program synchronously with `input` on stdin; returns stdout. Throws without echoing stdin. */
export type SyncExec = (file: string, args: readonly string[], input: string) => string;

export const defaultSyncExec: SyncExec = (file, args, input) => {
  const result = spawnSync(file, [...args], { input, encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.error) throw new Error(`Could not run ${file}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${file} exited with code ${String(result.status)}: ${String(result.stderr ?? '').trim().slice(0, 300)}`);
  return String(result.stdout ?? '');
};

/** DPAPI entropy; fixed so a copied `ca-key.dpapi` is bound to this machine AND to DUDE's CA format version. */
export const DPAPI_ENTROPY = 'DUDE Hub CA v1';

function dpapiScript(op: 'Protect' | 'Unprotect'): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName System.Security',
    '$data = [Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
    `$entropy = [System.Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')`,
    `$out = [System.Security.Cryptography.ProtectedData]::${op}($data, $entropy, [System.Security.Cryptography.DataProtectionScope]::LocalMachine)`,
    '[Console]::Out.Write([Convert]::ToBase64String($out))',
  ].join('; ');
}

/** Windows DPAPI, LocalMachine scope (the service account and an elevated admin can both read it). */
export function createDpapiProtector(exec: SyncExec = defaultSyncExec): CaKeyProtector {
  const run = (op: 'Protect' | 'Unprotect', data: Buffer): Buffer =>
    Buffer.from(exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', dpapiScript(op)], data.toString('base64')).trim(), 'base64');
  return { kind: 'dpapi', keyFile: 'ca-key.dpapi', protect: (plain) => run('Protect', plain), unprotect: (blob) => run('Unprotect', blob) };
}

/** Linux/Docker: the key is stored as PEM with mode 0600. File-permission protection only. */
export function createFileProtector(): CaKeyProtector {
  return { kind: 'file', keyFile: 'ca-key.pem', protect: (plain) => plain, unprotect: (blob) => blob };
}

export function defaultCaKeyProtector(platform: NodeJS.Platform = process.platform): CaKeyProtector {
  return platform === 'win32' ? createDpapiProtector() : createFileProtector();
}
