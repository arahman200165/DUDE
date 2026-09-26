import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { invariant, neverThrows } from '../../../testing/property-harness';
import { detectFileType } from './file-type-detector-logic';

describe('detectFileType properties', () => {
  it('never throws for arbitrary byte prefixes and metadata', () => {
    neverThrows(([bytes, name, mime]) => detectFileType(Uint8Array.from(bytes), name, mime || null), fc.tuple(
      fc.array(fc.nat(255), { maxLength: 256 }), fc.string(), fc.option(fc.string(), { nil: '' }),
    ));
  });

  it('reports the input byte count and formats at most the first sixteen bytes as hex', () => {
    invariant(([bytes, name]) => detectFileType(Uint8Array.from(bytes), name, null), fc.tuple(
      fc.array(fc.nat(255), { maxLength: 64 }), fc.string(),
    ), (report, [bytes]) => report.fileSize === bytes.length && report.matchedBytesHex.split(' ').filter(Boolean).length === Math.min(bytes.length, 16));
  });
});
