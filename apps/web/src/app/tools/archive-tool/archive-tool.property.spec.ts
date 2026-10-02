import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { createTar, extractTar } from "@dude/tool-engine/tools/archive-tool/archive-tool-tar";
import { createZip, extractZip } from "@dude/tool-engine/tools/archive-tool/archive-tool-zip";
import type { ArchiveEntry } from "@dude/tool-engine/tools/archive-tool/archive-tool-types";

// Names avoid pure-digit strings (JS object key reordering would break the ZIP round-trip, since
// createZip keys a plain object by name) and stay well under the USTAR 100-byte name limit.
const nameArb = fc
  .tuple(
    fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split('')),
    fc.array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split('')), { maxLength: 15 }),
  )
  .map(([first, rest]) => first + rest.join(''));

const dataArb = fc.uint8Array({ minLength: 0, maxLength: 128 });

const entriesArb = fc.uniqueArray(fc.record({ name: nameArb, data: dataArb }), {
  selector: (entry) => entry.name,
  minLength: 1,
  maxLength: 5,
});

function toComparable(entries: readonly ArchiveEntry[]) {
  return entries.map((entry) => ({ name: entry.name, data: Array.from(entry.data) }));
}

describe('createZip / extractZip round-trip property', () => {
  it('extractZip(createZip(entries)) recovers every original entry, in order', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const extracted = extractZip(createZip(entries));
        expect(toComparable(extracted)).toEqual(toComparable(entries));
      }),
    );
  });
});

describe('createTar / extractTar round-trip property', () => {
  it('extractTar(createTar(entries).bytes) recovers every original entry, in order', () => {
    fc.assert(
      fc.property(entriesArb, (entries) => {
        const result = createTar(entries);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(toComparable(extractTar(result.bytes))).toEqual(toComparable(entries));
      }),
    );
  });

  it('never throws for arbitrary bytes (hand-rolled USTAR reader)', () => {
    neverThrows((bytes: Uint8Array) => extractTar(bytes), fc.uint8Array({ minLength: 0, maxLength: 600 }));
  });
});
