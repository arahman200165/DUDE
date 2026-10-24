import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import { SCRATCHPAD_ORDER, SCRATCHPAD_SNIPPETS, addSnippet, editSnippet, moveSnippet, readSnippet, removeSnippet, snippetOrder } from '@dude/collab-doc';
import type { CollabSnippet } from '@dude/collab-doc';
import { collabCursorColors } from '@dude/tool-engine/shared/components/code-editor/collab-colors';
import { createSnippet } from '@dude/domain/core/workspace/scratchpad.model';
import { CollabDocService } from '../collab/collab-doc.service';
import type { CollabSession, CollabStatus } from '../collab/collab-doc.service';
import { HUB_COLLAB, UNAVAILABLE_COLLAB_TRANSPORT } from '../collab/hub-collab.token';
import { SyncStatusService } from '../sync/sync-status.service';
import { ScratchpadService } from './scratchpad.service';

/** The one scratchpad document (PD-099): the record `scratchpad:default`. */
export const SCRATCHPAD_DOC_KEY = 'scratchpad:default';
/** How long a desktop keeps editing the live document after the Hub link drops before it falls back to local journaled saves (PD-106). */
export const SCRATCHPAD_GRACE_MS = 10_000;

/**
 * How the drawer edits right now. `live`: the notes are a shared Y.Doc and every edit is live. `local`: today's behavior, key/value editing
 * with an explicit Save (Pages and standalone, a refusal, or a desktop whose Hub link was lost). `read-only`: Hub web while the Hub is not
 * reachable (shared writes there are online-only).
 */
export type ScratchpadCollabMode = 'live' | 'local' | 'read-only';

/** Another participant whose cursor is inside a snippet. `color` is a palette token reference, never a value a peer chose. */
export interface ScratchpadParticipant {
  readonly clientId: number;
  readonly name: string;
  readonly colorSlot: number;
  readonly color: string;
  readonly field: 'title' | 'body';
}

/** What an editor needs to bind to a snippet's body; structurally a `CodeEditorBinding`. */
export interface ScratchpadBodyBinding {
  readonly ytext: Y.Text;
  readonly awareness: Awareness;
}

