import { execFile } from 'node:child_process';

export type ExecFn = (file: string, args: readonly string[], options: { windowsHide: boolean; timeout: number; shell: false }) => Promise<string>;

const GUID = /MachineGuid\s+REG_SZ\s+([0-9A-Fa-f]{8}(?:-[0-9A-Fa-f]{4}){3}-[0-9A-Fa-f]{12})/;

/** Parses `reg query ... /v MachineGuid` output. Exported for specs. */
export function parseMachineGuid(output: string): string | null {
  const match = GUID.exec(output);
  return match ? match[1].toLowerCase() : null;
}

const defaultExec: ExecFn = (file, args, options) => new Promise((resolve, reject) => {
  execFile(file, [...args], { ...options, encoding: 'utf8', maxBuffer: 64 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(stdout)));
});

/**
 * The Windows MachineGuid, used (salted and hashed by the state service) to detect a cloned store.
 * Any failure, or a non-Windows platform, yields null: the store then simply skips clone detection.
 */
export async function readMachineGuid(exec: ExecFn = defaultExec, platform: string = process.platform): Promise<string | null> {
  if (platform !== 'win32') return null;
  try {
    const out = await exec('reg.exe', ['query', 'HKLM\SOFTWARE\Microsoft\Cryptography', '/v', 'MachineGuid'], { shell: false, windowsHide: true, timeout: 2000 });
    return parseMachineGuid(out);
  } catch {
    return null;
  }
}
