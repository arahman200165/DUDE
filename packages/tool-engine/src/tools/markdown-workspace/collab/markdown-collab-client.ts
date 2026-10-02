import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { computeTextDelta } from "./text-delta.js";

/**
 * Binds a `Y.Text` CRDT to Advanced Markdown Workspace's plain `source`
 * signal/textarea (Phase 8 Stage 6) — there's no existing editor-library
 * abstraction layer to route a binding through, so this attaches directly:
 * local edits are diffed against the doc's current text (`text-delta.ts`)
 * and applied as a small Yjs op; remote edits are pushed back out via
 * `onRemoteTextChange` for the component to `source.set(...)`.
 *
 * Speaks the same wire protocol as `apps/desktop/collab-server.ts` (hand-rolled
 * `y-protocols/sync` + `y-protocols/awareness` message framing over a plain
 * WebSocket) — see that file's doc comment for why this isn't `y-websocket`
 * itself.
 *
 * Known limitation: a remote update replaces the textarea's whole `value`
 * (no cursor-position preservation) since there's no rich-editor selection
 * model to map the CRDT op onto — acceptable for this MVP, same caveat the
 * Stage 6 plan flagged going in.
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
}

export class MarkdownCollabClient {
  private readonly doc = new Y.Doc();
  private readonly ytext = this.doc.getText('markdown');
  private readonly awareness = new awarenessProtocol.Awareness(this.doc);
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

  /** Exposed for tests; the component reads state via `onRemoteTextChange` instead. */
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
      }
    } else if (messageType === MESSAGE_AWARENESS) {
      awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
    }
  }
}
