import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_API_PREFIX, HUB_JOB_IDS, HelloResponse, HubJobsResponse } from '@dude/contracts/hub';
import { parseArgs } from '../cli/args.js';
import { hubPaths } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import { BACKUP_SCHEDULER_CHECK_MS } from '../backup/scheduler.js';
import { request, tempDir, trustedPem } from './test-helpers.js';

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
  // The real `run` (not a test server): every closed job id has a timer registered by create-server or run (no orphan id in the Jobs
  // card, PD-112), and the release bundle ignores a test knob (PD-068), so the scheduled-backup check keeps its 10-minute period.
  it('starts, answers hello over pinned HTTPS, registers every job, ignores test knobs, stops, and leaves a database that reopens', async () => {
    if (!existsSync(BUNDLE)) throw new Error(`Missing ${BUNDLE}. Run "npm run hub:compile" (pretest:hub does this).`);
    const dataDir = tempDir('hub-cli-');
    const child = spawn(process.execPath, [BUNDLE, 'run', '--data-dir', dataDir, '--port', '0'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, DUDE_HUB_TEST_BACKUP_CHECK_MS: '1000', DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS: '1' },
    });
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
      const certPem = trustedPem(hubPaths(dataDir).tlsDir);
      const port = Number(new URL(info.url).port);
      const res = await request(port, certPem, `${HUB_API_PREFIX}/hello`);
      expect(res.status).toBe(200);
      const hello: unknown = JSON.parse(res.body);
      expect(Value.Check(HelloResponse, hello)).toBe(true);
      expect((hello as HelloResponse).tls.spkiSha256).toBe(info.spkiSha256);

      const origin = { origin: `https://localhost:${port}`, host: `localhost:${port}`, 'content-type': 'application/json' };
      const setupToken = readFileSync(path.join(hubPaths(dataDir).configDir, 'setup-token'), 'utf8').trim();
      const password = 'a very long bundle password';
      const boot = await request(port, certPem, `${HUB_API_PREFIX}/bootstrap`, {
        method: 'POST', headers: origin, body: JSON.stringify({ setupToken, ownerDisplayName: 'Ada', environmentName: 'Home', password }),
      });
      expect(boot.status, boot.body).toBe(201);
      const signIn = await request(port, certPem, `${HUB_API_PREFIX}/auth/sign-in`, { method: 'POST', headers: origin, body: JSON.stringify({ password }) });
      expect(signIn.status, signIn.body).toBe(200);
      const setCookie = signIn.headers['set-cookie'];
      const cookie = /__Host-dude_session=[^;]*/.exec(Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie))?.[0];
      expect(cookie).toBeDefined();
      const jobs = await request(port, certPem, `${HUB_API_PREFIX}/jobs`, { headers: { cookie: cookie!, host: origin.host } });
      expect(jobs.status, jobs.body).toBe(200);
      const parsed: unknown = JSON.parse(jobs.body);
      expect(Value.Check(HubJobsResponse, parsed)).toBe(true);
      const list = (parsed as HubJobsResponse).jobs;
      expect(list.map((j) => j.id)).toEqual([...HUB_JOB_IDS]);
      for (const job of list) expect(job.intervalMs, `${job.id} has no registered timer`).toBeGreaterThan(0);
      expect(list.find((j) => j.id === 'backup-schedule')?.intervalMs).toBe(BACKUP_SCHEDULER_CHECK_MS);
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
