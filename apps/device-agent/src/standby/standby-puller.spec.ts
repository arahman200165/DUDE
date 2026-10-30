import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HubApiError } from '@dude/api-client';
import type { HubClient, StandbyObjectPiece } from '@dude/api-client';
import type { AgentHubStatus } from '@dude/contracts';
import { STANDBY_REPO_OBJECT } from '@dude/contracts/hub';
import type { StandbyObjectPrefix } from '@dude/contracts/hub';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import { StandbyError } from './standby-mirror.js';
import { classifyStandbyError, createStandbyPuller } from './standby-puller.js';
import type { StandbyHubPort, StandbyPuller, StandbyTimings } from './standby-puller.js';

const folders: string[] = [];
const folder = (): string => { const d = mkdtempSync(path.join(os.tmpdir(), 'dude-standby-')); folders.push(d); return d; };
const pullers: StandbyPuller[] = [];
afterEach(() => { for (const p of pullers.splice(0)) p.stop(); cleanupTemp(); for (const d of folders.splice(0)) rmSync(d, { recursive: true, force: true }); });

const NOW = new Date('2026-10-29T12:00:00.000Z');
const DEST = 'local-1';
const hex = (c: string): string => c.repeat(32);
const packName = (c: string): string => `packs/${hex(c)}`;
const manifestName = (stamp: string, c: string): string => `manifests/${stamp}-${hex(c)}`;
const M1 = manifestName('20261029T100000Z', 'a');
const M2 = manifestName('20261029T110000Z', 'b');

type Listed = Array<{ name: string; size: number }>;

/** A Hub's repository state, and a fake client answering the three standby calls over it. */
interface FakeRepo { label: string; lastBackupId: string | null; objects: Map<string, Buffer> }
class FakeHub {
  repos = new Map<string, FakeRepo>();
  hubState: AgentHubStatus['state'] = 'online';
  failWith: Error | null = null;
  listeners = new Set<(s: AgentHubStatus) => void>();
  calls: string[] = [];
  gets: Array<{ name: string; start: number; end: number | undefined }> = [];
  /** Runs before an object piece is served (to change the Hub mid-pull). */
  beforeGet: ((name: string) => void) | null = null;
  /** Overrides what the Hub lists (hostile or wrong listings). */
  listOverride: ((prefix: StandbyObjectPrefix, objects: Listed) => Listed) | null = null;
  pieceOverride: ((name: string, piece: StandbyObjectPiece) => StandbyObjectPiece) | null = null;
  pageSize = 2;
  deviceCallOptions: Array<{ authRetryOn403?: boolean } | undefined> = [];

  add(id: string, objects: Record<string, Buffer>, label = id): FakeRepo {
    const repo: FakeRepo = { label, lastBackupId: null, objects: new Map(Object.entries(objects)) };
    this.repos.set(id, repo);
    return repo;
  }

  client(): HubClient {
    const repoOf = (id: string): FakeRepo => { const r = this.repos.get(id); if (!r) throw new HubApiError(404, 'not-found', 'no such repository'); return r; };
    const api = {
      standbyRepositories: async () => {
        this.calls.push('repositories');
        return { deviceId: 'dev', grantedAt: '2026-10-28T00:00:00.000Z', repositories: [...this.repos].map(([id, r]) => ({ id, label: r.label, kind: 'local-folder', lastBackupId: r.lastBackupId })) };
      },
      listStandbyObjects: async (_token: string, id: string, query: { prefix?: StandbyObjectPrefix; after?: string; limit?: number } = {}) => {
        const prefix = query.prefix ?? 'manifests/';
        this.calls.push(`list ${prefix}`);
        const repo = repoOf(id);
        let objects: Listed = [...repo.objects]
          .filter(([name]) => (prefix === 'repo' ? name === STANDBY_REPO_OBJECT : name.startsWith(prefix)))
          .map(([name, content]) => ({ name, size: content.length }))
          .sort((a, b) => (a.name < b.name ? -1 : 1));
        if (this.listOverride) objects = this.listOverride(prefix, objects);
        const rest = query.after === undefined ? objects : objects.filter((o) => o.name > query.after!);
        const page = rest.slice(0, this.pageSize);
        return { objects: page, next: rest.length > page.length ? page[page.length - 1]!.name : null };
      },
      getStandbyObject: async (_token: string, id: string, name: string, range?: { start: number; end?: number }): Promise<StandbyObjectPiece> => {
        this.calls.push(`get ${name}`);
        this.beforeGet?.(name);
        const repo = repoOf(id);
        const content = repo.objects.get(name);
        if (!content) throw new HubApiError(404, 'not-found', 'no such object');
        const start = range?.start ?? 0;
        const end = Math.min(range?.end ?? content.length - 1, content.length - 1);
        this.gets.push({ name, start, end: range?.end });
        const piece: StandbyObjectPiece = { status: 206, bytes: new Uint8Array(content.subarray(start, end + 1)), start, end, size: content.length };
        return this.pieceOverride ? this.pieceOverride(name, piece) : piece;
      },
    };
    return api as unknown as HubClient;
  }

