import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a literal HTTP/1.1 request (text only, never executed). */
export function generateRawHttp(request: ParsedHttpRequest): string {
  const fullUrl = buildFullUrl(request);
  let path = fullUrl;
  let hostFromUrl = '';

  try {
    const parsed = new URL(fullUrl);
    path = parsed.pathname + parsed.search || '/';
    hostFromUrl = parsed.host;
  } catch {
    // not a fully-qualified URL; fall back to using it as the request target as-is
  }

  const lines = [`${request.method} ${path} HTTP/1.1`];

  const hasHostHeader = request.headers.some((h) => h.key.toLowerCase() === 'host');
  if (!hasHostHeader && hostFromUrl !== '') {
    lines.push(`Host: ${hostFromUrl}`);
  }

  for (const header of request.headers) {
    lines.push(`${header.key}: ${header.value}`);
  }

  if (request.auth) {
    lines.push(`Authorization: Basic ${btoa(`${request.auth.username}:${request.auth.password}`)}`);
  }

  let bodyText = '';
  if (request.body.kind === 'raw') {
    bodyText = request.body.text;
  } else if (request.body.kind === 'multipart') {
    bodyText = request.body.fields.map((field) => `${field.key}=${field.value}`).join('&');
  }

  const hasContentLength = request.headers.some((h) => h.key.toLowerCase() === 'content-length');
  if (bodyText !== '' && !hasContentLength) {
    lines.push(`Content-Length: ${bodyText.length}`);
  }

  lines.push('');
  if (bodyText !== '') lines.push(bodyText);

  return lines.join('\r\n');
}
