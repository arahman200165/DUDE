import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { bootstrapOwner } from './sync-helpers';

const root = path.resolve(__dirname, '../..');
const HUB_BUNDLE = path.join(root, 'dist', 'hub', 'dude-hub.cjs');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(npm, ['run', script], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`npm run ${script} exited with ${code}`))));
  });
}

/**
 * Starts one Hub (no web root: the Hub web UI is not part of this suite) on an ephemeral port with a fresh data dir
 * and bootstraps its owner through the API. Exposes the same `HUB_E2E_*` variables as `e2e/hub/global-setup.ts`
 * so the Node-side helpers of that suite work unchanged.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  if (!existsSync(HUB_BUNDLE)) await run('hub:compile');
  for (const required of ['dist/electron/main.js', 'dist/electron/device-agent.js', 'dist/dude/browser/index.html']) {
    if (!existsSync(path.join(root, required))) throw new Error(`${required} is missing; run: npm run test:e2e:sync (builds the desktop renderer and Electron).`);
  }
  const indexHtml = readFileSync(path.join(root, 'dist/dude/browser/index.html'), 'utf8');
  if (!indexHtml.includes('<base href="/">')) throw new Error('dist/dude/browser was not built for desktop; run: ng build --configuration production,electron');

  const dataDir = mkdtempSync(path.join(tmpdir(), 'dude-sync-e2e-hub-'));
  const hub: ChildProcess = spawn(process.execPath, [HUB_BUNDLE, 'run', '--data-dir', dataDir, '--port', '0'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
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
  process.env['HUB_E2E_PORT'] = port;
  process.env['HUB_E2E_URL'] = `https://localhost:${port}`;
  process.env['HUB_E2E_DATA_DIR'] = dataDir;
  process.env['HUB_E2E_CERT'] = readFileSync(path.join(dataDir, 'config', 'tls', 'cert.pem'), 'utf8');
  process.env['HUB_E2E_SPKI'] = listening.spkiSha256;
  await bootstrapOwner();

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
