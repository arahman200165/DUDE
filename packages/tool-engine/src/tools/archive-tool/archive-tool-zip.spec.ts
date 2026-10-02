import { describe, expect, it } from 'vitest';
import { createZip, extractZip } from "./archive-tool-zip.js";

describe('createZip / extractZip', () => {
  it('round-trips multiple entries', () => {
    const entries = [
      { name: 'hello.txt', data: new TextEncoder().encode('hello world') },
      { name: 'dir/nested.txt', data: new TextEncoder().encode('nested content') },
    ];

    const zipped = createZip(entries);
    expect(zipped.length).toBeGreaterThan(0);

    const extracted = extractZip(zipped);
    expect(extracted).toHaveLength(2);
    const byName = Object.fromEntries(extracted.map((e) => [e.name, new TextDecoder().decode(e.data)]));
    expect(byName['hello.txt']).toBe('hello world');
    expect(byName['dir/nested.txt']).toBe('nested content');
  });
});
