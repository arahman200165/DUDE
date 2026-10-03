import type { SyncOp, SyncOpResult, SyncRecord, SyncStateReport } from '@dude/contracts/hub';
import { RecordBook } from '@dude/sync';
import { HubWebConnectionService } from '../hub-web-connection.service';
import { HubWebEngine } from '../hub-web-engine';
import { HubWebFeedback } from '../hub-web-feedback';
import type { HubWebAccess, HubWebClient } from '../hub-web.types';

export const ALL_ON: HubWebAccess = {
  settings: true, favorites: true, pipelines: true, projects: true, workspaces: true, home: true, usage: true, 'workspace-layout': true, scratchpad: true,
};

export function apiError(status: number, code = 'error'): Error {
  return Object.assign(new Error(`${status} ${code}`), { name: 'HubApiError', status, code });
}

/** A tiny in-memory Hub: revisions, based-on checks and a change feed. */
export class FakeHub implements HubWebClient {
  head = 0;
  readonly records = new Map<string, SyncRecord>();
  readonly pushes: SyncOp[][] = [];
  readonly states: SyncStateReport[] = [];
  /** Throws this on every call while set (a down Hub, a 401). */
  failWith: Error | null = null;
  rejectReason: string | null = null;
  access: HubWebAccess = { ...ALL_ON };
  changeLimit = 1000;

  private key = (t: string, id: string): string => `${t}\u0000${id}`;

  /** A write made by another device. */
  external(entityType: string, entityId: string, payload: unknown | null): SyncRecord {
    const record: SyncRecord = {
      entityType, entityId, revision: ++this.head, deleted: payload === null, payload, schemaVersion: 1, updatedAt: new Date(0).toISOString(), updatedByDeviceId: 'other',
    };
    this.records.set(this.key(entityType, entityId), record);
    return record;
  }

  private guard(): void {
    if (this.failWith) throw this.failWith;
  }

  webAttach = async (): Promise<never> => {
    this.guard();
    throw new Error('unused');
  };

  webSnapshot = async (): Promise<{ records: SyncRecord[]; asOfRevision: number; next: null; floor: number }> => {
    this.guard();
    return { records: [...this.records.values()].filter((r) => !r.deleted), asOfRevision: this.head, next: null, floor: 0 };
  };

  webChanges = async (after: number, limit?: number): Promise<{ changes: SyncRecord[]; cursor: number; hasMore: boolean; floor: number; headRevision: number }> => {
    this.guard();
    const all = [...this.records.values()].filter((r) => r.revision > after).sort((a, b) => a.revision - b.revision);
    const page = all.slice(0, Math.min(limit ?? this.changeLimit, this.changeLimit));
    const cursor = page.length > 0 ? (page[page.length - 1] as SyncRecord).revision : Math.max(after, this.head);
    return { changes: page, cursor: page.length === all.length ? Math.max(cursor, this.head) : cursor, hasMore: page.length < all.length, floor: 0, headRevision: this.head };
  };

  webPush = async (ops: readonly SyncOp[]): Promise<{ results: SyncOpResult[]; headRevision: number }> => {
    this.guard();
    this.pushes.push([...ops]);
    const results: SyncOpResult[] = [];
    for (const op of ops) {
      if (this.rejectReason) {
        results.push({ opId: op.opId, status: 'rejected', reason: this.rejectReason as 'category-disabled' });
        continue;
      }
      const current = this.records.get(this.key(op.entityType, op.entityId));
      if ((current?.revision ?? null) !== op.basedOnRevision && current !== undefined) {
        results.push({ opId: op.opId, status: 'conflict', current });
        continue;
      }
      const record: SyncRecord = {
        entityType: op.entityType, entityId: op.entityId, revision: ++this.head, deleted: op.opKind === 'delete', payload: op.opKind === 'delete' ? null : op.payload,
        schemaVersion: op.schemaVersion, updatedAt: new Date(0).toISOString(), updatedByDeviceId: 'me',
      };
      this.records.set(this.key(op.entityType, op.entityId), record);
      results.push({ opId: op.opId, status: 'applied', revision: record.revision });
    }
    return { results, headRevision: this.head };
  };

  webState = async (report: SyncStateReport): Promise<{ floor: number; headRevision: number; retentionDays: number }> => {
    this.guard();
    this.states.push(report);
    return { floor: 0, headRevision: this.head, retentionDays: 30 };
  };

  webAccessGet = async (): Promise<{ access: HubWebAccess }> => {
    this.guard();
    return { access: this.access };
  };

  webAccessSet = async (): Promise<{ access: HubWebAccess }> => ({ access: this.access });
}

export interface Rig {
  readonly hub: FakeHub;
  readonly book: RecordBook;
  readonly connection: HubWebConnectionService;
  readonly feedback: HubWebFeedback;
  readonly engine: HubWebEngine;
}

export function makeRig(): Rig {
  const hub = new FakeHub();
  const book = new RecordBook();
  const connection = new HubWebConnectionService();
  const feedback = new HubWebFeedback();
  let n = 0;
  const engine = new HubWebEngine({ client: hub as unknown as HubWebClient, book, connection, feedback, newId: () => `id-${++n}` });
  return { hub, book, connection, feedback, engine };
}
