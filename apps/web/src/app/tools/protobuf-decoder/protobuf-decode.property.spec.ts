import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { neverThrows } from "../../../../../../tests/property-harness";
import { decodeProtobufMessage, parseProtoSchema } from "@dude/tool-engine/tools/protobuf-decoder/protobuf-decode";

describe('Protobuf decoder properties', () => {
  it('never throws for arbitrary schemas and byte sequences', () => {
    neverThrows(([schema, bytes]: [string, Uint8Array]) => {
      const parsed = parseProtoSchema(schema);
      return parsed.ok ? decodeProtobufMessage(parsed.root, parsed.messageTypeNames[0], bytes) : parsed;
    }, fc.tuple(fc.string(), fc.uint8Array()), { assertShape: (result) => expect(typeof result).toBe('object') });
  });
});
