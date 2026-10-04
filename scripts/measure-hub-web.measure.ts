/* Hub-served web measurements; run through scripts/measure-hub-web.mjs. Records numbers, asserts nothing about them. */
import { generateKeyPairSync, randomBytes, randomUUID, sign } from 'node:crypto';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { performance as clock } from 'node:perf_hooks';
import { brotliCompressSync, constants as zc } from 'node:zlib';
import { chromium } from 'playwright';
import type { BrowserContext, Page } from 'playwright';
import { it } from 'vitest';
import { createHubClient } from '@dude/api-client';
import { HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, deviceAuthMessage, enrollMessage, parsePairingString } from '@dude/contracts/hub';
import type { SyncOp } from '@dude/contracts/hub';
import { SYNC_LIMITS } from '@dude/sync';
import { createPinnedTransport, spkiSha256Of } from '../apps/device-agent/src/hub/pinned-transport.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const BUNDLE = path.join(ROOT, 'dist', 'hub', 'dude-hub.cjs');
const WEB_ROOT = path.join(ROOT, 'dist', 'hub-web', 'browser');
const PASSWORD = 'correct horse battery staple';
const log = (m: string): void => { process.stderr.write(`[measure-hub-web] ${m}\n`); };
const r2 = (n: number): number => Math.round(n * 100) / 100;
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function summarize(samples: number[]): { runs: number; medianMs: number; p95Ms: number; minMs: number; maxMs: number } {
  const s = [...samples].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))]!;
  return { runs: s.length, medianMs: r2(at(0.5)), p95Ms: r2(at(0.95)), minMs: r2(s[0]!), maxMs: r2(s.at(-1)!) };
}
const median = (xs: number[]): number => summarize(xs).medianMs;

// --- 1. Build sizes ----------------------------------------------------------------------------------------------------

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
const brotliSize = (file: string): number => {
  const br = `${file}.br`;
  if (existsSync(br)) return statSync(br).size;
  return brotliCompressSync(readFileSync(file), { params: { [zc.BROTLI_PARAM_QUALITY]: 11 } }).length;
};

function buildSizes(): Record<string, unknown> {
  const html = readFileSync(path.join(WEB_ROOT, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]!);
  const preloads = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1]!);
  const styles = [...new Set([...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]!))];
  const initialJs = [...new Set([...scripts, ...preloads])];
  const sizeOf = (files: string[]): { files: string[]; raw: number; brotli: number } => ({
    files,
    raw: files.reduce((a, f) => a + statSync(path.join(WEB_ROOT, f)).size, 0),
    brotli: files.reduce((a, f) => a + brotliSize(path.join(WEB_ROOT, f)), 0),
  });
  const all = walk(WEB_ROOT).filter((f) => f.endsWith('.js') || f.endsWith('.mjs'));
  const chunks = all.filter((f) => path.basename(f).startsWith('chunk-'));
  const ngsw = JSON.parse(readFileSync(path.join(WEB_ROOT, 'ngsw.json'), 'utf8')) as { assetGroups: { name: string; installMode: string; urls: string[] }[] };
  const group = ngsw.assetGroups.find((g) => g.name === 'app')!;
  const groupFiles = group.urls.filter((u) => existsSync(path.join(WEB_ROOT, u)));
  const groupSize = sizeOf(groupFiles.map((u) => u.replace(/^\//, '')));
  const js = sizeOf(initialJs);
  const css = sizeOf(styles);
  return {
    initialJs: js,
    initialCss: css,
    initialTotal: { raw: js.raw + css.raw, brotli: js.brotli + css.brotli },
    totalJs: { files: all.length, raw: all.reduce((a, f) => a + statSync(f).size, 0), brotli: all.reduce((a, f) => a + brotliSize(f), 0) },
    lazyChunks: { count: chunks.length, raw: chunks.reduce((a, f) => a + statSync(f).size, 0), brotli: chunks.reduce((a, f) => a + brotliSize(f), 0) },
    precompressedBrFilesPresent: existsSync(path.join(WEB_ROOT, `${initialJs[0]}.br`)),
    serviceWorkerAppGroup: { installMode: group.installMode, urls: group.urls.length, raw: groupSize.raw, brotli: groupSize.brotli, files: group.urls },
  };
}

// --- Hub process -------------------------------------------------------------------------------------------------------

interface Hub { child: ChildProcess; port: number; dir: string; ca: string; cert: string; spkiBase64: string }
const dirs: string[] = [];
const procs: ChildProcess[] = [];

async function startHub(): Promise<Hub> {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'dude-measure-hubweb-'));
  dirs.push(dir);
  const child = spawn(process.execPath, [BUNDLE, 'run', '--data-dir', dir, '--port', '0', '--web-root', WEB_ROOT], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, DUDE_HUB_TEST_RELAX_RATE_LIMITS: '1' },
  });
  procs.push(child);
  let out = '';
  child.stderr?.on('data', (c: Buffer) => { out += c.toString(); });
  const listening = await new Promise<{ port: number; spki: string }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Hub did not start: ${out}`)), 60_000);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Hub exited (${code}): ${out}`)); });
    let buf = '';
    child.stdout?.on('data', (c: Buffer) => {
      buf += c.toString();
      for (const line of buf.split('\n')) {
        try {
          const p = JSON.parse(line) as { event?: string; url?: string; spkiSha256?: string };
          if (p.event === 'listening' && p.url && p.spkiSha256) { clearTimeout(timer); resolve({ port: Number(new URL(p.url).port), spki: p.spkiSha256 }); }
        } catch { /* not the listening line */ }
      }
    });
  });
  child.removeAllListeners('exit');
  const cert = readFileSync(path.join(dir, 'config', 'tls', 'cert.pem'), 'utf8');
  const rootFile = path.join(dir, 'config', 'tls', 'ca', 'ca-cert.pem');
  return { child, port: listening.port, dir, cert, ca: cert + (existsSync(rootFile) ? readFileSync(rootFile, 'utf8') : ''), spkiBase64: Buffer.from(listening.spki, 'base64url').toString('base64') };
}