  port(): StandbyHubPort {
    return {
      status: () => ({ state: this.hubState }),
      onChange: (listener) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; },
      deviceCall: async (fn, options) => {
        this.deviceCallOptions.push(options);
        if (this.failWith) throw this.failWith;
        return fn(this.client(), 'ddt_token');
      },
    };
  }

  setState(state: AgentHubStatus['state']): void {
    this.hubState = state;
    for (const l of this.listeners) l({ state } as AgentHubStatus);
  }
}

const FAST: Partial<StandbyTimings> = { intervalMs: 3_600_000, noGrantIntervalMs: 7_200_000, startDelayMs: 3_600_000, backoffMinMs: 1_000, backoffMaxMs: 8_000, rateLimitMinMs: 5_000, rangeBytes: 4, listLimit: 100 };

function setup(opts: { timings?: Partial<StandbyTimings>; hub?: FakeHub } = {}) {
  const hub = opts.hub ?? new FakeHub();
  const store = openReady(tempDir());
  const puller: StandbyPuller = createStandbyPuller({ db: store.db, now: () => NOW, hub: hub.port(), timings: { ...FAST, ...opts.timings }, random: () => 0 });
  puller.start();
  pullers.push(puller);
  return { hub, puller, store, dir: folder() };
}

const bytes = (n: number, seed = 1): Buffer => Buffer.from(Array.from({ length: n }, (_, i) => (i * 31 + seed) & 0xff));
const sha = (b: Buffer | Uint8Array): string => createHash('sha256').update(b).digest('hex');
const read = (dir: string, ...p: string[]): Buffer => readFileSync(path.join(dir, ...p));
const names = (dir: string, ...p: string[]): string[] => { try { return readdirSync(path.join(dir, ...p)).sort(); } catch { return []; } };
const run = async (puller: StandbyPuller): Promise<void> => { puller.pullNow(); await puller.whenIdle(); };
const delay = (puller: StandbyPuller): number => new Date(puller.status().nextRunAt!).getTime() - NOW.getTime();

function fullRepo(): Record<string, Buffer> {
  return { repo: bytes(11, 3), [packName('1')]: bytes(10, 5), [packName('2')]: bytes(3, 7), [M1]: bytes(6, 9), [M2]: bytes(5, 11) };
}

