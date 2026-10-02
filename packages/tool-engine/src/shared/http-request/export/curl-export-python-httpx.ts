import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a Python `httpx` snippet — the same request shape as `requests`, but httpx's `content=` for a raw body. */
export function generatePythonHttpx(request: ParsedHttpRequest): string {
  const lines: string[] = ['import httpx', ''];

  if (request.headers.length > 0) {
    lines.push('headers = {');
    for (const header of request.headers) {
      lines.push(`    ${JSON.stringify(header.key)}: ${JSON.stringify(header.value)},`);
    }
    lines.push('}', '');
  }

  const callArgs = [JSON.stringify(request.method), JSON.stringify(buildFullUrl(request))];
  if (request.headers.length > 0) callArgs.push('headers=headers');

  if (request.body.kind === 'raw' && request.body.text !== '') {
    lines.push(`payload = ${JSON.stringify(request.body.text)}`, '');
    callArgs.push('content=payload');
  } else if (request.body.kind === 'multipart') {
    lines.push('files = {');
    for (const field of request.body.fields) {
      lines.push(`    ${JSON.stringify(field.key)}: ${JSON.stringify(field.value)},`);
    }
    lines.push('}', '');
    callArgs.push('files=files');
  }

  if (request.auth) {
    callArgs.push(`auth=(${JSON.stringify(request.auth.username)}, ${JSON.stringify(request.auth.password)})`);
  }

  lines.push(`response = httpx.request(${callArgs.join(', ')})`, 'print(response.status_code, response.text)');

  return lines.join('\n');
}
