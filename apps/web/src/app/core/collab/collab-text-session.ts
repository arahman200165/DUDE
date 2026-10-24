import { DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import type * as Y from 'yjs';
import { applyTextTo } from '@dude/collab-doc';
import type { Awareness } from 'y-protocols/awareness';
import { SyncStatusService } from '../sync/sync-status.service';
import { CollabDocService } from './collab-doc.service';
import type { CollabSession, CollabStatus } from './collab-doc.service';
import { HUB_COLLAB, UNAVAILABLE_COLLAB_TRANSPORT } from './hub-collab.token';

/** How long a desktop keeps editing the live document after the Hub link drops before it falls back to local saves (PD-106). */
export const COLLAB_TEXT_GRACE_MS = 10_000;

/**
 * `live`: the text is a shared Y.Text and every edit is live. `local`: the editor's own value and Save (no transport, a
 * refusal, or a desktop whose Hub link was lost). `read-only`: Hub web while the Hub is unreachable (shared writes there are
 * online-only).
 */
export type CollabTextMode = 'live' | 'local' | 'read-only';

/** What a bound editor needs; structurally a `CodeEditorBinding`. */
export interface CollabTextBinding {
  readonly ytext: Y.Text;
  readonly awareness: Awareness;
}

export interface CollabTextSessionConfig {
  /** The collab doc key to hold (`user-script:<id>`, `markdown-doc:<id>`, `room:<id>`), or null while the text is not collaborative. */
  readonly docKey: () => string | null;
  /** The Y.Text name inside the document (`body`, `markdown`). */
  readonly textName: string;
  /** Desktop only: the live text when the link is lost for good, so the editor's local value and Save carry it on. */
  readonly keepLocally?: (text: string) => void;
  /** Desktop only: false while the editor holds unsaved local edits, so the return to a live document waits for Save. */
  readonly canPromote?: () => boolean;
}

/**
 * One collaborative text (PD-099, PD-106) for an editor that otherwise edits a plain value: the user-script body and Markdown
 * documents and rooms. Construct it in an injection context. While `docKey()` names a document and a Hub collaboration
 * transport exists it holds the document open; `binding()` is the editor's Y.Text binding in `live` mode and null otherwise.
 *
 * On a desktop the live document stays editable for {@link COLLAB_TEXT_GRACE_MS} after the link drops; then the text is handed
 * to `keepLocally` and the mode is `local` (the editor saves through the outbox as before). Once the link is live again and
 * nothing is pending in the outbox (and `canPromote` allows it) a fresh document takes over, so edits made while down are merged by the Hub (PD-102), never
 * applied twice.
 */
export class CollabTextSession {
  private readonly collab = inject(CollabDocService);
  private readonly transport = inject(HUB_COLLAB);
  private readonly sync = inject(SyncStatusService);

  /** Whether this environment can collaborate at all (false on Pages, standalone and a desktop without the relay). */
  readonly available = this.transport !== UNAVAILABLE_COLLAB_TRANSPORT;
  private readonly editableDown = this.transport.editableWhenDown;

  private readonly session = signal<CollabSession | null>(null);
  private readonly everLive = signal(false);
  private readonly localHold = signal(false);
  private readonly liveText = signal('');
  private readonly peers = signal(0);
  private readonly pendingOps = computed(() => this.sync.status()?.pending ?? 0);
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private openedKey: string | null = null;

  readonly status = computed<CollabStatus>(() => this.session()?.status() ?? 'unavailable');

  readonly mode = computed<CollabTextMode>(() => {
    const session = this.session();
    if (session === null) return 'local';
    const status = session.status();
    if (status === 'unavailable' || status === 'refused') return 'local';
    if (!this.editableDown) return status === 'live' && session.writable() ? 'live' : 'read-only';
    if (this.localHold()) return 'local';
    return status === 'live' || this.everLive() ? 'live' : 'local';
  });

  /** The editor binding in `live` mode; stable while the document is not replaced. */
  readonly binding = computed<CollabTextBinding | null>(() => {
    const session = this.session();
    if (session === null || this.mode() !== 'live') return null;
    session.revision();
    return { ytext: session.ytext(this.config.textName), awareness: session.awareness };
  });

  /** The shared text (kept current while a document is held). */
  readonly text = this.liveText.asReadonly();
  /** In `live` mode, whether the Hub link itself is up (false during the desktop grace window). */
  readonly linkUp = computed(() => this.status() === 'live');
  /** Distinct participants (devices and browsers) in the document, this one included. */
  readonly participants = this.peers.asReadonly();
  /** The refusal code when the Hub refused the document (consent, forbidden, too large...), else null. */
  readonly refusal = computed(() => this.session()?.refusal() ?? null);

  /** A line explaining a non-live mode, or null when there is nothing to explain. */
  readonly note = computed<string | null>(() => {
    const mode = this.mode();
    if (mode === 'read-only') return this.status() === 'connecting' ? 'Connecting to your Hub...' : 'Reconnecting to your Hub... Editing resumes when it is back.';
    if (mode === 'local' && this.localHold()) return 'Not connected to your Hub. Edits are saved on this device and sync when it is back.';
    return null;
  });

  constructor(private readonly config: CollabTextSessionConfig) {
    effect(() => {
      const key = this.available ? config.docKey() : null;
      untracked(() => this.hold(key));
    });
    effect(() => {
      const session = this.session();
      if (session === null) return;
      const status = session.status();
      untracked(() => this.onStatus(status));
    });
    effect(() => {
      if (!this.localHold()) return;
      const ready = this.config.canPromote?.() ?? true;
      if (ready && this.session()?.status() === 'live' && this.pendingOps() === 0) untracked(() => this.promote());
    });
    effect((onCleanup) => {
      const session = this.session();
      if (session === null) {
        untracked(() => { this.liveText.set(''); this.peers.set(0); });
        return;
      }
      session.revision();
      const ytext = session.ytext(config.textName);
      const awareness = session.awareness;
      const readText = (): void => this.liveText.set(ytext.toString());
      const readPeers = (): void => {
        const people = new Set<string>();
        for (const [clientId, state] of awareness.getStates()) {
          const user = (state as { user?: { deviceId?: unknown } } | null)?.user;
          people.add(typeof user?.deviceId === 'string' ? user.deviceId : `client:${clientId}`);
        }
        this.peers.set(people.size);
      };
      ytext.observe(readText);
      awareness.on('change', readPeers);
      untracked(() => { readText(); readPeers(); });
      onCleanup(() => {
        ytext.unobserve(readText);
        awareness.off('change', readPeers);
      });
    });
    inject(DestroyRef).onDestroy(() => this.hold(null));
  }

  /**
   * For an editor that is not bound to the Y.Text (its plain textarea fallback): brings the shared text to `value` with a minimal
   * edit. A no-op when the text already matches (a bound editor wrote it). Returns false when not live.
   */
  setText(value: string): boolean {
    const binding = this.binding();
    if (binding === null || !this.session()?.writable()) return false;
    if (binding.ytext.toString() !== value) applyTextTo(binding.ytext, value);
    return true;
  }

  private hold(key: string | null): void {
    if (key === this.openedKey) return;
    this.clearGrace();
    // Open the next document before giving back the previous one, so the shared socket stays up across the switch.
    const previous = this.session();
    this.openedKey = key;
    this.everLive.set(false);
    this.localHold.set(false);
    this.session.set(key === null ? null : this.collab.open(key));
    previous?.release();
  }

  private onStatus(status: CollabStatus): void {
    if (status === 'live') {
      this.everLive.set(true);
      this.clearGrace();
      return;
    }
    if (!this.editableDown || !this.everLive() || this.localHold()) return;
    if (status === 'unavailable' || status === 'refused') {
      this.enterLocal();
      return;
    }
    this.graceTimer ??= setTimeout(() => {
      this.graceTimer = null;
      if (this.session()?.status() !== 'live') this.enterLocal();
    }, COLLAB_TEXT_GRACE_MS);
  }

  private clearGrace(): void {
    if (this.graceTimer === null) return;
    clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  private enterLocal(): void {
    this.clearGrace();
    this.config.keepLocally?.(this.liveText());
    this.localHold.set(true);
    this.everLive.set(false);
    this.reopen();
  }

  private promote(): void {
    this.localHold.set(false);
    this.everLive.set(false);
    this.reopen();
  }

  /** A fresh document for the same key: the old one may hold edits the Hub merges again from the outbox. */
  private reopen(): void {
    this.session()?.release();
    this.session.set(this.openedKey === null ? null : this.collab.open(this.openedKey));
  }
}
