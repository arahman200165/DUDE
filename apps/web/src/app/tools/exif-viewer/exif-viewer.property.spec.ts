import fc from 'fast-check';
import { describe, it } from 'vitest';
import { neverThrows, invariant } from "../../../../../../tests/property-harness";
import { formatExifTags, formatGps } from "@dude/tool-engine/tools/exif-viewer/exif-format";

const HIDDEN_KEYS = ['thumbnail', 'MakerNote', 'UserComment'];

const tagValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.double({ noNaN: true }),
  fc.constant(null),
  fc.constant(undefined),
  fc.array(fc.integer(), { maxLength: 40 }),
);

const rawTagsArb = fc.dictionary(fc.oneof(fc.constantFrom(...HIDDEN_KEYS), fc.string({ minLength: 1, maxLength: 20 })), tagValueArb, { maxKeys: 15 });

describe('formatExifTags fuzzing', () => {
  it('never throws for an arbitrary raw tag record', () => {
    neverThrows(formatExifTags, rawTagsArb);
  });

  it('always returns entries sorted by key, with hidden keys and empty values dropped', () => {
    invariant(formatExifTags, rawTagsArb, (entries) => {
      const sorted = [...entries].every((entry, i) => i === 0 || entries[i - 1].key.localeCompare(entry.key) <= 0);
      const noHidden = entries.every((entry) => !HIDDEN_KEYS.includes(entry.key));
      const noEmpty = entries.every((entry) => entry.value !== '');
      return sorted && noHidden && noEmpty;
    });
  });
});

describe('formatGps fuzzing', () => {
  const gpsArb = fc.record({ latitude: fc.double({ min: -90, max: 90, noNaN: true }), longitude: fc.double({ min: -180, max: 180, noNaN: true }) });

  it('never throws and always formats to exactly 6 decimal places on each side of the comma', () => {
    neverThrows(formatGps, gpsArb, {
      assertShape: (result) => {
        if (typeof result !== 'string' || !/^-?\d+\.\d{6}, -?\d+\.\d{6}$/.test(result)) {
          throw new Error(`unexpected GPS format: ${String(result)}`);
        }
      },
    });
  });
});
