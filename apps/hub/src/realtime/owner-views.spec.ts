import { afterEach, describe, expect, it } from 'vitest';
import { ensureLayout } from '../config/data-dir.js';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { tempDir } from '../server/test-helpers.js';
import { audit, onAudit } from '../security/audit.js';
import type { AuditNotice } from '../security/audit.js';
import { ownerViewTopicsForAudit } from './owner-views.js';

const opened: HubDb[] = [];
function open(): HubDb {
  const paths = ensureLayout(tempDir('hub-views-'));
  const result = openHubDb({ dbFile: paths.dbFile, preMigrationDir: paths.preMigrationDir });
  if (result.status !== 'ready') throw new Error('not ready');
  opened.push(result.hub);
  return result.hub;
}
afterEach(() => { for (const h of opened.splice(0)) { try { h.close(); } catch { /* already closed */ } } });

const notice = (event: string, detail: Record<string, unknown> | null = null): AuditNotice =>
  ({ seq: 1, event, outcome: 'success', actorKind: 'system', actorId: null, at: '', detail }) as AuditNotice;

describe('audit observers', () => {
  it('see each row after it is written, without the address, and never fail the audited action', () => {
    const { db } = open();
    const seen: AuditNotice[] = [];
    const stop = onAudit(db, (n) => seen.push(n));
    onAudit(db, () => { throw new Error('observer failure'); });
    audit(db, { event: 'backup.created', outcome: 'success', actorKind: 'system', ip: '203.0.113.9', detail: { bytes: 5 }, now: Date.UTC(2026, 9, 24) });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ event: 'backup.created', detail: { bytes: 5 }, at: '2026-10-24T00:00:00.000Z' });
    expect(seen[0]!.seq).toBeGreaterThan(0);
    expect(JSON.stringify(seen[0])).not.toContain('203.0.113');
    stop();
    audit(db, { event: 'backup.created', outcome: 'success', actorKind: 'system', now: Date.now() });
    expect(seen).toHaveLength(1);
  });
});

describe('owner view topics', () => {
  it('maps audit domains to the views they make stale', () => {
    expect(ownerViewTopicsForAudit(notice('device.enrolled'))).toEqual(['devices', 'alerts']);
    expect(ownerViewTopicsForAudit(notice('sync.pushed'))).toEqual(['sync']);
    expect(ownerViewTopicsForAudit(notice('backup.failed'))).toEqual(['backup']);
    expect(ownerViewTopicsForAudit(notice('network.address-changed'))).toEqual(['diagnostics', 'alerts']);
    expect(ownerViewTopicsForAudit(notice('owner.sign-in', { newAddress: false }))).toEqual([]);
    expect(ownerViewTopicsForAudit(notice('owner.sign-in', { newAddress: true }))).toEqual(['alerts']);
  });
});
