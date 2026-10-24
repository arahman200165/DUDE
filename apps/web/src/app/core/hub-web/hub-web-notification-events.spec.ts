import { HubWebNotificationEvents } from './hub-web-notification-events';

const GOOD = { id: 'n1', kind: 'backup-failed', severity: 'error', title: 'Backup failed' };

describe('HubWebNotificationEvents (PD-109)', () => {
  it('delivers a valid notification event to every listener, rebuilt without extra fields', () => {
    const feed = new HubWebNotificationEvents();
    const a: unknown[] = [];
    const b: unknown[] = [];
    feed.subscribe((n) => a.push(n));
    feed.subscribe((n) => b.push(n));
    feed.notify({ ...GOOD, body: 'never shown here', extra: 1 });
    expect(a).toEqual([GOOD]);
    expect(b).toEqual([GOOD]);
  });

  it('drops malformed payloads: unknown kind or severity, empty or oversized id or title, missing fields, non-objects', () => {
    const feed = new HubWebNotificationEvents();
    const seen: unknown[] = [];
    feed.subscribe((n) => seen.push(n));
    for (const bad of [
      { ...GOOD, kind: 'other' }, { ...GOOD, severity: 'fatal' }, { ...GOOD, id: '' }, { ...GOOD, id: 'a'.repeat(65) }, { ...GOOD, title: 'x'.repeat(121) },
      { ...GOOD, id: 7 }, { id: 'n1' }, {}, null, undefined, 'n1', [GOOD],
    ]) feed.notify(bad);
    expect(seen).toEqual([]);
  });

  it('stops delivering after unsubscribe and survives a throwing listener', () => {
    const feed = new HubWebNotificationEvents();
    const seen: unknown[] = [];
    feed.subscribe(() => { throw new Error('bad listener'); });
    const off = feed.subscribe((n) => seen.push(n));
    feed.notify(GOOD);
    expect(seen).toHaveLength(1);
    off();
    feed.notify(GOOD);
    expect(seen).toHaveLength(1);
  });
});
