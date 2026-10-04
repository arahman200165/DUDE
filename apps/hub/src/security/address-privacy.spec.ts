import { afterEach, describe, expect, it } from 'vitest';
import { parseArgs } from '../cli/args.js';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { buildAdminMethods } from '../admin/methods.js';
import { createSession } from '../auth/sessions.js';
import { tempDir } from '../server/test-helpers.js';
import { audit, listAudit } from './audit.js';
import { getAuditIpMode, maskAddress, setAuditIpMode, truncateAddress } from './address-privacy.js';
import { THROTTLE_FREE_FAILURES, recordFailureKeys, throttleKeys } from './throttle.js';

const opened: HubDb[] = [];
function open() {
  const paths = ensureLayout(tempDir('hub-privacy-'));
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  return { hub: result.hub, paths };
}
afterEach(() => { for (const h of opened.splice(0)) { try { h.close(); } catch { /* closed */ } } });

describe('address truncation', () => {
  it('truncates IPv4, IPv6, mapped IPv4 and leaves unknown alone', () => {
    expect(truncateAddress('203.0.113.77')).toBe('203.0.113.0');
    expect(truncateAddress('2001:db8:abcd:12:34:56:78:9a')).toBe('2001:db8:abcd::');
    expect(truncateAddress('2001:db8::1')).toBe('2001:db8::');
    expect(truncateAddress('fe80::1%eth0')).toBe('fe80::');
    expect(truncateAddress('::1')).toBe('::');
    expect(truncateAddress('::ffff:203.0.113.77')).toBe('203.0.113.0');
    expect(truncateAddress('unknown')).toBe('unknown');
    expect(truncateAddress('not an address')).toBe('unknown');
  });

  it('defaults to full, only masks in truncated mode', () => {
    const { hub } = open();
    expect(getAuditIpMode(hub.db)).toBe('full');
    expect(maskAddress(hub.db, '203.0.113.77')).toBe('203.0.113.77');
    setAuditIpMode(hub.db, 'truncated');
    expect(getAuditIpMode(hub.db)).toBe('truncated');
    expect(maskAddress(hub.db, '203.0.113.77')).toBe('203.0.113.0');
    expect(maskAddress(hub.db, undefined)).toBeUndefined();
    expect(maskAddress(hub.db, 'unknown')).toBe('unknown');
  });

  it('masks audit rows and new sessions in truncated mode, but never throttle keys', () => {
    const { hub } = open();
    const db = hub.db;
    audit(db, { event: 'hub.started', outcome: 'success', actorKind: 'system', ip: '203.0.113.77', now: 1000 });
    setAuditIpMode(db, 'truncated');
    audit(db, { event: 'hub.started', outcome: 'success', actorKind: 'system', ip: '203.0.113.77', now: 2000 });
    const rows = listAudit(db).filter((r) => r.event === 'hub.started');
    expect(rows.map((r) => r.ip)).toEqual(['203.0.113.0', '203.0.113.77']); // existing rows are not rewritten

    db.exec('PRAGMA foreign_keys = OFF');
    const created = createSession(db, { ownerId: 'o1', kind: 'cookie', ip: '203.0.113.77', now: 3000 });
    expect(created.record.ip).toBe('203.0.113.0');
    expect((db.prepare('SELECT ip FROM sessions').get() as { ip: string }).ip).toBe('203.0.113.0');

    const keys = throttleKeys.password('203.0.113.77');
    for (let i = 0; i <= THROTTLE_FREE_FAILURES; i++) recordFailureKeys(db, keys, 5000 + i);
    const stored = (db.prepare('SELECT throttle_key FROM throttle').all() as { throttle_key: string }[]).map((r) => r.throttle_key);
    expect(stored).toContain('password:ip:203.0.113.77');
    expect(listAudit(db).find((r) => r.event === 'throttle.locked' && r.ip !== null)?.ip).toBe('203.0.113.0');
  });
});

describe('audit-ips admin methods and CLI', () => {
  it('gets, sets, audits and validates', async () => {
    const { hub, paths } = open();
    const methods = buildAdminMethods({
      db: hub.db, hubVersion: 't', hubInstanceId: hub.hubInstanceId, bind: 'loopback', getPort: () => 1, startedAt: 0,
      configDir: paths.configDir, spkiSha256: 'x', now: () => 1_000_000,
    });
    expect(await methods['security.audit-ips.get']!({})).toEqual({ mode: 'full' });
    expect(await methods['security.audit-ips.set']!({ mode: 'truncated' })).toEqual({ mode: 'truncated' });
    expect(getAuditIpMode(hub.db)).toBe('truncated');
    const event = listAudit(hub.db).find((r) => r.event === 'security.audit-ips-changed');
    expect(event?.detail).toEqual({ mode: 'truncated' });
    expect(event?.actorKind).toBe('cli');
    await expect(Promise.resolve().then(() => methods['security.audit-ips.set']!({ mode: 'weird' }))).rejects.toThrow(/mode/);
  });

  it('parses the CLI command', () => {
    expect(parseArgs(['security', 'audit-ips'])).toEqual({ command: 'security-audit-ips' });
    expect(parseArgs(['security', 'audit-ips', 'truncated', '--data-dir', 'd'])).toEqual({ command: 'security-audit-ips', mode: 'truncated', dataDir: 'd' });
    expect(() => parseArgs(['security', 'audit-ips', 'half'])).toThrow();
  });
});
