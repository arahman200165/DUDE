import type { NetworkInterfaceInfo } from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { addressChangeNotice, ADDRESS_META_KEY, createAddressWatch, readAddressRecord } from './address-watch.js';
import type { InterfaceMap } from './addresses.js';

const info = (address: string, family: 'IPv4' | 'IPv6' = 'IPv4') => ({ address, family, internal: false, netmask: '', mac: '', cidr: null }) as NetworkInterfaceInfo;

function setup(initial: string[]) {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  let addresses = initial;
  const events: { added: string[]; removed: string[] }[] = [];
  const watch = createAddressWatch({
    db, now: () => Date.parse('2026-10-04T00:00:00Z'),
    interfaces: (): InterfaceMap => ({ eth0: addresses.map((a) => info(a, a.includes(':') ? 'IPv6' : 'IPv4')), lo: [{ ...info('127.0.0.1'), internal: true }] }),
    audit: (_e, detail) => events.push(detail),
  });
  return { db, watch, events, set: (next: string[]) => { addresses = next; } };
}

describe('address watch', () => {
  it('the first run only records, ignoring loopback and link-local', () => {
    const s = setup(['192.168.1.5', 'fe80::1']);
    expect(s.watch.runOnce()).toMatchObject({ first: true, changed: false });
    expect(s.events).toHaveLength(0);
    expect(readAddressRecord(s.db)?.addresses).toEqual(['192.168.1.5']);
    const row = s.db.prepare('SELECT value FROM meta WHERE key = ?').get(ADDRESS_META_KEY) as { value: string };
    expect((JSON.parse(row.value) as { at: string }).at).toBe('2026-10-04T00:00:00.000Z');
  });
  it('unchanged is silent; a change emits exactly one event and updates the record', () => {
    const s = setup(['192.168.1.5']);
    s.watch.runOnce();
    s.watch.runOnce();
    expect(s.events).toHaveLength(0);
    s.set(['192.168.1.6', 'fe80::2']);
    expect(s.watch.runOnce()).toEqual({ first: false, changed: true, added: ['192.168.1.6'], removed: ['192.168.1.5'] });
    expect(s.events).toEqual([{ added: ['192.168.1.6'], removed: ['192.168.1.5'] }]);
    s.watch.runOnce();
    expect(s.events).toHaveLength(1);
    expect(readAddressRecord(s.db)?.addresses).toEqual(['192.168.1.6']);
  });
  it('bounds the audited lists to 16 entries', () => {
    const s = setup(['192.168.1.5']);
    s.watch.runOnce();
    s.set(Array.from({ length: 30 }, (_, i) => `203.0.113.${i + 1}`));
    s.watch.runOnce();
    expect(s.events[0]?.added).toHaveLength(16);
    expect(readAddressRecord(s.db)?.addresses).toHaveLength(30);
  });
  it('startup notice is a JSON line only for a change', () => {
    expect(addressChangeNotice({ first: true, changed: false, added: [], removed: [] })).toBeNull();
    const line = JSON.parse(addressChangeNotice({ first: false, changed: true, added: ['a'], removed: ['b'] }) ?? '{}') as Record<string, unknown>;
    expect(line).toMatchObject({ event: 'addresses-changed', added: ['a'], removed: ['b'] });
    expect(typeof line.hint).toBe('string');
  });
  it('start and stop are idempotent', () => {
    const s = setup(['192.168.1.5']);
    s.watch.start();
    s.watch.start();
    s.watch.stop();
    s.watch.stop();
  });
});
