import { generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import * as nodeCrypto from 'node:crypto';
import { isSea } from 'node:sea';
import { probeSqliteVec } from '../db/sqlite-vec.js';
import { exchangeWithInternalWorker } from '../workers/worker-mode.js';

export interface SelfTestCheck {
  name: string;
  ok: boolean;
  detail?: string;
  /** Set only by optional capabilities: `unavailable` is a graceful degradation, never a failure (ok stays true). */
  state?: 'available' | 'unavailable';
}

export interface SelfTestResult {
  ok: boolean;
  checks: SelfTestCheck[];
}

type Argon2Fn = (
  algorithm: string,
  params: { message: Buffer; nonce: Buffer; parallelism: number; tagLength: number; memory: number; passes: number },
  callback: (error: Error | null, key: Buffer) => void,
) => void;

async function check(name: string, body: () => Promise<string | undefined> | string | undefined): Promise<SelfTestCheck> {
  try {
    const detail = await body();
    return detail === undefined ? { name, ok: true } : { name, ok: true, detail };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Optional capability: loads the pinned sqlite-vec library when present; its absence is reported, not failed (PD-141, PD-147). */
function sqliteVecCheck(): SelfTestCheck {
  const state = probeSqliteVec();
  return state.available
    ? { name: 'sqlite-vec', ok: true, state: 'available', detail: `sqlite-vec ${state.version}` }
    : { name: 'sqlite-vec', ok: true, state: 'unavailable', detail: state.reason };
}

/**
 * Verifies in-process that the runtime provides everything the Hub needs, before any state is touched. `capabilities`
 * (default true) adds the 32-SS1 probes that touch the file system or spawn a process (the worker re-spawn); `run`
 * leaves them to `dude-hub self-test` and the capability script.
 */
export async function runSelfTest(options: { capabilities?: boolean } = {}): Promise<SelfTestResult> {
  const checks: SelfTestCheck[] = [];
  checks.push(
    await check('node-version', () => {
      const major = Number(process.versions.node.split('.')[0]);
      if (!(major >= 24)) throw new Error(`Node ${process.versions.node} is older than 24`);
      return process.versions.node;
    }),
  );
  checks.push(
    await check('sqlite', async () => {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(':memory:');
      try {
        db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;');
        db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL); INSERT INTO t (v) VALUES ('ok');");
        const row = db.prepare('SELECT v FROM t').get() as { v: string } | undefined;
        if (row?.v !== 'ok') throw new Error('round trip failed');
        const version = db.prepare('SELECT sqlite_version() AS v').get() as { v: string };
        return `sqlite ${version.v}`;
      } finally {
        db.close();
      }
    }),
  );
  checks.push(
    await check('argon2', async () => {
      const argon2 = (nodeCrypto as unknown as { argon2?: Argon2Fn }).argon2;
      if (typeof argon2 !== 'function') throw new Error('crypto.argon2 is unavailable');
      const key = await new Promise<Buffer>((resolve, reject) => {
        argon2(
          'argon2id',
          { message: Buffer.from('self-test'), nonce: randomBytes(16), parallelism: 1, tagLength: 32, memory: 64, passes: 1 },
          (error, derived) => (error ? reject(error) : resolve(derived)),
        );
      });
      if (key.length !== 32) throw new Error(`expected 32 bytes, got ${key.length}`);
      return undefined;
    }),
  );
  checks.push(
    await check('ed25519', () => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const data = randomBytes(32);
      if (!verify(null, data, publicKey, sign(null, data, privateKey))) throw new Error('signature did not verify');
      return undefined;
    }),
  );
  checks.push(
    await check('ecdsa-p256', () => {
      const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const data = randomBytes(32);
      if (!verify('sha256', data, publicKey, sign('sha256', data, privateKey))) throw new Error('signature did not verify');
      return undefined;
    }),
  );
  checks.push(
    await check('sqlite-fts5', async () => {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(':memory:');
      try {
        db.exec("CREATE VIRTUAL TABLE docs USING fts5(title, body, tokenize = 'porter unicode61')");
        db.exec("INSERT INTO docs (title, body) VALUES ('first', 'The quick brown foxes jump'), ('second', 'Nothing relevant')");
        const hits = db.prepare('SELECT title FROM docs WHERE docs MATCH ? ORDER BY rank').all('fox') as Array<{ title: string }>;
        if (hits.length !== 1 || hits[0].title !== 'first') throw new Error(`MATCH returned ${JSON.stringify(hits)}`);
        return 'fts5 MATCH with the porter tokenizer';
      } finally {
        db.close();
      }
    }),
  );
  if (options.capabilities !== false) {
    checks.push(sqliteVecCheck());
    checks.push(
      await check('worker-respawn', async () => {
        const nonce = randomBytes(8).toString('hex');
        const reply = await exchangeWithInternalWorker('ping', { type: 'ping', nonce });
        if (reply['type'] !== 'pong' || reply['nonce'] !== nonce) throw new Error(`unexpected reply ${JSON.stringify(reply)}`);
        if (reply['sea'] !== isSea()) throw new Error('worker disagrees about single-executable mode');
        if (reply['pid'] === process.pid) throw new Error('worker ran in the parent process');
        return `${isSea() ? 'executable re-spawn' : 'node re-spawn'}, one message exchanged`;
      }),
    );
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/** CLI entry for `dude-hub self-test`: prints JSON and returns the exit code. */
export async function runSelfTestCommand(): Promise<number> {
  const result = await runSelfTest();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result.ok ? 0 : 1;
}