async function stopHub(hub: Hub): Promise<void> {
  if (hub.child.exitCode !== null) return;
  const exited = new Promise<void>((resolve) => hub.child.once('exit', () => resolve()));
  hub.child.kill();
  await Promise.race([exited, sleep(10_000)]);
}

// --- Simulated device (Ed25519, pinned transport) ------------------------------------------------------------------------

type Api = ReturnType<typeof createHubClient>;
class Sim {
  readonly deviceId = randomUUID();
  private token = '';
  private tokenAt = 0;
  private readonly key = generateKeyPairSync('ed25519');
  private readonly pub = (this.key.publicKey.export({ format: 'jwk' }) as { x: string }).x;
  private readonly sign = (m: string): string => sign(null, Buffer.from(m, 'utf8'), this.key.privateKey).toString('base64url');
  constructor(private readonly api: Api) {}

  async enroll(pairingCode: string): Promise<void> {
    const h = await this.api.hello();
    await this.api.enroll({
      pairingCode,
      device: { deviceId: this.deviceId, displayName: 'measure-hub-web', platform: 'windows', appVersion: '0.0.0-measure', protocolVersion: HUB_PROTOCOL_VERSION, capabilities: [] },
      publicKey: this.pub,
      signature: this.sign(enrollMessage({ hubInstanceId: h.hubInstanceId, pairingCode, deviceId: this.deviceId, publicKey: this.pub })),
    });
  }
  private async bearer(): Promise<string> {
    if (this.token && Date.now() - this.tokenAt < 4 * 60_000) return this.token;
    const h = await this.api.hello();
    const { nonce } = await this.api.deviceChallenge(this.deviceId);
    this.token = (await this.api.deviceToken({ deviceId: this.deviceId, nonce, signature: this.sign(deviceAuthMessage({ hubInstanceId: h.hubInstanceId, nonce, deviceId: this.deviceId })) })).accessToken;
    this.tokenAt = Date.now();
    return this.token;
  }
  async push(ops: SyncOp[]): Promise<void> {
    for (let i = 0; i < ops.length; i += SYNC_LIMITS.maxPushOps) {
      const results = (await this.api.syncPush(await this.bearer(), ops.slice(i, i + SYNC_LIMITS.maxPushOps))).results;
      const bad = results.find((r) => r.status !== 'applied');
      if (bad) throw new Error(`push not applied: ${JSON.stringify(bad)}`);
    }
  }
}

