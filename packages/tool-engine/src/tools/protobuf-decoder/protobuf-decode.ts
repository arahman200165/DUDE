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

/**
 * protobufjs builds `decode` and `toObject` per message type with `new Function`, which the Hub's page CSP forbids
 * (PD-056: no `'unsafe-eval'`). A CSP eval violation throws `EvalError`, so one probe tells us which path to take.
 */
let evalAvailable: boolean | undefined;
function canEval(): boolean {
  if (evalAvailable === undefined) {
    try {
      new Function('');
      evalAvailable = true;
    } catch {
      evalAvailable = false;
    }
  }
  return evalAvailable;
}

const VARINT_TYPES = new Set(['int32', 'uint32', 'sint32', 'bool', 'int64', 'uint64', 'sint64']);
const FIXED32_TYPES = new Set(['fixed32', 'sfixed32', 'float']);
const FIXED64_TYPES = new Set(['fixed64', 'sfixed64', 'double']);
const LONG_TYPES = new Set(['int64', 'uint64', 'sint64', 'fixed64', 'sfixed64']);

function readScalar(reader: protobuf.Reader, type: string): unknown {
  const value = (reader as unknown as Record<string, () => unknown>)[type]?.call(reader);
  // `toObject({ longs: String })` renders 64-bit integers as strings.
  return LONG_TYPES.has(type) && value !== undefined && value !== null ? String(value) : value;
}

/** Reads one field value of `field`'s (value) type; messages are length-delimited and enums are varints. */
function readValue(reader: protobuf.Reader, type: string, resolved: protobuf.Type | protobuf.Enum | null): unknown {
  if (resolved instanceof protobuf.Type) return decodeByReflection(resolved, reader.bytes());
  if (resolved instanceof protobuf.Enum) return reader.int32();
  return readScalar(reader, type);
}

/**
 * Eval-free decode that mirrors `type.toObject(type.decode(bytes), { longs: String, defaults: false })` using only
 * `Reader` and the type's reflection data. Unknown fields are skipped, as protobufjs does.
 */
export function decodeByReflection(type: protobuf.Type, bytes: Uint8Array): Record<string, unknown> {
  const reader = protobuf.Reader.create(bytes);
  const out: Record<string, unknown> = {};
  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const wireType = tag & 7;
    const field = type.fieldsById[tag >>> 3];
    if (field === undefined) {
      reader.skipType(wireType);
      continue;
    }
    field.resolve();
    if (field instanceof protobuf.MapField) {
      const entryReader = protobuf.Reader.create(reader.bytes());
      let key: unknown = field.keyType === 'bool' ? false : field.keyType === 'string' ? '' : 0;
      let value: unknown = undefined;
      while (entryReader.pos < entryReader.len) {
        const entryTag = entryReader.uint32();
        if (entryTag >>> 3 === 1) key = readScalar(entryReader, field.keyType);
        else if (entryTag >>> 3 === 2) value = readValue(entryReader, field.type, field.resolvedType);
        else entryReader.skipType(entryTag & 7);
      }
      const map = (out[field.name] ??= {}) as Record<string, unknown>;
      map[String(key)] =
        value ??
        (field.resolvedType instanceof protobuf.Type ? {} : field.resolvedType instanceof protobuf.Enum ? 0 : field.type === 'string' ? '' : 0);
      continue;
    }
    const packable = VARINT_TYPES.has(field.type) || FIXED32_TYPES.has(field.type) || FIXED64_TYPES.has(field.type) || field.resolvedType instanceof protobuf.Enum;
    if (field.repeated) {
      const list = (out[field.name] ??= []) as unknown[];
      if (wireType === 2 && packable) {
        const end = reader.uint32() + reader.pos;
        while (reader.pos < end) list.push(readValue(reader, field.type, field.resolvedType));
      } else list.push(readValue(reader, field.type, field.resolvedType));
      continue;
    }
    const value = readValue(reader, field.type, field.resolvedType);
    // A repeated occurrence of a singular message field merges in protobuf; last-wins is enough for inspection.
    out[field.name] = value;
  }
  return out;
}

export function decodeProtobufMessage(root: protobuf.Root, messageTypeName: string, bytes: Uint8Array): ProtobufDecodeResult {
  if (bytes.byteLength === 0) return { ok: false, error: { message: 'The file is empty.' } };

  try {
    const type = root.lookupType(messageTypeName);
    if (!canEval()) return { ok: true, value: decodeByReflection(type, bytes) };
    const message = type.decode(bytes);
    return { ok: true, value: type.toObject(message, { longs: String, defaults: false }) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
