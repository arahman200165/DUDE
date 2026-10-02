/**
 * Pure escape/unescape pairs for the six syntaxes Phase 11's Escape/Unescape
 * Toolkit absorbs: JavaScript, CSS, SQL, POSIX shell, PowerShell string
 * literals, and RFC 2045 quoted-printable.
 */

export type EscapeMode = 'javascript' | 'css' | 'sql' | 'shell' | 'powershell' | 'quoted-printable';

export type EscapeResult = { readonly ok: true; readonly value: string } | { readonly ok: false; readonly error: string };

export function escapeText(text: string, mode: EscapeMode): EscapeResult {
  switch (mode) {
    case 'javascript':
      return { ok: true, value: escapeJavaScript(text) };
    case 'css':
      return { ok: true, value: CSS.escape(text) };
    case 'sql':
      return { ok: true, value: text.replace(/'/g, "''") };
    case 'shell':
      return { ok: true, value: escapeShell(text) };
    case 'powershell':
      return { ok: true, value: `'${text.replace(/'/g, "''")}'` };
    case 'quoted-printable':
      return { ok: true, value: encodeQuotedPrintable(text) };
  }
}

export function unescapeText(text: string, mode: EscapeMode): EscapeResult {
  switch (mode) {
    case 'javascript':
      return unescapeJavaScript(text);
    case 'css':
      return { ok: true, value: unescapeCss(text) };
    case 'sql':
      return { ok: true, value: text.replace(/''/g, "'") };
    case 'shell':
      return unescapeShell(text);
    case 'powershell':
      return { ok: true, value: unescapePowerShell(text) };
    case 'quoted-printable':
      return decodeQuotedPrintable(text);
  }
}

// --- JavaScript (via JSON, which is a strict subset of JS string-literal escaping) ---

function escapeJavaScript(text: string): string {
  return JSON.stringify(text).slice(1, -1);
}

function unescapeJavaScript(text: string): EscapeResult {
  try {
    // \' is valid in a JS string literal but not in a JSON string; JSON.parse would otherwise reject it.
    const normalized = text.replace(/\\'/g, "'");
    return { ok: true, value: JSON.parse(`"${normalized}"`) };
  } catch {
    return { ok: false, error: 'Invalid JavaScript-escaped string.' };
  }
}

// --- CSS (native CSS.escape for identifiers; hand-parsed reverse per the CSS Syntax spec) ---

function unescapeCss(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '\\') {
      out += text[i];
      continue;
    }

    const rest = text.slice(i + 1);
    const hexMatch = rest.match(/^([0-9a-fA-F]{1,6})(\r\n|[ \t\r\n\f])?/);
    if (hexMatch) {
      out += String.fromCodePoint(parseInt(hexMatch[1], 16));
      i += hexMatch[1].length + (hexMatch[2]?.length ?? 0);
    } else if (i + 1 < text.length) {
      out += text[i + 1];
      i += 1;
    }
  }
  return out;
}

// --- POSIX shell (single-quote escaping, the only fully robust form) ---

function escapeShell(text: string): string {
  if (text === '') return "''";
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function unescapeShell(text: string): EscapeResult {
  let out = '';
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) return { ok: false, error: 'Unterminated single quote.' };
      out += text.slice(i + 1, end);
      i = end + 1;
    } else if (ch === '"') {
      i += 1;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\' && i + 1 < text.length && '\\"$`'.includes(text[i + 1])) {
          out += text[i + 1];
          i += 2;
        } else {
          out += text[i];
          i += 1;
        }
      }
      if (i >= text.length) return { ok: false, error: 'Unterminated double quote.' };
      i += 1;
    } else if (ch === '\\') {
      if (i + 1 < text.length) {
        out += text[i + 1];
        i += 2;
      } else {
        i += 1;
      }
    } else {
      out += ch;
      i += 1;
    }
  }

  return { ok: true, value: out };
}

// --- PowerShell (single-quoted literal string escaping) ---

function unescapePowerShell(text: string): string {
  const body = text.length >= 2 && text.startsWith("'") && text.endsWith("'") ? text.slice(1, -1) : text;
  return body.replace(/''/g, "'");
}

// --- Quoted-Printable (RFC 2045, no soft line-wrapping) ---

function encodeQuotedPrintable(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = '';
  for (const byte of bytes) {
    if ((byte >= 33 && byte <= 126 && byte !== 0x3d) || byte === 0x20 || byte === 0x09) {
      out += String.fromCharCode(byte);
    } else {
      out += `=${byte.toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return out;
}

function decodeQuotedPrintable(text: string): EscapeResult {
  const normalized = text.replace(/=\r\n/g, '').replace(/=\n/g, '');
  const bytes: number[] = [];

  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === '=') {
      const hex = normalized.slice(i + 1, i + 3);
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return { ok: false, error: 'Invalid quoted-printable escape sequence.' };
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else {
      bytes.push(normalized.charCodeAt(i));
    }
  }

  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes)) };
  } catch {
    return { ok: false, error: 'Decoded bytes are not valid UTF-8.' };
  }
}
