/**
 * Wire framing for the Device Agent pipe: a 4-byte big-endian length followed by that many bytes of
 * UTF-8 JSON. Bytes travel as `{"$bytes": "<base64>"}`. `v8.serialize` is never used because
 * Electron's V8 differs from Node's.
 */
export const MAX_FRAME_BYTES = 64 * 1024 * 1024;
/** Frames accepted before the peer has authenticated. */
export const MAX_HANDSHAKE_FRAME_BYTES = 64 * 1024;

export class ProtocolError extends Error {
  constructor(readonly code: 'frame-too-large' | 'invalid-frame' | 'invalid-message' | 'handshake-failed' | 'timeout' | 'closed', message: string) {
    super(message);
    this.name = 'ProtocolError';
  }
}

function replacer(this: Record<string, unknown>, key: string, value: unknown): unknown {
  // `Buffer.prototype.toJSON` has already run by the time `value` arrives; the holder keeps the original.
  const raw = this[key];
  if (raw instanceof Uint8Array) return { $bytes: Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString('base64') };
  return value;
}

function reviver(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const keys = Object.keys(value);
    if (keys.length === 1 && keys[0] === '$bytes' && typeof (value as { $bytes: unknown }).$bytes === 'string') {
      return new Uint8Array(Buffer.from((value as { $bytes: string }).$bytes, 'base64'));
    }
  }
  return value;
}

export function encodeFrame(message: unknown, maxBytes = MAX_FRAME_BYTES): Buffer {
  const json = JSON.stringify(message, replacer);
  if (json === undefined) throw new ProtocolError('invalid-message', 'The message is not JSON-serializable.');
  const body = Buffer.from(json, 'utf8');
  if (body.length > maxBytes) throw new ProtocolError('frame-too-large', `Frame of ${body.length} bytes exceeds ${maxBytes}.`);
  const frame = Buffer.allocUnsafe(4 + body.length);
  frame.writeUInt32BE(body.length, 0);
  body.copy(frame, 4);
  return frame;
}

/** Incremental decoder: feed it socket chunks; it returns every complete message and throws a `ProtocolError` on a bad stream. */
export class FrameDecoder {
  private chunks: Buffer[] = [];
  private size = 0;
  private expected: number | null = null;

  constructor(public maxBytes = MAX_FRAME_BYTES) {}

  push(chunk: Buffer): unknown[] {
    this.chunks.push(chunk);
    this.size += chunk.length;
    const out: unknown[] = [];
    for (;;) {
      if (this.expected === null) {
        if (this.size < 4) break;
        this.consolidate();
        const length = this.chunks[0].readUInt32BE(0);
        if (length === 0) throw new ProtocolError('invalid-frame', 'Empty frame.');
        if (length > this.maxBytes) throw new ProtocolError('frame-too-large', `Frame of ${length} bytes exceeds ${this.maxBytes}.`);
        this.expected = length;
      }
      if (this.size < 4 + this.expected) break;
      this.consolidate();
      const all = this.chunks[0];
      const body = all.subarray(4, 4 + this.expected);
      const rest = all.subarray(4 + this.expected);
      this.chunks = rest.length > 0 ? [rest] : [];
      this.size = rest.length;
      this.expected = null;
      try {
        out.push(JSON.parse(body.toString('utf8'), reviver));
      } catch {
        throw new ProtocolError('invalid-frame', 'Frame is not valid JSON.');
      }
    }
    return out;
  }

  private consolidate(): void {
    if (this.chunks.length > 1) this.chunks = [Buffer.concat(this.chunks, this.size)];
  }
}