describe('standby puller: a full pull', () => {
  it('mirrors a repository byte for byte, in ranged pieces, packs before manifests, with the repo object whole', async () => {
    const { hub, puller, dir } = setup();
    const repo = hub.add(DEST, fullRepo(), 'Backups');
    repo.lastBackupId = 'b2';
    await puller.setFolder(dir);
    await puller.whenIdle();

    for (const [name, content] of repo.objects) expect(sha(read(dir, DEST, ...name.split('/')))).toBe(sha(content));
    expect(names(dir, DEST)).toEqual(['manifests', 'packs', 'repo']);
    expect(names(dir, '.standby-partial', DEST)).toEqual([]);
    const pack1 = hub.gets.filter((g) => g.name === packName('1'));
    expect(pack1.map((g) => [g.start, g.end])).toEqual([[0, 3], [4, 7], [8, 9]]);
    expect(Math.max(...hub.gets.map((g) => g.end! - g.start + 1))).toBeLessThanOrEqual(4);
    const order = hub.calls.filter((c) => c.startsWith('get '));
    const lastPack = Math.max(...order.map((c, i) => (c.startsWith('get packs/') ? i : -1)));
    const firstManifest = order.findIndex((c) => c.startsWith('get manifests/'));
    expect(lastPack).toBeLessThan(firstManifest);
    expect(hub.deviceCallOptions.every((o) => o?.authRetryOn403 === false)).toBe(true);

    const status = puller.status();
    expect(status).toMatchObject({ phase: 'idle', folder: dir, lastError: null, lastSuccessAt: NOW.toISOString(), grantedAt: '2026-10-28T00:00:00.000Z' });
    expect(status.repositories).toEqual([{ id: DEST, label: 'Backups', lastBackupId: 'b2', manifests: 2, packs: 2, bytes: 35 }]);
    expect(status.lastRunBytes).toBe(35);
    expect(status.mirrorBytes).toBe(35);
  });

  it('lists across pages (the Hub pages by 2 here)', async () => {
    const { hub, puller, dir } = setup();
    const objects: Record<string, Buffer> = { repo: bytes(4), [M1]: bytes(2) };
    for (const c of '12345') objects[packName(c)] = bytes(2, Number(c));
    hub.add(DEST, objects);
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(names(dir, DEST, 'packs')).toHaveLength(5);
    expect(hub.calls.filter((c) => c === 'list packs/').length).toBe(3);
  });

  it('fetches only the repo object on a second run when nothing changed', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    hub.gets.length = 0;
    await run(puller);
    expect([...new Set(hub.gets.map((g) => g.name))]).toEqual([STANDBY_REPO_OBJECT]);
    expect(puller.status()).toMatchObject({ phase: 'idle', lastRunBytes: 11 });
  });

  it('re-fetches the repo object every run, even when its size is unchanged (a passphrase re-wrap)', async () => {
    const { hub, puller, dir } = setup();
    const repo = hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    const rewrapped = Buffer.alloc(11, 0xee);
    repo.objects.set('repo', rewrapped);
    await run(puller);
    expect(read(dir, DEST, 'repo').equals(rewrapped)).toBe(true);
  });

  it('writes exactly the ciphertext the Hub served and makes only listing and object calls', async () => {
    const { hub, puller, dir } = setup();
    const odd = Buffer.concat([Buffer.from('PLAINTEXT-MARKER'), bytes(8)]);
    hub.add(DEST, { ...fullRepo(), [packName('9')]: odd });
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(read(dir, DEST, 'packs', hex('9')).equals(odd)).toBe(true);
    expect(hub.calls.every((c) => /^(repositories|list |get )/.test(c))).toBe(true);
  });
});

