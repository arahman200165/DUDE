/**
 * Pure, framework-free parser for a raw HTTP/1.1 request block (request line +
 * headers + blank line + body) into the shared `ParsedHttpRequest` canonical shape
 * (`shared/http-request/http-request.model.ts`) — the reverse of that module's
 * `EXPORT_FORMATS`'s "Raw HTTP/1.1" generator. Mirrors curl-parse.ts's "always
 * populated" result shape (falls back toward EMPTY_REQUEST rather than an `{ok}`
 * union) so Build-mode stays populated/editable even after a bad paste.
 */
import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { EMPTY_REQUEST, HttpBody, ParsedHttpRequest, splitUrl } from "@dude/domain/shared/http-request/http-request.model";

export interface HttpRequestParseResult {
  readonly request: ParsedHttpRequest;
  readonly error: string | null;
}

const REQUEST_LINE_REGEX = /^(\S+)\s+(\S+)\s+HTTP\/\d(?:\.\d)?$/i;

export function parseHttpRequestText(raw: string, assumeScheme: 'http' | 'https' = 'https'): HttpRequestParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { request: EMPTY_REQUEST, error: null };

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const requestLineMatch = REQUEST_LINE_REGEX.exec(lines[0].trim());
  if (!requestLineMatch) {
    return { request: EMPTY_REQUEST, error: 'First line must be a request line, e.g. "GET /path HTTP/1.1".' };
  }

  const [, method, target] = requestLineMatch;

  const headers: KeyValuePair[] = [];
  let bodyStart = lines.length;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      bodyStart = i + 1;
      break;
    }
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue; // ignore a malformed header line rather than hard-failing
    headers.push({ key: line.slice(0, colonIndex).trim(), value: line.slice(colonIndex + 1).trim() });
  }

  const bodyText = lines.slice(bodyStart).join('\n');

  const hostHeader = headers.find((h) => h.key.toLowerCase() === 'host');
  const remainingHeaders = headers.filter((h) => h.key.toLowerCase() !== 'host');

  const isAbsoluteTarget = /^https?:\/\//i.test(target);
  const { base: targetBase, queryParams } = splitUrl(target);
  const url = isAbsoluteTarget ? targetBase : `${assumeScheme}://${hostHeader?.value ?? 'example.com'}${targetBase}`;

  const contentTypeHeader = remainingHeaders.find((h) => h.key.toLowerCase() === 'content-type');
  const body: HttpBody = bodyText === '' ? { kind: 'none' } : { kind: 'raw', text: bodyText, contentType: contentTypeHeader?.value ?? null };

  const request: ParsedHttpRequest = {
    method: method.toUpperCase(),
    url,
    queryParams,
    headers: remainingHeaders,
    body,
    auth: null,
  };

  return { request, error: null };
}