const opId = (): string => `hw-${randomBytes(8).toString('hex')}`;
const favoriteOp = (targetId: string, order: number): SyncOp => {
  const id = `tool:${targetId}`;
  return { opId: opId(), entityType: 'favorite', entityId: id, opKind: 'upsert', schemaVersion: 1, basedOnRevision: null, payload: { id, kind: 'tool', targetId, order, pinnedAt: new Date().toISOString() } } as SyncOp;
};

// --- Browser measurements ------------------------------------------------------------------------------------------------

interface LoadMetrics { usableMs: number; liveMs: number; responseEndMs: number; domContentLoadedMs: number; loadMs: number; transferBytes: number; requests: number; swControlled: boolean }

async function timedLoad(page: Page, action: () => Promise<unknown>): Promise<LoadMetrics> {
  const t0 = clock.now();
  await action();
  await page.locator('nav').first().waitFor({ state: 'visible', timeout: 60_000 });
  const usableMs = clock.now() - t0;
  await page.locator('[data-testid="sync-indicator"][data-state="synced"]').waitFor({ state: 'attached', timeout: 120_000 });
  const liveMs = clock.now() - t0;
  await page.waitForLoadState('load');
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    const res = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    return {
      responseEnd: n.responseEnd, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd,
      bytes: n.transferSize + res.reduce((a, r) => a + r.transferSize, 0), requests: res.length + 1,
      controlled: !!navigator.serviceWorker?.controller,
    };
  });
  return { usableMs: r2(usableMs), liveMs: r2(liveMs), responseEndMs: r2(nav.responseEnd), domContentLoadedMs: r2(nav.dcl), loadMs: r2(nav.load), transferBytes: nav.bytes, requests: nav.requests, swControlled: nav.controlled };
}

const medianOf = (rows: LoadMetrics[]): Record<string, number | boolean> => {
  const out: Record<string, number | boolean> = {};
  for (const k of ['usableMs', 'liveMs', 'responseEndMs', 'domContentLoadedMs', 'loadMs', 'transferBytes', 'requests'] as const) out[k] = median(rows.map((r) => r[k]));
  out['swControlledAll'] = rows.every((r) => r.swControlled);
  return out;
};

function toolManifests(): { id: string; title: string }[] {
  const dir = path.join(ROOT, 'packages', 'tool-registry', 'src', 'tools');
  const rows: { id: string; title: string }[] = [];
  for (const d of readdirSync(dir)) {
    const f = path.join(dir, d, `${d}.manifest.ts`);
    if (!existsSync(f)) continue;
    const src = readFileSync(f, 'utf8');
    const id = /\bid:\s*'([^']+)'/.exec(src)?.[1];
    const title = /\btitle:\s*'([^']+)'/.exec(src)?.[1];
    if (id && title) rows.push({ id, title });
  }
  return rows;
}

// --- Node-side static serving --------------------------------------------------------------------------------------------

