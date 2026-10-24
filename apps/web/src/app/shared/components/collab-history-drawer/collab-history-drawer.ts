import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import type { CollabSnapshotSummary } from '@dude/contracts/hub';
import { formatBytes } from '@dude/tool-engine/shared/fs/format-size';
import { HubAdminError, isCollabConsentRefusal } from '../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../core/hub/hub-admin.token';

/** One note of a scratchpad snapshot, as the preview shows it. */
export interface CollabHistorySnippet {
  readonly title: string;
  readonly body: string;
}

/** How a snapshot is previewed: one text (a script or Markdown body) or a list of notes (the scratchpad). */
export type CollabHistoryPreviewKind = 'text' | 'snippets';
export type CollabHistoryPreview = string | readonly CollabHistorySnippet[];
/** Turns a snapshot's record payload into what the preview shows. Never trust the payload's shape. */
export type CollabHistoryPreviewFn = (payload: Readonly<Record<string, unknown>>) => CollabHistoryPreview;

/** A text preview of one string field of the record payload (`body` for a user script or a Markdown document). */
export function collabTextPreview(field = 'body'): CollabHistoryPreviewFn {
  return (payload) => (typeof payload[field] === 'string' ? payload[field] : '');
}

/** The scratchpad payload's `snippets` as a note list; malformed entries are skipped. */
export const collabSnippetsPreview: CollabHistoryPreviewFn = (payload) => {
  const raw = payload['snippets'];
  if (!Array.isArray(raw)) return [];
  const out: CollabHistorySnippet[] = [];
  for (const entry of raw as unknown[]) {
    if (typeof entry !== 'object' || entry === null) continue;
    const e = entry as Record<string, unknown>;
    out.push({ title: typeof e['title'] === 'string' ? e['title'] : '', body: typeof e['body'] === 'string' ? e['body'] : '' });
  }
  return out;
};

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [['day', 86_400], ['hour', 3_600], ['minute', 60]];

/** "just now", "5 minutes ago", "yesterday"... for an ISO instant relative to `now`; an unparsable instant gives ''. */
export function relativeTimeLabel(iso: string, now: number): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.round((then - now) / 1000);
  if (Math.abs(seconds) < 45) return 'just now';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size || unit === 'minute') return RELATIVE.format(Math.round(seconds / size), unit);
  }
  return '';
}

export const COLLAB_HISTORY_CONSENT_MESSAGE = 'Version history needs this document\'s sync category. Turn it on in Settings › Sync, then try again.';

const messageOf = (error: unknown): string => {
  if (isCollabConsentRefusal(error)) return COLLAB_HISTORY_CONSENT_MESSAGE;
  return error instanceof HubAdminError || error instanceof Error ? error.message : 'Your Hub could not be reached.';
};

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Version history of a persisted collaborative document (PD-105): the Hub's snapshots newest first, a read-only preview of the
 * selected one, and "Restore this version" behind an inline confirm. A restore is a forward edit on the Hub (it snapshots the current
 * state first, so nothing is lost); the live document receives it through the collaboration socket, so the host only closes this
 * dialog on `restored`. A modal dialog: focus is trapped and returns to the opener on close, Escape closes. Works through `HUB_ADMIN`
 * (Hub web cookie session, desktop device token); hosts show it only while the document is live.
 */
@Component({
  selector: 'app-collab-history-drawer',
  imports: [CdkTrapFocus],
  templateUrl: './collab-history-drawer.html',
})
export class CollabHistoryDrawer {
  private readonly admin = inject(HUB_ADMIN);

  /** The persisted document key (`scratchpad:default`, `user-script:<id>`, `markdown-doc:<id>`). */
  readonly doc = input.required<string>();
  readonly kind = input.required<CollabHistoryPreviewKind>();
  readonly preview = input.required<CollabHistoryPreviewFn>();
  /** What the document is called in the copy ("scratchpad", "script", "document"). */
  readonly label = input('document');

