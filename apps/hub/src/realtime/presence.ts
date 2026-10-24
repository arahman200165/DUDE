import type { PresenceActivity, PresenceEntry } from '@dude/contracts/hub';

/**
 * Who is online (PD-108): a registry row counts while at least one helloed socket speaks for it. Desktops and phones
 * count through their device socket, browsers through the owner cookie socket of the session bound to their row.
 * Activity is the last value the row reported, kept in memory only and dropped when the row goes offline.
 */
export class PresenceTracker {
  private readonly counts = new Map<string, number>();
  private readonly activities = new Map<string, PresenceActivity>();

  /** Returns true when the row came online. */
  connect(deviceId: string): boolean {
    const before = this.counts.get(deviceId) ?? 0;
    this.counts.set(deviceId, before + 1);
    return before === 0;
  }

  /** Returns true when the row went offline. */
  disconnect(deviceId: string): boolean {
    const after = Math.max(0, (this.counts.get(deviceId) ?? 0) - 1);
    if (after > 0) { this.counts.set(deviceId, after); return false; }
    const was = this.counts.delete(deviceId);
    this.activities.delete(deviceId);
    return was;
  }

  /** Returns true when the stored activity changed. Ignored for a row that is not online. */
  setActivity(deviceId: string, activity: PresenceActivity | null): boolean {
    if (!this.isOnline(deviceId)) return false;
    const before = this.activities.get(deviceId) ?? null;
    if (sameActivity(before, activity)) return false;
    if (activity === null) this.activities.delete(deviceId);
    else this.activities.set(deviceId, activity);
    return true;
  }

  isOnline(deviceId: string): boolean {
    return (this.counts.get(deviceId) ?? 0) > 0;
  }

  entry(deviceId: string): PresenceEntry {
    return { deviceId, online: this.isOnline(deviceId), activity: this.activities.get(deviceId) ?? null };
  }

  /** Every online row. */
  entries(): PresenceEntry[] {
    return [...this.counts.keys()].map((id) => this.entry(id));
  }
}

function sameActivity(a: PresenceActivity | null, b: PresenceActivity | null): boolean {
  return a === b || (a !== null && b !== null && a.kind === b.kind && a.id === b.id);
}
