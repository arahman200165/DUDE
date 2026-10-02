import { hostHtmlEntities } from "@dude/crypto/host";
export type HtmlEntityMode = 'encode' | 'decode';

/**
 * Decodes named and numeric HTML entities by delegating to the browser's
 * (or jsdom's) own HTML parser via a detached `<textarea>` — this is
 * correct for every entity in the HTML spec without needing an entity table.
 */
export function decodeHtmlEntities(input: string): string {
  return hostHtmlEntities(input, 'decode');
}

/**
 * Encodes the characters that are unsafe in HTML text content (&, <, >) by
 * round-tripping through `textContent`/`innerHTML`. When `encodeAllNonAscii`
 * is set, characters beyond ASCII are also replaced with numeric entities.
 */
export function encodeHtmlEntities(input: string, encodeAllNonAscii: boolean): string {
  const encoded = hostHtmlEntities(input, 'encode');

  if (!encodeAllNonAscii) return encoded;

  return Array.from(encoded)
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 127 ? `&#${code};` : char;
    })
    .join('');
}

export function processHtmlEntities(input: string, mode: HtmlEntityMode, encodeAllNonAscii: boolean): string {
  return mode === 'encode' ? encodeHtmlEntities(input, encodeAllNonAscii) : decodeHtmlEntities(input);
}
