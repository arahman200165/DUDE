import { computed, effect, inject, signal, untracked } from '@angular/core';
import { MARKDOWN_TEXT } from '@dude/collab-doc';
import type { CollabDocumentSummary, CollabRoom } from '@dude/contracts/hub';
import { COLLAB_DOCUMENT_TITLE_MAX, COLLAB_ROOM_NAME_MAX } from '@dude/contracts/hub';
import { CollabTextSession } from '../../core/collab/collab-text-session';
import { HubAdminError, isCollabConsentRefusal } from '../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../core/hub/hub-admin.token';
import { PlatformService } from '../../core/platform/platform.service';
import { SyncStatusService } from '../../core/sync/sync-status.service';

/** What the editor is bound to on the Hub: an ephemeral room or a kept `markdown-doc` record. */
export interface HubRoomTarget {
  readonly kind: 'room' | 'doc';
  readonly id: string;
  readonly name: string;
}

export type KeptDocumentsState = 'idle' | 'loading' | 'ready' | 'consent-required' | 'error';

export const HUB_ROOM_CONSENT_MESSAGE = 'Kept documents need the "Markdown documents" sync category. Turn it on in Settings › Sync, then try again.';

const ID = /^[A-Za-z0-9_-]{1,64}$/;

const docKeyOf = (target: HubRoomTarget | null): string | null =>
  target === null || !ID.test(target.id) ? null : `${target.kind === 'room' ? 'room' : 'markdown-doc'}:${target.id}`;

const messageOf = (error: unknown): string =>
  error instanceof HubAdminError || error instanceof Error ? error.message : 'Your Hub could not be reached.';

/**
 * The Markdown Workspace's third collaboration mode (PD-104): rooms on the user's own Hub, next to the LAN server and the BYO relay.
 * Available only where Hub collaboration is (Hub web, and a desktop enrolled in a Hub; PD-114); Pages and standalone builds never see
 * it. A room lives in Hub memory only; "Keep on Hub" persists it as a `markdown-doc` record after a disclosure, and kept documents
 * can be reopened or deleted. Construct it in an injection context.
 */
export class MarkdownHubRooms {
  private readonly admin = inject(HUB_ADMIN);
  private readonly platform = inject(PlatformService);
  private readonly sync = inject(SyncStatusService);

  readonly target = signal<HubRoomTarget | null>(null);
  readonly session = new CollabTextSession({ docKey: () => docKeyOf(this.target()), textName: MARKDOWN_TEXT });

  /** Hub web, or a desktop enrolled in a Hub with the collaboration relay. */
  readonly available = computed(() => this.session.available && (this.platform.hostKind === 'hub-web' || this.sync.enrolled()));

  readonly rooms = signal<readonly CollabRoom[]>([]);
  readonly documents = signal<readonly CollabDocumentSummary[]>([]);
  readonly documentsState = signal<KeptDocumentsState>('idle');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly roomName = signal('');
  /** The "Keep on Hub" disclosure is open. */
  readonly keepOpen = signal(false);
  readonly keepTitle = signal('');
  /** The kept document awaiting the second click of its delete. */
  readonly confirmDeleteId = signal<string | null>(null);
  readonly nameMax = COLLAB_ROOM_NAME_MAX;
  readonly titleMax = COLLAB_DOCUMENT_TITLE_MAX;

  /** The text a room this page just started is seeded with, once its (empty) shared text is live. */
  private readonly pendingSeed = signal<string | null>(null);

  /** A line for the status of the held document. */
  readonly statusLabel = computed(() => {
    const mode = this.session.mode();
    if (mode === 'live') return this.session.linkUp() ? 'Live' : 'Live, reconnecting';
    if (mode === 'read-only') return 'Reconnecting';
    return this.session.refusal() === null ? 'Connecting' : 'Not connected';
  });

  /** Why the Hub refused the held document, in words; null when it did not. */
  readonly refusalMessage = computed(() => {
    const code = this.session.refusal();
    switch (code) {
      case null: return null;
      case 'consent-required':
      case 'consent-revoked': return HUB_ROOM_CONSENT_MESSAGE;
      case 'not-found': return this.target()?.kind === 'room' ? 'This room has closed. Start a new one, or open a kept document.' : 'This document was deleted.';
      case 'limit': return 'This room is full, or this page already has as many Hub documents open as it can.';
      case 'too-large': return 'This document is too large to share through your Hub.';
      case 'unavailable': return 'Your Hub closed this room.';
      default: return 'Your Hub refused this document.';
    }
  });

