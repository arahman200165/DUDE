import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

/**
 * Binary collaboration frame: `[varUint channel][varUint kind][varUint8Array payload]`. The channel multiplexes
 * documents over one connection; the payload is an opaque y-protocols sync or awareness message.
 */
export const COLLAB_FRAME_SYNC = 0;
export const COLLAB_FRAME_AWARENESS = 1;
export type CollabFrameKind = typeof COLLAB_FRAME_SYNC | typeof COLLAB_FRAME_AWARENESS;

export interface CollabFrame {
  readonly channel: number;
  readonly kind: CollabFrameKind;
  readonly payload: Uint8Array;
}

export function encodeFrame(channel: number, kind: CollabFrameKind, payload: Uint8Array): Uint8Array {
  if (!Number.isSafeInteger(channel) || channel < 0) throw new RangeError('Collaboration frame channel must be a non-negative integer');
  if (kind !== COLLAB_FRAME_SYNC && kind !== COLLAB_FRAME_AWARENESS) throw new RangeError('Unknown collaboration frame kind');
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, channel);
  encoding.writeVarUint(encoder, kind);
  encoding.writeVarUint8Array(encoder, payload);
  return encoding.toUint8Array(encoder);
}

/** Decodes a frame; null for malformed input (truncated, unknown kind, trailing bytes). Never throws. */
export function decodeFrame(data: Uint8Array): CollabFrame | null {
  try {
    if (!(data instanceof Uint8Array)) return null;
    const decoder = decoding.createDecoder(data);
    const channel = decoding.readVarUint(decoder);
    const kind = decoding.readVarUint(decoder);
    if (!Number.isSafeInteger(channel) || (kind !== COLLAB_FRAME_SYNC && kind !== COLLAB_FRAME_AWARENESS)) return null;
    const length = decoding.readVarUint(decoder);
    if (!Number.isSafeInteger(length) || length > data.length - decoder.pos) return null;
    const payload = decoding.readUint8Array(decoder, length);
    if (decoding.hasContent(decoder)) return null;
    return { channel, kind, payload: payload.slice() };
  } catch {
    return null;
  }
}
