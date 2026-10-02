export interface CodePointNotations {
  readonly codePoint: number;
  readonly uPlus: string;
  readonly decimal: string;
  readonly htmlDecimal: string;
  readonly htmlHex: string;
  readonly jsEscape: string;
  readonly utf8Hex: string;
}

const MAX_CODE_POINT = 0x10ffff;

const encoder = new TextEncoder();

/**
 * Auto-detects the notation of a single token and returns its code point, or
 * `null` if the token doesn't parse as any recognized notation. Recognizes
 * `U+XXXX`, `0xXXXX`, `\uXXXX`/`\u{X}` JS escapes, `&#NNNN;`/`&#xHHHH;` HTML
 * entities, plain decimal digits, and a single literal character.
 */
export function parseCodePointInput(rawInput: string): number | null {
  const input = rawInput.trim();
  if (input === '') return null;

  const uPlusMatch = /^u\+([0-9a-f]+)$/i.exec(input);
  if (uPlusMatch) return clamp(parseInt(uPlusMatch[1], 16));

  const hexMatch = /^0x([0-9a-f]+)$/i.exec(input);
  if (hexMatch) return clamp(parseInt(hexMatch[1], 16));

  const jsBraceMatch = /^\\u\{([0-9a-f]+)\}$/i.exec(input);
  if (jsBraceMatch) return clamp(parseInt(jsBraceMatch[1], 16));

  const jsEscapeMatch = /^\\u([0-9a-f]{4})$/i.exec(input);
  if (jsEscapeMatch) return clamp(parseInt(jsEscapeMatch[1], 16));

  const htmlHexMatch = /^&#x([0-9a-f]+);?$/i.exec(input);
  if (htmlHexMatch) return clamp(parseInt(htmlHexMatch[1], 16));

  const htmlDecimalMatch = /^&#(\d+);?$/.exec(input);
  if (htmlDecimalMatch) return clamp(parseInt(htmlDecimalMatch[1], 10));

  if (/^\d+$/.test(input)) return clamp(parseInt(input, 10));

  if (Array.from(input).length === 1) return input.codePointAt(0) ?? null;

  return null;
}

function clamp(codePoint: number): number | null {
  if (!Number.isFinite(codePoint) || codePoint < 0 || codePoint > MAX_CODE_POINT) return null;
  return codePoint;
}

/** Formats one code point in every supported notation. */
export function formatCodePoint(codePoint: number): CodePointNotations {
  const hex = codePoint.toString(16).toUpperCase();
  const hexPadded = hex.padStart(4, '0');
  const utf8Hex = Array.from(encoder.encode(String.fromCodePoint(codePoint)))
    .map((byte) => byte.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');

  return {
    codePoint,
    uPlus: `U+${hexPadded}`,
    decimal: codePoint.toString(10),
    htmlDecimal: `&#${codePoint};`,
    htmlHex: `&#x${hex};`,
    jsEscape: codePoint > 0xffff ? `\\u{${hex}}` : `\\u${hexPadded}`,
    utf8Hex,
  };
}

/** Splits bulk input on newlines and commas, parsing each token independently. */
export function parseBulkCodePoints(rawInput: string): readonly { readonly token: string; readonly notations: CodePointNotations | null }[] {
  return rawInput
    .split(/[\n,]+/)
    .map((token) => token.trim())
    .filter((token) => token !== '')
    .map((token) => {
      const codePoint = parseCodePointInput(token);
      return { token, notations: codePoint === null ? null : formatCodePoint(codePoint) };
    });
}
