import { describe, expect, it } from 'vitest';
import { parsePngIhdr } from "./png-header.js";

// The same 1x1 transparent PNG fixture used elsewhere in Phase 17's image tools.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

function bytesFromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

describe('parsePngIhdr', () => {
  it('returns null for non-PNG bytes', () => {
    expect(parsePngIhdr(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('parses width/height/bit depth/color type from a real PNG', () => {
    const ihdr = parsePngIhdr(bytesFromBase64(PNG_BASE64));
    expect(ihdr).not.toBeNull();
    expect(ihdr?.width).toBe(1);
    expect(ihdr?.height).toBe(1);
    expect(ihdr?.colorTypeName).toBeTruthy();
    expect(typeof ihdr?.interlaced).toBe('boolean');
  });

  it('returns null for a truncated buffer', () => {
    expect(parsePngIhdr(bytesFromBase64(PNG_BASE64).slice(0, 10))).toBeNull();
  });
});
