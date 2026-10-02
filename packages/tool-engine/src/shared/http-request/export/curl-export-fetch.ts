import { ParsedHttpRequest, buildFullUrl } from "@dude/domain/shared/http-request/http-request.model";

/** Generates a JavaScript fetch() snippet. FormData is used for multipart bodies. */
export function generateFetch(request: ParsedHttpRequest): string {
  const headerLines = request.headers.map((h) => `    ${JSON.stringify(h.key)}: ${JSON.stringify(h.value)},`);

  if (request.auth) {
    const encoded = btoa(`${request.auth.username}:${request.auth.password}`);
    headerLines.push(`    "Authorization": ${JSON.stringify(`Basic ${encoded}`)},`);
  }

  const optionLines: string[] = [`  method: ${JSON.stringify(request.method)},`];

  if (headerLines.length > 0) {
    optionLines.push('  headers: {', ...headerLines, '  },');
  }

  if (request.body.kind === 'raw' && request.body.text !== '') {
    optionLines.push(`  body: ${JSON.stringify(request.body.text)},`);
  } else if (request.body.kind === 'multipart') {
    optionLines.push('  body: formData,');
  }

  const lines: string[] = [];
  if (request.body.kind === 'multipart') {
    lines.push('const formData = new FormData();');
    for (const field of request.body.fields) {
      lines.push(`formData.append(${JSON.stringify(field.key)}, ${JSON.stringify(field.value)});`);
    }
    lines.push('');
  }

  lines.push(`fetch(${JSON.stringify(buildFullUrl(request))}, {`, ...optionLines, '});');

  return lines.join('\n');
}
