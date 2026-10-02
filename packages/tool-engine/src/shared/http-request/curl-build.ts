import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Serializes a ParsedHttpRequest back into a canonical curl command string.
 * Always emits -X explicitly (even for GET) for clarity/determinism, and
 * always single-quotes values. Note: because the structured panel re-runs
 * this on every edit, editing one field re-flattens the entire command into
 * this canonical form — original flag order/quoting from a pasted command
 * is not preserved once any structured edit is made.
 */
export function buildCurlCommand(request: ParsedHttpRequest): string {
  const parts = ['curl', '-X', request.method, shellQuote(buildFullUrl(request))];

  for (const header of request.headers) {
    if (header.key === '') continue;
    parts.push('-H', shellQuote(`${header.key}: ${header.value}`));
  }

  if (request.auth) {
    parts.push('-u', shellQuote(`${request.auth.username}:${request.auth.password}`));
  }

  if (request.body.kind === 'raw' && request.body.text !== '') {
    parts.push('-d', shellQuote(request.body.text));
  } else if (request.body.kind === 'multipart') {
    for (const field of request.body.fields) {
      if (field.key === '') continue;
      parts.push('-F', shellQuote(`${field.key}=${field.value}`));
    }
  }

  return parts.join(' ');
}
