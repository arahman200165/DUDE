import type { SyncOp, SyncOpResult, SyncRecord } from '@dude/contracts/hub';
import { RecordBook, buildOp, canKeepBoth, forkPayload, resolveBrowserConflict, syncPolicyFor } from '@dude/sync';
import { HUB_WRITE_REFUSED, HubWebConnectionService } from './hub-web-connection.service';
import { HubWebFeedback } from './hub-web-feedback';
import { classifyHubError, type HubWebClient } from './hub-web.types';

/** One write the browser wants on the Hub. `payload` is the codec-encoded entity; null deletes it. */
export interface HubCommit {
  readonly entityType: string;
  readonly entityId: string;
  readonly schemaVersion: number;
  readonly payload: unknown;
  /** Failures are not toasted (usage counters). */
  readonly quiet?: boolean;
}

/**
 * How the local state must end up after a commit.
 * - applied: the Hub holds exactly what was written.
 * - merged: a clean three-way merge was committed; adopt `payload`.
 * - hub: adopt the Hub's version (`payload` null = it was deleted).
 * - both: adopt the Hub's version and add `fork` as a new entity.
 */
export type HubCommitResult =
  | { readonly ok: true; readonly outcome: 'applied' }
  | { readonly ok: true; readonly outcome: 'merged'; readonly payload: unknown }
  | { readonly ok: true; readonly outcome: 'hub'; readonly payload: unknown }
  | { readonly ok: true; readonly outcome: 'both'; readonly payload: unknown; readonly fork: { readonly entityId: string; readonly payload: unknown } }
  | { readonly ok: false; readonly error: string };

export interface HubWebEngineDeps {
  readonly client: HubWebClient;
  readonly book: RecordBook;
  readonly connection: HubWebConnectionService;
  readonly feedback: HubWebFeedback;
  readonly newId: () => string;
  /** Re-attaches the browser row after a `not-attached` answer; resolves when done. */
  readonly reattach?: () => Promise<void>;
  /** Called after the Hub accepted a push request (feeds the Sync status "last push"). */
  readonly onPushed?: () => void;
}

const MAX_CONFLICT_ROUNDS = 3;
const MAX_BATCH = 100;

const REJECT_TEXT: Readonly<Record<string, string>> = {
  'category-disabled': 'Web access to this kind of data is turned off on the Hub — change not saved',
  'too-large': 'That item is too large to sync — change not saved',
  'schema-too-new': 'This page is older than the Hub data — reload. Change not saved',
  'invalid-payload': 'The Hub could not accept that change',
  'not-owner-device': 'The Hub could not accept that change',
};
const rejectText = (reason: string): string => REJECT_TEXT[reason] ?? `The Hub rejected the change (${reason})`;

const nameOf = (payload: unknown): string | null =>
  typeof payload === 'object' && payload !== null && typeof (payload as { name?: unknown }).name === 'string' ? (payload as { name: string }).name : null;

/**
 * Pushes the browser's writes through the owner-session web routes and settles every outcome: bookkeeping of Hub
 * revisions, online-only refusal, rejection, and the three-way merge / conflict dialog on a revision conflict. There is
 * no outbox: a write that cannot reach the Hub fails at once and the caller rolls its optimistic change back.
 */
export class HubWebEngine {
  constructor(private readonly deps: HubWebEngineDeps) {}

  get book(): RecordBook {
    return this.deps.book;
  }

  get client(): HubWebClient {
    return this.deps.client;
  }

  get connection(): HubWebConnectionService {
    return this.deps.connection;
  }

  get feedback(): HubWebFeedback {
    return this.deps.feedback;
  }

  commit(commit: HubCommit): Promise<HubCommitResult> {
    return this.commitMany([commit]).then((r) => r[0] as HubCommitResult);
  }

  /** Commits writes in order, up to 100 per request. Results line up with `commits`. */
  async commitMany(commits: readonly HubCommit[]): Promise<HubCommitResult[]> {
    const out: HubCommitResult[] = [];
    for (let i = 0; i < commits.length; i += MAX_BATCH) out.push(...(await this.commitChunk(commits.slice(i, i + MAX_BATCH))));
    return out;
  }

  private refuse(commits: readonly HubCommit[], error: string): HubCommitResult[] {
    if (commits.some((c) => c.quiet !== true)) this.deps.feedback.notify(error);
    return commits.map(() => ({ ok: false as const, error }));
  }

  private async commitChunk(commits: readonly HubCommit[]): Promise<HubCommitResult[]> {
    const state = this.deps.connection.state();
    if (state !== 'live') return this.refuse(commits, HUB_WRITE_REFUSED[state]);

    // Captured before the push: the merge base is what the edit started from, not what a pull brings in meanwhile.
    const known = commits.map((c) => this.deps.book.get(c.entityType, c.entityId));
    const ops = commits.map((c, i) => this.op(c, known[i]?.revision ?? null, c.payload));
    const response = await this.push(ops);
    if (!response.ok) return this.refuse(commits, response.error);

    const results = new Map<string, SyncOpResult>(response.results.map((r) => [r.opId, r]));
    const out: HubCommitResult[] = [];
    for (let i = 0; i < commits.length; i++) {
      const commit = commits[i] as HubCommit;
      const result = results.get((ops[i] as SyncOp).opId);
      out.push(result ? await this.settle(commit, known[i]?.base ?? null, result, 0) : this.failure(commit, 'The Hub gave no answer for that change.'));
    }
    return out;
  }

  private op(commit: HubCommit, basedOn: number | null, payload: unknown): SyncOp {
    return buildOp({
      opId: this.deps.newId(), entityType: commit.entityType, entityId: commit.entityId, schemaVersion: commit.schemaVersion, basedOnRevision: basedOn, payload,
    }) as SyncOp;
  }

