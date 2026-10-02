import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** `Net::HTTP` has a dedicated request class per common verb; anything else falls back to `Net::HTTP::Get` with a comment. */
const METHOD_CLASSES: Record<string, string> = {
  GET: 'Get',
  POST: 'Post',
  PUT: 'Put',
  PATCH: 'Patch',
  DELETE: 'Delete',
  HEAD: 'Head',
  OPTIONS: 'Options',
};

/** Generates a Ruby `net/http` (standard library, no external dependency) snippet. */
export function generateRuby(request: ParsedHttpRequest): string {
  const method = request.method.toUpperCase();
  const requestClass = METHOD_CLASSES[method];

  const lines: string[] = [
    "require 'net/http'",
    "require 'uri'",
    '',
    `uri = URI(${JSON.stringify(buildFullUrl(request))})`,
    'http = Net::HTTP.new(uri.host, uri.port)',
    'http.use_ssl = (uri.scheme == "https")',
    '',
  ];

  if (requestClass) {
    lines.push(`request = Net::HTTP::${requestClass}.new(uri)`);
  } else {
    lines.push(`# NOTE: ${method} has no dedicated Net::HTTP class; using a generic request.`, `request = Net::HTTPGenericRequest.new(${JSON.stringify(method)}, true, true, uri)`);
  }

  for (const header of request.headers) {
    lines.push(`request[${JSON.stringify(header.key)}] = ${JSON.stringify(header.value)}`);
  }

  if (request.auth) {
    lines.push(`request.basic_auth(${JSON.stringify(request.auth.username)}, ${JSON.stringify(request.auth.password)})`);
  }

  if (request.body.kind === 'raw' && request.body.text !== '') {
    lines.push(`request.body = ${JSON.stringify(request.body.text)}`);
  } else if (request.body.kind === 'multipart') {
    lines.push('# NOTE: multipart bodies need net/http/post/multipart-post or a similar library (best-effort).');
  }

  lines.push('', 'response = http.request(request)', 'puts response.code, response.body');

  return lines.join('\n');
}