  readonly closed = output<void>();
  readonly restored = output<{ readonly snapshotId: string; readonly takenAt: string }>();

  protected readonly listState = signal<LoadState>('loading');
  protected readonly listError = signal('');
  protected readonly snapshots = signal<readonly CollabSnapshotSummary[]>([]);
  protected readonly selectedId = signal<string | null>(null);
  protected readonly previewState = signal<LoadState>('loading');
  protected readonly previewError = signal('');
  protected readonly previewData = signal<CollabHistoryPreview | null>(null);
  protected readonly confirming = signal(false);
  protected readonly restoring = signal(false);
  protected readonly revertError = signal('');
  /** The instant relative times are measured from, fixed when the list loads. */
  protected readonly now = signal(Date.now());

  protected readonly selected = computed(() => this.snapshots().find((s) => s.id === this.selectedId()) ?? null);
  protected readonly previewText = computed(() => {
    const data = this.previewData();
    return typeof data === 'string' ? data : null;
  });
  protected readonly previewSnippets = computed(() => {
    const data = this.previewData();
    return Array.isArray(data) ? (data as readonly CollabHistorySnippet[]) : null;
  });

  private previewRequest = 0;

  constructor() {
    effect(() => {
      const doc = this.doc();
      untracked(() => void this.load(doc));
    });
  }

  protected when(iso: string): string {
    return relativeTimeLabel(iso, this.now()) || iso;
  }

  protected exact(iso: string): string {
    const at = new Date(iso);
    return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
  }

  protected size(bytes: number): string {
    return formatBytes(bytes);
  }

  private async load(doc: string): Promise<void> {
    this.listState.set('loading');
    this.listError.set('');
    try {
      const { snapshots } = await this.admin.listCollabHistory(doc);
      const newestFirst = [...snapshots].sort((a, b) => Date.parse(b.takenAt) - Date.parse(a.takenAt));
      this.now.set(Date.now());
      this.snapshots.set(newestFirst);
      this.listState.set('ready');
      if (newestFirst.length > 0) this.select(newestFirst[0].id);
    } catch (error) {
      this.snapshots.set([]);
      this.listError.set(messageOf(error));
      this.listState.set('error');
    }
  }

  protected select(id: string): void {
    if (this.selectedId() === id && this.previewState() !== 'error') return;
    this.selectedId.set(id);
    this.confirming.set(false);
    this.revertError.set('');
    void this.loadPreview(id);
  }

  private async loadPreview(id: string): Promise<void> {
    const request = ++this.previewRequest;
    this.previewState.set('loading');
    this.previewError.set('');
    this.previewData.set(null);
    try {
      const snapshot = await this.admin.getCollabSnapshot(id);
      if (request !== this.previewRequest) return;
      this.previewData.set(this.preview()(snapshot.payload));
      this.previewState.set('ready');
    } catch (error) {
      if (request !== this.previewRequest) return;
      this.previewError.set(messageOf(error));
      this.previewState.set('error');
    }
  }

  protected askRestore(): void {
    this.revertError.set('');
    this.confirming.set(true);
  }

  protected cancelRestore(): void {
    this.confirming.set(false);
  }

  /** The second step: the Hub applies the snapshot as a new edit (after saving the current version to history). */
  protected async confirmRestore(): Promise<void> {
    const snapshot = this.selected();
    if (snapshot === null || this.restoring()) return;
    this.restoring.set(true);
    this.revertError.set('');
    try {
      await this.admin.restoreCollabSnapshot(snapshot.id);
      this.confirming.set(false);
      this.restored.emit({ snapshotId: snapshot.id, takenAt: snapshot.takenAt });
    } catch (error) {
      this.revertError.set(messageOf(error));
    } finally {
      this.restoring.set(false);
    }
  }

  protected close(): void {
    this.closed.emit();
  }
}
