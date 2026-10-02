import { sniffFileType } from "./file-signature.js";

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

describe('sniffFileType', () => {
  it('detects PNG', () => {
    expect(sniffFileType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0))).toEqual({
      mime: 'image/png',
      extension: 'png',
    });
  });

  it('detects JPEG', () => {
    expect(sniffFileType(bytes(0xff, 0xd8, 0xff, 0xe0))?.mime).toBe('image/jpeg');
  });

  it('detects GIF (87a and 89a share the same 4-byte check)', () => {
    expect(sniffFileType(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61))?.mime).toBe('image/gif');
  });

  it('detects WEBP by its byte-8 marker, not just the shared RIFF prefix', () => {
    const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
    expect(sniffFileType(webp)?.mime).toBe('image/webp');
  });

  it('does not misidentify a RIFF/WAVE file as WEBP', () => {
    const wav = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45);
    expect(sniffFileType(wav)?.mime).toBe('audio/wav');
  });

  it('detects PDF', () => {
    expect(sniffFileType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d)))?.toEqual({ mime: 'application/pdf', extension: 'pdf' });
  });

  it('detects ZIP and honestly notes the ZIP-family collision', () => {
    const result = sniffFileType(bytes(0x50, 0x4b, 0x03, 0x04));
    expect(result?.mime).toBe('application/zip');
    expect(result?.note).toMatch(/docx|zip-family/i);
  });

  it('returns null for plain text with no magic bytes', () => {
    const text = new TextEncoder().encode('hello world');
    expect(sniffFileType(text)).toBeNull();
  });

  it('returns null for a buffer shorter than any signature', () => {
    expect(sniffFileType(bytes(0x50))).toBeNull();
  });

  it('returns null for an empty buffer', () => {
    expect(sniffFileType(bytes())).toBeNull();
  });
});
