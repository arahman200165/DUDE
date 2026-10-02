/**
 * Pure, framework-free parse/build for the `Content-Disposition:` header (RFC 6266) —
 * an ASCII `filename="..."` fallback plus, for a non-ASCII name, an RFC 5987-encoded
 * `filename*=UTF-8''...` extended parameter that most modern clients prefer.
 */
export type DispositionType = 'inline' | 'attachment';

export interface ContentDisposition {
  readonly type: DispositionType;
  readonly filename: string;
}

function toAsciiFallback(filename: string): string {
  const asciiOnly = filename.replace(/[^\x20-\x7E]/g, '_');
  return asciiOnly.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// RFC 5987 attr-char excludes a handful of characters encodeURIComponent leaves unescaped.
function encodeRfc5987ValueChars(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

function isAscii(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value);
}

export function buildContentDisposition(cd: ContentDisposition): string {
  if (cd.filename === '') return cd.type;

  const asciiFilename = toAsciiFallback(cd.filename);
  const parts = [cd.type, `filename="${asciiFilename}"`];

  if (!isAscii(cd.filename)) {
    parts.push(`filename*=UTF-8''${encodeRfc5987ValueChars(cd.filename)}`);
  }

  return parts.join('; ');
}

export function parseContentDisposition(raw: string): ContentDisposition {
  const parts = raw
    .split(';')
    .map((p) => p.trim())
    .filter((p) => p !== '');
  if (parts.length === 0) return { type: 'attachment', filename: '' };

  const type: DispositionType = parts[0].toLowerCase() === 'inline' ? 'inline' : 'attachment';

  let filename = '';
  let filenameStar = '';

  for (const part of parts.slice(1)) {
    const equalsIndex = part.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = part.slice(0, equalsIndex).trim().toLowerCase();
    const value = part.slice(equalsIndex + 1).trim();

    if (key === 'filename*') {
      const match = /^UTF-8''(.*)$/i.exec(value);
      if (match) {
        try {
          filenameStar = decodeURIComponent(match[1]);
        } catch {
          filenameStar = match[1];
        }
      }
    } else if (key === 'filename') {
      const unquoted = value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
      filename = unquoted.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }

  return { type, filename: filenameStar || filename };
}