describe('standby puller: retention, changes and consistency', () => {
  it('prunes what the Hub no longer lists, but only inside the repository mirror', async () => {
    const { hub, puller, dir } = setup();
    const repo = hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    writeFileSync(path.join(dir, 'user-file.txt'), 'mine');
    mkdirSync(path.join(dir, 'unrelated'));
    writeFileSync(path.join(dir, 'unrelated', 'x'), 'mine');
    repo.objects.delete(M1);
    repo.objects.delete(packName('2'));
    await run(puller);
    expect(names(dir, DEST, 'manifests')).toEqual([M2.slice('manifests/'.length)]);
    expect(names(dir, DEST, 'packs')).toEqual([hex('1')]);
    expect(read(dir, 'user-file.txt').toString()).toBe('mine');
    expect(existsSync(path.join(dir, 'unrelated', 'x'))).toBe(true);
  });

  it('never wipes the mirror when the Hub suddenly lists no backups at all', async () => {
    const { hub, puller, dir } = setup();
    const repo = hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    repo.objects.delete(M1);
    repo.objects.delete(M2);
    repo.objects.delete(packName('1'));
    await run(puller);
    expect(names(dir, DEST, 'manifests')).toHaveLength(2);
    expect(names(dir, DEST, 'packs')).toHaveLength(2);
    expect(puller.status().lastError).toMatchObject({ code: 'listing-empty' });
    expect(puller.status().phase).toBe('backing-off');
  });

  it('fetches a new manifest last, after its packs', async () => {
    const { hub, puller, dir } = setup();
    const repo = hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    const M3 = manifestName('20261029T120000Z', 'c');
    repo.objects.set(packName('3'), bytes(9, 2));
    repo.objects.set(M3, bytes(4, 2));
    hub.calls.length = 0;
    await run(puller);
    const gets = hub.calls.filter((c) => c.startsWith('get ')).map((c) => c.slice(4));
    expect([...new Set(gets)].filter((n) => n !== 'repo')).toEqual([packName('3'), M3]);
    expect(read(dir, DEST, 'manifests', M3.slice('manifests/'.length)).equals(bytes(4, 2))).toBe(true);
  });

  it('leaves a manifest that appears only after the packs were listed for the next run', async () => {
    const { hub, puller, dir } = setup();
    const repo = hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    const M3 = manifestName('20261029T120000Z', 'c');
    let triggered = false;
    hub.listOverride = (prefix, objects) => {
      if (prefix === 'packs/' && !triggered) { triggered = true; repo.objects.set(packName('3'), bytes(9, 2)); repo.objects.set(M3, bytes(4, 2)); }
      return objects;
    };
    await run(puller);
    expect(triggered).toBe(true);
    expect(names(dir, DEST, 'manifests')).not.toContain(M3.slice('manifests/'.length));
    hub.listOverride = null;
    await run(puller);
    expect(names(dir, DEST, 'manifests')).toContain(M3.slice('manifests/'.length));
    expect(names(dir, DEST, 'packs')).toContain(hex('3'));
  });

  it('fetches no manifest when a pack vanished after the listing, and says so', async () => {
    const { hub, puller, dir } = setup();
    const repo = hub.add(DEST, fullRepo());
    hub.beforeGet = (name) => { if (name === packName('2')) repo.objects.delete(packName('2')); };
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(names(dir, DEST, 'manifests')).toEqual([]);
    expect(puller.status().lastError).toMatchObject({ code: 'changed-during-pull' });
    hub.beforeGet = null;
    await run(puller);
    expect(puller.status().lastError).toBeNull();
    expect(names(dir, DEST, 'manifests')).toHaveLength(2);
  });

  it('replaces a wrong-size final pack instead of resuming into it', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    writeFileSync(path.join(dir, DEST, 'packs', hex('1')), Buffer.from('tampered, and too long for the listing'));
    await run(puller);
    expect(read(dir, DEST, 'packs', hex('1')).equals(bytes(10, 5))).toBe(true);
  });

  it('keeps one mirror per repository and skips one that has nothing written yet', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, fullRepo());
    hub.add('s3-2', {});
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(names(dir).filter((n) => n !== '.standby-partial')).toEqual([DEST]);
    expect(puller.status().repositories.map((r) => r.id)).toEqual([DEST]);
  });
});

