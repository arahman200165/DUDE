import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Opt-in: builds/uses the real single-executable application. Run with DUDE_TEST_SEA=1.
const root = path.resolve(import.meta.dirname, '..', '..', '..', '..');
const exe = path.join(root, 'dist', 'hub', process.platform === 'win32' ? 'dude-hub.exe' : 'dude-hub');

function get(url: string, cert: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    // The certificate is pinned as the only trust anchor; the hostname check is skipped because it is an IP literal.
    const req = https.get(url, { ca: cert, checkServerIdentity: () => undefined }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on('error', reject);
  });
}

describe.skipIf(process.env.DUDE_TEST_SEA !== '1')('Hub single-executable application', () => {
  it('builds, self-tests and serves the hello contract over the pinned certificate', async () => {
    if (!existsSync(exe)) execFileSync(process.execPath, [path.join(root, 'scripts', 'build-hub-sea.mjs')], { stdio: 'inherit' });

    const version = execFileSync(exe, ['version'], { encoding: 'utf8' }).trim();
    expect(version.length).toBeGreaterThan(0);
    const selfTest = JSON.parse(execFileSync(exe, ['self-test'], { encoding: 'utf8' })) as { ok: boolean };
    expect(selfTest.ok).toBe(true);

    const dataDir = mkdtempSync(path.join(os.tmpdir(), 'dude-hub-sea-'));
    const child = spawn(exe, ['run', '--data-dir', dataDir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        let buffer = '';
        const timer = setTimeout(() => reject(new Error(`Hub did not start. stderr: ${stderr}`)), 20000);
        child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Hub exited with ${code}. stderr: ${stderr}`)); });
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (chunk: string) => {
          buffer += chunk;
          for (const line of buffer.split('\n')) {
            try {
              const parsed = JSON.parse(line) as { event?: string; url?: string };
              if (parsed.event === 'listening' && parsed.url) { clearTimeout(timer); resolve(parsed.url); return; }
            } catch { /* not the listening line */ }
          }
        });
      });
      const cert = readFileSync(path.join(dataDir, 'config', 'tls', 'cert.pem'), 'utf8');
      const hello = await get(`${url}/api/v1/hello`, cert);
      expect(hello.status).toBe(200);
      expect(JSON.parse(hello.body)).toMatchObject({ bootstrapped: false });
    } finally {
      child.removeAllListeners('exit');
      child.kill();
      await new Promise((resolve) => setTimeout(resolve, 500));
      try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* the OS may still hold the log file */ }
    }
    expect(stderr).not.toMatch(/ExperimentalWarning/);
  }, 120000);
});
