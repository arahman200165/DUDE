import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';

const root = path.resolve(__dirname, '../..');
const HUB_BUNDLE = path.join(root, 'dist', 'hub', 'dude-hub.cjs');
const WEB_ROOT = path.join(root, 'dist', 'hub-web', 'browser');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, ['run', script], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm run ${script} exited with ${code}`))));
  });
}

/** Builds anything missing, starts one Hub on an ephemeral port with a fresh data dir, and returns the teardown. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(path.join(WEB_ROOT, 'index.html'))) await run('build:hub-web');
  if (!existsSync(HUB_BUNDLE)) await run('hub:compile');

  const dataDir = mkdtempSync(path.join(tmpdir(), 'dude-hub-e2e-'));
  const hub: ChildProcess = spawn(process.execPath, [HUB_BUNDLE, 'run', '--data-dir', dataDir, '--port', '0', '--web-root', WEB_ROOT], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  hub.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

  const listening = await new Promise<{ url: string; spkiSha256: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`The Hub did not start within 60 s. ${stderr}`)), 60_000);
    hub.on('exit', (code) => reject(new Error(`The Hub exited early with ${code}. ${stderr}`)));
    createInterface({ input: hub.stdout! }).on('line', (line) => {
      try {
        const parsed = JSON.parse(line) as { event?: string; url?: string; spkiSha256?: string };
        if (parsed.event === 'listening' && parsed.url && parsed.spkiSha256) {
          clearTimeout(timer);
          resolve({ url: parsed.url, spkiSha256: parsed.spkiSha256 });
        }
      } catch {
        // Not a JSON line (log output).
      }
    });
  });

  const port = new URL(listening.url).port;
  const certFile = path.join(dataDir, 'config', 'tls', 'cert.pem');
  process.env['HUB_E2E_PORT'] = port;
  process.env['HUB_E2E_URL'] = `https://localhost:${port}`;
  process.env['HUB_E2E_DATA_DIR'] = dataDir;
  // A new Hub issues its leaf from a local CA (PD-058): trust the leaf and, when present, the root.
  const rootFile = path.join(dataDir, 'config', 'tls', 'ca', 'ca-cert.pem');
  process.env['HUB_E2E_CERT'] = readFileSync(path.join(dataDir, 'config', 'tls', 'cert.pem'), 'utf8') + (existsSync(rootFile) ? readFileSync(rootFile, 'utf8') : '');
  process.env['HUB_E2E_SPKI'] = listening.spkiSha256;

  return async () => {
    hub.removeAllListeners('exit');
    await new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        hub.kill('SIGKILL');
        resolve();
      }, 10_000);
      hub.once('exit', () => {
        clearTimeout(force);
        resolve();
      });
      hub.kill('SIGTERM');
    });
    try {
      rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      // A leftover temp directory is harmless.
    }
  };
}