const NO_PEOPLE: readonly ScratchpadParticipant[] = [];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Where `position` of `previous` lands once the text became `next` (the common prefix and suffix stay put), so a caret survives a remote edit. */
export function remapCaret(previous: string, next: string, position: number): number {
  const max = Math.min(previous.length, next.length);
  let prefix = 0;
  while (prefix < max && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix += 1;
  let suffix = 0;
  while (suffix < max - prefix && previous.charCodeAt(previous.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)) suffix += 1;
  let mapped: number;
  if (position <= prefix) mapped = position;
  else if (position >= previous.length - suffix) mapped = position + (next.length - previous.length);
  else mapped = Math.min(position, next.length - suffix);
  return Math.max(0, Math.min(mapped, next.length));
}

/**
 * Collaboration on the scratchpad (Phase 31J, PD-099, PD-103, PD-106, PD-108). While the drawer is open and this environment has a Hub
 * collaboration transport, it holds `scratchpad:default` open and exposes the notes as signals derived from the Y.Doc, plus the edits
 * (add, remove, title, body, reorder) as Yjs operations. It never writes the key/value scratchpad while live: the Hub materializes the record
 * and it returns through normal sync.
 *
 * Fallbacks: no transport (Pages, standalone) or a refusal (consent, forbidden) is `local`, exactly the old drawer. On Hub web a document that
 * is not live is `read-only`. On a desktop the live document stays editable for {@link SCRATCHPAD_GRACE_MS} after the link drops, then the
 * content is kept in the key/value scratchpad (journaled into the outbox) and the mode is `local`; the session is replaced by a fresh one
 * that only watches for the link, and once it is live again with nothing pending in the outbox (and no local draft open) another fresh
 * session takes over and the mode returns to `live`. A fresh document, never the old one, so edits made while down are not applied twice.
 */
@Injectable({ providedIn: 'root' })
export class ScratchpadCollab {
  private readonly collab = inject(CollabDocService);
  private readonly transport = inject(HUB_COLLAB);
  private readonly scratchpad = inject(ScratchpadService);
  private readonly sync = inject(SyncStatusService);

  /** Whether this environment can collaborate at all (false on Pages, standalone and a desktop without the relay). */
  readonly available = this.transport !== UNAVAILABLE_COLLAB_TRANSPORT;
  private readonly editableDown = this.transport.editableWhenDown;

  private readonly active = signal(false);
  private readonly session = signal<CollabSession | null>(null);
  /** The current session reached `live` at some point. */
  private readonly everLive = signal(false);
  /** Desktop: the Hub link was lost for good (grace over, or refused after being live): local journaled editing until it is back. */
  private readonly localHold = signal(false);
  /** The drawer has a local draft open; a switch back to live waits for it to close. */
  private readonly localDraft = signal(false);
  private readonly docSnippets = signal<readonly CollabSnippet[]>([]);
  private readonly presenceState = signal<ReadonlyMap<string, readonly ScratchpadParticipant[]>>(new Map());
  private readonly participantsState = signal(0);
  private readonly pendingOps = computed(() => this.sync.status()?.pending ?? 0);
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  /** The document has held a snippet at some point, so an empty document is a real deletion, not a copy that never synced. */
  private sawContent = false;
  private readonly bindings = new WeakMap<Y.Text, ScratchpadBodyBinding>();

  readonly status = computed<CollabStatus>(() => this.session()?.status() ?? 'unavailable');

  readonly mode = computed<ScratchpadCollabMode>(() => {
    const session = this.session();
    if (!this.active() || session === null) return 'local';
    const status = session.status();
    if (status === 'unavailable' || status === 'refused') return 'local';
    if (!this.editableDown) return status === 'live' && session.writable() ? 'live' : 'read-only';
    if (this.localHold()) return 'local';
    // Live, or within the grace window after having been live.
    return status === 'live' || this.everLive() ? 'live' : 'local';
  });

  /** The notes to show: the live document, else the key/value scratchpad. */
  readonly snippets = computed<readonly CollabSnippet[]>(() => {
    const mode = this.mode();
    if (mode === 'live' || (mode === 'read-only' && this.everLive())) return this.docSnippets();
    return this.scratchpad.snippets();
  });

  /** In live mode, whether the Hub link itself is up (false during the desktop grace window). */
  readonly linkUp = computed(() => this.status() === 'live');
  /** Distinct participants (devices and browsers) in the document, this one included. */
  readonly participants = this.participantsState.asReadonly();
  /** Other participants whose cursor is in a snippet, by snippet id. */
  readonly presence = this.presenceState.asReadonly();

  /** A line explaining a non-live mode, or null when there is nothing to explain (including the plain local mode of Pages). */
  readonly note = computed<string | null>(() => {
    const mode = this.mode();
    if (mode === 'read-only') {
      return this.status() === 'connecting' ? 'Connecting to your Hub...' : 'Reconnecting to your Hub... Notes are read-only until it is back.';
    }
    if (mode === 'local' && this.localHold()) return 'Not connected to your Hub. Edits are saved on this device and sync when it is back.';
    return null;
  });

  constructor() {
    effect(() => {
      const session = this.session();
      if (session === null) return;
      const status = session.status();
      untracked(() => this.onStatus(status));
    });
    effect(() => {
      if (!this.localHold() || this.localDraft()) return;
      const live = this.session()?.status() === 'live';
      const pending = this.pendingOps();
      if (live && pending === 0) untracked(() => this.promote());
    });
    effect((onCleanup) => {
      const session = this.session();
      if (session === null) {
        untracked(() => this.clearDoc());
        return;
      }
      session.revision();
      const doc = session.doc;
      const awareness = session.awareness;
      const refresh = (): void => this.refresh();
      const refreshPresence = (): void => this.refreshPresence();
      const snippets = doc.getMap(SCRATCHPAD_SNIPPETS);
      const order = doc.getArray(SCRATCHPAD_ORDER);
      snippets.observeDeep(refresh);
      order.observe(refresh);
      awareness.on('change', refreshPresence);
      untracked(refresh);
      onCleanup(() => {
        snippets.unobserveDeep(refresh);
        order.unobserve(refresh);
        awareness.off('change', refreshPresence);
      });
    });
  }

  /** The drawer opens (true) or closes (false): hold the document only while it is open. */
  setActive(active: boolean): void {
    if (this.active() === active) return;
    this.active.set(active);
    if (active) {
      if (this.available) this.session.set(this.collab.open(SCRATCHPAD_DOC_KEY));
      return;
    }
    this.clearGrace();
    this.session()?.release();
    this.session.set(null);
    this.everLive.set(false);
    this.localHold.set(false);
    this.sawContent = false;
  }

  /** The drawer has (or no longer has) a local draft open; promotion back to live waits while it does. */
  setLocalDraftOpen(open: boolean): void {
    if (this.localDraft() !== open) this.localDraft.set(open);
  }

  // --- edits (live mode only; each returns whether it was applied) -------------------------------------------------

  /** Adds a note at the top and returns its id, or null when not live. */
  add(title: string, body: string, sourceToolId?: string): string | null {
    const session = this.liveSession();
    if (session === null) return null;
    const created = createSnippet(title, body, sourceToolId);
    const snippet: CollabSnippet = { id: created.id, title, body, createdAt: created.createdAt, ...(sourceToolId !== undefined ? { sourceToolId } : {}) };
    addSnippet(session.doc, snippet, 0);
    return snippet.id;
  }

  remove(id: string): boolean {
    const session = this.liveSession();
    return session !== null && removeSnippet(session.doc, id);
  }

  setTitle(id: string, title: string): boolean {
    const session = this.liveSession();
    return session !== null && editSnippet(session.doc, id, { title });
  }

  /** For an editor that is not bound to the Y.Text (its plain textarea fallback): brings the body to `body` with a minimal text edit. */
  setBody(id: string, body: string): boolean {
    const session = this.liveSession();
    return session !== null && editSnippet(session.doc, id, { body });
  }

  /** Moves a note by `delta` places in the display order. */
  move(id: string, delta: number): void {
    const session = this.liveSession();
    if (session === null) return;
    const index = snippetOrder(session.doc).indexOf(id);
    if (index >= 0) moveSnippet(session.doc, id, index + delta);
  }

  /** The editor binding for a note's body, or null when not live or the note is gone. Stable per Y.Text, so it can feed an input directly. */
  bodyBinding(id: string): ScratchpadBodyBinding | null {
    const session = this.session();
    if (session === null || this.mode() !== 'live') return null;
    session.revision();
    this.docSnippets();
    const entry = session.doc.getMap(SCRATCHPAD_SNIPPETS).get(id);
    const body = entry instanceof Y.Map ? entry.get('body') : null;
    if (!(body instanceof Y.Text)) return null;
    let binding = this.bindings.get(body);
    if (binding === undefined || binding.awareness !== session.awareness) {
      binding = { ytext: body, awareness: session.awareness };
      this.bindings.set(body, binding);
    }
    return binding;
  }

  // --- link state -----------------------------------------------------------------------------------------------

  private liveSession(): CollabSession | null {
    const session = this.session();
    return session !== null && this.mode() === 'live' && session.writable() ? session : null;
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
    }, SCRATCHPAD_GRACE_MS);
  }

  private clearGrace(): void {
    if (this.graceTimer === null) return;
    clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }

  /** Keeps what the live document holds on this device (journaled by the usual save) and switches to local editing with a fresh watcher session. */
  private enterLocal(): void {
    this.clearGrace();
    this.keepLiveContentLocally();
    this.localHold.set(true);
    this.everLive.set(false);
    this.reopen();
  }

  /** Link live again and nothing waiting in the outbox: a fresh document, back to live. */
  private promote(): void {
    this.localHold.set(false);
    this.everLive.set(false);
    this.reopen();
  }

  private reopen(): void {
    this.session()?.release();
    this.sawContent = false;
    this.session.set(this.active() ? this.collab.open(SCRATCHPAD_DOC_KEY) : null);
  }

  /** Edits made while the link was down exist only in the live document; write them to the key/value scratchpad so nothing is lost. */
  private keepLiveContentLocally(): void {
    const kept = this.docSnippets();
    if (kept.length === 0 && !this.sawContent) return;
    const stored = this.scratchpad.snippets();
    const same = kept.length === stored.length
      && kept.every((snippet, index) => {
        const other = stored[index];
        return snippet.id === other.id && snippet.title === other.title && snippet.body === other.body && snippet.createdAt === other.createdAt;
      });
    if (!same) this.scratchpad.replaceSnippets(kept);
  }

  // --- the document as signals --------------------------------------------------------------------------------------

  private clearDoc(): void {
    this.docSnippets.set([]);
    this.presenceState.set(new Map());
    this.participantsState.set(0);
  }

  private refresh(): void {
    const session = this.session();
    if (session === null) return;
    const list: CollabSnippet[] = [];
    for (const id of snippetOrder(session.doc)) {
      const snippet = readSnippet(session.doc, id);
      if (snippet !== null) list.push(snippet);
    }
    if (list.length > 0) this.sawContent = true;
    this.docSnippets.set(list);
    this.refreshPresence();
  }

  /** Maps each other participant's cursor to the snippet (and field) it is inside, resolving the shared relative position against the document. */
  private refreshPresence(): void {
    const session = this.session();
    if (session === null) return;
    const { doc, awareness } = session;
    const fields = new Map<unknown, { id: string; field: 'title' | 'body' }>();
    doc.getMap(SCRATCHPAD_SNIPPETS).forEach((entry, id) => {
      if (!(entry instanceof Y.Map)) return;
      const title = entry.get('title');
      const body = entry.get('body');
      if (title instanceof Y.Text) fields.set(title, { id, field: 'title' });
      if (body instanceof Y.Text) fields.set(body, { id, field: 'body' });
    });
    const people = new Set<string>();
    const bySnippet = new Map<string, ScratchpadParticipant[]>();
    const seen = new Set<string>();
    for (const [clientId, state] of awareness.getStates()) {
      if (!isRecord(state) || !isRecord(state['user'])) continue;
      const user = state['user'];
      const name = typeof user['name'] === 'string' && user['name'] !== '' ? user['name'] : 'Anonymous';
      const colorSlot = typeof user['colorSlot'] === 'number' ? user['colorSlot'] : clientId;
      const person = typeof user['deviceId'] === 'string' ? user['deviceId'] : `client:${clientId}`;
      people.add(person);
      if (clientId === awareness.clientID) continue;
      const cursor = isRecord(state['cursor']) ? state['cursor'] : null;
      const json = cursor === null ? null : (isRecord(cursor['head']) ? cursor['head'] : cursor['anchor']);
      if (!isRecord(json)) continue;
      let hit: { id: string; field: 'title' | 'body' } | undefined;
      try {
        const absolute = Y.createAbsolutePositionFromRelativePosition(Y.createRelativePositionFromJSON(json), doc);
        hit = absolute === null ? undefined : fields.get(absolute.type);
      } catch {
        hit = undefined;
      }
      if (hit === undefined || seen.has(`${hit.id}:${person}`)) continue;
      seen.add(`${hit.id}:${person}`);
      const participant: ScratchpadParticipant = { clientId, name, colorSlot, color: collabCursorColors(colorSlot).color, field: hit.field };
      const list = bySnippet.get(hit.id);
      if (list) list.push(participant);
      else bySnippet.set(hit.id, [participant]);
    }
    this.presenceState.set(bySnippet);
    this.participantsState.set(people.size);
  }

  /** The participants in `id`, never undefined (for templates). */
  presenceIn(id: string): readonly ScratchpadParticipant[] {
    return this.presenceState().get(id) ?? NO_PEOPLE;
  }
}
