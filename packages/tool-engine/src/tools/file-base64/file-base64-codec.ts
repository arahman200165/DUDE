/**
 * Pure, framework-free binary Base64 codec used by the File Base64
 * Conversion tool. Deliberately separate from `base64-codec.ts` (the text
 * tool's codec), whose `decodeBase64` pipes output through
 * `TextDecoder('utf-8', { fatal: true })` — correct for text, but it would
 * reject or corrupt arbitrary binary file bytes. These siblings stop one
 * step earlier/later instead, working directly in bytes.
 */

export function encodeFileToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export type FileBase64DecodeResult =
  | { readonly ok: true; readonly bytes: Uint8Array }
  | { readonly ok: false; readonly error: string };

export function decodeBase64ToBytes(base64: string): FileBase64DecodeResult {
  try {
    const binary = atob(base64.trim());
    return { ok: true, bytes: Uint8Array.from(binary, (char) => char.charCodeAt(0)) };
  } catch {
    return { ok: false, error: 'Invalid Base64 input.' };
  }
}