interface NodeRes { ms: number; status: number; bytes: number; headers: Record<string, string | string[] | undefined> }
function nodeGet(hub: Hub, agent: https.Agent, p: string, headers: Record<string, string>): Promise<NodeRes> {
  return new Promise((resolve, reject) => {
    const t0 = clock.now();
    const req = https.request({ host: '127.0.0.1', port: hub.port, servername: 'localhost', path: p, ca: hub.ca, agent, headers: { host: `localhost:${hub.port}`, ...headers } }, (res) => {
      let bytes = 0;
      res.on('data', (c: Buffer) => { bytes += c.length; });
      res.on('end', () => resolve({ ms: clock.now() - t0, status: res.statusCode ?? 0, bytes, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function staticServing(hub: Hub, mainJs: string): Promise<Record<string, unknown>> {
  const agent = new https.Agent({ keepAlive: true, maxSockets: 1 });
  const out: Record<string, unknown> = {};
  for (const [label, p] of [['index', '/'], ['mainJs', `/${mainJs}`]] as const) {
    const accept = { 'accept-encoding': 'br' };
    await nodeGet(hub, agent, p, accept);
    const samples: number[] = [];
    let last = await nodeGet(hub, agent, p, accept);
    for (let i = 0; i < 50; i++) { last = await nodeGet(hub, agent, p, accept); samples.push(last.ms); }
    const etag = String(last.headers['etag'] ?? '');
    const reval: number[] = [];
    let revalStatus = 0;
    if (etag) {
      for (let i = 0; i < 50; i++) { const r = await nodeGet(hub, agent, p, { ...accept, 'if-none-match': etag }); reval.push(r.ms); revalStatus = r.status; }
    }
    out[label] = {
      path: p, status: last.status, contentEncoding: last.headers['content-encoding'] ?? null, transferBytes: last.bytes, cacheControl: last.headers['cache-control'] ?? null,
      get50: summarize(samples), revalidate304: etag ? { status: revalStatus, ...summarize(reval) } : { skipped: 'no ETag header' },
    };
  }
  agent.destroy();
  return out;
}

// --- Main ------------------------------------------------------------------------------------------------------------------

it('measures the Hub-served web', async () => {
  if (!existsSync(BUNDLE)) throw new Error('dist/hub/dude-hub.cjs is missing; run `npm run hub:compile`.');
  if (!existsSync(path.join(WEB_ROOT, 'index.html'))) throw new Error('dist/hub-web/browser is missing; run `npm run build:hub-web`.');
  const cpus = os.cpus();
  const result: Record<string, unknown> = {
    generatedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}-${process.arch}`, os: `${os.type()} ${os.release()}`,
    cpu: cpus[0]?.model.trim(), logicalCpus: cpus.length, totalMemGiB: r2(os.totalmem() / 2 ** 30),
  };
  const sizes = buildSizes();
  result['buildSizes'] = sizes;
  const initialFiles = (sizes['initialJs'] as { files: string[] }).files;
  const mainJs = initialFiles.find((f) => /^main-/.test(f)) ?? initialFiles[0]!;

  const hub = await startHub();
  const transport = createPinnedTransport({ host: '127.0.0.1', port: hub.port, ca: [hub.cert], pins: [spkiSha256Of(hub.cert)] });
  const api = createHubClient(transport, { clientProtocol: HUB_PROTOCOL_VERSION, minHubProtocol: HUB_MIN_CLIENT_PROTOCOL });
  const setupToken = readFileSync(path.join(hub.dir, 'config', 'setup-token'), 'utf8').trim();
  await api.bootstrap({ setupToken, ownerDisplayName: 'Owner', environmentName: 'Measure', password: PASSWORD });
  const signIn = await transport.request({ method: 'POST', path: '/api/v1/auth/sign-in', body: { password: PASSWORD } });
  const cookie = String(signIn.headers['set-cookie']).split(';')[0]!;
  const csrf = String((signIn.body as { csrfToken: string }).csrfToken);
  const pairRes = await transport.request({
    method: 'POST', path: '/api/v1/pairing-codes', body: { host: '127.0.0.1' },
    headers: { cookie, origin: `https://127.0.0.1:${hub.port}`, 'x-dude-csrf': csrf },
  });
  const parsed = parsePairingString(String((pairRes.body as { pairingString: string }).pairingString));
  if (!parsed) throw new Error(`pairing failed: ${pairRes.status}`);
  const device = new Sim(api);
  await device.enroll(parsed.code);

  const browser = await chromium.launch({ args: [`--ignore-certificate-errors-spki-list=${hub.spkiBase64}`] });
  const baseURL = `https://localhost:${hub.port}`;
  try {
    // Sign in once through the UI; later contexts reuse only its cookies (empty IndexedDB/localStorage/service worker).
    const setupCtx = await browser.newContext({ baseURL });
    const sp = await setupCtx.newPage();
    await sp.goto('/hub/sign-in?returnUrl=%2F');
    await sp.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await sp.getByTestId('submit').click();
    await sp.waitForURL((u) => !/\/hub\/sign-in/.test(u.pathname), { timeout: 30_000 });
    const cookies = await setupCtx.cookies();
    await setupCtx.close();
    const freshContext = async (): Promise<BrowserContext> => { const c = await browser.newContext({ baseURL }); await c.addCookies(cookies); return c; };

    // 2 + 3. Cold and warm loads (empty Hub, N = 0).
    log('cold loads...');
    const cold: LoadMetrics[] = [];
    for (let i = 0; i < 5; i++) {
      const c = await freshContext();
      const p = await c.newPage();
      cold.push(await timedLoad(p, () => p.goto('/', { waitUntil: 'commit' })));
      await c.close();
    }
    log('warm loads...');
    const warmCtx = await freshContext();
    const wp = await warmCtx.newPage();
    await timedLoad(wp, () => wp.goto('/', { waitUntil: 'commit' }));
    await wp.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await sleep(8000); // let the service worker finish prefetching the app group
    const warm: LoadMetrics[] = [];
    for (let i = 0; i < 6; i++) {
      const m = await timedLoad(wp, () => wp.reload({ waitUntil: 'commit' }));
      if (i > 0 || m.swControlled) warm.push(m);
    }
    await warmCtx.close();
    result['coldLoad'] = { samples: cold, median: medianOf(cold) };
    result['warmLoad'] = { samples: warm, median: medianOf(warm) };

    // 5. Realtime latency (before seeding, so the sidebar holds only the favorites pushed here).
    log('realtime...');
    const tools = toolManifests().filter((t) => t.title.length > 6);
    const picked: { id: string; title: string }[] = [];
    for (const t of tools) {
      if (picked.length >= 10) break;
      if (tools.some((o) => o.id !== t.id && o.title.includes(t.title))) continue;
      if (picked.some((o) => o.title.includes(t.title) || t.title.includes(o.title))) continue;
      picked.push(t);
    }
    const rtCtx = await freshContext();
    const rp = await rtCtx.newPage();
    await timedLoad(rp, () => rp.goto('/', { waitUntil: 'commit' }));
    await sleep(1500);
    const realtime: number[] = [];
    for (let i = 0; i < picked.length; i++) {
      const t = picked[i]!;
      // The sidebar shows a short label per favorite and only the first few, so the observable is the first favorite
      // button changing (the newest favorite sorts first).
      const seen = rp.evaluate(() => new Promise<number>((resolve) => {
        const first = (): string => Array.from(document.querySelectorAll('nav button')).find((b) => b.textContent?.includes('★'))?.textContent?.trim() ?? '';
        const before = first();
        const mo = new MutationObserver(() => { if (first() !== before) { mo.disconnect(); resolve(Date.now()); } });
        mo.observe(document.body, { childList: true, subtree: true, characterData: true });
      }));
      await sleep(50);
      const t0 = Date.now();
      await device.push([favoriteOp(t.id, 1000 - i)]); // newest sorts first: the sidebar shows only the first few favorites
      const arrived = await Promise.race([seen, sleep(15_000).then(() => 0)]);
      if (arrived === 0) {
        const navText = await rp.evaluate(() => (document.querySelector('nav')?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 600));
        throw new Error(`favorite ${t.id} ("${t.title}") never reached the sidebar; nav text: ${navText}`);
      }
      realtime.push(arrived - t0);
    }
    await rtCtx.close();
    result['realtime'] = { tools: picked.map((t) => t.id), samplesMs: realtime, ...summarize(realtime) };

    // 4. Boot snapshot latency with N seeded favorites (cumulative: 0, 500, 2000).
    const boot: Record<string, unknown> = {};
    let seeded = 0;
    for (const n of [0, 500, 2000]) {
      if (n > seeded) {
        const ops: SyncOp[] = [];
        for (let i = seeded; i < n; i++) ops.push(favoriteOp(`bulk${i}`, 100 + i));
        await device.push(ops);
        seeded = n;
      }
      log(`boot snapshot with ${n} favorites...`);
      const rows: LoadMetrics[] = [];
      for (let i = 0; i < 3; i++) {
        const c = await freshContext();
        const p = await c.newPage();
        rows.push(await timedLoad(p, () => p.goto('/', { waitUntil: 'commit' })));
        await c.close();
      }
      boot[`n${n}`] = { seededFavorites: n, samples: rows, median: medianOf(rows) };
    }
    result['bootSnapshot'] = { note: 'fresh context with owner cookie, empty local store; liveMs = navigation to sync indicator data-state=synced (10 realtime favorites also present)', ...boot };

    // 6. Static serving from Node.
    log('static serving...');
    result['staticServing'] = await staticServing(hub, mainJs);
  } finally {
    await browser.close();
    await stopHub(hub);
  }

  mkdirSync(path.join(ROOT, 'dist', 'measurements'), { recursive: true });
  writeFileSync(path.join(ROOT, 'dist', 'measurements', 'hub-web.json'), `${JSON.stringify(result, null, 2)}\n`);
  printTable(result);
}, 900_000);

function printTable(r: Record<string, unknown>): void {
  const kb = (n: number): string => `${(n / 1024).toFixed(1)} KiB`;
  const b = r['buildSizes'] as Record<string, any>;
  const rows: [string, string][] = [
    ['machine', `${String(r['cpu'])} (${String(r['logicalCpus'])} cpus), ${String(r['os'])}, node ${String(r['node'])}`],
    ['initial JS raw / br', `${kb(b['initialJs'].raw)} / ${kb(b['initialJs'].brotli)}`],
    ['initial CSS raw / br', `${kb(b['initialCss'].raw)} / ${kb(b['initialCss'].brotli)}`],
    ['total JS raw / br', `${kb(b['totalJs'].raw)} / ${kb(b['totalJs'].brotli)} (${b['totalJs'].files} files, ${b['lazyChunks'].count} chunks)`],
    ['SW app group raw / br', `${kb(b['serviceWorkerAppGroup'].raw)} / ${kb(b['serviceWorkerAppGroup'].brotli)} (${b['serviceWorkerAppGroup'].urls} urls)`],
  ];
  const load = (label: string, m: Record<string, number | boolean>): void => {
    rows.push([label, `usable ${m['usableMs']} ms, live ${m['liveMs']} ms, respEnd ${m['responseEndMs']}, DCL ${m['domContentLoadedMs']}, load ${m['loadMs']}, ${kb(Number(m['transferBytes']))} in ${m['requests']} req, sw=${m['swControlledAll']}`]);
  };
  load('cold load (median)', (r['coldLoad'] as any).median);
  load('warm load (median)', (r['warmLoad'] as any).median);
  const bs = r['bootSnapshot'] as Record<string, any>;
  for (const k of ['n0', 'n500', 'n2000']) rows.push([`boot live, ${bs[k].seededFavorites} favs`, `${bs[k].median.liveMs} ms (usable ${bs[k].median.usableMs} ms)`]);
  const rt = r['realtime'] as any;
  rows.push(['realtime push->sidebar', `median ${rt.medianMs} ms, p95 ${rt.p95Ms}, min ${rt.minMs}, max ${rt.maxMs} (n=${rt.runs})`]);
  const ss = r['staticServing'] as Record<string, any>;
  for (const k of ['index', 'mainJs']) {
    rows.push([`GET ${ss[k].path}`, `median ${ss[k].get50.medianMs} ms, p95 ${ss[k].get50.p95Ms} (${ss[k].status} ${ss[k].contentEncoding ?? 'identity'}, ${kb(ss[k].transferBytes)})`]);
    rows.push([`304 ${ss[k].path}`, ss[k].revalidate304.skipped ?? `median ${ss[k].revalidate304.medianMs} ms, p95 ${ss[k].revalidate304.p95Ms} (${ss[k].revalidate304.status})`]);
  }
  const w = Math.max(...rows.map(([k]) => k.length));
  process.stderr.write(`\n${rows.map(([k, v]) => `${k.padEnd(w)}  ${v}`).join('\n')}\n`);
}

it('cleans up', () => {
  for (const p of procs) if (p.exitCode === null) p.kill();
  for (const d of dirs) rmSync(d, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
});
