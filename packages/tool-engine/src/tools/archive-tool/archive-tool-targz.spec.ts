import { describe, expect, it } from 'vitest';
import { createTarGz, extractTarGz } from "./archive-tool-targz.js";

describe('createTarGz / extractTarGz', () => {
  it('round-trips entries through tar + gzip', async () => {
    const entries = [{ name: 'greeting.txt', data: new TextEncoder().encode('hello gzip') }];

    const result = await createTarGz(entries);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const extracted = await extractTarGz(result.bytes);
    expect(extracted).toHaveLength(1);
    expect(new TextDecoder().decode(extracted[0].data)).toBe('hello gzip');
  });

  it('propagates a tar-level error (oversized name) without attempting to gzip', async () => {
    const result = await createTarGz([{ name: 'x'.repeat(101), data: new Uint8Array(0) }]);
    expect(result.ok).toBe(false);
  });
});
