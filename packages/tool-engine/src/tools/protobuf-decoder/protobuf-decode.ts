/**
 * Pure, framework-free Protobuf schema parsing and decoding used by the
 * Protobuf Decoder tool, via `protobufjs`'s runtime `.proto` parser. Unlike
 * the other binary decoders, this one needs a user-supplied schema (a
 * `.proto` file's text) in addition to the binary payload, since Protobuf
 * wire bytes carry no self-describing structure. Only top-level message
 * types are offered for selection — nested message types are out of scope.
 */

import * as protobuf from 'protobufjs';

export interface ProtoSchemaError {
  readonly message: string;
}

export type ProtoSchemaResult =
  | { readonly ok: true; readonly root: protobuf.Root; readonly messageTypeNames: readonly string[] }
  | { readonly ok: false; readonly error: ProtoSchemaError };

export function parseProtoSchema(schemaText: string): ProtoSchemaResult {
  if (schemaText.trim() === '') return { ok: false, error: { message: 'Enter a .proto schema.' } };

  try {
    const { root } = protobuf.parse(schemaText);
    const messageTypeNames = root.nestedArray.filter((node) => node instanceof protobuf.Type).map((node) => node.name);
    if (messageTypeNames.length === 0) return { ok: false, error: { message: 'No message types were found in this schema.' } };
    return { ok: true, root, messageTypeNames };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}

export interface ProtobufDecodeError {
  readonly message: string;
}

export type ProtobufDecodeResult =
  | { readonly ok: true; readonly value: Record<string, unknown> }
  | { readonly ok: false; readonly error: ProtobufDecodeError };

export function decodeProtobufMessage(root: protobuf.Root, messageTypeName: string, bytes: Uint8Array): ProtobufDecodeResult {
  if (bytes.byteLength === 0) return { ok: false, error: { message: 'The file is empty.' } };

  try {
    const type = root.lookupType(messageTypeName);
    const message = type.decode(bytes);
    return { ok: true, value: type.toObject(message, { longs: String, defaults: false }) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
