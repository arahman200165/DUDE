/**
 * Pure, framework-free MessagePack decoding used by the MessagePack Decoder
 * tool.
 */

import { decode } from '@msgpack/msgpack';

export interface MsgpackDecodeError {
  readonly message: string;
}

export type MsgpackDecodeResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: MsgpackDecodeError };

export function decodeMsgpack(bytes: Uint8Array): MsgpackDecodeResult {
  if (bytes.byteLength === 0) return { ok: false, error: { message: 'The file is empty.' } };

  try {
    return { ok: true, value: decode(bytes) };
  } catch (error) {
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } };
  }
}
