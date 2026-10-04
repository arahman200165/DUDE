import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../cli/args.js';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { BLOCK_CREDENTIAL_FAILURES, blockedForMs, noteCredentialFailure } from '../security/ip-block.js';
import { tempDir } from '../server/test-helpers.js';
import { buildAdminMethods } from './methods.js';

const opened: HubDb[] = [];
afterEach(() => { for (const h of opened.splice(0)) { try { h.close(); } catch { /* closed */ } } });

describe('security blocks admin methods', () => {
  it('lists and clears a blocked address, and rejects a bad request', async () => {
    const paths = ensureLayout(tempDir('hub-blocks-admin-'));
    const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
    if (result.status !== 'ready') throw new Error('not ready');
    opened.push(result.hub);
    const now = 1_000_000_000_000;
    const methods = buildAdminMethods({
      db: result.hub.db, hubVersion: 't', hubInstanceId: result.hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0,
      configDir: paths.configDir, spkiSha256: 'x', now: () => now,
    });
    for (let i = 0; i < BLOCK_CREDENTIAL_FAILURES; i++) noteCredentialFailure(result.hub.db, '203.0.113.9', now);
    expect(blockedForMs(result.hub.db, '203.0.113.9', now)).toBeGreaterThan(0);

    const listed = (await methods['security.blocks.list']!({})) as { blocks: { ip: string }[] };
    expect(listed.blocks.map((b) => b.ip)).toEqual(['203.0.113.9']);
    expect(await methods['security.blocks.clear']!({ ip: '203.0.113.9' })).toEqual({ cleared: true });
    expect(await methods['security.blocks.clear']!({ ip: '203.0.113.9' })).toEqual({ cleared: false });
    expect(blockedForMs(result.hub.db, '203.0.113.9', now)).toBe(0);
    await expect(Promise.resolve().then(() => methods['security.blocks.clear']!({}))).rejects.toThrow(/address/);
  });
});

describe('security blocks CLI parsing', () => {
  it('parses list and clear', () => {
    expect(parseArgs(['security', 'blocks', 'list'])).toEqual({ command: 'security-blocks', action: 'list' });
    expect(parseArgs(['security', 'blocks', 'clear', '203.0.113.9', '--data-dir', 'd'])).toEqual({ command: 'security-blocks', action: 'clear', ip: '203.0.113.9', dataDir: 'd' });
    expect(() => parseArgs(['security', 'blocks', 'clear'])).toThrow();
    expect(() => parseArgs(['security'])).toThrow();
  });
});
