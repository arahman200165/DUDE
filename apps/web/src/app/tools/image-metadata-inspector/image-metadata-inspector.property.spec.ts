import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows, invariant } from "../../../../../../tests/property-harness";
import { parsePngIhdr, type PngIhdr } from "@dude/tool-engine/tools/image-metadata-inspector/png-header";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function assertWellFormedIhdr(result: PngIhdr | null): void {
  if (result === null) return;
  expect(Number.isInteger(result.width)).toBe(true);
  expect(Number.isInteger(result.height)).toBe(true);
  expect(result.width).toBeGreaterThanOrEqual(0);
  expect(result.height).toBeGreaterThanOrEqual(0);
  expect(result.bitDepth).toBeGreaterThanOrEqual(0);
  expect(result.bitDepth).toBeLessThanOrEqual(255);
  expect(result.colorType).toBeGreaterThanOrEqual(0);
  expect(result.colorType).toBeLessThanOrEqual(255);
  expect(typeof result.colorTypeName).toBe('string');
  expect(typeof result.interlaced).toBe('boolean');
}

describe('parsePngIhdr property tests: garbage/truncated bytes', () => {
  it('never throws on arbitrary byte arrays of any length, and any non-null result is well-formed', () => {
    neverThrows(parsePngIhdr, fc.uint8Array({ maxLength: 300 }), {
      assertShape: (result) => assertWellFormedIhdr(result as PngIhdr | null),
    });
  });

  it('never throws on arrays that start with the real PNG signature but have random bytes after it', () => {
    const arbSignaturePrefixed = fc
      .array(fc.integer({ min: 0, max: 255 }), { minLength: 0, maxLength: 100 })
      .map((tail) => Uint8Array.from([...PNG_SIGNATURE, ...tail]));

    neverThrows(parsePngIhdr, arbSignaturePrefixed, {
      assertShape: (result) => assertWellFormedIhdr(result as PngIhdr | null),
    });
  });

  it('returns null (never a malformed record) for any prefix-truncation of a real IHDR chunk', () => {
    const validIhdrTail = [
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, // length=13, "IHDR"
      0, 0, 0, 1, 0, 0, 0, 1, // width=1, height=1
      8, 6, 0, 0, 0, // bitDepth, colorType, compression, filter, interlace
    ];
    const full = Uint8Array.from([...PNG_SIGNATURE, ...validIhdrTail]);

    invariant(parsePngIhdr, fc.integer({ min: 0, max: full.length - 1 }).map((cut) => full.slice(0, cut)), (result) => result === null);
  });
});

describe('parsePngIhdr property tests: width/height decode correctly for the full uint32 range', () => {
  it('round-trips arbitrary width/height/bitDepth/colorType through a synthesized IHDR chunk', () => {
    const arbIhdrFields = fc.record({
      width: fc.integer({ min: 0, max: 0xffffffff }),
      height: fc.integer({ min: 0, max: 0xffffffff }),
      bitDepth: fc.integer({ min: 0, max: 255 }),
      colorType: fc.integer({ min: 0, max: 255 }),
      interlaced: fc.boolean(),
    });

    fc.assert(
      fc.property(arbIhdrFields, (fields) => {
        const bytes = new Uint8Array(33);
        bytes.set(PNG_SIGNATURE, 0);
        // bytes 8-11 (chunk length) unused by the parser; bytes 12-15 = "IHDR".
        bytes.set([0x49, 0x48, 0x44, 0x52], 12);
        const view = new DataView(bytes.buffer);
        view.setUint32(16, fields.width, false);
        view.setUint32(20, fields.height, false);
        bytes[24] = fields.bitDepth;
        bytes[25] = fields.colorType;
        bytes[28] = fields.interlaced ? 1 : 0;

        const result = parsePngIhdr(bytes);
        expect(result).not.toBeNull();
        expect(result?.width).toBe(fields.width);
        expect(result?.height).toBe(fields.height);
        expect(result?.width).toBeGreaterThanOrEqual(0);
        expect(result?.height).toBeGreaterThanOrEqual(0);
        expect(result?.bitDepth).toBe(fields.bitDepth);
        expect(result?.colorType).toBe(fields.colorType);
        expect(result?.interlaced).toBe(fields.interlaced);
      }),
    );
  });
});