describe('standby puller: partial downloads', () => {
  it('resumes a partial file from its size and renames it into place', async () => {
    const { hub, puller, dir } = setup();
    const content = bytes(10, 5);
    hub.add(DEST, { repo: bytes(11, 3), [packName('1')]: content, [M1]: bytes(6, 9) });
    const partialDir = path.join(dir, '.standby-partial', DEST);
    mkdirSync(partialDir, { recursive: true });
    writeFileSync(path.join(partialDir, `packs-${hex('1')}.part`), content.subarray(0, 6));
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(hub.gets.filter((g) => g.name === packName('1')).map((g) => [g.start, g.end])).toEqual([[6, 9]]);
    expect(read(dir, DEST, 'packs', hex('1')).equals(content)).toBe(true);
    expect(names(dir, '.standby-partial', DEST)).toEqual([]);
  });

  it('discards a partial larger than the object and starts over', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, { repo: bytes(11, 3), [packName('1')]: bytes(10, 5), [M1]: bytes(6, 9) });
    const partialDir = path.join(dir, '.standby-partial', DEST);
    mkdirSync(partialDir, { recursive: true });
    writeFileSync(path.join(partialDir, `packs-${hex('1')}.part`), Buffer.alloc(50, 1));
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(hub.gets.find((g) => g.name === packName('1'))).toMatchObject({ start: 0 });
    expect(read(dir, DEST, 'packs', hex('1')).equals(bytes(10, 5))).toBe(true);
  });

  it('removes stale partials of objects the Hub no longer lists and keeps an interrupted one resumable', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, { repo: bytes(11, 3), [packName('1')]: bytes(10, 5), [M1]: bytes(6, 9) });
    const partialDir = path.join(dir, '.standby-partial', DEST);
    mkdirSync(partialDir, { recursive: true });
    writeFileSync(path.join(partialDir, `packs-${hex('f')}.part`), 'stale');
    let served = 0;
    // The repo object takes 3 pieces (11 bytes / 4), the pack then gets one piece before the Hub fails.
    hub.pieceOverride = (_n, piece) => { served += 1; if (served > 4) throw new HubApiError(503, 'unavailable', 'down'); return piece; };
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(puller.status()).toMatchObject({ phase: 'backing-off', lastError: { code: 'hub-unavailable' } });
    expect(names(dir, '.standby-partial', DEST)).toEqual([`packs-${hex('1')}.part`]);
    expect(readFileSync(path.join(partialDir, `packs-${hex('1')}.part`)).length).toBe(4);
    hub.pieceOverride = null;
    await run(puller);
    expect(read(dir, DEST, 'packs', hex('1')).equals(bytes(10, 5))).toBe(true);
    expect(puller.status().lastError).toBeNull();
  });
});

describe('standby puller: hostile and wrong Hub answers', () => {
  it.each<[string, (p: StandbyObjectPrefix, o: Listed) => Listed]>([
    ['a traversal pack name', (_p, o) => [...o, { name: 'packs/../../../x', size: 1 }]],
    ['a name of the wrong kind in a prefix', (p, o) => (p === 'packs/' ? [...o, { name: 'repo', size: 1 }] : o)],
    ['an absolute path', (p, o) => (p === 'manifests/' ? [{ name: 'C:\\Windows\\x', size: 1 }] : o)],
    ['a backslash name', (p, o) => (p === 'packs/' ? [{ name: 'packs\\..\\x', size: 1 }] : o)],
  ])('rejects %s and writes nothing for it', async (_label, override) => {
    const { hub, puller, dir: container } = setup();
    const dir = path.join(container, 'standby');
    mkdirSync(dir);
    hub.add(DEST, fullRepo());
    hub.listOverride = override;
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(puller.status().lastError?.code).toBe('hostile-listing');
    expect(names(dir)).not.toContain('x');
    expect(hub.gets).toEqual([]);
    expect(names(container)).toEqual(['standby']);
  });

  it('rejects a hostile repository id', async () => {
    const { hub, puller, dir } = setup();
    hub.add('../evil', fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(puller.status().lastError?.code).toBe('hostile-listing');
    expect(names(dir)).toEqual([]);
  });

  it('rejects an unordered listing and a negative or fractional size', async () => {
    const bad: Array<(p: StandbyObjectPrefix, o: Listed) => Listed> = [
      (p, o) => (p === 'packs/' ? [...o].reverse() : o),
      (p, o) => (p === 'packs/' ? o.map((x) => ({ ...x, size: -1 })) : o),
      (p, o) => (p === 'packs/' ? o.map((x) => ({ ...x, size: 1.5 })) : o),
    ];
    for (const override of bad) {
      const { hub, puller, dir } = setup();
      hub.pageSize = 100;
      hub.add(DEST, fullRepo());
      hub.listOverride = override;
      await puller.setFolder(dir);
      await puller.whenIdle();
      expect(puller.status().lastError?.code).toBe('hub-protocol');
      expect(names(dir, DEST, 'manifests')).toEqual([]);
    }
  });

  it('refuses a piece whose size differs from the listing, deletes that partial and publishes no manifest', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, fullRepo());
    hub.pieceOverride = (name, piece) => (name === packName('1') ? { ...piece, size: piece.size + 1 } : piece);
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(puller.status()).toMatchObject({ phase: 'backing-off', lastError: { code: 'size-mismatch' } });
    expect(names(dir, DEST, 'manifests')).toEqual([]);
    expect(names(dir, '.standby-partial', DEST)).toEqual([]);
  });

  it('refuses a short piece and never renames it into place', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, fullRepo());
    hub.pieceOverride = (name, piece) => (name === packName('1') ? { ...piece, bytes: piece.bytes.subarray(0, 1) } : piece);
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(puller.status().lastError?.code).toBe('size-mismatch');
    expect(existsSync(path.join(dir, DEST, 'packs', hex('1')))).toBe(false);
  });
});

