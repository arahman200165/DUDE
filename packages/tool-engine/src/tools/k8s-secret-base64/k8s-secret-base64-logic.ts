/**
 * Pure, framework-free encode/decode of Kubernetes Secret `data` fields
 * (base64-encoded values, per key) — reuses the Base64 tool's shared
 * UTF-8-safe codec (`packages/crypto/src/base64-codec.ts`) rather than a
 * second implementation.
 */
import { decodeBase64, encodeBase64 } from "@dude/crypto/base64-codec";
import type { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

export interface SecretField {
  readonly key: string;
  readonly value: string;
  readonly error?: string;
}

export function encodeSecretData(pairs: readonly KeyValuePair[]): readonly SecretField[] {
  return pairs.map((pair) => {
    const result = encodeBase64(pair.value);
    return result.ok ? { key: pair.key, value: result.value } : { key: pair.key, value: '', error: result.error };
  });
}

export function decodeSecretData(pairs: readonly KeyValuePair[]): readonly SecretField[] {
  return pairs.map((pair) => {
    const result = decodeBase64(pair.value);
    return result.ok ? { key: pair.key, value: result.value } : { key: pair.key, value: '', error: result.error };
  });
}

/** Renders the successfully-converted fields as a Secret `data:` YAML block; skips fields with an error. */
export function toSecretDataYaml(fields: readonly SecretField[]): string {
  const lines = fields.filter((field) => field.key.trim() !== '' && !field.error).map((field) => `  ${field.key}: ${field.value}`);
  return lines.length > 0 ? `data:\n${lines.join('\n')}` : '';
}
