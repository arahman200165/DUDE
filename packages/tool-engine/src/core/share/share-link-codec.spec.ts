import fc from 'fast-check';
import { MAX_ENCODED_CHARS, decodeShareFragment, encodeShareFragment, isShareFragment } from "./share-link-codec.js";

describe('share-link codec', () => {
  it('round-trips arbitrary unicode text through the fragment', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'grapheme', minLength: 1, maxLength: 400 }), async (text) => {
        const encoded = await encodeShareFragment(text);
        if (!encoded.ok) return encoded.reason === 'too-large';
        expect(encoded.fragment).toMatch(/^in=v1\.[A-Za-z0-9_-]+$/);
        return (await decodeShareFragment(`#${encoded.fragment}`)) === text;
      }),
      { numRuns: 60 },
    );
  });

  it('compresses repetitive input well below the raw size', async () => {
    const text = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: i, name: 'item', tags: ['a', 'b'] })));
    const encoded = await encodeShareFragment(text);
    expect(encoded.ok).toBe(true);
    expect(encoded.ok && encoded.fragment.length).toBeLessThan(text.length / 4);
  });

  it('refuses empty input and input that would exceed the link cap', async () => {
    expect(await encodeShareFragment('')).toEqual({ ok: false, reason: 'empty' });
    const random = crypto.getRandomValues(new Uint8Array(20_000));
    const incompressible = Array.from(random, (byte) => String.fromCharCode(33 + (byte % 90))).join('');
    const result = await encodeShareFragment(incompressible);
    expect(result).toEqual({ ok: false, reason: 'too-large' });
  });

  it('never throws on malformed or foreign fragments', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 200 }), async (junk) => {
        const decoded = await decodeShareFragment(`#in=v1.${junk}`);
        return decoded === null || typeof decoded === 'string';
      }),
      { numRuns: 100 },
    );
    expect(await decodeShareFragment('#section-2')).toBeNull();
    expect(await decodeShareFragment('#in=v2.abc')).toBeNull();
    expect(await decodeShareFragment(null)).toBeNull();
    expect(isShareFragment('#in=v1.' + 'A'.repeat(MAX_ENCODED_CHARS + 1))).toBe(false);
  });

  it('bounds decompression, so a crafted link cannot inflate unbounded text', async () => {
    // ~2 MB of one repeated char compresses to a few kB, over the 1 MB decode cap.
    const bomb = new Uint8Array(2 * 1024 * 1024).fill(65);
    const compressor = new CompressionStream('deflate-raw');
    const writer = compressor.writable.getWriter();
    void writer.write(bomb).then(() => writer.close());
    const chunks: Uint8Array[] = [];
    for (const reader = compressor.readable.getReader(); ; ) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const compressed = Uint8Array.from(chunks.flatMap((chunk) => [...chunk]));
    const payload = btoa(String.fromCharCode(...compressed)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(payload.length).toBeLessThan(MAX_ENCODED_CHARS);
    expect(await decodeShareFragment(`in=v1.${payload}`)).toBeNull();
  });
});