describe('standby puller: gating, grants and back-off', () => {
  it('reports not-configured and refuses pullNow without a folder, with no Hub call', () => {
    const { hub, puller } = setup();
    puller.start();
    expect(puller.status().phase).toBe('not-configured');
    expect(() => puller.pullNow()).toThrowError(expect.objectContaining({ code: 'not-configured' }));
    expect(hub.calls).toEqual([]);
    puller.stop();
  });

  it('reports not-enrolled for a standalone device and refuses pullNow', async () => {
    const hub = new FakeHub();
    hub.hubState = 'standalone';
    const { puller, dir } = setup({ hub });
    await puller.setFolder(dir);
    expect(puller.status().phase).toBe('not-enrolled');
    expect(() => puller.pullNow()).toThrowError(expect.objectContaining({ code: 'not-enrolled' }));
    expect(hub.calls).toEqual([]);
  });

  it('waits while the Hub is not online, requests nothing, and runs when it comes online', async () => {
    const hub = new FakeHub();
    hub.hubState = 'offline';
    hub.add(DEST, fullRepo());
    const { puller, dir } = setup({ hub });
    puller.start();
    await puller.setFolder(dir);
    expect(puller.status().phase).toBe('waiting-for-hub');
    expect(hub.calls).toEqual([]);
    hub.setState('online');
    await puller.whenIdle();
    expect(names(dir, DEST, 'manifests')).toHaveLength(2);
    puller.stop();
  });

  it('treats a 403 as no grant: the slow interval, an actionable message, no auth refresh', async () => {
    const hub = new FakeHub();
    hub.failWith = new HubApiError(403, 'forbidden', 'no grant');
    const { puller, dir } = setup({ hub });
    puller.start();
    await puller.setFolder(dir);
    await puller.whenIdle();
    const s = puller.status();
    expect(s).toMatchObject({ phase: 'no-grant', lastError: { code: 'no-grant' } });
    expect(s.lastError?.message).toContain('dude-hub standby grant');
    expect(delay(puller)).toBe(7_200_000);
    expect(hub.deviceCallOptions[0]).toEqual({ authRetryOn403: false });
    hub.failWith = null;
    hub.add(DEST, fullRepo());
    await run(puller);
    expect(puller.status()).toMatchObject({ phase: 'idle', lastError: null });
    puller.stop();
  });

  it('backs off exponentially (1s, 2s, 4s, capped at 8s) and resets after a success', async () => {
    const hub = new FakeHub();
    hub.failWith = new HubApiError(503, 'unavailable', 'down');
    const { puller, dir } = setup({ hub });
    puller.start();
    await puller.setFolder(dir);
    await puller.whenIdle();
    const delays = [delay(puller)];
    for (let i = 0; i < 4; i += 1) { await run(puller); delays.push(delay(puller)); }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 8_000]);
    expect(puller.status().phase).toBe('backing-off');
    hub.failWith = null;
    hub.add(DEST, fullRepo());
    await run(puller);
    expect(puller.status()).toMatchObject({ phase: 'idle', lastError: null });
    expect(delay(puller)).toBe(3_600_000);
    puller.stop();
  });

  it('honours a floor after 429 and classifies errors without leaking paths', async () => {
    expect(classifyStandbyError(new HubApiError(429, 'rate-limited', 'slow'))).toMatchObject({ code: 'rate-limited', retry: 'rate-limited' });
    expect(classifyStandbyError(new HubApiError(401, 'unauthorized', 'x'))).toMatchObject({ code: 'unauthorized', retry: 'backoff' });
    expect(classifyStandbyError(Object.assign(new Error('EPERM: C:\\secret\\path'), { code: 'EPERM' }))).toEqual({ code: 'folder-error', message: 'Writing to the standby folder failed (EPERM).', retry: 'backoff' });
    expect(classifyStandbyError(new Error('C:\\secret\\path'))).toMatchObject({ code: 'internal', message: 'The standby pull failed.' });
    expect(classifyStandbyError(new StandbyError('hostile-listing', 'x'))).toMatchObject({ code: 'hostile-listing' });
    const hub = new FakeHub();
    hub.failWith = new HubApiError(429, 'rate-limited', 'slow');
    const { puller, dir } = setup({ hub });
    puller.start();
    await puller.setFolder(dir);
    await puller.whenIdle();
    expect(delay(puller)).toBe(5_000);
    puller.stop();
  });

  it('reports a removed folder as folder-unavailable and does not recreate it', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    rmSync(dir, { recursive: true, force: true });
    await run(puller);
    expect(puller.status().lastError).toMatchObject({ code: 'folder-unavailable' });
    expect(existsSync(dir)).toBe(false);
  });
});

