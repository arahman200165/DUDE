/**
 * Browser-side bookkeeping for Hub records (Phase 31E). Structural types only: this package stays dependency-free, and
 * the wire shapes (`SyncRecord`, `SyncOp`) in `@dude/contracts/hub` are assignable to them.
 */
export interface WireRecord {
  readonly entityType: string;
  readonly entityId: string;
  readonly revision: number;
  readonly deleted: boolean;
  readonly payload: unknown;
}

export interface WireOp {
  readonly opId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly opKind: 'upsert' | 'delete';
  readonly schemaVersion: number;
  readonly basedOnRevision: number | null;
  readonly payload: unknown;
}

/** What the browser knows about one Hub entity: the last revision it saw and that version's payload (the merge base). */
export interface KnownRecord {
  /** Null when the Hub has never held the entity. A tombstone keeps its revision (later edits are based on it). */
  readonly revision: number | null;
  /** The last Hub payload; null for a tombstone or an unknown entity. */
  readonly base: unknown;
}

const UNKNOWN: KnownRecord = { revision: null, base: null };
const SEP = '\u0000';
export const recordKey = (entityType: string, entityId: string): string => `${entityType}${SEP}${entityId}`;

/** The last Hub revision and payload per entity. A revision never goes backwards: an older record is ignored. */
export class RecordBook {
  private readonly known = new Map<string, KnownRecord>();

  get(entityType: string, entityId: string): KnownRecord {
    return this.known.get(recordKey(entityType, entityId)) ?? UNKNOWN;
  }

  /** Records a Hub version. Returns false (and changes nothing) when a version at least as new is already known. */
  note(entityType: string, entityId: string, revision: number, payload: unknown): boolean {
    const key = recordKey(entityType, entityId);
    const current = this.known.get(key);
    if (current?.revision != null && current.revision >= revision) return false;
    this.known.set(key, { revision, base: payload ?? null });
    return true;
  }

  noteRecord(record: WireRecord): boolean {
    return this.note(record.entityType, record.entityId, record.revision, record.deleted ? null : record.payload);
  }

  /** True when a record is not newer than what is already known (an echo of this browser's own push, or a replay). */
  isStale(record: WireRecord): boolean {
    const current = this.known.get(recordKey(record.entityType, record.entityId));
    return current?.revision != null && current.revision >= record.revision;
  }

  /** Entity ids of one type that the Hub currently holds (not tombstoned). */
  liveIds(entityType: string): string[] {
    const out: string[] = [];
    const prefix = `${entityType}${SEP}`;
    for (const [key, value] of this.known) if (key.startsWith(prefix) && value.base !== null) out.push(key.slice(prefix.length));
    return out;
  }

  /** Every live (type, id) the Hub holds. */
  liveKeys(): { entityType: string; entityId: string }[] {
    const out: { entityType: string; entityId: string }[] = [];
    for (const [key, value] of this.known) {
      if (value.base === null) continue;
      const split = key.indexOf(SEP);
      out.push({ entityType: key.slice(0, split), entityId: key.slice(split + 1) });
    }
    return out;
  }

  clear(): void {
    this.known.clear();
  }
}
