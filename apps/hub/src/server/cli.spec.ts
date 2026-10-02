import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_API_PREFIX, HelloResponse } from '@dude/contracts/hub';
import { parseArgs } from '../cli/args.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { request, tempDir } from './test-helpers.js';

const BUNDLE = path.resolve(import.meta.dirname, '../../../../dist/hub/dude-hub.cjs');

describe('parseArgs', () => {
  it('parses run flags and rejects bad input', () => {
    expect(parseArgs(['run', '--data-dir', 'd', '--port', '0', '--bind=lan', '--web-root', 'w'])).toEqual({
      command: 'run', dataDir: 'd', port: 0, bind: 'lan', webRoot: 'w',
    });
    expect(parseArgs(['version'])).toEqual({ command: 'version' });
    expect(parseArgs([])).toEqual({ command: 'help' });
    expect(() => parseArgs(['run', '--port', 'x'])).toThrow();
    expect(() => parseArgs(['run', '--bind', 'wan'])).toThrow();
    expect(() => parseArgs(['run', '--nope'])).toThrow();
    expect(() => parseArgs(['serve'])).toThrow();
  });
});

describe('dude-hub bundle', () => {
  it('starts, answers hello over pinned HTTPS, stops, and leaves a database that reopens', async () => {
    if (!existsSync(BUNDLE)) throw new Error(`Missing ${BUNDLE}. Run "npm run hub:compile" (pretest:hub does this).`);
    const dataDir = tempDir('hub-cli-');
    const child = spawn(process.execPath, [BUNDLE, 'run', '--data-dir', dataDir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
    let stdout = '';
    const listening = new Promise<{ url: string; spkiSha256: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Hub did not start. Output: ${stdout}`)), 20000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        for (const line of stdout.split('\n')) {
          try {
            const parsed = JSON.parse(line) as { event?: string; url: string; spkiSha256: string };
            if (parsed.event === 'listening') { clearTimeout(timer); resolve(parsed); }
          } catch { /* not the listening line */ }
        }
      });
    });
    try {
      const info = await listening;
      const certPem = readFileSync(path.join(hubPaths(dataDir).tlsDir, 'cert.pem'), 'utf8');
      const port = Number(new URL(info.url).port);
      const res = await request(port, certPem, `${HUB_API_PREFIX}/hello`);
      expect(res.status).toBe(200);
      const hello: unknown = JSON.parse(res.body);
      expect(Value.Check(HelloResponse, hello)).toBe(true);
      expect((hello as HelloResponse).tls.spkiSha256).toBe(info.spkiSha256);
    } finally {
      // On Windows kill() terminates without running the graceful handler; elsewhere it sends SIGTERM.
      child.kill();
    }
    const code = await exited;
    if (process.platform !== 'win32') expect(code).toBe(0);
    const paths = hubPaths(dataDir);
    const reopened = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    expect(reopened.status).toBe('ready');
    if (reopened.status === 'ready') reopened.hub.close();
  });
});