describe('standby puller: configuration', () => {
  it('validates the folder: absolute, existing, a directory', async () => {
    const { puller } = setup();
    for (const bad of ['relative/dir', '', '..\\x', 'a\0b', 'x'.repeat(2000)]) {
      await expect(puller.setFolder(bad)).rejects.toMatchObject({ code: 'invalid-params' });
    }
    await expect(puller.setFolder(path.join(os.tmpdir(), `dude-standby-missing-${randomBytes(4).toString('hex')}`))).rejects.toMatchObject({ code: 'folder-unavailable' });
    const file = path.join(folder(), 'a-file');
    writeFileSync(file, 'x');
    await expect(puller.setFolder(file)).rejects.toMatchObject({ code: 'folder-unavailable' });
    expect(puller.status().folder).toBeNull();
  });

  it('stops pulling on null but leaves pulled files; a different folder starts a fresh mirror', async () => {
    const { hub, puller, dir } = setup();
    hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    const before = hub.calls.length;
    await puller.setFolder(null);
    expect(puller.status()).toMatchObject({ phase: 'not-configured', folder: null, nextRunAt: null });
    expect(names(dir, DEST, 'packs')).toHaveLength(2);
    expect(hub.calls.length).toBe(before);
    const other = folder();
    await puller.setFolder(other);
    await puller.whenIdle();
    expect(puller.status()).toMatchObject({ folder: other });
    expect(names(other, DEST, 'packs')).toHaveLength(2);
  });

  it('persists the configuration across a restart of the puller (the same store)', async () => {
    const { hub, puller, store, dir } = setup();
    hub.add(DEST, fullRepo());
    await puller.setFolder(dir);
    await puller.whenIdle();
    const again = createStandbyPuller({ db: store.db, now: () => NOW, hub: hub.port(), timings: FAST });
    expect(again.status()).toMatchObject({ folder: dir, lastSuccessAt: NOW.toISOString(), phase: 'idle' });
    expect(again.status().repositories).toHaveLength(1);
  });

  it('exposes this device id for the owner grant, and no progress when idle', () => {
    const { puller, store } = setup();
    expect(puller.status().deviceId).toBe(store.device.deviceId);
    expect(puller.status().progress).toBeNull();
  });
});
