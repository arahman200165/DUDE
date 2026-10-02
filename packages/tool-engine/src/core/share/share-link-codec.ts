import { hostCompression } from "@dude/crypto/host";
/**
 * Shareable Tool Routes (DUDE_PRD.md §21 Phase 26 Item 12): the pure codec for input carried in a
 * link's `#fragment`. The fragment rather than `?query`, because browsers never send the fragment
 * to the server, so GitHub Pages never sees (or logs) the shared input.
 *
 * Format: `#in=v1.<base64url(deflate-raw(utf-8 text))>`, using the native CompressionStream (no
 * dependency). Decoding never throws and is bounded. A crafted link can't make the receiver
 * inflate more than `MAX_DECODED_CHARS` of text.
 */

export const SHARE_FRAGMENT_KEY = 'in';
export const SHARE_VERSION = 'v1';
/** Encoded payload cap. Keeps links pasteable into chat/issue trackers without truncation. */
export const MAX_ENCODED_CHARS = 8 * 1024;
/** Decompression cap for a received link (a deflate stream can expand ~1000×). */
export const MAX_DECODED_CHARS = 1024 * 1024;

export type EncodeResult = { readonly ok: true; readonly fragment: string } | { readonly ok: false; readonly reason: 'empty' | 'too-large' };

export async function encodeShareFragment(text: string): Promise<EncodeResult> {
  if (text.length === 0) return { ok: false, reason: 'empty' };
  if (text.length > MAX_DECODED_CHARS) return { ok: false, reason: 'too-large' };
  const compressed = await pipe(new TextEncoder().encode(text), hostCompression('deflate-raw', false), Infinity);
  const payload = `${SHARE_VERSION}.${toBase64Url(compressed!)}`;
  if (payload.length > MAX_ENCODED_CHARS) return { ok: false, reason: 'too-large' };
  return { ok: true, fragment: `${SHARE_FRAGMENT_KEY}=${payload}` };
}

/** `null` for anything that isn't a well-formed, in-bounds DUDE share fragment. Never throws. */
export async function decodeShareFragment(fragment: string | null | undefined): Promise<string | null> {
  const payload = extractPayload(fragment);
  if (payload === null) return null;
  try {
    const bytes = await pipe(fromBase64Url(payload), hostCompression('deflate-raw', true), MAX_DECODED_CHARS * 4);
    if (!bytes) return null;
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.length > 0 && text.length <= MAX_DECODED_CHARS ? text : null;
  } catch {
    return null;
  }
}

/** Whether a fragment (with or without the leading `#`) carries a DUDE share payload at all. */
export function isShareFragment(fragment: string | null | undefined): boolean {
  return extractPayload(fragment) !== null;
}

function extractPayload(fragment: string | null | undefined): string | null {
  if (!fragment) return null;
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  const prefix = `${SHARE_FRAGMENT_KEY}=${SHARE_VERSION}.`;
  if (!raw.startsWith(prefix)) return null;
  const payload = raw.slice(prefix.length);
  return payload.length > 0 && payload.length <= MAX_ENCODED_CHARS && /^[A-Za-z0-9_-]+$/.test(payload) ? payload : null;
}

/** Streams `input` through `transform`, giving up (`null`) once output exceeds `limit` bytes. */
async function pipe(input: Uint8Array, transform: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array | null> {
  const writer = transform.writable.getWriter();
  void writer.write(input as Uint8Array<ArrayBuffer>).then(() => writer.close()).catch(() => undefined);
  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
