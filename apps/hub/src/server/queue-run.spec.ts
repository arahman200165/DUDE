import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_API_PREFIX, HubJobsResponse, HubQueueStatusResponse } from '@dude/contracts/hub';
import { hubPaths } from '../config/data-dir.js';
import { createJobQueue } from '../queue/job-queue.js';
import { openSaveSphereDb } from '../savesphere-db/open.js';
import { request, tempDir, trustedPem } from './test-helpers.js';

const BUNDLE = path.resolve(import.meta.dirname, '../../../../dist/hub/dude-hub.cjs');

/**
 * The real `run` with a provisioned `savesphere.db` (32-SS1, Milestone 834): the queue runner starts, drains a queued job, queues
 * the scheduled blob verify and staging sweep, registers their job ids with a timer and reports into `GET /api/v1/jobs`; and
 * `GET /api/v1/queue` reads the same database.
 */
describe('dude-hub bundle with SaveSphere storage', () => {
  it('runs queued jobs, schedules the blob jobs and reports both through the owner routes', async () => {
    if (!existsSync(BUNDLE)) throw new Error(`Missing ${BUNDLE}. Run "npm run hub:compile" (pretest:hub does this).`);
    const dataDir = tempDir('hub-queue-run-');
    const paths = hubPaths(dataDir);
    const opened = openSaveSphereDb(paths);
    if (opened.status !== 'ready') throw new Error('expected ready');
    createJobQueue({ db: opened.store.db }).enqueue({ kind: 'noop.echo', payload: { hello: 'queue' } }).id;
    opened.store.close();

    const child = spawn(process.execPath, [BUNDLE, 'run', '--data-dir', dataDir, '--port', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
    let stdout = '';
    const listening = new Promise<{ url: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Hub did not start. Output: ${stdout}`)), 20000);
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
        for (const line of stdout.split('\n')) {
          try {
            const parsed = JSON.parse(line) as { event?: string; url: string };
            if (parsed.event === 'listening') { clearTimeout(timer); resolve(parsed); }
          } catch { /* not the listening line */ }
        }
      });
    });
    try {
      const info = await listening;
      const certPem = trustedPem(paths.tlsDir);
      const port = Number(new URL(info.url).port);
      const origin = { origin: `https://localhost:${port}`, host: `localhost:${port}`, 'content-type': 'application/json' };
      const setupToken = readFileSync(path.join(paths.configDir, 'setup-token'), 'utf8').trim();
      const password = 'a very long bundle password';
      const boot = await request(port, certPem, `${HUB_API_PREFIX}/bootstrap`, { method: 'POST', headers: origin, body: JSON.stringify({ setupToken, ownerDisplayName: 'Ada', environmentName: 'Home', password }) });
      expect(boot.status, boot.body).toBe(201);
      const signIn = await request(port, certPem, `${HUB_API_PREFIX}/auth/sign-in`, { method: 'POST', headers: origin, body: JSON.stringify({ password }) });
      const setCookie = signIn.headers['set-cookie'];
      const cookie = /__Host-dude_session=[^;]*/.exec(Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie))?.[0];
      expect(cookie).toBeDefined();
      const get = async (route: string): Promise<unknown> => {
        const res = await request(port, certPem, `${HUB_API_PREFIX}${route}`, { headers: { cookie: cookie!, host: origin.host } });
        expect(res.status, res.body).toBe(200);
        return JSON.parse(res.body) as unknown;
      };

      // The echo job plus the two scheduled blob jobs all finish.
      let queue: HubQueueStatusResponse | undefined;
      for (let i = 0; i < 100; i += 1) {
        queue = (await get('/queue')) as HubQueueStatusResponse;
        if (queue.counts.succeeded >= 3) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(Value.Check(HubQueueStatusResponse, queue)).toBe(true);
      expect(queue).toMatchObject({ available: true, counts: { queued: 0, running: 0, succeeded: 3, failed: 0, dead: 0 } });
      expect(queue!.kinds.map((k) => k.kind)).toEqual(['blobs.staging-sweep', 'blobs.verify', 'noop.echo']);

      const jobs = (await get('/jobs')) as HubJobsResponse;
      expect(Value.Check(HubJobsResponse, jobs)).toBe(true);
      const byId = (id: string) => jobs.jobs.find((j) => j.id === id)!;
      expect(byId('queue-runner')).toMatchObject({ intervalMs: 60_000, lastOutcome: 'success' });
      expect(byId('blobs-verify')).toMatchObject({ intervalMs: 6 * 3600_000, lastOutcome: 'success', lastSummary: 'Checked 0 attachments; all intact.' });
      expect(byId('blobs-staging-sweep')).toMatchObject({ intervalMs: 24 * 3600_000, lastOutcome: 'success', lastSummary: 'No abandoned upload files.' });
    } finally {
      child.kill();
    }
    await exited;
  }, 60_000);

  it('serves the job worker mode from the real bundle (no production worker kinds yet, so any kind is refused as not retryable)', async () => {
    if (!existsSync(BUNDLE)) throw new Error(`Missing ${BUNDLE}. Run "npm run hub:compile" (pretest:hub does this).`);
    const child = spawn(process.execPath, [BUNDLE, '--internal-worker', 'job'], { stdio: ['pipe', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString('utf8'); });
    const exited = new Promise<number | null>((resolve) => child.on('close', (code) => resolve(code)));
    child.stdin.write(`${JSON.stringify({ type: 'run', id: 'j1', kind: 'noop.echo', payload: {}, attempt: 1 })}
`);
    expect(await exited).toBe(2);
    expect(JSON.parse(out.trim())).toMatchObject({ type: 'result', id: 'j1', ok: false, retryable: false });
  });
});
