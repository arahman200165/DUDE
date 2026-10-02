import { KeyValuePair } from "@dude/shared-types/shared/models/key-value-pair.model";
import { BasicAuth, EMPTY_REQUEST, HttpBody, ParsedHttpRequest, splitUrl } from "@dude/domain/shared/http-request/http-request.model";
import { tokenizeShellCommand } from "./curl-shell-lex.js";

/**
 * `request` is always present (best-effort, falling back toward
 * EMPTY_REQUEST) rather than following the repo's usual `{ok}|{error}`
 * union, so Build-mode stays populated/editable even after a bad paste.
 * `error` is only set for hard failures; `warnings` lists ignored/unsupported
 * flags and lossy conversions (e.g. an unreadable `@file` payload).
 */
export interface CurlParseResult {
  readonly request: ParsedHttpRequest;
  readonly error: string | null;
  readonly warnings: readonly string[];
}

const NO_OP_FLAGS = new Set([
  '-L',
  '--location',
  '-s',
  '--silent',
  '-v',
  '--verbose',
  '-k',
  '--insecure',
  '--compressed',
  '-i',
  '--include',
  '-#',
  '--progress-bar',
  '--http1.1',
  '--http2',
]);

// Flags that are recognized but out of scope for v1 — each consumes its value (if any) and produces a warning.
const UNSUPPORTED_FLAGS_WITH_VALUE = new Set([
  '--cert',
  '--key',
  '--cacert',
  '-x',
  '--proxy',
  '--connect-timeout',
  '--max-time',
  '--retry',
  '--limit-rate',
  '--resolve',
  '--interface',
  '-K',
  '--config',
]);
const UNSUPPORTED_FLAGS_NO_VALUE = new Set(['-G', '--get']);

function encodeDataUrlEncodeValue(value: string): string {
  const equalsIndex = value.indexOf('=');
  if (equalsIndex === -1) return encodeURIComponent(value);
  return `${value.slice(0, equalsIndex)}=${encodeURIComponent(value.slice(equalsIndex + 1))}`;
}

export function parseCurl(raw: string): CurlParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { request: EMPTY_REQUEST, error: null, warnings: [] };

  const tokens = tokenizeShellCommand(trimmed);
  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
    return { request: EMPTY_REQUEST, error: 'Command must start with "curl".', warnings: [] };
  }

  let method: string | null = null;
  let url = '';
  const headers: KeyValuePair[] = [];
  const bodyParts: string[] = [];
  let bodyContentType: string | null = null;
  let hasBody = false;
  let isMultipart = false;
  const multipartFields: KeyValuePair[] = [];
  let auth: BasicAuth | null = null;
  const warnings: string[] = [];

  const appendBody = (text: string, defaultContentType: string | null): void => {
    hasBody = true;
    bodyParts.push(text);
    if (bodyContentType === null) bodyContentType = defaultContentType;
  };

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    switch (token) {
      case '-X':
      case '--request':
        method = tokens[++i] ?? method;
        break;

      case '--url':
        url = tokens[++i] ?? url;
        break;

      case '-H':
      case '--header': {
        const headerValue = tokens[++i] ?? '';
        const separatorIndex = headerValue.indexOf(':');
        if (separatorIndex !== -1) {
          headers.push({
            key: headerValue.slice(0, separatorIndex).trim(),
            value: headerValue.slice(separatorIndex + 1).trim(),
          });
        }
        break;
      }

      case '-d':
      case '--data':
      case '--data-ascii':
      case '--data-raw':
        appendBody(tokens[++i] ?? '', 'application/x-www-form-urlencoded');
        break;

      case '--data-binary': {
        const value = tokens[++i] ?? '';
        if (value.startsWith('@')) {
          warnings.push(`--data-binary ${value}: file contents are not read; using a placeholder.`);
          appendBody(`<file: ${value.slice(1)}>`, 'application/octet-stream');
        } else {
          appendBody(value, 'application/x-www-form-urlencoded');
        }
        break;
      }

      case '--data-urlencode': {
        const value = tokens[++i] ?? '';
        if (value.startsWith('@')) {
          warnings.push(`--data-urlencode ${value}: file contents are not read; using a placeholder.`);
          appendBody(`<file: ${value.slice(1)}>`, 'application/x-www-form-urlencoded');
        } else {
          appendBody(encodeDataUrlEncodeValue(value), 'application/x-www-form-urlencoded');
        }
        break;
      }

      case '-F':
      case '--form': {
        const fieldValue = tokens[++i] ?? '';
        const equalsIndex = fieldValue.indexOf('=');
        isMultipart = true;
        if (equalsIndex !== -1) {
          const fieldKey = fieldValue.slice(0, equalsIndex);
          const fieldVal = fieldValue.slice(equalsIndex + 1);
          multipartFields.push({ key: fieldKey, value: fieldVal });
          if (fieldVal.startsWith('@')) {
            warnings.push(`-F ${fieldKey}=${fieldVal}: file contents are not read; the value is kept as a reference.`);
          }
        }
        break;
      }

      case '-u':
      case '--user': {
        const credentials = tokens[++i] ?? '';
        const colonIndex = credentials.indexOf(':');
        auth =
          colonIndex === -1
            ? { username: credentials, password: '' }
            : { username: credentials.slice(0, colonIndex), password: credentials.slice(colonIndex + 1) };
        break;
      }

      case '-b':
      case '--cookie':
        headers.push({ key: 'Cookie', value: tokens[++i] ?? '' });
        break;

      case '-A':
      case '--user-agent':
        headers.push({ key: 'User-Agent', value: tokens[++i] ?? '' });
        break;

      case '-e':
      case '--referer':
        headers.push({ key: 'Referer', value: tokens[++i] ?? '' });
        break;

      case '-I':
      case '--head':
        method = method ?? 'HEAD';
        break;

      default:
        if (NO_OP_FLAGS.has(token)) {
          // recognized transport/display flag; no effect on the request model
        } else if (UNSUPPORTED_FLAGS_WITH_VALUE.has(token)) {
          warnings.push(`Ignored unsupported flag: ${token} ${tokens[i + 1] ?? ''}`.trim());
          i++;
        } else if (UNSUPPORTED_FLAGS_NO_VALUE.has(token)) {
          warnings.push(`Ignored unsupported flag: ${token}`);
        } else if (token.startsWith('-')) {
          warnings.push(`Ignored unsupported flag: ${token}`);
        } else if (url === '') {
          url = token;
        } else {
          warnings.push(`Ignored unexpected argument: ${token}`);
        }
        break;
    }
  }

  const { base, queryParams } = splitUrl(url);

  const body: HttpBody = isMultipart
    ? { kind: 'multipart', fields: multipartFields }
    : hasBody
      ? { kind: 'raw', text: bodyParts.join('&'), contentType: bodyContentType }
      : { kind: 'none' };

  const resolvedMethod = (method ?? (hasBody || isMultipart ? 'POST' : 'GET')).toUpperCase();

  const request: ParsedHttpRequest = { method: resolvedMethod, url: base, queryParams, headers, body, auth };

  return { request, error: null, warnings };
}