  private failure(commit: HubCommit, error: string): HubCommitResult {
    if (commit.quiet !== true) this.deps.feedback.notify(error);
    return { ok: false, error };
  }

  /** Sends ops; maps transport failures onto the connection state. */
  private async push(ops: readonly SyncOp[], retried = false): Promise<{ ok: true; results: readonly SyncOpResult[] } | { ok: false; error: string }> {
    try {
      const response = await this.deps.client.webPush(ops);
      this.deps.connection.set('live');
      this.deps.onPushed?.();
      return { ok: true, results: response.results };
    } catch (error) {
      const { kind, message } = classifyHubError(error);
      if (kind === 'not-attached' && !retried && this.deps.reattach) {
        try {
          await this.deps.reattach();
          return await this.push(ops, true);
        } catch (again) {
          return this.pushFailure(again);
        }
      }
      return this.pushFailure(error, message);
    }
  }

  private pushFailure(error: unknown, text?: string): { ok: false; error: string } {
    const { kind, message } = classifyHubError(error);
    if (kind === 'unauthorized') {
      this.deps.connection.set('session-expired');
      return { ok: false, error: HUB_WRITE_REFUSED['session-expired'] };
    }
    if (kind === 'transferred') {
      this.deps.connection.set('transferred');
      return { ok: false, error: HUB_WRITE_REFUSED.transferred };
    }
    if (kind === 'incompatible') {
      this.deps.connection.set('incompatible');
      return { ok: false, error: HUB_WRITE_REFUSED.incompatible };
    }
    if (kind === 'unreachable') {
      this.deps.connection.set('unreachable');
      return { ok: false, error: HUB_WRITE_REFUSED.unreachable };
    }
    return { ok: false, error: text ?? message };
  }

  private async settle(commit: HubCommit, base: unknown, result: SyncOpResult, round: number): Promise<HubCommitResult> {
    switch (result.status) {
      case 'applied':
      case 'duplicate':
        this.deps.book.note(commit.entityType, commit.entityId, result.revision, commit.payload);
        return { ok: true, outcome: 'applied' };
      case 'rejected':
        return this.failure(commit, rejectText(result.reason));
      case 'conflict':
        return this.resolve(commit, base, result.current, round);
    }
  }

  /** Re-pushes `payload` on the Hub's current revision; a second conflict goes round again (bounded). */
  private async repush(commit: HubCommit, base: unknown, payload: unknown, onRevision: number, round: number, outcome: 'applied' | 'merged'): Promise<HubCommitResult> {
    const op = this.op(commit, onRevision, payload);
    const response = await this.push([op]);
    if (!response.ok) return this.failure(commit, response.error);
    const result = response.results.find((r) => r.opId === op.opId);
    if (!result) return this.failure(commit, 'The Hub gave no answer for that change.');
    const next: HubCommit = { ...commit, payload };
    if (result.status === 'conflict') {
      if (round + 1 >= MAX_CONFLICT_ROUNDS) return this.failure(commit, 'The Hub kept changing underneath this edit — change not saved');
      return this.resolve(next, base, result.current, round + 1);
    }
    const settled = await this.settle(next, base, result, round + 1);
    return settled.ok && settled.outcome === 'applied' && outcome === 'merged' ? { ok: true, outcome: 'merged', payload } : settled;
  }

  private async resolve(commit: HubCommit, base: unknown, current: SyncRecord, round: number): Promise<HubCommitResult> {
    this.deps.book.noteRecord(current);
    const theirs = current.deleted ? null : current.payload;
    const policy = syncPolicyFor(commit.entityType);
    if (!policy) return this.failure(commit, 'The Hub holds a newer version of this item.');

    const decision = resolveBrowserConflict({ policy, base, mine: commit.payload, theirs });
    if (decision.kind === 'take-mine') {
      if (commit.payload === null && theirs === null) return { ok: true, outcome: 'applied' };
      return this.repush(commit, base, commit.payload, current.revision, round, 'applied');
    }
    if (decision.kind === 'merged') {
      if (decision.matchesHub) return { ok: true, outcome: 'hub', payload: theirs };
      return this.repush(commit, base, decision.payload, current.revision, round, 'merged');
    }

    const forkable = canKeepBoth(commit.entityType) && commit.payload !== null && theirs !== null;
    const choice = await this.deps.feedback.askConflict({
      entityType: commit.entityType, entityId: commit.entityId, name: nameOf(commit.payload) ?? nameOf(theirs),
      fields: decision.fields, mine: commit.payload, theirs, canKeepBoth: forkable,
    });
    if (choice === 'hub') return { ok: true, outcome: 'hub', payload: theirs };
    if (choice === 'mine') return this.repush(commit, base, commit.payload, current.revision, round, 'applied');

    const forkId = this.deps.newId();
    const copy = forkPayload(commit.payload, forkId);
    if (!forkable || copy === null) return { ok: true, outcome: 'hub', payload: theirs };
    const forkCommit: HubCommit = { ...commit, entityId: forkId, payload: copy };
    const op = this.op(forkCommit, null, copy);
    const response = await this.push([op]);
    if (!response.ok) return this.failure(commit, response.error);
    const forkResult = response.results.find((r) => r.opId === op.opId);
    if (forkResult?.status === 'applied' || forkResult?.status === 'duplicate') {
      this.deps.book.note(commit.entityType, forkId, forkResult.revision, copy);
      return { ok: true, outcome: 'both', payload: theirs, fork: { entityId: forkId, payload: copy } };
    }
    return this.failure(commit, forkResult?.status === 'rejected' ? rejectText(forkResult.reason) : 'The copy could not be saved.');
  }
}
