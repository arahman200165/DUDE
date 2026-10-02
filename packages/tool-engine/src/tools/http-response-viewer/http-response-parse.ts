/**
 * Pure, framework-free parser for a raw HTTP response (status line + headers +
 * blank line + body), the "paste/paste-and-format" side of Phase 15 item 10. A
 * JSON-shaped body is pretty-printed as a convenience; anything else is left as-is.
 */
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";

export interface ParsedHttpResponse {
  readonly ok: true;
  readonly httpVersion: string;
  readonly statusCode: number;
  readonly statusText: string;
  readonly headers: readonly KeyValuePair[];
  readonly bodyRaw: string;
  readonly bodyPretty: string;
  readonly bodyIsJson: boolean;
}

export type HttpResponseParseResult = ParsedHttpResponse | { readonly ok: false; readonly error: string };

const STATUS_LINE_REGEX = /^HTTP\/(\d(?:\.\d)?)\s+(\d{3})\s*(.*)$/i;

function prettyPrintIfJson(text: string): { readonly pretty: string; readonly isJson: boolean } {
  if (text.trim() === '') return { pretty: text, isJson: false };
  try {
    const value = JSON.parse(text);
    return { pretty: JSON.stringify(value, null, 2), isJson: true };
  } catch {
    return { pretty: text, isJson: false };
  }
}

export function parseHttpResponseText(raw: string): HttpResponseParseResult {
  if (raw.trim() === '') {
    return { ok: false, error: 'Paste an HTTP response to view it.' };
  }

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const statusMatch = STATUS_LINE_REGEX.exec(lines[0].trim());
  if (!statusMatch) {
    return { ok: false, error: 'First line must be a status line, e.g. "HTTP/1.1 200 OK".' };
  }

  const [, httpVersion, statusCodeText, statusText] = statusMatch;

  const headers: KeyValuePair[] = [];
  let bodyStart = lines.length;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      bodyStart = i + 1;
      break;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    headers.push({ key: line.slice(0, colonIndex).trim(), value: line.slice(colonIndex + 1).trim() });
  }

  const bodyRaw = lines.slice(bodyStart).join('\n');
  const { pretty, isJson } = prettyPrintIfJson(bodyRaw);

  return {
    ok: true,
    httpVersion,
    statusCode: Number(statusCodeText),
    statusText: statusText.trim(),
    headers,
    bodyRaw,
    bodyPretty: pretty,
    bodyIsJson: isJson,
  };
}
