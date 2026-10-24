import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { computeTextDelta } from "./text-delta.js";

/**
 * Owns the `Y.Doc`, its `Y.Text('markdown')` and the awareness of one Advanced
 * Markdown Workspace LAN/relay session (Phase 8 Stage 6), and speaks the sync
 * wire protocol over a plain WebSocket. It has no editor dependency: the web
 * app binds `ytext` and `awareness` to its CodeMirror editor through
 * `y-codemirror.next` (Phase 31J, PD-107), so local edits and remote cursors
 * flow through the CRDT without ever replacing the editor's text, and a remote
 * edit no longer moves the local cursor.
 *
 * `applyLocalEdit` remains for whole-text writes that do not come from the
 * bound editor (an opened file, Clear, a plugin result, or typing into the
 * plain-textarea fallback): it is diffed against the doc (`text-delta.ts`) and
 * applied as a small Yjs op. `onRemoteTextChange` keeps the caller's plain text
 * in step with the doc whether or not an editor is bound.
 *
 * Speaks the same wire protocol as `apps/desktop/collab-server.ts` (hand-rolled
 * `y-protocols/sync` + `y-protocols/awareness` message framing over a plain
 * WebSocket) — see that file's doc comment for why this isn't `y-websocket`
 * itself.
 */

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const LOCAL_EDIT_ORIGIN = 'local-edit';

export type CollabConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface MarkdownCollabClientOptions {
  readonly url: string;
  readonly sessionCode: string;
  /**
   * Only the session *host* (the one who just started a brand-new server)
   * should pass their current text here — a *joiner* connecting to an
   * existing session must pass `''`. If both sides of a connection passed
   * non-empty text, each could independently decide "the doc is still
   * empty, I'll seed it" before seeing the other's content, duplicating
   * both texts instead of adopting one. Since only one party ever starts a
   * given server (`apps/desktop/collab-bridge.ts`'s session is a singleton),
   * this is a real constraint to honor, not just theoretical.
   */
  readonly initialText: string;
  readonly onRemoteTextChange: (text: string) => void;
  readonly onStatusChange: (status: CollabConnectionStatus) => void;
  readonly onParticipantCountChange: (count: number) => void;
  /**
   * Called once, after the first sync message has been handled and (for the host) the initial text has been
   * seeded. The caller binds its editor to `ytext` and `awareness` then, so the editor never shows a doc that is
   * still empty only because the first sync round-trip has not landed.
   */
  readonly onInitialSync?: () => void;
}

export class MarkdownCollabClient {
  private readonly doc = new Y.Doc();
  /** The shared Markdown text; the editor binds to this. */
  readonly ytext = this.doc.getText('markdown');
  /** Presence for this session (cursors and participants); the editor binds to this. */
  readonly awareness = new awarenessProtocol.Awareness(this.doc);
  private ws: WebSocket | null = null;
  private receivedInitialSync = false;

  constructor(private readonly options: MarkdownCollabClientOptions) {
    this.ytext.observe((_event, transaction) => {
      if (transaction.origin === LOCAL_EDIT_ORIGIN) return;
      this.options.onRemoteTextChange(this.ytext.toString());
    });

    this.awareness.on('change', () => {
      this.options.onParticipantCountChange(this.awareness.getStates().size);
    });

    this.doc.on('update', (update: Uint8Array) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeUpdate(encoder, update);
      this.ws.send(encoding.toUint8Array(encoder));
    });

    this.awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
      if (this.ws?.readyState !== WebSocket.OPEN) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, added.concat(updated, removed)));
      this.ws.send(encoding.toUint8Array(encoder));
    });

    this.connect();
  }

  /** The current shared text. */
  getText(): string {
    return this.ytext.toString();
  }

  applyLocalEdit(newText: string): void {
    const delta = computeTextDelta(this.ytext.toString(), newText);
    if (delta.deleteCount === 0 && delta.insertText === '') return;

    this.doc.transact(() => {
      if (delta.deleteCount > 0) this.ytext.delete(delta.index, delta.deleteCount);
      if (delta.insertText) this.ytext.insert(delta.index, delta.insertText);
    }, LOCAL_EDIT_ORIGIN);
  }

  destroy(): void {
    this.ws?.close();
    this.awareness.destroy();
    this.doc.destroy();
  }

  private connect(): void {
    this.options.onStatusChange('connecting');

    // `url` may be a bare host:port (Stage 6's local server) or include a
    // room path (Stage 7's relay, `<relayUrl>/<roomId>`) — append the code
    // as a query param without forcing an extra `/` that would otherwise
    // make the relay's room id (a plain path segment) inconsistent between
    // the host and a joiner pasting the same URL back in.
    const separator = this.options.url.includes('?') ? '&' : '?';
    const ws = new WebSocket(`${this.options.url}${separator}code=${this.options.sessionCode}`);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.addEventListener('open', () => {
      this.options.onStatusChange('connected');
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(encoder, this.doc);
      ws.send(encoding.toUint8Array(encoder));
    });

    ws.addEventListener('message', (event) => {
      this.handleMessage(new Uint8Array(event.data as ArrayBuffer));
    });

    ws.addEventListener('close', () => this.options.onStatusChange('disconnected'));
    ws.addEventListener('error', () => this.options.onStatusChange('disconnected'));
  }

  private handleMessage(data: Uint8Array): void {
    const decoder = decoding.createDecoder(data);
    const messageType = decoding.readVarUint(decoder);

    if (messageType === MESSAGE_SYNC) {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, MESSAGE_SYNC);
      syncProtocol.readSyncMessage(decoder, encoder, this.doc, this);
      if (encoding.length(encoder) > 1 && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(encoding.toUint8Array(encoder));
      }

      // The first sync round-trip tells us whether another participant's
      // content already won — only seed our own initial text if the doc is
      // still empty after that, avoiding both sides racing to seed at once.
      if (!this.receivedInitialSync) {
        this.receivedInitialSync = true;
        if (this.ytext.length === 0 && this.options.initialText) {
          this.doc.transact(() => this.ytext.insert(0, this.options.initialText), LOCAL_EDIT_ORIGIN);
        }
        this.options.onInitialSync?.();
      }
    } else if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
    }
  }
}
