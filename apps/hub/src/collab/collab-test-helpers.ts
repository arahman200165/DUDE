import * as Y from 'yjs';
import * as decoding from 'lib0/decoding';
import * as encoding from 'lib0/encoding';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { WebSocket } from 'ws';
import { COLLAB_FRAME_AWARENESS, COLLAB_FRAME_SYNC, decodeFrame, encodeFrame } from '@dude/collab-doc';
import type { CollabFrame, CollabFrameKind } from '@dude/collab-doc';
import { HUB_COLLAB_PATH } from '@dude/contracts/hub';
import type { AuthHub } from '../server/auth-test-helpers.js';

export type Msg = Record<string, any>;
export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Every JSON control frame any peer received, for the contract parity check at the end of the file. */
export const everySeen: Msg[] = [];

export interface Channel { doc: Y.Doc; awareness: awarenessProtocol.Awareness }
export interface Peer {
  ws: WebSocket;
  controls: Msg[];
  frames: CollabFrame[];
  channels: Map<number, Channel>;
  closed: Promise<number>;
  send(message: unknown): void;
  sendFrame(channel: number, kind: CollabFrameKind, payload: Uint8Array): void;
  next(predicate: (m: Msg) => boolean, ms?: number): Promise<Msg>;
  /** Subscribes and, when it succeeds, runs the y-protocols handshake with a local document. */
  join(channel: number, docKey: string): Promise<Msg>;
  destroy(): void;
}

export const url = (h: AuthHub): string => `wss://127.0.0.1:${h.hub.port}${HUB_COLLAB_PATH}`;

export function refused(h: AuthHub, headers: Record<string, string>): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url(h), { ca: h.hub.tls.certPem, headers });
    ws.on('unexpected-response', (_req, res) => { res.resume(); resolve(res.statusCode ?? 0); });
    ws.on('open', () => { ws.close(); reject(new Error('upgrade was accepted')); });
    ws.on('error', () => { /* unexpected-response also fires */ });
  });
}

export function connect(h: AuthHub, headers: Record<string, string>): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url(h), { ca: h.hub.tls.certPem, headers });
    const controls: Msg[] = [];
    const frames: CollabFrame[] = [];
    const channels = new Map<number, Channel>();
    let closeResolve!: (code: number) => void;
    const closed = new Promise<number>((r) => { closeResolve = r; });
    const sendRaw = (data: Uint8Array | string): void => { if (ws.readyState === ws.OPEN) ws.send(data); };
    const sendFrame = (channel: number, kind: CollabFrameKind, payload: Uint8Array): void => sendRaw(encodeFrame(channel, kind, payload));

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (!isBinary) {
        const message = JSON.parse(data.toString('utf8')) as Msg;
        controls.push(message);
        everySeen.push(message);
        return;
      }
      const frame = decodeFrame(new Uint8Array(data));
      if (!frame) return;
      frames.push(frame);
      const chan = channels.get(frame.channel);
      if (!chan) return;
      if (frame.kind === COLLAB_FRAME_SYNC) {
        const reply = encoding.createEncoder();
        syncProtocol.readSyncMessage(decoding.createDecoder(frame.payload), reply, chan.doc, 'remote');
        if (encoding.length(reply) > 0) sendFrame(frame.channel, COLLAB_FRAME_SYNC, encoding.toUint8Array(reply));
      } else {
        awarenessProtocol.applyAwarenessUpdate(chan.awareness, frame.payload, 'remote');
      }
    });
    ws.on('close', (code) => closeResolve(code));
    ws.on('error', reject);
    ws.on('unexpected-response', (_req, res) => reject(new Error(`refused ${res.statusCode}`)));
    ws.on('open', () => {
      const peer: Peer = {
        ws, controls, frames, channels, closed,
        send: (m) => sendRaw(typeof m === 'string' ? m : JSON.stringify(m)),
        sendFrame,
        async next(predicate, ms = 3000) {
          const until = Date.now() + ms;
          while (Date.now() < until) {
            const found = controls.find(predicate);
            if (found) return found;
            await sleep(10);
          }
          throw new Error(`timed out waiting for message; got ${JSON.stringify(controls)}`);
        },
        async join(channel, docKey) {
          const from = controls.length;
          // The channel exists before the Hub answers: its sync step 1 and the current awareness follow `subscribed` immediately.
          const doc = new Y.Doc();
          const awareness = new awarenessProtocol.Awareness(doc);
          awareness.setLocalState(null);
          channels.set(channel, { doc, awareness });
          let live = true;
          doc.on('update', (update: Uint8Array, origin: unknown) => {
            if (origin === 'remote' || !live) return;
            const encoder = encoding.createEncoder();
            syncProtocol.writeUpdate(encoder, update);
            sendFrame(channel, COLLAB_FRAME_SYNC, encoding.toUint8Array(encoder));
          });
          awareness.on('update', ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
            if (origin === 'remote' || !live) return;
            sendFrame(channel, COLLAB_FRAME_AWARENESS, awarenessProtocol.encodeAwarenessUpdate(awareness, added.concat(updated, removed)));
          });
          peer.send({ type: 'subscribe', channel, doc: docKey });
          const answer = await peer.next((m) => (m.type === 'subscribed' || m.type === 'doc-error') && m.channel === channel && controls.indexOf(m) >= from);
          if (answer.type !== 'subscribed') {
            live = false;
            awareness.destroy();
            doc.destroy();
            channels.delete(channel);
            return answer;
          }
          const step1 = encoding.createEncoder();
          syncProtocol.writeSyncStep1(step1, doc);
          sendFrame(channel, COLLAB_FRAME_SYNC, encoding.toUint8Array(step1));
          // Wait for the Hub's step 1 and the answer to ours, so the document is in sync before the test edits it.
          await waitUntil(() => frames.filter((f) => f.channel === channel && f.kind === COLLAB_FRAME_SYNC).length >= 2);
          return answer;
        },
        destroy() {
          for (const c of channels.values()) { c.awareness.destroy(); c.doc.destroy(); }
          ws.terminate();
        },
      };
      resolve(peer);
    });
  });
}

export async function waitUntil(predicate: () => Promise<boolean> | boolean, ms = 3000): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) { if (await predicate()) return true; await sleep(15); }
  return predicate();
}

export const withClose = (peer: Peer, ms = 3000): Promise<number> => Promise.race([peer.closed, sleep(ms).then(() => -1)]);

