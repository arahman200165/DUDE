import * as protobuf from 'protobufjs';
import { decodeProtobufMessage, parseProtoSchema } from "./protobuf-decode.js";

const PERSON_SCHEMA = `
syntax = "proto3";
message Person {
  string name = 1;
  int32 age = 2;
  repeated string tags = 3;
}
message Address {
  string city = 1;
}
`;

function encodePerson(value: { name: string; age: number; tags: string[] }): Uint8Array {
  const { root } = protobuf.parse(PERSON_SCHEMA);
  const type = root.lookupType('Person');
  return type.encode(type.create(value)).finish();
}

describe('parseProtoSchema', () => {
  it('lists top-level message type names', () => {
    const result = parseProtoSchema(PERSON_SCHEMA);

    expect(result.ok).toBe(true);
    expect(result.ok && result.messageTypeNames).toEqual(['Person', 'Address']);
  });

  it('rejects empty input', () => {
    expect(parseProtoSchema('').ok).toBe(false);
  });

  it('reports a parse error for malformed proto syntax', () => {
    const result = parseProtoSchema('this is not valid proto {{{');

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });

  it('reports an error when the schema defines no message types', () => {
    const result = parseProtoSchema('syntax = "proto3"; enum Color { RED = 0; }');

    expect(result).toEqual({ ok: false, error: { message: 'No message types were found in this schema.' } });
  });
});

describe('decodeProtobufMessage', () => {
  it('decodes the official Encoding guide Simple Message vector (08 96 01 => a: 150)', () => {
    const { root } = protobuf.parse('syntax = "proto3"; message Test1 { int32 a = 1; }');
    expect(decodeProtobufMessage(root, 'Test1', new Uint8Array([0x08, 0x96, 0x01]))).toEqual({ ok: true, value: { a: 150 } });
  });
  it('decodes a message into a plain object', () => {
    const { root } = protobuf.parse(PERSON_SCHEMA);
    const bytes = encodePerson({ name: 'Alice', age: 30, tags: ['a', 'b'] });

    const result = decodeProtobufMessage(root, 'Person', bytes);

    expect(result).toEqual({ ok: true, value: { name: 'Alice', age: 30, tags: ['a', 'b'] } });
  });

  it('rejects an empty file', () => {
    const { root } = protobuf.parse(PERSON_SCHEMA);

    expect(decodeProtobufMessage(root, 'Person', new Uint8Array(0)).ok).toBe(false);
  });

  it('reports an error for an unknown message type name', () => {
    const { root } = protobuf.parse(PERSON_SCHEMA);
    const bytes = encodePerson({ name: 'Alice', age: 30, tags: [] });

    const result = decodeProtobufMessage(root, 'Missing', bytes);

    expect(result.ok).toBe(false);
  });

  it('reports an error for bytes that do not decode as the selected message type', () => {
    const { root } = protobuf.parse(PERSON_SCHEMA);

    const result = decodeProtobufMessage(root, 'Person', new Uint8Array([255, 255, 255]));

    expect(result.ok).toBe(false);
  });
});
