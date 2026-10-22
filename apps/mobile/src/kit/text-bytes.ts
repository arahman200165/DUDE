/** UTF-8 byte length of a JS string without allocating (lone surrogates count as the 3-byte replacement character, like TextEncoder). */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < text.length && text.charCodeAt(index + 1) >= 0xdc00 && text.charCodeAt(index + 1) <= 0xdfff) { bytes += 4; index += 1; }
    else bytes += 3;
  }
  return bytes;
}

/** Default input budget for a tool that runs its engine on the JS thread (measured freeze at 2 MiB: 0.4-1.6 s on emulators). */
export const DEFAULT_MAIN_THREAD_INPUT_BYTES = 128 * 1024;

/** Formats a byte count for a message: whole KB below 1 MiB (rounded up so an over-budget size never reads equal to its cap), MB above. */
export function formatInputSize(bytes: number): string {
  const mib = 1024 * 1024;
  if (bytes >= mib) return `${(Math.round((bytes / mib) * 10) / 10).toString()} MB`;
  return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}

/** The message for an input over its budget, e.g. "Input is 300 KB; this tool handles up to 128 KB on Android." */
export function inputBudgetMessage(actualBytes: number, maxBytes: number): string {
  return `Input is ${formatInputSize(actualBytes)}; this tool handles up to ${formatInputSize(maxBytes)} on Android.`;
}

/** Returns null when `text` fits `maxBytes` (UTF-8), otherwise the user-facing message. Strings shorter than a third of the budget cannot be over it. */
export function checkInputBudget(text: string, maxBytes: number): string | null {
  if (text.length * 3 < maxBytes) return null;
  const bytes = utf8ByteLength(text);
  return bytes > maxBytes ? inputBudgetMessage(bytes, maxBytes) : null;
}
