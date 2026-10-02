import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const SECRET_BYTES = 32;
export const SECRET_FILE = 'agent-pipe.key';
const MAX_UNIX_SOCKET_PATH = 100;

function endpointHash(storeDir: string): string {
  return createHash('sha256').update(path.resolve(storeDir).toLowerCase()).digest('hex').slice(0, 20);
}

/**
 * Where the Device Agent for `storeDir` listens. The store directory lives inside the user's profile
 * (`%APPDATA%`), so the derived name is per-user: two users on one machine have different store
 * directories and therefore different endpoints. On Windows this is a named pipe; on POSIX (Linux CI)
 * a Unix socket in the store directory, falling back to the temp directory when the path would
 * exceed the `sun_path` limit.
 */
export function agentEndpoint(storeDir: string, platform: NodeJS.Platform = process.platform): string {
  const hash = endpointHash(storeDir);
  if (platform === 'win32') return `\\\\.\\pipe\\dude-agent-${hash}`;
  const inStore = path.join(storeDir, 'agent.sock');
  return inStore.length > MAX_UNIX_SOCKET_PATH ? path.join(tmpdir(), `dude-agent-${hash}.sock`) : inStore;
}

export function agentSecretPath(storeDir: string): string {
  return path.join(storeDir, SECRET_FILE);
}

/** Reads the shared secret; throws `ENOENT` when the agent has not created it yet. */
export function readAgentSecret(storeDir: string): Buffer {
  const secret = readFileSync(agentSecretPath(storeDir));
  if (secret.length !== SECRET_BYTES) throw Object.assign(new Error('The agent pipe key is malformed.'), { code: 'EBADKEY' });
  return secret;
}

/** Agent side: creates the 32-byte secret (mode 0600; the profile ACL protects it on Windows) if missing or malformed. */
export function ensureAgentSecret(storeDir: string): Buffer {
  mkdirSync(storeDir, { recursive: true });
  const file = agentSecretPath(storeDir);
  let malformed = false;
  try {
    return readAgentSecret(storeDir);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EBADKEY') malformed = true;
    else if (code !== 'ENOENT') throw error;
  }
  const secret = randomBytes(SECRET_BYTES);
  try {
    writeFileSync(file, secret, { flag: malformed ? 'w' : 'wx', mode: 0o600 });
  } catch (error) {
    // Lost a creation race with another agent: use the winner's key.
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    return readAgentSecret(storeDir);
  }
  try { chmodSync(file, 0o600); } catch { /* best effort on Windows */ }
  return secret;
}
