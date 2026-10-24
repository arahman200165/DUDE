import { effect, inject, signal, untracked } from '@angular/core';
import { mergeIntoOpenEditor } from '@dude/sync';
import { RemoteChangesService } from './remote-changes.service';

/** What the editor shows when another device changed (or removed) the entity and the two cannot be merged cleanly. */
export type RemoteChangeNoticeKind = 'conflict' | 'deleted';

export interface OpenEditorMergeConfig<T> {
  /** Sync entity type, for its field rules. */
  readonly entityType: string;
  /** Id of the entity the editor holds open (a signal read), or null while it is not saved yet. */
  readonly entityId: () => string | null;
  /** The entity's current stored value, or null/undefined when it is gone. */
  readonly stored: () => T | null | undefined;
  /** The editor's current state as an entity value. */
  readonly draft: () => T;
  /** Replaces the editor's state. */
  readonly setDraft: (value: T) => void;
  /** Rejects a clean merge the editor cannot hold; it is then treated as a conflict. */
  readonly accept?: (merged: T) => boolean;
  /** Bookkeeping fields that never count as an edit. Defaults to `updatedAt`. */
  readonly ignore?: readonly string[];
}

/**
 * Applies changes another device made to the entity an editor has open (PD-113), through `RemoteChangesService`.
 * Construct it in an injection context, call `markSaved` whenever the editor loads or saves, and render
 * `<app-remote-change-notice>` from `notice()`:
 *
 * - no edits of its own: the editor adopts the remote value, silently;
 * - disjoint edits: the editor state becomes the merge and the new base is the remote value, so a later save writes
 *   the merge on top of it;
 * - same field changed on both sides, or an invalid merge: the draft stays untouched and `notice()` is `'conflict'`.
 *   `useRemote()` adopts the other version; `dismiss()` keeps the old base, so saving takes the normal sync conflict
 *   path (the desktop inbox, or the Hub web dialog);
 * - deleted elsewhere: the draft stays and `notice()` is `'deleted'`.
 *
 * Nothing runs and nothing is written here: the renderer never merges for the store, only for its own open state.
 */
export class OpenEditorMerge<T> {
  private readonly remoteChanges = inject(RemoteChangesService);
  private base: T | null;
  private seenId: string | null;
  private seenAt: number;

  /** Set while the editor's draft and the other device's version disagree. */
  readonly notice = signal<RemoteChangeNoticeKind | null>(null);

  constructor(private readonly config: OpenEditorMergeConfig<T>) {
    this.base = config.stored() ?? null;
    this.seenId = config.entityId();
    this.seenAt = this.seenId ? this.remoteChanges.changedAt(config.entityType, this.seenId) : 0;
    effect(() => {
      const id = config.entityId();
      const at = id ? this.remoteChanges.changedAt(config.entityType, id) : 0;
      if (id !== this.seenId) {
        // The editor moved to another entity (a first save assigns the id): earlier changes are not news.
        this.seenId = id;
        this.seenAt = at;
        return;
      }
      if (at <= this.seenAt) return;
      this.seenAt = at;
      untracked(() => this.onRemoteChange());
    });
  }

  /** The editor loaded or saved `value`: it is the new base and any notice no longer applies. */
  markSaved(value: T | null): void {
    this.base = value;
    this.notice.set(null);
  }

  /** "Use the other version": drops the draft for the stored value. */
  useRemote(): void {
    const remote = this.config.stored() ?? null;
    if (remote !== null) {
      this.config.setDraft(remote);
      this.base = remote;
    }
    this.notice.set(null);
  }

  /** "Keep editing": dismisses the notice; the base stays, so saving surfaces the conflict through the sync path. */
  dismiss(): void {
    this.notice.set(null);
  }

  private onRemoteChange(): void {
    const remote = this.config.stored() ?? null;
    if (remote === null && this.base === null) return;
    const outcome = mergeIntoOpenEditor(this.config.entityType, this.base, this.config.draft(), remote, {
      accept: this.config.accept,
      ignore: this.config.ignore ?? ['updatedAt'],
    });
    switch (outcome.kind) {
      case 'unchanged':
        this.notice.set(null);
        break;
      case 'adopt':
      case 'merged':
        // The base becomes the remote value either way, so a later save writes the merge on top of it.
        this.config.setDraft(outcome.value);
        this.markSaved(remote);
        break;
      case 'conflict':
        this.notice.set('conflict');
        break;
      case 'deleted':
        this.notice.set('deleted');
        break;
    }
  }
}
