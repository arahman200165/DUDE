/**
 * Pure, framework-free UTF-8-safe Base64 codec. Lives outside `apps/web/src/app/`
 * (see `apps/web/src/shared-logic/AGENTS.md`) because both the Base64 tool and
 * `apps/desktop/hotkey-bridge.ts`'s clipboard quick-action (Phase 8 Stage 5)
 * import it. Avoids the classic `escape`/`unescape` trick in favor of
 * `TextEncoder`/`TextDecoder`, so multi-byte characters round-trip
 * correctly.
 */

export type Base64Result = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

export function encodeBase64(text: string): Base64Result {
  try {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return { ok: true, value: btoa(binary) };
  } catch {
    return { ok: false, error: 'Could not encode this text as Base64.' };
  }
}

export function decodeBase64(base64: string): Base64Result {
  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const value = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return { ok: true, value };
  } catch {
    return { ok: false, error: 'Invalid Base64 input.' };
  }
}
