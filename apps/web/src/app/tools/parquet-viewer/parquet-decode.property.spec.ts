import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { decodeParquet } from "@dude/tool-engine/tools/parquet-viewer/parquet-decode";

describe('Parquet decoder properties', () => {
  it('returns a promise for arbitrary byte sequences', () => {
    neverThrows(decodeParquet, fc.uint8Array(), { assertShape: (result) => expect(result).toBeInstanceOf(Promise) });
  });
});
