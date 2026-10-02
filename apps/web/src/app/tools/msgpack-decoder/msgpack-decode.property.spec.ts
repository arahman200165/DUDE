import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { decodeMsgpack } from "@dude/tool-engine/tools/msgpack-decoder/msgpack-decode";

describe('MessagePack decoder properties', () => {
  it('never throws for arbitrary byte sequences', () => {
    neverThrows(decodeMsgpack, fc.uint8Array(), { assertShape: (result) => expect(typeof result).toBe('object') });
  });
});