  constructor() {
    effect(() => {
      const seed = this.pendingSeed();
      const binding = this.session.binding();
      if (seed === null || binding === null) return;
      untracked(() => {
        // Only an empty room takes the starter's text; someone may have typed first.
        if (binding.ytext.length === 0 && seed.length > 0) this.session.setText(seed);
        this.pendingSeed.set(null);
      });
    });
  }

  /** Re-reads the open rooms and the kept documents. */
  async refresh(): Promise<void> {
    if (!this.available()) return;
    this.error.set('');
    try {
      this.rooms.set((await this.admin.listCollabRooms()).rooms);
    } catch (error) {
      this.error.set(messageOf(error));
    }
    await this.refreshDocuments();
  }

  async refreshDocuments(): Promise<void> {
    this.documentsState.set('loading');
    try {
      this.documents.set((await this.admin.listCollabDocuments()).documents);
      this.documentsState.set('ready');
    } catch (error) {
      this.documents.set([]);
      this.documentsState.set(isCollabConsentRefusal(error) ? 'consent-required' : 'error');
    }
  }

  /** Creates a room and joins it; the room starts with `text` (the editor's current Markdown). */
  async startRoom(text: string): Promise<void> {
    const name = this.roomName().trim();
    if (name === '' || this.busy()) return;
    await this.run(async () => {
      const room = await this.admin.createCollabRoom(name.slice(0, COLLAB_ROOM_NAME_MAX));
      this.roomName.set('');
      this.pendingSeed.set(text);
      this.open({ kind: 'room', id: room.id, name: room.name });
      this.rooms.update((rooms) => [...rooms.filter((r) => r.id !== room.id), room]);
    });
  }

  joinRoom(room: CollabRoom): void {
    this.pendingSeed.set(null);
    this.open({ kind: 'room', id: room.id, name: room.name });
  }

  openDocument(doc: CollabDocumentSummary): void {
    this.pendingSeed.set(null);
    this.open({ kind: 'doc', id: doc.id, name: doc.title });
  }

  /** Lets go of the room or document; the editor keeps the last text as a plain local draft. */
  leave(): void {
    this.pendingSeed.set(null);
    this.keepOpen.set(false);
    this.target.set(null);
  }

  /** Step one of "Keep on Hub": the disclosure (destination, readers, retention, category). */
  openKeep(): void {
    const target = this.target();
    if (target?.kind !== 'room') return;
    this.keepTitle.set(target.name.slice(0, COLLAB_DOCUMENT_TITLE_MAX));
    this.keepOpen.set(true);
  }

  cancelKeep(): void {
    this.keepOpen.set(false);
  }

  /** Step two: persists the room as a kept document and switches the editor to it. */
  async keep(): Promise<void> {
    const target = this.target();
    const title = this.keepTitle().trim();
    if (target?.kind !== 'room' || title === '' || this.busy()) return;
    await this.run(async () => {
      try {
        const { entityId } = await this.admin.keepCollabRoom(target.id, title.slice(0, COLLAB_DOCUMENT_TITLE_MAX));
        this.keepOpen.set(false);
        this.open({ kind: 'doc', id: entityId, name: title });
        await this.refreshDocuments();
      } catch (error) {
        if (!isCollabConsentRefusal(error)) throw error;
        this.documentsState.set('consent-required');
        this.error.set(HUB_ROOM_CONSENT_MESSAGE);
      }
    });
  }

  requestDelete(id: string): void {
    this.confirmDeleteId.set(id);
  }

  cancelDelete(): void {
    this.confirmDeleteId.set(null);
  }

  /** The second click: deletes the kept document from the Hub for every device; an open copy is let go first. */
  async confirmDelete(): Promise<void> {
    const id = this.confirmDeleteId();
    if (id === null || this.busy()) return;
    await this.run(async () => {
      if (this.target()?.kind === 'doc' && this.target()?.id === id) this.leave();
      try {
        await this.admin.deleteCollabDocument(id);
      } catch (error) {
        if (!isCollabConsentRefusal(error)) throw error;
        this.documentsState.set('consent-required');
        this.error.set(HUB_ROOM_CONSENT_MESSAGE);
        return;
      } finally {
        this.confirmDeleteId.set(null);
      }
      this.documents.update((docs) => docs.filter((d) => d.id !== id));
    });
  }

  private open(target: HubRoomTarget): void {
    this.keepOpen.set(false);
    this.error.set('');
    this.target.set(target);
  }

  private async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await work();
    } catch (error) {
      this.error.set(messageOf(error));
    } finally {
      this.busy.set(false);
    }
  }
}
