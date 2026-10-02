/**
 * Byte-by-byte percent-encoding breakdown, distinct from `url-encode`'s
 * plain encode/decode: groups consecutive %XX sequences into the UTF-8
 * character they decode to, and flags literal characters that would need
 * encoding under `encodeURIComponent`'s unreserved-character set (RFC 3986).
 */

export type PercentEncodingSegmentKind = 'literal' | 'reserved-unencoded' | 'encoded';

export interface PercentEncodingSegment {
  readonly raw: string;
  readonly kind: PercentEncodingSegmentKind;
  readonly decoded: string;
  readonly bytes?: readonly number[];
}

export interface PercentEncodingInspection {
  readonly segments: readonly PercentEncodingSegment[];
  readonly decoded: string;
  readonly error?: string;
}

/** Characters `encodeURIComponent` never escapes. */
const UNRESERVED = /[A-Za-z0-9\-_.!~*'()]/;

export function inspectPercentEncoding(input: string): PercentEncodingInspection {
  const segments: PercentEncodingSegment[] = [];
  let decodedFull = '';
  let i = 0;

  while (i < input.length) {
    if (input[i] === '%') {
      const byteValues: number[] = [];
      let raw = '';

      while (i < input.length && input[i] === '%') {
        const hex = input.slice(i + 1, i + 3);
        if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
          return { segments, decoded: decodedFull, error: `Invalid percent-encoding at position ${i}: "%${hex}".` };
        }
        byteValues.push(parseInt(hex, 16));
        raw += `%${hex.toUpperCase()}`;
        i += 3;
      }

      let decodedChunk: string;
      try {
        decodedChunk = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(byteValues));
      } catch {
        return { segments, decoded: decodedFull, error: `"${raw}" is not valid percent-encoded UTF-8.` };
      }

      segments.push({ raw, kind: 'encoded', decoded: decodedChunk, bytes: byteValues });
      decodedFull += decodedChunk;
    } else {
      const char = input[i];
      segments.push({ raw: char, kind: UNRESERVED.test(char) ? 'literal' : 'reserved-unencoded', decoded: char });
      decodedFull += char;
      i += 1;
    }
  }

  return { segments, decoded: decodedFull };
}
